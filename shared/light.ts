// Light and vision on the battle map (SRD 5.2): bright light, dim light and darkness,
// light sources with a radius, darkvision and blindsight. Shared, so the browser
// draws exactly the light the server rules with.
//
// The rules that matter in a fight:
//  - Darkness is heavily obscured: a creature there is unseen by anyone who has to see it
//    with eyes. Dim light only hinders Perception, which the grid does not roll.
//  - Darkvision treats dim light as bright and darkness as dim, out to its range.
//  - Blindsight perceives everything within its range, light or not (walls still block).
//  - Attacking a target you cannot see has disadvantage; an attacker the target cannot
//    see has advantage. Both together cancel out.
//  - Spells that need a target you can see, and opportunity attacks, need sight.

import { tileBlocksSight, tilesBetween, type Biome } from './battlemap';
import type { SpeciesId } from './types';

export const LIGHT_LEVELS = ['dark', 'dim', 'bright'] as const;
export type LightLevel = (typeof LIGHT_LEVELS)[number];
export const isLightLevel = (v: unknown): v is LightLevel => typeof v === 'string' && (LIGHT_LEVELS as readonly string[]).includes(v);

/** Radii in feet: bright light out to `bright`, then dim light for `dim` feet more. */
export interface LightKind { bright: number; dim: number; carried: boolean }

/**
 * Every kind of light the game knows. Carried ones are held by a hero or monster and move
 * with them; the rest stand on the battle map. New SRD items and spells add a line here.
 */
export const LIGHT_KINDS = {
  torch: { bright: 20, dim: 20, carried: true },
  lantern: { bright: 30, dim: 30, carried: true },
  candle: { bright: 5, dim: 5, carried: true },
  /** The Light cantrip, cast on an object the caster holds. */
  light_spell: { bright: 20, dim: 20, carried: true },
  /** A campfire or a hearth. */
  fire: { bright: 20, dim: 20, carried: false },
  brazier: { bright: 10, dim: 10, carried: false },
  sconce: { bright: 15, dim: 15, carried: false },
  lamp: { bright: 15, dim: 15, carried: false },
  /** Glowing fungus, phosphorescent water: a faint glimmer. */
  glow: { bright: 0, dim: 10, carried: false },
} as const satisfies Record<string, LightKind>;
export type LightKindId = keyof typeof LIGHT_KINDS;
export const isLightKind = (v: unknown): v is LightKindId => typeof v === 'string' && v in LIGHT_KINDS;

/** Catalogue items a hero can light, best first, with the light each gives. */
export const LIGHT_ITEMS: { itemId: string; kind: LightKindId }[] = [
  { itemId: 'lantern_hooded', kind: 'lantern' },
  { itemId: 'torch', kind: 'torch' },
];

/** A light on the map. Carried lights take the position of whoever holds them. */
export interface LightSource { kind: LightKindId; x: number; y: number; holder?: string }

/** How far each species sees in the dark, in feet (SRD 5.2). */
export const SPECIES_DARKVISION: Record<SpeciesId, number> = {
  human: 0, dwarf: 120, elf: 60, halfling: 0, gnome: 60, orc: 120, dragonborn: 60, tiefling: 60, goliath: 0,
};

/** What a creature sees with. Ranges are in feet; 0 means none. */
export interface Senses { darkvision: number; blindsight: number }
export const NO_SENSES: Senses = { darkvision: 0, blindsight: 0 };

interface Pt { x: number; y: number }
const cheb = (a: Pt, b: Pt) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const rank = (l: LightLevel) => LIGHT_LEVELS.indexOf(l);
const brighter = (a: LightLevel, b: LightLevel) => (rank(a) >= rank(b) ? a : b);

/** Nothing but a wall stands between two tiles. */
export function clearLine(rows: string[], a: Pt, b: Pt): boolean {
  return !tilesBetween(a, b).some((p) => tileBlocksSight(rows[p.y]?.[p.x] ?? '#'));
}

const outdoors: Partial<Record<Biome, true>> = { plains: true, forest: true, hills: true, mountains: true, swamp: true, road: true, bridge: true, camp: true, town: true, ruin: true };

/** The time of day as a light level: day, dusk or dawn, night. */
export function daylight(minutes: number): LightLevel {
  const h = (((minutes % 1440) + 1440) % 1440) / 60;
  if (h >= 7 && h < 19) return 'bright';
  if ((h >= 5 && h < 7) || (h >= 19 && h < 21)) return 'dim';
  return 'dark';
}

/**
 * Light that fills the whole battle map before any source is counted. Dungeons and caves
 * are dark, a tavern's common room is lit, outdoors follows the sun. Town streets keep some
 * glow from windows at night, and the open sky is never fully dark under the stars.
 */
export function ambientLight(biome: Biome, minutes: number): LightLevel {
  if (biome === 'dungeon' || biome === 'cave') return 'dark';
  if (biome === 'tavern') return 'bright';
  if (!outdoors[biome]) return 'dark';
  const sun = daylight(minutes);
  if (biome === 'town' && sun === 'dark') return 'dim';
  return sun;
}

/** Light on every tile, row-major: the ambient light raised by every source that reaches it. */
export function lightGrid(rows: string[], ambient: LightLevel, sources: LightSource[]): LightLevel[] {
  const H = rows.length, W = rows[0]?.length ?? 0;
  const out: LightLevel[] = new Array(W * H).fill(ambient);
  if (ambient === 'bright') return out;
  for (const src of sources) {
    const k = LIGHT_KINDS[src.kind];
    if (!k) continue;
    const reach = Math.floor((k.bright + k.dim) / 5);
    for (let y = Math.max(0, src.y - reach); y <= Math.min(H - 1, src.y + reach); y++) {
      for (let x = Math.max(0, src.x - reach); x <= Math.min(W - 1, src.x + reach); x++) {
        const ft = cheb(src, { x, y }) * 5;
        if (ft > k.bright + k.dim) continue;
        const level: LightLevel = ft <= k.bright ? 'bright' : 'dim';
        const i = y * W + x;
        if (rank(out[i]) >= rank(level)) continue;
        if (!clearLine(rows, src, { x, y })) continue;
        out[i] = level;
      }
    }
  }
  return out;
}

/** The light level as a creature with these senses perceives it at a distance (in feet). */
export function perceivedLight(level: LightLevel, senses: Senses, distFt: number): LightLevel {
  if (senses.blindsight >= distFt && senses.blindsight > 0) return 'bright';
  if (senses.darkvision >= distFt && senses.darkvision > 0) return level === 'dark' ? 'dim' : 'bright';
  return level;
}

/**
 * Can an observer make out a creature standing on `at`? It needs a clear line, and the tile
 * must not be dark to it. `level` is the light on that tile.
 */
export function canSee(rows: string[], from: Pt, senses: Senses, at: Pt, level: LightLevel): boolean {
  if (!clearLine(rows, from, at)) return false;
  return perceivedLight(level, senses, cheb(from, at) * 5) !== 'dark';
}

export { brighter };

// ---------------------------------------------------------------- fixed lights

type Rng = () => number;

/**
 * Lights that belong to the place: torches in a dungeon's sconces, the campfire in a camp,
 * glowing fungus in a cave, lamps along a town street, the hearth of a tavern. Only walls
 * that touch open ground hold a sconce, so the light falls into the room.
 */
export function placeFixedLights(biome: Biome, rows: string[], rng: Rng): LightSource[] {
  const H = rows.length, W = rows[0]?.length ?? 0, midY = Math.floor(H / 2);
  const at = (x: number, y: number) => rows[y]?.[x] ?? '#';
  const open = (x: number, y: number) => '.=,~'.includes(at(x, y));
  const out: LightSource[] = [];
  /** A wall tile next to open ground, as close as possible to column x. */
  const wallNear = (x0: number, top: boolean): Pt | null => {
    for (let d = 0; d < 6; d++) for (const x of [x0 + d, x0 - d]) {
      const y = top ? 0 : H - 1;
      if (at(x, y) === '#' && open(x, top ? 1 : H - 2)) return { x, y };
    }
    return null;
  };
  /** An open tile, scanning outward from (x0, y0). */
  const openNear = (x0: number, y0: number): Pt | null => {
    for (let r = 0; r < 5; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (open(x0 + dx, y0 + dy)) return { x: x0 + dx, y: y0 + dy };
    return null;
  };
  const add = (kind: LightKindId, p: Pt | null) => { if (p && !out.some((o) => o.x === p.x && o.y === p.y)) out.push({ kind, ...p }); };
  switch (biome) {
    case 'dungeon': {
      // Sconces along both long walls, staggered; a few have burnt out.
      const cols = [5, 11, 16];
      cols.forEach((x, i) => { if (rng() < 0.75) add('sconce', wallNear(x + Math.floor(rng() * 3) - 1, i % 2 === 0)); });
      if (!out.length) add('sconce', wallNear(11, true));
      break;
    }
    case 'cave':
      for (let i = 0; i < 2; i++) add('glow', openNear(6 + Math.floor(rng() * (W - 12)), 2 + Math.floor(rng() * (H - 4))));
      // Whatever lairs here may keep a fire.
      if (rng() < 0.5) add('fire', openNear(W - 7, midY + (rng() < 0.5 ? -3 : 3)));
      break;
    case 'camp':
      add('fire', { x: Math.floor(W / 2), y: midY });
      break;
    case 'tavern':
      add('fire', wallNear(Math.floor(W / 2), false));
      break;
    case 'town':
      add('lamp', openNear(6, midY - 2));
      add('lamp', openNear(15, midY + 1));
      break;
    case 'ruin':
      if (rng() < 0.5) add('brazier', openNear(W - 8, midY));
      break;
    default:
      break;
  }
  return out;
}
