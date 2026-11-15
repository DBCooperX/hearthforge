import { describe, expect, it } from 'vitest';
import { classSpellList, maxManaOf, spellOptions } from '../../shared/build';
import { CHOICES, CLASS_FEATURES, CLASS_IDS, GROUPS, featureLine, optionLine, OPTIONS, RESOURCES, chosenIn, grantedChoices, hasFeature, optionsFor, resourceLeft, resourceMax, saveProfs } from '../../shared/classes';
import { ABILITIES, SKILLS } from '../../shared/content';
import { hasTranslation } from '../../shared/i18n';
import { recommendFeat, recommendSpells } from '../../shared/recommend';
import { STYLES } from '../../shared/rules';
import { MAX_LEVEL, XP_THRESHOLDS, type Character, type ClassId } from '../../shared/types';
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

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const tryDo = (fn: () => void) => { try { fn(); return true; } catch (e) { if (!(e instanceof GameError)) throw e; return false; } };

function party(classes: ClassId[], seed = 3) {
  const g = new Game('test', seeded(seed));
  g.upsertPlayer('p1', 'Tester', true);
  for (const c of classes) g.addCharacter('p1', c, '');
  g.start();
  return g;
}

/** Make every waiting level-up choice the way a player in a hurry would: the recommended feat, the first options. */
function decide(g: Game, c: Character) {
  for (let i = 0; i < 80 && c.pending.length; i++) {
    const p = c.pending[0];
    if (p.kind === 'feat') g.choose('p1', c.id, p.id, { feat: recommendFeat({ ...c, level: p.level }, false) });
    else if (p.kind === 'spell') g.choose('p1', c.id, p.id, { spell: recommendSpells(spellOptions(c, classSpellList(c.classId)!, p.pool))[0] });
    else {
      const from = p.group === 'style' ? Object.keys(STYLES).filter((s) => !c.feats.includes(`style_${s}`))
        : p.group === 'expertise' ? c.skills.filter((s) => !c.expertise.includes(s) && (!p.from || p.from.includes(s)))
        : p.group === 'lore' ? Object.keys(SKILLS).filter((s) => !c.skills.includes(s))
        : optionsFor(c, p.group).map((o) => o.id);
      g.choose('p1', c.id, p.id, { options: from.slice(0, p.count) });
    }
  }
  expect(c.pending).toEqual([]);
}

function raise(g: Game, level: number) {
  const n = g.s.characters.length;
  const need = XP_THRESHOLDS[level - 1] - g.s.characters[0].xp;
  if (need > 0) g.grantXp(need * n, 'a test');
  for (const c of g.s.characters) decide(g, c);
}

function monstersAct(g: Game) {
  const block = g.monsterBlock();
  for (const m of block) g.monsterAct(m.id);
  g.finishMonsterBlock(block);
}

/** Plays the fight with every button the hero has: each ability once a turn where it fits, then weapon attacks. */
function fight(g: Game, rounds = 400) {
  const turns: Record<string, number> = {};
  for (let step = 0; step < rounds && g.s.phase === 'combat'; step++) {
    g.takeMoves();
    if (g.isMonsterTurn()) { monstersAct(g); continue; }
    const c = g.char(g.current()!.id);
    const foe = () => g.s.monsters.filter((m) => m.alive).sort((a, b) => cheb(a, c) - cheb(b, c))[0];
    if (foe() && cheb(foe(), c) > 1) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (tryDo(() => g.move('p1', c.id, foe().x + dx, foe().y + dy))) break;
    }
    const use = (id: string) => {
      if (g.s.phase !== 'combat' || g.current()?.id !== c.id || !foe()) return false;
      const ab = ABILITIES[id];
      const hurt = g.s.characters.filter((a) => !a.dead).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      return tryDo(() => g.useAbility('p1', c.id, id, ab.target === 'enemy' ? foe().id : ab.target === 'ally' ? hurt.id : undefined));
    };
    const strike = () => { for (let i = 0; i < 6 && g.s.phase === 'combat' && g.current()?.id === c.id && foe(); i++) if (!tryDo(() => g.attack('p1', c.id, foe().id))) break; };
    // Free powers first, then one bonus action and one action, starting with a different button every turn.
    const turn = (turns[c.id] = (turns[c.id] ?? 0) + 1);
    const rotated = (ids: string[]) => ids.map((_, i) => ids[(i + turn) % ids.length]);
    const mine = c.abilityIds.filter((id) => id !== 'dodge' && id !== 'revert_form');
    for (const id of mine.filter((x) => ABILITIES[x].free)) use(id);
    for (const id of rotated(mine.filter((x) => ABILITIES[x].bonusAction))) if (use(id)) break;
    if (turn % 2) strike();
    for (const id of rotated(mine.filter((x) => !ABILITIES[x].free && !ABILITIES[x].bonusAction))) if (use(id) && g.s.combat?.actionUsed) break;
    strike();
    for (const x of g.s.characters) {
      expect(x.hp).toBeGreaterThanOrEqual(0);
      expect(x.mana).toBeGreaterThanOrEqual(0);
      expect(x.tempHp ?? 0).toBeGreaterThanOrEqual(0);
      for (const r of Object.keys(x.uses ?? {})) if (RESOURCES[r]) expect(resourceLeft(x, r), `${x.classId} ${r}`).toBeGreaterThanOrEqual(0);
    }
    if (g.s.phase === 'combat' && g.current()?.id === c.id) g.endTurn('p1', c.id);
  }
}

describe('the twelve classes', () => {
  it('describes every feature, option and resource in both languages', () => {
    const missing: string[] = [];
    const need = (...xs: string[]) => xs.forEach((x) => { if (!hasTranslation('de', x)) missing.push(x); });
    for (const id of CLASS_IDS) for (const f of CLASS_FEATURES[id]) { need(f.name, featureLine(f)); expect(f.text.de.trim(), f.id).not.toBe(''); }
    for (const o of Object.values(OPTIONS)) { need(o.name, optionLine(o)); expect(GROUPS[o.group], o.id).toBeTruthy(); }
    for (const g of Object.values(GROUPS)) need(g.name);
    for (const r of Object.values(RESOURCES)) need(r.name);
    expect(missing).toEqual([]);
    for (const id of CLASS_IDS) for (const r of CHOICES[id]) expect(GROUPS[r.group], `${id} ${r.group}`).toBeTruthy();
  });

  it.each(CLASS_IDS)('takes a %s from level 1 to 20 with every choice made', (classId) => {
    const g = party([classId]);
    const c = g.s.characters[0];
    expect(c.pending).toEqual([]);
    for (let level = 2; level <= MAX_LEVEL; level++) {
      const hp = c.maxHp;
      raise(g, level);
      expect(c.level).toBe(level);
      expect(c.maxHp).toBeGreaterThan(hp);
      expect(c.maxMana).toBe(maxManaOf(c));
      expect(new Set(c.abilityIds).size, 'no action twice').toBe(c.abilityIds.length);
      for (const id of c.abilityIds) expect(ABILITIES[id], id).toBeTruthy();
      for (const [group, granted] of Object.entries(grantedChoices(classId, level))) {
        expect(chosenIn(c, group), `${group} at level ${level}`).toBeLessThanOrEqual(granted.count);
      }
    }
    expect(c.subclass).toBeTruthy();
    expect(c.abilities[saveProfs(c)[0]]).toBeGreaterThan(0);
    // Every feature of the class is on the sheet once, in its final form.
    const lines = CLASS_FEATURES[classId].filter((f) => hasFeature(c, f.id)).map((f) => f.name);
    for (const name of lines) expect(c.features.filter((f) => f.startsWith(`${name}:`)).length, name).toBe(1);
    // The pick at level 19 is an epic boon.
    expect(c.feats.some((f) => f.startsWith('boon_'))).toBe(true);
    for (const r of Object.values(RESOURCES)) expect(resourceLeft(c, r.id)).toBe(resourceMax(c, r.id));
  });

  it.each([1, 3, 5, 11, 20])('fights with every class at level %i without tripping', (level) => {
    for (const classes of [CLASS_IDS.slice(0, 4), CLASS_IDS.slice(4, 8), CLASS_IDS.slice(8, 12)]) {
      const g = party(classes, 7 + level);
      raise(g, level);
      const foes = level >= 11 ? [{ defId: 'ogre', count: 3 }, { defId: 'zombie', count: 3 }] : [{ defId: 'goblin', count: 3 }, { defId: 'skeleton', count: 2 }];
      g.startEncounter(foes, { source: 'story', context: 'test', light: 'bright' });
      fight(g);
      // Whatever the fight left behind, a night's sleep puts right.
      if (g.s.phase === 'explore') {
        g.longRest();
        for (const c of g.s.characters.filter((x) => !x.dead)) {
          expect(c.hp).toBe(c.maxHp);
          expect(c.mana).toBe(c.maxMana);
          expect(c.form ?? null).toBeNull();
          for (const r of Object.values(RESOURCES)) expect(resourceLeft(c, r.id), `${c.classId} ${r.id}`).toBe(resourceMax(c, r.id));
        }
      }
    }
  });
});

/** An open room, 22 by 13, walled all round. */
const ROOM = Array.from({ length: 13 }, (_, y) => (y === 0 || y === 12 ? '#'.repeat(22) : `#${'.'.repeat(20)}#`));

/** One hero of a class and level next to one tough monster, with the hero to act. */
function duel(classId: ClassId, level: number, monster = 'ogre', seed = 5) {
  const g = party([classId], seed);
  raise(g, level);
  g.startEncounter([{ defId: monster, count: 1 }], { source: 'story', context: 'test', setting: 'dungeon', light: 'bright' });
  g.s.rows = [...ROOM];
  g.s.lights = [];
  const c = g.s.characters[0], m = g.s.monsters[0];
  c.x = 5; c.y = 6; m.x = 6; m.y = 6;
  m.hp = m.maxHp = 2000;
  myTurn(g, c);
  return { g, c, m };
}

function myTurn(g: Game, c: Character) {
  const combat = g.s.combat!;
  combat.turnIndex = combat.order.findIndex((o) => o.id === c.id);
  combat.movementLeft = 6;
  combat.actionUsed = false;
  combat.bonusUsed = false;
  combat.attacksLeft = 0;
  combat.once = [];
}

const since = (g: Game, n: number) => g.s.log.slice(n).map((l) => l.text).join('\n');
/** Attack on fresh turns until the log shows what we are waiting for. */
function strikeUntil(g: Game, c: Character, m: { id: string }, what: RegExp, before?: () => void) {
  const n = g.s.log.length;
  for (let i = 0; i < 60 && !what.test(since(g, n)); i++) { myTurn(g, c); before?.(); tryDo(() => g.attack('p1', c.id, m.id)); }
  expect(since(g, n)).toMatch(what);
}

describe('class features in a fight', () => {
  it('lets a barbarian rage: fewer rages left, more damage, half damage from weapons, no spells', () => {
    const { g, c, m } = duel('barbarian', 3);
    const rages = resourceLeft(c, 'rage');
    g.useAbility('p1', c.id, 'rage');
    expect(c.conditions).toContain('raging');
    expect(resourceLeft(c, 'rage')).toBe(rages - 1);
    expect(g.s.combat!.bonusUsed).toBe(true);
    expect(() => g.useAbility('p1', c.id, 'rage')).toThrow(GameError);
    const hp = c.hp = c.maxHp;
    const n = g.s.log.length;
    for (let i = 0; i < 40 && c.hp === hp; i++) g.monsterAct(m.id);
    expect(since(g, n)).toMatch(/bludgeoning damage \(resisted, halved\)/);
    // The rage ends with the fight.
    m.hp = 1;
    strikeUntil(g, c, m, /slain/);
    expect(c.conditions).not.toContain('raging');
  });

  it('adds Sneak Attack once a turn, and Uncanny Dodge halves a hit', () => {
    const { g, c, m } = duel('rogue', 5);
    g.useAbility('p1', c.id, 'steady_aim');
    strikeUntil(g, c, m, /Sneak Attack/, () => tryDo(() => g.useAbility('p1', c.id, 'steady_aim')));
    c.hp = c.maxHp;
    const n = g.s.log.length;
    for (let i = 0; i < 40 && !/halves the blow/.test(since(g, n)); i++) { g.s.combat!.reacted = []; c.hp = c.maxHp; g.monsterAct(m.id); }
    expect(since(g, n)).toMatch(/halves the blow/);
  });

  it('turns a druid into a wolf and back', () => {
    const { g, c, m } = duel('druid', 3);
    const ac = c.ac;
    g.useAbility('p1', c.id, 'wild_shape_wolf');
    expect(c.form).toBe('wolf');
    expect(c.ac).toBe(12);
    expect(c.speed).toBe(40);
    expect(c.tempHp).toBe(3);
    expect(() => g.useAbility('p1', c.id, 'produce_flame', m.id)).toThrow(/beast form/);
    strikeUntil(g, c, m, /Bite/);
    myTurn(g, c);
    g.useAbility('p1', c.id, 'revert_form');
    expect(c.form ?? null).toBeNull();
    expect(c.ac).toBe(ac);
  });

  it('spends a monk\'s focus on a flurry and stuns with a strike', () => {
    const { g, c, m } = duel('monk', 5);
    const focus = resourceLeft(c, 'focus');
    g.attack('p1', c.id, m.id);
    g.useAbility('p1', c.id, 'flurry_of_blows', m.id);
    expect(resourceLeft(c, 'focus')).toBe(focus - 1);
    const n = g.s.log.length;
    for (let i = 0; i < 80 && !m.conditions.includes('stunned'); i++) {
      myTurn(g, c);
      (c.uses ??= {}).focus = 0;
      tryDo(() => g.useAbility('p1', c.id, 'stunning_strike'));
      tryDo(() => g.attack('p1', c.id, m.id));
    }
    expect(m.conditions).toContain('stunned');
    expect(since(g, n)).toMatch(/Stunning Strike/);
    // A stunned monster loses its turn.
    const hp = c.hp, at = { x: m.x, y: m.y };
    g.monsterAct(m.id);
    expect(c.hp).toBe(hp);
    expect({ x: m.x, y: m.y }).toEqual(at);
  });

  it('heals with Lay on Hands from a pool and smites after a hit', () => {
    const { g, c, m } = duel('paladin', 2);
    expect(resourceMax(c, 'lay_on_hands')).toBe(10);
    c.hp = 1;
    g.useAbility('p1', c.id, 'lay_on_hands', c.id);
    expect(c.hp).toBe(11);
    expect(resourceLeft(c, 'lay_on_hands')).toBe(0);
    expect(() => g.useAbility('p1', c.id, 'lay_on_hands', c.id)).toThrow(GameError);
    myTurn(g, c);
    expect(() => g.useAbility('p1', c.id, 'divine_smite')).toThrow(/melee hit/);
    const mana = c.mana;
    const n = g.s.log.length;
    for (let i = 0; i < 60 && !/smites/.test(since(g, n)); i++) { myTurn(g, c); tryDo(() => g.attack('p1', c.id, m.id)); tryDo(() => g.useAbility('p1', c.id, 'divine_smite')); }
    expect(since(g, n)).toMatch(/smites .* radiant/);
    // The first smite of the day is free.
    expect(c.mana).toBe(mana);
    expect(resourceLeft(c, 'free_smite')).toBe(0);
  });

  it('marks prey for a ranger and hexes for a warlock', () => {
    const r = duel('ranger', 3);
    r.g.useAbility('p1', r.c.id, 'hunters_mark', r.m.id);
    expect(r.c.mark).toMatchObject({ monsterId: r.m.id, spell: 'hunters_mark' });
    expect(r.c.mana).toBe(r.c.maxMana);
    strikeUntil(r.g, r.c, r.m, /Hunter's Mark/);
    const w = duel('warlock', 3);
    const mana = w.c.mana;
    w.g.useAbility('p1', w.c.id, 'hex', w.m.id);
    expect(w.c.mana).toBe(mana - 2);
    const n = w.g.s.log.length;
    for (let i = 0; i < 60 && !/necrotic/.test(since(w.g, n)); i++) { myTurn(w.g, w.c); tryDo(() => w.g.useAbility('p1', w.c.id, 'eldritch_blast', w.m.id)); }
    expect(since(w.g, n)).toMatch(/force damage \+ \d+ necrotic damage/);
  });

  it('gives a warlock the mana back on a short rest, and a sorcerer metamagic to choose', () => {
    const w = party(['warlock']);
    raise(w, 3);
    const c = w.s.characters[0];
    c.mana = 0;
    w.shortRest();
    expect(c.mana).toBe(c.maxMana);

    const g = party(['sorcerer']);
    const s = g.s.characters[0];
    g.grantXp(300, 'a test');
    const pick = s.pending.find((p) => p.kind === 'option')!;
    expect(pick).toMatchObject({ group: 'metamagic', count: 2 });
    expect(() => g.choose('p1', s.id, pick.id, { options: ['meta_quickened'] })).toThrow(GameError);
    expect(() => g.choose('p1', s.id, pick.id, { options: ['meta_quickened', 'inv_armor'] })).toThrow(GameError);
    expect(s.options).toEqual([]);
    g.choose('p1', s.id, pick.id, { options: ['meta_quickened', 'meta_empowered'] });
    expect(s.options).toEqual(['meta_quickened', 'meta_empowered']);
    expect(s.abilityIds).toEqual(expect.arrayContaining(['meta_quickened', 'meta_empowered', 'font_of_magic']));
    expect(s.features.some((f) => f.startsWith('Quickened Spell:'))).toBe(true);
    expect(resourceMax(s, 'sorcery')).toBe(2);
  });

  it('casts a quickened spell as a bonus action', () => {
    const { g, c, m } = duel('sorcerer', 3);
    if (!c.options!.includes('meta_quickened')) c.options!.push('meta_quickened');
    if (!c.abilityIds.includes('meta_quickened')) c.abilityIds.push('meta_quickened');
    const cantrip = c.abilityIds.find((id) => ABILITIES[id].spellLevel === 0 && ABILITIES[id].target === 'enemy')!;
    const points = resourceLeft(c, 'sorcery');
    g.useAbility('p1', c.id, 'meta_quickened');
    expect(resourceLeft(c, 'sorcery')).toBe(points - 2);
    g.useAbility('p1', c.id, cantrip, m.id);
    expect(g.s.combat!.bonusUsed).toBe(true);
    expect(g.s.combat!.actionUsed).toBe(false);
    g.useAbility('p1', c.id, cantrip, m.id);
    expect(g.s.combat!.actionUsed).toBe(true);
  });

  it('inspires an ally, and a cleric turns the undead', () => {
    const g = party(['bard', 'fighter']);
    g.startEncounter([{ defId: 'goblin', count: 1 }], { source: 'story', context: 'test', light: 'bright' });
    const [bard, fighter] = g.s.characters;
    myTurn(g, bard);
    g.useAbility('p1', bard.id, 'bardic_inspiration', fighter.id);
    expect(fighter.inspired).toBe(6);
    expect(() => g.useAbility('p1', bard.id, 'bardic_inspiration', bard.id)).toThrow(GameError);

    const { g: h, c, m } = duel('cleric', 2, 'zombie');
    const n = h.s.log.length;
    for (let i = 0; i < 30 && !m.conditions.includes('turned'); i++) { myTurn(h, c); (c.uses ??= {}).channel = 0; h.useAbility('p1', c.id, 'turn_undead'); }
    expect(m.conditions).toContain('turned');
    expect(since(h, n)).toMatch(/Turn Undead/);
    const ogre = duel('cleric', 2, 'ogre');
    expect(() => ogre.g.useAbility('p1', ogre.c.id, 'turn_undead')).toThrow(/no undead/);
  });

  it('keeps an old save playable: features, resources and choices are filled in on load', () => {
    const g = party(['fighter', 'rogue', 'wizard', 'cleric']);
    raise(g, 3);
    const save = JSON.parse(JSON.stringify(g.s));
    for (const c of save.characters) { delete c.uses; delete c.options; delete c.tempHp; delete c.form; delete c.mark; c.features = c.features.slice(0, 2); }
    const loaded = new Game('test', seeded(1), save);
    for (const c of loaded.s.characters) {
      expect(c.uses).toEqual({});
      expect(c.features.length).toBeGreaterThan(3);
      expect(c.maxMana).toBe(maxManaOf(c));
    }
    // The cleric of an old save never chose a Divine Order: the choice is waiting.
    expect(loaded.s.characters[3].pending).toMatchObject([{ kind: 'option', group: 'order', count: 1 }]);
  });
});

