// The server's own library of sounds: effects, ambient loops and music, all made with the owner's ElevenLabs key
// and kept in the data folder. Every entry has a short description and tags, so the game (and later the Dungeon
// Master) can find one by words. Nothing in it comes from anyone else.
import { MUSIC_CONTEXTS, type MusicContext } from './music';
import { SFX_EVENTS, type SfxEvent } from './sfx';

export const LIBRARY_KINDS = ['music', 'ambient', 'sfx'] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];
export const isLibraryKind = (x: unknown): x is LibraryKind => LIBRARY_KINDS.includes(x as LibraryKind);

export type LibraryStatus = 'making' | 'ready' | 'failed';
/** Who asked for an entry: the starter set, the Innkeeper by hand, or the Dungeon Master during play. */
export type LibraryOrigin = 'starter' | 'innkeeper' | 'dm';

export interface LibraryEntry {
  id: string;
  kind: LibraryKind;
  title: string;
  /** What was asked for, in English. It is also the prompt sent to ElevenLabs. */
  description: string;
  tags: string[];
  /** Music and ambient: the scene it plays in. */
  scene?: MusicContext;
  /** Effects: the game moment it plays for. An effect without one is only found by words. */
  event?: SfxEvent;
  /** Length asked for, in seconds. */
  seconds: number;
  loop: boolean;
  status: LibraryStatus;
  /** Why the last try failed, in the provider's words, for the Innkeeper. */
  error?: string;
  /** Empty until the file is there. */
  src: string;
  bytes: number;
  /** What making it cost, in dollars, over every take. */
  usd: number;
  by: LibraryOrigin;
  /** A sound the Dungeon Master ordered: the table it was ordered at. */
  table?: string;
  createdAt: number;
  /** Players do not hear it. */
  disabled?: boolean;
  /** The line of the starter set it was made from. */
  starter?: string;
}

/** How far the starter set is made, per kind. */
export interface StarterProgress {
  /** Lines in the starter set. */
  total: number;
  /** Lines with a sound in the library (ready, or being made). */
  made: number;
  /** Lines still to make, and what they cost at the list price. Lines the owner deleted are not made again. */
  missing: number;
  missingUsd: number;
}

export interface LibraryView {
  /** An ElevenLabs key is set, so new sounds can be made. */
  canMake: boolean;
  entries: LibraryEntry[];
  /** Dollars per minute the server books for each kind. */
  usdPerMinute: Record<LibraryKind, number>;
  starter: Record<LibraryKind, StarterProgress>;
}

/** ElevenLabs API list prices (elevenlabs.io/pricing/api, 23 November 2026). */
export const SOUND_USD_PER_MINUTE: Record<LibraryKind, number> = { sfx: 0.12, ambient: 0.12, music: 0.15 };

/** Lengths the providers accept, in seconds. Effects and loops are made in one go; music can run five minutes. */
export const LENGTH_LIMITS: Record<LibraryKind, { min: number; max: number; fallback: number }> = {
  sfx: { min: 0.5, max: 30, fallback: 2 },
  ambient: { min: 5, max: 30, fallback: 30 },
  music: { min: 10, max: 300, fallback: 150 },
};

export const soundCost = (kind: LibraryKind, seconds: number) => (Math.max(0, seconds) / 60) * SOUND_USD_PER_MINUTE[kind];

export const LIBRARY_ERRORS = {
  failed: 'That did not work. The server log says more.',
  forbidden: 'The library is managed in the Innkeeper, by the owner of this server.',
  no_key: 'Add your ElevenLabs API key first (Sound and voice → Switches and keys).',
  not_allowed: 'ElevenLabs refused this. Your account may not include it (music needs a paid ElevenLabs plan). ElevenLabs said: {detail}',
  provider_failed: 'ElevenLabs could not make it. ElevenLabs said: {detail}',
  out_of_credit: 'Your ElevenLabs account has no credit left.',
  bad_request: 'That did not work. The server log says more.',
  not_found: 'The server does not know this sound.',
  busy: 'This sound is still being made.',
} as const;
export type LibraryErrorCode = keyof typeof LIBRARY_ERRORS;

const WORD = /[a-z0-9äöüéèà]+/g;
const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'at', 'with', 'to', 'for', 'by', 'is', 'some', 'very', 'sound', 'music', 'loop']);
/** The words of a text that count for a search: lower case, without little words. */
export function searchWords(text: string): string[] {
  return [...new Set((text.toLowerCase().match(WORD) ?? []).filter((w) => w.length > 1 && !STOP.has(w)))];
}

/** Tags from a free text: its words, for an entry that came without any. */
export function tagsFrom(text: string, max = 12): string[] {
  return searchWords(text).slice(0, max);
}

/**
 * How well an entry fits some words: tags count three, the title two, the description one, and a word that only
 * starts a tag ("mist" for "misty") counts half. Scene and event names count as tags.
 */
export function matchScore(e: Pick<LibraryEntry, 'title' | 'description' | 'tags' | 'scene' | 'event'>, words: string[]): number {
  if (!words.length) return 0;
  const tags = [...e.tags.map((t) => t.toLowerCase()), ...(e.scene ? [e.scene] : []), ...(e.event ? e.event.split('_') : [])];
  const title = searchWords(e.title);
  const desc = searchWords(e.description);
  let score = 0;
  for (const w of words) {
    if (tags.includes(w)) score += 3;
    else if (tags.some((t) => t.startsWith(w) || w.startsWith(t) && t.length > 3)) score += 1.5;
    if (title.includes(w)) score += 2;
    if (desc.includes(w)) score += 1;
    else if (desc.some((d) => d.startsWith(w) && w.length > 3)) score += 0.5;
  }
  return score;
}

/** The best matches for some words among the ready, switched-on entries of one kind, best first. */
export function searchLibrary(entries: LibraryEntry[], kind: LibraryKind | null, text: string, limit = 5): LibraryEntry[] {
  const words = searchWords(text);
  return entries
    .filter((e) => e.status === 'ready' && !e.disabled && (!kind || e.kind === kind))
    .map((e) => ({ e, s: matchScore(e, words) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.e.createdAt - a.e.createdAt)
    .slice(0, limit)
    .map((x) => x.e);
}

export const isScene = (x: unknown): x is MusicContext => MUSIC_CONTEXTS.includes(x as MusicContext);
export const isSfxEvent = (x: unknown): x is SfxEvent => SFX_EVENTS.includes(x as SfxEvent);
