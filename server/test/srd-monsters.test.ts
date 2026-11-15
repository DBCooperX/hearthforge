import { describe, expect, it } from 'vitest';
import { Game, type Monster } from '../src/game/engine';
import { MONSTERS, crValue } from '../src/data/monsters';
import { MONSTER_SPELLS } from '../src/data/monsterSpells';
import { difficulty, findMonsters, partyBudget, resolveMonster, suggestMonsters } from '../src/data/monsterSearch';
import { catalogueIndex, describeCombat, DM_SYSTEM_PROMPT } from '../src/dm/context';
import { DM_TOOLS } from '../src/dm/claude';
import { scriptedIntent } from '../src/dm/scripted';
import { CREATURE_TYPES, SIZES } from '../../shared/monsterLook';
import { inArea } from '../src/game/areas';
import type { Character } from '../../shared/types';

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

/** An open room, 22 by 13, walled all round. */
const ROOM = Array.from({ length: 13 }, (_, y) => (y === 0 || y === 12 ? '#'.repeat(22) : `#${'.'.repeat(20)}#`));

/** A party in an open, lit room with the monsters asked for. Heroes stand in a column at x = 5. */
function arena(monsters: string[], opts: { seed?: number; heroes?: number; hp?: number } = {}) {
  const g = new Game('test', seeded(opts.seed ?? 7));
  g.upsertPlayer('p1', 'Tester', true);
  for (const cls of (['fighter', 'cleric', 'rogue', 'wizard'] as const).slice(0, opts.heroes ?? 1)) g.addCharacter('p1', cls, '');
  g.start();
  g.takeBeats();
  g.startEncounter(monsters.map((defId) => ({ defId, count: 1 })), { source: 'story', context: 'test', setting: 'dungeon', light: 'bright' });
  const s = g.s;
  s.rows = [...ROOM];
  s.lights = [];
  s.characters.forEach((c, i) => { c.x = 5; c.y = 5 + i; if (opts.hp) { c.maxHp = opts.hp; c.hp = opts.hp; } });
  s.monsters.forEach((m, i) => { m.x = 7 + i * 5; m.y = 4; });
  return { g, heroes: s.characters, c: s.characters[0], m: s.monsters[0] };
}

/** Make it this hero's turn, fresh. */
function heroTurn(g: Game, c: Character) {
  const combat = g.s.combat!;
  combat.turnIndex = combat.order.findIndex((o) => o.id === c.id);
  combat.movementLeft = 6;
  combat.actionUsed = false;
  combat.bonusUsed = false;
  combat.reacted = [];
}

/** Make it this monster's turn and play it. */
function monsterTurn(g: Game, m: Monster, intent: Parameters<Game['monsterAct']>[1] = {}) {
  const combat = g.s.combat!;
  combat.turnIndex = combat.order.findIndex((o) => o.id === m.id);
  return g.monsterAct(m.id, intent);
}

const logSince = (g: Game, n: number) => g.s.log.slice(n).map((l) => l.text).join('\n');

describe('the SRD 5.2.1 catalogue', () => {
  const all = Object.values(MONSTERS);

  it('holds every stat block of the SRD, from challenge 0 to 30', () => {
    expect(all.length).toBeGreaterThanOrEqual(340);
    expect(all.filter((m) => m.source === '5.2.1').length).toBe(341);
    expect(Math.max(...all.map((m) => crValue(m.cr)))).toBe(30);
    for (const id of ['tarrasque', 'ancient_red_dragon', 'lich', 'aboleth', 'goblin_warrior', 'commoner', 'kraken', 'vampire_vampire']) expect(MONSTERS[id], id).toBeDefined();
    // The seven creatures the 5.2.1 no longer has keep their 5.1 statistics.
    for (const id of ['goblin', 'orc', 'kobold', 'hobgoblin', 'gnoll', 'bugbear', 'wyrmling']) expect(MONSTERS[id].source, id).toBe('5.1');
  });

  it('gives every creature what the engine and the map need', () => {
    for (const m of all) {
      expect(CREATURE_TYPES, m.id).toContain(m.type);
      expect(SIZES, m.id).toContain(m.size);
      expect(m.look.size, m.id).toBe(m.size);
      expect(m.cr, m.id).toMatch(/^\d+(\/\d+)?$/);
      expect(m.hp, m.id).toBeGreaterThan(0);
      expect(m.ac, m.id).toBeGreaterThan(4);
      expect(m.xp, m.id).toBeGreaterThanOrEqual(0);
      expect(m.icon, m.id).toBeTruthy();
      for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) expect(typeof m.saves[k], `${m.id} ${k}`).toBe('number');
      for (const a of m.attacks) {
        expect(a.damage, `${m.id} ${a.name}`).toMatch(/^(\d+d\d+([+-]\d+)?|\d+)$/);
        expect(a.range, `${m.id} ${a.name}`).toBeGreaterThan(0);
        for (const x of a.extra ?? []) expect(x.dice, `${m.id} ${a.name}`).toMatch(/^(\d+d\d+([+-]\d+)?|\d+)$/);
      }
      for (const s of m.specials ?? []) {
        expect(s.dc, `${m.id} ${s.name}`).toBeGreaterThan(0);
        expect(s.area || s.range, `${m.id} ${s.name}`).toBeTruthy();
        expect(s.damage.length || s.rider, `${m.id} ${s.name}`).toBeTruthy();
        for (const d of s.damage) expect(d.dice, `${m.id} ${s.name}`).toMatch(/^(\d+d\d+([+-]\d+)?|\d+)$/);
      }
    }
  });

  it('reads the stat blocks the way the SRD prints them', () => {
    const dragon = MONSTERS.adult_red_dragon;
    expect(dragon).toMatchObject({ ac: 19, hp: 256, cr: '17', xp: 18000, speed: 40, fly: 80, immune: ['fire'], size: 'huge' });
    expect(dragon.attacks.find((a) => a.name === 'Rend')).toMatchObject({ toHit: 14, damage: '1d10+8', damageType: 'slashing', range: 10, extra: [{ dice: '2d4', type: 'fire' }] });
    expect(dragon.specials!.find((s) => s.name === 'Fire Breath')).toMatchObject({ save: 'dex', dc: 21, half: true, recharge: 5, area: { shape: 'cone', size: 60 }, damage: [{ dice: '17d6', type: 'fire' }] });
    expect(dragon.multi).toEqual({ fixed: [['Rend', 2]], options: [[['Rend', 1]], [['Scorching Ray', 1]]] });
    expect(dragon.legendary!.options.map((o) => o.name)).toEqual(['Commanding Presence', 'Fiery Rays', 'Pounce']);
    expect(dragon.flags!.legendaryResistance).toBe(3);
    // Its spells became things the engine can roll.
    expect(dragon.attacks.find((a) => a.name === 'Scorching Ray')).toMatchObject({ spell: true, toHit: 12, count: 3, damage: '2d6' });
    expect(dragon.specials!.find((s) => s.name === 'Fireball')).toMatchObject({ spell: true, dc: 20, perDay: 1 });
    expect(MONSTERS.troll.flags!.regeneration).toEqual({ amount: 15, stop: ['acid', 'fire'] });
    expect(MONSTERS.wolf.attacks[0].rider).toMatchObject({ condition: 'prone', maxSize: 'medium' });
    expect(MONSTERS.ghast.specials!.find((s) => s.name === 'Stench')).toMatchObject({ slot: 'aura', save: 'con', dc: 10, rider: { condition: 'poisoned' } });
    expect(MONSTERS.basilisk.specials![0].rider).toMatchObject({ condition: 'restrained', escalate: 'petrified', ends: 'save_end' });
    expect(MONSTERS.skeleton.vulnerable).toContain('bludgeoning');
    expect(MONSTERS.zombie.flags!.undeadFortitude).toBe(true);
    // Hand-made looks and loot of the creatures the game already had are kept.
    expect(MONSTERS.giant_rat.look.body).toBe('rodent');
    expect(MONSTERS.ogre.description).not.toBe('Large giant');
  });

  it('only casts spells it has a rule for', () => {
    for (const [id, s] of Object.entries(MONSTER_SPELLS)) {
      expect(!!s.attack !== !!s.save, id).toBe(true);
      if (s.save) expect(s.save.area || s.save.range, id).toBeTruthy();
    }
  });

  it('finds creatures by id, by English or German name, and by type and challenge', () => {
    expect(resolveMonster('adult_red_dragon')!.id).toBe('adult_red_dragon');
    expect(resolveMonster('Adult Red Dragon')!.id).toBe('adult_red_dragon');
    expect(resolveMonster('ausgewachsener roter drache')!.id).toBe('adult_red_dragon');
    expect(resolveMonster('Riesenspinne')!.id).toBe('giant_spider');
    expect(resolveMonster('giant-spider')!.id).toBe('giant_spider');
    expect(resolveMonster('wolves')).toBeNull();
    expect(resolveMonster('laser shark')).toBeNull();
    expect(suggestMonsters('red dragon')).toContain('young_red_dragon');
    const undead = findMonsters({ type: 'undead', crMin: 1, crMax: 3 });
    expect(undead.length).toBeGreaterThan(3);
    for (const m of undead) { expect(m.type).toBe('undead'); expect(crValue(m.cr)).toBeGreaterThanOrEqual(1); expect(crValue(m.cr)).toBeLessThanOrEqual(3); }
    expect(findMonsters({ query: 'drache' }).every((m) => m.type === 'dragon')).toBe(true);
    expect(findMonsters({ query: 'spider' }).map((m) => m.id)).toContain('giant_spider');
    expect(findMonsters({}).length).toBe(20);
  });

  it('judges how hard a fight is from the party and the XP at stake', () => {
    expect(partyBudget([1, 1, 1, 1])).toEqual({ low: 200, moderate: 300, high: 400 });
    expect(difficulty(150, [1, 1, 1, 1])).toBe('low');
    expect(difficulty(350, [1, 1, 1, 1])).toBe('high');
    expect(difficulty(18000, [1, 1, 1, 1])).toBe('deadly');
    expect(difficulty(18000, [17, 17, 17, 17])).toBe('low');
    expect(difficulty(40000, [17, 17, 17, 17])).toBe('high');
  });

  it('keeps the catalogue out of the tool schemas', () => {
    const schemas = JSON.stringify(DM_TOOLS);
    expect(schemas).not.toContain('adult_red_dragon');
    expect(schemas.length).toBeLessThan(40000);
    expect(DM_TOOLS.find((t) => t.name === 'find_monsters')?.strict).toBeUndefined();
    expect(catalogueIndex()).toContain('CR 17: adult_gold_dragon, adult_red_dragon');
    expect(DM_SYSTEM_PROMPT).toContain('tarrasque');
    // The index is a list of ids, not of stat blocks.
    expect(DM_SYSTEM_PROMPT.length).toBeLessThan(40000);
  });
});

describe('areas of effect', () => {
  const origin = { x: 5, y: 5 };
  it('spreads a cone as wide as it is long', () => {
    const cone = { shape: 'cone' as const, size: 30 };
    expect(inArea(cone, origin, { x: 9, y: 5 }, { x: 9, y: 5 })).toBe(true);
    expect(inArea(cone, origin, { x: 9, y: 5 }, { x: 9, y: 7 })).toBe(true);
    expect(inArea(cone, origin, { x: 9, y: 5 }, { x: 7, y: 9 })).toBe(false);
    expect(inArea(cone, origin, { x: 9, y: 5 }, { x: 3, y: 5 })).toBe(false);
  });
  it('keeps a line narrow', () => {
    const line = { shape: 'line' as const, size: 60, width: 5 };
    expect(inArea(line, origin, { x: 9, y: 5 }, { x: 12, y: 5 })).toBe(true);
    expect(inArea(line, origin, { x: 9, y: 5 }, { x: 9, y: 6 })).toBe(false);
    expect(inArea(line, origin, { x: 9, y: 9 }, { x: 8, y: 8 })).toBe(true);
  });
  it('measures a sphere from its centre', () => {
    const sphere = { shape: 'sphere' as const, size: 20, range: 150 };
    expect(inArea(sphere, origin, { x: 15, y: 5 }, { x: 18, y: 8 })).toBe(true);
    expect(inArea(sphere, origin, { x: 15, y: 5 }, { x: 20, y: 5 })).toBe(false);
  });
});

describe('monsters using their stat blocks', () => {
  it('makes every attack of a multiattack', () => {
    const { g, c, m } = arena(['troll'], { hp: 500 });
    m.x = 6; m.y = 4;
    const res = monsterTurn(g, m);
    expect(res.attacks?.length ?? 1).toBe(3);
    expect(res.attacks!.every((a) => a.name === 'Rend' && a.target === c.name)).toBe(true);
  });

  it('lets the Dungeon Master pick a single attack instead', () => {
    const { g, m } = arena(['troll'], { hp: 500 });
    m.x = 6; m.y = 4;
    const res = monsterTurn(g, m, { attack: 'Rend' });
    expect(res.attack?.name).toBe('Rend');
    expect(res.attacks).toBeUndefined();
  });

  it('breathes fire on everyone in the cone, for half on a save, then waits for it to recharge', () => {
    const { g, heroes, m } = arena(['young_red_dragon'], { heroes: 4, hp: 400 });
    m.x = 9; m.y = 5;
    const before = g.s.log.length;
    const res = monsterTurn(g, m);
    expect(res.specials?.[0]).toContain('Fire Breath');
    const text = logSince(g, before);
    for (const h of heroes) expect(text).toContain(`${h.name}: DEX save against Fire Breath`);
    const taken = heroes.map((h) => 400 - h.hp);
    expect(Math.min(...taken)).toBeGreaterThan(0);
    // Everyone took the same roll, whole or halved.
    const full = Math.max(...taken);
    for (const t of taken) expect([full, Math.floor(full / 2)]).toContain(t);
    expect(m.spent).toContain('Fire Breath');
    // Until it recharges, the dragon falls back on its multiattack; once it has, it breathes again.
    const later = Array.from({ length: 14 }, () => monsterTurn(g, m));
    expect(later.some((r) => !r.specials && (r.attacks?.length ?? 0) === 3)).toBe(true);
    expect(later.some((r) => r.specials?.[0].includes('Fire Breath'))).toBe(true);
    m.spent = [];
    expect(describeCombat(g)).toContain('Fire Breath (DEX save DC 17, 30 ft cone, 16d6 fire, half on a save, ready (recharge 5-6))');
  });

  it('regenerates each turn unless fire or acid stopped it', () => {
    const { g, c, m } = arena(['troll'], { hp: 500 });
    m.x = 15; m.y = 9;
    m.hp = 40;
    monsterTurn(g, m, { tactic: 'hold_position' });
    expect(m.hp).toBe(55);
    c.abilityIds.push('fire_bolt');
    heroTurn(g, c);
    const hp = m.hp;
    for (let i = 0; i < 20 && m.hp === hp; i++) { heroTurn(g, c); g.useAbility('p1', c.id, 'fire_bolt', m.id); }
    expect(m.hp).toBeLessThan(hp);
    expect(m.noRegen).toBe(true);
    const burnt = m.hp;
    monsterTurn(g, m, { tactic: 'hold_position' });
    expect(m.hp).toBe(burnt);
    monsterTurn(g, m, { tactic: 'hold_position' });
    expect(m.hp).toBe(burnt + 15);
  });

  it('halves damage of a type the creature resists and ignores one it is immune to', () => {
    const { g, c, m } = arena(['ghast'], { hp: 500 });
    c.abilityIds.push('fire_bolt');
    m.x = 6; m.y = 5;
    // Necrotic is resisted, poison ignored; a sword is neither.
    const res = (g as unknown as { damageMonster(m: Monster, n: number, t: string): { dealt: number } });
    expect(res.damageMonster(m, 10, 'necrotic').dealt).toBe(5);
    expect(res.damageMonster(m, 10, 'poison').dealt).toBe(0);
    expect(res.damageMonster(m, 10, 'slashing').dealt).toBe(10);
  });

  it('knocks a hero prone, who gets up for half the movement', () => {
    const { g, c, m } = arena(['wolf'], { hp: 500 });
    m.x = 6; m.y = 5;
    for (let i = 0; i < 30 && !c.conditions.includes('prone'); i++) monsterTurn(g, m);
    expect(c.conditions).toContain('prone');
    expect(c.effects![0]).toMatchObject({ condition: 'prone', sourceId: m.id, source: 'Bite' });
    const before = g.s.log.length;
    g.s.combat!.turnIndex = g.s.combat!.order.findIndex((o) => o.id === m.id);
    g.finishMonsterBlock([m]);
    expect(g.current()!.id).toBe(c.id);
    expect(c.conditions).not.toContain('prone');
    expect(g.s.combat!.movementLeft).toBe(Math.ceil(Math.floor(c.speed / 5) / 2));
    expect(logSince(g, before)).toContain('gets back up');
  });

  it('grapples: the hero cannot move until breaking free with an action', () => {
    const { g, c, m } = arena(['giant_crab'], { hp: 500 });
    m.x = 6; m.y = 5;
    for (let i = 0; i < 30 && !c.conditions.includes('grappled'); i++) monsterTurn(g, m);
    expect(c.conditions).toContain('grappled');
    heroTurn(g, c);
    expect(() => g.move('p1', c.id, 3, 5)).toThrow(/held fast/);
    for (let i = 0; i < 40 && c.conditions.includes('grappled'); i++) { heroTurn(g, c); g.escape('p1', c.id); }
    expect(c.conditions).not.toContain('grappled');
    expect(g.s.combat!.actionUsed).toBe(true);
    g.move('p1', c.id, 3, 5);
    expect(c.x).toBe(3);
    expect(() => g.escape('p1', c.id)).toThrow(/not held/);
  });

  it('paralyses on a failed save: the turn is lost and the save is repeated', () => {
    const { g, c, m } = arena(['ghoul'], { hp: 500 });
    m.x = 6; m.y = 5;
    c.abilities.con = 1;
    for (let i = 0; i < 40 && !c.conditions.includes('paralyzed'); i++) monsterTurn(g, m, { attack: 'Claw' });
    expect(c.conditions).toContain('paralyzed');
    const before = g.s.log.length;
    g.s.combat!.turnIndex = g.s.combat!.order.findIndex((o) => o.id === m.id);
    g.finishMonsterBlock([m]);
    // The paralysed hero's turn passed by itself, and it is the ghoul's turn again.
    expect(logSince(g, before)).toMatch(/loses the turn/);
    expect(g.current()!.id).toBe(m.id);
  });

  it('ends what a monster did to the heroes when it dies and when the fight is over', () => {
    const { g, c, m } = arena(['giant_crab', 'wolf'], { hp: 500 });
    m.x = 6; m.y = 5;
    for (let i = 0; i < 30 && !c.conditions.includes('grappled'); i++) monsterTurn(g, m);
    expect(c.conditions).toContain('grappled');
    heroTurn(g, c);
    m.hp = 1;
    for (let i = 0; i < 30 && m.alive; i++) { heroTurn(g, c); g.attack('p1', c.id, m.id); }
    expect(m.alive).toBe(false);
    expect(c.conditions).not.toContain('grappled');
    expect(c.effects).toEqual([]);
  });

  it('spends legendary actions after heroes\' turns and gets them back on its own turn', () => {
    const { g, c, m } = arena(['adult_red_dragon'], { hp: 5000 });
    m.x = 7; m.y = 5;
    monsterTurn(g, m, { tactic: 'hold_position' });
    expect(m.legLeft).toBe(3);
    const before = g.s.log.length;
    heroTurn(g, c);
    g.endTurn('p1', c.id);
    expect(m.legLeft).toBe(2);
    expect(logSince(g, before)).toContain('Legendary action: Adult Red Dragon uses');
    expect(g.publicState({ busy: false, mode: 'scripted', model: null }).monsters[0].legendary).toEqual({ left: 2, uses: 3 });
    monsterTurn(g, m, { tactic: 'hold_position' });
    expect(m.legLeft).toBe(3);
  });

  it('shrugs off a failed save with Legendary Resistance, three times', () => {
    const { g, c, m } = arena(['adult_red_dragon'], { hp: 5000 });
    m.x = 7; m.y = 5;
    c.abilityIds.push('sacred_flame');
    c.abilities.wis = 30;
    const before = g.s.log.length;
    for (let i = 0; i < 60 && (m.legRes ?? 3) > 0; i++) { heroTurn(g, c); g.useAbility('p1', c.id, 'sacred_flame', m.id); }
    expect(m.legRes).toBe(0);
    expect(logSince(g, before).match(/Legendary Resistance/g)!.length).toBe(3);
  });

  it('sears those next to a burning creature at the end of its turn', () => {
    const { g, c, m } = arena(['fire_elemental'], { hp: 500 });
    m.x = 6; m.y = 5;
    const before = g.s.log.length;
    monsterTurn(g, m, { tactic: 'hold_position' });
    expect(logSince(g, before)).toContain('seared by the aura');
    expect(c.hp).toBeLessThan(500);
  });

  it('bursts when it dies', () => {
    const { g, c, m } = arena(['magma_mephit', 'wolf'], { hp: 500 });
    m.x = 6; m.y = 5;
    m.hp = 1;
    const before = g.s.log.length;
    for (let i = 0; i < 30 && m.alive; i++) { heroTurn(g, c); g.attack('p1', c.id, m.id); }
    expect(m.alive).toBe(false);
    expect(logSince(g, before)).toContain('bursts apart: Death Burst');
  });

  it('tells the players what a creature can do', () => {
    const { g } = arena(['adult_red_dragon']);
    const view = g.publicState({ busy: false, mode: 'scripted', model: null }).monsters[0];
    expect(view.cr).toBe('17');
    expect(view.abilities).toEqual(expect.arrayContaining(['Multiattack', 'Fire Breath', 'Legendary Resistance', 'Spellcasting']));
    expect(view.tiles).toBe(3);
    expect(g.s.encounter!.boss).toBe(true);
    const text = describeCombat(g);
    expect(text).toContain('Multiattack (2x Rend, then one of: 1x Rend / 1x Scorching Ray)');
    expect(text).toContain('Legendary actions left this round: 3/3');
    expect(text).toContain('immune to fire');
  });

  it('plays every stat block through a fight without tripping', () => {
    const failures: string[] = [];
    let seed = 1;
    for (const def of Object.values(MONSTERS)) {
      try {
        const { g, heroes } = arena([def.id], { seed: seed++, heroes: 4, hp: 120 });
        const m = g.s.monsters[0];
        m.x = 9; m.y = 5;
        for (let round = 0; round < 4 && g.s.phase === 'combat'; round++) {
          for (const h of heroes) {
            if (g.s.phase !== 'combat') break;
            if (!g.conscious(h) || g.incapacitated(h)) continue;
            heroTurn(g, h);
            try { g.attack('p1', h.id, m.id); } catch { /* out of reach, charmed, frightened: fine */ }
            if (g.s.phase === 'combat' && g.current()?.id === h.id) g.endTurn('p1', h.id);
          }
          if (g.s.phase !== 'combat' || !m.alive) break;
          g.s.combat!.turnIndex = g.s.combat!.order.findIndex((o) => o.id === m.id);
          const res = g.monsterAct(m.id, scriptedIntent(g, m));
          if (res.waiting) g.resumeMonster(true);
          g.publicState({ busy: false, mode: 'scripted', model: null });
          describeCombat(g);
        }
        for (const h of heroes) {
          if (!Number.isFinite(h.hp) || h.hp < 0 || h.hp > h.maxHp) failures.push(`${def.id}: ${h.name} has ${h.hp} HP`);
          for (const x of h.conditions) if (x === 'undefined') failures.push(`${def.id}: undefined condition`);
        }
      } catch (err) {
        failures.push(`${def.id}: ${(err as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('does damage with almost every creature that has an action', () => {
    // A stat block that can never hurt anyone points at something the importer misread.
    const harmless: string[] = [];
    for (const def of Object.values(MONSTERS)) {
      if (!def.attacks.length && !(def.specials ?? []).some((s) => s.slot === 'action')) continue;
      let hurt = false;
      for (let seed = 1; seed <= 3 && !hurt; seed++) {
        const { g, heroes } = arena([def.id], { seed, heroes: 2, hp: 2000 });
        const m = g.s.monsters[0];
        m.x = 7; m.y = 5;
        for (let i = 0; i < 12 && !hurt; i++) {
          g.s.combat!.turnIndex = g.s.combat!.order.findIndex((o) => o.id === m.id);
          g.monsterAct(m.id, {});
          hurt = heroes.some((h) => h.hp < h.maxHp || h.conditions.length > 0);
        }
      }
      if (!hurt) harmless.push(def.id);
    }
    expect(harmless).toEqual([]);
  });
});
