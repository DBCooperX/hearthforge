// Standing with the factions of a region, and the rumours that travel between its places.
// The server owns every number; the browser only shows them. Both use these sums.

import type { Disposition, LocationKind } from './types';

export const FACTION_IDS = ['commons', 'guild', 'faith', 'outlaws'] as const;
export type FactionId = (typeof FACTION_IDS)[number];

export const STANDING_MIN = -100;
export const STANDING_MAX = 100;
/** The most one call of the Dungeon Master may move a standing. */
export const MAX_STEP = 12;
/** The most a standing may rise or fall in one day, so a single scene cannot buy or burn a name. */
export const MAX_PER_DAY = 30;

export const TIERS = ['hated', 'distrusted', 'neutral', 'liked', 'honoured'] as const;
export type Tier = (typeof TIERS)[number];

export const clampStanding = (n: number) => Math.max(STANDING_MIN, Math.min(STANDING_MAX, Math.round(n) || 0));

export function tierOf(standing: number): Tier {
  if (standing <= -60) return 'hated';
  if (standing <= -20) return 'distrusted';
  if (standing < 20) return 'neutral';
  if (standing < 60) return 'liked';
  return 'honoured';
}

/** What the traders' guild does to every price in its shops. */
export const TIER_PRICE: Record<Tier, number> = { hated: 1.25, distrusted: 1.1, neutral: 1, liked: 0.95, honoured: 0.9 };

/** How many steps toward hostile a faction's people move from what they felt to begin with. */
export const TIER_SHIFT: Record<Tier, number> = { hated: 2, distrusted: 1, neutral: 0, liked: -1, honoured: -2 };

const MOODS: Disposition[] = ['friendly', 'neutral', 'wary', 'hostile'];

/** How a person feels about the party once their faction's opinion is counted in. */
export function shiftDisposition(base: Disposition, tier: Tier): Disposition {
  const at = Math.max(0, Math.min(MOODS.length - 1, MOODS.indexOf(base) + TIER_SHIFT[tier]));
  return MOODS[at];
}

/** What each tier means in the story, for the players. */
export const TIER_TEXT: Record<Tier, string> = {
  hated: 'They want you gone, or worse.',
  distrusted: 'They keep their distance, and make you pay for it.',
  neutral: 'They do not know what to make of you yet.',
  liked: 'They greet you warmly and speak well of you.',
  honoured: 'They would stand beside you.',
};

export interface FactionDef {
  id: FactionId;
  /** Names a region may use for it: [English, German]. A region picks one by its seed. */
  names: readonly (readonly [string, string])[];
  blurb: string;
  /** Places whose people belong to it, unless they keep a shop. */
  kinds: readonly LocationKind[];
}

export const FACTIONS: readonly FactionDef[] = [
  {
    id: 'commons',
    names: [['Folk and Watch', 'Volk und Wache'], ['The Hearth-Folk', 'Das Herdvolk'], ['Villagers and Wardens', 'Dörfler und Wächter']],
    blurb: 'Farmers, townsfolk and the watch. They remember who kept them safe.',
    kinds: ['town', 'village', 'tavern'],
  },
  {
    id: 'guild',
    names: [["Traders' Guild", 'Händlergilde'], ['The Coin-Wardens', 'Die Münzwächter'], ["Merchants' Circle", 'Kaufmannsring']],
    blurb: 'Merchants, smiths and caravaners. They set the prices in every shop.',
    kinds: ['shop'],
  },
  {
    id: 'faith',
    names: [['Shrine-Keepers', 'Schreinhüter'], ['The Quiet Order', 'Der Stille Orden'], ['Keepers of the Flame', 'Hüter der Flamme']],
    blurb: 'Keepers of the shrines, healers and the faithful. They give shelter and mercy.',
    kinds: ['temple', 'shrine'],
  },
  {
    id: 'outlaws',
    names: [['The Underhand', 'Die Schattenhand'], ['The Road-Wolves', 'Die Wegwölfe'], ['The Grey Ledger', 'Das Graue Hauptbuch']],
    blurb: 'Smugglers, bandits and fences. They never forget a favour or a betrayal.',
    kinds: ['camp', 'ruin', 'cave'],
  },
];

/** A faction as the players see it. */
export interface FactionView {
  id: FactionId;
  name: string;
  blurb: string;
  standing: number;
  tier: Tier;
  /** The latest changes, newest last. */
  history: { day: number; delta: number; why: string }[];
}

/** A rumour the party has heard. */
export interface RumourView {
  id: string;
  text: string;
  /** The day it started, and the day the party heard it. */
  day: number;
  heard: number;
  /** Where it started, when the party knows the place. */
  from: string | null;
  /** True when it is about the party's own doings. */
  aboutParty: boolean;
}

/** Hexes a rumour travels in a day. */
export const RUMOUR_SPEED = 3;
/** Days after which a rumour is stale and nobody repeats it. */
export const RUMOUR_LIFE = 30;
