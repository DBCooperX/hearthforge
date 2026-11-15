// The story has to be easy to follow: every scene says where it plays and who is there,
// the Dungeon Master is told to stage, explain and hold back, and clues land in the journal.
import { describe, expect, it } from 'vitest';
import { ClaudeDM } from '../src/dm/claude';
import { DM_SYSTEM_PROMPT, describeWorld, languageNote } from '../src/dm/context';
import { ScriptedDM } from '../src/dm/scripted';
import { Game } from '../src/game/engine';

function newGame(lang: 'en' | 'de' = 'en') {
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const g = new Game('clarity', rng);
  g.upsertPlayer('p1', 'Tester', true);
  if (lang === 'de') g.s.language = 'de';
  g.addCharacter('p1', 'fighter', 'Brann');
  g.addCharacter('p1', 'rogue', 'Vex');
  g.start();
  return g;
}

const use = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input });
const scene = (narration: string) => use('s', 'scene', { title: 'The toll house', mood: 'mystery', narration, suggested_actions: ['Knock'], journal_entry: '', important: false });
const view = (g: Game) => g.publicState({ busy: false, mode: 'scripted', model: null });
const lastScene = (g: Game) => [...g.s.log].reverse().find((l) => l.kind === 'dm')!.scene!;

function stubbed(responses: (req: any) => any) {
  const dm = new ClaudeDM({ models: { background: 'b', standard: 's', key: 'k', forced: null }, effort: 'low', apiKey: 'test' });
  const requests: any[] = [];
  (dm as any).client = { beta: { messages: { create: async (req: any) => { requests.push(JSON.parse(JSON.stringify(req))); return responses(req); } } } };
  return { dm, requests };
}

describe('scene headers', () => {
  it('heads every scene with the place, the time of day and the people known to be there, even from the scripted DM', async () => {
    const g = newGame();
    const beats = g.takeBeats();
    const out = await new ScriptedDM().narrate(g, beats);
    g.addScene(out!);
    const meta = lastScene(g);
    expect(meta.where).toBe(g.stage().where);
    expect(meta.where).toContain(g.place()?.name ?? '');
    expect(['dawn', 'morning', 'afternoon', 'evening', 'night']).toContain(meta.time);
    expect(meta.present).toEqual(g.presentNpcs().filter((n) => n.met).map((n) => n.name).slice(0, 6));
  });

  it('shows the stage the Dungeon Master sets, in the same response as the scene, until the party moves on', async () => {
    const g = newGame();
    g.takeBeats();
    const { dm, requests } = stubbed((req) => req.messages.length === 1
      ? { stop_reason: 'tool_use', content: [use('a', 'set_stage', { where: 'Toll house, upper floor', present: 'Hendrick, Brann, the toll keeper' }), scene('You climb the stairs. Hendrick looks up from his ledger.')] }
      : { stop_reason: 'tool_use', content: [scene('Hendrick nods.')] });
    const out = await dm.respond(g, [{ player: 'Tester', text: 'We go up to see Hendrick' }], async () => {});
    g.addScene(out!);
    expect(requests).toHaveLength(1);
    // Heroes are never listed as company; the header is about who else is there.
    expect(lastScene(g)).toMatchObject({ where: 'Toll house, upper floor', present: ['Hendrick', 'the toll keeper'] });
    expect(describeWorld(g)).toContain('The scene now (shown to the players above your narration; change it with set_stage): Toll house, upper floor. With the heroes: Hendrick, the toll keeper.');
    // "none" empties the room, an empty "where" keeps the place.
    expect(g.setStage({ where: '', present: 'none' })).toMatchObject({ where: 'Toll house, upper floor', present: 'nobody but the party' });
    // Somewhere else, the header falls back to that place.
    const other = g.placesHere().find((l) => l.id !== g.world.placeId)!;
    g.goTo(other.id);
    expect(g.stage().where).toBe(`${other.name}, ${g.location(other.parentId!)!.name}`);
    expect(g.s.stage).toBeUndefined();
  });

  it('keeps old saves without headers readable', () => {
    const g = newGame();
    g.s.log.push({ id: 999, kind: 'dm', text: 'Old scene.', scene: { title: 'Old', mood: 'calm', actions: [], imageId: null } });
    expect(lastScene(g).where).toBeUndefined();
  });
});

describe('clues in the journal', () => {
  it('files clues under their question, matches the question loosely, skips repeats and marks it solved', () => {
    const g = newGame();
    g.noteClue({ question: 'Who wants the guild silver back?', clue: 'Griet says the guild shipped crates down the river past the mill.', source: 'Griet Möllner' });
    g.noteClue({ question: 'who wants the guild silver back', clue: 'Griet says the guild shipped crates down the river past the mill.', source: 'Griet Möllner' });
    g.noteClue({ question: 'Who wants the guild silver back?', clue: 'Hendrick counted the crates and thinks some went missing.', source: 'Bram' });
    const m = g.s.memory.mysteries;
    expect(m).toHaveLength(1);
    expect(m[0].clues.map((c) => c.source)).toEqual(['Griet Möllner', 'Bram']);
    expect(m[0].clues[0]).toMatchObject({ day: 1, place: g.stage().where });
    expect(g.s.log.filter((l) => l.text.startsWith('A clue for your journal')).length).toBe(2);
    g.noteClue({ question: m[0].id, clue: '', solved: true });
    expect(m[0].solved).toBe(true);
    expect(() => g.noteClue({ question: '', clue: 'Something' })).toThrow();
    expect(() => g.noteClue({ question: 'A new question', clue: '' })).toThrow();
    // The players see them, and the Dungeon Master builds on them.
    expect(view(g).memory.mysteries[0].question).toBe('Who wants the guild silver back?');
    expect(describeWorld(g)).toContain('Solved: Who wants the guild silver back?');
  });

  it('lets the Dungeon Master note a clue beside its scene and shows open questions on the next turn', async () => {
    const g = newGame();
    g.takeBeats();
    const { dm, requests } = stubbed((req) => requests.length === 1
      ? { stop_reason: 'tool_use', content: [use('c', 'note_clue', { question: 'Why does the coin stay wet?', clue: 'The coin by the hearth is cold and drips, though nobody pulled it from water.', source: 'the wet coin', solved: 'no' }), scene('The coin is cold in your hand.')] }
      : { stop_reason: 'tool_use', content: [scene('Bram watches you.')] });
    await dm.respond(g, [{ player: 'Tester', text: 'I pick up the coin' }], async () => {});
    expect(g.s.memory.mysteries[0]).toMatchObject({ question: 'Why does the coin stay wet?', solved: false });
    await dm.respond(g, [{ player: 'Tester', text: 'I ask Bram about it' }], async () => {});
    expect(requests[1].messages[0].content).toContain('Open questions and what the party knows about each');
    expect(requests[1].messages[0].content).toContain('- Why does the coin stay wet? The coin by the hearth is cold and drips, though nobody pulled it from water. (the wet coin)');
  });

  it('upgrades saves from before clue tracking', () => {
    const g = newGame();
    const saved = JSON.parse(JSON.stringify(g.s));
    delete saved.memory.mysteries;
    const again = new Game('clarity', Math.random, saved);
    expect(again.s.memory.mysteries).toEqual([]);
  });
});

describe('narration rules', () => {
  it('tells the Dungeon Master to stage, tag speakers, explain common knowledge and let people answer instead of push', () => {
    for (const rule of [/Stage every scene/, /who speaks and how they move and sound/, /Use a pronoun only when/, /Explain what the heroes would plainly know/, /at most one new mystery/, /do not volunteer secrets/, /call note_clue/, /call set_stage/]) {
      expect(DM_SYSTEM_PROMPT).toMatch(rule);
    }
  });

  it('gives German tables a German staging example and warns about "sie"', () => {
    const g = newGame('de');
    const note = languageNote(g).join('\n');
    expect(note).toContain('Griet bleibt an der Tür stehen, dreht sich halb zu euch um und sagt leise');
    expect(note).toContain('"sie" can mean she, they or the polite you');
  });
});
