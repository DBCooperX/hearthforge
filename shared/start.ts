// How a table's adventure begins: which region, which premise and which world seed.
// The host chooses in the table room before the adventure starts.
import type { Lang } from './i18n';
import type { CampaignPick } from './campaign';

type L = Record<Lang, string>;

export const REGIONS = ['classic', 'random'] as const;
export type RegionChoice = (typeof REGIONS)[number];

export interface StartOptions {
  /** 'classic' is the handcrafted Emberfall Vale; 'random' builds a region from the seed. */
  region: RegionChoice;
  /** A preset id from PREMISES, 'surprise' (the seed picks one) or 'custom'. */
  premise: string;
  /** The host's own premise, used when premise is 'custom'. */
  custom: string;
  /** The world seed as shown and shared. The same seed, region and premise rebuild the same starting world. */
  seed: string;
  /** A campaign book from the server's library. While set, the book decides where and how the story begins. */
  campaign?: CampaignPick | null;
}

export interface PremiseInfo {
  id: string;
  icon: string;
  label: L;
  blurb: L;
}

/** The ready-made ways an adventure can open. What each one tells the Dungeon Master lives on the server. */
export const PREMISES: PremiseInfo[] = [
  {
    id: 'arrival', icon: '🧭',
    label: { en: 'Looking for work', de: 'Auf Arbeitssuche' },
    blurb: { en: 'You have just arrived in town, looking for work and a name for yourselves.', de: 'Ihr seid gerade in der Stadt angekommen und sucht Arbeit und einen Namen.' },
  },
  {
    id: 'shipwreck', icon: '🌊',
    label: { en: 'Shipwrecked', de: 'Schiffbrüchig' },
    blurb: { en: 'Your ship broke up in the night. You wake on a strange shore among the wreckage.', de: 'Euer Schiff ist in der Nacht zerschellt. Ihr erwacht an einem fremden Ufer zwischen Trümmern.' },
  },
  {
    id: 'caravan', icon: '🐎',
    label: { en: 'Caravan guards', de: 'Karawanenwachen' },
    blurb: { en: 'You rode in guarding a merchant caravan. The last night on the road did not go to plan.', de: 'Ihr habt eine Händlerkarawane hierher begleitet. Die letzte Nacht unterwegs lief nicht nach Plan.' },
  },
  {
    id: 'prison', icon: '⛓️',
    label: { en: 'Prison break', de: 'Gefängnisausbruch' },
    blurb: { en: 'The prison wagon lies overturned and the guards are gone. You are free, for now.', de: 'Der Gefangenenwagen liegt umgestürzt da, die Wachen sind fort. Ihr seid frei, vorerst.' },
  },
  {
    id: 'festival', icon: '🎪',
    label: { en: 'Festival gone wrong', de: 'Ein Fest läuft aus dem Ruder' },
    blurb: { en: 'You came for the festival. At the height of the evening, something goes badly wrong.', de: 'Ihr seid wegen des Festes gekommen. Auf dem Höhepunkt des Abends geht etwas gründlich schief.' },
  },
  {
    id: 'letter', icon: '✉️',
    label: { en: 'A letter from an old friend', de: 'Ein Brief von einem alten Freund' },
    blurb: { en: 'An old friend asked each of you to come. When you arrive, the friend is missing.', de: 'Ein alter Freund hat jeden von euch hergebeten. Als ihr ankommt, ist er verschwunden.' },
  },
];

export const SURPRISE = 'surprise';
export const CUSTOM = 'custom';
export const CUSTOM_MAX = 400;
export const isPremise = (id: unknown): id is string => id === SURPRISE || id === CUSTOM || PREMISES.some((p) => p.id === id);

/** What the engine uses when nothing was chosen: the game as it always was. */
export const CLASSIC_START: StartOptions = { region: 'classic', premise: 'arrival', custom: '', seed: '' };
/** What a table opened in the lobby starts with. */
export const NEW_TABLE_START: StartOptions = { region: 'random', premise: SURPRISE, custom: '', seed: '' };

// ------------------------------------------------------------------- seeds

const SEED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // nothing that reads two ways aloud
export const SEED_MAX = 24;

/** A fresh seed such as "K7WQ-3MXD". */
export function newSeed(rng: () => number = Math.random): string {
  const pick = () => SEED_CHARS[Math.floor(rng() * SEED_CHARS.length) % SEED_CHARS.length];
  return `${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`;
}

/** A seed as typed, made comparable: upper case, letters, digits and dashes only. */
export function normalizeSeed(raw: unknown): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9-]+/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, SEED_MAX);
}

/** A well-mixed 32-bit number from any text. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // FNV alone leaves similar texts with similar low bits; this final stir spreads every bit.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A small, fast random number generator that always gives the same numbers for the same seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An independent stream of random numbers for one part of world building, so changing one part never shifts another. */
export const seedStream = (seed: string, part: string) => mulberry32(hashSeed(`${seed}|${part}`));
