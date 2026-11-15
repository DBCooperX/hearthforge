import { describe, expect, it } from 'vitest';
import { ABILITIES, ITEMS } from '../../shared/content';
import { hasTranslation, tr } from '../../shared/i18n';
import { MAGIC_ITEM_ROWS } from '../../shared/magicItemTable';
import { SRD_MAGIC_ITEMS } from '../../shared/magicItems';
import { SPELL_BUFFS } from '../../shared/spells';
import { XP_THRESHOLDS, type Character, type SlotId } from '../../shared/types';
import { itemRulesText } from '../src/dm/context';
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

function party(classId: 'fighter' | 'wizard' | 'monk' = 'fighter', level = 5) {
  const g = new Game('test', seeded(5));
  g.upsertPlayer('p1', 'Tester', true);
  g.addCharacter('p1', classId, '');
  g.start();
  g.grantXp(XP_THRESHOLDS[level - 1] - g.s.characters[0].xp, 'a test');
  const c = g.s.characters[0];
  c.pending = [];
  return { g, c };
}

/** Put an item in the bag and wear it. */
function wear(g: Game, c: Character, id: string, slot: SlotId) {
  g.grantItem(c.id, id, 1);
  const index = c.bag.findIndex((b) => b?.defId === id);
  g.invMove('p1', c.id, { type: 'bag', index }, { type: 'slot', slot });
}

function takeOff(g: Game, c: Character, slot: SlotId) {
  g.invMove('p1', c.id, { type: 'slot', slot }, { type: 'bag', index: c.bag.findIndex((b) => b === null) });
}

describe('the magic item table', () => {
  it('covers every magic item of the SRD, in German too', () => {
    expect(Object.keys(SRD_MAGIC_ITEMS).length).toBe(239);
    expect(MAGIC_ITEM_ROWS.map((r) => r[0]).sort()).toEqual(Object.keys(SRD_MAGIC_ITEMS).sort());
    const named = Object.values(ITEMS).filter((d) => d.srd || d.base);
    expect(named.length).toBeGreaterThan(300);
    expect(named.flatMap((d) => [d.name, d.description]).filter((x) => !hasTranslation('de', x))).toEqual([]);
    for (const d of named) {
      if (d.casts) expect(ABILITIES[d.casts.spell], d.id).toBeDefined();
      if (d.consumable?.buff) expect(SPELL_BUFFS[d.consumable.buff], d.id).toBeDefined();
      if (d.srd) expect(itemRulesText(d.srd).length, d.id).toBeGreaterThan(20);
    }
    expect(ITEMS.ring_protection.srd).toBe('ring_of_protection');
  });

  it('makes +1 to +3 versions of every weapon, armor and shield', () => {
    expect(ITEMS.greataxe_plus2.weapon?.bonus).toBe(2);
    expect(ITEMS.greataxe_plus2.rarity).toBe('rare');
    expect(ITEMS.plate_plus1.armor?.baseAc).toBe(19);
    expect(ITEMS.shield_plus3.acBonus).toBe(5);
    expect(ITEMS.longsword_plus1.description).toMatch(/hums/);
    expect(tr('de', ITEMS.greataxe_plus2.name)).toBe('Zweihandaxt +2');
    expect(tr('de', ITEMS.belt_of_giant_strength.name)).toBe('Gürtel der Riesenstärke');
  });
});

describe('magic items in play', () => {
  it('raises Strength with a Belt of Giant Strength while it is worn', () => {
    const { g, c } = party();
    const str = c.abilities.str;
    wear(g, c, 'belt_of_giant_strength', 'waist');
    expect(c.abilities.str).toBe(21);
    takeOff(g, c, 'waist');
    expect(c.abilities.str).toBe(str);
  });

  it('raises the hit point maximum with an Amulet of Health', () => {
    const { g, c } = party();
    const max = c.maxHp;
    const con = c.abilities.con;
    wear(g, c, 'amulet_of_health', 'amulet');
    expect(c.abilities.con).toBe(Math.max(19, con));
    expect(c.maxHp).toBe(max + (Math.floor((19 - 10) / 2) - Math.floor((con - 10) / 2)) * c.level);
    takeOff(g, c, 'amulet');
    expect(c.maxHp).toBe(max);
  });

  it('allows three attuned items at a time', () => {
    const { g, c } = party();
    wear(g, c, 'belt_of_giant_strength', 'waist');
    wear(g, c, 'amulet_of_health', 'amulet');
    wear(g, c, 'cloak_of_displacement', 'cloak');
    expect(() => wear(g, c, 'gauntlets_of_ogre_power', 'hands')).toThrow(GameError);
    // Taking one off frees the bond for another.
    takeOff(g, c, 'cloak');
    g.invMove('p1', c.id, { type: 'bag', index: c.bag.findIndex((b) => b?.defId === 'gauntlets_of_ogre_power') }, { type: 'slot', slot: 'hands' });
    expect(c.abilities.str).toBe(21);
  });

  it('gives resistance and darkvision while worn, and armor class to an unarmored monk', () => {
    const { g, c } = party('monk');
    wear(g, c, 'ring_of_warmth', 'ring');
    expect(c.resist).toContain('cold');
    wear(g, c, 'goggles_of_night', 'head');
    expect(g.heroSenses(c).darkvision).toBeGreaterThanOrEqual(60);
    const ac = c.ac;
    wear(g, c, 'bracers_of_defense', 'hands');
    expect(c.ac).toBe(ac + 2);
  });

  it('fires a Wand of Fireballs without mana, until its charges run out', () => {
    const { g, c } = party('fighter', 5);
    g.grantItem(c.id, 'wand_of_fireballs', 1);
    const wand = c.bag.find((b) => b?.defId === 'wand_of_fireballs')!;
    g.startEncounter([{ defId: 'goblin', count: 2 }], { source: 'story', context: 'test', setting: 'dungeon', light: 'bright' });
    const combat = g.s.combat!;
    for (const m of g.s.monsters) { m.hp = m.maxHp = 500; m.x = c.x + 3; m.y = c.y; }
    combat.turnIndex = combat.order.findIndex((o) => o.id === c.id);
    combat.actionUsed = false;
    const n = g.s.log.length;
    g.useItem('p1', c.id, wand.uid, g.s.monsters[0].id);
    expect(wand.used).toBe(1);
    expect(g.s.log.slice(n).map((l) => l.text).join('\n')).toMatch(/Wand of Fireballs[\s\S]*vs DC 15/);
    expect(g.s.monsters.some((m) => m.hp < 500)).toBe(true);
    wand.used = 7;
    combat.actionUsed = false;
    expect(() => g.useItem('p1', c.id, wand.uid, g.s.monsters[0].id)).toThrow(/charges/);
  });

  it('hastes a hero with a Potion of Speed', () => {
    const { g, c } = party();
    g.grantItem(c.id, 'potion_of_speed', 1);
    const speed = c.speed;
    g.useItem('p1', c.id, c.bag.find((b) => b?.defId === 'potion_of_speed')!.uid);
    expect(c.conditions).toContain(SPELL_BUFFS.haste.chip);
    expect(c.speed).toBeGreaterThan(speed);
    expect(c.bag.some((b) => b?.defId === 'potion_of_speed')).toBe(false);
  });

  it('burns with a Flame Tongue', () => {
    const { g, c } = party();
    wear(g, c, 'flame_tongue', 'mainHand');
    g.startEncounter([{ defId: 'ogre', count: 1 }], { source: 'story', context: 'test', setting: 'dungeon', light: 'bright' });
    const m = g.s.monsters[0];
    m.hp = m.maxHp = 5000;
    let burned = false;
    for (let i = 0; i < 30 && !burned; i++) {
      const combat = g.s.combat!;
      combat.turnIndex = combat.order.findIndex((o) => o.id === c.id);
      combat.actionUsed = false; combat.attacksLeft = 0;
      m.x = c.x + 1; m.y = c.y;
      const n = g.s.log.length;
      g.attack('p1', c.id, m.id);
      burned = /Flame Tongue/.test(g.s.log.slice(n).map((l) => l.text).join('\n'));
    }
    expect(burned).toBe(true);
  });
});
