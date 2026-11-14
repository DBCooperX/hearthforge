// The first dungeon: the Goblin Warren beneath the Hearthforge.
//
// Legend: # wall, . floor, + door, C chest, @ hero start,
//         g goblin, r giant rat, k skeleton, B bugbear chief.
// Monsters standing in the same room (floor region bounded by walls and doors)
// form one encounter.

export const DUNGEON_ROWS = [
  '################################',
  '#.....#..........#.............#',
  '#.@@..#..r....r..#......k......#',
  '#.@@..+..........+.............#',
  '#.....#....r.....#..........C..#',
  '#..C..#..........#.............#',
  '####+######+######......k......#',
  '#........#......C#.............#',
  '#........#.......#######+#######',
  '#..g..g..#.......#.............#',
  '#........+.......#..g.......g..#',
  '#....g...#.......#.............#',
  '#........#.......+......B......#',
  '#C.......#.......#.............#',
  '##########.......#.............#',
  '#........+.......#.............#',
  '#.C......#.......#............C#',
  '################################',
];

export const MONSTER_SYMBOLS: Record<string, string> = {
  g: 'goblin',
  r: 'giant_rat',
  k: 'skeleton',
  B: 'bugbear',
};

export interface Loot {
  gold: number;
  items: { id: string; qty?: number }[];
}

/** Chest contents keyed by "x,y". */
export const CHEST_LOOT: Record<string, Loot> = {
  '3,5': { gold: 20, items: [{ id: 'potion_healing', qty: 2 }] },
  '28,4': { gold: 60, items: [{ id: 'longsword_plus1' }] },
  '16,7': { gold: 30, items: [{ id: 'studded_leather' }, { id: 'potion_healing' }] },
  '1,13': { gold: 35, items: [{ id: 'chain_shirt' }, { id: 'shortbow' }] },
  '2,16': { gold: 80, items: [{ id: 'ring_protection' }] },
  '30,16': { gold: 150, items: [{ id: 'cloak_protection' }, { id: 'potion_greater_healing', qty: 2 }] },
};

export interface Area {
  name: string;
  description: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const AREAS: Area[] = [
  { name: 'Cellar Landing', description: 'A cold cellar beneath the abandoned Hearthforge smithy. A rope ladder leads back up; a dusty supply chest sits by the south wall.', x0: 1, y0: 1, x1: 5, y1: 5 },
  { name: 'Rat-Gnawed Storeroom', description: 'Rotten grain sacks and splintered barrels. The floor is carpeted in droppings and something large rustles in the dark.', x0: 7, y0: 1, x1: 16, y1: 5 },
  { name: 'Old Crypt', description: 'A vaulted crypt older than the smithy above. Burial niches line the walls and the air smells of dry dust.', x0: 18, y0: 1, x1: 30, y1: 7 },
  { name: 'Goblin Guardroom', description: 'A smoky guardroom with a dying cookfire, gnawed bones and crude bedrolls.', x0: 1, y0: 7, x1: 8, y1: 13 },
  { name: 'Collapsed Forge Hall', description: 'A long hall of cracked anvils and cold forge pits, its pillars scarred with goblin graffiti.', x0: 10, y0: 7, x1: 16, y1: 16 },
  { name: 'Hidden Cache', description: 'A cramped side chamber the goblins use to stash their best plunder.', x0: 1, y0: 15, x1: 8, y1: 16 },
  { name: "Chief's Den", description: "The warren's great chamber, lit by braziers. A throne of scrap iron stands at its heart, draped in wolf pelts.", x0: 18, y0: 9, x1: 30, y1: 16 },
];

export const DUNGEON_PREMISE =
  'The Hearthforge was once the finest smithy in the valley. Since its master vanished, goblins led by a bugbear chief have moved into the cellars and tunnels below and raid the nearby farms. The heroes have descended through the cellar to end the raids.';
