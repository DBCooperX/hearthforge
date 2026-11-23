// Seats, hosts, the ready check, table talk and turn-taking: everything that makes several players one table.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { JOIN_ERRORS, type ServerMessage } from '../../shared/types';
import type { Store } from '../src/db';
import { describeWorld } from '../src/dm/context';
import { ScriptedDM } from '../src/dm/scripted';
import type { PlayerLine } from '../src/dm/types';
import { Game, GameError, JoinError } from '../src/game/engine';
import { Room, type RoomHooks, type RoomTiming } from '../src/room';

function table() {
  const g = new Game('test', () => 0.42);
  g.seat('chris', 'key-chris', 'Chris');
  return g;
}

describe('seats', () => {
  it('refuses a second player with a name already at the table', () => {
    const g = table();
    expect(() => g.seat('other', 'key-other', 'Chris')).toThrow(JOIN_ERRORS.nameTaken);
    expect(() => g.seat('other', 'key-other', '  chris ')).toThrow(JoinError);
    expect(() => g.seat('other', 'key-other', '')).toThrow(JOIN_ERRORS.noName);
    g.seat('other', 'key-other', 'Mira');
    expect(g.s.players.map((p) => p.name)).toEqual(['Chris', 'Mira']);
  });

  it('gives a seat back only to the browser that holds its token', () => {
    const g = table();
    const hero = g.addCharacter('chris', 'fighter', '');
    g.setConnected('chris', false);
    expect(() => g.seat('chris', 'someone-else', 'Chris')).toThrow(JOIN_ERRORS.seatTaken);
    g.seat('chris', 'key-chris', 'Chris');
    expect(g.player('chris')?.connected).toBe(true);
    expect(g.s.characters[0]).toMatchObject({ id: hero.id, ownerId: 'chris' });
    expect(g.s.players).toHaveLength(1);
  });

  it('keeps the old name when a returning player asks for one that is taken', () => {
    const g = table();
    g.seat('mira', 'key-mira', 'Mira');
    g.seat('mira', 'key-mira', 'Chris');
    expect(g.player('mira')?.name).toBe('Mira');
    g.seat('mira', 'key-mira', 'Mirabel');
    expect(g.player('mira')?.name).toBe('Mirabel');
  });

  it('honours the seat limit and the invite code, but never for someone already seated', () => {
    const g = table();
    g.s.table = { ...g.s.table, title: 'Friday', maxPlayers: 2, code: 'ABC23' };
    expect(() => g.seat('mira', 'k', 'Mira')).toThrow(JOIN_ERRORS.wrongCode);
    expect(() => g.seat('mira', 'k', 'Mira', 'nope')).toThrow(JOIN_ERRORS.wrongCode);
    g.seat('mira', 'k', 'Mira', ' abc23 ');
    expect(() => g.seat('tom', 'k2', 'Tom', 'ABC23')).toThrow(JOIN_ERRORS.full);
    g.setConnected('mira', false);
    g.seat('mira', 'k', 'Mira'); // back without the code
    expect(g.player('mira')?.connected).toBe(true);
  });

  it('adopts players from saves made before seats had tokens', () => {
    const old = new Game('test', () => 0.42);
    old.upsertPlayer('chris', 'Chris', true);
    old.addCharacter('chris', 'fighter', '');
    const saved = JSON.parse(JSON.stringify(old.s));
    for (const k of ['table', 'hostId', 'seats', 'ready', 'chat', 'chatSeq']) delete saved[k];
    const g = new Game('test', () => 0.42, saved);
    expect(g.s.hostId).toBe('chris');
    expect(g.s.table).toMatchObject({ title: 'test', maxPlayers: 4, code: null });
    g.seat('chris', 'first-token-wins', 'Chris');
    expect(() => g.seat('chris', 'another', 'Chris')).toThrow(JOIN_ERRORS.seatTaken);
  });

  it('never shows tokens or whispers in the public state', () => {
    const g = table();
    g.seat('mira', 'key-mira', 'Mira');
    g.addChat('chris', 'psst', 'mira');
    const pub = JSON.stringify(g.publicState({ busy: false, mode: 'scripted', model: null }));
    expect(pub).not.toContain('key-chris');
    expect(pub).not.toContain('psst');
  });
});

describe('host and ready check', () => {
  it('lets only the host begin, change the language, remove players and start over', () => {
    const g = table();
    g.seat('mira', 'k', 'Mira');
    g.addCharacter('chris', 'fighter', '');
    g.addCharacter('mira', 'cleric', '');
    expect(() => g.start('mira')).toThrow(GameError);
    expect(() => g.setLanguage('mira', 'de')).toThrow(GameError);
    expect(() => g.kick('mira', 'chris')).toThrow(GameError);
    expect(() => g.kick('chris', 'chris')).toThrow(GameError);
    g.start('chris');
    expect(g.s.phase).toBe('explore');
    expect(() => g.reset('mira')).toThrow(GameError);
    g.reset('chris');
    expect(g.s.phase).toBe('lobby');
    expect(g.s.players).toHaveLength(2);
    expect(g.s.seats.mira).toBe('k');
  });

  it('tracks who is ready, and a changed party is not ready any more', () => {
    const g = table();
    g.seat('mira', 'k', 'Mira');
    expect(() => g.setReady('mira', true)).toThrow(GameError); // no hero yet
    const hero = g.addCharacter('mira', 'cleric', '');
    g.setReady('mira', true);
    expect(g.publicState({ busy: false, mode: 'scripted', model: null }).ready).toEqual(['mira']);
    g.removeCharacter('mira', hero.id);
    expect(g.s.ready).toEqual([]);
  });

  it('removes a kicked player with their heroes before the adventure, and hands the heroes to the host after', () => {
    const g = table();
    g.seat('mira', 'k', 'Mira');
    g.seat('tom', 'k2', 'Tom');
    g.addCharacter('chris', 'fighter', '');
    g.addCharacter('mira', 'cleric', '');
    const toms = g.addCharacter('tom', 'rogue', '');
    g.kick('chris', 'mira');
    expect(g.s.characters.map((c) => c.ownerId)).toEqual(['chris', 'tom']);
    expect(g.s.seats.mira).toBeUndefined();
    g.start('chris');
    g.kick('chris', 'tom');
    expect(g.char(toms.id).ownerId).toBe('chris');
    expect(g.s.log.map((l) => l.text).join('\n')).toContain('Tom has left the table.');
  });

  it('passes the table to the next connected player when the host is gone', () => {
    const g = table();
    g.seat('mira', 'k', 'Mira');
    g.seat('tom', 'k2', 'Tom');
    expect(g.handOverHost()).toBe(false); // the host is here
    g.setConnected('chris', false);
    g.setConnected('mira', false);
    expect(g.handOverHost()).toBe(true);
    expect(g.s.hostId).toBe('tom');
    g.makeHost('tom', 'chris');
    expect(g.s.hostId).toBe('chris');
    g.unseat('chris');
    expect(g.s.hostId).toBe('tom');
  });
});

describe('players who are away', () => {
  it('lets anyone play an away player\'s hero in a fight, and nobody else\'s', () => {
    const g = table();
    g.seat('mira', 'k', 'Mira');
    g.addCharacter('chris', 'fighter', '');
    const cleric = g.addCharacter('mira', 'cleric', '');
    g.start('chris');
    expect(g.mayControl('chris', cleric)).toBe(false);
    g.setConnected('mira', false);
    expect(g.mayControl('chris', cleric)).toBe(true);
    expect(describeWorld(g)).toMatch(/Played by Mira, who is AWAY/);
    expect(describeWorld(g)).toContain('Played by Chris.');
  });

  it('does not mention players to the Dungeon Master at a solo table', () => {
    const g = table();
    g.addCharacter('chris', 'fighter', '');
    g.start('chris');
    expect(describeWorld(g)).not.toContain('Played by');
  });
});

describe('table talk', () => {
  it('shows a whisper only to the two players it concerns', () => {
    const g = table();
    g.seat('mira', 'k', 'Mira');
    g.seat('tom', 'k2', 'Tom');
    g.addChat('chris', 'Pizza at eight?');
    g.addChat('chris', 'Do not trust the rogue', 'mira');
    expect(g.chatFor('mira').map((m) => m.text)).toEqual(['Pizza at eight?', 'Do not trust the rogue']);
    expect(g.chatFor('tom').map((m) => m.text)).toEqual(['Pizza at eight?']);
    expect(g.chatFor('chris')[1]).toMatchObject({ to: 'mira', toName: 'Mira', name: 'Chris' });
    expect(() => g.addChat('chris', 'hello', 'nobody')).toThrow(GameError);
    expect(() => g.addChat('chris', '   ')).toThrow(GameError);
    // Table talk is not part of the story the Dungeon Master reads.
    expect(g.s.log).toHaveLength(0);
  });
});

// ------------------------------------------------------------------ rooms

class FakeSocket {
  readonly OPEN = 1;
  readyState = 1;
  sent: ServerMessage[] = [];
  send(data: string) { this.sent.push(JSON.parse(data)); }
  of<T extends ServerMessage['t']>(t: T) { return this.sent.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t); }
  get state() { return this.of('state').at(-1)!.state; }
}
const sock = () => new FakeSocket();
const ws = (s: FakeSocket) => s as unknown as WebSocket;

class RecordingDM extends ScriptedDM {
  calls: PlayerLine[][] = [];
  async respond(game: Game, said: PlayerLine[]) {
    this.calls.push(said);
    return { title: 'Reply', mood: 'calm' as const, text: said.map((l) => l.player).join(' and '), actions: [] };
  }
}

/** Stands in for the SQLite store, which the test runner cannot load. */
class MemoryStore {
  saved = new Map<string, string>();
  load(room: string) { const raw = this.saved.get(room); return raw ? JSON.parse(raw) : undefined; }
  save(room: string, state: unknown) { this.saved.set(room, JSON.stringify(state)); }
  names() { return [...this.saved.keys()]; }
  delete(room: string) { this.saved.delete(room); }
  close() {}
}

function room(timing: Partial<RoomTiming> = {}, hooks: RoomHooks = {}) {
  const store = new MemoryStore() as unknown as Store;
  const dm = new RecordingDM();
  const r = new Room('friday', dm, store, { actionDelayMs: 0, travelDelayMs: 0, turnWaitMs: 8000, hostGraceMs: 20000, readyWaitMs: 0, ...timing }, hooks);
  return { r, dm, store };
}

/** Two players, each with a hero, in the middle of an adventure. */
async function playing(timing: Partial<RoomTiming> = {}, hooks: RoomHooks = {}) {
  const t = room(timing, hooks);
  const chris = sock(), mira = sock();
  t.r.join(ws(chris), 'chris', 'token-chris-0123456789', 'Chris');
  t.r.join(ws(mira), 'mira', 'token-mira-0123456789', 'Mira');
  t.r.handle(ws(chris), { t: 'add_character', classId: 'fighter', name: '' });
  t.r.handle(ws(mira), { t: 'add_character', classId: 'cleric', name: '' });
  t.r.handle(ws(chris), { t: 'start' });
  await vi.advanceTimersByTimeAsync(50);
  return { ...t, chris, mira };
}

describe('a table with several players', () => {
  afterEach(() => vi.useRealTimers());

  it('turns away a second connection that uses a name already at the table', () => {
    const { r } = room();
    r.join(ws(sock()), 'chris', 'token-chris-0123456789', 'Chris');
    expect(() => r.join(ws(sock()), 'impostor', 'token-other-0123456789', 'Chris')).toThrow(JOIN_ERRORS.nameTaken);
    expect(() => r.join(ws(sock()), 'chris', 'a-stolen-id-wrong-token', 'Chris')).toThrow(JOIN_ERRORS.seatTaken);
    expect(r.summary().players).toHaveLength(1);
  });

  it('waits for everyone and resolves their actions in one reply', async () => {
    vi.useFakeTimers();
    const { r, dm, chris, mira } = await playing();
    r.handle(ws(chris), { t: 'say', text: 'I ask the innkeeper for rumours' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(dm.calls).toHaveLength(0);
    expect(mira.state.gathering).toBe(true);
    r.handle(ws(mira), { t: 'say', text: 'I watch the door' });
    await vi.advanceTimersByTimeAsync(10);
    expect(dm.calls).toEqual([[{ player: 'Chris', text: 'I ask the innkeeper for rumours' }, { player: 'Mira', text: 'I watch the door' }]]);
    expect(chris.state.gathering).toBe(false);
    expect(chris.state.log.at(-1)).toMatchObject({ kind: 'dm', text: 'Chris and Mira' });
  });

  it('answers when the window closes, and keeps it open while someone is still typing', async () => {
    vi.useFakeTimers();
    const { r, dm, chris, mira } = await playing();
    r.handle(ws(chris), { t: 'say', text: 'I go upstairs' });
    await vi.advanceTimersByTimeAsync(7000);
    r.handle(ws(mira), { t: 'typing', where: 'story' });
    expect(chris.of('typing').at(-1)).toEqual({ t: 'typing', playerId: 'mira', where: 'story' });
    await vi.advanceTimersByTimeAsync(1500);
    expect(dm.calls).toHaveLength(0); // 8.5 s in, but Mira is writing
    r.handle(ws(mira), { t: 'say', text: 'I follow' });
    await vi.advanceTimersByTimeAsync(10);
    expect(dm.calls).toHaveLength(1);
    expect(dm.calls[0]).toHaveLength(2);

    r.handle(ws(mira), { t: 'say', text: 'I knock' });
    await vi.advanceTimersByTimeAsync(8100);
    expect(dm.calls[1]).toEqual([{ player: 'Mira', text: 'I knock' }]); // Chris said nothing in time
  });

  it('does not wait for a player who is away, or at a solo table', async () => {
    vi.useFakeTimers();
    const { r, dm, chris, mira } = await playing();
    r.leave(ws(mira));
    expect(chris.state.players.find((p) => p.id === 'mira')?.connected).toBe(false);
    r.handle(ws(chris), { t: 'say', text: 'I look around' });
    await vi.advanceTimersByTimeAsync(10);
    expect(dm.calls).toHaveLength(1);
  });

  it('lets a player take back a line before the Dungeon Master has begun to answer it', async () => {
    vi.useFakeTimers();
    const { r, dm, chris, mira } = await playing();
    r.handle(ws(chris), { t: 'say', text: 'I smash the barrel' });
    expect(chris.state.unanswered).toEqual([{ logId: chris.state.log.at(-1)!.id, playerId: 'chris' }]);
    r.handle(ws(mira), { t: 'unsay' }); // nothing of hers to take back
    expect(mira.of('error').at(-1)?.message).toMatch(/Too late/);
    r.handle(ws(chris), { t: 'unsay' });
    expect(chris.state.log.some((l) => l.text === 'I smash the barrel')).toBe(false);
    expect(chris.state.unanswered).toEqual([]);
    expect(chris.state.gathering).toBe(false);
    r.handle(ws(mira), { t: 'say', text: 'I watch the door' });
    await vi.advanceTimersByTimeAsync(9000);
    expect(dm.calls).toEqual([[{ player: 'Mira', text: 'I watch the door' }]]);
    expect(chris.state.trophies.find((x) => x.id === 'second_thoughts')?.day).toBe(1);
    r.handle(ws(mira), { t: 'unsay' }); // answered by now
    expect(mira.of('error').at(-1)?.message).toMatch(/Too late/);
  });

  it('gives a lone player a short moment to change their mind', async () => {
    vi.useFakeTimers();
    const { r, dm, chris, mira } = await playing({ undoGraceMs: 3000 });
    r.leave(ws(mira));
    r.handle(ws(chris), { t: 'say', text: 'I open the door' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(dm.calls).toHaveLength(0);
    expect(chris.state.gathering).toBe(false); // only the grace, not a wait for the others
    expect(chris.state.unanswered).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1100);
    expect(dm.calls).toHaveLength(1);
    expect(chris.state.unanswered).toEqual([]);
  });

  it('keeps table talk away from the Dungeon Master and whispers away from everyone else', async () => {
    vi.useFakeTimers();
    const { r, dm, chris, mira } = await playing();
    const tom = sock();
    r.join(ws(tom), 'tom', 'token-tom-0123456789', 'Tom');
    r.handle(ws(chris), { t: 'chat', text: 'brb, tea' });
    r.handle(ws(chris), { t: 'chat', text: 'Tom is the traitor', to: 'mira' });
    await vi.advanceTimersByTimeAsync(10);
    const texts = (s: FakeSocket) => s.of('chat').flatMap((m) => m.messages.map((x) => x.text));
    expect(texts(mira)).toEqual(['brb, tea', 'Tom is the traitor']);
    expect(texts(tom)).toEqual(['brb, tea']);
    expect(texts(chris)).toEqual(['brb, tea', 'Tom is the traitor']);
    expect(dm.calls).toHaveLength(0);
    expect(JSON.stringify(tom.sent)).not.toContain('traitor');
    // A player who comes back gets the talk they are allowed to read.
    const again = sock();
    r.join(ws(again), 'mira', 'token-mira-0123456789', 'Mira');
    expect(again.of('chat')[0]).toMatchObject({ replace: true });
    expect(texts(again)).toEqual(['brb, tea', 'Tom is the traitor']);
  });

  it('hands the table over after the host has been gone for a while, not on a quick reload', async () => {
    vi.useFakeTimers();
    const { r, chris, mira } = await playing();
    r.leave(ws(chris));
    await vi.advanceTimersByTimeAsync(5000);
    const back = sock();
    r.join(ws(back), 'chris', 'token-chris-0123456789', 'Chris');
    await vi.advanceTimersByTimeAsync(30000);
    expect(mira.state.hostId).toBe('chris');
    r.leave(ws(back));
    await vi.advanceTimersByTimeAsync(21000);
    expect(mira.state.hostId).toBe('mira');
    expect(mira.state.log.map((l) => l.text)).toContain('Mira is now the host of this table.');
  });

  it('sends a removed player back to the lobby and frees the seat', async () => {
    vi.useFakeTimers();
    const detached: unknown[] = [];
    const { r, chris, mira } = await playing({}, { detached: (s) => detached.push(s) });
    r.handle(ws(mira), { t: 'kick', playerId: 'chris' });
    expect(mira.of('error')).toHaveLength(1); // only the host may
    r.handle(ws(chris), { t: 'kick', playerId: 'mira' });
    expect(mira.of('left')).toEqual([{ t: 'left', reason: 'kicked' }]);
    expect(detached).toEqual([mira]);
    expect(chris.state.players.map((p) => p.name)).toEqual(['Chris']);
    expect(chris.state.characters.every((c) => c.ownerId === 'chris')).toBe(true);
  });

  it('drops a table that everybody left before playing', () => {
    const closed: string[] = [];
    const { r, store } = room({}, { closed: (x) => closed.push(x.name) });
    const chris = sock(), mira = sock();
    r.join(ws(chris), 'chris', 'token-chris-0123456789', 'Chris');
    r.join(ws(mira), 'mira', 'token-mira-0123456789', 'Mira');
    r.saveNow();
    expect(store.names()).toEqual(['friday']);
    r.handle(ws(mira), { t: 'leave_table' });
    expect(mira.of('left')).toEqual([{ t: 'left', reason: 'left' }]);
    expect(chris.state.players).toHaveLength(1);
    r.handle(ws(chris), { t: 'leave_table' });
    expect(closed).toEqual(['friday']);
    expect(store.names()).toEqual([]);
  });

  it('gives a table an invite code on request', () => {
    const { r } = room({}, { newCode: () => 'QW3RT' });
    const chris = sock();
    r.join(ws(chris), 'chris', 'token-chris-0123456789', 'Chris');
    r.handle(ws(chris), { t: 'set_code', locked: true });
    expect(chris.state.table.code).toBe('QW3RT');
    expect(r.summary().locked).toBe(true);
    expect(() => r.join(ws(sock()), 'mira', 'token-mira-0123456789', 'Mira')).toThrow(JOIN_ERRORS.wrongCode);
    r.handle(ws(chris), { t: 'set_code', locked: false });
    expect(chris.state.table.code).toBeNull();
  });
});

describe('opportunity attacks at a live table', () => {
  afterEach(() => vi.useRealTimers());

  /** Brann stands next to a bandit that will walk away from him on its turn, which comes right after his. */
  async function standoff() {
    vi.useFakeTimers();
    const t = await playing({ reactionWaitMs: 20000 });
    const g = t.r.game;
    // Monsters back away, so they leave Brann's reach.
    (t.dm as any).runMonsters = async (_game: Game, block: { id: string }[], act: (id: string, intent: object) => Promise<unknown>) => {
      for (const m of block) await act(m.id, { tactic: 'retreat' });
      return null;
    };
    g.startEncounter([{ defId: 'bandit', count: 1 }], { source: 'story', context: 'test', light: 'bright' });
    g.takeBeats();
    g.s.rows = Array.from({ length: 13 }, (_, y) => (y === 0 || y === 12 ? '#'.repeat(22) : `#${'.'.repeat(20)}#`));
    const [brann, maeve] = g.s.characters;
    const bandit = g.s.monsters[0];
    brann.x = 5; brann.y = 6; maeve.x = 2; maeve.y = 2; bandit.x = 6; bandit.y = 6;
    const combat = g.s.combat!;
    combat.order = [{ id: brann.id, kind: 'pc', initiative: 20 }, { id: bandit.id, kind: 'monster', initiative: 10 }, { id: maeve.id, kind: 'pc', initiative: 5 }];
    combat.turnIndex = 0;
    t.r.handle(ws(t.chris), { t: 'end_turn', characterId: brann.id });
    await vi.advanceTimersByTimeAsync(10);
    return { ...t, g, brann, bandit };
  }

  it('waits for the hero\'s player, and only that player may answer', async () => {
    const { r, chris, mira, brann, bandit } = await standoff();
    expect(chris.state.combat?.reaction).toMatchObject({ heroId: brann.id, monsterId: bandit.id });
    expect(mira.state.combat?.reaction?.heroId).toBe(brann.id); // everyone sees who is deciding
    r.handle(ws(mira), { t: 'reaction', characterId: brann.id, take: true });
    expect(mira.of('error').at(-1)?.message).toMatch(/another player/);
    r.handle(ws(chris), { t: 'reaction', characterId: brann.id, take: true });
    await vi.advanceTimersByTimeAsync(10);
    expect(chris.state.combat?.reaction ?? null).toBeNull();
    expect(chris.state.log.some((l) => l.text.startsWith('Opportunity attack! Brann attacks'))).toBe(true);
  });

  it('strikes for a player who does not answer in time', async () => {
    const { chris } = await standoff();
    expect(chris.state.combat?.reaction).toBeTruthy();
    await vi.advanceTimersByTimeAsync(20500);
    expect(chris.state.combat?.reaction ?? null).toBeNull();
    expect(chris.state.log.some((l) => l.text.startsWith('Opportunity attack! Brann attacks'))).toBe(true);
  });

  it('lets a player choose to always strike or never, without asking again', async () => {
    const { r, chris, mira, brann } = await standoff();
    r.handle(ws(chris), { t: 'set_opportunity', characterId: brann.id, mode: 'never' });
    expect(chris.state.characters.find((c) => c.id === brann.id)?.opportunity).toBe('never');
    r.handle(ws(mira), { t: 'set_opportunity', characterId: brann.id, mode: 'always' });
    expect(mira.of('error').at(-1)?.message).toMatch(/another player/);
    r.handle(ws(chris), { t: 'reaction', characterId: brann.id, take: false });
    await vi.advanceTimersByTimeAsync(10);
    expect(chris.state.log.some((l) => l.text === 'Brann lets Bandit go.')).toBe(true);
  });
});

describe('getting ready for a fight', () => {
  afterEach(() => vi.useRealTimers());

  async function ambushed() {
    vi.useFakeTimers();
    const t = await playing({ readyWaitMs: 30000 });
    const g = t.r.game;
    let moved = 0;
    (t.dm as any).runMonsters = async () => { moved++; return null; };
    g.startEncounter([{ defId: 'bandit', count: 2 }], { source: 'story', context: 'test', light: 'bright', why: 'Your sneaking failed: the bandits draw their blades.' });
    g.takeBeats();
    const [brann, maeve] = g.s.characters;
    const bandits = g.s.monsters.map((m) => ({ id: m.id, kind: 'monster' as const, initiative: 20 }));
    g.s.combat!.order = [...bandits, { id: brann.id, kind: 'pc', initiative: 10 }, { id: maeve.id, kind: 'pc', initiative: 5 }];
    g.s.combat!.turnIndex = 0;
    (t.r as any).enqueue(() => (t.r as any).pump());
    await vi.advanceTimersByTimeAsync(10);
    return { ...t, g, moved: () => moved };
  }

  it('shows why the fight starts and holds the monsters until every player is ready', async () => {
    const { r, chris, mira, moved } = await ambushed();
    expect(chris.state.combat?.ready).toMatchObject({ why: 'Your sneaking failed: the bandits draw their blades.', waiting: ['chris', 'mira'] });
    expect(moved()).toBe(0);
    r.handle(ws(chris), { t: 'battle_ready' });
    await vi.advanceTimersByTimeAsync(10);
    expect(mira.state.combat?.ready?.waiting).toEqual(['mira']);
    expect(moved()).toBe(0);
    r.handle(ws(mira), { t: 'battle_ready' });
    await vi.advanceTimersByTimeAsync(10);
    expect(chris.state.combat?.ready ?? null).toBeNull();
    expect(moved()).toBe(1);
  });

  it('starts anyway when the time is up, and never waits for a player who left', async () => {
    const { r, chris, mira, moved } = await ambushed();
    r.leave(ws(mira));
    await vi.advanceTimersByTimeAsync(10);
    expect(chris.state.combat?.ready?.waiting).toEqual(['chris']);
    await vi.advanceTimersByTimeAsync(30000);
    expect(chris.state.combat?.ready ?? null).toBeNull();
    expect(moved()).toBe(1);
  });
});
