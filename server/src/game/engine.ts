// Authoritative game engine. All rules, dice and state changes live here.
// The engine is synchronous and deterministic for a given RNG; the AI Dungeon
// Master only chooses monster intents and narrates what the engine resolved.

import { ABILITIES, ITEMS } from '../../../shared/content';
import {
  BAG_SIZE,
  SLOT_IDS,
  abilityMod,
  type AbilityKey,
  type Character,
  type Chest,
  type ClassId,
  type CombatState,
  type GameState,
  type InvLoc,
  type ItemDef,
  type ItemInstance,
  type LogEntry,
  type LogKind,
  type Phase,
  type PlayerInfo,
  type SlotId,
} from '../../../shared/types';
import { CLASSES } from '../data/classes';
import { AREAS, CHEST_LOOT, DUNGEON_ROWS, MONSTER_SYMBOLS, type Area } from '../data/dungeon';
import { MONSTERS, type MonsterAttack, type MonsterDef } from '../data/monsters';
import { d20, fmtD20, roll, rollMode, signed, type Rng } from './dice';

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
  revealed: boolean;
  encounterId: number;
  conditions: string[];
}

interface ChestFull extends Chest {
  gold: number;
  items: { id: string; qty: number }[];
}

export interface InternalState {
  room: string;
  phase: Phase;
  rows: string[];
  /** 0 unseen, 1 seen before, 2 visible now. Row-major. */
  fog: number[];
  openDoors: string[];
  chests: ChestFull[];
  characters: Character[];
  monsters: Monster[];
  combat: CombatState | null;
  gold: number;
  shortRestsLeft: number;
  log: LogEntry[];
  logSeq: number;
  uidSeq: number;
  players: PlayerInfo[];
  engaged: number[];
  visitedAreas: string[];
}

export type Beat =
  | { kind: 'start' }
  | { kind: 'area'; area: Area }
  | { kind: 'combat_start'; monsters: string[] }
  | { kind: 'combat_end' }
  | { kind: 'victory' }
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
const SIGHT_RADIUS = 9;
const MAX_LOG = 150;

export class Game {
  s: InternalState;
  rng: Rng;
  beats: Beat[] = [];
  moves: { id: string; path: Pt[] }[] = [];

  constructor(room: string, rng: Rng = Math.random, saved?: InternalState) {
    this.rng = rng;
    this.s = saved ?? Game.freshState(room);
  }

  static freshState(room: string, players: PlayerInfo[] = []): InternalState {
    return {
      room,
      phase: 'lobby',
      rows: [],
      fog: [],
      openDoors: [],
      chests: [],
      characters: [],
      monsters: [],
      combat: null,
      gold: 0,
      shortRestsLeft: 2,
      log: [],
      logSeq: 0,
      uidSeq: 0,
      players,
      engaged: [],
      visitedAreas: [],
    };
  }

  // ---------------------------------------------------------------- helpers

  get width() { return this.s.rows[0]?.length ?? 0; }
  get height() { return this.s.rows.length; }

  log(kind: LogKind, text: string, speaker?: string) {
    this.s.log.push({ id: ++this.s.logSeq, kind, text, speaker });
    if (this.s.log.length > MAX_LOG) this.s.log.splice(0, this.s.log.length - MAX_LOG);
  }

  private uid(prefix: string) { return `${prefix}${++this.s.uidSeq}`; }

  tile(x: number, y: number): string {
    if (y < 0 || y >= this.height || x < 0 || x >= this.width) return '#';
    return this.s.rows[y][x];
  }

  private doorOpen(x: number, y: number) { return this.s.openDoors.includes(key(x, y)); }

  private blocksSight(x: number, y: number) {
    const t = this.tile(x, y);
    return t === '#' || (t === '+' && !this.doorOpen(x, y));
  }

  /** Can anything ever stand here? */
  private walkable(x: number, y: number) {
    const t = this.tile(x, y);
    return t === '.' || t === '+';
  }

  char(id: string): Character {
    const c = this.s.characters.find((c) => c.id === id);
    if (!c) throw new GameError('Unknown character');
    return c;
  }

  monster(id: string): Monster {
    const m = this.s.monsters.find((m) => m.id === id);
    if (!m) throw new GameError('Unknown monster');
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
        // No cutting corners around walls or squeezing diagonally through doorways.
        if (d.x !== 0 && d.y !== 0) {
          if (!this.walkable(cur.x + d.x, cur.y) || !this.walkable(cur.x, cur.y + d.y)) continue;
          if (this.tile(n.x, n.y) === '+' || this.tile(cur.x, cur.y) === '+') continue;
        }
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

  private areaAt(x: number, y: number): Area | undefined {
    return AREAS.find((a) => x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1);
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
    if (this.s.phase !== 'lobby') throw new GameError('The adventure has already begun');
    const cls = CLASSES[classId];
    if (!cls) throw new GameError('Unknown class');
    if (this.s.characters.length >= 4) throw new GameError('The party is full (4 heroes)');
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
    };
    c.ac = this.computeAc(c);
    this.s.characters.push(c);
    return c;
  }

  removeCharacter(playerId: string, characterId: string) {
    if (this.s.phase !== 'lobby') throw new GameError('The adventure has already begun');
    const c = this.char(characterId);
    if (c.ownerId !== playerId) throw new GameError('That hero belongs to another player');
    this.s.characters = this.s.characters.filter((x) => x.id !== characterId);
  }

  start() {
    if (this.s.phase !== 'lobby') throw new GameError('The adventure has already begun');
    if (!this.s.characters.length) throw new GameError('Add at least one hero first');
    const s = this.s;
    const starts: Pt[] = [];
    const grid = DUNGEON_ROWS.map((r) => r.split(''));
    const width = grid[0].length;
    if (grid.some((r) => r.length !== width)) throw new Error('Dungeon rows have uneven width');
    const spawns: { defId: string; x: number; y: number }[] = [];
    s.chests = [];
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < width; x++) {
        const t = grid[y][x];
        if (t === '@') { starts.push({ x, y }); grid[y][x] = '.'; }
        else if (MONSTER_SYMBOLS[t]) { spawns.push({ defId: MONSTER_SYMBOLS[t], x, y }); grid[y][x] = '.'; }
        else if (t === 'C') {
          const loot = CHEST_LOOT[key(x, y)] ?? { gold: 10, items: [] };
          s.chests.push({ id: this.uid('chest'), x, y, opened: false, gold: loot.gold, items: loot.items.map((i) => ({ id: i.id, qty: i.qty ?? 1 })) });
        }
      }
    }
    s.rows = grid.map((r) => r.join(''));
    s.fog = Array(width * grid.length).fill(0);
    s.openDoors = [];
    s.characters.forEach((c, i) => { c.x = starts[i % starts.length].x; c.y = starts[i % starts.length].y; });
    s.gold = 15 * s.characters.length;
    // House rule: small parties get the Hearth's Blessing so solo play is survivable.
    const blessing = (4 - s.characters.length) * 4;
    if (blessing > 0) {
      for (const c of s.characters) { c.maxHp += blessing; c.hp = c.maxHp; }
      this.log('system', `The Hearth's Blessing warms the party: +${blessing} maximum HP for each hero.`);
    }

    // Group monsters into encounters by room, then scale to party size.
    const regions = this.floodRegions();
    const byEncounter = new Map<number, typeof spawns>();
    for (const sp of spawns) {
      const r = regions.get(key(sp.x, sp.y)) ?? -1;
      byEncounter.set(r, [...(byEncounter.get(r) ?? []), sp]);
    }
    const scale = Math.min(1, s.characters.length / 4);
    s.monsters = [];
    for (const [encounterId, group] of byEncounter) {
      const bosses = group.filter((g) => MONSTERS[g.defId].boss);
      const minions = group.filter((g) => !MONSTERS[g.defId].boss);
      const keep = Math.max(bosses.length ? 0 : 1, Math.ceil(minions.length * scale));
      const chosen = [...bosses, ...minions.slice(0, keep)];
      const counts = new Map<string, number>();
      for (const sp of chosen) {
        const def = MONSTERS[sp.defId];
        const n = (counts.get(def.id) ?? 0) + 1;
        counts.set(def.id, n);
        const total = chosen.filter((c) => c.defId === def.id).length;
        const hp = def.boss ? Math.max(Math.ceil(def.hp * 0.5), Math.round(def.hp * Math.max(scale, 0.5))) : def.hp;
        s.monsters.push({
          id: this.uid('m'), defId: def.id, name: total > 1 ? `${def.name} ${n}` : def.name,
          x: sp.x, y: sp.y, hp, maxHp: hp, alive: true, revealed: false, encounterId, conditions: [],
        });
      }
    }
    s.phase = 'explore';
    s.combat = null;
    s.engaged = [];
    s.visitedAreas = [];
    this.log('system', 'The adventure begins.');
    this.beats.push({ kind: 'start' });
    this.afterMovement(s.characters[0]);
  }

  /** Label each floor tile with a room id; doors separate rooms. */
  private floodRegions(): Map<string, number> {
    const out = new Map<string, number>();
    let id = 0;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.tile(x, y) !== '.' || out.has(key(x, y))) continue;
        id++;
        const stack: Pt[] = [{ x, y }];
        out.set(key(x, y), id);
        while (stack.length) {
          const cur = stack.pop()!;
          for (const d of DIRS.slice(0, 4)) {
            const n = { x: cur.x + d.x, y: cur.y + d.y };
            if (this.tile(n.x, n.y) === '.' && !out.has(key(n.x, n.y))) { out.set(key(n.x, n.y), id); stack.push(n); }
          }
        }
      }
    }
    return out;
  }

  reset() {
    const players = this.s.players;
    this.s = Game.freshState(this.s.room, players);
    this.beats = [];
    this.moves = [];
  }

  // ------------------------------------------------------------- visibility

  /** Recompute fog. Returns encounter ids newly spotted. */
  private updateVisibility(): number[] {
    const s = this.s;
    for (let i = 0; i < s.fog.length; i++) if (s.fog[i] === 2) s.fog[i] = 1;
    for (const c of s.characters) {
      if (c.dead) continue;
      for (let y = c.y - SIGHT_RADIUS; y <= c.y + SIGHT_RADIUS; y++) {
        for (let x = c.x - SIGHT_RADIUS; x <= c.x + SIGHT_RADIUS; x++) {
          if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
          if (this.los(c, { x, y })) s.fog[y * this.width + x] = 2;
        }
      }
    }
    const spotted = new Set<number>();
    for (const m of s.monsters) {
      if (m.alive && s.fog[m.y * this.width + m.x] === 2) {
        m.revealed = true;
        if (!s.engaged.includes(m.encounterId)) spotted.add(m.encounterId);
      }
    }
    return [...spotted];
  }

  private afterMovement(mover: Character): boolean {
    const spotted = this.updateVisibility();
    const area = this.areaAt(mover.x, mover.y);
    if (area && !this.s.visitedAreas.includes(area.name)) {
      this.s.visitedAreas.push(area.name);
      if (this.s.visitedAreas.length > 1) this.beats.push({ kind: 'area', area });
    }
    if (spotted.length) {
      for (const e of spotted) this.engage(e);
      return true;
    }
    return false;
  }

  // ----------------------------------------------------------------- combat

  private initiativeFor(dexMod: number) { return d20(this.rng).value + dexMod; }

  private engage(encounterId: number) {
    const s = this.s;
    s.engaged.push(encounterId);
    const group = s.monsters.filter((m) => m.encounterId === encounterId && m.alive);
    group.forEach((m) => { m.revealed = true; });
    const entries = group.map((m) => ({ id: m.id, kind: 'monster' as const, initiative: this.initiativeFor(MONSTERS[m.defId].dexMod) }));
    if (s.combat) {
      s.combat.order.push(...entries);
      this.log('system', `${group.map((m) => m.name).join(', ')} join${group.length === 1 ? 's' : ''} the fight!`);
      this.beats.push({ kind: 'combat_start', monsters: group.map((m) => m.name) });
      return;
    }
    const pcs = s.characters.filter((c) => !c.dead).map((c) => ({ id: c.id, kind: 'pc' as const, initiative: this.initiativeFor(abilityMod(c.abilities.dex)) }));
    const order = [...pcs, ...entries].sort((a, b) => b.initiative - a.initiative || (a.kind === 'pc' ? -1 : 1));
    s.combat = { round: 1, order, turnIndex: -1, movementLeft: 0, actionUsed: false, bonusUsed: false };
    s.phase = 'combat';
    this.log('system', `Combat! Initiative: ${order.map((o) => `${this.nameOf(o.id)} ${o.initiative}`).join(', ')}.`);
    this.beats.push({ kind: 'combat_start', monsters: group.map((m) => m.name) });
    this.nextTurn();
  }

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
      if (cur.kind === 'pc') {
        const c = this.char(cur.id);
        if (c.dead) continue;
        if (c.hp <= 0) { this.deathSave(c); continue; }
        c.conditions = c.conditions.filter((x) => x !== 'dodging');
        combat.movementLeft = Math.floor(c.speed / 5);
        this.log('system', `${c.name}'s turn.`);
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
      this.log('roll', `${c.name} rolls a natural 20 on a death save and staggers back up with 1 HP!`);
      return;
    }
    if (r >= 10) c.deathSaves.successes++;
    else c.deathSaves.failures += r === 1 ? 2 : 1;
    if (c.deathSaves.failures >= 3) {
      c.dead = true;
      c.conditions = ['dead'];
      this.log('roll', `${c.name} rolls ${r} on a death save and dies.`);
    } else if (c.deathSaves.successes >= 3) {
      c.conditions.push('stable');
      this.log('roll', `${c.name} rolls ${r} on a death save and is stable.`);
    } else {
      this.log('roll', `${c.name} rolls ${r} on a death save (${c.deathSaves.successes} successes, ${c.deathSaves.failures} failures).`);
    }
  }

  /** Ends combat on victory or defeat. Returns true if combat is over. */
  private checkCombatOver(): boolean {
    const s = this.s;
    if (!s.combat) return true;
    if (!this.consciousChars().length) {
      s.phase = 'defeat';
      s.combat = null;
      this.log('system', 'The party has fallen.');
      this.beats.push({ kind: 'defeat' });
      return true;
    }
    const foes = s.combat.order.filter((o) => o.kind === 'monster' && this.monster(o.id).alive);
    if (foes.length) return false;
    s.combat = null;
    s.phase = 'explore';
    for (const c of s.characters) {
      c.conditions = c.conditions.filter((x) => x !== 'dodging');
      if (!c.dead && c.hp <= 0) {
        this.healChar(c, 1);
        this.log('system', `${c.name} is tended to and comes around with 1 HP.`);
      }
    }
    const bosses = s.monsters.filter((m) => MONSTERS[m.defId].boss);
    if (bosses.length && bosses.every((m) => !m.alive)) {
      s.phase = 'victory';
      this.log('system', 'Victory! The warren is cleared.');
      this.beats.push({ kind: 'victory' });
    } else {
      this.log('system', 'Combat is over.');
      this.beats.push({ kind: 'combat_end' });
    }
    this.updateVisibility();
    return true;
  }

  private exploring() { return this.s.phase === 'explore' || this.s.phase === 'victory'; }

  /** Validates that this player may act with this character right now. */
  private actor(playerId: string, characterId: string, needsTurn = true): Character {
    const c = this.char(characterId);
    if (c.ownerId !== playerId) throw new GameError('That hero belongs to another player');
    if (this.s.phase === 'lobby') throw new GameError('The adventure has not started');
    if (this.s.phase === 'defeat') throw new GameError('The party has fallen. Start a new adventure.');
    if (!this.conscious(c)) throw new GameError(`${c.name} is ${c.dead ? 'dead' : 'unconscious'}`);
    if (needsTurn && this.s.phase === 'combat' && this.current()?.id !== c.id) throw new GameError(`It is not ${c.name}'s turn`);
    return c;
  }

  private spendAction(bonus = false) {
    const combat = this.s.combat;
    if (!combat || this.s.phase !== 'combat') return;
    if (bonus) {
      if (combat.bonusUsed) throw new GameError('Bonus action already used this turn');
      combat.bonusUsed = true;
    } else {
      if (combat.actionUsed) throw new GameError('Action already used this turn');
      combat.actionUsed = true;
    }
  }

  private canAct(bonus = false) {
    const combat = this.s.combat;
    if (!combat || this.s.phase !== 'combat') return;
    if (bonus ? combat.bonusUsed : combat.actionUsed) throw new GameError(`${bonus ? 'Bonus action' : 'Action'} already used this turn`);
  }

  // --------------------------------------------------------------- movement

  move(playerId: string, characterId: string, tx: number, ty: number) {
    const c = this.actor(playerId, characterId);
    const s = this.s;
    const inCombat = s.phase === 'combat';
    if (!this.walkable(tx, ty)) throw new GameError("You can't go there");
    if (s.fog[ty * this.width + tx] === 0) throw new GameError("You haven't explored that far");
    if (c.x === tx && c.y === ty) return;
    const canEnter = (p: Pt) => {
      if (s.fog[p.y * this.width + p.x] === 0) return false;
      if (this.monsterAt(p.x, p.y)) return false;
      if (inCombat && this.charAt(p.x, p.y, c.id)) return false;
      return true;
    };
    let path = this.bfs(c, (p) => p.x === tx && p.y === ty, canEnter);
    if (!path) throw new GameError('No path there');
    if (inCombat) {
      const left = s.combat!.movementLeft;
      if (left <= 0) throw new GameError('No movement left this turn');
      path = path.slice(0, left);
    }
    const walked: Pt[] = [];
    for (const step of path) {
      if (this.tile(step.x, step.y) === '+' && !this.doorOpen(step.x, step.y)) {
        s.openDoors.push(key(step.x, step.y));
        this.log('system', `${c.name} opens a door.`);
        this.afterMovement(c);
        break;
      }
      const from = { x: c.x, y: c.y };
      c.x = step.x;
      c.y = step.y;
      walked.push(step);
      if (inCombat) s.combat!.movementLeft--;
      else this.follow(c, from);
      if (this.afterMovement(c)) break;
    }
    // Never end stacked on an ally.
    if (this.charAt(c.x, c.y, c.id)) {
      const free = this.bfs(c, (p) => !this.charAt(p.x, p.y, c.id) && !this.monsterAt(p.x, p.y), (p) => !this.monsterAt(p.x, p.y));
      if (free?.length) { const end = free[free.length - 1]; c.x = end.x; c.y = end.y; walked.push(...free); this.afterMovement(c); }
    }
    if (walked.length) this.moves.push({ id: c.id, path: walked });
  }

  /** Out of combat, a player's other heroes trail behind the one they move. */
  private follow(leader: Character, leaderFrom: Pt) {
    let ahead: Pt = leaderFrom;
    let target: Pt = leader;
    for (const f of this.s.characters) {
      if (f.id === leader.id || f.ownerId !== leader.ownerId || !this.conscious(f)) continue;
      const from = { x: f.x, y: f.y };
      if (cheb(f, target) > 1) {
        const dest = this.charAt(ahead.x, ahead.y, f.id) || this.monsterAt(ahead.x, ahead.y) ? null : ahead;
        const path = dest && cheb(f, dest) <= 1
          ? [dest]
          : this.bfs(f, (p) => cheb(p, target) <= 1 && !this.charAt(p.x, p.y, f.id), (p) => !this.monsterAt(p.x, p.y) && this.s.fog[p.y * this.width + p.x] !== 0 && (this.tile(p.x, p.y) !== '+' || this.doorOpen(p.x, p.y)));
        const step = path?.[0];
        if (step && !this.charAt(step.x, step.y, f.id)) {
          f.x = step.x;
          f.y = step.y;
          this.moves.push({ id: f.id, path: [step] });
        }
      }
      ahead = from;
      target = f;
    }
  }

  // ---------------------------------------------------------------- attacks

  private hostileAdjacentToChar(c: Character) {
    return this.s.monsters.some((m) => m.alive && m.revealed && cheb(m, c) <= 1);
  }

  private damageMonster(m: Monster, amount: number, type: string): { dealt: number; note: string } {
    const def = MONSTERS[m.defId];
    let dealt = amount;
    let note = '';
    if (def.immune?.includes(type)) { dealt = 0; note = ' (immune)'; }
    else if (def.vulnerable?.includes(type)) { dealt = amount * 2; note = ' (vulnerable, doubled)'; }
    m.hp = Math.max(0, m.hp - dealt);
    if (m.hp === 0) { m.alive = false; m.conditions = []; note += ` ${m.name} is slain!`; }
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
    if (!m.alive || !m.revealed) throw new GameError('No such target');
    if (cheb(c, m) * 5 > Math.max(5, rangeFeet)) throw new GameError(`${m.name} is out of range`);
    if (!this.los(c, m)) throw new GameError(`${c.name} cannot see ${m.name}`);
    return m;
  }

  attack(playerId: string, characterId: string, targetId: string) {
    const c = this.actor(playerId, characterId);
    if (this.s.phase !== 'combat') throw new GameError('There is nothing to fight right now');
    this.canAct();
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
    this.spendAction();
    const r = d20(this.rng, mode);
    const total = r.value + bonus;
    const crit = r.value === 20;
    const ac = MONSTERS[m.defId].ac;
    const label = w ? w.name : 'an unarmed strike';
    const head = `${c.name} attacks ${m.name} with ${label}: ${fmtD20(r, mode)}${signed(bonus)} = ${total} vs AC ${ac}.`;
    if (r.value === 1 || (!crit && total < ac)) {
      this.log('roll', `${head} Miss.`);
    } else {
      let dmg = wp ? roll(wp.damage, this.rng, crit).total + mod + (wp.bonus ?? 0) : 1 + strMod;
      let extra = '';
      const flanked = this.s.characters.some((a) => a.id !== c.id && this.conscious(a) && cheb(a, m) <= 1);
      if (c.classId === 'rogue' && wp && (wp.finesse || ranged) && (flanked || mode === 'advantage')) {
        dmg += roll('1d6', this.rng, crit).total;
        extra = ' (with Sneak Attack)';
      }
      dmg = Math.max(1, dmg);
      const res = this.damageMonster(m, dmg, wp?.damageType ?? 'bludgeoning');
      this.log('roll', `${head} ${crit ? 'Critical hit' : 'Hit'} for ${res.dealt} ${wp?.damageType ?? 'bludgeoning'} damage${extra}.${res.note}`);
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
    if (!ab || !c.abilityIds.includes(abilityId)) throw new GameError(`${c.name} doesn't know that`);
    const inCombat = this.s.phase === 'combat';
    if (ab.target === 'enemy' && !inCombat) throw new GameError('There is nothing to fight right now');
    if (ab.kind === 'dodge' && !inCombat) throw new GameError('Dodge is only useful in combat');
    this.canAct(ab.bonusAction);
    if (ab.oncePerRest && c.spent.includes(ab.id)) throw new GameError(`${ab.name} is spent until you rest`);
    if (c.mana < ab.cost) throw new GameError('Not enough mana');
    const cmod = this.castingMod(c);
    const spend = () => {
      this.spendAction(ab.bonusAction);
      c.mana -= ab.cost;
      if (ab.oncePerRest) c.spent.push(ab.id);
    };

    switch (ab.kind) {
      case 'dodge': {
        spend();
        c.conditions.push('dodging');
        this.log('roll', `${c.name} takes the Dodge action.`);
        break;
      }
      case 'self_heal': {
        if (c.hp >= c.maxHp) throw new GameError(`${c.name} is already at full health`);
        spend();
        const healed = this.healChar(c, roll(ab.dice!, this.rng).total + c.level);
        this.log('roll', `${c.name} uses ${ab.name} and regains ${healed} HP.`);
        break;
      }
      case 'heal': {
        const t = this.char(targetId ?? c.id);
        if (t.dead) throw new GameError(`${t.name} is beyond healing`);
        if (cheb(c, t) * 5 > Math.max(5, ab.range)) throw new GameError(`${t.name} is too far away`);
        if (t.hp >= t.maxHp) throw new GameError(`${t.name} is already at full health`);
        spend();
        const healed = this.healChar(t, roll(ab.dice!, this.rng).total + cmod);
        this.log('roll', `${c.name} casts ${ab.name} on ${t.id === c.id ? 'themself' : t.name}, restoring ${healed} HP.`);
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
        const head = `${c.name} casts ${ab.name} at ${m.name}: ${fmtD20(r, mode)}${signed(bonus)} = ${total} vs AC ${ac}.`;
        if (r.value === 1 || (!crit && total < ac)) this.log('roll', `${head} Miss.`);
        else {
          const res = this.damageMonster(m, roll(ab.dice!, this.rng, crit).total, ab.damageType!);
          if (ab.id === 'guiding_bolt' && m.alive) m.conditions.push('guided');
          this.log('roll', `${head} ${crit ? 'Critical hit' : 'Hit'} for ${res.dealt} ${ab.damageType} damage.${res.note}`);
        }
        break;
      }
      case 'save': {
        const m = this.targetMonster(c, targetId ?? '', ab.range);
        spend();
        const dc = 8 + c.profBonus + cmod;
        const saveMod = MONSTERS[m.defId].saves[ab.saveAbility!] ?? 0;
        const r = d20(this.rng).value;
        const head = `${c.name} casts ${ab.name} at ${m.name}: ${ab.saveAbility!.toUpperCase()} save ${r}${signed(saveMod)} = ${r + saveMod} vs DC ${dc}.`;
        if (r + saveMod >= dc) this.log('roll', `${head} ${m.name} avoids it.`);
        else {
          const res = this.damageMonster(m, roll(ab.dice!, this.rng).total, ab.damageType!);
          this.log('roll', `${head} Failed, ${res.dealt} ${ab.damageType} damage.${res.note}`);
        }
        break;
      }
      case 'auto': {
        const m = this.targetMonster(c, targetId ?? '', ab.range);
        spend();
        const res = this.damageMonster(m, roll(ab.dice!, this.rng).total, ab.damageType!);
        this.log('roll', `${c.name} casts ${ab.name} at ${m.name} for ${res.dealt} ${ab.damageType} damage.${res.note}`);
        break;
      }
    }
    if (inCombat) this.checkCombatOver();
  }

  endTurn(playerId: string, characterId: string) {
    this.actor(playerId, characterId);
    if (this.s.phase !== 'combat') throw new GameError('Not in combat');
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
    if (this.tile(p.x, p.y) === '+' && !this.doorOpen(p.x, p.y)) return true;
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
      this.log('roll', `${m.name} ${walked.length ? 'moves but' : ''} cannot reach ${target.name}.`.replace('  ', ' '));
      return { monster: m.name, moved: walked.length, note: `could not reach ${target.name}` };
    }
    const adjacentFoe = this.consciousChars().some((c) => cheb(c, m) <= 1);
    const pack = !!def.packTactics && this.s.monsters.some((o) => o.alive && o.id !== m.id && cheb(o, target!) <= 1);
    const dis = target.conditions.includes('dodging') || (!!chosen.ranged && (adjacentFoe || dist > chosen.range));
    const mode = rollMode(pack, dis);
    const r = d20(this.rng, mode);
    const total = r.value + chosen.toHit;
    const crit = r.value === 20;
    const head = `${m.name} attacks ${target.name} with ${chosen.name}: ${fmtD20(r, mode)}${signed(chosen.toHit)} = ${total} vs AC ${target.ac}.`;
    if (r.value === 1 || (!crit && total < target.ac)) {
      this.log('roll', `${head} Miss.`);
      return { monster: m.name, moved: walked.length, attack: { name: chosen.name, target: target.name, hit: false, crit: false, damage: 0, targetHp: target.hp, targetDown: false } };
    }
    const dmg = Math.max(1, roll(chosen.damage, this.rng, crit).total);
    const down = this.damageChar(target, dmg);
    this.log('roll', `${head} ${crit ? 'Critical hit' : 'Hit'} for ${dmg} ${chosen.damageType} damage.${down ? ` ${target.name} falls unconscious!` : ''}`);
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
    if (!this.validLoc(from) || !this.validLoc(to)) throw new GameError('Bad inventory slot');
    const item = this.getLoc(c, from);
    if (!item) throw new GameError('Nothing there');
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
        throw new GameError('No bag space to free a hand');
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
    if (t.dead) throw new GameError(`${t.name} is dead`);
    if (!this.validLoc(from)) throw new GameError('Bad inventory slot');
    const item = this.getLoc(c, from);
    if (!item) throw new GameError('Nothing there');
    if (this.s.phase === 'combat' && cheb(c, t) > 1) throw new GameError(`${t.name} is too far away to hand that over mid-fight`);
    if (!this.addToBag(t, item.defId, item.qty)) throw new GameError(`${t.name}'s bag is full`);
    this.setLoc(c, from, null);
    c.ac = this.computeAc(c);
    this.log('system', `${c.name} hands ${ITEMS[item.defId].name} to ${t.name}.`);
  }

  useItem(playerId: string, characterId: string, uid: string, targetId?: string) {
    const c = this.actor(playerId, characterId);
    const idx = c.bag.findIndex((b) => b?.uid === uid);
    if (idx < 0) throw new GameError('That item is not in the bag');
    const item = c.bag[idx]!;
    const def = ITEMS[item.defId];
    if (!def.consumable) {
      const slot = this.slotFor(def);
      if (!slot) throw new GameError(`${def.name} can't be used`);
      this.invMove(playerId, characterId, { type: 'bag', index: idx }, { type: 'slot', slot });
      return;
    }
    const t = this.char(targetId ?? c.id);
    if (t.dead) throw new GameError(`${t.name} is beyond healing`);
    if (cheb(c, t) > 1) throw new GameError(`${t.name} is too far away`);
    if (t.hp >= t.maxHp) throw new GameError(`${t.name} is already at full health`);
    this.canAct();
    this.spendAction();
    const healed = this.healChar(t, roll(def.consumable.heal, this.rng).total);
    item.qty--;
    if (item.qty <= 0) c.bag[idx] = null;
    this.log('roll', `${c.name} ${t.id === c.id ? 'drinks' : `feeds ${t.name}`} a ${def.name}, restoring ${healed} HP.`);
  }

  openChest(playerId: string, characterId: string, chestId: string) {
    const c = this.actor(playerId, characterId, false);
    if (!this.exploring()) throw new GameError('Not while fighting!');
    const chest = this.s.chests.find((ch) => ch.id === chestId);
    if (!chest) throw new GameError('No such chest');
    if (cheb(c, chest) > 1) throw new GameError('Move next to the chest first');
    if (chest.opened && !chest.items.length) throw new GameError('The chest is empty');
    const got: string[] = [];
    if (chest.gold) { this.s.gold += chest.gold; got.push(`${chest.gold} gold`); chest.gold = 0; }
    const left: typeof chest.items = [];
    for (const it of chest.items) {
      if (this.addToBag(c, it.id, it.qty)) got.push(`${it.qty > 1 ? `${it.qty}× ` : ''}${ITEMS[it.id].name}`);
      else left.push(it);
    }
    chest.items = left;
    chest.opened = true;
    this.log('system', `${c.name} opens the chest and finds ${got.length ? got.join(', ') : 'nothing they can carry'}.${left.length ? ` ${c.name}'s bag is full; some items remain.` : ''}`);
  }

  shortRest() {
    if (this.s.phase !== 'explore' && this.s.phase !== 'victory') throw new GameError('You can only rest outside combat');
    if (this.s.shortRestsLeft <= 0) throw new GameError('The party is too wary to rest again here');
    this.s.shortRestsLeft--;
    const parts: string[] = [];
    for (const c of this.s.characters) {
      if (c.dead) continue;
      let healed = 0;
      if (c.hitDice > 0 && c.hp < c.maxHp) {
        c.hitDice--;
        healed = this.healChar(c, Math.max(1, roll(`1d${CLASSES[c.classId].hitDie}`, this.rng).total + abilityMod(c.abilities.con)));
      }
      c.spent = [];
      const mana = c.maxMana ? Math.min(c.maxMana - c.mana, 2) : 0;
      c.mana += mana;
      parts.push(`${c.name} +${healed} HP${mana ? `, +${mana} mana` : ''}`);
    }
    this.log('system', `The party takes a short rest. ${parts.join('; ')}.`);
  }

  /** Ability check requested by the Dungeon Master. */
  skillCheck(characterId: string, ability: AbilityKey, skill: string, dc: number) {
    const c = this.char(characterId);
    const prof = c.skills.includes(skill.toLowerCase()) ? c.profBonus : 0;
    const mod = abilityMod(c.abilities[ability]) + prof;
    const r = d20(this.rng).value;
    const total = r + mod;
    const success = total >= dc;
    this.log('roll', `${c.name} makes a ${skill || ability.toUpperCase()} check: ${r}${signed(mod)} = ${total} vs DC ${dc}. ${success ? 'Success.' : 'Failure.'}`);
    return { character: c.name, roll: r, modifier: mod, total, dc, success };
  }

  takeBeats(): Beat[] { const b = this.beats; this.beats = []; return b; }
  takeMoves() { const m = this.moves; this.moves = []; return m; }

  // ------------------------------------------------------------ public view

  publicState(dm: { busy: boolean; mode: 'claude' | 'scripted'; model: string | null }): GameState {
    const s = this.s;
    return {
      room: s.room,
      phase: s.phase,
      map: { width: this.width, height: this.height, rows: s.rows },
      fog: s.fog.join(''),
      openDoors: s.openDoors,
      chests: s.chests.map(({ id, x, y, opened }) => ({ id, x, y, opened })),
      characters: s.characters,
      monsters: s.monsters.filter((m) => m.revealed).map((m) => ({
        id: m.id, defId: m.defId, name: m.name, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp,
        ac: MONSTERS[m.defId].ac, alive: m.alive, conditions: m.conditions, sprite: MONSTERS[m.defId].sprite,
      })),
      combat: s.combat,
      gold: s.gold,
      shortRestsLeft: s.shortRestsLeft,
      log: s.log.slice(-80),
      players: s.players,
      dmBusy: dm.busy,
      dmMode: dm.mode,
      dmModel: dm.model,
    };
  }
}

export type { MonsterDef };
