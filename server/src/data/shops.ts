// What merchants keep on their shelves. A shop's stock is rolled from the world seed, the
// shop and the restock cycle, so every table has its own wares and they change over time.

import { ITEMS } from '../../../shared/content';
import type { ShopKind, ShopStock } from '../../../shared/trade';

/** How many in-game days pass between restocks. */
export const RESTOCK_DAYS = 3;
/** Most shops a single table keeps. */
export const MAX_SHOPS = 40;

interface Shelf {
  /** Always in stock: item id and how many, as [least, most]. */
  staples: [id: string, min: number, max: number][];
  /** Rolled each restock: `picks` different entries are drawn by weight. */
  pool: [id: string, weight: number, min: number, max: number][];
  picks: [min: number, max: number];
  /** Rare finds: each has this chance of being on the shelf, one piece. */
  rare: [id: string, chance: number][];
  /** Gold the merchant can spend on what the party sells. */
  purse: number;
}

export const SHELVES: Record<ShopKind, Shelf> = {
  general: {
    staples: [['torch', 4, 8], ['rations', 4, 10], ['rope_hemp', 1, 3], ['bedroll', 1, 3], ['potion_healing', 1, 2]],
    pool: [
      ['tent', 3, 1, 2], ['lantern_hooded', 3, 1, 2], ['shovel', 2, 1, 2], ['grappling_hook', 2, 1, 1], ['manacles', 1, 1, 1], ['mirror_steel', 2, 1, 1],
      ['healers_kit', 3, 1, 2], ['dagger', 3, 1, 3], ['quarterstaff', 2, 1, 2], ['spear', 2, 1, 2], ['handaxe', 2, 1, 2], ['shortbow', 1, 1, 1],
      ['leather', 2, 1, 1], ['thieves_tools', 1, 1, 1], ['lute', 1, 1, 1], ['antitoxin', 1, 1, 1], ['holy_symbol', 1, 1, 1],
    ],
    picks: [6, 8],
    rare: [],
    purse: 150,
  },
  smith: {
    staples: [['dagger', 2, 4], ['shield', 1, 2], ['leather', 1, 2]],
    pool: [
      ['longsword', 4, 1, 2], ['shortsword', 4, 1, 2], ['mace', 3, 1, 2], ['handaxe', 3, 1, 2], ['spear', 3, 1, 3], ['battleaxe', 3, 1, 1], ['warhammer', 3, 1, 1],
      ['rapier', 2, 1, 1], ['scimitar', 2, 1, 1], ['greatsword', 2, 1, 1], ['greataxe', 2, 1, 1], ['shortbow', 2, 1, 1], ['longbow', 2, 1, 1], ['light_crossbow', 2, 1, 1],
      ['studded_leather', 3, 1, 1], ['hide_armor', 2, 1, 1], ['chain_shirt', 3, 1, 1], ['scale_mail', 3, 1, 1], ['chain_mail', 2, 1, 1], ['splint', 1, 1, 1], ['breastplate', 1, 1, 1],
    ],
    picks: [8, 11],
    rare: [['longsword_plus1', 0.12], ['dagger_plus1', 0.12], ['shield_plus1', 0.1], ['half_plate', 0.25], ['plate', 0.12]],
    purse: 400,
  },
  alchemist: {
    staples: [['potion_healing', 3, 6], ['antitoxin', 1, 3], ['healers_kit', 1, 3]],
    pool: [['potion_greater_healing', 4, 1, 2], ['holy_water', 3, 1, 3], ['torch', 1, 2, 4], ['mirror_steel', 1, 1, 1]],
    picks: [1, 3],
    rare: [['potion_superior_healing', 0.2]],
    purse: 250,
  },
  curio: {
    staples: [['potion_healing', 1, 3]],
    pool: [
      ['potion_greater_healing', 3, 1, 2], ['longsword_plus1', 2, 1, 1], ['dagger_plus1', 2, 1, 1], ['shield_plus1', 2, 1, 1], ['studded_leather_plus1', 2, 1, 1],
      ['cloak_protection', 2, 1, 1], ['holy_water', 2, 1, 2], ['spellbook', 2, 1, 1], ['holy_symbol', 1, 1, 1], ['lute', 1, 1, 1],
    ],
    picks: [3, 5],
    rare: [['ring_protection', 0.2], ['potion_superior_healing', 0.3]],
    purse: 900,
  },
  peddler: {
    staples: [['rations', 2, 5], ['torch', 2, 5]],
    pool: [
      ['potion_healing', 4, 1, 2], ['rope_hemp', 3, 1, 1], ['dagger', 3, 1, 2], ['lantern_hooded', 2, 1, 1], ['bedroll', 2, 1, 1], ['healers_kit', 2, 1, 1],
      ['antitoxin', 2, 1, 1], ['mirror_steel', 1, 1, 1], ['lute', 1, 1, 1], ['shortsword', 1, 1, 1], ['leather', 1, 1, 1], ['holy_water', 1, 1, 1],
    ],
    picks: [3, 5],
    rare: [['potion_greater_healing', 0.2], ['dagger_plus1', 0.05]],
    purse: 60,
  },
};

const between = (rng: () => number, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

/** Roll one restock. `scale` below 1 gives the thinner shelves of a village. */
export function rollStock(kind: ShopKind, rng: () => number, scale = 1): ShopStock[] {
  const shelf = SHELVES[kind];
  const out = new Map<string, number>();
  const add = (id: string, qty: number) => { if (ITEMS[id] && qty > 0) out.set(id, (out.get(id) ?? 0) + qty); };
  for (const [id, min, max] of shelf.staples) add(id, Math.max(1, Math.round(between(rng, min, max) * scale)));
  const pool = [...shelf.pool];
  const picks = Math.max(1, Math.round(between(rng, shelf.picks[0], shelf.picks[1]) * scale));
  for (let n = 0; n < picks && pool.length; n++) {
    let roll = rng() * pool.reduce((sum, p) => sum + p[1], 0);
    const at = pool.findIndex((p) => (roll -= p[1]) < 0);
    const [id, , min, max] = pool.splice(at < 0 ? pool.length - 1 : at, 1)[0];
    add(id, between(rng, min, max));
  }
  for (const [id, chance] of shelf.rare) if (rng() < chance * scale) add(id, 1);
  return [...out].map(([defId, qty]) => ({ defId, qty }));
}

/** Words the Dungeon Master may use for a kind of shop. The first match wins. */
const KIND_WORDS: [ShopKind, RegExp][] = [
  ['smith', /smith|forge|armou?r|weapon|blade|schmied|waffen|rüst/],
  ['alchemist', /alchem|apothec|potion|herb|heal|apothek|trank|kräuter/],
  ['curio', /curio|magic|arcan|enchant|relic|antiqu|wonder|kurios|magi|zauber/],
  ['peddler', /peddl|pedlar|travel|caravan|wander|tinker|hawker|cart|hausier|fahrend|wander/],
  ['general', /general|store|trad|goods|outfit|market|supply|supplies|kram|laden|gemischt|händler/],
];

export function shopKindOf(text: string): ShopKind | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  return KIND_WORDS.find(([kind, words]) => kind === t || words.test(t))?.[0] ?? null;
}
