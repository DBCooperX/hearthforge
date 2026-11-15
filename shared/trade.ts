// Trading with merchants: what a shop is to the players, and what things cost.
// The server uses the same sums when it takes or pays gold, so the window never shows a
// price the server would not honour.

import type { Disposition, ItemDef } from './types';

export const SHOP_KINDS = ['general', 'smith', 'alchemist', 'curio', 'peddler'] as const;
export type ShopKind = (typeof SHOP_KINDS)[number];

export const SHOP_ICONS: Record<ShopKind, string> = { general: '🛒', smith: '⚒️', alchemist: '⚗️', curio: '🔮', peddler: '🎒' };
/** What each kind of merchant is called when the Dungeon Master has not named the shop. */
export const SHOP_NAMES: Record<ShopKind, string> = { general: 'General store', smith: 'Smithy', alchemist: 'Apothecary', curio: 'Curio shop', peddler: 'Travelling peddler' };
export const SHOP_BLURBS: Record<ShopKind, string> = {
  general: 'Gear for the road, simple arms and a little of everything.',
  smith: 'Weapons, armor and shields. Pays best for arms.',
  alchemist: 'Potions and remedies. Pays best for anything brewed.',
  curio: 'Rare and enchanted things. Pays best for magic and oddities.',
  peddler: 'Whatever fits on a cart, at a price.',
};

/** How a haggle went: -1 the merchant is annoyed, 0 nothing changed, 1 a better deal, 2 a much better one. */
export type Mood = -1 | 0 | 1 | 2;
export const clampMood = (n: number): Mood => (Math.max(-1, Math.min(2, Math.round(n) || 0)) as Mood);

export interface ShopStock { defId: string; qty: number }

/** A shop as the players see it. */
export interface ShopView {
  id: string;
  name: string;
  kind: ShopKind;
  /** The merchant, when the story has given them a name. */
  merchant: string | null;
  disposition: Disposition;
  stock: ShopStock[];
  /** Gold the merchant has left to buy things with. */
  purse: number;
  /** Price level: 1 is the listed value. */
  markup: number;
  mood: Mood;
  /** The party has already haggled here today. */
  haggled: boolean;
  /** Days until the shelves are refilled. */
  restockIn: number;
}

type Priced = Pick<ShopView, 'kind' | 'markup' | 'mood'>;

/** Whether a merchant of this kind trades in such a thing, and so pays a fair price for it. */
export function dealsIn(kind: ShopKind, def: ItemDef): boolean {
  const magic = !!def.rarity && def.rarity !== 'common';
  switch (kind) {
    case 'smith': return def.kind === 'weapon' || def.kind === 'armor' || def.kind === 'shield';
    case 'alchemist': return def.kind === 'consumable' || !!def.consumable || def.story?.category === 'material';
    case 'curio': return magic || def.kind === 'wondrous' || def.story?.category === 'trinket';
    default: return !magic;
  }
}

/** What the party pays for one. Never less than 1 gp. */
export function buyPrice(def: ItemDef, shop: Priced): number {
  return Math.max(1, Math.ceil(def.value * shop.markup * (1 - 0.1 * shop.mood) - 1e-9));
}

/** What the merchant pays for one: half its value for their own trade, less for anything else. 0 means they do not want it. */
export function sellPrice(def: ItemDef, shop: Priced): number {
  if (def.story?.quest) return 0;
  const rate = (dealsIn(shop.kind, def) ? 0.5 : 0.3) * (1 + 0.1 * shop.mood);
  return Math.floor(def.value * rate + 1e-9);
}

/** The Persuasion DC for haggling, by how the merchant feels about the party. */
export const HAGGLE_DC: Record<Disposition, number> = { friendly: 10, neutral: 13, wary: 16, hostile: 30 };

/** What a Persuasion total does to the prices: by 5 or more either way it is a triumph or an insult. */
export function haggleMood(total: number, dc: number): Mood {
  if (total >= dc + 5) return 2;
  if (total >= dc) return 1;
  if (total <= dc - 5) return -1;
  return 0;
}
