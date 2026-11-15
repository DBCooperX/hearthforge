// Ready-made heroes for players who want to start right away. Each one is an ordinary
// character spec, built by the same code as a hero from the creator.
import { recommend } from './recommend';
import type { L } from './rules';
import type { CharacterSpec, ClassId } from './types';

export interface Premade {
  id: string;
  spec: CharacterSpec;
  /** One line under the name. */
  tagline: L;
  /** Who they are, shown on the back of the card. */
  bio: L;
  /** How they play. */
  playstyle: L;
}

const L = (en: string, de: string): L => ({ en, de });

function premade(id: string, classId: ClassId, over: Partial<CharacterSpec>, tagline: L, bio: L, playstyle: L, appearance: string): Premade {
  const spec = recommend({ ...over, classId, premadeId: id, appearance, backstory: bio.en }, Object.keys({ ...over, premadeId: 1, appearance: 1, backstory: 1 }) as (keyof CharacterSpec)[]);
  return { id, spec, tagline, bio, playstyle };
}

export const PREMADES: Premade[] = [
  premade('brann', 'fighter', { look: { skin: 'tan', hair: 'short', hairColor: 'copper', beard: 'braided', color: 'red' }, name: 'Brann', gender: 'male', speciesId: 'dwarf', backgroundId: 'soldier', kit: 'fighter_guard', fightingStyle: 'defense' },
    L('The shield wall', 'Der Schildwall'),
    L('Brann held the gate of Karak Dûm for three days against a goblin tide, then left when the elders would not thank the common soldiers who died beside him. He trusts steel, bread and people who keep their word.', 'Brann hielt das Tor von Karak Dûm drei Tage lang gegen eine Goblinflut und ging fort, als die Ältesten den einfachen Soldaten, die neben ihm gefallen waren, keinen Dank aussprachen. Er vertraut auf Stahl, Brot und Leute, die Wort halten.'),
    L('Stand in front, soak up the hits and keep swinging. The easiest hero to play.', 'Vorne stehen, Treffer einstecken und weiter zuschlagen. Der am einfachsten zu spielende Held.'),
    'A broad dwarf with a braided copper beard, dented chain mail and a round shield scarred by goblin blades.'),
  premade('grusha', 'fighter', { look: { skin: 'greygreen', hair: 'bald', hairColor: 'black', beard: 'none', color: 'black' }, name: 'Grusha', gender: 'female', speciesId: 'orc', backgroundId: 'soldier', kit: 'fighter_greatsword', fightingStyle: 'great_weapon' },
    L('The storm that walks', 'Der wandelnde Sturm'),
    L('Grusha served as a mercenary captain until her company was sold out by its own paymaster. She carries the contract, unpaid, folded inside her breastplate, and a greatsword taller than most of her employers.', 'Grusha diente als Söldnerhauptfrau, bis ihre Kompanie vom eigenen Zahlmeister verraten wurde. Den unbezahlten Vertrag trägt sie gefaltet im Brustpanzer, dazu einen Zweihänder, der größer ist als die meisten ihrer Auftraggeber.'),
    L('Charge in and hit as hard as possible. Less armor than Brann, far more damage, and she refuses to go down.', 'Hineinstürmen und so hart wie möglich zuschlagen. Weniger Rüstung als Brann, viel mehr Schaden, und sie weigert sich zu fallen.'),
    'A tall grey-green orc woman with a shaved head, tusks capped in iron and a notched greatsword across her back.'),
  premade('vex', 'rogue', { look: { skin: 'fair', hair: 'wild', hairColor: 'auburn', beard: 'none', color: 'green' }, name: 'Vex', gender: 'female', speciesId: 'halfling', backgroundId: 'criminal', kit: 'rogue_duelist' },
    L('The lucky knife', 'Das glückliche Messer'),
    L('Vex grew up under the docks of a river town, where a quick hand filled an empty stomach. A job that went wrong left her with a price on her head and a firm belief that luck is a thing you make yourself.', 'Vex wuchs unter den Docks einer Flussstadt auf, wo flinke Finger einen leeren Magen füllten. Ein missglückter Bruch brachte ihr ein Kopfgeld ein und die feste Überzeugung, dass man sein Glück selbst macht.'),
    L('Stay next to an ally\'s target for Sneak Attack. Outside combat she opens every lock and usually acts first.', 'Bleib beim Ziel eines Verbündeten für den Hinterhältigen Angriff. Außerhalb des Kampfes öffnet sie jedes Schloss und handelt meist zuerst.'),
    'A small halfling woman with a crooked grin, a patched dark hood and a rapier that looks too long for her.'),
  premade('nyx', 'rogue', { look: { skin: 'tan', hair: 'short', hairColor: 'white', beard: 'none', color: 'purple' }, name: 'Nyx', gender: 'neutral', speciesId: 'gnome', backgroundId: 'sage', kit: 'rogue_scout' },
    L('The curious shadow', 'Der neugierige Schatten'),
    L('Nyx was a library assistant who started borrowing books from collections that did not lend. One of them taught a little magic. The owners would like both the book and Nyx back.', 'Nyx war Bibliotheksgehilfe und begann, Bücher aus Sammlungen auszuleihen, die nichts verliehen. Eines davon lehrte ein wenig Magie. Die Besitzer hätten sowohl das Buch als auch Nyx gern zurück.'),
    L('A ranged rogue with a wizard\'s cantrip and Magic Missile for emergencies. Knows a lot and notices everything.', 'Ein Fernkampf-Schurke mit einem Magier-Zaubertrick und Magischem Geschoss für Notfälle. Weiß viel und bemerkt alles.'),
    'A wiry gnome with ink-stained fingers, round brass spectacles and a shortbow almost as tall as they are.'),
  premade('elowen', 'wizard', { look: { skin: 'porcelain', hair: 'long', hairColor: 'black', beard: 'none', color: 'blue' }, name: 'Elowen', gender: 'female', speciesId: 'elf', backgroundId: 'sage', kit: 'wizard_scholar' },
    L('The patient flame', 'Die geduldige Flamme'),
    L('Elowen spent a century cataloguing other people\'s discoveries before deciding to make some of her own. She takes notes during fights and finds most dangers more interesting than frightening.', 'Elowen verbrachte ein Jahrhundert damit, die Entdeckungen anderer zu katalogisieren, bevor sie beschloss, selbst welche zu machen. Sie macht sich während Kämpfen Notizen und findet die meisten Gefahren eher interessant als beängstigend.'),
    L('Stay behind the fighter and cast. Fire Bolt every turn, Magic Missile when it must not miss, Mage Armor before trouble starts.', 'Bleib hinter dem Kämpfer und zaubere. Jede Runde Feuerpfeil, Magisches Geschoss, wenn es nicht danebengehen darf, Magierrüstung, bevor es Ärger gibt.'),
    'A slender elf woman with silver-streaked black hair, a travel-worn blue robe and a staff carved with tiny runes.'),
  premade('zarek', 'wizard', { look: { skin: 'ash', hair: 'short', hairColor: 'black', beard: 'none', color: 'brown' }, name: 'Zarek', gender: 'male', speciesId: 'tiefling', backgroundId: 'criminal', kit: 'wizard_survivor' },
    L('The self-taught spark', 'Der selbstgelehrte Funke'),
    L('Zarek never saw the inside of an academy. He learned his spells from a stolen primer, practised on rats in a cellar and paid for ink by running messages for people who did not give their names.', 'Zarek hat nie eine Akademie von innen gesehen. Seine Zauber lernte er aus einer gestohlenen Fibel, übte in einem Keller an Ratten und bezahlte die Tinte mit Botengängen für Leute, die ihre Namen nicht nannten.'),
    L('A quick, fire-proof wizard who acts early in every fight and carries three potions for when things go wrong.', 'Ein flinker, feuerfester Magier, der in jedem Kampf früh handelt und drei Tränke dabeihat, falls etwas schiefgeht.'),
    'A lean tiefling man with ash-grey skin, short curved horns, ember-orange eyes and a coat with too many pockets.'),
  premade('maeve', 'cleric', { look: { skin: 'fair', hair: 'braid', hairColor: 'grey', beard: 'none', color: 'white' }, name: 'Maeve', gender: 'female', speciesId: 'human', backgroundId: 'acolyte', kit: 'cleric_battle' },
    L('The hearth-keeper', 'Die Hüterin des Herdfeuers'),
    L('Maeve tended the hearth shrine of a roadside inn and patched up every traveller who limped through the door. When the roads grew dangerous, she decided it was easier to stop the wounds than to keep stitching them.', 'Maeve hütete den Herdschrein eines Gasthauses an der Straße und flickte jeden Reisenden zusammen, der zur Tür hereinhinkte. Als die Straßen gefährlich wurden, beschloss sie, dass es leichter ist, Wunden zu verhindern, als sie immer wieder zu nähen.'),
    L('The party\'s healer, in good armor. Three healing and attack spells from the start, and a wizard\'s cantrip for range.', 'Die Heilerin der Gruppe, in guter Rüstung. Von Beginn an drei Heil- und Angriffszauber, dazu ein Magier-Zaubertrick für die Distanz.'),
    'A sturdy woman in her forties with flour-pale freckles, a grey-brown braid, scale mail and a hearth-flame holy symbol.'),
  premade('kaelith', 'cleric', { look: { skin: 'bronze', hair: 'bald', hairColor: 'black', beard: 'none', color: 'red' }, name: 'Kaelith', gender: 'male', speciesId: 'dragonborn', backgroundId: 'soldier', kit: 'cleric_battle', base: { str: 15, dex: 12, con: 13, int: 8, wis: 14, cha: 10 }, boosts: ['str', 'con', 'dex'], spells: ['cure_wounds', 'inflict_wounds'] },
    L('The war priest', 'Der Kriegspriester'),
    L('Kaelith was chaplain to a legion that no longer exists. He still says the evening prayer for every name on its roll and believes a blessing works best when delivered with a mace.', 'Kaelith war Feldgeistlicher einer Legion, die es nicht mehr gibt. Er spricht noch immer das Abendgebet für jeden Namen auf ihrer Liste und glaubt, dass ein Segen am besten wirkt, wenn man ihn mit dem Streitkolben überbringt.'),
    L('A cleric for the front line: strong in melee, breathes fire once per rest and still heals. Less spell power than Maeve.', 'Ein Kleriker für die Front: stark im Nahkampf, speit einmal pro Rast Feuer und heilt trotzdem. Weniger Zaubermacht als Maeve.'),
    'A bronze-scaled dragonborn with a broken horn, a legion tabard over scale mail and a heavy flanged mace.'),
];

export const PREMADE_BY_ID: Record<string, Premade> = Object.fromEntries(PREMADES.map((p) => [p.id, p]));
/** The hero the old one-click "add a fighter" request maps to. */
export const DEFAULT_PREMADE: Record<ClassId, string> = { fighter: 'brann', rogue: 'vex', wizard: 'elowen', cleric: 'maeve' };
