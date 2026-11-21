// Interface labels that are looked up by a key at run time rather than written where they are used.
// They live in one place so the translation test can check every one of them.
import type { InvFilter, InvSort } from '../../../shared/inventory';
import type { QuestStatus } from '../../../shared/types';
import { MUSIC_ERRORS } from '../../../shared/music';
import { SFX_ERRORS, SFX_PACKS } from '../../../shared/sfx';
import { PIPER_VOICES, PROVIDER_LABELS, VOICE_ERRORS } from '../../../shared/voice';
import { ADMIN_ERRORS, SETTINGS, SETTING_GROUPS } from '../../../shared/admin';
import { ACCOUNT_ERRORS } from '../../../shared/accounts';
import { SHOP_BLURBS, SHOP_NAMES } from '../../../shared/trade';
import { TROPHIES } from '../../../shared/achievements';
import { FACTIONS, TIER_TEXT } from '../../../shared/reputation';

export const FILTER_LABELS: Record<InvFilter, string> = { all: 'All', weapon: 'Weapons', armor: 'Armor', consumable: 'Potions', quest: 'Quest', other: 'Other' };
export const SORT_LABELS: Record<InvSort, string> = { manual: 'As packed', type: 'Type', rarity: 'Rarity', value: 'Value', weight: 'Weight', name: 'Name' };
export const STAT_LABELS = { ac: 'Armor Class', toHit: 'To hit', damage: 'Average damage' } as const;
export const ITEM_KIND_LABELS = {
  martial: 'Martial weapon', simple: 'Simple weapon', light: 'Light armor', medium: 'Medium armor', heavy: 'Heavy armor',
  shield: 'Shield', consumable: 'Consumable', wondrous: 'Wondrous item', item: 'Item',
} as const;

export const NAV_LABELS = { sheet: 'Character', inventory: 'Inventory', journal: 'Journal', map: 'Map' } as const;

export const JOURNAL_TABS = { quests: 'Quests', clues: 'Clues', people: 'People', places: 'Places', standing: 'Standing', lore: 'Lore' } as const;
/** How a faction rates the party, in the order from worst to best. */
export const TIER_LABELS = { hated: 'hated', distrusted: 'distrusted', neutral: 'neutral', liked: 'liked', honoured: 'honoured' } as const;
export const QUEST_HEADS: Record<QuestStatus, string> = { active: 'Open quests', completed: 'Completed', failed: 'Failed' };
export const JOURNAL_EMPTY: Record<keyof typeof JOURNAL_TABS, string> = {
  quests: 'No quests yet. The Vale is wide; go and find trouble.',
  clues: 'No clues yet. What you find out about the mysteries of this region is written here.',
  people: 'You have met nobody yet.',
  places: 'No places on the map yet.',
  standing: 'Nobody here knows you yet.',
  lore: 'Nothing written down yet.',
};

/** The tabs of the Settings window. */
export const SETTINGS_TABS = { game: 'Game', sound: 'Audio', keys: 'Keyboard' } as const;

export const TEXT_SIZES = ['normal', 'large', 'larger'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const SIZE_LABELS: Record<TextSize, string> = { normal: 'Normal', large: 'Large', larger: 'Larger' };

export const SHORTCUTS: { keys: string[]; text: string; combo?: boolean }[] = [
  { keys: ['Ctrl', 'M'], text: 'Hold to speak instead of typing', combo: true },
  { keys: ['C'], text: 'Character sheet' },
  { keys: ['I'], text: 'Inventory' },
  { keys: ['J'], text: 'Journal' },
  { keys: ['M'], text: 'Map' },
  { keys: ['T'], text: 'Trade, where there is a merchant' },
  { keys: ['Esc'], text: 'Close a window or cancel; with nothing open, the game menu' },
  { keys: ['1', '4'], text: 'Switch hero or bookmark in an open window' },
  { keys: ['W', 'A', 'S', 'D'], text: 'Move in a fight' },
  { keys: ['Shift', '←↑→↓'], text: 'Look around the battle map (or drag it, or point at its edge)' },
  { keys: ['1', '9'], text: 'Use an action in a fight' },
  { keys: ['Space'], text: 'End your turn' },
];

/** What the server answers when it cannot take an art pack, in words. */
export const ART_ERRORS = {
  failed: 'That did not work. The server log says more.',
  forbidden: 'Art packs are changed in the Innkeeper, by the owner of this server.',
  no_images: 'There are no PNG images in this zip.',
  not_a_zip: 'This is not a zip file.',
  too_big: 'This pack is too large (96 MB at most).',
  unknown_pack: 'The server does not know this pack.',
  not_installed: 'This pack is not on the server yet.',
  download_failed: 'The download failed. The server may not reach the internet.',
  bad_request: 'That did not work. The server log says more.',
} as const;

export { MUSIC_ERRORS };
export const SCENE_LABELS = { tavern: 'Tavern', town: 'Town', overworld: 'Overworld', dungeon: 'Dungeon', combat: 'Combat', boss: 'Boss fight' } as const;
export const ACCESS_LABELS = { auto: 'Downloads by itself', click: 'Paste a link', manual: 'Get it there, drop it here' } as const;

/** The Innkeeper's sections. */
export const INN_TABS = {
  overview: 'Overview', tables: 'Tables', players: 'Players', costs: 'Costs and credits', dm: 'Dungeon Master',
  sound: 'Sound and voice', art: 'Art', server: 'Server',
} as const;
export const SOUND_TABS = { music: 'Music', ambient: 'Ambient sounds', effects: 'Sound effects', narrator: 'Narrator', settings: 'Switches and keys' } as const;
export const ART_TABS = { art: 'Art packs', settings: 'Switches' } as const;
export const SERVER_TABS = { server: 'Updates and restart', backups: 'Backups', logs: 'Log' } as const;
export const INN_SECTIONS = {
  ai: 'AI and models', newTables: 'New tables start with', timing: 'Timing at the table', switches: 'On and off for everyone',
  soundKeys: 'Keys for sound services', art: 'Art settings', server: 'Server settings',
} as const;
export const SOURCE_LABELS = { panel: 'Set here', env: 'From the installer', default: 'Default' } as const;
export const PHASE_LABELS: Record<string, string> = { lobby: 'Gathering', explore: 'Exploring', combat: 'In a fight', defeat: 'Defeated' };
export const UPDATER_STATES = { idle: 'Ready', checking: 'Looking for a new version…', building: 'Building the new version…', restarting: 'Starting the new version…', failed: 'The last update failed' } as const;
export const KEY_RESULTS = {
  ok: 'The key works.',
  none: 'No key is set.',
  invalid: 'The Claude API refused this key.',
  unreachable: 'The server could not reach the Claude API.',
  error: 'The check did not work.',
} as const;

export const LOG_FILTERS = { all: 'Everything', warn: 'Warnings and errors', error: 'Errors only' } as const;
/** Why the server closed this browser's connection for good. */
export const CLOSED_REASONS = { banned: 'This server does not let you in.', removed: 'The innkeeper has closed your connection. Reload the page to come back.' } as const;
export const INN_MISC = { empty: 'Empty' } as const;

/** Every label above, for the translation test. */
/** What the trade window says about today's prices after haggling. */
export const TRADE_MOODS = ['Prices are 10% worse today', 'Prices are 10% better today', 'Prices are 20% better today'] as const;

export const ALL_LABELS: string[] = [
  ...Object.values(SETTINGS_TABS),
  ...Object.values(SHOP_NAMES), ...Object.values(SHOP_BLURBS), ...TRADE_MOODS,
  ...Object.values(LOG_FILTERS), ...Object.values(CLOSED_REASONS), ...Object.values(INN_MISC), ...Object.values(INN_TABS), ...Object.values(SOUND_TABS), ...Object.values(ART_TABS), ...Object.values(SERVER_TABS), ...Object.values(INN_SECTIONS), ...Object.values(SOURCE_LABELS), ...Object.values(PHASE_LABELS), ...Object.values(UPDATER_STATES), ...Object.values(KEY_RESULTS),
  ...Object.values(ADMIN_ERRORS), ...Object.values(ACCOUNT_ERRORS), ...Object.values(SETTING_GROUPS), ...SETTINGS.flatMap((d) => [d.label, d.help]),
  ...Object.values(ART_ERRORS), ...Object.values(MUSIC_ERRORS), ...Object.values(SFX_ERRORS), ...Object.values(VOICE_ERRORS), ...Object.values(PROVIDER_LABELS), ...PIPER_VOICES.map((v) => v.label), ...SFX_PACKS.map((p) => p.name), 'Other recordings', ...Object.values(SCENE_LABELS), ...Object.values(ACCESS_LABELS),
  ...Object.values(FILTER_LABELS), ...Object.values(SORT_LABELS), ...Object.values(STAT_LABELS), ...Object.values(ITEM_KIND_LABELS), ...Object.values(NAV_LABELS),
  ...Object.values(TIER_LABELS), ...Object.values(TIER_TEXT), ...FACTIONS.map((f) => f.blurb), ...TROPHIES.flatMap((x) => [x.name, x.text]),
  ...Object.values(JOURNAL_TABS), ...Object.values(QUEST_HEADS), ...Object.values(JOURNAL_EMPTY), ...Object.values(SIZE_LABELS), ...SHORTCUTS.map((s) => s.text),
];
