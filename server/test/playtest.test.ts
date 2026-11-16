// Test mode: the host's toolbox, the snapshot the owner can go back to, and the hint to the Dungeon Master.
import { describe, expect, it, vi, afterEach } from 'vitest';
import type { WebSocket } from 'ws';
import type { ServerMessage, TestAction } from '../../shared/types';
import type { Store } from '../src/db';
import { ScriptedDM } from '../src/dm/scripted';
import type { PlayerLine } from '../src/dm/types';
import { Game, GameError } from '../src/game/engine';
import { monsterCatalog, pickForBudget, playtest } from '../src/game/playtest';
import { Room } from '../src/room';

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function party(seed = 7) {
  const g = new Game('test', seeded(seed));
  g.upsertPlayer('p1', 'Tester', true);
  g.addPremade('p1', 'vex', '');
  g.addCharacter('p1', 'cleric', '');
  g.start();
  g.takeBeats();
  const [vex, cleric] = g.s.characters;
  return { g, vex, cleric };
}

describe('the toolbox', () => {
  it('starts a fight with the monsters picked', () => {
    const { g } = party();
    playtest(g, { op: 'fight', monsters: [{ id: 'goblin', count: 2 }, { id: 'ogre', count: 1 }] });
    expect(g.s.phase).toBe('combat');
    expect([...new Set(g.s.monsters.map((m) => m.defId))].sort()).toEqual(['goblin', 'ogre']);
    expect(() => playtest(g, { op: 'fight', monsters: [{ id: 'goblin', count: 1 }] })).toThrow(GameError);
  });

  it('refuses a monster it does not know', () => {
    const { g } = party();
    expect(() => playtest(g, { op: 'fight', monsters: [{ id: 'no-such-thing', count: 1 }] })).toThrow(/Unknown monster/);
    expect(g.s.phase).toBe('explore');
  });

  it('draws a group that fits a challenge budget', () => {
    const { g } = party();
    for (const budget of [0.5, 2, 5, 10]) {
      const groups = pickForBudget(g, budget);
      expect(groups.length).toBeGreaterThan(0);
      expect(groups.reduce((n, x) => n + x.count, 0)).toBeLessThanOrEqual(8);
    }
    expect(() => pickForBudget(g, 2, 'no-such-kind')).toThrow(GameError);
    playtest(g, { op: 'fight', budget: 3, kind: 'undead' });
    expect(g.s.phase).toBe('combat');
  });

  it('lets the heroes catch the enemies unawares, with a strike from hiding for one of them', () => {
    const { g, vex } = party();
    playtest(g, { op: 'fight', monsters: [{ id: 'ogre', count: 1 }], opening: 'surprise', heroId: vex.id });
    expect(g.s.combat?.surprise).toMatchObject({ side: 'enemies', opener: vex.id });
  });

  it('lets the enemies ambush the heroes', () => {
    const { g } = party();
    playtest(g, { op: 'fight', monsters: [{ id: 'wolf', count: 2 }], opening: 'ambush' });
    expect(g.s.combat?.surprise?.side).toBe('party');
  });

  it('levels a hero up, with the choices that come with it', () => {
    const { g, cleric } = party();
    const before = cleric.level;
    playtest(g, { op: 'level', characterId: cleric.id, levels: 2 });
    expect(cleric.level).toBe(before + 2);
    expect(cleric.xp).toBeGreaterThanOrEqual(900);
    expect(g.takeBeats().some((b) => b.kind === 'level_up')).toBe(true);
    playtest(g, { op: 'level', characterId: cleric.id, levels: 40 });
    expect(cleric.level).toBe(20);
    expect(() => playtest(g, { op: 'level', characterId: cleric.id })).toThrow(/highest level/);
  });

  it('shares experience and sets hit points, down to knocked out and back', () => {
    const { g, vex } = party();
    playtest(g, { op: 'xp', amount: 600 });
    expect(g.s.characters.every((c) => c.level >= 2)).toBe(true);
    playtest(g, { op: 'hp', characterId: vex.id, hp: 3 });
    expect(vex.hp).toBe(3);
    playtest(g, { op: 'hp', characterId: vex.id, hp: 0 });
    expect(vex.hp).toBe(0);
    expect(vex.conditions).toContain('unconscious');
    playtest(g, { op: 'hp', characterId: vex.id, hp: 999 });
    expect(vex.hp).toBe(vex.maxHp);
    expect(vex.conditions).not.toContain('unconscious');
    vex.dead = true;
    playtest(g, { op: 'revive', characterId: vex.id });
    expect(vex.dead).toBe(false);
  });

  it('puts conditions on a hero and lifts them', () => {
    const { g, vex } = party();
    playtest(g, { op: 'condition', characterId: vex.id, condition: 'poisoned', on: true });
    expect(vex.conditions).toContain('poisoned');
    playtest(g, { op: 'condition', characterId: vex.id, condition: 'poisoned', on: false });
    expect(vex.conditions).not.toContain('poisoned');
    expect(() => playtest(g, { op: 'condition', characterId: vex.id, condition: 'sparkly', on: true })).toThrow(GameError);
  });

  it('restores mana and class resources, and hands out items and gold', () => {
    const { g, cleric } = party();
    cleric.mana = 0;
    cleric.uses = { channel_divinity: 1 };
    playtest(g, { op: 'restore', characterId: cleric.id });
    expect(cleric.mana).toBe(cleric.maxMana);
    expect(cleric.uses).toEqual({});
    playtest(g, { op: 'item', characterId: cleric.id, itemId: 'potion_healing', qty: 2 });
    expect(cleric.bag.some((i) => i?.defId === 'potion_healing')).toBe(true);
    const gold = g.s.gold;
    playtest(g, { op: 'gold', amount: 250 });
    expect(g.s.gold).toBe(gold + 250);
    playtest(g, { op: 'gold', amount: -100000 });
    expect(g.s.gold).toBe(0);
  });

  it('jumps to a place, moves the clock and rests', () => {
    const { g } = party();
    const far = g.world.locations.find((l) => !sameHex(l, g.world.party) && !l.parentId)!;
    playtest(g, { op: 'jump', locationId: far.id });
    expect(g.world.party).toEqual({ q: far.q, r: far.r });
    expect(g.world.placeId).toBe(far.id);
    expect(far.discovered).toBe(true);
    playtest(g, { op: 'time', hour: 6 });
    expect(Math.floor(g.world.minutes / 60) % 24).toBe(6);
    const before = g.world.minutes;
    playtest(g, { op: 'rest', kind: 'long' });
    playtest(g, { op: 'rest', kind: 'long' });
    expect(g.world.minutes - before).toBe(16 * 60);
    playtest(g, { op: 'reveal' });
    expect(g.world.locations.every((l) => l.discovered)).toBe(true);
  });

  it('keeps the clock and the map shut during a fight', () => {
    const { g } = party();
    playtest(g, { op: 'fight', monsters: [{ id: 'goblin', count: 1 }] });
    for (const a of [{ op: 'time', minutes: 60 }, { op: 'rest', kind: 'short' }, { op: 'jump', locationId: 'x' }, { op: 'scene', text: 'hello' }] as TestAction[]) {
      expect(() => playtest(g, a)).toThrow(GameError);
    }
  });

  it('hands a scene hint back and refuses an empty one', () => {
    const { g } = party();
    expect(playtest(g, { op: 'scene', text: '  a merchant   appears ' })).toEqual({ hint: 'a merchant appears' });
    expect(() => playtest(g, { op: 'scene', text: '   ' })).toThrow(GameError);
  });

  it('lists every creature of the catalogue, weakest first', () => {
    const { g } = party();
    const all = monsterCatalog(g);
    expect(all.length).toBeGreaterThan(300);
    expect(all.find((m) => m.id === 'goblin')).toMatchObject({ name: 'Goblin', cr: '1/4', kind: 'humanoid' });
  });
});

const sameHex = (a: { q: number; r: number }, b: { q: number; r: number }) => a.q === b.q && a.r === b.r;

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
    return { title: 'Reply', mood: 'calm' as const, text: 'ok', actions: [] };
  }
}

class MemoryStore {
  saved = new Map<string, string>();
  load(room: string) { const raw = this.saved.get(room); return raw ? JSON.parse(raw) : undefined; }
  save(room: string, state: unknown) { this.saved.set(room, JSON.stringify(state)); }
  names() { return [...this.saved.keys()]; }
  delete(room: string) { this.saved.delete(room); }
  close() {}
}

async function playing() {
  const dm = new RecordingDM();
  const store = new MemoryStore() as unknown as Store;
  const r = new Room('friday', dm, store, { actionDelayMs: 0, travelDelayMs: 0, turnWaitMs: 8000, hostGraceMs: 20000 });
  const chris = sock(), mira = sock();
  r.join(ws(chris), 'chris', 'token-chris-0123456789', 'Chris');
  r.join(ws(mira), 'mira', 'token-mira-0123456789', 'Mira');
  r.handle(ws(chris), { t: 'add_character', classId: 'fighter', name: '' });
  r.handle(ws(mira), { t: 'add_character', classId: 'cleric', name: '' });
  r.handle(ws(chris), { t: 'start' });
  await vi.advanceTimersByTimeAsync(50);
  return { r, dm, chris, mira };
}

describe('a table in test mode', () => {
  afterEach(() => vi.useRealTimers());

  it('is off until the owner switches it on, and only the host may use it', async () => {
    vi.useFakeTimers();
    const { r, chris, mira } = await playing();
    expect(chris.state.testMode).toBeNull();
    r.handle(ws(chris), { t: 'test', do: { op: 'gold', amount: 50 } });
    await vi.advanceTimersByTimeAsync(10);
    expect(chris.of('error').at(-1)?.message).toMatch(/off at this table/);
    const gold = r.game.s.gold;
    r.setTestMode(true);
    expect(chris.state.testMode).not.toBeNull();
    expect(mira.state.testMode).not.toBeNull();
    r.handle(ws(mira), { t: 'test', do: { op: 'gold', amount: 50 } });
    await vi.advanceTimersByTimeAsync(10);
    expect(mira.of('error').at(-1)).toBeTruthy();
    expect(r.game.s.gold).toBe(gold);
    r.handle(ws(chris), { t: 'test', do: { op: 'gold', amount: 50 } });
    await vi.advanceTimersByTimeAsync(10);
    expect(r.game.s.gold).toBe(gold + 50);
  });

  it('answers a request for the catalogue to the host only', async () => {
    vi.useFakeTimers();
    const { r, chris, mira } = await playing();
    r.setTestMode(true);
    r.handle(ws(chris), { t: 'test', do: { op: 'catalog' } });
    expect(chris.of('test_catalog')[0].monsters.length).toBeGreaterThan(300);
    expect(mira.of('test_catalog')).toHaveLength(0);
  });

  it('sends a scene hint to the Dungeon Master at once, marked as a hint, and keeps it out of the story', async () => {
    vi.useFakeTimers();
    const { r, dm, chris } = await playing();
    r.setTestMode(true);
    r.handle(ws(chris), { t: 'test', do: { op: 'scene', text: 'A merchant appears' } });
    await vi.advanceTimersByTimeAsync(10);
    expect(dm.calls).toEqual([[{ player: 'Test mode', text: 'A merchant appears', director: true }]]);
    expect(chris.state.log.some((l) => l.text.includes('A merchant appears') && l.kind === 'chat')).toBe(false);
    expect(chris.state.unanswered).toEqual([]);
  });

  it('goes back to how the story was when the owner undoes the changes', async () => {
    vi.useFakeTimers();
    const { r, chris } = await playing();
    const start = { gold: r.game.s.gold, levels: r.game.s.characters.map((c) => c.level), minutes: r.game.world.minutes };
    r.setTestMode(true);
    r.handle(ws(chris), { t: 'test', do: { op: 'gold', amount: 500 } });
    r.handle(ws(chris), { t: 'test', do: { op: 'level', characterId: r.game.s.characters[0].id, levels: 3 } });
    r.handle(ws(chris), { t: 'test', do: { op: 'time', minutes: 600 } });
    r.handle(ws(chris), { t: 'chat', text: 'still here' });
    await vi.advanceTimersByTimeAsync(10);
    expect(r.game.s.gold).toBe(start.gold + 500);
    r.setTestMode(false, false);
    expect(r.game.s.gold).toBe(start.gold);
    expect(r.game.s.characters.map((c) => c.level)).toEqual(start.levels);
    expect(r.game.world.minutes).toBe(start.minutes);
    expect(r.game.s.testMode).toBeUndefined();
    expect(chris.state.testMode).toBeNull();
    // Seats stay as they are, and the table talk is not rolled back.
    expect(r.game.s.players.map((p) => p.id)).toEqual(['chris', 'mira']);
    expect(r.game.s.chat.map((m) => m.text)).toEqual(['still here']);
  });

  it('keeps what the tests did when the owner keeps the changes', async () => {
    vi.useFakeTimers();
    const { r, chris } = await playing();
    const gold = r.game.s.gold;
    r.setTestMode(true);
    r.handle(ws(chris), { t: 'test', do: { op: 'gold', amount: 500 } });
    await vi.advanceTimersByTimeAsync(10);
    r.setTestMode(false, true);
    expect(r.game.s.gold).toBe(gold + 500);
    expect(r.game.s.testMode).toBeUndefined();
  });

  it('survives a restart with its snapshot', async () => {
    vi.useFakeTimers();
    const { r } = await playing();
    r.setTestMode(true);
    r.saveNow();
    const saved = JSON.parse(JSON.stringify(r.game.s));
    const again = new Game('friday', () => 0.5, saved);
    expect(again.s.testMode?.snapshot).toBeTruthy();
    expect(again.publicState({ busy: false, mode: 'scripted', model: null }).testMode).not.toBeNull();
  });
});
