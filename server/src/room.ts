// A room is one table: a Game, the players sitting at it and its Dungeon Master.
import type { WebSocket } from 'ws';
import type { ChatMessage, ClientMessage, ServerMessage, TableSummary, TestAction, TypingWhere } from '../../shared/types';
import type { Store } from './db';
import type { DungeonMaster, MonsterActor, PlayerLine } from './dm/types';
import { Game, GameError, type Beat, type InternalState } from './game/engine';
import { monsterCatalog, playtest } from './game/playtest';
import { newSeed } from '../../shared/start';
import { tagged } from '../../shared/i18n';
import { parseOoc } from '../../shared/ooc';
import type { PlayStats } from '../../shared/accounts';
import type { HeroRef } from './accounts';
import { hashToken } from './http';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** How long a typing notice counts without being renewed. */
const TYPING_MS = 5000;

export interface RoomTiming {
  /** Pause after each monster acts, so players can follow the fight. */
  actionDelayMs: number;
  /** Pause per hex of overland travel. */
  travelDelayMs: number;
  /**
   * With several players at the table, how long the Dungeon Master waits for the others
   * after the first one acts, so everyone's action is resolved in one reply. 0 answers at once.
   */
  turnWaitMs: number;
  /** The longest the Dungeon Master keeps waiting while somebody is still typing. */
  turnWaitMaxMs: number;
  /** How long a disconnected host keeps the table before it passes to another player. */
  hostGraceMs: number;
  /** How long the fight waits for a player deciding on an opportunity attack before striking for them. */
  reactionWaitMs: number;
  /** How long a player may take back what they just said, before the Dungeon Master starts to answer. 0 answers at once. */
  undoGraceMs: number;
}

export const DEFAULT_TIMING: RoomTiming = { actionDelayMs: 500, travelDelayMs: 320, turnWaitMs: 8000, turnWaitMaxMs: 30000, hostGraceMs: 20000, reactionWaitMs: 20000, undoGraceMs: 0 };

export interface RoomHooks {
  /** What the lobby lists about this table changed. */
  changed?(room: Room): void;
  /** A socket was sent away from the table (left, removed by the host, table closed). */
  detached?(ws: WebSocket, room: Room): void;
  /** The table is gone. */
  closed?(room: Room): void;
  /** The table got a new name. */
  renamed?(room: Room): void;
  /** A table was deleted on purpose, by this name: keep it in the bin before it goes. */
  binned?(state: InternalState, by: string): void;
  /** A fresh invite code no other table uses. */
  newCode?(): string;
  /** True while the Innkeeper has paused the table. */
  paused?(room: Room): boolean;
  /** Something for a player's account stats: added to the account once, and to each hero named. */
  stats?(playerId: string, delta: Partial<PlayStats>, heroes: HeroRef[]): void;
  /** Why this player may not ask the AI for anything new right now (their credit is used up), or null. */
  mayAsk?(playerId: string): string | null;
}

/**
 * What a player does that has the AI Dungeon Master write something: saying or asking something, starting the
 * adventure, travelling, resting, going on into a dungeon. A fight already under way is always finished.
 */
const ASKS_THE_DM: ClientMessage['t'][] = ['say', 'start', 'travel', 'go', 'delve', 'short_rest', 'long_rest'];

/** Sitting down again after this long away counts as a new session. */
export const SESSION_GAP_MS = 30 * 60 * 1000;

/** Sent in English and translated by the browser, like the reasons a seat is refused. */
export const PAUSED_MESSAGE = 'The innkeeper has paused this table.';

export class Room {
  readonly game: Game;
  private sockets = new Map<WebSocket, string>();
  /** Serialises player actions and monster turns. */
  private queue: Promise<void> = Promise.resolve();
  /** Serialises narration and DM chat so they never block movement. */
  private narration: Promise<void> = Promise.resolve();
  private dmBusy = 0;
  private epoch = 0;
  private saveTimer: NodeJS.Timeout | null = null;
  private timing: RoomTiming;
  private closed = false;
  private woken = false;
  private lastSummary = '';
  private hostTimer: NodeJS.Timeout | null = null;
  private typing = new Map<string, { where: TypingWhere; at: number }>();
  /** What players said to the Dungeon Master that has not been answered yet. */
  private pending: (PlayerLine & { playerId: string; logId: number })[] = [];
  /** The wait before the next answer is only the short moment to take an action back, not a wait for other players. */
  private graceOnly = false;
  private gatherTimer: NodeJS.Timeout | null = null;
  private gatherStart = 0;
  /** Non-zero while a reply to the players is queued or being written. */
  private answering = 0;
  private answerSeq = 0;
  /** Settles the reaction prompt that a monster's turn is waiting on: true strikes. */
  private reactionWaiter: ((take: boolean) => void) | null = null;
  /** Since when each player has been at the table without a break, for their play time. */
  private seatedSince = new Map<string, number>();
  /** When each player last got up, so a quick reload is not a new session. */
  private leftAt = new Map<string, number>();
  /** The party's gold when the stats last looked, so gold taken in can be credited. */
  private lastGold: number;
  private lastPhase: string;

  constructor(
    readonly name: string,
    private dm: DungeonMaster,
    private store: Store,
    timing: Partial<RoomTiming> = {},
    private hooks: RoomHooks = {},
  ) {
    this.timing = { ...DEFAULT_TIMING, ...timing };
    const saved = store.load(name);
    this.game = new Game(name, Math.random, saved);
    this.game.interactiveReactions = this.timing.reactionWaitMs > 0;
    this.game.reactionWaitMs = this.timing.reactionWaitMs;
    for (const p of this.game.s.players) p.connected = false;
    // Every table has a world seed to show and share, also the ones saved before seeds existed.
    if (!this.game.s.table.start.seed) this.game.s.table.start.seed = newSeed();
    this.lastGold = this.game.s.gold;
    this.lastPhase = this.game.s.phase;
    this.game.tally = (heroId, what) => {
      const c = this.game.s.characters.find((x) => x.id === heroId);
      // What happens in test mode is the host trying things out, not the campaign.
      if (c && !this.game.s.testMode) this.hooks.stats?.(c.ownerId, { [what]: 1 }, [this.heroRef(c)]);
    };
  }

  private heroRef(c: { id: string; name: string; classId: string; level: number }): HeroRef {
    return { table: this.name, tableTitle: this.game.s.table.title, id: c.id, name: c.name, classId: c.classId, level: c.level };
  }

  private heroesOf(playerId: string): HeroRef[] {
    return this.game.s.characters.filter((c) => c.ownerId === playerId).map((c) => this.heroRef(c));
  }

  /** A player arrives at the table or goes, for their sessions and play time. */
  private presence(playerId: string, here: boolean) {
    const now = Date.now();
    if (here) {
      if (this.seatedSince.has(playerId)) return;
      this.seatedSince.set(playerId, now);
      const left = this.leftAt.get(playerId);
      if (left === undefined || now - left > SESSION_GAP_MS) this.hooks.stats?.(playerId, { sessions: 1 }, this.heroesOf(playerId));
      return;
    }
    const since = this.seatedSince.get(playerId);
    if (since === undefined) return;
    this.seatedSince.delete(playerId);
    this.leftAt.set(playerId, now);
    if (now > since) this.hooks.stats?.(playerId, { playMs: now - since }, this.heroesOf(playerId));
  }

  /** Book the play time so far, so a restart loses none of it. */
  private bookPlayTime() {
    const now = Date.now();
    for (const [id, since] of this.seatedSince) {
      if (now > since) this.hooks.stats?.(id, { playMs: now - since }, this.heroesOf(id));
      this.seatedSince.set(id, now);
    }
  }

  /** Gold the party took in since the last look goes to every hero in it, and once to each of their players. */
  private creditGold() {
    const s = this.game.s;
    const gained = s.gold - this.lastGold;
    const wasLobby = this.lastPhase === 'lobby';
    this.lastGold = s.gold;
    this.lastPhase = s.phase;
    // The purse the heroes start with is not earned.
    if (gained <= 0 || s.testMode || wasLobby) return;
    for (const owner of new Set(s.characters.map((c) => c.ownerId))) this.hooks.stats?.(owner, { gold: gained }, this.heroesOf(owner));
  }

  /**
   * Hand a seat to an account: a seat taken in a browser before accounts becomes the account's.
   * Connections still sitting on the old seat are sent back to the list of tables.
   */
  reassign(from: string, to: string, name?: string): boolean {
    if (this.closed || !this.game.player(from)) return false;
    this.detach(from, 'left');
    if (!this.game.reassignPlayer(from, to, name)) return false;
    this.flush();
    this.saveNow();
    return true;
  }

  /** The account behind a seat has a new name. */
  renamePlayer(id: string, name: string): boolean {
    if (this.closed || !this.game.renamePlayer(id, name)) return false;
    this.flush();
    this.saveNow();
    return true;
  }

  /** Give the table another name. Everyone sees it at once. */
  rename(title: string) {
    this.game.s.table.title = title;
    this.hooks.renamed?.(this);
    this.flush();
  }

  get empty() { return this.sockets.size === 0; }

  /** What the lobby shows about this table. */
  summary(): TableSummary {
    const s = this.game.s;
    return {
      id: this.name,
      title: s.table.title,
      language: this.game.lang,
      playing: s.phase !== 'lobby',
      players: s.players.map((p) => ({ id: p.id, name: p.name, connected: p.connected })),
      maxPlayers: s.table.maxPlayers,
      locked: !!s.table.code,
      heroes: s.characters.length,
      hostId: s.hostId,
    };
  }

  /** Sit a player down. Throws a JoinError when the seat is refused. */
  join(ws: WebSocket, playerId: string, token: string, name: string, code?: string) {
    this.game.seat(playerId, hashToken(token), name, code);
    this.sockets.set(ws, playerId);
    this.presence(playerId, true);
    this.send(ws, { t: 'chat', messages: this.game.chatFor(playerId), replace: true });
    for (const [id, t] of this.typing) if (id !== playerId && Date.now() - t.at < TYPING_MS) this.send(ws, { t: 'typing', playerId: id, where: t.where });
    this.watchHost();
    this.flush();
    if (!this.woken) {
      // A restart may have interrupted the monsters' turn. Nothing runs until somebody is here to see it.
      this.woken = true;
      this.enqueue(() => this.pump());
    }
  }

  /** A connection went away. The seat and the heroes stay. */
  leave(ws: WebSocket) {
    const id = this.sockets.get(ws);
    if (!id) return;
    this.sockets.delete(ws);
    if (![...this.sockets.values()].includes(id)) {
      this.presence(id, false);
      this.game.setConnected(id, false);
      this.setTyping(id, null);
      // Nobody waits for a player who has gone: their hero strikes.
      const prompt = this.game.reactionPrompt();
      if (prompt && this.game.s.characters.find((c) => c.id === prompt.heroId)?.ownerId === id) this.reactionWaiter?.(true);
    }
    this.watchHost();
    this.flush();
    // Nobody is left to wait for.
    this.considerAnswer();
  }

  /** The player gets up for good before the adventure, or just steps away once it runs. */
  private quit(ws: WebSocket, playerId: string) {
    const g = this.game;
    if (g.s.phase !== 'lobby') {
      this.send(ws, { t: 'left', reason: 'left' });
      this.hooks.detached?.(ws, this);
      return this.leave(ws);
    }
    g.unseat(playerId);
    this.detach(playerId, 'left');
    // A table nobody sits at and nobody ever played at is only clutter in the lobby.
    if (!g.s.players.length) return this.close();
    this.watchHost();
    this.flush();
  }

  /** Send every connection of one player back to the lobby. */
  private detach(playerId: string, reason: 'left' | 'kicked' | 'closed' | 'removed' | 'restored') {
    for (const [ws, id] of [...this.sockets]) {
      if (id !== playerId) continue;
      this.sockets.delete(ws);
      this.send(ws, { t: 'left', reason });
      this.hooks.detached?.(ws, this);
    }
    this.presence(playerId, false);
    this.setTyping(playerId, null);
    this.pending = this.pending.filter((l) => l.playerId !== playerId);
  }

  /** Stop the table and send everyone back to the lobby, without touching what is saved. */
  private stop(reason: 'closed' | 'restored') {
    this.closed = true;
    this.epoch++;
    this.reactionWaiter?.(false);
    for (const id of new Set(this.sockets.values())) this.detach(id, reason);
    for (const t of [this.saveTimer, this.hostTimer, this.gatherTimer]) if (t) clearTimeout(t);
    this.saveTimer = this.hostTimer = this.gatherTimer = null;
    this.pending = [];
  }

  /** The Innkeeper replaces this table with a saved one: this room ends, the caller opens a new one. */
  retire() {
    this.stop('restored');
  }

  /** The Innkeeper sends a player away. Before the adventure the seat goes too; later it stays theirs. */
  remove(playerId: string) {
    if (this.closed || !this.game.player(playerId)) return;
    if (this.game.s.phase === 'lobby') this.game.unseat(playerId);
    this.detach(playerId, 'removed');
    if (this.game.s.phase !== 'lobby') this.game.setConnected(playerId, false);
    if (!this.game.s.players.length) return this.close();
    this.watchHost();
    this.flush();
    this.considerAnswer();
  }

  /** Which player a connection belongs to. */
  playerOf(ws: WebSocket): string | undefined {
    return this.sockets.get(ws);
  }

  /** A word from the Innkeeper to everyone at the table. */
  notice(text: string) {
    for (const ws of this.sockets.keys()) this.send(ws, { t: 'notice', text });
  }

  /** Remove the table and everything saved for it. A table deleted on purpose (`by`) waits in the bin first. */
  close(by?: string) {
    this.stop('closed');
    if (by !== undefined) {
      try { this.hooks.binned?.(this.game.s, by); } catch (err) { console.error('[bin] could not keep the table:', err); }
    }
    try {
      this.store.delete(this.name);
    } catch (err) {
      console.error('[store] delete failed:', err);
    }
    this.hooks.closed?.(this);
  }

  /** When the host drops out, wait a moment (a reload, a flaky connection), then pass the table on. */
  private watchHost() {
    const s = this.game.s;
    const host = s.hostId ? this.game.player(s.hostId) : undefined;
    const orphaned = !host?.connected && s.players.some((p) => p.connected);
    if (!orphaned) {
      if (this.hostTimer) clearTimeout(this.hostTimer);
      this.hostTimer = null;
      return;
    }
    if (this.hostTimer) return;
    this.hostTimer = setTimeout(() => {
      this.hostTimer = null;
      if (!this.closed && this.game.handOverHost()) this.flush();
    }, this.timing.hostGraceMs);
    this.hostTimer.unref?.();
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  private get gathering() { return this.pending.length > 0 && !this.answering && !this.graceOnly; }

  /** Push pending movement animations and the latest state to everyone, then persist. */
  flush() {
    if (this.closed) return;
    const moves = this.game.takeMoves();
    this.game.checkTrophies();
    this.creditGold();
    const state: ServerMessage = {
      t: 'state',
      state: this.game.publicState({ busy: this.dmBusy > 0, mode: this.dm.mode, model: this.dm.model, gathering: this.gathering, unanswered: this.pending.filter((l) => !l.director).map((l) => ({ logId: l.logId, playerId: l.playerId })) }),
    };
    const payload = JSON.stringify(state);
    for (const ws of this.sockets.keys()) {
      for (const m of moves) this.send(ws, { t: 'moved', id: m.id, path: m.path });
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
    const summary = JSON.stringify(this.summary());
    if (summary !== this.lastSummary) {
      this.lastSummary = summary;
      this.hooks.changed?.(this);
    }
    this.saveSoon();
  }

  private saveSoon() {
    if (this.saveTimer || this.closed) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, 400);
  }

  saveNow() {
    if (this.closed) return;
    this.bookPlayTime();
    try {
      this.store.save(this.name, this.game.s);
    } catch (err) {
      console.error('[store] save failed:', err);
    }
  }

  private enqueue(fn: () => Promise<void> | void) {
    this.queue = this.queue.then(fn).catch((err) => console.error('[room] action failed:', err));
  }

  /** Run something that may be refused, and tell only the player who asked. */
  private attempt(ws: WebSocket, fn: () => void): boolean {
    try {
      fn();
      return true;
    } catch (err) {
      if (!(err instanceof GameError)) throw err;
      this.send(ws, { t: 'error', message: err.message });
      return false;
    }
  }

  handle(ws: WebSocket, msg: ClientMessage) {
    const playerId = this.sockets.get(ws);
    if (!playerId || this.closed) return;
    const g = this.game;
    // A paused table can still be left and talked at, but nothing moves in the game.
    if (this.hooks.paused?.(this) && !['chat', 'typing', 'leave_table'].includes(msg.t)) {
      return this.send(ws, { t: 'error', message: PAUSED_MESSAGE });
    }
    if (ASKS_THE_DM.includes(msg.t)) {
      const refused = this.hooks.mayAsk?.(playerId);
      if (refused) return this.send(ws, { t: 'error', message: refused });
    }
    switch (msg.t) {
      case 'say': return this.say(ws, playerId, String(msg.text ?? ''), !!msg.ooc);
      case 'unsay': return this.unsay(ws, playerId);
      case 'test': return this.testAction(ws, playerId, msg.do);
      case 'travel': return this.travel(ws, Math.round(Number(msg.q)), Math.round(Number(msg.r)));
      case 'chat': return this.chat(ws, playerId, String(msg.text ?? ''), msg.to ? String(msg.to) : undefined);
      case 'typing': return this.setTyping(playerId, msg.where === 'story' || msg.where === 'chat' ? msg.where : null);
      case 'leave_table': return this.quit(ws, playerId);
      case 'kick': {
        const target = String(msg.playerId ?? '');
        if (!this.attempt(ws, () => g.kick(playerId, target))) return;
        this.detach(target, 'kicked');
        this.flush();
        return this.considerAnswer();
      }
      case 'make_host':
        if (this.attempt(ws, () => g.makeHost(playerId, String(msg.playerId ?? '')))) { this.watchHost(); this.flush(); }
        return;
      case 'set_code':
        if (this.attempt(ws, () => g.setCode(playerId, msg.locked ? (g.s.table.code ?? this.hooks.newCode?.() ?? null) : null))) this.flush();
        return;
      case 'ready':
        if (this.attempt(ws, () => g.setReady(playerId, !!msg.ready))) this.flush();
        return;
      // Answered outside the queue: the monsters' turn holds it while it waits for this.
      case 'reaction':
        if (this.attempt(ws, () => g.checkReaction(playerId, String(msg.characterId)))) this.reactionWaiter?.(!!msg.take);
        return;
      case 'set_opportunity':
        if (this.attempt(ws, () => g.setOpportunity(playerId, String(msg.characterId), msg.mode))) this.flush();
        return;
    }
    this.enqueue(async () => {
      if (this.closed) return;
      const began = this.attempt(ws, () => this.apply(playerId, msg)) && msg.t === 'start';
      this.flush();
      if (began) await this.prepareWorld();
      // A hero who joins an adventure already under way gets a personal thread too, without holding up play.
      else if ((msg.t === 'create_character' || msg.t === 'add_premade') && this.game.s.setting && this.dm.weaveThreads) {
        const g = this.game, epoch = this.epoch;
        void this.dm.weaveThreads(g).then(() => { if (epoch === this.epoch) this.flush(); });
      }
      await this.pump();
    });
  }

  private apply(playerId: string, msg: ClientMessage) {
    const g = this.game;
    switch (msg.t) {
      case 'add_character': return void g.addCharacter(playerId, msg.classId, String(msg.name ?? ''));
      case 'add_premade': return void g.addPremade(playerId, String(msg.premadeId), String(msg.name ?? ''));
      case 'create_character': return void g.createCharacter(playerId, msg.spec);
      case 'roll_abilities': return void g.rollAbilities(playerId);
      case 'choose': return g.choose(playerId, String(msg.characterId), String(msg.choiceId), msg.pick);
      case 'remove_character': return g.removeCharacter(playerId, String(msg.characterId));
      case 'start': return g.start(playerId);
      case 'move': return g.move(playerId, String(msg.characterId), Math.round(Number(msg.x)), Math.round(Number(msg.y)));
      case 'attack': return g.attack(playerId, String(msg.characterId), String(msg.targetId));
      case 'ability': return g.useAbility(playerId, String(msg.characterId), String(msg.abilityId), msg.targetId ? String(msg.targetId) : undefined, Number.isFinite(Number(msg.level)) ? Number(msg.level) : undefined);
      case 'use_item': return g.useItem(playerId, String(msg.characterId), String(msg.uid), msg.targetId ? String(msg.targetId) : undefined);
      case 'end_turn': return g.endTurn(playerId, String(msg.characterId));
      case 'disengage': return g.disengage(playerId, String(msg.characterId));
      case 'escape': return g.escape(playerId, String(msg.characterId));
      case 'light': return g.setLight(playerId, String(msg.characterId), !!msg.on);
      case 'inv_move': return g.invMove(playerId, String(msg.characterId), msg.from, msg.to);
      case 'give': return g.give(playerId, String(msg.characterId), msg.from, String(msg.toCharacterId));
      case 'buy': return void g.buy(playerId, String(msg.characterId), String(msg.shopId), String(msg.defId), Number(msg.qty));
      case 'sell': return void g.sell(playerId, String(msg.characterId), String(msg.shopId), msg.from, Number(msg.qty));
      case 'haggle': return void g.haggle(playerId, String(msg.characterId), String(msg.shopId));
      case 'short_rest': return g.shortRest();
      case 'long_rest': return g.longRest();
      case 'go': return g.goTo(String(msg.locationId));
      case 'delve': return g.delve();
      case 'set_language': return g.setLanguage(playerId, msg.lang);
      case 'set_start': return g.setStart(playerId, msg.start);
      case 'set_style': return g.setStyle(playerId, msg.style);
      case 'reset':
        g.reset(playerId);
        this.epoch++;
        this.reactionWaiter?.(false);
        this.pending = [];
        this.answering = 0;
        this.graceOnly = false;
        if (this.gatherTimer) clearTimeout(this.gatherTimer);
        this.gatherTimer = null;
        return;
      default:
        throw new GameError('Unknown action');
    }
  }

  /** Before the first scene, let the Dungeon Master put its own words to a freshly rolled region. */
  private async prepareWorld() {
    if (!this.dm.prepare) return;
    const epoch = this.epoch;
    this.dmBusy++;
    this.flush();
    try {
      await this.dm.prepare(this.game);
    } catch (err) {
      console.error('[room] preparing the world failed:', err);
    } finally {
      this.dmBusy--;
      if (epoch === this.epoch) this.flush();
    }
  }

  /** Walk the party across the map one hex at a time so everyone watches the journey unfold. */
  private travel(ws: WebSocket, q: number, r: number) {
    this.enqueue(async () => {
      const g = this.game;
      if (!this.attempt(ws, () => g.beginTravel(q, r))) return;
      const epoch = this.epoch;
      this.flush();
      while (g.travelStep()) {
        this.flush();
        await sleep(this.timing.travelDelayMs);
        if (epoch !== this.epoch) return;
      }
      this.flush();
      await this.pump();
    });
  }

  /** Run monster turns until a hero is up, then hand story beats to the narrator. */
  private async pump() {
    const g = this.game;
    this.narrateLater(g.takeBeats());
    while (g.isMonsterTurn()) {
      const block = g.monsterBlock();
      const epoch = this.epoch;
      this.dmBusy++;
      this.flush();
      try {
        await this.narration; // let the scene-setting land before the monsters move
        if (epoch !== this.epoch) return;
        const text = await this.dm.runMonsters(g, block, this.monsterActor(epoch));
        if (epoch !== this.epoch) return;
        if (text) g.log('dm', text);
        g.finishMonsterBlock(block);
      } finally {
        this.dmBusy--;
        this.flush();
      }
      this.narrateLater(g.takeBeats());
    }
  }

  /** Plays a monster's turn for the Dungeon Master, pausing while a player decides on an opportunity attack. */
  private monsterActor(epoch: number): MonsterActor {
    const g = this.game;
    return async (id, intent) => {
      let result = g.monsterAct(id, intent);
      while (result.waiting && g.reactionPrompt() && epoch === this.epoch && !this.closed) {
        this.flush();
        const take = await this.waitForReaction();
        if (epoch !== this.epoch || this.closed) break;
        const next = g.resumeMonster(take);
        if (!next) break;
        result = next;
      }
      this.flush();
      await sleep(this.timing.actionDelayMs);
      return result;
    };
  }

  /** Resolves when the player answers, leaves, or the time runs out (then the hero strikes). */
  private waitForReaction(): Promise<boolean> {
    const prompt = this.game.reactionPrompt();
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => settle(true), Math.max(0, (prompt?.until ?? 0) - Date.now()));
      timer.unref?.();
      const settle = (take: boolean) => {
        clearTimeout(timer);
        if (this.reactionWaiter === settle) this.reactionWaiter = null;
        resolve(take);
      };
      this.reactionWaiter = settle;
    });
  }

  private background(fn: () => Promise<void>) {
    const epoch = this.epoch;
    this.narration = this.narration
      .then(async () => {
        if (epoch !== this.epoch) return;
        this.dmBusy++;
        this.flush();
        try {
          await fn();
        } finally {
          this.dmBusy--;
          this.flush();
        }
        // The DM may have started a fight or caused new beats.
        this.enqueue(() => this.pump());
      })
      .catch((err) => console.error('[room] narration failed:', err));
  }

  private narrateLater(beats: Beat[]) {
    if (!beats.length) return;
    const epoch = this.epoch;
    this.background(async () => {
      const scene = await this.dm.narrate(this.game, beats, async () => this.flush());
      if (scene && epoch === this.epoch) this.game.addScene(scene);
    });
  }

  // ------------------------------------------------------- talking to the DM

  /** Something said in character or tried in the story. It is shown at once and answered by the Dungeon Master. */
  private say(ws: WebSocket, playerId: string, raw: string, ooc: boolean) {
    const text = raw.trim().slice(0, 500);
    if (!text) return;
    const question = ooc ? parseOoc(text) ?? text : parseOoc(text);
    if (question) return this.ask(ws, playerId, question);
    const name = this.game.player(playerId)?.name ?? 'Adventurer';
    this.game.log('chat', text, { speaker: name });
    this.setTyping(playerId, null);
    if (this.game.s.phase !== 'lobby') this.pending.push({ playerId, player: name, text, logId: this.game.s.logSeq });
    this.considerAnswer();
    this.flush();
  }

  /**
   * A question to the Dungeon Master from outside the story. It is shown to the whole table, answered as a plain
   * note, and never joins the players' turn: it opens no waiting window and uses no turn.
   */
  private ask(ws: WebSocket, playerId: string, question: string) {
    if (this.game.s.phase === 'lobby') return this.send(ws, { t: 'error', message: tagged(this.game.lang)`Questions to the Dungeon Master open once the adventure has begun.` });
    const name = this.game.player(playerId)?.name ?? 'Adventurer';
    this.game.log('ask', question, { speaker: name });
    this.setTyping(playerId, null);
    this.flush();
    const epoch = this.epoch;
    this.background(async () => {
      const note = await this.dm.answerQuestion?.(this.game, { player: name, text: question }, async () => this.flush());
      if (note && epoch === this.epoch) this.game.log('note', note, { speaker: name });
    });
  }

  /** Take back the player's latest line, as long as the Dungeon Master has not started to answer it. */
  private unsay(ws: WebSocket, playerId: string) {
    const at = this.pending.map((l) => (l.director ? '' : l.playerId)).lastIndexOf(playerId);
    if (at < 0) {
      return this.send(ws, { t: 'error', message: tagged(this.game.lang)`Too late: the Dungeon Master is already answering.` });
    }
    const [line] = this.pending.splice(at, 1);
    this.game.retract(line.logId);
    if (!this.pending.length) {
      if (this.gatherTimer) clearTimeout(this.gatherTimer);
      this.gatherTimer = null;
      this.graceOnly = false;
    }
    this.flush();
  }

  /** Connected players with a hero who can still act, and who have not said anything since the last reply. */
  private stillToAct(): string[] {
    const s = this.game.s;
    const spoke = new Set(this.pending.map((l) => l.playerId));
    return s.players
      .filter((p) => p.connected && !spoke.has(p.id) && s.characters.some((c) => c.ownerId === p.id && !c.dead))
      .map((p) => p.id);
  }

  /**
   * Turn-taking in the story. Alone, or in a fight, the Dungeon Master answers at once. With
   * several players exploring, the first action opens a short window: the reply comes as soon as
   * everyone has acted, or when the window closes, and it resolves all of it together. Somebody
   * still typing keeps the window open a little longer.
   */
  private considerAnswer() {
    if (this.closed || !this.pending.length || this.answering) return;
    const waitFor = this.game.s.phase === 'explore' && this.timing.turnWaitMs > 0 ? this.stillToAct() : [];
    if (!waitFor.length && !(this.timing.undoGraceMs > 0 && this.game.s.phase === 'explore')) return this.answer();
    if (this.gatherTimer) return;
    if (!waitFor.length) {
      // Nobody else to wait for: only a moment in which the player may still change their mind.
      this.graceOnly = true;
      this.gatherTimer = setTimeout(() => { this.gatherTimer = null; this.answer(); }, this.timing.undoGraceMs);
      this.gatherTimer.unref?.();
      return;
    }
    this.graceOnly = false;
    this.gatherStart = Date.now();
    const arm = (ms: number) => {
      this.gatherTimer = setTimeout(() => {
        this.gatherTimer = null;
        const now = Date.now();
        const writing = this.stillToAct().some((id) => {
          const t = this.typing.get(id);
          return t?.where === 'story' && now - t.at < TYPING_MS;
        });
        if (writing && now - this.gatherStart < this.timing.turnWaitMaxMs) arm(Math.min(2000, this.timing.turnWaitMs));
        else this.answer();
      }, ms);
      this.gatherTimer.unref?.();
    };
    arm(this.timing.turnWaitMs);
  }

  private answer() {
    if (this.gatherTimer) clearTimeout(this.gatherTimer);
    this.gatherTimer = null;
    this.graceOnly = false;
    if (!this.pending.length || this.answering) return;
    const run = (this.answering = ++this.answerSeq);
    const epoch = this.epoch;
    this.background(async () => {
      // Taken only now, so anything said while an earlier scene was being written is included.
      const said = this.pending.splice(0).map(({ player, text, director }) => ({ player, text, ...(director ? { director } : {}) }));
      try {
        if (!said.length) return;
        const scene = await this.dm.respond(this.game, said, async () => this.flush());
        if (scene && epoch === this.epoch) {
          this.game.addScene(scene);
          this.flush();
          // The players read the scene while the game catches up with anything it narrated.
          await this.dm.reconcile?.(this.game, async () => { if (epoch === this.epoch) this.flush(); });
        }
        void this.dm.maintain(this.game);
      } finally {
        if (this.answering === run) this.answering = 0;
        // Whatever arrived during the writing gets the next reply.
        this.considerAnswer();
      }
    });
  }

  // ---------------------------------------------------------------- test mode

  /** The host's toolbox at a table in test mode. */
  private testAction(ws: WebSocket, playerId: string, action: TestAction) {
    const g = this.game;
    if (!g.s.testMode) return this.send(ws, { t: 'error', message: tagged(g.lang)`Test mode is off at this table.` });
    if (!action || typeof action !== 'object') return;
    if (!this.attempt(ws, () => g.requireHost(playerId))) return;
    if (action.op === 'catalog') return this.send(ws, { t: 'test_catalog', monsters: monsterCatalog(g) });
    this.enqueue(async () => {
      if (this.closed) return;
      let hint: string | undefined;
      if (!this.attempt(ws, () => { hint = playtest(g, action)?.hint; })) return;
      // The hint reaches the Dungeon Master at once, whoever else is at the table, and never shows in the story.
      if (hint) this.pending.push({ playerId, player: 'Test mode', text: hint, director: true, logId: g.s.logSeq });
      this.flush();
      if (hint) this.answer();
      await this.pump();
    });
  }

  /**
   * The owner switches test mode on or off. On, the table is saved as it stands. Off, the campaign either
   * keeps what the tests did or goes back to how it was before them.
   */
  setTestMode(on: boolean, keep = true) {
    const g = this.game;
    const s = g.s;
    if (on === !!s.testMode) return;
    if (on) {
      const { chat: _chat, testMode: _mode, ...rest } = s;
      s.testMode = { since: Date.now(), snapshot: JSON.stringify({ ...rest, chat: [] }) };
      g.log('system', tagged(g.lang)`Test mode is on. The host has a toolbox, and nothing counts unless the innkeeper keeps it.`);
    } else if (keep) {
      delete s.testMode;
      g.log('system', tagged(g.lang)`Test mode is over. The story carries on as it stands.`);
    } else {
      const snap = JSON.parse(s.testMode!.snapshot) as InternalState;
      // Seats, chat and the language belong to the table, not to the story, and stay as they are now.
      g.s = { ...snap, players: s.players, seats: s.seats, hostId: s.hostId, ready: s.ready, chat: s.chat, chatSeq: s.chatSeq, table: s.table, language: s.language };
      g.beats = [];
      g.moves = [];
      this.epoch++;
      this.reactionWaiter?.(false);
      this.pending = [];
      this.answering = 0;
      this.graceOnly = false;
      if (this.gatherTimer) clearTimeout(this.gatherTimer);
      this.gatherTimer = null;
      g.log('system', tagged(g.lang)`Test mode is over. The story is back to how it was before the tests.`);
    }
    this.flush();
  }

  // -------------------------------------------------------------- table talk

  /** Out-of-character chat between the players. The Dungeon Master never reads it. */
  private chat(ws: WebSocket, playerId: string, text: string, to?: string) {
    let msg: ChatMessage | undefined;
    if (!this.attempt(ws, () => { msg = this.game.addChat(playerId, text, to); }) || !msg) return;
    this.setTyping(playerId, null);
    for (const [sock, id] of this.sockets) {
      if (!msg.to || id === msg.to || id === msg.from) this.send(sock, { t: 'chat', messages: [msg] });
    }
    this.saveSoon();
  }

  private setTyping(playerId: string, where: TypingWhere | null) {
    const before = this.typing.get(playerId);
    if (where) this.typing.set(playerId, { where, at: Date.now() });
    else this.typing.delete(playerId);
    if (!where && !before) return;
    for (const [sock, id] of this.sockets) if (id !== playerId) this.send(sock, { t: 'typing', playerId, where });
  }
}
