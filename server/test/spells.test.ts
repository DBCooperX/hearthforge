import { describe, expect, it } from 'vitest';
import { SLOT_COST, maxSpellLevelFor } from '../../shared/classes';
import { ABILITIES } from '../../shared/content';
import { hasTranslation, tr } from '../../shared/i18n';
import { SPELL_LISTS } from '../../shared/rules';
import { SPELLS, SPELL_BUFFS, SRD_SPELLS, castLevel } from '../../shared/spells';
import { SPELL_ROWS } from '../../shared/spellTable';
import { XP_THRESHOLDS, type Character, type ClassId } from '../../shared/types';
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

const ROOM = Array.from({ length: 13 }, (_, y) => (y === 0 || y === 12 ? '#'.repeat(22) : `#${'.'.repeat(20)}#`));

/** A party at a level, in a bare room with monsters, and the first hero to act. Spells are taught directly. */
function scene(classes: ClassId[], level: number, monsters: { defId: string; count: number }[], spells: string[] = [], seed = 7) {
  const g = new Game('test', seeded(seed));
  g.upsertPlayer('p1', 'Tester', true);
  for (const c of classes) g.addCharacter('p1', c, '');
  g.start();
  g.grantXp((XP_THRESHOLDS[level - 1] - g.s.characters[0].xp) * classes.length, 'a test');
  for (const c of g.s.characters) { c.pending = []; c.abilityIds.unshift(...spells); c.mana = c.maxMana; }
  g.startEncounter(monsters, { source: 'story', context: 'test', setting: 'dungeon', light: 'bright' });
  g.s.rows = [...ROOM];
  g.s.lights = [];
  g.s.characters.forEach((c, i) => { c.x = 4; c.y = 5 + i; });
  g.s.monsters.forEach((m, i) => { m.x = 8 + (i % 2); m.y = 5 + Math.floor(i / 2); m.hp = m.maxHp = 500; });
  const c = g.s.characters[0];
  myTurn(g, c);
  return { g, c };
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

describe('the spell table', () => {
  it('covers every spell of the SRD with a German name and text', () => {
    expect(Object.keys(SRD_SPELLS).length).toBe(339);
    const missing = Object.keys(SRD_SPELLS).filter((id) => !ABILITIES[id]);
    expect(missing).toEqual([]);
    const untranslated = SPELLS.flatMap((s) => [s.name, s.description]).filter((x) => !hasTranslation('de', x));
    expect(untranslated).toEqual([]);
    for (const b of Object.values(SPELL_BUFFS)) expect(hasTranslation('de', b.chip), b.chip).toBe(true);
    expect(new Set(SPELL_ROWS.map((r) => r[0])).size).toBe(SPELL_ROWS.length);
  });

  it('costs mana by spell level and gives every caster a spell for each level it reaches', () => {
    expect(ABILITIES.fireball.cost).toBe(SLOT_COST[2]);
    expect(ABILITIES.wish.cost).toBe(SLOT_COST[8]);
    for (const cls of ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard', 'paladin', 'ranger'] as ClassId[]) {
      const top = maxSpellLevelFor(cls, 20);
      for (let l = 1; l <= top; l++) expect(SPELL_LISTS[cls]?.[l]?.length ?? 0, `${cls} ${l}`).toBeGreaterThan(0);
    }
    expect(SPELL_LISTS.wizard![3]).toContain('fireball');
    expect(SPELL_LISTS.cleric![3]).toContain('spirit_guardians');
  });

  it('casts at a higher level only as far as the caster can reach', () => {
    expect(castLevel(ABILITIES.fireball, 9, 5)).toBe(5);
    expect(castLevel(ABILITIES.fireball, 1, 5)).toBe(3);
    expect(castLevel(ABILITIES.fire_bolt, 5, 5)).toBe(0);
    expect(ABILITIES.magic_missile.diceAt?.[3]).toBe('5d4+5');
    expect(tr('de', ABILITIES.fireball.description)).toMatch(/Feuerball|8W6/);
  });
});

describe('spells in a fight', () => {
  it('hurls a Fireball at a higher level: more mana, more dice, every goblin in the blast', () => {
    const { g, c } = scene(['wizard'], 9, [{ defId: 'goblin', count: 3 }], ['fireball']);
    const mana = c.mana;
    const n = g.s.log.length;
    g.useAbility('p1', c.id, 'fireball', g.s.monsters[0].id, 4);
    expect(c.mana).toBe(mana - SLOT_COST[3]);
    expect(since(g, n)).toMatch(/at level 4/);
    expect(g.s.monsters.every((m) => m.hp < 500 || !m.alive)).toBe(true);
  });

  it('holds a Bless on several allies, and drops it for another concentration spell', () => {
    const { g, c } = scene(['cleric', 'fighter', 'rogue'], 5, [{ defId: 'ogre', count: 1 }], ['bless', 'shield_of_faith']);
    g.useAbility('p1', c.id, 'bless', c.id);
    expect(g.s.characters.every((h) => h.conditions.includes('blessed'))).toBe(true);
    expect(c.conc?.spell).toBe('bless');
    myTurn(g, c);
    g.useAbility('p1', c.id, 'shield_of_faith', g.s.characters[1].id);
    expect(g.s.characters.some((h) => h.conditions.includes('blessed'))).toBe(false);
    expect(g.s.characters[1].conditions).toContain('shield of faith');
  });

  it('paralyses a humanoid with Hold Person, and refuses on a giant', () => {
    const { g, c } = scene(['wizard'], 5, [{ defId: 'bandit', count: 1 }, { defId: 'ogre', count: 1 }], ['hold_person']);
    const [bandit, ogre] = g.s.monsters;
    expect(() => g.useAbility('p1', c.id, 'hold_person', ogre.id)).toThrow(GameError);
    for (let i = 0; i < 30 && !bandit.conditions.includes('paralyzed'); i++) { myTurn(g, c); c.mana = c.maxMana; g.useAbility('p1', c.id, 'hold_person', bandit.id); }
    expect(bandit.conditions).toContain('paralyzed');
  });

  it('keeps Spiritual Weapon swinging for free on later turns', () => {
    const { g, c } = scene(['cleric'], 5, [{ defId: 'ogre', count: 1 }], ['spiritual_weapon']);
    const m = g.s.monsters[0];
    g.useAbility('p1', c.id, 'spiritual_weapon', m.id);
    const mana = c.mana;
    myTurn(g, c);
    g.useAbility('p1', c.id, 'spiritual_weapon', m.id);
    expect(c.mana).toBe(mana);
  });

  it('lets Spirit Guardians strike again at the start of the cleric\'s turn', () => {
    const { g, c } = scene(['cleric'], 5, [{ defId: 'ogre', count: 1 }], ['spirit_guardians']);
    const m = g.s.monsters[0];
    m.x = 5; m.y = 5;
    g.useAbility('p1', c.id, 'spirit_guardians', m.id);
    expect(c.zone?.spell).toBe('spirit_guardians');
    const n = g.s.log.length;
    g.endTurn('p1', c.id);
    for (let i = 0; i < 10 && g.current()?.id !== c.id && g.s.phase === 'combat'; i++) {
      const block = g.monsterBlock();
      for (const x of block) { x.x = 5; x.y = 5; }
      g.finishMonsterBlock(block);
    }
    expect(since(g, n)).toMatch(/strikes again/);
  });

  it('raises a Shield when it turns a hit into a miss', () => {
    const { g, c } = scene(['wizard'], 5, [{ defId: 'ogre', count: 1 }], ['shield']);
    const m = g.s.monsters[0];
    m.x = 5; m.y = 5;
    let raised = false;
    for (let i = 0; i < 80 && !raised; i++) {
      c.mana = c.maxMana; c.hp = c.maxHp;
      g.s.combat!.reacted = [];
      c.buffs = []; c.conditions = c.conditions.filter((x) => x !== 'shield spell'); c.ac = g.computeAc(c);
      const n = g.s.log.length;
      g.s.combat!.turnIndex = g.s.combat!.order.findIndex((o) => o.id === m.id);
      g.monsterAct(m.id);
      raised = /Shield spell/.test(since(g, n));
    }
    expect(raised).toBe(true);
    expect(c.conditions).toContain('shield spell');
  });

  it('brings a fallen ally back with Revivify', () => {
    const { g, c } = scene(['cleric', 'fighter'], 5, [{ defId: 'ogre', count: 1 }], ['revivify']);
    const f = g.s.characters[1];
    f.hp = 0; f.dead = true;
    g.useAbility('p1', c.id, 'revivify', f.id);
    expect(f.dead).toBe(false);
    expect(f.hp).toBe(1);
  });

  it('breaks concentration when the caster is knocked out', () => {
    const { g, c } = scene(['cleric', 'fighter'], 5, [{ defId: 'ogre', count: 1 }], ['bless']);
    g.useAbility('p1', c.id, 'bless', c.id);
    (g as unknown as { hurtHero: (c: Character, p: { amount: number; type: string }[]) => void }).hurtHero(c, [{ amount: 999, type: 'bludgeoning' }]);
    expect(c.conc).toBeNull();
    expect(g.s.characters[1].conditions).not.toContain('blessed');
  });
});

describe('spells outside a fight', () => {
  it('hands story spells to the Dungeon Master and casts rituals for free', () => {
    const g = new Game('test', seeded(3));
    g.upsertPlayer('p1', 'Tester', true);
    g.addCharacter('p1', 'wizard', '');
    g.start();
    const c = g.s.characters[0];
    c.abilityIds.unshift('detect_magic', 'comprehend_languages', 'mage_armor');
    g.takeBeats();
    const mana = c.mana;
    g.useAbility('p1', c.id, 'detect_magic');
    expect(c.mana).toBe(mana);
    expect(g.takeBeats().some((b) => b.kind === 'spell' && b.spellId === 'detect_magic')).toBe(true);
    g.useAbility('p1', c.id, 'mage_armor', c.id);
    expect(c.conditions).toContain('mage armor');
    expect(c.mana).toBe(mana - 2);
    expect(c.ac).toBeGreaterThanOrEqual(13);
  });
});
