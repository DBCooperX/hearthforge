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
    L('Grusha served as a mercenary captain until her company was sold out by its own paymaster. She carries the contract, unpaid, folded inside her breastplate, and a greatsword taller than most of her employers.', 'Grusha diente als Söldnerhauptfrau, bis ihre Kompanie vom eigenen Zahlmeister verraten wurde. Den unbezahlten Vertrag trägt sie gefaltet im Brustpanzer, dazu einen Zweihänder, der grösser ist als die meisten ihrer Auftraggeber.'),
    L('Charge in and hit as hard as possible. Less armor than Brann, far more damage, and she refuses to go down.', 'Hineinstürmen und so hart wie möglich zuschlagen. Weniger Rüstung als Brann, viel mehr Schaden, und sie weigert sich zu fallen.'),
    'A tall grey-green orc woman with a shaved head, tusks capped in iron and a notched greatsword across her back.'),
  premade('vex', 'rogue', { look: { skin: 'fair', hair: 'wild', hairColor: 'auburn', beard: 'none', color: 'green' }, name: 'Vex', gender: 'female', speciesId: 'halfling', backgroundId: 'criminal', kit: 'rogue_duelist' },
    L('The lucky knife', 'Das glückliche Messer'),
    L('Vex grew up under the docks of a river town, where a quick hand filled an empty stomach. A job that went wrong left her with a price on her head and a firm belief that luck is a thing you make yourself.', 'Vex wuchs unter den Docks einer Flussstadt auf, wo flinke Finger einen leeren Magen füllten. Ein missglückter Bruch brachte ihr ein Kopfgeld ein und die feste Überzeugung, dass man sein Glück selbst macht.'),
    L('Stay next to an ally\'s target for Sneak Attack. Outside combat she opens every lock and usually acts first.', 'Bleib beim Ziel eines Verbündeten für den Hinterhältigen Angriff. Ausserhalb des Kampfes öffnet sie jedes Schloss und handelt meist zuerst.'),
    'A small halfling woman with a crooked grin, a patched dark hood and a rapier that looks too long for her.'),
  premade('nyx', 'rogue', { look: { skin: 'tan', hair: 'short', hairColor: 'white', beard: 'none', color: 'purple' }, name: 'Nyx', gender: 'neutral', speciesId: 'gnome', backgroundId: 'sage', kit: 'rogue_scout' },
    L('The curious shadow', 'Der neugierige Schatten'),
    L('Nyx was a library assistant who started borrowing books from collections that did not lend. One of them taught a little magic. The owners would like both the book and Nyx back.', 'Nyx war Bibliotheksgehilfe und begann, Bücher aus Sammlungen auszuleihen, die nichts verliehen. Eines davon lehrte ein wenig Magie. Die Besitzer hätten sowohl das Buch als auch Nyx gern zurück.'),
    L('A ranged rogue with a wizard\'s cantrip and Shield for emergencies. Knows a lot and notices everything.', 'Ein Fernkampf-Schurke mit einem Magier-Zaubertrick und Schild für Notfälle. Weiss viel und bemerkt alles.'),
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
    L('Maeve tended the hearth shrine of a roadside inn and patched up every traveller who limped through the door. When the roads grew dangerous, she decided it was easier to stop the wounds than to keep stitching them.', 'Maeve hütete den Herdschrein eines Gasthauses an der Strasse und flickte jeden Reisenden zusammen, der zur Tür hereinhinkte. Als die Strassen gefährlich wurden, beschloss sie, dass es leichter ist, Wunden zu verhindern, als sie immer wieder zu nähen.'),
    L('The party\'s healer, in good armor. Three healing and attack spells from the start, and a wizard\'s cantrip for range.', 'Die Heilerin der Gruppe, in guter Rüstung. Von Beginn an drei Heil- und Angriffszauber, dazu ein Magier-Zaubertrick für die Distanz.'),
    'A sturdy woman in her forties with flour-pale freckles, a grey-brown braid, scale mail and a hearth-flame holy symbol.'),
  premade('kaelith', 'cleric', { look: { skin: 'bronze', hair: 'bald', hairColor: 'black', beard: 'none', color: 'red' }, name: 'Kaelith', gender: 'male', speciesId: 'dragonborn', backgroundId: 'soldier', kit: 'cleric_battle', base: { str: 15, dex: 12, con: 13, int: 8, wis: 14, cha: 10 }, boosts: ['str', 'con', 'dex'], spells: ['cure_wounds', 'inflict_wounds'] },
    L('The war priest', 'Der Kriegspriester'),
    L('Kaelith was chaplain to a legion that no longer exists. He still says the evening prayer for every name on its roll and believes a blessing works best when delivered with a mace.', 'Kaelith war Feldgeistlicher einer Legion, die es nicht mehr gibt. Er spricht noch immer das Abendgebet für jeden Namen auf ihrer Liste und glaubt, dass ein Segen am besten wirkt, wenn man ihn mit dem Streitkolben überbringt.'),
    L('A cleric for the front line: strong in melee, breathes fire once per rest and still heals. Less spell power than Maeve.', 'Ein Kleriker für die Front: stark im Nahkampf, speit einmal pro Rast Feuer und heilt trotzdem. Weniger Zaubermacht als Maeve.'),
    'A bronze-scaled dragonborn with a broken horn, a legion tabard over scale mail and a heavy flanged mace.'),
  premade('hroth', 'barbarian', { look: { skin: 'stone', hair: 'topknot', hairColor: 'black', beard: 'short', color: 'brown' }, name: 'Hroth', gender: 'male', speciesId: 'goliath', backgroundId: 'soldier', kit: 'barbarian_greataxe' },
    L('The avalanche', 'Die Lawine'),
    L('Hroth came down from the high passes after a rockslide took his clan\'s herd. He hires out as a caravan guard, counts every debt he owes in favours and has never once backed away from a fight.', 'Hroth stieg von den Hochpässen herab, nachdem ein Steinschlag die Herde seines Klans genommen hatte. Er verdingt sich als Karawanenwächter, zählt jede Schuld in Gefälligkeiten und ist noch nie vor einem Kampf zurückgewichen.'),
    L('Rage as your first bonus action, then swing the greataxe. While raging you take half damage from weapons, so you can stand where others fall.', 'Kampfrausch als erste Bonusaktion, dann die Zweihandaxt schwingen. Im Kampfrausch erleidest du halben Schaden durch Waffen und stehst dort, wo andere fallen.'),
    'A towering goliath with stone-grey skin, a black topknot, clan marks across his bare chest and a greataxe on his shoulder.'),
  premade('lirael', 'bard', { look: { skin: 'tan', hair: 'long', hairColor: 'auburn', beard: 'none', color: 'purple' }, name: 'Lirael', gender: 'female', speciesId: 'human', backgroundId: 'acolyte', kit: 'bard_troubadour' },
    L('The silver tongue', 'Die Silberzunge'),
    L('Lirael sang in a temple choir until she noticed that the tavern across the square paid better and listened harder. She collects stories the way others collect coins and is seldom without an audience.', 'Lirael sang im Tempelchor, bis sie merkte, dass die Taverne gegenüber besser zahlte und aufmerksamer zuhörte. Sie sammelt Geschichten wie andere Münzen und ist selten ohne Publikum.'),
    L('Hand out Bardic Inspiration, mock enemies so their attacks falter and heal with a word. The best talker in any party.', 'Verteile Bardische Inspiration, verspotte Gegner, bis ihre Angriffe danebengehen, und heile mit einem Wort. Die beste Rednerin jeder Gruppe.'),
    'A human woman with long auburn hair, a plum travelling coat, a lute on her back and an easy, knowing smile.'),
  premade('thalen', 'druid', { look: { skin: 'brown', hair: 'braid', hairColor: 'brown', beard: 'none', color: 'green' }, name: 'Thalen', gender: 'male', speciesId: 'elf', backgroundId: 'sage', kit: 'druid_staff' },
    L('The old grove\'s voice', 'Die Stimme des alten Hains'),
    L('Thalen kept the standing stones of a forest that loggers have since thinned to a copse. He left to learn why the land sickens, and speaks to crows more politely than to most people.', 'Thalen hütete die Steinkreise eines Waldes, den Holzfäller inzwischen zu einem Hain gelichtet haben. Er zog aus, um zu erfahren, warum das Land krankt, und spricht mit Krähen höflicher als mit den meisten Leuten.'),
    L('Cast from behind a shield at first. From level 2 you can turn into a wolf and fight in the front line.', 'Zaubere zunächst hinter einem Schild. Ab Stufe 2 kannst du dich in einen Wolf verwandeln und an der Front kämpfen.'),
    'A lean elf with brown skin, a long brown braid woven with leaves, a moss-green cloak and a gnarled staff.'),
  premade('sora', 'monk', { look: { skin: 'olive', hair: 'short', hairColor: 'black', beard: 'none', color: 'teal' }, name: 'Sora', gender: 'female', speciesId: 'human', backgroundId: 'soldier', kit: 'monk_staff' },
    L('The still water', 'Das stille Wasser'),
    L('Sora deserted an army that burned a monastery, and stayed to help rebuild it. The monks taught her that a fist can be an argument and that most arguments are better left unmade.', 'Sora desertierte aus einem Heer, das ein Kloster niederbrannte, und blieb, um es wieder aufzubauen. Die Mönche lehrten sie, dass eine Faust ein Argument sein kann und dass man die meisten Argumente besser nicht vorbringt.'),
    L('Fast and hard to hit. Attack with the staff, then strike again unarmed with your bonus action, every turn.', 'Schnell und schwer zu treffen. Greif mit dem Stab an und schlag dann mit deiner Bonusaktion waffenlos nach, in jedem Zug.'),
    'A wiry woman with cropped black hair, teal wrappings around her forearms, bare feet and a plain ash staff.'),
  premade('aldric', 'paladin', { look: { skin: 'silver', hair: 'bald', hairColor: 'white', beard: 'none', color: 'gold' }, name: 'Aldric', gender: 'male', speciesId: 'dragonborn', backgroundId: 'soldier', kit: 'paladin_guard' },
    L('The oath in steel', 'Der Schwur in Stahl'),
    L('Aldric swore his oath on the battlefield where his captain fell, to a god whose name he learned only afterwards. He keeps his word to the letter, which unsettles people who are used to less.', 'Aldric leistete seinen Schwur auf dem Schlachtfeld, auf dem sein Hauptmann fiel, vor einem Gott, dessen Namen er erst danach erfuhr. Er hält sein Wort aufs Genaueste, was Leute beunruhigt, die weniger gewohnt sind.'),
    L('Heavy armor, a shield and Lay on Hands to heal. From level 2, Divine Smite turns a hit into a very big hit.', 'Schwere Rüstung, ein Schild und Handauflegen zum Heilen. Ab Stufe 2 macht Göttliches Niederstrecken aus einem Treffer einen sehr grossen Treffer.'),
    'A silver-scaled dragonborn in polished chain mail with a gold tabard, a kite shield and a longsword held point down.'),
  premade('fenna', 'ranger', { look: { skin: 'fair', hair: 'braid', hairColor: 'blond', beard: 'none', color: 'green' }, name: 'Fenna', gender: 'female', speciesId: 'elf', backgroundId: 'soldier', kit: 'ranger_archer' },
    L('The far shot', 'Der weite Schuss'),
    L('Fenna scouted the borderlands for a garrison that was withdrawn and never replaced. She stayed, because somebody had to watch the tree line, and she has been watching it ever since.', 'Fenna kundschaftete das Grenzland für eine Garnison aus, die abgezogen und nie ersetzt wurde. Sie blieb, weil jemand den Waldrand im Auge behalten musste, und tut es bis heute.'),
    L('Mark your prey with a bonus action, then shoot from far away. She notices ambushes before they happen.', 'Markiere deine Beute mit einer Bonusaktion und schiesse dann aus der Ferne. Hinterhalte bemerkt sie, bevor sie geschehen.'),
    'A tall elf woman with a blond braid, a hooded forest-green cloak, studded leather and a longbow of pale yew.'),
  premade('ignar', 'sorcerer', { look: { skin: 'redscale', hair: 'bald', hairColor: 'black', beard: 'none', color: 'red' }, name: 'Ignar', gender: 'male', speciesId: 'dragonborn', backgroundId: 'acolyte', kit: 'sorcerer_wanderer' },
    L('The ember in the blood', 'Die Glut im Blut'),
    L('Ignar set fire to his first sermon without meaning to. The temple decided his gift came from somewhere older than their god and sent him out, kindly, to find where.', 'Ignar setzte seine erste Predigt in Brand, ohne es zu wollen. Der Tempel befand, seine Gabe stamme von etwas Älterem als ihrem Gott, und schickte ihn freundlich hinaus, um herauszufinden, woher.'),
    L('Five cantrips and raw magical force. Fragile, so stay back; Innate Sorcery makes your spells hard to resist for a whole fight.', 'Fünf Zaubertricks und rohe magische Gewalt. Zerbrechlich, also bleib hinten; Intuitive Zauberei macht deine Zauber einen ganzen Kampf lang schwer abzuwehren.'),
    'A red-scaled dragonborn in a scorched crimson robe, with small flames dancing around his claws when he is nervous.'),
  premade('morwen', 'warlock', { look: { skin: 'violet', hair: 'long', hairColor: 'white', beard: 'none', color: 'black' }, name: 'Morwen', gender: 'female', speciesId: 'tiefling', backgroundId: 'acolyte', kit: 'warlock_occultist' },
    L('The signed name', 'Der unterschriebene Name'),
    L('Morwen copied forbidden texts for a monastery library and one night answered the voice in the margins. Her patron asks for small things so far. She keeps a careful list of them.', 'Morwen schrieb für eine Klosterbibliothek verbotene Texte ab und antwortete eines Nachts der Stimme am Seitenrand. Ihr Schutzherr verlangt bisher nur Kleinigkeiten. Sie führt sorgfältig Buch darüber.'),
    L('Eldritch Blast every turn, the hardest-hitting cantrip there is, with Hex on the target. Her mana returns on a short rest.', 'In jedem Zug Schauriger Strahl, der stärkste Zaubertrick überhaupt, und Verwünschung auf dem Ziel. Ihr Mana kehrt bei einer kurzen Rast zurück.'),
    'A violet-skinned tiefling woman with long white hair, swept-back horns, a black high-collared coat and ink-stained fingers.'),
];

export const PREMADE_BY_ID: Record<string, Premade> = Object.fromEntries(PREMADES.map((p) => [p.id, p]));
/** The hero the old one-click "add a fighter" request maps to. */
export const DEFAULT_PREMADE: Record<ClassId, string> = {
  fighter: 'brann', rogue: 'vex', wizard: 'elowen', cleric: 'maeve', barbarian: 'hroth', bard: 'lirael', druid: 'thalen', monk: 'sora',
  paladin: 'aldric', ranger: 'fenna', sorcerer: 'ignar', warlock: 'morwen',
};
