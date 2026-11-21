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
export const PICTURE_MOMENTS = ['boss', 'victory', 'reveal', 'opening', 'place', 'farewell'] as const;
export type PictureMoment = (typeof PICTURE_MOMENTS)[number];

export const PICTURE_MOMENT_LABELS: Record<PictureMoment, string> = {
  boss: 'A boss or a mighty foe appears',
  victory: 'A hard fight is won',
  reveal: 'A big secret comes out',
  opening: 'The opening scene of an adventure',
  place: 'The party arrives at a new place for the first time',
  farewell: 'A death, a parting or the end of a quest',
};

export const PICTURE_STYLES = ['charcoal', 'ink', 'storybook', 'woodcut', 'custom'] as const;
export type PictureStyle = (typeof PICTURE_STYLES)[number];

export const PICTURE_STYLE_LABELS: Record<PictureStyle, string> = {
  charcoal: 'Black charcoal sketch on old paper, like a storybook of an old-school role-playing game',
  ink: 'Ink and watercolour, like a field journal',
  storybook: 'Painted storybook, warm and soft',
  woodcut: 'Old woodcut, black ink on parchment',
  custom: 'My own description',
};

/** What each style asks the model for. In English: the models follow English best. */
export const STYLE_PROMPTS: Record<Exclude<PictureStyle, 'custom'>, string> = {
  charcoal: 'Hand-drawn illustration in black charcoal and graphite on warm, aged off-white paper: loose, confident, expressive strokes, smudged soft shadows rubbed in with a finger, bold dark accents on the focal point, sparse hatching, edges left unfinished and fading into the bare paper as a vignette. Monochrome black and grey, at most a faint sepia tint. In the manner of the storybook sketches that illustrate key scenes in classic isometric fantasy role-playing games.',
  ink: 'Hand-drawn illustration in ink and watercolour on warm off-white paper: confident loose pen lines with cross-hatching in the shadows, transparent washes of muted earthy colour with a few vivid accents, soft bleeding edges and visible paper texture, like a page from a fantasy explorer\'s field journal.',
  storybook: 'Painted storybook illustration in gouache: warm light, soft edges, rich but gentle colours, painterly brush texture, in the tradition of classic fantasy book plates.',
  woodcut: 'Old woodcut print: bold black ink lines and carved hatching on aged parchment, a single muted red accent at most, like an illustration in a sixteenth-century chronicle.',
};

/**
 * Hero portraits always share one look, whatever style the story pictures use, so every party looks like one game:
 * warm, painted, in colour, and sitting well inside Hearthforge's round brass frames.
 */
export const PORTRAIT_STYLE = 'Painted fantasy character portrait for a dark-fantasy tavern game: head and shoulders, three-quarter view, face fully visible and centred, looking just past the viewer. Painterly oil brushwork over a fine ink underdrawing, rich but muted colours in warm candlelit tones of amber, ember orange, deep brown and the character\'s own colours, soft rim light, a dark smoky background with a faint warm glow behind the head. Square format, the head in the middle third, nothing important near the corners because the picture is shown in a round frame.';

/**
 * Battle figures: the miniatures on the battle map, painted once and reused. A hero's figure is painted from their
 * portrait, so the two match; a monster is painted once per kind and look for the whole server. The image models
 * cannot paint a transparent background, so they paint on one flat key colour that the browser takes out again.
 */
export const FIGURE_STYLE = 'A single painted fantasy miniature figure for a tabletop battle map, in the same painterly look as Hearthforge\'s hero portraits: oil brushwork over a fine ink underdrawing, rich but muted colours, warm candlelit key light from the upper left, a crisp clean silhouette with a thin dark outline so it reads from far away. The whole body from head to feet (or claws, tail and wingtips), nothing cut off by the edge, a small margin all round, centred. Seen from the front at a slight three-quarter turn and slightly from above, as a player looks down at a miniature on the table.';

/** The flat colour figures are painted on, named for the image model, and its value for the browser. */
export const FIGURE_KEYS = {
  magenta: { words: 'pure magenta (#FF00FF)', rgb: [255, 0, 255] },
  green: { words: 'pure chroma green (#00FF00)', rgb: [0, 255, 0] },
} as const;
export type FigureKey = keyof typeof FIGURE_KEYS;

/** The background part of every figure prompt. */
export const figureBackdrop = (key: FigureKey) => `Background: one perfectly flat, uniform ${FIGURE_KEYS[key].words} colour filling the whole image edge to edge, no gradient, no texture, no vignette. No floor, no ground, no cast shadow, no base, no pedestal, no scenery. Do not use that background colour anywhere on the figure. No text, no letters, no frame, no border, no watermark, no signature.`;

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
  /** Paint a portrait of each new hero from the choices made in the creator. */
  portraits: boolean;
  /** At most this many portraits per account and day, so trying looks does not run up a bill. */
  portraitsPerDay: number;
  /** Paint a small portrait of each named person the party meets, billed to the table. */
  npcPortraits: boolean;
  /** At most this many such portraits per table and day. */
  npcPortraitsPerDay: number;
  /** Paint battle figures for heroes (from their portraits) and for each kind of monster. */
  figures: boolean;
  /** At most this many new battle figures per day for the whole server. */
  figuresPerDay: number;
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
  style: 'charcoal',
  customStyle: '',
  portraits: true,
  portraitsPerDay: 3,
  npcPortraits: true,
  npcPortraitsPerDay: 6,
  figures: true,
  figuresPerDay: 20,
  moments: { boss: true, victory: true, reveal: true, opening: false, place: true, farewell: false },
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
  moment: PictureMoment | 'sample' | 'portrait' | 'npc' | 'figure';
  /** For a battle figure: what it shows ("h:<hero>|<portrait>" or "m:<monster>|<look>"). */
  subject?: string;
  /** For a battle figure: the flat colour it was painted on, which the browser takes out. */
  keyColor?: FigureKey;
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
