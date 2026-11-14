// Battle maps: what the tiles mean in the rules, and how a map is laid out for
// the place a fight breaks out in. Shared so the browser previews movement with
// exactly the rules the server enforces.

import type { TerrainCode } from './hex';
import type { LocationKind } from './types';

export const BIOMES = ['dungeon', 'cave', 'ruin', 'tavern', 'town', 'road', 'bridge', 'camp', 'plains', 'forest', 'hills', 'mountains', 'swamp'] as const;
export type Biome = (typeof BIOMES)[number];
export const isBiome = (v: unknown): v is Biome => typeof v === 'string' && (BIOMES as readonly string[]).includes(v);

/**
 * Tile codes.
 *  .  open ground                      =  planks, paving or a bridge deck
 *  ,  rough ground (mud, undergrowth, rubble, scree): difficult terrain
 *  ~  shallow water: difficult terrain
 *  #  wall: blocks movement and sight
 *  T  tree or thick bush, o  boulder, t  table, crate or barrel:
 *     block movement, can be seen and shot past, and give half cover
 *  W  deep water: blocks movement only
 */
export const TILE = { ground: '.', deck: '=', rough: ',', shallows: '~', wall: '#', tree: 'T', rock: 'o', prop: 't', deep: 'W' } as const;

export const tileWalkable = (ch: string) => ch === '.' || ch === '=' || ch === ',' || ch === '~';
/** Movement (in 5 ft steps) it costs to enter a tile. Difficult terrain costs double. */
export const tileCost = (ch: string) => (ch === ',' || ch === '~' ? 2 : 1);
export const tileDifficult = (ch: string) => tileCost(ch) > 1;
export const tileBlocksSight = (ch: string) => ch === '#';
export const tileGivesCover = (ch: string) => ch === 'T' || ch === 'o' || ch === 't';
/** AC bonus for half cover (SRD). */
export const COVER_BONUS = 2;

export const ARENA_WIDTH = 22;
export const ARENA_HEIGHT = 13;

interface Pt { x: number; y: number }

/** Tiles strictly between two points, on the same line the sight check walks. */
export function tilesBetween(a: Pt, b: Pt): Pt[] {
  const out: Pt[] = [];
  let x = a.x, y = a.y;
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
  let err = dx - dy;
  while (x !== b.x || y !== b.y) {
    if (x !== a.x || y !== a.y) out.push({ x, y });
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return out;
}

/**
 * Half cover: the shot passes a tree, boulder or piece of furniture that the
 * target is standing right next to. An obstacle beside the shooter is no help
 * to the target, because the shooter simply leans around it.
 */
export function hasCover(rows: string[], from: Pt, to: Pt): boolean {
  return tilesBetween(from, to).some((p) => tileGivesCover(rows[p.y]?.[p.x] ?? '#') && Math.max(Math.abs(p.x - to.x), Math.abs(p.y - to.y)) <= 1 && Math.max(Math.abs(p.x - from.x), Math.abs(p.y - from.y)) > 1);
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/**
 * Cheapest movement cost from a start tile to every tile within a budget.
 * Diagonal steps may not cut the corner of an impassable tile.
 */
export function movementCosts(rows: string[], start: Pt, budget: number, blocked: (x: number, y: number) => boolean): Map<string, { cost: number; prev: string | null }> {
  const at = (x: number, y: number) => rows[y]?.[x] ?? '#';
  const k = (x: number, y: number) => `${x},${y}`;
  const best = new Map<string, { cost: number; prev: string | null }>([[k(start.x, start.y), { cost: 0, prev: null }]]);
  // Costs are 1 or 2, so a bucket per cost is a complete priority queue.
  const buckets: Pt[][] = [[start]];
  for (let cost = 0; cost < buckets.length && cost <= budget; cost++) {
    for (const cur of buckets[cost] ?? []) {
      if (best.get(k(cur.x, cur.y))!.cost !== cost) continue;
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!tileWalkable(at(nx, ny)) || blocked(nx, ny)) continue;
        if (dx && dy && (!tileWalkable(at(cur.x + dx, cur.y)) || !tileWalkable(at(cur.x, cur.y + dy)))) continue;
        const c = cost + tileCost(at(nx, ny));
        if (c > budget) continue;
        const seen = best.get(k(nx, ny));
        if (seen && seen.cost <= c) continue;
        best.set(k(nx, ny), { cost: c, prev: k(cur.x, cur.y) });
        (buckets[c] ??= []).push({ x: nx, y: ny });
      }
    }
  }
  return best;
}

// ------------------------------------------------------------------ choosing

const KIND_BIOME: Partial<Record<LocationKind, Biome>> = {
  dungeon: 'dungeon', cave: 'cave', ruin: 'ruin', tavern: 'tavern', shop: 'tavern', temple: 'dungeon', town: 'town', village: 'town', camp: 'camp',
};
const TERRAIN_BIOME: Record<string, Biome> = { r: 'road', p: 'plains', f: 'forest', h: 'hills', m: 'mountains', s: 'swamp', w: 'swamp' };

/**
 * Which kind of battle map fits. A setting the Dungeon Master asked for wins,
 * then the place the party is standing in, then the terrain of its hex.
 */
export function chooseBiome(opts: { setting?: string | null; placeKind?: LocationKind | null; terrain: TerrainCode | string; dungeonDelve?: boolean }): Biome {
  if (isBiome(opts.setting)) return opts.setting;
  if (opts.dungeonDelve) return opts.placeKind === 'cave' ? 'cave' : opts.placeKind === 'ruin' ? 'ruin' : 'dungeon';
  const byPlace = opts.placeKind ? KIND_BIOME[opts.placeKind] : undefined;
  return byPlace ?? TERRAIN_BIOME[opts.terrain] ?? 'plains';
}

// ---------------------------------------------------------------- generating

type Rng = () => number;

/**
 * Lay out a battle map. Heroes start in columns 2-3 and foes in the two columns
 * opposite; those columns stay open ground, and every walkable tile can be
 * reached from the heroes' side.
 */
export function buildBattleMap(biome: Biome, rng: Rng, terrain: string = 'p'): string[] {
  const W = ARENA_WIDTH, H = ARENA_HEIGHT, midY = Math.floor(H / 2);
  const g: string[][] = Array.from({ length: H }, () => Array<string>(W).fill('.'));
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const edge = (x: number, y: number) => x === 0 || y === 0 || x === W - 1 || y === H - 1;
  const spawn = (x: number) => x <= 4 || x >= W - 5;
  const border = (pick: () => string) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (edge(x, y)) g[y][x] = pick(); };
  const solid = (ch: string) => !tileWalkable(ch);

  /** Single blocking tiles that never touch another blocker, so they cannot wall anything in. */
  const scatter = (ch: string, count: number, on: (c: string) => boolean = (c) => c === '.' || c === ',') => {
    let placed = 0;
    for (let tries = 0; tries < 300 && placed < count; tries++) {
      const x = int(5, W - 6), y = int(1, H - 2);
      if (!on(g[y][x])) continue;
      let clear = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!edge(x + dx, y + dy) && solid(g[y + dy][x + dx])) clear = false;
      if (!clear) continue;
      g[y][x] = ch;
      placed++;
    }
  };
  /** Irregular patches grown by a short random walk. */
  const patches = (ch: string, count: number, size: number, on: (c: string) => boolean = (c) => c === '.') => {
    for (let i = 0; i < count; i++) {
      let x = int(5, W - 6), y = int(2, H - 3);
      for (let n = 0; n < size; n++) {
        if (!edge(x, y) && !spawn(x) && on(g[y][x])) g[y][x] = ch;
        const [dx, dy] = DIRS[int(0, 3)];
        x = Math.max(5, Math.min(W - 6, x + dx));
        y = Math.max(1, Math.min(H - 2, y + dy));
      }
    }
  };
  const box = (x0: number, y0: number, x1: number, y1: number, ch: string) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!edge(x, y) && !spawn(x)) g[y][x] = ch; };

  switch (biome) {
    case 'swamp':
      border(() => (rng() < 0.6 ? 'W' : 'T'));
      patches('~', 4, 9);
      patches(',', 4, 8);
      patches('W', 2, 3);
      scatter('T', 6);
      break;
    case 'forest':
      border(() => 'T');
      patches(',', 4, 7);
      scatter('T', 16);
      scatter('o', 2);
      break;
    case 'plains':
      border(() => 'T');
      patches(',', 3, 7);
      scatter('o', 3);
      scatter('T', 3);
      break;
    case 'hills':
      border(() => 'o');
      patches(',', 4, 6);
      scatter('o', 9);
      scatter('T', 3);
      break;
    case 'mountains':
      border(() => '#');
      patches(',', 5, 7);
      scatter('o', 10);
      scatter('#', 4);
      break;
    case 'road': {
      border(() => 'T');
      const wooded = terrain === 'f' || terrain === 's';
      patches(',', wooded ? 4 : 2, 6);
      for (let x = 1; x < W - 1; x++) { g[midY][x] = '='; g[midY - 1][x] = '='; }
      scatter('T', wooded ? 10 : 5);
      scatter('o', 2);
      scatter('t', 2, (c) => c === '=');
      break;
    }
    case 'bridge': {
      border(() => 'T');
      const x0 = int(8, 9), x1 = x0 + int(4, 5);
      box(x0, 1, x1, H - 2, 'W');
      for (let y = 1; y < H - 1; y++) { if (rng() < 0.7) g[y][x0 - 1] = '~'; if (rng() < 0.7) g[y][x1 + 1] = '~'; }
      for (let x = 1; x < W - 1; x++) for (const y of [midY - 1, midY, midY + 1]) if (x >= x0 - 1 && x <= x1 + 1) g[y][x] = '=';
      scatter('T', 5);
      scatter('o', 3);
      break;
    }
    case 'camp':
      border(() => 'T');
      patches(',', 2, 6);
      scatter('t', 6);
      scatter('T', 5);
      scatter('o', 2);
      g[midY][Math.floor(W / 2)] = 'o'; // the hearthstone in the middle of camp
      break;
    case 'town':
      border(() => '#');
      box(5, 1, 8, 3, '#'); box(13, 1, 16, 2, '#');
      box(5, H - 4, 7, H - 2, '#'); box(12, H - 3, 16, H - 2, '#');
      for (let x = 1; x < W - 1; x++) { g[midY][x] = '='; g[midY - 1][x] = '='; }
      for (let y = 1; y < H - 1; y++) g[y][10] = g[y][10] === '#' ? '#' : '=';
      scatter('t', 6);
      scatter('o', 1);
      break;
    case 'tavern':
      border(() => '#');
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) g[y][x] = '=';
      for (let x = 7; x <= 14; x++) g[2][x] = 't'; // the bar
      for (const y of [5, 8, 10]) for (const x of [6, 9, 12, 15]) if (rng() < 0.8) g[y + (rng() < 0.3 ? 1 : 0)][x] = 't';
      break;
    case 'cave':
      border(() => '#');
      for (let y = 1; y < H - 1; y++) for (let x = 5; x < W - 5; x++) if ((y === 1 || y === H - 2) && rng() < 0.45) g[y][x] = '#';
      patches('~', 2, 6);
      patches(',', 3, 5);
      scatter('o', 9);
      scatter('#', 3);
      break;
    case 'ruin':
      border(() => '#');
      for (let i = 0; i < 4; i++) {
        const x = int(6, W - 8), y = int(2, H - 3), len = int(2, 3), across = rng() < 0.5;
        for (let n = 0; n < len; n++) { const px = across ? x + n : x, py = across ? y : Math.min(H - 2, y + n); if (!spawn(px)) g[py][px] = '#'; }
      }
      patches(',', 5, 5);
      scatter('o', 4);
      scatter('T', 3);
      break;
    default:
      border(() => '#');
      patches(',', 2, 4);
      scatter('#', 10);
      break;
  }

  // Keep both starting areas open, then open a way to anything that got walled in.
  for (let y = 1; y < H - 1; y++) for (const x of [2, 3, W - 4, W - 3]) if (g[y][x] !== '=') g[y][x] = '.';
  const start = { x: 3, y: midY };
  for (let pass = 0; pass < 40; pass++) {
    const reach = movementCosts(g.map((r) => r.join('')), start, 999, () => false);
    let stray: Pt | null = null;
    for (let y = 1; y < H - 1 && !stray; y++) for (let x = 1; x < W - 1; x++) if (tileWalkable(g[y][x]) && !reach.has(`${x},${y}`)) { stray = { x, y }; break; }
    if (!stray) break;
    let { x, y } = stray;
    const open = biome === 'tavern' ? '=' : '.';
    while (x !== start.x || y !== start.y) {
      if (y !== start.y && (x <= 4 || x === start.x)) y += y < start.y ? 1 : -1;
      else x += x < start.x ? 1 : -1;
      if (!tileWalkable(g[y][x])) g[y][x] = g[y][x] === 'W' ? '~' : open;
    }
  }
  return g.map((r) => r.join(''));
}
