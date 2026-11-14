// Authoritative game engine. All rules, dice and state changes live here.
// The engine is synchronous and deterministic for a given RNG; the AI Dungeon
// Master only chooses monster intents and narrates what the engine resolved.

import { ABILITIES, ABILITY_NAMES, ITEMS } from '../../../shared/content';
import {
  COMPASS, HEX_MILES, TERRAIN, direction, encounterChance, findRoute, formatHours, formatTime, hexDistance, hoursFor, sameHex,
  type Compass, type Hex,
} from '../../../shared/hex';
import {
  BAG_SIZE,
  MAX_LEVEL,
  SLOT_IDS,
  XP_THRESHOLDS,
  abilityMod,
  type AbilityKey,
  type Character,
  type ClassId,
  type CombatState,
  type Disposition,
  type GameState,
  type InvLoc,
  type ItemDef,
  type ItemInstance,
  type LevelUpInfo,
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
  type SlotId,
} from '../../../shared/types';
import { CLASSES, MANA_BY_LEVEL, profBonusFor } from '../data/classes';
import { MONSTERS, type MonsterAttack, type MonsterDef } from '../data/monsters';
import { ENCOUNTERS, MAJOR_KINDS, SAFE_KINDS, type GroupSpec } from '../data/world';
import { isLang, tagged, tr, type Lang } from '../../../shared/i18n';
import { d20, roll, rollMode, signed, type Rng, type RollMode } from './dice';
import { buildArena, generateWorld, isExplored, knownTerrain, maskedTerrain, reveal, trueTerrain, type LocationState, type MemoryState, type NpcState, type WorldState } from './world';

export class GameError extends Error {}

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
}

/** The fight in progress: where it came from and what winning it is worth. */
export interface EncounterState {
  source: 'wild' | 'dungeon' | 'story';
  locationId: string | null;
  boss: boolean;
}

export interface InternalState {
  room: string;
  phase: Phase;
  /** Battle map rows; empty outside combat. */
  rows: string[];
  characters: Character[];
  monsters: Monster[];
  combat: CombatState | null;
  encounter: EncounterState | null;
  gold: number;
  shortRestsLeft: number;
  log: LogEntry[];
  logSeq: number;
  uidSeq: number;
  players: PlayerInfo[];
  world: WorldState | null;
  memory: MemoryState;
  /** Destination of a journey in progress. */
  travel: { to: Hex; hexes: number; minutes: number; terrain: string[] } | null;
  /** The DM flagged the last scene as a turning point, so the next reply gets the strongest model. */
  escalate: boolean;
  /** World clock (minutes) when the party last finished a long rest. */
  lastLongRest: number;
  /** Language of the game log, world text and narration. The host picks it. */
  language: Lang;
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
  | { kind: 'defeat' };

export interface MonsterIntent {
  targetId?: string;
  attack?: string;
  tactic?: 'engage' | 'hold_position' | 'retreat';
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
  };
  note?: string;
}

type Pt = { x: number; y: number };
const key = (x: number, y: number) => `${x},${y}`;
const cheb = (a: Pt, b: Pt) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const DIRS: Pt[] = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];
const MAX_LOG = 400;
const emptyMemory = (): MemoryState => ({ npcs: [], quests: [], deeds: [], journal: [], chronicle: '' });
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32);

export class Game {
  s: InternalState;
  rng: Rng;
  beats: Beat[] = [];
  moves: { id: string; path: Pt[] }[] = [];

  constructor(room: string, rng: Rng = Math.random, saved?: InternalState) {
    this.rng = rng;
    // Saves from before the open world have no map or memory; those tables start over.
    const usable = saved && saved.memory && typeof saved.lastLongRest === 'number' && (saved.phase === 'lobby' || saved.world);
    this.s = usable ? saved : Game.freshState(room, saved?.players ?? [], isLang(saved?.language) ? saved.language : 'en');
  }

  static freshState(room: string, players: PlayerInfo[] = [], language: Lang = 'en'): InternalState {
    return {
      room,
      phase: 'lobby',
      rows: [],
      characters: [],
      monsters: [],
      combat: null,
      encounter: null,
      gold: 0,
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
    };
  }

  // ---------------------------------------------------------------- language

  get lang(): Lang { return isLang(this.s.language) ? this.s.language : 'en'; }
  /** Translate a whole sentence into the session language: this.t`${who} rests.` */
  private get t() { return tagged(this.lang); }
  /** Translate a game term such as an item, spell, monster or skill name. */
  n = (term: string) => tr(this.lang, term);

  /** The host (whoever opened the table) picks the language everyone's story is told in. */
  setLanguage(playerId: string, lang: unknown) {
    if (!isLang(lang)) throw new GameError(this.t`Unknown language`);
    if (this.s.players[0]?.id !== playerId) throw new GameError(this.t`Only the host can change the language`);
    this.s.language = lang;
  }

  private d20Text(r: { value: number; rolls: number[] }, mode: RollMode) {
    return mode === 'normal' ? `${r.value}` : `${r.value} (${this.n(mode)}: ${r.rolls.join(', ')})`;
  }

  // ---------------------------------------------------------------- helpers

  get width() { return this.s.rows[0]?.length ?? 0; }
  get height() { return this.s.rows.length; }

  log(kind: LogKind, text: string, extra: Partial<Pick<LogEntry, 'speaker' | 'scene' | 'roll' | 'levelUp'>> = {}) {
    this.s.log.push({ id: ++this.s.logSeq, kind, text, ...extra });
    if (this.s.log.length > MAX_LOG) this.s.log.splice(0, this.s.log.length - MAX_LOG);
  }

  private uid(prefix: string) { return `${prefix}${++this.s.uidSeq}`; }

  tile(x: number, y: number): string {
    if (y < 0 || y >= this.height || x < 0 || x >= this.width) return '#';
    return this.s.rows[y][x];
  }

  private blocksSight(x: number, y: number) { return this.tile(x, y) === '#'; }

  /** Can anything ever stand here? */
  private walkable(x: number, y: number) { return this.tile(x, y) === '.'; }

  char(id: string): Character {
    const c = this.s.characters.find((c) => c.id === id);
    if (!c) throw new GameError(this.t`Unknown character`);
    return c;
  }

  monster(id: string): Monster {
    const m = this.s.monsters.find((m) => m.id === id);
    if (!m) throw new GameError(this.t`Unknown monster`);
    return m;
  }

  private monsterAt(x: number, y: number) {
    return this.s.monsters.find((m) => m.alive && m.x === x && m.y === y);
  }

  /** A conscious hero standing here. The fallen do not block movement. */
  private charAt(x: number, y: number, except?: string) {
    return this.s.characters.find((c) => !c.dead && c.hp > 0 && c.x === x && c.y === y && c.id !== except);
  }

  conscious(c: Character) { return !c.dead && c.hp > 0; }
  consciousChars() { return this.s.characters.filter((c) => this.conscious(c)); }

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
   * Breadth-first path. `canEnter` decides which tiles may be walked through;
   * `isGoal` decides where to stop. Returns the path excluding the start tile.
   */
  private bfs(start: Pt, isGoal: (p: Pt) => boolean, canEnter: (p: Pt) => boolean, maxNodes = 4000): Pt[] | null {
    if (isGoal(start)) return [];
    const prev = new Map<string, string | null>([[key(start.x, start.y), null]]);
    const queue: Pt[] = [start];
    let found: Pt | null = null;
    while (queue.length && prev.size < maxNodes) {
      const cur = queue.shift()!;
      for (const d of DIRS) {
        const n = { x: cur.x + d.x, y: cur.y + d.y };
        const k = key(n.x, n.y);
        if (prev.has(k) || !this.walkable(n.x, n.y) || !canEnter(n)) continue;
        // No cutting corners around obstacles.
        if (d.x !== 0 && d.y !== 0 && (!this.walkable(cur.x + d.x, cur.y) || !this.walkable(cur.x, cur.y + d.y))) continue;
        prev.set(k, key(cur.x, cur.y));
        if (isGoal(n)) { found = n; break; }
        queue.push(n);
      }
      if (found) break;
    }
    if (!found) return null;
    const path: Pt[] = [];
    let k: string | null = key(found.x, found.y);
    while (k && k !== key(start.x, start.y)) {
      const [x, y] = k.split(',').map(Number);
      path.unshift({ x, y });
      k = prev.get(k) ?? null;
    }
    return path;
  }

  // ------------------------------------------------------------ lobby/setup

  upsertPlayer(id: string, name: string, connected: boolean) {
    const p = this.s.players.find((p) => p.id === id);
    if (p) { p.name = name || p.name; p.connected = connected; }
    else this.s.players.push({ id, name: name || 'Adventurer', connected });
  }

  setConnected(id: string, connected: boolean) {
    const p = this.s.players.find((p) => p.id === id);
    if (p) p.connected = connected;
  }

  private newItem(defId: string, qty = 1): ItemInstance {
    if (!ITEMS[defId]) throw new Error(`Unknown item ${defId}`);
    return { uid: this.uid('i'), defId, qty };
  }

  addCharacter(playerId: string, classId: ClassId, name: string): Character {
    if (this.s.phase !== 'lobby') throw new GameError(this.t`The adventure has already begun`);
    const cls = CLASSES[classId];
    if (!cls) throw new GameError(this.t`Unknown class`);
    if (this.s.characters.length >= 4) throw new GameError(this.t`The party is full (4 heroes)`);
    const taken = new Set(this.s.characters.map((c) => c.name));
    const clean = name.trim().slice(0, 20) || cls.defaultNames.find((n) => !taken.has(n)) || cls.name;
    const maxHp = cls.hitDie + abilityMod(cls.abilities.con);
    const equipment = Object.fromEntries(SLOT_IDS.map((s) => [s, null])) as Record<SlotId, ItemInstance | null>;
    for (const [slot, id] of Object.entries(cls.equipment)) equipment[slot as SlotId] = this.newItem(id);
    const bag: (ItemInstance | null)[] = Array(BAG_SIZE).fill(null);
    cls.bag.forEach((b, i) => { bag[i] = this.newItem(b.id, b.qty ?? 1); });
    const c: Character = {
      id: this.uid('pc'),
      ownerId: playerId,
      name: clean,
      classId,
      className: cls.name,
      level: 1,
      abilities: { ...cls.abilities },
      profBonus: 2,
      maxHp,
      hp: maxHp,
      maxMana: cls.maxMana,
      mana: cls.maxMana,
      ac: 10,
      speed: 30,
      conditions: [],
      equipment,
      bag,
      x: 0,
      y: 0,
      deathSaves: { successes: 0, failures: 0 },
      dead: false,
      hitDice: 1,
      abilityIds: [...cls.abilityIds],
      spent: [],
      skills: [...cls.skills],
      xp: 0,
      features: classId === 'rogue' ? ['Sneak Attack: 1d6'] : [],
    };
    c.ac = this.computeAc(c);
    this.s.characters.push(c);
    return c;
  }

  removeCharacter(playerId: string, characterId: string) {
    if (this.s.phase !== 'lobby') throw new GameError(this.t`The adventure has already begun`);
    const c = this.char(characterId);
    if (c.ownerId !== playerId) throw new GameError(this.t`That hero belongs to another player`);
    this.s.characters = this.s.characters.filter((x) => x.id !== characterId);
  }

  start() {
    if (this.s.phase !== 'lobby') throw new GameError(this.t`The adventure has already begun`);
    if (!this.s.characters.length) throw new GameError(this.t`Add at least one hero first`);
    const s = this.s;
    const { world, memory } = generateWorld(Math.floor(this.rng() * 2 ** 31), this.rng, this.lang);
    s.world = world;
    s.memory = memory;
    s.gold = 15 * s.characters.length;
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
    const here = this.place();
    if (here) this.settleIn(here);
    this.beats.push({ kind: 'start' });
  }

  reset() {
    const players = this.s.players;
    this.s = Game.freshState(this.s.room, players, this.lang);
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
    if (!this.consciousChars().length) throw new GameError(this.t`Nobody in the party can act`);
  }

  advanceTime(minutes: number) { this.world.minutes += Math.max(0, Math.round(minutes)); }

  /** Mark a place as visited and its people as met. */
  private settleIn(loc: LocationState): boolean {
    const first = !loc.visited;
    this.world.placeId = loc.id;
    loc.visited = true;
    loc.discovered = true;
    for (const n of this.s.memory.npcs) if (n.locationId === loc.id) n.met = true;
    return first;
  }

  private arriveAt(loc: LocationState, journey?: string) {
    const firstVisit = this.settleIn(loc);
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
    w.minutes += minutes;
    t.hexes++;
    t.minutes += minutes;
    if (!t.terrain.includes(TERRAIN[code].name)) t.terrain.push(TERRAIN[code].name);
    const found = reveal(w, next, code === 'h' || code === 'm' ? 2 : 1).filter((l) => !l.parentId);
    const here = w.locations.find((l) => !l.parentId && sameHex(l, next));
    if (sameHex(next, t.to) || (here && found.includes(here))) return this.endTravel('arrived');
    if (!here && this.rng() < encounterChance(code, w.minutes)) {
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
  startEncounter(groups: GroupSpec[], opts: { source: EncounterState['source']; locationId?: string; context: string }) {
    const s = this.s;
    if (s.phase !== 'explore') throw new GameError(s.phase === 'combat' ? 'A fight is already under way' : 'The adventure is not under way');
    const heroes = s.characters.filter((c) => !c.dead);
    if (!this.consciousChars().length) throw new GameError(this.t`Nobody in the party can fight`);
    const scale = Math.min(1, heroes.length / 4);
    const chosen: MonsterDef[] = [];
    for (const g of groups) {
      const def = MONSTERS[g.defId];
      if (!def) throw new GameError(this.t`Unknown monster type "${g.defId}". Known types: ${Object.keys(MONSTERS).join(', ')}.`);
      const wanted = Math.max(1, Math.min(8, Math.round(Number(g.count) || 1)));
      const count = def.boss ? wanted : Math.max(1, Math.ceil(wanted * scale));
      for (let i = 0; i < count && chosen.length < 8; i++) chosen.push(def);
    }
    if (!chosen.length) throw new GameError(this.t`An encounter needs at least one monster`);
    s.travel = null;
    const place = this.place();
    const indoors = opts.source === 'dungeon' || (!!place && ['dungeon', 'cave', 'tavern', 'shop', 'temple'].includes(place.kind));
    s.rows = buildArena(trueTerrain(this.world, this.world.party), indoors, this.rng);
    const midY = Math.floor(this.height / 2);
    const column = (xs: number[]) => {
      const out: Pt[] = [];
      for (const x of xs) for (const dy of [0, -1, 1, -2, 2, -3, 3, -4, 4]) out.push({ x, y: midY + dy });
      return out;
    };
    const heroSpots = column([3, 2]);
    heroes.forEach((c, i) => { c.x = heroSpots[i].x; c.y = heroSpots[i].y; });
    const foeSpots = column([this.width - 4, this.width - 3]);
    const boss = chosen.some((d) => d.boss);
    s.monsters = chosen.map((def, i) => {
      const total = chosen.filter((d) => d.id === def.id).length;
      const n = chosen.slice(0, i + 1).filter((d) => d.id === def.id).length;
      const hp = def.boss ? Math.max(Math.ceil(def.hp * 0.5), Math.round(def.hp * Math.max(scale, 0.5))) : def.hp;
      return { id: this.uid('m'), defId: def.id, name: total > 1 ? `${this.n(def.name)} ${n}` : this.n(def.name), x: foeSpots[i].x, y: foeSpots[i].y, hp, maxHp: hp, alive: true, conditions: [] };
    });
    s.encounter = { source: opts.source, locationId: opts.locationId ?? null, boss };
    const order = [
      ...heroes.map((c) => ({ id: c.id, kind: 'pc' as const, initiative: this.initiativeFor(abilityMod(c.abilities.dex)) })),
      ...s.monsters.map((m) => ({ id: m.id, kind: 'monster' as const, initiative: this.initiativeFor(MONSTERS[m.defId].dexMod) })),
    ].sort((a, b) => b.initiative - a.initiative || (a.kind === 'pc' ? -1 : 1));
    s.combat = { round: 1, order, turnIndex: -1, movementLeft: 0, actionUsed: false, bonusUsed: false, attacksLeft: 0 };
    s.phase = 'combat';
    this.log('system', this.t`Combat! Initiative: ${order.map((o) => `${this.nameOf(o.id)} ${o.initiative}`).join(', ')}.`);
    this.beats.push({ kind: 'combat_start', monsters: s.monsters.map((m) => m.name), boss, context: opts.context });
    this.nextTurn();
  }

  private initiativeFor(dexMod: number) { return d20(this.rng).value + dexMod; }

  nameOf(id: string): string {
    return this.s.characters.find((c) => c.id === id)?.name ?? this.s.monsters.find((m) => m.id === id)?.name ?? id;
  }

  current() {
    const c = this.s.combat;
    return c ? c.order[c.turnIndex] : undefined;
  }

  isMonsterTurn() { return this.s.phase === 'combat' && this.current()?.kind === 'monster'; }

  /** Advance to the next combatant able to act, resolving death saves on the way. */
  nextTurn() {
    const s = this.s;
    for (let guard = 0; guard < 200; guard++) {
      const combat = s.combat;
      if (!combat || s.phase !== 'combat') return;
      if (this.checkCombatOver()) return;
      combat.turnIndex++;
      if (combat.turnIndex >= combat.order.length) { combat.turnIndex = 0; combat.round++; }
      const cur = combat.order[combat.turnIndex];
      combat.actionUsed = false;
      combat.bonusUsed = false;
      combat.attacksLeft = 0;
      if (cur.kind === 'pc') {
        const c = this.char(cur.id);
        if (c.dead) continue;
        if (c.hp <= 0) { this.deathSave(c); continue; }
        c.conditions = c.conditions.filter((x) => x !== 'dodging');
        combat.movementLeft = Math.floor(c.speed / 5);
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
    const r = d20(this.rng).value;
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
    if (!this.consciousChars().length) {
      s.combat = null;
      s.encounter = null;
      s.monsters = [];
      s.rows = [];
      const survivors = s.characters.filter((c) => !c.dead);
      if (!survivors.length) {
        s.phase = 'defeat';
        this.log('system', this.t`The party has fallen.`);
        this.beats.push({ kind: 'defeat' });
        return true;
      }
      // Left for dead, the survivors are carried back to the nearest safe place.
      for (const c of survivors) { c.hp = 1; c.conditions = []; c.deathSaves = { successes: 0, failures: 0 }; }
      const w = this.world;
      const haven = w.locations.filter((l) => !l.parentId && l.visited && SAFE_KINDS.includes(l.kind)).sort((a, b) => hexDistance(a, w.party) - hexDistance(b, w.party))[0];
      const lost = Math.floor(s.gold / 2);
      s.gold -= lost;
      w.minutes = (Math.floor(w.minutes / 1440) + 1) * 1440 + 8 * 60;
      if (haven) { w.party = { q: haven.q, r: haven.r }; this.settleIn(haven); reveal(w, w.party, 1); }
      s.phase = 'explore';
      this.log('system', (haven ? this.t`The party is overwhelmed. The survivors wake in ${haven.name} the next morning with 1 HP.` : this.t`The party is overwhelmed. The survivors wake where they fell the next morning with 1 HP.`) + (lost ? ` ${this.t`They are ${lost} gp lighter.`}` : ''));
      this.beats.push({ kind: 'rescued' });
      return true;
    }
    if (s.monsters.some((m) => m.alive)) return false;
    const enc = s.encounter;
    s.combat = null;
    s.encounter = null;
    s.phase = 'explore';
    for (const c of s.characters) {
      c.conditions = c.conditions.filter((x) => x !== 'dodging');
      if (!c.dead && c.hp <= 0) {
        this.healChar(c, 1);
        this.log('system', this.t`${c.name} is tended to and comes around with 1 HP.`);
      }
    }
    const rewards: string[] = [];
    let gold = 0;
    for (const m of s.monsters) { const g = MONSTERS[m.defId].gold; if (g) gold += roll(g, this.rng).total; }
    const xp = s.monsters.reduce((n, m) => n + MONSTERS[m.defId].xp, 0);
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
    if (gold) { s.gold += gold; rewards.unshift(this.t`${gold} gp`); }
    this.log('system', [
      stage ? this.t`Victory in ${stage.name}.` : this.t`Victory.`,
      rewards.length ? this.t`The party finds ${rewards.join(', ')}.` : '',
      loc && stage && loc.cleared! >= loc.stages!.length ? this.t`${loc.name} is cleared.` : '',
    ].filter(Boolean).join(' '));
    s.monsters = [];
    s.rows = [];
    this.grantXp(xp, this.t`defeating ${slain}`);
    if (questDone) this.setQuest({ id: questDone, status: 'completed' });
    this.beats.push({ kind: 'combat_end', boss: !!enc?.boss, rewards: [this.t`${xp} XP`, ...rewards].join(', ') });
    return true;
  }

  /** Hand items to whoever has room. Returns readable names of what was taken. */
  private giveLoot(items: { id: string; qty?: number }[]): string[] {
    const got: string[] = [];
    for (const it of items) {
      const qty = it.qty ?? 1;
      const taker = this.s.characters.find((c) => !c.dead && this.addToBag(c, it.id, qty));
      got.push(`${qty > 1 ? `${qty}× ` : ''}${this.n(ITEMS[it.id].name)} ${taker ? `(${taker.name})` : this.t`(left behind, bags are full)`}`);
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
    const hp = Math.max(1, cls.hitDie / 2 + 1 + abilityMod(c.abilities.con));
    c.maxHp += hp;
    if (!c.dead && c.hp > 0) c.hp += hp;
    c.hitDice++;
    gains.push(this.t`+${hp} maximum HP (now ${c.maxHp})`);
    const pb = profBonusFor(c.level);
    if (pb !== c.profBonus) { c.profBonus = pb; gains.push(this.t`Proficiency bonus rises to +${pb}`); }
    if (cls.maxMana) {
      const max = MANA_BY_LEVEL[c.level - 1] ?? c.maxMana;
      const diff = max - MANA_BY_LEVEL[c.level - 2];
      if (diff > 0) { c.maxMana += diff; c.mana += diff; gains.push(this.t`+${diff} maximum mana (now ${c.maxMana})`); }
    }
    const gain = cls.levels[c.level];
    if (gain?.asi) {
      c.abilities[gain.asi] += 2;
      gains.push(this.t`${this.n(ABILITY_NAMES[gain.asi])} +2 (now ${c.abilities[gain.asi]})`);
      if (gain.asi === 'con') { c.maxHp += c.level; c.hp += c.level; }
    }
    for (const id of gain?.abilities ?? []) {
      if (!c.abilityIds.includes(id)) c.abilityIds.unshift(id);
      gains.push(this.t`New ability: ${this.n(ABILITIES[id].name)}. ${this.n(ABILITIES[id].description)}`);
    }
    for (const f of gain?.features ?? []) {
      const prefix = f.split(':')[0];
      c.features = [...c.features.filter((x) => x.split(':')[0] !== prefix), f];
      gains.push(this.n(f));
    }
    c.ac = this.computeAc(c);
    const info: LevelUpInfo = { characterId: c.id, name: c.name, className: c.className, level: c.level, gains };
    this.log('levelup', this.t`${c.name} reaches level ${c.level}!`, { levelUp: info });
  }

  /** Validates that this player may act with this character right now. */
  private actor(playerId: string, characterId: string, needsTurn = true): Character {
    const c = this.char(characterId);
    if (c.ownerId !== playerId) throw new GameError(this.t`That hero belongs to another player`);
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
    if (!combat.actionUsed) {
      combat.actionUsed = true;
      combat.attacksLeft = c.classId === 'fighter' && c.level >= 5 ? 1 : 0;
    } else combat.attacksLeft--;
  }

  private canAct(bonus = false) {
    const combat = this.s.combat;
    if (!combat || this.s.phase !== 'combat') return;
    if (bonus ? combat.bonusUsed : combat.actionUsed) throw new GameError(bonus ? this.t`Bonus action already used this turn` : this.t`Action already used this turn`);
  }

  // --------------------------------------------------------------- movement

  move(playerId: string, characterId: string, tx: number, ty: number) {
    const c = this.actor(playerId, characterId);
    const s = this.s;
    if (s.phase !== 'combat' || !s.combat) throw new GameError(this.t`There is no battle to move in right now`);
    if (!this.walkable(tx, ty)) throw new GameError(this.t`You can't go there`);
    if (c.x === tx && c.y === ty) return;
    const canEnter = (p: Pt) => !this.monsterAt(p.x, p.y) && !this.charAt(p.x, p.y, c.id);
    const path = this.bfs(c, (p) => p.x === tx && p.y === ty, canEnter);
    if (!path) throw new GameError(this.t`No path there`);
    if (s.combat.movementLeft <= 0) throw new GameError(this.t`No movement left this turn`);
    const walked = path.slice(0, s.combat.movementLeft);
    const end = walked[walked.length - 1];
    c.x = end.x;
    c.y = end.y;
    s.combat.movementLeft -= walked.length;
    this.moves.push({ id: c.id, path: walked });
  }

  // ---------------------------------------------------------------- attacks

  private hostileAdjacentToChar(c: Character) {
    return this.s.monsters.some((m) => m.alive && cheb(m, c) <= 1);
  }

  private damageMonster(m: Monster, amount: number, type: string): { dealt: number; note: string } {
    const def = MONSTERS[m.defId];
    let dealt = amount;
    let note = '';
    if (def.immune?.includes(type)) { dealt = 0; note = ` ${this.t`(immune)`}`; }
    else if (def.vulnerable?.includes(type)) { dealt = amount * 2; note = ` ${this.t`(vulnerable, doubled)`}`; }
    m.hp = Math.max(0, m.hp - dealt);
    if (m.hp === 0) { m.alive = false; m.conditions = []; note += ` ${this.t`${m.name} is slain!`}`; }
    return { dealt, note };
  }

  private damageChar(c: Character, amount: number): boolean {
    c.hp = Math.max(0, c.hp - amount);
    if (c.hp === 0 && !c.conditions.includes('unconscious')) {
      c.conditions = c.conditions.filter((x) => x !== 'dodging');
      c.conditions.push('unconscious');
      c.deathSaves = { successes: 0, failures: 0 };
      return true;
    }
    return false;
  }

  private healChar(c: Character, amount: number): number {
    if (c.dead) return 0;
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
    const def = it ? ITEMS[it.defId] : null;
    return def?.weapon ? def : null;
  }

  private targetMonster(c: Character, targetId: string, rangeFeet: number): Monster {
    const m = this.monster(targetId);
    if (!m.alive) throw new GameError(this.t`No such target`);
    if (cheb(c, m) * 5 > Math.max(5, rangeFeet)) throw new GameError(this.t`${m.name} is out of range`);
    if (!this.los(c, m)) throw new GameError(this.t`${c.name} cannot see ${m.name}`);
    return m;
  }

  attack(playerId: string, characterId: string, targetId: string) {
    const c = this.actor(playerId, characterId);
    if (this.s.phase !== 'combat') throw new GameError(this.t`There is nothing to fight right now`);
    this.canAttack();
    const w = this.weaponOf(c);
    const wp = w?.weapon;
    const ranged = wp?.ranged;
    const m = this.targetMonster(c, targetId, ranged ? ranged.long : 5);
    const dist = cheb(c, m) * 5;
    const strMod = abilityMod(c.abilities.str), dexMod = abilityMod(c.abilities.dex);
    const mod = ranged ? dexMod : wp?.finesse ? Math.max(strMod, dexMod) : strMod;
    const proficient = !w || this.proficient(c, w);
    const bonus = mod + (proficient ? c.profBonus : 0) + (wp?.bonus ?? 0);
    const guided = m.conditions.includes('guided');
    const mode = rollMode(guided, !!ranged && (dist > ranged.normal || this.hostileAdjacentToChar(c)));
    if (guided) m.conditions = m.conditions.filter((x) => x !== 'guided');
    this.spendAttack(c);
    const r = d20(this.rng, mode);
    const total = r.value + bonus;
    const crit = r.value >= (c.classId === 'fighter' && c.level >= 3 ? 19 : 20);
    const ac = MONSTERS[m.defId].ac;
    const label = w ? this.n(w.name) : this.t`an unarmed strike`;
    const head = this.t`${c.name} attacks ${m.name} with ${label}: ${this.d20Text(r, mode)}${signed(bonus)} = ${total} vs AC ${ac}.`;
    const info = (outcome: RollInfo['outcome'], damage?: RollInfo['damage']): RollInfo =>
      ({ actor: c.name, label: w ? this.n(w.name) : this.t`Unarmed strike`, die: r.value, rolls: r.rolls, mode, modifier: bonus, total, target: { kind: 'AC', value: ac, name: m.name }, outcome, damage });
    if (r.value === 1 || (!crit && total < ac)) {
      this.log('roll', this.t`${head} Miss.`, { roll: info('miss') });
    } else {
      let dmg = wp ? roll(wp.damage, this.rng, crit).total + mod + (wp.bonus ?? 0) : 1 + strMod;
      let extra = '';
      const flanked = this.s.characters.some((a) => a.id !== c.id && this.conscious(a) && cheb(a, m) <= 1);
      if (c.classId === 'rogue' && wp && (wp.finesse || ranged) && (flanked || mode === 'advantage')) {
        dmg += roll(`${Math.ceil(c.level / 2)}d6`, this.rng, crit).total;
        extra = ` ${this.t`(with Sneak Attack)`}`;
      }
      dmg = Math.max(1, dmg);
      const res = this.damageMonster(m, dmg, wp?.damageType ?? 'bludgeoning');
      this.log('roll', this.t`${head} ${crit ? this.t`Critical hit` : this.t`Hit`} for ${res.dealt} ${this.n(`${wp?.damageType ?? 'bludgeoning'} damage`)}${extra}.${res.note}`, { roll: info(crit ? 'crit' : 'hit', { amount: res.dealt, type: wp?.damageType ?? 'bludgeoning' }) });
    }
    this.checkCombatOver();
  }

  private castingMod(c: Character) {
    const a = CLASSES[c.classId].castingAbility;
    return a ? abilityMod(c.abilities[a]) : 0;
  }

  useAbility(playerId: string, characterId: string, abilityId: string, targetId?: string) {
    const c = this.actor(playerId, characterId);
    const ab = ABILITIES[abilityId];
    if (!ab || !c.abilityIds.includes(abilityId)) throw new GameError(this.t`${c.name} doesn't know that`);
    const inCombat = this.s.phase === 'combat';
    if (ab.target === 'enemy' && !inCombat) throw new GameError(this.t`There is nothing to fight right now`);
    if (['dodge', 'surge', 'dash'].includes(ab.kind) && !inCombat) throw new GameError(this.t`${this.n(ab.name)} is only useful in combat`);
    if (ab.kind !== 'surge') this.canAct(ab.bonusAction);
    if (ab.oncePerRest && c.spent.includes(ab.id)) throw new GameError(this.t`${this.n(ab.name)} is spent until you rest`);
    if (c.mana < ab.cost) throw new GameError(this.t`Not enough mana`);
    const cmod = this.castingMod(c);
    // Cantrips grow with the caster; healing magic is stronger in a practised cleric's hands.
    const potent = ab.cost === 0 && c.level >= 5 && (ab.kind === 'attack' || ab.kind === 'save');
    const dice = ab.dice && potent ? ab.dice.replace(/^(\d+)/, (n) => String(Number(n) * 2)) : ab.dice;
    const healBonus = c.classId === 'cleric' && c.level >= 3 ? 3 : 0;
    const spend = () => {
      this.spendAction(ab.bonusAction);
      c.mana -= ab.cost;
      if (ab.oncePerRest) c.spent.push(ab.id);
    };

    switch (ab.kind) {
      case 'surge': {
        const combat = this.s.combat!;
        if (!combat.actionUsed) throw new GameError(this.t`${c.name} still has an action this turn`);
        c.spent.push(ab.id);
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
        break;
      }
      case 'heal': {
        const t = this.char(targetId ?? c.id);
        if (t.dead) throw new GameError(this.t`${t.name} is beyond healing`);
        if (cheb(c, t) * 5 > Math.max(5, ab.range)) throw new GameError(this.t`${t.name} is too far away`);
        if (t.hp >= t.maxHp) throw new GameError(this.t`${t.name} is already at full health`);
        spend();
        const healed = this.healChar(t, roll(dice!, this.rng).total + cmod + healBonus);
        this.log('roll', (t.id === c.id ? this.t`${c.name} casts ${this.n(ab.name)} on themself, restoring ${healed} HP.` : this.t`${c.name} casts ${this.n(ab.name)} on ${t.name}, restoring ${healed} HP.`));
        break;
      }
      case 'attack': {
        const m = this.targetMonster(c, targetId ?? '', ab.range);
        const bonus = cmod + c.profBonus;
        const guided = m.conditions.includes('guided');
        const mode = rollMode(guided, this.hostileAdjacentToChar(c));
        if (guided) m.conditions = m.conditions.filter((x) => x !== 'guided');
        spend();
        const r = d20(this.rng, mode);
        const total = r.value + bonus;
        const crit = r.value === 20;
        const ac = MONSTERS[m.defId].ac;
        const head = this.t`${c.name} casts ${this.n(ab.name)} at ${m.name}: ${this.d20Text(r, mode)}${signed(bonus)} = ${total} vs AC ${ac}.`;
        const info = (outcome: RollInfo['outcome'], damage?: RollInfo['damage']): RollInfo =>
          ({ actor: c.name, label: this.n(ab.name), die: r.value, rolls: r.rolls, mode, modifier: bonus, total, target: { kind: 'AC', value: ac, name: m.name }, outcome, damage });
        if (r.value === 1 || (!crit && total < ac)) this.log('roll', this.t`${head} Miss.`, { roll: info('miss') });
        else {
          const res = this.damageMonster(m, roll(dice!, this.rng, crit).total, ab.damageType!);
          if (ab.id === 'guiding_bolt' && m.alive) m.conditions.push('guided');
          this.log('roll', this.t`${head} ${crit ? this.t`Critical hit` : this.t`Hit`} for ${res.dealt} ${this.n(`${ab.damageType} damage`)}.${res.note}`, { roll: info(crit ? 'crit' : 'hit', { amount: res.dealt, type: ab.damageType! }) });
        }
        break;
      }
      case 'save': {
        const m = this.targetMonster(c, targetId ?? '', ab.range);
        spend();
        const dc = 8 + c.profBonus + cmod;
        const saveMod = MONSTERS[m.defId].saves[ab.saveAbility!] ?? 0;
        const r = d20(this.rng).value;
        const save = this.n(ab.saveAbility!.toUpperCase());
        const head = this.t`${c.name} casts ${this.n(ab.name)} at ${m.name}: ${save} save ${r}${signed(saveMod)} = ${r + saveMod} vs DC ${dc}.`;
        const info = (outcome: RollInfo['outcome'], damage?: RollInfo['damage']): RollInfo =>
          ({ actor: m.name, label: this.t`${save} save against ${this.n(ab.name)}`, die: r, rolls: [r], mode: 'normal', modifier: saveMod, total: r + saveMod, target: { kind: 'DC', value: dc }, outcome, damage });
        if (r + saveMod >= dc) this.log('roll', this.t`${head} ${m.name} avoids it.`, { roll: info('success') });
        else {
          const res = this.damageMonster(m, roll(dice!, this.rng).total, ab.damageType!);
          this.log('roll', this.t`${head} Failed, ${res.dealt} ${this.n(`${ab.damageType} damage`)}.${res.note}`, { roll: info('failure', { amount: res.dealt, type: ab.damageType! }) });
        }
        break;
      }
      case 'auto': {
        const m = this.targetMonster(c, targetId ?? '', ab.range);
        spend();
        const res = this.damageMonster(m, roll(ab.dice!, this.rng).total, ab.damageType!);
        this.log('roll', this.t`${c.name} casts ${this.n(ab.name)} at ${m.name} for ${res.dealt} ${this.n(`${ab.damageType} damage`)}.${res.note}`);
        break;
      }
    }
    if (inCombat) this.checkCombatOver();
  }

  endTurn(playerId: string, characterId: string) {
    this.actor(playerId, characterId);
    if (this.s.phase !== 'combat') throw new GameError(this.t`Not in combat`);
    this.nextTurn();
  }

  // -------------------------------------------------------------- monsters

  /** Consecutive living monsters starting at the current turn. */
  monsterBlock(): Monster[] {
    const combat = this.s.combat;
    if (!combat || !this.isMonsterTurn()) return [];
    const out: Monster[] = [];
    for (let i = combat.turnIndex; i < combat.order.length; i++) {
      const o = combat.order[i];
      if (o.kind === 'pc') {
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

  private monsterBlocked(p: Pt, self: Monster) {
    const m = this.monsterAt(p.x, p.y);
    if (m && m.id !== self.id) return true;
    return !!this.charAt(p.x, p.y);
  }

  monsterAct(monsterId: string, intent: MonsterIntent = {}): MonsterActResult {
    const m = this.monster(monsterId);
    const def = MONSTERS[m.defId];
    if (!m.alive || this.s.phase !== 'combat') return { monster: m.name, moved: 0, note: 'cannot act' };
    const targets = this.consciousChars();
    if (!targets.length) return { monster: m.name, moved: 0, note: 'no targets' };
    const speed = Math.floor(def.speed / 5);
    const canEnter = (p: Pt) => !this.monsterBlocked(p, m);
    const pathToAdjacent = (t: Character) => this.bfs(m, (p) => cheb(p, t) <= 1 && (p.x === m.x && p.y === m.y || !this.monsterBlocked(p, m)), canEnter);

    let target = targets.find((t) => t.id === intent.targetId);
    if (!target) {
      const scored = targets.map((t) => ({ t, d: pathToAdjacent(t)?.length ?? 999 }));
      scored.sort((a, b) => a.d - b.d || cheb(m, a.t) - cheb(m, b.t));
      target = scored[0].t;
    }
    const melee = def.attacks.find((a) => !a.ranged);
    const rangedAtk = def.attacks.find((a) => a.ranged);
    let chosen: MonsterAttack | undefined = def.attacks.find((a) => a.name.toLowerCase() === (intent.attack ?? '').toLowerCase());
    const tactic = intent.tactic ?? 'engage';
    const meleePath = pathToAdjacent(target);
    if (!chosen) {
      const reachable = meleePath !== null && meleePath.length <= speed;
      chosen = melee && (reachable || !rangedAtk) ? melee : rangedAtk ?? melee!;
      if (tactic === 'retreat' && rangedAtk) chosen = rangedAtk;
    }

    // Movement
    const walked: Pt[] = [];
    const stepTo = (p: Pt) => { m.x = p.x; m.y = p.y; walked.push(p); };
    if (tactic === 'engage') {
      if (!chosen.ranged) {
        for (const p of (meleePath ?? []).slice(0, speed)) stepTo(p);
      } else {
        const inRange = () => cheb(m, target!) * 5 <= (chosen!.longRange ?? chosen!.range) && this.los(m, target!);
        const path = meleePath ?? [];
        for (const p of path.slice(0, speed)) { if (inRange()) break; stepTo(p); }
      }
    } else if (tactic === 'retreat') {
      for (let i = 0; i < speed; i++) {
        const score = (p: Pt) => Math.min(...targets.map((t) => cheb(p, t)));
        let best: Pt | null = null;
        for (const d of DIRS) {
          const n = { x: m.x + d.x, y: m.y + d.y };
          if (!this.walkable(n.x, n.y) || this.monsterBlocked(n, m)) continue;
          if (d.x !== 0 && d.y !== 0 && (!this.walkable(m.x + d.x, m.y) || !this.walkable(m.x, m.y + d.y))) continue;
          if (score(n) > score(best ?? m)) best = n;
        }
        if (!best) break;
        stepTo(best);
      }
    }
    if (walked.length) this.moves.push({ id: m.id, path: walked });

    // Attack
    const dist = cheb(m, target) * 5;
    if (!chosen.ranged && dist > chosen.range && rangedAtk && this.los(m, target)) chosen = rangedAtk;
    if (chosen.ranged && dist <= 5 && melee && tactic !== 'retreat') chosen = melee;
    const maxRange = chosen.ranged ? chosen.longRange ?? chosen.range : chosen.range;
    if (dist > maxRange || !this.los(m, target)) {
      this.log('roll', walked.length ? this.t`${m.name} moves but cannot reach ${target.name}.` : this.t`${m.name} cannot reach ${target.name}.`);
      return { monster: m.name, moved: walked.length, note: `could not reach ${target.name}` };
    }
    const adjacentFoe = this.consciousChars().some((c) => cheb(c, m) <= 1);
    const pack = !!def.packTactics && this.s.monsters.some((o) => o.alive && o.id !== m.id && cheb(o, target!) <= 1);
    const dis = target.conditions.includes('dodging') || (!!chosen.ranged && (adjacentFoe || dist > chosen.range));
    const mode = rollMode(pack, dis);
    const r = d20(this.rng, mode);
    const total = r.value + chosen.toHit;
    const crit = r.value === 20;
    const head = this.t`${m.name} attacks ${target.name} with ${this.n(chosen.name)}: ${this.d20Text(r, mode)}${signed(chosen.toHit)} = ${total} vs AC ${target.ac}.`;
    const info = (outcome: RollInfo['outcome'], damage?: RollInfo['damage']): RollInfo =>
      ({ actor: m.name, label: this.n(chosen!.name), die: r.value, rolls: r.rolls, mode, modifier: chosen!.toHit, total, target: { kind: 'AC', value: target!.ac, name: target!.name }, outcome, damage });
    if (r.value === 1 || (!crit && total < target.ac)) {
      this.log('roll', this.t`${head} Miss.`, { roll: info('miss') });
      return { monster: m.name, moved: walked.length, attack: { name: chosen.name, target: target.name, hit: false, crit: false, damage: 0, targetHp: target.hp, targetDown: false } };
    }
    const dmg = Math.max(1, roll(chosen.damage, this.rng, crit).total);
    const down = this.damageChar(target, dmg);
    this.log('roll', this.t`${head} ${crit ? this.t`Critical hit` : this.t`Hit`} for ${dmg} ${this.n(`${chosen.damageType} damage`)}.` + (down ? ` ${this.t`${target.name} falls unconscious!`}` : ''), { roll: info(crit ? 'crit' : 'hit', { amount: dmg, type: chosen.damageType }) });
    return { monster: m.name, moved: walked.length, attack: { name: chosen.name, target: target.name, hit: true, crit, damage: dmg, targetHp: target.hp, targetDown: down } };
  }

  // -------------------------------------------------------------- inventory

  private proficient(c: Character, def: ItemDef): boolean {
    const cls = CLASSES[c.classId];
    if (def.kind === 'weapon') return cls.weaponProf.includes(def.weapon!.category) || !!cls.weaponProfIds?.some((id) => def.id.startsWith(id));
    if (def.kind === 'armor') return cls.armorProf.includes(def.armor!.category);
    if (def.kind === 'shield') return cls.armorProf.includes('shield');
    return true;
  }

  private slotFor(def: ItemDef): SlotId | null {
    if (def.kind === 'weapon') return 'mainHand';
    if (def.kind === 'shield') return 'offHand';
    if (def.kind === 'armor') return 'armor';
    if (def.kind === 'wondrous') return def.slot ?? null;
    return null;
  }

  private canEquip(c: Character, item: ItemInstance, slot: SlotId): string | null {
    const def = ITEMS[item.defId];
    if (this.slotFor(def) !== slot) return `${def.name} doesn't go there`;
    if (!this.proficient(c, def)) return `${c.className}s can't use ${def.name}`;
    return null;
  }

  computeAc(c: Character): number {
    const dex = abilityMod(c.abilities.dex);
    const armor = c.equipment.armor ? ITEMS[c.equipment.armor.defId].armor : undefined;
    let ac = armor ? armor.baseAc + (armor.dexCap === null ? dex : Math.min(dex, armor.dexCap)) : 10 + dex;
    for (const slot of SLOT_IDS) {
      const it = c.equipment[slot];
      if (it) ac += ITEMS[it.defId].acBonus ?? 0;
    }
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
    const def = ITEMS[defId];
    if (def.stackable) {
      const stack = c.bag.find((b) => b?.defId === defId);
      if (stack) { stack.qty += qty; return true; }
    }
    const idx = this.firstFreeBag(c);
    if (idx < 0) return false;
    c.bag[idx] = this.newItem(defId, qty);
    return true;
  }

  invMove(playerId: string, characterId: string, from: InvLoc, to: InvLoc) {
    const c = this.actor(playerId, characterId, false);
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
    // Stack merge inside the bag.
    if (other && to.type === 'bag' && from.type === 'bag' && other.defId === item.defId && ITEMS[item.defId].stackable) {
      other.qty += item.qty;
      this.setLoc(c, from, null);
      return;
    }
    this.setLoc(c, to, item);
    this.setLoc(c, from, other);
    // Two-handed weapons and shields exclude each other.
    const main = c.equipment.mainHand ? ITEMS[c.equipment.mainHand.defId] : null;
    if (main?.weapon?.twoHanded && c.equipment.offHand) {
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
    c.ac = this.computeAc(c);
  }

  give(playerId: string, characterId: string, from: InvLoc, toCharacterId: string) {
    const c = this.actor(playerId, characterId, false);
    const t = this.char(toCharacterId);
    if (t.id === c.id) return;
    if (t.dead) throw new GameError(this.t`${t.name} is dead`);
    if (!this.validLoc(from)) throw new GameError(this.t`Bad inventory slot`);
    const item = this.getLoc(c, from);
    if (!item) throw new GameError(this.t`Nothing there`);
    if (this.s.phase === 'combat' && cheb(c, t) > 1) throw new GameError(this.t`${t.name} is too far away to hand that over mid-fight`);
    if (!this.addToBag(t, item.defId, item.qty)) throw new GameError(this.t`${t.name}'s bag is full`);
    this.setLoc(c, from, null);
    c.ac = this.computeAc(c);
    this.log('system', this.t`${c.name} hands ${this.n(ITEMS[item.defId].name)} to ${t.name}.`);
  }

  useItem(playerId: string, characterId: string, uid: string, targetId?: string) {
    const c = this.actor(playerId, characterId);
    const idx = c.bag.findIndex((b) => b?.uid === uid);
    if (idx < 0) throw new GameError(this.t`That item is not in the bag`);
    const item = c.bag[idx]!;
    const def = ITEMS[item.defId];
    if (!def.consumable) {
      const slot = this.slotFor(def);
      if (!slot) throw new GameError(this.t`${this.n(def.name)} can't be used`);
      this.invMove(playerId, characterId, { type: 'bag', index: idx }, { type: 'slot', slot });
      return;
    }
    const t = this.char(targetId ?? c.id);
    if (t.dead) throw new GameError(this.t`${t.name} is beyond healing`);
    if (cheb(c, t) > 1) throw new GameError(this.t`${t.name} is too far away`);
    if (t.hp >= t.maxHp) throw new GameError(this.t`${t.name} is already at full health`);
    this.canAct();
    this.spendAction();
    const healed = this.healChar(t, roll(def.consumable.heal, this.rng).total);
    item.qty--;
    if (item.qty <= 0) c.bag[idx] = null;
    this.log('roll', (t.id === c.id ? this.t`${c.name} drinks a ${this.n(def.name)}, restoring ${healed} HP.` : this.t`${c.name} feeds ${t.name} a ${this.n(def.name)}, restoring ${healed} HP.`));
  }

  shortRest() {
    this.needExplore();
    if (this.s.shortRestsLeft <= 0) throw new GameError(this.t`The party needs a long rest before another short one helps`);
    this.s.shortRestsLeft--;
    this.advanceTime(60);
    const parts: string[] = [];
    for (const c of this.s.characters) {
      if (c.dead) continue;
      let healed = 0;
      if (c.hitDice > 0 && c.hp < c.maxHp) {
        c.hitDice--;
        healed = this.healChar(c, Math.max(1, roll(`1d${CLASSES[c.classId].hitDie}`, this.rng).total + abilityMod(c.abilities.con)));
      }
      c.spent = [];
      const mana = c.maxMana ? Math.min(c.maxMana - c.mana, c.classId === 'wizard' && c.level >= 2 ? 3 : 2) : 0;
      c.mana += mana;
      parts.push(this.t`${c.name} +${healed} HP` + (mana ? this.t`, +${mana} mana` : ''));
    }
    this.log('system', this.t`The party rests for an hour. ${parts.join('; ')}.`);
  }

  /** Eight hours of sleep. Outside a safe place the camp may be attacked instead. */
  longRest() {
    this.needExplore();
    const w = this.world;
    if (w.minutes - this.s.lastLongRest < 16 * 60) throw new GameError(this.t`The party is not tired enough for another long rest yet`);
    if (!this.isSafe() && this.rng() < 0.3) {
      this.advanceTime(4 * 60);
      this.log('system', this.t`The camp is attacked in the night!`);
      const code = trueTerrain(w, w.party);
      const table = ENCOUNTERS[code] ?? ENCOUNTERS.p;
      this.startEncounter(table[Math.floor(this.rng() * table.length)], { source: 'wild', context: 'The party made camp in the wild and is attacked in the middle of the night.' });
      return;
    }
    this.advanceTime(8 * 60);
    this.s.lastLongRest = w.minutes;
    this.s.shortRestsLeft = 2;
    for (const c of this.s.characters) {
      if (c.dead) continue;
      this.healChar(c, c.maxHp);
      c.mana = c.maxMana;
      c.hitDice = c.level;
      c.spent = [];
    }
    this.log('system', this.t`The party sleeps for eight hours and wakes restored. ${formatTime(w.minutes, this.lang)}.`);
    this.beats.push({ kind: 'rest', long: true });
  }

  // ------------------------------------------------ Dungeon Master's tools
  // Everything below is called by the DM. The DM proposes; these methods
  // validate, clamp and apply, so the server stays the owner of the state.

  /** Ability check requested by the Dungeon Master. */
  skillCheck(characterId: string, ability: AbilityKey, skill: string, dc: number) {
    const c = this.char(characterId);
    if (!this.conscious(c)) throw new GameError(this.t`${c.name} is in no state to try that`);
    const name = skill.trim().toLowerCase();
    const prof = c.skills.includes(name) ? c.profBonus : 0;
    const mod = abilityMod(c.abilities[ability]) + prof;
    const r = d20(this.rng).value;
    const total = r + mod;
    const success = total >= dc;
    const skillName = name ? this.n(name) : '';
    const label = name ? this.t`${skillName[0].toUpperCase() + skillName.slice(1)} check` : this.t`${this.n(ABILITY_NAMES[ability])} check`;
    const info: RollInfo = { actor: c.name, label, die: r, rolls: [r], mode: 'normal', modifier: mod, total, target: { kind: 'DC', value: dc }, outcome: success ? 'success' : 'failure' };
    this.log('roll', this.t`${c.name}: ${label}, ${r}${signed(mod)} = ${total} vs DC ${dc}. ${success ? this.t`Success.` : this.t`Failure.`}`, { roll: info });
    return { character: c.name, roll: r, modifier: mod, total, dc, success };
  }

  /** Narration shown to the players as a scene card. */
  addScene(scene: { title: string; mood: Mood; text: string; actions: string[] }) {
    const meta: SceneMeta = { title: scene.title.trim().slice(0, 80), mood: scene.mood, actions: scene.actions.map((a) => a.trim().slice(0, 80)).filter(Boolean).slice(0, 5), imageId: null };
    this.log('dm', scene.text.trim(), { scene: meta });
  }

  addJournal(text: string) {
    const clean = text.trim().slice(0, 300);
    if (!clean) return;
    const j = this.s.memory.journal;
    j.push({ day: this.day(), text: clean });
    if (j.length > 120) j.splice(0, j.length - 120);
  }

  private uniqueId(prefix: string, name: string, taken: (id: string) => boolean) {
    const base = `${prefix}_${slug(name) || 'x'}`;
    let id = base;
    for (let n = 2; taken(id); n++) id = `${base}_${n}`;
    return id;
  }

  /** Create or update someone the party has met. */
  rememberNpc(input: { name: string; role?: string; description?: string; appearance?: string; disposition?: Disposition; locationId?: string; note?: string }) {
    const name = input.name.trim().slice(0, 60);
    if (!name) throw new GameError(this.t`An NPC needs a name`);
    const mem = this.s.memory;
    let npc = mem.npcs.find((n) => n.name.toLowerCase() === name.toLowerCase() || n.id === name);
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
    return { id: npc.id, name: npc.name, created, location_id: npc.locationId };
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
    }
    if (input.summary?.trim()) q.summary = input.summary.trim().slice(0, 400);
    if (input.note?.trim()) { q.notes.push(input.note.trim().slice(0, 200)); if (q.notes.length > 12) q.notes.shift(); }
    if (input.status && input.status !== q.status) {
      const was = q.status;
      q.status = input.status;
      this.log('system', this.t`Quest ${this.n(q.status)}: ${q.title}.`);
      if (was === 'active' && q.status === 'completed') {
        if (q.rewardGold) { this.s.gold += q.rewardGold; this.log('system', this.t`Reward: ${q.rewardGold} gp.`); }
        if (q.rewardXp) this.grantXp(q.rewardXp, this.t`completing "${q.title}"`);
        q.rewardGold = 0;
        q.rewardXp = 0;
      }
    }
    return { id: q.id, title: q.title, status: q.status };
  }

  recordDeed(text: string) {
    const clean = text.trim().slice(0, 240);
    if (!clean) throw new GameError(this.t`Describe the deed`);
    const deeds = this.s.memory.deeds;
    deeds.push({ id: this.uid('deed'), day: this.day(), text: clean });
    if (deeds.length > 60) deeds.shift();
    return { recorded: clean };
  }

  /** Story experience for things other than winning fights. Clamped so the DM cannot skip levels. */
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
    if (delta) this.log('system', (delta > 0 ? this.t`The party gains ${delta} gp` : this.t`The party pays ${-delta} gp`) + (reason.trim() ? ` (${reason.trim().slice(0, 100)})` : '') + '.');
    return { gold: this.s.gold };
  }

  grantItem(characterId: string, itemId: string, qty: number) {
    const c = this.char(characterId);
    const def = ITEMS[itemId];
    if (!def) throw new GameError(this.t`Unknown item "${itemId}"`);
    if (c.dead) throw new GameError(this.t`${c.name} is dead`);
    const n = Math.max(1, Math.min(def.stackable ? 10 : 1, Math.round(qty) || 1));
    if (!this.addToBag(c, itemId, n)) throw new GameError(this.t`${c.name}'s bag is full`);
    this.log('system', this.t`${c.name} receives ${`${n > 1 ? `${n}× ` : ''}${this.n(def.name)}`}.`);
    return { character: c.name, item: def.name, quantity: n };
  }

  /** Forget pending beats of a kind the DM is already narrating itself. */
  dropBeats(kind: Beat['kind']) { this.beats = this.beats.filter((b) => b.kind !== kind); }

  takeBeats(): Beat[] { const b = this.beats; this.beats = []; return b; }
  takeMoves() { const m = this.moves; this.moves = []; return m; }

  // ------------------------------------------------------------ public view

  publicState(dm: { busy: boolean; mode: 'claude' | 'scripted'; model: string | null }): GameState {
    const s = this.s;
    const w = s.world;
    return {
      room: s.room,
      phase: s.phase,
      map: { width: this.width, height: this.height, rows: s.rows },
      characters: s.characters,
      monsters: s.monsters.map((m) => ({
        id: m.id, defId: m.defId, name: m.name, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp,
        ac: MONSTERS[m.defId].ac, alive: m.alive, conditions: m.conditions, sprite: MONSTERS[m.defId].sprite,
      })),
      combat: s.combat,
      gold: s.gold,
      shortRestsLeft: s.shortRestsLeft,
      log: s.log.slice(-150),
      players: s.players,
      language: this.lang,
      hostId: s.players[0]?.id ?? null,
      world: w && {
        width: w.width,
        height: w.height,
        terrain: maskedTerrain(w),
        party: w.party,
        minutes: w.minutes,
        locations: w.locations.filter((l) => l.discovered).map((l): Location => ({
          id: l.id, name: l.name, kind: l.kind, q: l.q, r: l.r, parentId: l.parentId, description: l.description, visited: l.visited, origin: l.origin, visual: l.visual, zone: null,
          ...(l.stages ? { dungeon: { total: l.stages.length, cleared: l.cleared ?? 0, next: l.stages[l.cleared ?? 0]?.name ?? null } } : {}),
        })),
        placeId: w.placeId,
        safe: this.isSafe(),
      },
      memory: {
        npcs: s.memory.npcs.filter((n) => n.met).map(({ met: _met, ...n }) => n),
        quests: s.memory.quests.map(({ rewardXp: _x, rewardGold: _g, ...q }) => q),
        deeds: s.memory.deeds,
      },
      travelling: !!s.travel,
      dmBusy: dm.busy,
      dmMode: dm.mode,
      dmModel: dm.model,
    };
  }
}

export type { MonsterDef };
