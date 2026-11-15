// Art packs: which picture stands for which thing. Shared by the server (which stores and
// matches packs) and the client (which shows them and lets the host assign icons).
import { ITEMS } from './content';
import { ICON_SET } from './items';
import type { ItemDef } from './types';

/** An image, or one rectangle of a sheet. */
export interface ArtRef {
  src: string;
  rect?: { x: number; y: number; w: number; h: number };
}

export type TilePack = 'generated' | 'kenney' | '0x72';
/** Built-in emoji, the downloadable game-icons.net set, or the id of an uploaded pack. */
export const EMOJI_ICONS = 'emoji';
export const GAME_ICONS = 'game-icons';

export interface ArtManifest {
  pack: TilePack;
  sprites: Record<string, ArtRef>;
  iconPack: string;
  /** Icon slot id (see ICON_SLOTS) to picture. */
  icons: Record<string, ArtRef>;
}

export interface PackInfo {
  id: string;
  kind: 'tiles' | 'icons';
  name: string;
  author: string;
  license: string;
  /** Where the pack comes from. */
  url: string;
  installed: boolean;
  active: boolean;
  /** How it gets onto the server: built in, fetched by the server, or uploaded as a zip. */
  source: 'builtin' | 'download' | 'upload';
  /** Icon packs: how many slots have a picture, and the cell size used to cut up sheets. */
  matched?: number;
  cell?: number;
  images?: number;
}

export interface ArtLibrary {
  /** Whether the person asking may change anything. */
  canEdit: boolean;
  uploads: boolean;
  slots: number;
  packs: PackInfo[];
}

/** One picture a pack offers, for the picker. */
export interface PackIcon extends ArtRef {
  name: string;
}

export interface IconSlot {
  id: string;
  /** Emoji shown when no pack supplies a picture. */
  emoji: string;
  /** Item name for catalogue items; story item kinds have none and show their emoji. */
  name?: string;
  /** Words that may appear in a file name of a pack, most telling first. */
  keywords: string[];
}

const EXTRA: Record<string, string> = {
  longsword: 'sword', longsword_plus1: 'sword magic', shortsword: 'sword', greatsword: 'claymore sword',
  dagger: 'knife', mace: 'club hammer', handaxe: 'hatchet axe', quarterstaff: 'staff', shortbow: 'bow', longbow: 'bow',
  spear: 'lance', leather: 'tunic armor', studded_leather: 'armor', chain_shirt: 'chainmail armor', scale_mail: 'armor',
  chain_mail: 'chainmail platemail armor', potion_healing: 'potion red', potion_greater_healing: 'potion flask',
  cloak_protection: 'cloak cape', ring_protection: 'ring', holy_symbol: 'holy cross amulet', spellbook: 'book tome',
  thieves_tools: 'lockpick lockpicks key tools', torch: 'torch',
  battleaxe: 'axe', warhammer: 'hammer', greataxe: 'axe', scimitar: 'saber sabre sword', light_crossbow: 'crossbow', dagger_plus1: 'dagger knife magic',
  hide_armor: 'fur armor', breastplate: 'cuirass armor', half_plate: 'platemail armor', splint: 'armor', plate: 'platemail armor',
  studded_leather_plus1: 'armor magic', shield_plus1: 'shield magic', potion_superior_healing: 'potion', rope_hemp: 'rope', rations: 'food meat',
  bedroll: 'bed blanket', tent: 'tent', lantern_hooded: 'lantern lamp', shovel: 'spade', grappling_hook: 'hook grapple', manacles: 'shackles chain',
  mirror_steel: 'mirror', healers_kit: 'bandage medkit', antitoxin: 'vial potion', holy_water: 'water flask', lute: 'lute instrument',
};

function slots(): IconSlot[] {
  const out = new Map<string, IconSlot>();
  for (const def of Object.values(ITEMS)) {
    const own = def.id.split('_').filter((w) => !/^(of|plus\d*|\d+)$/.test(w));
    out.set(def.id, { id: def.id, emoji: def.icon, name: def.name, keywords: [...new Set([def.id.replace(/_/g, ''), ...own.length > 1 ? [own.join('')] : [], ...(EXTRA[def.id] ?? '').split(' ').filter(Boolean), ...own])] });
  }
  for (const [id, emoji, words] of ICON_SET) {
    if (!out.has(id)) out.set(id, { id, emoji, keywords: [...new Set([id, ...words.split(' ')])] });
  }
  return [...out.values()];
}

/** Everything an icon pack can give a picture to: the item catalogue, then the kinds of story items. */
export const ICON_SLOTS: IconSlot[] = slots();
const SLOT_IDS = new Set(ICON_SLOTS.map((s) => s.id));
const BY_EMOJI = new Map<string, string>();
for (const [id, emoji] of ICON_SET) if (!BY_EMOJI.has(emoji)) BY_EMOJI.set(emoji, id);

export const isIconSlot = (id: unknown): id is string => typeof id === 'string' && SLOT_IDS.has(id);

/** The slots to try for an item, most specific first. Story items are found through their emoji. */
export function iconSlotsOf(def: Pick<ItemDef, 'id' | 'icon'>): string[] {
  const out: string[] = [];
  if (ITEMS[def.id]) out.push(def.id);
  const generic = BY_EMOJI.get(def.icon);
  if (generic) out.push(generic);
  return out;
}

/**
 * game-icons.net (CC BY 3.0): slot to "author/icon" in github.com/game-icons/icons.
 * Every path was checked against the repository when this table was written.
 */
export const GAME_ICON_PATHS: Record<string, string> = {
  longsword: 'lorc/broadsword', longsword_plus1: 'lorc/shining-sword', shortsword: 'lorc/stiletto', dagger: 'lorc/plain-dagger',
  mace: 'delapouite/flanged-mace', handaxe: 'delapouite/hatchet', quarterstaff: 'delapouite/bo', shortbow: 'lorc/pocket-bow',
  spear: 'lorc/stone-spear', rapier: 'delapouite/sai', greatsword: 'delapouite/two-handed-sword', longbow: 'lorc/high-shot',
  leather: 'lorc/leather-vest', studded_leather: 'delapouite/leather-armor', chain_shirt: 'lorc/mail-shirt', scale_mail: 'lorc/scale-mail',
  chain_mail: 'willdabeast/chain-mail', shield: 'sbed/shield', potion_healing: 'delapouite/health-potion',
  potion_greater_healing: 'lorc/standing-potion', cloak_protection: 'lucasms/cloak', ring_protection: 'delapouite/ring',
  holy_symbol: 'lorc/holy-symbol', spellbook: 'delapouite/spell-book', thieves_tools: 'delapouite/lockpicks', torch: 'delapouite/torch',
  battleaxe: 'lorc/battle-axe', warhammer: 'delapouite/warhammer', greataxe: 'lorc/battered-axe', scimitar: 'lorc/curvy-knife',
  light_crossbow: 'carl-olsen/crossbow', dagger_plus1: 'lorc/sacrificial-dagger', hide_armor: 'lorc/layered-armor', breastplate: 'lorc/breastplate',
  half_plate: 'delapouite/chest-armor', splint: 'lorc/lamellar', plate: 'lorc/plastron', studded_leather_plus1: 'lorc/armor-vest',
  shield_plus1: 'lorc/magic-shield', potion_superior_healing: 'lorc/heart-bottle', rope_hemp: 'delapouite/rope-coil', rations: 'lorc/meat',
  bedroll: 'delapouite/sleeping-bag', tent: 'delapouite/camping-tent', lantern_hooded: 'delapouite/old-lantern', shovel: 'lorc/spade',
  grappling_hook: 'lorc/grapple', manacles: 'lorc/manacles', mirror_steel: 'lorc/mirror-mirror', healers_kit: 'delapouite/first-aid-kit',
  antitoxin: 'lorc/bubbling-flask', holy_water: 'lorc/potion-ball', lute: 'lorc/lyre',
  bone: 'lorc/broken-bone', skull: 'sbed/death-skull', tooth: 'lorc/saber-tooth', claw: 'lorc/grasping-claws', feather: 'lorc/feather',
  hide: 'delapouite/animal-hide', egg: 'lorc/egg-clutch', shell: 'lorc/spiral-shell', key: 'lorc/key', lock: 'lorc/padlock',
  scroll: 'lorc/tied-scroll', letter: 'lorc/envelope', map: 'lorc/treasure-map', book: 'lorc/open-book', seal: 'lorc/wax-seal',
  badge: 'lorc/medal', coin: 'delapouite/two-coins', gem: 'lorc/cut-diamond', crystal: 'lorc/crystal-ball', ring: 'delapouite/diamond-ring',
  amulet: 'lorc/gem-pendant', crown: 'lorc/crown', mask: 'lorc/domino-mask', stone: 'lorc/rune-stone', ore: 'faithtoken/ore',
  wood: 'delapouite/log', herb: 'delapouite/herbs-bundle', leaf: 'delapouite/oak-leaf', flower: 'lorc/rose', mushroom: 'lorc/mushroom',
  vial: 'lorc/round-bottom-flask', bottle: 'delapouite/wine-bottle', drink: 'lorc/beer-stein', food: 'lorc/meat', bread: 'lorc/sliced-bread',
  cheese: 'lorc/cheese-wedge', fish: 'lorc/angler-fish', cloth: 'delapouite/rolled-cloth', rope: 'delapouite/rope-coil',
  chain: 'lorc/crossed-chains', candle: 'lorc/candle-holder', lantern: 'lorc/lantern', bell: 'lorc/ringing-bell', horn: 'lorc/hunting-horn',
  music: 'lorc/lyre', box: 'delapouite/wooden-crate', bag: 'lorc/swap-bag', doll: 'lorc/voodoo-doll', dice: 'delapouite/dice-six-faces-four',
  cards: 'lorc/poker-hand', mirror: 'lorc/mirror-mirror', hourglass: 'lorc/hourglass', compass: 'lorc/compass', hammer: 'lorc/claw-hammer',
  tool: 'delapouite/toolbox', needle: 'lorc/sewing-needle', blade: 'lorc/bone-knife', axe: 'lorc/wood-axe', bow: 'delapouite/bow-arrow',
  helmet: 'lorc/visored-helm', boots: 'lorc/leather-boot', eye: 'lorc/eyeball', heart: 'lorc/heart-organ', hand: 'lorc/hand',
  blood: 'skoll/blood', web: 'lorc/spider-web', fire: 'lorc/campfire', water: 'sbed/water-drop', ice: 'lorc/snowflake-1',
  star: 'delapouite/polar-star', moon: 'lorc/moon', sun: 'lorc/sun', holy: 'lorc/angel-wings',
};

/** Free packs worth a look. `match` recognises an uploaded zip by its file name, so its credits fill themselves in. */
export interface CatalogPack {
  id: string;
  kind: 'tiles' | 'icons';
  name: string;
  author: string;
  license: string;
  url: string;
  match?: RegExp;
  /** auto and click: the server fetches it. manual: itch.io and similar sites forbid that, so the owner gets a link and drops the zip in. */
  access: 'auto' | 'click' | 'manual';
}

export const CATALOG: CatalogPack[] = [
  { id: '0x72', kind: 'tiles', name: 'DungeonTileset II', author: '0x72', license: 'CC0 1.0', url: 'https://0x72.itch.io/dungeontileset-ii', match: /0x72|dungeontileset/i, access: 'manual' },
  { id: 'alexs-rpg-items', kind: 'icons', name: '16x16 RPG Item Pack', author: "Alex's Assets", license: 'CC0 1.0', url: 'https://alexs-assets.itch.io/16x16-rpg-item-pack', match: /16x16.?rpg.?item/i, access: 'manual' },
  { id: 'kyrise-rpg-icons', kind: 'icons', name: "Kyrise's Free 16x16 RPG Icon Pack", author: 'Kyrise', license: 'CC BY 4.0', url: 'https://kyrise.itch.io/kyrises-free-16x16-rpg-icon-pack', match: /kyrise/i, access: 'manual' },
  { id: 'shikashi-fantasy-icons', kind: 'icons', name: "Shikashi's Fantasy Icons Pack", author: 'Matt Firth (cheekyinkling), game-icons.net', license: 'Free to use with credit', url: 'https://cheekyinkling.itch.io/shikashis-fantasy-icons-pack', match: /shikashi/i, access: 'manual' },
  { id: 'raven-fantasy-icons', kind: 'icons', name: 'Raven Fantasy Icons (free version)', author: 'Clockwork Raven', license: 'Free to use, not to be passed on', url: 'https://clockworkraven.itch.io/raven-fantasy-icons', match: /raven/i, access: 'manual' },
];
