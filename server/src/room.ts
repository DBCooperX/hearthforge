// A room is one table: a Game, the players sitting at it and its Dungeon Master.
import { createHash } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { ChatMessage, ClientMessage, ServerMessage, TableSummary, TypingWhere } from '../../shared/types';
import type { Store } from './db';
import type { DungeonMaster, PlayerLine } from './dm/types';
import { Game, GameError, type Beat } from './game/engine';
import { newSeed } from '../../shared/start';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

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
}

export const DEFAULT_TIMING: RoomTiming = { actionDelayMs: 500, travelDelayMs: 320, turnWaitMs: 8000, turnWaitMaxMs: 30000, hostGraceMs: 20000 };

export interface RoomHooks {
  /** What the lobby lists about this table changed. */
  changed?(room: Room): void;
  /** A socket was sent away from the table (left, removed by the host, table closed). */
  detached?(ws: WebSocket, room: Room): void;
  /** The table is gone for good. */
  closed?(room: Room): void;
  /** A fresh invite code no other table uses. */
  newCode?(): string;
  /** True while the Innkeeper has paused the table. */
  paused?(room: Room): boolean;
}

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
  private pending: (PlayerLine & { playerId: string })[] = [];
  private gatherTimer: NodeJS.Timeout | null = null;
  private gatherStart = 0;
  /** Non-zero while a reply to the players is queued or being written. */
  private answering = 0;
  private answerSeq = 0;

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
    for (const p of this.game.s.players) p.connected = false;
    // Every table has a world seed to show and share, also the ones saved before seeds existed.
    if (!this.game.s.table.start.seed) this.game.s.table.start.seed = newSeed();
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
      this.game.setConnected(id, false);
      this.setTyping(id, null);
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
    this.setTyping(playerId, null);
    this.pending = this.pending.filter((l) => l.playerId !== playerId);
  }

  /** Stop the table and send everyone back to the lobby, without touching what is saved. */
  private stop(reason: 'closed' | 'restored') {
    this.closed = true;
    this.epoch++;
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

  /** Remove the table and everything saved for it. */
  close() {
    this.stop('closed');
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

  private get gathering() { return this.pending.length > 0 && !this.answering; }

  /** Push pending movement animations and the latest state to everyone, then persist. */
  flush() {
    if (this.closed) return;
    const moves = this.game.takeMoves();
    const state: ServerMessage = {
      t: 'state',
      state: this.game.publicState({ busy: this.dmBusy > 0, mode: this.dm.mode, model: this.dm.model, gathering: this.gathering }),
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
    switch (msg.t) {
      case 'say': return this.say(playerId, String(msg.text ?? ''));
      case 'travel': return this.travel(ws, Math.round(Number(msg.q)), Math.round(Number(msg.r)));
      case 'chat': return this.chat(ws, playerId, String(msg.text ?? ''), msg.to ? String(msg.to) : undefined);
      case 'typing': return this.setTyping(playerId, msg.where === 'story' || msg.where === 'chat' ? msg.where : null);
      case 'leave_table': return this.quit(ws, playerId);
      case 'close_table':
        if (this.attempt(ws, () => g.requireHost(playerId))) this.close();
        return;
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
    }
    this.enqueue(async () => {
      if (this.closed) return;
      const began = this.attempt(ws, () => this.apply(playerId, msg)) && msg.t === 'start';
      this.flush();
      if (began) await this.prepareWorld();
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
      case 'ability': return g.useAbility(playerId, String(msg.characterId), String(msg.abilityId), msg.targetId ? String(msg.targetId) : undefined);
      case 'use_item': return g.useItem(playerId, String(msg.characterId), String(msg.uid), msg.targetId ? String(msg.targetId) : undefined);
      case 'end_turn': return g.endTurn(playerId, String(msg.characterId));
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
      case 'reset':
        g.reset(playerId);
        this.epoch++;
        this.pending = [];
        this.answering = 0;
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
        const text = await this.dm.runMonsters(g, block, async () => {
          this.flush();
          await sleep(this.timing.actionDelayMs);
        });
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
  private say(playerId: string, raw: string) {
    const text = raw.trim().slice(0, 500);
    if (!text) return;
    const name = this.game.player(playerId)?.name ?? 'Adventurer';
    this.game.log('chat', text, { speaker: name });
    this.setTyping(playerId, null);
    if (this.game.s.phase !== 'lobby') this.pending.push({ playerId, player: name, text });
    this.flush();
    this.considerAnswer();
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
    if (!waitFor.length) return this.answer();
    if (this.gatherTimer) return;
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
    if (!this.pending.length || this.answering) return;
    const run = (this.answering = ++this.answerSeq);
    const epoch = this.epoch;
    this.background(async () => {
      // Taken only now, so anything said while an earlier scene was being written is included.
      const said = this.pending.splice(0).map(({ player, text }) => ({ player, text }));
      try {
        if (!said.length) return;
        const scene = await this.dm.respond(this.game, said, async () => this.flush());
        if (scene && epoch === this.epoch) this.game.addScene(scene);
        void this.dm.maintain(this.game);
      } finally {
        if (this.answering === run) this.answering = 0;
        // Whatever arrived during the writing gets the next reply.
        this.considerAnswer();
      }
    });
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
