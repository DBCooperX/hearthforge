// Types shared between the server (authoritative game state) and the browser client.
import type { HeroLook } from './heroLook';
import type { HeroEffect } from './conditions';
import type { Biome } from './battlemap';
import type { CreatureType, MonsterLook } from './monsterLook';

import type { Lang } from './i18n';
import type { StartOptions } from './start';
import type { ShopView } from './trade';
import type { DmStyle } from './style';
import type { LightKindId, LightLevel, LightSource, Senses } from './light';
import type { FactionView, RumourView } from './reputation';
import type { ZoneView } from './zone';
import type { TrophyView } from './achievements';
import type { CreditView } from './credits';

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type Abilities = Record<AbilityKey, number>;

export const SLOT_IDS = ['head', 'amulet', 'armor', 'cloak', 'mainHand', 'offHand', 'ring', 'hands', 'waist', 'boots'] as const;
export type SlotId = (typeof SLOT_IDS)[number];

export const BAG_SIZE = 20;

export type ItemKind = 'weapon' | 'armor' | 'shield' | 'consumable' | 'wondrous' | 'misc';

export const ITEM_CATEGORIES = ['quest', 'clue', 'key', 'document', 'trinket', 'material', 'consumable', 'weapon', 'armor', 'tool'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
/** Rarities the Dungeon Master may give an item it invents. */
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

export type Rarity = 'common' | 'uncommon' | 'rare' | 'very_rare' | 'legendary' | 'artifact';

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
    /** A light weapon: one in each hand lets a hero fight with two weapons. */
    light?: boolean;
    /** Magic bonus to attack and damage rolls. */
    bonus?: number;
    /** More damage on every hit (Flame Tongue). */
    extra?: { dice: string; type: string };
    /** More damage against one creature type (Dragon Slayer). */
    vs?: { type: string; dice: string };
  };
  armor?: {
    category: 'light' | 'medium' | 'heavy';
    baseAc: number;
    /** Maximum DEX bonus. null = unlimited, 0 = none. */
    dexCap: number | null;
  };
  /** Flat AC bonus while worn (shields, protective magic items). */
  acBonus?: number;
  /** A potion: healing, a spell effect of SPELL_BUFFS, temporary hit points. */
  consumable?: { heal?: string; buff?: string; temp?: number };
  stackable?: boolean;
  rarity?: Rarity;
  // ---- magic items of the SRD (shared/magicItems.ts)
  /** The catalogue weapon, armor or shield a magic one is built on: its picture in icon packs. */
  base?: string;
  /** The SRD item it stands for, whose rules the Dungeon Master reads. */
  srd?: string;
  /** Needs attunement: a hero can be attuned to three such items, counted as those worn. */
  attune?: boolean;
  /** Ability scores it raises to at least this while worn. */
  scores?: Partial<Record<AbilityKey, number>>;
  saveBonus?: number;
  resist?: string[];
  speed?: number;
  /** Armor class bonus while wearing no armor and no shield. */
  unarmored?: number;
  darkvision?: number;
  /** A wand or staff: the spell it casts, at which level, and the charges that come back with a long rest. */
  casts?: { spell: string; level: number; charges: number };
  /** Set on items the Dungeon Master created during play. Their name and description are in the table's language. */
  story?: StoryItemInfo;
}

export type SpeciesId = 'human' | 'dwarf' | 'elf' | 'halfling' | 'gnome' | 'orc' | 'dragonborn' | 'tiefling' | 'goliath';
export type BackgroundId = 'acolyte' | 'criminal' | 'sage' | 'soldier';
export const GENDERS: Gender[] = ['female', 'male', 'neutral'];
export type FeatId = 'asi' | 'alert' | 'savage_attacker' | 'skilled' | 'magic_initiate_cleric' | 'magic_initiate_wizard' | 'grappler'
  | 'boon_combat_prowess' | 'boon_irresistible_offense' | 'boon_spell_recall' | 'boon_fate' | 'boon_truesight' | 'boon_night_spirit' | 'boon_dimensional_travel';

/** A feat together with the sub-choices it asks for. */
export interface FeatPick {
  id: FeatId;
  /** Ability Score Improvement: the same ability twice (+2) or two different ones (+1 each). Grappler and the epic boons: one ability (+1). */
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
  /** What the class chooses at level 1 besides a fighting style: a cleric's or druid's order, a warlock's invocation. */
  classOptions?: string[];
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
  | { id: string; kind: 'spell'; level: number; pool: 'cantrip' | 'spell' }
  /** Picks from a group of class options: a fighting style, metamagic, invocations, skills for expertise. */
  | { id: string; kind: 'option'; level: number; group: string; count: number; from?: string[] };

export type ChoicePick = { feat: FeatPick } | { spell: string } | { options: string[] };

export interface ItemInstance {
  uid: string;
  defId: string;
  qty: number;
  /** Charges of a wand or staff used since the last long rest. */
  used?: number;
}

export type ClassId = 'fighter' | 'rogue' | 'wizard' | 'cleric' | 'barbarian' | 'bard' | 'druid' | 'monk' | 'paladin' | 'ranger' | 'sorcerer' | 'warlock';

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
  /** Conditions put on the hero by monsters, with how each one ends. Missing in old saves: none. */
  effects?: HeroEffect[];
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
  /** The painted portrait of this hero (/pictures/<id>), made from the look below. Missing: the drawn bust is used. */
  portraitId?: string | null;
  /** What the portrait was painted from, so a changed look gets a new one. */
  portraitKey?: string;
  /** The painted battle figure (/pictures/<id>), made from the portrait. Only in the state sent to players. */
  figureId?: string | null;
  appearance: string;
  backstory: string;
  /** Level-up choices the player has not made yet. */
  pending: PendingChoice[];
  /** How much of each class resource is spent: rages, focus points, the Lay on Hands pool. Missing in old saves: nothing. */
  uses?: Record<string, number>;
  /** Class options chosen: an order, metamagic, invocations. Fighting styles are feats, expertise is in `expertise`. */
  options?: string[];
  /** Temporary hit points: lost before real ones, never healed, gone after a long rest. */
  tempHp?: number;
  /** The beast a druid has turned into, as an id of BEAST_FORMS. */
  form?: string | null;
  /** A bard's inspiration die waiting to be used: its size. */
  inspired?: number;
  /** Spell effects on this hero: Bless, Haste, Mage Armor... `by` is the caster, `level` the slot level it was cast at. */
  buffs?: { id: string; spell: string; by: string; level: number; n?: number; images?: number; adapted?: string }[];
  /** What worn magic items add to the ability scores right now, so taking them off can undo it. */
  boost?: Partial<Record<AbilityKey, number>>;
  /** The spell this hero concentrates on, if any. */
  conc?: { spell: string; level: number } | null;
  /** An area this hero's spell holds on the battle map, struck again at the start of each of the hero's turns. */
  zone?: { spell: string; level: number; x: number; y: number; radius: number; follow?: boolean } | null;
  /** A spell this hero may use again each turn for free while it lasts (Spiritual Weapon, Call Lightning). */
  sustain?: { spell: string; level: number } | null;
  /** The enemy marked by Hunter's Mark or Hex. */
  mark?: { monsterId: string; spell: string } | null;
  premadeId: string | null;
  /** The light this hero holds up, or null. Lit from a torch or lantern in the backpack. */
  light: LightKindId | null;
  /** What to do when an enemy leaves this hero's reach: ask the player, always strike, or let it go. */
  opportunity: OpportunityMode;
  /** Set on a companion: someone of the story who travels with the party. Heroes never have it. */
  companion?: CompanionInfo;
}

/**
 * What makes a companion: a person of the story who travels with the party for a while. They have the sheet of a
 * hero, built from a simple SRD stat block, but no player: the server plays their turns in a fight, as their stance
 * says. They earn no experience and never level up.
 */
export interface CompanionInfo {
  /** The person in the party's memory, or null for someone nameless ("a hired guard"). */
  npcId: string | null;
  /** What they do for the party, a few words in the table's language: "Guide, no fighter". */
  role: string;
  /** Id of the SRD stat block they are built from (see shared/companions.ts). */
  template: string;
  /** The stat block's name in the table's language, such as "Guard" or "Wache". */
  kind: string;
  stance: CompanionStance;
  /** Armour Class of the stat block. Armour handed to them counts when it is better. */
  baseAc: number;
  /** The day they joined. */
  joinedDay: number;
  /** Their painted portrait (/pictures/<id>), from the person they are. Only in the state sent to players. */
  portraitId?: string | null;
}

/** How a companion fights: in the thick of it, by the heroes' side, or out of harm's way. */
export const COMPANION_STANCES = ['fight', 'guard', 'back'] as const;
export type CompanionStance = (typeof COMPANION_STANCES)[number];
/** At most this many companions travel with the party. */
export const MAX_COMPANIONS = 3;

export const OPPORTUNITY_MODES = ['ask', 'always', 'never'] as const;
export type OpportunityMode = (typeof OPPORTUNITY_MODES)[number];

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
  /** How each condition heroes put on it ends, for the status icons over its token. Missing in old clients: none. */
  effects?: MonsterEffectView[];
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
  /** Darkvision and blindsight, in feet. */
  senses: Senses;
  /** Squares its melee attacks reach; 0 for a creature without one. Leaving them provokes an opportunity attack. */
  reach: number;
  /** SRD challenge rating, such as "1/4" or "17". */
  cr: string;
  /** Names of what it can do beyond plain attacks, in the table's language: breath weapons, auras, regeneration. */
  abilities: string[];
  /** Legendary actions it has left this round, and how many it gets. Missing for ordinary creatures. */
  legendary?: { left: number; uses: number };
  /** The light it carries, or null. */
  light: LightKindId | null;
}

/** `feature` is a class feature with rules of its own; the engine runs it by its id. */
export type AbilityKind = 'attack' | 'save' | 'auto' | 'heal' | 'self_heal' | 'dodge' | 'surge' | 'dash' | 'ward' | 'feature'
  // Spells beyond damage and healing: effects on allies, cures, raising the dead, reactions, smites, a weapon strike, a jump, and those the Dungeon Master narrates.
  | 'buff' | 'cure' | 'revive' | 'react' | 'smite' | 'weapon' | 'step' | 'story';

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
  /** Takes neither action nor bonus action. */
  free?: boolean;
  /** The class resource it spends, as an id of RESOURCES, and how much (1 if left out). */
  resource?: string;
  resourceCost?: number;
  /** Spell level: 0 for a cantrip. Absent for things that are not spells. */
  spellLevel?: number;
  /** A successful save still takes half damage. */
  half?: boolean;
  /** Also catches every enemy next to the target. */
  area?: boolean;
  /** Ability that sets the save DC when it is not a spell (a dragonborn's breath). */
  dcAbility?: AbilityKey;
  target: 'enemy' | 'ally' | 'self';
  // ---- spells of the SRD (shared/spells.ts)
  school?: string;
  /** Only one concentration spell at a time; damage can break it. */
  concentration?: boolean;
  /** Free outside a fight. */
  ritual?: boolean;
  /** Takes a minute or more to cast: not in a fight. */
  slow?: boolean;
  /** Cast by itself when its moment comes. */
  reaction?: 'shield' | 'rebuke' | 'counter';
  /** Dice when cast with a higher slot, by spell level. */
  diceAt?: Record<number, string>;
  /** Every enemy within this many feet of the target is caught too. */
  radius?: number;
  /** Targets, and how many more for each spell level above its own. */
  count?: number;
  countUp?: number;
  /** Attack rolls, and how many more for each spell level above its own. */
  rays?: number;
  raysUp?: number;
  /** The casting modifier is added to the damage. */
  plusMod?: boolean;
  /** The condition a hit or a failed save leaves. */
  inflict?: { condition: string; turns?: number; repeat?: boolean; onHurt?: boolean };
  /** The area stays, around the place it was cast or around the caster, and strikes again at the start of each of the caster's turns. */
  zone?: { radius: number; follow?: boolean };
  /** While it lasts it can be used again each turn without paying. */
  sustain?: 'action' | 'bonus';
  /** The effect it lays on allies, an id of SPELL_BUFFS. */
  buff?: string;
  /** Healing that is not rolled, and how much more per spell level. */
  flat?: number;
  flatUp?: number;
  cures?: string[];
  /** Raises the dead with this many hit points; 0 for all of them. */
  revive?: number;
  /** A jump of this many feet. */
  step?: number;
  /** Creature types it works on. */
  only?: string[];
}

/** One condition on a monster, as players see it: what it is and how it ends. */
export interface MonsterEffectView {
  condition: string;
  /** Its own turns it still lasts. */
  turns?: number;
  /** The save it repeats at the end of each of its turns. */
  save?: { ability: AbilityKey; dc: number };
  /** Ends when this hero's next turn begins. */
  untilHero?: string;
  /** Ends when it takes damage. */
  onHurt?: boolean;
  /** The hero whose spell holds it, and the spell. */
  by?: string;
  spell?: string;
}

export interface Combatant {
  id: string;
  /** 'ally' is a companion: on the party's side, played by the server. */
  kind: 'pc' | 'monster' | 'ally';
  initiative: number;
  /** Caught unawares when the fight began: rolled initiative with Disadvantage. */
  surprised?: boolean;
  /** Struck first from hiding: takes the first turn, its opening attack already made. */
  ambush?: boolean;
}

/** How a fight began when one side caught the other unawares. */
export interface SurpriseInfo {
  /** Who was caught unawares: the enemies (the heroes crept up on them) or the party (an ambush). */
  side: 'enemies' | 'party';
  /** The hero who opened with a strike from hiding. */
  opener?: string;
}

/** How the last fight ended, for the victory or defeat screen that closes the battle map. */
export interface FightOutcome {
  /** Grows with every fight, so the browser shows each ending once. */
  seq: number;
  result: 'victory' | 'rescued' | 'defeat';
  /** Experience for the whole party, and what each living hero got. */
  xp: number;
  xpEach: number;
  gold: number;
  /** What was found, as the log names it: "Potion of Healing (Vex)". */
  loot: string[];
  /** The enemies that fell. */
  slain: string[];
  rounds: number;
  boss: boolean;
  /** Heroes who reached a new level. */
  leveled: string[];
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
  /** A weapon attack was made with the Attack action this turn; the off-hand attack follows from it. */
  attacked?: boolean;
  /** Savage Attacker has been used this turn. */
  savageUsed?: boolean;
  /** Combatants who have spent their reaction since their own last turn began. */
  reacted?: string[];
  /** The acting hero took the Disengage action: leaving reach provokes nothing this turn. */
  disengaged?: boolean;
  /** Once-per-turn features the acting hero has used this turn. */
  once?: string[];
  /** Features the acting hero has readied for the next attack or spell this turn. */
  primed?: string[];
  /** The enemy the acting hero last hit in melee this turn, for a Divine Smite. */
  lastHit?: string | null;
  /** The acting hero has moved this turn. */
  moved?: boolean;
  /** An enemy is leaving a hero's reach, and that hero's player decides whether to strike. */
  reaction?: ReactionPrompt | null;
  /** Set when the fight began with one side caught unawares. */
  surprise?: SurpriseInfo | null;
}

/** The fight waits for one player: take the opportunity attack or let the enemy go. */
export interface ReactionPrompt {
  heroId: string;
  monsterId: string;
  /** Milliseconds since the epoch when the server stops waiting and strikes for them. */
  until: number;
}

/** 'ask' is an out-of-character question to the DM, 'note' the DM's plain answer to it. */
export type LogKind = 'dm' | 'system' | 'roll' | 'chat' | 'levelup' | 'ask' | 'note';

export const MOODS = ['calm', 'warm', 'tense', 'danger', 'mystery', 'wonder', 'somber', 'triumph'] as const;
export type Mood = (typeof MOODS)[number];

/** Presentation data that turns a piece of narration into a scene card. */
export interface SceneMeta {
  title: string;
  mood: Mood;
  /** Suggested next actions, shown as chips under the newest card. */
  actions: string[];
  /** Id of the illustration painted for this scene, or null. Loaded from /pictures/<id>. */
  imageId: string | null;
  /** True while that illustration is being painted. */
  painting?: boolean;
  /** Where the scene plays, such as "Zollhaus, upper floor". Missing in saves from before scene headers. */
  where?: string;
  /** Time of day when it played: dawn, morning, afternoon, evening or night. */
  time?: string;
  /** The people in the scene besides the heroes. */
  present?: string[];
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
  /** Set on the Dungeon Master's words during a fight: a big moment, or a passing comment. See battleNarration.ts. */
  battle?: 'key' | 'note';
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
  /** Where and how the adventure begins: region, premise and world seed. The host chooses before the start. */
  start: StartOptions;
  /** How the Dungeon Master runs the table: tone, rules strictness and content rating. The host may change it at any time. */
  style: DmStyle;
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
  /** When the table was last played, in milliseconds since the epoch. */
  lastPlayed: number;
}

/** One signed-in account that is here right now, as the lobby lists it. */
export interface OnlineEntry {
  id: string;
  name: string;
  /** The table they sit at; null while they look at the list of tables, or when the viewer may not know which table. */
  table: string | null;
  tableTitle: string | null;
  /** At a table, whether or not the viewer may see which one. */
  seated: boolean;
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
  /**
   * The map of this place: its spots, the paths between them and where the party stands. Only
   * places that are not inside another one have it, once the party has been there.
   */
  zone: ZoneView | null;
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
  /** The painted portrait of this person (/pictures/<id>). Missing: the wax seal with their initial is shown. */
  portraitId?: string | null;
  /** What the portrait was painted from, so a changed appearance gets a new one. */
  portraitKey?: string;
}

/** Someone in the current scene. Only people the party has met by name have an id, a role and a disposition. */
export interface ScenePerson {
  name: string;
  npcId?: string;
  role?: string;
  disposition?: Disposition;
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
  /** The region with its article, in the table's language: "the Emberfall Vale". */
  name: string;
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

/** Something the party found out, filed under the question it helps to answer. */
export interface Clue {
  day: number;
  text: string;
  /** Who or what it came from: "Griet Möllner", "the wet coin". */
  source: string;
  /** Where the party learned it. */
  place: string;
}

/** An open question of the story and everything the party knows about it. */
export interface Mystery {
  id: string;
  question: string;
  solved: boolean;
  clues: Clue[];
}

export interface MemoryView {
  /** People the party has met. */
  npcs: Npc[];
  quests: Quest[];
  deeds: Deed[];
  /** The open questions of the story, with the clues the party has found. */
  mysteries: Mystery[];
}

export interface GameState {
  room: string;
  phase: Phase;
  /** The tactical battle map. Only meaningful while phase is 'combat'. */
  map: { width: number; height: number; rows: string[]; biome: Biome };
  /** Light on the battle map: the ambient level and every source, carried ones at their holder. */
  light: { ambient: LightLevel; sources: LightSource[] };
  characters: Character[];
  /** People of the story who travel with the party. They fight on its side, played by the server. */
  companions: Character[];
  monsters: MonsterView[];
  combat: CombatState | null;
  /** The current fight includes a boss. Drives the music. */
  bossFight: boolean;
  gold: number;
  /** Items the Dungeon Master created for this table, by id. Catalogue items are in shared/content.ts. */
  items: Record<string, ItemDef>;
  /** Merchants the party can trade with where it stands right now. */
  shops: ShopView[];
  /** Set when the Dungeon Master shows the players a merchant's wares; a new `seq` opens the trade window. */
  tradeOffer: { shopId: string; seq: number } | null;
  shortRestsLeft: number;
  log: LogEntry[];
  players: PlayerInfo[];
  world: WorldView | null;
  memory: MemoryView;
  /**
   * The scene the party is in right now, as its header shows it: where, and who is there besides
   * the heroes. The side panel's "Who is here" follows it. People the party knows carry their id.
   */
  scene: { where: string; present: ScenePerson[] } | null;
  travelling: boolean;
  /** A trip the Dungeon Master proposed, waiting for the table to confirm it. */
  trip: { locationId: string; name: string; miles: number; hours: number; yes: string[]; needed: number } | null;
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
  /** What the factions of the region think of the party. */
  factions: FactionView[];
  /** Rumours the party has heard, oldest first. */
  rumours: RumourView[];
  /** Every trophy, earned or not. */
  trophies: TrophyView[];
  /** Lines in the story that the Dungeon Master has not answered yet. Their author may still take them back. */
  unanswered: { logId: number; playerId: string }[];
  /** How the last fight ended. Its `seq` grows with every fight. */
  lastFight: FightOutcome | null;
  /** Set while the owner has the table in test mode: the host gets a toolbox, everyone sees the badge. `since` is the time it was switched on. */
  testMode: { since: number } | null;
}

export type InvLoc = { type: 'slot'; slot: SlotId } | { type: 'bag'; index: number };

/**
 * What the host can do at a table in test mode (the Testmodus toolbox). Everything is a plain value the
 * server checks; nothing here is meant for the Dungeon Master's tools.
 */
export type TestAction =
  /** Start a fight with these monsters (catalogue ids), or with a challenge budget when `monsters` is empty. */
  | { op: 'fight'; monsters?: { id: string; count: number }[]; budget?: number; kind?: string; opening?: 'none' | 'surprise' | 'ambush'; heroId?: string }
  /** Raise a hero by `levels` levels (default 1). Pending choices wait on the hero as usual. */
  | { op: 'level'; characterId: string; levels?: number }
  /** Share experience points among the heroes, as after a fight. */
  | { op: 'xp'; amount: number }
  | { op: 'hp'; characterId: string; hp: number }
  | { op: 'revive'; characterId: string }
  | { op: 'condition'; characterId: string; condition: string; on: boolean }
  /** Mana, class resources and spent abilities back to full. Hit points stay as they are. */
  | { op: 'restore'; characterId?: string }
  | { op: 'item'; characterId: string; itemId: string; qty?: number }
  | { op: 'gold'; amount: number }
  /** Jump to a known place, and to a spot on its zone map. */
  | { op: 'jump'; locationId: string; spot?: string }
  /** Put every place of the region on the map. */
  | { op: 'reveal' }
  | { op: 'time'; minutes?: number; hour?: number }
  | { op: 'rest'; kind: 'short' | 'long' }
  /** Tell the Dungeon Master what happens next. The hint never appears in the story. */
  | { op: 'scene'; text: string }
  /** Ask for the monster catalogue; the answer is a `test_catalog` message. */
  | { op: 'catalog' };

/** One creature of the catalogue, as the test toolbox lists it. */
export interface TestMonster { id: string; name: string; cr: string; kind: string }

export type ClientMessage =
  | { t: 'lobby'; session?: string }
  | { t: 'test'; do: TestAction }
  | { t: 'join'; room: string; session: string; code?: string }
  | { t: 'create_table'; session: string; title: string; language: Lang; maxPlayers: number; locked?: boolean }
  | { t: 'leave_table' }
  /** From the list of tables, host only: delete a table. `confirm` must be the table's name, typed out. */
  | { t: 'delete_table'; session: string; room: string; confirm: string }
  /** From the list of tables, host only: give a table another name. */
  | { t: 'rename_table'; session: string; room: string; title: string }
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
  | { t: 'ability'; characterId: string; abilityId: string; targetId?: string; level?: number }
  | { t: 'use_item'; characterId: string; uid: string; targetId?: string }
  | { t: 'end_turn'; characterId: string }
  | { t: 'disengage'; characterId: string }
  | { t: 'escape'; characterId: string }
  | { t: 'light'; characterId: string; on: boolean }
  | { t: 'reaction'; characterId: string; take: boolean }
  | { t: 'trip'; go: boolean }
  | { t: 'set_opportunity'; characterId: string; mode: OpportunityMode }
  /** `qty` moves only part of a stack. */
  | { t: 'inv_move'; characterId: string; from: InvLoc; to: InvLoc; qty?: number }
  /** `qty` hands over only part of a stack. */
  | { t: 'give'; characterId: string; from: InvLoc; toCharacterId: string; qty?: number }
  | { t: 'offhand'; characterId: string; targetId: string }
  | { t: 'buy'; characterId: string; shopId: string; defId: string; qty: number }
  | { t: 'sell'; characterId: string; shopId: string; from: InvLoc; qty: number }
  | { t: 'haggle'; characterId: string; shopId: string }
  | { t: 'short_rest' }
  | { t: 'long_rest' }
  | { t: 'travel'; q: number; r: number }
  | { t: 'go'; locationId: string }
  | { t: 'delve' }
  | { t: 'set_language'; lang: Lang }
  | { t: 'set_start'; start: Partial<StartOptions> }
  | { t: 'set_style'; style: Partial<DmStyle> }
  | { t: 'say'; text: string; /** An out-of-character question to the Dungeon Master. */ ooc?: boolean }
  | { t: 'unsay' }
  | { t: 'reset' };

export type ServerMessage =
  /** Sent first on every connection. `build` names the client build this server serves; empty if it serves none. */
  | { t: 'hello'; build: string }
  | { t: 'state'; state: GameState }
  | { t: 'moved'; id: string; path: { x: number; y: number }[] }
  /** `online` is who is here now: players only learn the table of those who sit at one of their own, the Innkeeper sees every table. */
  | { t: 'tables'; tables: TableSummary[]; online?: OnlineEntry[] }
  | { t: 'chat'; messages: ChatMessage[]; replace?: boolean }
  | { t: 'typing'; playerId: string; where: TypingWhere | null }
  /** The player no longer sits at the table and goes back to the lobby. */
  | { t: 'left'; reason: 'left' | 'kicked' | 'closed' | 'removed' | 'restored' }
  /** A message from the owner of the server to everyone, such as an announced restart. */
  | { t: 'notice'; text: string }
  /** The owner changed something in the Innkeeper that every browser loads from the server. Tiles can only be swapped by loading the page again. */
  | { t: 'assets'; icons?: boolean; tiles?: boolean; music?: boolean; sfx?: boolean; voice?: boolean }
  /** `join` marks a refused attempt to sit down, so the lobby can show it next to the form. */
  | { t: 'error'; message: string; join?: boolean }
  /** The monsters the test toolbox can start a fight with. */
  | { t: 'test_catalog'; monsters: TestMonster[] }
  /** How much AI credit this account has left. Sent on sign-in and after each cost while credits can run out. */
  | { t: 'credits'; credit: CreditView };

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
  soloClosed: 'This is a solo table. Only its owner can play here.',
  titleNeeded: 'Give the table a name.',
  signIn: 'You are signed out. Sign in again.',
  notHost: 'Only the host of a table can do that.',
  wrongName: 'The name you typed is not the name of the table.',
} as const;

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Total experience needed to reach each level; index 0 is level 1. */
export const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
export const MAX_LEVEL = XP_THRESHOLDS.length;
