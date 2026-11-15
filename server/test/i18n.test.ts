import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABILITIES, ABILITY_NAMES, CLASS_INFO, ITEMS, SKILLS, SLOT_LABELS } from '../../shared/content';
import { COMPASS, TERRAIN, formatHours, formatTime } from '../../shared/hex';
import { classLabel, hasTranslation, tagged, tr } from '../../shared/i18n';
import { DE } from '../../shared/i18n-de';
import { DISPOSITIONS, LOCATION_KINDS, MOODS } from '../../shared/types';
import { CLASSES } from '../src/data/classes';
import { MONSTERS } from '../src/data/monsters';
import { SEED_LOCATIONS, SEED_NPCS, SEED_QUESTS } from '../src/data/world';
import { DM_SYSTEM_PROMPT, describeCombat, describeWorld, genderRoster } from '../src/dm/context';
import { scriptedScene } from '../src/dm/scripted';
import { Game, GameError } from '../src/game/engine';

const root = join(__dirname, '..', '..');

function files(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);
}

function germanGame() {
  const g = new Game('test', () => 0.42);
  g.upsertPlayer('host', 'Chris', true);
  g.upsertPlayer('guest', 'Mira', true);
  g.setLanguage('host', 'de');
  g.addCharacter('host', 'fighter', '');
  g.addCharacter('guest', 'cleric', '');
  return g;
}

describe('translations', () => {
  it('fills placeholders and falls back to English', () => {
    expect(tr('de', 'Round {n}', { n: 3 })).toBe('Runde 3');
    expect(tr('en', 'Round {n}', { n: 3 })).toBe('Round 3');
    expect(tr('de', 'No such sentence {n}', { n: 1 })).toBe('No such sentence 1');
    expect(tagged('de')`${'Brann'} hands ${'Dolch'} to ${'Vex'}.`).toBe('Brann übergibt Dolch an Vex.');
    expect(tagged('en')`${'Brann'} hands ${'Dagger'} to ${'Vex'}.`).toBe('Brann hands Dagger to Vex.');
    expect(formatTime(1440 + 90, 'de')).toBe('Tag 2, 01:30');
    expect(formatHours(50, 'de')).toBe('2 Tage 2 h');
  });

  it('keeps every placeholder in the German text', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort().join();
    for (const [en, de] of Object.entries(DE)) expect(placeholders(de), en).toBe(placeholders(en));
  });

  it('has German for every string the interface asks for', () => {
    const missing: string[] = [];
    for (const f of files('client/src')) {
      const src = readFileSync(join(root, f), 'utf8');
      for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) {
        const key = m[1].replace(/\\'/g, "'");
        if (!hasTranslation('de', key)) missing.push(`${f}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('has German for every game term', () => {
    const terms = new Set<string>();
    const add = (...xs: (string | undefined)[]) => xs.forEach((x) => x && terms.add(x));
    for (const i of Object.values(ITEMS)) { add(i.name, i.description, i.kind, i.rarity); if (i.weapon) add(`${i.weapon.damageType} damage`); }
    for (const a of Object.values(ABILITIES)) { add(a.name, a.description); if (a.damageType) add(`${a.damageType} damage`); }
    for (const c of Object.values(CLASS_INFO)) add(c.name, c.blurb);
    for (const c of Object.values(CLASSES)) { add(c.name); for (const g of Object.values(c.levels)) add(...(g.features ?? [])); }
    add('Sneak Attack: 1d6');
    add(...Object.values(SLOT_LABELS), ...Object.keys(SKILLS), ...Object.values(ABILITY_NAMES), ...Object.keys(ABILITY_NAMES).map((k) => k.toUpperCase()));
    for (const m of Object.values(MONSTERS)) { add(m.name, m.description); for (const a of m.attacks) add(a.name, `${a.damageType} damage`); }
    for (const t of Object.values(TERRAIN)) add(t.name);
    add(...COMPASS, ...DISPOSITIONS, ...LOCATION_KINDS, ...MOODS, 'active', 'completed', 'failed', 'advantage', 'disadvantage');
    for (const l of SEED_LOCATIONS) { add(l.name, l.description); for (const s of l.stages ?? []) add(s.name, s.description); }
    for (const n of SEED_NPCS) add(n.name, n.role, n.description);
    for (const q of SEED_QUESTS) add(q.title, q.summary);
    expect([...terms].filter((t) => !hasTranslation('de', t))).toEqual([]);
  });
});

describe('session language', () => {
  it('only lets the host choose it, and keeps it across a new adventure', () => {
    const g = germanGame();
    expect(() => g.setLanguage('guest', 'en')).toThrow(GameError);
    expect(() => g.setLanguage('host', 'fr')).toThrow(GameError);
    expect(g.publicState({ busy: false, mode: 'scripted', model: null })).toMatchObject({ language: 'de', hostId: 'host' });
    g.reset();
    expect(g.lang).toBe('de');
  });

  it('tells the story in German', () => {
    const g = germanGame();
    g.start();
    const log = g.s.log.map((l) => l.text).join('\n');
    expect(log).toContain('Das Abenteuer beginnt.');
    expect(g.place()?.name).toBe('Glutfall');
    expect(g.s.memory.quests[0].title).toBe('Bringt den Bau zum Schweigen');
    const scene = scriptedScene(g, [{ kind: 'start' }]);
    expect(scene?.text).toContain('Glutfalltal');
    expect(scene?.actions).toContain('Sich umsehen');
    expect(describeWorld(g)).toContain('This table plays in German');

    g.startEncounter([{ defId: 'giant_rat', count: 2 }], { source: 'story', context: 'test' });
    expect(g.s.monsters[0].name).toMatch(/^Riesenratte/);
    expect(g.s.log.map((l) => l.text).join('\n')).toMatch(/Kampf! Initiative: .*Riesenratte 1/);
  });

  it('stays English by default', () => {
    const g = new Game('test', () => 0.42);
    g.upsertPlayer('p', 'Tester', true);
    g.addCharacter('p', 'fighter', '');
    g.start();
    expect(g.s.log.map((l) => l.text).join('\n')).toContain('The adventure begins.');
    expect(g.place()?.name).toBe('Emberfall');
    expect(describeWorld(g)).not.toContain('German');
  });
});

describe('hero gender', () => {
  it('gives premade heroes a fixed gender and leaves made-up names neutral', () => {
    const g = new Game('test', () => 0.42);
    g.upsertPlayer('p', 'Chris', true);
    const elowen = g.addCharacter('p', 'wizard', '');
    const brann = g.addCharacter('p', 'fighter', '');
    const custom = g.addCharacter('p', 'rogue', 'Quill');
    expect([elowen.name, elowen.gender]).toEqual(['Elowen', 'female']);
    expect([brann.name, brann.gender]).toEqual(['Brann', 'male']);
    expect(custom.gender).toBe('neutral');
  });

  it('fills in the gender of heroes saved before it existed', () => {
    const g = new Game('test', () => 0.42);
    g.upsertPlayer('p', 'Chris', true);
    g.addCharacter('p', 'wizard', '');
    g.addCharacter('p', 'rogue', 'Quill');
    const saved = JSON.parse(JSON.stringify(g.s));
    for (const c of saved.characters) delete c.gender;
    const loaded = new Game('test', () => 0.42, saved);
    expect(loaded.s.characters.map((c) => c.gender)).toEqual(['female', 'neutral']);
  });

  it('tells the Dungeon Master every turn, with the German forms at a German table', () => {
    const g = germanGame();
    g.addCharacter('host', 'wizard', '');
    g.addCharacter('host', 'rogue', 'Quill');
    g.start();
    const world = describeWorld(g);
    expect(world).toContain('Elowen');
    expect(world).toContain('female, she/her (German: sie/ihr, "die Magierin")');
    expect(world).toContain('male, he/him (German: er/ihm, "der Kämpfer")');
    expect(world).toMatch(/Quill.*gender not specified/);
    g.startEncounter([{ defId: 'giant_rat', count: 1 }], { source: 'story', context: 'test' });
    expect(describeCombat(g)).toContain('"die Magierin"');
    expect(genderRoster(g)).toContain('Elowen: female');
    expect(classLabel('de', 'Wizard', 'female')).toBe('Magierin');
    expect(classLabel('de', 'Wizard', 'male')).toBe('Magier');
    expect(classLabel('en', 'Wizard', 'female')).toBe('Wizard');
  });

  it('instructs the Dungeon Master not to echo the player or guess a gender', () => {
    expect(DM_SYSTEM_PROMPT).toContain('never quote, repeat or paraphrase what they just said or did');
    expect(DM_SYSTEM_PROMPT).toContain('Never infer it from a name');
  });
});
