// Authoritative game engine. All rules, dice and state changes live here.
// The engine is synchronous and deterministic for a given RNG; the AI Dungeon
// Master only chooses monster intents and narrates what the engine resolved.

import { parseActionTag } from '../../../shared/skillTag';
import { targetHabit, type TargetHabit } from '../../../shared/style';
import { ABILITIES, ABILITY_NAMES, ITEMS, SKILLS } from '../../../shared/content';
import { applyFeat, armorClass, buildSheet, castingAbility, checkSpec, classSpellList, isLightWeapon, isMonkWeapon, isProficient, maxManaOf, spellOptions, weaponAttack } from '../../../shared/build';
import {
  BEAST_FORMS, CLASS_FEATURES, CLASS_IDS, GROUPS, OPTIONS, RESOURCES, SUBCLASS_LEVEL, cantripScale, chosenIn, classAbilities, critFrom, extraAttacks, featureRank,
  SLOT_COST, grantedChoices, hasFeature, inspirationDie, martialDie, maxSpellLevelFor, optionLine, optionsFor, rageDamage, resourceLeft, resourceMax, saveProfs, sneakDice, speedBonus, type BeastForm,
} from '../../../shared/classes';
import { cleanTraits } from '../../../shared/traits';
import { REF_ID } from '../../../shared/accounts';
import { DEFAULT_PREMADE, PREMADE_BY_ID } from '../../../shared/premades';
import { BEST_TYPES, SPELL_BUFFS, castLevel, diceAtLevel, type SpellBuff } from '../../../shared/spells';
import { heroLook } from '../../../shared/heroLook';
import { ABILITY_KEYS, BACKGROUNDS, EFFECT_LINES, FEATS, SPECIES, STYLES, classFeatureLines, loc, type L } from '../../../shared/rules';
import { pickIcon } from '../../../shared/items';
import {
  COMPASS, HEX_MILES, TERRAIN, direction, encounterChance, findRoute, formatHours, formatTime, hexDistance, hoursFor, sameHex, timeOfDay,
  type Compass, type Hex,
} from '../../../shared/hex';
import {
  BAG_SIZE,
  GENDERS,
  ITEM_CATEGORIES,
  JOIN_ERRORS,
  MAX_SEATS,
  MAX_COMPANIONS,
  MAX_LEVEL,
  SLOT_IDS,
  XP_THRESHOLDS,
  abilityMod,
  type AbilityDef,
  type PendingCheck,
  type AbilityKey,
  type Character,
  type ChatMessage,
  type CharacterSpec,
  type ChoicePick,
  type FeatPick,
  type ClassId,
  type CombatState,
  type Combatant,
  type Disposition,
  type GameState,
  type FightOutcome,
  type SurpriseInfo,
  type InvLoc,
  type ItemCategory,
  type ItemDef,
  type Rarity,
  type ItemInstance,
  OPPORTUNITY_MODES,
  type LevelUpInfo,
  type OpportunityMode,
  type Location,
  type LocationKind,
  type LogEntry,
  type LogKind,
  type Mood,
  type Phase,
  type PlayerInfo,
  type QuestStatus,
  type RollInfo,
  type SceneMeta,
  type ScenePerson,
  type SlotId,
  type TableInfo,
} from '../../../shared/types';
import { CLASSES, defaultGender, profBonusFor } from '../data/classes';
import { MONSTERS, passivePerception, stealthBonus, type LegendaryOption, type MonsterAttack, type MonsterDef, type MonsterSpecial, type Rider } from '../data/monsters';
import { resolveMonster, suggestMonsters } from '../data/monsterSearch';
import { inArea } from './areas';
import { affordablePrefix, bestSpot, reachableSpots, type Board, type Foe, type Spot, type SpotQuery, type Stance } from './tactics';
import { EXPOSED, HAMPERED, HELD, HELPLESS, HERO_CONDITIONS, INCAPACITATING, type EffectEnd, type HeroEffect } from '../../../shared/conditions';
import { ENCOUNTERS, MAJOR_KINDS, SAFE_KINDS, type GroupSpec } from '../data/world';
import { isLang, tagged, tr, type Lang } from '../../../shared/i18n';
import { d20, roll, rollDie, rollMode, signed, type Rng, type RollMode } from './dice';
import { addFlat, damageSpread, failChance, hitChance, percent, type CombatOdds, type DamageSpread, type Odds } from '../../../shared/odds';

type OddsWhy = NonNullable<RollInfo['why']>;
import { COVER_BONUS, buildBattleMap, cheb, chooseBiome, hasCover, tileBlocksSight, tileCost, tileWalkable, type Biome } from '../../../shared/battlemap';
import { POWER, SIZES, SIZE_TILES, applyLookTokens, lookKey, distToFootprint, inFootprint, nearestFootprintTile, type MonsterLook, type Power } from '../../../shared/monsterLook';
import { campaignShelf, viewer } from '../campaign/registry';
import { storyLedger } from '../story/ledger';
import { generateWorld, isExplored, knownTerrain, maskedTerrain, reveal, trueTerrain, type LocationState, type MemoryState, type NpcState, type SettingState, type WorldState } from './world';
import { RESTOCK_DAYS, MAX_SHOPS, SHELVES, rollStock, shopKindOf } from '../data/shops';
import { HAGGLE_DC, SHOP_NAMES, buyPrice, clampMood, haggleMood, sellPrice, type Mood as HaggleMood, type ShopKind, type ShopStock, type ShopView } from '../../../shared/trade';
import { seedStream } from '../../../shared/start';
import { emptyStats, type Stats } from '../../../shared/achievements';
import { logEvent } from './timeline';
import { companionFigureSubject, heroFigureSubject, monsterFigureSubject, npcFigureSubject, npcPortraitKey, placeAsk, type PictureAsk, type PictureHooks } from './pictures';
import { PICTURE_MOMENTS } from '../../../shared/illustrations';
import { COMPANION_TEMPLATES, COMPANION_TEMPLATE_IDS, companionTemplate, parseStance } from '../../../shared/companions';
import { currentZone, enterPlace, enterSpot, followHeader, zoneRoot } from './zone';
import { addRumour, attitude, changeStanding, checkTrophies, factionViews, guildFactor, hearRumour, makeFactions, rumourViews, shiftStanding, trophyViews, type FactionState } from './reputation';
import { DEFAULT_STYLE, cleanStyle, type DmStyle } from '../../../shared/style';
import { LIGHT_ITEMS, NO_SENSES, SPECIES_DARKVISION, ambientLight, canSee, isLightLevel, lightGrid, placeFixedLights, type LightKindId, type LightLevel, type LightSource, type Senses } from '../../../shared/light';
import { CLASSIC_START, CUSTOM_MAX, REGIONS, isPremise, newSeed, normalizeSeed, type RegionChoice, type StartOptions } from '../../../shared/start';

export class GameError extends Error {}
/** A refused seat. The message is one of JOIN_ERRORS, in English; the browser translates it. */
export class JoinError extends GameError {}

const cleanName = (raw: unknown) => String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
const sameName = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
const MAX_CHAT = 200;

export interface Monster {
  id: string;
  defId: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  conditions: string[];
  /** Squares along one side of the space it occupies; (x, y) is the top-left one. Missing in old saves: 1. */
  tiles?: number;
  /** How it is drawn. Missing in old saves: the catalogue look. */
  look?: MonsterLook;
  /** What the hover card says, in the table's language. */
  description?: string;
  /** Share of the catalogue entry's experience it is worth, for scaled monsters. */
  xpScale?: number;
  /** The light it carries. Missing in old saves: none. */
  light?: LightKindId | null;
  /** Specials waiting to recharge. */
  spent?: string[];
  /** Uses of limited actions spent in this fight, by name. */
  used?: Record<string, number>;
  /** Legendary actions left until its next turn, and those it may not repeat before then. */
  legLeft?: number;
  legCooldown?: string[];
  /** Legendary Resistances left. Missing: the stat block's number. */
  legRes?: number;
  /** It took damage that stops its regeneration on its next turn. */
  noRegen?: boolean;
  /** Feet moved on its current turn, for charges. */
  movedFt?: number;
  /** Heroes who shook off one of its auras for good, as "<aura>:<hero id>". */
  shrugged?: string[];
  /** Conditions heroes have put on it. */
  effects?: MonsterEffect[];
  /** Heroes whose next attack against it has advantage (Studied Attacks, a resisted Stunning Strike). */
  studiedBy?: string[];
}

/** One condition on a monster and how it ends. */
export interface MonsterEffect {
  condition: string;
  /** Its own turns it still lasts. */
  turns?: number;
  /** The save it repeats at the end of each of its turns. */
  save?: { ability: AbilityKey; dc: number };
  /** Ends when this hero's next turn begins. */
  untilHero?: string;
  /** Ends when it takes damage. */
  onHurt?: boolean;
  /** The hero whose spell caused it, and the spell: it ends with their concentration. */
  by?: string;
  spell?: string;
}

/** Conditions the engine puts on monsters. "rattled" is the sting of Vicious Mockery; "turned" is Turn Undead. */
const MONSTER_CONDITIONS = ['stunned', 'incapacitated', 'turned', 'prone', 'frightened', 'poisoned', 'rattled', 'paralyzed',
  // What spells do to monsters.
  'restrained', 'blinded', 'asleep', 'charmed', 'banished', 'slowed', 'outlined', 'baned', 'confused', 'cursed', 'weakened'];
/** It loses its turns. */
const MONSTER_SKIPS = ['stunned', 'incapacitated', 'turned', 'paralyzed', 'asleep', 'charmed', 'banished'];
/** Attack rolls against it have advantage. */
const MONSTER_EXPOSED = ['stunned', 'incapacitated', 'turned', 'paralyzed', 'asleep', 'restrained', 'blinded', 'outlined'];
/** Its own attack rolls have disadvantage. */
const MONSTER_HAMPERED = ['frightened', 'poisoned', 'rattled', 'restrained', 'blinded', 'cursed', 'weakened'];

/** The fight in progress: where it came from and what winning it is worth. */
export interface EncounterState {
  source: 'wild' | 'dungeon' | 'story';
  locationId: string | null;
  boss: boolean;
}

/** A merchant's shop as the server keeps it. */
export interface ShopState {
  id: string;
  name: string;
  kind: ShopKind;
  /** The place it stands in. Null for a peddler met on the road. */
  locationId: string | null;
  /** Where a peddler without a place was met. */
  at: Hex | null;
  /** The merchant, once the story has named one. */
  npcId: string | null;
  /** Price level: 1 is the listed value. */
  markup: number;
  /** `keep` marks wares the Dungeon Master put there, which survive a restock until sold. */
  stock: (ShopStock & { keep?: boolean })[];
  /** Gold the merchant has left to buy with. */
  gold: number;
  /** The restock cycle the shelves were last filled in; -1 before the first. */
  cycle: number;
  mood: HaggleMood;
  /** The day the mood was set. It lasts until the day is over. */
  moodDay: number;
  /** The day the party last haggled here. */
  haggledDay: number;
  origin: 'seed' | 'dm';
}

export interface InternalState {
  room: string;
  phase: Phase;
  /** Battle map rows; empty outside combat. */
  rows: string[];
  /** What kind of place the battle map shows. Missing in saves from before biomes. */
  biome?: Biome;
  /** Light that fills the battle map, and the lights that belong to the place. Missing in saves from before light: bright, none. */
  ambient?: LightLevel;
  lights?: LightSource[];
  characters: Character[];
  /** People of the story travelling with the party. Missing in saves from before companions. */
  companions: Character[];
  monsters: Monster[];
  combat: CombatState | null;
  encounter: EncounterState | null;
  gold: number;
  /** Items the DM created during play, by id. */
  items: Record<string, ItemDef>;
  /** Every merchant this table has met, by id. Missing in saves from before trading. */
  shops: Record<string, ShopState>;
  /** The shop the Dungeon Master last showed the players, and a counter that opens their trade window. */
  tradeOffer: { shopId: string; seq: number } | null;
  shortRestsLeft: number;
  log: LogEntry[];
  logSeq: number;
  uidSeq: number;
  players: PlayerInfo[];
  world: WorldState | null;
  memory: MemoryState;
  /** Destination of a journey in progress. */
  travel: { to: Hex; hexes: number; minutes: number; terrain: string[] } | null;
  /** A trip to another place the Dungeon Master proposed. Nothing moves until the table confirms it. */
  trip?: { locationId: string; yes: string[] } | null;
  /** The DM flagged the last scene as a turning point, so the next reply gets the strongest model. */
  escalate: boolean;
  /**
   * Where the current scene plays and who is in it, as the Dungeon Master last set it. It holds only
   * while the party stays where it was set; anywhere else the scene header falls back to the place.
   */
  stage?: { at: string; where: string; present: string[] };
  /** World clock (minutes) when the party last finished a long rest. */
  lastLongRest: number;
  /** Language of the game log, world text and narration. The host picks it. */
  language: Lang;
  /** Ability scores rolled in the character creator, by player id. */
  rolled: Record<string, number[]>;
  /** The creator's choices behind each hero (by hero id), so a hero can be kept as a template. Missing for heroes from before. */
  origins?: Record<string, CharacterSpec>;
  /** Where and how the story is set. Missing before the adventure starts and in saves from before start options. */
  setting?: SettingState;
  /** Missing in saves from before the lobby. */
  table: TableInfo;
  hostId: string | null;
  /** Hash of each player's secret token, by player id. Whoever presents the token owns the seat. */
  seats: Record<string, string>;
  ready: string[];
  /** What the factions of the region think of the party. Missing in saves from before reputation. */
  factions: FactionState[];
  /** Trophies earned, with the day. */
  achievements: { id: string; day: number }[];
  /** Counters for the trophies. */
  stats: Stats;
  /** Table talk between the players, whispers included. Never part of the public state. */
  chat: ChatMessage[];
  chatSeq: number;
  /**
   * Successful Stealth checks by hero id, with the total and the world clock. A fight opens
   * with the enemies caught unawares only on one of these. Missing in older saves.
   */
  sneaks?: Record<string, { total: number; at: number }>;
  /**
   * Set while the owner has the table in test mode. `snapshot` is the table as it was when the mode began (the
   * JSON of this state without chat and without this field), so the campaign can go back to it.
   */
  testMode?: { since: number; snapshot: string };
  /** How the last fight ended, for the closing screen. Missing in older saves. */
  lastFight?: FightOutcome | null;
}

/** How long a successful Stealth check lets the party open a fight by surprise, in world minutes. */
export const SNEAK_MINUTES = 60;

/** What the start of a fight by surprise did, for the Dungeon Master to narrate. */
export interface Opening {
  side: SurpriseInfo['side'];
  /** Who was caught unawares and rolled initiative with Disadvantage. */
  caught: string[];
  /** Who noticed in time. */
  noticed: string[];
  /** The ambushers' Stealth total that the defenders' Passive Perception was measured against. */
  stealth: number;
  strike?: { hero: string; target: string; hit: boolean; damage: number; sneakAttack: boolean; targetDown: boolean } | null;
  /** Why a declared opening strike did not happen. */
  noStrike?: string;
}

export type Beat =
  | { kind: 'start' }
  | { kind: 'arrive'; location: string; firstVisit: boolean; major: boolean; journey?: string }
  | { kind: 'travel_end'; journey: string; reason: 'arrived' | 'blocked' }
  | { kind: 'discover'; locations: string[]; journey: string }
  | { kind: 'combat_start'; monsters: string[]; boss: boolean; context: string }
  | { kind: 'combat_end'; boss: boolean; rewards: string }
  | { kind: 'level_up'; heroes: string[] }
  | { kind: 'rest'; long: boolean }
  | { kind: 'rescued' }
  | { kind: 'defeat' }
  | { kind: 'spell'; hero: string; spell: string; spellId: string; level: number; target?: string };

export interface MonsterIntent {
  targetId?: string;
  attack?: string;
  tactic?: 'engage' | 'hold_position' | 'retreat' | 'disengage';
}

export interface MonsterActResult {
  monster: string;
  moved: number;
  attack?: {
    name: string;
    target: string;
    hit: boolean;
    crit: boolean;
    damage: number;
    targetHp: number;
    targetDown: boolean;
    /** A condition the hit put on the target. */
    condition?: string;
  };
  /** Every attack of a multiattack, in order. Missing when it made at most one. */
  attacks?: NonNullable<MonsterActResult['attack']>[];
  /** Breath weapons, gazes and other saving-throw actions it used, with what happened to each hero. */
  specials?: string[];
  /** Heroes who made an opportunity attack as it left their reach. */
  struckBy?: string[];
  /** It took the Disengage action. */
  disengaged?: boolean;
  /** Movement stopped because a hero's player is deciding on an opportunity attack. Call resumeMonster. */
  waiting?: boolean;
  note?: string;
}

/** A monster's turn, planned in full, that may stop halfway along its path for a hero's reaction. */
interface MonsterPlan {
  monsterId: string;
  targetId: string;
  attack: string;
  tactic: NonNullable<MonsterIntent['tactic']>;
  path: Pt[];
  /** Steps of the path already walked. */
  done: number;
  disengage: boolean;
  /** Its movement never provokes (Flyby). */
  noProvoke?: boolean;
  /** Disengage took its action, so it makes no attack. */
  noAttack: boolean;
  /** Heroes already asked, or who already struck, during this move. */
  asked: string[];
  struckBy: string[];
}

type Pt = { x: number; y: number };
const key = (x: number, y: number) => `${x},${y}`;
const DIRS: Pt[] = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];
const MAX_LOG = 400;
/** How far the Dungeon Master may move the party by story alone; longer journeys go over the map. */
const STORY_TRAVEL_HEXES = 4;
const emptyMemory = (): MemoryState => ({ npcs: [], quests: [], deeds: [], journal: [], chronicle: '', rumours: [], mysteries: [], timeline: [], secrets: [] });
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32);

export class Game {
  s: InternalState;
  rng: Rng;
  beats: Beat[] = [];
  moves: { id: string; path: Pt[] }[] = [];
  /** Set by the room when the server can paint story illustrations. */
  pictures: PictureHooks | null = null;
  /** A picture the Dungeon Master asked for in the reply being written, for its scene. */
  pictureAsk: PictureAsk | null = null;
  /** The place the party has just come to for the first time, until its picture is asked for or the party moves on (not saved). */
  newPlace: { id: string; name: string } | null = null;

  constructor(room: string, rng: Rng = Math.random, saved?: InternalState) {
    this.rng = rng;
    // Saves from before the open world have no map or memory; those tables start over.
    const usable = saved && saved.memory && typeof saved.lastLongRest === 'number' && (saved.phase === 'lobby' || saved.world);
    this.s = usable ? saved : Game.freshState(room, saved?.players ?? [], isLang(saved?.language) ? saved.language : 'en');
    this.s.rolled ??= {};
    // Tables saved before the lobby: open to anyone, run by whoever sat down first.
    this.s.table ??= { title: room, maxPlayers: MAX_SEATS, code: null, start: { ...CLASSIC_START }, style: { ...DEFAULT_STYLE } };
    // Tables saved before start options keep the classic region.
    this.s.table.start ??= { ...CLASSIC_START };
    // Tables saved before DM style settings play with the default style.
    this.s.table.style = cleanStyle(this.s.table.style);
    this.s.hostId ??= this.s.players[0]?.id ?? null;
    this.s.seats ??= {};
    this.s.ready ??= [];
    this.s.chat ??= [];
    this.s.chatSeq ??= 0;
    this.s.items ??= {}; // saves from before story items
    this.s.shops ??= {}; // saves from before trading
    this.s.tradeOffer ??= null;
    this.s.trip ??= null;
    // Saves from before reputation, rumours and trophies.
    this.s.memory.rumours ??= [];
    this.s.memory.mysteries ??= []; // saves from before clue tracking
    this.s.memory.timeline ??= []; // saves from before the timeline
    this.s.memory.secrets ??= [];
    this.s.achievements ??= [];
    this.s.stats = { ...emptyStats(), ...this.s.stats };
    this.s.factions ??= this.s.world ? makeFactions(this.s.setting?.seed ?? 'HEARTH', this.lang, !this.s.setting || this.s.setting.region === 'classic') : [];
    // Heroes saved before the character creator existed get the fields it added.
    for (const c of this.s.characters) {
      c.speciesId ??= 'human';
      c.backgroundId ??= 'soldier';
      c.gender ??= defaultGender(c.name); // premade names get theirs, anything else stays neutral
      c.subclass ??= c.level >= 3 ? CLASSES[c.classId].subclass.name : null;
      c.feats ??= [];
      c.expertise ??= [];
      c.resist ??= [];
      c.look = heroLook(c);
      c.appearance ??= '';
      c.backstory ??= '';
      c.pending ??= [];
      c.premadeId ??= null;
      c.light ??= null; // saves from before light
      if (!OPPORTUNITY_MODES.includes(c.opportunity)) c.opportunity = 'ask';
      // Saves from before the twelve classes: resources, options and the new class tables.
      this.refresh(c);
      this.reconcile(c);
    }
    this.s.companions ??= []; // saves from before companions
    // A restart drops an unanswered reaction prompt; the monsters' turn runs again from its start.
    if (this.s.combat?.reaction) this.s.combat.reaction = null;
  }

  static freshState(room: string, players: PlayerInfo[] = [], language: Lang = 'en'): InternalState {
    return {
      room,
      phase: 'lobby',
      rows: [],
      characters: [],
      companions: [],
      monsters: [],
      combat: null,
      encounter: null,
      gold: 0,
      items: {},
      shops: {},
      tradeOffer: null,
      trip: null,
      shortRestsLeft: 2,
      log: [],
      logSeq: 0,
      uidSeq: 0,
      players,
      world: null,
      memory: emptyMemory(),
      travel: null,
      escalate: false,
      lastLongRest: -100000,
      language,
      rolled: {},
      table: { title: room, maxPlayers: MAX_SEATS, code: null, start: { ...CLASSIC_START }, style: { ...DEFAULT_STYLE } },
      hostId: players[0]?.id ?? null,
      seats: {},
      ready: [],
      factions: [],
      achievements: [],
      stats: emptyStats(),
      chat: [],
      chatSeq: 0,
    };
  }

  // ---------------------------------------------------------------- language

  get lang(): Lang { return isLang(this.s.language) ? this.s.language : 'en'; }
  /** Translate a whole sentence into the session language: this.t`${who} rests.` */
  private get t() { return tagged(this.lang); }
  /** Translate a game term such as an item, spell, monster or skill name. */
  n = (term: string) => tr(this.lang, term);
  /** A feature line in the session language. Species traits carry their own German text. */
  feature = (line: string) => {
    const e = EFFECT_LINES[line];
    return e && this.lang === 'de' ? `${this.n(e.name)}: ${e.de}` : this.n(line);
  };
  private fail(text: L): never { throw new GameError(loc(text, this.lang)); }

  /** The host (whoever opened the table) picks the language everyone's story is told in. */
  setLanguage(playerId: string, lang: unknown) {
    if (!isLang(lang)) throw new GameError(this.t`Unknown language`);
    if (this.s.hostId !== playerId) throw new GameError(this.t`Only the host can change the language`);
    this.s.language = lang;
  }

  /** The host chooses where and how the adventure begins. An empty seed asks for a fresh one. */
  setStart(playerId: string, raw: unknown) {
    this.requireHost(playerId);
    if (this.s.phase !== 'lobby') throw new GameError(this.t`The adventure has already begun`);
    const patch = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof StartOptions, unknown>>;
    const start = this.s.table.start;
    if (patch.region !== undefined) {
      if (!REGIONS.includes(patch.region as RegionChoice)) throw new GameError(this.t`Unknown region`);
      start.region = patch.region as RegionChoice;
    }
    if (patch.premise !== undefined) {
      if (!isPremise(patch.premise)) throw new GameError(this.t`Unknown premise`);
      start.premise = patch.premise;
    }
    if (patch.custom !== undefined) start.custom = String(patch.custom ?? '').replace(/\s+/g, ' ').trim().slice(0, CUSTOM_MAX);
    if (patch.seed !== undefined) start.seed = normalizeSeed(patch.seed) || newSeed();
    if (patch.campaign !== undefined) {
      const id = patch.campaign && typeof patch.campaign === 'object' ? String((patch.campaign as { id?: unknown }).id ?? '') : String(patch.campaign ?? '');
      if (!id) start.campaign = null;
      else {
        const shelf = campaignShelf();
        const info = shelf?.info(id);
        if (!shelf || !info || !shelf.mayUse(id, viewer(playerId)) || !shelf.book(id)?.digest) throw new GameError(this.t`That campaign book is not on this server`);
        start.campaign = { id, title: info.title };
      }
    }
  }

  /** The host sets how the Dungeon Master runs the table. Allowed at any time, also during play: the next turn follows it. */
  setStyle(playerId: string, raw: unknown) {
    this.requireHost(playerId);
    const patch = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof DmStyle, unknown>>;
    const cur = this.s.table.style;
    const next = cleanStyle({ ...cur, ...patch }, cur);
    // A value that is present but unknown is an error, not a silent fallback.
    if (patch.tone !== undefined && next.tone !== patch.tone) throw new GameError(this.t`Unknown tone`);
    if (patch.rating !== undefined && next.rating !== patch.rating) throw new GameError(this.t`Unknown content rating`);
    if (patch.flavour !== undefined && next.flavour !== patch.flavour) throw new GameError(this.t`Unknown character flavour`);
    this.s.table.style = next;
  }

  private d20Text(r: { value: number; rolls: number[] }, mode: RollMode) {
    return mode === 'normal' ? `${r.value}` : `${r.value} (${this.n(mode)}: ${r.rolls.join(', ')})`;
  }

  // ---------------------------------------------------------------- helpers

  get width() { return this.s.rows[0]?.length ?? 0; }
  get height() { return this.s.rows.length; }

  log(kind: LogKind, text: string, extra: Partial<Pick<LogEntry, 'speaker' | 'scene' | 'roll' | 'levelUp' | 'battle'>> = {}) {
    this.s.log.push({ id: ++this.s.logSeq, kind, text, ...extra });
    if (this.s.log.length > MAX_LOG) this.s.log.splice(0, this.s.log.length - MAX_LOG);
  }

  private uid(prefix: string) { return `${prefix}${++this.s.uidSeq}`; }

  tile(x: number, y: number): string {
    if (y < 0 || y >= this.height || x < 0 || x >= this.width) return '#';
    return this.s.rows[y][x];
  }

  private blocksSight(x: number, y: number) { return tileBlocksSight(this.tile(x, y)); }

  /** Can anything ever stand here? */
  private walkable(x: number, y: number) { return tileWalkable(this.tile(x, y)); }

  /** The part of a path that a movement budget pays for. Difficult terrain costs double. */
  private afford(path: Pt[], budget: number): { walked: Pt[]; cost: number } {
    const walked: Pt[] = [];
    let cost = 0;
    for (const p of path) {
      const c = tileCost(this.tile(p.x, p.y));
      if (cost + c > budget) break;
      cost += c;
      walked.push(p);
    }
    return { walked, cost };
  }

  private pathCost(path: Pt[]) { return path.reduce((n, p) => n + tileCost(this.tile(p.x, p.y)), 0); }

  /** Half cover for the target of a shot: +2 AC behind a tree, boulder or furniture. */
  /** Squares along one side of a monster's space. */
  tilesOf(m: Monster) { return m.tiles ?? 1; }
  /** Distance in squares between a monster's space and a point. */
  private mdist(m: Monster, p: Pt) { return distToFootprint(m, this.tilesOf(m), p); }
  /** The square of a monster's space nearest to a point: where sight and shots are measured from. */
  private mpoint(m: Monster, p: Pt): Pt { return nearestFootprintTile(m, this.tilesOf(m), p); }

  private coverBonus(from: Pt, to: Pt) { return cheb(from, to) > 1 && hasCover(this.s.rows, from, to) ? COVER_BONUS : 0; }

  char(id: string): Character {
    const c = this.s.characters.find((c) => c.id === id) ?? this.s.companions.find((c) => c.id === id);
    if (!c) throw new GameError(this.t`Unknown character`);
    return c;
  }

  monster(id: string): Monster {
    const m = this.s.monsters.find((m) => m.id === id);
    if (!m) throw new GameError(this.t`Unknown monster`);
    return m;
  }

  private monsterAt(x: number, y: number) {
    return this.s.monsters.find((m) => m.alive && inFootprint(m, this.tilesOf(m), x, y));
  }

  /** A conscious hero standing here. The fallen do not block movement. */
  private charAt(x: number, y: number, except?: string) {
    return this.party().find((c) => !c.dead && c.hp > 0 && c.x === x && c.y === y && c.id !== except);
  }

  conscious(c: Character) { return !c.dead && c.hp > 0; }
  /** Everyone on the party's side who can still fight: the heroes and their companions. Monsters pick targets from these. */
  consciousChars() { return this.party().filter((c) => this.conscious(c)); }
  /** The heroes still on their feet. A fight is lost when none are left, whoever else still stands. */
  consciousHeroes() { return this.s.characters.filter((c) => this.conscious(c)); }
  /** The heroes and their companions. */
  party(): Character[] { return [...this.s.characters, ...this.s.companions]; }

  /** Line of sight between two tiles (Bresenham). End tiles do not block. */
  los(a: Pt, b: Pt): boolean {
    let x = a.x, y = a.y;
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
    const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
    let err = dx - dy;
    while (x !== b.x || y !== b.y) {
      if ((x !== a.x || y !== a.y) && this.blocksSight(x, y)) return false;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return true;
  }

  /**
   * Cheapest path by movement cost (difficult terrain costs double). `canEnter`
   * decides which tiles may be walked through; `isGoal` decides where to stop.
   * Returns the path excluding the start tile.
   */
  private bfs(start: Pt, isGoal: (p: Pt) => boolean, canEnter: (p: Pt) => boolean, maxNodes = 4000): Pt[] | null {
    if (isGoal(start)) return [];
    const startKey = key(start.x, start.y);
    const best = new Map<string, { cost: number; prev: string | null }>([[startKey, { cost: 0, prev: null }]]);
    // Steps cost 1 or 2, so one bucket per total cost is a complete priority queue.
    const buckets: Pt[][] = [[start]];
    let found: Pt | null = null;
    for (let cost = 0; cost < buckets.length && !found && best.size < maxNodes; cost++) {
      for (const cur of buckets[cost] ?? []) {
        if (best.get(key(cur.x, cur.y))!.cost !== cost) continue;
        if (isGoal(cur)) { found = cur; break; }
        for (const d of DIRS) {
          const n = { x: cur.x + d.x, y: cur.y + d.y };
          if (!this.walkable(n.x, n.y) || !canEnter(n)) continue;
          // No cutting corners around obstacles.
          if (d.x !== 0 && d.y !== 0 && (!this.walkable(cur.x + d.x, cur.y) || !this.walkable(cur.x, cur.y + d.y))) continue;
          const c = cost + tileCost(this.tile(n.x, n.y));
          const k = key(n.x, n.y);
          const seen = best.get(k);
          if (seen && seen.cost <= c) continue;
          best.set(k, { cost: c, prev: key(cur.x, cur.y) });
          (buckets[c] ??= []).push(n);
        }
      }
    }
    if (!found) return null;
    const path: Pt[] = [];
    let k: string | null = key(found.x, found.y);
    while (k && k !== startKey) {
      const [x, y] = k.split(',').map(Number);
      path.unshift({ x, y });
      k = best.get(k)?.prev ?? null;
    }
    return path;
  }

  // ------------------------------------------------------------ lobby/setup

  upsertPlayer(id: string, name: string, connected: boolean) {
    const p = this.s.players.find((p) => p.id === id);
    if (p) { p.name = name || p.name; p.connected = connected; }
    else this.s.players.push({ id, name: name || 'Adventurer', connected });
    this.s.hostId ??= id;
  }

  player(id: string) { return this.s.players.find((p) => p.id === id); }

  /**
   * Sit a player down, or let them back onto the seat they already have. `key` is the hash of
   * their secret token: the seat belongs to whoever first presented it.
   */
  seat(id: string, key: string, rawName: string, code?: string) {
    const s = this.s;
    const name = cleanName(rawName);
    const clash = (n: string) => s.players.some((p) => p.id !== id && sameName(p.name, n));
    const mine = this.player(id);
    if (mine) {
      if (s.seats[id] && s.seats[id] !== key) throw new JoinError(JOIN_ERRORS.seatTaken);
      s.seats[id] = key;
      // Coming back never fails over a name: a taken or empty one just keeps the old name.
      if (name && !clash(name)) mine.name = name;
      mine.connected = true;
      return mine;
    }
    if (!name) throw new JoinError(JOIN_ERRORS.noName);
    // A solo table belongs to the one who opened it: nobody else sits down there, code or not.
    if (s.table.maxPlayers <= 1 && (s.hostId || s.players.length)) throw new JoinError(JOIN_ERRORS.soloClosed);
    if (s.table.code && String(code ?? '').trim().toUpperCase() !== s.table.code) throw new JoinError(JOIN_ERRORS.wrongCode);
    if (s.players.length >= s.table.maxPlayers) throw new JoinError(JOIN_ERRORS.full);
    if (clash(name)) throw new JoinError(JOIN_ERRORS.nameTaken);
    const p: PlayerInfo = { id, name, connected: true };
    s.players.push(p);
    s.seats[id] = key;
    if (!s.hostId || !this.player(s.hostId)) s.hostId = id;
    return p;
  }

  /** Take a player's seat away. Before the adventure their heroes go with them; later the host looks after them. */
  unseat(id: string) {
    const s = this.s;
    const p = this.player(id);
    if (!p) return;
    s.players = s.players.filter((x) => x.id !== id);
    delete s.seats[id];
    delete s.rolled[id];
    s.ready = s.ready.filter((x) => x !== id);
    if (s.hostId === id) s.hostId = (s.players.find((x) => x.connected) ?? s.players[0])?.id ?? null;
    const heroes = s.characters.filter((c) => c.ownerId === id);
    if (s.phase === 'lobby') {
      s.characters = s.characters.filter((c) => c.ownerId !== id);
      return;
    }
    this.log('system', this.t`${p.name} has left the table.`);
    const host = s.hostId ? this.player(s.hostId) : undefined;
    if (host && heroes.length) {
      for (const c of heroes) c.ownerId = host.id;
      this.log('system', this.t`${host.name} now plays ${heroes.map((c) => c.name).join(', ')}.`);
    }
  }

  requireHost(playerId: string) {
    if (this.s.hostId !== playerId) throw new GameError(this.t`Only the host can do that`);
  }

  kick(playerId: string, targetId: string) {
    this.requireHost(playerId);
    if (targetId === playerId || !this.player(targetId)) throw new GameError(this.t`No such player at this table`);
    this.unseat(targetId);
  }

  makeHost(playerId: string, targetId: string) {
    this.requireHost(playerId);
    const target = this.player(targetId);
    if (!target) throw new GameError(this.t`No such player at this table`);
    this.s.hostId = target.id;
    if (this.s.phase !== 'lobby') this.log('system', this.t`${target.name} is now the host of this table.`);
  }

  /** The host has gone: the player who has sat here longest and is still connected takes over. */
  handOverHost(): boolean {
    const s = this.s;
    const host = s.hostId ? this.player(s.hostId) : undefined;
    if (host?.connected) return false;
    const next = s.players.find((p) => p.connected);
    if (!next) return false;
    s.hostId = next.id;
    if (s.phase !== 'lobby') this.log('system', this.t`${next.name} is now the host of this table.`);
    return true;
  }

  /** Give the table an invite code, or open it to anyone who can reach the server. */
  setCode(playerId: string, code: string | null) {
    this.requireHost(playerId);
    this.s.table.code = code;
  }

  setReady(playerId: string, ready: boolean) {
    const s = this.s;
    if (s.phase !== 'lobby') throw new GameError(this.t`The adventure has already begun`);
    if (ready && !s.characters.some((c) => c.ownerId === playerId)) throw new GameError(this.t`Choose a hero before you say you are ready`);
    s.ready = s.ready.filter((x) => x !== playerId);
    if (ready) s.ready.push(playerId);
  }

  /** A player may act for their own heroes, and for those of a player who is away, so a dropped connection never stalls a fight. */
  mayControl(playerId: string, c: Character): boolean {
    return c.ownerId === playerId || !this.player(c.ownerId)?.connected;
  }

  /** Table talk. `toId` makes it a whisper only that player and the sender get to see. */
  addChat(fromId: string, raw: string, toId?: string): ChatMessage {
    const from = this.player(fromId);
    const text = String(raw ?? '').trim().slice(0, 500);
    if (!from || !text) throw new GameError(this.t`Nothing to say`);
    const to = toId ? this.player(toId) : undefined;
    if (toId && (!to || to.id === fromId)) throw new GameError(this.t`No such player at this table`);
    const msg: ChatMessage = { id: ++this.s.chatSeq, from: from.id, name: from.name, text, to: to?.id ?? null, toName: to?.name ?? null, at: Date.now() };
    this.s.chat.push(msg);
    if (this.s.chat.length > MAX_CHAT) this.s.chat.splice(0, this.s.chat.length - MAX_CHAT);
    return msg;
  }

  /** The table talk one player is allowed to read. */
  chatFor(playerId: string): ChatMessage[] {
    return this.s.chat.filter((m) => !m.to || m.to === playerId || m.from === playerId);
  }

  /**
   * Hand a seat to another player id: a seat from before accounts becomes the seat of an account.
   * When that account already sits here, the old seat's heroes join it and the old seat goes.
   * Returns false when there is no such seat.
   */
  reassignPlayer(from: string, to: string, name?: string): boolean {
    const s = this.s;
    const old = this.player(from);
    if (!old || from === to) return false;
    const already = this.player(to);
    if (already) s.players = s.players.filter((p) => p.id !== from);
    else { old.id = to; if (name) old.name = cleanName(name) || old.name; }
    // The old secret goes with the old id: the new owner proves the seat their own way when they sit down.
    delete s.seats[from];
    if (s.hostId === from) s.hostId = to;
    s.ready = [...new Set(s.ready.map((x) => (x === from ? to : x)))];
    if (s.rolled[from]) { s.rolled[to] ??= s.rolled[from]; delete s.rolled[from]; }
    for (const c of s.characters) if (c.ownerId === from) c.ownerId = to;
    for (const m of s.chat) {
      if (m.from === from) m.from = to;
      if (m.to === from) m.to = to;
    }
    return true;
  }

  /** An account got a new name: its seat follows, unless someone at the table already goes by it. */
  renamePlayer(id: string, name: string): boolean {
    const p = this.player(id);
    const next = cleanName(name);
    if (!p || !next || p.name === next) return false;
    if (this.s.players.some((o) => o.id !== id && o.name.toLocaleLowerCase() === next.toLocaleLowerCase())) return false;
    p.name = next;
    return true;
  }

  setConnected(id: string, connected: boolean) {
    const p = this.s.players.find((p) => p.id === id);
    if (p) p.connected = connected;
  }

  /** An item's definition: from the catalogue, or one the DM created for this table. */
  def(defId: string): ItemDef {
    return ITEMS[defId] ?? this.s.items[defId];
  }

  private newItem(defId: string, qty = 1): ItemInstance {
    if (!this.def(defId)) throw new Error(`Unknown item ${defId}`);
    return { uid: this.uid('i'), defId, qty };
  }

  /** One click in the old lobby: the default premade hero of that class. */
  addCharacter(playerId: string, classId: ClassId, name: string): Character {
    if (!CLASSES[classId]) throw new GameError(this.t`Unknown class`);
    const pre = PREMADE_BY_ID[DEFAULT_PREMADE[classId]];
    const own = String(name ?? '').trim();
    // A name of the player's own says nothing about gender, looks or history, so those stay open.
    if (own && own !== pre.spec.name) return this.createCharacter(playerId, { ...pre.spec, name: own, gender: 'neutral', look: undefined, appearance: '', backstory: '', premadeId: undefined });
    return this.addPremade(playerId, pre.id, '');
  }

  addPremade(playerId: string, premadeId: string, name: string): Character {
    const pre = PREMADE_BY_ID[premadeId];
    if (!pre) throw new GameError(this.t`Unknown hero`);
    return this.createCharacter(playerId, { ...pre.spec, name: String(name ?? '').trim() || pre.spec.name, appearance: loc(pre.appearance, this.lang), backstory: loc(pre.bio, this.lang) });
  }

  /** Roll 4d6 and drop the lowest, six times. The creator only accepts these scores for the "roll" method. */
  rollAbilities(playerId: string): number[] {
    if (this.s.phase !== 'lobby') throw new GameError(this.t`The adventure has already begun`);
    const scores = Array.from({ length: 6 }, () => {
      const dice = roll('4d6', this.rng).rolls.sort((a, b) => b - a);
      return dice[0] + dice[1] + dice[2];
    });
    this.s.rolled[playerId] = scores;
    return scores;
  }

  /** Build a hero from the choices made in the character creator, after checking every one of them. */
  createCharacter(playerId: string, spec: CharacterSpec, templateId?: string): Character {
    if (this.s.phase !== 'lobby') throw new GameError(this.t`The adventure has already begun`);
    if (this.s.characters.length >= 4) throw new GameError(this.t`The party is full (4 heroes)`);
    if (!spec || typeof spec !== 'object') throw new GameError(this.t`Unknown hero`);
    const problems = checkSpec(spec, this.s.rolled[playerId]);
    if (problems.length) this.fail(problems[0].text);
    const sheet = buildSheet(spec)!;
    const cls = CLASSES[spec.classId], sp = SPECIES[spec.speciesId];
    const taken = new Set(this.s.characters.map((c) => c.name));
    const clean = String(spec.name ?? '').trim().slice(0, 20) || sp.names.find((n) => !taken.has(n)) || cls.name;
    const equipment = Object.fromEntries(SLOT_IDS.map((s) => [s, null])) as Record<SlotId, ItemInstance | null>;
    for (const [slot, id] of Object.entries(sheet.equipment)) equipment[slot as SlotId] = this.newItem(id);
    const bag: (ItemInstance | null)[] = Array(BAG_SIZE).fill(null);
    sheet.bag.slice(0, BAG_SIZE).forEach((b, i) => { bag[i] = this.newItem(b.id, b.qty); });
    const c: Character = {
      id: this.uid('pc'),
      ownerId: playerId,
      name: clean,
      classId: spec.classId,
      className: cls.name,
      level: 1,
      abilities: sheet.abilities,
      profBonus: 2,
      maxHp: sheet.maxHp,
      hp: sheet.maxHp,
      maxMana: sheet.maxMana,
      mana: sheet.maxMana,
      ac: sheet.ac,
      speed: sheet.speed,
      conditions: [],
      equipment,
      bag,
      x: 0,
      y: 0,
      deathSaves: { successes: 0, failures: 0 },
      dead: false,
      hitDice: 1,
      abilityIds: sheet.abilityIds,
      spent: [],
      skills: sheet.skills,
      xp: 0,
      features: sheet.features,
      speciesId: spec.speciesId,
      backgroundId: spec.backgroundId,
      gender: GENDERS.includes(spec.gender) ? spec.gender : 'neutral',
      subclass: null,
      feats: sheet.feats,
      expertise: sheet.expertise,
      resist: sheet.resist,
      look: heroLook({ speciesId: spec.speciesId, gender: GENDERS.includes(spec.gender) ? spec.gender : 'neutral', classId: spec.classId, name: clean, look: spec.look }),
      appearance: String(spec.appearance ?? '').trim().slice(0, 400),
      backstory: String(spec.backstory ?? '').trim().slice(0, 1200),
      ...(cleanTraits(spec.traits) ? { traits: cleanTraits(spec.traits)! } : {}),
      ...(typeof spec.refId === 'string' && REF_ID.test(spec.refId) ? { refId: spec.refId } : {}),
      pending: [],
      premadeId: spec.premadeId && PREMADE_BY_ID[spec.premadeId] ? spec.premadeId : null,
      templateId: templateId ?? null,
      light: null,
      opportunity: 'ask',
      uses: {},
      options: sheet.options ?? [],
      tempHp: 0,
      form: null,
      mark: null,
    };
    this.refresh(c);
    c.hp = c.maxHp;
    c.mana = c.maxMana;
    this.s.characters.push(c);
    (this.s.origins ??= {})[c.id] = { ...spec, name: clean, premadeId: undefined };
    this.s.ready = this.s.ready.filter((x) => x !== playerId);
    return c;
  }

  /**
   * A saved hero joins the party as a fresh level 1 copy, built and checked like any new hero. Rolled
   * scores were checked when the template was saved, so they count again here without a new roll.
   */
  addTemplate(playerId: string, templateId: string, spec: CharacterSpec | null): Character {
    if (!spec) throw new GameError(this.t`Unknown hero`);
    if (this.s.characters.some((c) => c.ownerId === playerId && c.templateId === templateId)) throw new GameError(this.t`That hero is already in the party`);
    const before = this.s.rolled[playerId];
    if (spec.method === 'roll' && spec.base) this.s.rolled[playerId] = ABILITY_KEYS.map((k) => spec.base[k]);
    try {
      return this.createCharacter(playerId, { ...spec, premadeId: undefined }, templateId);
    } finally {
      if (before) this.s.rolled[playerId] = before; else delete this.s.rolled[playerId];
    }
  }

  /** The creator's choices behind a hero of this player, as they are now named and drawn: what a template keeps. */
  recipe(playerId: string, characterId: string): CharacterSpec | null {
    const c = this.char(characterId);
    if (c.ownerId !== playerId) throw new GameError(this.t`That hero belongs to another player`);
    const origin = this.s.origins?.[characterId];
    if (!origin) return null;
    return { ...origin, name: c.name, gender: c.gender, look: c.look, appearance: c.appearance, backstory: c.backstory, ...(c.traits ? { traits: c.traits } : {}), ...(c.refId ? { refId: c.refId } : {}) };
  }

  removeCharacter(playerId: string, characterId: string) {
    if (this.s.phase !== 'lobby') throw new GameError(this.t`The adventure has already begun`);
    const c = this.char(characterId);
    if (c.ownerId !== playerId) throw new GameError(this.t`That hero belongs to another player`);
    this.s.characters = this.s.characters.filter((x) => x.id !== characterId);
    if (this.s.origins) delete this.s.origins[characterId];
    this.s.ready = this.s.ready.filter((x) => x !== playerId);
  }

  /** `playerId` is who asked. Only the host may; without it (tests, scripts) nobody is checked. */
  start(playerId?: string) {
    if (playerId !== undefined) this.requireHost(playerId);
    if (this.s.phase !== 'lobby') throw new GameError(this.t`The adventure has already begun`);
    if (!this.s.characters.length) throw new GameError(this.t`Add at least one hero first`);
    const s = this.s;
    // The room gives every table a seed to show and share; a bare engine (tests, scripts) builds one fixed world.
    // A campaign book that has since left the shelf: the table falls back to its own region.
    const pick = s.table.start.campaign;
    const digest = pick ? campaignShelf()?.book(pick.id)?.digest : null;
    const { world, memory, setting } = generateWorld({ ...s.table.start, seed: s.table.start.seed || 'HEARTH' }, this.lang, pick && digest ? { id: pick.id, digest } : undefined);
    s.world = world;
    s.memory = memory;
    s.setting = setting;
    if (!setting.campaign) { const avoid = storyLedger()?.note(s.room); if (avoid) setting.avoid = avoid; }
    // A campaign book brings its own powers and people; the rolled guild, temple and watch would be inventions of ours.
    s.factions = setting.campaign ? [] : makeFactions(setting.seed, this.lang, setting.region === 'classic');
    s.achievements = [];
    s.stats = emptyStats();
    s.gold = s.characters.reduce((sum, c) => sum + 5 + (BACKGROUNDS[c.backgroundId]?.gold ?? 10), 0);
    // House rule: small parties get the Hearth's Blessing so solo play is survivable.
    const blessing = (4 - s.characters.length) * 4;
    if (blessing > 0) {
      for (const c of s.characters) { c.maxHp += blessing; c.hp = c.maxHp; }
      this.log('system', this.t`The Hearth's Blessing warms the party: +${blessing} maximum HP for each hero.`);
    }
    s.phase = 'explore';
    s.combat = null;
    s.encounter = null;
    s.rows = [];
    s.monsters = [];
    this.log('system', this.t`The adventure begins.`);
    this.log('system', this.t`World seed: ${setting.seed}`);
    const here = this.place();
    if (here) this.settleIn(here);
    this.beats.push({ kind: 'start' });
  }

  reset(playerId?: string) {
    if (playerId !== undefined) this.requireHost(playerId);
    const { players, table, hostId, seats, chat, chatSeq } = this.s;
    // The next adventure gets a world of its own. The old seed is in nobody's way: the host can type it back in.
    this.s = { ...Game.freshState(this.s.room, players, this.lang), table: { ...table, start: { ...table.start, seed: newSeed() } }, hostId, seats, chat, chatSeq };
    this.beats = [];
    this.moves = [];
  }

  // ------------------------------------------------------------------ world

  get world(): WorldState {
    if (!this.s.world) throw new GameError(this.t`The adventure has not started`);
    return this.s.world;
  }

  day() { return Math.floor((this.s.world?.minutes ?? 0) / 1440) + 1; }

  location(id: string): LocationState | undefined { return this.s.world?.locations.find((l) => l.id === id); }

  /** The place the party is in, or null in the wilderness. */
  place(): LocationState | null {
    const w = this.s.world;
    return (w?.placeId && w.locations.find((l) => l.id === w.placeId)) || null;
  }

  /** Known places in the party's hex, the enclosing one first. */
  placesHere(): LocationState[] {
    const w = this.world;
    return w.locations.filter((l) => l.discovered && sameHex(l, w.party)).sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId));
  }

  presentNpcs(): NpcState[] {
    const id = this.s.world?.placeId;
    return id ? this.s.memory.npcs.filter((n) => n.locationId === id) : [];
  }

  isSafe() { const p = this.place(); return !!p && SAFE_KINDS.includes(p.kind); }

  private needExplore() {
    if (this.s.phase === 'lobby') throw new GameError(this.t`The adventure has not started`);
    if (this.s.phase === 'defeat') throw new GameError(this.t`The party has fallen. Start a new adventure.`);
    if (this.s.phase === 'combat') throw new GameError(this.t`Finish the fight first`);
    if (this.s.travel) throw new GameError(this.t`The party is on the road`);
    if (!this.consciousHeroes().length) throw new GameError(this.t`Nobody in the party can act`);
  }

  advanceTime(minutes: number) { this.world.minutes += Math.max(0, Math.round(minutes)); }

  /** Mark a place as visited and its people as met. */
  private settleIn(loc: LocationState): boolean {
    const first = !loc.visited;
    this.newPlace = null;
    this.world.placeId = loc.id;
    delete this.s.stage; // a new place starts with its own scene
    loc.visited = true;
    loc.discovered = true;
    for (const n of this.s.memory.npcs) if (n.locationId === loc.id) n.met = true;
    if (first) logEvent(this, { what: `The party came to ${loc.name} for the first time.`, by: 'party' });
    enterPlace(this, loc);
    return first;
  }

  /** The story already walked the party into this place in its hex (the tavern, or back out into the village). */
  enterQuietly(loc: LocationState) {
    if (!sameHex(loc, this.world.party)) return;
    this.settleIn(loc);
  }

  private arriveAt(loc: LocationState, journey?: string) {
    const firstVisit = this.settleIn(loc);
    this.newPlace = firstVisit ? { id: loc.id, name: loc.name } : null;
    this.beats.push({ kind: 'arrive', location: loc.name, firstVisit, major: MAJOR_KINDS.includes(loc.kind), journey });
  }

  /** Step into a known place in the party's hex, such as a tavern in town. */
  goTo(locationId: string) {
    this.needExplore();
    const loc = this.location(locationId);
    if (!loc || !loc.discovered) throw new GameError(this.t`You do not know that place`);
    if (!sameHex(loc, this.world.party)) throw new GameError(this.t`${loc.name} is not here. Travel there on the map.`);
    if (this.world.placeId === loc.id) return;
    this.log('system', this.t`The party heads to ${loc.name}.`);
    this.arriveAt(loc);
  }

  /**
   * The story took the party somewhere: walking back to town, or on to the tavern there. Places in
   * this hex are a step away; others are reached along a known route of at most a few hexes, with
   * the time it takes and no ambush roll, because the Dungeon Master already told how the way went.
   * Longer journeys stay on the map, where the players pick the route.
   */
  journeyTo(ref: string) {
    const { loc, route } = this.planJourney(ref);
    if (!route) {
      this.goTo(loc.id);
      return { now_at: loc.name, moved: true, minutes: 0 };
    }
    return this.makeJourney(loc, route);
  }

  /**
   * The story wants the party somewhere else. A place in this hex is a step away and happens at
   * once; anywhere else becomes a proposal the players confirm, so a scouting trip in the story
   * never moves everyone and skips the hours by itself.
   */
  proposeJourney(ref: string) {
    const { loc, route } = this.planJourney(ref);
    if (!route) {
      this.goTo(loc.id);
      return { now_at: loc.name, moved: true, minutes: 0 };
    }
    this.s.trip = { locationId: loc.id, yes: [] };
    return {
      moved: false,
      proposed: true,
      note: `${loc.name} is ${route.length * HEX_MILES} miles away. The players now see a confirm card and the party has NOT moved and no time has passed. Narrate only scouting or moving about nearby, and end the scene on the choice to set out; the trip happens only after the players confirm it.`,
    };
  }

  /** Read the place and the way there. A place in this hex has no route. */
  private planJourney(ref: string): { loc: LocationState; route: Hex[] | null } {
    this.needExplore();
    const w = this.world;
    const key = ref.trim().toLowerCase();
    const loc = w.locations.find((l) => l.discovered && l.id.toLowerCase() === key)
      ?? w.locations.find((l) => l.discovered && l.name.toLowerCase() === key);
    if (!loc) throw new GameError(`No known place "${ref}". Known places: ${w.locations.filter((l) => l.discovered).map((l) => `${l.name} [${l.id}]`).join(', ')}.`);
    if (w.placeId === loc.id || sameHex(loc, w.party)) return { loc, route: null };
    const route = this.knownRoute(loc);
    if (!route) throw new GameError(`The party knows no way to ${loc.name}.`);
    if (route.length > STORY_TRAVEL_HEXES) throw new GameError(`${loc.name} is ${route.length * HEX_MILES} miles away. Tell the players to travel there on the map, which tracks the days on the road.`);
    return { loc, route };
  }

  /** What the confirm card shows. */
  private tripView() {
    const s = this.s, w = s.world, trip = s.trip;
    if (!trip || !w || s.phase !== 'explore' || s.travel) return null;
    const loc = this.location(trip.locationId);
    const route = loc && !sameHex(loc, w.party) ? this.knownRoute(loc) : null;
    if (!loc || !route) return null;
    let minutes = 0;
    for (const h of route) minutes += hoursFor(trueTerrain(w, h)) * 60;
    return { locationId: loc.id, name: loc.name, miles: route.length * HEX_MILES, hours: minutes / 60, yes: trip.yes, needed: this.tripVotesNeeded() };
  }

  /** Votes it takes: just one at a solo table, otherwise more than half of those who are here. */
  private tripVotesNeeded() {
    const here = this.s.players.filter((p) => p.connected).length;
    return Math.floor(here / 2) + 1;
  }

  /** A player agrees to the proposed trip. The host's yes is enough; otherwise a majority carries it. Returns true once the party sets out. */
  confirmTrip(playerId: string): boolean {
    const s = this.s;
    const view = this.tripView();
    if (!s.trip || !view) { s.trip = null; throw new GameError(this.t`There is no trip to confirm`); }
    if (!this.player(playerId)) throw new GameError(this.t`You are not at this table`);
    if (!s.trip.yes.includes(playerId)) s.trip.yes.push(playerId);
    const live = s.trip.yes.filter((id) => this.player(id)?.connected).length;
    if (!(s.hostId === playerId || live >= view.needed)) return false;
    const loc = this.location(s.trip.locationId)!;
    s.trip = null;
    const route = this.knownRoute(loc);
    if (!route) throw new GameError(this.t`The party knows no way there`);
    const r = this.makeJourney(loc, route);
    // The Dungeon Master tells the arrival now, as the party reaches the place.
    this.newPlace = r.firstVisit ? { id: loc.id, name: loc.name } : null;
    this.beats.push({ kind: 'arrive', location: loc.name, firstVisit: r.firstVisit, major: MAJOR_KINDS.includes(loc.kind), journey: r.journey });
    return true;
  }

  /** Anyone at the table can call the trip off: the party stays where it is and no time passes. */
  cancelTrip(playerId: string) {
    const s = this.s;
    if (!s.trip) return;
    if (!this.player(playerId)) throw new GameError(this.t`You are not at this table`);
    const name = this.location(s.trip.locationId)?.name ?? '';
    s.trip = null;
    this.log('system', this.t`The party stays where it is and does not set out for ${name}.`);
  }

  private makeJourney(loc: LocationState, route: Hex[]) {
    const w = this.world;
    this.s.trip = null;
    let minutes = 0;
    const terrain: string[] = [];
    for (const h of route) {
      const code = trueTerrain(w, h);
      minutes += hoursFor(code) * 60;
      if (!terrain.includes(TERRAIN[code].name)) terrain.push(TERRAIN[code].name);
      reveal(w, h, code === 'h' || code === 'm' ? 2 : 1);
    }
    for (const sh of Object.values(this.s.shops)) if (!sh.locationId) delete this.s.shops[sh.id];
    w.party = { q: loc.q, r: loc.r };
    w.placeId = null;
    w.minutes += minutes;
    const journey = this.journeyText({ to: loc, hexes: route.length, minutes, terrain });
    // A tavern in a town: arrive in the town first, so the town counts as visited too.
    const root = this.rootOf(loc);
    if (root !== loc) this.settleIn(root);
    const firstVisit = this.settleIn(loc);
    this.log('system', this.t`The party travels ${journey} and reaches ${loc.name}. ${formatTime(w.minutes, this.lang)}.`);
    return { now_at: loc.name, moved: true, minutes, journey, firstVisit };
  }

  private knownRoute(to: Hex): Hex[] | null {
    const w = this.world;
    return findRoute(w.width, w.height, (h) => knownTerrain(w, h), w.party, to);
  }

  beginTravel(q: number, r: number) {
    this.needExplore();
    const w = this.world;
    const to = { q, r };
    if (!Number.isInteger(q) || !Number.isInteger(r) || q < 0 || r < 0 || q >= w.width || r >= w.height) throw new GameError(this.t`That is off the map`);
    if (sameHex(to, w.party)) throw new GameError(this.t`You are already there`);
    const charted = isExplored(w, to) || w.locations.some((l) => l.discovered && sameHex(l, to));
    if (!charted) throw new GameError(this.t`That is uncharted. Travel to the edge of what you know first.`);
    if (!this.knownRoute(to)) throw new GameError(isExplored(w, to) && !TERRAIN[trueTerrain(w, to)].passable ? this.t`You cannot cross open water` : this.t`You know no way there`);
    // A peddler met on the road does not follow the party.
    for (const sh of Object.values(this.s.shops)) if (!sh.locationId) delete this.s.shops[sh.id];
    this.s.travel = { to, hexes: 0, minutes: 0, terrain: [] };
  }

  /** Advance the journey by one hex. Returns true while the party is still travelling. */
  travelStep(): boolean {
    const s = this.s, w = this.world, t = s.travel;
    if (!t || s.phase !== 'explore') { s.travel = null; return false; }
    const route = this.knownRoute(t.to);
    if (!route?.length) return this.endTravel(route ? 'arrived' : 'blocked');
    const next = route[0];
    const code = trueTerrain(w, next);
    const minutes = hoursFor(code) * 60;
    w.party = next;
    w.placeId = null;
    delete this.s.stage;
    w.minutes += minutes;
    t.hexes++;
    t.minutes += minutes;
    if (!t.terrain.includes(TERRAIN[code].name)) t.terrain.push(TERRAIN[code].name);
    const found = reveal(w, next, code === 'h' || code === 'm' ? 2 : 1).filter((l) => !l.parentId);
    const here = w.locations.find((l) => !l.parentId && sameHex(l, next));
    if (sameHex(next, t.to) || (here && found.includes(here))) return this.endTravel('arrived');
    // A campaign book has its own wandering monsters, which the Dungeon Master runs from the book.
    if (!here && !s.setting?.campaign && this.rng() < encounterChance(code, w.minutes)) {
      const journey = this.journeyText(t);
      s.travel = null;
      this.log('system', this.t`After ${journey}, the party is set upon. ${formatTime(w.minutes, this.lang)}.`);
      const table = ENCOUNTERS[code] ?? ENCOUNTERS.p;
      this.startEncounter(table[Math.floor(this.rng() * table.length)], { source: 'wild', context: `The party is ambushed on the road after ${journey}, in ${TERRAIN[code].name}.` });
      return false;
    }
    if (found.length) return this.endTravel('discovery', found);
    return true;
  }

  private journeyText(t: NonNullable<InternalState['travel']>) {
    return this.t`${t.hexes * HEX_MILES} miles and ${formatHours(t.minutes / 60, this.lang)} through ${t.terrain.map(this.n).join(', ') || this.t`open country`}`;
  }

  private endTravel(reason: 'arrived' | 'blocked' | 'discovery', found: LocationState[] = []): false {
    const s = this.s, w = this.world, t = s.travel!;
    s.travel = null;
    const journey = this.journeyText(t);
    const here = w.locations.find((l) => !l.parentId && sameHex(l, w.party));
    if (!t.hexes) {
      this.log('system', this.t`The party finds no way forward.`);
      return false;
    }
    const sighted = found.filter((l) => l !== here);
    const when = formatTime(w.minutes, this.lang);
    const far = sighted.length ? ` ${this.t`In the distance: ${sighted.map((l) => l.name).join(', ')}.`}` : '';
    this.log('system', (here ? this.t`The party travels ${journey} and reaches ${here.name}. ${when}.` : this.t`The party travels ${journey}. ${when}.`) + far);
    if (here) this.arriveAt(here, journey);
    else if (sighted.length) this.beats.push({ kind: 'discover', locations: sighted.map((l) => `${l.name} (${l.kind}) to the ${direction(w.party, l)}`), journey });
    else this.beats.push({ kind: 'travel_end', journey, reason: reason === 'blocked' ? 'blocked' : 'arrived' });
    return false;
  }

  /** Push into the next unexplored section of the dungeon the party is standing in. */
  delve() {
    this.needExplore();
    const loc = this.place();
    const stage = loc?.stages?.[loc.cleared ?? 0];
    if (!loc || !stage) throw new GameError(loc?.stages ? this.t`${loc.name} has been cleared` : this.t`There is nothing to delve into here`);
    this.log('system', this.t`The party pushes into ${stage.name}.`);
    this.startEncounter(stage.monsters, { source: 'dungeon', locationId: loc.id, context: `The party delves into ${stage.name} of ${loc.name}. ${stage.description}` });
  }

  // ----------------------------------------------------------------- combat

  /** Set up a battle map and roll initiative. Group counts are for a party of four. */
  startEncounter(groups: GroupSpec[], opts: { source: EncounterState['source']; locationId?: string; context: string; setting?: string; light?: string; surprise?: string; opener?: string; why?: string }): Opening | null {
    const s = this.s;
    if (s.phase !== 'explore') throw new GameError(s.phase === 'combat' ? 'A fight is already under way' : 'The adventure is not under way');
    const heroes = s.characters.filter((c) => !c.dead);
    if (!this.consciousHeroes().length) throw new GameError(this.t`Nobody in the party can fight`);
    const scale = Math.min(1, heroes.length / 4);
    const chosen: MonsterDef[] = [];
    const specs: GroupSpec[] = [];
    for (const g of groups) {
      const def = resolveMonster(g.defId);
      if (!def) {
        const close = suggestMonsters(String(g.defId));
        throw new GameError(this.t`Unknown monster type "${g.defId}".` + (close.length ? ` ${this.t`Closest in the catalogue: ${close.join(', ')}.`}` : '') + ' Use find_monsters to search the catalogue by name, type or challenge rating.');
      }
      const wanted = Math.max(1, Math.min(8, Math.round(Number(g.count) || 1)));
      const count = def.boss ? wanted : Math.max(1, Math.ceil(wanted * scale));
      for (let i = 0; i < count && chosen.length < 8; i++) { chosen.push(def); specs.push(g); }
    }
    if (!chosen.length) throw new GameError(this.t`An encounter needs at least one monster`);
    // The battle log beside the map starts here, with any ambush roll.
    const logFrom = s.logSeq + 1;
    s.travel = null;
    const place = this.place();
    const terrain = trueTerrain(this.world, this.world.party);
    s.biome = chooseBiome({ setting: opts.setting, placeKind: place?.kind, terrain, dungeonDelve: opts.source === 'dungeon' });
    s.rows = buildBattleMap(s.biome, this.rng, terrain);
    const midY = Math.floor(this.height / 2);
    const column = (xs: number[]) => {
      const out: Pt[] = [];
      for (const x of xs) for (const dy of [0, -1, 1, -2, 2, -3, 3, -4, 4]) out.push({ x, y: midY + dy });
      return out;
    };
    // Heroes stand on a diagonal, never two in one column next to each other, so the miniatures in
    // the 2.5D view (taller than a square) do not hide one another.
    const spaced = [[3, 0], [2, -1], [4, 1], [2, 1], [4, -1], [3, -2], [3, 2], [2, -3], [4, 3]].map(([x, dy]) => ({ x, y: midY + dy }))
      .filter((p) => p.y >= 1 && p.y < this.height - 1);
    const heroSpots = [...spaced, ...column([3, 2]).filter((p) => !spaced.some((q) => q.x === p.x && q.y === p.y))];
    heroes.forEach((c, i) => { c.x = heroSpots[i].x; c.y = heroSpots[i].y; });
    // Companions stand behind the heroes, or beside them when the column is full.
    const allies = s.companions.filter((c) => !c.dead);
    const allySpots = column([1, 2, 3]).filter((p) => !heroes.some((c) => c.x === p.x && c.y === p.y) && p.y >= 1 && p.y < this.height - 1);
    allies.forEach((c, i) => { const p = allySpots[i] ?? heroSpots[heroes.length + i]; c.x = p.x; c.y = p.y; });
    const boss = chosen.some((d) => d.boss || d.legendary) || specs.some((g) => g.boss);
    const label = (i: number) => specs[i].name?.trim().slice(0, 40) || this.n(chosen[i].name);
    s.monsters = chosen.map((def, i) => {
      const spec = specs[i];
      const name = label(i);
      const total = chosen.filter((_, j) => label(j) === name).length;
      const n = chosen.slice(0, i + 1).filter((_, j) => label(j) === name).length;
      const power = POWER[(spec.power ?? 'standard') as Power] ?? 1;
      const base = def.boss ? Math.max(Math.ceil(def.hp * 0.5), Math.round(def.hp * Math.max(scale, 0.5))) : def.hp;
      const hp = Math.max(1, Math.round(base * power));
      const look = applyLookTokens(def.look, spec.look ?? []).look;
      const m: Monster = { id: this.uid('m'), defId: def.id, name: total > 1 ? `${name} ${n}` : name, x: 0, y: 0, hp, maxHp: hp, alive: true, conditions: [], tiles: SIZE_TILES[look.size], look, description: spec.description?.trim().slice(0, 300) || this.n(def.description) };
      if (power !== 1) m.xpScale = power;
      return m;
    });
    this.placeMonsters(midY);
    this.lightTheField(opts.light);
    s.encounter = { source: opts.source, locationId: opts.locationId ?? null, boss };
    this.spoilsOpen = false;
    const ambush = this.surprise(heroes, opts.surprise, opts.opener);
    s.sneaks = {};
    for (const c of heroes) this.enterFight(c);
    const caught = new Set(ambush?.caughtIds ?? []);
    const mark = (id: string) => (caught.has(id) ? { surprised: true } : {});
    const order: Combatant[] = [
      ...heroes.map((c) => ({ id: c.id, kind: 'pc' as const, initiative: this.heroInitiative(c, caught.has(c.id)), ...mark(c.id) })),
      ...allies.map((c) => ({ id: c.id, kind: 'ally' as const, initiative: this.heroInitiative(c, caught.has(c.id)), ...mark(c.id) })),
      ...s.monsters.map((m) => ({ id: m.id, kind: 'monster' as const, initiative: this.initiativeFor(MONSTERS[m.defId].dexMod, caught.has(m.id)), ...mark(m.id) })),
    ].sort((a, b) => b.initiative - a.initiative || (a.kind === 'monster' ? 1 : 0) - (b.kind === 'monster' ? 1 : 0) || (a.kind === 'pc' ? -1 : b.kind === 'pc' ? 1 : 0));
    // The hero who strikes from hiding takes the first turn, and that turn's attack is the strike.
    const opener = ambush?.opener;
    if (opener) {
      const i = order.findIndex((o) => o.id === opener.c.id);
      const [entry] = order.splice(i, 1);
      order.unshift({ ...entry, ambush: true });
    }
    s.combat = { round: 1, order, turnIndex: -1, movementLeft: 0, actionUsed: false, bonusUsed: false, attacksLeft: 0, logFrom, roundFrom: [logFrom], ...(ambush ? { surprise: { side: ambush.side, ...(opener ? { opener: opener.c.id } : {}) } } : {}) };
    s.phase = 'combat';
    const waiting = this.readyWaitMs > 0 ? s.players.filter((p) => p.connected && heroes.some((c) => c.ownerId === p.id)).map((p) => p.id) : [];
    if (waiting.length) s.combat.ready = { why: this.whyFight(opts.why, ambush?.side ?? null, ambush?.caughtIds.length ?? 0), waiting, until: Date.now() + this.readyWaitMs };
    this.log('system', this.t`Combat! Initiative: ${order.map((o) => `${this.nameOf(o.id)} ${o.ambush ? `(${this.t`first, from hiding`})` : o.initiative}`).join(', ')}.`);
    this.beats.push({ kind: 'combat_start', monsters: s.monsters.map((m) => m.name), boss, context: opts.context });
    this.nextTurn();
    if (!ambush) return null;
    const out: Opening = { side: ambush.side, caught: ambush.caughtIds.map((id) => this.nameOf(id)), noticed: ambush.noticedIds.map((id) => this.nameOf(id)), stealth: ambush.stealth };
    if (ambush.noStrike) out.noStrike = ambush.noStrike;
    if (opener && this.current()?.id === opener.c.id) out.strike = this.openingStrike(opener.c, opener.m);
    return out;
  }

  /** The line on the "get ready" card: the Dungeon Master's reason, or one from how the fight began. */
  private whyFight(asked: string | undefined, side: SurpriseInfo['side'] | null, caught: number): string {
    const why = String(asked ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);
    if (why) return why;
    if (side === 'party') return caught ? this.t`Ambush! The enemies are upon you before you see them.` : this.t`Ambush! But you spot the enemies in time.`;
    if (side === 'enemies') return caught ? this.t`You catch the enemies unawares.` : this.t`The enemies notice you before you can strike.`;
    return this.t`The enemies attack. The fight begins!`;
  }

  /** A player is ready for the fight to begin. Once nobody is left, the monsters may move. */
  pressReady(playerId: string): boolean {
    const r = this.s.combat?.ready;
    if (!r) return true;
    r.waiting = r.waiting.filter((id) => id !== playerId);
    if (!r.waiting.length) this.s.combat!.ready = null;
    return !this.s.combat!.ready;
  }

  /** The time to get ready is over: the fight begins. */
  endReady() {
    if (this.s.combat?.ready) this.s.combat.ready = null;
  }

  /**
   * Who is caught unawares as a fight begins (SRD 5.2.1: a surprised creature has Disadvantage
   * on its Initiative roll). The heroes catch the enemies unawares only on a Stealth check that
   * succeeded a moment ago, measured against each enemy's Passive Perception; the Dungeon
   * Master's word alone is not enough. In an ambush the enemies roll Stealth against each
   * hero's Passive Perception. A hero who struck from hiding is set down next to the target.
   */
  private surprise(heroes: Character[], asked?: string, openerRef?: string) {
    const s = this.s;
    const word = String(asked ?? '').trim().toLowerCase();
    const ref = String(openerRef ?? '').trim();
    let side: SurpriseInfo['side'] | null = ['enemies', 'enemy', 'monsters', 'them'].includes(word) ? 'enemies' : ['party', 'heroes', 'players', 'us', 'ambush'].includes(word) ? 'party' : null;
    if (ref && !['none', 'no', '-'].includes(ref.toLowerCase())) side = 'enemies';
    else if (!side) return null;
    const result = { side, caughtIds: [] as string[], noticedIds: [] as string[], stealth: 0, opener: null as { c: Character; m: Monster } | null, noStrike: '' };
    if (side === 'party') {
      // The enemies creep up as a group: the worst roll among their kinds is the one that counts.
      const kinds = [...new Set(s.monsters.map((m) => m.defId))];
      result.stealth = Math.min(...kinds.map((id) => d20(this.rng).value + stealthBonus(MONSTERS[id])));
      for (const c of heroes) (this.heroPassivePerception(c) < result.stealth ? result.caughtIds : result.noticedIds).push(c.id);
      this.log('roll', result.caughtIds.length
        ? this.t`Ambush! The enemies' Stealth: ${result.stealth}. Caught unawares, with Disadvantage on Initiative: ${result.caughtIds.map((id) => this.nameOf(id)).join(', ')}.`
        : this.t`Ambush! The enemies' Stealth: ${result.stealth}. Every hero notices them in time.`);
      return result;
    }
    const now = s.world ? this.world.minutes : 0;
    const fresh = Object.entries(s.sneaks ?? {}).filter(([id, r]) => now - r.at <= SNEAK_MINUTES && heroes.some((h) => h.id === id && this.conscious(h)));
    const sneaker = ref ? heroes.find((h) => h.id === ref || h.name.toLowerCase() === ref.toLowerCase()) : null;
    if (ref && !sneaker) throw new GameError(`Unknown hero "${ref}" for opener. Use a hero id such as "pc1".`);
    if (!fresh.length || (sneaker && !fresh.some(([id]) => id === sneaker.id))) {
      throw new GameError(`${sneaker ? `${sneaker.name} has` : 'No hero has'} a successful Stealth check from just now, so nobody is caught unawares. Call skill_check with ability "dex" and skill "stealth" first and start the fight by surprise only if it succeeds; otherwise start it without surprise.`);
    }
    result.stealth = sneaker ? s.sneaks![sneaker.id].total : Math.min(...fresh.map(([, r]) => r.total));
    for (const m of s.monsters) (result.stealth >= passivePerception(MONSTERS[m.defId]) ? result.caughtIds : result.noticedIds).push(m.id);
    const names = (ids: string[]) => ids.map((id) => this.nameOf(id)).join(', ');
    this.log('roll', [
      result.caughtIds.length ? this.t`Surprise! Stealth ${result.stealth}. Caught unawares, with Disadvantage on Initiative: ${names(result.caughtIds)}.` : this.t`Stealth ${result.stealth}: the enemies notice the heroes in time.`,
      result.caughtIds.length && result.noticedIds.length ? this.t`Not fooled: ${names(result.noticedIds)}.` : '',
    ].filter(Boolean).join(' '));
    if (!sneaker) return result;
    const target = s.monsters[0];
    if (!result.caughtIds.includes(target.id)) {
      result.noStrike = `${target.name} noticed ${sneaker.name} (Passive Perception ${passivePerception(MONSTERS[target.defId])} against Stealth ${result.stealth}), so there is no strike from hiding.`;
      return result;
    }
    if (!this.weaponOf(sneaker)?.weapon?.ranged) this.standBeside(sneaker, target);
    result.opener = { c: sneaker, m: target };
    return result;
  }

  /** Puts a hero on a free square next to a monster, behind it as seen from the party if possible. */
  private standBeside(c: Character, m: Monster) {
    const n = this.tilesOf(m);
    const spots: Pt[] = [];
    for (let y = m.y - 1; y <= m.y + n; y++) for (let x = m.x - 1; x <= m.x + n; x++) {
      if (inFootprint(m, n, x, y) || x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
      if (!this.walkable(x, y) || this.monsterAt(x, y) || this.charAt(x, y, c.id)) continue;
      spots.push({ x, y });
    }
    const midY = m.y + (n - 1) / 2;
    spots.sort((a, b) => b.x - a.x || Math.abs(a.y - midY) - Math.abs(b.y - midY));
    if (spots[0]) { c.x = spots[0].x; c.y = spots[0].y; }
  }

  /** The strike from hiding that opens the fight: the hero's first attack, with Advantage because the target cannot see it coming. */
  private openingStrike(c: Character, m: Monster): NonNullable<Opening['strike']> | null {
    const ranged = this.weaponOf(c)?.weapon?.ranged;
    try {
      this.canAttack();
      this.targetMonster(c, m.id, ranged ? ranged.long : 5);
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      return null;
    }
    const before = m.hp;
    this.log('roll', this.t`${c.name} strikes from hiding!`);
    this.prime(`${c.id}:unseen`);
    this.spendAttack(c);
    const hit = this.strike(c, m);
    this.unprime(`${c.id}:unseen`);
    const sneakAttack = !!this.s.combat?.once?.includes(`${c.id}:sneak`);
    this.checkCombatOver();
    return { hero: c.name, target: m.name, hit, damage: Math.max(0, before - Math.max(0, m.hp)), sneakAttack, targetDown: !m.alive };
  }

  /** Passive Perception: 10 plus the Perception bonus. */
  heroPassivePerception(c: Character): number {
    const prof = c.skills.includes('perception') ? c.profBonus * (c.expertise.includes('perception') ? 2 : 1) : this.feat(c, 'jack_of_all_trades') ? Math.floor(c.profBonus / 2) : 0;
    return 10 + this.mod(c, 'wis') + prof;
  }

  /**
   * How the battlefield is lit: the time of day or the depth of the dungeon, unless the
   * Dungeon Master said otherwise, plus the lights that belong to the place. Heroes who
   * cannot see in the dark come in with a lantern or torch held high if they carry one,
   * and monsters that need light bring their own.
   */
  private lightTheField(asked?: string) {
    const s = this.s;
    const biome = s.biome ?? 'dungeon';
    s.ambient = isLightLevel(asked) ? asked : ambientLight(biome, this.world.minutes);
    s.lights = s.ambient === 'bright' ? [] : placeFixedLights(biome, s.rows, this.rng);
    this.lightCache = null;
    for (const c of this.party()) {
      c.light = null;
      if (s.ambient === 'bright' || c.dead || this.heroSenses(c).darkvision > 0) continue;
      const kind = this.lightItemOf(c);
      if (kind) c.light = kind;
    }
    for (const m of s.monsters) m.light = s.ambient !== 'bright' ? MONSTERS[m.defId].carriesLight ?? null : null;
    const lit = this.party().filter((c) => c.light);
    if (s.ambient !== 'bright') {
      const level = this.n(s.ambient === 'dark' ? 'Darkness' : 'Dim light');
      this.log('system', lit.length ? this.t`${level} on the battlefield. Lights held up: ${lit.map((c) => c.name).join(', ')}.` : this.t`${level} on the battlefield.`);
    }
  }

  /** The best light a hero carries: a lantern before a torch. */
  private lightItemOf(c: Character): LightKindId | null {
    const held = new Set(this.carried(c).map((x) => x.item.defId));
    return LIGHT_ITEMS.find((l) => held.has(l.itemId))?.kind ?? null;
  }

  // ------------------------------------------------------------------ light

  private lightCache: { key: string; grid: LightLevel[] } | null = null;

  /** Every light on the battle map; carried ones stand where their holder stands. */
  lightSources(): LightSource[] {
    const out: LightSource[] = [...(this.s.lights ?? [])];
    for (const c of this.party()) if (c.light && !c.dead) out.push({ kind: c.light, x: c.x, y: c.y, holder: c.id });
    for (const m of this.s.monsters) if (m.light && m.alive) out.push({ kind: m.light, x: m.x, y: m.y, holder: m.id });
    return out;
  }

  /** The light on one tile right now. */
  lightAt(p: Pt): LightLevel {
    const ambient = this.s.ambient ?? 'bright';
    if (ambient === 'bright' || this.s.phase !== 'combat') return 'bright';
    const sources = this.lightSources();
    const k = `${ambient}|${this.s.rows.join('')}|${sources.map((l) => `${l.kind}${l.x},${l.y}`).join(';')}`;
    if (this.lightCache?.key !== k) this.lightCache = { key: k, grid: lightGrid(this.s.rows, ambient, sources) };
    return this.lightCache.grid[p.y * this.width + p.x] ?? ambient;
  }

  heroSenses(c: Character): Senses {
    const dark = Math.max(SPECIES_DARKVISION[c.speciesId] ?? 0, this.opted(c, 'inv_sight') ? 120 : 0, c.feats.includes('boon_truesight') ? 60 : 0, ...this.buffsOf(c).map((b) => b.darkvision ?? 0), ...this.worn(c).map((d) => d.darkvision ?? 0));
    return { darkvision: dark, blindsight: this.feat(c, 'feral_senses') ? 30 : 0 };
  }

  monsterSenses(m: Monster): Senses {
    const d = MONSTERS[m.defId];
    return d ? { darkvision: d.darkvision ?? 0, blindsight: Math.max(d.blindsight ?? 0, d.truesight ?? 0, d.tremorsense ?? 0) } : NO_SENSES;
  }

  /** The top-left square of a monster's space. */
  monsterPoint(m: Monster): Pt { return { x: m.x, y: m.y }; }

  /** Can the hero make out any square of the monster's space? */
  heroSees(c: Character, m: Monster): boolean {
    if (c.conditions.includes('blinded')) return false;
    const n = this.tilesOf(m), senses = this.heroSenses(c);
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) {
      const p = { x: m.x + dx, y: m.y + dy };
      if (canSee(this.s.rows, c, senses, p, this.lightAt(p))) return true;
    }
    return false;
  }

  /** Can the monster make out the hero? Measured from its square nearest the hero. */
  monsterSees(m: Monster, c: Character): boolean {
    return canSee(this.s.rows, this.mpoint(m, c), this.monsterSenses(m), c, this.lightAt(c));
  }

  /**
   * Advantage and disadvantage from sight, with a line for the log. Attacking a creature
   * you cannot see has disadvantage; attacking one that cannot see you has advantage.
   */
  private sight(attacker: string, target: string, attackerSees: boolean, targetSees: boolean): { adv: boolean; dis: boolean; note: string } {
    const notes: string[] = [];
    if (!attackerSees) notes.push(this.t`${attacker} cannot see ${target} in the dark.`);
    if (!targetSees) notes.push(this.t`${target} cannot see ${attacker} coming.`);
    return { adv: !targetSees, dis: !attackerSees, note: notes.length ? ` ${notes.join(' ')}` : '' };
  }

  /**
   * Stands the monsters on the far side of the map, the biggest first. A big
   * creature gets a lane cleared through the middle so it can reach the party.
   */
  private placeMonsters(midY: number) {
    const s = this.s;
    const W = this.width, H = this.height;
    const rows = s.rows.map((r) => [...r]);
    const open = s.biome === 'tavern' ? '=' : '.';
    const clear = (x: number, y: number) => {
      if (x < 1 || y < 1 || x > W - 2 || y > H - 2 || tileWalkable(rows[y][x])) return;
      rows[y][x] = rows[y][x] === 'W' ? (s.biome === 'bridge' ? '=' : '~') : open;
    };
    const biggest = Math.max(...s.monsters.map((m) => this.tilesOf(m)));
    if (biggest > 1) {
      const top = midY - Math.floor(biggest / 2);
      for (let y = top - 1; y <= top + biggest; y++) for (let x = 1; x < W - 1; x++) clear(x, y);
    }
    const taken = new Set<string>();
    for (const m of [...s.monsters].sort((a, b) => this.tilesOf(b) - this.tilesOf(a))) {
      const n = this.tilesOf(m);
      const xs = n === 1 ? [W - 4, W - 3, W - 5, W - 6, W - 7, W - 8] : [W - 2 - n, W - 3 - n, W - 4 - n, W - 5 - n, W - 6 - n, W - 7 - n];
      const top = Math.max(1, Math.min(H - 1 - n, midY - Math.floor(n / 2)));
      let spot: Pt | null = null;
      for (const x of xs) {
        for (const dy of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5]) {
          const y = top + dy;
          if (y < 1 || y + n > H - 1) continue;
          let free = true;
          for (let j = 0; j < n && free; j++) for (let i = 0; i < n; i++) if (taken.has(key(x + i, y + j))) { free = false; break; }
          if (free) { spot = { x, y }; break; }
        }
        if (spot) break;
      }
      spot ??= { x: xs[0], y: top };
      m.x = spot.x; m.y = spot.y;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { taken.add(key(m.x + i, m.y + j)); clear(m.x + i, m.y + j); }
    }
    s.rows = rows.map((r) => r.join(''));
  }

  private initiativeFor(dexMod: number, surprised = false) { return d20(this.rng, surprised ? 'disadvantage' : 'normal').value + dexMod; }

  /** A hero's d20. Halfling Luck rerolls a natural 1 once. */
  private heroD20(c: Character, mode: RollMode = 'normal') {
    const r = d20(this.rng, mode);
    return c.speciesId === 'halfling' && r.value === 1 ? d20(this.rng, mode) : r;
  }

  nameOf(id: string): string {
    return this.party().find((c) => c.id === id)?.name ?? this.s.monsters.find((m) => m.id === id)?.name ?? id;
  }

  current() {
    const c = this.s.combat;
    return c ? c.order[c.turnIndex] : undefined;
  }

  isMonsterTurn() { return this.s.phase === 'combat' && this.current()?.kind === 'monster'; }
  /** A companion is up: the server plays their turn with companionAct. */
  isAllyTurn() { return this.s.phase === 'combat' && this.current()?.kind === 'ally'; }

  /** Advance to the next combatant able to act, resolving death saves on the way. */
  nextTurn() {
    const s = this.s;
    for (let guard = 0; guard < 200; guard++) {
      const combat = s.combat;
      if (!combat || s.phase !== 'combat') return;
      if (this.checkCombatOver()) return;
      combat.turnIndex++;
      if (combat.turnIndex >= combat.order.length) { combat.turnIndex = 0; combat.round++; (combat.roundFrom ??= []).push(s.logSeq + 1); }
      const cur = combat.order[combat.turnIndex];
      combat.actionUsed = false;
      combat.bonusUsed = false;
      combat.attacksLeft = 0;
      combat.attacked = false;
      combat.savageUsed = false;
      combat.disengaged = false;
      combat.once = [];
      combat.primed = [];
      combat.lastHit = null;
      combat.moved = false;
      // A reaction comes back at the start of one's own turn.
      combat.reacted = (combat.reacted ?? []).filter((id) => id !== cur.id);
      if (cur.kind === 'pc' || cur.kind === 'ally') {
        const c = this.char(cur.id);
        if (c.dead) continue;
        if (c.hp <= 0) { this.deathSave(c); continue; }
        c.conditions = c.conditions.filter((x) => x !== 'dodging');
        combat.movementLeft = Math.floor(c.speed / 5);
        if (!this.heroTurnStart(c)) continue;
        this.log('system', this.t`${c.name}'s turn.`);
        return;
      }
      const m = this.monster(cur.id);
      if (!m.alive) continue;
      combat.movementLeft = Math.floor(MONSTERS[m.defId].speed / 5);
      return;
    }
  }

  private deathSave(c: Character) {
    if (c.conditions.includes('stable')) return;
    // Survivor: death saves with advantage, and 18 to 20 counts as a 20.
    const tough = this.feat(c, 'survivor');
    const rolled = this.heroD20(c, tough ? 'advantage' : 'normal').value;
    const r = tough && rolled >= 18 ? 20 : rolled;
    if (r === 20) {
      this.healChar(c, 1);
      this.log('roll', this.t`${c.name} rolls a natural 20 on a death save and staggers back up with 1 HP!`);
      return;
    }
    if (r >= 10) c.deathSaves.successes++;
    else c.deathSaves.failures += r === 1 ? 2 : 1;
    if (c.deathSaves.failures >= 3) {
      c.dead = true;
      c.conditions = ['dead'];
      this.tally?.(c.id, 'deaths');
      this.log('roll', this.t`${c.name} rolls ${r} on a death save and dies.`);
    } else if (c.deathSaves.successes >= 3) {
      c.conditions.push('stable');
      this.log('roll', this.t`${c.name} rolls ${r} on a death save and is stable.`);
    } else {
      this.log('roll', this.t`${c.name} rolls ${r} on a death save (${c.deathSaves.successes} successes, ${c.deathSaves.failures} failures).`);
    }
  }

  /** Ends combat on victory or defeat. Returns true if combat is over. */
  private checkCombatOver(): boolean {
    const s = this.s;
    if (!s.combat) return true;
    this.settleDeaths();
    const rounds = s.combat.round;
    const seq = (s.lastFight?.seq ?? 0) + 1;
    const slainNames = s.monsters.filter((m) => !m.alive).map((m) => m.name);
    const boss = !!s.encounter?.boss;
    const ending = (result: FightOutcome['result'], extra: Partial<FightOutcome> = {}): FightOutcome =>
      ({ seq, result, xp: 0, xpEach: 0, gold: 0, loot: [], slain: slainNames, rounds, boss, leveled: [], ...extra });
    if (!this.consciousHeroes().length) {
      this.clearEffects();
      for (const c of this.party()) this.leaveFight(c);
      s.combat = null;
      s.encounter = null;
      s.monsters = [];
      s.rows = [];
      const survivors = s.characters.filter((c) => !c.dead);
      if (!survivors.length) {
        s.phase = 'defeat';
        s.lastFight = ending('defeat');
        this.log('system', this.t`The party has fallen.`);
        this.beats.push({ kind: 'defeat' });
        return true;
      }
      // Left for dead, the survivors are carried back to the nearest safe place.
      for (const c of [...survivors, ...s.companions.filter((x) => !x.dead)]) { c.hp = 1; c.conditions = []; c.deathSaves = { successes: 0, failures: 0 }; }
      const w = this.world;
      const haven = w.locations.filter((l) => !l.parentId && l.visited && SAFE_KINDS.includes(l.kind)).sort((a, b) => hexDistance(a, w.party) - hexDistance(b, w.party))[0];
      const lost = Math.floor(s.gold / 2);
      s.gold -= lost;
      w.minutes = (Math.floor(w.minutes / 1440) + 1) * 1440 + 8 * 60;
      if (haven) { w.party = { q: haven.q, r: haven.r }; this.settleIn(haven); reveal(w, w.party, 1); }
      s.phase = 'explore';
      s.lastFight = ending('rescued', { gold: -lost });
      this.log('system', (haven ? this.t`The party is overwhelmed. The survivors wake in ${haven.name} the next morning with 1 HP.` : this.t`The party is overwhelmed. The survivors wake where they fell the next morning with 1 HP.`) + (lost ? ` ${this.t`They are ${lost} gp lighter.`}` : ''));
      this.beats.push({ kind: 'rescued' });
      return true;
    }
    if (s.monsters.some((m) => m.alive)) return false;
    const enc = s.encounter;
    s.combat = null;
    s.encounter = null;
    s.phase = 'explore';
    this.clearEffects();
    for (const c of this.party()) {
      this.leaveFight(c);
      c.conditions = c.conditions.filter((x) => x !== 'dodging');
      if (!c.dead && c.hp <= 0) {
        this.healChar(c, 1);
        this.log('system', this.t`${c.name} is tended to and comes around with 1 HP.`);
      }
    }
    const rewards: string[] = [];
    let gold = 0;
    for (const m of s.monsters) { const g = MONSTERS[m.defId].gold; if (g) gold += roll(g, this.rng).total; }
    const xp = s.monsters.reduce((n, m) => n + Math.round(MONSTERS[m.defId].xp * (m.xpScale ?? 1)), 0);
    const slain = s.monsters.map((m) => m.name).join(', ');
    const loc = enc?.source === 'dungeon' && enc.locationId ? this.location(enc.locationId) : undefined;
    const stage = loc?.stages?.[loc.cleared ?? 0];
    let questDone: string | null = null;
    if (loc && stage) {
      loc.cleared = (loc.cleared ?? 0) + 1;
      gold += stage.loot.gold;
      const items = this.giveLoot(stage.loot.items);
      if (items.length) rewards.push(items.join(', '));
      if (loc.cleared >= loc.stages!.length && loc.questId) questDone = loc.questId;
    }
    const found = this.magicLoot(xp, !!enc?.boss);
    if (found) rewards.push(...this.giveLoot([{ id: found }]));
    if (gold) { s.gold += gold; rewards.unshift(this.t`${gold} gp`); }
    this.log('system', [
      stage ? this.t`Victory in ${stage.name}.` : this.t`Victory.`,
      rewards.length ? this.t`The party finds ${rewards.join(', ')}.` : '',
      loc && stage && loc.cleared! >= loc.stages!.length ? this.t`${loc.name} is cleared.` : '',
    ].filter(Boolean).join(' '));
    s.monsters = [];
    s.rows = [];
    const levels = new Map(s.characters.map((c) => [c.id, c.level]));
    this.grantXp(xp, this.t`defeating ${slain}`);
    const living = s.characters.filter((c) => !c.dead).length;
    s.lastFight = ending('victory', {
      // As grantXp shares it: whole points for each living hero.
      xpEach: living && xp > 0 ? Math.max(1, Math.floor(xp / living)) : 0, xp: living && xp > 0 ? Math.max(1, Math.floor(xp / living)) * living : 0, gold, loot: rewards.filter((r) => r !== this.t`${gold} gp`),
      leveled: s.characters.filter((c) => c.level > (levels.get(c.id) ?? c.level)).map((c) => c.name),
    });
    // What the Dungeon Master hands out while telling of the aftermath belongs to the spoils too.
    this.spoilsOpen = true;
    if (questDone) this.setQuest({ id: questDone, status: 'completed' });
    this.beats.push({ kind: 'combat_end', boss: !!enc?.boss, rewards: [this.t`${xp} XP`, ...rewards].join(', ') });
    return true;
  }

  /**
   * Now and then a fight leaves a magic item behind: likelier for a hard fight or a boss, and
   * rarer finds as the party grows. Returns the item id, or null.
   */
  private magicLoot(xp: number, boss: boolean): string | null {
    const heroes = this.s.characters.filter((c) => !c.dead);
    if (!heroes.length) return null;
    const level = Math.max(...heroes.map((c) => c.level));
    const chance = Math.min(0.6, (boss ? 0.35 : 0.06) + xp / (heroes.length * 400 * level));
    if (this.rng() >= chance) return null;
    // The best rarity within reach, and each step below it twice as likely.
    const top = level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
    const order: Rarity[] = ['common', 'uncommon', 'rare', 'very_rare', 'legendary'];
    let r = 1;
    while (r < top && this.rng() < (boss ? 0.5 : 0.33)) r++;
    const pool = Object.values(ITEMS).filter((d) => d.rarity === order[r] && !d.story && d.id !== 'potion_superior_healing');
    return pool.length ? pool[Math.floor(this.rng() * pool.length)].id : null;
  }

  /** Hand items to whoever has room. Returns readable names of what was taken. */
  private giveLoot(items: { id: string; qty?: number }[]): string[] {
    const got: string[] = [];
    for (const it of items) {
      const qty = it.qty ?? 1;
      const taker = this.s.characters.find((c) => !c.dead && this.addToBag(c, it.id, qty));
      got.push(`${qty > 1 ? `${qty}× ` : ''}${this.n(this.def(it.id).name)} ${taker ? `(${taker.name})` : this.t`(left behind, bags are full)`}`);
    }
    return got;
  }

  // ------------------------------------------------------------ progression

  /** Share experience among the living heroes and apply any level-ups. */
  grantXp(total: number, reason: string) {
    const heroes = this.s.characters.filter((c) => !c.dead);
    if (!heroes.length || total <= 0) return;
    const each = Math.max(1, Math.floor(total / heroes.length));
    this.log('system', this.t`The party gains ${each * heroes.length} XP (${each} each) for ${reason}.`);
    const leveled: string[] = [];
    for (const c of heroes) {
      c.xp += each;
      while (c.level < MAX_LEVEL && c.xp >= XP_THRESHOLDS[c.level]) { this.levelUp(c); if (!leveled.includes(c.name)) leveled.push(c.name); }
    }
    if (leveled.length) this.beats.push({ kind: 'level_up', heroes: leveled });
  }

  private levelUp(c: Character) {
    const cls = CLASSES[c.classId];
    c.level++;
    const gains: string[] = [];
    let hp = Math.max(1, cls.hitDie / 2 + 1 + abilityMod(c.abilities.con) + (SPECIES[c.speciesId]?.hpPerLevel ?? 0));
    // Draconic Resilience: one more hit point for every level, counted from the first.
    if (this.feat(c, 'draconic_resilience')) hp += c.level === SUBCLASS_LEVEL ? c.level : 1;
    c.maxHp += hp;
    if (!c.dead && c.hp > 0) c.hp += hp;
    c.hitDice++;
    gains.push(this.t`+${hp} maximum HP (now ${c.maxHp})`);
    const pb = profBonusFor(c.level);
    if (pb !== c.profBonus) { c.profBonus = pb; gains.push(this.t`Proficiency bonus rises to +${pb}`); }
    const mana = maxManaOf(c) - c.maxMana;
    if (mana > 0) { c.maxMana += mana; c.mana += mana; gains.push(this.t`+${mana} maximum mana (now ${c.maxMana})`); }
    const gain = cls.levels[c.level];
    if (c.level === SUBCLASS_LEVEL) {
      c.subclass = cls.subclass.name;
      gains.push(this.t`Subclass: ${this.n(cls.subclass.name)}. ${loc(cls.subclass.text, this.lang)}`);
    }
    for (const id of gain?.abilities ?? []) {
      if (!c.abilityIds.includes(id)) c.abilityIds.unshift(id);
      gains.push(this.t`New ability: ${this.n(ABILITIES[id].name)}. ${this.n(ABILITIES[id].description)}`);
    }
    for (const f of gain?.features ?? []) gains.push(this.feature(f));
    for (const name of gain?.improves ?? []) gains.push(this.t`${this.n(name)} improves`);
    // Primal Champion and Body and Mind lift two abilities beyond the usual limit.
    const peak: AbilityKey[] = c.level === 20 ? (c.classId === 'barbarian' ? ['str', 'con'] : c.classId === 'monk' ? ['dex', 'wis'] : []) : [];
    if (peak.length) {
      const con = abilityMod(c.abilities.con);
      for (const k of peak) c.abilities[k] = Math.max(c.abilities[k], Math.min(25, c.abilities[k] + 4));
      const more = (abilityMod(c.abilities.con) - con) * c.level;
      c.maxHp += more;
      if (!c.dead && c.hp > 0) c.hp += more;
    }
    for (const kind of gain?.choose ?? []) {
      if (kind === 'feat') {
        c.pending.push({ id: this.uid('ch'), kind: 'feat', level: c.level });
        gains.push(c.level >= 19 ? this.t`Choose an epic boon, a feat or raise your ability scores` : this.t`Choose a feat or raise your ability scores`);
        continue;
      }
      const list = classSpellList(c.classId);
      const options = list ? spellOptions(c, list, kind) : [];
      // With a single spell left to learn there is nothing to decide.
      // Choices still waiting from earlier levels have a claim on what is left.
      const waiting = c.pending.filter((p) => p.kind === 'spell' && p.pool === kind).length;
      if (options.length === 1 && !waiting) {
        c.abilityIds.unshift(options[0]);
        gains.push(this.t`New ability: ${this.n(ABILITIES[options[0]].name)}. ${this.n(ABILITIES[options[0]].description)}`);
      } else if (options.length > Math.max(1, waiting)) {
        c.pending.push({ id: this.uid('ch'), kind: 'spell', level: c.level, pool: kind });
        gains.push(kind === 'cantrip' ? this.t`Choose a new cantrip` : this.t`Choose a new spell`);
      }
    }
    this.refresh(c);
    gains.push(...this.reconcile(c));
    const info: LevelUpInfo = { characterId: c.id, name: c.name, className: c.className, level: c.level, gains };
    this.log('levelup', this.t`${c.name} reaches level ${c.level}!`, { levelUp: info });
  }

  /** Resolve a level-up choice: a feat with its sub-choices, or a new spell. */
  choose(playerId: string, characterId: string, choiceId: string, pick: ChoicePick) {
    const c = this.char(characterId);
    if (c.ownerId !== playerId) throw new GameError(this.t`That hero belongs to another player`);
    const choice = c.pending.find((p) => p.id === choiceId);
    if (!choice) throw new GameError(this.t`That choice has already been made`);
    if (choice.kind === 'feat') {
      const feat = (pick as { feat?: FeatPick })?.feat;
      if (!feat) throw new GameError(this.t`Choose a feat or raise your ability scores`);
      const error = applyFeat(c, feat, false);
      if (error) this.fail(error);
      const def = FEATS[feat.id];
      const detail = feat.id === 'asi' ? ` (${(feat.abilities ?? []).map((k) => `${this.n(ABILITY_NAMES[k])} +1`).join(', ')})` : '';
      this.log('system', this.t`${c.name} takes ${this.n(def.name)}${detail}.`);
    } else if (choice.kind === 'option') {
      const picks = [...new Set(((pick as { options?: string[] })?.options ?? []).map(String))];
      if (picks.length !== choice.count) throw new GameError(this.t`Choose ${choice.count}: ${this.n(GROUPS[choice.group]?.name ?? choice.group)}`);
      const before = { feats: [...c.feats], features: [...c.features], expertise: [...c.expertise], skills: [...c.skills], options: [...(c.options ?? [])], logLength: this.s.log.length };
      for (const id of picks) {
        if (this.pickable(c, choice.group, choice.from).includes(id)) { this.takeOption(c, choice.group, id); continue; }
        Object.assign(c, { feats: before.feats, features: before.features, expertise: before.expertise, skills: before.skills, options: before.options });
        this.s.log.length = before.logLength;
        throw new GameError(this.t`${c.name} cannot choose that`);
      }
    } else {
      const spell = String((pick as { spell?: string })?.spell ?? '');
      const list = classSpellList(c.classId);
      if (!list || !spellOptions(c, list, choice.pool).includes(spell)) throw new GameError(this.t`${c.name} cannot learn that`);
      c.abilityIds.unshift(spell);
      this.log('system', this.t`${c.name} learns ${this.n(ABILITIES[spell].name)}.`);
    }
    c.pending = c.pending.filter((p) => p.id !== choiceId);
    this.refresh(c);
  }

  /** Validates that this player may act with this character right now. */
  private actor(playerId: string, characterId: string, needsTurn = true): Character {
    const c = this.char(characterId);
    if (c.companion) {
      // Any player may sort out a companion's gear between fights. In a fight they act on their own.
      if (this.s.phase === 'combat') throw new GameError(this.t`${c.name} acts on their own in a fight`);
      if (!this.player(playerId)) throw new GameError(this.t`Sit down at the table first`);
    } else if (!this.mayControl(playerId, c)) throw new GameError(this.t`That hero belongs to another player`);
    if (this.s.phase === 'lobby') throw new GameError(this.t`The adventure has not started`);
    if (this.s.phase === 'defeat') throw new GameError(this.t`The party has fallen. Start a new adventure.`);
    if (!this.conscious(c)) throw new GameError(c.dead ? this.t`${c.name} is dead` : this.t`${c.name} is unconscious`);
    if (needsTurn && this.s.phase === 'combat' && this.current()?.id !== c.id) throw new GameError(this.t`It is not ${c.name}'s turn`);
    return c;
  }

  private spendAction(bonus = false) {
    const combat = this.s.combat;
    if (!combat || this.s.phase !== 'combat') return;
    if (bonus) {
      if (combat.bonusUsed) throw new GameError(this.t`Bonus action already used this turn`);
      combat.bonusUsed = true;
    } else {
      if (combat.actionUsed) throw new GameError(this.t`Action already used this turn`);
      combat.actionUsed = true;
    }
  }

  private canAttack() {
    const combat = this.s.combat;
    if (combat && this.s.phase === 'combat' && combat.actionUsed && combat.attacksLeft <= 0) throw new GameError(this.t`Action already used this turn`);
  }

  /** Weapon attacks share one Attack action; Extra Attack allows a second swing. */
  private spendAttack(c: Character) {
    const combat = this.s.combat;
    if (!combat || this.s.phase !== 'combat') return;
    combat.attacked = true;
    if (!combat.actionUsed) {
      combat.actionUsed = true;
      combat.attacksLeft = extraAttacks(c) + (this.buffOn(c, 'extraAttack') ? 1 : 0);
    } else combat.attacksLeft--;
  }

  private canAct(bonus = false) {
    const combat = this.s.combat;
    if (!combat || this.s.phase !== 'combat') return;
    if (bonus ? combat.bonusUsed : combat.actionUsed) throw new GameError(bonus ? this.t`Bonus action already used this turn` : this.t`Action already used this turn`);
  }

  // --------------------------------------------------------------- movement

  move(playerId: string, characterId: string, tx: number, ty: number) {
    this.moveChar(this.actor(playerId, characterId), tx, ty);
  }

  /** Walk a hero or companion toward a square on their turn, as far as their movement goes. */
  private moveChar(c: Character, tx: number, ty: number) {
    const s = this.s;
    if (s.phase !== 'combat' || !s.combat) throw new GameError(this.t`There is no battle to move in right now`);
    if (!this.walkable(tx, ty)) throw new GameError(this.t`You can't go there`);
    if (c.x === tx && c.y === ty) return;
    if (HELD.some((x) => c.conditions.includes(x))) throw new GameError(this.t`${c.name} is held fast and cannot move`);
    for (const m of this.frighteners(c)) {
      if (this.mdist(m, { x: tx, y: ty }) < this.mdist(m, c)) throw new GameError(this.t`${c.name} is frightened of ${m.name} and will not go closer`);
    }
    const canEnter = (p: Pt) => !this.monsterAt(p.x, p.y) && !this.charAt(p.x, p.y, c.id);
    const path = this.bfs(c, (p) => p.x === tx && p.y === ty, canEnter);
    if (!path) throw new GameError(this.t`No path there`);
    if (s.combat.movementLeft <= 0) throw new GameError(this.t`No movement left this turn`);
    const steps = this.afford(path, s.combat.movementLeft).walked;
    if (!steps.length) throw new GameError(this.t`Not enough movement left for that ground`);
    // Step by step: leaving an enemy's reach without disengaging invites its opportunity attack.
    const walked: Pt[] = [];
    s.combat.moved = true;
    for (const q of steps) {
      if (!s.combat.disengaged) {
        for (const m of this.monstersLeftBy(c, c, q)) {
          (s.combat.reacted ??= []).push(m.id);
          const melee = MONSTERS[m.defId].attacks.filter((a) => !a.ranged).sort((a, b) => b.range - a.range)[0];
          if (melee) this.monsterStrike(m, c, melee, { reaction: true });
          if (!this.conscious(c)) break;
        }
        if (!this.conscious(c)) break;
      }
      c.x = q.x; c.y = q.y; walked.push(q);
      s.combat.movementLeft -= tileCost(this.tile(q.x, q.y));
    }
    if (walked.length) this.moves.push({ id: c.id, path: walked });
    // Cut down mid-stride: the hero's turn is over.
    if (!this.conscious(c)) { this.log('system', this.t`${c.name} goes down before getting away.`); this.nextTurn(); }
  }

  /** Enemies that would strike at the hero walking this path. The browser shows the same warning. */
  provokers(c: Character, path: Pt[]): Monster[] {
    if (this.s.combat?.disengaged) return [];
    const out: Monster[] = [];
    let from: Pt = c;
    for (const q of path) {
      for (const m of this.monstersLeftBy(c, from, q)) if (!out.includes(m)) out.push(m);
      from = q;
    }
    return out;
  }

  /** Disengage: no opportunity attacks for the rest of the turn. A rogue's Cunning Action makes it a bonus action. */
  disengage(playerId: string, characterId: string) {
    const c = this.actor(playerId, characterId);
    const combat = this.s.combat;
    if (this.s.phase !== 'combat' || !combat) throw new GameError(this.t`Disengage is only useful in combat`);
    if (combat.disengaged) throw new GameError(this.t`${c.name} has already disengaged this turn`);
    const bonus = this.feat(c, 'cunning_action') && !combat.bonusUsed;
    this.spendAction(bonus);
    combat.disengaged = true;
    this.log('roll', bonus ? this.t`${c.name} disengages with a cunning step (bonus action).` : this.t`${c.name} takes the Disengage action.`);
  }

  /** Light or put out a torch or lantern. Lighting one in a fight takes the bonus action; dropping the flame is free. */
  setLight(playerId: string, characterId: string, on: boolean) {
    const c = this.actor(playerId, characterId);
    if (!on) {
      if (!c.light) return;
      c.light = null;
      this.log('roll', this.t`${c.name} puts out the light.`);
      return;
    }
    if (c.light) return;
    const kind = this.lightItemOf(c);
    if (!kind) throw new GameError(this.t`${c.name} carries no torch or lantern`);
    if (this.s.phase === 'combat') this.spendAction(true);
    c.light = kind;
    this.log('roll', kind === 'lantern' ? this.t`${c.name} unhoods a lantern.` : this.t`${c.name} lights a torch.`);
  }

  /** What the hero does when an enemy leaves their reach. Any turn, any time. */
  setOpportunity(playerId: string, characterId: string, mode: unknown) {
    const c = this.char(characterId);
    if (!this.mayControl(playerId, c)) throw new GameError(this.t`That hero belongs to another player`);
    if (!OPPORTUNITY_MODES.includes(mode as OpportunityMode)) throw new GameError(this.t`Unknown choice`);
    c.opportunity = mode as OpportunityMode;
  }

  // ---------------------------------------------------------------- attacks

  private hostileAdjacentToChar(c: Character) {
    return this.s.monsters.some((m) => m.alive && this.mdist(m, c) <= 1);
  }

  private damageMonster(m: Monster, amount: number, type: string, pierce = false): { dealt: number; note: string } {
    const def = MONSTERS[m.defId];
    let dealt = amount;
    let note = '';
    if (def.immune?.includes(type)) { dealt = 0; note = ` ${this.t`(immune)`}`; }
    else if (def.vulnerable?.includes(type)) { dealt = amount * 2; note = ` ${this.t`(vulnerable, doubled)`}`; }
    else if (def.resist?.includes(type) && !(pierce && ['bludgeoning', 'piercing', 'slashing'].includes(type))) { dealt = Math.floor(amount / 2); note = ` ${this.t`(resistant, halved)`}`; }
    if (dealt > 0 && def.flags?.regeneration?.stop?.includes(type)) m.noRegen = true;
    let hp = Math.max(0, m.hp - dealt);
    // Undead Fortitude: a Constitution save against 5 + the damage keeps it standing at 1, unless the damage was radiant.
    if (hp === 0 && m.hp > 0 && def.flags?.undeadFortitude && type !== 'radiant') {
      const r = d20(this.rng).value;
      if (r + (def.saves.con ?? 0) >= 5 + dealt) { hp = 1; note += ` ${this.t`${m.name} refuses to fall (Undead Fortitude).`}`; }
    }
    m.hp = hp;
    if (dealt > 0 && m.hp > 0) this.liftMonster(m, (e) => !!e.onHurt);
    if (m.hp === 0 && m.alive) {
      m.alive = false; m.conditions = []; m.effects = []; note += ` ${this.t`${m.name} is slain!`}`; this.fallen.push(m.id);
      // The kill goes to the hero whose turn it is: on their turn the blow is nearly always theirs.
      const turn = this.s.combat?.order[this.s.combat.turnIndex];
      if (turn && this.s.characters.some((c) => c.id === turn.id)) this.tally?.(turn.id, 'kills');
    }
    return { dealt, note };
  }

  private damageChar(c: Character, amount: number): boolean {
    c.hp = Math.max(0, c.hp - amount);
    if (c.hp === 0 && c.speciesId === 'orc' && !c.spent.includes('relentless_endurance')) {
      c.spent.push('relentless_endurance');
      c.hp = 1;
      this.log('roll', this.t`${c.name} refuses to fall and stays at 1 HP (Relentless Endurance).`);
    }
    if (c.hp === 0 && c.conditions.includes('raging') && this.feat(c, 'relentless_rage')) {
      const tries = c.uses?._relentless ?? 0;
      (c.uses ??= {})._relentless = tries + 1;
      c.hp = 1; // on their feet for the save
      if (this.heroSave(c, 'con', 10 + 5 * tries, this.n('Relentless Rage'))) {
        c.hp = Math.min(c.maxHp, 2 * c.level);
        this.log('roll', this.t`${c.name} rages on with ${c.hp} HP.`);
      } else c.hp = 0;
    }
    const ward = c.hp === 0 ? (c.buffs ?? []).find((b) => SPELL_BUFFS[b.id]?.deathWard) : undefined;
    if (ward) {
      c.hp = 1;
      this.removeBuffs(c, (b) => b === ward, true);
      this.log('roll', this.t`Death Ward holds ${c.name} at 1 HP.`);
    }
    if (c.hp === 0 && !c.conditions.includes('unconscious')) {
      c.conditions = c.conditions.filter((x) => !['dodging', 'raging', 'reckless', 'invisible'].includes(x));
      this.dropConcentration(c, this.t`knocked out`);
      if (c.form) { c.form = null; this.refresh(c); }
      c.conditions.push('unconscious');
      c.deathSaves = { successes: 0, failures: 0 };
      return true;
    }
    return false;
  }

  private healChar(c: Character, amount: number): number {
    if (c.dead) return 0;
    if ((c.effects ?? []).some((e) => e.noHealing)) return 0;
    const before = c.hp;
    c.hp = Math.min(c.maxHp, c.hp + amount);
    if (c.hp > 0) {
      c.conditions = c.conditions.filter((x) => x !== 'unconscious' && x !== 'stable');
      c.deathSaves = { successes: 0, failures: 0 };
      // Someone may have stepped over the body; get back up on a free tile.
      if (before <= 0 && (this.charAt(c.x, c.y, c.id) || this.monsterAt(c.x, c.y))) {
        const free = this.bfs(c, (p) => !this.charAt(p.x, p.y, c.id) && !this.monsterAt(p.x, p.y), () => true);
        const end = free?.[free.length - 1];
        if (end) { c.x = end.x; c.y = end.y; }
      }
    }
    return c.hp - before;
  }

  private weaponOf(c: Character): ItemDef | null {
    const it = c.equipment.mainHand;
    const def = it ? this.def(it.defId) : null;
    return def?.weapon ? def : null;
  }

  private targetMonster(c: Character, targetId: string, rangeFeet: number): Monster {
    const m = this.monster(targetId);
    if (!m.alive) throw new GameError(this.t`No such target`);
    if (this.mHas(m, 'banished')) throw new GameError(this.t`${m.name} is gone from the fight for now`);
    if (this.mdist(m, c) * 5 > Math.max(5, rangeFeet)) throw new GameError(this.t`${m.name} is out of range`);
    if (!this.los(c, this.mpoint(m, c))) throw new GameError(this.t`${c.name} cannot see ${m.name}`);
    if ((c.effects ?? []).some((e) => e.condition === 'charmed' && e.sourceId === m.id)) throw new GameError(this.t`${c.name} is charmed by ${m.name} and cannot bring themself to harm it`);
    return m;
  }

  attack(playerId: string, characterId: string, targetId: string) {
    const c = this.actor(playerId, characterId);
    if (this.s.phase !== 'combat') throw new GameError(this.t`There is nothing to fight right now`);
    if (c.form) {
      this.canAct();
      const prey = this.targetMonster(c, targetId, 5);
      this.spendAction();
      this.beastAttack(c, prey);
      this.checkCombatOver();
      return;
    }
    this.canAttack();
    const ranged = this.weaponOf(c)?.weapon?.ranged;
    const m = this.targetMonster(c, targetId, ranged ? ranged.long : 5);
    this.spendAttack(c);
    this.strike(c, m);
    this.checkCombatOver();
  }

  /** The light weapon in the off hand, if there is one. */
  private offWeaponOf(c: Character): ItemDef | null {
    const it = c.equipment.offHand;
    const def = it ? this.def(it.defId) : null;
    return def?.weapon ? def : null;
  }

  /**
   * Two-weapon fighting: after attacking with a light weapon in the main hand, a bonus action
   * attacks with the light weapon in the other. The off-hand hit adds no ability modifier to damage
   * (unless it is negative).
   */
  offhandAttack(playerId: string, characterId: string, targetId: string) {
    const c = this.actor(playerId, characterId);
    if (this.s.phase !== 'combat' || !this.s.combat) throw new GameError(this.t`There is nothing to fight right now`);
    if (c.form) throw new GameError(this.t`${c.name} cannot wield weapons in this shape`);
    if (!isLightWeapon(this.weaponOf(c)) || !isLightWeapon(this.offWeaponOf(c))) throw new GameError(this.t`Fighting with two weapons needs a light melee weapon in each hand`);
    if (!this.s.combat.attacked) throw new GameError(this.t`Attack with your main hand first. The off-hand attack follows it`);
    this.canAct(true);
    const m = this.targetMonster(c, targetId, 5);
    this.spendAction(true);
    this.strike(c, m, { offhand: true });
    this.checkCombatOver();
  }

  /**
   * One weapon attack, rolled and resolved. An opportunity attack is always a melee attack,
   * so a hero holding a bow strikes with a fist instead. Returns whether it hit.
   */
  private strike(c: Character, m: Monster, opts: { reaction?: boolean; unarmed?: boolean; flurry?: boolean; beast?: BeastForm['attacks'][number]; again?: boolean; cast?: boolean; offhand?: boolean } = {}): boolean {
    const held = opts.unarmed || opts.beast ? null : opts.offhand ? this.offWeaponOf(c) : this.weaponOf(c);
    const w = opts.reaction && held?.weapon?.ranged ? null : held;
    const wp = w?.weapon;
    const ranged = wp?.ranged;
    const beast = opts.beast;
    const dist = this.mdist(m, c) * 5;
    // True Strike swings with the spellcasting ability; Shillelagh lends it to melee weapons.
    const castScore = c.abilities[castingAbility(c)];
    const lend = opts.cast || (!ranged && !beast && this.buffOn(c, 'shillelagh'));
    const atk = weaponAttack({ ...c, form: null, abilities: lend ? { ...c.abilities, str: Math.max(c.abilities.str, castScore), ...(opts.cast ? { dex: Math.max(c.abilities.dex, castScore) } : {}) } : c.abilities }, w);
    const magicWeapon = beast ? 0 : Math.max(0, ...(c.buffs ?? []).map((b) => SPELL_BUFFS[b.id]?.weapon?.[b.level] ?? 0));
    if (!opts.reaction) this.breakInvisible(c);
    const mod = atk.mod;
    const usesStr = !beast && !ranged && mod === this.mod(c, 'str');
    const fist = !wp && !beast;
    const monkish = c.classId === 'monk' && !beast && (fist || (!!w && isMonkWeapon(w)));
    const raging = c.conditions.includes('raging');
    const reckless = c.conditions.includes('reckless') && usesStr;
    const brutal = reckless && this.primed(`${c.id}:brutal`);
    const marked = c.mark?.monsterId === m.id ? c.mark.spell : null;
    const bonus = (beast ? beast.toHit : atk.bonus) + (c.conditions.includes('sacred weapon') && !beast ? Math.max(1, this.mod(c, 'cha')) : 0) + magicWeapon + this.blessDie(c);
    const guided = m.conditions.includes('guided');
    const studied = !!m.studiedBy?.includes(c.id);
    const aimed = this.primed(`${c.id}:aim`);
    const unseen = this.primed(`${c.id}:unseen`);
    const seen = this.sight(c.name, m.name, this.heroSees(c, m), this.monsterSees(m, c));
    const prone = this.mHas(m, 'prone');
    const adv = guided || seen.adv || studied || aimed || unseen || (reckless && !brutal) || this.mExposed(m) || this.buffOn(c, 'attackAdv') || (prone && dist <= 5) || c.conditions.includes('invisible')
      || (marked === 'hunters_mark' && this.feat(c, 'precise_hunter'));
    const dis = seen.dis || this.hampered(c) || (prone && dist > 5) || (!!ranged && (dist > ranged.normal || this.hostileAdjacentToChar(c)));
    const mode = brutal ? (dis ? 'disadvantage' : 'normal') : rollMode(adv, dis);
    // Why the roll went as it did, for the roll card.
    const why: OddsWhy = [];
    if (guided) why.push({ code: 'guided' });
    if (seen.adv) why.push({ code: 'unseen' });
    if (studied) why.push({ code: 'studied' });
    if (aimed || unseen) why.push({ code: 'aimed' });
    if (reckless && !brutal) why.push({ code: 'reckless' });
    if (this.mExposed(m)) why.push({ code: 'exposed' });
    if (this.buffOn(c, 'attackAdv')) why.push({ code: 'buff_adv' });
    if (prone && dist <= 5) why.push({ code: 'prone_near' });
    if (c.conditions.includes('invisible')) why.push({ code: 'invisible' });
    if (seen.dis) why.push({ code: 'cant_see' });
    if (this.hampered(c)) why.push({ code: 'hampered' });
    if (prone && dist > 5) why.push({ code: 'prone_far' });
    if (ranged && dist > ranged.normal) why.push({ code: 'long_range' });
    if (ranged && this.hostileAdjacentToChar(c)) why.push({ code: 'foe_adjacent' });
    if (this.blessSides(c).length) why.push({ code: 'bless' });
    if (this.mHas(m, 'slowed')) why.push({ code: 'slowed', n: 2 });
    if (guided) m.conditions = m.conditions.filter((x) => x !== 'guided');
    if (studied) m.studiedBy = m.studiedBy!.filter((id) => id !== c.id);
    if (aimed) this.unprime(`${c.id}:aim`);
    const critAt = critFrom(c);
    const cover = ranged ? this.coverBonus(c, this.mpoint(m, c)) : 0;
    const ac = this.mAc(m) + cover;
    if (cover) why.push({ code: 'cover', n: cover });
    let r = this.heroD20(c, mode);
    let total = r.value + bonus;
    let forced = false;
    let luck = '';
    const hits = () => forced || (r.value !== 1 && (r.value >= critAt || total >= ac));
    if (!hits() && !opts.reaction && this.feat(c, 'heroic_warrior') && this.once(`${c.id}:heroic`)) {
      const first = r.value;
      r = this.heroD20(c, mode);
      total = r.value + bonus;
      luck += ` ${this.t`Heroic Warrior: the ${first} is rolled again.`}`;
    }
    if (!hits() && c.inspired) {
      const die = rollDie(c.inspired, this.rng);
      c.inspired = undefined;
      total += die;
      if (total >= ac) forced = true;
      luck += ` ${this.t`Bardic Inspiration adds ${die}.`}`;
    }
    if (!hits() && c.feats.includes('boon_combat_prowess') && this.once(`${c.id}:prowess`)) { forced = true; luck += ` ${this.t`Peerless Aim turns the miss into a hit.`}`; }
    if (!hits() && this.feat(c, 'stroke_of_luck') && this.left(c, 'stroke_of_luck') > 0) { this.spendUse(c, 'stroke_of_luck'); forced = true; luck += ` ${this.t`Stroke of Luck turns the miss into a hit.`}`; }
    // A hit from next to a paralysed or sleeping creature is a critical hit.
    const crit = r.value >= critAt || (dist <= 5 && (this.mHas(m, 'paralyzed') || this.mHas(m, 'asleep')));
    if (crit && hits()) this.tally?.(c.id, 'crits');
    const label = beast ? this.n(beast.name) : w ? this.n(w.name) : this.t`an unarmed strike`;
    const head = (opts.reaction ? this.t`Opportunity attack! ` : '') + this.t`${c.name} attacks ${m.name} with ${label}: ${this.d20Text(r, mode)}${signed(bonus)} = ${total} vs AC ${ac}.` + (cover ? ` ${this.t`${m.name} has half cover.`}` : '') + seen.note + luck;
    const info = (outcome: RollInfo['outcome'], damage?: RollInfo['damage']): RollInfo =>
      ({ actor: c.name, label: (opts.reaction ? `${this.t`Opportunity attack`}: ` : '') + (beast ? this.n(beast.name) : w ? this.n(w.name) : this.t`Unarmed strike`), die: r.value, rolls: r.rolls, mode, modifier: bonus, total, target: { kind: 'AC', value: ac, name: m.name }, outcome, damage, ...(why.length ? { why } : {}) });
    const horde = () => {
      if (opts.reaction || opts.again || beast || !wp || !this.opted(c, 'prey_horde') || this.s.phase !== 'combat') return;
      const reach = ranged ? ranged.long : 5;
      const other = this.s.monsters.find((o) => o.alive && o.id !== m.id && cheb(this.mpoint(o, m), this.mpoint(m, o)) <= 1 && this.mdist(o, c) * 5 <= reach && this.los(c, this.mpoint(o, c)));
      if (!other || !this.once(`${c.id}:horde`)) return;
      this.log('roll', this.t`Horde Breaker: ${c.name} follows through against ${other.name}.`);
      this.strike(c, other, { again: true });
    };
    if (brutal) this.unprime(`${c.id}:brutal`);
    if (!hits()) {
      if (this.feat(c, 'studied_attacks')) (m.studiedBy ??= []).push(c.id);
      this.log('roll', this.t`${head} Miss.`, { roll: info('miss') });
      horde();
      return false;
    }
    // Parry: a reaction that lifts its armour class against one melee hit a round.
    const parry = MONSTERS[m.defId].flags?.parry;
    if (parry && !ranged && !crit && !forced && total < ac + parry && this.canReact(m.id) && !this.mHelpless(m)) {
      this.useReaction(m.id);
      this.log('roll', this.t`${head} ${m.name} parries the blow.`, { roll: info('miss') });
      return false;
    }
    const mdef = MONSTERS[m.defId];
    const dice = (expr: string) => roll(expr, this.rng, crit).total;
    let type = beast ? beast.type : wp?.damageType ?? 'bludgeoning';
    if (fist && this.feat(c, 'empowered_strikes') && (mdef.resist?.includes(type) || mdef.immune?.includes(type))) type = 'force';
    let dmg: number;
    const notes: string[] = [];
    if (beast) dmg = this.rollDmg(beast.damage, crit);
    else if (!atk.dice) dmg = 1 + this.mod(c, 'str');
    else {
      // Great Weapon Fighting lifts low dice; Savage Attacker rolls the weapon's dice twice, once per turn.
      const greatWeapon = c.feats.includes('style_great_weapon') && !!wp?.twoHanded && !ranged;
      const weaponDice = () => {
        const d = roll(atk.dice, this.rng, crit);
        return d.rolls.reduce((sum, x) => sum + (greatWeapon ? Math.max(3, x) : x), 0) + d.modifier;
      };
      let rolled = weaponDice();
      const combat = this.s.combat;
      if (c.feats.includes('savage_attacker') && combat && !combat.savageUsed) {
        combat.savageUsed = true;
        rolled = Math.max(rolled, weaponDice());
      }
      // Fighting with two weapons: the off hand adds no ability modifier, and Dueling needs a free hand.
      const twoWeapons = !!this.offWeaponOf(c);
      dmg = rolled + (opts.offhand ? Math.min(0, mod) : mod) + (wp?.bonus ?? 0) + (twoWeapons ? 0 : atk.flat) + magicWeapon;
    }
    if (raging && usesStr) dmg += rageDamage(c);
    if (raging && reckless && this.feat(c, 'frenzy') && this.once(`${c.id}:frenzy`)) { dmg += dice(`${rageDamage(c)}d6`); notes.push(this.n('Frenzy')); }
    if (brutal) { dmg += dice(featureRank(c, 'improved_brutal_strike') >= 2 ? '2d10' : '1d10'); notes.push(this.n('Brutal Strike')); }
    // Sneak Attack, once per turn, with what a Cunning Strike gives up of it.
    const flanked = this.s.characters.some((a) => a.id !== c.id && this.conscious(a) && this.mdist(m, a) <= 1);
    let cunning: 'trip' | 'poison' | 'daze' | null = null;
    if (this.feat(c, 'sneak_attack') && wp && (wp.finesse || ranged) && (flanked || mode === 'advantage') && this.once(`${c.id}:sneak`)) {
      let n = sneakDice(c);
      for (const [key, cost] of [['daze', 2], ['trip', 1], ['poison', 1]] as const) {
        if (!this.primed(`${c.id}:${key}`)) continue;
        this.unprime(`${c.id}:${key}`);
        if (!cunning && n > cost) { cunning = key; n -= cost; }
      }
      dmg += dice(`${n}d6`);
      notes.push(this.n('Sneak Attack'));
    }
    if (this.opted(c, 'prey_colossus') && wp && m.hp < m.maxHp && this.once(`${c.id}:colossus`)) { dmg += dice('1d8'); notes.push(this.n('Colossus Slayer')); }
    if (crit && r.value === 20 && c.feats.includes('boon_irresistible_offense') && wp) dmg += Math.max(c.abilities.str, c.abilities.dex);
    const parts = [{ amount: Math.max(1, dmg), type }];
    const add = (amount: number, t: string, name: string) => { parts.push({ amount, type: t }); notes.push(this.n(name)); };
    if (this.feat(c, 'blessed_strikes') && !fist && this.once(`${c.id}:blessed`)) add(dice(this.feat(c, 'improved_blessed_strikes') ? '2d8' : '1d8'), 'radiant', 'Blessed Strikes');
    if (this.feat(c, 'radiant_strikes') && !ranged && !beast) add(dice('1d8'), 'radiant', 'Radiant Strikes');
    if (this.opted(c, 'fury_strike') && this.feat(c, 'elemental_fury') && this.once(`${c.id}:primal`)) add(dice(this.feat(c, 'improved_elemental_fury') ? '2d8' : '1d8'), 'cold', 'Primal Strike');
    let markDmg = 0;
    if (marked === 'hunters_mark' && (wp || beast)) { markDmg = dice(this.feat(c, 'foe_slayer') ? '1d10' : '1d6'); add(markDmg, 'force', "Hunter's Mark"); }
    if (marked === 'hex') add(dice('1d6'), 'necrotic', 'Hex');
    // Flame Tongue, Dagger of Venom; Dragon Slayer and Sun Blade against their foes.
    if (wp?.extra && w) add(dice(wp.extra.dice), wp.extra.type, w.name);
    if (wp?.vs && w && (mdef.type === wp.vs.type || (wp.vs.type === 'fiend' && mdef.type === 'undead'))) add(dice(wp.vs.dice), wp.vs.type === 'undead' || wp.vs.type === 'fiend' ? 'radiant' : type, w.name);
    for (const b of c.buffs ?? []) {
      const hit = SPELL_BUFFS[b.id]?.hit;
      if (!hit || beast) continue;
      const extra = hit.up && b.level > (ABILITIES[b.spell]?.spellLevel ?? b.level) ? `${Number(hit.dice.split('d')[0]) + Number(hit.up.split('d')[0]) * (b.level - (ABILITIES[b.spell]?.spellLevel ?? b.level))}d${hit.dice.split('d')[1]}` : hit.dice;
      add(dice(extra), hit.type === 'weapon' ? type : hit.type, ABILITIES[b.spell]?.name ?? b.spell);
    }
    if (opts.cast && c.level >= 5) add(dice(`${cantripScale(c.level) - 1}d6`), 'radiant', 'True Strike');
    let drink = 0;
    if (this.opted(c, 'inv_lifedrinker') && wp && !ranged && this.once(`${c.id}:lifedrinker`)) { drink = dice('1d6'); add(drink, 'necrotic', 'Lifedrinker'); }
    const res = this.hitParts(m, parts, c.feats.includes('boon_irresistible_offense') && !!wp);
    const extra = notes.length ? ` (${notes.join(', ')})` : '';
    this.log('roll', this.t`${head} ${crit ? this.t`Critical hit` : this.t`Hit`} for ${res.text}${extra}.${res.note}`, { roll: info(crit ? 'crit' : 'hit', { amount: res.total, type }) });
    const combat = this.s.combat;
    if (combat && !ranged && !opts.reaction) combat.lastHit = m.id;
    if (drink) this.healChar(c, drink);
    if (!m.alive && this.feat(c, 'dark_ones_blessing')) this.giveTemp(c, Math.max(1, this.mod(c, 'cha') + c.level));
    // What the hit sets off besides damage.
    if (m.alive && brutal) this.pushMonster(m, c, 15);
    if (m.alive && beast?.prone && this.tilesOf(m) <= 2) this.afflict(m, 'prone');
    if (m.alive && cunning === 'trip' && !this.monsterSave(m, 'dex', this.dcOf(c, 'dex'), this.n('Cunning Strike'))) this.afflict(m, 'prone');
    if (m.alive && cunning === 'poison' && !this.monsterSave(m, 'con', this.dcOf(c, 'dex'), this.n('Cunning Strike'))) this.afflict(m, 'poisoned', { turns: 10, save: { ability: 'con', dc: this.dcOf(c, 'dex') } });
    if (m.alive && cunning === 'daze' && !this.monsterSave(m, 'con', this.dcOf(c, 'dex'), this.n('Devious Strikes'))) this.afflict(m, 'incapacitated', { turns: 1 });
    if (m.alive && opts.flurry && this.feat(c, 'open_hand_technique') && !this.monsterSave(m, 'dex', this.dcOf(c, 'wis'), this.n('Open Hand Technique'))) this.afflict(m, 'prone');
    if (monkish && this.primed(`${c.id}:stun`)) {
      this.unprime(`${c.id}:stun`);
      if (m.alive) {
        if (this.monsterSave(m, 'con', this.dcOf(c, 'wis'), this.n('Stunning Strike'))) (m.studiedBy ??= []).push(c.id);
        else this.afflict(m, 'stunned', { untilHero: c.id });
      }
    }
    if (fist && this.primed(`${c.id}:palm`)) {
      this.unprime(`${c.id}:palm`);
      if (m.alive) {
        const ok = this.monsterSave(m, 'con', this.dcOf(c, 'wis'), this.n('Quivering Palm'));
        const full = roll('10d12', this.rng).total;
        const hit = this.damageMonster(m, ok ? Math.floor(full / 2) : full, 'force');
        this.log('roll', this.t`The vibrations tear through ${m.name} for ${hit.dealt} ${this.n('force damage')}.${hit.note}`);
      }
    }
    if (this.primed(`${c.id}:hurl`)) {
      this.unprime(`${c.id}:hurl`);
      if (m.alive && !this.monsterSave(m, 'cha', this.dcOf(c, 'cha'), this.n('Hurl Through Hell'))) {
        const hit = this.damageMonster(m, roll('8d10', this.rng).total, 'psychic');
        this.log('roll', this.t`${m.name} is hurled through the lower planes and returns with ${hit.dealt} ${this.n('psychic damage')}.${hit.note}`);
        this.afflict(m, 'incapacitated', { turns: 1 });
      }
    }
    if (markDmg && this.feat(c, 'superior_hunters_prey') && this.once(`${c.id}:prey2`)) {
      const other = this.s.monsters.filter((o) => o.alive && o.id !== m.id && cheb(this.mpoint(o, m), this.mpoint(m, o)) <= 6).sort((a, b) => this.mdist(a, c) - this.mdist(b, c))[0];
      if (other) {
        const hit = this.damageMonster(other, markDmg, 'force');
        this.log('roll', this.t`The mark's force leaps to ${other.name} for ${hit.dealt} ${this.n('force damage')}.${hit.note}`);
      }
    }
    horde();
    return true;
  }

  /** A druid in beast form makes every attack of the beast with one Attack action. */
  private beastAttack(c: Character, m: Monster) {
    const form = BEAST_FORMS[c.form!];
    for (const a of form.attacks) {
      const target = m.alive ? m : this.s.monsters.find((o) => o.alive && this.mdist(o, c) <= 1);
      if (!target || this.s.phase !== 'combat') break;
      this.strike(c, target, { beast: a });
    }
  }

  /** Spells with a saving throw, and Magic Missile, need a target the caster can see. */
  private mustSee(c: Character, m: Monster) {
    if (c.conditions.includes('blinded')) throw new GameError(this.t`${c.name} is blinded and cannot aim that at ${m.name}`);
    if (!this.heroSees(c, m)) throw new GameError(this.t`${c.name} cannot see ${m.name} in the dark. Bring light, or strike at it with an attack.`);
  }

  private castingMod(c: Character) {
    return abilityMod(c.abilities[castingAbility(c)]);
  }

  /**
   * Use an action, a class feature or a spell. `level` is the spell level to cast at, for
   * spells that grow stronger with a higher slot; it is clamped to what the hero can reach.
   */
  useAbility(playerId: string, characterId: string, abilityId: string, targetId?: string, level?: number, via?: ItemInstance) {
    const c = this.actor(playerId, characterId);
    const ab = ABILITIES[abilityId];
    if (!ab || (!via && !c.abilityIds.includes(abilityId))) throw new GameError(this.t`${c.name} doesn't know that`);
    // Spells of wands and staffs: no mana, the item's own level, its save DC at least 15.
    if (via) {
      this.viaItem = via;
      try { this.castAbility(c, ab, targetId, level); } finally { this.viaItem = null; }
      return;
    }
    this.castAbility(c, ab, targetId, level);
  }

  /** The item a spell is cast from right now, if any. */
  private viaItem: ItemInstance | null = null;

  private castAbility(c: Character, ab: AbilityDef, targetId?: string, level?: number) {
    const via = this.viaItem;
    const inCombat = this.s.phase === 'combat';
    const isSpell = ab.spellLevel !== undefined;
    if (isSpell && c.conditions.includes('raging')) throw new GameError(this.t`${c.name} cannot cast spells while raging`);
    if (isSpell && c.form && !this.feat(c, 'beast_spells')) throw new GameError(this.t`${c.name} cannot cast spells in beast form`);
    if (ab.target === 'enemy' && !inCombat) throw new GameError(this.t`There is nothing to fight right now`);
    if (ab.kind === 'ward' && c.conditions.includes('mage armor')) throw new GameError(this.t`${this.n(ab.name)} is already active`);
    if (['dodge', 'surge', 'dash', 'smite', 'weapon', 'step'].includes(ab.kind) && !inCombat) throw new GameError(this.t`${this.n(ab.name)} is only useful in combat`);
    if (ab.kind === 'react') throw new GameError(this.t`${this.n(ab.name)} casts itself when its moment comes`);
    if (ab.slow && inCombat) throw new GameError(this.t`${this.n(ab.name)} takes minutes to cast, too long in a fight`);
    // A spell kept up from an earlier turn (Spiritual Weapon, Call Lightning) is used again for free.
    const sustained = !!ab.sustain && inCombat && c.sustain?.spell === ab.id;
    const base = ab.spellLevel ?? 0;
    const lvl = sustained ? c.sustain!.level : via ? Math.max(base, level ?? base) : isSpell ? castLevel(ab, level, Math.max(base, maxSpellLevelFor(c.classId, c.level))) : 0;
    const up = Math.max(0, lvl - base);
    // Quickened Spell: the next spell takes the bonus action instead of the action.
    const quick = isSpell && !ab.bonusAction && !sustained && this.primed(`${c.id}:quickened`);
    const asBonus = sustained ? ab.sustain === 'bonus' : !!ab.bonusAction || quick;
    if (ab.kind !== 'surge' && !ab.free) this.canAct(asBonus);
    if (ab.oncePerRest && c.spent.includes(ab.id)) throw new GameError(this.t`${this.n(ab.name)} is spent until you rest`);
    let pay = this.resPlan(c, ab);
    let cost = up > 0 ? SLOT_COST[lvl - 1] : ab.cost;
    // Hunter's Mark and Divine Smite have free castings; after those they cost mana like any 1st-level spell.
    if (ab.id === 'hunters_mark') { if (this.left(c, 'favored_enemy') > 0) pay = () => this.spendUse(c, 'favored_enemy'); else cost = 2; }
    if (ab.id === 'divine_smite') { if (this.left(c, 'free_smite') > 0) pay = () => this.spendUse(c, 'free_smite'); else cost = 2; }
    if (cost > 0 && !up && ((ab.spellLevel === 1 && this.feat(c, 'spell_mastery')) || ((ab.spellLevel === 2 || ab.spellLevel === 3) && this.feat(c, 'signature_spells')))) cost--;
    if (sustained || via || (ab.ritual && !inCombat)) cost = 0;
    if (via) pay = () => { via.used = (via.used ?? 0) + 1; };
    if (c.mana < cost) throw new GameError(this.t`Not enough mana`);
    const cmod = this.castingMod(c);
    // Cantrips grow with the caster: twice the dice at level 5, three times at 11, four times at 17. Eldritch Blast fires more beams instead.
    const scale = ab.spellLevel === 0 || ab.id === 'breath_weapon' ? cantripScale(c.level) : 1;
    const beams = ab.id === 'eldritch_blast' ? scale : (ab.rays ?? 1) + (ab.raysUp ?? 0) * up;
    const dice = this.spellDice(c, ab, lvl);
    const healBonus = isSpell && ab.spellLevel! > 0 && this.feat(c, 'disciple_of_life') ? 2 + lvl : 0;
    // An evoker's damaging cantrips still do half damage when they miss or are saved against.
    const grazes = ab.spellLevel === 0 && this.feat(c, 'potent_cantrip');
    const sorcery = isSpell && c.conditions.includes('innate sorcery');
    let range = ab.range;
    if (isSpell && this.primed(`${c.id}:distant`)) range = range <= 5 ? 30 : range * 2;
    if (ab.id === 'eldritch_blast' && this.opted(c, 'inv_spear')) range = Math.max(range, 300);
    if (ab.spellLevel === 0 && range > 5 && this.opted(c, 'fury_spellcasting') && this.feat(c, 'improved_elemental_fury')) range += 300;
    let spent = false;
    const spend = () => {
      if (spent) return;
      spent = true;
      if (!ab.free) this.spendAction(asBonus);
      if (cost > 0 && isSpell && lvl <= 4 && c.feats.includes('boon_spell_recall') && this.rng() < 0.25) this.log('roll', this.t`Spell Recall: ${this.n(ab.name)} costs ${c.name} no mana.`);
      else c.mana -= cost;
      pay();
      if (ab.oncePerRest) c.spent.push(ab.id);
      if (quick) this.unprime(`${c.id}:quickened`);
      if (isSpell) this.breakInvisible(c);
      if (sustained) return;
      // One concentration spell at a time: a new one ends the old.
      if (ab.concentration) { this.dropConcentration(c); c.conc = { spell: ab.id, level: lvl }; }
      if (ab.sustain && inCombat) c.sustain = { spell: ab.id, level: lvl };
      if (via) this.log('roll', this.t`${c.name} draws on ${this.n(this.def(via.defId).name)}.`);
      else if (up) this.log('roll', this.t`${c.name} casts ${this.n(ab.name)} at level ${lvl}.`);
    };
    const blessing = () => { if (this.feat(c, 'dark_ones_blessing')) this.giveTemp(c, Math.max(1, this.mod(c, 'cha') + c.level)); };

    switch (ab.kind) {
      case 'surge': {
        const combat = this.s.combat!;
        if (!combat.actionUsed) throw new GameError(this.t`${c.name} still has an action this turn`);
        pay();
        if (ab.oncePerRest) c.spent.push(ab.id);
        combat.actionUsed = false;
        combat.attacksLeft = 0;
        this.log('roll', this.t`${c.name} uses ${this.n(ab.name)} and can act again.`);
        break;
      }
      case 'dash': {
        spend();
        this.s.combat!.movementLeft += Math.floor(c.speed / 5);
        this.log('roll', this.t`${c.name} dashes, gaining ${c.speed} ft of movement.`);
        break;
      }
      case 'step': {
        spend();
        this.s.combat!.movementLeft += Math.floor((ab.step ?? 30) / 5);
        this.s.combat!.disengaged = true;
        this.log('roll', this.t`${c.name} casts ${this.n(ab.name)} and can move ${ab.step ?? 30} ft more this turn without drawing opportunity attacks.`);
        break;
      }
      case 'ward': {
        spend();
        c.conditions.push('mage armor');
        c.ac = this.computeAc(c);
        this.log('roll', this.t`${c.name} casts ${this.n(ab.name)}. Armor class is now ${c.ac}.`);
        break;
      }
      case 'dodge': {
        spend();
        c.conditions.push('dodging');
        this.log('roll', this.t`${c.name} takes the Dodge action.`);
        break;
      }
      case 'self_heal': {
        if (c.hp >= c.maxHp) throw new GameError(this.t`${c.name} is already at full health`);
        spend();
        const healed = this.healChar(c, roll(ab.dice!, this.rng).total + c.level);
        this.log('roll', this.t`${c.name} uses ${this.n(ab.name)} and regains ${healed} HP.`);
        // Tactical Shift: a breather is also a chance to reposition.
        if (ab.id === 'second_wind' && this.feat(c, 'tactical_shift') && this.s.combat) {
          this.s.combat.movementLeft += Math.floor(c.speed / 10);
          this.s.combat.disengaged = true;
        }
        break;
      }
      case 'heal': {
        const first = this.char(targetId ?? c.id);
        const reach = Math.max(5, ab.range);
        const many = (ab.count ?? 1) > 1;
        let targets: Character[];
        if (many) {
          // Mass healing: the chosen ally first, then whoever is hurt worst, within reach.
          targets = this.party().filter((t) => !t.dead && t.hp < t.maxHp && (!inCombat || cheb(c, t) * 5 <= reach))
            .sort((a, b) => Number(b.id === first.id) - Number(a.id === first.id) || a.hp / a.maxHp - b.hp / b.maxHp).slice(0, ab.count);
          if (!targets.length) throw new GameError(this.t`Nobody nearby needs healing`);
        } else {
          if (first.dead) throw new GameError(this.t`${first.name} is beyond healing`);
          if (inCombat && cheb(c, first) * 5 > reach) throw new GameError(this.t`${first.name} is too far away`);
          if (first.hp >= first.maxHp) throw new GameError(this.t`${first.name} is already at full health`);
          targets = [first];
        }
        spend();
        for (const t of targets) {
          const amount = ab.flat !== undefined ? ab.flat + (ab.flatUp ?? 0) * up
            : (this.feat(c, 'supreme_healing') ? this.maxDice(dice!) : roll(dice!, this.rng).total) + cmod + healBonus;
          const healed = this.healChar(t, amount);
          if (t.id !== c.id && isSpell && this.feat(c, 'blessed_healer') && c.hp < c.maxHp) this.healChar(c, 2 + lvl);
          this.log('roll', (t.id === c.id ? this.t`${c.name} casts ${this.n(ab.name)} on themself, restoring ${healed} HP.` : this.t`${c.name} casts ${this.n(ab.name)} on ${t.name}, restoring ${healed} HP.`));
          const cures = ab.id === 'power_word_heal' ? ['charmed', 'frightened', 'paralyzed', 'poisoned', 'stunned'] : ab.id === 'heal' || ab.id === 'mass_heal' ? ['blinded', 'deafened', 'poisoned'] : [];
          if (cures.length) this.endEffects(t, (e) => cures.includes(e.condition));
        }
        break;
      }
      case 'cure': {
        const t = this.char(targetId ?? c.id);
        if (t.dead) throw new GameError(this.t`${t.name} is beyond healing`);
        if (inCombat && cheb(c, t) * 5 > Math.max(5, range)) throw new GameError(this.t`${t.name} is too far away`);
        if (ab.cures![0] === 'dying') {
          if (t.hp > 0 || t.conditions.includes('stable')) throw new GameError(this.t`${t.name} is not dying`);
          spend();
          t.conditions.push('stable');
          t.deathSaves = { successes: 0, failures: 0 };
          this.log('roll', this.t`${c.name} casts ${this.n(ab.name)}: ${t.name} is stable.`);
          break;
        }
        const all = ab.cures![0] === 'all';
        const gone = (t.effects ?? []).filter((e) => all || ab.cures!.includes(e.condition) || (!!e.also && ab.cures!.includes(e.also)));
        if (!gone.length) throw new GameError(this.t`${t.name} has nothing that ${this.n(ab.name)} would cure`);
        spend();
        this.log('roll', this.t`${c.name} casts ${this.n(ab.name)} on ${t.name}.`);
        this.endEffects(t, (e) => gone.includes(e));
        break;
      }
      case 'revive': {
        const t = this.char(targetId ?? '');
        if (!t.dead) throw new GameError(this.t`${t.name} is not dead`);
        if (inCombat && cheb(c, t) * 5 > Math.max(5, range)) throw new GameError(this.t`${t.name} is too far away`);
        spend();
        t.dead = false;
        t.hp = ab.revive || t.maxHp;
        t.effects = [];
        t.conditions = t.conditions.filter((x) => !['unconscious', 'stable', 'dead'].includes(x));
        t.deathSaves = { successes: 0, failures: 0 };
        this.syncConditions(t);
        this.log('roll', this.t`${c.name} casts ${this.n(ab.name)}: ${t.name} draws breath again, with ${t.hp} HP.`);
        break;
      }
      case 'buff': {
        this.castBuff(c, ab, lvl, targetId, range, spend);
        break;
      }
      case 'story': {
        spend();
        const target = targetId ? this.s.characters.find((x) => x.id === targetId)?.name ?? this.s.monsters.find((x) => x.id === targetId)?.name : undefined;
        this.log('roll', target ? this.t`${c.name} casts ${this.n(ab.name)} on ${target}.` : this.t`${c.name} casts ${this.n(ab.name)}.`);
        this.beats.push({ kind: 'spell', hero: c.name, spell: ab.name, spellId: ab.id, level: lvl, ...(target ? { target } : {}) });
        break;
      }
      case 'smite': {
        const combat = this.s.combat!;
        const m = this.s.monsters.find((x) => x.id === combat.lastHit && x.alive);
        if (!m) throw new GameError(this.t`${this.n(ab.name)} follows a melee hit of yours this turn`);
        spend();
        combat.lastHit = null;
        const type = this.typeFor(ab, m);
        const res = this.damageMonster(m, this.spellDmg(c, ab, dice!), type);
        this.log('roll', this.t`${c.name} casts ${this.n(ab.name)}: ${m.name} takes ${res.dealt} ${this.n(`${type} damage`)}.${res.note}`);
        if (m.alive && ab.inflict && (!ab.saveAbility || !this.monsterSave(m, ab.saveAbility, this.spellDc(c), this.n(ab.name), { spell: true }))) this.spellInflict(c, ab, m);
        if (!m.alive) blessing();
        break;
      }
      case 'weapon': {
        this.canAttack();
        const ranged = this.weaponOf(c)?.weapon?.ranged;
        const m = this.targetMonster(c, targetId ?? '', ranged ? ranged.long : 5);
        spend();
        this.strike(c, m, { cast: true });
        if (!m.alive) blessing();
        break;
      }
      case 'attack': {
        const first = this.targetMonster(c, targetId ?? '', range);
        const bonus = cmod + c.profBonus;
        spend();
        for (let beam = 0; beam < beams; beam++) {
          const m = first.alive ? first : this.s.monsters.find((o) => o.alive && !this.mHas(o, 'banished') && this.mdist(o, c) * 5 <= range && this.los(c, this.mpoint(o, c)));
          if (!m || this.s.phase !== 'combat') break;
          const type = this.typeFor(ab, m);
          const guided = m.conditions.includes('guided');
          // Ranged spells are hard to aim with an enemy in your face; touch spells are not.
          const seen = this.sight(c.name, m.name, this.heroSees(c, m), this.monsterSees(m, c));
          const mode = rollMode(guided || seen.adv || sorcery || this.mExposed(m) || this.buffOn(c, 'attackAdv') || c.conditions.includes('invisible'), seen.dis || this.hampered(c) || (range > 5 && this.hostileAdjacentToChar(c)));
          if (guided) m.conditions = m.conditions.filter((x) => x !== 'guided');
          const cover = this.coverBonus(c, this.mpoint(m, c));
          const ac = this.mAc(m) + cover;
          const why: OddsWhy = [];
          if (guided) why.push({ code: 'guided' });
          if (seen.adv) why.push({ code: 'unseen' });
          if (sorcery || this.buffOn(c, 'attackAdv')) why.push({ code: 'buff_adv' });
          if (this.mExposed(m)) why.push({ code: 'exposed' });
          if (c.conditions.includes('invisible')) why.push({ code: 'invisible' });
          if (seen.dis) why.push({ code: 'cant_see' });
          if (this.hampered(c)) why.push({ code: 'hampered' });
          if (range > 5 && this.hostileAdjacentToChar(c)) why.push({ code: 'foe_adjacent' });
          if (cover) why.push({ code: 'cover', n: cover });
          if (this.blessSides(c).length) why.push({ code: 'bless' });
          const toHit = bonus + this.blessDie(c);
          let r = this.heroD20(c, mode);
          const missed = () => r.value === 1 || (r.value !== 20 && r.value + toHit < ac);
          let luck = '';
          if (missed() && isSpell && this.opted(c, 'meta_seeking') && this.left(c, 'sorcery') > 0) {
            this.spendUse(c, 'sorcery');
            r = this.heroD20(c, mode);
            luck = ` ${this.t`Seeking Spell: the attack is rolled again.`}`;
          }
          const total = r.value + toHit;
          const crit = r.value === 20;
          if (crit) this.tally?.(c.id, 'crits');
          const head = this.t`${c.name} casts ${this.n(ab.name)} at ${m.name}: ${this.d20Text(r, mode)}${signed(toHit)} = ${total} vs AC ${ac}.` + (cover ? ` ${this.t`${m.name} has half cover.`}` : '') + seen.note + luck;
          const info = (outcome: RollInfo['outcome'], damage?: RollInfo['damage']): RollInfo =>
            ({ actor: c.name, label: this.n(ab.name), die: r.value, rolls: r.rolls, mode, modifier: toHit, total, target: { kind: 'AC', value: ac, name: m.name }, outcome, damage, ...(why.length ? { why } : {}) });
          if (missed()) {
            if (grazes) {
              const res = this.damageMonster(m, Math.floor(this.spellDmg(c, ab, dice!) / 2), type);
              this.log('roll', this.t`${head} Miss, but the spell still grazes for ${res.dealt} ${this.n(`${type} damage`)}.${res.note}`, { roll: info('miss', { amount: res.dealt, type }) });
            } else this.log('roll', this.t`${head} Miss.`, { roll: info('miss') });
          } else {
            const parts = [{ amount: this.spellDmg(c, ab, dice!, crit), type }];
            if (c.mark?.monsterId === m.id && c.mark.spell === 'hex') parts.push({ amount: roll('1d6', this.rng, crit).total, type: 'necrotic' });
            const res = this.hitParts(m, parts);
            if (ab.id === 'guiding_bolt' && m.alive) m.conditions.push('guided');
            this.log('roll', this.t`${head} ${crit ? this.t`Critical hit` : this.t`Hit`} for ${res.text}.${res.note}`, { roll: info(crit ? 'crit' : 'hit', { amount: res.total, type }) });
            if (m.alive && ab.id === 'eldritch_blast' && this.opted(c, 'inv_repelling')) this.pushMonster(m, c, 10);
            if (m.alive && ab.inflict) this.spellInflict(c, ab, m);
            if (ab.id === 'vampiric_touch' && res.total > 1) {
              const healed = this.healChar(c, Math.floor(res.total / 2));
              if (healed) this.log('roll', this.t`${c.name} drinks in ${healed} HP.`);
            }
          }
          if (!m.alive) blessing();
        }
        break;
      }
      case 'save': {
        const first = this.targetMonster(c, targetId ?? '', ab.zone?.follow ? Math.max(range, ab.zone.radius) : range);
        this.mustSee(c, first);
        if (ab.only && !ab.only.includes(MONSTERS[first.defId].type)) throw new GameError(this.t`${this.n(ab.name)} has no hold over ${first.name}`);
        const targets = this.spellTargets(c, ab, lvl, first);
        spend();
        if (ab.zone) c.zone = { spell: ab.id, level: lvl, ...(ab.zone.follow ? { x: c.x, y: c.y } : { x: first.x, y: first.y }), radius: ab.zone.radius, ...(ab.zone.follow ? { follow: true } : {}) };
        this.spellSave(c, ab, dice, targets, first, grazes, () => blessing());
        break;
      }
      case 'auto': {
        const m = this.targetMonster(c, targetId ?? '', range);
        this.mustSee(c, m);
        const targets = ab.zone ? this.spellTargets(c, ab, lvl, m) : [m];
        spend();
        if (ab.zone) c.zone = { spell: ab.id, level: lvl, x: m.x, y: m.y, radius: ab.zone.radius };
        for (const t of targets) {
          const type = this.typeFor(ab, t);
          const res = this.damageMonster(t, this.spellDmg(c, ab, dice!), type);
          this.log('roll', this.t`${c.name} casts ${this.n(ab.name)} at ${t.name} for ${res.dealt} ${this.n(`${type} damage`)}.${res.note}`);
          if (!t.alive) blessing();
        }
        break;
      }
      case 'feature': {
        this.classAbility(c, ab, targetId, spend, range);
        break;
      }
    }
    // What was readied for "the next spell this turn" is used up by it.
    if (isSpell && ['attack', 'save', 'auto', 'heal', 'ward', 'buff', 'smite'].includes(ab.kind)) for (const k of ['overchannel', 'empowered', 'heightened', 'distant']) this.unprime(`${c.id}:${k}`);
    if (inCombat) this.checkCombatOver();
  }

  // ------------------------------------------------------------------ spells

  /** The dice a spell rolls at a slot level, with cantrips growing with the caster. */
  private spellDice(c: Character, ab: AbilityDef, lvl: number): string | undefined {
    const base = ab.spellLevel ? diceAtLevel(ab, lvl) : ab.dice;
    const scale = ab.spellLevel === 0 || ab.id === 'breath_weapon' ? cantripScale(c.level) : 1;
    return base && scale > 1 && ab.id !== 'eldritch_blast' ? base.replace(/^(\d+)/, (n) => String(Number(n) * scale)) : base;
  }

  /** The save DC of the hero's spells. */
  private spellDc(c: Character) {
    const dc = 8 + c.profBonus + this.castingMod(c) + (c.conditions.includes('innate sorcery') ? 1 : 0);
    return this.viaItem ? Math.max(15, dc) : dc;
  }

  /** The damage type against this monster: for "best", the element it resists least. */
  private typeFor(ab: AbilityDef, m: Monster): string {
    if (ab.damageType !== 'best') return ab.damageType ?? 'force';
    const d = MONSTERS[m.defId];
    return BEST_TYPES.find((t) => !d.immune?.includes(t) && !d.resist?.includes(t)) ?? BEST_TYPES.find((t) => !d.immune?.includes(t)) ?? 'force';
  }

  /** Who a spell catches: everyone in its area, up to its number of targets, or just the one. */
  private spellTargets(c: Character, ab: AbilityDef, lvl: number, first: Monster): Monster[] {
    const ok = (m: Monster) => m.alive && !this.mHas(m, 'banished') && (!ab.only || ab.only.includes(MONSTERS[m.defId].type));
    if (ab.zone?.follow) return this.s.monsters.filter((m) => ok(m) && this.mdist(m, c) * 5 <= ab.zone!.radius);
    const radius = ab.zone?.radius ?? ab.radius ?? (ab.area ? 5 : 0);
    if (radius) return [first, ...this.s.monsters.filter((m) => m !== first && ok(m) && cheb(this.mpoint(m, first), this.mpoint(first, m)) * 5 <= radius)];
    const n = (ab.count ?? 1) + (ab.countUp ?? 0) * Math.max(0, lvl - (ab.spellLevel ?? 0));
    if (n > 1) {
      const near = this.s.monsters.filter((m) => m !== first && ok(m) && cheb(this.mpoint(m, first), this.mpoint(first, m)) <= 6 && this.mdist(m, c) * 5 <= Math.max(ab.range, 30))
        .sort((a, b) => cheb(a, first) - cheb(b, first));
      return [first, ...near].slice(0, n);
    }
    return [first];
  }

  /** Put a spell's condition on a monster, tied to the caster's concentration when the spell needs it. */
  private spellInflict(c: Character, ab: AbilityDef, m: Monster) {
    const i = ab.inflict!;
    const ability = ab.saveAbility ?? (ab.id === 'power_word_stun' ? 'con' : undefined);
    this.afflict(m, i.condition, {
      ...(i.turns ? { turns: i.turns } : {}),
      ...(i.repeat && ability ? { save: { ability, dc: this.spellDc(c) } } : {}),
      ...(i.onHurt ? { onHurt: true } : {}),
      by: c.id, spell: ab.id,
    });
  }

  /**
   * The saving throws against a spell, one for each monster it catches, and what a failure
   * or a success costs each. `first` is the one aimed at; null for a lasting area striking again.
   */
  private spellSave(c: Character, ab: AbilityDef, dice: string | undefined, targets: Monster[], first: Monster | null, grazes: boolean, onKill: () => void) {
    const isSpell = ab.spellLevel !== undefined;
    const sorcery = isSpell && c.conditions.includes('innate sorcery');
    const own = 8 + c.profBonus + (ab.dcAbility ? abilityMod(c.abilities[ab.dcAbility]) : this.castingMod(c)) + (sorcery ? 1 : 0);
    const dc = this.viaItem ? Math.max(15, own) : own;
    const full = dice ? this.spellDmg(c, ab, dice) : 0;
    const heightened = isSpell && this.primed(`${c.id}:heightened`);
    const verb = !first ? '' : ab.spellLevel === undefined ? this.t`${c.name} uses ${this.n(ab.name)} on ${first.name}` : this.t`${c.name} casts ${this.n(ab.name)} at ${first.name}`;
    for (const m of targets) {
      if (!m.alive) continue;
      const mdef = MONSTERS[m.defId];
      const type = this.typeFor(ab, m);
      const dmgName = this.n(`${type} damage`);
      // Words of power ask no save: they work on a creature that is weak enough.
      if (!ab.saveAbility) {
        if (ab.id === 'power_word_kill' && m.hp <= 100) {
          this.damageMonster(m, m.hp, type);
          this.log('roll', this.t`${c.name} speaks a word of death. ${m.name} falls dead.`);
        } else if (ab.id === 'power_word_stun' && m.hp > 150) {
          this.log('roll', this.t`${m.name} is too strong for ${this.n(ab.name)} and is only slowed.`);
          this.afflict(m, 'slowed', { turns: 1, by: c.id, spell: ab.id });
        } else {
          if (full) {
            const res = this.damageMonster(m, full, type);
            this.log('roll', this.t`${c.name} casts ${this.n(ab.name)} at ${m.name} for ${res.dealt} ${dmgName}.${res.note}`);
          } else this.log('roll', this.t`${c.name} casts ${this.n(ab.name)} at ${m.name}.`);
          if (m.alive && ab.inflict) this.spellInflict(c, ab, m);
        }
        if (!m.alive) onKill();
        continue;
      }
      const save = this.n(ab.saveAbility.toUpperCase());
      let saveMod = mdef.saves[ab.saveAbility] ?? 0;
      const why: OddsWhy = [];
      if (this.mHas(m, 'baned')) { saveMod -= rollDie(4, this.rng); why.push({ code: 'bane' }); }
      if (mdef.flags?.magicResistance && isSpell) why.push({ code: 'magic_resistance' });
      if (heightened) why.push({ code: 'heightened' });
      // Magic Resistance: advantage on saves against spells.
      const r = d20(this.rng, rollMode(!!mdef.flags?.magicResistance && isSpell, heightened)).value;
      const helpless = (ab.saveAbility === 'str' || ab.saveAbility === 'dex') && (this.mHas(m, 'stunned') || this.mHas(m, 'paralyzed'));
      if (helpless) why.push({ code: 'helpless' });
      let resisted = false;
      const failed = helpless || r + saveMod < dc;
      if (failed && (m.legRes ?? mdef.flags?.legendaryResistance ?? 0) > 0) {
        m.legRes = (m.legRes ?? mdef.flags!.legendaryResistance!) - 1;
        resisted = true;
      }
      const head = m === first
        ? this.t`${verb}: ${save} save ${r}${signed(saveMod)} = ${r + saveMod} vs DC ${dc}.`
        : this.t`${m.name} is caught in ${this.n(ab.name)}: ${save} save ${r}${signed(saveMod)} = ${r + saveMod} vs DC ${dc}.`;
      const info = (outcome: RollInfo['outcome'], damage?: RollInfo['damage']): RollInfo =>
        ({ actor: m.name, label: this.t`${save} save against ${this.n(ab.name)}`, die: r, rolls: [r], mode: 'normal', modifier: saveMod, total: r + saveMod, target: { kind: 'DC', value: dc }, outcome, damage, ...(why.length ? { why } : {}) });
      if (resisted) this.log('roll', this.t`${m.name} fails the save but shrugs it off with Legendary Resistance (${m.legRes} left).`);
      if (resisted || !failed) {
        if (full && (ab.half || grazes)) {
          const res = this.damageMonster(m, Math.floor(full / 2), type);
          this.log('roll', this.t`${head} Saved, half damage: ${res.dealt} ${dmgName}.${res.note}`, { roll: info('success', { amount: res.dealt, type }) });
        } else this.log('roll', this.t`${head} ${m.name} avoids it.`, { roll: info('success') });
      } else if (full) {
        const res = this.damageMonster(m, full, type);
        this.log('roll', this.t`${head} Failed, ${res.dealt} ${dmgName}.${res.note}`, { roll: info('failure', { amount: res.dealt, type }) });
        if (m.alive && ab.inflict) this.spellInflict(c, ab, m);
      } else {
        this.log('roll', this.t`${head} Failed.`, { roll: info('failure') });
        if (ab.inflict) this.spellInflict(c, ab, m);
      }
      if (!m.alive) onKill();
    }
  }

  /** A lasting area strikes the enemies inside it again, at the start of the caster's turn. */
  private zoneTick(c: Character) {
    const z = c.zone;
    if (!z || this.s.phase !== 'combat') return;
    const ab = ABILITIES[z.spell];
    if (!ab) { c.zone = null; return; }
    if (z.follow) { z.x = c.x; z.y = c.y; }
    const inside = this.s.monsters.filter((m) => m.alive && !this.mHas(m, 'banished') && (!ab.only || ab.only.includes(MONSTERS[m.defId].type))
      && (z.follow ? this.mdist(m, c) : cheb(this.mpoint(m, z), z)) * 5 <= z.radius);
    if (!inside.length) return;
    this.log('roll', this.t`${this.n(ab.name)} of ${c.name} strikes again.`);
    const dice = this.spellDice(c, ab, z.level);
    if (ab.kind === 'auto') {
      for (const m of inside) {
        const type = this.typeFor(ab, m);
        const res = this.damageMonster(m, this.spellDmg(c, ab, dice!), type);
        this.log('roll', this.t`${m.name} takes ${res.dealt} ${this.n(`${type} damage`)}.${res.note}`);
      }
    } else this.spellSave(c, ab, dice, inside, null, false, () => {});
    this.checkCombatOver();
  }

  /** End the spell this hero concentrates on, and everything that hangs on it. */
  private dropConcentration(c: Character, why?: string) {
    const conc = c.conc;
    if (!conc) return;
    c.conc = null;
    if (c.zone?.spell === conc.spell) c.zone = null;
    if (c.sustain?.spell === conc.spell) c.sustain = null;
    for (const t of this.party()) this.removeBuffs(t, (b) => b.by === c.id && b.spell === conc.spell);
    for (const m of this.s.monsters) this.liftMonster(m, (e) => e.by === c.id && e.spell === conc.spell);
    if (why) this.log('roll', this.t`${c.name} loses concentration on ${this.n(ABILITIES[conc.spell]?.name ?? conc.spell)} (${why}).`);
  }

  /** Damage shakes concentration: a Constitution save against half the damage, at least 10. */
  private concentrationCheck(c: Character, damage: number) {
    if (!c.conc || damage <= 0) return;
    if (!this.conscious(c)) { this.dropConcentration(c, this.t`knocked out`); return; }
    const dc = Math.min(30, Math.max(10, Math.floor(damage / 2)));
    if (!this.heroSave(c, 'con', dc, this.t`concentration on ${this.n(ABILITIES[c.conc.spell]?.name ?? '')}`)) this.dropConcentration(c, this.t`the save failed`);
  }

  // ------------------------------------------------------------ spell buffs

  private buffsOf(c: Character): SpellBuff[] { return (c.buffs ?? []).map((b) => SPELL_BUFFS[b.id]).filter(Boolean); }
  /** Does a spell effect on the hero have this property? */
  private buffOn(c: Character, key: keyof SpellBuff) { return this.buffsOf(c).some((b) => !!b[key]); }
  /** Bless and its like: a die for an attack roll or a saving throw. */
  private blessDie(c: Character) { return this.buffsOf(c).reduce((n, b) => n + (b.roll ? roll(b.roll, this.rng).total : 0), 0); }

  /** Lay a spell's effect on its targets: one ally, a few, the caster, or the whole party. */
  private castBuff(c: Character, ab: AbilityDef, lvl: number, targetId: string | undefined, range: number, spend: () => void) {
    const def = SPELL_BUFFS[ab.buff!];
    const inCombat = this.s.phase === 'combat';
    const reach = Math.max(5, range);
    const near = (t: Character) => !inCombat || cheb(c, t) * 5 <= reach;
    let targets: Character[];
    if (ab.count === 99) targets = this.party().filter((t) => !t.dead);
    else if (ab.target === 'self') targets = [c];
    else {
      const first = this.char(targetId ?? c.id);
      if (first.dead) throw new GameError(this.t`${first.name} is dead`);
      if (!near(first)) throw new GameError(this.t`${first.name} is too far away`);
      const n = (ab.count ?? 1) + (ab.countUp ?? 0) * Math.max(0, lvl - (ab.spellLevel ?? 0));
      const others = this.party().filter((t) => t !== first && !t.dead && near(t) && !(t.buffs ?? []).some((b) => b.id === ab.buff))
        .sort((a, b) => Number(b.id === c.id) - Number(a.id === c.id) || cheb(a, c) - cheb(b, c));
      targets = [first, ...others].slice(0, n);
    }
    if (!def.instant && targets.every((t) => (t.buffs ?? []).some((b) => b.id === ab.buff && b.level >= lvl))) throw new GameError(this.t`${this.n(ab.name)} is already active`);
    spend();
    for (const t of targets) this.addBuff(t, c, ab, lvl);
    const names = targets.map((t) => (t.id === c.id ? this.t`themself` : t.name)).join(', ');
    this.log('roll', this.t`${c.name} casts ${this.n(ab.name)} on ${names}.`);
  }

  private addBuff(t: Character, c: Character, ab: AbilityDef, lvl: number) {
    const def = SPELL_BUFFS[ab.buff!];
    const up = Math.max(0, lvl - (ab.spellLevel ?? 0));
    if (def.temp) this.giveTemp(t, roll(def.temp, this.rng).total + (def.tempUp ?? 0) * up);
    if (def.instant) return;
    this.removeBuffs(t, (b) => b.id === ab.buff, true);
    const entry: NonNullable<Character['buffs']>[number] = { id: ab.buff!, spell: ab.id, by: c.id, level: lvl };
    if (def.tempTurn) entry.n = Math.max(1, this.castingMod(c));
    if (def.images) entry.images = def.images;
    (t.buffs ??= []).push(entry);
    if (def.maxHp) {
      const n = typeof def.maxHp === 'number' ? def.maxHp * Math.max(1, lvl - 1) : roll(def.maxHp, this.rng).total;
      entry.n = n;
      t.maxHp += n;
      this.healChar(t, n);
    }
    if (def.light && !t.light) t.light = 'light_spell';
    if (!t.conditions.includes(def.chip)) t.conditions.push(def.chip);
    this.refresh(t);
  }

  /** Lift spell effects from a hero, and undo what they changed. */
  private removeBuffs(t: Character, which: (b: NonNullable<Character['buffs']>[number]) => boolean, quiet = false) {
    const gone = (t.buffs ?? []).filter(which);
    if (!gone.length) return;
    t.buffs = (t.buffs ?? []).filter((b) => !gone.includes(b));
    const left = this.buffsOf(t);
    for (const g of gone) {
      const def = SPELL_BUFFS[g.id];
      if (!def) continue;
      if (def.maxHp && g.n) { t.maxHp = Math.max(1, t.maxHp - g.n); t.hp = Math.min(t.hp, t.maxHp); }
      if (def.light && t.light === 'light_spell' && !left.some((b) => b.light)) t.light = null;
      if (!left.some((b) => b.chip === def.chip)) t.conditions = t.conditions.filter((x) => x !== def.chip);
    }
    this.refresh(t);
    if (!quiet && !t.dead) this.log('roll', this.t`${t.name} is no longer ${[...new Set(gone.map((g) => this.n(SPELL_BUFFS[g.id]?.chip ?? g.id)))].join(', ')}.`);
  }

  /** Invisibility ends when its bearer attacks or casts a spell. */
  private breakInvisible(c: Character) {
    this.removeBuffs(c, (b) => SPELL_BUFFS[b.id]?.invisible === 'fragile');
  }

  /** Spell effects that run out: at the bearer's turn, when the fight ends, on a rest. */
  private expireBuffs(c: Character, when: 'turn' | 'fight' | 'short' | 'long') {
    const ends: Record<typeof when, SpellBuff['lasts'][]> = { turn: ['turn'], fight: ['turn', 'fight'], short: ['turn', 'fight', 'rest'], long: ['turn', 'fight', 'rest', 'long'] };
    this.removeBuffs(c, (b) => ends[when].includes(SPELL_BUFFS[b.id]?.lasts ?? 'fight'), when !== 'turn');
  }

  /** Shield: an attack that would hit, but not past +5 armor class, is turned aside. */
  private shieldReaction(c: Character, total: number, ac: number, crit: boolean): boolean {
    if (crit || total >= ac + 5 || !c.abilityIds.includes('shield') || c.mana < 2 || !this.canReact(c.id) || this.incapacitated(c) || c.conditions.includes('raging')) return false;
    this.useReaction(c.id);
    c.mana -= 2;
    this.addBuff(c, c, ABILITIES.shield.buff ? ABILITIES.shield : { ...ABILITIES.shield, buff: 'shield' }, 1);
    this.log('roll', this.t`${c.name} raises a Shield spell: armor class ${c.ac}.`);
    return true;
  }

  /** Hellish Rebuke: whoever hurt the warlock is wreathed in flame. */
  private rebuke(c: Character, m: Monster) {
    const ab = ABILITIES.hellish_rebuke;
    if (!ab || !m.alive || !c.abilityIds.includes(ab.id) || c.mana < ab.cost || !this.canReact(c.id) || !this.conscious(c) || this.incapacitated(c) || this.mdist(m, c) * 5 > ab.range) return;
    this.useReaction(c.id);
    c.mana -= ab.cost;
    this.log('roll', this.t`${c.name} answers with ${this.n(ab.name)}!`);
    this.spellSave(c, ab, this.spellDice(c, ab, ab.spellLevel ?? 1), [m], m, false, () => {});
  }

  /** Counterspell: a hero nearby tries to snuff out a monster's spell. Returns true when it fizzles. */
  private counter(m: Monster, spell: string): boolean {
    const ab = ABILITIES.counterspell;
    const c = ab && this.s.characters.find((h) => h.abilityIds.includes(ab.id) && h.mana >= ab.cost && this.conscious(h) && !this.incapacitated(h) && this.canReact(h.id)
      && !h.conditions.includes('raging') && this.mdist(m, h) * 5 <= ab.range && this.heroSees(h, m));
    if (!c) return false;
    this.useReaction(c.id);
    c.mana -= ab.cost;
    this.log('roll', this.t`${c.name} casts ${this.n(ab.name)} against ${spell}!`);
    if (this.monsterSave(m, 'con', this.spellDc(c), this.n(ab.name), { spell: true })) { this.log('roll', this.t`${m.name} pushes the spell through.`); return false; }
    this.log('roll', this.t`The spell of ${m.name} fizzles.`);
    return true;
  }

  endTurn(playerId: string, characterId: string) {
    const c = this.actor(playerId, characterId);
    if (this.s.phase !== 'combat') throw new GameError(this.t`Not in combat`);
    this.heroTurnEnd(c);
    this.legendaryActions();
    this.nextTurn();
  }

  // ------------------------------------------------------------- companions

  /** A companion by id or name. */
  companionNamed(ref: string): Character | null {
    const k = String(ref ?? '').trim().toLocaleLowerCase();
    if (!k) return null;
    return this.s.companions.find((c) => c.id === k || c.name.toLocaleLowerCase() === k)
      ?? this.s.companions.find((c) => c.name.toLocaleLowerCase().split(/\s+/).includes(k)) ?? null;
  }

  /** The stat block names a companion can be asked for by, German included. */
  private templateNames(): Record<string, string[]> {
    return Object.fromEntries(COMPANION_TEMPLATES.map((t) => [t.id, [MONSTERS[t.id]?.name ?? t.id, tr('de', MONSTERS[t.id]?.name ?? t.id)]]));
  }

  /**
   * The Dungeon Master's companion tool: someone of the story joins the party, leaves it, or changes how they help.
   * Every argument is a plain string the engine checks.
   */
  companionTool(input: { action?: string; name?: string; role?: string; stats?: string; stance?: string; gear?: string }) {
    const action = String(input.action ?? '').trim().toLowerCase();
    if (action === 'join') return this.addCompanion(input);
    if (action === 'leave') return this.dismissCompanion(String(input.name ?? ''));
    if (action === 'update') return this.updateCompanion(input);
    throw new GameError('action must be "join", "leave" or "update".');
  }

  addCompanion(input: { name?: string; role?: string; stats?: string; stance?: string; gear?: string }) {
    const s = this.s;
    if (s.phase === 'lobby' || !s.world) throw new GameError(this.t`The adventure has not started`);
    const name = cleanName(input.name).slice(0, 40);
    if (!name) throw new GameError(this.t`A companion needs a name`);
    if (this.companionNamed(name)) return { ...this.updateCompanion(input), note: `${name} already travels with the party; their entry was updated.` };
    if (s.characters.some((c) => sameName(c.name, name))) throw new GameError(`${name} is one of the heroes.`);
    if (s.companions.filter((c) => !c.dead).length >= MAX_COMPANIONS) throw new GameError(`The party already has ${MAX_COMPANIONS} companions. Let one leave first.`);
    const asked = String(input.stats ?? '').trim();
    const template = companionTemplate(asked || 'commoner', this.templateNames());
    if (!template) throw new GameError(`Unknown stat block "${asked}". Use one of: ${COMPANION_TEMPLATE_IDS.join(', ')}.`);
    const def = MONSTERS[template.id];
    const scores = def.scores ?? [10, 10, 10, 10, 10, 10];
    const role = String(input.role ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    // They are someone of the story: the party's memory knows them, and their portrait is theirs.
    const known = this.npcNamed(name);
    const npcId = known?.id ?? this.rememberNpc({ name, role }).id;
    const npc = this.s.memory.npcs.find((n) => n.id === npcId)!;
    npc.locationId = null;
    if (npc.disposition === 'wary' || npc.disposition === 'hostile') npc.disposition = 'neutral';
    const equipment = Object.fromEntries(SLOT_IDS.map((x) => [x, null])) as Record<SlotId, ItemInstance | null>;
    const bag: (ItemInstance | null)[] = Array(BAG_SIZE).fill(null);
    const c: Character = {
      id: this.uid('ally'), ownerId: '', name: npc.name.slice(0, 40), classId: 'fighter', className: this.n(def.name), gender: 'neutral', level: 1,
      abilities: { str: scores[0], dex: scores[1], con: scores[2], int: scores[3], wis: scores[4], cha: scores[5] },
      profBonus: 2, maxHp: def.hp, hp: def.hp, maxMana: 0, mana: 0, ac: def.ac, speed: def.speed, conditions: [], equipment, bag,
      x: 0, y: 0, deathSaves: { successes: 0, failures: 0 }, dead: false, hitDice: 1, abilityIds: [], spent: [], skills: [], xp: 0, features: [],
      speciesId: 'human', backgroundId: 'soldier', subclass: null, feats: [], expertise: [], resist: [],
      look: heroLook({ speciesId: 'human', gender: 'neutral', classId: 'fighter', name: npc.name }),
      appearance: npc.visual.description, backstory: '', pending: [], premadeId: null, light: null, opportunity: 'always', uses: {}, options: [], tempHp: 0, form: null, mark: null,
      companion: { npcId: npc.id, role: role || npc.role || this.n(def.name), template: template.id, kind: this.n(def.name), stance: parseStance(input.stance) ?? template.stance, baseAc: def.ac, joinedDay: this.day() },
    };
    const gear = this.companionGear(String(input.gear ?? ''), template.kit);
    gear.forEach((id, i) => {
      const item = this.newItem(id);
      const slot = i === 0 ? this.slotFor(this.def(id)) : null;
      if (slot && !c.equipment[slot]) c.equipment[slot] = item;
      else { const free = c.bag.indexOf(null); if (free >= 0) c.bag[free] = item; }
    });
    this.refreshCompanion(c);
    c.hp = c.maxHp;
    s.companions.push(c);
    this.log('system', this.t`${c.name} joins the party as a companion.`);
    return this.companionReport(c);
  }

  /** Catalogue items for a new companion: "kit" for what the stat block carries, a comma list of ids, or nothing. */
  private companionGear(raw: string, kit: string[]): string[] {
    const k = raw.trim().toLowerCase();
    if (!k || k === 'none' || k === 'nothing') return [];
    if (k === 'kit' || k === 'own' || k === 'default') return kit;
    const out: string[] = [];
    for (const part of k.split(/[,;]+/).map((x) => x.trim()).filter(Boolean)) {
      if (part === 'kit') { out.push(...kit); continue; }
      const def = this.findItemDef(part);
      if (!def || def.story || def.value > 100) throw new GameError(`Unknown or too valuable item "${part}" for a companion's own gear. Use catalogue ids such as "spear", or "kit".`);
      out.push(def.id);
    }
    return out.slice(0, 4);
  }

  updateCompanion(input: { name?: string; role?: string; stats?: string; stance?: string }) {
    const c = this.companionNamed(String(input.name ?? ''));
    if (!c) throw new GameError(`${input.name} is not a companion of the party. Companions: ${this.s.companions.map((x) => x.name).join(', ') || 'none'}.`);
    const info = c.companion!;
    const role = String(input.role ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (role) info.role = role;
    const stance = parseStance(input.stance);
    if (String(input.stance ?? '').trim() && !stance) throw new GameError('stance must be "fight", "guard" or "back".');
    if (stance) info.stance = stance;
    const asked = String(input.stats ?? '').trim();
    if (asked) {
      const template = companionTemplate(asked, this.templateNames());
      if (!template) throw new GameError(`Unknown stat block "${asked}". Use one of: ${COMPANION_TEMPLATE_IDS.join(', ')}.`);
      if (template.id !== info.template) {
        const def = MONSTERS[template.id], scores = def.scores ?? [10, 10, 10, 10, 10, 10];
        const hurt = c.maxHp - c.hp;
        info.template = template.id; info.kind = this.n(def.name); info.baseAc = def.ac;
        c.className = info.kind;
        c.abilities = { str: scores[0], dex: scores[1], con: scores[2], int: scores[3], wis: scores[4], cha: scores[5] };
        c.maxHp = def.hp;
        if (!c.dead) c.hp = Math.max(c.hp > 0 ? 1 : 0, def.hp - hurt);
        this.refreshCompanion(c);
      }
    }
    return this.companionReport(c);
  }

  /** A companion parts from the party. What they carry goes with them, except quest items, which stay with a hero. */
  dismissCompanion(ref: string) {
    const c = this.companionNamed(ref);
    if (!c) throw new GameError(`${ref} is not a companion of the party. Companions: ${this.s.companions.map((x) => x.name).join(', ') || 'none'}.`);
    if (this.s.phase === 'combat' && !c.dead) throw new GameError(this.t`${c.name} cannot leave in the middle of a fight`);
    const kept = this.handBack(c, (def) => !!def.story?.quest || c.dead);
    this.s.companions = this.s.companions.filter((x) => x !== c);
    const npc = this.s.memory.npcs.find((n) => n.id === c.companion?.npcId);
    if (npc && !c.dead) npc.locationId = this.s.world?.placeId ?? null;
    this.log('system', c.dead ? this.t`The party lays ${c.name} to rest.` : this.t`${c.name} leaves the party.`);
    return { left: c.name, ...(kept.length ? { handed_to_heroes: kept } : {}) };
  }

  /** Give what a companion carries back to the heroes, as far as there is room. Returns what went over. */
  private handBack(c: Character, which: (def: ItemDef) => boolean): string[] {
    const out: string[] = [];
    for (const { item, loc } of this.carried(c)) {
      const def = this.def(item.defId);
      if (!which(def)) continue;
      const taker = this.s.characters.find((h) => !h.dead && this.addToBag(h, item.defId, item.qty));
      if (!taker) continue;
      this.setLoc(c, loc, null);
      out.push(`${this.countOf(def, item.qty)} (${taker.name})`);
    }
    return out;
  }

  /** What the Dungeon Master is told about a companion after a change. */
  private companionReport(c: Character) {
    const w = this.weaponOf(c);
    return {
      companion: c.name, id: c.id, stats: c.companion!.template, role: c.companion!.role, stance: c.companion!.stance,
      hp: `${c.hp}/${c.maxHp}`, ac: c.ac, weapon: w ? w.name : 'none (unarmed)',
      note: 'They show in the party panel. In a fight the server plays their turns by their stance; you narrate them. Give and take their things with give_item and take_item using their id.',
    };
  }

  /** A companion's sheet follows from their stat block and what they hold: no class, no levels. */
  private refreshCompanion(c: Character) {
    this.applyBoosts(c);
    c.uses ??= {};
    c.options = [];
    c.tempHp ??= 0;
    c.form = null;
    c.mark ??= null;
    c.subclass = null;
    c.abilityIds = [];
    c.features = [];
    c.maxMana = 0;
    c.mana = 0;
    c.resist = [...new Set(this.worn(c).flatMap((d) => d.resist ?? []))];
    c.speed = (MONSTERS[c.companion!.template]?.speed ?? 30) + this.worn(c).reduce((n, d) => n + (d.speed ?? 0), 0);
    c.buffs ??= [];
    for (const b of this.buffsOf(c)) c.speed = (c.speed + (b.speed ?? 0)) * (b.speedMul ?? 1);
    c.ac = this.computeAc(c);
  }

  /**
   * Play a companion's turn. "fight" goes for the nearest enemy; "guard" strikes what comes within reach and steps
   * in when a hero is attacked; "back" stays out of harm's way and dodges when cornered.
   */
  companionAct(): { companion: string; did: string } | null {
    const cur = this.current();
    const combat = this.s.combat;
    if (!cur || cur.kind !== 'ally' || !combat || this.s.phase !== 'combat') return null;
    const c = this.char(cur.id);
    let did = 'waits';
    try {
      did = this.companionTurn(c, combat);
    } catch (err) {
      if (!(err instanceof GameError)) throw err;
    }
    // A blow on the way may have felled them or ended the fight; then the turn has already moved on.
    if (this.s.phase === 'combat' && this.current()?.id === c.id) {
      this.heroTurnEnd(c);
      this.legendaryActions();
      this.nextTurn();
    }
    return { companion: c.name, did };
  }

  private companionTurn(c: Character, combat: CombatState): string {
    const stance = c.companion?.stance ?? 'guard';
    const charmedBy = (m: Monster) => (c.effects ?? []).some((e) => e.condition === 'charmed' && e.sourceId === m.id);
    const foes = () => this.s.monsters.filter((m) => m.alive && !this.mHas(m, 'banished') && !charmedBy(m) && this.heroSees(c, m));
    const shot = this.weaponOf(c)?.weapon?.ranged;
    const reach = shot ? shot.normal : 5;
    const inReach = (m: Monster, from: Pt = c) => this.mdist(m, from) * 5 <= reach && this.los(from, this.mpoint(m, from));
    const still = () => this.s.phase === 'combat' && this.current()?.id === c.id && this.conscious(c);
    if (!foes().length) {
      this.log('system', this.t`${c.name} looks for an enemy and finds none in sight.`);
      return 'no enemy in sight';
    }
    if (stance === 'back') {
      if (this.s.monsters.some((m) => m.alive && this.mdist(m, c) <= 1)) {
        combat.actionUsed = true;
        c.conditions.push('dodging');
        this.log('roll', this.t`${c.name} keeps their head down and dodges.`);
        return 'dodges';
      }
      const spot = this.saferSpot(c);
      if (spot) this.moveChar(c, spot.x, spot.y);
      if (still()) this.log('system', this.t`${c.name} stays back, out of harm's way.`);
      return 'keeps back';
    }
    let targets = foes().filter((m) => inReach(m));
    if (!targets.length) {
      // A guard only steps in for a hero under attack; a fighter goes for whoever is closest.
      const goal = stance === 'fight' ? foes() : foes().filter((m) => this.party().some((h) => h !== c && this.conscious(h) && this.mdist(m, h) <= 1));
      if (goal.length && combat.movementLeft > 0) {
        const canEnter = (p: Pt) => !this.monsterAt(p.x, p.y) && !this.charAt(p.x, p.y, c.id);
        const path = this.bfs(c, (p) => goal.some((m) => inReach(m, p)) && (p.x === c.x && p.y === c.y || !this.charAt(p.x, p.y, c.id)), canEnter);
        const steps = path ? this.afford(path, combat.movementLeft).walked : [];
        // A guard does not leave the heroes' side for a fight further than one move away.
        if (steps.length && (stance === 'fight' || steps.length === path!.length)) {
          const end = steps[steps.length - 1];
          this.moveChar(c, end.x, end.y);
          if (!still()) return 'moved';
        }
      }
      targets = foes().filter((m) => inReach(m));
    }
    if (!targets.length) {
      this.log('system', stance === 'guard' ? this.t`${c.name} stays by the heroes, on guard.` : this.t`${c.name} closes in.`);
      return stance === 'guard' ? 'guards' : 'closes in';
    }
    const m = [...targets].sort((a, b) => a.hp - b.hp || this.mdist(a, c) - this.mdist(b, c))[0];
    combat.actionUsed = true;
    combat.attacksLeft = 0;
    this.strike(c, m);
    this.checkCombatOver();
    return `attacks ${m.name}`;
  }

  /** The square within a move that lies furthest from every enemy, if it is further than where they stand. */
  private saferSpot(c: Character): Pt | null {
    const combat = this.s.combat;
    if (!combat || combat.movementLeft <= 0) return null;
    const foes = this.s.monsters.filter((m) => m.alive);
    const away = (p: Pt) => Math.min(...foes.map((m) => this.mdist(m, p)));
    let best: Pt | null = null, bestD = away(c);
    const r = combat.movementLeft;
    for (let y = c.y - r; y <= c.y + r; y++) for (let x = c.x - r; x <= c.x + r; x++) {
      if (!this.walkable(x, y) || this.monsterAt(x, y) || this.charAt(x, y, c.id)) continue;
      const d = away({ x, y });
      if (d > bestD || (best && d === bestD && cheb({ x, y }, c) < cheb(best, c))) { best = { x, y }; bestD = d; }
    }
    return best && (best.x !== c.x || best.y !== c.y) ? best : null;
  }

  /** Companions who fell for good are buried at a long rest; the heroes take what they carried. */
  private buryCompanions() {
    for (const c of this.s.companions.filter((x) => x.dead)) this.dismissCompanion(c.id);
  }

  /** A companion as players see them: with their portrait and painted battle figure, when there are those. */
  private companionView(c: Character): Character {
    const npc = this.s.memory.npcs.find((n) => n.id === c.companion?.npcId);
    const subject = npc ? companionFigureSubject(npc, c.companion!.template) : null;
    const figureId = subject ? this.pictures?.figure?.(subject) ?? null : null;
    return { ...c, companion: { ...c.companion!, portraitId: npc?.portraitId ?? null }, ...(figureId ? { figureId } : {}) };
  }

  // -------------------------------------------------------------- monsters

  /** Consecutive living monsters starting at the current turn. */
  monsterBlock(): Monster[] {
    const combat = this.s.combat;
    if (!combat || !this.isMonsterTurn()) return [];
    const out: Monster[] = [];
    for (let i = combat.turnIndex; i < combat.order.length; i++) {
      const o = combat.order[i];
      if (o.kind !== 'monster') {
        const c = this.char(o.id);
        if (this.conscious(c)) break;
        continue;
      }
      const m = this.monster(o.id);
      if (m.alive) out.push(m);
    }
    return out;
  }

  /** Called once every monster in the block has acted. */
  finishMonsterBlock(block: Monster[]) {
    const combat = this.s.combat;
    if (!combat || this.s.phase !== 'combat') return;
    const last = block[block.length - 1];
    const idx = last ? combat.order.findIndex((o) => o.id === last.id) : -1;
    if (idx >= 0) combat.turnIndex = idx;
    this.nextTurn();
  }

  /** Could this monster not stand with its top-left square at p? Checks every square of its space. */
  private monsterBlocked(p: Pt, self: Monster) {
    const n = this.tilesOf(self);
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) {
      const x = p.x + dx, y = p.y + dy;
      if (!this.walkable(x, y)) return true;
      const m = this.monsterAt(x, y);
      if ((m && m.id !== self.id) || this.charAt(x, y)) return true;
    }
    return false;
  }

  /** The battle map as the movement planner sees it, for one monster. */
  private tacticsBoard(m: Monster): Board {
    const n = this.tilesOf(m);
    const foeAt = (x: number, y: number) => !!this.charAt(x, y);
    return {
      canPass: (p) => {
        for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) if (!this.walkable(p.x + dx, p.y + dy) || foeAt(p.x + dx, p.y + dy)) return false;
        return true;
      },
      canStop: (p) => !this.monsterBlocked(p, m),
      cost: (p) => tileCost(this.tile(p.x, p.y)),
      cutsCorner: (a, b) => !this.walkable(b.x, a.y) || !this.walkable(a.x, b.y),
    };
  }

  /** A path to the free square nearest a hero it cannot reach, so it at least closes in. */
  private closestApproach(m: Monster, board: Board, t: Character): Pt[] {
    const size = this.tilesOf(m);
    const spots = reachableSpots(board, { x: m.x, y: m.y }, 60);
    let best: Spot | null = null;
    let bestD = this.mdist(m, t);
    for (const s of spots) {
      const d = distToFootprint(s.p, size, t);
      if (d < bestD || (best && d === bestD && s.cost < best.cost)) { best = s; bestD = d; }
    }
    return best?.path ?? [];
  }

  /**
   * Where a shooter or a creature backing off ends its move: a square it can shoot its target
   * from, out of reach and in cover, or as far off and as hidden as it can get. If its target
   * cannot be shot from anywhere it can reach, another hero who can becomes the target.
   */
  private pickSpot(m: Monster, board: Board, tactic: Stance, target: Character, atk: MonsterAttack | null, speed: number, flyby: boolean): { path: Pt[]; shot: boolean; target?: Character } {
    const start = { x: m.x, y: m.y };
    const size = this.tilesOf(m);
    const budget = tactic === 'hold_position' ? Math.min(speed, 2) : speed;
    const spots = reachableSpots(board, start, budget);
    const heroes = this.consciousChars();
    const foes: Foe[] = heroes.map((c) => ({ id: c.id, x: c.x, y: c.y, threatens: !this.incapacitated(c) }));
    const shot = atk?.ranged ? { range: atk.range, long: atk.longRange ?? atk.range } : null;
    const query = (t: Character): SpotQuery => ({
      spots, start, size, foes, target: foes.find((f) => f.id === t.id)!, shot, stance: tactic,
      noProvoke: tactic === 'disengage' || flyby,
      los: (a, b) => this.los(a, b),
      cover: (from, to) => cheb(from, to) > 1 && hasCover(this.s.rows, from, to),
    });
    let best = bestSpot(query(target));
    let chosen = target;
    if (shot && tactic === 'engage' && best.shot === 0) {
      for (const c of heroes) {
        if (c.id === target.id) continue;
        const r = bestSpot(query(c));
        if (r.shot > best.shot || (r.shot === best.shot && r.score > best.score)) { best = r; chosen = c; }
      }
    }
    return { path: best.spot.path, shot: best.shot > 0, target: chosen };
  }

  /** Ask players about opportunity attacks. Off for scripted play and tests: every hero then follows its setting, with "ask" striking. */
  interactiveReactions = false;
  /** Told when a hero lands a killing blow, scores a critical hit or dies, for the players' account stats. */
  tally?: (heroId: string, what: 'kills' | 'crits' | 'deaths') => void;
  /** How long a reaction prompt waits for its player. */
  reactionWaitMs = 20000;
  /** The monster turn that stopped for a reaction prompt. */
  private plan: MonsterPlan | null = null;

  /**
   * Play one monster's turn. It plans its whole move first, then walks it step by step:
   * stepping out of a hero's reach lets that hero make an opportunity attack, unless the
   * monster disengaged. When a hero's player is asked, the walk stops with `waiting` set,
   * and `resumeMonster` finishes it once they have answered.
   */
  monsterAct(monsterId: string, intent: MonsterIntent = {}): MonsterActResult {
    const m = this.monster(monsterId);
    const def = MONSTERS[m.defId];
    if (!m.alive || this.s.phase !== 'combat') return { monster: m.name, moved: 0, note: 'cannot act' };
    if (this.s.combat?.reaction) return { monster: m.name, moved: 0, waiting: true, note: 'waiting for a hero to decide on an opportunity attack' };
    // Its own turn begins: its reaction is back.
    if (this.s.combat) this.s.combat.reacted = (this.s.combat.reacted ?? []).filter((id) => id !== m.id);
    this.monsterTurnStart(m);
    if (!m.alive) { this.acting = null; this.checkCombatOver(); return { monster: m.name, moved: 0, note: `${m.name} died at the start of its turn` }; }
    if (this.mHelpless(m)) {
      const why = [...new Set((m.effects ?? []).filter((e) => MONSTER_SKIPS.includes(e.condition)).map((e) => this.n(e.condition)))].join(', ');
      this.log('system', this.t`${m.name} is ${why} and loses the turn.`);
      this.monsterTurnEnd(m);
      return { monster: m.name, moved: 0, note: `${m.name} is ${why} and loses its turn` };
    }
    if (this.mHas(m, 'confused') && this.rng() < 0.5) {
      this.log('system', this.t`${m.name} is confused and stumbles about, doing nothing.`);
      this.monsterTurnEnd(m);
      return { monster: m.name, moved: 0, note: `${m.name} is confused and loses its turn` };
    }
    const targets = this.consciousChars();
    if (!targets.length) { this.acting = null; return { monster: m.name, moved: 0, note: 'no targets' }; }
    // A flier moves at its flying speed: a bat or a stirge barely crawls on foot.
    let speed = Math.floor(Math.max(def.speed, def.fly ?? 0) / 5);
    if (this.mHas(m, 'restrained')) speed = 0;
    else if (this.mHas(m, 'slowed')) speed = Math.floor(speed / 2);
    if (this.mHas(m, 'prone')) {
      m.effects = (m.effects ?? []).filter((e) => e.condition !== 'prone');
      this.syncMonster(m);
      speed = Math.ceil(speed / 2);
      this.log('roll', this.t`${m.name} gets back up, which costs half the movement.`);
    }
    const size = this.tilesOf(m);
    const board = this.tacticsBoard(m);
    const canStop = (p: Pt) => (p.x === m.x && p.y === m.y) || board.canStop(p);
    // Allies can be walked through, but not stood on.
    const pathToAdjacent = (t: Character) => this.bfs(m, (p) => distToFootprint(p, size, t) <= 1 && canStop(p), board.canPass);

    let target = targets.find((t) => t.id === intent.targetId);
    const paths = new Map<string, Pt[] | null>();
    const pathTo = (t: Character) => { if (!paths.has(t.id)) paths.set(t.id, pathToAdjacent(t)); return paths.get(t.id)!; };
    const byPath = () => targets.map((t) => { const p = pathTo(t); return { t, d: p ? this.pathCost(p) : 999 }; })
      .sort((a, b) => a.d - b.d || this.mdist(m, a.t) - this.mdist(m, b.t));
    // No target named: whom the monster picks depends on the table's challenge level.
    if (!target) target = pickByHabit(targetHabit(this.s.table.style.rules), byPath(), speed);
    const tactic = (['engage', 'hold_position', 'retreat', 'disengage'] as const).find((x) => x === intent.tactic) ?? 'engage';
    const backOff = tactic === 'retreat' || tactic === 'disengage';
    let meleePath = pathTo(target);
    let choice = this.chooseAction(m, def, String(intent.attack ?? ''), target, meleePath !== null && this.pathCost(meleePath) <= speed, backOff);
    // A brute whose chosen foe is walled in by others goes for one it can reach.
    if (!meleePath && tactic === 'engage' && (!choice.rep || !choice.rep.ranged)) {
      const other = byPath()[0];
      if (other.d < 999) {
        target = other.t;
        meleePath = pathTo(target);
        choice = this.chooseAction(m, def, String(intent.attack ?? ''), target, this.pathCost(meleePath!) <= speed, backOff);
      }
    }
    const chosen = choice.rep;

    let walked: Pt[] = [];
    const shooter = !!chosen?.ranged;
    if (tactic === 'engage' && !shooter) {
      // Creatures with a long reach stop as soon as the target is within it.
      const reach = chosen ? Math.max(1, Math.floor(chosen.range / 5)) : 1;
      const path = meleePath ?? this.closestApproach(m, board, target);
      const steps = affordablePrefix(board, path, speed);
      const stop = steps.findIndex((p) => canStop(p) && distToFootprint(p, size, target!) <= reach && this.los(nearestFootprintTile(p, size, target!), target!));
      walked = reach > 1 && stop >= 0 ? steps.slice(0, stop + 1) : steps;
      if (reach > 1 && this.mdist(m, target) <= reach && this.los(this.mpoint(m, target), target)) walked = [];
    } else if (shooter || backOff) {
      const pick = this.pickSpot(m, board, tactic, target, chosen ?? null, speed, !!def.flags?.flyby);
      if (pick.target && pick.target.id !== target.id) target = pick.target;
      walked = pick.path;
      // Nowhere within a move to shoot from: close in along the way, stopping once in range.
      if (tactic === 'engage' && shooter && !pick.shot) {
        const inRange = (p: Pt) => distToFootprint(p, size, target!) * 5 <= (chosen!.longRange ?? chosen!.range) && this.los(nearestFootprintTile(p, size, target!), target!);
        const steps = affordablePrefix(board, meleePath ?? this.closestApproach(m, board, target), speed);
        const stop = steps.findIndex((p) => canStop(p) && inRange(p));
        walked = stop >= 0 ? steps.slice(0, stop + 1) : steps;
      }
    }
    // A goblin slipping out of reach to shoot uses Nimble Escape for it, as its bonus action.
    const leaves = walked.length > 0 && !def.flags?.flyby && this.consciousChars().some((c) => !this.incapacitated(c) && this.mdist(m, c) <= 1 && distToFootprint(walked[walked.length - 1], size, c) > 1);
    const disengage = tactic === 'disengage' || (!!def.nimbleEscape && leaves);
    const plan: MonsterPlan = {
      monsterId: m.id, targetId: target.id, attack: choice.name, tactic, path: walked, done: 0,
      // Disengage takes the action, except for a creature that can do it as a bonus action (Nimble Escape).
      disengage, noAttack: disengage && !def.nimbleEscape, asked: [], struckBy: [],
      ...(def.flags?.flyby ? { noProvoke: true } : {}),
    };
    if (disengage) this.log('roll', def.nimbleEscape ? this.t`${m.name} disengages nimbly.` : this.t`${m.name} takes the Disengage action.`);
    return this.runPlan(plan);
  }

  /** Finish a monster's turn after the hero's player answered the reaction prompt. */
  resumeMonster(take: boolean): MonsterActResult | null {
    const combat = this.s.combat;
    const plan = this.plan;
    const prompt = combat?.reaction;
    if (!combat || !plan || !prompt) return null;
    combat.reaction = null;
    const c = this.s.characters.find((x) => x.id === prompt.heroId);
    const m = this.monster(plan.monsterId);
    if (c && take && this.conscious(c) && m.alive && this.s.phase === 'combat') this.heroOpportunity(c, m, plan);
    else if (c) this.log('roll', this.t`${c.name} lets ${m.name} go.`);
    return this.runPlan(plan);
  }

  /** The hero whose player is being asked about an opportunity attack. */
  reactionPrompt() { return this.s.combat?.reaction ?? null; }

  /** May this player answer the reaction prompt for this hero? */
  checkReaction(playerId: string, characterId: string) {
    const prompt = this.reactionPrompt();
    if (!prompt || prompt.heroId !== characterId) throw new GameError(this.t`There is nothing to react to right now`);
    if (!this.mayControl(playerId, this.char(characterId))) throw new GameError(this.t`That hero belongs to another player`);
  }

  /** Walk the planned path from where it stopped, then attack. */
  private runPlan(plan: MonsterPlan): MonsterActResult {
    const m = this.monster(plan.monsterId);
    const combat = this.s.combat!;
    const walked: Pt[] = [];
    const flushWalk = () => { if (walked.length) this.moves.push({ id: m.id, path: walked.splice(0) }); };
    const result = (extra: Partial<MonsterActResult> = {}): MonsterActResult =>
      ({ monster: m.name, moved: plan.done, ...(plan.struckBy.length ? { struckBy: [...plan.struckBy] } : {}), ...(plan.disengage ? { disengaged: true } : {}), ...extra });
    while (plan.done < plan.path.length && m.alive && this.s.phase === 'combat') {
      const q = plan.path[plan.done];
      if (!plan.disengage && !plan.noProvoke) {
        for (const c of this.heroesLeftBy(m, q)) {
          if (plan.asked.includes(c.id)) continue;
          plan.asked.push(c.id);
          const choice = this.opportunityChoice(c);
          if (choice === 'never') continue;
          if (choice === 'ask') {
            flushWalk();
            combat.reaction = { heroId: c.id, monsterId: m.id, until: Date.now() + this.reactionWaitMs };
            this.plan = plan;
            return result({ waiting: true });
          }
          this.heroOpportunity(c, m, plan);
          if (!m.alive) break;
        }
        if (!m.alive) break;
      }
      m.x = q.x; m.y = q.y; walked.push(q);
      m.movedFt = (m.movedFt ?? 0) + 5;
      plan.done++;
    }
    flushWalk();
    this.plan = null;
    if (!m.alive) {
      this.acting = null;
      this.checkCombatOver();
      return result({ note: `${m.name} was slain by an opportunity attack before it could attack` });
    }
    const acts = plan.noAttack || this.s.phase !== 'combat' ? {} : this.monsterActs(m, plan);
    this.monsterTurnEnd(m);
    return result(acts);
  }

  /** Heroes whose reach the monster leaves by stepping to q, who could see it go and still have their reaction. */
  private heroesLeftBy(m: Monster, q: Pt): Character[] {
    const reacted = this.s.combat?.reacted ?? [];
    return this.consciousChars().filter((c) => !reacted.includes(c.id) && !this.incapacitated(c) && this.mdist(m, c) <= 1 && distToFootprint(q, this.tilesOf(m), c) > 1 && this.heroSees(c, m));
  }

  /** Whether the hero strikes, lets the enemy go, or their player is asked. Nobody waits for a player who is away. */
  private opportunityChoice(c: Character): OpportunityMode {
    const mode = OPPORTUNITY_MODES.includes(c.opportunity) ? c.opportunity : 'ask';
    if (mode !== 'ask') return mode;
    return this.interactiveReactions && this.player(c.ownerId)?.connected ? 'ask' : 'always';
  }

  private heroOpportunity(c: Character, m: Monster, plan: MonsterPlan) {
    const combat = this.s.combat!;
    (combat.reacted ??= []).push(c.id);
    plan.struckBy.push(c.name);
    this.strike(c, m, { reaction: true });
  }

  // ------------------------------------------------------- monster actions

  /** The monster whose turn is being played, for effects that last "until the end of its next turn". */
  private acting: string | null = null;
  /** Monsters slain since the last check, whose death still has consequences to settle. */
  private fallen: string[] = [];

  /** Dice of damage, or a plain number for the weakest creatures. */
  private rollDmg(dice: string, crit = false): number {
    return /^\d+$/.test(dice) ? Number(dice) : roll(dice, this.rng, crit).total;
  }

  /** Has this limited attack or spell any uses left in this fight? */
  private usable(m: Monster, a: { name: string; perDay?: number }) {
    return !a.perDay || (m.used?.[a.name] ?? 0) < a.perDay;
  }

  /** Is this special available: recharged, not used up, not on cooldown? */
  private ready(m: Monster, sp: MonsterSpecial) {
    return !m.spent?.includes(sp.name) && this.usable(m, sp) && !(sp.cooldown && m.legCooldown?.includes(sp.name));
  }

  private spend(m: Monster, a: { name: string; perDay?: number; recharge?: number }) {
    if (a.recharge) (m.spent ??= []).push(a.name);
    if (a.perDay) (m.used ??= {})[a.name] = (m.used[a.name] ?? 0) + 1;
  }

  /** What begins with a monster's turn: its reaction and legendary actions return, it regenerates, spent breath may recharge. */
  private monsterTurnStart(m: Monster) {
    const def = MONSTERS[m.defId];
    this.acting = m.id;
    m.movedFt = 0;
    if (this.s.combat) this.s.combat.once = [];
    // Holy Nimbus: enemies that start their turn in the paladin's aura burn.
    for (const p of this.party()) {
      if (!m.alive || !p.conditions.includes('holy nimbus') || !this.conscious(p) || this.mdist(m, p) > (this.feat(p, 'aura_expansion') ? 6 : 2)) continue;
      const res = this.damageMonster(m, Math.max(1, this.mod(p, 'cha') + p.profBonus), 'radiant');
      this.log('roll', this.t`${m.name} burns in ${p.name}'s holy nimbus for ${res.dealt} ${this.n('radiant damage')}.${res.note}`);
    }
    if (!m.alive) return;
    if (def.legendary) { m.legLeft = def.legendary.uses; m.legCooldown = []; }
    for (const c of this.party()) this.endEffects(c, (e) => e.sourceId === m.id && e.ends === 'source_start');
    const regen = def.flags?.regeneration;
    if (regen && m.hp < m.maxHp) {
      if (m.noRegen) this.log('roll', this.t`${m.name}'s wounds do not close this turn.`);
      else {
        const healed = Math.min(regen.amount, m.maxHp - m.hp);
        m.hp += healed;
        this.log('roll', this.t`${m.name} regenerates ${healed} HP.`);
      }
    }
    m.noRegen = false;
    for (const sp of def.specials ?? []) {
      if (!sp.recharge || !m.spent?.includes(sp.name)) continue;
      const r = rollDie(6, this.rng);
      if (r >= sp.recharge) {
        m.spent = m.spent.filter((x) => x !== sp.name);
        this.log('roll', this.t`${m.name} gathers itself: ${this.n(sp.name)} is ready again.`);
      }
    }
  }

  /** What ends with a monster's turn: a burning aura sears those next to it, and short effects it caused run out. */
  private monsterTurnEnd(m: Monster) {
    const def = MONSTERS[m.defId];
    if (m.alive && this.s.phase === 'combat') {
      const aura = def.flags?.aura;
      if (aura) {
        for (const c of this.consciousChars()) {
          if (this.mdist(m, c) * 5 > aura.size) continue;
          const res = this.hurtHero(c, [{ amount: this.rollDmg(aura.dice), type: aura.type }]);
          this.log('roll', this.t`${c.name} is seared by the aura around ${m.name}: ${this.dmgText(res.parts)}.` + (res.down ? ` ${this.t`${c.name} falls unconscious!`}` : ''));
        }
      }
      // Conditions heroes put on it: a save may end them, and the short ones run out.
      for (const e of [...(m.effects ?? [])]) {
        if (!m.effects?.includes(e)) continue;
        if (e.save && this.monsterSave(m, e.save.ability, e.save.dc, this.n(e.condition))) { this.liftMonster(m, (x) => x === e); continue; }
        if (e.turns !== undefined && --e.turns <= 0) this.liftMonster(m, (x) => x === e);
      }
      // "Until the end of its next turn": effects it caused on this very turn stay for one more.
      for (const c of this.party()) {
        const fresh = (c.effects ?? []).filter((e) => e.sourceId === m.id && e.ends === 'source_end' && e.skip);
        this.endEffects(c, (e) => e.sourceId === m.id && e.ends === 'source_end' && !e.skip);
        for (const e of fresh) e.skip = false;
      }
    }
    this.acting = null;
  }

  /** The centre of the space a monster fills, in tiles. */
  private mcentre(m: Monster): Pt {
    const half = (this.tilesOf(m) - 1) / 2;
    return { x: m.x + half, y: m.y + half };
  }

  /**
   * The heroes a special would catch from where the monster stands. An area is aimed to
   * catch as many as it can, with the preferred target among them if possible.
   */
  private specialTargets(m: Monster, sp: MonsterSpecial, prefer?: Character): Character[] {
    const heroes = this.consciousChars().filter((c) => !m.shrugged?.includes(`${sp.name}:${c.id}`));
    const sees = (c: Character) => this.los(this.mpoint(m, c), c);
    const held = (c: Character) => (c.effects ?? []).some((e) => e.sourceId === m.id && (e.condition === 'grappled' || e.also === 'grappled'));
    const fits = (c: Character) => (sp.needs === 'grappled' ? held(c) : sp.needs === 'prone' ? c.conditions.includes('prone') : true);
    if (!sp.area) {
      const inRange = heroes.filter((c) => fits(c) && this.mdist(m, c) * 5 <= Math.max(5, sp.range ?? 5) && sees(c));
      if (!inRange.length) return [];
      // Not twice on someone who already suffers from it.
      const fresh = inRange.filter((c) => !sp.rider?.condition || !(c.effects ?? []).some((e) => e.sourceId === m.id && e.source === sp.name));
      const pool = fresh.length ? fresh : sp.damage.length ? inRange : [];
      if (!pool.length) return [];
      return [prefer && pool.includes(prefer) ? prefer : pool.sort((a, b) => this.mdist(m, a) - this.mdist(m, b))[0]];
    }
    const area = sp.area;
    if (area.shape === 'emanation') return heroes.filter((c) => this.mdist(m, c) * 5 <= area.size && sees(c));
    const origin = this.mcentre(m);
    let best: Character[] = [];
    for (const aim of heroes) {
      const reach = area.shape === 'sphere' ? area.range ?? 60 : area.size;
      if (this.mdist(m, aim) * 5 > reach || !sees(aim)) continue;
      const caught = heroes.filter((c) => inArea(area, origin, aim, c) && (area.shape === 'sphere' ? this.los(aim, c) || c === aim : this.mdist(m, c) * 5 <= area.size && sees(c)));
      if (caught.length > best.length || (caught.length === best.length && prefer && caught.includes(prefer) && !best.includes(prefer))) best = caught;
    }
    return best;
  }

  /** A stand-in attack that makes the movement planner walk a special into range. */
  private aimFor(sp: MonsterSpecial): MonsterAttack {
    const range = sp.area ? (sp.area.shape === 'sphere' ? sp.area.range ?? 60 : Math.max(5, sp.area.size - 5)) : Math.max(5, sp.range ?? 5);
    return { name: sp.name, toHit: 0, damage: '1d4', damageType: 'force', range, ranged: range > 10 };
  }

  /**
   * What a monster does with its action. The Dungeon Master may name an attack, a special
   * or "Multiattack"; otherwise a breath weapon is used as soon as it is back, other specials
   * when they catch enough heroes, and a creature with Multiattack uses it.
   */
  private chooseAction(m: Monster, def: MonsterDef, wanted: string, target: Character, reachable: boolean, backOff: boolean): { name: string; rep?: MonsterAttack } {
    const w = wanted.trim().toLowerCase();
    const melee = def.attacks.find((a) => !a.ranged && this.usable(m, a));
    const rangedAtk = def.attacks.find((a) => a.ranged && this.usable(m, a));
    const specials = (def.specials ?? []).filter((s) => s.slot === 'action' && this.ready(m, s));
    const multiRep = () => {
      const names = [...(def.multi?.fixed ?? []), ...(def.multi?.options?.[0] ?? [])].map(([n]) => n);
      const steps = def.attacks.filter((a) => names.includes(a.name) && this.usable(m, a));
      const near = steps.find((a) => !a.ranged), far = steps.find((a) => a.ranged);
      if (backOff && far) return far;
      return (reachable || !far ? near : far) ?? near ?? far ?? melee ?? rangedAtk;
    };
    if (w) {
      const sp = specials.find((s) => s.name.toLowerCase() === w);
      if (sp) return { name: sp.name, rep: this.aimFor(sp) };
      if (w === 'multiattack' && def.multi) return { name: 'Multiattack', rep: multiRep() };
      const named = def.attacks.filter((a) => a.name.toLowerCase() === w && this.usable(m, a));
      if (named.length) return { name: named[0].name, rep: named.find((a) => !a.ranged && reachable) ?? named.find((a) => a.ranged) ?? named[0] };
    }
    for (const sp of specials) {
      if (sp.needs && !this.specialTargets(m, sp, target).length) continue;
      if (sp.recharge) return { name: sp.name, rep: this.aimFor(sp) };
      const caught = this.specialTargets(m, sp, target).length;
      if (caught >= 2 || (caught === 1 && this.rng() < 0.35)) return { name: sp.name, rep: this.aimFor(sp) };
    }
    if (def.multi) {
      // Now and then the one attack that cripples (a ghoul's paralysing claw) instead of the usual flurry.
      const flurry = [...def.multi.fixed, ...(def.multi.options ?? []).flat()].map(([n]) => n);
      const trick = def.attacks.find((a) => !a.ranged && a.rider?.condition && !flurry.includes(a.name) && this.usable(m, a) && !target.conditions.includes(a.rider.condition));
      if (trick && reachable && this.rng() < 0.3) return { name: trick.name, rep: trick };
      return { name: 'Multiattack', rep: multiRep() };
    }
    let chosen = melee && (reachable || !rangedAtk) ? melee : rangedAtk ?? melee;
    if (backOff && rangedAtk) chosen = rangedAtk;
    return { name: chosen?.name ?? '', rep: chosen };
  }

  /** The steps of a multiattack: the fixed ones, plus one of the alternatives the stat block offers. */
  private multiSteps(m: Monster, def: MonsterDef, prefer?: Character): string[] {
    const multi = def.multi!;
    const can = (name: string) => {
      const sp = (def.specials ?? []).find((s) => s.name === name);
      if (sp) return this.ready(m, sp) && this.specialTargets(m, sp, prefer).length > 0;
      return def.attacks.some((a) => a.name === name && this.usable(m, a));
    };
    const steps = [...multi.fixed];
    const options = (multi.options ?? []).filter((o) => o.every(([name]) => can(name)));
    if (options.length) {
      // A special that is ready beats another swing; between plain attacks, the first that can reach.
      const special = options.find((o) => o.some(([name]) => (def.specials ?? []).some((s) => s.name === name) || def.attacks.some((a) => a.name === name && a.spell)));
      const target = prefer ?? this.consciousChars()[0];
      const reaches = options.find((o) => o.every(([name]) => def.attacks.some((a) => a.name === name && target && this.mdist(m, target) * 5 <= (a.ranged ? a.longRange ?? a.range : a.range))));
      steps.push(...(special && this.rng() < 0.5 ? special : reaches ?? options[0]));
    }
    return steps.flatMap(([name, count]) => Array.from({ length: Math.max(1, Math.min(6, count)) }, () => name));
  }

  /** Everything a monster does after moving: its action (one attack, a multiattack or a special), then a bonus action if it has one to use. */
  private monsterActs(m: Monster, plan: MonsterPlan): Partial<MonsterActResult> {
    const def = MONSTERS[m.defId];
    const prefer = () => this.party().find((c) => c.id === plan.targetId && this.conscious(c));
    const names = plan.attack === 'Multiattack' && def.multi ? this.multiSteps(m, def, prefer()) : [plan.attack];
    const attacks: NonNullable<MonsterActResult['attack']>[] = [];
    const specials: string[] = [];
    const notes: string[] = [];
    for (const name of names) {
      if (!m.alive || this.s.phase !== 'combat' || !this.consciousChars().length) break;
      const r = this.monsterUse(m, def, name, plan);
      if (r.attack) attacks.push(r.attack);
      if (r.special) specials.push(r.special);
      if (r.note) notes.push(r.note);
      if (r.stop) break;
    }
    for (const sp of (def.specials ?? []).filter((s) => s.slot === 'bonus')) {
      if (!m.alive || this.s.phase !== 'combat' || !this.ready(m, sp)) continue;
      const caught = this.specialTargets(m, sp, prefer());
      if (caught.length) specials.push(this.resolveSpecial(m, sp, caught));
    }
    return {
      ...(attacks.length ? { attack: attacks[0] } : {}),
      ...(attacks.length > 1 ? { attacks } : {}),
      ...(specials.length ? { specials } : {}),
      ...(notes.length && !attacks.length && !specials.length ? { note: notes.join('; ') } : {}),
    };
  }

  /** One step of a monster's action by name: a special if it is ready and catches someone, otherwise an attack. */
  private monsterUse(m: Monster, def: MonsterDef, name: string, plan: MonsterPlan): { attack?: NonNullable<MonsterActResult['attack']>; special?: string; note?: string; stop?: boolean } {
    let target = this.party().find((c) => c.id === plan.targetId && this.conscious(c));
    const sp = (def.specials ?? []).find((s) => s.name === name && s.slot !== 'aura' && s.slot !== 'death');
    if (sp && this.ready(m, sp)) {
      const caught = this.specialTargets(m, sp, target);
      if (caught.length) return { special: this.resolveSpecial(m, sp, caught) };
    }
    const all = def.attacks.filter((a) => this.usable(m, a));
    const named = all.filter((a) => a.name === name);
    const melee = named.find((a) => !a.ranged) ?? all.find((a) => !a.ranged && !a.spell) ?? all.find((a) => !a.ranged);
    const rangedAtk = named.find((a) => a.ranged) ?? all.find((a) => a.ranged && !a.spell) ?? all.find((a) => a.ranged);
    let chosen = named[0] ?? melee ?? rangedAtk;
    if (!chosen) return { note: sp ? `nobody in reach of ${sp.name}` : `${m.name} has no attack to make`, stop: true };
    const byDist = (a: Character, b: Character) => this.mdist(m, a) - this.mdist(m, b);
    target ??= this.consciousChars().sort(byDist)[0];
    if (!target) return { note: 'its target is down', stop: true };
    const backOff = plan.tactic === 'retreat' || plan.tactic === 'disengage';
    const inReach = (t: Character, a: MonsterAttack) => this.mdist(m, t) * 5 <= (a.ranged ? a.longRange ?? a.range : a.range) && this.los(this.mpoint(m, t), t);
    const dist = this.mdist(m, target) * 5;
    if (!chosen.ranged && dist > chosen.range && rangedAtk && this.los(this.mpoint(m, target), target)) chosen = rangedAtk;
    if (chosen.ranged && dist <= 5 && melee && !backOff) chosen = melee;
    if (!inReach(target, chosen)) {
      // The one it went for is out of reach or already down; someone else may not be.
      const pick = chosen;
      const other = this.consciousChars().filter((c) => inReach(c, pick)).sort(byDist)[0];
      if (!other) {
        this.log('roll', plan.done ? this.t`${m.name} moves but cannot reach ${target.name}.` : this.t`${m.name} cannot reach ${target.name}.`);
        return { note: `could not reach ${target.name}`, stop: true };
      }
      target = other;
    }
    this.spend(m, chosen);
    if (chosen.spell) this.log('roll', this.t`${m.name} casts ${this.n(chosen.name)}.`);
    let last: NonNullable<MonsterActResult['attack']> | undefined;
    for (let i = 0; i < (chosen.count ?? 1); i++) {
      if (!m.alive) break;
      if (!this.conscious(target)) {
        const pick = chosen;
        const other = this.consciousChars().filter((c) => inReach(c, pick)).sort(byDist)[0];
        if (!other) break;
        target = other;
      }
      last = this.monsterStrike(m, target, chosen);
    }
    return { attack: last };
  }

  /**
   * A breath weapon, a gaze, a stench, a spell: every hero caught makes the saving throw.
   * Damage is rolled once for all. Returns a line for the Dungeon Master.
   */
  private resolveSpecial(m: Monster, sp: MonsterSpecial, targets: Character[]): string {
    this.spend(m, sp);
    if (sp.cooldown) (m.legCooldown ??= []).push(sp.name);
    if (sp.spell && this.counter(m, this.n(sp.name))) return `${sp.name} was countered`;
    const rolled = sp.damage.map((d) => ({ type: d.type, amount: this.rollDmg(d.dice) }));
    const label = this.n(sp.name);
    this.log('roll', sp.slot === 'death' ? this.t`${m.name} bursts apart: ${label}!` : sp.spell ? this.t`${m.name} casts ${label}!` : this.t`${m.name} uses ${label}!`);
    const out: string[] = [];
    for (const c of targets) {
      if (!this.conscious(c)) continue;
      const ok = this.heroSave(c, sp.save, sp.dc, label, sp.rider?.condition);
      let dealt = 0, down = false;
      // Evasion: nothing on a successful Dexterity save for half, and only half on a failure.
      const evades = sp.save === 'dex' && !!sp.half && this.feat(c, 'evasion') && !this.incapacitated(c);
      const halved = ok || evades;
      if (rolled.length && (!ok || sp.half) && !(ok && evades)) {
        const res = this.hurtHero(c, rolled.map((p) => ({ type: p.type, amount: halved ? Math.floor(p.amount / 2) : p.amount })));
        dealt = res.total; down = res.down;
        this.log('roll', (halved ? this.t`${c.name} takes half: ${this.dmgText(res.parts)}.` : this.t`${c.name} takes ${this.dmgText(res.parts)}.`) + (res.resisted ? ` ${this.t`(resisted, halved)`}` : '') + (down ? ` ${this.t`${c.name} falls unconscious!`}` : ''));
      }
      let condition: string | null = null;
      if (!ok && sp.rider && this.conscious(c)) condition = this.applyRider(c, { ...sp.rider, save: undefined }, m, sp.name, { ability: sp.save, dc: sp.dc });
      if (ok && sp.slot === 'aura') (m.shrugged ??= []).push(`${sp.name}:${c.id}`);
      out.push(`${c.name} ${ok ? 'saved' : 'failed'}${dealt ? `, ${dealt} damage (HP ${c.hp}/${c.maxHp})` : ''}${condition ? `, now ${condition}` : ''}${down ? ', down' : ''}`);
    }
    return `${sp.name} (${sp.save.toUpperCase()} save DC ${sp.dc}): ${out.join('; ') || 'nobody caught'}`;
  }

  /**
   * After a hero's turn, each legendary creature may spend one of its legendary actions:
   * an extra attack, a short move and a strike, a spell. They come back at the start of
   * its own turn. The engine picks one that can reach someone.
   */
  private legendaryActions() {
    for (const m of this.s.monsters) {
      if (this.mHelpless(m)) continue;
      if (this.s.phase !== 'combat' || !this.consciousChars().length) return;
      const def = MONSTERS[m.defId];
      if (!m.alive || !def.legendary) continue;
      const left = m.legLeft ?? def.legendary.uses;
      if (left <= 0) continue;
      const viable = def.legendary.options.map((o) => ({ o, run: this.legendaryPlan(m, def, o) })).filter((x) => x.run);
      if (!viable.length) continue;
      const pick = viable[Math.floor(this.rng() * viable.length)];
      m.legLeft = left - 1;
      if (pick.o.cooldown) (m.legCooldown ??= []).push(pick.o.name);
      this.log('roll', this.t`Legendary action: ${m.name} uses ${this.n(pick.o.name)}.`);
      pick.run!();
      this.settleDeaths();
    }
  }

  /** How a legendary option would play out right now, or null when it has nobody to reach. */
  private legendaryPlan(m: Monster, def: MonsterDef, o: LegendaryOption): (() => void) | null {
    if (o.cooldown && m.legCooldown?.includes(o.name)) return null;
    const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const sp = (def.specials ?? []).find((s) => (o.use && s.name === o.use) || (o.spell && s.spell && slugOf(s.name) === o.spell));
    if (sp) {
      if (!this.ready(m, sp)) return null;
      const caught = this.specialTargets(m, sp);
      return caught.length ? () => { this.resolveSpecial(m, sp, caught); } : null;
    }
    const atk = def.attacks.find((a) => (o.use && a.name === o.use && !a.ranged) || (o.spell && a.spell && slugOf(a.name) === o.spell)) ?? def.attacks.find((a) => o.use && a.name === o.use);
    if (!atk || !this.usable(m, atk)) return null;
    const heroes = this.consciousChars();
    const inReach = (t: Character) => this.mdist(m, t) * 5 <= (atk.ranged ? atk.longRange ?? atk.range : atk.range) && this.los(this.mpoint(m, t), t);
    const strike = (t: Character) => {
      this.spend(m, atk);
      for (let i = 0; i < (atk.count ?? 1) && this.conscious(t); i++) this.monsterStrike(m, t, atk);
    };
    const near = heroes.filter(inReach).sort((a, b) => a.hp - b.hp)[0];
    if (near) return () => strike(near);
    if (!o.move || atk.ranged) return null;
    // A short move first. Legendary movement is not stopped for opportunity attacks.
    const size = this.tilesOf(m);
    const reach = Math.max(1, Math.floor(atk.range / 5));
    const budget = Math.floor(def.speed / 5 / (o.move === 'half' ? 2 : 1));
    for (const t of [...heroes].sort((a, b) => this.mdist(m, a) - this.mdist(m, b))) {
      const path = this.bfs(m, (p) => distToFootprint(p, size, t) <= reach && !this.monsterBlocked(p, m), (p) => !this.monsterBlocked(p, m));
      if (!path || this.pathCost(path) > budget) continue;
      return () => {
        const end = path[path.length - 1];
        if (end) { m.x = end.x; m.y = end.y; this.moves.push({ id: m.id, path }); }
        strike(t);
      };
    }
    return null;
  }

  /** What follows from monsters dying: their grip and their spells let go, and some burst. */
  private settleDeaths() {
    while (this.fallen.length) {
      const m = this.s.monsters.find((x) => x.id === this.fallen[0]);
      this.fallen.shift();
      if (!m) continue;
      for (const c of this.party()) this.endEffects(c, (e) => e.sourceId === m.id && (['escape', 'source_start', 'source_end'].includes(e.ends) || e.condition === 'charmed' || e.condition === 'frightened'));
      if (this.s.phase !== 'combat') continue;
      for (const sp of (MONSTERS[m.defId].specials ?? []).filter((s) => s.slot === 'death')) {
        const caught = this.consciousChars().filter((c) => this.mdist(m, c) * 5 <= (sp.area?.size ?? 5));
        if (caught.length) this.resolveSpecial(m, sp, caught);
      }
    }
  }

  /** What the players see a creature can do beyond its plain attacks. */
  private notable(def: MonsterDef): string[] {
    const f = def.flags ?? {};
    const names = [
      def.multi ? 'Multiattack' : '',
      ...(def.specials ?? []).filter((s) => !s.spell).map((s) => s.name),
      def.specials?.some((s) => s.spell) || def.attacks.some((a) => a.spell) ? 'Spellcasting' : '',
      f.regeneration ? 'Regeneration' : '', f.packTactics ? 'Pack Tactics' : '', f.magicResistance ? 'Magic Resistance' : '', f.legendaryResistance ? 'Legendary Resistance' : '',
      f.undeadFortitude ? 'Undead Fortitude' : '', f.parry ? 'Parry' : '', f.flyby ? 'Flyby' : '', f.aura ? 'Fire Aura' : '', def.legendary ? 'Legendary actions' : '',
    ].filter(Boolean);
    return [...new Set(names)].map((x) => this.n(x));
  }

  // ---------------------------------------------------- conditions on heroes

  incapacitated(c: Character) { return INCAPACITATING.some((x) => c.conditions.includes(x)); }

  /** Living monsters this hero is frightened of. */
  private frighteners(c: Character): Monster[] {
    return (c.effects ?? []).filter((e) => e.condition === 'frightened').map((e) => this.s.monsters.find((m) => m.id === e.sourceId && m.alive)).filter((m): m is Monster => !!m);
  }

  /** Does a condition give this hero disadvantage on attack rolls? */
  private hampered(c: Character) {
    return HAMPERED.some((x) => c.conditions.includes(x)) || this.frighteners(c).length > 0;
  }

  /** Rebuild the condition chips from the effects in force. */
  private syncConditions(c: Character) {
    const own = c.conditions.filter((x) => !(HERO_CONDITIONS as readonly string[]).includes(x));
    const now = new Set<string>();
    for (const e of c.effects ?? []) { now.add(e.condition); if (e.also) now.add(e.also); }
    c.conditions = [...own, ...now];
  }

  /** Lift the effects that match, and say so. */
  private endEffects(c: Character, which: (e: HeroEffect) => boolean, quiet = false) {
    const gone = (c.effects ?? []).filter(which);
    if (!gone.length) return;
    c.effects = (c.effects ?? []).filter((e) => !gone.includes(e));
    this.syncConditions(c);
    if (quiet || c.dead) return;
    const names = [...new Set(gone.flatMap((e) => [e.condition, ...(e.also ? [e.also] : [])]))].filter((x) => !c.conditions.includes(x));
    if (names.length) this.log('roll', this.t`${c.name} is no longer ${names.map((x) => this.n(x)).join(', ')}.`);
  }

  /** When a fight is over, what the monsters did to the heroes wears off. */
  private clearEffects() {
    for (const c of this.party()) {
      if (!c.effects?.length) continue;
      c.effects = [];
      this.syncConditions(c);
    }
  }

  /** A hero's saving throw bonus: the ability, proficiency for the saves of the class, and a paladin's Aura of Protection. */
  private heroSaveMod(c: Character, ability: AbilityKey) {
    const aura = Math.max(0, ...this.auras(c, 'aura_of_protection').map((p) => Math.max(1, this.mod(p, 'cha'))));
    const items = this.worn(c).reduce((n, d) => n + (d.saveBonus ?? 0), 0);
    return abilityMod(c.abilities[ability]) + (saveProfs(c).includes(ability) ? c.profBonus : 0) + aura + items;
  }

  /** A hero's saving throw, rolled and logged. `vs` is the condition at stake, for species and features that resist it. */
  private heroSave(c: Character, ability: AbilityKey, dc: number, against: string, vs?: string): boolean {
    const save = this.n(ability.toUpperCase());
    const ward = this.wards(c, vs);
    if (ward) {
      this.log('roll', this.t`${c.name} cannot be ${this.n(vs!)} (${this.n(ward)}).`);
      return true;
    }
    if ((ability === 'str' || ability === 'dex') && HELPLESS.some((x) => c.conditions.includes(x))) {
      this.log('roll', this.t`${c.name} cannot resist ${against}: the ${save} save fails automatically.`);
      return false;
    }
    const adv = (vs === 'charmed' && c.speciesId === 'elf') || (vs === 'frightened' && c.speciesId === 'halfling') || (vs === 'poisoned' && c.speciesId === 'dwarf')
      || (c.speciesId === 'gnome' && (ability === 'int' || ability === 'wis' || ability === 'cha'))
      || (ability === 'dex' && this.feat(c, 'danger_sense') && !this.incapacitated(c)) || (ability === 'str' && c.conditions.includes('raging'))
      || this.buffsOf(c).some((b) => b.saveAdv === 'all' || b.saveAdv?.includes(ability));
    const mode = rollMode(adv, ability === 'dex' && c.conditions.includes('restrained'));
    const mod = this.heroSaveMod(c, ability) + this.blessDie(c);
    const r = this.heroD20(c, mode);
    let total = r.value + mod;
    // Indomitable Might: a Strength save is never lower than the Strength score.
    if (ability === 'str' && this.feat(c, 'indomitable_might')) total = Math.max(total, c.abilities.str);
    const ok = total >= dc;
    const info: RollInfo = { actor: c.name, label: this.t`${save} save against ${against}`, die: r.value, rolls: r.rolls, mode, modifier: mod, total, target: { kind: 'DC', value: dc }, outcome: ok ? 'success' : 'failure' };
    this.log('roll', this.t`${c.name}: ${save} save against ${against}, ${this.d20Text(r, mode)}${signed(mod)} = ${total} vs DC ${dc}. ${ok ? this.t`Success.` : this.t`Failure.`}`, { roll: info });
    if (ok) return true;
    // Second chances, cheapest first.
    const verdict = (good: boolean) => (good ? this.t`Success.` : this.t`Failure.`);
    const add = (what: string, n: number) => {
      total += n;
      this.log('roll', this.t`${c.name}: ${this.n(what)} adds ${n}, ${total} vs DC ${dc}. ${verdict(total >= dc)}`);
      return total >= dc;
    };
    const again = (what: string, bonus: number, how: RollMode = 'normal') => {
      const r2 = this.heroD20(c, how);
      const t2 = r2.value + mod + bonus;
      this.log('roll', this.t`${c.name}: ${what} rolls the save again, ${this.d20Text(r2, how)}${signed(mod + bonus)} = ${t2} vs DC ${dc}. ${verdict(t2 >= dc)}`);
      return t2 >= dc;
    };
    if (c.inspired) {
      const die = rollDie(c.inspired, this.rng);
      c.inspired = undefined;
      if (add('Bardic Inspiration', die)) return true;
    }
    if (this.feat(c, 'dark_ones_own_luck') && this.left(c, 'dark_luck') > 0) {
      this.spendUse(c, 'dark_luck');
      if (add("Dark One's Own Luck", rollDie(10, this.rng))) return true;
    }
    if (c.feats.includes('boon_fate') && this.s.phase === 'combat' && !c.uses?.fate) {
      (c.uses ??= {}).fate = 1;
      if (add('Boon of Fate', roll('2d4', this.rng).total)) return true;
    }
    if (this.feat(c, 'indomitable') && this.left(c, 'indomitable') > 0) {
      this.spendUse(c, 'indomitable');
      if (again(this.n('Indomitable'), c.level)) return true;
    }
    if (this.feat(c, 'disciplined_survivor') && this.left(c, 'focus') > 0) {
      this.spendUse(c, 'focus');
      if (again(this.n('Disciplined Survivor'), 0)) return true;
    }
    if (vs === 'charmed' || vs === 'frightened') {
      const bard = this.s.characters.find((b) => this.feat(b, 'countercharm') && this.conscious(b) && !this.incapacitated(b) && this.canReact(b.id) && (b.id === c.id || cheb(b, c) <= 6));
      if (bard) {
        this.useReaction(bard.id);
        if (again(this.t`${bard.name}'s Countercharm`, 0, 'advantage')) return true;
      }
    }
    return false;
  }

  /** "13 slashing damage + 5 fire damage" */
  private dmgText(parts: { amount: number; type: string }[]) {
    return parts.map((p) => `${p.amount} ${this.n(`${p.type} damage`)}`).join(' + ');
  }

  /**
   * Damage of one or more types against a hero: resistances halve their share, reactions
   * blunt an attack, temporary hit points go first, and a sleeper wakes.
   */
  private hurtHero(c: Character, parts: { amount: number; type: string }[], opts: { attack?: boolean } = {}): { total: number; down: boolean; resisted: boolean; parts: { amount: number; type: string }[] } {
    let resisted = false;
    const stone = c.conditions.includes('petrified');
    let dealt = parts.map((p) => {
      if (stone || this.resists(c, p.type)) { resisted = true; return { type: p.type, amount: Math.floor(p.amount / 2) }; }
      return { ...p };
    });
    const sum = () => dealt.reduce((n, p) => n + p.amount, 0);
    if (opts.attack && sum() > 0 && this.s.combat && !this.incapacitated(c) && this.canReact(c.id)) {
      const physical = (t: string) => ['bludgeoning', 'piercing', 'slashing'].includes(t);
      if (this.feat(c, 'uncanny_dodge') || this.feat(c, 'superior_hunters_defense')) {
        this.useReaction(c.id);
        dealt = dealt.map((p) => ({ type: p.type, amount: Math.floor(p.amount / 2) }));
        this.log('roll', this.t`${c.name} twists away and halves the blow.`);
      } else if (this.feat(c, 'deflect_attacks') && (this.feat(c, 'deflect_energy') || dealt.some((p) => physical(p.type)))) {
        this.useReaction(c.id);
        let cut = roll('1d10', this.rng).total + this.mod(c, 'dex') + c.level;
        const before = sum();
        for (const p of dealt) {
          if (!this.feat(c, 'deflect_energy') && !physical(p.type)) continue;
          const off = Math.min(cut, p.amount);
          p.amount -= off; cut -= off;
        }
        this.log('roll', this.t`${c.name} deflects the attack, reducing the damage by ${before - sum()}.`);
      }
    }
    // Resistance (the cantrip): the first damage of a round is a die smaller.
    if (sum() > 0 && this.buffOn(c, 'soak') && this.once(`${c.id}:soak`)) {
      let cut = this.buffsOf(c).reduce((n, b) => n + (b.soak ? roll(b.soak, this.rng).total : 0), 0);
      for (const p of dealt) { const off = Math.min(cut, p.amount); p.amount -= off; cut -= off; }
    }
    const total = sum();
    const soaked = Math.min(c.tempHp ?? 0, total);
    if (soaked) c.tempHp = (c.tempHp ?? 0) - soaked;
    const down = total - soaked > 0 ? this.damageChar(c, total - soaked) : false;
    if (total > 0) this.endEffects(c, (e) => e.condition === 'asleep');
    if (down) this.endEffects(c, () => true, true);
    if (total > 0) this.concentrationCheck(c, total);
    return { total, down, resisted, parts: dealt };
  }

  /** Shove a hero straight away from a monster, as far as the ground allows. */
  private pushHero(c: Character, m: Monster, feet: number) {
    const from = this.mcentre(m);
    const sx = Math.sign(Math.round(c.x - from.x)), sy = Math.sign(Math.round(c.y - from.y));
    if (!sx && !sy) return;
    const path: Pt[] = [];
    for (let i = 0; i < Math.floor(feet / 5); i++) {
      const next = { x: c.x + sx, y: c.y + sy };
      if (!this.walkable(next.x, next.y) || this.monsterAt(next.x, next.y) || this.charAt(next.x, next.y, c.id)) break;
      c.x = next.x; c.y = next.y; path.push(next);
    }
    if (path.length) {
      this.moves.push({ id: c.id, path });
      this.log('roll', this.t`${c.name} is hurled ${path.length * 5} ft back.`);
    }
  }

  /**
   * What a hit or a failed save does besides damage: a condition, a shove. Returns the
   * condition applied, if any. `repeat` is the save that may end it at the end of each turn.
   */
  private applyRider(c: Character, r: Rider, m: Monster, source: string, repeat?: { ability: AbilityKey; dc: number }): string | null {
    // Heroes are Medium (or Small, which every size limit in the SRD includes).
    if (r.maxSize && SIZES.indexOf(r.maxSize) < SIZES.indexOf('small')) return null;
    if (r.ifMoved && (m.movedFt ?? 0) < r.ifMoved) return null;
    if (r.save && this.heroSave(c, r.save.ability, r.save.dc, this.n(source), r.condition)) return null;
    if (r.extra) {
      const res = this.hurtHero(c, [{ amount: this.rollDmg(r.extra.dice), type: r.extra.type }]);
      this.log('roll', this.t`The charge hits ${c.name} for another ${this.dmgText(res.parts)}.` + (res.down ? ` ${this.t`${c.name} falls unconscious!`}` : ''));
      if (!this.conscious(c)) return null;
    }
    if (r.push) this.pushHero(c, m, r.push);
    if (!r.condition) return null;
    const rename = (x: string) => (x === 'unconscious' ? 'asleep' : x);
    const condition = rename(r.condition);
    const ward = this.wards(c, condition);
    if (ward) {
      this.log('roll', this.t`${c.name} cannot be ${this.n(condition)} (${this.n(ward)}).`);
      return null;
    }
    const save = repeat ?? r.save;
    let ends: EffectEnd = r.ends ?? 'minute';
    if (ends === 'save_end' && !save) ends = 'minute';
    const e: HeroEffect = {
      condition, sourceId: m.id, source, ends,
      ...(r.also ? { also: rename(r.also) } : {}),
      ...(ends === 'save_end' || ends === 'minute' ? { rounds: 10 } : {}),
      ...(ends === 'save_end' && save ? { save } : {}),
      ...(r.escapeDc ? { escapeDc: r.escapeDc } : {}),
      ...(r.escalate ? { escalate: rename(r.escalate) } : {}),
      ...(r.noHealing ? { noHealing: true } : {}),
      ...(ends === 'source_end' && this.acting === m.id ? { skip: true } : {}),
    };
    const already = (c.effects ?? []).some((x) => x.condition === condition);
    c.effects = (c.effects ?? []).filter((x) => !(x.condition === condition && x.sourceId === m.id));
    c.effects.push(e);
    if (INCAPACITATING.includes(condition)) c.conditions = c.conditions.filter((x) => x !== 'dodging');
    this.syncConditions(c);
    if (!already) {
      const what = [condition, ...(e.also ? [e.also] : [])].map((x) => this.n(x)).join(', ');
      this.log('roll', this.t`${c.name} is now ${what}.` + (e.escapeDc ? ` ${this.t`Breaking free takes an action and a check against DC ${e.escapeDc}.`}` : ''));
    }
    return condition;
  }

  /** Is the monster that grapples this hero still there and close enough to hold on? */
  private holds(e: HeroEffect, c: Character) {
    const m = this.s.monsters.find((x) => x.id === e.sourceId);
    return !!m && m.alive && this.mdist(m, c) <= Math.max(1, this.monsterReach(m));
  }

  /**
   * The start of a hero's turn in a fight. Auras of nearby monsters take their toll, short
   * effects run out, a hero knocked down gets up. Returns false when the hero cannot act:
   * the turn is then spent, including the saving throws that come at its end.
   */
  private heroTurnStart(c: Character): boolean {
    const combat = this.s.combat!;
    c.conditions = c.conditions.filter((x) => x !== 'reckless');
    this.expireBuffs(c, 'turn');
    for (const b of c.buffs ?? []) if (SPELL_BUFFS[b.id]?.tempTurn && b.n) this.giveTemp(c, b.n);
    this.zoneTick(c);
    if (this.s.phase !== 'combat') return false;
    for (const m of this.s.monsters) this.liftMonster(m, (e) => e.untilHero === c.id);
    // Survivor: a badly hurt champion rallies at the start of every turn.
    if (this.feat(c, 'survivor') && c.hp > 0 && c.hp * 2 <= c.maxHp) {
      const healed = this.healChar(c, 5 + this.mod(c, 'con'));
      if (healed) this.log('roll', this.t`${c.name} rallies and regains ${healed} HP (Survivor).`);
    }
    this.endEffects(c, (e) => e.ends === 'target_start');
    this.endEffects(c, (e) => e.ends === 'escape' && !this.holds(e, c));
    for (const m of this.s.monsters) {
      if (!m.alive) continue;
      for (const sp of (MONSTERS[m.defId].specials ?? []).filter((s) => s.slot === 'aura')) {
        if (!this.conscious(c)) break;
        if (m.shrugged?.includes(`${sp.name}:${c.id}`) || this.mdist(m, c) * 5 > (sp.area?.size ?? 5)) continue;
        if ((c.effects ?? []).some((e) => e.sourceId === m.id && e.source === sp.name)) continue;
        this.resolveSpecial(m, sp, [c]);
      }
    }
    if (!this.conscious(c)) return false;
    if (this.incapacitated(c)) {
      const why = INCAPACITATING.filter((x) => c.conditions.includes(x)).map((x) => this.n(x)).join(', ');
      this.log('system', this.t`${c.name} is ${why} and loses the turn.`);
      this.heroTurnEnd(c);
      return false;
    }
    if (HELD.some((x) => c.conditions.includes(x))) combat.movementLeft = 0;
    else if (c.conditions.includes('prone')) {
      this.endEffects(c, (e) => e.condition === 'prone', true);
      combat.movementLeft = Math.ceil(combat.movementLeft / 2);
      this.log('roll', this.t`${c.name} gets back up, which costs half the movement.`);
    }
    return true;
  }

  /** The end of a hero's turn: effects that last until now run out, and saves against lasting ones are repeated. */
  private heroTurnEnd(c: Character) {
    if (this.feat(c, 'self_restoration')) this.endEffects(c, (e) => ['charmed', 'frightened', 'poisoned'].includes(e.condition));
    if (c.uses?._veil && --c.uses._veil <= 0) {
      delete c.uses._veil;
      c.conditions = c.conditions.filter((x) => x !== 'invisible');
      this.log('roll', this.t`${c.name} is visible again.`);
    }
    for (const e of [...(c.effects ?? [])]) {
      if (!c.effects?.includes(e)) continue;
      if (e.ends === 'target_end') { this.endEffects(c, (x) => x === e); continue; }
      if (e.ends === 'save_end' && e.save) {
        if (this.heroSave(c, e.save.ability, e.save.dc, this.n(e.source ?? e.condition), e.condition)) { this.endEffects(c, (x) => x === e); continue; }
        if (e.escalate) {
          e.condition = e.escalate;
          delete e.escalate;
          if (e.condition === 'petrified') { e.ends = 'combat'; delete e.rounds; delete e.save; }
          else if (e.condition === 'asleep') { e.ends = 'minute'; e.rounds = 10; }
          this.syncConditions(c);
          this.log('roll', this.t`It gets worse: ${c.name} is now ${this.n(e.condition)}.`);
          continue;
        }
      }
      if (e.rounds !== undefined && --e.rounds <= 0) this.endEffects(c, (x) => x === e);
    }
  }

  /** Break free: an action, and a Strength (Athletics) or Dexterity (Acrobatics) check against the escape DC. */
  escape(playerId: string, characterId: string) {
    const c = this.actor(playerId, characterId);
    const e = (c.effects ?? []).find((x) => x.escapeDc);
    if (!e || this.s.phase !== 'combat' || !this.s.combat) throw new GameError(this.t`${c.name} is not held by anything`);
    this.spendAction();
    const skill = (ability: AbilityKey, name: string) => abilityMod(c.abilities[ability]) + (c.skills.includes(name) ? c.profBonus * (c.expertise.includes(name) ? 2 : 1) : 0);
    const mod = Math.max(skill('str', 'athletics'), skill('dex', 'acrobatics'));
    const mode: RollMode = c.conditions.includes('poisoned') ? 'disadvantage' : 'normal';
    const r = this.heroD20(c, mode);
    const total = r.value + mod;
    const ok = total >= e.escapeDc!;
    const info: RollInfo = { actor: c.name, label: this.t`Break free`, die: r.value, rolls: r.rolls, mode, modifier: mod, total, target: { kind: 'DC', value: e.escapeDc! }, outcome: ok ? 'success' : 'failure' };
    this.log('roll', this.t`${c.name} strains to break free: ${this.d20Text(r, mode)}${signed(mod)} = ${total} vs DC ${e.escapeDc}. ${ok ? this.t`Free!` : this.t`The grip holds.`}`, { roll: info });
    if (!ok) return;
    this.endEffects(c, (x) => x === e, true);
    if (!HELD.some((x) => c.conditions.includes(x))) this.s.combat.movementLeft = Math.floor(c.speed / 5);
  }

  /** How many squares a monster's melee attacks reach. */
  private monsterReach(m: Monster) {
    const melee = MONSTERS[m.defId].attacks.filter((a) => !a.ranged);
    return melee.length ? Math.max(1, Math.floor(Math.max(...melee.map((a) => a.range)) / 5)) : 0;
  }

  /** Monsters that get an opportunity attack when a hero steps from `from` to `to`. */
  private monstersLeftBy(c: Character, from: Pt, to: Pt): Monster[] {
    const reacted = this.s.combat?.reacted ?? [];
    return this.s.monsters.filter((m) => {
      if (!m.alive || reacted.includes(m.id) || this.mHelpless(m)) return false;
      const reach = this.monsterReach(m);
      return reach > 0 && this.mdist(m, from) <= reach && this.mdist(m, to) > reach && this.monsterSees(m, c);
    });
  }

  /** Roll one monster attack against a hero and apply it: damage of every type it deals, then what else a hit does. */
  private monsterStrike(m: Monster, target: Character, chosen: MonsterAttack, opts: { reaction?: boolean } = {}): NonNullable<MonsterActResult['attack']> {
    const def = MONSTERS[m.defId];
    if (!m.alive) return { name: chosen.name, target: target.name, hit: false, crit: false, damage: 0, targetHp: target.hp, targetDown: false };
    const dist = this.mdist(m, target) * 5;
    const eye = this.mpoint(m, target);
    const label = this.n(chosen.name);
    const finish = (crit: boolean, hadAdv: boolean, head: string, info?: (outcome: RollInfo['outcome'], damage?: RollInfo['damage']) => RollInfo): NonNullable<MonsterActResult['attack']> => {
      const parts = [{ amount: this.rollDmg(chosen.damage, crit), type: chosen.damageType }];
      for (const x of chosen.extra ?? []) if (!x.ifAdv || hadAdv) parts.push({ amount: this.rollDmg(x.dice, crit), type: x.type });
      parts[0].amount = Math.max(1, parts[0].amount);
      const res = this.hurtHero(target, parts, { attack: true });
      const dmg = this.dmgText(res.parts) + (res.resisted ? ` ${this.t`(resisted, halved)`}` : '');
      const text = info ? this.t`${head} ${crit ? this.t`Critical hit` : this.t`Hit`} for ${dmg}.` : this.t`${head} ${dmg}.`;
      this.log('roll', text + (res.down ? ` ${this.t`${target.name} falls unconscious!`}` : ''), info ? { roll: info(crit ? 'crit' : 'hit', { amount: res.total, type: chosen.damageType }) } : {});
      const condition = chosen.rider && this.conscious(target) ? this.applyRider(target, chosen.rider, m, chosen.name) : null;
      // Fire Shield burns whoever strikes from close by; Hellish Rebuke answers the hurt.
      const thorns = this.buffsOf(target).find((b) => b.thorns);
      if (thorns?.thorns && m.alive && this.mdist(m, target) <= 1) {
        const back = this.damageMonster(m, roll(thorns.thorns.dice, this.rng).total, thorns.thorns.type);
        this.log('roll', this.t`Flames lash back at ${m.name} for ${back.dealt} ${this.n(`${thorns.thorns.type} damage`)}.${back.note}`);
      }
      if (res.total > 0) this.rebuke(target, m);
      // Retaliation: a berserker hurt from close by strikes back at once.
      if (this.feat(target, 'retaliation') && this.conscious(target) && !this.incapacitated(target) && this.canReact(target.id) && m.alive && this.mdist(m, target) <= 1 && this.s.phase === 'combat') {
        this.useReaction(target.id);
        this.log('roll', this.t`${target.name} retaliates!`);
        this.strike(target, m, { reaction: true });
      }
      return { name: chosen.name, target: target.name, hit: true, crit, damage: res.total, targetHp: target.hp, targetDown: res.down || !this.conscious(target), ...(condition ? { condition } : {}) };
    };
    if (chosen.auto) return finish(false, false, this.t`${label} strikes ${target.name} unerringly:`);
    const adjacentFoe = this.consciousChars().some((c) => this.mdist(m, c) <= 1);
    const pack = !!def.packTactics && this.s.monsters.some((o) => o.alive && o.id !== m.id && this.mdist(o, target) <= 1);
    const seen = this.sight(m.name, target.name, this.monsterSees(m, target), this.heroSees(target, m));
    const prone = target.conditions.includes('prone');
    const held = (target.effects ?? []).some((e) => e.sourceId === m.id && (e.condition === 'grappled' || e.also === 'grappled'));
    const edge = chosen.advIf === 'grappled' ? held : chosen.advIf === 'wounded' ? target.hp < target.maxHp : chosen.advIf === 'first_round' ? this.s.combat?.round === 1 : false;
    // Elusive: nothing gives an attacker advantage against a rogue who can still act.
    const elusive = this.feat(target, 'elusive') && !this.incapacitated(target);
    const adv = !elusive && (pack || seen.adv || edge || target.conditions.includes('reckless') || EXPOSED.some((x) => target.conditions.includes(x)) || (prone && dist <= 5) || (!!def.flags?.bloodiedFury && m.hp * 2 <= m.maxHp));
    const dis = seen.dis || target.conditions.includes('dodging') || target.conditions.includes('invisible') || (prone && dist > 5) || (!!chosen.ranged && (adjacentFoe || dist > chosen.range))
      || MONSTER_HAMPERED.some((x) => this.mHas(m, x)) || this.buffOn(target, 'blur')
      || this.buffsOf(target).some((b) => b.wardTypes?.includes(def.type))
      || (this.feat(target, 'defensive_tactics') && !!this.s.combat?.once?.includes(`${m.id}:hit:${target.id}`));
    const mode = rollMode(adv, dis);
    const r = d20(this.rng, mode);
    const total = r.value + chosen.toHit - (this.mHas(m, 'baned') ? rollDie(4, this.rng) : 0);
    const cover = chosen.ranged ? this.coverBonus(eye, target) : 0;
    const ac = target.ac + cover;
    const head = (opts.reaction ? this.t`Opportunity attack! ` : '') + this.t`${m.name} attacks ${target.name} with ${label}: ${this.d20Text(r, mode)}${signed(chosen.toHit)} = ${total} vs AC ${ac}.` + (cover ? ` ${this.t`${target.name} has half cover.`}` : '') + seen.note;
    const info = (outcome: RollInfo['outcome'], damage?: RollInfo['damage']): RollInfo =>
      ({ actor: m.name, label: (opts.reaction ? `${this.t`Opportunity attack`}: ` : '') + label, die: r.value, rolls: r.rolls, mode, modifier: chosen.toHit, total, target: { kind: 'AC', value: ac, name: target.name }, outcome, damage });
    if (r.value === 1 || (r.value !== 20 && total < ac)) {
      this.log('roll', this.t`${head} Miss.`, { roll: info('miss') });
      return { name: chosen.name, target: target.name, hit: false, crit: false, damage: 0, targetHp: target.hp, targetDown: false };
    }
    if (this.shieldReaction(target, total, ac, r.value === 20)) {
      this.log('roll', this.t`${head} The blow glances off: Miss.`, { roll: info('miss') });
      return { name: chosen.name, target: target.name, hit: false, crit: false, damage: 0, targetHp: target.hp, targetDown: false };
    }
    // Mirror Image: a d6 for each double; on a 3 or more one of them takes the hit instead.
    const images = (target.buffs ?? []).find((b) => (b.images ?? 0) > 0);
    if (images && Array.from({ length: images.images! }, () => rollDie(6, this.rng)).some((x) => x >= 3)) {
      images.images!--;
      this.log('roll', this.t`${head} The blow strikes a mirror image, which bursts (${images.images} left).`, { roll: info('miss') });
      if (!images.images) this.removeBuffs(target, (b) => b === images);
      return { name: chosen.name, target: target.name, hit: false, crit: false, damage: 0, targetHp: target.hp, targetDown: false };
    }
    // Cutting Words: a bard nearby spends inspiration to turn the hit into a miss, when the die could do it.
    const bard = r.value === 20 ? undefined : this.s.characters.find((b) => this.feat(b, 'cutting_words') && this.conscious(b) && !this.incapacitated(b) && this.canReact(b.id) && this.left(b, 'inspiration') > 0
      && this.mdist(m, b) <= 12 && total - inspirationDie(b) < ac);
    if (bard) {
      const die = rollDie(inspirationDie(bard), this.rng);
      this.spendUse(bard, 'inspiration');
      this.useReaction(bard.id);
      if (total - die < ac) {
        this.log('roll', this.t`${head} ${bard.name}'s Cutting Words take ${die} off the roll: Miss.`, { roll: info('miss') });
        return { name: chosen.name, target: target.name, hit: false, crit: false, damage: 0, targetHp: target.hp, targetDown: false };
      }
      this.log('roll', this.t`${bard.name}'s Cutting Words take ${die} off the roll, but the blow still lands.`);
    }
    this.once(`${m.id}:hit:${target.id}`);
    // A hit on a paralysed or sleeping hero from right next to them is a critical hit.
    const crit = r.value === 20 || (dist <= 5 && (target.conditions.includes('paralyzed') || target.conditions.includes('asleep')));
    return finish(crit, mode === 'advantage', head, info);
  }

  // ---------------------------------------------------------- class features
  // What the twelve classes can do beyond attacking and casting. The tables are in
  // shared/classes.ts; this is where the engine applies them.

  private feat(c: Character, id: string) { return hasFeature(c, id); }
  private opted(c: Character, id: string) { return !!c.options?.includes(id); }
  private left(c: Character, res: string) { return resourceLeft(c, res); }
  private spendUse(c: Character, res: string, n = 1) { (c.uses ??= {})[res] = (c.uses[res] ?? 0) + n; }
  private regain(c: Character, res: string, n: number) { if (c.uses?.[res]) c.uses[res] = Math.max(0, c.uses[res] - n); }
  private mod(c: Character, k: AbilityKey) { return abilityMod(c.abilities[k]); }
  /** The DC of a class feature: 8 + proficiency + the ability behind it. */
  private dcOf(c: Character, k: AbilityKey) { return 8 + c.profBonus + this.mod(c, k); }

  /** True the first time it is asked on a turn; the feature is then used up until the next turn begins. */
  private once(key: string): boolean {
    const combat = this.s.combat;
    if (!combat) return true;
    if ((combat.once ??= []).includes(key)) return false;
    combat.once.push(key);
    return true;
  }
  private primed(key: string) { return !!this.s.combat?.primed?.includes(key); }
  private prime(key: string) { const combat = this.s.combat; if (combat && !this.primed(key)) (combat.primed ??= []).push(key); }
  private unprime(key: string) { const combat = this.s.combat; if (combat?.primed) combat.primed = combat.primed.filter((x) => x !== key); }
  private canReact(id: string) { return !this.s.combat?.reacted?.includes(id); }
  private useReaction(id: string) { const combat = this.s.combat; if (combat) (combat.reacted ??= []).push(id); }

  /** Temporary hit points never add up: the larger amount stays. */
  private giveTemp(c: Character, n: number) { c.tempHp = Math.max(c.tempHp ?? 0, n); }

  /** The items a hero wears or holds. */
  private worn(c: Character): ItemDef[] {
    return SLOT_IDS.flatMap((slot) => (c.equipment[slot] ? [this.def(c.equipment[slot]!.defId)] : []));
  }

  /**
   * Belts, gauntlets and amulets that set an ability score: undo what they gave before, then give
   * what is worn now. A higher Constitution raises the hit point maximum with it.
   */
  private applyBoosts(c: Character) {
    const conBefore = abilityMod(c.abilities.con);
    for (const [k, v] of Object.entries(c.boost ?? {}) as [AbilityKey, number][]) c.abilities[k] -= v;
    const boost: Partial<Record<AbilityKey, number>> = {};
    for (const d of this.worn(c)) {
      for (const [k, v] of Object.entries(d.scores ?? {}) as [AbilityKey, number][]) {
        const gain = v - c.abilities[k];
        if (gain > (boost[k] ?? 0)) boost[k] = gain;
      }
    }
    for (const [k, v] of Object.entries(boost) as [AbilityKey, number][]) c.abilities[k] += v;
    c.boost = boost;
    const hp = (abilityMod(c.abilities.con) - conBefore) * c.level;
    if (hp) {
      const up = c.hp > 0;
      c.maxHp = Math.max(1, c.maxHp + hp);
      c.hp = Math.min(c.maxHp, c.hp + Math.max(0, hp));
      if (up) c.hp = Math.max(1, c.hp);
    }
  }

  private wornKinds(c: Character) {
    const armor = c.equipment.armor ? this.def(c.equipment.armor.defId).armor?.category : undefined;
    const shield = !!c.equipment.offHand && this.def(c.equipment.offHand.defId).kind === 'shield';
    return { armor, shield };
  }

  /** Paladins whose aura reaches this hero and who have the given aura feature. */
  private auras(c: Character, feature: string): Character[] {
    return this.s.characters.filter((p) => p.classId === 'paladin' && this.feat(p, feature) && this.conscious(p)
      && (p.id === c.id || this.s.phase !== 'combat' || cheb(p, c) <= (this.feat(p, 'aura_expansion') ? 6 : 2)));
  }

  /** Everything about a hero that follows from class, level, options and gear. Run after any of them changes, and when a save is loaded. */
  private refresh(c: Character) {
    if (c.companion) return this.refreshCompanion(c);
    this.applyBoosts(c);
    c.uses ??= {};
    c.options ??= [];
    c.tempHp ??= 0;
    c.form ??= null;
    c.mark ??= null;
    c.profBonus = profBonusFor(c.level);
    c.subclass = c.level >= SUBCLASS_LEVEL ? CLASSES[c.classId].subclass.name : null;
    const max = maxManaOf(c);
    if (max !== c.maxMana) { c.mana = Math.max(0, Math.min(max, c.mana + Math.max(0, max - c.maxMana))); c.maxMana = max; }
    for (const id of [...classAbilities(c.classId, c.level), ...c.options.flatMap((o) => OPTIONS[o]?.grants ?? [])]) if (!c.abilityIds.includes(id)) c.abilityIds.unshift(id);
    // Class feature lines are rebuilt from the tables, so old saves read like new heroes.
    const names = new Set([...CLASS_IDS.flatMap((id) => CLASS_FEATURES[id].map((f) => f.name)), ...Object.values(OPTIONS).map((o) => o.name), 'Empowered Cantrips']);
    const others = c.features.filter((line) => !names.has(line.split(':')[0]));
    c.features = [...classFeatureLines(c.classId, c.level), ...c.options.filter((o) => OPTIONS[o]).map((o) => optionLine(OPTIONS[o])), ...others];
    const land: Record<string, string> = { land_arid: 'fire', land_polar: 'cold', land_temperate: 'lightning', land_tropical: 'poison' };
    c.resist = [...new Set([
      ...(SPECIES[c.speciesId]?.resist ?? []),
      ...c.options.filter((o) => o.startsWith('aff_') || o.startsWith('res_')).map((o) => o.slice(4)),
      ...(this.feat(c, 'natures_ward') ? c.options.filter((o) => land[o]).map((o) => land[o]) : []),
      ...this.worn(c).flatMap((d) => d.resist ?? []),
    ])];
    const worn = this.wornKinds(c);
    const form = c.form ? BEAST_FORMS[c.form] : undefined;
    c.speed = form ? form.speed : (SPECIES[c.speciesId]?.speed ?? 30) + speedBonus(c, worn) + this.worn(c).reduce((n, d) => n + (d.speed ?? 0), 0);
    c.buffs ??= [];
    for (const b of this.buffsOf(c)) c.speed = (c.speed + (b.speed ?? 0)) * (b.speedMul ?? 1);
    c.ac = this.computeAc(c);
  }

  /** Skills, styles and options a hero could still pick for a group. */
  private pickable(c: Character, group: string, from?: string[]): string[] {
    if (group === 'style') return Object.keys(STYLES).filter((id) => !c.feats.includes(`style_${id}`));
    if (group === 'expertise') return c.skills.filter((s) => !c.expertise.includes(s) && (!from || from.includes(s)));
    if (group === 'lore') return Object.keys(SKILLS).filter((s) => !c.skills.includes(s));
    return optionsFor(c, group).map((o) => o.id);
  }

  /** Queue the choices the class has granted and the hero has not made yet. Returns what to announce. */
  private reconcile(c: Character): string[] {
    const out: string[] = [];
    for (const [group, g] of Object.entries(grantedChoices(c.classId, c.level))) {
      const waiting = c.pending.filter((p) => p.kind === 'option' && p.group === group).reduce((n, p) => n + (p.kind === 'option' ? p.count : 0), 0);
      const count = Math.min(g.count - chosenIn(c, group) - waiting, this.pickable(c, group, g.from).length);
      if (count <= 0) continue;
      c.pending.push({ id: this.uid('ch'), kind: 'option', level: c.level, group, count, ...(g.from ? { from: g.from } : {}) });
      out.push(this.t`Choose: ${this.n(GROUPS[group]?.name ?? group)}`);
    }
    return out;
  }

  private takeOption(c: Character, group: string, id: string) {
    if (group === 'style') {
      c.feats.push(`style_${id}`);
      c.features.push(STYLES[id].feature);
      this.log('system', this.t`${c.name} takes ${this.n(STYLES[id].name)}.`);
    } else if (group === 'expertise') {
      c.expertise.push(id);
      this.log('system', this.t`${c.name} gains Expertise in ${this.n(id)}.`);
    } else if (group === 'lore') {
      c.skills.push(id);
      (c.options ??= []).push('lore');
      this.log('system', this.t`${c.name} becomes proficient in ${this.n(id)}.`);
    } else {
      (c.options ??= []).push(id);
      this.log('system', this.t`${c.name} takes ${this.n(OPTIONS[id].name)}.`);
    }
  }

  /** Initiative, with the features that sharpen it. */
  private heroInitiative(c: Character, surprised = false) {
    const adv = this.feat(c, 'remarkable_athlete') || this.feat(c, 'feral_instinct');
    return this.heroD20(c, rollMode(adv, surprised)).value + this.mod(c, 'dex') + (c.feats.includes('alert') ? c.profBonus : 0);
  }

  /** What rolling initiative sets off: resources that come back, and powers that start with a fight. */
  private enterFight(c: Character) {
    const back = (feature: string, res: string, when: boolean, to?: number) => {
      if (!this.feat(c, feature) || !when) return;
      c.uses![res] = to === undefined ? 0 : Math.max(0, resourceMax(c, res) - to);
      this.log('roll', this.t`${c.name}: ${this.n(CLASS_FEATURES[c.classId].find((f) => f.id === feature)!.name)} restores ${this.n(RESOURCES[res].name)}.`);
    };
    c.uses ??= {};
    delete c.uses.fate;
    if (this.left(c, 'persistent_rage') > 0 && this.left(c, 'rage') === 0 && this.feat(c, 'persistent_rage')) { back('persistent_rage', 'rage', true); this.spendUse(c, 'persistent_rage'); }
    back('superior_inspiration', 'inspiration', this.left(c, 'inspiration') < 2, 2);
    back('archdruid', 'wild_shape', this.left(c, 'wild_shape') === 0, 1);
    back('perfect_focus', 'focus', this.left(c, 'focus') <= 3, 4);
    if (this.feat(c, 'uncanny_metabolism') && this.left(c, 'uncanny_metabolism') > 0 && this.left(c, 'focus') * 2 < resourceMax(c, 'focus')) {
      this.spendUse(c, 'uncanny_metabolism');
      c.uses.focus = 0;
      const healed = this.healChar(c, roll(`1d${martialDie(c)}`, this.rng).total + c.level);
      this.log('roll', this.t`${c.name}'s Uncanny Metabolism restores all focus and ${healed} HP.`);
    }
    if (this.opted(c, 'inv_vigor')) this.giveTemp(c, 12);
  }

  /** When the fight is over, what lasted "until the fight ends" is gone. */
  private leaveFight(c: Character) {
    const gone = ['raging', 'reckless', 'sacred weapon', 'innate sorcery', 'superior defense', 'holy nimbus', 'invisible'];
    c.conditions = c.conditions.filter((x) => !gone.includes(x));
    c.mark = null;
    this.dropConcentration(c);
    c.zone = null;
    c.sustain = null;
    this.expireBuffs(c, 'fight');
    if (c.uses) { delete c.uses._veil; delete c.uses.fate; }
    if (c.form) { c.form = null; this.refresh(c); }
  }

  // -------------------------------------------------- conditions on monsters

  private syncMonster(m: Monster) {
    const own = m.conditions.filter((x) => !MONSTER_CONDITIONS.includes(x));
    m.conditions = [...own, ...new Set((m.effects ?? []).map((e) => e.condition))];
  }

  private mHas(m: Monster, condition: string) { return (m.effects ?? []).some((e) => e.condition === condition); }
  /** Stunned, dazed or turned: it loses its turn and cannot react. */
  private mHelpless(m: Monster) { return (m.effects ?? []).some((e) => MONSTER_SKIPS.includes(e.condition)); }
  /** Restrained, blinded, asleep, outlined, stunned...: attacks against it have advantage. */
  private mExposed(m: Monster) { return (m.effects ?? []).some((e) => MONSTER_EXPOSED.includes(e.condition)); }
  /** Its armor class, two lower while it is slowed. */
  private mAc(m: Monster) { return MONSTERS[m.defId].ac - (this.mHas(m, 'slowed') ? 2 : 0); }

  /** Put a condition on a monster, unless its kind is immune to it. */
  private afflict(m: Monster, condition: string, e: Omit<MonsterEffect, 'condition'> = {}): boolean {
    if (!m.alive) return false;
    const def = MONSTERS[m.defId];
    const immune = def.conditionImmune ?? [];
    if (immune.includes(condition) || (condition === 'turned' && immune.includes('frightened')) || (condition === 'incapacitated' && immune.includes('stunned'))) {
      this.log('roll', this.t`${m.name} cannot be ${this.n(condition)}.`);
      return false;
    }
    const had = this.mHas(m, condition);
    m.effects = [...(m.effects ?? []).filter((x) => x.condition !== condition), { condition, ...e }];
    this.syncMonster(m);
    if (!had) this.log('roll', this.t`${m.name} is now ${this.n(condition)}.`);
    return true;
  }

  private liftMonster(m: Monster, which: (e: MonsterEffect) => boolean) {
    const gone = (m.effects ?? []).filter(which);
    if (!gone.length) return;
    m.effects = (m.effects ?? []).filter((e) => !gone.includes(e));
    this.syncMonster(m);
    if (m.alive) this.log('roll', this.t`${m.name} is no longer ${gone.map((e) => this.n(e.condition)).join(', ')}.`);
  }

  /** A monster's saving throw against a hero's feature, with Magic Resistance and Legendary Resistance. */
  private monsterSave(m: Monster, ability: AbilityKey, dc: number, against: string, opts: { spell?: boolean; dis?: boolean } = {}): boolean {
    const def = MONSTERS[m.defId];
    const save = this.n(ability.toUpperCase());
    if ((ability === 'str' || ability === 'dex') && (this.mHas(m, 'stunned') || this.mHas(m, 'paralyzed'))) {
      this.log('roll', this.t`${m.name} cannot resist ${against}: the ${save} save fails automatically.`);
      return false;
    }
    const mod = def.saves[ability] ?? 0;
    const mode = rollMode(!!def.flags?.magicResistance && !!opts.spell, !!opts.dis);
    const r = d20(this.rng, mode);
    const total = r.value + mod;
    let ok = total >= dc;
    const info: RollInfo = { actor: m.name, label: this.t`${save} save against ${against}`, die: r.value, rolls: r.rolls, mode, modifier: mod, total, target: { kind: 'DC', value: dc }, outcome: ok ? 'success' : 'failure' };
    this.log('roll', this.t`${m.name}: ${save} save against ${against}, ${this.d20Text(r, mode)}${signed(mod)} = ${total} vs DC ${dc}. ${ok ? this.t`Success.` : this.t`Failure.`}`, { roll: info });
    if (!ok && (m.legRes ?? def.flags?.legendaryResistance ?? 0) > 0) {
      m.legRes = (m.legRes ?? def.flags!.legendaryResistance!) - 1;
      this.log('roll', this.t`${m.name} fails the save but shrugs it off with Legendary Resistance (${m.legRes} left).`);
      ok = true;
    }
    return ok;
  }

  /** Shove a monster straight away from a point, as far as the ground allows. */
  private pushMonster(m: Monster, from: Pt, feet: number) {
    const centre = this.mcentre(m);
    const sx = Math.sign(Math.round(centre.x - from.x)), sy = Math.sign(Math.round(centre.y - from.y));
    if ((!sx && !sy) || !m.alive) return;
    const path: Pt[] = [];
    for (let i = 0; i < Math.floor(feet / 5); i++) {
      const next = { x: m.x + sx, y: m.y + sy };
      if (this.monsterBlocked(next, m)) break;
      m.x = next.x; m.y = next.y; path.push(next);
    }
    if (path.length) {
      this.moves.push({ id: m.id, path });
      this.log('roll', this.t`${m.name} is hurled ${path.length * 5} ft back.`);
    }
  }

  /** Damage of several types against one monster. Returns what got through, as text and in total. */
  private hitParts(m: Monster, parts: { amount: number; type: string }[], pierce = false) {
    const dealt: { amount: number; type: string }[] = [];
    let note = '';
    for (const p of parts) {
      if (p.amount <= 0) continue;
      const res = this.damageMonster(m, p.amount, p.type, pierce);
      const same = dealt.find((d) => d.type === p.type);
      if (same) same.amount += res.dealt; else dealt.push({ amount: res.dealt, type: p.type });
      if (res.note && !note.includes(res.note)) note += res.note;
    }
    return { total: dealt.reduce((n, p) => n + p.amount, 0), text: this.dmgText(dealt.length ? dealt : [{ amount: 0, type: parts[0]?.type ?? 'bludgeoning' }]), note };
  }

  /** How a class resource is paid for, or why it cannot be. */
  private resPlan(c: Character, ab: AbilityDef): () => void {
    const res = ab.id === 'innate_sorcery' ? 'innate_sorcery' : ab.resource;
    if (!res) return () => {};
    const n = ab.resourceCost ?? 1;
    if (ab.id.startsWith('meta_') && this.feat(c, 'arcane_apotheosis') && c.conditions.includes('innate sorcery') && !this.s.combat?.once?.includes(`${c.id}:apotheosis`)) return () => { this.once(`${c.id}:apotheosis`); };
    if (this.left(c, res) >= n) return () => this.spendUse(c, res, n);
    if (res === 'wild_shape' && this.feat(c, 'wild_resurgence') && c.mana >= 2) return () => { c.mana -= 2; };
    if (res === 'innate_sorcery' && this.feat(c, 'sorcery_incarnate') && this.left(c, 'sorcery') >= 2) return () => this.spendUse(c, 'sorcery', 2);
    throw new GameError(this.t`${c.name} has no ${this.n(RESOURCES[res].name)} left`);
  }

  /** The highest total a dice expression can show. */
  private maxDice(expr: string, crit = false) {
    const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(expr.replace(/\s+/g, ''));
    return m ? Number(m[1]) * (crit ? 2 : 1) * Number(m[2]) + Number(m[3] ?? 0) : 0;
  }

  /** Damage of a spell or cantrip with everything a caster's features add to it. */
  private spellDmg(c: Character, ab: AbilityDef, dice: string, crit = false): number {
    const isSpell = ab.spellLevel !== undefined;
    const one = () => (isSpell && this.primed(`${c.id}:overchannel`) ? this.maxDice(dice, crit) : roll(dice, this.rng, crit).total);
    let n = one();
    if (isSpell && this.primed(`${c.id}:empowered`)) n = Math.max(n, one());
    if (!isSpell) return n;
    if (this.feat(c, 'empowered_evocation')) n += Math.max(0, this.mod(c, 'int'));
    if (ab.spellLevel === 0 && this.opted(c, 'fury_spellcasting') && this.feat(c, 'elemental_fury')) n += Math.max(0, this.mod(c, 'wis'));
    if (ab.damageType && this.opted(c, `aff_${ab.damageType}`)) n += Math.max(0, this.mod(c, 'cha'));
    if (ab.id === 'eldritch_blast' && this.opted(c, 'inv_agonizing')) n += Math.max(0, this.mod(c, 'cha'));
    if (ab.spellLevel === 0 && this.feat(c, 'blessed_strikes') && this.once(`${c.id}:blessed`)) n += roll(this.feat(c, 'improved_blessed_strikes') ? '2d8' : '1d8', this.rng).total;
    return n;
  }

  /** A class feature on the action bar. `spend` takes the action and pays for it once the use is certain. */
  private classAbility(c: Character, ab: AbilityDef, targetId: string | undefined, spend: () => void, range: number) {
    const combat = this.s.combat;
    const inCombat = this.s.phase === 'combat' && !!combat;
    const needFight = () => { if (!inCombat) throw new GameError(this.t`${this.n(ab.name)} is only useful in combat`); };
    const name = this.n(ab.name);
    const buff = (condition: string, text: string) => {
      needFight();
      if (c.conditions.includes(condition)) throw new GameError(this.t`${name} is already active`);
      spend();
      c.conditions.push(condition);
      this.log('roll', text);
    };
    const ally = (reach: number, self = true) => {
      const t = this.char(targetId ?? c.id);
      if (t.dead) throw new GameError(this.t`${t.name} is beyond healing`);
      if (!self && t.id === c.id) throw new GameError(this.t`Choose an ally`);
      if (inCombat && cheb(c, t) * 5 > Math.max(5, reach)) throw new GameError(this.t`${t.name} is too far away`);
      return t;
    };
    const near = (feet: number) => this.s.monsters.filter((m) => m.alive && this.mdist(m, c) * 5 <= feet);
    const primeIt = (key: string, text: string) => { needFight(); if (this.primed(`${c.id}:${key}`)) throw new GameError(this.t`${name} is already active`); spend(); this.prime(`${c.id}:${key}`); this.log('roll', text); };
    const sparkDice = `${1 + (c.level >= 7 ? 1 : 0) + (c.level >= 13 ? 1 : 0) + (c.level >= 18 ? 1 : 0)}d8`;

    switch (ab.id) {
      case 'rage': {
        if (this.wornKinds(c).armor === 'heavy') throw new GameError(this.t`${c.name} cannot rage in heavy armor`);
        buff('raging', this.t`${c.name} flies into a rage!`);
        if (this.feat(c, 'instinctive_pounce')) combat!.movementLeft += Math.floor(c.speed / 10);
        if (this.feat(c, 'mindless_rage')) this.endEffects(c, (e) => e.condition === 'charmed' || e.condition === 'frightened');
        break;
      }
      case 'reckless': buff('reckless', this.t`${c.name} attacks recklessly.`); break;
      case 'brutal_strike': {
        if (!c.conditions.includes('reckless')) throw new GameError(this.t`${name} needs a Reckless Attack first`);
        primeIt('brutal', this.t`${c.name} winds up a Brutal Strike.`);
        break;
      }
      case 'intimidating_presence': {
        needFight();
        spend();
        this.log('roll', this.t`${c.name} lets out a terrible roar.`);
        const dc = this.dcOf(c, 'str');
        for (const m of near(30)) if (!this.monsterSave(m, 'wis', dc, name)) this.afflict(m, 'frightened', { turns: 10, save: { ability: 'wis', dc } });
        break;
      }
      case 'bardic_inspiration': {
        const t = ally(60, false);
        if (!this.conscious(t)) throw new GameError(this.t`${t.name} cannot hear it`);
        spend();
        t.inspired = inspirationDie(c);
        this.log('roll', this.t`${c.name} inspires ${t.name}: a d${t.inspired} waits for the next attack or save that fails.`);
        break;
      }
      case 'divine_spark_heal': {
        const t = ally(30);
        if (t.hp >= t.maxHp) throw new GameError(this.t`${t.name} is already at full health`);
        spend();
        const healed = this.healChar(t, roll(sparkDice, this.rng).total + this.mod(c, 'wis'));
        this.log('roll', this.t`${c.name}'s Divine Spark restores ${healed} HP to ${t.name}.`);
        break;
      }
      case 'divine_spark_harm': {
        const m = this.targetMonster(c, targetId ?? '', range);
        this.mustSee(c, m);
        spend();
        const ok = this.monsterSave(m, 'con', this.dcOf(c, 'wis'), name);
        const full = roll(sparkDice, this.rng).total + this.mod(c, 'wis');
        const res = this.damageMonster(m, ok ? Math.floor(full / 2) : full, 'radiant');
        this.log('roll', this.t`${c.name}'s Divine Spark sears ${m.name} for ${res.dealt} ${this.n('radiant damage')}.${res.note}`);
        break;
      }
      case 'turn_undead': {
        needFight();
        const undead = near(30).filter((m) => MONSTERS[m.defId].type === 'undead');
        if (!undead.length) throw new GameError(this.t`There are no undead within 30 ft`);
        spend();
        this.log('roll', this.t`${c.name} presents the holy symbol and speaks a prayer against the undead.`);
        const dc = this.dcOf(c, 'wis');
        for (const m of undead) {
          if (this.monsterSave(m, 'wis', dc, name)) continue;
          if (this.feat(c, 'sear_undead')) {
            const res = this.damageMonster(m, roll(`${Math.max(1, this.mod(c, 'wis'))}d8`, this.rng).total, 'radiant');
            this.log('roll', this.t`${m.name} is seared for ${res.dealt} ${this.n('radiant damage')}.${res.note}`);
          }
          this.afflict(m, 'turned', { turns: 10, onHurt: true });
        }
        break;
      }
      case 'preserve_life': {
        const hurt = this.party().filter((t) => !t.dead && t.hp * 2 < t.maxHp && (!inCombat || cheb(c, t) <= 6)).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
        if (!hurt.length) throw new GameError(this.t`Nobody nearby is below half their hit points`);
        spend();
        let pool = 5 * c.level;
        const done: string[] = [];
        for (const t of hurt) {
          if (pool <= 0) break;
          const healed = this.healChar(t, Math.min(pool, Math.floor(t.maxHp / 2) - t.hp));
          pool -= healed;
          if (healed) done.push(`${t.name} +${healed}`);
        }
        this.log('roll', this.t`${c.name} channels life into the wounded: ${done.join(', ')} HP.`);
        break;
      }
      case 'wild_shape_wolf': case 'wild_shape_black_bear': case 'wild_shape_dire_wolf': case 'wild_shape_brown_bear': {
        const id = ab.id.replace('wild_shape_', '');
        if (c.form === id) throw new GameError(this.t`${name} is already active`);
        spend();
        c.form = id;
        this.giveTemp(c, c.level);
        this.refresh(c);
        this.log('roll', this.t`${c.name} takes the shape of a ${this.n(BEAST_FORMS[id].name)} (AC ${c.ac}, ${c.level} temporary HP).`);
        break;
      }
      case 'revert_form': {
        if (!c.form) throw new GameError(this.t`${c.name} is not in beast form`);
        spend();
        c.form = null;
        this.refresh(c);
        this.log('roll', this.t`${c.name} returns to their own shape.`);
        break;
      }
      case 'lands_aid': {
        const first = this.targetMonster(c, targetId ?? '', range);
        spend();
        const dice = c.level >= 14 ? '4d6' : c.level >= 10 ? '3d6' : '2d6';
        const full = roll(dice, this.rng).total;
        this.log('roll', this.t`Thorns and vines burst from the ground around ${first.name}.`);
        for (const m of this.s.monsters.filter((x) => x.alive && cheb(x, first) <= 1)) {
          const ok = this.monsterSave(m, 'con', this.dcOf(c, 'wis'), name);
          const res = this.damageMonster(m, ok ? Math.floor(full / 2) : full, 'necrotic');
          this.log('roll', this.t`${m.name} takes ${res.dealt} ${this.n('necrotic damage')}.${res.note}`);
        }
        const t = this.party().filter((x) => !x.dead && x.hp < x.maxHp && cheb(c, x) <= 12).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (t) this.log('roll', this.t`The land restores ${this.healChar(t, roll(dice, this.rng).total)} HP to ${t.name}.`);
        break;
      }
      case 'martial_strike': case 'flurry_of_blows': {
        const m = this.targetMonster(c, targetId ?? '', 5);
        spend();
        const n = ab.id === 'martial_strike' ? 1 : this.feat(c, 'heightened_focus') ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const t = m.alive ? m : this.s.monsters.find((o) => o.alive && this.mdist(o, c) <= 1);
          if (!t || this.s.phase !== 'combat') break;
          this.strike(c, t, { unarmed: true, flurry: n > 1 });
        }
        break;
      }
      case 'patient_defense': {
        needFight();
        spend();
        if (!c.conditions.includes('dodging')) c.conditions.push('dodging');
        combat!.disengaged = true;
        if (this.feat(c, 'heightened_focus')) this.giveTemp(c, roll(`2d${martialDie(c)}`, this.rng).total);
        this.log('roll', this.t`${c.name} settles into Patient Defense.`);
        break;
      }
      case 'step_of_the_wind': {
        needFight();
        spend();
        combat!.movementLeft += Math.floor(c.speed / 5);
        combat!.disengaged = true;
        this.log('roll', this.t`${c.name} moves with the Step of the Wind, gaining ${c.speed} ft of movement.`);
        break;
      }
      case 'stunning_strike': {
        needFight();
        if (combat!.once?.includes(`${c.id}:stunned`)) throw new GameError(this.t`${name} can be used once per turn`);
        primeIt('stun', this.t`${c.name} gathers focus for a Stunning Strike.`);
        this.once(`${c.id}:stunned`);
        break;
      }
      case 'wholeness_of_body': {
        if (c.hp >= c.maxHp) throw new GameError(this.t`${c.name} is already at full health`);
        spend();
        const healed = this.healChar(c, roll(`1d${martialDie(c)}`, this.rng).total + Math.max(1, this.mod(c, 'wis')));
        this.log('roll', this.t`${c.name} uses ${name} and regains ${healed} HP.`);
        break;
      }
      case 'quivering_palm': primeIt('palm', this.t`${c.name} readies the Quivering Palm.`); break;
      case 'superior_defense': buff('superior defense', this.t`${c.name} hardens body and mind against all harm.`); break;
      case 'lay_on_hands': {
        const t = ally(5);
        const pool = this.left(c, 'lay_on_hands');
        const cures = ['poisoned', ...(this.feat(c, 'restoring_touch') ? ['blinded', 'charmed', 'deafened', 'frightened', 'paralyzed', 'stunned'] : [])];
        const sick = (t.effects ?? []).some((e) => cures.includes(e.condition));
        const amount = Math.min(pool, t.maxHp - t.hp);
        if (amount <= 0 && !sick) throw new GameError(pool <= 0 ? this.t`${c.name} has no ${this.n('Lay on Hands')} left` : this.t`${t.name} is already at full health`);
        spend();
        const healed = amount > 0 ? this.healChar(t, amount) : 0;
        this.spendUse(c, 'lay_on_hands', healed);
        this.log('roll', this.t`${c.name} lays hands on ${t.name}, restoring ${healed} HP (${this.left(c, 'lay_on_hands')} left in the pool).`);
        this.endEffects(t, (e) => cures.includes(e.condition));
        break;
      }
      case 'divine_smite': {
        needFight();
        const m = this.s.monsters.find((x) => x.id === combat!.lastHit && x.alive);
        if (!m) throw new GameError(this.t`${name} follows a melee hit of yours this turn`);
        spend();
        combat!.lastHit = null;
        const res = this.damageMonster(m, roll(['undead', 'fiend'].includes(MONSTERS[m.defId].type) ? '3d8' : '2d8', this.rng).total, 'radiant');
        this.log('roll', this.t`${c.name} smites ${m.name} for ${res.dealt} ${this.n('radiant damage')}.${res.note}`);
        break;
      }
      case 'sacred_weapon': buff('sacred weapon', this.t`${c.name}'s weapon blazes with sacred light.`); break;
      case 'abjure_foes': {
        needFight();
        spend();
        this.log('roll', this.t`${c.name} raises the holy symbol against the enemy.`);
        const dc = this.dcOf(c, 'cha');
        for (const m of near(60).sort((a, b) => this.mdist(a, c) - this.mdist(b, c)).slice(0, Math.max(1, this.mod(c, 'cha')))) {
          if (!this.monsterSave(m, 'wis', dc, name)) this.afflict(m, 'frightened', { turns: 10, onHurt: true });
        }
        break;
      }
      case 'holy_nimbus': buff('holy nimbus', this.t`${c.name} is wreathed in a holy nimbus.`); break;
      case 'hunters_mark': case 'hex': {
        const m = this.targetMonster(c, targetId ?? '', range);
        this.mustSee(c, m);
        spend();
        c.mark = { monsterId: m.id, spell: ab.id };
        this.log('roll', ab.id === 'hex' ? this.t`${c.name} lays a hex on ${m.name}.` : this.t`${c.name} marks ${m.name} as prey.`);
        break;
      }
      case 'tireless': {
        spend();
        this.giveTemp(c, roll('1d8', this.rng).total + Math.max(1, this.mod(c, 'wis')));
        this.log('roll', this.t`${c.name} shakes off weariness and has ${c.tempHp} temporary HP.`);
        break;
      }
      case 'natures_veil': {
        buff('invisible', this.t`${c.name} fades from sight.`);
        c.uses!._veil = 2;
        break;
      }
      case 'steady_aim': {
        needFight();
        if (combat!.moved) throw new GameError(this.t`${name} only works before you move`);
        primeIt('aim', this.t`${c.name} takes careful aim.`);
        combat!.movementLeft = 0;
        break;
      }
      case 'cunning_trip': primeIt('trip', this.t`${c.name} looks for a chance to trip the target.`); break;
      case 'cunning_poison': primeIt('poison', this.t`${c.name} readies a poisoned strike.`); break;
      case 'cunning_daze': primeIt('daze', this.t`${c.name} readies a dazing strike.`); break;
      case 'innate_sorcery': buff('innate sorcery', this.t`${c.name}'s innate magic flares up.`); break;
      case 'font_of_magic': {
        if (c.mana >= c.maxMana) throw new GameError(this.t`${c.name}'s mana is already full`);
        spend();
        c.mana = Math.min(c.maxMana, c.mana + 2);
        this.log('roll', this.t`${c.name} turns sorcery points into mana (now ${c.mana}).`);
        break;
      }
      case 'meta_quickened': primeIt('quickened', this.t`${c.name} quickens the next spell.`); break;
      case 'meta_empowered': primeIt('empowered', this.t`${c.name} empowers the next spell.`); break;
      case 'meta_heightened': primeIt('heightened', this.t`${c.name} heightens the next spell.`); break;
      case 'meta_distant': primeIt('distant', this.t`${c.name} stretches the reach of the next spell.`); break;
      case 'magical_cunning': {
        if (inCombat) throw new GameError(this.t`${name} takes a minute of quiet`);
        if (c.mana >= c.maxMana) throw new GameError(this.t`${c.name}'s mana is already full`);
        spend();
        c.mana = this.feat(c, 'eldritch_master') ? c.maxMana : Math.min(c.maxMana, c.mana + Math.ceil(c.maxMana / 2));
        this.log('roll', this.t`${c.name} performs an esoteric rite and has ${c.mana} mana again.`);
        break;
      }
      case 'hurl_through_hell': primeIt('hurl', this.t`${c.name} opens a rift to the lower planes.`); break;
      case 'overchannel': primeIt('overchannel', this.t`${c.name} draws more power than is wise.`); break;
      default: throw new GameError(this.t`${c.name} doesn't know that`);
    }
  }

  // ------------------------------------------------- defences of the heroes

  /** Damage a hero resists by a feature or a state, beyond the species' own resistances. */
  private resists(c: Character, type: string): boolean {
    if (c.resist.includes(type)) return true;
    if (this.buffsOf(c).some((b) => b.resist?.includes(type))) return true;
    // Protection from Energy guards against the first of its elements that strikes.
    for (const b of c.buffs ?? []) {
      const adapt = SPELL_BUFFS[b.id]?.adapt;
      if (!adapt) continue;
      if (b.adapted === type) return true;
      if (!b.adapted && adapt.includes(type)) { b.adapted = type; return true; }
    }
    if (c.conditions.includes('raging') && ['bludgeoning', 'piercing', 'slashing'].includes(type)) return true;
    if (c.conditions.includes('superior defense') && type !== 'force') return true;
    if (c.feats.includes('boon_night_spirit') && this.s.phase === 'combat' && type !== 'psychic' && type !== 'radiant' && this.lightAt(c) !== 'bright') return true;
    return false;
  }

  /** A hero who cannot be given this condition, and why. */
  private wards(c: Character, condition?: string): string | null {
    if (!condition) return null;
    const spell = this.buffsOf(c).find((b) => b.immune?.includes(condition));
    if (spell) return spell.chip;
    if ((condition === 'charmed' || condition === 'frightened') && c.conditions.includes('raging') && this.feat(c, 'mindless_rage')) return 'Mindless Rage';
    if (condition === 'charmed' && this.auras(c, 'aura_of_devotion').length) return 'Aura of Devotion';
    if (condition === 'frightened' && this.auras(c, 'aura_of_courage').length) return 'Aura of Courage';
    if (condition === 'poisoned' && this.feat(c, 'natures_ward')) return "Nature's Ward";
    return null;
  }

  // -------------------------------------------------------------- inventory

  private proficient(c: Character, def: ItemDef): boolean {
    return isProficient(c, def);
  }

  private slotFor(def: ItemDef): SlotId | null {
    if (def.kind === 'weapon') return 'mainHand';
    if (def.kind === 'shield') return 'offHand';
    if (def.kind === 'armor') return 'armor';
    if (def.kind === 'wondrous') return def.slot ?? null;
    return null;
  }

  private canEquip(c: Character, item: ItemInstance, slot: SlotId): string | null {
    const def = this.def(item.defId);
    // A light melee weapon can also go in the off hand, to fight with two weapons.
    const offWeapon = slot === 'offHand' && def.kind === 'weapon';
    if (offWeapon) {
      if (!isLightWeapon(def)) return this.t`${this.n(def.name)} is too heavy for the off hand. Only light melee weapons go there`;
      const main = c.equipment.mainHand ? this.def(c.equipment.mainHand.defId) : null;
      if (!isLightWeapon(main)) return this.t`Hold a light melee weapon in the main hand to wield one in the off hand too`;
    } else if (this.slotFor(def) !== slot) return `${def.name} doesn't go there`;
    if (!this.proficient(c, def)) return `${c.className}s can't use ${def.name}`;
    if (def.attune) {
      const attuned = SLOT_IDS.filter((s) => s !== slot && c.equipment[s] && c.equipment[s]!.uid !== item.uid && this.def(c.equipment[s]!.defId).attune).length;
      if (attuned >= 3) return this.t`${c.name} is already attuned to three magic items`;
    }
    return null;
  }

  computeAc(c: Character): number {
    let ac = armorClass(c, Object.fromEntries(SLOT_IDS.map((slot) => [slot, c.equipment[slot] ? this.def(c.equipment[slot]!.defId) : null])));
    // A companion keeps the Armor Class of their stat block unless what they were handed is better.
    if (c.companion) ac = Math.max(ac, c.companion.baseAc);
    for (const b of this.buffsOf(c)) { ac += b.ac ?? 0; if (b.acMin) ac = Math.max(ac, b.acMin); }
    return ac;
  }

  private getLoc(c: Character, loc: InvLoc): ItemInstance | null {
    if (loc.type === 'slot') return c.equipment[loc.slot] ?? null;
    return c.bag[loc.index] ?? null;
  }

  private setLoc(c: Character, loc: InvLoc, item: ItemInstance | null) {
    if (loc.type === 'slot') c.equipment[loc.slot] = item;
    else c.bag[loc.index] = item;
  }

  private validLoc(loc: InvLoc) {
    if (loc?.type === 'slot') return (SLOT_IDS as readonly string[]).includes(loc.slot);
    return loc?.type === 'bag' && Number.isInteger(loc.index) && loc.index >= 0 && loc.index < BAG_SIZE;
  }

  private firstFreeBag(c: Character) { return c.bag.findIndex((b) => b === null); }

  /** Put an item into a bag, merging stacks. Returns false if the bag is full. */
  private addToBag(c: Character, defId: string, qty: number): boolean {
    const def = this.def(defId);
    if (def.stackable) {
      const stack = c.bag.find((b) => b?.defId === defId);
      if (stack) { stack.qty += qty; return true; }
    }
    const idx = this.firstFreeBag(c);
    if (idx < 0) return false;
    c.bag[idx] = this.newItem(defId, qty);
    return true;
  }

  invMove(playerId: string, characterId: string, from: InvLoc, to: InvLoc, qty?: number) {
    this.moveItem(this.actor(playerId, characterId, false), from, to, qty);
  }

  private moveItem(c: Character, from: InvLoc, to: InvLoc, qty?: number) {
    if (!this.validLoc(from) || !this.validLoc(to)) throw new GameError(this.t`Bad inventory slot`);
    const item = this.getLoc(c, from);
    if (!item) throw new GameError(this.t`Nothing there`);
    const other = this.getLoc(c, to);
    if (from.type === to.type && JSON.stringify(from) === JSON.stringify(to)) return;
    if (to.type === 'slot') {
      const err = this.canEquip(c, item, to.slot);
      if (err) throw new GameError(err);
    }
    if (other && from.type === 'slot') {
      const err = this.canEquip(c, other, from.slot);
      if (err) throw new GameError(err);
    }
    // Part of a stack: split some off into an empty square, or onto a stack of the same thing.
    if (qty !== undefined && from.type === 'bag' && to.type === 'bag' && item.qty > 1) {
      if (!this.def(item.defId).stackable) throw new GameError(this.t`That cannot be split`);
      const n = Math.floor(Number(qty));
      if (!(n >= 1 && n < item.qty)) throw new GameError(this.t`Pick a number between 1 and ${item.qty - 1}`);
      if (other && other.defId !== item.defId) throw new GameError(this.t`Put it in an empty square`);
      if (other) other.qty += n;
      else c.bag[to.index] = this.newItem(item.defId, n);
      item.qty -= n;
      return;
    }
    // Stack merge inside the bag.
    if (other && to.type === 'bag' && from.type === 'bag' && other.defId === item.defId && this.def(item.defId).stackable) {
      other.qty += item.qty;
      this.setLoc(c, from, null);
      return;
    }
    this.setLoc(c, to, item);
    this.setLoc(c, from, other);
    // Two-handed weapons and shields exclude each other.
    const main = c.equipment.mainHand ? this.def(c.equipment.mainHand.defId) : null;
    const offDef = c.equipment.offHand ? this.def(c.equipment.offHand.defId) : null;
    if (main?.weapon && offDef && (main.weapon.twoHanded || (offDef.kind === 'weapon' && !isLightWeapon(main)))) {
      const drop = to.type === 'slot' && to.slot === 'offHand' ? 'mainHand' : 'offHand';
      const idx = this.firstFreeBag(c);
      if (idx < 0) {
        this.setLoc(c, from, item);
        this.setLoc(c, to, other);
        throw new GameError(this.t`No bag space to free a hand`);
      }
      c.bag[idx] = c.equipment[drop];
      c.equipment[drop] = null;
    }
    this.refresh(c);
  }

  /**
   * The story has a hero draw, wield, put on or strap on something they carry. It goes into the slot
   * it belongs in, through the same rules as dragging it there in the inventory. Returns what changed.
   */
  equipItem(characterId: string, ref: string) {
    const c = this.char(characterId);
    if (c.dead) throw new GameError(this.t`${c.name} is dead`);
    const def = this.findItemDef(ref);
    if (!def) throw new GameError(this.t`Unknown item "${ref}"`);
    const slot = this.slotFor(def);
    if (!slot) throw new GameError(`${def.name} is not something to wear or wield.`);
    if (c.equipment[slot]?.defId === def.id) return { character: c.name, item: def.name, slot, changed: false };
    const index = c.bag.findIndex((b) => b?.defId === def.id);
    if (index < 0) throw new GameError(`${c.name} does not carry ${def.name}.`);
    const before = c.equipment[slot] ? this.def(c.equipment[slot]!.defId).name : null;
    this.moveItem(c, { type: 'bag', index }, { type: 'slot', slot });
    this.log('system', before ? this.t`${c.name} puts away ${this.n(before)} and takes up ${this.n(def.name)}.` : this.t`${c.name} takes up ${this.n(def.name)}.`);
    return { character: c.name, item: def.name, slot, changed: true, ...(before ? { put_away: before } : {}) };
  }

  give(playerId: string, characterId: string, from: InvLoc, toCharacterId: string, qty?: number) {
    const c = this.actor(playerId, characterId, false);
    const t = this.char(toCharacterId);
    if (t.id === c.id) return;
    if (t.dead) throw new GameError(this.t`${t.name} is dead`);
    if (!this.validLoc(from)) throw new GameError(this.t`Bad inventory slot`);
    const item = this.getLoc(c, from);
    if (!item) throw new GameError(this.t`Nothing there`);
    if (this.s.phase === 'combat' && cheb(c, t) > 1) throw new GameError(this.t`${t.name} is too far away to hand that over mid-fight`);
    const part = qty !== undefined && item.qty > 1 ? Math.floor(Number(qty)) : item.qty;
    if (!(part >= 1 && part <= item.qty)) throw new GameError(this.t`Pick a number between 1 and ${item.qty}`);
    if (part < item.qty && !this.def(item.defId).stackable) throw new GameError(this.t`That cannot be split`);
    if (!this.addToBag(t, item.defId, part)) throw new GameError(this.t`${t.name}'s bag is full`);
    if (part < item.qty) item.qty -= part;
    else this.setLoc(c, from, null);
    this.refresh(c);
    this.log('system', part > 1
      ? this.t`${c.name} hands ${part} × ${this.n(this.def(item.defId).name)} to ${t.name}.`
      : this.t`${c.name} hands ${this.n(this.def(item.defId).name)} to ${t.name}.`);
    this.armCompanion(t, item.defId);
  }

  /** A companion with empty hands takes up a weapon or shield they are handed. */
  private armCompanion(t: Character, defId: string) {
    if (!t.companion || t.dead) return;
    const def = this.def(defId);
    const slot = this.slotFor(def);
    if ((slot !== 'mainHand' && slot !== 'offHand') || t.equipment[slot]) return;
    if (slot === 'offHand' && t.equipment.mainHand && this.def(t.equipment.mainHand.defId).weapon?.twoHanded) return;
    try { this.equipItem(t.id, def.id); } catch { /* it stays in the backpack */ }
  }

  /**
   * The story hands something from one member of the party to another, such as a hero giving a companion a spear.
   * Used by the check that keeps the game in step with the narration; it has no player behind it.
   */
  handItem(fromId: string, toId: string, ref: string, qty = 1) {
    const from = this.char(fromId), to = this.char(toId);
    if (from.id === to.id) throw new GameError('Giver and receiver are the same.');
    if (to.dead) throw new GameError(this.t`${to.name} is dead`);
    const def = this.findItemDef(ref);
    if (!def) throw new GameError(this.t`Unknown item "${ref}"`);
    const found = this.carried(from).find((x) => x.item.defId === def.id);
    if (!found) throw new GameError(`${from.name} does not carry ${def.name}.`);
    const part = Math.max(1, Math.min(found.item.qty, Math.floor(qty) || 1));
    if (!this.addToBag(to, def.id, part)) throw new GameError(this.t`${to.name}'s bag is full`);
    if (part < found.item.qty) found.item.qty -= part;
    else this.setLoc(from, found.loc, null);
    this.refresh(from);
    this.log('system', part > 1 ? this.t`${from.name} hands ${part} × ${this.n(def.name)} to ${to.name}.` : this.t`${from.name} hands ${this.n(def.name)} to ${to.name}.`);
    this.armCompanion(to, def.id);
    return { from: from.name, to: to.name, item: def.name, quantity: part };
  }

  useItem(playerId: string, characterId: string, uid: string, targetId?: string) {
    const c = this.actor(playerId, characterId);
    const idx = c.bag.findIndex((b) => b?.uid === uid);
    const held = SLOT_IDS.map((s) => c.equipment[s]).find((e) => e?.uid === uid) ?? null;
    if (idx < 0 && !held) throw new GameError(this.t`That item is not in the bag`);
    const item = held ?? c.bag[idx]!;
    const def = this.def(item.defId);
    // A wand casts from the bag; a staff or a ring has to be held or worn first.
    if (def.casts && (held || !this.slotFor(def))) {
      const spell = ABILITIES[def.casts.spell];
      if (!spell) throw new GameError(this.t`${this.n(def.name)} can't be used`);
      if ((item.used ?? 0) >= def.casts.charges) throw new GameError(this.t`${this.n(def.name)} has no charges left until a long rest`);
      this.useAbility(playerId, characterId, spell.id, targetId, def.casts.level, item);
      return;
    }
    if (held) throw new GameError(this.t`${this.n(def.name)} can't be used`);
    if (def.consumable && !def.consumable.heal) {
      this.drink(c, item, idx, def, targetId);
      return;
    }
    if (!def.consumable?.heal) {
      const slot = this.slotFor(def);
      if (!slot) throw new GameError(this.t`${this.n(def.name)} can't be used`);
      this.invMove(playerId, characterId, { type: 'bag', index: idx }, { type: 'slot', slot });
      return;
    }
    const t = this.char(targetId ?? c.id);
    if (t.dead) throw new GameError(this.t`${t.name} is beyond healing`);
    if (cheb(c, t) > 1) throw new GameError(this.t`${t.name} is too far away`);
    if (t.hp >= t.maxHp) throw new GameError(this.t`${t.name} is already at full health`);
    // A thief's Fast Hands: potions only cost the bonus action.
    const fast = this.feat(c, 'fast_hands');
    this.canAct(fast);
    this.spendAction(fast);
    const healed = this.healChar(t, roll(def.consumable!.heal!, this.rng).total);
    item.qty--;
    if (item.qty <= 0) c.bag[idx] = null;
    this.log('roll', (t.id === c.id ? this.t`${c.name} drinks a ${this.n(def.name)}, restoring ${healed} HP.` : this.t`${c.name} feeds ${t.name} a ${this.n(def.name)}, restoring ${healed} HP.`));
  }

  /** A potion with a spell's effect (Speed, Heroism, Invisibility) or temporary hit points. */
  private drink(c: Character, item: ItemInstance, idx: number, def: ItemDef, targetId?: string) {
    const t = this.char(targetId ?? c.id);
    if (t.dead) throw new GameError(this.t`${t.name} is dead`);
    if (cheb(c, t) > 1 && this.s.phase === 'combat') throw new GameError(this.t`${t.name} is too far away`);
    const fast = this.feat(c, 'fast_hands');
    if (this.s.phase === 'combat') { this.canAct(fast); this.spendAction(fast); }
    item.qty--;
    if (item.qty <= 0) c.bag[idx] = null;
    this.log('roll', t.id === c.id ? this.t`${c.name} drinks a ${this.n(def.name)}.` : this.t`${c.name} feeds ${t.name} a ${this.n(def.name)}.`);
    const buff = def.consumable!.buff;
    const spell = buff ? Object.values(ABILITIES).find((a) => a.buff === buff && a.spellLevel !== undefined) : undefined;
    if (spell) this.addBuff(t, t, { ...spell, id: `potion:${def.id}` }, spell.spellLevel!);
    if (def.consumable!.temp) this.giveTemp(t, def.consumable!.temp);
  }

  shortRest() {
    this.needExplore();
    if (this.s.shortRestsLeft <= 0) throw new GameError(this.t`The party needs a long rest before another short one helps`);
    this.advanceTime(60);
    this.log('system', this.t`The party rests for an hour. ${this.recoverShort()}`);
  }

  /** Eight hours of sleep. Outside a safe place the camp may be attacked instead. */
  longRest() {
    this.needExplore();
    const w = this.world;
    if (w.minutes - this.s.lastLongRest < 16 * 60) throw new GameError(this.t`The party is not tired enough for another long rest yet`);
    if (!this.isSafe() && !this.s.setting?.campaign && this.rng() < 0.3) {
      this.advanceTime(4 * 60);
      this.log('system', this.t`The camp is attacked in the night!`);
      const code = trueTerrain(w, w.party);
      const table = ENCOUNTERS[code] ?? ENCOUNTERS.p;
      this.startEncounter(table[Math.floor(this.rng() * table.length)], { source: 'wild', context: 'The party made camp in the wild and is attacked in the middle of the night.' });
      return;
    }
    this.advanceTime(8 * 60);
    this.log('system', this.t`The party sleeps for eight hours and wakes restored. ${formatTime(w.minutes, this.lang)}. ${this.recoverLong()}`);
    this.beats.push({ kind: 'rest', long: true });
  }

  /**
   * The story let the party rest: an hour or more is a short rest, eight hours a long one, as in
   * the rules. The Dungeon Master already told how it went, so no ambush is rolled. `passed` is how
   * much of the rest is already on the clock; only the remainder is added. A long rest too soon
   * after the last one counts as a short rest, and with no short rest left nothing is restored.
   */
  storyRest(kind: 'short' | 'long', passed = 0) {
    this.needExplore();
    const w = this.world;
    let long = kind === 'long';
    if (long && w.minutes + Math.max(0, 8 * 60 - passed) - this.s.lastLongRest < 16 * 60) long = false;
    if (!long && this.s.shortRestsLeft <= 0) {
      return { rested: false, note: 'The party has had both its short rests since the last long rest; nothing is restored until it sleeps.' };
    }
    this.advanceTime(Math.max(0, (long ? 8 * 60 : 60) - Math.max(0, passed)));
    const restored = long ? this.recoverLong() : this.recoverShort();
    this.log('system', long ? this.t`Long rest. ${restored}` : this.t`Short rest. ${restored}`);
    return { rested: true, kind: long ? 'long' : 'short', restored, ...(kind === 'long' && !long ? { note: 'Too soon after the last long rest, so it counts as a short rest.' } : {}) };
  }

  /** What a short rest brings back, as one line for the log: "Maeve: +9 HP, +2 mana; Brann: Second Wind". */
  private recoverShort(): string {
    this.s.shortRestsLeft--;
    const parts: string[] = [];
    for (const c of this.party()) {
      if (c.dead) continue;
      this.dropConcentration(c);
      this.expireBuffs(c, 'short');
      let healed = 0;
      if (c.hitDice > 0 && c.hp < c.maxHp) {
        c.hitDice--;
        healed = this.healChar(c, Math.max(1, roll(`1d${CLASSES[c.classId].hitDie}`, this.rng).total + abilityMod(c.abilities.con)));
      }
      c.spent = [];
      c.inspired = undefined;
      // Class resources: some come back whole, some one use at a time.
      const back: string[] = [];
      for (const [id, used] of Object.entries(c.uses ?? {})) {
        const def = RESOURCES[id];
        if (!def || !used) continue;
        if (def.rest === 'short' || (id === 'inspiration' && this.feat(c, 'font_of_inspiration'))) c.uses![id] = 0;
        else if (def.shortGain) this.regain(c, id, def.shortGain);
        else continue;
        if (def.show) back.push(this.lang === 'de' ? def.de : def.name);
      }
      if (c.uses) delete c.uses._relentless;
      // A warlock's pact magic returns in full. Others recover a little, and once per long rest a caster's recovery feature adds more.
      let more = c.classId === 'warlock' ? c.maxMana : 2;
      if (this.left(c, 'recovery') > 0 && (c.mana < c.maxMana || this.feat(c, 'sorcerous_restoration'))) {
        this.spendUse(c, 'recovery');
        if (this.feat(c, 'sorcerous_restoration')) this.regain(c, 'sorcery', Math.floor(c.level / 2));
        else more += c.level;
      }
      const mana = c.maxMana ? Math.min(c.maxMana - c.mana, more) : 0;
      c.mana += mana;
      const line = this.restoredLine(c, healed, mana, back);
      if (line) parts.push(line);
    }
    return parts.length ? this.t`Restored: ${parts.join('; ')}.` : this.t`Nobody needed it.`;
  }

  /** Everything back to full after a long rest, as one line for the log. */
  private recoverLong(): string {
    this.buryCompanions();
    const w = this.world;
    this.s.lastLongRest = w.minutes;
    this.s.shortRestsLeft = 2;
    const parts: string[] = [];
    for (const c of this.party()) {
      if (c.dead) continue;
      const hp = c.maxHp - c.hp, mana = c.maxMana - c.mana;
      const back = Object.entries(c.uses ?? {}).filter(([id, used]) => used && RESOURCES[id]?.show).map(([id]) => (this.lang === 'de' ? RESOURCES[id].de : RESOURCES[id].name));
      this.dropConcentration(c);
      this.expireBuffs(c, 'long');
      this.healChar(c, c.maxHp);
      c.mana = c.maxMana;
      c.hitDice = c.level;
      c.spent = [];
      c.uses = {};
      c.tempHp = 0;
      c.inspired = undefined;
      c.conditions = c.conditions.filter((x) => x !== 'mage armor');
      for (const it of [...c.bag, ...Object.values(c.equipment)]) if (it?.used) it.used = 0;
      c.ac = this.computeAc(c);
      const line = this.restoredLine(c, Math.max(0, hp), Math.max(0, mana), back);
      if (line) parts.push(line);
    }
    return parts.length ? this.t`Restored: ${parts.join('; ')}.` : this.t`Nobody needed it.`;
  }

  private restoredLine(c: Character, hp: number, mana: number, back: string[]): string | null {
    const bits = [...(hp ? [this.t`+${hp} HP`] : []), ...(mana ? [this.t`+${mana} mana`] : []), ...back];
    return bits.length ? `${c.name}: ${bits.join(', ')}` : null;
  }

  // ---------------------------------------------------------------- trading
  // Merchants keep real stock and real gold. Players buy and sell through the trade window;
  // the server prices everything, moves the gold and the goods, and writes it to the log.

  /** The settlement a place belongs to: a tavern's town, or the place itself. */
  private rootOf(loc: LocationState): LocationState {
    return (loc.parentId && this.location(loc.parentId)) || loc;
  }

  /** Thin shelves and light purses outside the towns. */
  private shopScale(shop: ShopState): number {
    const loc = shop.locationId ? this.location(shop.locationId) : undefined;
    return loc && this.rootOf(loc).kind === 'village' ? 0.6 : 1;
  }

  /** Every town has a general store, a smith and an apothecary; a village has one trader. */
  private seedShops(root: LocationState) {
    const kinds: ShopKind[] = root.kind === 'town' ? ['general', 'smith', 'alchemist'] : root.kind === 'village' ? ['general'] : [];
    for (const kind of kinds) {
      const id = `shop_${root.id}_${kind}`;
      if (this.s.shops[id] || Object.keys(this.s.shops).length >= MAX_SHOPS) continue;
      this.s.shops[id] = {
        id, name: this.n(SHOP_NAMES[kind]), kind, locationId: root.id, at: null, npcId: null, markup: root.kind === 'village' ? 1.1 : 1,
        stock: [], gold: 0, cycle: -1, mood: 0, moodDay: 0, haggledDay: 0, origin: 'seed',
      };
    }
  }

  /** Refill the shelves when a restock is due, and let yesterday's haggling wear off. */
  private refreshShop(shop: ShopState) {
    const day = this.day();
    const cycle = Math.floor((day - 1) / RESTOCK_DAYS);
    if (shop.cycle !== cycle) {
      const scale = this.shopScale(shop);
      const fresh = rollStock(shop.kind, seedStream(String(this.s.world?.seed ?? 0), `${shop.id}|${cycle}`), scale);
      const kept = shop.stock.filter((e) => e.keep && e.qty > 0);
      shop.stock = [...kept, ...fresh.filter((f) => !kept.some((k) => k.defId === f.defId))];
      shop.gold = Math.round(SHELVES[shop.kind].purse * scale);
      shop.cycle = cycle;
    }
    if (shop.moodDay !== day) shop.mood = 0;
  }

  /** The merchants the party can trade with where it stands. None in a fight or on the road. */
  shopsHere(): ShopState[] {
    const s = this.s, w = s.world;
    if (!w || s.phase !== 'explore' || s.travel) return [];
    const place = this.place();
    const root = place ? this.rootOf(place) : null;
    if (root) this.seedShops(root);
    const here = Object.values(s.shops).filter((sh) => {
      if (!sh.locationId) return !place && !!sh.at && sameHex(sh.at, w.party);
      const loc = this.location(sh.locationId);
      return !!root && !!loc && this.rootOf(loc).id === root.id;
    });
    for (const sh of here) this.refreshShop(sh);
    return here;
  }

  private shopNpc(shop: ShopState): NpcState | undefined {
    return shop.npcId ? this.s.memory.npcs.find((n) => n.id === shop.npcId) : undefined;
  }

  /** What the traders' guild thinks of the party does to the prices in every shop but a peddler's. */
  private priceFactor(shop: ShopState): number { return shop.kind === 'peddler' ? 1 : guildFactor(this); }

  /** A shop as the price sums see it: its own markup with the guild's opinion counted in. */
  priced(shop: ShopState): Pick<ShopView, 'kind' | 'markup' | 'mood'> {
    return { kind: shop.kind, markup: shop.markup * this.priceFactor(shop), mood: shop.mood };
  }

  /** How the keeper of a shop feels about the party, with their faction's opinion counted in. */
  private keeperMood(shop: ShopState): Disposition {
    const npc = this.shopNpc(shop);
    return npc ? attitude(this, npc) : 'neutral';
  }

  shopView(shop: ShopState): ShopView {
    const npc = this.shopNpc(shop);
    const day = this.day();
    return {
      id: shop.id, name: shop.name, kind: shop.kind, merchant: npc?.name ?? null, disposition: this.keeperMood(shop), factor: this.priceFactor(shop),
      stock: shop.stock.filter((e) => e.qty > 0 && this.def(e.defId)).map(({ defId, qty }) => ({ defId, qty })),
      purse: shop.gold, markup: shop.markup * this.priceFactor(shop), mood: shop.mood, haggled: shop.haggledDay === day,
      restockIn: (shop.cycle + 1) * RESTOCK_DAYS + 1 - day,
    };
  }

  /** The shop a player wants to trade with, if it is here and its keeper is willing. */
  private tradingShop(shopId: string): ShopState {
    const shop = this.shopsHere().find((sh) => sh.id === shopId);
    if (!shop) throw new GameError(this.t`That merchant is not here`);
    if (this.keeperMood(shop) === 'hostile') throw new GameError(this.t`${this.shopNpc(shop)!.name} will not trade with you`);
    return shop;
  }

  private countOf(def: ItemDef, qty: number) { return `${qty > 1 ? `${qty}× ` : ''}${this.n(def.name)}`; }

  /** A hero buys from a merchant with the party's gold. */
  buy(playerId: string, characterId: string, shopId: string, defId: string, qtyRaw: number) {
    const c = this.actor(playerId, characterId, false);
    const shop = this.tradingShop(shopId);
    const entry = shop.stock.find((e) => e.defId === defId && e.qty > 0);
    const def = entry && this.def(entry.defId);
    if (!entry || !def) throw new GameError(this.t`That is sold out`);
    const qty = Math.max(1, Math.min(entry.qty, def.stackable ? 20 : 1, Math.round(qtyRaw) || 1));
    const price = buyPrice(def, this.priced(shop)) * qty;
    if (this.s.gold < price) throw new GameError(this.t`The party only has ${this.s.gold} gp`);
    if (!this.hasRoomFor(c, def)) throw new GameError(this.t`${c.name}'s bag is full`);
    this.addToBag(c, def.id, qty);
    this.s.gold -= price;
    shop.gold += price;
    entry.qty -= qty;
    if (entry.qty <= 0) shop.stock.splice(shop.stock.indexOf(entry), 1);
    this.s.stats.trades++;
    // Spending money in guild shops earns a little goodwill, but only up to a point.
    if (price >= 50 && shop.kind !== 'peddler' && (this.s.factions.find((f) => f.id === 'guild')?.standing ?? 0) < 30) shiftStanding(this, 'guild', 1, this.t`steady custom`);
    this.log('system', this.t`${c.name} buys ${this.countOf(def, qty)} at ${shop.name} for ${price} gp.`);
    return { item: def.name, quantity: qty, price, gold: this.s.gold };
  }

  /** A hero sells something to a merchant. The gold goes to the party. */
  sell(playerId: string, characterId: string, shopId: string, from: InvLoc, qtyRaw: number) {
    const c = this.actor(playerId, characterId, false);
    const shop = this.tradingShop(shopId);
    if (!this.validLoc(from)) throw new GameError(this.t`Bad inventory slot`);
    const item = this.getLoc(c, from);
    if (!item) throw new GameError(this.t`Nothing there`);
    const def = this.def(item.defId);
    if (def.story?.quest) throw new GameError(this.t`${this.n(def.name)} is a quest item and stays with the party`);
    const each = sellPrice(def, this.priced(shop));
    if (each <= 0) throw new GameError(this.t`Nobody here will pay for ${this.n(def.name)}`);
    if (shop.gold < each) throw new GameError(this.t`The merchant cannot afford that right now`);
    const qty = Math.max(1, Math.min(item.qty, Math.floor(shop.gold / each), Math.round(qtyRaw) || 1));
    const total = each * qty;
    item.qty -= qty;
    if (item.qty <= 0) this.setLoc(c, from, null);
    c.ac = this.computeAc(c);
    this.s.gold += total;
    shop.gold -= total;
    const shelf = shop.stock.find((e) => e.defId === def.id);
    if (shelf) shelf.qty += qty; else shop.stock.push({ defId: def.id, qty });
    this.log('system', this.t`${c.name} sells ${this.countOf(def, qty)} at ${shop.name} for ${total} gp.`);
    this.s.stats.trades++;
    return { item: def.name, quantity: qty, price: total, gold: this.s.gold };
  }

  /** One Persuasion check a day at each shop. A good one lowers the prices, a bad one raises them. */
  haggle(playerId: string, characterId: string, shopId: string) {
    const c = this.actor(playerId, characterId, false);
    const shop = this.tradingShop(shopId);
    const day = this.day();
    if (shop.haggledDay === day) throw new GameError(this.t`You have already haggled here today`);
    const dc = HAGGLE_DC[this.keeperMood(shop)];
    const check = this.skillCheck(c.id, 'cha', 'persuasion', dc);
    const result = haggleMood(check.total, dc);
    shop.haggledDay = day;
    if (result === 2) this.s.stats.haggled++;
    if (result !== 0) { shop.mood = result; shop.moodDay = day; }
    this.log('system', result === 2 ? this.t`${c.name} drives a hard bargain at ${shop.name}: much better prices for the rest of the day.`
      : result === 1 ? this.t`${c.name} talks the prices down at ${shop.name} for the rest of the day.`
      : result === -1 ? this.t`${c.name} oversteps at ${shop.name}, and the prices go up for the rest of the day.`
      : this.t`${c.name} haggles at ${shop.name}, but the prices stay as they are.`);
    return { ...check, mood: shop.mood };
  }

  /**
   * The Dungeon Master shows the players a merchant's wares. An existing shop here is reused
   * (by id, name, merchant or kind); otherwise a new one is set up where the party stands.
   */
  openShop(input: { merchant?: string; shop?: string; kind?: string; prices?: string; stock?: string; discount?: number }) {
    this.needExplore();
    const s = this.s;
    const here = this.shopsHere();
    const ref = (input.shop ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const merchant = (input.merchant ?? '').trim().slice(0, 60);
    const kind = shopKindOf(input.kind ?? '');
    const known = merchant ? s.memory.npcs.find((n) => n.name.toLowerCase() === merchant.toLowerCase() || n.id === merchant) : undefined;
    const key = ref.toLowerCase();
    let shop = (key ? here.find((sh) => sh.id.toLowerCase() === key || sh.name.toLowerCase() === key) : undefined)
      ?? (known ? here.find((sh) => sh.npcId === known.id) : undefined)
      // A town's nameless smithy becomes this smith's forge instead of gaining a rival next door.
      ?? (kind ? here.find((sh) => sh.kind === kind && sh.origin === 'seed' && !sh.npcId) : undefined)
      ?? (!key && !merchant && !kind && here.length === 1 ? here[0] : undefined);
    const created = !shop;
    const place = this.place();
    if (!shop) {
      if (Object.keys(s.shops).length >= MAX_SHOPS) throw new GameError('This table already has as many shops as it can hold. Reopen an existing one.');
      const k: ShopKind = kind ?? (place ? 'general' : 'peddler');
      const name = ref || this.n(SHOP_NAMES[k]);
      const village = !!place && this.rootOf(place).kind === 'village';
      shop = {
        id: this.uniqueId('shop', ref || merchant || k, (id) => !!s.shops[id]), name, kind: k, locationId: place?.id ?? null, at: place ? null : { ...this.world.party },
        npcId: null, markup: place ? (village ? 1.1 : 1) : 1.15, stock: [], gold: 0, cycle: -1, mood: 0, moodDay: 0, haggledDay: 0, origin: 'dm',
      };
      s.shops[shop.id] = shop;
      this.refreshShop(shop);
    } else if (ref && key !== shop.id.toLowerCase()) {
      shop.name = ref;
    }
    if (merchant) shop.npcId = this.rememberNpc({ name: merchant, locationId: place?.id ?? '' }).id;
    const prices = (input.prices ?? '').trim().toLowerCase();
    if (prices === 'cheap') shop.markup = 0.9;
    else if (prices === 'steep') shop.markup = 1.25;
    else if (prices === 'fair') shop.markup = 1;
    const unknown: string[] = [];
    for (const want of (input.stock ?? '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 8)) {
      const def = this.findItemDef(want);
      if (!def || def.story?.quest) { unknown.push(want); continue; }
      const shelf = shop.stock.find((e) => e.defId === def.id);
      if (shelf) { shelf.keep = true; shelf.qty = Math.max(1, shelf.qty); } else shop.stock.push({ defId: def.id, qty: 1, keep: true });
    }
    const discount = Number(input.discount);
    if (Number.isFinite(discount) && Math.round(discount / 10) !== 0) { shop.mood = clampMood(discount / 10); shop.moodDay = this.day(); }
    s.tradeOffer = { shopId: shop.id, seq: (s.tradeOffer?.seq ?? 0) + 1 };
    const view = this.shopView(shop);
    return {
      shop_id: shop.id, name: shop.name, kind: shop.kind, created, merchant: view.merchant, party_gold: s.gold, merchant_gold: shop.gold,
      for_sale: view.stock.map((e) => `${this.def(e.defId).name}${e.qty > 1 ? ` ×${e.qty}` : ''}: ${buyPrice(this.def(e.defId), this.priced(shop))} gp`),
      ...(unknown.length ? { unknown_items: unknown } : {}),
      note: 'The trade window is now open on the players\' screens. They buy, sell and haggle there themselves and the server moves the gold and the goods, so do not call change_gold, give_item or take_item for what is traded in the window. Have the merchant show the wares in a sentence or two; quote only prices from this list.',
    };
  }

  // ------------------------------------------------ Dungeon Master's tools
  // Everything below is called by the DM. The DM proposes; these methods
  // validate, clamp and apply, so the server stays the owner of the state.

  /** Ability check requested by the Dungeon Master. */
  /** A check that waits for its player to press Roll: set by the room, and the one waiting now. */
  checkWaiter: ((check: PendingCheck) => Promise<void>) | null = null;
  pendingCheck: PendingCheck | null = null;
  checkWaitMs = 45000;
  /** How long a new fight waits for its players to get ready before the first monster moves. 0 starts at once. */
  readyWaitMs = 0;
  private checkSeq = 0;

  /** What a check will add to the d20, part by part, before anything is rolled. */
  checkPreview(c: Character, ability: AbilityKey, skill: string): { parts: PendingCheck['parts']; modifier: number; mode: RollMode; label: string } {
    const name = skill.trim().toLowerCase();
    const proficient = c.skills.includes(name);
    const parts: PendingCheck['parts'] = [{ label: this.n(ABILITY_NAMES[ability]), value: signed(abilityMod(c.abilities[ability])) }];
    let modifier = abilityMod(c.abilities[ability]);
    const prof = proficient ? c.profBonus * (c.expertise.includes(name) ? 2 : 1) : this.feat(c, 'jack_of_all_trades') ? Math.floor(c.profBonus / 2) : 0;
    if (prof) { parts.push({ label: proficient && c.expertise.includes(name) ? this.n('Expertise') : proficient ? this.n('Proficiency') : this.n('Jack of All Trades'), value: signed(prof) }); modifier += prof; }
    const guide = (c.buffs ?? []).find((b) => SPELL_BUFFS[b.id]?.check);
    if (guide) parts.push({ label: this.n(ABILITIES[guide.id]?.name ?? 'Guidance'), value: `+${SPELL_BUFFS[guide.id].check}` });
    if ((this.opted(c, 'order_thaumaturge') && ['arcana', 'religion'].includes(name)) || (this.opted(c, 'primal_magician') && ['arcana', 'nature'].includes(name))) {
      const w = Math.max(1, this.mod(c, 'wis'));
      parts.push({ label: this.n(ABILITY_NAMES.wis), value: signed(w) });
      modifier += w;
    }
    const adv = (name === 'athletics' && this.feat(c, 'remarkable_athlete')) || (ability === 'str' && c.conditions.includes('raging'));
    const mode = rollMode(adv, c.conditions.includes('poisoned'));
    const skillName = name ? this.n(name) : '';
    const label = name ? this.t`${skillName[0].toUpperCase() + skillName.slice(1)} check` : this.t`${this.n(ABILITY_NAMES[ability])} check`;
    return { parts, modifier, mode, label };
  }

  /**
   * A check the Dungeon Master asks for. When the hero's player is at the table, the game waits
   * for them to press Roll (or for the time to run out) before the die is cast: the pen-and-paper moment.
   */
  async requestCheck(characterId: string, ability: AbilityKey, skill: string, dc: number) {
    const c = this.char(characterId);
    if (!this.conscious(c)) throw new GameError(this.t`${c.name} is in no state to try that`);
    const waiter = this.checkWaiter;
    if (!waiter || !this.player(c.ownerId)?.connected || this.pendingCheck) return this.skillCheck(characterId, ability, skill, dc);
    const preview = this.checkPreview(c, ability, skill);
    const check: PendingCheck = { id: `check-${Date.now().toString(36)}-${++this.checkSeq}`, characterId, hero: c.name, label: preview.label, ability, skill: skill.trim().toLowerCase(), dc, mode: preview.mode, parts: preview.parts, modifier: preview.modifier, since: Date.now(), until: Date.now() + this.checkWaitMs };
    this.pendingCheck = check;
    try { await waiter(check); } finally { this.pendingCheck = null; }
    return this.skillCheck(characterId, ability, skill, dc, check.id);
  }

  /** A player presses Roll: only someone who may play the hero. */
  pressRoll(playerId: string, id: string) {
    const p = this.pendingCheck;
    if (!p || p.id !== id) throw new GameError(this.t`There is nothing to roll right now`);
    if (!this.mayControl(playerId, this.char(p.characterId))) throw new GameError(this.t`That hero belongs to another player`);
  }

  skillCheck(characterId: string, ability: AbilityKey, skill: string, dc: number, checkId?: string) {
    const c = this.char(characterId);
    if (!this.conscious(c)) throw new GameError(this.t`${c.name} is in no state to try that`);
    const name = skill.trim().toLowerCase();
    const proficient = c.skills.includes(name);
    // Jack of All Trades: half proficiency where there is none.
    const prof = proficient ? c.profBonus * (c.expertise.includes(name) ? 2 : 1) : this.feat(c, 'jack_of_all_trades') ? Math.floor(c.profBonus / 2) : 0;
    let mod = abilityMod(c.abilities[ability]) + prof;
    // Guidance: a die for the next check, which uses it up.
    const guide = (c.buffs ?? []).find((b) => SPELL_BUFFS[b.id]?.check);
    if (guide) { mod += roll(SPELL_BUFFS[guide.id].check!, this.rng).total; this.removeBuffs(c, (b) => b === guide, true); }
    if ((this.opted(c, 'order_thaumaturge') && ['arcana', 'religion'].includes(name)) || (this.opted(c, 'primal_magician') && ['arcana', 'nature'].includes(name))) mod += Math.max(1, this.mod(c, 'wis'));
    const adv = (name === 'athletics' && this.feat(c, 'remarkable_athlete')) || (ability === 'str' && c.conditions.includes('raging'));
    const mode = rollMode(adv, c.conditions.includes('poisoned'));
    let r = this.heroD20(c, mode).value;
    // Reliable Talent: a practised rogue never rolls below 10.
    if (proficient && this.feat(c, 'reliable_talent') && r < 10) r = 10;
    let total = r + mod;
    if (ability === 'str' && this.feat(c, 'indomitable_might')) total = Math.max(total, c.abilities.str);
    let success = total >= dc;
    const skillName = name ? this.n(name) : '';
    const label = name ? this.t`${skillName[0].toUpperCase() + skillName.slice(1)} check` : this.t`${this.n(ABILITY_NAMES[ability])} check`;
    const info: RollInfo = { actor: c.name, label, die: r, rolls: [r], mode, modifier: mod, total, target: { kind: 'DC', value: dc }, outcome: success ? 'success' : 'failure', ...(checkId ? { checkId } : {}) };
    this.log('roll', this.t`${c.name}: ${label}, ${r}${signed(mod)} = ${total} vs DC ${dc}. ${success ? this.t`Success.` : this.t`Failure.`}`, { roll: info });
    // Heroic Inspiration: the first failed check is rerolled once, and the new roll counts.
    if (!success && c.heroic) {
      c.heroic = false;
      let again = this.heroD20(c, mode).value;
      if (proficient && this.feat(c, 'reliable_talent') && again < 10) again = 10;
      r = again;
      total = r + mod;
      if (ability === 'str' && this.feat(c, 'indomitable_might')) total = Math.max(total, c.abilities.str);
      success = total >= dc;
      this.log('roll', this.t`${c.name}: Inspiration rerolls, ${r}${signed(mod)} = ${total} vs DC ${dc}. ${success ? this.t`Success.` : this.t`Failure.`}`);
    }
    // Peerless Skill: a failed check gets an inspiration die, spent only if it turns the result.
    if (!success && this.feat(c, 'peerless_skill') && this.left(c, 'inspiration') > 0) {
      const die = rollDie(inspirationDie(c), this.rng);
      total += die;
      success = total >= dc;
      if (success) this.spendUse(c, 'inspiration');
      this.log('roll', this.t`${c.name}: ${this.n('Peerless Skill')} adds ${die}, ${total} vs DC ${dc}. ${success ? this.t`Success.` : this.t`Failure.`}`);
    }
    // A Stealth check that succeeded lets the next fight open with the enemies caught unawares.
    if (name === 'stealth') {
      const sneaks = (this.s.sneaks ??= {});
      if (success) sneaks[c.id] = { total, at: this.s.world ? this.world.minutes : 0 };
      else delete sneaks[c.id];
    }
    return { character: c.name, roll: r, modifier: mod, total, dc, success };
  }

  /** Narration shown to the players as a scene card, headed by where it plays, when, and who is there. */
  addScene(scene: { title: string; mood: Mood; text: string; actions: string[] }, opts: { battle?: boolean } = {}) {
    this.spoilsOpen = false;
    // "[Persuasion] Convince Hendrick": the tag becomes the chip's skill icon and the hero's bonus.
    const tagged = scene.actions.map((a) => parseActionTag(String(a))).map((a) => ({ text: a.text.slice(0, 80), skill: a.skill })).filter((a) => a.text).slice(0, 5);
    const meta: SceneMeta = { title: scene.title.trim().slice(0, 80), mood: scene.mood, actions: tagged.map((a) => a.text), imageId: null };
    if (tagged.some((a) => a.skill)) meta.actionSkills = tagged.map((a) => a.skill);
    if (this.s.world) Object.assign(meta, this.stage(), { time: timeOfDay(this.world.minutes) });
    let ask = this.pictureAsk;
    this.pictureAsk = null;
    if (!ask && this.pictures) {
      ask = placeAsk(this, scene.text);
      if (ask) { this.newPlace = null; this.pictures.note?.('place', 'made_by_server'); }
      else if (this.s.phase !== 'lobby') {
        // Say why nothing was painted, so the Innkeeper can see it: a limit, or the Dungeon Master simply did not ask.
        const open = PICTURE_MOMENTS.some((m) => !this.pictures!.gate(m));
        this.pictures.note?.('none', open ? 'dm_skipped' : (this.pictures.gate('boss') ?? 'moment'));
      }
    }
    if (ask && this.pictures) meta.painting = true;
    // The opening and the end of a fight, and answers during one, are big moments.
    this.log('dm', scene.text.trim(), { scene: meta, ...(opts.battle || this.s.phase === 'combat' ? { battle: 'key' as const } : {}) });
    if (ask && this.pictures) this.pictures.paint(this.s.logSeq, ask);
  }

  /** An illustration arrived for a story entry (id null: it could not be painted). */
  setPicture(entryId: number, id: string | null): boolean {
    const entry = this.s.log.find((l) => l.id === entryId);
    if (!entry?.scene) return false;
    delete entry.scene.painting;
    if (id) entry.scene.imageId = id;
    return true;
  }

  /**
   * After the story was brought in line with the game (the party moved, time passed, people left),
   * the newest scene's header shows the corrected place, time and people.
   */
  restageLastScene() {
    if (!this.s.world) return;
    const last = [...this.s.log].reverse().find((l) => l.kind === 'dm' && l.scene);
    if (last?.scene) Object.assign(last.scene, this.stage(), { time: timeOfDay(this.world.minutes) });
  }

  /** A key for where the party stands, so a stage set in one place is not shown in another. */
  private stageKey() { const w = this.world; return w.placeId ?? `${w.party.q},${w.party.r}`; }

  /**
   * Where the current scene plays and who is in it besides the heroes. What the Dungeon Master
   * set holds while the party stays put; otherwise it is the place and the people known to be there.
   */
  stage(): { where: string; present: string[] } {
    const set = this.s.stage;
    if (set && set.at === this.stageKey()) return { where: set.where, present: [...set.present] };
    const place = this.place();
    const parent = place?.parentId ? this.location(place.parentId) : null;
    const where = place ? (parent ? `${place.name}, ${parent.name}` : place.name) : this.n(TERRAIN[trueTerrain(this.world, this.world.party)].name);
    return { where, present: this.presentNpcs().filter((n) => n.met).map((n) => n.name).slice(0, 6) };
  }

  /** The scene header for the side panel: the people in it, matched to the people the party knows. */
  sceneView(): { where: string; present: ScenePerson[] } {
    const { where, present } = this.stage();
    return { where, present: present.map((name) => {
      const n = this.npcNamed(name);
      return n ? { name: n.name, npcId: n.id, role: n.role, disposition: n.disposition } : { name };
    }) };
  }

  /**
   * A person the party has met, by the name the scene uses: the full name, or a part of it such as
   * "Bram" for "Bram Riedel". Ambiguous short names match nobody, and so do descriptions like "the guard".
   */
  npcNamed(name: string): NpcState | null {
    const key = name.trim().toLowerCase();
    if (!key) return null;
    const met = this.s.memory.npcs.filter((n) => n.met);
    const exact = met.find((n) => n.name.toLowerCase() === key);
    if (exact) return exact;
    const words = (x: string) => x.toLowerCase().split(/[\s,.'"„“]+/).filter((w) => w.length > 2);
    const asked = words(key);
    const hits = met.filter((n) => { const own = words(n.name); return asked.length > 0 && asked.every((w) => own.includes(w)); });
    if (hits.length === 1) return hits[0];
    const here = hits.filter((n) => n.locationId && n.locationId === this.s.world?.placeId);
    return here.length === 1 ? here[0] : null;
  }

  /**
   * The Dungeon Master says where exactly the scene plays and who is in it. Plain strings:
   * an empty "where" keeps the place, "present" is a comma-separated list of names, or "none".
   */
  setStage(input: { where?: string; present?: string; spot?: string; nearby?: string }) {
    // The zone map follows the scene: the spot named, or one the header names. It may step the party into or out of the tavern.
    const spot = (input.spot ?? '').trim();
    const zone = spot || (input.nearby ?? '').trim() ? enterSpot(this, spot, input.nearby ?? '') : null;
    if (!spot && input.where) followHeader(this, input.where);
    const now = this.stage();
    const root = zoneRoot(this, this.place());
    const named = spot && zone && 'spot' in zone && !now.where.toLowerCase().includes(zone.spot.toLowerCase())
      ? (root && zone.spot !== root.name ? `${zone.spot}, ${root.name}` : zone.spot) : '';
    const where = (input.where ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || named || now.where;
    const raw = (input.present ?? '').trim();
    const heroes = new Set(this.s.characters.map((c) => c.name.toLowerCase()));
    const present = !raw ? now.present : /^(none|nobody|niemand|keine?r?)$/i.test(raw) ? [] : [...new Set(raw.split(/[,;\n]+/).map((x) => x.trim().slice(0, 40)).filter((x) => x && !heroes.has(x.toLowerCase())))].slice(0, 8);
    this.s.stage = { at: this.stageKey(), where, present };
    // People the party knows who are in the scene were last seen here, not where they were before.
    const placeId = this.world.placeId;
    if (placeId) for (const name of present) { const n = this.npcNamed(name); if (n) n.locationId = placeId; }
    return { where, present: present.length ? present : 'nobody but the party', ...(zone ? { zone_map: zone } : {}) };
  }

  /**
   * File what the party found out under the open question it helps to answer, so the journal
   * can show what they know. A new question opens a new entry; "solved" closes it.
   */
  noteClue(input: { question?: string; clue?: string; source?: string; solved?: boolean }) {
    const mem = this.s.memory;
    const question = (input.question ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const text = (input.clue ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!question) throw new GameError(this.t`Name the question this clue belongs to`);
    const key = (q: string) => q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    let m = mem.mysteries.find((x) => x.id === question || key(x.question) === key(question));
    if (!m) {
      if (!text) throw new GameError(this.t`Describe what the party found out`);
      if (mem.mysteries.length >= 40) {
        const old = mem.mysteries.findIndex((x) => x.solved);
        if (old < 0) throw new GameError(this.t`The journal has no room for another open question`);
        mem.mysteries.splice(old, 1);
      }
      m = { id: this.uniqueId('mystery', question, (id) => mem.mysteries.some((x) => x.id === id)), question, solved: false, clues: [] };
      mem.mysteries.push(m);
    }
    if (text && !m.clues.some((c) => key(c.text) === key(text))) {
      m.clues.push({ day: this.day(), text, source: (input.source ?? '').trim().slice(0, 60), place: this.stage().where });
      if (m.clues.length > 15) m.clues.shift();
      this.log('system', this.t`A clue for your journal: ${m.question}`);
    }
    if (input.solved !== undefined && input.solved !== m.solved) {
      m.solved = input.solved;
      if (m.solved) this.log('system', this.t`Solved: ${m.question}`);
    }
    return { id: m.id, question: m.question, clues: m.clues.length, solved: m.solved };
  }

  addJournal(text: string) {
    const clean = text.trim().slice(0, 300);
    if (!clean) return;
    const j = this.s.memory.journal;
    j.push({ day: this.day(), text: clean, at: this.world.minutes });
    if (j.length > 120) j.splice(0, j.length - 120);
  }

  private uniqueId(prefix: string, name: string, taken: (id: string) => boolean) {
    const base = `${prefix}_${slug(name) || 'x'}`;
    let id = base;
    for (let n = 2; taken(id); n++) id = `${base}_${n}`;
    return id;
  }

  /** Create or update someone the party has met. */
  rememberNpc(input: { name: string; role?: string; description?: string; appearance?: string; disposition?: Disposition; locationId?: string; note?: string; formerly?: string }) {
    const name = input.name.trim().slice(0, 60);
    if (!name) throw new GameError(this.t`An NPC needs a name`);
    const mem = this.s.memory;
    let npc = mem.npcs.find((n) => n.name.toLowerCase() === name.toLowerCase() || n.id === name);
    let renamedFrom: string | undefined;
    if (!npc) {
      // The party learned a name for someone already saved under a description ("the gaunt figure").
      const former = input.formerly?.trim().toLowerCase();
      let known = former ? mem.npcs.find((n) => n.name.toLowerCase() === former || n.id === input.formerly?.trim()) : undefined;
      if (!known && !former) {
        // The DM forgot to say so: a single nameless-style person in the same place is almost certainly the same one.
        const here = input.locationId?.trim() || this.s.world?.placeId || '';
        const nameless = mem.npcs.filter((n) => n.met && n.locationId === here && /^\p{Ll}/u.test(n.name) || /^(the|a|an|der|die|das|ein|eine)\s/i.test(n.name));
        if (nameless.length === 1) known = nameless[0];
      }
      if (known) {
        const keepPortrait = !!known.portraitId && known.portraitKey === npcPortraitKey(known);
        renamedFrom = known.name;
        known.notes.push(`Earlier known as ${known.name}.`.slice(0, 200));
        if (known.notes.length > 12) known.notes.shift();
        known.name = name;
        if (keepPortrait) known.portraitKey = npcPortraitKey(known);
        npc = known;
      }
    }
    const created = !npc;
    if (!npc) {
      if (mem.npcs.length >= 150) throw new GameError(this.t`The cast is full; reuse an existing character`);
      npc = { id: this.uniqueId('npc', name, (id) => mem.npcs.some((n) => n.id === id)), name, role: '', description: '', disposition: 'neutral', locationId: null, notes: [], origin: 'dm', visual: { description: '', imageId: null }, met: true };
      mem.npcs.push(npc);
    }
    npc.met = true;
    if (input.role?.trim()) npc.role = input.role.trim().slice(0, 80);
    if (input.description?.trim()) npc.description = input.description.trim().slice(0, 400);
    // The look is fixed once written, so later pictures of this person stay consistent.
    if (input.appearance?.trim() && !npc.visual.description) npc.visual.description = input.appearance.trim().slice(0, 400);
    if (input.disposition) npc.disposition = input.disposition;
    const loc = input.locationId?.trim();
    if (loc && this.location(loc)) npc.locationId = loc;
    else if (created || loc === '') npc.locationId = this.s.world?.placeId ?? npc.locationId;
    if (input.note?.trim()) { npc.notes.push(input.note.trim().slice(0, 200)); if (npc.notes.length > 12) npc.notes.shift(); }
    return { id: npc.id, name: npc.name, created, location_id: npc.locationId, ...(renamedFrom ? { renamed_from: renamedFrom, note: 'Same person as before: portrait and memory are kept.' } : {}) };
  }

  /** Put a new place on the map. `direction` is a compass direction or "here". */
  createLocation(input: { name: string; kind: LocationKind; description: string; appearance?: string; direction: Compass | 'here'; distance: number }) {
    const w = this.world;
    const name = input.name.trim().slice(0, 60);
    if (!name) throw new GameError(this.t`A location needs a name`);
    const existing = w.locations.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.discovered = true;
      return { id: existing.id, name: existing.name, created: false, note: 'A place with this name already exists.', ...this.whereIs(existing) };
    }
    if (w.locations.filter((l) => l.origin === 'dm').length >= 80) throw new GameError(this.t`The map is full; reuse an existing location`);
    const distance = Math.max(0, Math.min(8, Math.round(input.distance) || 0));
    let at: Hex = w.party;
    let parentId: string | null = null;
    if (input.direction === 'here' || distance === 0) {
      parentId = w.locations.find((l) => !l.parentId && sameHex(l, w.party))?.id ?? null;
    } else {
      // Aim at a point in that direction, then take the nearest free, walkable hex.
      const angle = COMPASS.indexOf(input.direction) * (Math.PI / 4);
      const col = w.party.q + 0.5 * (w.party.r & 1) + Math.cos(angle) * distance;
      const row = w.party.r - (Math.sin(angle) * distance) / 0.866;
      const aim = { q: Math.max(0, Math.min(w.width - 1, Math.round(col - 0.5 * (Math.round(row) & 1)))), r: Math.max(0, Math.min(w.height - 1, Math.round(row))) };
      let best: Hex | null = null;
      for (let r = 0; r < w.height; r++) {
        for (let q = 0; q < w.width; q++) {
          const h = { q, r };
          if (sameHex(h, w.party) || !TERRAIN[trueTerrain(w, h)].passable || w.locations.some((l) => !l.parentId && sameHex(l, h))) continue;
          if (!best || hexDistance(h, aim) < hexDistance(best, aim)) best = h;
        }
      }
      if (!best) throw new GameError(this.t`There is no room on the map for a new place`);
      at = best;
    }
    const loc: LocationState = {
      id: this.uniqueId('loc', name, (id) => w.locations.some((l) => l.id === id)), name, kind: input.kind, q: at.q, r: at.r, parentId,
      description: input.description.trim().slice(0, 500), visited: false, origin: 'dm', visual: { description: (input.appearance ?? '').trim().slice(0, 400), imageId: null }, zone: null, discovered: true,
    };
    w.locations.push(loc);
    this.log('system', parentId || sameHex(at, w.party) ? this.t`New place: ${loc.name}.` : this.t`${loc.name} is marked on the map, ${hexDistance(w.party, at) * HEX_MILES} miles to the ${this.n(direction(w.party, at))}.`);
    return { id: loc.id, name: loc.name, created: true, ...this.whereIs(loc) };
  }

  whereIs(loc: { q: number; r: number }) {
    const w = this.world;
    const d = hexDistance(w.party, loc);
    return d === 0 ? { where: 'here' } : { where: `${d * HEX_MILES} miles ${direction(w.party, loc)}`, hexes: d };
  }

  /** Create a quest or change its state. Completing one pays out its reward once. */
  setQuest(input: { id?: string; title?: string; status?: QuestStatus; summary?: string; note?: string }) {
    const mem = this.s.memory;
    const title = (input.title ?? '').trim().slice(0, 80);
    let q = mem.quests.find((x) => x.id === input.id || (title && x.title.toLowerCase() === title.toLowerCase()));
    if (!q) {
      if (!title) throw new GameError(this.t`A quest needs a title`);
      if (mem.quests.length >= 60) throw new GameError(this.t`The quest log is full`);
      q = { id: this.uniqueId('quest', title, (id) => mem.quests.some((x) => x.id === id)), title, status: 'active', summary: '', notes: [] };
      mem.quests.push(q);
      this.log('system', this.t`New quest: ${q.title}.`);
      if (this.s.world) logEvent(this, { what: `The party took on the quest "${q.title}".`, by: 'party' });
    }
    if (input.summary?.trim()) q.summary = input.summary.trim().slice(0, 400);
    if (input.note?.trim()) { q.notes.push(input.note.trim().slice(0, 200)); if (q.notes.length > 12) q.notes.shift(); }
    if (input.status && input.status !== q.status) {
      const was = q.status;
      q.status = input.status;
      this.log('system', this.t`Quest ${this.n(q.status)}: ${q.title}.`);
      if (this.s.world) logEvent(this, { what: `The party ${q.status} the quest "${q.title}".`, by: 'party' });
      if (was === 'active' && q.status === 'completed') {
        if (q.rewardGold) { this.s.gold += q.rewardGold; this.log('system', this.t`Reward: ${q.rewardGold} gp.`); }
        if (q.rewardXp) this.grantXp(q.rewardXp, this.t`completing "${q.title}"`);
        q.rewardGold = 0;
        q.rewardXp = 0;
        shiftStanding(this, 'commons', 6, this.t`finished "${q.title}"`);
      } else if (was === 'active' && q.status === 'failed') shiftStanding(this, 'commons', -4, this.t`failed "${q.title}"`);
    }
    return { id: q.id, title: q.title, status: q.status };
  }

  recordDeed(text: string) {
    const clean = text.trim().slice(0, 240);
    if (!clean) throw new GameError(this.t`Describe the deed`);
    const deeds = this.s.memory.deeds;
    deeds.push({ id: this.uid('deed'), day: this.day(), text: clean });
    if (deeds.length > 60) deeds.shift();
    // Word gets around: the people here talk about it, and it travels on from them.
    if (this.place()) addRumour(this, { text: clean, aboutParty: true });
    return { recorded: clean };
  }

  /** Story experience for things other than winning fights. Clamped so the DM cannot skip levels. */
  /** The Dungeon Master rewards in-character play. One Heroic Inspiration at a time, only for a hero a player runs. */
  inspire(heroId: string, reason: string) {
    const c = this.s.characters.find((h) => h.id === heroId);
    if (!c || c.dead) throw new GameError(this.t`Unknown character`);
    if (c.heroic) return { already: true };
    c.heroic = true;
    const why = reason.trim().slice(0, 100);
    this.log('system', this.t`${c.name} is inspired` + (why ? ` (${why})` : '') + '.');
    return { granted: true };
  }

  awardXp(amount: number, reason: string) {
    const heroes = this.s.characters.filter((c) => !c.dead);
    const top = Math.max(1, ...heroes.map((c) => c.level));
    const granted = Math.max(10, Math.min(Math.round(amount) || 0, 75 * top * Math.max(1, heroes.length)));
    this.grantXp(granted, reason.trim().slice(0, 120) || this.t`their deeds`);
    return { granted };
  }

  changeGold(amount: number, reason: string) {
    const delta = Math.max(-100000, Math.min(500, Math.round(amount) || 0));
    if (this.s.gold + delta < 0) throw new GameError(this.t`The party only has ${this.s.gold} gp`);
    this.s.gold += delta;
    this.spoils({ gold: delta });
    if (delta) this.log('system', (delta > 0 ? this.t`The party gains ${delta} gp` : this.t`The party pays ${-delta} gp`) + (reason.trim() ? ` (${reason.trim().slice(0, 100)})` : '') + '.');
    return { gold: this.s.gold };
  }

  /** Set when a fight is won, until the next scene: what is found meanwhile joins the victory screen's spoils. */
  private spoilsOpen = false;

  private spoils(add: { item?: string; gold?: number }) {
    const f = this.s.lastFight;
    if (!this.spoilsOpen || !f || f.result !== 'victory' || this.s.phase !== 'explore') return;
    if (add.item && f.loot.length < 12) f.loot.push(add.item);
    if (add.gold && add.gold > 0) f.gold += add.gold;
  }

  grantItem(characterId: string, itemId: string, qty: number) {
    const c = this.char(characterId);
    const def = this.def(itemId);
    if (!def) throw new GameError(this.t`Unknown item "${itemId}"`);
    if (c.dead) throw new GameError(this.t`${c.name} is dead`);
    const n = Math.max(1, Math.min(def.stackable ? 10 : 1, Math.round(qty) || 1));
    if (!this.addToBag(c, itemId, n)) throw new GameError(this.t`${c.name}'s bag is full`);
    this.log('system', this.t`${c.name} receives ${`${n > 1 ? `${n}× ` : ''}${this.n(def.name)}`}.`);
    this.spoils({ item: `${n > 1 ? `${n}× ` : ''}${this.n(def.name)} (${c.name})` });
    return { character: c.name, item: def.name, quantity: n };
  }

  // ------------------------------------------------------------ story items

  /** Every item a hero carries or wears, with where it is. */
  private carried(c: Character): { item: ItemInstance; loc: InvLoc }[] {
    const out: { item: ItemInstance; loc: InvLoc }[] = [];
    c.bag.forEach((item, index) => { if (item) out.push({ item, loc: { type: 'bag', index } }); });
    for (const slot of SLOT_IDS) { const item = c.equipment[slot]; if (item) out.push({ item, loc: { type: 'slot', slot } }); }
    return out;
  }

  /** Find an item by id or by name, in English or the table's language. Story items win over the catalogue. */
  findItemDef(ref: string): ItemDef | null {
    const key = ref.trim().toLowerCase();
    if (!key) return null;
    const all = [...Object.values(this.s.items), ...Object.values(ITEMS)];
    return all.find((d) => d.id.toLowerCase() === key) ?? all.find((d) => d.name.toLowerCase() === key || this.n(d.name).toLowerCase() === key) ?? null;
  }

  /** Story items the party holds right now, with who has them. */
  heldStoryItems(): { def: ItemDef; holder: Character; qty: number }[] {
    const out: { def: ItemDef; holder: Character; qty: number }[] = [];
    for (const c of this.party()) {
      for (const { item } of this.carried(c)) {
        const def = this.s.items[item.defId];
        if (def) out.push({ def, holder: c, qty: item.qty });
      }
    }
    return out;
  }

  private addItemNote(def: ItemDef, note?: string) {
    const clean = (note ?? '').trim().slice(0, 240);
    if (!clean || !def.story || def.story.notes.some((n) => n.text === clean)) return;
    def.story.notes.push({ day: this.day(), text: clean });
    if (def.story.notes.length > 8) def.story.notes.splice(0, def.story.notes.length - 8);
  }

  /**
   * The DM hands a hero something that is not in the catalogue. The server builds the item:
   * any rules it has are copied from a catalogue item, so the DM can rename and describe
   * gear freely but cannot invent stronger gear than the game already has.
   */
  giveStoryItem(input: {
    characterId: string; name: string; description?: string; category?: ItemCategory; icon?: string; rarity?: string;
    value?: number; quantity?: number; quest?: boolean; baseItemId?: string; note?: string;
  }) {
    const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name) throw new GameError('The item needs a name');
    const first = this.char(input.characterId);
    const qtyAsked = Math.round(input.quantity ?? 1) || 1;
    let def = this.findItemDef(name);
    // A name the game already knows: hand out more of that item instead of making a twin.
    if (def && !def.story) return { ...this.grantItem(first.id, def.id, qtyAsked), item_id: def.id, created: false, quest_item: false };
    const created = !def;
    if (!def) {
      if (Object.keys(this.s.items).length >= 150) throw new GameError('This table already has as many story items as it can hold. Reuse or update an existing one.');
      const base = input.baseItemId && input.baseItemId !== 'none' ? ITEMS[input.baseItemId] : undefined;
      if (input.baseItemId && input.baseItemId !== 'none' && !base) throw new GameError(`Unknown base item "${input.baseItemId}"`);
      const category: ItemCategory = ITEM_CATEGORIES.includes(input.category as ItemCategory)
        ? input.category!
        : base?.weapon ? 'weapon' : base?.armor || base?.kind === 'shield' ? 'armor' : base?.consumable ? 'consumable' : 'trinket';
      const description = (input.description ?? '').trim().slice(0, 400);
      const rarity = input.rarity === 'uncommon' || input.rarity === 'rare' ? input.rarity : base?.rarity;
      def = {
        id: this.uniqueId('story', name, (id) => !!this.def(id)),
        name,
        kind: base?.kind ?? 'misc',
        icon: pickIcon(input.icon, name, description, category),
        description,
        value: Math.max(0, Math.min(Math.round(input.value ?? base?.value ?? 0) || 0, Math.max(500, base?.value ?? 0))),
        ...(base?.slot ? { slot: base.slot } : {}),
        ...(base?.weapon ? { weapon: base.weapon } : {}),
        ...(base?.armor ? { armor: base.armor } : {}),
        ...(base?.acBonus ? { acBonus: base.acBonus } : {}),
        ...(base?.consumable ? { consumable: base.consumable } : {}),
        ...(base ? (base.stackable ? { stackable: true } : {}) : category === 'material' || category === 'consumable' || qtyAsked > 1 ? { stackable: true } : {}),
        ...(rarity && rarity !== 'common' ? { rarity } : {}),
        story: {
          category,
          quest: !!input.quest || category === 'quest',
          baseId: base?.id ?? null,
          foundDay: this.day(),
          foundAt: this.s.world ? this.place()?.name ?? null : null,
          notes: [],
          imageId: null,
        },
      };
    }
    const qty = Math.max(1, Math.min(def.stackable ? 20 : 1, qtyAsked));
    // Nothing found in a story should be lost to a full backpack while a friend has room.
    const alive = this.s.characters.filter((c) => !c.dead);
    const taker = [first, ...alive.filter((c) => c.id !== first.id)].find((c) => !c.dead && (created ? this.firstFreeBag(c) >= 0 : this.hasRoomFor(c, def!)));
    if (!taker) throw new GameError(this.t`${first.name}'s bag is full`);
    if (created) this.s.items[def.id] = def;
    this.addToBag(taker, def.id, qty);
    this.addItemNote(def, input.note);
    this.log('system', this.t`${taker.name} receives ${`${qty > 1 ? `${qty}× ` : ''}${def.name}`}.`);
    this.spoils({ item: `${qty > 1 ? `${qty}× ` : ''}${def.name} (${taker.name})` });
    return { character: taker.name, item: def.name, item_id: def.id, quantity: qty, created, quest_item: !!def.story?.quest };
  }

  private hasRoomFor(c: Character, def: ItemDef) {
    return this.firstFreeBag(c) >= 0 || (!!def.stackable && c.bag.some((b) => b?.defId === def.id));
  }

  /** Rename, re-describe or annotate a story item as the party learns more about it. */
  updateStoryItem(input: { item: string; name?: string; description?: string; note?: string; quest?: boolean }) {
    const def = this.findItemDef(input.item);
    if (!def?.story) throw new GameError(`No story item called "${input.item}". Story items: ${Object.values(this.s.items).map((d) => d.name).join(', ') || 'none yet'}.`);
    const name = (input.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (name && name !== def.name) {
      const clash = this.findItemDef(name);
      if (clash && clash !== def) throw new GameError(`Another item is already called "${name}"`);
      def.name = name;
    }
    const description = (input.description ?? '').trim().slice(0, 400);
    if (description) def.description = description;
    if (typeof input.quest === 'boolean') def.story.quest = input.quest;
    this.addItemNote(def, input.note);
    return { item: def.name, item_id: def.id, quest_item: def.story.quest, notes: def.story.notes.length };
  }

  /**
   * Take an item away because the story used it up, or the party sold, gave or lost it.
   * Quest items are only released when the DM says so explicitly.
   */
  takeItem(input: { characterId?: string; item: string; quantity?: number; allowQuest?: boolean }) {
    const def = this.findItemDef(input.item);
    if (!def) throw new GameError(this.t`Unknown item "${input.item}"`);
    const owners = input.characterId ? [this.char(input.characterId)] : this.party();
    let found: { c: Character; item: ItemInstance; loc: InvLoc } | null = null;
    for (const c of owners) {
      const hit = this.carried(c).find((x) => x.item.defId === def.id);
      if (hit) { found = { c, ...hit }; break; }
    }
    if (!found) throw new GameError(`${input.characterId ? this.char(input.characterId).name : 'Nobody in the party'} has no ${def.name}`);
    if (def.story?.quest && !input.allowQuest) {
      throw new GameError(`${def.name} is a quest item, so it stays with the party. If the story really uses it up or the party knowingly parts with it, call again with allow_quest_item set to true.`);
    }
    const qty = Math.max(1, Math.min(found.item.qty, Math.round(input.quantity ?? 1) || 1));
    found.item.qty -= qty;
    if (found.item.qty <= 0) this.setLoc(found.c, found.loc, null);
    found.c.ac = this.computeAc(found.c);
    this.log('system', this.t`${found.c.name} no longer has ${`${qty > 1 ? `${qty}× ` : ''}${this.n(def.name)}`}.`);
    return { character: found.c.name, item: def.name, removed: qty, left: Math.max(0, found.item.qty) };
  }

  // -------------------------------------------- reputation, rumours, trophies

  /** The Dungeon Master moves the party's standing with a faction. */
  adjustStanding(input: { faction: string; change: number; reason: string }) { return changeStanding(this, input); }

  /** The Dungeon Master lets a rumour loose where the party stands. */
  startRumour(text: string, aboutParty: boolean, heard: boolean) {
    this.needExplore();
    const r = addRumour(this, { text, aboutParty });
    if (heard && r.heard === null) { r.heard = this.day(); this.s.stats.heard++; }
    return { id: r.id, text: r.text, note: 'People here already repeat it. It reaches other places over the following days.' };
  }

  /** The Dungeon Master has the party hear a rumour that is going round here. */
  hearRumour(ref: string) { return hearRumour(this, ref); }

  /** A player took back a line of the story before it was answered. */
  retract(logId: number) {
    const at = this.s.log.findIndex((l) => l.id === logId && l.kind === 'chat');
    if (at < 0) return;
    this.s.log.splice(at, 1);
    this.s.stats.undos++;
  }

  /** Award the trophies whose goals are reached. Called whenever state is sent out. */
  checkTrophies() { return checkTrophies(this); }

  /** Forget pending beats of a kind the DM is already narrating itself. */
  dropBeats(kind: Beat['kind']) { this.beats = this.beats.filter((b) => b.kind !== kind); }

  takeBeats(): Beat[] {
    const b = this.beats;
    this.beats = [];
    for (const beat of b) {
      if (beat.kind === 'combat_end') { this.s.stats.fights++; if (beat.boss) this.s.stats.bosses++; }
      else if (beat.kind === 'rescued') this.s.stats.rescued++;
    }
    return b;
  }
  takeMoves() { const m = this.moves; this.moves = []; return m; }

  // ------------------------------------------------------------ public view

  // ------------------------------------------------------------ test mode
  // Moves only the host's test toolbox uses (see playtest.ts). They set the state directly and
  // skip the rules that stop the Dungeon Master from doing the same, such as the XP clamp.

  /** Raise a hero by whole levels, with everything a normal level-up brings. */
  testLevel(characterId: string, levels = 1) {
    const c = this.char(characterId);
    if (c.dead) throw new GameError(this.t`${c.name} is dead`);
    const from = c.level;
    for (let i = 0; i < Math.max(1, Math.min(MAX_LEVEL, Math.round(levels) || 1)) && c.level < MAX_LEVEL; i++) {
      c.xp = Math.max(c.xp, XP_THRESHOLDS[c.level]);
      this.levelUp(c);
    }
    if (c.level === from) throw new GameError(this.t`${c.name} is already at the highest level`);
    this.beats.push({ kind: 'level_up', heroes: [c.name] });
    return c;
  }

  /** Set a hero's hit points. Zero knocks the hero out like a blow would. */
  testHp(characterId: string, hp: number) {
    const c = this.char(characterId);
    if (c.dead) throw new GameError(this.t`${c.name} is dead`);
    const target = Math.max(0, Math.min(c.maxHp, Math.round(hp)));
    if (target <= 0) this.damageChar(c, c.hp);
    else if (target < c.hp) c.hp = target;
    else if (target > c.hp) { c.effects = (c.effects ?? []).filter((e) => !e.noHealing); this.healChar(c, target - c.hp); }
    return c;
  }

  testRevive(characterId: string) {
    const c = this.char(characterId);
    c.dead = false;
    c.hp = Math.max(1, c.maxHp);
    c.conditions = c.conditions.filter((x) => x !== 'unconscious' && x !== 'stable' && x !== 'dead');
    c.deathSaves = { successes: 0, failures: 0 };
    this.log('system', this.t`${c.name} is back on their feet.`);
    return c;
  }

  /** Put a condition on a hero, or lift it. Only the conditions the engine knows how to play. */
  testCondition(characterId: string, condition: string, on: boolean) {
    const c = this.char(characterId);
    if (!(HERO_CONDITIONS as readonly string[]).includes(condition)) throw new GameError(`Unknown condition "${condition}"`);
    if (on) {
      if (!(c.effects ?? []).some((e) => e.condition === condition)) (c.effects ??= []).push({ condition, ends: 'none' });
      this.syncConditions(c);
    } else this.endEffects(c, (e) => e.condition === condition || e.also === condition, true);
    return c;
  }

  /** Mana, class resources and abilities back to full; hit points stay. */
  testRestore(characterId?: string) {
    const heroes = characterId ? [this.char(characterId)] : this.s.characters.filter((c) => !c.dead);
    for (const c of heroes) {
      c.mana = c.maxMana;
      c.hitDice = c.level;
      c.spent = [];
      c.uses = {};
      c.inspired = undefined;
      for (const it of [...c.bag, ...Object.values(c.equipment)]) if (it?.used) it.used = 0;
    }
    this.log('system', this.t`Mana and class resources are restored.`);
  }

  testGold(amount: number) {
    const delta = Math.max(-1e6, Math.min(1e6, Math.round(amount) || 0));
    this.s.gold = Math.max(0, this.s.gold + delta);
    if (delta) this.log('system', (delta > 0 ? this.t`The party gains ${delta} gp` : this.t`The party pays ${-delta} gp`) + '.');
  }

  /** Walk the party into a known place at once, and to a spot on its zone map. */
  testJump(locationId: string, spot = '') {
    this.needExplore();
    const loc = this.location(locationId);
    if (!loc) throw new GameError(this.t`You do not know that place`);
    const w = this.world;
    loc.discovered = true;
    w.party = { q: loc.q, r: loc.r };
    const i = loc.r * w.width + loc.q;
    if (i >= 0 && i < w.explored.length) w.explored = w.explored.slice(0, i) + '1' + w.explored.slice(i + 1);
    this.log('system', this.t`The party heads to ${loc.name}.`);
    this.arriveAt(loc);
    if (spot.trim()) enterSpot(this, spot.trim());
    return loc;
  }

  /** Put every place of the region on the map. */
  testReveal() {
    const w = this.world;
    for (const l of w.locations) l.discovered = true;
    w.explored = '1'.repeat(w.width * w.height);
    this.log('system', this.t`Every place of the region is now on the map.`);
  }

  /** What a test fight needs to catch the enemies unawares: a Stealth success from just now. */
  testSneak(heroId: string) {
    const c = this.char(heroId);
    (this.s.sneaks ??= {})[c.id] = { total: 30, at: this.world.minutes };
  }

  /** A hero as players see them: with the painted battle figure, when there is one. */
  private withFigure(c: Character): Character {
    const subject = heroFigureSubject(c);
    const id = subject ? this.pictures?.figure?.(subject) ?? null : null;
    return id ? { ...c, figureId: id } : c;
  }

  /** The person the party met who this monster is, by name, when they have a painted portrait. */
  npcOfMonster(m: Pick<Monster, 'name'>): NpcState | null {
    const name = m.name.toLocaleLowerCase();
    return this.s.memory.npcs.find((n) => n.portraitId && n.name.toLocaleLowerCase() === name) ?? null;
  }

  /** A monster's look as players see it: with the painted figure of its kind, when there is one. */
  private figureLook(m: Monster): MonsterLook {
    const look = m.look ?? MONSTERS[m.defId].look;
    const own = this.npcOfMonster(m);
    const npcSubject = own ? npcFigureSubject(own, look) : null;
    // A named person with a portrait fights as themselves; until their figure is painted the kind's own one stands in.
    const id = (npcSubject && this.pictures?.figure?.(npcSubject)) || this.pictures?.figure?.(monsterFigureSubject(m.defId, look)) || null;
    return id ? { ...look, imageId: id } : look;
  }


  // ----------------------------------------------------------------- odds before committing

  /** The dice a hero's blessings add to an attack roll, as die sizes (Bless: 4). */
  private blessSides(c: Character): number[] {
    return this.buffsOf(c).flatMap((b) => { const m = b.roll ? /^1d(\d+)$/.exec(b.roll) : null; return m ? [Number(m[1])] : []; });
  }

  /** What a hit does once the monster's resistances have had their say. */
  private oddsDamage(m: Monster, dice: string, type: string, reasons: Odds['reasons']): DamageSpread {
    const def = MONSTERS[m.defId];
    let scale = 1;
    if (def.immune?.includes(type)) { scale = 0; reasons.push({ code: 'immune' }); }
    else if (def.vulnerable?.includes(type)) { scale = 2; reasons.push({ code: 'vulnerable' }); }
    else if (def.resist?.includes(type)) { scale = 0.5; reasons.push({ code: 'resists' }); }
    return damageSpread(dice, type, scale);
  }

  /**
   * The hero's weapon attack against a monster, as the attack itself would roll it right now:
   * the same bonus, advantage, cover and armour class, without rolling or using anything up.
   */
  attackOdds(c: Character, m: Monster): Odds {
    const reasons: Odds['reasons'] = [];
    const formAtk = c.form ? weaponAttack(c, null) : null;
    const w = c.form ? null : this.weaponOf(c);
    const wp = w?.weapon;
    const ranged = wp?.ranged;
    const dist = this.mdist(m, c) * 5;
    const lend = !ranged && !c.form && this.buffOn(c, 'shillelagh');
    const atk = formAtk ?? weaponAttack({ ...c, form: null, abilities: lend ? { ...c.abilities, str: Math.max(c.abilities.str, c.abilities[castingAbility(c)]) } : c.abilities }, w);
    const magicWeapon = c.form ? 0 : Math.max(0, ...(c.buffs ?? []).map((b) => SPELL_BUFFS[b.id]?.weapon?.[b.level] ?? 0));
    const usesStr = !c.form && !ranged && atk.mod === this.mod(c, 'str');
    const reckless = c.conditions.includes('reckless') && usesStr;
    const bonus = atk.bonus + (c.conditions.includes('sacred weapon') && !c.form ? Math.max(1, this.mod(c, 'cha')) : 0) + magicWeapon;
    const bless = this.blessSides(c);
    if (bless.length) reasons.push({ code: 'bless' });
    const marked = c.mark?.monsterId === m.id ? c.mark.spell : null;
    const seesIt = this.heroSees(c, m), seesMe = this.monsterSees(m, c);
    const prone = this.mHas(m, 'prone');
    const adv: Odds['reasons'] = [];
    if (m.conditions.includes('guided')) adv.push({ code: 'guided' });
    if (!seesMe) adv.push({ code: 'unseen' });
    if (m.studiedBy?.includes(c.id)) adv.push({ code: 'studied' });
    if (this.primed(`${c.id}:aim`) || this.primed(`${c.id}:unseen`)) adv.push({ code: 'aimed' });
    if (reckless) adv.push({ code: 'reckless' });
    if (this.mExposed(m)) adv.push({ code: 'exposed' });
    if (this.buffOn(c, 'attackAdv')) adv.push({ code: 'buff_adv' });
    if (prone && dist <= 5) adv.push({ code: 'prone_near' });
    if (c.conditions.includes('invisible')) adv.push({ code: 'invisible' });
    if (marked === 'hunters_mark' && this.feat(c, 'precise_hunter')) adv.push({ code: 'hunted' });
    const dis: Odds['reasons'] = [];
    if (!seesIt) dis.push({ code: 'cant_see' });
    if (this.hampered(c)) dis.push({ code: 'hampered' });
    if (prone && dist > 5) dis.push({ code: 'prone_far' });
    if (ranged && dist > ranged.normal) dis.push({ code: 'long_range' });
    if (ranged && this.hostileAdjacentToChar(c)) dis.push({ code: 'foe_adjacent' });
    const mode = rollMode(adv.length > 0, dis.length > 0);
    reasons.push(...adv, ...dis);
    const cover = ranged ? this.coverBonus(c, this.mpoint(m, c)) : 0;
    if (cover) reasons.push({ code: 'cover', n: cover });
    const slowed = this.mHas(m, 'slowed');
    if (slowed) reasons.push({ code: 'slowed', n: 2 });
    const ac = this.mAc(m) + cover;
    const critAt = critFrom(c);
    if (critAt < 20) reasons.push({ code: 'crit_range', n: critAt });
    // Damage: the weapon's dice and modifier, a magic weapon, rage, Sneak Attack when it would apply, a mark.
    const type = formAtk ? formAtk.type : wp?.damageType ?? 'bludgeoning';
    let flat = magicWeapon + (c.conditions.includes('raging') && usesStr ? rageDamage(c) : 0);
    if (!c.form && this.offWeaponOf(c) && atk.flat) flat -= atk.flat;
    let dice = addFlat(atk.damage, flat);
    const flanked = this.s.characters.some((a) => a.id !== c.id && this.conscious(a) && this.mdist(m, a) <= 1);
    if (this.feat(c, 'sneak_attack') && wp && (wp.finesse || ranged) && (flanked || mode === 'advantage') && !this.s.combat?.once?.includes(`${c.id}:sneak`)) {
      dice = `${dice}+${sneakDice(c)}d6`;
      reasons.push({ code: 'sneak' });
    }
    if (marked === 'hunters_mark') { dice = `${dice}+${this.feat(c, 'foe_slayer') ? '1d10' : '1d6'}`; reasons.push({ code: 'mark' }); }
    if (marked === 'hex') { dice = `${dice}+1d6`; reasons.push({ code: 'mark' }); }
    const reach = ranged ? ranged.long : 5;
    const blocked = dist > Math.max(5, reach) ? 'range' as const : !this.los(c, this.mpoint(m, c)) ? 'sight' as const : undefined;
    return {
      kind: 'attack', chance: percent(hitChance(bonus, ac, mode, { critAt, lucky: c.speciesId === 'halfling', dice: bless })), mode, bonus, ac,
      damage: atk.dice || formAtk ? this.oddsDamage(m, dice, type, reasons) : damageSpread(String(Math.max(1, 1 + this.mod(c, 'str'))), type),
      reasons, ...(blocked ? { blocked } : {}),
    };
  }

  /** A spell or feature aimed at an enemy: its attack roll or the save it forces, at its lowest level. */
  abilityOdds(c: Character, ab: AbilityDef, m: Monster): Odds | null {
    if (ab.target !== 'enemy' || !['attack', 'save', 'weapon'].includes(ab.kind)) return null;
    if (ab.kind === 'weapon') return this.attackOdds(c, m);
    const isSpell = ab.spellLevel !== undefined;
    const lvl = ab.spellLevel ?? 0;
    const dice = this.spellDice(c, ab, lvl);
    const type = this.typeFor(ab, m);
    const reasons: Odds['reasons'] = [];
    const dist = this.mdist(m, c) * 5;
    const blocked = dist > Math.max(5, ab.range) ? 'range' as const : !this.los(c, this.mpoint(m, c)) ? 'sight' as const : undefined;
    const flat = isSpell ? (this.feat(c, 'empowered_evocation') ? Math.max(0, this.mod(c, 'int')) : 0)
      + (ab.spellLevel === 0 && this.opted(c, 'fury_spellcasting') && this.feat(c, 'elemental_fury') ? Math.max(0, this.mod(c, 'wis')) : 0)
      + (ab.damageType && this.opted(c, `aff_${ab.damageType}`) ? Math.max(0, this.mod(c, 'cha')) : 0)
      + (ab.id === 'eldritch_blast' && this.opted(c, 'inv_agonizing') ? Math.max(0, this.mod(c, 'cha')) : 0) : 0;
    const damage = dice ? this.oddsDamage(m, addFlat(dice, flat), type, reasons) : undefined;
    if (ab.kind === 'attack') {
      const sorcery = isSpell && c.conditions.includes('innate sorcery');
      const seesIt = this.heroSees(c, m), seesMe = this.monsterSees(m, c);
      const adv: Odds['reasons'] = [];
      if (m.conditions.includes('guided')) adv.push({ code: 'guided' });
      if (!seesMe) adv.push({ code: 'unseen' });
      if (sorcery || this.buffOn(c, 'attackAdv')) adv.push({ code: 'buff_adv' });
      if (this.mExposed(m)) adv.push({ code: 'exposed' });
      if (c.conditions.includes('invisible')) adv.push({ code: 'invisible' });
      const dis: Odds['reasons'] = [];
      if (!seesIt) dis.push({ code: 'cant_see' });
      if (this.hampered(c)) dis.push({ code: 'hampered' });
      if (ab.range > 5 && this.hostileAdjacentToChar(c)) dis.push({ code: 'foe_adjacent' });
      const mode = rollMode(adv.length > 0, dis.length > 0);
      const cover = this.coverBonus(c, this.mpoint(m, c));
      if (cover) reasons.unshift({ code: 'cover', n: cover });
      if (this.mHas(m, 'slowed')) reasons.unshift({ code: 'slowed', n: 2 });
      const bless = this.blessSides(c);
      if (bless.length) reasons.unshift({ code: 'bless' });
      reasons.unshift(...adv, ...dis);
      const bonus = this.castingMod(c) + c.profBonus;
      const ac = this.mAc(m) + cover;
      return { kind: 'attack', chance: percent(hitChance(bonus, ac, mode, { lucky: c.speciesId === 'halfling', dice: bless })), mode, bonus, ac, damage, reasons, ...(blocked ? { blocked } : {}) };
    }
    // A save: words of power ask none.
    if (!ab.saveAbility) return { kind: 'save', chance: 100, mode: 'normal', damage, reasons, ...(blocked ? { blocked } : {}) };
    const mdef = MONSTERS[m.defId];
    const own = 8 + c.profBonus + (ab.dcAbility ? abilityMod(c.abilities[ab.dcAbility]) : this.castingMod(c)) + (isSpell && c.conditions.includes('innate sorcery') ? 1 : 0);
    const saveMod = mdef.saves[ab.saveAbility] ?? 0;
    const resists = !!mdef.flags?.magicResistance && isSpell;
    const heightened = isSpell && this.primed(`${c.id}:heightened`);
    if (resists) reasons.unshift({ code: 'magic_resistance' });
    if (heightened) reasons.unshift({ code: 'heightened' });
    const baned = this.mHas(m, 'baned');
    if (baned) reasons.unshift({ code: 'bane' });
    const helpless = (ab.saveAbility === 'str' || ab.saveAbility === 'dex') && (this.mHas(m, 'stunned') || this.mHas(m, 'paralyzed'));
    if (helpless) reasons.unshift({ code: 'helpless' });
    const mode = rollMode(resists, heightened);
    const chance = helpless ? 100 : percent(failChance(saveMod, own, mode, baned ? [-4] : []));
    return { kind: 'save', chance, mode, save: ab.saveAbility, dc: own, saveMod, half: !!ab.half, damage, reasons, ...(blocked ? { blocked } : {}) };
  }

  /** The odds for whoever may act now, if a hero: their weapon and each spell they can aim at an enemy. */
  combatOdds(): CombatOdds | null {
    const cur = this.current();
    if (this.s.phase !== 'combat' || !cur || cur.kind !== 'pc') return null;
    const c = this.s.characters.find((x) => x.id === cur.id);
    if (!c || !this.conscious(c)) return null;
    const foes = this.s.monsters.filter((m) => m.alive && !this.mHas(m, 'banished'));
    const attack: Record<string, Odds> = {};
    const abilities: Record<string, Record<string, Odds>> = {};
    for (const m of foes) attack[m.id] = this.attackOdds(c, m);
    for (const id of c.abilityIds) {
      const ab = ABILITIES[id];
      if (!ab || ab.target !== 'enemy' || !['attack', 'save', 'weapon'].includes(ab.kind)) continue;
      const row: Record<string, Odds> = {};
      for (const m of foes) { const o = this.abilityOdds(c, ab, m); if (o) row[m.id] = o; }
      abilities[id] = row;
    }
    return { heroId: c.id, attack, abilities };
  }

  publicState(dm: { busy: boolean; mode: 'claude' | 'scripted'; model: string | null; gathering?: boolean; unanswered?: { logId: number; playerId: string }[] }): GameState {
    const s = this.s;
    const w = s.world;
    const shops = this.shopsHere();
    return {
      room: s.room,
      phase: s.phase,
      map: { width: this.width, height: this.height, rows: s.rows, biome: s.biome ?? 'dungeon' },
      light: s.phase === 'combat' ? { ambient: s.ambient ?? 'bright', sources: this.lightSources() } : { ambient: 'bright', sources: [] },
      characters: this.pictures?.figure ? s.characters.map((c) => this.withFigure(c)) : s.characters,
      companions: s.companions.map((c) => this.companionView(c)),
      monsters: s.monsters.map((m) => ({
        id: m.id, defId: m.defId, name: m.name, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp,
        ac: MONSTERS[m.defId].ac, alive: m.alive, conditions: m.conditions,
        effects: (m.effects ?? []).map(({ condition, turns, save, untilHero, onHurt, by, spell }) => ({ condition, turns, save, untilHero, onHurt, by, spell })),
        sprite: MONSTERS[m.defId].sprite,
        tiles: this.tilesOf(m), look: this.figureLook(m), restyled: !!m.look && lookKey(m.look) !== lookKey(MONSTERS[m.defId].look),
        kind: MONSTERS[m.defId].type, description: m.description ?? this.n(MONSTERS[m.defId].description),
        senses: this.monsterSenses(m), light: m.light ?? null, reach: this.monsterReach(m),
        cr: MONSTERS[m.defId].cr, abilities: this.notable(MONSTERS[m.defId]),
        ...(MONSTERS[m.defId].legendary ? { legendary: { left: m.legLeft ?? MONSTERS[m.defId].legendary!.uses, uses: MONSTERS[m.defId].legendary!.uses } } : {}),
      })),
      combat: s.combat,
      bossFight: s.phase === 'combat' && !!s.encounter?.boss,
      gold: s.gold,
      items: s.items,
      shops: shops.map((sh) => this.shopView(sh)),
      tradeOffer: s.tradeOffer && shops.some((sh) => sh.id === s.tradeOffer!.shopId) ? s.tradeOffer : null,
      shortRestsLeft: s.shortRestsLeft,
      log: s.log.slice(-150),
      players: s.players,
      language: this.lang,
      hostId: s.hostId,
      table: s.table,
      ready: s.ready,
      gathering: !!dm.gathering,
      rolled: s.rolled,
      factions: factionViews(this),
      rumours: rumourViews(this),
      trophies: trophyViews(this),
      unanswered: dm.unanswered ?? [],
      lastFight: s.lastFight ?? null,
      odds: this.combatOdds(),
      check: this.pendingCheck,
      testMode: s.testMode ? { since: s.testMode.since } : null,
      world: w && {
        name: s.setting?.name ?? this.n('the Emberfall Vale'),
        width: w.width,
        height: w.height,
        terrain: maskedTerrain(w),
        party: w.party,
        minutes: w.minutes,
        locations: (currentZone(this), w.locations).filter((l) => l.discovered).map((l): Location => ({
          id: l.id, name: l.name, kind: l.kind, q: l.q, r: l.r, parentId: l.parentId, description: l.description, visited: l.visited, origin: l.origin, visual: l.visual, zone: !l.parentId ? l.zone ?? null : null,
          ...(l.stages ? { dungeon: { total: l.stages.length, cleared: l.cleared ?? 0, next: l.stages[l.cleared ?? 0]?.name ?? null } } : {}),
        })),
        placeId: w.placeId,
        safe: this.isSafe(),
      },
      memory: {
        npcs: s.memory.npcs.filter((n) => n.met).map(({ met: _met, ...n }) => n),
        quests: s.memory.quests.map(({ rewardXp: _x, rewardGold: _g, ...q }) => q),
        deeds: s.memory.deeds,
        mysteries: s.memory.mysteries,
      },
      scene: w && s.phase !== 'lobby' ? this.sceneView() : null,
      travelling: !!s.travel,
      trip: this.tripView(),
      dmBusy: dm.busy,
      dmMode: dm.mode,
      dmModel: dm.model,
    };
  }
}

export type { MonsterDef };

/**
 * Whom a monster goes for when the Dungeon Master names nobody. `list` is every hero it could
 * attack, nearest first, with the movement (in squares) it takes to get next to them.
 * Low challenge spreads the blows over the healthiest heroes, high challenge piles onto the most
 * wounded, and the middle simply takes the nearest.
 */
export function pickByHabit<T extends { hp: number; maxHp: number; ac?: number }>(habit: TargetHabit, list: { t: T; d: number }[], speed: number): T {
  const near = list.filter((x) => x.d <= speed);
  const pool = near.length ? near : list.slice(0, 1);
  if (habit === 'sensible' || pool.length === 1) return pool[0].t;
  const share = (c: T) => c.hp / Math.max(1, c.maxHp);
  const sorted = [...pool].sort((a, b) => habit === 'focus'
    ? a.t.hp - b.t.hp || (a.t.ac ?? 0) - (b.t.ac ?? 0) || a.d - b.d
    : share(b.t) - share(a.t) || a.d - b.d);
  return sorted[0].t;
}
