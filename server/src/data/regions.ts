// The tables a random starting region is rolled from: names, towns, villages, the main
// threat and its dungeon, lesser sites, sanctuaries and people. Text the players read is
// written in English and German side by side; text only the Dungeon Master reads is English.
//
// Templates use {tokens} that the region builder fills in:
//   {town} {village} {tavern} {site} {authority}       names
//   {region} {regionIn}                                "the Raven Vale" / "in the Raven Vale"
//   {atSite} {underSite} {fromSite} {inSite}           the main threat's lair with its preposition
//   {dist}                                             "about 18 miles north-east" (premise only)

import type { LocationKind, Disposition } from '../../../shared/types';

export type L = { en: string; de: string };
/** [English, German]. German name parts are in the form that joins into a compound. */
export type Pair = readonly [string, string];
/** German grammatical gender of a place name; 'p' is a plural name. */
export type Gender = 'f' | 'm' | 'n' | 'p';

/** How the terrain generator is bent for a kind of country. All values are thresholds on 0..1 noise. */
export interface TerrainStyle {
  water?: number;
  hill?: number;
  mountain?: number;
  /** Added to moisture: positive grows forest and swamp. */
  wet?: number;
  /** Swamp forms below this elevation where it is wet enough. */
  swampTop?: number;
  /** One edge of the map is open sea. */
  coast?: boolean;
}

export interface PlaceName {
  en: (root: string) => string;
  de: (root: string) => string;
  g: Gender;
  /** The English name takes "the" inside a sentence. */
  the?: boolean;
}

/** Where on the map a place likes to be. */
export interface Siting {
  /** Distance from the home settlement in hexes. */
  dist: [number, number];
  /** Terrain codes it prefers. */
  prefer?: string;
  /** Wants water next to it. */
  water?: boolean;
}

export interface MonsterGroup {
  defId: string;
  count: number;
  name?: L;
  description?: L;
  look?: string[];
  power?: string;
  boss?: boolean;
}

export interface StageTpl {
  name: L;
  description: L;
  monsters: MonsterGroup[];
}

// ------------------------------------------------------------------- names

/** Name roots. They are drawn without replacement, so no two places in a region share one. */
export const ROOTS: Pair[] = [
  ['Raven', 'Raben'], ['Grey', 'Grau'], ['Thorn', 'Dorn'], ['Oak', 'Eichen'], ['Stone', 'Stein'], ['Frost', 'Frost'],
  ['Wolf', 'Wolfs'], ['Amber', 'Bernstein'], ['Mist', 'Nebel'], ['Iron', 'Eisen'], ['Salt', 'Salz'], ['Elm', 'Ulmen'],
  ['Black', 'Schwarz'], ['Gold', 'Gold'], ['Storm', 'Sturm'], ['Moss', 'Moos'], ['Crow', 'Krähen'], ['Red', 'Rot'],
  ['Silver', 'Silber'], ['Ash', 'Aschen'], ['Whisper', 'Flüster'], ['Sun', 'Sonnen'], ['Moon', 'Mond'], ['Wind', 'Wind'],
  ['Bramble', 'Brombeer'], ['Heron', 'Reiher'], ['Fox', 'Fuchs'], ['Stag', 'Hirsch'], ['Copper', 'Kupfer'], ['Hazel', 'Hasel'],
  ['Dusk', 'Dämmer'], ['Lantern', 'Laternen'], ['Kings', 'Königs'],
];

/** Endings of town and village names. */
export const SETTLEMENT_ENDINGS: Pair[] = [
  ['ford', 'furt'], ['bridge', 'brück'], ['field', 'feld'], ['wick', 'weiler'], ['holm', 'holm'], ['brook', 'bach'],
  ['stead', 'stätt'], ['gate', 'tor'], ['rest', 'rast'], ['fall', 'fall'], ['crest', 'kamm'], ['well', 'brunn'],
  ['cross', 'kreuz'], ['mill', 'mühl'], ['ton', 'heim'], ['bury', 'burg'], ['haven', 'hafen'], ['mere', 'see'],
];

export const TAVERNS: L[] = [
  { en: 'The Drunken Heron', de: 'Zum Trunkenen Reiher' },
  { en: 'The Three Lanterns', de: 'Zu den Drei Laternen' },
  { en: 'The Sleeping Bear', de: 'Zum Schlafenden Bären' },
  { en: 'The Broken Wheel', de: 'Zum Gebrochenen Rad' },
  { en: 'The Red Stag', de: 'Zum Roten Hirsch' },
  { en: 'The Last Candle', de: 'Zur Letzten Kerze' },
  { en: 'The Copper Kettle', de: 'Zum Kupferkessel' },
  { en: 'The Laughing Fox', de: 'Zum Lachenden Fuchs' },
  { en: 'The Black Boar', de: 'Zum Schwarzen Eber' },
  { en: 'The Salted Eel', de: 'Zum Gesalzenen Aal' },
  { en: 'The Old Oak', de: 'Zur Alten Eiche' },
  { en: 'The Silver Swan', de: 'Zum Silbernen Schwan' },
  { en: "The Wanderer's Rest", de: 'Zur Wandererrast' },
  { en: 'The Crooked Chimney', de: 'Zum Schiefen Schornstein' },
  { en: 'The Blind Piper', de: 'Zum Blinden Pfeifer' },
  { en: 'The Honeyed Ham', de: 'Zum Honigschinken' },
];

export const TAVERN_TEXT = {
  description: {
    en: 'The busiest taproom in {town}. Rooms upstairs, a pot on the fire, and every rumour of the region sooner or later.',
    de: 'Die vollste Schankstube von {town}. Oben Zimmer, ein Topf auf dem Feuer, und früher oder später jedes Gerücht der Gegend.',
  },
  appearance: [
    'A low-beamed tavern common room with a great stone hearth, a long oak bar worn smooth, copper mugs on hooks, sawdust on the floor, firelight and candle lanterns.',
    'A crowded two-storey inn taproom with a gallery above, trestle tables, a smoke-blackened ceiling, barrels behind the bar and a painted sign over the door.',
    'A snug half-timbered alehouse with small leaded windows, benches along the walls, a tiled stove in the corner and strings of herbs hanging from the beams.',
  ],
};

export const FIRST_NAMES = {
  female: ['Marta', 'Ilse', 'Brenna', 'Odile', 'Tamsin', 'Hedda', 'Isolde', 'Runa', 'Greta', 'Maren', 'Wenna', 'Elke', 'Thora', 'Linnea', 'Aldith', 'Sibylle'],
  male: ['Aldous', 'Tobren', 'Garrick', 'Emmerich', 'Joss', 'Halvar', 'Corwin', 'Dietmar', 'Osric', 'Bram', 'Lutz', 'Fenn', 'Rurik', 'Anselm', 'Tiber', 'Wendel'],
};
export const SURNAMES = ['Venn', 'Holt', 'Brask', 'Tolland', 'Varn', 'Eder', 'Kessel', 'Harrow', 'Dunmar', 'Falk', 'Strand', 'Riedel', 'Voss', 'Garn', 'Lorne', 'Wick', 'Orlen', 'Tamm', 'Brandt', 'Quast'];

/** How people look. English only: appearance notes are for image prompts. */
export const LOOKS = {
  species: ['human', 'human', 'human', 'human', 'dwarf', 'halfling', 'half-elf', 'human', 'dwarf', 'human'],
  build: ['stout', 'wiry', 'broad-shouldered', 'tall', 'slight', 'heavyset', 'spare', 'sturdy'],
  age: ['young', 'middle-aged', 'middle-aged', 'grey-haired', 'weathered old'],
  hair: ['copper-red braids', 'cropped dark hair', 'a grey-streaked beard or plait', 'sandy hair tied back', 'a shaved head', 'thick black curls', 'white hair under a cap', 'a long brown plait'],
  eyes: ['shrewd green eyes', 'tired watchful eyes', 'pale blue eyes', 'dark steady eyes', 'a squint and a quick smile', 'one clouded eye'],
};

// ------------------------------------------------------------------ themes

export interface Theme {
  id: string;
  name: PlaceName;
  /** "in" for English; the German locative is built from the gender, except where given. */
  enIn?: string;
  deIn?: string;
  terrain: TerrainStyle;
  /** What kind of country it is, for the Dungeon Master. Starts with {Region}. */
  about: string;
}

export const THEMES: Theme[] = [
  {
    id: 'vale', name: { en: (r) => `${r} Vale`, de: (r) => `${r}tal`, g: 'n', the: true }, terrain: {},
    about: '{Region} is a frontier valley of farms, woods and old stone, a week from the nearest city.',
  },
  {
    id: 'coast', name: { en: (r) => `${r} Coast`, de: (r) => `${r}küste`, g: 'f', the: true }, enIn: 'on', deIn: 'an der',
    terrain: { coast: true, water: 0.26 },
    about: '{Region} is a rough stretch of coast: cliffs, coves and salt marsh, with the sea on one side and wild country on the other, far from any city.',
  },
  {
    id: 'marsh', name: { en: (r) => `${r} Fens`, de: (r) => `${r}moor`, g: 'n', the: true },
    terrain: { wet: 0.14, swampTop: 0.52, hill: 0.66, mountain: 0.8 },
    about: '{Region} is low, wet country of reed beds, black pools and causeways, where dry ground is precious and the mist comes up every evening.',
  },
  {
    id: 'highlands', name: { en: (r) => `${r} Highlands`, de: (r) => `${r}hochland`, g: 'n', the: true },
    terrain: { water: 0.22, hill: 0.5, mountain: 0.66, wet: -0.05 },
    about: '{Region} is high, hard country of bare hills, cold lakes and sheep tracks, where the weather turns within the hour.',
  },
  {
    id: 'forest', name: { en: (r) => `${r}wood`, de: (r) => `${r}wald`, g: 'm', the: true },
    terrain: { wet: 0.16, water: 0.25 },
    about: '{Region} is deep old forest broken by clearings and logging roads. The trees were here before the first charter and will be here after the last.',
  },
  {
    id: 'march', name: { en: (r) => `${r} March`, de: (r) => `${r}mark`, g: 'f', the: true },
    terrain: { wet: -0.14, water: 0.24, hill: 0.66, mountain: 0.8 },
    about: '{Region} is an open borderland of grass, wind and long horizons, dotted with the forts and waystones of a border nobody has fought over in a lifetime.',
  },
];

// ------------------------------------------------------------------- towns

export interface TownTpl {
  id: string;
  themes?: string[];
  water?: boolean;
  description: L;
  appearance: string;
  /** Who runs the place. The German title and role have a female and a male form. */
  title: { en: string; de: [string, string] };
  role: { en: string; de: [string, string] };
}

export const TOWNS: TownTpl[] = [
  {
    id: 'market',
    description: {
      en: 'A walled market town at the meeting of two roads. Farmers, tinkers and caravan guards crowd its square on market days.',
      de: 'Eine ummauerte Marktstadt an der Kreuzung zweier Straßen. An Markttagen drängen sich Bauern, Kesselflicker und Karawanenwachen auf ihrem Platz.',
    },
    appearance: 'A small medieval market town ringed by a low grey stone wall, timber-framed houses with slate roofs, a cobbled square with a stone well, warm lamplight in the windows.',
    title: { en: 'Reeve', de: ['Vögtin', 'Vogt'] }, role: { en: 'reeve of {town}', de: ['Vögtin von {town}', 'Vogt von {town}'] },
  },
  {
    id: 'harbour', themes: ['coast'], water: true,
    description: {
      en: 'A harbour town of tarred sheds and gull-white roofs around a stone quay. Half its people fish, and the other half trade in what the ships bring.',
      de: 'Eine Hafenstadt aus geteerten Schuppen und möwenweißen Dächern rings um einen steinernen Kai. Die eine Hälfte ihrer Leute fischt, die andere handelt mit dem, was die Schiffe bringen.',
    },
    appearance: 'A small medieval harbour town around a stone quay, tarred boat sheds, whitewashed houses with steep roofs, fishing boats at anchor, nets drying on racks, gulls overhead.',
    title: { en: 'Harbourmaster', de: ['Hafenmeisterin', 'Hafenmeister'] }, role: { en: 'harbourmaster of {town}', de: ['Hafenmeisterin von {town}', 'Hafenmeister von {town}'] },
  },
  {
    id: 'river', themes: ['vale', 'marsh', 'forest', 'march'], water: true,
    description: {
      en: 'A river town strung along both banks and joined by an old stone bridge. Barges tie up below the mill, and the toll house never sleeps.',
      de: 'Eine Flussstadt, die sich an beiden Ufern entlangzieht und von einer alten Steinbrücke zusammengehalten wird. Unterhalb der Mühle legen Lastkähne an, und das Zollhaus schläft nie.',
    },
    appearance: 'A medieval river town on both banks of a slow river, an old arched stone bridge, a watermill, flat barges moored at wooden jetties, a toll house with a lantern.',
    title: { en: 'Mayor', de: ['Bürgermeisterin', 'Bürgermeister'] }, role: { en: 'mayor of {town}', de: ['Bürgermeisterin von {town}', 'Bürgermeister von {town}'] },
  },
  {
    id: 'mining', themes: ['highlands', 'vale'],
    description: {
      en: 'A mining town terraced into the hillside, all soot, ore carts and hammering. The mine pays for everything here, and everyone knows it.',
      de: 'Eine Bergbaustadt, in Terrassen an den Hang gebaut, voller Ruß, Erzkarren und Hämmern. Die Mine bezahlt hier alles, und jeder weiß es.',
    },
    appearance: 'A small mining town terraced into a steep hillside, stone houses stained with soot, ore carts on wooden rails, a tall smelter chimney, a timber headframe above the roofs.',
    title: { en: 'Warden', de: ['Bergmeisterin', 'Bergmeister'] }, role: { en: 'mine warden of {town}', de: ['Bergmeisterin von {town}', 'Bergmeister von {town}'] },
  },
  {
    id: 'timber', themes: ['forest', 'marsh', 'vale'],
    description: {
      en: 'A palisaded town of log houses and sawpits at the edge of the deep woods. It lives on timber, pitch and whatever the trappers carry in.',
      de: 'Eine von Palisaden umgebene Stadt aus Blockhäusern und Sägegruben am Rand der tiefen Wälder. Sie lebt von Holz, Pech und dem, was die Fallensteller hereintragen.',
    },
    appearance: 'A frontier town of log houses inside a tall timber palisade, sawpits and stacked trunks, smoke from pitch kilns, dark forest rising close behind.',
    title: { en: 'Reeve', de: ['Vögtin', 'Vogt'] }, role: { en: 'reeve of {town}', de: ['Vögtin von {town}', 'Vogt von {town}'] },
  },
  {
    id: 'fort', themes: ['march', 'highlands', 'coast'],
    description: {
      en: 'A frontier town grown up around an old border fort. Its walls are older than its charter, and its watch still counts every stranger through the gate.',
      de: 'Eine Grenzstadt, die um eine alte Grenzfeste gewachsen ist. Ihre Mauern sind älter als ihr Stadtrecht, und die Wache zählt noch immer jeden Fremden am Tor.',
    },
    appearance: 'A small frontier town huddled around a squat old stone fort, thick weathered walls, a gatehouse with a watch fire, thatched houses, banners snapping in the wind.',
    title: { en: 'Captain', de: ['Hauptfrau', 'Hauptmann'] }, role: { en: 'captain of the watch in {town}', de: ['Hauptfrau der Wache von {town}', 'Hauptmann der Wache von {town}'] },
  },
];

/** What the person in charge is like. */
export const AUTHORITY_TEXT: L[] = [
  {
    en: 'Keeps {town} running with too few hands and too little coin. Has posted a reward for whoever ends the trouble {atSite}.',
    de: 'Hält {town} mit zu wenigen Händen und zu wenig Geld am Laufen. Hat eine Belohnung für den ausgesetzt, der dem Ärger {atSite} ein Ende macht.',
  },
  {
    en: 'Careful, tired and short of sleep since the trouble {atSite} began. Pays good coin for results and has no patience for boasting.',
    de: 'Vorsichtig, müde und um den Schlaf gebracht, seit der Ärger {atSite} begonnen hat. Zahlt gutes Geld für Ergebnisse und hat keine Geduld für Prahlerei.',
  },
];

export const INNKEEPER = {
  role: { en: 'innkeeper of {tavern}', de: ['Wirtin des Gasthauses „{tavern}“', 'Wirt des Gasthauses „{tavern}“'] as [string, string] },
  text: [
    {
      en: 'Hears everything said in the taproom and repeats about half of it. Has an opinion on the trouble {atSite}, and on everything else.',
      de: 'Hört alles, was in der Schankstube gesagt wird, und erzählt etwa die Hälfte weiter. Hat eine Meinung zu dem Ärger {atSite} und zu allem anderen auch.',
    },
    {
      en: 'Runs the house with a loud laugh and a long memory for unpaid tabs. Lost a regular to the roads this season and has not forgiven whoever is behind it.',
      de: 'Führt das Haus mit lautem Lachen und einem langen Gedächtnis für offene Zechen. Hat in dieser Saison einen Stammgast an die Landstraße verloren und verzeiht es denen nicht, die dahinterstecken.',
    },
  ] as L[],
  clothes: 'a flour-dusted leather apron and rolled sleeves',
};

// ---------------------------------------------------------------- villages

export interface VillageTpl {
  id: string;
  themes?: string[];
  site: Siting;
  description: L;
  appearance: string;
  role: { en: string; de: [string, string] };
  person: L;
  clothes: string;
  /** A few words for the Dungeon Master. */
  gist: string;
}

export const VILLAGES: VillageTpl[] = [
  {
    id: 'fishing', themes: ['coast', 'vale', 'marsh', 'highlands'], site: { dist: [4, 7], water: true }, gist: 'a fishing village',
    description: {
      en: "A fishing village of tarred boats and drying nets at the water's edge. Its folk are close-mouthed with strangers and generous with smoked fish.",
      de: 'Ein Fischerdorf aus geteerten Booten und trocknenden Netzen am Wasser. Die Leute sind Fremden gegenüber wortkarg und mit Räucherfisch großzügig.',
    },
    appearance: 'A small fishing village of weathered wooden houses beside grey water, nets drying on racks, flat-bottomed boats pulled up on a muddy shore, morning mist.',
    role: { en: 'net-mender of {village}', de: ['Netzflickerin aus {village}', 'Netzflicker aus {village}'] },
    person: {
      en: 'Has worked these waters for forty years and swears something large moved under the boat last month.',
      de: 'Arbeitet seit vierzig Jahren auf diesem Wasser und schwört, dass sich letzten Monat etwas Großes unter dem Boot bewegt hat.',
    },
    clothes: 'a patched oilskin coat and a wide-brimmed straw hat',
  },
  {
    id: 'shepherds', themes: ['highlands', 'vale', 'march'], site: { dist: [4, 7], prefer: 'hp' }, gist: "a shepherds' village",
    description: {
      en: 'A hill village of dry-stone pens and low turf roofs. There are more sheep than people here, and lately fewer of both.',
      de: 'Ein Bergdorf aus Trockenmauerpferchen und niedrigen Grasdächern. Hier gibt es mehr Schafe als Menschen, und in letzter Zeit von beiden weniger.',
    },
    appearance: 'A small hill village of low stone cottages with turf roofs, dry-stone sheep pens, a windswept slope, grazing sheep, a single crooked signpost.',
    role: { en: 'head shepherd of {village}', de: ['Oberschäferin von {village}', 'Oberschäfer von {village}'] },
    person: {
      en: 'Counts the flock every dusk and comes up short too often. Knows every path through the hills and who has been using them.',
      de: 'Zählt jeden Abend die Herde und kommt zu oft nicht auf die volle Zahl. Kennt jeden Pfad durch die Hügel und weiß, wer sie in letzter Zeit benutzt.',
    },
    clothes: 'a heavy undyed wool cloak and a long crook',
  },
  {
    id: 'charcoal', themes: ['forest', 'vale', 'highlands'], site: { dist: [4, 7], prefer: 'f' }, gist: 'a hamlet of charcoal burners',
    description: {
      en: 'A forest hamlet of charcoal burners, wrapped in sweet smoke. Its people trust the woods more than the town, and say the woods have changed.',
      de: 'Ein Waldweiler der Köhler, eingehüllt in süßen Rauch. Seine Leute trauen dem Wald mehr als der Stadt und sagen, der Wald habe sich verändert.',
    },
    appearance: 'A forest hamlet of bark-roofed huts in a clearing, smoking earth-covered charcoal kilns, stacked cordwood, tall dark trees all around, blue haze.',
    role: { en: 'charcoal burner of {village}', de: ['Köhlerin aus {village}', 'Köhler aus {village}'] },
    person: {
      en: 'Speaks little and watches the treeline while doing it. Found tracks by the kilns that belong to nothing that should live here.',
      de: 'Spricht wenig und behält dabei den Waldrand im Blick. Hat bei den Meilern Spuren gefunden, die zu nichts gehören, was hier leben sollte.',
    },
    clothes: 'soot-black leathers and a kerchief over the mouth',
  },
  {
    id: 'peat', themes: ['marsh', 'coast'], site: { dist: [4, 7], prefer: 's', water: true }, gist: 'a stilt village of peat cutters',
    description: {
      en: 'A village on stilts above the reeds, joined by plank walks. Peat cutters and eel trappers live here and keep a lantern lit for those still out at dusk.',
      de: 'Ein Dorf auf Pfählen über dem Schilf, verbunden durch Bohlenstege. Hier leben Torfstecher und Aalfänger und lassen eine Laterne brennen für alle, die in der Dämmerung noch draußen sind.',
    },
    appearance: 'A marsh village of wooden houses on stilts above reed beds, plank walkways, stacked peat bricks, eel traps, a lantern on a tall pole, evening mist.',
    role: { en: 'peat cutter of {village}', de: ['Torfstecherin aus {village}', 'Torfstecher aus {village}'] },
    person: {
      en: 'Knows the safe paths through the mire and charges fairly to show them. Has seen lights out on the water where no one lives.',
      de: 'Kennt die sicheren Pfade durchs Moor und verlangt einen fairen Preis dafür, sie zu zeigen. Hat Lichter draußen auf dem Wasser gesehen, wo niemand wohnt.',
    },
    clothes: 'mud-stained waders and a reed hat',
  },
  {
    id: 'farming', themes: ['vale', 'march', 'forest'], site: { dist: [4, 7], prefer: 'p' }, gist: 'a farming village',
    description: {
      en: 'A farming village of orchards and long barns along a slow stream. The harvest was good, and that is exactly what worries people.',
      de: 'Ein Bauerndorf mit Obstgärten und langen Scheunen an einem trägen Bach. Die Ernte war gut, und genau das macht den Leuten Sorgen.',
    },
    appearance: 'A farming village of thatched cottages and long barns among orchards, a slow stream with a ford, hay wagons, geese on a green.',
    role: { en: 'miller of {village}', de: ['Müllerin von {village}', 'Müller von {village}'] },
    person: {
      en: "Grinds for every farm within a day's walk and hears all their troubles along with the grain. Two of those farms have stopped coming.",
      de: 'Mahlt für jeden Hof im Umkreis eines Tagesmarsches und hört mit dem Korn all ihre Sorgen. Zwei dieser Höfe kommen nicht mehr.',
    },
    clothes: 'a flour-white smock and a leather cap',
  },
];

// ------------------------------------------------------------- sanctuaries

export interface SanctuaryTpl {
  id: string;
  themes?: string[];
  kind: LocationKind;
  name: PlaceName;
  site: Siting;
  description: L;
  appearance: string;
  role: { en: string; de: (name: string) => [string, string] };
  clothes: string;
  gist: string;
}

export const SANCTUARIES: SanctuaryTpl[] = [
  {
    id: 'spring', kind: 'shrine', name: { en: (r) => `${r} Shrine`, de: (r) => `${r}schrein`, g: 'm' }, site: { dist: [3, 7], prefer: 'f' }, gist: 'a spring shrine',
    description: {
      en: 'A ring of mossy standing stones around a spring, tended by a single keeper. Travellers leave a coin in the water for safe roads.',
      de: 'Ein Ring bemooster Menhire um eine Quelle, gehütet von einer einzigen Seele. Reisende lassen für sichere Wege eine Münze im Wasser zurück.',
    },
    appearance: 'A circle of ancient moss-covered standing stones in a forest clearing, a clear spring pool glittering with coins, shafts of sunlight, a small thatched hermitage.',
    role: { en: 'keeper of {name}', de: (n) => [`Hüterin am ${n}`, `Hüter am ${n}`] },
    clothes: 'moss-green robes belted with rope and a wooden leaf pendant',
  },
  {
    id: 'chapel', kind: 'temple', name: { en: (r) => `${r} Chapel`, de: (r) => `${r}kapelle`, g: 'f' }, site: { dist: [3, 7], prefer: 'h' }, gist: 'a hilltop chapel',
    description: {
      en: 'A wind-scoured chapel on a bare hilltop, its bell rung at dusk to guide travellers in. Whoever serves here keeps a guest bed, a herb garden and a long list of the missing.',
      de: 'Eine windgepeitschte Kapelle auf einer kahlen Kuppe; ihre Glocke läutet in der Dämmerung, um Reisenden den Weg zu weisen. Wer hier dient, hält ein Gästebett, einen Kräutergarten und eine lange Liste der Vermissten bereit.',
    },
    appearance: 'A small weathered stone chapel on a bare windswept hilltop, a bell in an open arch, a walled herb garden, a worn path, wide sky.',
    role: { en: 'priest of {name}', de: (n) => [`Priesterin der ${n}`, `Priester der ${n}`] },
    clothes: 'a plain grey habit and a heavy bronze holy symbol',
  },
  {
    id: 'oak', kind: 'landmark', themes: ['vale', 'forest', 'march', 'marsh'], name: { en: (r) => `${r} Oak`, de: (r) => `${r}eiche`, g: 'f', the: true }, site: { dist: [3, 7], prefer: 'fp' }, gist: "a hermit's ancient oak",
    description: {
      en: 'An oak so old that three villages claim it. A hermit lives in a hut among its roots and trades advice for bread.',
      de: 'Eine Eiche, so alt, dass drei Dörfer sie für sich beanspruchen. In einer Hütte zwischen ihren Wurzeln lebt jemand als Einsiedler und tauscht Rat gegen Brot.',
    },
    appearance: 'A colossal ancient oak with a hollow trunk, ribbons and charms tied to its lower branches, a tiny hut built among its roots, dappled light.',
    role: { en: 'hermit of {name}', de: (n) => [`Einsiedlerin an der ${n}`, `Einsiedler an der ${n}`] },
    clothes: 'a patchwork cloak of many faded colours and bare feet',
  },
  {
    id: 'abbey', kind: 'temple', name: { en: (r) => `${r} Abbey`, de: (r) => `${r}abtei`, g: 'f' }, site: { dist: [3, 7], prefer: 'ph' }, gist: 'a small abbey',
    description: {
      en: 'A small walled abbey with a brewhouse and beehives. The order shelters anyone who knocks and asks no questions until morning.',
      de: 'Eine kleine ummauerte Abtei mit Brauhaus und Bienenstöcken. Der Orden gewährt jedem Obdach, der anklopft, und stellt bis zum Morgen keine Fragen.',
    },
    appearance: 'A small walled abbey of honey-coloured stone, a squat bell tower, a brewhouse with a smoking chimney, rows of straw beehives, a heavy oak gate.',
    role: { en: 'cellarer of {name}', de: (n) => [`Kellermeisterin der ${n}`, `Kellermeister der ${n}`] },
    clothes: 'a brown habit with ink-stained cuffs and a ring of keys',
  },
  {
    id: 'light', kind: 'landmark', themes: ['coast'], name: { en: (r) => `${r} Light`, de: (r) => `${r}feuer`, g: 'n', the: true }, site: { dist: [3, 7], water: true }, gist: 'an old lighthouse',
    description: {
      en: 'An old lighthouse on a spit of rock, still lit every night by its keeper. From the gallery you can see half the coast, and everything that moves on it.',
      de: 'Ein alter Leuchtturm auf einer Felszunge, den noch jede Nacht jemand entzündet. Von der Galerie aus sieht man die halbe Küste und alles, was sich darauf bewegt.',
    },
    appearance: 'An old stone lighthouse on a spit of black rock, a fire burning in its iron lantern, crashing waves, a narrow stair, a tiny keeper’s cottage.',
    role: { en: 'keeper of {name}', de: (n) => [`Leuchtturmwärterin am ${n}`, `Leuchtturmwärter am ${n}`] },
    clothes: 'a salt-stiff greatcoat and fingerless gloves',
  },
];

export const KEEPER_TEXT: L[] = [
  {
    en: 'A soft-spoken healer who tends the place and the travellers who reach it. Knows the old stories of the region.',
    de: 'Heilkundig und von leiser Stimme; kümmert sich um den Ort und um die Reisenden, die ihn erreichen. Kennt die alten Geschichten der Gegend.',
  },
  {
    en: 'Has watched the roads from here for years and noticed who has stopped coming by. Gives shelter freely and asks few questions.',
    de: 'Beobachtet von hier aus seit Jahren die Wege und hat bemerkt, wer nicht mehr vorbeikommt. Gewährt bereitwillig Obdach und stellt selten Fragen.',
  },
];

// ------------------------------------------------------------ lesser sites

export interface MinorTpl {
  id: string;
  /** Not used beside a main threat with the same tag. */
  tag: string;
  kind: LocationKind;
  name: PlaceName;
  site: Siting;
  description: L;
  appearance: string;
  stages: [StageTpl, StageTpl];
  gist: string;
}

export const MINOR_SITES: MinorTpl[] = [
  {
    id: 'tower', tag: 'bandits', kind: 'ruin', name: { en: (r) => `${r}watch Tower`, de: (r) => `${r}wachtturm`, g: 'm' }, site: { dist: [4, 8], prefer: 'h' }, gist: 'a ruined watchtower where robbers are said to gather',
    description: {
      en: 'A broken watchtower from the old border wars, overgrown with briar. Smoke has been seen rising from it at night.',
      de: 'Ein zerfallener Wachturm aus den alten Grenzkriegen, von Dornengestrüpp überwuchert. Nachts hat man Rauch daraus aufsteigen sehen.',
    },
    appearance: 'A ruined round stone watchtower on a hill, its top third collapsed, walls wrapped in thorny briar, a half-burnt palisade around its base, crows circling.',
    stages: [
      { name: { en: 'the Palisade Camp', de: 'Palisadenlager' }, description: { en: 'A ring of stolen wagons and a cookfire inside the tower wall.', de: 'Ein Kreis aus gestohlenen Wagen und ein Kochfeuer innerhalb der Turmmauer.' }, monsters: [{ defId: 'bandit', count: 4 }] },
      { name: { en: 'the Tower Cellar', de: 'Turmkeller' }, description: { en: 'A damp cellar of crates and chains where the gang keeps what it has taken.', de: 'Ein feuchter Keller voller Kisten und Ketten, in dem die Bande ihre Beute verwahrt.' }, monsters: [{ defId: 'orc', count: 2 }] },
    ],
  },
  {
    id: 'barrow', tag: 'undead', kind: 'ruin', name: { en: (r) => `${r} Barrow`, de: (r) => `${r}hügel`, g: 'm' }, site: { dist: [4, 8], prefer: 'ph' }, gist: 'an old barrow that someone, or something, has opened',
    description: {
      en: 'A grass-grown barrow ringed by leaning stones. Its door slab has been dragged aside, from the inside.',
      de: 'Ein grasbewachsenes Hügelgrab, umringt von schiefen Steinen. Die Türplatte wurde beiseitegeschoben, und zwar von innen.',
    },
    appearance: 'A low grass-covered burial mound ringed by leaning standing stones, a dark stone doorway with its slab pushed aside, long grass bending in the wind.',
    stages: [
      { name: { en: 'the Forecourt of Bones', de: 'Knochenvorhof' }, description: { en: 'Old offerings and older bones, scattered as if something had walked through them.', de: 'Alte Opfergaben und noch ältere Knochen, verstreut, als wäre etwas hindurchgegangen.' }, monsters: [{ defId: 'skeleton', count: 3 }] },
      { name: { en: 'the Burial Chamber', de: 'Grabkammer' }, description: { en: 'A low stone chamber around a single plinth. The cold here has nothing to do with the weather.', de: 'Eine niedrige Steinkammer um einen einzelnen Sockel. Die Kälte hier hat nichts mit dem Wetter zu tun.' }, monsters: [{ defId: 'zombie', count: 2 }, { defId: 'ghoul', count: 1 }] },
    ],
  },
  {
    id: 'den', tag: 'beasts', kind: 'cave', name: { en: (r) => `${r} Den`, de: (r) => `${r}bau`, g: 'm', the: true }, site: { dist: [4, 8], prefer: 'fh' }, gist: 'a cave where a wolf pack has lost its fear of people',
    description: {
      en: 'A cave under a fallen pine where the bones of sheep lie in drifts. The pack that dens here has lost its fear of people.',
      de: 'Eine Höhle unter einer gestürzten Kiefer, in der sich Schafsknochen zu Haufen türmen. Das Rudel, das hier haust, hat die Scheu vor Menschen verloren.',
    },
    appearance: 'A dark cave mouth under the roots of a huge fallen pine, gnawed bones scattered on the slope below, paw prints in the mud, thick forest.',
    stages: [
      { name: { en: 'the Bone Slope', de: 'Knochenhang' }, description: { en: 'A scree of gnawed bones below the cave mouth. Yellow eyes watch from the brush.', de: 'Ein Geröllhang aus abgenagten Knochen unter dem Höhleneingang. Aus dem Gestrüpp beobachten euch gelbe Augen.' }, monsters: [{ defId: 'wolf', count: 4 }] },
      { name: { en: 'the Deep Den', de: 'Tiefer Bau' }, description: { en: 'The cave narrows, then opens into a warm, rank hollow. Something much larger than a wolf uncurls.', de: 'Die Höhle wird eng und öffnet sich dann zu einer warmen, stinkenden Mulde. Etwas viel Größeres als ein Wolf richtet sich auf.' }, monsters: [{ defId: 'dire_wolf', count: 1 }, { defId: 'wolf', count: 2 }] },
    ],
  },
  {
    id: 'manor', tag: 'ooze', kind: 'ruin', name: { en: (r) => `${r} Manor`, de: (r) => `${r}hof`, g: 'm' }, site: { dist: [4, 8], prefer: 'sp' }, gist: 'a burnt-out manor with flooded cellars',
    description: {
      en: 'A burnt-out manor sinking into its own gardens. The cellars are flooded, and what lives in them has had years to grow.',
      de: 'Ein ausgebranntes Gutshaus, das in seinen eigenen Gärten versinkt. Die Keller stehen unter Wasser, und was darin lebt, hatte Jahre Zeit zu wachsen.',
    },
    appearance: 'A roofless fire-blackened manor house half swallowed by an overgrown garden, empty window arches, a cracked fountain, stagnant water in the cellar stairs.',
    stages: [
      { name: { en: 'the Drowned Pantry', de: 'Ertrunkene Speisekammer' }, description: { en: 'Knee-deep black water, floating shelves and a smell like a wet grave.', de: 'Knietiefes schwarzes Wasser, treibende Regalbretter und ein Geruch wie ein nasses Grab.' }, monsters: [{ defId: 'giant_rat', count: 5 }] },
      { name: { en: 'the Wine Vault', de: 'Weingewölbe' }, description: { en: 'Rows of burst casks under a dripping vault. The floor glistens, and the glisten moves.', de: 'Reihen geplatzter Fässer unter einem tropfenden Gewölbe. Der Boden glänzt, und der Glanz bewegt sich.' }, monsters: [{ defId: 'gray_ooze', count: 2 }] },
    ],
  },
  {
    id: 'diggings', tag: 'kobolds', kind: 'cave', name: { en: (r) => `${r} Diggings`, de: (r) => `${r}grube`, g: 'f', the: true }, site: { dist: [4, 8], prefer: 'hm' }, gist: "old prospectors' pits, lately re-dug by smaller hands",
    description: {
      en: "A scatter of old prospectors' pits, lately re-dug by smaller hands. Tripwires and painted warning skulls mark the edge.",
      de: 'Eine Reihe alter Schürfgruben, in letzter Zeit von kleineren Händen neu ausgehoben. Stolperdrähte und bemalte Warnschädel markieren den Rand.',
    },
    appearance: 'A rocky hillside pocked with old mining pits and spoil heaps, small fresh tunnels, tripwires with bells, animal skulls daubed with red paint on stakes.',
    stages: [
      { name: { en: 'the Trapped Approach', de: 'Fallenreicher Zugang' }, description: { en: 'A gully strung with wires, bells and worse. Shrill voices argue somewhere ahead.', de: 'Eine Rinne voller Drähte, Glöckchen und Schlimmerem. Irgendwo weiter vorn streiten schrille Stimmen.' }, monsters: [{ defId: 'kobold', count: 5 }] },
      { name: { en: 'the Hoard Pit', de: 'Hortgrube' }, description: { en: "A pit lined with stolen tools, pots and one fine sword, guarded as if it were a dragon's hoard.", de: 'Eine Grube, ausgelegt mit gestohlenem Werkzeug, Töpfen und einem guten Schwert, bewacht wie ein Drachenhort.' }, monsters: [{ defId: 'kobold', count: 4 }, { defId: 'giant_centipede', count: 2 }] },
    ],
  },
];

// ------------------------------------------------------------ main threats

export interface LairTpl {
  name: PlaceName;
  description: L;
  appearance: string;
}

export interface ThreatTpl {
  id: string;
  tag: string;
  site: Siting;
  lairs: LairTpl[];
  /** What is going on, for the Dungeon Master. */
  premise: string;
  quest: { title: L; summary: L };
  stages: [StageTpl, StageTpl, StageTpl, StageTpl];
}

export const THREATS: ThreatTpl[] = [
  {
    id: 'goblins', tag: 'goblins', site: { dist: [3, 6], prefer: 'hf' },
    lairs: [
      {
        name: { en: (r) => `${r} Mill`, de: (r) => `${r}mühle`, g: 'f' },
        description: {
          en: 'An abandoned watermill on the hill road, its wheel rotted still. A hatch in the grain cellar leads down into tunnels the goblins have made their warren.',
          de: 'Eine verlassene Wassermühle an der Hügelstraße, das Rad längst verrottet. Eine Luke im Kornkeller führt hinab in Gänge, in denen sich die Goblins eingenistet haben.',
        },
        appearance: 'A large abandoned stone watermill on a hillside, a broken wheel green with moss, shuttered windows, a sagging roof, a dark cellar hatch standing open.',
      },
      {
        name: { en: (r) => `${r} Mine`, de: (r) => `${r}mine`, g: 'f' },
        description: {
          en: 'A played-out mine, boarded up a generation ago. The boards are down, and goblin drums sound from the lower galleries at night.',
          de: 'Eine ausgebeutete Mine, vor einer Generation vernagelt. Die Bretter sind fort, und nachts dröhnen Goblintrommeln aus den unteren Stollen.',
        },
        appearance: 'An old mine entrance in a rocky hillside, splintered boards torn from the timber frame, a rusted ore cart on its side, crude goblin totems of bone and rag.',
      },
    ],
    premise: 'Since last winter, goblins led by a bugbear chief have dug in {underSite}, {dist} of {town}, and raid the outlying farms.',
    quest: {
      title: { en: 'Silence the Warren', de: 'Bringt den Bau zum Schweigen' },
      summary: {
        en: 'Goblins from the tunnels {underSite} are raiding the farms. {authority} of {town} has posted a bounty for whoever ends it.',
        de: 'Goblins aus den Gängen {underSite} überfallen die Höfe. {authority} von {town} hat ein Kopfgeld für den ausgesetzt, der dem ein Ende macht.',
      },
    },
    stages: [
      { name: { en: 'the Rat-Gnawed Storeroom', de: 'Rattenzernagter Lagerraum' }, description: { en: 'Rotten grain sacks and splintered barrels. The floor is carpeted in droppings and something large rustles in the dark.', de: 'Verfaulte Kornsäcke und zersplitterte Fässer. Der Boden ist mit Kot bedeckt, und im Dunkeln raschelt etwas Großes.' }, monsters: [{ defId: 'giant_rat', count: 4 }] },
      { name: { en: 'the Goblin Guardroom', de: 'Goblin-Wachstube' }, description: { en: 'A smoky guardroom with a dying cookfire, gnawed bones and crude bedrolls.', de: 'Eine verräucherte Wachstube mit verlöschendem Kochfeuer, abgenagten Knochen und groben Schlafstätten.' }, monsters: [{ defId: 'goblin', count: 3 }] },
      { name: { en: 'the Old Crypt', de: 'Alte Gruft' }, description: { en: 'A vaulted crypt far older than the walls above. Burial niches line the walls and the air smells of dry dust.', de: 'Eine gewölbte Gruft, weit älter als die Mauern darüber. Grabnischen säumen die Wände, und die Luft riecht nach trockenem Staub.' }, monsters: [{ defId: 'skeleton', count: 2 }] },
      { name: { en: "the Chief's Den", de: 'Höhle des Häuptlings' }, description: { en: "The warren's great chamber, lit by braziers. A throne of scrap iron stands at its heart, draped in wolf pelts.", de: 'Die große Kammer des Baus, von Kohlebecken erhellt. In ihrer Mitte steht ein Thron aus Alteisen, mit Wolfsfellen behängt.' }, monsters: [{ defId: 'bugbear', count: 1 }, { defId: 'goblin', count: 2 }] },
    ],
  },
  {
    id: 'bandits', tag: 'bandits', site: { dist: [3, 6], prefer: 'hfp' },
    lairs: [
      {
        name: { en: (r) => `${r} Keep`, de: (r) => `${r}feste`, g: 'f' },
        description: {
          en: "A border keep abandoned when the garrison's pay stopped coming. Men who used to guard the roads from it now rob them.",
          de: 'Eine Grenzfeste, aufgegeben, als der Sold der Besatzung ausblieb. Männer, die von hier aus einst die Straßen bewachten, rauben sie nun aus.',
        },
        appearance: 'A small weathered stone keep on a rise, a cracked curtain wall patched with timber, a ragged banner, campfire smoke, stolen wagons in the yard.',
      },
      {
        name: { en: (r) => `${r} Quarry`, de: (r) => `${r}bruch`, g: 'm' },
        description: {
          en: "A worked-out quarry, its terraces turned into a robbers' roost. Lookouts sit on the lip, and the only path in runs under their bows.",
          de: 'Ein stillgelegter Steinbruch, dessen Terrassen zu einem Räubernest geworden sind. Am Rand sitzen Späher, und der einzige Weg hinein führt unter ihren Bögen hindurch.',
        },
        appearance: 'A deep abandoned stone quarry with stepped terraces, lean-to shelters and tents on the ledges, a rope bridge, lookouts with bows on the rim.',
      },
    ],
    premise: 'A company of deserters turned outlaws holds {site}, {dist} of {town}. They stop every wagon on the roads and call it a toll, and their captain has begun to talk like a lord.',
    quest: {
      title: { en: 'Break the Toll', de: 'Brecht den Wegzoll' },
      summary: {
        en: 'Outlaws holed up {inSite} rob every wagon on the roads and call it a toll. {authority} of {town} will pay well to see their captain brought down.',
        de: 'Gesetzlose, die sich {inSite} festgesetzt haben, plündern jeden Wagen auf den Straßen und nennen es Wegzoll. {authority} von {town} zahlt gut dafür, dass ihr Hauptmann zu Fall gebracht wird.',
      },
    },
    stages: [
      { name: { en: 'the Outer Pickets', de: 'Äußere Posten' }, description: { en: 'A barricade of felled trunks and a bored watch dicing by a fire.', de: 'Eine Barrikade aus gefällten Stämmen und eine gelangweilte Wache, die am Feuer würfelt.' }, monsters: [{ defId: 'bandit', count: 4 }] },
      { name: { en: 'the Kennels', de: 'Zwinger' }, description: { en: "Stolen wagons drawn into a ring, with the gang's half-wild dogs chained between them.", de: 'Gestohlene Wagen, zu einem Ring zusammengeschoben, und dazwischen angekettet die halbwilden Hunde der Bande.' }, monsters: [{ defId: 'bandit', count: 2 }, { defId: 'wolf', count: 2, name: { en: 'Guard dog', de: 'Wachhund' }, description: { en: 'A half-wild mastiff on a broken chain.', de: 'Eine halbwilde Dogge an einer zerrissenen Kette.' } }] },
      { name: { en: 'the Armoury', de: 'Rüstkammer' }, description: { en: "Racks of mismatched arms and the gang's hardest hands, sober and waiting.", de: 'Gestelle voller zusammengewürfelter Waffen und die härtesten Kerle der Bande, nüchtern und wartend.' }, monsters: [{ defId: 'hobgoblin', count: 2, name: { en: 'Deserter', de: 'Deserteur' }, description: { en: 'A hard-eyed former soldier in the remains of a uniform.', de: 'Ein ehemaliger Soldat mit hartem Blick in den Resten einer Uniform.' } }] },
      { name: { en: "the Captain's Hall", de: 'Halle des Hauptmanns' }, description: { en: 'A hall hung with looted banners. The captain sits at the high table as if it had always been his.', de: 'Eine Halle, behängt mit erbeuteten Bannern. Der Hauptmann sitzt an der Tafel, als hätte sie schon immer ihm gehört.' }, monsters: [{ defId: 'bugbear', count: 1, name: { en: 'Toll Captain', de: 'Zollhauptmann' }, description: { en: "A huge, scarred deserter in a captain's battered breastplate.", de: 'Ein riesiger, vernarbter Deserteur im verbeulten Brustpanzer eines Hauptmanns.' } }, { defId: 'bandit', count: 2 }] },
    ],
  },
  {
    id: 'undead', tag: 'undead', site: { dist: [3, 6], prefer: 'shp' },
    lairs: [
      {
        name: { en: (r) => `${r} Priory`, de: (r) => `${r}kloster`, g: 'n' },
        description: {
          en: 'A priory emptied by plague a century ago and left to the ivy. Its bell has started ringing again, with no one to pull the rope.',
          de: 'Ein Kloster, vor hundert Jahren von der Seuche geleert und dem Efeu überlassen. Seine Glocke läutet wieder, obwohl niemand am Seil zieht.',
        },
        appearance: 'A ruined stone priory smothered in ivy, a roofless nave, a leaning bell tower, an overgrown graveyard with open graves, cold mist between the stones.',
      },
      {
        name: { en: (r) => `${r} Catacombs`, de: (r) => `${r}gruft`, g: 'f', the: true },
        description: {
          en: "The old burial vaults of the region's first families, sealed for generations. The seal is broken, and the dead have begun to walk out at night.",
          de: 'Die alten Grüfte der ersten Familien der Gegend, seit Generationen versiegelt. Das Siegel ist gebrochen, und die Toten gehen nachts hinaus.',
        },
        appearance: 'A grand stone mausoleum doorway set into a hillside, cracked seal stones on the ground, weathered statues of mourners, dead grass, a stair leading down into dark.',
      },
    ],
    premise: 'Something has woken the dead {inSite}, {dist} of {town}. They walk out at night, the nearest farms stand empty, and nobody knows what stirred them.',
    quest: {
      title: { en: 'Lay Them to Rest', de: 'Bringt die Toten zur Ruhe' },
      summary: {
        en: 'At night the dead come walking {fromSite}, and the farms nearest it stand empty. {authority} of {town} will reward whoever finds what woke them and ends it.',
        de: 'Nachts kommen die Toten {fromSite}, und die nächstgelegenen Höfe stehen leer. {authority} von {town} belohnt den, der herausfindet, was sie geweckt hat, und dem ein Ende macht.',
      },
    },
    stages: [
      { name: { en: 'the Overgrown Yard', de: 'Überwucherter Hof' }, description: { en: 'Leaning gravestones in waist-high nettles. Some of the graves are open, from below.', de: 'Schiefe Grabsteine zwischen hüfthohen Brennnesseln. Einige Gräber sind offen, von unten her.' }, monsters: [{ defId: 'zombie', count: 3 }] },
      { name: { en: 'the Ossuary', de: 'Beinhaus' }, description: { en: 'Walls of stacked skulls and long bones. Several stacks have gaps, and something rattles in the dark.', de: 'Wände aus gestapelten Schädeln und Langknochen. In manchen Stapeln klaffen Lücken, und im Dunkeln klappert etwas.' }, monsters: [{ defId: 'skeleton', count: 4 }] },
      { name: { en: "the Embalmers' Hall", de: 'Halle der Einbalsamierer' }, description: { en: 'Stone tables, dry basins and hooks. What crouches over the nearest table is still eating.', de: 'Steintische, trockene Becken und Haken. Was über dem nächsten Tisch kauert, frisst noch.' }, monsters: [{ defId: 'ghoul', count: 2 }] },
      { name: { en: 'the Sealed Vault', de: 'Versiegeltes Gewölbe' }, description: { en: 'A vault of black stone behind a split seal. The cold pours out of it like water.', de: 'Ein Gewölbe aus schwarzem Stein hinter einem gesprungenen Siegel. Die Kälte strömt daraus hervor wie Wasser.' }, monsters: [{ defId: 'specter', count: 1, power: 'stronger', boss: true, name: { en: 'Pale Warden', de: 'Bleicher Wächter' }, description: { en: "The furious ghost of the vault's last guardian, bound to a duty long since void.", de: 'Der zornige Geist des letzten Hüters dieses Gewölbes, an eine längst erloschene Pflicht gebunden.' } }, { defId: 'skeleton', count: 2 }] },
    ],
  },
  {
    id: 'kobolds', tag: 'kobolds', site: { dist: [3, 6], prefer: 'hm' },
    lairs: [
      {
        name: { en: (r) => `${r} Delve`, de: (r) => `${r}stollen`, g: 'm', the: true },
        description: {
          en: 'A silver mine closed after the cave-in. Kobolds have reopened it their own way, and at night something in the deep answers their chanting.',
          de: 'Eine Silbermine, nach dem Einsturz geschlossen. Kobolde haben sie auf ihre Art wieder geöffnet, und nachts antwortet etwas in der Tiefe auf ihren Singsang.',
        },
        appearance: 'A half-collapsed mine adit in a scree slope, new props of mismatched timber, tiny clawed footprints, strings of bones and red rags, a faint orange glow deep inside.',
      },
      {
        name: { en: (r) => `${r} Caves`, de: (r) => `${r}höhlen`, g: 'p', the: true },
        description: {
          en: 'A honeycomb of caves in a chalk scarp, hung with scraps of red cloth. The kobolds who nest there have grown bold, as if something were protecting them.',
          de: 'Ein Wabenwerk aus Höhlen in einem Kreidehang, behängt mit roten Stofffetzen. Die Kobolde, die dort nisten, sind dreist geworden, als würde etwas sie beschützen.',
        },
        appearance: 'A pale chalk cliff riddled with small cave mouths, red cloth streamers fluttering, scorched offering bowls on ledges, narrow goat paths, wheeling crows.',
      },
    ],
    premise: 'Kobolds nesting {inSite}, {dist} of {town}, steal livestock and tools and leave scorched offerings behind. They are feeding a young dragon, and they grow bolder by the week.',
    quest: {
      title: { en: 'What They Worship', de: 'Was sie anbeten' },
      summary: {
        en: 'Kobolds {fromSite} steal livestock, tools and lately even toys, and leave scorched offerings behind. {authority} of {town} wants to know what they are feeding, and wants it gone.',
        de: 'Kobolde {fromSite} stehlen Vieh, Werkzeug und neuerdings sogar Spielzeug und lassen verkohlte Opfergaben zurück. {authority} von {town} will wissen, was sie da füttern, und will es los sein.',
      },
    },
    stages: [
      { name: { en: 'the Trapped Adit', de: 'Fallenstollen' }, description: { en: 'A low tunnel strung with wires and propped with suspicious care.', de: 'Ein niedriger Gang, mit Drähten durchzogen und verdächtig sorgfältig abgestützt.' }, monsters: [{ defId: 'kobold', count: 5 }] },
      { name: { en: 'the Fungus Gallery', de: 'Pilzgalerie' }, description: { en: 'A wet gallery of pale mushrooms. The rustling in them has too many legs.', de: 'Eine feuchte Galerie voller bleicher Pilze. Was darin raschelt, hat zu viele Beine.' }, monsters: [{ defId: 'giant_centipede', count: 3 }] },
      { name: { en: 'the Shrine of Scales', de: 'Schuppenschrein' }, description: { en: 'A cavern painted with a dragon in soot and ochre. The faithful are many and very loud.', de: 'Eine Kaverne, bemalt mit einem Drachen aus Ruß und Ocker. Die Gläubigen sind zahlreich und sehr laut.' }, monsters: [{ defId: 'kobold', count: 6 }] },
      { name: { en: "the Hatchling's Lair", de: 'Hort des Jungdrachen' }, description: { en: 'A heat-cracked chamber heaped with stolen metal. Something the size of a pony uncoils on top of it.', de: 'Eine von Hitze gesprungene Kammer, vollgehäuft mit gestohlenem Metall. Obenauf entrollt sich etwas von der Größe eines Ponys.' }, monsters: [{ defId: 'wyrmling', count: 1, power: 'weaker', boss: true }, { defId: 'kobold', count: 2 }] },
    ],
  },
  {
    id: 'spiders', tag: 'beasts', site: { dist: [3, 6], prefer: 'fs' },
    lairs: [
      {
        name: { en: (r) => `${r} Thicket`, de: (r) => `${r}dickicht`, g: 'n', the: true },
        description: {
          en: 'A stretch of old forest where the webs hang like sailcloth between the trunks. Woodcutters who went in to clear a path did not come out.',
          de: 'Ein Stück alten Waldes, in dem die Netze wie Segeltuch zwischen den Stämmen hängen. Holzfäller, die hineingingen, um einen Weg freizuschlagen, kamen nicht wieder heraus.',
        },
        appearance: 'A dense dark stand of ancient trees draped in thick grey spider webs like sailcloth, cocooned shapes hanging from branches, an abandoned axe in a stump.',
      },
      {
        name: { en: (r) => `${r} Sinkhole`, de: (r) => `${r}schlund`, g: 'm', the: true },
        description: {
          en: 'A sinkhole in the forest floor, its walls sheeted in grey silk. Things are lowered into it at night, and nothing climbs back up.',
          de: 'Ein Erdfall im Waldboden, die Wände mit grauer Seide überzogen. Nachts wird etwas hinabgelassen, und nichts klettert wieder herauf.',
        },
        appearance: 'A wide round sinkhole in a forest floor, its rock walls sheeted in grey silk, thick web strands anchored to the surrounding trees, darkness below.',
      },
    ],
    premise: 'Giant spiders have spread out {fromSite}, {dist} of {town}. People and cattle vanish along the forest road, and an old brood mother at the heart of the webs grows fat.',
    quest: {
      title: { en: 'Cut the Web', de: 'Zerreißt das Netz' },
      summary: {
        en: 'People and cattle vanish along the forest road, and the webs {atSite} grow thicker every week. {authority} of {town} will pay whoever burns out the nest.',
        de: 'An der Waldstraße verschwinden Menschen und Vieh, und {atSite} werden die Netze jede Woche dichter. {authority} von {town} bezahlt den, der das Nest ausräuchert.',
      },
    },
    stages: [
      { name: { en: 'the Leaf Litter', de: 'Laubstreu' }, description: { en: 'A hollow deep in rotting leaves. The leaves ripple toward you.', de: 'Eine Senke, tief voll mit moderndem Laub. Das Laub wogt auf euch zu.' }, monsters: [{ defId: 'giant_centipede', count: 3 }] },
      { name: { en: 'the Web-Hung Path', de: 'Netzverhangener Pfad' }, description: { en: 'Silk across every gap, and bundles hanging from the branches. Some of the bundles still move.', de: 'Seide über jeder Lücke und Bündel, die von den Ästen hängen. Manche der Bündel bewegen sich noch.' }, monsters: [{ defId: 'giant_spider', count: 1 }, { defId: 'giant_centipede', count: 2 }] },
      { name: { en: 'the Larder', de: 'Speisekammer' }, description: { en: 'Cocoons in rows, man-sized and cow-sized. One of them is calling for help.', de: 'Kokons in Reihen, mannsgroß und kuhgroß. Aus einem davon ruft jemand um Hilfe.' }, monsters: [{ defId: 'giant_spider', count: 2 }] },
      { name: { en: "the Brood Mother's Web", de: 'Netz der Brutmutter' }, description: { en: 'A funnel of silk as wide as a barn, dropping into the dark. The whole web trembles as she comes.', de: 'Ein Trichter aus Seide, breit wie eine Scheune, der ins Dunkel abfällt. Das ganze Netz zittert, als sie kommt.' }, monsters: [{ defId: 'giant_spider', count: 1, power: 'stronger', boss: true, name: { en: 'Brood Mother', de: 'Brutmutter' }, description: { en: 'A bloated, scarred spider the size of a cart, mother of everything in these webs.', de: 'Eine aufgedunsene, vernarbte Spinne von der Größe eines Karrens, Mutter von allem, was in diesen Netzen lebt.' } }, { defId: 'giant_centipede', count: 2, name: { en: 'Spiderling', de: 'Jungspinne' }, description: { en: 'A pale, quick spider no bigger than a dog.', de: 'Eine bleiche, flinke Spinne, nicht größer als ein Hund.' } }] },
    ],
  },
  {
    id: 'gnolls', tag: 'gnolls', site: { dist: [3, 6], prefer: 'ph' },
    lairs: [
      {
        name: { en: (r) => `${r} Gorge`, de: (r) => `${r}klamm`, g: 'f', the: true },
        description: {
          en: 'A dry gorge where a gnoll pack has made its camp among the bones of its kills. Their howling carries for miles on a still night.',
          de: 'Eine trockene Klamm, in der ein Gnollrudel zwischen den Knochen seiner Beute lagert. In stillen Nächten trägt ihr Heulen meilenweit.',
        },
        appearance: 'A narrow dry gorge of red rock, hide tents among heaps of bones, skulls on stakes, vultures on the rim, smoke from a great fire.',
      },
      {
        name: { en: (r) => `${r} Steading`, de: (r) => `${r}gehöft`, g: 'n', the: true },
        description: {
          en: 'A fortified farmstead, overrun in a single night. The pack that took it has stayed, and hunts from it in a widening ring.',
          de: 'Ein befestigtes Gehöft, in einer einzigen Nacht überrannt. Das Rudel, das es genommen hat, ist geblieben und jagt von dort aus in immer weiterem Umkreis.',
        },
        appearance: 'A fortified farmstead with a broken gate, a burnt barn, claw marks on the doors, hides stretched on frames, bones heaped in the yard, a crude bone totem.',
      },
    ],
    premise: 'A gnoll pack has made its lair {atSite}, {dist} of {town}. It runs down herds and herders alike, and every kill makes it bolder.',
    quest: {
      title: { en: 'Hunt the Hunters', de: 'Jagt die Jäger' },
      summary: {
        en: "A gnoll pack lairing {atSite} is running down herds and herders alike. {authority} of {town} has put a price on the pack lord's head.",
        de: 'Ein Gnollrudel, das {atSite} haust, hetzt Herden und Hirten gleichermaßen zu Tode. {authority} von {town} hat einen Preis auf den Kopf des Rudelführers ausgesetzt.',
      },
    },
    stages: [
      { name: { en: 'the Kill Ground', de: 'Rissplatz' }, description: { en: "Trampled grass, dark stains and circling crows. The pack's hounds have not finished here.", de: 'Zertretenes Gras, dunkle Flecken und kreisende Krähen. Die Hunde des Rudels sind hier noch nicht fertig.' }, monsters: [{ defId: 'wolf', count: 3 }] },
      { name: { en: 'the Outer Camp', de: 'Äußeres Lager' }, description: { en: 'Hide tents, a spit over a fire and a watch that smells you before it sees you.', de: 'Zelte aus Häuten, ein Spieß über dem Feuer und eine Wache, die euch riecht, bevor sie euch sieht.' }, monsters: [{ defId: 'gnoll', count: 2 }] },
      { name: { en: 'the Trophy Pit', de: 'Trophäengrube' }, description: { en: "A pit of skulls and stolen harness where the pack's fiercest fight over scraps.", de: 'Eine Grube voller Schädel und geraubtem Zaumzeug, in der sich die Wildesten des Rudels um Reste balgen.' }, monsters: [{ defId: 'gnoll', count: 2 }, { defId: 'wolf', count: 2 }] },
      { name: { en: "the Pack Lord's Fire", de: 'Feuer des Rudelführers' }, description: { en: 'A great fire ringed with stakes. The pack lord rises from beside it, taller than any of the rest.', de: 'Ein großes Feuer, von Pfählen umringt. Daneben erhebt sich der Rudelführer, größer als alle anderen.' }, monsters: [{ defId: 'gnoll', count: 1, power: 'stronger', boss: true, look: ['size:large'], name: { en: 'Pack Lord', de: 'Rudelführer' }, description: { en: 'A towering gnoll in a cloak of scalps, its muzzle grey with old scars.', de: 'Ein hünenhafter Gnoll in einem Umhang aus Skalpen, die Schnauze grau von alten Narben.' } }, { defId: 'gnoll', count: 2 }] },
    ],
  },
];

/** What each section of a lair holds, by depth. */
export const STAGE_LOOT = [
  { gold: 20, items: [{ id: 'potion_healing', qty: 2 }] },
  { gold: 35, items: [{ id: 'chain_shirt' }, { id: 'shortbow' }] },
  { gold: 60, items: [{ id: 'longsword_plus1' }, { id: 'studded_leather' }] },
  { gold: 150, items: [{ id: 'cloak_protection' }, { id: 'ring_protection' }, { id: 'potion_greater_healing', qty: 2 }] },
];
export const MINOR_LOOT = [
  { gold: 45, items: [{ id: 'potion_healing' }] },
  { gold: 90, items: [{ id: 'potion_greater_healing' }, { id: 'scale_mail' }] },
];
export const QUEST_REWARD = { rewardXp: 300, rewardGold: 100 };

// ---------------------------------------------------------------- premises

export interface PremiseTpl {
  /** Where the party stands when the story opens. */
  startIn: 'town' | 'tavern' | 'wild' | 'shore';
  /** A random region is this kind of country. */
  theme?: string;
  /** What the Dungeon Master is told about the opening. */
  opening: string;
  /** What the players read when no AI is telling the story. */
  intro: L;
}

export const PREMISE_TEXT: Record<string, PremiseTpl> = {
  arrival: {
    startIn: 'town',
    opening: 'The heroes have just arrived in {town} looking for work and a name for themselves. Where they go and what they do is up to them.',
    intro: { en: 'Your road ends, for now, {regionIn}.', de: 'Eure Reise endet vorerst {regionIn}.' },
  },
  shipwreck: {
    startIn: 'shore', theme: 'coast',
    opening: "The heroes were passengers or crew aboard a small trading ship (a river or lake boat if this region has no sea) that broke up on the rocks in last night's storm. They wake at dawn on the shore among the wreckage, soaked and bruised, with only the gear they carried. Nobody else from the ship is in sight. They have never been in this country: they know nothing of {town}, whose smoke they can see a few hours away, or of anyone in it. Open on the shore. Let the players say why their heroes were aboard. Something worth following has washed up with them: a survivor, a sealed chest or tracks leading inland.",
    intro: { en: 'At dawn the water gives you back. You lie on a strange shore {regionIn}, among the wreckage of your ship.', de: 'Im Morgengrauen gibt euch das Wasser wieder her. Ihr liegt an einem fremden Ufer {regionIn}, zwischen den Trümmern eures Schiffes.' },
  },
  caravan: {
    startIn: 'town',
    opening: "The heroes rode into {town} this morning as hired guards of a merchant caravan. On the last night on the road something went wrong: a wagon and its driver vanished from the camp without a sound. The caravan master refuses to pay the guards in full until it is found, and is loudly blaming them in the square. Open there. Invent the caravan master and save them with remember_npc. The missing wagon should lead toward the region's main trouble without forcing the players to follow it.",
    intro: { en: 'You ride into {town} with the caravan you were hired to guard, one wagon short.', de: 'Ihr reitet mit der Karawane, die ihr bewachen solltet, in {town} ein, und ein Wagen fehlt.' },
  },
  prison: {
    startIn: 'wild',
    opening: "The heroes were prisoners in a barred wagon on its way to {town}. Whether they were guilty, and of what, is for the players to say. Minutes ago the team bolted and the wagon overturned on the road. The guards are dead or have run, the lock has burst, and the heroes' confiscated gear was in the strongbox under the driver's seat, so they are fully equipped. They stand free in the wild. Nobody in {town} knows their faces yet, but someone will come looking within a day or two. Open at the wreck of the wagon. Something frightened the horses: hint at it.",
    intro: { en: 'The prison wagon lies on its side, one wheel still turning. The guards are gone, the lock is broken, and for the first time in weeks nobody is telling you where to go.', de: 'Der Gefangenenwagen liegt auf der Seite, ein Rad dreht sich noch. Die Wachen sind fort, das Schloss ist aufgesprungen, und zum ersten Mal seit Wochen sagt euch niemand, wohin ihr zu gehen habt.' },
  },
  festival: {
    startIn: 'town',
    opening: "{town} is in the middle of its biggest festival of the year, and the heroes came for it: the square is full of stalls, music, contests and strangers. Open in the middle of the celebration at dusk and give each hero a moment of fun. Then, in the first or second scene, let something go badly wrong in front of everyone, tied to the region's main trouble: a theft, a kidnapping or an attack out of the dark. The town will look to whoever acts first.",
    intro: { en: '{town} is celebrating. Lanterns hang over the square, the music is loud, and for one evening nobody is thinking about trouble.', de: '{town} feiert. Laternen hängen über dem Platz, die Musik ist laut, und für einen Abend denkt niemand an Ärger.' },
  },
  letter: {
    startIn: 'tavern',
    opening: "Each hero received a letter from the same old friend, asking them to come to {tavern} in {town} as quickly as they could and saying little more than that the friend had found something and no longer knew whom to trust. The heroes have just arrived at {tavern}. The friend is not there and has not been seen for three days; the innkeeper is holding the friend's room, an unpaid bill and a sealed package addressed to the heroes. Invent the friend (name, trade, and how each hero might know them; let the players fill in details) and save them with remember_npc. What the friend found is tied to the region's main trouble.",
    intro: { en: 'The letter said to come quickly, and to come to {tavern}. You are here. The friend who wrote it is not.', de: 'Im Brief stand, ihr sollt schnell kommen, und zwar ins Gasthaus „{tavern}“. Ihr seid da. Der Freund, der ihn geschrieben hat, ist es nicht.' },
  },
  custom: {
    startIn: 'town',
    opening: 'The host of this table wrote the premise for the opening themselves: {custom}. Honour it. Open the story with it, bend the places and people of the region to fit it where needed, and save anything new you introduce with your memory tools.',
    intro: { en: 'Your story begins {regionIn}.', de: 'Eure Geschichte beginnt {regionIn}.' },
  },
};
