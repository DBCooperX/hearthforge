import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../shared/content';
import type { Character, ClassId } from '../../shared/types';
import { CHEST_LOOT, DUNGEON_ROWS } from '../src/data/dungeon';
import { roll } from '../src/game/dice';
import { Game, GameError } from '../src/game/engine';

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function party(seed = 1, classes: ClassId[] = ['fighter', 'rogue', 'wizard', 'cleric']) {
  const g = new Game('test', seeded(seed));
  g.upsertPlayer('p1', 'Tester', true);
  for (const c of classes) g.addCharacter('p1', c, '');
  return g;
}

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('dice', () => {
  it('rolls within bounds and doubles dice on a crit', () => {
    const rng = seeded(7);
    for (let i = 0; i < 200; i++) {
      const r = roll('2d6+3', rng);
      expect(r.total).toBeGreaterThanOrEqual(5);
      expect(r.total).toBeLessThanOrEqual(15);
    }
    expect(roll('1d8', rng, true).rolls).toHaveLength(2);
  });
});

describe('dungeon data', () => {
  it('has rectangular rows and loot for every chest', () => {
    const w = DUNGEON_ROWS[0].length;
    DUNGEON_ROWS.forEach((r) => expect(r.length).toBe(w));
    DUNGEON_ROWS.forEach((row, y) => [...row].forEach((t, x) => { if (t === 'C') expect(CHEST_LOOT[`${x},${y}`], `chest at ${x},${y}`).toBeDefined(); }));
    for (const loot of Object.values(CHEST_LOOT)) for (const it of loot.items) expect(ITEMS[it.id]).toBeDefined();
  });
});

describe('characters and inventory', () => {
  it('derives armor class from equipment', () => {
    const g = party();
    const ac = Object.fromEntries(g.s.characters.map((c) => [c.classId, c.ac]));
    expect(ac).toEqual({ fighter: 18, rogue: 14, wizard: 12, cleric: 16 });
  });

  it('enforces slots, proficiency and two-handed weapons', () => {
    const g = party();
    g.start();
    const [fighter, rogue, wizard] = g.s.characters;
    // Rogue swaps shortsword for the shortbow in bag slot 0.
    g.invMove('p1', rogue.id, { type: 'bag', index: 0 }, { type: 'slot', slot: 'mainHand' });
    expect(rogue.equipment.mainHand?.defId).toBe('shortbow');
    expect(rogue.bag[0]?.defId).toBe('shortsword');
    // A sword does not go on your head.
    expect(() => g.invMove('p1', rogue.id, { type: 'bag', index: 0 }, { type: 'slot', slot: 'head' })).toThrow(GameError);
    // Give the bow to the fighter: equipping it frees the shield hand.
    g.invMove('p1', rogue.id, { type: 'slot', slot: 'mainHand' }, { type: 'bag', index: 10 });
    g.give('p1', rogue.id, { type: 'bag', index: 10 }, fighter.id);
    const idx = fighter.bag.findIndex((b) => b?.defId === 'shortbow');
    g.invMove('p1', fighter.id, { type: 'bag', index: idx }, { type: 'slot', slot: 'mainHand' });
    expect(fighter.equipment.offHand).toBeNull();
    expect(fighter.ac).toBe(16);
    // Wizards cannot wear chain mail.
    g.invMove('p1', fighter.id, { type: 'slot', slot: 'armor' }, { type: 'bag', index: 15 });
    g.give('p1', fighter.id, { type: 'bag', index: 15 }, wizard.id);
    const mail = wizard.bag.findIndex((b) => b?.defId === 'chain_mail');
    expect(() => g.invMove('p1', wizard.id, { type: 'bag', index: mail }, { type: 'slot', slot: 'armor' })).toThrow(/can't use/);
  });

  it('loots chests into the bag and shared gold', () => {
    const g = party();
    g.start();
    const hero = g.s.characters[0];
    const chest = g.s.chests.find((c) => c.x === 3 && c.y === 5)!;
    g.move('p1', hero.id, 3, 4);
    const gold = g.s.gold;
    g.openChest('p1', hero.id, chest.id);
    expect(g.s.gold).toBe(gold + 20);
    expect(hero.bag.find((b) => b?.defId === 'potion_healing')?.qty).toBe(3);
  });
});

/** Plays the whole dungeon with simple bot tactics and the scripted monster AI. */
function playthrough(seed: number, classes: ClassId[]) {
  const g = party(seed, classes);
  g.start();
  const doors: [number, number][] = [];
  g.s.rows.forEach((row, y) => [...row].forEach((t, x) => { if (t === '+') doors.push([x, y]); }));
  const beatKinds: string[] = [];
  for (let step = 0; step < 3000 && (g.s.phase === 'explore' || g.s.phase === 'combat'); step++) {
    beatKinds.push(...g.takeBeats().map((b) => b.kind));
    g.takeMoves();
    if (g.s.phase === 'combat') {
      if (g.isMonsterTurn()) {
        const block = g.monsterBlock();
        expect(block.length).toBeGreaterThan(0);
        for (const m of block) g.monsterAct(m.id);
        g.finishMonsterBlock(block);
        continue;
      }
      const c: Character = g.char(g.current()!.id);
      const foes = g.s.monsters.filter((m) => m.alive && m.revealed).sort((a, b) => cheb(a, c) - cheb(b, c));
      const foe = foes[0];
      const tryDo = (fn: () => void) => { try { fn(); return true; } catch (e) { if (!(e instanceof GameError)) throw e; return false; } };
      // Patch up first: Second Wind, healing magic, then potions.
      if (c.hp <= c.maxHp / 2) {
        tryDo(() => g.useAbility('p1', c.id, 'second_wind'));
        const potion = c.bag.find((b) => b && ITEMS[b.defId].consumable);
        if (c.hp <= c.maxHp / 2 && potion) tryDo(() => g.useItem('p1', c.id, potion.uid));
      }
      const hurt = g.s.characters.find((a) => !a.dead && a.hp <= a.maxHp / 3 && cheb(a, c) <= 1);
      if (hurt) tryDo(() => g.useAbility('p1', c.id, 'cure_wounds', hurt.id));
      if (foe) {
        const spell = c.abilityIds.find((a) => ['fire_bolt', 'sacred_flame'].includes(a));
        if (!(spell && tryDo(() => g.useAbility('p1', c.id, spell, foe.id)))) {
          if (!tryDo(() => g.attack('p1', c.id, foe.id))) {
            // Walk next to the foe, then swing.
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
              if (tryDo(() => g.move('p1', c.id, foe.x + dx, foe.y + dy))) break;
            }
            tryDo(() => g.attack('p1', c.id, foe.id));
          }
        }
      }
      if (g.s.phase === 'combat' && g.current()?.id === c.id) g.endTurn('p1', c.id);
      continue;
    }
    // Explore: rest when hurt, then head for the nearest unopened door we know about.
    const lead = g.consciousChars()[0];
    for (const chest of g.s.chests) {
      if (!chest.opened && g.s.fog[chest.y * g.width + chest.x] !== 0) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          try { g.move('p1', lead.id, chest.x + dx, chest.y + dy); g.openChest('p1', lead.id, chest.id); break; } catch (e) { if (!(e instanceof GameError)) throw e; }
        }
        if (g.s.phase !== 'explore') break;
      }
    }
    if (g.s.phase !== 'explore') continue;
    if (g.s.characters.some((c) => !c.dead && c.hp < c.maxHp / 2) && g.s.shortRestsLeft > 0) g.shortRest();
    const target = doors.find(([x, y]) => !g.s.openDoors.includes(`${x},${y}`) && g.s.fog[y * g.width + x] !== 0);
    if (!target) break;
    g.move('p1', lead.id, target[0], target[1]);
    // Step through the door we just opened so the next room comes into view.
    if (g.s.phase === 'explore' && g.s.openDoors.includes(`${target[0]},${target[1]}`)) {
      try { g.move('p1', lead.id, target[0], target[1]); } catch (e) { if (!(e instanceof GameError)) throw e; }
    }
  }
  return { g, beatKinds };
}

describe('full playthrough', () => {
  it('runs many seeded games to a clean finish', () => {
    const outcomes: Record<string, number> = {};
    for (let seed = 1; seed <= 40; seed++) {
      const { g, beatKinds } = playthrough(seed, ['fighter', 'rogue', 'wizard', 'cleric']);
      outcomes[g.s.phase] = (outcomes[g.s.phase] ?? 0) + 1;
      expect(['victory', 'defeat', 'explore']).toContain(g.s.phase);
      expect(beatKinds).toContain('combat_start');
      for (const c of g.s.characters) {
        expect(c.hp).toBeGreaterThanOrEqual(0);
        expect(c.hp).toBeLessThanOrEqual(c.maxHp);
        expect(c.mana).toBeGreaterThanOrEqual(0);
      }
      // No two living creatures share a tile.
      const seen = new Set<string>();
      for (const e of [...g.consciousChars(), ...g.s.monsters.filter((m) => m.alive)]) {
        const k = `${e.x},${e.y}`;
        expect(seen.has(k), `stacked at ${k} (seed ${seed})`).toBe(false);
        seen.add(k);
      }
    }
    console.log('party of 4 outcomes:', outcomes);
    expect(outcomes.victory ?? 0).toBeGreaterThan(0);
  });

  it('scales encounters for a solo hero', () => {
    const outcomes: Record<string, number> = {};
    for (let seed = 1; seed <= 20; seed++) {
      const { g } = playthrough(seed, ['fighter']);
      outcomes[g.s.phase] = (outcomes[g.s.phase] ?? 0) + 1;
    }
    console.log('solo fighter outcomes:', outcomes);
    const g = party(1, ['fighter']);
    g.start();
    expect(g.s.monsters.length).toBeLessThan(11);
  });

  it('survives a JSON round trip', () => {
    const { g } = playthrough(3, ['fighter', 'cleric']);
    const copy = new Game('test', seeded(9), JSON.parse(JSON.stringify(g.s)));
    expect(copy.publicState({ busy: false, mode: 'scripted', model: null })).toEqual(g.publicState({ busy: false, mode: 'scripted', model: null }));
  });
});
