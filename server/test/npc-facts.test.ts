// Issue #132: people questioned one after the other must not contradict each other or themselves.
// The Dungeon Master settles a truth once, the server keeps what each person told the party, and
// both come back every turn.
import { describe, expect, it } from 'vitest';
import { ClaudeDM } from '../src/dm/claude';
import { DM_SYSTEM_PROMPT, describeWorld } from '../src/dm/context';
import { applyFindings, reconcilePrompt, type TurnRecord } from '../src/dm/reconcile';
import { Game } from '../src/game/engine';
import { findFact, settleFact } from '../src/game/facts';

function newGame(lang: 'en' | 'de' = 'en') {
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const g = new Game('facts', rng);
  g.upsertPlayer('p1', 'Tester', true);
  if (lang === 'de') g.s.language = 'de';
  g.addCharacter('p1', 'fighter', 'Brann');
  g.start();
  g.takeBeats();
  return g;
}
const turn = (g: Game, narration: string, calls: TurnRecord['calls'] = []): TurnRecord => ({ said: [{ player: 'Tester', text: 'Wer hat den Brief gebracht?' }], narration, startMinutes: g.world.minutes, calls });

describe('settled facts', () => {
  it('settles a truth once and keeps it when the DM tries another', () => {
    const g = newGame();
    const first = settleFact(g, { about: 'who brought the letter', truth: 'Remo the stable boy, paid by the steward.' });
    expect(first.note).toMatch(/Settled/);
    const again = settleFact(g, { about: 'Who brought the letter?', truth: 'A hooded woman nobody knew.' });
    expect(again.kept).toBe(true);
    expect(again.truth).toBe('Remo the stable boy, paid by the steward.');
    expect(g.s.memory.facts).toHaveLength(1);
    // Other wordings of the same question find it; a different question does not.
    expect(findFact(g, 'letter brought')?.id).toBe(first.id);
    expect(findFact(g, 'who wrote the letter')).toBeUndefined();
  });

  it('asks for a truth before anything new is settled', () => {
    const g = newGame();
    expect(() => settleFact(g, { about: 'who brought the letter', toldBy: 'Mara', told: 'A stranger.' })).toThrow(/not settled yet/);
    expect(() => settleFact(g, { about: '', truth: 'x' })).toThrow(/about/);
  });

  it('keeps what each person said and flags a changed story', () => {
    const g = newGame();
    g.rememberNpc({ name: 'Mara Holt', role: 'innkeeper' });
    settleFact(g, { about: 'who brought the letter', truth: 'Remo, the stable boy.', toldBy: 'Mara Holt', told: 'Remo from the stables brought it at dawn.' });
    expect(settleFact(g, { about: 'who brought the letter', toldBy: 'mara holt', told: 'Remo from the stables brought it at dawn.' }).told).toBe('Already noted.');
    const changed = settleFact(g, { about: 'who brought the letter', toldBy: 'Mara Holt', told: 'A merchant left it on the counter.' });
    expect(changed.said_before).toEqual(['Remo from the stables brought it at dawn.']);
    expect(String(changed.told_note)).toMatch(/on purpose/);
    // The players see it on the person's journal page; the truth stays hidden from them.
    const mara = g.publicState({ busy: false, mode: 'scripted', model: null }).memory.npcs.find((n) => n.name === 'Mara Holt')!;
    expect(mara.told?.map((x) => x.text)).toEqual(['Remo from the stables brought it at dawn.', 'A merchant left it on the counter.']);
    expect(JSON.stringify(g.publicState({ busy: false, mode: 'scripted', model: null }))).not.toContain('Remo, the stable boy.');
  });

  it('shows the facts to the DM every turn and tells it to keep to them', () => {
    const g = newGame();
    settleFact(g, { about: 'who brought the letter', truth: 'Remo, the stable boy.', toldBy: 'Mara Holt', told: 'Remo brought it.' });
    const world = describeWorld(g, { live: true });
    expect(world).toContain('Settled facts');
    expect(world).toContain('who brought the letter: Remo, the stable boy.');
    expect(world).toContain('Mara Holt (day 1): "Remo brought it."');
    expect(DM_SYSTEM_PROMPT).toMatch(/call fact with it/);
  });

  it('loads saves from before settled facts', () => {
    const g = newGame();
    const raw = JSON.parse(JSON.stringify(g.s));
    delete raw.memory.facts;
    expect(new Game('facts', Math.random, raw).s.memory.facts).toEqual([]);
  });
});

describe('the after-reply check', () => {
  it('notes an answer the DM forgot to record, but never one of a hero', () => {
    const g = newGame('de');
    expect(reconcilePrompt(g, turn(g, 'Mara sagt: "Remo hat ihn gebracht."'))).toContain('"told"');
    const r = applyFindings(g, { told: [{ who: 'Mara Holt', about: 'wer den Brief gebracht hat', said: 'Remo hat ihn gebracht.' }, { who: 'Brann', about: 'wer den Brief gebracht hat', said: 'Ich weiss es nicht.' }] }, turn(g, ''));
    expect(r.applied).toEqual(['told wer den Brief gebracht hat']);
    const f = g.s.memory.facts[0];
    expect(f.truth).toBe('');
    expect(f.told.map((x) => x.who)).toEqual(['Mara Holt']);
    expect(describeWorld(g, { live: true })).toContain('NOT SETTLED YET');
    // Settling it later fills in the truth without losing what was said.
    settleFact(g, { about: 'wer den Brief gebracht hat', truth: 'Remo, der Stallbursche.' });
    expect(g.s.memory.facts[0].truth).toBe('Remo, der Stallbursche.');
    expect(reconcilePrompt(g, turn(g, ''))).toContain('wer den Brief gebracht hat');
  });

  it('leaves it to the DM when it called fact itself', () => {
    const g = newGame();
    const r = applyFindings(g, { told: [{ who: 'Mara', about: 'who brought the letter', said: 'Remo.' }] }, turn(g, '', [{ name: 'fact', input: {} }]));
    expect(r.applied).toEqual([]);
    expect(g.s.memory.facts).toHaveLength(0);
  });
});

describe('the fact tool', () => {
  it('is offered to the DM and settles through the server', async () => {
    const g = newGame();
    const dm = new ClaudeDM({ models: { background: 'b', standard: 's', key: 'k', forced: null }, effort: 'low', apiKey: 'test' });
    const requests: any[] = [];
    const use = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input });
    (dm as any).client = { beta: { messages: { create: async (req: any) => {
      requests.push(JSON.parse(JSON.stringify(req)));
      if (req.model === 'b') return { stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }] };
      if (req.messages.length === 1) return { stop_reason: 'tool_use', content: [use('a', 'fact', { about: 'who brought the letter', truth: 'Remo.', told_by: 'Mara', told: 'Remo brought it.' })] };
      return { stop_reason: 'tool_use', content: [use('s', 'scene', { title: 'Inn', mood: 'calm', narration: 'Mara shrugs: "Remo brought it."', suggested_actions: [], journal_entry: '', important: false })] };
    } } } };
    await dm.respond(g, [{ player: 'Tester', text: 'Who brought the letter?' }], async () => {});
    const tool = requests[0].tools.find((t: any) => t.name === 'fact');
    expect(tool).toBeDefined();
    expect(tool.strict).toBeUndefined();
    expect(g.s.memory.facts[0]).toMatchObject({ about: 'who brought the letter', truth: 'Remo.' });
  });
});
