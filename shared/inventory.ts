// What the inventory screen needs to know about items beyond their definitions:
// which slot they go in, what they weigh, how to sort and filter a backpack, and what
// changes for a hero who puts one on. Display only; the server still decides what is allowed.

import { ITEMS } from './content';
import { armorClass, isProficient, weaponAttack } from './build';
import { itemDef } from './items';
import { SLOT_IDS, type Character, type ItemDef, type ItemInstance, type SlotId } from './types';

export function slotForItem(def: ItemDef): SlotId | null {
  if (def.kind === 'weapon') return 'mainHand';
  if (def.kind === 'shield') return 'offHand';
  if (def.kind === 'armor') return 'armor';
  if (def.kind === 'wondrous') return def.slot ?? null;
  return null;
}

/** Weight of one item in pounds. A story item weighs what the catalogue item it is based on weighs, otherwise nothing worth counting. */
export function itemWeight(def: ItemDef | undefined): number {
  if (!def) return 0;
  return def.weight ?? (def.story?.baseId ? ITEMS[def.story.baseId]?.weight ?? 0 : 0);
}

/** Everything a hero wears and carries, in pounds. */
export function carriedWeight(c: Pick<Character, 'bag' | 'equipment'>, storyItems?: Record<string, ItemDef>): number {
  const all = [...c.bag, ...Object.values(c.equipment)];
  const total = all.reduce((sum, it) => sum + (it ? itemWeight(itemDef(storyItems, it.defId)) * it.qty : 0), 0);
  return Math.round(total * 10) / 10;
}

/** What a hero can carry by the 5e rule: 15 pounds per point of Strength. */
export const carryCapacity = (c: Pick<Character, 'abilities'>) => c.abilities.str * 15;

export const INV_FILTERS = ['all', 'weapon', 'armor', 'consumable', 'quest', 'other'] as const;
export type InvFilter = (typeof INV_FILTERS)[number];
export type ItemGroup = Exclude<InvFilter, 'all'>;

/** The filter an item is found under. Quest items come first so they are never buried among the rest. */
export function itemGroup(def: ItemDef): ItemGroup {
  if (def.story?.quest) return 'quest';
  if (def.kind === 'weapon') return 'weapon';
  if (def.kind === 'armor' || def.kind === 'shield' || (def.kind === 'wondrous' && def.slot)) return 'armor';
  if (def.consumable || def.kind === 'consumable') return 'consumable';
  return 'other';
}

export const INV_SORTS = ['manual', 'type', 'rarity', 'value', 'weight', 'name'] as const;
export type InvSort = (typeof INV_SORTS)[number];

const GROUP_ORDER: ItemGroup[] = ['quest', 'weapon', 'armor', 'consumable', 'other'];
const RARITY_ORDER = ['artifact', 'legendary', 'very_rare', 'rare', 'uncommon', 'common'];

export interface BagEntry { item: ItemInstance; def: ItemDef; index: number }

/**
 * The backpack as the player asked to see it. Entries keep the index they have in the real bag,
 * so moving one still names the right place. `name` gives the name in the player's language.
 */
export function arrangeBag(bag: (ItemInstance | null)[], storyItems: Record<string, ItemDef> | undefined, filter: InvFilter, sort: InvSort, name: (def: ItemDef) => string = (d) => d.name): BagEntry[] {
  const entries: BagEntry[] = [];
  bag.forEach((item, index) => {
    const def = item ? itemDef(storyItems, item.defId) : undefined;
    if (item && def && (filter === 'all' || itemGroup(def) === filter)) entries.push({ item, def, index });
  });
  if (sort === 'manual') return entries;
  const byName = (a: BagEntry, b: BagEntry) => name(a.def).localeCompare(name(b.def)) || a.index - b.index;
  const keys: Record<Exclude<InvSort, 'manual' | 'name'>, (e: BagEntry) => number> = {
    type: (e) => GROUP_ORDER.indexOf(itemGroup(e.def)),
    rarity: (e) => RARITY_ORDER.indexOf(e.def.rarity ?? 'common'),
    value: (e) => -e.def.value,
    weight: (e) => -itemWeight(e.def) * e.item.qty,
  };
  if (sort === 'name') return entries.sort(byName);
  return entries.sort((a, b) => keys[sort](a) - keys[sort](b) || byName(a, b));
}

/** Average of a dice expression such as "2d6+3". */
export function diceAverage(expr: string): number {
  let total = 0;
  for (const part of expr.replace(/\s/g, '').match(/[+-]?[^+-]+/g) ?? []) {
    const sign = part.startsWith('-') ? -1 : 1;
    const body = part.replace(/^[+-]/, '');
    const m = /^(\d*)d(\d+)$/i.exec(body);
    total += sign * (m ? (Number(m[1] || 1) * (Number(m[2]) + 1)) / 2 : Number(body) || 0);
  }
  return total;
}

type Wearer = Pick<Character, 'classId' | 'abilities' | 'feats' | 'profBonus' | 'conditions' | 'equipment'>;

export interface StatChange {
  stat: 'ac' | 'toHit' | 'damage';
  now: number;
  then: number;
}

export interface EquipPreview {
  slot: SlotId;
  /** The hero's class is trained to use it. */
  usable: boolean;
  /** What it would replace, if anything. */
  replaces: ItemDef | null;
  /** Numbers that differ once it is equipped. Empty when nothing changes. */
  changes: StatChange[];
}

/** What changes for a hero who equips this item in place of whatever is in its slot now. Null for things that cannot be equipped. */
export function equipPreview(c: Wearer, def: ItemDef, storyItems?: Record<string, ItemDef>): EquipPreview | null {
  const slot = slotForItem(def);
  if (!slot) return null;
  const worn = Object.fromEntries(SLOT_IDS.map((s) => [s, c.equipment[s] ? itemDef(storyItems, c.equipment[s]!.defId) ?? null : null])) as Record<SlotId, ItemDef | null>;
  const replaces = worn[slot];
  const changes: StatChange[] = [];
  const push = (stat: StatChange['stat'], now: number, then: number) => { if (now !== then) changes.push({ stat, now, then }); };
  push('ac', armorClass(c, worn), armorClass(c, { ...worn, [slot]: def }));
  if (slot === 'mainHand') {
    const now = weaponAttack(c, worn.mainHand), then = weaponAttack(c, def);
    push('toHit', now.bonus, then.bonus);
    push('damage', diceAverage(now.damage), diceAverage(then.damage));
  }
  return { slot, usable: isProficient(c.classId, def), replaces: replaces && replaces.id !== def.id ? replaces : null, changes };
}
