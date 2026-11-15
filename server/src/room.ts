// A room is one shared adventure: a Game, its connected players and its Dungeon Master.
import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../../shared/types';
import type { Store } from './db';
import type { DungeonMaster } from './dm/types';
import { Game, GameError, type Beat } from './game/engine';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

  constructor(
    readonly name: string,
    private dm: DungeonMaster,
    private store: Store,
    private actionDelayMs = 500,
    private travelDelayMs = 320,
  ) {
    const saved = store.load(name);
    this.game = new Game(name, Math.random, saved);
    for (const p of this.game.s.players) p.connected = false;
    // A restart may have interrupted the monsters' turn.
    this.enqueue(() => this.pump());
  }

  get empty() { return this.sockets.size === 0; }

  join(ws: WebSocket, playerId: string, name: string) {
    this.sockets.set(ws, playerId);
    this.game.upsertPlayer(playerId, name.trim().slice(0, 24), true);
    this.flush();
  }

  leave(ws: WebSocket) {
    const id = this.sockets.get(ws);
    this.sockets.delete(ws);
    if (id && ![...this.sockets.values()].includes(id)) this.game.setConnected(id, false);
    this.flush();
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  /** Push pending movement animations and the latest state to everyone, then persist. */
  flush() {
    const moves = this.game.takeMoves();
    const state: ServerMessage = {
      t: 'state',
      state: this.game.publicState({ busy: this.dmBusy > 0, mode: this.dm.mode, model: this.dm.model }),
    };
    const payload = JSON.stringify(state);
    for (const ws of this.sockets.keys()) {
      for (const m of moves) this.send(ws, { t: 'moved', id: m.id, path: m.path });
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
    if (!this.saveTimer) {
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        this.saveNow();
      }, 400);
    }
  }

  saveNow() {
    try {
      this.store.save(this.name, this.game.s);
    } catch (err) {
      console.error('[store] save failed:', err);
    }
  }

  private enqueue(fn: () => Promise<void> | void) {
    this.queue = this.queue.then(fn).catch((err) => console.error('[room] action failed:', err));
  }

  handle(ws: WebSocket, msg: ClientMessage) {
    const playerId = this.sockets.get(ws);
    if (!playerId) return;
    if (msg.t === 'say') return this.say(playerId, String(msg.text ?? ''));
    if (msg.t === 'travel') return this.travel(ws, Math.round(Number(msg.q)), Math.round(Number(msg.r)));
    this.enqueue(async () => {
      try {
        this.apply(playerId, msg);
      } catch (err) {
        if (err instanceof GameError) this.send(ws, { t: 'error', message: err.message });
        else throw err;
      }
      this.flush();
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
      case 'start': return g.start();
      case 'move': return g.move(playerId, String(msg.characterId), Math.round(Number(msg.x)), Math.round(Number(msg.y)));
      case 'attack': return g.attack(playerId, String(msg.characterId), String(msg.targetId));
      case 'ability': return g.useAbility(playerId, String(msg.characterId), String(msg.abilityId), msg.targetId ? String(msg.targetId) : undefined);
      case 'use_item': return g.useItem(playerId, String(msg.characterId), String(msg.uid), msg.targetId ? String(msg.targetId) : undefined);
      case 'end_turn': return g.endTurn(playerId, String(msg.characterId));
      case 'inv_move': return g.invMove(playerId, String(msg.characterId), msg.from, msg.to);
      case 'give': return g.give(playerId, String(msg.characterId), msg.from, String(msg.toCharacterId));
      case 'short_rest': return g.shortRest();
      case 'long_rest': return g.longRest();
      case 'go': return g.goTo(String(msg.locationId));
      case 'delve': return g.delve();
      case 'set_language': return g.setLanguage(playerId, msg.lang);
      case 'reset':
        this.epoch++;
        return g.reset();
      default:
        throw new GameError('Unknown action');
    }
  }

  /** Walk the party across the map one hex at a time so everyone watches the journey unfold. */
  private travel(ws: WebSocket, q: number, r: number) {
    this.enqueue(async () => {
      const g = this.game;
      try {
        g.beginTravel(q, r);
      } catch (err) {
        if (err instanceof GameError) return this.send(ws, { t: 'error', message: err.message });
        throw err;
      }
      const epoch = this.epoch;
      this.flush();
      while (g.travelStep()) {
        this.flush();
        await sleep(this.travelDelayMs);
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
          await sleep(this.actionDelayMs);
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

  private say(playerId: string, raw: string) {
    const text = raw.trim().slice(0, 500);
    if (!text) return;
    const player = this.game.s.players.find((p) => p.id === playerId);
    const name = player?.name ?? 'Adventurer';
    this.game.log('chat', text, { speaker: name });
    this.flush();
    if (this.game.s.phase === 'lobby') return;
    const epoch = this.epoch;
    this.background(async () => {
      const scene = await this.dm.respond(this.game, name, text, async () => this.flush());
      if (scene && epoch === this.epoch) this.game.addScene(scene);
      void this.dm.maintain(this.game);
    });
  }
}
