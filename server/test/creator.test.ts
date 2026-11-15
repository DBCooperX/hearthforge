import { describe, expect, it } from 'vitest';
import { buildSheet, checkSpec, pointsSpent, POINT_BUDGET } from '../../shared/build';
import { PREMADES } from '../../shared/premades';
import { recommend } from '../../shared/recommend';
import { BACKGROUNDS, CLASSES, SPECIES } from '../../shared/rules';
import type { BackgroundId, CharacterSpec, ClassId, SpeciesId } from '../../shared/types';
import { describeWorld } from '../src/dm/context';
import { Game, GameError } from '../src/game/engine';

const CLASS_IDS = Object.keys(CLASSES) as ClassId[];
const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];
const BACKGROUND_IDS = Object.keys(BACKGROUNDS) as BackgroundId[];

function lobby() {
  const g = new Game('creator-test', () => 0.5);
  g.upsertPlayer('p1', 'Tester', true);
  return g;
}
const spec = (classId: ClassId, patch: Partial<CharacterSpec> = {}): CharacterSpec =>
  ({ ...recommend({ classId, ...patch }, Object.keys(patch) as (keyof CharacterSpec)[]), name: 'Testa', ...('gender' in patch ? {} : { gender: 'female' }) });

describe('character creator rules', () => {
  it('builds every premade hero without problems', () => {
    expect(PREMADES.length).toBeGreaterThanOrEqual(8);
    for (const p of PREMADES) {
      expect(checkSpec(p.spec), p.id).toEqual([]);
      const sheet = buildSheet(p.spec)!;
      expect(sheet.maxHp, p.id).toBeGreaterThan(0);
      expect(['female', 'male', 'neutral']).toContain(p.spec.gender);
    }
  });

  it('recommends a valid hero for every class, species and background', () => {
    for (const classId of CLASS_IDS) for (const speciesId of SPECIES_IDS) for (const backgroundId of BACKGROUND_IDS) {
      const s = recommend({ classId, speciesId, backgroundId });
      expect(checkSpec({ ...s, name: 'X' }), `${classId}/${speciesId}/${backgroundId}`).toEqual([]);
    }
  });

  it('rejects impossible choices', () => {
    const ok = spec('fighter');
    expect(checkSpec(ok)).toEqual([]);
    const steps = (s: Partial<CharacterSpec>) => checkSpec({ ...ok, ...s }).map((p) => p.step);
    expect(steps({ base: { str: 18, dex: 18, con: 18, int: 18, wis: 18, cha: 18 } })).toContain('abilities');
    expect(steps({ skills: ['arcana', 'religion'] })).toContain('skills');
    expect(steps({ skills: [ok.skills[0], ok.skills[0]] })).toContain('skills');
    expect(steps({ boosts: ['str', 'str', 'str'] })).toContain('abilities');
    expect(steps({ kit: 'no_such_kit' })).toContain('equipment');
    expect(steps({ fightingStyle: undefined })).toContain('talents');
    expect(checkSpec({ ...spec('wizard'), spells: ['cure_wounds'] }).length).toBeGreaterThan(0);
  });

  it('checks point buy against the budget', () => {
    const base = { str: 15, dex: 14, con: 15, int: 8, wis: 10, cha: 8 };
    expect(pointsSpent(base)).toBeLessThanOrEqual(POINT_BUDGET);
    expect(checkSpec(spec('fighter', { method: 'pointbuy', base }))).toEqual([]);
    const greedy = { str: 15, dex: 15, con: 15, int: 15, wis: 8, cha: 8 };
    expect(checkSpec(spec('fighter', { method: 'pointbuy', base: greedy })).map((p) => p.step)).toContain('abilities');
  });

  it('only accepts rolled scores that the server rolled', () => {
    const g = lobby();
    const rolled = g.rollAbilities('p1');
    expect(rolled).toHaveLength(6);
    for (const r of rolled) { expect(r).toBeGreaterThanOrEqual(3); expect(r).toBeLessThanOrEqual(18); }
    const keys = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
    const base = Object.fromEntries(keys.map((k, i) => [k, rolled[i]])) as CharacterSpec['base'];
    expect(() => g.createCharacter('p1', spec('fighter', { method: 'roll', base }))).not.toThrow();
    const cheat = { ...base, str: 18, dex: 18, con: 18 };
    expect(() => g.createCharacter('p1', spec('fighter', { method: 'roll', base: cheat }))).toThrow(GameError);
    expect(() => lobby().createCharacter('p1', spec('fighter', { method: 'roll', base }))).toThrow(GameError);
  });

  it('applies species, background and talents to the sheet', () => {
    const dwarf = buildSheet(spec('fighter', { speciesId: 'dwarf' }))!;
    const human = buildSheet(spec('fighter', { speciesId: 'human' }))!;
    expect(dwarf.maxHp).toBe(human.maxHp + 1);
    expect(dwarf.resist).toContain('poison');
    expect(human.feats.length).toBeGreaterThan(dwarf.feats.length);
    const base = spec('fighter');
    const defense = buildSheet({ ...base, fightingStyle: 'defense' })!;
    const dueling = buildSheet({ ...base, fightingStyle: 'dueling' })!;
    expect(defense.ac).toBe(dueling.ac + 1);
    const rogue = buildSheet(spec('rogue'))!;
    expect(rogue.expertise).toHaveLength(2);
    for (const s of BACKGROUNDS[spec('rogue').backgroundId].skills) expect(rogue.skills).toContain(s);
  });

  it('creates the hero on the server with the same numbers as the preview', () => {
    const g = lobby();
    const s = spec('wizard', { speciesId: 'elf', gender: 'male' });
    const sheet = buildSheet(s)!;
    const c = g.createCharacter('p1', { ...s, appearance: 'Silver hair', backstory: 'Left the academy in disgrace.' });
    expect(c).toMatchObject({ maxHp: sheet.maxHp, ac: sheet.ac, maxMana: sheet.maxMana, speed: sheet.speed, gender: 'male', speciesId: 'elf' });
    expect(c.abilities).toEqual(sheet.abilities);
    expect([...c.skills].sort()).toEqual([...sheet.skills].sort());
    expect(c.abilityIds).toEqual(sheet.abilityIds);
  });

  it('falls back to a neutral gender and tells the DM each hero\'s pronouns', () => {
    const g = lobby();
    g.createCharacter('p1', { ...spec('wizard'), name: 'Elowen', gender: 'female' });
    g.createCharacter('p1', { ...spec('fighter'), name: 'Ash', gender: 'banana' as never });
    expect(g.s.characters[1].gender).toBe('neutral');
    g.start();
    const text = describeWorld(g);
    expect(text).toMatch(/Elowen \[pc\d+\].*Gender: female, she\/her/);
    expect(text).toMatch(/Ash \[pc\d+\].*Gender: gender not specified/);
  });

  it('offers level-up choices and applies them', () => {
    const g = lobby();
    const w = g.createCharacter('p1', spec('wizard'));
    const f = g.createCharacter('p1', spec('fighter'));
    g.start();
    g.grantXp(2 * 2700, 'test');
    expect(w.level).toBe(4);
    expect(w.subclass).toBeTruthy();
    expect(f.subclass).toBeTruthy();
    const feat = f.pending.find((p) => p.kind === 'feat')!;
    expect(feat).toBeTruthy();
    const str = f.abilities.str, ac = f.ac;
    expect(() => g.choose('p2', f.id, feat.id, { feat: { id: 'asi', abilities: ['str', 'str'] } })).toThrow(GameError);
    expect(() => g.choose('p1', f.id, feat.id, { feat: { id: 'asi', abilities: ['str'] } })).toThrow(GameError);
    g.choose('p1', f.id, feat.id, { feat: { id: 'asi', abilities: ['str', 'con'] } });
    expect(f.abilities.str).toBe(str + 1);
    expect(f.ac).toBe(ac);
    expect(f.pending.find((p) => p.id === feat.id)).toBeUndefined();
    expect(() => g.choose('p1', f.id, feat.id, { feat: { id: 'alert' } })).toThrow(GameError);

    const spell = w.pending.find((p) => p.kind === 'spell')!;
    expect(spell).toBeTruthy();
    expect(() => g.choose('p1', w.id, spell.id, { spell: 'cure_wounds' })).toThrow(GameError);
    expect(() => g.choose('p1', w.id, spell.id, { spell: w.abilityIds[0] })).toThrow(GameError);
  });
});

describe('hero looks', () => {
  it('gives every premade its own picture', async () => {
    const { heroArtKey, heroGear, heroLook } = await import('../../shared/heroLook');
    const { ITEMS } = await import('../../shared/content');
    const keys = PREMADES.map((p) => {
      const eq = buildSheet(p.spec)!.equipment;
      const def = (id?: string | null) => (id ? ITEMS[id] : null);
      return heroArtKey({ speciesId: p.spec.speciesId, gender: p.spec.gender, classId: p.spec.classId, look: heroLook(p.spec), gear: heroGear(def(eq.armor), def(eq.mainHand), def(eq.offHand)) });
    });
    expect(new Set(keys).size).toBe(PREMADES.length);
  });

  it('stores a valid look on the hero and repairs a bad one', async () => {
    const { SPECIES_SKINS, heroLook } = await import('../../shared/heroLook');
    const g = lobby();
    const c = g.createCharacter('p1', { ...spec('fighter', { speciesId: 'orc' }), look: { skin: 'porcelain', hair: 'braid', hairColor: 'nope', beard: 'long', color: 'teal' } as never });
    expect(SPECIES_SKINS.orc).toContain(c.look.skin);
    expect(c.look).toMatchObject({ hair: 'braid', beard: 'long', color: 'teal' });
    expect(c.look.hairColor).not.toBe('nope');
    const saved = JSON.parse(JSON.stringify(g.s));
    delete saved.characters[0].look;
    expect(new Game('creator-test', () => 0.5, saved).s.characters[0].look).toEqual(heroLook({ ...c, look: undefined }));
  });

  it('reads the gear from what is equipped', async () => {
    const { heroGear } = await import('../../shared/heroLook');
    const { ITEMS } = await import('../../shared/content');
    expect(heroGear(ITEMS.chain_mail, ITEMS.longsword, ITEMS.shield)).toEqual({ armor: 'heavy', weapon: 'sword', shield: true });
    expect(heroGear(null, ITEMS.quarterstaff, null)).toEqual({ armor: 'none', weapon: 'staff', shield: false });
    expect(heroGear(ITEMS.leather, ITEMS.shortbow, null).weapon).toBe('bow');
    expect(heroGear(null, ITEMS.greatsword, null).weapon).toBe('greatsword');
  });
});
