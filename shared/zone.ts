// Zone maps: the middle layer between the hex overworld and the battle grid. While the party is in
// a place (a village, a marsh, a dungeon) the players see a small map of it: the spots the story has
// named (the toll house, the jetty, the reeds), where the party stands, and what it has explored.
// The server keeps the zone; the layout is procedural and stable, so a spot never jumps around.
import type { TerrainCode } from './hex';
import type { LocationKind } from './types';

export const SPOT_KINDS = [
  'square', 'house', 'tavern', 'shop', 'smithy', 'temple', 'shrine', 'mill', 'well', 'gate', 'tower', 'bridge',
  'jetty', 'water', 'reeds', 'field', 'woods', 'grave', 'cave', 'room', 'camp', 'ruin', 'spot',
] as const;
export type SpotKind = (typeof SPOT_KINDS)[number];

export const SPOT_ICON: Record<SpotKind, string> = {
  square: '⛲', house: '🏠', tavern: '🍺', shop: '🛒', smithy: '⚒️', temple: '⛪', shrine: '🕯️', mill: '🌾', well: '🪣', gate: '🚪',
  tower: '🗼', bridge: '🌉', jetty: '⚓', water: '🌊', reeds: '🌿', field: '🌱', woods: '🌲', grave: '🪦', cave: '🕳️', room: '🕯️',
  camp: '⛺', ruin: '🏚️', spot: '📍',
};

/** How the map of a place is drawn. */
export interface ZoneStyle {
  /** Houses and lanes, open country, or rock and tunnels. */
  ground: 'settlement' | 'wild' | 'underground';
  /** The country around it, from the hex the place stands in. */
  terrain: TerrainCode;
  /** Open water borders the place. */
  shore: boolean;
}

export interface ZoneSpot {
  id: string;
  name: string;
  kind: SpotKind;
  /** Position on a 100 × 70 sheet. */
  x: number;
  y: number;
  /** The party has been there. Spots it only heard of or saw from afar are not. */
  visited: boolean;
  /** Spots a path leads to from here. A path is stored once, on the newer spot. */
  links: string[];
  /** A known place this spot stands for, such as the tavern of the village. */
  placeId?: string;
  /** A section of a dungeon, by its number. */
  section?: number;
  cleared?: boolean;
}

export interface ZoneView {
  style: ZoneStyle;
  /** Seeds the decoration, so the map looks the same every time. */
  seed: number;
  spots: ZoneSpot[];
  /** Where the party stands. */
  at: string | null;
}

export const ZONE_W = 100;
export const ZONE_H = 70;
export const MAX_SPOTS = 20;

const ARTICLES = new Set(['the', 'a', 'an', 'der', 'die', 'das', 'den', 'dem', 'des', 'am', 'im', 'beim', 'zum', 'zur', 'an', 'auf', 'bei', 'vor', 'hinter', 'at', 'by', 'near', 'in', 'on', 'to', 'outside', 'inside', 'vor', 'ins']);

const words = (name: string) => name.toLowerCase().replace(/ß/g, 'ss').split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** A name without articles and punctuation, for matching: "the Toll House" and "toll house" are one spot. */
export function spotKey(name: string): string {
  return words(name).filter((w) => !ARTICLES.has(w)).join(' ');
}

// Each word of the name is tested in order; the first kind that matches wins. English and German.
const KIND_WORDS: [SpotKind, RegExp][] = [
  ['tavern', /^(tavern|inn|taproom|alehouse|pub)$|wirtshaus|gasthaus|gasthof|taverne|schenke|^krug$/],
  ['smithy', /smith|forge|anvil|schmiede/],
  ['shop', /^(shop|store|stall|stalls|market-stall)$|laden$|krämer|händler|^stand$/],
  ['temple', /temple|chapel|church|abbey|tempel|kapelle|kirche|abtei/],
  ['shrine', /shrine|altar|schrein/],
  ['mill', /^mill|mühle|muehle/],
  ['well', /^well$|brunnen/],
  ['square', /^(square|market|marketplace|green|plaza)$|platz$|markt$|anger$/],
  ['jetty', /^(jetty|pier|dock|docks|wharf|harbour|harbor|landing|boardwalk|quay)$|steg$|anleger|hafen$|^kai$|mole$/],
  ['bridge', /bridge|brücke|bruecke/],
  ['reeds', /reed|rushes|^bog$|marsh|^fen$|schilf|moor$|sumpf|ried$/],
  ['water', /^(lake|pond|river|stream|pool|shore|bank|ford|creek|spring)$|see$|teich|weiher|fluss$|bach$|ufer$|tümpel|furt$|quelle$/],
  ['grave', /grave|cemetery|graveyard|crypt|tomb|barrow|friedhof|gruft|grab$|krypta/],
  ['cave', /^(cave|cavern|grotto|tunnel|tunnels|adit|shaft|den|mine|warren)$|höhle|stollen|grotte|schacht|mine$|bau$/],
  ['gate', /^(gate|door|entrance|gatehouse)$|tor$|eingang|pforte/],
  ['tower', /tower|turm|^watch$|warte$/],
  ['ruin', /ruin/],
  ['camp', /^camp$|lager$|zelt/],
  ['woods', /^(wood|woods|forest|grove|thicket|copse|orchard)$|wald$|hain$|gehölz|dickicht/],
  ['field', /^(field|fields|meadow|pasture|farm|garden|yard)$|acker|feld$|wiese|weide$|garten$/],
  ['room', /^(room|chamber|hall|cellar|vault|storeroom|guardroom|attic|kitchen)$|room$|kammer|zimmer|halle$|keller$|gewölbe|saal$|stube$|küche$/],
  ['house', /^(house|hut|cottage|home|manor|lodge|barn|shed|hall)$|house$|haus$|hütte$|kate$|hof$|scheune$/],
];

/** What a spot is, guessed from its name: "Zollhaus" is a house, "Steg" a jetty, "the reeds" reeds. */
export function spotKind(name: string, fallback: SpotKind = 'spot'): SpotKind {
  const ws = words(name).filter((w) => !ARTICLES.has(w));
  // The last word usually carries the meaning ("Old Mill Pond" is water), so it is tried first.
  for (const w of [...ws].reverse()) for (const [kind, re] of KIND_WORDS) if (re.test(w)) return kind;
  return fallback;
}

/** The spot kind a known place stands for on its zone map. */
export function kindOfPlace(kind: LocationKind): SpotKind {
  const map: Record<LocationKind, SpotKind> = {
    town: 'square', village: 'square', tavern: 'tavern', shop: 'shop', temple: 'temple', shrine: 'shrine', camp: 'camp',
    dungeon: 'gate', ruin: 'ruin', cave: 'cave', landmark: 'spot',
  };
  return map[kind];
}

export function zoneStyle(kind: LocationKind, terrain: TerrainCode, shore: boolean, sections: boolean): ZoneStyle {
  const ground = kind === 'dungeon' || kind === 'cave' ? 'underground'
    : kind === 'town' || kind === 'village' ? 'settlement'
    : sections && kind !== 'ruin' && kind !== 'camp' ? 'underground' : 'wild';
  return { ground, terrain, shore };
}

/** A small seeded random stream. */
export function zoneRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashText(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const MARGIN_X = 9, MARGIN_Y = 8;

/**
 * Where a new spot goes: a short walk from the spot it is reached from, in the direction with the
 * most room. Underground, the way leads on down and to the right, like a dungeon plan.
 */
export function placeSpot(zone: ZoneView, from: ZoneSpot | null): { x: number; y: number } {
  const rnd = zoneRng(zone.seed + zone.spots.length * 7919);
  const base = from ?? { x: ZONE_W / 2, y: ZONE_H / 2 };
  if (!zone.spots.length) return { x: base.x, y: base.y };
  const under = zone.style.ground === 'underground';
  let best = { x: base.x, y: base.y }, bestScore = -Infinity;
  for (let i = 0; i < 24; i++) {
    const angle = under ? (-0.35 + rnd() * 1.6) * Math.PI / 2 : rnd() * Math.PI * 2;
    const dist = 15 + rnd() * 9;
    const x = Math.max(MARGIN_X, Math.min(ZONE_W - MARGIN_X, base.x + Math.cos(angle) * dist * 1.25));
    const y = Math.max(MARGIN_Y, Math.min(ZONE_H - MARGIN_Y, base.y + Math.sin(angle) * dist));
    const room = Math.min(...zone.spots.map((s) => Math.hypot((s.x - x) / 1.25, s.y - y)));
    // Plenty of room, but not far from where it is reached from.
    const score = Math.min(room, 20) - Math.hypot((x - base.x) / 1.25, y - base.y) * 0.15 + rnd() * 0.5;
    if (score > bestScore) { bestScore = score; best = { x, y }; }
  }
  return { x: Math.round(best.x * 10) / 10, y: Math.round(best.y * 10) / 10 };
}

/** The spot with this name, ignoring articles and case; a short name may match a longer one ("Steg" and "alter Steg"). */
export function findSpot(zone: ZoneView, name: string): ZoneSpot | null {
  const key = spotKey(name);
  if (!key) return null;
  const exact = zone.spots.find((s) => s.id === name || spotKey(s.name) === key);
  if (exact) return exact;
  const kw = key.split(' ');
  const hits = zone.spots.filter((s) => {
    const sw = spotKey(s.name).split(' ');
    const [short, long] = sw.length <= kw.length ? [sw, kw] : [kw, sw];
    return short.join('').length >= 4 && short.every((w) => long.includes(w));
  });
  return hits.length === 1 ? hits[0] : null;
}

/** A spot whose name appears in the scene header: "Zollhaus, upper floor" is in the Zollhaus. */
export function spotInText(zone: ZoneView, text: string): ZoneSpot | null {
  const ws = ` ${spotKey(text)} `;
  const hits = zone.spots.filter((s) => { const k = spotKey(s.name); return k.length >= 3 && ws.includes(` ${k} `); });
  // The longest name wins: "the old mill pond" before "the old mill".
  hits.sort((a, b) => spotKey(b.name).length - spotKey(a.name).length);
  return hits[0] ?? null;
}

/** The paths between spots, each once. */
export function zonePaths(zone: ZoneView): [ZoneSpot, ZoneSpot][] {
  const byId = new Map(zone.spots.map((s) => [s.id, s]));
  const out: [ZoneSpot, ZoneSpot][] = [];
  const seen = new Set<string>();
  for (const s of zone.spots) {
    for (const id of s.links) {
      const o = byId.get(id);
      const key = [s.id, id].sort().join('|');
      if (o && !seen.has(key)) { seen.add(key); out.push([o, s]); }
    }
  }
  return out;
}
