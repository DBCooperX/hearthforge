// Monster statistics from the System Reference Document 5.2.1 and, for seven creatures that
// are not in it, the System Reference Document 5.1 (both CC BY 4.0). The 5.2.1 stat blocks
// are imported by scripts/srd/import-monsters.mjs into srd/monsters.json; this file adds what
// Hearthforge keeps by hand (looks, loot, a line of description) and the spells monsters cast.

import { baseLook, type CreatureType, type MonsterLook, type Size } from '../../../shared/monsterLook';
import type { LightKindId } from '../../../shared/light';
import type { AbilityKey } from '../../../shared/types';
import srd from './srd/monsters.json';
import { MONSTER_SPELLS } from './monsterSpells';

export interface Dmg {
  dice: string;
  type: string;
  /** Only when the attack roll had advantage. */
  ifAdv?: boolean;
}

/** How a condition a monster inflicts ends. */
export type RiderEnd = 'save_end' | 'target_end' | 'target_start' | 'source_start' | 'source_end' | 'escape' | 'minute' | 'none';

/** What a hit or a failed save does besides damage. */
export interface Rider {
  condition?: string;
  /** A second condition that lasts as long as the first (Restrained while Grappled). */
  also?: string;
  /** The condition that replaces the first when the repeated save fails (Restrained, then Petrified). */
  escalate?: string;
  /** Only creatures of this size or smaller are affected. */
  maxSize?: Size;
  escapeDc?: number;
  /** Feet the target is pushed away. */
  push?: number;
  /** The rider needs the monster to have moved at least this many feet towards the target first. */
  ifMoved?: number;
  /** Extra damage that comes with the rider (a charge). */
  extra?: Dmg;
  /** A saving throw that avoids the rider of an attack. */
  save?: { ability: AbilityKey; dc: number };
  ends?: RiderEnd;
  noHealing?: boolean;
}

export interface MonsterAttack {
  name: string;
  toHit: number;
  damage: string;
  damageType: string;
  /** Reach or range in feet. */
  range: number;
  longRange?: number;
  ranged?: boolean;
  /** Damage of other types that a hit also deals. */
  extra?: Dmg[];
  rider?: Rider;
  /** Advantage against a target it grapples, a wounded target, or in the first round. */
  advIf?: 'grappled' | 'wounded' | 'first_round';
  /** The SRD wording, when the attack does more than damage. For the Dungeon Master. */
  text?: string;
  /** A spell: how many attack rolls one casting makes, and how often a day it can be cast. */
  spell?: boolean;
  count?: number;
  perDay?: number;
  /** Hits without a roll (Magic Missile). */
  auto?: boolean;
}

export interface MonsterArea {
  shape: 'cone' | 'line' | 'sphere' | 'emanation';
  /** Length, radius or reach in feet. */
  size: number;
  width?: number;
  /** How far away a sphere may be centred. */
  range?: number;
}

/** An action resolved by saving throws: a breath weapon, a gaze, a stench, a spell. */
export interface MonsterSpecial {
  name: string;
  /** When it is used: as the action, a bonus action, a legendary action, on a hero who starts a turn near it, or when it dies. */
  slot: 'action' | 'bonus' | 'legendary' | 'aura' | 'death';
  save: AbilityKey;
  dc: number;
  area?: MonsterArea;
  /** Range in feet of an action against one creature. */
  range?: number;
  damage: Dmg[];
  /** Half damage on a successful save. */
  half?: boolean;
  rider?: Rider;
  /** Comes back on a d6 roll of this or higher at the start of its turn. */
  recharge?: number;
  perDay?: number;
  /** Not twice before its next turn (legendary actions). */
  cooldown?: boolean;
  /** Only against a creature it grapples, or one that is prone. */
  needs?: 'grappled' | 'prone';
  text: string;
  spell?: boolean;
}

export type MultiStep = [name: string, count: number];
export interface Multiattack {
  fixed: MultiStep[];
  /** One of these is added to the fixed steps. */
  options?: MultiStep[][];
}

export interface LegendaryOption {
  name: string;
  text: string;
  move?: 'half' | 'full';
  /** The attack or special it uses. */
  use?: string;
  spell?: string;
  cooldown?: boolean;
}

export interface MonsterFlags {
  packTactics?: boolean;
  nimbleEscape?: boolean;
  flyby?: boolean;
  /** Advantage on saving throws against spells. */
  magicResistance?: boolean;
  /** Times a day it turns a failed save into a success. */
  legendaryResistance?: number;
  regeneration?: { amount: number; stop?: string[] };
  undeadFortitude?: boolean;
  /** Advantage on attack rolls while at half its hit points or fewer. */
  bloodiedFury?: boolean;
  /** Reaction: this much armour class against one melee hit a round. */
  parry?: number;
  /** Damage to everyone within this many feet at the end of its turn. */
  aura?: { size: number; dice: string; type: string };
}

export interface MonsterDef {
  id: string;
  name: string;
  /** Name of this creature's sprite in an art pack. Used only when a pack supplies it and the monster is not restyled. */
  sprite: string;
  /** SRD creature type and size. */
  type: CreatureType;
  size: Size;
  /** SRD challenge rating, for the Dungeon Master to judge a fair fight. */
  cr: string;
  /** How the creature is drawn unless the Dungeon Master restyles it. */
  look: MonsterLook;
  ac: number;
  hp: number;
  speed: number;
  fly?: number;
  swim?: number;
  climb?: number;
  burrow?: number;
  dexMod: number;
  /** Passive Perception and Stealth bonus (SRD). Missing on hand-written entries: 10 + Wisdom and Dexterity. */
  perception?: number;
  stealth?: number;
  saves: Partial<Record<AbilityKey, number>>;
  attacks: MonsterAttack[];
  specials?: MonsterSpecial[];
  multi?: Multiattack;
  legendary?: { uses: number; options: LegendaryOption[] };
  /** Traits and actions the engine does not resolve, in the SRD's words, for the Dungeon Master to narrate. */
  traits?: { name: string; slot?: string; text: string }[];
  flags?: MonsterFlags;
  swarm?: boolean;
  vulnerable?: string[];
  resist?: string[];
  immune?: string[];
  conditionImmune?: string[];
  packTactics?: boolean;
  /** Senses in feet (SRD). Missing: none. */
  darkvision?: number;
  blindsight?: number;
  truesight?: number;
  tremorsense?: number;
  /** A light it brings to a fight in the dark, because it cannot see without one. */
  carriesLight?: LightKindId;
  /** Nimble Escape: it can Disengage as a bonus action and still attack. */
  nimbleEscape?: boolean;
  boss?: boolean;
  /** Experience awarded for defeating it. */
  xp: number;
  /** Coins it carries, as a dice expression. */
  gold?: string;
  description: string;
  /** Reserved for the icon pass: an icon id for lists and cards. */
  icon?: string;
  /** Which SRD the statistics follow. */
  source: '5.1' | '5.2.1';
}

type Legacy = Omit<MonsterDef, 'source'>;

const LEGACY: Record<string, Legacy> = {
  goblin: {
    id: 'goblin',
    xp: 50,
    gold: '2d6',
    name: 'Goblin',
    sprite: 'goblin',
    type: 'humanoid',
    size: 'small',
    cr: '1/4',
    look: baseLook('humanoid', 'small', 'green', { eyes: 'yellow', weapon: 'sword' }),
    ac: 15,
    hp: 7,
    darkvision: 60, nimbleEscape: true,
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
    type: 'beast',
    size: 'small',
    cr: '1/8',
    look: baseLook('rodent', 'small', 'brown', { eyes: 'red', tail: true }),
    ac: 12,
    hp: 7,
    darkvision: 60,
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
    type: 'undead',
    size: 'medium',
    cr: '1/4',
    look: baseLook('humanoid', 'medium', 'bone', { mutation: 'skeletal', weapon: 'sword' }),
    ac: 13,
    hp: 13,
    darkvision: 60,
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
    type: 'humanoid',
    size: 'medium',
    cr: '1',
    look: baseLook('humanoid', 'medium', 'brown', { eyes: 'red', weapon: 'club' }),
    ac: 16,
    hp: 27,
    darkvision: 60,
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
    type: 'beast',
    size: 'medium',
    cr: '1/4',
    look: baseLook('beast', 'medium', 'grey', { tail: true }),
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
    type: 'humanoid',
    size: 'medium',
    cr: '1/8',
    look: baseLook('humanoid', 'medium', 'tan', { armor: 'leather', weapon: 'sword' }),
    ac: 12,
    hp: 11,
    carriesLight: 'torch',
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
    type: 'humanoid',
    size: 'medium',
    cr: '1/2',
    look: baseLook('humanoid', 'medium', 'green', { eyes: 'red', weapon: 'axe' }),
    ac: 13,
    hp: 15,
    darkvision: 60,
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
    type: 'undead',
    size: 'medium',
    cr: '1/4',
    look: baseLook('humanoid', 'medium', 'teal', { mutation: 'rotting' }),
    ac: 8,
    hp: 22,
    darkvision: 60,
    speed: 20,
    dexMod: -2,
    saves: { str: 1, dex: -2, con: 3, int: -4, wis: 0, cha: -3 },
    attacks: [{ name: 'Slam', toHit: 3, damage: '1d6+1', damageType: 'bludgeoning', range: 5 }],
    immune: ['poison'],
    description: 'A shambling corpse, slow and tireless.',
  },
  kobold: {
    id: 'kobold',
    xp: 25,
    gold: '1d6',
    name: 'Kobold',
    sprite: 'kobold',
    type: 'humanoid',
    size: 'small',
    cr: '1/8',
    look: baseLook('humanoid', 'small', 'red', { tail: true, horns: true, weapon: 'spear' }),
    ac: 12,
    hp: 5,
    darkvision: 60,
    speed: 30,
    dexMod: 2,
    saves: { str: -2, dex: 2, con: -1, int: -1, wis: -2, cha: -1 },
    attacks: [
      { name: 'Dagger', toHit: 4, damage: '1d4+2', damageType: 'piercing', range: 5 },
      { name: 'Sling', toHit: 4, damage: '1d4+2', damageType: 'bludgeoning', range: 30, longRange: 120, ranged: true },
    ],
    packTactics: true,
    description: "A small scaly reptilian that is brave only in numbers.",
  },
  hobgoblin: {
    id: 'hobgoblin',
    xp: 100,
    gold: '2d8',
    name: 'Hobgoblin',
    sprite: 'hobgoblin',
    type: 'humanoid',
    size: 'medium',
    cr: '1/2',
    look: baseLook('humanoid', 'medium', 'orange', { armor: 'plate', weapon: 'sword' }),
    ac: 18,
    hp: 11,
    darkvision: 60,
    speed: 30,
    dexMod: 1,
    saves: { str: 1, dex: 1, con: 1, int: 0, wis: 0, cha: -1 },
    attacks: [
      { name: 'Longsword', toHit: 3, damage: '1d8+1', damageType: 'slashing', range: 5 },
      { name: 'Longbow', toHit: 3, damage: '1d8+1', damageType: 'piercing', range: 150, longRange: 600, ranged: true },
    ],
    description: "A disciplined goblinoid soldier in heavy armour.",
  },
  gnoll: {
    id: 'gnoll',
    xp: 100,
    gold: '2d6',
    name: 'Gnoll',
    sprite: 'gnoll',
    type: 'humanoid',
    size: 'medium',
    cr: '1/2',
    look: baseLook('humanoid', 'medium', 'tan', { eyes: 'yellow', weapon: 'spear' }),
    ac: 15,
    hp: 22,
    darkvision: 60,
    speed: 30,
    dexMod: 1,
    saves: { str: 2, dex: 1, con: 0, int: -2, wis: 0, cha: -2 },
    attacks: [
      { name: 'Spear', toHit: 4, damage: '1d6+2', damageType: 'piercing', range: 5 },
      { name: 'Longbow', toHit: 3, damage: '1d8+1', damageType: 'piercing', range: 150, longRange: 600, ranged: true },
    ],
    description: "A hyena-headed marauder that laughs as it kills.",
  },
  ghoul: {
    id: 'ghoul',
    xp: 200,
    name: 'Ghoul',
    sprite: 'ghoul',
    type: 'undead',
    size: 'medium',
    cr: '1',
    look: baseLook('humanoid', 'medium', 'grey', { eyes: 'yellow', mutation: 'rotting' }),
    ac: 12,
    hp: 22,
    darkvision: 60,
    speed: 30,
    dexMod: 2,
    saves: { str: 1, dex: 2, con: 0, int: -2, wis: 0, cha: -2 },
    attacks: [
      { name: 'Claws', toHit: 4, damage: '2d4+2', damageType: 'slashing', range: 5 },
    ],
    immune: ['poison'],
    description: "A hunched eater of the dead with a long tongue and filthy claws.",
  },
  specter: {
    id: 'specter',
    xp: 200,
    name: 'Specter',
    sprite: 'specter',
    type: 'undead',
    size: 'medium',
    cr: '1',
    look: baseLook('ghost', 'medium', 'white', { eyes: 'blue', mutation: 'spectral' }),
    ac: 12,
    hp: 22,
    darkvision: 60,
    speed: 50,
    dexMod: 2,
    saves: { str: -5, dex: 2, con: 0, int: 0, wis: 0, cha: 0 },
    attacks: [
      { name: 'Life Drain', toHit: 4, damage: '3d6', damageType: 'necrotic', range: 5 },
    ],
    immune: ['necrotic', 'poison'],
    description: "The hateful remnant of a dead soul, cold and half there.",
  },
  giant_centipede: {
    id: 'giant_centipede',
    xp: 50,
    name: 'Giant Centipede',
    sprite: 'giant_centipede',
    type: 'beast',
    size: 'small',
    cr: '1/4',
    look: baseLook('insect', 'small', 'orange'),
    ac: 13,
    hp: 4,
    blindsight: 30,
    speed: 30,
    dexMod: 2,
    saves: { str: -3, dex: 2, con: 1, int: -5, wis: -2, cha: -4 },
    attacks: [
      { name: 'Bite', toHit: 4, damage: '1d4+2', damageType: 'piercing', range: 5 },
    ],
    description: "An arm-long centipede with a venomous bite.",
  },
  giant_spider: {
    id: 'giant_spider',
    xp: 200,
    name: 'Giant Spider',
    sprite: 'giant_spider',
    type: 'beast',
    size: 'large',
    cr: '1',
    look: baseLook('spider', 'large', 'black', { eyes: 'red' }),
    ac: 14,
    hp: 26,
    darkvision: 60, blindsight: 10,
    speed: 30,
    dexMod: 3,
    saves: { str: 2, dex: 3, con: 1, int: -4, wis: 0, cha: -3 },
    attacks: [
      { name: 'Bite', toHit: 5, damage: '1d8+3', damageType: 'piercing', range: 5 },
    ],
    description: "A spider the size of a horse that lurks in webs and dark corners.",
  },
  dire_wolf: {
    id: 'dire_wolf',
    xp: 200,
    name: 'Dire Wolf',
    sprite: 'dire_wolf',
    type: 'beast',
    size: 'large',
    cr: '1',
    look: baseLook('beast', 'large', 'black', { eyes: 'yellow', tail: true }),
    ac: 14,
    hp: 37,
    speed: 50,
    dexMod: 2,
    saves: { str: 3, dex: 2, con: 2, int: -4, wis: 1, cha: -2 },
    attacks: [
      { name: 'Bite', toHit: 5, damage: '2d6+3', damageType: 'piercing', range: 5 },
    ],
    packTactics: true,
    description: "A wolf as big as a pony, with jaws that can drag a rider down.",
  },
  brown_bear: {
    id: 'brown_bear',
    xp: 200,
    name: 'Brown Bear',
    sprite: 'brown_bear',
    type: 'beast',
    size: 'large',
    cr: '1',
    look: baseLook('bear', 'large', 'brown'),
    ac: 11,
    hp: 34,
    speed: 40,
    dexMod: 0,
    saves: { str: 4, dex: 0, con: 3, int: -4, wis: 1, cha: -2 },
    attacks: [
      { name: 'Claws', toHit: 5, damage: '2d6+4', damageType: 'slashing', range: 5 },
    ],
    description: "A big bear, short-tempered when surprised or hungry.",
  },
  gray_ooze: {
    id: 'gray_ooze',
    xp: 100,
    name: 'Gray Ooze',
    sprite: 'gray_ooze',
    type: 'ooze',
    size: 'medium',
    cr: '1/2',
    look: baseLook('ooze', 'medium', 'grey'),
    ac: 8,
    hp: 22,
    blindsight: 60,
    speed: 10,
    dexMod: -2,
    saves: { str: 1, dex: -2, con: 3, int: -5, wis: -2, cha: -4 },
    attacks: [
      { name: 'Pseudopod', toHit: 3, damage: '3d6+1', damageType: 'acid', range: 5 },
    ],
    description: "Living acid that looks like wet stone until it moves.",
  },
  animated_armor: {
    id: 'animated_armor',
    xp: 200,
    name: 'Animated Armor',
    sprite: 'animated_armor',
    type: 'construct',
    size: 'medium',
    cr: '1',
    look: baseLook('construct', 'medium', 'grey', { armor: 'plate', eyes: 'blue' }),
    ac: 18,
    hp: 33,
    blindsight: 60,
    speed: 25,
    dexMod: 0,
    saves: { str: 2, dex: 0, con: 1, int: -5, wis: -4, cha: -5 },
    attacks: [
      { name: 'Slam', toHit: 4, damage: '1d6+2', damageType: 'bludgeoning', range: 5 },
    ],
    immune: ['poison', 'psychic'],
    description: "An empty suit of armour that walks and strikes by magic.",
  },
  dretch: {
    id: 'dretch',
    xp: 50,
    name: 'Dretch',
    sprite: 'dretch',
    type: 'fiend',
    size: 'small',
    cr: '1/4',
    look: baseLook('humanoid', 'small', 'purple', { eyes: 'red', horns: true }),
    ac: 11,
    hp: 18,
    darkvision: 60,
    speed: 20,
    dexMod: 0,
    saves: { str: 0, dex: 0, con: 1, int: -3, wis: -1, cha: -4 },
    attacks: [
      { name: 'Claws', toHit: 2, damage: '2d4', damageType: 'slashing', range: 5 },
    ],
    description: "A bloated, stinking lesser demon.",
  },
  ogre: {
    id: 'ogre',
    xp: 450,
    gold: '3d10',
    name: 'Ogre',
    sprite: 'ogre',
    type: 'giant',
    size: 'large',
    cr: '2',
    look: baseLook('giant', 'large', 'tan', { weapon: 'club' }),
    ac: 11,
    hp: 59,
    darkvision: 60,
    speed: 40,
    dexMod: -1,
    saves: { str: 4, dex: -1, con: 3, int: -3, wis: -2, cha: -2 },
    attacks: [
      { name: 'Greatclub', toHit: 6, damage: '2d8+4', damageType: 'bludgeoning', range: 5 },
      { name: 'Javelin', toHit: 6, damage: '2d6+4', damageType: 'piercing', range: 30, longRange: 120, ranged: true },
    ],
    description: "A dim, greedy giant twice the height of a man.",
  },
  wyrmling: {
    id: 'wyrmling',
    xp: 450,
    gold: '4d10',
    name: 'White Dragon Wyrmling',
    sprite: 'wyrmling',
    type: 'dragon',
    size: 'medium',
    cr: '2',
    look: baseLook('dragon', 'medium', 'white', { wings: 'bat', tail: true, horns: true, eyes: 'blue' }),
    ac: 16,
    hp: 32,
    darkvision: 60, blindsight: 10,
    speed: 30,
    dexMod: 0,
    saves: { str: 2, dex: 2, con: 4, int: -3, wis: 2, cha: 2 },
    attacks: [
      { name: 'Bite', toHit: 4, damage: '1d10+2', damageType: 'piercing', range: 5 },
    ],
    immune: ['cold'],
    description: "A young dragon, already vicious and territorial.",
  },
  owlbear: {
    id: 'owlbear',
    xp: 700,
    name: 'Owlbear',
    sprite: 'owlbear',
    type: 'monstrosity',
    size: 'large',
    cr: '3',
    look: baseLook('owlbear', 'large', 'brown', { eyes: 'yellow' }),
    ac: 13,
    hp: 59,
    darkvision: 60,
    speed: 40,
    dexMod: 1,
    saves: { str: 5, dex: 1, con: 3, int: -4, wis: 1, cha: -2 },
    attacks: [
      { name: 'Claws', toHit: 7, damage: '2d8+5', damageType: 'slashing', range: 5 },
    ],
    description: "A bear with an owl's head and a foul temper.",
  },
  troll: {
    id: 'troll',
    xp: 1800,
    gold: '4d10',
    name: 'Troll',
    sprite: 'troll',
    type: 'giant',
    size: 'large',
    cr: '5',
    look: baseLook('giant', 'large', 'green', { eyes: 'yellow' }),
    ac: 15,
    hp: 84,
    darkvision: 60,
    speed: 30,
    dexMod: 1,
    saves: { str: 4, dex: 1, con: 5, int: -2, wis: -1, cha: -2 },
    attacks: [
      { name: 'Claws', toHit: 7, damage: '2d6+4', damageType: 'slashing', range: 5 },
    ],
    description: "A lanky, rubbery giant with a bottomless appetite. Deadly for a low-level party.",
  },
  hill_giant: {
    id: 'hill_giant',
    xp: 1800,
    gold: '6d10',
    name: 'Hill Giant',
    sprite: 'hill_giant',
    type: 'giant',
    size: 'huge',
    cr: '5',
    look: baseLook('giant', 'huge', 'tan', { weapon: 'club' }),
    ac: 13,
    hp: 105,
    carriesLight: 'torch',
    speed: 40,
    dexMod: -1,
    saves: { str: 5, dex: -1, con: 4, int: -3, wis: -1, cha: -2 },
    attacks: [
      { name: 'Greatclub', toHit: 8, damage: '3d8+5', damageType: 'bludgeoning', range: 10 },
      { name: 'Rock', toHit: 8, damage: '3d10+5', damageType: 'bludgeoning', range: 60, longRange: 240, ranged: true },
    ],
    description: "A selfish brute as tall as a house. Deadly for a low-level party.",
  },
};

// ------------------------------------------------------------ SRD 5.2.1

interface SrdMonster {
  id: string; name: string; type: string; size: string; swarm?: boolean; cr: string; xp: number; ac: number; hp: number; speed: number;
  fly?: number; swim?: number; climb?: number; burrow?: number; abilities: number[]; saves?: Record<string, number>; pb: number;
  resist?: string[]; immune?: string[]; vulnerable?: string[]; conditionImmune?: string[];
  darkvision?: number; blindsight?: number; truesight?: number; tremorsense?: number; languages?: string; perception?: number; stealth?: number;
  attacks?: MonsterAttack[]; specials?: MonsterSpecial[]; multi?: Multiattack; spells?: { id: string; name: string; perDay?: number }[]; spellDc?: number; spellHit?: number;
  legendary?: { uses: number; options: LegendaryOption[] }; flags?: MonsterFlags; traits?: { name: string; slot?: string; text: string }[]; look: MonsterLook; gold?: string;
}

const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const mod = (score: number) => Math.floor((score - 10) / 2);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The line players read when they point at a creature that has no hand-written one: "Huge dragon". */
export const plainDescription = (size: string, type: string) => `${cap(size)} ${type}`;

function fromSrd(m: SrdMonster, legacy?: Legacy): MonsterDef {
  const saves = Object.fromEntries(ABILITY_KEYS.map((k, i) => [k, m.saves?.[k] ?? mod(m.abilities[i])])) as Record<AbilityKey, number>;
  const attacks = [...(m.attacks ?? [])];
  const specials = [...(m.specials ?? [])];
  // Spells the engine can resolve become attacks and specials of their own; the rest stay text.
  for (const s of m.spells ?? []) {
    const shape = MONSTER_SPELLS[s.id];
    if (!shape) continue;
    if (shape.attack) attacks.push({ ...shape.attack, name: s.name, toHit: m.spellHit ?? m.pb + 3, spell: true, ...(s.perDay ? { perDay: s.perDay } : {}) });
    else if (shape.save) specials.push({ ...shape.save, name: s.name, slot: 'action', dc: m.spellDc ?? 8 + m.pb + 3, spell: true, text: '', ...(s.perDay ? { perDay: s.perDay } : {}) });
  }
  const other = (m.spells ?? []).filter((s) => !MONSTER_SPELLS[s.id]).map((s) => s.name);
  const traits = [...(m.traits ?? [])];
  if (other.length) traits.push({ name: 'Other spells', slot: 'action', text: `Not resolved by the server; narrate them when they fit: ${other.join(', ')}.` });
  if (m.languages) traits.push({ name: 'Languages', text: m.languages });
  const sees = !!(m.darkvision || m.blindsight || m.truesight || m.tremorsense);
  const handy = ['humanoid', 'giant'].includes(m.look.body);
  return {
    id: m.id, name: m.name, sprite: legacy?.sprite ?? m.id, type: m.type as CreatureType, size: m.size as Size, cr: m.cr, xp: m.xp,
    look: legacy?.look ?? m.look, ac: m.ac, hp: m.hp, speed: m.speed,
    ...(m.fly ? { fly: m.fly } : {}), ...(m.swim ? { swim: m.swim } : {}), ...(m.climb ? { climb: m.climb } : {}), ...(m.burrow ? { burrow: m.burrow } : {}),
    dexMod: mod(m.abilities[1]), saves, attacks, specials,
    perception: m.perception ?? 10 + mod(m.abilities[4]), stealth: m.stealth ?? mod(m.abilities[1]),
    ...(m.multi ? { multi: m.multi } : {}), ...(m.legendary ? { legendary: m.legendary } : {}),
    traits, flags: m.flags ?? {}, ...(m.swarm ? { swarm: true } : {}),
    ...(m.vulnerable ? { vulnerable: m.vulnerable } : {}), ...(m.resist ? { resist: m.resist } : {}), ...(m.immune ? { immune: m.immune } : {}), ...(m.conditionImmune ? { conditionImmune: m.conditionImmune } : {}),
    ...(m.flags?.packTactics ? { packTactics: true } : {}), ...(m.flags?.nimbleEscape ? { nimbleEscape: true } : {}),
    ...(m.darkvision ? { darkvision: m.darkvision } : {}), ...(m.blindsight ? { blindsight: m.blindsight } : {}), ...(m.truesight ? { truesight: m.truesight } : {}), ...(m.tremorsense ? { tremorsense: m.tremorsense } : {}),
    ...(legacy?.carriesLight ? { carriesLight: legacy.carriesLight } : !sees && handy ? { carriesLight: 'torch' as LightKindId } : {}),
    ...(legacy?.boss ? { boss: true } : {}),
    ...(legacy?.gold ?? m.gold ? { gold: legacy?.gold ?? m.gold } : {}),
    description: legacy?.description ?? plainDescription(m.size, m.type),
    icon: m.type,
    source: '5.2.1',
  };
}

/**
 * Every creature the game knows, by id. The 5.2.1 stat block wins where a hand-written entry
 * has the same id; the hand-written look, loot and description stay.
 */
export const MONSTERS: Record<string, MonsterDef> = (() => {
  const out: Record<string, MonsterDef> = {};
  for (const [id, l] of Object.entries(LEGACY)) out[id] = { ...l, icon: l.type, source: '5.1' };
  for (const m of srd as unknown as SrdMonster[]) out[m.id] = fromSrd(m, LEGACY[m.id]);
  return out;
})();

/** Challenge rating as a number: "1/4" is 0.25. */
/** Passive Perception, for noticing heroes who sneak up. */
export const passivePerception = (d: MonsterDef) => d.perception ?? 10 + (d.saves.wis ?? 0);
/** Stealth bonus, for creeping up on heroes. */
export const stealthBonus = (d: MonsterDef) => d.stealth ?? d.dexMod;

export function crValue(cr: string): number {
  const [a, b] = cr.split('/').map(Number);
  return b ? a / b : a;
}

