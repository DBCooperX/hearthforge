// Story items: things the Dungeon Master invents during play (a notched bone splinter,
// a sealed letter, a strange key). They live in the game state beside the fixed catalogue
// in content.ts and share its ItemDef shape, so the inventory treats both alike.

import { ITEMS } from './content';
import type { ItemCategory, ItemDef } from './types';

/** Look an item up in the catalogue first, then among the table's story items. */
export function itemDef(storyItems: Record<string, ItemDef> | undefined, defId: string): ItemDef | undefined {
  return ITEMS[defId] ?? storyItems?.[defId];
}

/** Icon shown when nothing more specific fits. */
export const CATEGORY_ICONS: Record<ItemCategory, string> = {
  quest: '❗',
  clue: '🔍',
  key: '🗝️',
  document: '📜',
  trinket: '🧿',
  material: '🧱',
  consumable: '🧪',
  weapon: '🗡️',
  armor: '🥋',
  tool: '🧰',
};

/**
 * The icon set the DM picks from. Each entry also lists English and German keywords,
 * so an item whose icon was left on "auto" still gets a fitting picture from its name.
 */
export const ICON_SET: [id: string, icon: string, keywords: string][] = [
  ['bone', '🦴', 'bone knochen splinter splitter rib rippe'],
  ['skull', '💀', 'skull schädel totenkopf'],
  ['tooth', '🦷', 'tooth teeth zahn zähne fang reisszahn tusk hauer'],
  ['claw', '🐾', 'claw klaue kralle paw pfote track spur'],
  ['feather', '🪶', 'feather feder quill'],
  ['hide', '🧶', 'hide pelt fur fell pelz wool wolle yarn garn thread faden'],
  ['egg', '🥚', 'egg ei'],
  ['shell', '🐚', 'shell muschel schnecke'],
  ['key', '🗝️', 'key schlüssel'],
  ['lock', '🔒', 'lock schloss padlock'],
  ['scroll', '📜', 'scroll schriftrolle pergament parchment contract vertrag decree erlass deed urkunde'],
  ['letter', '✉️', 'letter brief message nachricht note notiz invitation einladung'],
  ['map', '🗺️', 'map karte chart plan'],
  ['book', '📖', 'book buch tome foliant journal tagebuch ledger diary'],
  ['seal', '🔖', 'seal siegel token marke stamp stempel writ'],
  ['badge', '🎖️', 'badge abzeichen medal medaille insignia orden'],
  ['coin', '🪙', 'coin münze'],
  ['gem', '💎', 'gem edelstein jewel juwel diamond diamant ruby rubin sapphire saphir emerald smaragd'],
  ['crystal', '🔮', 'crystal kristall orb kugel sphere'],
  ['ring', '💍', 'ring'],
  ['amulet', '📿', 'amulet amulett necklace halskette pendant anhänger beads charm talisman'],
  ['crown', '👑', 'crown krone circlet diadem'],
  ['mask', '🎭', 'mask maske'],
  ['stone', '🪨', 'stone stein rock fels pebble kiesel rune'],
  ['ore', '⛏️', 'ore erz ingot barren nugget iron eisen copper kupfer silver silber'],
  ['wood', '🪵', 'wood holz branch ast twig zweig log bark rinde'],
  ['herb', '🌿', 'herb kraut kräuter moss moos reed schilf root wurzel'],
  ['leaf', '🍃', 'leaf blatt blätter'],
  ['flower', '🌸', 'flower blume blüte petal rose'],
  ['mushroom', '🍄', 'mushroom pilz fungus'],
  ['vial', '🧪', 'vial phiole potion trank elixir elixier tincture tinktur poison gift'],
  ['bottle', '🍾', 'bottle flasche flask wine wein'],
  ['drink', '🍺', 'ale bier beer mug krug mead met tankard'],
  ['food', '🍖', 'meat fleisch ration proviant food essen ham schinken'],
  ['bread', '🍞', 'bread brot loaf cake kuchen pie'],
  ['cheese', '🧀', 'cheese käse'],
  ['fish', '🐟', 'fish fisch'],
  ['cloth', '🧵', 'cloth stoff tuch rag lumpen ribbon band scarf schal banner flag fahne silk seide'],
  ['rope', '🪢', 'rope seil cord schnur knot knoten string'],
  ['chain', '⛓️', 'chain kette shackle fessel manacle'],
  ['candle', '🕯️', 'candle kerze wax wachs'],
  ['lantern', '🏮', 'lantern laterne lamp lampe'],
  ['bell', '🔔', 'bell glocke'],
  ['horn', '📯', 'horn'],
  ['music', '🎵', 'flute flöte lute laute song lied whistle pfeife drum trommel'],
  ['box', '📦', 'box kiste crate casket schatulle chest truhe'],
  ['bag', '👝', 'pouch beutel bag sack purse satchel'],
  ['doll', '🪆', 'doll puppe figurine figur idol statue statuette toy spielzeug carving schnitzerei'],
  ['dice', '🎲', 'dice würfel'],
  ['cards', '🃏', 'card karten deck'],
  ['mirror', '🪞', 'mirror spiegel'],
  ['hourglass', '⏳', 'hourglass sanduhr'],
  ['compass', '🧭', 'compass kompass'],
  ['hammer', '🔨', 'hammer'],
  ['tool', '🧰', 'tool werkzeug kit'],
  ['needle', '🪡', 'needle nadel'],
  ['blade', '🗡️', 'blade klinge sword schwert dagger dolch knife messer shard scherbe'],
  ['axe', '🪓', 'axe axt beil'],
  ['bow', '🏹', 'bow bogen arrow pfeil'],
  ['shield', '🛡️', 'shield schild'],
  ['helmet', '⛑️', 'helmet helm'],
  ['boots', '🥾', 'boots stiefel shoe schuh'],
  ['eye', '👁️', 'eye auge'],
  ['heart', '🫀', 'heart herz'],
  ['hand', '🖐️', 'hand finger'],
  ['blood', '🩸', 'blood blut'],
  ['web', '🕸️', 'web netz spider spinne'],
  ['fire', '🔥', 'ember glut torch fackel ash asche coal kohle'],
  ['water', '💧', 'water wasser dew tau tear träne'],
  ['ice', '❄️', 'ice eis frost'],
  ['star', '⭐', 'star stern'],
  ['moon', '🌙', 'moon mond'],
  ['sun', '☀️', 'sun sonne'],
  ['holy', '✨', 'holy heilig relic reliquie blessed gesegnet'],
];

export const ITEM_ICONS: Record<string, string> = Object.fromEntries(ICON_SET.map(([id, icon]) => [id, icon]));
/** What the DM may pass as an icon. "auto" picks one from the item's name. */
export const ITEM_ICON_IDS = ['auto', ...Object.keys(ITEM_ICONS)];

const KEYWORDS: [word: string, icon: string][] = ICON_SET
  .flatMap(([, icon, words]) => words.split(' ').map((w): [string, string] => [w, icon]))
  .sort((a, b) => b[0].length - a[0].length);

/**
 * Choose an icon for a story item: the DM's pick if it made one, otherwise the longest
 * keyword found in the name, then in the description, and finally the icon of the category.
 */
export function pickIcon(icon: string | undefined, name: string, description: string, category: ItemCategory): string {
  if (icon && ITEM_ICONS[icon]) return ITEM_ICONS[icon];
  for (const text of [name, description]) {
    const lower = text.toLowerCase();
    // A keyword counts at the start or end of a word, which covers German compounds
    // ("Knochensplitter", "Hackbeil") without finding "chart" inside "schartig".
    // Very short keywords must be the whole word, so "ei" is not found in "Seil".
    const hit = KEYWORDS.find(([w]) => new RegExp(w.length >= 4 ? `(?<![\\p{L}])${w}|${w}(?![\\p{L}])` : `(?<![\\p{L}])${w}(?![\\p{L}])`, 'u').test(lower));
    if (hit) return hit[1];
  }
  return CATEGORY_ICONS[category];
}
