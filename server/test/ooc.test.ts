// Out-of-character questions: "to DM: ..." gets a plain note back, not a scene, and the story does not move on.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { parseOoc } from '../../shared/ooc';
import type { ServerMessage } from '../../shared/types';
import type { Store } from '../src/db';
import { ClaudeDM } from '../src/dm/claude';
import { transcript } from '../src/dm/context';
import { ScriptedDM } from '../src/dm/scripted';
import type { PlayerLine } from '../src/dm/types';
import { Game } from '../src/game/engine';
import { Room, type RoomTiming } from '../src/room';

/** A prompt as the model reads it, whether sent as one string or as cache-friendly blocks. */
const promptText = (c: any): string => (typeof c === 'string' ? c : c.map((b: any) => b.text ?? '').join(''));

describe('recognising a question to the DM', () => {
  it('strips the German and English labels, in any case', () => {
    for (const line of ['to DM: how many coins does Vex have?', 'TO DM, how many coins does Vex have?', 'to the dm: how many coins does Vex have?', 'an SL: how many coins does Vex have?', 'An den Spielleiter: how many coins does Vex have?', 'an den Spielleiter how many coins does Vex have?', 'Spielleiter: how many coins does Vex have?', 'SL: how many coins does Vex have?', 'OOC: how many coins does Vex have?', '(ooc) how many coins does Vex have?', 'Frage an den SL: how many coins does Vex have?', 'DM: how many coins does Vex have?']) {
      expect(parseOoc(line), line).toBe('how many coins does Vex have?');
    }
  });

  it('leaves story lines alone', () => {
    for (const line of ['I DM the door open', 'I tell the dm to wait', 'We go to Dmitri', 'an der Tür lauschen', 'sl', 'to DM:', 'ooc', 'Ask the innkeeper about the toll']) expect(parseOoc(line), line).toBeNull();
  });
});

function newGame(lang: 'en' | 'de' = 'en') {
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const g = new Game('ooc', rng);
  g.upsertPlayer('p1', 'Tester', true);
  if (lang === 'de') g.s.language = 'de';
  g.addCharacter('p1', 'fighter', 'Brann');
  g.addCharacter('p1', 'rogue', 'Vex');
  g.start();
  g.takeBeats();
  return g;
}

const use = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input });
const text = (t: string) => ({ type: 'text', text: t });

function stubbed(responses: (req: any) => any) {
  const dm = new ClaudeDM({ models: { background: 'b', standard: 's', key: 'k', forced: null }, effort: 'low', apiKey: 'test' });
  const requests: any[] = [];
  (dm as any).client = { beta: { messages: { create: async (req: any) => { requests.push(JSON.parse(JSON.stringify(req))); return responses(req); } } } };
  return { dm, requests };
}

describe('the Claude DM answering a question', () => {
  it('answers in plain words on the standard model, with only state-fixing tools and no scene', async () => {
    const g = newGame();
    g.s.escalate = true; // a turning point would normally send the next reply to the key model
    const { dm, requests } = stubbed(() => ({ stop_reason: 'end_turn', content: [text('Vex has 12 gold.')] }));
    const note = await dm.answerQuestion(g, { player: 'Tester', text: 'How much gold do we have?' }, async () => {});
    expect(note).toBe('Vex has 12 gold.');
    expect(requests).toHaveLength(1);
    expect(requests[0].model).toBe('s');
    const names = requests[0].tools.map((t: any) => t.name);
    expect(names).toEqual(expect.arrayContaining(['change_gold', 'give_item', 'take_item']));
    for (const banned of ['scene', 'skill_check', 'start_combat', 'travel_to', 'rest', 'advance_time', 'delve']) expect(names).not.toContain(banned);
    expect(promptText(requests[0].messages[0].content)).toContain('OUT-OF-CHARACTER QUESTION');
  });

  it('puts the state right when the question shows a mistake, and says so', async () => {
    const g = newGame();
    const before = g.s.gold;
    const minutes = g.world.minutes;
    const { dm, requests } = stubbed((req) => req.messages.length === 1
      ? { stop_reason: 'tool_use', content: [use('a', 'change_gold', { amount: 5, reason: 'The toll keeper owed us the coin back' })] }
      : { stop_reason: 'end_turn', content: [text('Good catch: the toll keeper owed you 5 gold. I have added it.')] });
    const note = await dm.answerQuestion(g, { player: 'Tester', text: 'Did we get the toll money back?' }, async () => {});
    expect(note).toContain('added');
    expect(requests).toHaveLength(2);
    expect(g.s.gold).toBe(before + 5);
    expect(g.world.minutes).toBe(minutes);
  });

  it('gives no tools in a fight', async () => {
    const g = newGame();
    g.s.phase = 'combat';
    const { dm, requests } = stubbed(() => ({ stop_reason: 'end_turn', content: [text('Yes, you can still use your bonus action.')] }));
    await dm.answerQuestion(g, { player: 'Tester', text: 'Do I still have my bonus action?' }, async () => {});
    expect(requests[0].tools).toBeUndefined();
  });

  it('remembers the exchange for later turns', () => {
    const g = newGame();
    g.log('ask', 'How much gold?', { speaker: 'Tester' });
    g.log('note', 'Twelve.', { speaker: 'Tester' });
    expect(transcript(g)).toContain('Tester (out-of-character question to the DM): How much gold?');
    expect(transcript(g)).toContain('DM (out-of-character answer): Twelve.');
  });

  it('is polite when the API fails, in the table language', async () => {
    const g = newGame('de');
    const { dm } = stubbed(() => { throw new Error('boom'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await dm.answerQuestion(g, { player: 'Tester', text: 'Wie viel Gold?' }, async () => {})).toMatch(/Spielleiter kann gerade nicht/);
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
const ws = (s: FakeSocket) => s as unknown as WebSocket;

class QuestionDM extends ScriptedDM {
  turns: PlayerLine[][] = [];
  questions: PlayerLine[] = [];
  async respond(_game: Game, said: PlayerLine[]) {
    this.turns.push(said);
    return { title: 'Reply', mood: 'calm' as const, text: 'The story goes on.', actions: [] };
  }
  async answerQuestion(_game: Game, asked: PlayerLine) {
    this.questions.push(asked);
    return `Answer for ${asked.player}.`;
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

async function playing(timing: Partial<RoomTiming> = {}) {
  const dm = new QuestionDM();
  const r = new Room('friday', dm, new MemoryStore() as unknown as Store, { actionDelayMs: 0, travelDelayMs: 0, turnWaitMs: 8000, hostGraceMs: 20000, ...timing }, {});
  const chris = new FakeSocket(), mira = new FakeSocket();
  r.join(ws(chris), 'chris', 'token-chris-0123456789', 'Chris');
  r.join(ws(mira), 'mira', 'token-mira-0123456789', 'Mira');
  r.handle(ws(chris), { t: 'add_character', classId: 'fighter', name: '' });
  r.handle(ws(mira), { t: 'add_character', classId: 'cleric', name: '' });
  r.handle(ws(chris), { t: 'start' });
  await vi.advanceTimersByTimeAsync(50);
  return { r, dm, chris, mira };
}

describe('a question at the table', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the question and a note to everyone, and neither opens nor uses a turn', async () => {
    vi.useFakeTimers();
    const { r, dm, chris, mira } = await playing();
    const scenes = chris.state.log.filter((l) => l.kind === 'dm').length;
    r.handle(ws(chris), { t: 'say', text: 'to DM: how many coins does Vex have?' });
    await vi.advanceTimersByTimeAsync(10);
    expect(dm.questions).toEqual([{ player: 'Chris', text: 'how many coins does Vex have?' }]);
    for (const s of [chris, mira]) {
      expect(s.state.log.slice(-2)).toMatchObject([{ kind: 'ask', speaker: 'Chris', text: 'how many coins does Vex have?' }, { kind: 'note', speaker: 'Chris', text: 'Answer for Chris.' }]);
      expect(s.state.log.filter((l) => l.kind === 'dm')).toHaveLength(scenes);
      expect(s.state.gathering).toBe(false);
    }
    // Nobody waits on Mira, and she is not held up either.
    expect(dm.turns).toHaveLength(0);
    r.handle(ws(mira), { t: 'say', text: 'I watch the door' });
    await vi.advanceTimersByTimeAsync(8100);
    expect(dm.turns).toEqual([[{ player: 'Mira', text: 'I watch the door' }]]);
  });

  it('does not close the window another player has opened', async () => {
    vi.useFakeTimers();
    const { r, dm, chris, mira } = await playing();
    r.handle(ws(chris), { t: 'say', text: 'I ask the innkeeper for rumours' });
    r.handle(ws(mira), { t: 'say', text: 'Spielleiter: wer ist hier?' });
    await vi.advanceTimersByTimeAsync(100);
    expect(dm.questions).toHaveLength(1);
    expect(dm.turns).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(8100);
    expect(dm.turns).toEqual([[{ player: 'Chris', text: 'I ask the innkeeper for rumours' }]]);
  });

  it('treats a line as a question when the toggle is on, even without a label', async () => {
    vi.useFakeTimers();
    const { r, dm, chris } = await playing();
    r.handle(ws(chris), { t: 'say', text: 'Wie viele Münzen hat Vex?', ooc: true });
    await vi.advanceTimersByTimeAsync(10);
    expect(dm.questions).toEqual([{ player: 'Chris', text: 'Wie viele Münzen hat Vex?' }]);
    expect(dm.turns).toHaveLength(0);
  });

  it('is answered by the scripted DM with a pointer to the sheet', async () => {
    const g = newGame();
    expect(await new ScriptedDM().answerQuestion(g)).toMatch(/ANTHROPIC_API_KEY/);
  });
});
