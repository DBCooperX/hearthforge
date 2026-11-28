// Icon slots: which picture stands for which item, and the names of the server's own icons. Shared by the server
// (which paints and stores them, see server/src/iconLibrary.ts) and the client (which shows them).
import { ITEMS } from './content';
import { ICON_SET } from './items';
import type { ItemDef } from './types';

/** An image, or one rectangle of a sheet. */
export interface ArtRef {
  src: string;
  rect?: { x: number; y: number; w: number; h: number };
  /** Painted on a flat key colour that the browser takes out (the server's own icons). */
  key?: boolean;
}

/** What the browser needs to draw: the server's own icons, by slot. The map tiles are drawn in the browser itself. */
export interface ArtManifest {
  pack: 'generated';
  sprites: Record<string, ArtRef>;
  iconPack: string;
  /** Icon slot id (see ICON_SLOTS) or picture key ("spell:fire_bolt") to picture. */
  icons: Record<string, ArtRef>;
}

export interface IconSlot {
  id: string;
  /** Emoji shown when there is no picture. */
  emoji: string;
  /** Item name for catalogue items; story item kinds have none and show their emoji. */
  name?: string;
}

function slots(): IconSlot[] {
  const out = new Map<string, IconSlot>();
  // Magic items borrow the picture of the gear they are built on, or of their kind (ring, amulet, vial).
  for (const def of Object.values(ITEMS)) {
    if (def.base || def.srd === def.id) continue;
    out.set(def.id, { id: def.id, emoji: def.icon, name: def.name });
  }
  for (const [id, emoji] of ICON_SET) {
    if (!out.has(id)) out.set(id, { id, emoji });
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
  const known = ITEMS[def.id];
  if (known && !known.base && known.srd !== known.id) out.push(def.id);
  if (known?.base) out.push(known.base);
  const generic = BY_EMOJI.get(def.icon);
  if (generic) out.push(generic);
  return out;
}

/** The name of the icon painted for each item slot. Slots that read alike share one icon (see shared/iconLibrary.ts). */
export const ITEM_ICON_NAMES: Record<string, string> = {
  longsword: 'broadsword', longsword_plus1: 'shining-sword', shortsword: 'stiletto', dagger: 'plain-dagger',
  mace: 'flanged-mace', handaxe: 'hatchet', quarterstaff: 'bo', shortbow: 'pocket-bow',
  spear: 'stone-spear', rapier: 'sai', greatsword: 'two-handed-sword', longbow: 'high-shot',
  leather: 'leather-vest', studded_leather: 'leather-armor', chain_shirt: 'mail-shirt', scale_mail: 'scale-mail',
  chain_mail: 'chain-mail', shield: 'shield', potion_healing: 'health-potion',
  potion_greater_healing: 'standing-potion', cloak_protection: 'cloak', ring_protection: 'ring',
  holy_symbol: 'holy-symbol', spellbook: 'spell-book', thieves_tools: 'lockpicks', torch: 'torch',
  battleaxe: 'battle-axe', warhammer: 'warhammer', greataxe: 'battered-axe', scimitar: 'curvy-knife',
  light_crossbow: 'crossbow', dagger_plus1: 'sacrificial-dagger', hide_armor: 'layered-armor', breastplate: 'breastplate',
  half_plate: 'chest-armor', splint: 'lamellar', plate: 'plastron', studded_leather_plus1: 'armor-vest',
  shield_plus1: 'magic-shield', potion_superior_healing: 'heart-bottle', rope_hemp: 'rope-coil', rations: 'meat',
  bedroll: 'sleeping-bag', tent: 'camping-tent', lantern_hooded: 'old-lantern', shovel: 'spade',
  grappling_hook: 'grapple', manacles: 'manacles', mirror_steel: 'mirror-mirror', healers_kit: 'first-aid-kit',
  antitoxin: 'bubbling-flask', holy_water: 'potion-ball', lute: 'lyre',
  bone: 'broken-bone', skull: 'death-skull', tooth: 'saber-tooth', claw: 'grasping-claws', feather: 'feather',
  hide: 'animal-hide', egg: 'egg-clutch', shell: 'spiral-shell', key: 'key', lock: 'padlock',
  scroll: 'tied-scroll', letter: 'envelope', map: 'treasure-map', book: 'open-book', seal: 'wax-seal',
  badge: 'medal', coin: 'two-coins', gem: 'cut-diamond', crystal: 'crystal-ball', ring: 'diamond-ring',
  amulet: 'gem-pendant', crown: 'crown', mask: 'domino-mask', stone: 'rune-stone', ore: 'ore',
  wood: 'log', herb: 'herbs-bundle', leaf: 'oak-leaf', flower: 'rose', mushroom: 'mushroom',
  vial: 'round-bottom-flask', bottle: 'wine-bottle', drink: 'beer-stein', food: 'meat', bread: 'sliced-bread',
  cheese: 'cheese-wedge', fish: 'angler-fish', cloth: 'rolled-cloth', rope: 'rope-coil',
  chain: 'crossed-chains', candle: 'candle-holder', lantern: 'lantern', bell: 'ringing-bell', horn: 'hunting-horn',
  music: 'lyre', box: 'wooden-crate', bag: 'swap-bag', doll: 'voodoo-doll', dice: 'dice-six-faces-four',
  cards: 'poker-hand', mirror: 'mirror-mirror', hourglass: 'hourglass', compass: 'compass', hammer: 'claw-hammer',
  tool: 'toolbox', needle: 'sewing-needle', blade: 'bone-knife', axe: 'wood-axe', bow: 'bow-arrow',
  helmet: 'visored-helm', boots: 'leather-boot', eye: 'eyeball', heart: 'heart-organ', hand: 'hand',
  blood: 'blood', web: 'spider-web', fire: 'campfire', water: 'water-drop', ice: 'snowflake-1',
  star: 'polar-star', moon: 'moon', sun: 'sun', holy: 'angel-wings',
};
