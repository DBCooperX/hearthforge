// The Emberfall Vale: the starting region, its seeded places and people, and the
// tables the server rolls on while the party travels. Everything the Dungeon Master
// invents later (new places, people, quests) is added to the saved game, not here.

import type { TerrainCode } from '../../../shared/hex';
import type { Disposition, LocationKind } from '../../../shared/types';

export const WORLD_WIDTH = 22;
export const WORLD_HEIGHT = 15;

export const SETTING_NAME = 'the Emberfall Vale';

export const SETTING_PREMISE =
  'The Emberfall Vale is a frontier valley of farms, pine woods and old stone, a week from the nearest city. Its heart is the market town of Emberfall. ' +
  'The Hearthforge, a few hours north-east of town, was once the finest smithy in the valley. Since its master Dorn Hearthforge vanished two winters ago, goblins led by a bugbear chief have moved into the cellars beneath it and raid the outlying farms. ' +
  'Beyond that trouble the Vale is open country: a fishing village on the Greywater, a ruined watchtower where bandits are said to gather, a shrine in the Mosswood, and whatever else lies in the hills that nobody has mapped. ' +
  'The heroes have just arrived in Emberfall looking for work and a name for themselves. Where they go and what they do is up to them.';

export interface GroupSpec {
  defId: string;
  count: number;
}

export interface StageDef {
  name: string;
  description: string;
  monsters: GroupSpec[];
  loot: { gold: number; items: { id: string; qty?: number }[] };
}

export interface SeedLocation {
  id: string;
  name: string;
  kind: LocationKind;
  q: number;
  r: number;
  parentId?: string;
  terrain?: TerrainCode;
  description: string;
  appearance: string;
  /** Marked on the party's map from the start. */
  known?: boolean;
  stages?: StageDef[];
  /** Quest completed when the last stage is cleared. */
  questId?: string;
}

export const START_LOCATION = 'emberfall';

export const SEED_LOCATIONS: SeedLocation[] = [
  {
    id: 'emberfall', name: 'Emberfall', kind: 'town', q: 10, r: 7, terrain: 'p', known: true,
    description: 'A walled market town of slate roofs and chimney smoke at the meeting of two roads. Farmers, tinkers and caravan guards crowd its square on market days.',
    appearance: 'A small medieval market town ringed by a low grey stone wall, timber-framed houses with dark slate roofs, a cobbled square with a stone well, pine-covered hills behind, warm lamplight in the windows.',
  },
  {
    id: 'gilded_anvil', name: 'The Gilded Anvil', kind: 'tavern', q: 10, r: 7, parentId: 'emberfall', known: true,
    description: 'The busiest taproom in Emberfall, named for the gilt anvil over its door, a gift from the Hearthforge in better days. Rooms upstairs, stew on the fire, and every rumour in the Vale.',
    appearance: 'A low-beamed tavern common room with a great stone hearth, a long oak bar worn smooth, copper mugs on hooks, a small gilded anvil mounted above the door, sawdust on the floor, firelight and candle lanterns.',
  },
  {
    id: 'old_hearthforge', name: 'The Old Hearthforge', kind: 'dungeon', q: 14, r: 4, terrain: 'h', known: true, questId: 'warren',
    description: 'The abandoned smithy on the hill road, its great chimney cold. A rope ladder in the cellar leads down into tunnels the goblins have made their warren.',
    appearance: 'A large abandoned stone smithy on a windswept hillside, a tall cold chimney, broken shutters, a sagging slate roof, rusted anvils in the yard, a dark cellar hatch standing open.',
    stages: [
      { name: 'the Rat-Gnawed Storeroom', description: 'Rotten grain sacks and splintered barrels. The floor is carpeted in droppings and something large rustles in the dark.', monsters: [{ defId: 'giant_rat', count: 4 }], loot: { gold: 20, items: [{ id: 'potion_healing', qty: 2 }] } },
      { name: 'the Goblin Guardroom', description: 'A smoky guardroom with a dying cookfire, gnawed bones and crude bedrolls.', monsters: [{ defId: 'goblin', count: 3 }], loot: { gold: 35, items: [{ id: 'chain_shirt' }, { id: 'shortbow' }] } },
      { name: 'the Old Crypt', description: 'A vaulted crypt older than the smithy above. Burial niches line the walls and the air smells of dry dust.', monsters: [{ defId: 'skeleton', count: 2 }], loot: { gold: 60, items: [{ id: 'longsword_plus1' }, { id: 'studded_leather' }] } },
      { name: "the Chief's Den", description: "The warren's great chamber, lit by braziers. A throne of scrap iron stands at its heart, draped in wolf pelts.", monsters: [{ defId: 'bugbear', count: 1 }, { defId: 'goblin', count: 2 }], loot: { gold: 150, items: [{ id: 'cloak_protection' }, { id: 'ring_protection' }, { id: 'potion_greater_healing', qty: 2 }] } },
    ],
  },
  {
    id: 'greywater', name: 'Greywater', kind: 'village', q: 5, r: 10, terrain: 'p',
    description: 'A fishing village of stilt houses and drying nets on the edge of the Greywater. The folk are close-mouthed with strangers and generous with smoked eel.',
    appearance: 'A small fishing village of weathered wooden stilt houses over reed beds beside a grey lake, nets drying on racks, flat-bottomed boats pulled up on a muddy shore, morning mist.',
  },
  {
    id: 'thornwatch', name: 'Thornwatch Tower', kind: 'ruin', q: 16, r: 10, terrain: 'h',
    description: 'A broken watchtower from the old border wars, overgrown with briar. Smoke has been seen rising from it at night.',
    appearance: 'A ruined round stone watchtower on a hill, its top third collapsed, walls wrapped in thorny briar, a half-burnt palisade around its base, crows circling.',
    stages: [
      { name: 'the Palisade Camp', description: 'A ring of stolen wagons and a cookfire inside the tower wall.', monsters: [{ defId: 'bandit', count: 4 }], loot: { gold: 45, items: [{ id: 'potion_healing' }] } },
      { name: 'the Tower Cellar', description: 'A damp cellar of crates and chains where the gang keeps what it has taken.', monsters: [{ defId: 'orc', count: 2 }], loot: { gold: 90, items: [{ id: 'potion_greater_healing' }, { id: 'scale_mail' }] } },
    ],
  },
  {
    id: 'mosswood_shrine', name: 'Mosswood Shrine', kind: 'shrine', q: 6, r: 3, terrain: 'f',
    description: 'A ring of mossy standing stones around a spring, tended by a single keeper. Travellers leave a coin in the water for safe roads.',
    appearance: 'A circle of ancient moss-covered standing stones in a deep green forest clearing, a clear spring pool at the centre glittering with coins, shafts of sunlight through tall pines, a small thatched hermitage.',
  },
];

export interface SeedNpc {
  id: string;
  name: string;
  role: string;
  description: string;
  appearance: string;
  disposition: Disposition;
  locationId: string;
}

export const SEED_NPCS: SeedNpc[] = [
  {
    id: 'marta', name: 'Marta Coppervein', role: 'innkeeper of The Gilded Anvil', disposition: 'friendly', locationId: 'gilded_anvil',
    description: 'A broad-shouldered dwarf who hears everything said in her taproom and repeats about half of it. Her brother worked the Hearthforge bellows.',
    appearance: 'A stout middle-aged dwarf woman with copper-red braids streaked grey, a flour-dusted leather apron, rolled sleeves, shrewd green eyes and a quick smile.',
  },
  {
    id: 'reeve_venn', name: 'Reeve Aldous Venn', role: 'reeve of Emberfall', disposition: 'neutral', locationId: 'emberfall',
    description: 'The tired, careful man who keeps the town running. He has posted a bounty for an end to the goblin raids and cannot afford to lose more farms.',
    appearance: 'A thin grey-haired man in his fifties with a trimmed beard, ink-stained fingers, a dark blue wool coat with a bronze chain of office, and tired watchful eyes.',
  },
  {
    id: 'tobren', name: 'Old Tobren', role: 'ferryman of Greywater', disposition: 'wary', locationId: 'greywater',
    description: 'He has poled the Greywater for forty years and swears something large moved under his boat last month.',
    appearance: 'A wiry weathered old man with a white stubble beard, a patched oilskin coat, a wide-brimmed straw hat and a long ferry pole.',
  },
  {
    id: 'sister_ilse', name: 'Sister Ilse', role: 'keeper of Mosswood Shrine', disposition: 'friendly', locationId: 'mosswood_shrine',
    description: 'A soft-spoken healer who tends the spring and the travellers who reach it. She knows the old stories of the Vale.',
    appearance: 'A calm woman in her thirties with a shaved head, moss-green robes belted with rope, bare feet, and a wooden pendant shaped like a leaf.',
  },
];

export const SEED_QUESTS = [
  {
    id: 'warren', title: 'Silence the Warren',
    summary: 'Goblins from the cellars under the Old Hearthforge are raiding the farms. Reeve Aldous Venn of Emberfall has posted a bounty for whoever ends it.',
    rewardXp: 300, rewardGold: 100,
  },
];

/** Wilderness encounters by terrain. Counts are for a party of four and scale down for smaller parties. */
export const ENCOUNTERS: Record<string, GroupSpec[][]> = {
  r: [[{ defId: 'bandit', count: 3 }], [{ defId: 'goblin', count: 3 }]],
  p: [[{ defId: 'wolf', count: 3 }], [{ defId: 'bandit', count: 4 }], [{ defId: 'goblin', count: 4 }]],
  f: [[{ defId: 'wolf', count: 4 }], [{ defId: 'goblin', count: 4 }], [{ defId: 'bandit', count: 3 }, { defId: 'wolf', count: 1 }]],
  h: [[{ defId: 'orc', count: 2 }], [{ defId: 'goblin', count: 4 }], [{ defId: 'wolf', count: 3 }]],
  m: [[{ defId: 'orc', count: 3 }], [{ defId: 'orc', count: 1 }, { defId: 'wolf', count: 2 }]],
  s: [[{ defId: 'zombie', count: 3 }], [{ defId: 'giant_rat', count: 5 }], [{ defId: 'skeleton', count: 3 }]],
};

/** Kinds of place where a long rest cannot be interrupted. */
export const SAFE_KINDS: LocationKind[] = ['town', 'village', 'tavern', 'temple', 'shrine', 'shop'];
/** Kinds of place whose first visit is a key story moment. */
export const MAJOR_KINDS: LocationKind[] = ['town', 'village', 'dungeon', 'ruin', 'cave', 'temple'];
