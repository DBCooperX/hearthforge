// Story illustrations: hand-drawn pictures of the big moments of an adventure (a boss steps out, a fight is won, a
// secret comes out), painted by an image model when the Dungeon Master marks such a moment. The Innkeeper picks the
// service, the model, the style and the limits; the cost goes on the players' credit like the rest of the AI.
// Pictures are made on this server's own account with the service and kept in its data folder. Nothing is mirrored.

export const PICTURE_PROVIDERS = ['gemini', 'fal', 'replicate', 'openai'] as const;
export type PictureProvider = (typeof PICTURE_PROVIDERS)[number];

export const PICTURE_PROVIDER_LABELS: Record<PictureProvider, string> = {
  gemini: 'Google Gemini (Nano Banana): keeps faces the same from picture to picture',
  fal: 'FLUX on fal.ai',
  replicate: 'FLUX on Replicate',
  openai: 'OpenAI GPT Image',
};

/** The setting that holds each service's key. OpenAI shares its key with the narrator. */
export const PICTURE_KEYS: Record<PictureProvider, string> = {
  gemini: 'GEMINI_API_KEY',
  fal: 'FAL_KEY',
  replicate: 'REPLICATE_API_TOKEN',
  openai: 'OPENAI_API_KEY',
};

export interface PictureModel {
  id: string;
  label: string;
  /** List price in US dollars for one picture of about 1 megapixel, as far as we know it (November 2026). */
  usd: number;
  /** How many earlier pictures it can take along to keep the heroes looking the same. 0: text only. */
  refs: number;
}

/**
 * The models offered for each service, cheapest sensible choice for this game first. The Innkeeper can type any other
 * model id the service knows; its price is then the one typed in.
 */
export const PICTURE_MODELS: Record<PictureProvider, PictureModel[]> = {
  gemini: [
    { id: 'gemini-3.1-flash-image', label: 'Nano Banana 2: the all-rounder', usd: 0.067, refs: 3 },
    { id: 'gemini-3.1-flash-lite-image', label: 'Nano Banana 2 Lite: half the price, less steady faces', usd: 0.034, refs: 2 },
    { id: 'gemini-3-pro-image', label: 'Nano Banana Pro: the finest, twice the price', usd: 0.134, refs: 3 },
    { id: 'gemini-2.5-flash-image', label: 'Nano Banana (first version, retires March 2027)', usd: 0.039, refs: 2 },
  ],
  fal: [
    { id: 'fal-ai/flux-2', label: 'FLUX.2 [dev]: very cheap', usd: 0.015, refs: 3 },
    { id: 'fal-ai/flux-2-pro', label: 'FLUX.2 [pro]', usd: 0.03, refs: 3 },
    { id: 'blackforestlabs/flux-3/text-to-image', label: 'FLUX 3: the newest, text only', usd: 0.048, refs: 0 },
  ],
  replicate: [
    { id: 'black-forest-labs/flux-2-pro', label: 'FLUX.2 [pro]', usd: 0.03, refs: 3 },
    { id: 'black-forest-labs/flux-schnell', label: 'FLUX.1 [schnell]: fastest and cheapest, text only', usd: 0.003, refs: 0 },
  ],
  openai: [
    { id: 'gpt-image-2.5-flare', label: 'GPT Image 2.5 Flare, medium quality', usd: 0.02, refs: 3 },
    { id: 'gpt-image-2.5-sunburst', label: 'GPT Image 2.5 Sunburst, medium quality: steadier edits', usd: 0.02, refs: 3 },
  ],
};

/** The moments the Dungeon Master may mark for a picture. */
export const PICTURE_MOMENTS = ['boss', 'victory', 'reveal', 'opening', 'arrival', 'farewell'] as const;
export type PictureMoment = (typeof PICTURE_MOMENTS)[number];

export const PICTURE_MOMENT_LABELS: Record<PictureMoment, string> = {
  boss: 'A boss or a mighty foe appears',
  victory: 'A hard fight is won',
  reveal: 'A big secret comes out',
  opening: 'The opening scene of an adventure',
  arrival: 'The party first sees a grand place',
  farewell: 'A death, a parting or the end of a quest',
};

export const PICTURE_STYLES = ['ink', 'storybook', 'woodcut', 'custom'] as const;
export type PictureStyle = (typeof PICTURE_STYLES)[number];

export const PICTURE_STYLE_LABELS: Record<PictureStyle, string> = {
  ink: 'Ink and watercolour, like a field journal',
  storybook: 'Painted storybook, warm and soft',
  woodcut: 'Old woodcut, black ink on parchment',
  custom: 'My own description',
};

/** What each style asks the model for. In English: the models follow English best. */
export const STYLE_PROMPTS: Record<Exclude<PictureStyle, 'custom'>, string> = {
  ink: 'Hand-drawn illustration in ink and watercolour on warm off-white paper: confident loose pen lines with cross-hatching in the shadows, transparent washes of muted earthy colour with a few vivid accents, soft bleeding edges and visible paper texture, like a page from a fantasy explorer\'s field journal.',
  storybook: 'Painted storybook illustration in gouache: warm light, soft edges, rich but gentle colours, painterly brush texture, in the tradition of classic fantasy book plates.',
  woodcut: 'Old woodcut print: bold black ink lines and carved hatching on aged parchment, a single muted red accent at most, like an illustration in a sixteenth-century chronicle.',
};

/** How the Innkeeper set illustrations up. Kept in the data folder; changes apply at once. */
export interface PictureConfig {
  on: boolean;
  provider: PictureProvider;
  /** The model per service, so switching back and forth keeps each choice. */
  models: Record<PictureProvider, string>;
  style: PictureStyle;
  /** The style in the Innkeeper's own words, used when style is "custom". */
  customStyle: string;
  /** Which moments may get a picture. */
  moments: Record<PictureMoment, boolean>;
  /** At most this many pictures per table and day (real days, counted from midnight). */
  perTableDay: number;
  /** At least this many minutes between two pictures at one table. */
  gapMinutes: number;
  /** The server stops painting for the rest of the month after this many dollars. 0: no cap. */
  monthUsd: number;
  /** What one picture is billed at, in dollars, when the model's price differs from the list. Empty: the list price. */
  usd: Partial<Record<string, number>>;
}

export const DEFAULT_PICTURE_CONFIG: PictureConfig = {
  on: false,
  provider: 'gemini',
  models: { gemini: 'gemini-3.1-flash-image', fal: 'fal-ai/flux-2', replicate: 'black-forest-labs/flux-2-pro', openai: 'gpt-image-2.5-flare' },
  style: 'ink',
  customStyle: '',
  moments: { boss: true, victory: true, reveal: true, opening: false, arrival: false, farewell: false },
  perTableDay: 4,
  gapMinutes: 20,
  monthUsd: 10,
  usd: {},
};

/** The price a picture is billed at. */
export function pictureUsd(c: PictureConfig, provider: PictureProvider, model: string): number {
  const own = c.usd[`${provider}:${model}`];
  if (typeof own === 'number' && own >= 0) return own;
  return PICTURE_MODELS[provider].find((m) => m.id === model)?.usd ?? 0.05;
}

/** How many earlier pictures a model takes along. Unknown models get none, to be safe. */
export function pictureRefs(provider: PictureProvider, model: string): number {
  return PICTURE_MODELS[provider].find((m) => m.id === model)?.refs ?? 0;
}

/** One picture on the server. */
export interface PictureInfo {
  id: string;
  /** The table it belongs to, and the story entry it illustrates. */
  table: string;
  tableTitle: string;
  entry: number;
  moment: PictureMoment | 'sample';
  /** What the Dungeon Master asked to be shown, in English. */
  caption: string;
  provider: PictureProvider;
  model: string;
  usd: number;
  at: number;
  /** Path the browser loads it from. */
  url: string;
}

/** What the Innkeeper sees. */
export interface PictureLibrary {
  config: PictureConfig;
  /** Which services have a key. */
  keys: Record<PictureProvider, boolean>;
  month: { count: number; usd: number };
  today: { count: number; usd: number };
  recent: PictureInfo[];
  /** Megabytes of pictures kept on disk. */
  diskMb: number;
  /** The last thing that went wrong, for the Innkeeper. */
  error: string;
}

export const PICTURE_ERRORS = {
  failed: 'That did not work. The server log says more.',
  no_key: 'This service needs an API key first (Art → Switches and keys).',
  refused: 'The service refused this picture. Try other words, or another service.',
  bad_request: 'That did not work. The server log says more.',
  busy: 'A picture is being painted. Wait a moment.',
  not_found: 'That picture is no longer there.',
} as const;
export type PictureError = keyof typeof PICTURE_ERRORS;

/** Why the server did not paint a moment. Sent to the Dungeon Master, so in English and never shown to players. */
export const PICTURE_GATES = {
  off: 'Illustrations are switched off on this server.',
  no_key: 'No picture service is set up.',
  moment: 'This kind of moment does not get a picture here.',
  day: 'This table has had all its pictures for today.',
  gap: 'The last picture at this table was too recent.',
  month: 'The server has spent its picture budget for this month.',
  credit: 'The players at this table have no credit left.',
  busy: 'A picture is already being painted for this table.',
} as const;
export type PictureGate = keyof typeof PICTURE_GATES;
