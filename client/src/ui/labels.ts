// Interface labels that are looked up by a key at run time rather than written where they are used.
// They live in one place so the translation test can check every one of them.
import type { InvFilter, InvSort } from '../../../shared/inventory';
import type { QuestStatus } from '../../../shared/types';

export const FILTER_LABELS: Record<InvFilter, string> = { all: 'All', weapon: 'Weapons', armor: 'Armor', consumable: 'Potions', quest: 'Quest', other: 'Other' };
export const SORT_LABELS: Record<InvSort, string> = { manual: 'As packed', type: 'Type', rarity: 'Rarity', value: 'Value', weight: 'Weight', name: 'Name' };
export const STAT_LABELS = { ac: 'Armor Class', toHit: 'To hit', damage: 'Average damage' } as const;
export const ITEM_KIND_LABELS = {
  martial: 'Martial weapon', simple: 'Simple weapon', light: 'Light armor', medium: 'Medium armor', heavy: 'Heavy armor',
  shield: 'Shield', consumable: 'Consumable', wondrous: 'Wondrous item', item: 'Item',
} as const;

export const NAV_LABELS = { sheet: 'Character', inventory: 'Inventory', journal: 'Journal', map: 'Map' } as const;

export const JOURNAL_TABS = { quests: 'Quests', people: 'People', places: 'Places', lore: 'Lore' } as const;
export const QUEST_HEADS: Record<QuestStatus, string> = { active: 'Open quests', completed: 'Completed', failed: 'Failed' };
export const JOURNAL_EMPTY: Record<keyof typeof JOURNAL_TABS, string> = {
  quests: 'No quests yet. The Vale is wide; go and find trouble.',
  people: 'You have met nobody yet.',
  places: 'No places on the map yet.',
  lore: 'Nothing written down yet.',
};

export const TEXT_SIZES = ['normal', 'large', 'larger'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const SIZE_LABELS: Record<TextSize, string> = { normal: 'Normal', large: 'Large', larger: 'Larger' };

export const SHORTCUTS: { keys: string[]; text: string }[] = [
  { keys: ['C'], text: 'Character sheet' },
  { keys: ['I'], text: 'Inventory' },
  { keys: ['J'], text: 'Journal' },
  { keys: ['M'], text: 'Map' },
  { keys: ['Esc'], text: 'Close a window or cancel' },
  { keys: ['1', '4'], text: 'Switch hero or bookmark in an open window' },
  { keys: ['W', 'A', 'S', 'D'], text: 'Move in a fight' },
  { keys: ['1', '9'], text: 'Use an action in a fight' },
  { keys: ['Space'], text: 'End your turn' },
];

/** Every label above, for the translation test. */
/** What the server answers when it cannot take an art pack, in words. */
export const ART_ERRORS = {
  failed: 'That did not work. The server log says more.',
  forbidden: 'Only the host of a table can change the art packs.',
  no_images: 'There are no PNG images in this zip.',
  not_a_zip: 'This is not a zip file.',
  too_big: 'This pack is too large (96 MB at most).',
  unknown_pack: 'The server does not know this pack.',
  not_installed: 'This pack is not on the server yet.',
  download_failed: 'The download failed. The server may not reach the internet.',
  bad_request: 'That did not work. The server log says more.',
} as const;

export const ALL_LABELS: string[] = [
  ...Object.values(ART_ERRORS),
  ...Object.values(FILTER_LABELS), ...Object.values(SORT_LABELS), ...Object.values(STAT_LABELS), ...Object.values(ITEM_KIND_LABELS), ...Object.values(NAV_LABELS),
  ...Object.values(JOURNAL_TABS), ...Object.values(QUEST_HEADS), ...Object.values(JOURNAL_EMPTY), ...Object.values(SIZE_LABELS), ...SHORTCUTS.map((s) => s.text),
];
