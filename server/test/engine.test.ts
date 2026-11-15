import { describe, expect, it } from 'vitest';
import { sneakDice } from '../../shared/classes';
import { ITEMS } from '../../shared/content';
import { TERRAIN, findRoute, summarizeRoute, type TerrainCode } from '../../shared/hex';
import type { Character, ClassId } from '../../shared/types';
import { ENCOUNTERS, SEED_LOCATIONS } from '../src/data/world';
import { MONSTERS } from '../src/data/monsters';
import { roll } from '../src/game/dice';
import { Game, GameError } from '../src/game/engine';
import { generateWorld, trueTerrain } from '../src/game/world';
import { CLASSIC_START } from '../../shared/start';

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
const tryDo = (fn: () => void) => { try { fn(); return true; } catch (e) { if (!(e instanceof GameError)) throw e; return false; } };

/** Fights the current battle to its end with simple bot tactics and the scripted monster AI. */
function fight(g: Game) {
  for (let step = 0; step < 2000 && g.s.phase === 'combat'; step++) {
    g.takeMoves();
    if (g.isMonsterTurn()) {
      const block = g.monsterBlock();
      expect(block.length).toBeGreaterThan(0);
      for (const m of block) g.monsterAct(m.id);
      g.finishMonsterBlock(block);
      continue;
    }
    const c: Character = g.char(g.current()!.id);
    const foe = g.s.monsters.filter((m) => m.alive).sort((a, b) => cheb(a, c) - cheb(b, c))[0];
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
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
            if (tryDo(() => g.move('p1', c.id, foe.x + dx, foe.y + dy))) break;
          }
          tryDo(() => g.attack('p1', c.id, foe.id));
        }
      }
    }
    // No two living creatures may share a tile.
    const seen = new Set<string>();
    for (const e of [...g.consciousChars(), ...g.s.monsters.filter((m) => m.alive)]) {
      const k = `${e.x},${e.y}`;
      expect(seen.has(k), `stacked at ${k}`).toBe(false);
      seen.add(k);
    }
    if (g.s.phase === 'combat' && g.current()?.id === c.id) g.endTurn('p1', c.id);
  }
  expect(g.s.phase).not.toBe('combat');
}

/** Travel to a hex, fighting through whatever turns up, until arrival or the party is lost. */
function journey(g: Game, q: number, r: number) {
  for (let leg = 0; leg < 40 && g.s.phase === 'explore'; leg++) {
    if (g.world.party.q === q && g.world.party.r === r) return true;
    g.beginTravel(q, r);
    while (g.travelStep()) { /* walking */ }
    if ((g.s.phase as string) === 'combat') fight(g);
  }
  return g.s.phase === 'explore' && g.world.party.q === q && g.world.party.r === r;
}

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

describe('world', () => {
  it('generates a map where every seeded place can be reached on foot', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { world } = generateWorld({ ...CLASSIC_START, seed: `S${seed}` });
      expect(world.terrain).toHaveLength(world.width * world.height);
      const start = SEED_LOCATIONS[0];
      for (const loc of SEED_LOCATIONS) {
        expect(TERRAIN[trueTerrain(world, loc)].passable, `${loc.name} on seed ${seed}`).toBe(true);
        expect(findRoute(world.width, world.height, (h) => trueTerrain(world, h), start, loc), `${loc.name} on seed ${seed}`).not.toBeNull();
      }
      // The start is revealed; most of the map is not.
      expect(world.explored[start.r * world.width + start.q]).toBe('1');
      expect([...world.explored].filter((c) => c === '1').length).toBeLessThan(40);
    }
  });

  it('has valid encounter tables, dungeon stages and battle maps', () => {
    for (const table of Object.values(ENCOUNTERS)) for (const groups of table) for (const g of groups) expect(MONSTERS[g.defId], g.defId).toBeDefined();
    for (const code of Object.keys(TERRAIN) as TerrainCode[]) if (TERRAIN[code].passable) expect(ENCOUNTERS[code], code).toBeDefined();
    for (const loc of SEED_LOCATIONS) for (const st of loc.stages ?? []) {
      for (const m of st.monsters) expect(MONSTERS[m.defId]).toBeDefined();
      for (const it of st.loot.items) expect(ITEMS[it.id]).toBeDefined();
    }
  });

  it('summarises a route with distance, time and encounter risk', () => {
    const path = [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }];
    const sum = summarizeRoute(path, (h) => (h.q === 3 ? '?' : h.q === 2 ? 'f' : 'p'), 8 * 60);
    expect(sum.miles).toBe(18);
    expect(sum.hours).toBe(2 + 3 + 3);
    expect(sum.encounterChance).toBeGreaterThan(0.2);
    expect(sum.encounterChance).toBeLessThan(0.4);
    expect(sum.terrain.map((t) => t.name)).toEqual(['plains', 'forest', 'uncharted']);
  });

  it('starts the party in town, with the townsfolk met and the quest active', () => {
    const g = party();
    g.start();
    expect(g.s.phase).toBe('explore');
    expect(g.place()?.id).toBe('emberfall');
    expect(g.isSafe()).toBe(true);
    const pub = g.publicState({ busy: false, mode: 'scripted', model: null });
    expect(pub.world!.terrain).toContain('?');
    expect(pub.world!.locations.map((l) => l.id).sort()).toEqual(['emberfall', 'gilded_anvil', 'old_hearthforge']);
    expect(pub.memory.npcs.map((n) => n.id)).toEqual(['reeve_venn']);
    expect(pub.memory.quests[0]).toMatchObject({ id: 'warren', status: 'active' });
    expect(pub.world!.locations.find((l) => l.id === 'old_hearthforge')!.dungeon).toMatchObject({ total: 4, cleared: 0 });
    expect(g.takeBeats().map((b) => b.kind)).toEqual(['start']);
    // Stepping into the tavern introduces the innkeeper.
    g.goTo('gilded_anvil');
    expect(g.presentNpcs().map((n) => n.name)).toEqual(['Marta Coppervein']);
    expect(g.takeBeats()[0]).toMatchObject({ kind: 'arrive', location: 'The Gilded Anvil', firstVisit: true });
  });

  it('travels hex by hex, passing time, lifting the fog and stopping for trouble', () => {
    let arrived = 0, fights = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const g = party(seed);
      g.start();
      g.takeBeats();
      const before = [...g.world.explored].filter((c) => c === '1').length;
      const t0 = g.world.minutes;
      expect(() => g.beginTravel(0, 0)).toThrow(/uncharted/);
      expect(() => g.beginTravel(g.world.party.q, g.world.party.r)).toThrow(/already there/);
      const forge = g.location('old_hearthforge')!;
      const ok = journey(g, forge.q, forge.r);
      const beats = g.takeBeats().map((b) => b.kind);
      if (beats.includes('combat_start')) fights++;
      if (!ok) continue;
      arrived++;
      expect(g.place()?.id).toBe('old_hearthforge');
      expect(g.world.minutes).toBeGreaterThan(t0 + 120);
      expect([...g.world.explored].filter((c) => c === '1').length).toBeGreaterThan(before);
      expect(beats).toContain('arrive');
      expect(g.s.travel).toBeNull();
    }
    expect(arrived).toBeGreaterThan(15);
    expect(fights).toBeGreaterThan(0);
  });
});

describe('characters and inventory', () => {
  it('derives armor class from equipment', () => {
    const g = party();
    const ac = Object.fromEntries(g.s.characters.map((c) => [c.classId, c.ac]));
    // Brann: chain mail 16 + shield 2 + Defense style 1. Maeve: scale mail 14 + DEX 1 + shield 2.
    expect(ac).toEqual({ fighter: 19, rogue: 14, wizard: 11, cleric: 17 });
  });

  it('enforces slots, proficiency and two-handed weapons', () => {
    const g = party();
    g.start();
    const [fighter, rogue, wizard] = g.s.characters;
    g.invMove('p1', rogue.id, { type: 'bag', index: 0 }, { type: 'slot', slot: 'mainHand' });
    expect(rogue.equipment.mainHand?.defId).toBe('shortbow');
    expect(rogue.bag[0]?.defId).toBe('rapier');
    expect(() => g.invMove('p1', rogue.id, { type: 'bag', index: 0 }, { type: 'slot', slot: 'head' })).toThrow(GameError);
    g.invMove('p1', rogue.id, { type: 'slot', slot: 'mainHand' }, { type: 'bag', index: 10 });
    g.give('p1', rogue.id, { type: 'bag', index: 10 }, fighter.id);
    const idx = fighter.bag.findIndex((b) => b?.defId === 'shortbow');
    g.invMove('p1', fighter.id, { type: 'bag', index: idx }, { type: 'slot', slot: 'mainHand' });
    expect(fighter.equipment.offHand).toBeNull();
    expect(fighter.ac).toBe(17);
    g.invMove('p1', fighter.id, { type: 'slot', slot: 'armor' }, { type: 'bag', index: 15 });
    g.give('p1', fighter.id, { type: 'bag', index: 15 }, wizard.id);
    const mail = wizard.bag.findIndex((b) => b?.defId === 'chain_mail');
    expect(() => g.invMove('p1', wizard.id, { type: 'bag', index: mail }, { type: 'slot', slot: 'armor' })).toThrow(/can't use/);
  });
});

describe('progression', () => {
  it('shares experience and levels heroes up with a summary', () => {
    const g = party();
    g.start();
    g.takeBeats();
    const [fighter, rogue, wizard, cleric] = g.s.characters;
    const hp = fighter.maxHp;
    g.grantXp(1200, 'a test');
    expect(g.s.characters.map((c) => [c.xp, c.level])).toEqual([[300, 2], [300, 2], [300, 2], [300, 2]]);
    // d10 hit die: 6 + CON 3 + 1 for Dwarven Toughness.
    expect(fighter.maxHp).toBe(hp + 10);
    expect(fighter.abilityIds).toContain('action_surge');
    expect(rogue.abilityIds).toContain('dash');
    expect(cleric.abilityIds).toContain('healing_word');
    expect(wizard.maxMana).toBe(8);
    const cards = g.s.log.filter((l) => l.kind === 'levelup');
    expect(cards).toHaveLength(4);
    expect(cards[0].levelUp).toMatchObject({ name: fighter.name, level: 2 });
    expect(cards[0].levelUp!.gains.join(' ')).toMatch(/maximum HP.*Action Surge/);
    expect(g.takeBeats()).toEqual([{ kind: 'level_up', heroes: g.s.characters.map((c) => c.name) }]);
    // Level 5: proficiency +3 and the ability score increase from level 4.
    g.grantXp(4 * 6500, 'a test');
    expect(fighter.level).toBe(5);
    expect(fighter.profBonus).toBe(3);
    expect(fighter.abilities.str).toBe(16);
    expect(fighter.pending).toMatchObject([{ kind: 'feat', level: 4 }]);
    expect(fighter.subclass).toBe('Champion');
    expect(sneakDice(rogue)).toBe(3);
    expect(rogue.features.filter((f) => f.startsWith('Sneak Attack')).length).toBe(1);
    expect(fighter.hitDice).toBe(5);
  });

  it('gives a level 5 fighter two attacks and an action surge', () => {
    const g = party(4, ['fighter']);
    g.start();
    g.grantXp(7000, 'a test');
    const f = g.s.characters[0];
    g.choose('p1', f.id, f.pending[0].id, { feat: { id: 'asi', abilities: ['str', 'str'] } });
    g.startEncounter([{ defId: 'zombie', count: 4 }], { source: 'story', context: 'test' });
    for (const m of g.s.monsters) m.hp = m.maxHp = 500; // tough enough to survive the whole exchange
    for (let i = 0; i < 20 && g.current()?.id !== f.id; i++) { const b = g.monsterBlock(); for (const m of b) g.monsterAct(m.id); g.finishMonsterBlock(b); }
    const foe = g.s.monsters[0];
    g.move('p1', f.id, foe.x - 1, foe.y);
    while (cheb(f, foe) > 1) { g.endTurn('p1', f.id); const b = g.monsterBlock(); for (const m of b) g.monsterAct(m.id); g.finishMonsterBlock(b); if (g.current()?.id === f.id && cheb(f, foe) > 1) g.move('p1', f.id, foe.x - 1, foe.y); }
    for (const m of g.s.monsters) m.hp = 999; // the map differs from fight to fight, so keep the neighbour standing
    const target = () => g.s.monsters.find((m) => m.alive && cheb(m, f) <= 1)!.id;
    g.attack('p1', f.id, target());
    g.attack('p1', f.id, target());
    expect(() => g.attack('p1', f.id, target())).toThrow(/Action already used/);
    g.useAbility('p1', f.id, 'action_surge');
    g.attack('p1', f.id, target());
    expect(() => g.useAbility('p1', f.id, 'action_surge')).toThrow(/no Action Surge left/);
    expect(g.s.log.filter((l) => l.roll?.actor === f.name).length).toBeGreaterThanOrEqual(3);
    expect(g.s.log.find((l) => l.roll?.actor === f.name)!.roll).toMatchObject({ target: { kind: 'AC', value: 8 }, modifier: 7 });
  });
});

describe('dungeons and combat', () => {
  it('clears the warren stage by stage, with loot, experience and the quest reward', () => {
    const outcomes = { cleared: 0, rescued: 0, defeat: 0 };
    for (let seed = 1; seed <= 30; seed++) {
      const g = party(seed);
      g.start();
      const forge = g.location('old_hearthforge')!;
      if (!journey(g, forge.q, forge.r)) { outcomes.defeat++; continue; }
      g.takeBeats();
      expect(() => g.beginTravel(forge.q, forge.r)).toThrow();
      let lost = false;
      for (let stage = 0; stage < 4; stage++) {
        if (g.place()?.id !== 'old_hearthforge' || g.s.phase !== 'explore') { lost = true; break; }
        if (g.s.shortRestsLeft > 0 && g.s.characters.some((c) => !c.dead && c.hp < c.maxHp / 2)) g.shortRest();
        g.delve();
        expect(g.s.rows.length).toBeGreaterThan(0);
        fight(g);
        expect(g.s.rows).toEqual([]);
      }
      const beats = g.takeBeats();
      if (beats.some((b) => b.kind === 'rescued')) lost = true;
      for (const c of g.s.characters) {
        expect(c.hp).toBeGreaterThanOrEqual(0);
        expect(c.hp).toBeLessThanOrEqual(c.maxHp);
        expect(c.mana).toBeGreaterThanOrEqual(0);
      }
      if (lost || g.s.phase === 'defeat') {
        if (g.s.phase === 'defeat') outcomes.defeat++;
        else { outcomes.rescued++; expect(beats.map((b) => b.kind)).toContain('rescued'); expect(g.isSafe()).toBe(true); }
        continue;
      }
      outcomes.cleared++;
      expect(forge.cleared).toBe(4);
      expect(() => g.delve()).toThrow(/cleared/);
      expect(g.s.memory.quests[0].status).toBe('completed');
      expect(g.s.characters.some((c) => c.xp >= 200)).toBe(true);
      expect(g.s.characters.some((c) => c.bag.some((b) => b?.defId === 'longsword_plus1'))).toBe(true);
      expect(beats.filter((b) => b.kind === 'combat_end').some((b) => b.kind === 'combat_end' && b.boss)).toBe(true);
    }
    console.log('warren with a party of 4:', outcomes);
    expect(outcomes.cleared).toBeGreaterThan(5);
  });

  it('scales encounters for a solo hero and rescues a beaten party', () => {
    const g = party(2, ['wizard']);
    g.start();
    g.takeBeats();
    g.startEncounter([{ defId: 'goblin', count: 4 }], { source: 'story', context: 'test' });
    expect(g.s.monsters).toHaveLength(1);
    fight(g);
    g.takeBeats();
    if (g.s.phase !== 'explore') return;
    const gold = (g.s.gold = 100);
    const day = g.day();
    g.startEncounter([{ defId: 'orc', count: 8 }, { defId: 'bugbear', count: 1 }], { source: 'story', context: 'test' });
    const hero = g.s.characters[0];
    for (let i = 0; i < 400 && (g.s.phase as string) === 'combat'; i++) {
      if (g.isMonsterTurn()) { const b = g.monsterBlock(); for (const m of b) g.monsterAct(m.id); g.finishMonsterBlock(b); }
      else g.endTurn('p1', hero.id);
    }
    expect(['explore', 'defeat']).toContain(g.s.phase);
    if (g.s.phase === 'explore') {
      expect(hero.hp).toBe(1);
      expect(g.s.gold).toBe(gold / 2);
      expect(g.day()).toBe(day + 1);
      expect(g.place()?.id).toBe('emberfall');
      expect(g.takeBeats().map((b) => b.kind)).toContain('rescued');
    }
  });

  it('rests: a short rest costs an hour, a long rest restores everything once a day', () => {
    const g = party();
    g.start();
    const wizard = g.s.characters[2];
    wizard.hp = 1;
    wizard.mana = 0;
    const t = g.world.minutes;
    g.shortRest();
    expect(g.world.minutes).toBe(t + 60);
    expect(wizard.hp).toBeGreaterThan(1);
    g.longRest();
    expect(wizard.hp).toBe(wizard.maxHp);
    expect(wizard.mana).toBe(wizard.maxMana);
    expect(g.s.shortRestsLeft).toBe(2);
    expect(g.world.minutes).toBe(t + 60 + 480);
    expect(() => g.longRest()).toThrow(/not tired/);
  });
});

describe("the Dungeon Master's tools", () => {
  it('remembers people, places, quests and deeds, and keeps the books honest', () => {
    const g = party();
    g.start();
    const npc = g.rememberNpc({ name: 'Hobb the Tinker', role: 'travelling tinker', description: 'Sells pots.', appearance: 'A stooped man in a patched coat.', disposition: 'friendly', locationId: '', note: 'Owes the party a favour.' });
    expect(npc).toMatchObject({ id: 'npc_hobb_the_tinker', created: true, location_id: 'emberfall' });
    g.rememberNpc({ name: 'hobb the tinker', appearance: 'Someone else entirely.', note: 'Heading to Greywater.' });
    const saved = g.s.memory.npcs.find((n) => n.id === npc.id)!;
    expect(saved.visual.description).toBe('A stooped man in a patched coat.');
    expect(saved.notes).toHaveLength(2);
    expect(g.presentNpcs().map((n) => n.name)).toContain('Hobb the Tinker');

    const mill = g.createLocation({ name: 'The Burnt Mill', kind: 'ruin', description: 'A mill gutted by fire.', appearance: 'Charred timbers.', direction: 'south', distance: 3 });
    const loc = g.location(mill.id)!;
    expect(loc.r).toBeGreaterThan(g.world.party.r);
    expect(TERRAIN[trueTerrain(g.world, loc)].passable).toBe(true);
    expect(loc.discovered).toBe(true);
    expect(g.createLocation({ name: 'the burnt mill', kind: 'ruin', description: '', direction: 'north', distance: 2 }).created).toBe(false);
    const shop = g.createLocation({ name: "Pell's Provisions", kind: 'shop', description: 'A general store.', direction: 'here', distance: 0 });
    expect(g.location(shop.id)!.parentId).toBe('emberfall');
    g.goTo(shop.id);
    // A place the DM marks on the map can be travelled to even though the way is uncharted.
    g.beginTravel(loc.q, loc.r);
    g.s.travel = null;

    const gold = g.s.gold;
    expect(() => g.changeGold(-gold - 1, 'too dear')).toThrow(/only has/);
    expect(g.changeGold(99999, 'a dragon hoard').gold).toBe(gold + 500);
    g.setQuest({ title: 'Find the Tinker', status: 'active', summary: 'Hobb is missing.' });
    g.setQuest({ title: 'find the tinker', status: 'completed', note: 'Found him.' });
    expect(g.s.memory.quests.map((q) => q.status)).toEqual(['active', 'completed']);
    const xp = g.s.characters[0].xp;
    g.setQuest({ id: 'warren', status: 'completed' });
    g.setQuest({ id: 'warren', status: 'active' });
    g.setQuest({ id: 'warren', status: 'completed' });
    expect(g.s.characters[0].xp).toBe(xp + 75);
    expect(g.s.gold).toBe(gold + 500 + 100);
    expect(g.awardXp(1_000_000, 'cheating').granted).toBeLessThanOrEqual(600);
    g.recordDeed('Paid the debts of the Coppervein family.');
    expect(g.s.memory.deeds).toHaveLength(1);
    expect(g.grantItem(g.s.characters[0].id, 'potion_healing', 99).quantity).toBe(10);
    expect(() => g.grantItem(g.s.characters[0].id, 'vorpal_sword', 1)).toThrow(/Unknown item/);
    const check = g.skillCheck(g.s.characters[1].id, 'dex', 'Stealth', 12);
    // Vex: DEX +3 and Expertise in Stealth (+4).
    expect(check.modifier).toBe(7);
    expect(g.s.log[g.s.log.length - 1].roll).toMatchObject({ label: 'Stealth check', target: { kind: 'DC', value: 12 }, outcome: check.success ? 'success' : 'failure' });
    g.addScene({ title: 'Market square', mood: 'warm', text: 'The square hums.', actions: ['Browse the stalls', '', 'Find the reeve'] });
    expect(g.s.log[g.s.log.length - 1].scene).toMatchObject({ title: 'Market square', actions: ['Browse the stalls', 'Find the reeve'] });
  });

  it('survives a JSON round trip, and ignores saves from before the open world', () => {
    const g = party(3, ['fighter', 'cleric']);
    g.start();
    journey(g, g.location('old_hearthforge')!.q, g.location('old_hearthforge')!.r);
    const view = { busy: false, mode: 'scripted' as const, model: null };
    const copy = new Game('test', seeded(9), JSON.parse(JSON.stringify(g.s)));
    expect(copy.publicState(view)).toEqual(g.publicState(view));
    const old = new Game('test', seeded(9), { room: 'test', phase: 'explore', fog: [], players: [{ id: 'p1', name: 'Tester', connected: true }] } as any);
    expect(old.s.phase).toBe('lobby');
    expect(old.s.players).toHaveLength(1);
  });
});
