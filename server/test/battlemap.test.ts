import { describe, expect, it } from 'vitest';
import { ARENA_HEIGHT, ARENA_WIDTH, BIOMES, buildBattleMap, chooseBiome, hasCover, movementCosts, tileWalkable } from '../../shared/battlemap';
import { Game } from '../src/game/engine';
import { hexIndex } from '../src/game/world';

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

function party(seed = 1) {
  const g = new Game('test', seeded(seed));
  g.upsertPlayer('p1', 'Tester', true);
  for (const c of ['fighter', 'wizard'] as const) g.addCharacter('p1', c, '');
  g.start();
  return g;
}

/** Puts a hand-drawn map under a running fight, with one hero and one monster on it. */
function arena(rows: string[], hero: { x: number; y: number }, foe: { x: number; y: number }, heroIndex = 0) {
  const g = party();
  g.startEncounter([{ defId: 'goblin', count: 1 }], { source: 'story', context: 'test' });
  g.s.rows = rows;
  const c = g.s.characters[heroIndex];
  for (const o of g.s.characters) if (o !== c) { o.x = 1; o.y = rows.length - 2; }
  Object.assign(c, hero);
  Object.assign(g.s.monsters[0], foe);
  g.s.combat!.order = [{ id: c.id, kind: 'pc', initiative: 20 }, { id: g.s.monsters[0].id, kind: 'monster', initiative: 1 }];
  g.s.combat!.turnIndex = 0;
  g.s.combat!.movementLeft = 6;
  g.s.combat!.actionUsed = false;
  g.s.combat!.attacksLeft = 1;
  return { g, c, m: g.s.monsters[0] };
}

describe('battle maps', () => {
  it('builds a connected map with open starting columns for every kind of place', () => {
    for (const biome of BIOMES) {
      for (let seed = 1; seed <= 40; seed++) {
        const rows = buildBattleMap(biome, seeded(seed), 'f');
        expect(rows.length).toBe(ARENA_HEIGHT);
        for (const r of rows) expect(r.length).toBe(ARENA_WIDTH);
        for (let x = 0; x < ARENA_WIDTH; x++) for (const y of [0, ARENA_HEIGHT - 1]) expect(tileWalkable(rows[y][x]), `${biome} edge`).toBe(false);
        for (let y = 0; y < ARENA_HEIGHT; y++) for (const x of [0, ARENA_WIDTH - 1]) expect(tileWalkable(rows[y][x]), `${biome} edge`).toBe(false);
        for (let y = 1; y < ARENA_HEIGHT - 1; y++) for (const x of [2, 3, ARENA_WIDTH - 4, ARENA_WIDTH - 3]) expect(['.', '='], `${biome} ${seed} start (${x},${y}) ${rows[y][x]}`).toContain(rows[y][x]);
        const reach = movementCosts(rows, { x: 3, y: 6 }, 999, () => false);
        for (let y = 0; y < ARENA_HEIGHT; y++) for (let x = 0; x < ARENA_WIDTH; x++) if (tileWalkable(rows[y][x])) expect(reach.has(`${x},${y}`), `${biome} seed ${seed} (${x},${y})\n${rows.join('\n')}`).toBe(true);
      }
    }
  });

  it('gives each kind of place its own features', () => {
    const count = (rows: string[], ch: string) => rows.join('').split(ch).length - 1;
    const swamp = buildBattleMap('swamp', seeded(5));
    expect(count(swamp, '~') + count(swamp, ',')).toBeGreaterThan(10);
    expect(count(swamp, '#')).toBe(0);
    expect(count(buildBattleMap('forest', seeded(5)), 'T')).toBeGreaterThan(60);
    expect(count(buildBattleMap('tavern', seeded(5)), 't')).toBeGreaterThan(10);
    const bridge = buildBattleMap('bridge', seeded(5));
    expect(count(bridge, 'W')).toBeGreaterThan(20);
    expect(bridge[6]).toMatch(/^T\.+={6,}\.+T$/);
  });

  it('picks the map from the setting, then the place, then the terrain', () => {
    expect(chooseBiome({ terrain: 's' })).toBe('swamp');
    expect(chooseBiome({ terrain: 'f' })).toBe('forest');
    expect(chooseBiome({ terrain: 'r' })).toBe('road');
    expect(chooseBiome({ terrain: 's', placeKind: 'tavern' })).toBe('tavern');
    expect(chooseBiome({ terrain: 's', placeKind: 'village' })).toBe('town');
    expect(chooseBiome({ terrain: 's', placeKind: 'landmark' })).toBe('swamp');
    expect(chooseBiome({ terrain: 'p', placeKind: 'cave', dungeonDelve: true })).toBe('cave');
    expect(chooseBiome({ terrain: 'p', placeKind: 'town', setting: 'bridge' })).toBe('bridge');
    expect(chooseBiome({ terrain: 'h', setting: 'here' })).toBe('hills');
  });

  it('uses the terrain under the party when a fight starts in the wild', () => {
    const g = party();
    const w = g.world;
    const i = hexIndex(w, w.party);
    w.placeId = null;
    w.terrain = w.terrain.slice(0, i) + 's' + w.terrain.slice(i + 1);
    g.startEncounter([{ defId: 'goblin', count: 2 }], { source: 'wild', context: 'test' });
    expect(g.s.biome).toBe('swamp');
    g.s.phase = 'explore';
    g.startEncounter([{ defId: 'goblin', count: 2 }], { source: 'story', context: 'test', setting: 'bridge' });
    expect(g.s.biome).toBe('bridge');
  });

  it('charges double movement for mud and shallow water', () => {
    const rows = ['#########', '#..,~...#', '#########'];
    const { g, c } = arena(rows, { x: 1, y: 1 }, { x: 7, y: 1 });
    g.move('p1', c.id, 6, 1);
    // 6 movement: one open tile, mud (2), water (2), one open tile.
    expect(c.x).toBe(5);
    expect(g.s.combat!.movementLeft).toBe(0);
  });

  it('walks around difficult ground when that is cheaper', () => {
    const rows = ['#######', '#.....#', '#.,,,.#', '#######'];
    const { g, c } = arena(rows, { x: 1, y: 2 }, { x: 5, y: 1 });
    g.move('p1', c.id, 5, 2);
    expect(c.x).toBe(5);
    expect(g.s.combat!.movementLeft).toBe(2);
  });

  it('refuses a step into mud with only 5 feet of movement left', () => {
    const rows = ['#####', '#.,.#', '#####'];
    const { g, c } = arena(rows, { x: 1, y: 1 }, { x: 3, y: 1 });
    g.s.monsters[0].x = 0; // out of the way
    g.s.combat!.movementLeft = 1;
    expect(() => g.move('p1', c.id, 2, 1)).toThrow();
    expect(c.x).toBe(1);
  });

  it('gives half cover behind a tree, but not to someone the shooter stands next to it', () => {
    const rows = ['##########', '#......T.#', '##########'];
    expect(hasCover(rows, { x: 1, y: 1 }, { x: 8, y: 1 })).toBe(true);
    expect(hasCover(rows, { x: 6, y: 1 }, { x: 8, y: 1 })).toBe(false);
    expect(hasCover(['#########', '#.T.....#', '#########'], { x: 1, y: 1 }, { x: 7, y: 1 })).toBe(false);
  });

  it('adds cover to armour class for shots and spells, and sees past trees', () => {
    const rows = ['##########', '#......T.#', '##########'];
    const { g, c, m } = arena(rows, { x: 1, y: 1 }, { x: 8, y: 1 }, 1);
    g.useAbility('p1', c.id, 'fire_bolt', m.id);
    const entry = g.s.log.filter((l) => l.roll).at(-1)!;
    expect(entry.roll!.target.value).toBe(15 + 2);
    expect(entry.text).toContain('half cover');
  });
});
