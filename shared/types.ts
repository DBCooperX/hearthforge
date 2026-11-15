// Types shared between the server (authoritative game state) and the browser client.
import type { HeroLook } from './heroLook';
import type { Biome } from './battlemap';
import type { CreatureType, MonsterLook } from './monsterLook';

import type { Lang } from './i18n';

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type Abilities = Record<AbilityKey, number>;

export const SLOT_IDS = ['head', 'amulet', 'armor', 'cloak', 'mainHand', 'offHand', 'ring', 'boots'] as const;
export type SlotId = (typeof SLOT_IDS)[number];

export const BAG_SIZE = 20;

export type ItemKind = 'weapon' | 'armor' | 'shield' | 'consumable' | 'wondrous' | 'misc';

export const ITEM_CATEGORIES = ['quest', 'clue', 'key', 'document', 'trinket', 'material', 'consumable', 'weapon', 'armor', 'tool'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
export const RARITIES = ['common', 'uncommon', 'rare'] as const;

/** What sets an item the Dungeon Master invented apart from a catalogue item. */
export interface StoryItemInfo {
  category: ItemCategory;
  /** Quest items stay with the party until the story itself uses them up. */
  quest: boolean;
  /** Catalogue item whose rules it uses (a strange dagger still fights as a dagger), or null. */
  baseId: string | null;
  /** When and where the party came by it. */
  foundDay: number;
  foundAt: string | null;
  /** What the party has learned about it since, oldest first. */
  notes: { day: number; text: string }[];
  /** Reserved for phase 3: id of a generated, cached picture of this item. */
  imageId: string | null;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  icon: string;
  description: string;
  /** Value in gold pieces. */
  value: number;
  /** Weight of one, in pounds. Story items weigh what the catalogue item they are based on weighs. */
  weight?: number;
  /** Slot for wondrous items. Weapons, armor and shields have fixed slots. */
  slot?: SlotId;
  weapon?: {
    damage: string;
    damageType: string;
    category: 'simple' | 'martial';
    /** Range in feet (normal / long) for ranged weapons. */
    ranged?: { normal: number; long: number };
    finesse?: boolean;
    twoHanded?: boolean;
    /** Magic bonus to attack and damage rolls. */
    bonus?: number;
  };
  armor?: {
    category: 'light' | 'medium' | 'heavy';
    baseAc: number;
    /** Maximum DEX bonus. null = unlimited, 0 = none. */
    dexCap: number | null;
  };
  /** Flat AC bonus while worn (shields, protective magic items). */
  acBonus?: number;
  consumable?: { heal: string };
  stackable?: boolean;
  rarity?: 'common' | 'uncommon' | 'rare';
  /** Set on items the Dungeon Master created during play. Their name and description are in the table's language. */
  story?: StoryItemInfo;
}

export type SpeciesId = 'human' | 'dwarf' | 'elf' | 'halfling' | 'gnome' | 'orc' | 'dragonborn' | 'tiefling' | 'goliath';
export type BackgroundId = 'acolyte' | 'criminal' | 'sage' | 'soldier';
export const GENDERS: Gender[] = ['female', 'male', 'neutral'];
export type FeatId = 'asi' | 'alert' | 'savage_attacker' | 'skilled' | 'magic_initiate_cleric' | 'magic_initiate_wizard';

/** A feat together with the sub-choices it asks for. */
export interface FeatPick {
  id: FeatId;
  /** Ability Score Improvement: the same ability twice (+2) or two different ones (+1 each). */
  abilities?: AbilityKey[];
  /** Skilled: three skills. */
  skills?: string[];
  /** Magic Initiate: a cantrip and a 1st-level spell. */
  spells?: string[];
}

/** Everything a player decides in the character creator. The server validates it and builds the hero. */
export interface CharacterSpec {
  name: string;
  /** How the Dungeon Master refers to the hero. */
  gender: Gender;
  speciesId: SpeciesId;
  classId: ClassId;
  backgroundId: BackgroundId;
  method: 'array' | 'pointbuy' | 'roll';
  /** Ability scores before the background's increases. */
  base: Abilities;
  /** Background increases: the same ability twice and another once (+2/+1), or three different ones (+1 each). */
  boosts: AbilityKey[];
  /** Skills picked from the class list. */
  skills: string[];
  /** The extra skill some species grant. */
  speciesSkill?: string;
  /** Rogue: two skills with doubled proficiency. */
  expertise?: string[];
  /** Fighter: fighting style id. */
  fightingStyle?: string;
  /** Human: the extra origin feat. */
  originFeat?: FeatPick;
  /** Sub-choices of the background's feat. */
  backgroundFeat?: Pick<FeatPick, 'skills' | 'spells'>;
  /** Cantrips and spells picked from the class list. */
  spells: string[];
  /** Starting equipment package id. */
  kit: string;
  /** How the hero is drawn: skin, hair, beard and colour. Anything left out gets a default. */
  look?: Partial<HeroLook>;
  appearance: string;
  backstory: string;
  /** Set when the hero was taken from the premade roster. */
  premadeId?: string;
}

/** A choice from a level-up that the player still has to make. */
export type PendingChoice =
  | { id: string; kind: 'feat'; level: number }
  | { id: string; kind: 'spell'; level: number; pool: 'cantrip' | 'spell' };

export type ChoicePick = { feat: FeatPick } | { spell: string };

export interface ItemInstance {
  uid: string;
  defId: string;
  qty: number;
}

export type ClassId = 'fighter' | 'rogue' | 'wizard' | 'cleric';

/** A hero's gender. It fixes the pronouns and, in German, the grammatical forms the story uses for them. */
export type Gender = 'female' | 'male' | 'neutral';
export const PRONOUNS: Record<Gender, string> = { female: 'she/her', male: 'he/him', neutral: 'they/them' };

export interface Character {
  id: string;
  ownerId: string;
  name: string;
  classId: ClassId;
  className: string;
  gender: Gender;
  level: number;
  abilities: Abilities;
  profBonus: number;
  maxHp: number;
  hp: number;
  /** Spell points. A 1st-level spell costs 2 (two 1st-level slots = 4 points). 0 max = no bar. */
  maxMana: number;
  mana: number;
  ac: number;
  /** Speed in feet. One tile is 5 feet. */
  speed: number;
  conditions: string[];
  equipment: Record<SlotId, ItemInstance | null>;
  bag: (ItemInstance | null)[];
  x: number;
  y: number;
  deathSaves: { successes: number; failures: number };
  dead: boolean;
  hitDice: number;
  /** Ability ids from ABILITIES this character can use. */
  abilityIds: string[];
  /** Limited-use abilities already spent (reset on rest). */
  spent: string[];
  skills: string[];
  /** Experience points earned so far. */
  xp: number;
  /** Passive features from species, class, feats and levels, as short readable lines. */
  features: string[];
  speciesId: SpeciesId;
  backgroundId: BackgroundId;
  /** Set at level 3. */
  subclass: string | null;
  feats: string[];
  /** Skills with doubled proficiency bonus. */
  expertise: string[];
  /** Damage types this hero takes half damage from. */
  resist: string[];
  /** How the hero is drawn in portraits and on the battle map. */
  look: HeroLook;
  appearance: string;
  backstory: string;
  /** Level-up choices the player has not made yet. */
  pending: PendingChoice[];
  premadeId: string | null;
}

export interface MonsterView {
  id: string;
  defId: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  ac: number;
  alive: boolean;
  conditions: string[];
  /** Art pack sprite name. The drawn token comes from `look`. */
  sprite: string;
  /** Squares along one side of the space it occupies; (x, y) is the top-left one. */
  tiles: number;
  look: MonsterLook;
  /** True when the Dungeon Master changed the look from the catalogue's. */
  restyled: boolean;
  /** SRD creature type. */
  kind: CreatureType;
  /** In the table's language. */
  description: string;
}

export type AbilityKind = 'attack' | 'save' | 'auto' | 'heal' | 'self_heal' | 'dodge' | 'surge' | 'dash' | 'ward';

export interface AbilityDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  kind: AbilityKind;
  /** Mana (spell point) cost. */
  cost: number;
  /** Range in feet. 5 = touch / melee. 0 = self. */
  range: number;
  dice?: string;
  damageType?: string;
  saveAbility?: AbilityKey;
  /** Uses the bonus action instead of the action. */
  bonusAction?: boolean;
  /** Usable once per rest. */
  oncePerRest?: boolean;
  /** Spell level: 0 for a cantrip. Absent for things that are not spells. */
  spellLevel?: number;
  /** A successful save still takes half damage. */
  half?: boolean;
  /** Also catches every enemy next to the target. */
  area?: boolean;
  /** Ability that sets the save DC when it is not a spell (a dragonborn's breath). */
  dcAbility?: AbilityKey;
  target: 'enemy' | 'ally' | 'self';
}

export interface Combatant {
  id: string;
  kind: 'pc' | 'monster';
  initiative: number;
}

export interface CombatState {
  round: number;
  order: Combatant[];
  turnIndex: number;
  /** Tiles of movement left for the active combatant. */
  movementLeft: number;
  actionUsed: boolean;
  bonusUsed: boolean;
  /** Further weapon attacks still allowed by the Attack action taken this turn (Extra Attack). */
  attacksLeft: number;
  /** Savage Attacker has been used this turn. */
  savageUsed?: boolean;
}

export type LogKind = 'dm' | 'system' | 'roll' | 'chat' | 'levelup';

export const MOODS = ['calm', 'warm', 'tense', 'danger', 'mystery', 'wonder', 'somber', 'triumph'] as const;
export type Mood = (typeof MOODS)[number];

/** Presentation data that turns a piece of narration into a scene card. */
export interface SceneMeta {
  title: string;
  mood: Mood;
  /** Suggested next actions, shown as chips under the newest card. */
  actions: string[];
  /** Reserved for phase 3: id of a generated image for this scene. */
  imageId: string | null;
}

/** A d20 roll the server made, with everything needed to show its breakdown. */
export interface RollInfo {
  actor: string;
  label: string;
  /** The d20 result that counted. */
  die: number;
  /** Every d20 rolled (two with advantage or disadvantage). */
  rolls: number[];
  mode: 'normal' | 'advantage' | 'disadvantage';
  modifier: number;
  total: number;
  target: { kind: 'AC' | 'DC'; value: number; name?: string };
  outcome: 'hit' | 'miss' | 'crit' | 'success' | 'failure';
  damage?: { amount: number; type: string };
}

export interface LevelUpInfo {
  characterId: string;
  name: string;
  className: string;
  level: number;
  gains: string[];
}

export interface LogEntry {
  id: number;
  kind: LogKind;
  text: string;
  speaker?: string;
  scene?: SceneMeta;
  roll?: RollInfo;
  levelUp?: LevelUpInfo;
}

export type Phase = 'lobby' | 'explore' | 'combat' | 'defeat';

export interface PlayerInfo {
  /** Public id. The secret that proves who owns the seat never leaves the server. */
  id: string;
  /** Display name, unique at the table. */
  name: string;
  connected: boolean;
}

/** What a table is called and who may sit down at it. */
export interface TableInfo {
  title: string;
  /** Seats, 1 to 4. A seat stays taken while its player is away. */
  maxPlayers: number;
  /** Invite code a new player must enter, or null for an open table. */
  code: string | null;
}

export const MAX_SEATS = 4;

/** A table as the lobby lists it. */
export interface TableSummary {
  id: string;
  title: string;
  language: Lang;
  playing: boolean;
  players: PlayerInfo[];
  maxPlayers: number;
  /** Joining needs an invite code. */
  locked: boolean;
  heroes: number;
  hostId: string | null;
}

/** A line of table talk between players. The Dungeon Master never sees it. */
export interface ChatMessage {
  id: number;
  from: string;
  name: string;
  text: string;
  /** Set on a whisper: the one player it is for. */
  to: string | null;
  toName: string | null;
  /** Milliseconds since the epoch. */
  at: number;
}

/** Where a player is typing right now. */
export type TypingWhere = 'story' | 'chat';

// ------------------------------------------------------------------ world

export const LOCATION_KINDS = ['town', 'village', 'tavern', 'shop', 'temple', 'shrine', 'camp', 'dungeon', 'ruin', 'cave', 'landmark'] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

/**
 * The saved look of a character or place. Phase 3 generates one reference image
 * from the description and reuses it, so later pictures stay consistent.
 */
export interface VisualBible {
  description: string;
  imageId: string | null;
}

export interface Location {
  id: string;
  name: string;
  kind: LocationKind;
  q: number;
  r: number;
  /** Set for places inside another location, such as a tavern in a town. */
  parentId: string | null;
  description: string;
  visited: boolean;
  origin: 'seed' | 'dm';
  visual: VisualBible;
  /** Reserved for phase 2: a generated top-down zone map of this place. */
  zone: null;
  /** Sections of a dungeon: how many exist and how many the party has cleared. */
  dungeon?: { total: number; cleared: number; next: string | null };
}

export const DISPOSITIONS = ['friendly', 'neutral', 'wary', 'hostile'] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export interface Npc {
  id: string;
  name: string;
  role: string;
  description: string;
  disposition: Disposition;
  /** Where the party last saw them. */
  locationId: string | null;
  notes: string[];
  origin: 'seed' | 'dm';
  visual: VisualBible;
}

export type QuestStatus = 'active' | 'completed' | 'failed';

export interface Quest {
  id: string;
  title: string;
  status: QuestStatus;
  summary: string;
  notes: string[];
}

export interface Deed {
  id: string;
  day: number;
  text: string;
}

export interface WorldView {
  width: number;
  height: number;
  /** One terrain code per hex, row-major. '?' is unexplored. See shared/hex.ts. */
  terrain: string;
  party: { q: number; r: number };
  /** Minutes since midnight of day 1. */
  minutes: number;
  /** Locations the party knows about. */
  locations: Location[];
  /** The place the party is in right now, or null in the wilderness. */
  placeId: string | null;
  /** A long rest here cannot be interrupted. */
  safe: boolean;
}

export interface MemoryView {
  /** People the party has met. */
  npcs: Npc[];
  quests: Quest[];
  deeds: Deed[];
}

export interface GameState {
  room: string;
  phase: Phase;
  /** The tactical battle map. Only meaningful while phase is 'combat'. */
  map: { width: number; height: number; rows: string[]; biome: Biome };
  characters: Character[];
  monsters: MonsterView[];
  combat: CombatState | null;
  /** The current fight includes a boss. Drives the music. */
  bossFight: boolean;
  gold: number;
  /** Items the Dungeon Master created for this table, by id. Catalogue items are in shared/content.ts. */
  items: Record<string, ItemDef>;
  shortRestsLeft: number;
  log: LogEntry[];
  players: PlayerInfo[];
  world: WorldView | null;
  memory: MemoryView;
  travelling: boolean;
  dmBusy: boolean;
  dmMode: 'claude' | 'scripted';
  dmModel: string | null;
  /** Language of the game log, world text and narration. */
  language: Lang;
  /** The player who runs the table: starts the adventure, picks the story language, removes players. */
  hostId: string | null;
  table: TableInfo;
  /** Players who said they are ready to begin. */
  ready: string[];
  /** The Dungeon Master is waiting a moment for the other players before answering. */
  gathering: boolean;
  /** Ability scores each player rolled in the character creator, by player id. */
  rolled: Record<string, number[]>;
}

export type InvLoc = { type: 'slot'; slot: SlotId } | { type: 'bag'; index: number };

export type ClientMessage =
  | { t: 'lobby' }
  | { t: 'join'; room: string; playerId: string; token: string; name: string; code?: string }
  | { t: 'create_table'; playerId: string; token: string; name: string; title: string; language: Lang; maxPlayers: number; locked: boolean }
  | { t: 'leave_table' }
  | { t: 'close_table' }
  | { t: 'ready'; ready: boolean }
  | { t: 'kick'; playerId: string }
  | { t: 'make_host'; playerId: string }
  | { t: 'set_code'; locked: boolean }
  | { t: 'chat'; text: string; to?: string }
  | { t: 'typing'; where: TypingWhere | null }
  | { t: 'add_character'; classId: ClassId; name: string }
  | { t: 'create_character'; spec: CharacterSpec }
  | { t: 'add_premade'; premadeId: string; name: string }
  | { t: 'roll_abilities' }
  | { t: 'choose'; characterId: string; choiceId: string; pick: ChoicePick }
  | { t: 'remove_character'; characterId: string }
  | { t: 'start' }
  | { t: 'move'; characterId: string; x: number; y: number }
  | { t: 'attack'; characterId: string; targetId: string }
  | { t: 'ability'; characterId: string; abilityId: string; targetId?: string }
  | { t: 'use_item'; characterId: string; uid: string; targetId?: string }
  | { t: 'end_turn'; characterId: string }
  | { t: 'inv_move'; characterId: string; from: InvLoc; to: InvLoc }
  | { t: 'give'; characterId: string; from: InvLoc; toCharacterId: string }
  | { t: 'short_rest' }
  | { t: 'long_rest' }
  | { t: 'travel'; q: number; r: number }
  | { t: 'go'; locationId: string }
  | { t: 'delve' }
  | { t: 'set_language'; lang: Lang }
  | { t: 'say'; text: string }
  | { t: 'reset' };

export type ServerMessage =
  | { t: 'state'; state: GameState }
  | { t: 'moved'; id: string; path: { x: number; y: number }[] }
  | { t: 'tables'; tables: TableSummary[] }
  | { t: 'chat'; messages: ChatMessage[]; replace?: boolean }
  | { t: 'typing'; playerId: string; where: TypingWhere | null }
  /** The player no longer sits at the table and goes back to the lobby. */
  | { t: 'left'; reason: 'left' | 'kicked' | 'closed' }
  /** `join` marks a refused attempt to sit down, so the lobby can show it next to the form. */
  | { t: 'error'; message: string; join?: boolean };

/**
 * Reasons the server refuses a seat. They are sent in English and translated by the
 * browser, because the player may not share the table's language yet.
 */
export const JOIN_ERRORS = {
  noTable: 'That table does not exist (any more).',
  nameTaken: 'That name is already taken at this table. Pick another one.',
  noName: 'Enter your name first.',
  full: 'This table is full.',
  wrongCode: 'That invite code is not right.',
  noCode: 'No table uses that invite code.',
  seatTaken: 'That seat belongs to another player.',
  titleNeeded: 'Give the table a name.',
} as const;

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Total experience needed to reach each level; index 0 is level 1. */
export const XP_THRESHOLDS = [0, 300, 900, 2700, 6500];
export const MAX_LEVEL = XP_THRESHOLDS.length;
