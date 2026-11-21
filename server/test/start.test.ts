// Start options: the region, the premise and the seed a table's adventure is built from.
import { describe, expect, it } from 'vitest';
import { TERRAIN, findRoute, hexDistance, neighbors } from '../../shared/hex';
import { ITEMS } from '../../shared/content';
import { CLASSIC_START, PREMISES, hashSeed, newSeed, normalizeSeed, type StartOptions } from '../../shared/start';
import { MONSTERS } from '../src/data/monsters';
import { ERRANDS, MINOR_SITES, PREMISE_TEXT, SANCTUARIES, THEMES, THREATS, TOWNS, TWISTS, VILLAGES } from '../src/data/regions';
import { describeBeats, describeWorld, DM_SYSTEM_PROMPT } from '../src/dm/context';
import { scriptedScene } from '../src/dm/scripted';
import { Game, GameError } from '../src/game/engine';
import { generateWorld, trueTerrain } from '../src/game/world';

const random = (seed: string, premise = 'arrival', custom = ''): StartOptions => ({ region: 'random', premise, custom, seed });
const shape = (w: ReturnType<typeof generateWorld>) => ({
  terrain: w.world.terrain, party: w.world.party, placeId: w.world.placeId,
  places: w.world.locations.map((l) => [l.id, l.q, l.r, l.kind]),
  people: w.memory.npcs.map((n) => [n.id, n.locationId, n.disposition, n.visual.description]),
});

function table(start: Partial<StartOptions> = {}, lang: 'en' | 'de' = 'en') {
  const g = new Game('test', () => 0.42);
  g.seat('host', 'key', 'Chris');
  g.seat('guest', 'key2', 'Mira');
  g.setLanguage('host', lang);
  g.setStart('host', start);
  g.addCharacter('host', 'fighter', '');
  return g;
}

describe('seeds', () => {
  it('reads a typed seed the same however it was typed', () => {
    expect(normalizeSeed(' k7wq 3mxd ')).toBe('K7WQ3MXD');
    expect(normalizeSeed('k7wq-3mxd')).toBe('K7WQ-3MXD');
    expect(normalizeSeed('--drachen!!')).toBe('DRACHEN');
    expect(normalizeSeed(null)).toBe('');
    expect(newSeed(() => 0.5)).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(hashSeed('A')).not.toBe(hashSeed('B'));
  });

  it('rebuilds the same world from the same seed, region and premise', () => {
    for (const start of [random('K7WQ-3MXD'), random('K7WQ-3MXD', 'shipwreck'), { ...CLASSIC_START, seed: 'K7WQ-3MXD' }]) {
      expect(generateWorld(start)).toEqual(generateWorld(start));
    }
    const a = generateWorld(random('AAAA-AAAA')), b = generateWorld(random('BBBB-BBBB'));
    expect(a.world.terrain).not.toBe(b.world.terrain);
  });

  it('builds the same region in German as in English', () => {
    for (const seed of ['ONE', 'TWO', 'THREE', 'FOUR']) {
      const en = generateWorld(random(seed), 'en'), de = generateWorld(random(seed), 'de');
      expect(shape(de)).toEqual(shape(en));
    }
  });

  it('gives different seeds different regions', () => {
    const names = new Set<string>(), towns = new Set<string>(), quests = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const w = generateWorld(random(`SEED${i}`));
      names.add(w.setting.name);
      towns.add(w.world.locations[0].name);
      quests.add(w.memory.quests[0].title);
    }
    expect(names.size).toBeGreaterThan(30);
    expect(towns.size).toBeGreaterThan(30);
    expect(quests.size).toBeGreaterThan(THREATS.length * 2);
  });
});

describe('random regions', () => {
  it('puts every place on reachable land, apart from the others, in both languages', () => {
    for (let i = 0; i < 150; i++) {
      const premise = [...PREMISES.map((p) => p.id), 'custom'][i % (PREMISES.length + 1)];
      const { world, memory, setting } = generateWorld(random(`R${i}`, premise, 'A dragon ate the mayor.'), i % 2 ? 'de' : 'en');
      const at = (h: { q: number; r: number }) => trueTerrain(world, h);
      const home = world.locations.find((l) => l.id === 'home')!;
      const top = world.locations.filter((l) => !l.parentId);
      expect(top).toHaveLength(5);
      for (const loc of top) {
        expect(TERRAIN[at(loc)].passable, `${loc.name} on R${i}`).toBe(true);
        if (loc !== home) expect(findRoute(world.width, world.height, at, home, loc), `${loc.name} on R${i}`).not.toBeNull();
        for (const other of top) if (other !== loc) expect(hexDistance(loc, other), `${loc.name} and ${other.name} on R${i}`).toBeGreaterThanOrEqual(1);
      }
      expect(world.locations.find((l) => l.id === 'tavern')).toMatchObject({ q: home.q, r: home.r, parentId: 'home' });
      // The party can walk home from wherever the story opens.
      expect(TERRAIN[at(world.party)].passable).toBe(true);
      if (hexDistance(world.party, home) > 0) expect(findRoute(world.width, world.height, at, world.party, home)).not.toBeNull();
      // Every sentence is finished: no template token is left behind.
      const texts = [setting.name, setting.premise, setting.opening, setting.intro, ...world.locations.flatMap((l) => [l.name, l.description, ...(l.stages ?? []).flatMap((s) => [s.name, s.description])]),
        ...memory.npcs.flatMap((n) => [n.name, n.role, n.description]), ...memory.quests.flatMap((q) => [q.title, q.summary])];
      for (const t of texts) { expect(t, `R${i}`).not.toMatch(/[{}]|undefined/); expect(t.trim().length, `R${i}`).toBeGreaterThan(2); }
      expect(memory.npcs.map((n) => n.locationId).sort()).toEqual(['home', 'sanctuary', 'tavern', 'village']);
      expect(new Set(memory.npcs.map((n) => n.name)).size).toBe(4);
      // Each quest names the person who asks for it.
      for (const q of memory.quests) expect(memory.npcs.some((n) => q.summary.includes(n.name)), `${q.title} on R${i}`).toBe(true);
    }
  });

  it('only uses monsters, items and kinds of country that exist', () => {
    const stages = [...THREATS.flatMap((t) => t.stages), ...MINOR_SITES.flatMap((m) => m.stages)];
    for (const st of stages) for (const g of st.monsters) expect(MONSTERS[g.defId], g.defId).toBeDefined();
    for (const t of THREATS) expect(t.stages[3].monsters.some((g) => g.boss || MONSTERS[g.defId].boss), t.id).toBe(true);
    const world = generateWorld(random('LOOT'));
    for (const l of world.world.locations) for (const st of l.stages ?? []) for (const it of st.loot.items) expect(ITEMS[it.id], it.id).toBeDefined();
    const ids = THEMES.map((t) => t.id);
    for (const x of [...TOWNS, ...VILLAGES, ...SANCTUARIES]) for (const t of x.themes ?? []) expect(ids).toContain(t);
    for (const id of ids) for (const xs of [TOWNS, VILLAGES, SANCTUARIES]) expect(xs.some((x) => !x.themes || x.themes.includes(id)), id).toBe(true);
    for (const p of PREMISES) expect(PREMISE_TEXT[p.id], p.id).toBeDefined();
  });

  it('writes German names and sentences at a German table', () => {
    const { world, memory, setting } = generateWorld(random('GERMAN'), 'de');
    const text = [setting.name, setting.intro, ...world.locations.map((l) => l.description), ...memory.npcs.map((n) => `${n.role} ${n.description}`), memory.quests[0].summary].join(' ');
    expect(text).not.toMatch(/\b(the|of|and|with)\b/);
    expect(setting.name).toMatch(/^(das|die|der) /);
    expect(setting.premise).toContain(world.locations[0].name); // the DM's notes use the names the players see
  });
});

describe('quests', () => {
  const head = (title: string) => title.split('{')[0];
  const worlds = Array.from({ length: 160 }, (_, i) => ({ en: generateWorld(random(`Q${i}`), 'en'), de: generateWorld(random(`Q${i}`), 'de') }));

  it('opens with a main quest and a side quest, and every hook, side quest and twist turns up', () => {
    const main = new Set<string>(), side = new Set<string>(), twists = new Set<string>();
    for (const { en } of worlds) {
      expect(en.memory.quests.map((q) => q.id)).toEqual(['main', 'side']);
      main.add(en.memory.quests[0].title);
      side.add(en.memory.quests[1].title);
      for (const t of TWISTS) if (en.setting.plot!.includes(t.split(/\{\w+\}/).sort((a, b) => b.length - a.length)[0])) twists.add(t);
    }
    const seen = (titles: Set<string>, title: string) => [...titles].some((t) => t.startsWith(head(title)));
    for (const h of THREATS.flatMap((t) => t.hooks)) expect(seen(main, h.title.en), h.title.en).toBe(true);
    for (const q of [...MINOR_SITES.map((m) => m.quest), ...ERRANDS]) expect(seen(side, q.title.en), q.title.en).toBe(true);
    expect(twists.size).toBe(TWISTS.length);
  });

  it('rolls the same quests in German as in English, in finished German sentences', () => {
    for (const { en, de } of worlds) {
      expect(de.memory.quests.map((q) => [q.id, q.rewardXp])).toEqual(en.memory.quests.map((q) => [q.id, q.rewardXp]));
      expect(de.setting.plot).toBeDefined();
      for (const q of de.memory.quests) {
        expect(`${q.title} ${q.summary}`).not.toMatch(/[{}]|undefined|\b(the|of|and|with|at|from|near)\b/);
        expect(q.summary).not.toMatch(/  |\s[.,]/);
      }
    }
  });

  it('puts the places a quest leads to on the map, and lets the side dungeon end its quest', () => {
    for (const { en } of worlds) {
      const { world, memory, setting } = en;
      const loc = (id: string) => world.locations.find((l) => l.id === id)!;
      expect(loc('lair').questId).toBe('main');
      expect(loc('lair').discovered).toBe(true);
      const sideHere = loc('minor').questId === 'side';
      if (sideHere) expect(loc('minor').discovered).toBe(true);
      for (const q of memory.quests) {
        const who = memory.npcs.find((n) => q.summary.includes(n.name))!;
        if (who.id === 'villager') expect(loc('village').discovered, q.title).toBe(true);
        if (who.id === 'keeper') expect(loc('sanctuary').discovered, q.title).toBe(true);
      }
      // The Dungeon Master is told what each quest really asks, and the twist.
      expect(setting.plot).toContain(`Main quest (quest "${memory.quests[0].title}"`);
      expect(setting.plot).toContain(`Side quest (quest "${memory.quests[1].title}"`);
      expect(setting.plot).toContain('Hidden twist');
      expect(setting.plot).not.toMatch(/[{}]/);
    }
  });

  it('tells only the Dungeon Master the plot', () => {
    const g = table({ region: 'random', premise: 'arrival', seed: 'PLOT-1234' });
    g.start();
    const plot = g.s.setting!.plot!;
    expect(describeWorld(g)).toContain(`Plot, for you only: ${plot}`);
    expect(JSON.stringify(g.publicState({ busy: false, mode: 'scripted', model: null }))).not.toContain('Hidden twist');
    // The classic region and old saves have no plot line.
    const classic = table({ ...CLASSIC_START, seed: 'X' });
    classic.start();
    expect(describeWorld(classic)).not.toContain('Plot, for you only');
  });
});

describe('premises', () => {
  it('opens a shipwreck on a shore by the sea and a prison break in the wild', () => {
    let shores = 0;
    for (let i = 0; i < 30; i++) {
      const wreck = generateWorld(random(`P${i}`, 'shipwreck'));
      expect(wreck.world.placeId).toBeNull();
      const home = wreck.world.locations[0];
      expect(hexDistance(wreck.world.party, home)).toBeGreaterThanOrEqual(2);
      expect(hexDistance(wreck.world.party, home)).toBeLessThanOrEqual(4);
      if (neighbors(wreck.world.party, wreck.world.width, wreck.world.height).some((n) => trueTerrain(wreck.world, n) === 'w')) shores++;
      expect(wreck.world.terrain.split('w').length - 1, `P${i}`).toBeGreaterThan(20); // a coast has a sea
      const escape = generateWorld(random(`P${i}`, 'prison'));
      expect(escape.world.placeId).toBeNull();
      // Choosing another premise keeps the region's names.
      expect(escape.world.locations.map((l) => l.name)[2]).toBe(generateWorld(random(`P${i}`, 'festival')).world.locations.map((l) => l.name)[2]);
    }
    expect(shores).toBeGreaterThanOrEqual(27);
    expect(generateWorld(random('X', 'letter')).world.placeId).toBe('tavern');
    expect(generateWorld(random('X', 'festival')).world.placeId).toBe('home');
  });

  it('lets the seed choose when asked to surprise, and takes the host\'s own words', () => {
    const picked = new Set<string>();
    for (let i = 0; i < 60; i++) picked.add(generateWorld(random(`S${i}`, 'surprise')).setting.premiseId);
    expect(picked.size).toBe(PREMISES.length);
    const own = generateWorld(random('X', 'custom', 'We are a travelling circus that lost its bear.'));
    expect(own.setting.premiseId).toBe('custom');
    expect(own.setting.opening).toContain('"We are a travelling circus that lost its bear."');
    expect(generateWorld(random('X', 'custom', '  ')).setting.premiseId).toBe('arrival');
  });

  it('works in the classic region too', () => {
    const w = generateWorld({ ...CLASSIC_START, premise: 'prison', seed: 'X' });
    expect(w.world.placeId).toBeNull();
    expect(w.world.locations[0].name).toBe('Emberfall');
    expect(w.setting.opening).toContain('Emberfall');
  });
});

describe('the table', () => {
  it('lets only the host choose, and only before the adventure', () => {
    const g = table();
    expect(() => g.setStart('guest', { region: 'random' })).toThrow(GameError);
    expect(() => g.setStart('host', { region: 'moon' as never })).toThrow(GameError);
    expect(() => g.setStart('host', { premise: 'nonsense' })).toThrow(GameError);
    g.setStart('host', { region: 'random', premise: 'custom', custom: `  my   own  ${'x'.repeat(600)}`, seed: ' abcd efgh ' });
    expect(g.s.table.start).toMatchObject({ region: 'random', premise: 'custom', seed: 'ABCDEFGH' });
    expect(g.s.table.start.custom).toHaveLength(400);
    expect(g.s.table.start.custom.startsWith('my own x')).toBe(true);
    g.setStart('host', { seed: '' });
    expect(g.s.table.start.seed).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(g.publicState({ busy: false, mode: 'scripted', model: null }).table.start.region).toBe('random');
    g.start();
    expect(() => g.setStart('host', { region: 'classic' })).toThrow(GameError);
  });

  it('starts in the rolled region, shows the seed, and tells the Dungeon Master the premise every turn', () => {
    const g = table({ region: 'random', premise: 'festival', seed: 'FEST-2026' }, 'de');
    g.start();
    const s = g.s.setting!;
    expect(s).toMatchObject({ seed: 'FEST-2026', region: 'random', premiseId: 'festival' });
    expect(g.s.log.map((l) => l.text)).toContain('Welt-Seed: FEST-2026');
    expect(g.place()?.id).toBe('home');
    const state = g.publicState({ busy: false, mode: 'scripted', model: null });
    expect(state.world?.name).toBe(s.name);
    expect(describeWorld(g)).toContain(`Setting: ${s.name}. Background for you only`);
    expect(describeWorld(g)).toContain(s.premise);
    expect(describeBeats([{ kind: 'start' }], g)).toContain('festival');
    expect(DM_SYSTEM_PROMPT).not.toContain('Emberfall');
    const scene = scriptedScene(g, [{ kind: 'start' }]);
    expect(scene?.text).toContain(`${g.place()!.name} feiert.`);
    // The same seed at another table builds the same place.
    const again = table({ region: 'random', premise: 'festival', seed: 'fest-2026' }, 'de');
    again.start();
    expect(again.s.world).toEqual(g.s.world);
  });

  it('keeps the choices for the next adventure but rolls a new seed', () => {
    const g = table({ region: 'random', premise: 'prison', seed: 'ONCE' });
    g.start();
    g.reset('host');
    expect(g.s.table.start).toMatchObject({ region: 'random', premise: 'prison' });
    expect(g.s.table.start.seed).not.toBe('ONCE');
    expect(g.s.setting).toBeUndefined();
  });

  it('plays tables saved before start options in the classic region', () => {
    const g = table();
    g.start();
    const saved = JSON.parse(JSON.stringify(g.s));
    delete saved.setting;
    delete saved.table.start;
    const loaded = new Game('test', () => 0.42, saved);
    expect(loaded.s.table.start.region).toBe('classic');
    expect(describeWorld(loaded)).toContain('The Emberfall Vale is a frontier valley');
    expect(loaded.publicState({ busy: false, mode: 'scripted', model: null }).world?.name).toBe('the Emberfall Vale');
  });

  it('counts a rolled lair\'s last fight as a boss fight', () => {
    const g = table();
    g.start();
    g.startEncounter([{ defId: 'giant_spider', count: 1, boss: true, name: 'Brood Mother' }], { source: 'story', context: 'test' });
    expect(g.s.encounter?.boss).toBe(true);
    expect(g.s.monsters[0].name).toBe('Brood Mother');
  });
});
