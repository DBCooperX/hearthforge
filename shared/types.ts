// Types shared between the server (authoritative game state) and the browser client.

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type Abilities = Record<AbilityKey, number>;

export const SLOT_IDS = ['head', 'amulet', 'armor', 'cloak', 'mainHand', 'offHand', 'ring', 'boots'] as const;
export type SlotId = (typeof SLOT_IDS)[number];

export const BAG_SIZE = 20;

export type ItemKind = 'weapon' | 'armor' | 'shield' | 'consumable' | 'wondrous' | 'misc';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  icon: string;
  description: string;
  /** Value in gold pieces. */
  value: number;
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
}

export interface ItemInstance {
  uid: string;
  defId: string;
  qty: number;
}

export type ClassId = 'fighter' | 'rogue' | 'wizard' | 'cleric';

export interface Character {
  id: string;
  ownerId: string;
  name: string;
  classId: ClassId;
  className: string;
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
  sprite: string;
}

export type AbilityKind = 'attack' | 'save' | 'auto' | 'heal' | 'self_heal' | 'dodge';

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
  target: 'enemy' | 'ally' | 'self';
}

export interface Chest {
  id: string;
  x: number;
  y: number;
  opened: boolean;
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
}

export type LogKind = 'dm' | 'system' | 'roll' | 'chat';

export interface LogEntry {
  id: number;
  kind: LogKind;
  text: string;
  speaker?: string;
}

export type Phase = 'lobby' | 'explore' | 'combat' | 'victory' | 'defeat';

export interface PlayerInfo {
  id: string;
  name: string;
  connected: boolean;
}

export interface GameState {
  room: string;
  phase: Phase;
  map: { width: number; height: number; rows: string[] };
  /** One char per tile, row-major: '0' unseen, '1' seen before, '2' visible now. */
  fog: string;
  /** Keys "x,y" of doors that are open. */
  openDoors: string[];
  chests: Chest[];
  characters: Character[];
  monsters: MonsterView[];
  combat: CombatState | null;
  gold: number;
  shortRestsLeft: number;
  log: LogEntry[];
  players: PlayerInfo[];
  dmBusy: boolean;
  dmMode: 'claude' | 'scripted';
  dmModel: string | null;
}

export type InvLoc = { type: 'slot'; slot: SlotId } | { type: 'bag'; index: number };

export type ClientMessage =
  | { t: 'join'; room: string; playerId: string; name: string }
  | { t: 'add_character'; classId: ClassId; name: string }
  | { t: 'remove_character'; characterId: string }
  | { t: 'start' }
  | { t: 'move'; characterId: string; x: number; y: number }
  | { t: 'attack'; characterId: string; targetId: string }
  | { t: 'ability'; characterId: string; abilityId: string; targetId?: string }
  | { t: 'use_item'; characterId: string; uid: string; targetId?: string }
  | { t: 'end_turn'; characterId: string }
  | { t: 'open_chest'; characterId: string; chestId: string }
  | { t: 'inv_move'; characterId: string; from: InvLoc; to: InvLoc }
  | { t: 'give'; characterId: string; from: InvLoc; toCharacterId: string }
  | { t: 'short_rest' }
  | { t: 'say'; text: string }
  | { t: 'reset' };

export type ServerMessage =
  | { t: 'state'; state: GameState }
  | { t: 'moved'; id: string; path: { x: number; y: number }[] }
  | { t: 'error'; message: string };

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}
