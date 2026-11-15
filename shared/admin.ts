// What the Innkeeper (the owner's admin panel) and the server say to each other.
// The settings registry lives here so the browser can label each setting and the
// translation test can demand German for every label.
import type { Lang } from './i18n';

export type SettingKind = 'secret' | 'model' | 'choice' | 'number' | 'text';
export type SettingGroup = 'dm' | 'play' | 'art' | 'server';

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
}

export const MODEL_SUGGESTIONS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-2'];

/** Every setting the Innkeeper can change. The key is the environment variable of the same name. */
export const SETTINGS: SettingDef[] = [
  { key: 'ANTHROPIC_API_KEY', group: 'dm', kind: 'secret', fallback: '', label: 'Anthropic API key', help: 'The key the AI Dungeon Master uses. Without one the game runs with the scripted Dungeon Master.' },
  { key: 'HEARTHFORGE_DM_MODEL_BACKGROUND', group: 'dm', kind: 'model', fallback: 'claude-haiku-5-5', label: 'Model for background work', help: 'Memory summaries and routine beats such as short journeys and rests.' },
  { key: 'HEARTHFORGE_DM_MODEL_STANDARD', group: 'dm', kind: 'model', fallback: 'claude-sonnet-5-5', label: 'Model for normal turns', help: 'Everyday narration, conversation and monster turns.' },
  { key: 'HEARTHFORGE_DM_MODEL_KEY', group: 'dm', kind: 'model', fallback: 'claude-opus-5-5', label: 'Model for key moments', help: 'The opening scene, boss fights, level-ups, defeats and turning points.' },
  { key: 'HEARTHFORGE_DM_FORCE_MODEL', group: 'dm', kind: 'model', fallback: '', label: 'One model for everything', help: 'Leave empty to let the server pick a model per moment.' },
  { key: 'HEARTHFORGE_DM_EFFORT', group: 'dm', kind: 'choice', fallback: 'low', choices: ['low', 'medium', 'high', 'xhigh', 'max'], label: 'How hard the Dungeon Master thinks', help: 'Higher is slower and costs more.' },
  { key: 'HEARTHFORGE_DM_TONE', group: 'dm', kind: 'choice', fallback: 'heroic', choices: ['heroic', 'grim', 'comedic', 'cozy', 'mysterious'], label: 'Default tone of the story', help: 'What new tables start with. The host can change it in the table room.' },
  { key: 'HEARTHFORGE_DM_RULES', group: 'dm', kind: 'number', fallback: '3', min: 1, max: 5, label: 'Default rules strictness', help: '1 coaches newcomers, 3 is balanced, 5 is unforgiving. New tables start here; the host can change it.' },
  { key: 'HEARTHFORGE_DM_RATING', group: 'dm', kind: 'choice', fallback: 'teen', choices: ['family', 'teen', 'mature'], label: 'Default content rating', help: 'Family keeps it gentle, teen is classic fantasy, mature allows darker themes. New tables start here.' },
  { key: 'HEARTHFORGE_TURN_WAIT', group: 'play', kind: 'number', fallback: '8', min: 0, max: 120, label: 'Seconds to wait for the other players', help: 'After the first player acts in the story. 0 answers every action at once.' },
  { key: 'HEARTHFORGE_UNDO_WINDOW', group: 'play', kind: 'number', fallback: '3', min: 0, max: 30, label: 'Seconds to take an action back', help: 'After a player acts in the story, they may take it back for this long before the Dungeon Master answers. 0 answers at once.' },
  { key: 'HEARTHFORGE_MUSIC', group: 'play', kind: 'choice', fallback: 'on', choices: ['on', 'off'], label: 'Background music', help: 'Freely licensed tracks are downloaded onto the server when it starts. Manage them under Assets.' },
  { key: 'HEARTHFORGE_ART', group: 'art', kind: 'choice', fallback: 'generated', choices: ['generated', 'kenney', '0x72'], label: 'Starting art pack', help: 'Only used until a pack is chosen under Assets.' },
  { key: 'HEARTHFORGE_AUTO_ASSETS', group: 'art', kind: 'choice', fallback: 'on', choices: ['on', 'off'], label: 'Fetch free art by itself', help: 'On downloads the freely licensed item icons (game-icons.net) the first time the server starts. Music has its own switch.' },
  { key: 'HEARTHFORGE_ART_UPLOADS', group: 'art', kind: 'choice', fallback: 'on', choices: ['on', 'off'], label: 'Art pack changes', help: 'Off locks the art library, also for the Innkeeper.' },
  { key: 'HEARTHFORGE_AUTO_UPDATE', group: 'server', kind: 'choice', fallback: 'off', choices: ['off', 'on'], label: 'Automatic updates', help: 'Installs a new version by itself while nobody is playing.' },
  { key: 'HEARTHFORGE_TRUST_PROXY', group: 'server', kind: 'choice', fallback: 'off', choices: ['off', 'on'], label: 'Behind a reverse proxy', help: 'On reads the address of a player from the X-Forwarded-For header. Switch it on only behind a proxy you run.' },
];

export const SETTING_GROUPS: Record<SettingGroup, string> = {
  dm: 'Dungeon Master',
  play: 'Playing',
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
} as const;
export type AdminError = keyof typeof ADMIN_ERRORS;

export interface AdminStatus {
  /** False when HEARTHFORGE_ADMIN=off. */
  enabled: boolean;
  /** True while the first password (from the installer or the data folder) is still in use. */
  firstPassword: boolean;
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
  dm: { mode: 'claude' | 'scripted'; background: string | null; standard: string | null; key: string | null; forced: string | null };
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
}

export interface AdminTable {
  id: string;
  title: string;
  language: Lang;
  phase: string;
  paused: boolean;
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
}

export interface AdminBan { ip: string; note: string; at: number }

export interface UsageTotals {
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Estimated cost in US dollars. Null when a model's price is not known. */
  cost: number | null;
}

export interface UsageReport {
  /** Per day, newest first. */
  days: ({ day: string } & UsageTotals)[];
  models: ({ model: string } & UsageTotals)[];
  tables: ({ table: string; title: string } & UsageTotals)[];
  total: UsageTotals;
  /** Dollars per million tokens the estimate uses. */
  prices: { model: string; input: number; output: number; cacheRead: number }[];
}

export interface LogLine { id: number; at: number; level: 'info' | 'warn' | 'error'; text: string }

export interface BackupInfo { name: string; at: number; sizeKb: number; tables: number }
