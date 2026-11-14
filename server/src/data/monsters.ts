// Monster statistics from the D&D 5e System Reference Document 5.1 (CC-BY-4.0).

export interface MonsterAttack {
  name: string;
  toHit: number;
  damage: string;
  damageType: string;
  /** Reach or range in feet. */
  range: number;
  longRange?: number;
  ranged?: boolean;
}

export interface MonsterDef {
  id: string;
  name: string;
  sprite: string;
  ac: number;
  hp: number;
  speed: number;
  dexMod: number;
  saves: Partial<Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number>>;
  attacks: MonsterAttack[];
  vulnerable?: string[];
  immune?: string[];
  packTactics?: boolean;
  boss?: boolean;
  /** Experience awarded for defeating it. */
  xp: number;
  /** Coins it carries, as a dice expression. */
  gold?: string;
  description: string;
}

export const MONSTERS: Record<string, MonsterDef> = {
  goblin: {
    id: 'goblin',
    xp: 50,
    gold: '2d6',
    name: 'Goblin',
    sprite: 'goblin',
    ac: 15,
    hp: 7,
    speed: 30,
    dexMod: 2,
    saves: { str: -1, dex: 2, con: 0, int: 0, wis: -1, cha: -1 },
    attacks: [
      { name: 'Scimitar', toHit: 4, damage: '1d6+2', damageType: 'slashing', range: 5 },
      { name: 'Shortbow', toHit: 4, damage: '1d6+2', damageType: 'piercing', range: 80, longRange: 320, ranged: true },
    ],
    description: 'Small, cunning and cowardly humanoid raider.',
  },
  giant_rat: {
    id: 'giant_rat',
    xp: 25,
    name: 'Giant Rat',
    sprite: 'rat',
    ac: 12,
    hp: 7,
    speed: 30,
    dexMod: 2,
    saves: { str: -2, dex: 2, con: 0, int: -4, wis: 0, cha: -3 },
    attacks: [{ name: 'Bite', toHit: 4, damage: '1d4+2', damageType: 'piercing', range: 5 }],
    packTactics: true,
    description: 'A dog-sized rat that fights in packs.',
  },
  skeleton: {
    id: 'skeleton',
    xp: 50,
    gold: '1d6',
    name: 'Skeleton',
    sprite: 'skeleton',
    ac: 13,
    hp: 13,
    speed: 30,
    dexMod: 2,
    saves: { str: 0, dex: 2, con: 2, int: -2, wis: -1, cha: -3 },
    attacks: [
      { name: 'Shortsword', toHit: 4, damage: '1d6+2', damageType: 'piercing', range: 5 },
      { name: 'Shortbow', toHit: 4, damage: '1d6+2', damageType: 'piercing', range: 80, longRange: 320, ranged: true },
    ],
    vulnerable: ['bludgeoning'],
    immune: ['poison'],
    description: 'Animated bones that obey their long-dead orders. Brittle against bludgeoning weapons.',
  },
  bugbear: {
    id: 'bugbear',
    xp: 200,
    gold: '4d10',
    name: 'Bugbear Chief',
    sprite: 'bugbear',
    ac: 16,
    hp: 27,
    speed: 30,
    dexMod: 2,
    saves: { str: 2, dex: 2, con: 1, int: -1, wis: 0, cha: -1 },
    attacks: [
      { name: 'Morningstar', toHit: 4, damage: '2d8+2', damageType: 'piercing', range: 5 },
      { name: 'Javelin', toHit: 4, damage: '1d6+2', damageType: 'piercing', range: 30, longRange: 120, ranged: true },
    ],
    boss: true,
    description: 'A hulking, hairy goblinoid brute who rules the warren by fear.',
  },
  wolf: {
    id: 'wolf',
    xp: 50,
    name: 'Wolf',
    sprite: 'wolf',
    ac: 13,
    hp: 11,
    speed: 40,
    dexMod: 2,
    saves: { str: 1, dex: 2, con: 1, int: -4, wis: 1, cha: -2 },
    attacks: [{ name: 'Bite', toHit: 4, damage: '2d4+2', damageType: 'piercing', range: 5 }],
    packTactics: true,
    description: 'A lean grey hunter that circles with its pack and goes for stragglers.',
  },
  bandit: {
    id: 'bandit',
    xp: 25,
    gold: '2d8',
    name: 'Bandit',
    sprite: 'bandit',
    ac: 12,
    hp: 11,
    speed: 30,
    dexMod: 1,
    saves: { str: 0, dex: 1, con: 1, int: 0, wis: 0, cha: 0 },
    attacks: [
      { name: 'Scimitar', toHit: 3, damage: '1d6+1', damageType: 'slashing', range: 5 },
      { name: 'Light Crossbow', toHit: 3, damage: '1d8+1', damageType: 'piercing', range: 80, longRange: 320, ranged: true },
    ],
    description: 'A desperate highway robber who would rather be paid than bleed.',
  },
  orc: {
    id: 'orc',
    xp: 100,
    gold: '2d10',
    name: 'Orc',
    sprite: 'orc',
    ac: 13,
    hp: 15,
    speed: 30,
    dexMod: 1,
    saves: { str: 3, dex: 1, con: 3, int: -2, wis: 0, cha: 0 },
    attacks: [
      { name: 'Greataxe', toHit: 5, damage: '1d12+3', damageType: 'slashing', range: 5 },
      { name: 'Javelin', toHit: 5, damage: '1d6+3', damageType: 'piercing', range: 30, longRange: 120, ranged: true },
    ],
    description: 'A scarred raider who charges the strongest-looking foe.',
  },
  zombie: {
    id: 'zombie',
    xp: 50,
    name: 'Zombie',
    sprite: 'zombie',
    ac: 8,
    hp: 22,
    speed: 20,
    dexMod: -2,
    saves: { str: 1, dex: -2, con: 3, int: -4, wis: 0, cha: -3 },
    attacks: [{ name: 'Slam', toHit: 3, damage: '1d6+1', damageType: 'bludgeoning', range: 5 }],
    immune: ['poison'],
    description: 'A shambling corpse, slow and tireless.',
  },
};
