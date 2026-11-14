// Hex overworld geometry, terrain and route finding, shared by the server (which
// moves the party) and the client (which previews a route before you commit).
// Hexes are pointy-topped in an "odd-r" offset layout: q is the column, r the row,
// and odd rows are shifted half a hex to the right.

import { tr, type Lang } from './i18n';

export interface Hex {
  q: number;
  r: number;
}

export type TerrainCode = 'p' | 'f' | 'h' | 'm' | 's' | 'w' | 'r';
export const UNKNOWN = '?';

export interface TerrainDef {
  name: string;
  /** Hours to cross one hex on foot. */
  hours: number;
  /** Chance of a hostile encounter when entering the hex, by day. */
  encounter: number;
  passable: boolean;
  color: string;
  icon: string;
}

export const TERRAIN: Record<TerrainCode, TerrainDef> = {
  r: { name: 'road', hours: 1.5, encounter: 0.04, passable: true, color: '#b79a6a', icon: '' },
  p: { name: 'plains', hours: 2, encounter: 0.07, passable: true, color: '#7f9a4f', icon: '' },
  f: { name: 'forest', hours: 3, encounter: 0.13, passable: true, color: '#3f6b3a', icon: '🌲' },
  h: { name: 'hills', hours: 3, encounter: 0.11, passable: true, color: '#8a7a4e', icon: '⛰' },
  s: { name: 'swamp', hours: 4, encounter: 0.18, passable: true, color: '#4f6157', icon: '🌾' },
  m: { name: 'mountains', hours: 6, encounter: 0.16, passable: true, color: '#77726e', icon: '🏔' },
  w: { name: 'water', hours: 0, encounter: 0, passable: false, color: '#2f5f8a', icon: '' },
};

/** Miles across one hex. */
export const HEX_MILES = 6;
/** What a route planner assumes about a hex nobody has seen yet. */
const UNCHARTED_HOURS = 3;
const UNCHARTED_ENCOUNTER = 0.12;

export const hexKey = (h: Hex) => `${h.q},${h.r}`;
export const sameHex = (a: Hex, b: Hex) => a.q === b.q && a.r === b.r;

const EVEN_ROW = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
const ODD_ROW = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];

export function neighbors(h: Hex, width: number, height: number): Hex[] {
  const out: Hex[] = [];
  for (const [dq, dr] of h.r & 1 ? ODD_ROW : EVEN_ROW) {
    const n = { q: h.q + dq, r: h.r + dr };
    if (n.q >= 0 && n.r >= 0 && n.q < width && n.r < height) out.push(n);
  }
  return out;
}

export function hexDistance(a: Hex, b: Hex): number {
  const ax = a.q - (a.r - (a.r & 1)) / 2, bx = b.q - (b.r - (b.r & 1)) / 2;
  const dx = ax - bx, dz = a.r - b.r;
  return Math.max(Math.abs(dx), Math.abs(dz), Math.abs(dx + dz));
}

/** Centre of a hex in pixels, for a hex whose corner radius is `size`. */
export function hexCenter(h: Hex, size: number): { x: number; y: number } {
  return { x: size * Math.sqrt(3) * (h.q + 0.5 * (h.r & 1)) + (size * Math.sqrt(3)) / 2, y: size * 1.5 * h.r + size };
}

export const COMPASS = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'] as const;
export type Compass = (typeof COMPASS)[number];

/** Compass direction from one hex to another, for telling the DM and players where things are. */
export function direction(from: Hex, to: Hex): Compass {
  const a = hexCenter(from, 1), b = hexCenter(to, 1);
  const angle = Math.atan2(a.y - b.y, b.x - a.x); // screen y grows downward
  return COMPASS[((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8];
}

export const isNight = (minutes: number) => { const h = Math.floor(minutes / 60) % 24; return h >= 21 || h < 5; };

/** Chance of an encounter on entering a hex of this terrain at this time. Nights are more dangerous. */
export function encounterChance(code: string, minutes: number): number {
  const base = code === UNKNOWN ? UNCHARTED_ENCOUNTER : TERRAIN[code as TerrainCode]?.encounter ?? 0;
  return Math.min(0.9, base * (isNight(minutes) ? 1.5 : 1));
}

export const hoursFor = (code: string) => (code === UNKNOWN ? UNCHARTED_HOURS : TERRAIN[code as TerrainCode]?.hours ?? UNCHARTED_HOURS);
export const passable = (code: string) => code === UNKNOWN || !!TERRAIN[code as TerrainCode]?.passable;

/**
 * Fastest route between two hexes given what is known about the terrain.
 * `terrainAt` returns a terrain code, or '?' for unexplored hexes, which are assumed
 * to be crossable. Returns the hexes to walk through, excluding the start.
 */
export function findRoute(width: number, height: number, terrainAt: (h: Hex) => string, from: Hex, to: Hex): Hex[] | null {
  if (sameHex(from, to)) return [];
  if (!passable(terrainAt(to))) return null;
  const cost = new Map<string, number>([[hexKey(from), 0]]);
  const prev = new Map<string, Hex>();
  const open: { h: Hex; c: number }[] = [{ h: from, c: 0 }];
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].c < open[best].c) best = i;
    const { h, c } = open.splice(best, 1)[0];
    if (sameHex(h, to)) break;
    if (c > (cost.get(hexKey(h)) ?? Infinity)) continue;
    for (const n of neighbors(h, width, height)) {
      const t = terrainAt(n);
      if (!passable(t)) continue;
      const nc = c + hoursFor(t);
      if (nc < (cost.get(hexKey(n)) ?? Infinity)) {
        cost.set(hexKey(n), nc);
        prev.set(hexKey(n), h);
        open.push({ h: n, c: nc });
      }
    }
  }
  if (!prev.has(hexKey(to))) return null;
  const path: Hex[] = [];
  for (let cur: Hex | undefined = to; cur && !sameHex(cur, from); cur = prev.get(hexKey(cur))) path.unshift(cur);
  return path;
}

export interface RouteSummary {
  hexes: number;
  miles: number;
  hours: number;
  /** Chance of at least one encounter along the way. */
  encounterChance: number;
  /** Hexes per terrain name, in the order first met. "uncharted" counts unexplored hexes. */
  terrain: { name: string; hexes: number }[];
  /** Minutes on the clock at arrival. */
  arrival: number;
}

export function summarizeRoute(path: Hex[], terrainAt: (h: Hex) => string, startMinutes: number): RouteSummary {
  let minutes = startMinutes;
  let safe = 1;
  const terrain: { name: string; hexes: number }[] = [];
  for (const h of path) {
    const t = terrainAt(h);
    minutes += hoursFor(t) * 60;
    safe *= 1 - encounterChance(t, minutes);
    const name = t === UNKNOWN ? 'uncharted' : TERRAIN[t as TerrainCode].name;
    const row = terrain.find((x) => x.name === name);
    if (row) row.hexes++;
    else terrain.push({ name, hexes: 1 });
  }
  return { hexes: path.length, miles: path.length * HEX_MILES, hours: (minutes - startMinutes) / 60, encounterChance: 1 - safe, terrain, arrival: minutes };
}

/** "Day 2, 14:30" */
export function formatTime(minutes: number, lang: Lang = 'en'): string {
  const day = Math.floor(minutes / 1440) + 1;
  const h = Math.floor(minutes / 60) % 24, m = Math.floor(minutes % 60);
  return `${tr(lang, 'Day')} ${day}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timeOfDay(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  if (h < 5) return 'night';
  if (h < 8) return 'dawn';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}

export function formatHours(hours: number, lang: Lang = 'en'): string {
  const h = Math.floor(hours), m = Math.round((hours - h) * 60);
  if (h >= 24) { const d = Math.floor(h / 24), rest = h % 24; return `${d} ${tr(lang, d > 1 ? 'days' : 'day')}${rest ? ` ${rest} h` : ''}`; }
  return m ? `${h} h ${m} min` : `${h} h`;
}
