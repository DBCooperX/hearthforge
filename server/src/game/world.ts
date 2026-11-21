// Overworld state and procedural generation. The server keeps the true terrain;
// players (and the route planner) only ever see hexes they have explored.

import { HEX_MILES, UNKNOWN, direction, findRoute, hexDistance, neighbors, type Hex, type TerrainCode } from '../../../shared/hex';
import type { Deed, Location, Mystery, Npc, Quest } from '../../../shared/types';
import { hashSeed, seedStream, type RegionChoice, type StartOptions } from '../../../shared/start';
import type { Siting, TerrainStyle } from '../data/regions';
import { WORLD_HEIGHT, WORLD_WIDTH, type RegionDef, type SeedLocation, type StageDef } from '../data/world';
import type { Lang } from '../../../shared/i18n';
import type { Rng } from './dice';
import { campaignRegion, classicRegion, openingFor, premiseTheme, randomRegion, resolvePremise } from './region';
import type { CampaignDigest } from '../campaign/library';

import type { SecretState, TimelineEvent } from './timeline';

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

/** Something people are saying. It starts in one place and reaches the others over the following days. */
export interface RumourState {
  id: string;
  text: string;
  /** The day it started. */
  day: number;
  /** The hex it started in. */
  at: Hex;
  /** The settlement it started in, when there was one. */
  fromId: string | null;
  /** About the party's own doings. */
  aboutParty: boolean;
  /** The day the party heard it, or null. */
  heard: number | null;
}

/** Everything the Dungeon Master should remember between scenes. Saved with the game. */
export interface MemoryState {
  npcs: NpcState[];
  quests: QuestState[];
  deeds: Deed[];
  /** One-line notes the DM leaves itself after each exchange, newest last. */
  journal: { day: number; text: string; /** World minutes; missing in older saves. */ at?: number }[];
  /** Older journal entries, condensed into a running summary. */
  chronicle: string;
  /** What people are saying, newest last. Missing in saves from before rumours. */
  rumours: RumourState[];
  /** The story's open questions and the clues found for each. Missing in saves from before clue tracking. */
  mysteries: Mystery[];
  /** What happened when, oldest first. Missing in saves from before the timeline. */
  timeline: TimelineEvent[];
  /** Revelations held back until their condition is met. Missing in saves from before the timeline. */
  secrets: SecretState[];
}

/** Where and how this table's story is set. Saved with the game; tables from before start options have none. */
export interface SettingState {
  /** The region with its article, in the table's language: "the Emberfall Vale". */
  name: string;
  /** What the Dungeon Master knows about the region. English. */
  premise: string;
  /** How the story opens, for the Dungeon Master. English. */
  opening: string;
  /** How the story opens, for the players, when no AI tells it. */
  intro: string;
  seed: string;
  region: RegionChoice;
  /** The premise in use, after 'surprise' was rolled. */
  premiseId: string;
  /** The host's own premise, when premiseId is 'custom'. */
  custom: string;
  /** The AI has reworded the rolled descriptions for this table. */
  fleshedOut?: boolean;
  /** The campaign book this table plays, with a copy of its digest so play goes on if the book leaves the shelf. */
  campaign?: CampaignState;
}

export interface CampaignState {
  id: string;
  title: string;
  digest: CampaignDigest;
  /** The section of the book the party is playing through now; its text goes with every turn. */
  focus: string | null;
  /** Sections the Dungeon Master has read so far, in order. */
  read: string[];
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

function generateTerrain(width: number, height: number, rng: Rng, style: TerrainStyle = {}): string[] {
  // The classic map never asks for a coast, so it draws exactly the numbers it always did.
  const coast = style.coast ? Math.floor(rng() * 4) : -1;
  const e1 = noiseField(width, height, 5, rng), e2 = noiseField(width, height, 2.5, rng);
  const m1 = noiseField(width, height, 4, rng), m2 = noiseField(width, height, 2, rng);
  const water = style.water ?? 0.3, hill = style.hill ?? 0.6, mountain = style.mountain ?? 0.72, swampTop = style.swampTop ?? 0.4;
  const out: string[] = [];
  for (let i = 0; i < width * height; i++) {
    const x = i % width, y = Math.floor(i / width);
    let elevation = e1[i] * 0.7 + e2[i] * 0.3;
    if (coast >= 0) {
      // The land falls away into the sea toward one edge, along a ragged shoreline.
      const fromEdge = [x, width - 1 - x, y, height - 1 - y][coast];
      const reach = 3 + e2[i] * 3;
      elevation -= Math.max(0, (reach - fromEdge) / reach) * 0.5;
    }
    const moisture = m1[i] * 0.65 + m2[i] * 0.35 + (style.wet ?? 0);
    let t: TerrainCode;
    if (elevation < water) t = 'w';
    else if (elevation > mountain) t = 'm';
    else if (elevation > hill) t = 'h';
    else if (moisture > 0.62 && elevation < swampTop) t = 's';
    else if (moisture > 0.5) t = 'f';
    else t = 'p';
    out.push(t);
  }
  return out;
}

/** Give every place of a rolled region a hex that suits it: the home settlement first, the rest around it. */
function placeRegion(region: RegionDef, cells: string[], width: number, height: number, rng: Rng) {
  const idx = (h: Hex) => h.r * width + h.q;
  const all: Hex[] = [];
  for (let r = 1; r < height - 1; r++) for (let q = 1; q < width - 1; q++) all.push({ q, r });
  const land = all.filter((h) => cells[idx(h)] !== 'w');
  const byWater = (h: Hex) => neighbors(h, width, height).some((n) => cells[idx(n)] === 'w');
  const taken: Hex[] = [];
  const best = (pool: Hex[], site: Siting | undefined, fallback: Hex): Hex => {
    let choice = fallback, top = -Infinity;
    for (const h of pool) {
      const t = cells[idx(h)];
      const score = (site?.prefer?.includes(t) ? 2 : 0) + (site?.water && byWater(h) ? 2.5 : 0) - (t === 'm' && !site?.prefer?.includes('m') ? 3 : 0) + rng() * 1.5;
      if (score > top) { top = score; choice = h; }
    }
    return choice;
  };

  const home = region.locations.find((l) => l.id === region.startId)!;
  const middle = land.filter((h) => h.q >= 4 && h.q <= width - 5 && h.r >= 3 && h.r <= height - 4);
  const homeHex = best(middle.length ? middle : land, { ...home.site, dist: [0, 0], prefer: 'p' }, { q: Math.floor(width / 2), r: Math.floor(height / 2) });
  home.q = homeHex.q; home.r = homeHex.r;
  taken.push(homeHex);

  for (const loc of region.locations) {
    if (loc.parentId || loc === home) continue;
    const [min, max] = loc.site?.dist ?? [3, 7];
    const apart = (gap: number) => (h: Hex) => taken.every((t) => hexDistance(t, h) >= gap);
    const inRing = (h: Hex) => { const d = hexDistance(homeHex, h); return d >= min && d <= max; };
    // Ideally in its ring and well clear of the others; then anywhere clear; then anywhere free.
    const pool = [land.filter((h) => inRing(h) && apart(3)(h)), land.filter(apart(3)), land.filter(apart(1))].find((p) => p.length) ?? [];
    const hex = best(pool, loc.site, { q: Math.min(width - 2, homeHex.q + 1 + taken.length), r: homeHex.r });
    loc.q = hex.q; loc.r = hex.r;
    taken.push(hex);
  }
  for (const loc of region.locations) {
    const parent = loc.parentId && region.locations.find((l) => l.id === loc.parentId);
    if (parent) { loc.q = parent.q; loc.r = parent.r; }
  }
}

/** A hex in the wild near the home settlement where the story can open: on a shore if asked, else in open country. */
function wildStart(home: Hex, shore: boolean, locations: SeedLocation[], cells: string[], width: number, height: number, rng: Rng): Hex | null {
  const idx = (h: Hex) => h.r * width + h.q;
  let choice: Hex | null = null, top = -Infinity;
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      const h = { q, r }, t = cells[idx(h)], d = hexDistance(home, h);
      if (t === 'w' || t === 'm' || d < 2 || d > (shore ? 4 : 3)) continue;
      if (locations.some((l) => l.q === q && l.r === r)) continue;
      const wet = neighbors(h, width, height).some((n) => cells[idx(n)] === 'w');
      const score = (shore && wet ? 4 : 0) + (t === 'r' || t === 'p' ? 1 : 0) - d * 0.3 + rng();
      if (score > top) { top = score; choice = h; }
    }
  }
  return choice;
}

export interface NewWorld {
  world: WorldState;
  memory: MemoryState;
  setting: SettingState;
}

/**
 * Build the world a table starts in. Everything comes from `start.seed` through its own
 * streams of random numbers, so the same seed, region and premise always give the same map,
 * places, people and quests, and changing the premise does not redraw the map.
 */
export function generateWorld(start: StartOptions, lang: Lang = 'en', book?: { id: string; digest: CampaignDigest }): NewWorld {
  const { seed } = start;
  const premiseId = book ? 'campaign' : resolvePremise(start);
  const region = book ? campaignRegion(book.digest, seed, lang) : start.region === 'random' ? randomRegion(seed, lang, premiseTheme(premiseId)) : classicRegion(lang);
  const width = WORLD_WIDTH, height = WORLD_HEIGHT;
  const cells = generateTerrain(width, height, seedStream(seed, `terrain|${start.region}`), region.terrain);
  const idx = (h: Hex) => h.r * width + h.q;
  if (!region.placed) placeRegion(region, cells, width, height, seedStream(seed, 'places'));
  const top = region.locations.filter((l) => !l.parentId);
  for (const loc of top) if (loc.terrain) cells[idx(loc)] = loc.terrain;

  // Every seeded place must be reachable on foot from the start: plan a route that
  // treats water as merely very slow, then turn any water on it into a ford.
  const home = region.locations.find((l) => l.id === region.startId)!;
  // A rolled town may stand on a shore; the classic one is given open ground all round.
  for (const n of neighbors(home, width, height)) if (cells[idx(n)] === 'm' || (region.placed && cells[idx(n)] === 'w')) cells[idx(n)] = 'p';
  const wading = (h: Hex) => (cells[idx(h)] === 'w' ? 'm' : cells[idx(h)]);
  const ford = (to: Hex) => {
    const route = findRoute(width, height, wading, home, to) ?? [];
    for (const h of route) if (cells[idx(h)] === 'w') cells[idx(h)] = 'p';
    return route;
  };
  for (const loc of top) {
    if (loc.id === home.id) continue;
    const route = ford(loc);
    // A road joins the town and the village.
    if (loc.kind === 'village') for (const h of route.slice(0, -1)) if (cells[idx(h)] !== 'm') cells[idx(h)] = 'r';
  }

  const opening = book
    ? {
      premiseId, startIn: 'town' as const,
      opening: `This table plays the published adventure "${book.digest.title}". Open the story the way the book opens, adapted to these heroes: ${book.digest.opening}`,
      intro: lang === 'de' ? `Eure Geschichte beginnt in ${region.tokens.town}.` : `Your story begins in ${region.tokens.town}.`,
    }
    : openingFor(premiseId, start.custom, region, lang);
  const outside = opening.startIn === 'wild' || opening.startIn === 'shore'
    ? wildStart(home, opening.startIn === 'shore', region.locations, cells, width, height, seedStream(seed, 'opening'))
    : null;
  if (outside) ford(outside);
  const indoors = opening.startIn === 'tavern' && region.tavernId ? region.tavernId : home.id;

  const locations: LocationState[] = region.locations.map((l) => ({
    id: l.id, name: l.name, kind: l.kind, q: l.q, r: l.r, parentId: l.parentId ?? null, description: l.description,
    visited: false, origin: 'seed', visual: { description: l.appearance, imageId: null }, zone: null,
    discovered: !!l.known, ...(l.stages ? { stages: l.stages, cleared: 0 } : {}), ...(l.questId ? { questId: l.questId } : {}),
  }));
  const world: WorldState = {
    seed: hashSeed(seed), width, height, terrain: cells.join(''), explored: '0'.repeat(width * height),
    party: outside ?? { q: home.q, r: home.r }, minutes: 8 * 60, placeId: outside ? null : indoors, locations,
  };
  reveal(world, world.party, 2);
  const memory: MemoryState = {
    npcs: region.npcs.map((n) => ({
      id: n.id, name: n.name, role: n.role, description: n.description, disposition: n.disposition, locationId: n.locationId,
      notes: [], origin: 'seed', visual: { description: n.appearance, imageId: null }, met: false,
    })),
    quests: region.quests.map((q) => ({ id: q.id, title: q.title, status: 'active', summary: q.summary, notes: [], rewardXp: q.rewardXp, rewardGold: q.rewardGold })),
    deeds: [],
    journal: [],
    chronicle: '',
    rumours: [],
    mysteries: [],
    timeline: [],
    secrets: [],
  };
  const lair = region.locations.find((l) => l.questId);
  const dist = lair ? `about ${hexDistance(home, lair) * HEX_MILES} miles ${direction(home, lair)}` : 'not far';
  const setting: SettingState = {
    name: region.name, premise: region.premise.replace('{dist}', dist), opening: opening.opening, intro: opening.intro,
    seed, region: start.region, premiseId, custom: premiseId === 'custom' ? start.custom.trim() : '',
    ...(book ? { campaign: { id: book.id, title: book.digest.title, digest: book.digest, focus: null, read: [] } } : {}),
  };
  return { world, memory, setting };
}
