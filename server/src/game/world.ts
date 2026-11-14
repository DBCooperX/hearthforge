// Overworld state and procedural generation. The server keeps the true terrain;
// players (and the route planner) only ever see hexes they have explored.

import { UNKNOWN, findRoute, hexDistance, neighbors, type Hex, type TerrainCode } from '../../../shared/hex';
import type { Deed, Location, Npc, Quest } from '../../../shared/types';
import { SEED_LOCATIONS, SEED_NPCS, SEED_QUESTS, START_LOCATION, WORLD_HEIGHT, WORLD_WIDTH, type StageDef } from '../data/world';
import type { Rng } from './dice';

export interface LocationState extends Omit<Location, 'dungeon'> {
  /** The party knows this place exists and where it is. */
  discovered: boolean;
  stages?: StageDef[];
  cleared?: number;
  questId?: string;
}

export interface NpcState extends Npc {
  met: boolean;
}

export interface QuestState extends Quest {
  rewardXp?: number;
  rewardGold?: number;
}

export interface WorldState {
  seed: number;
  width: number;
  height: number;
  /** True terrain, one code per hex, row-major. */
  terrain: string;
  /** '1' for hexes the party has seen. */
  explored: string;
  party: Hex;
  minutes: number;
  placeId: string | null;
  locations: LocationState[];
}

/** Everything the Dungeon Master should remember between scenes. Saved with the game. */
export interface MemoryState {
  npcs: NpcState[];
  quests: QuestState[];
  deeds: Deed[];
  /** One-line notes the DM leaves itself after each exchange, newest last. */
  journal: { day: number; text: string }[];
  /** Older journal entries, condensed into a running summary. */
  chronicle: string;
}

export const hexIndex = (w: WorldState, h: Hex) => h.r * w.width + h.q;
export const trueTerrain = (w: WorldState, h: Hex) => w.terrain[hexIndex(w, h)] as TerrainCode;
export const isExplored = (w: WorldState, h: Hex) => w.explored[hexIndex(w, h)] === '1';
/** Terrain as the party knows it: '?' until explored. */
export const knownTerrain = (w: WorldState, h: Hex) => (isExplored(w, h) ? w.terrain[hexIndex(w, h)] : UNKNOWN);

export function maskedTerrain(w: WorldState): string {
  let out = '';
  for (let i = 0; i < w.terrain.length; i++) out += w.explored[i] === '1' ? w.terrain[i] : UNKNOWN;
  return out;
}

function setChar(s: string, i: number, c: string) {
  return s.slice(0, i) + c + s.slice(i + 1);
}

/** Mark hexes within `radius` of `at` as explored. Returns locations that just came into view. */
export function reveal(w: WorldState, at: Hex, radius: number): LocationState[] {
  const found: LocationState[] = [];
  for (let r = 0; r < w.height; r++) {
    for (let q = 0; q < w.width; q++) {
      if (hexDistance(at, { q, r }) > radius) continue;
      const i = r * w.width + q;
      if (w.explored[i] !== '1') w.explored = setChar(w.explored, i, '1');
      for (const loc of w.locations) {
        if (loc.q === q && loc.r === r && !loc.discovered) { loc.discovered = true; found.push(loc); }
      }
    }
  }
  return found;
}

/** Smooth 2D value noise in [0, 1] from a coarse random lattice. */
function noiseField(width: number, height: number, cell: number, rng: Rng): number[] {
  const gw = Math.ceil(width / cell) + 2, gh = Math.ceil(height / cell) + 2;
  const lattice = Array.from({ length: gw * gh }, () => rng());
  const out: number[] = [];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const fx = (x + 0.5 * (y & 1)) / cell, fy = y / cell;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = smooth(fx - x0), ty = smooth(fy - y0);
      const at = (ix: number, iy: number) => lattice[iy * gw + ix];
      const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
      const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
      out.push(top * (1 - ty) + bottom * ty);
    }
  }
  return out;
}

function generateTerrain(width: number, height: number, rng: Rng): string[] {
  const e1 = noiseField(width, height, 5, rng), e2 = noiseField(width, height, 2.5, rng);
  const m1 = noiseField(width, height, 4, rng), m2 = noiseField(width, height, 2, rng);
  const out: string[] = [];
  for (let i = 0; i < width * height; i++) {
    const elevation = e1[i] * 0.7 + e2[i] * 0.3;
    const moisture = m1[i] * 0.65 + m2[i] * 0.35;
    let t: TerrainCode;
    if (elevation < 0.3) t = 'w';
    else if (elevation > 0.72) t = 'm';
    else if (elevation > 0.6) t = 'h';
    else if (moisture > 0.62 && elevation < 0.4) t = 's';
    else if (moisture > 0.5) t = 'f';
    else t = 'p';
    out.push(t);
  }
  return out;
}

export function generateWorld(seed: number, rng: Rng): { world: WorldState; memory: MemoryState } {
  const width = WORLD_WIDTH, height = WORLD_HEIGHT;
  const cells = generateTerrain(width, height, rng);
  const idx = (h: Hex) => h.r * width + h.q;
  const top = SEED_LOCATIONS.filter((l) => !l.parentId);
  for (const loc of top) if (loc.terrain) cells[idx(loc)] = loc.terrain;

  // Every seeded place must be reachable on foot from the start: plan a route that
  // treats water as merely very slow, then turn any water on it into a ford.
  const start = SEED_LOCATIONS.find((l) => l.id === START_LOCATION)!;
  for (const n of neighbors(start, width, height)) if (cells[idx(n)] === 'w' || cells[idx(n)] === 'm') cells[idx(n)] = 'p';
  const wading = (h: Hex) => (cells[idx(h)] === 'w' ? 'm' : cells[idx(h)]);
  for (const loc of top) {
    if (loc.id === start.id) continue;
    const route = findRoute(width, height, wading, start, loc) ?? [];
    for (const h of route) if (cells[idx(h)] === 'w') cells[idx(h)] = 'p';
    // A road joins the town and the village.
    if (loc.kind === 'village') for (const h of route.slice(0, -1)) if (cells[idx(h)] !== 'm') cells[idx(h)] = 'r';
  }

  const locations: LocationState[] = SEED_LOCATIONS.map((l) => ({
    id: l.id, name: l.name, kind: l.kind, q: l.q, r: l.r, parentId: l.parentId ?? null, description: l.description,
    visited: false, origin: 'seed', visual: { description: l.appearance, imageId: null }, zone: null,
    discovered: !!l.known, ...(l.stages ? { stages: l.stages, cleared: 0 } : {}), ...(l.questId ? { questId: l.questId } : {}),
  }));
  const world: WorldState = {
    seed, width, height, terrain: cells.join(''), explored: '0'.repeat(width * height),
    party: { q: start.q, r: start.r }, minutes: 8 * 60, placeId: start.id, locations,
  };
  reveal(world, world.party, 2);
  const memory: MemoryState = {
    npcs: SEED_NPCS.map((n) => ({
      id: n.id, name: n.name, role: n.role, description: n.description, disposition: n.disposition, locationId: n.locationId,
      notes: [], origin: 'seed', visual: { description: n.appearance, imageId: null }, met: false,
    })),
    quests: SEED_QUESTS.map((q) => ({ id: q.id, title: q.title, status: 'active', summary: q.summary, notes: [], rewardXp: q.rewardXp, rewardGold: q.rewardGold })),
    deeds: [],
    journal: [],
    chronicle: '',
  };
  return { world, memory };
}

// ------------------------------------------------------------ battle maps

/**
 * A small arena for a fight. Obstacles are single tiles that never touch each
 * other or the spawn columns, so the floor is always fully connected.
 */
export function buildArena(terrain: string, indoors: boolean, rng: Rng): string[] {
  const width = 22, height = 13;
  const grid = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.')));
  const wanted = indoors ? 10 : ({ f: 16, h: 10, m: 12, s: 8, p: 4, r: 3 } as Record<string, number>)[terrain] ?? 6;
  let placed = 0;
  for (let tries = 0; tries < 400 && placed < wanted; tries++) {
    const x = 5 + Math.floor(rng() * (width - 10)), y = 1 + Math.floor(rng() * (height - 2));
    let clear = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (grid[y + dy]?.[x + dx] === '#' && y + dy > 0 && y + dy < height - 1) clear = false;
    if (!clear) continue;
    grid[y][x] = '#';
    placed++;
  }
  return grid.map((r) => r.join(''));
}
