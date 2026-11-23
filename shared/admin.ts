// What the Innkeeper (the owner's admin panel) and the server say to each other.
// The settings registry lives here so the browser can label each setting and the
// translation test can demand German for every label.
import type { Lang } from './i18n';
import type { Money } from './credits';

export type SettingKind = 'secret' | 'model' | 'choice' | 'number' | 'text';
export type SettingGroup = 'dm' | 'play' | 'voice' | 'art' | 'server';

export interface SettingDef {
  key: string;
  group: SettingGroup;
  kind: SettingKind;
  label: string;
  help: string;
  /** What the server uses when nothing is set anywhere. */
  fallback: string;
  choices?: string[];
  min?: number;
  max?: number;
  /** Used the moment it is saved, without a restart. */
  live?: boolean;
}

export const MODEL_SUGGESTIONS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-2'];

/** Every setting the Innkeeper can change. The key is the environment variable of the same name. */
export const SETTINGS: SettingDef[] = [
  { key: 'ANTHROPIC_API_KEY', group: 'dm', kind: 'secret', fallback: '', label: 'Anthropic API key', help: 'The key the AI Dungeon Master uses. Without one the game runs with the scripted Dungeon Master.' },
  { key: 'HEARTHFORGE_DM_MODEL_BACKGROUND', group: 'dm', kind: 'model', fallback: 'claude-haiku-5-5', label: 'Model for background work', help: 'Memory summaries and routine beats such as short journeys and rests.' },
  { key: 'HEARTHFORGE_DM_MODEL_STANDARD', group: 'dm', kind: 'model', fallback: 'claude-sonnet-5-5', label: 'Model for normal turns', help: 'Everyday narration, conversation and monster turns.' },
  { key: 'HEARTHFORGE_DM_MODEL_KEY', group: 'dm', kind: 'model', fallback: 'claude-opus-5-5', label: 'Model for key moments', help: 'The opening scene, boss fights, level-ups, defeats and turning points.' },
  { key: 'HEARTHFORGE_DM_FORCE_MODEL', group: 'dm', kind: 'model', fallback: '', label: 'One model for everything', help: 'Leave empty to let the server pick a model per moment.' },
  { key: 'HEARTHFORGE_DM_STORY_ON_KEY', group: 'dm', kind: 'choice', fallback: 'off', choices: ['off', 'on'], label: 'Every story turn on the key-moment model', help: 'For a comparison session: all narration and replies outside fights use the model for key moments (Opus 5.5 unless you changed it), not only turning points. Background work and monster turns stay as they are. Costs noticeably more.' },
  { key: 'HEARTHFORGE_DM_EFFORT', group: 'dm', kind: 'choice', fallback: 'low', choices: ['low', 'medium', 'high', 'xhigh', 'max'], label: 'How hard the Dungeon Master thinks', help: 'Higher is slower and costs more.' },
  { key: 'HEARTHFORGE_DM_TONE', group: 'dm', kind: 'choice', fallback: 'heroic', choices: ['heroic', 'grim', 'comedic', 'cozy', 'mysterious'], label: 'Default tone of the story', help: 'What new tables start with. The host can change it in the table room.' },
  { key: 'HEARTHFORGE_DM_RULES', group: 'dm', kind: 'number', fallback: '3', min: 1, max: 5, label: 'Default challenge', help: '1 Coaching, 2 Gentle, 3 Balanced, 4 Firm, 5 Strict. New tables start here; the host can change it.' },
  { key: 'HEARTHFORGE_DM_RATING', group: 'dm', kind: 'choice', fallback: 'teen', choices: ['family', 'teen', 'mature'], label: 'Default content rating', help: 'Family keeps it gentle, teen is classic fantasy, mature allows darker themes. New tables start here.' },
  { key: 'HEARTHFORGE_DM_FLAVOUR', group: 'dm', kind: 'choice', fallback: 'pronounced', choices: ['subtle', 'pronounced', 'bold'], label: 'Default character flavour', help: 'How strongly the people of the story and the companions play their personality, clichés and humour. Heroes are never affected. New tables start here; the host can change it.' },
  { key: 'HEARTHFORGE_TURN_WAIT', group: 'play', kind: 'number', fallback: '8', min: 0, max: 120, label: 'Seconds to wait for the other players', help: 'After the first player acts in the story. 0 answers every action at once.' },
  { key: 'HEARTHFORGE_REACTION_WAIT', group: 'play', kind: 'number', fallback: '20', min: 0, max: 120, label: 'Seconds to decide on an opportunity attack', help: 'When an enemy leaves a hero\'s reach in a fight. After that the hero strikes. 0 never asks.' },
  { key: 'HEARTHFORGE_UNDO_WINDOW', group: 'play', kind: 'number', fallback: '3', min: 0, max: 30, label: 'Seconds to take an action back', help: 'After a player acts in the story, they may take it back for this long before the Dungeon Master answers. 0 answers at once.' },
  { key: 'HEARTHFORGE_MUSIC', group: 'play', kind: 'choice', fallback: 'on', choices: ['on', 'off'], label: 'Background music', help: 'Freely licensed tracks are downloaded onto the server when it starts. Manage them under Sound and voice → Music.' },
  { key: 'HEARTHFORGE_SFX', group: 'play', kind: 'choice', fallback: 'on', choices: ['on', 'off'], label: 'Sound effects', help: 'Sword hits, shots, spells, footsteps, coins and fanfares. Add the free Kenney CC0 recordings under Sound and voice → Sound effects; without them the browser makes the sounds itself. Off silences all effects for everyone.' },
  { key: 'FREESOUND_API_KEY', group: 'play', kind: 'secret', fallback: '', label: 'Freesound API key', help: 'Free from freesound.org/apiv2/apply. With it the server fetches CC0 ambient loops (crowd, town, forest, cave) by itself, and the Ambient tab gets a button for more.' },
  { key: 'HEARTHFORGE_NARRATOR', group: 'voice', kind: 'choice', fallback: 'on', choices: ['on', 'off'], label: 'Narrator', help: 'Reads the Dungeon Master\'s story aloud. Choose the voice under Sound and voice → Narrator; each player can mute it or turn it down. Off removes it for everyone.' },
  { key: 'OPENAI_API_KEY', group: 'voice', kind: 'secret', fallback: '', label: 'OpenAI API key', help: 'For illustrations, if you pick OpenAI there. From platform.openai.com. A few cents per picture.' },
  { key: 'ELEVENLABS_API_KEY', group: 'voice', kind: 'secret', fallback: '', label: 'ElevenLabs API key', help: 'For the narrator (if you pick an ElevenLabs voice) and for making sounds and music for the library under Sound and voice → Library. From elevenlabs.io. Pay-as-you-go works for sounds; music may need a paid plan.' },
  { key: 'HEARTHFORGE_ART', group: 'art', kind: 'choice', fallback: 'generated', choices: ['generated', 'kenney', '0x72'], label: 'Starting art pack', help: 'Only used until a pack is chosen under Art → Art packs.' },
  { key: 'HEARTHFORGE_AUTO_ASSETS', group: 'art', kind: 'choice', fallback: 'on', choices: ['on', 'off'], label: 'Fetch free art by itself', help: 'On downloads the freely licensed item icons (game-icons.net) the first time the server starts. Music has its own switch.' },
  { key: 'HEARTHFORGE_ART_UPLOADS', group: 'art', kind: 'choice', fallback: 'on', choices: ['on', 'off'], label: 'Art pack changes', help: 'Off locks the art library, also for the Innkeeper.' },
  { key: 'GEMINI_API_KEY', group: 'art', kind: 'secret', fallback: '', live: true, label: 'Google Gemini API key', help: 'For illustrations with Nano Banana. From aistudio.google.com, with billing switched on. A few cents per picture. Works at once, without a restart.' },
  { key: 'FAL_KEY', group: 'art', kind: 'secret', fallback: '', live: true, label: 'fal.ai API key', help: 'For illustrations with FLUX on fal.ai. From fal.ai/dashboard/keys. Works at once, without a restart.' },
  { key: 'REPLICATE_API_TOKEN', group: 'art', kind: 'secret', fallback: '', live: true, label: 'Replicate API token', help: 'For illustrations with FLUX on Replicate. From replicate.com/account/api-tokens. Works at once, without a restart.' },
  { key: 'HEARTHFORGE_AUTO_UPDATE', group: 'server', kind: 'choice', fallback: 'off', choices: ['off', 'on'], label: 'Automatic updates', help: 'Installs a new version by itself while nobody is playing.' },
  { key: 'HEARTHFORGE_TRUST_PROXY', group: 'server', kind: 'choice', fallback: 'off', choices: ['off', 'on'], label: 'Behind a reverse proxy', help: 'On reads the address of a player from the X-Forwarded-For header. Switch it on only behind a proxy you run.' },
];

export const SETTING_GROUPS: Record<SettingGroup, string> = {
  dm: 'Dungeon Master',
  play: 'Playing',
  voice: 'Voice',
  art: 'Art',
  server: 'Server',
};

/** A setting as the Innkeeper sees it. Secrets arrive masked. */
export interface SettingValue {
  key: string;
  /** The value in force after the next restart. Masked for secrets. */
  value: string;
  /** Where that value comes from: set in the Innkeeper, in the installer's .env, or the built-in default. */
  source: 'panel' | 'env' | 'default';
  /** True when a secret has a value. */
  set: boolean;
  /** True when the running server still uses another value. */
  pending: boolean;
}

export const ADMIN_ERRORS = {
  wrong_password: 'That password is not right.',
  too_many: 'Too many wrong attempts. Wait a few minutes.',
  signed_out: 'Your session has ended. Sign in again.',
  weak_password: 'The new password needs at least 8 characters.',
  bad_value: 'One of the values is not allowed.',
  bad_request: 'That did not work. The log says more.',
  failed: 'That did not work. The log says more.',
  no_updater: 'The updater is not running, so the server cannot update itself.',
  busy: 'The updater is busy. Try again in a moment.',
  bad_backup: 'This file is not a Hearthforge backup.',
  too_big: 'This file is too large.',
  disabled: 'The Innkeeper is switched off on this server.',
  not_found: 'That is no longer there.',
  not_innkeeper: 'Your account is not an innkeeper. Ask whoever runs this server.',
  wrong_login: 'That name or password is not right.',
  bad_name: 'A name needs 3 to 24 letters, digits, spaces, dots, dashes or underscores.',
  name_taken: 'That name is already taken.',
  last_innkeeper: 'The server needs at least one innkeeper.',
  not_yourself: 'You cannot do that to your own account.',
} as const;
export type AdminError = keyof typeof ADMIN_ERRORS;

export interface AdminStatus {
  /** False when HEARTHFORGE_ADMIN=off. */
  enabled: boolean;
  /** True while the first password (from the installer or the data folder) is still in use. */
  firstPassword: boolean;
}

/** DNS providers whose Caddy plugin takes a single API token. */
export const HTTPS_DNS_PROVIDERS = ['cloudflare', 'duckdns', 'hetzner', 'digitalocean'] as const;

/** What the Innkeeper sends to set HTTPS up. A missing dnsToken keeps the one in .env. */
export interface HttpsRequest { mode: 'on' | 'off'; domain?: string; local?: string; email?: string; dnsProvider?: string; dnsToken?: string }

/** HTTPS as the updater last saw it in .env, and how Caddy is doing. */
export interface HttpsStatus {
  /** The updater runs, so HTTPS can be changed from here. */
  connected: boolean;
  /** The updater has reported at least once (an older updater does not know about HTTPS). */
  known: boolean;
  on: boolean;
  state: 'idle' | 'working' | 'failed';
  message: string;
  domain: string;
  local: string;
  email: string;
  dnsProvider: string;
  /** A DNS token is set. The token itself never leaves .env. */
  dnsToken: boolean;
  /** Caddy's container state: running, exited, restarting, or none. */
  caddy: string;
  log: string[];
}

export type UpdaterState = 'idle' | 'checking' | 'building' | 'restarting' | 'failed';

/** What the updater sidecar reports. All of it is absent when no updater runs. */
export interface UpdaterStatus {
  connected: boolean;
  state: UpdaterState;
  /** Result of the last job, in words for the log view. */
  message: string;
  branch: string;
  commit: string;
  commitDate: string;
  subject: string;
  /** Commits on GitHub that this server does not have yet, newest first. */
  behind: number;
  incoming: { commit: string; date: string; subject: string }[];
  /** The newest commits this server runs. */
  recent: { commit: string; date: string; subject: string }[];
  checkedAt: string;
  /** The last version that did not build or start, if any. Auto update leaves it alone. */
  failed: string;
  log: string[];
}

export interface AdminOverview {
  version: string;
  startedAt: number;
  now: number;
  node: string;
  memoryMb: number;
  docker: boolean;
  dm: { mode: 'claude' | 'scripted'; background: string | null; standard: string | null; key: string | null; forced: string | null; storyOnKey?: boolean };
  tables: number;
  playing: number;
  connections: number;
  /** Settings were saved that the running server has not picked up yet. */
  restartPending: boolean;
  /** When a planned restart happens, in ms since 1970, or null. */
  restartAt: number | null;
  updater: UpdaterStatus;
  usageToday: UsageTotals;
  usageMonth: UsageTotals;
  /** What costs are shown in. Their amounts are dollars; the client multiplies by the rate. */
  money: Money;
}

export interface AdminTable {
  id: string;
  title: string;
  language: Lang;
  phase: string;
  paused: boolean;
  /** The table is in test mode: its host has a toolbox, and the campaign can go back to how it was. */
  testMode: boolean;
  region: string;
  seed: string;
  code: string | null;
  day: number;
  maxPlayers: number;
  hostId: string | null;
  players: { id: string; name: string; connected: boolean }[];
  heroes: { name: string; classId: string; level: number; owner: string }[];
  /** When the table was last saved, ISO time, or empty. */
  savedAt: string;
  sizeKb: number;
  usage: UsageTotals;
}

/** What earlier tables used up, which new stories are nudged away from. */
export interface AdminVariety {
  /** How many earlier tables are remembered. */
  tables: number;
  npcs: string[];
  places: string[];
  quests: string[];
}

/**
 * One table's whole story as the Innkeeper sees it: what the Dungeon Master has set up, and which
 * of it the party has already found. Things the party does not know yet are marked `known: false`.
 */
export interface AdminCampaign {
  id: string;
  title: string;
  language: Lang;
  phase: string;
  day: number;
  /** The region and what the Dungeon Master knows about it, in English. Empty before the adventure starts. */
  region: string;
  premise: string;
  /** Which premise was used: an id such as "arrival", or "custom" with the host's own text in `custom`. */
  premiseId: string;
  custom: string;
  /** The story so far: the running summary of older scenes. */
  chronicle: string;
  quests: { id: string; title: string; status: 'active' | 'completed' | 'failed'; summary: string; notes: string[]; rewardXp: number; rewardGold: number }[];
  mysteries: { id: string; question: string; solved: boolean; clues: { day: number; text: string; source: string; place: string }[] }[];
  /** Truths held back until something has happened. `revealed` is the world day when they came out. */
  secrets: { id: string; text: string; after: string; revealedDay: number | null }[];
  npcs: { id: string; name: string; role: string; disposition: string; met: boolean; place: string; notes: string[] }[];
  places: { id: string; name: string; kind: string; discovered: boolean; visited: boolean; origin: 'seed' | 'dm'; cleared: number | null; total: number | null }[];
  factions: { id: string; name: string; standing: number }[];
  /** Newest last. `day` is the world day (1 is the first). Negative days came before the adventure. */
  timeline: { id: string; day: number; what: string; where: string; knownBy: string; by: 'story' | 'party'; planned: boolean }[];
  journal: { day: number; text: string }[];
  rumours: { text: string; day: number; heardDay: number | null; from: string; aboutParty: boolean }[];
}

export interface AdminConnection {
  id: number;
  ip: string;
  since: number;
  agent: string;
  /** Empty while the connection is in the lobby. */
  table: string;
  tableTitle: string;
  name: string;
  playerId: string;
  host: boolean;
  /** The account signed in on this connection, once it sat down or opened a table. */
  account?: string;
}

export interface AdminBan { ip: string; note: string; at: number }

export interface UsageTotals {
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Estimated cost in US dollars, pictures and voice included. Null when a model's price is not known. */
  cost: number | null;
  /** The part of the cost (and of `calls`) that went to pictures and to the narrator's voice, in US dollars. */
  images?: number;
  voice?: number;
  /** Sounds and music made for the library. */
  sound?: number;
}

/** Costs that are not the Dungeon Master's tokens. */
export type ExtraKind = 'images' | 'voice' | 'sound';

export interface UsageReport {
  /** Per day, newest first. */
  days: ({ day: string } & UsageTotals)[];
  models: ({ model: string } & UsageTotals)[];
  tables: ({ table: string; title: string } & UsageTotals)[];
  total: UsageTotals;
  money: Money;
  /** Dollars per million tokens the estimate uses. */
  prices: { model: string; input: number; output: number; cacheRead: number }[];
}

export interface LogLine { id: number; at: number; level: 'info' | 'warn' | 'error'; text: string }

export interface BackupInfo { name: string; at: number; sizeKb: number; tables: number }
