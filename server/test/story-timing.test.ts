// The story's timing has to hold together: things that happened get a fixed date on the world clock
// and keep it, revelations wait for their condition, and the Dungeon Master sees all of it each turn.
import { describe, expect, it } from 'vitest';
import { ClaudeDM } from '../src/dm/claude';
import { DM_SYSTEM_PROMPT, describeWorld } from '../src/dm/context';
import { resolveModels, storyTier } from '../src/dm/models';
import { applyFindings, reconcilePrompt, type TurnRecord } from '../src/dm/reconcile';
import { Game } from '../src/game/engine';
import { logEvent, parseWhen, secret } from '../src/game/timeline';
import { SETTINGS } from '../../shared/admin';
import { tr } from '../../shared/i18n';

function newGame(lang: 'en' | 'de' = 'en') {
  let seed = 11;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const g = new Game('timing', rng);
  g.upsertPlayer('p1', 'Tester', true);
  if (lang === 'de') g.s.language = 'de';
  g.addCharacter('p1', 'fighter', 'Brann');
  g.addCharacter('p1', 'rogue', 'Vex');
  g.start();
  g.takeBeats();
  return g;
}

const DAY = 1440;
const use = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input });
const scene = (narration: string) => use('s', 'scene', { title: 'Am Salzspeicher', mood: 'tense', narration, suggested_actions: ['Zur Mühle'], journal_entry: '', important: false });
const turn = (g: Game, narration: string, calls: TurnRecord['calls'] = []): TurnRecord => ({ said: [{ player: 'Tester', text: 'Was weisst du?' }], narration, startMinutes: g.world.minutes, calls });

function stubbed(reply: (req: any) => any, models = { background: 'bg', standard: 'std', key: 'key', forced: null as string | null, storyOnKey: false }) {
  const dm = new ClaudeDM({ models, effort: 'low', apiKey: 'test' });
  const requests: any[] = [];
  (dm as any).client = { beta: { messages: { create: async (req: any) => {
    requests.push(JSON.parse(JSON.stringify(req)));
    if (req.model === 'bg') return { stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }] };
    return reply(req);
  } } } };
  return { dm, requests };
}

describe('reading a moment', () => {
  const now = 2 * DAY + 15 * 60; // day 3, 15:00

  it('reads numbers and units before or after now, in English and German', () => {
    expect(parseWhen('3 weeks ago', now)).toBe(now - 21 * DAY);
    expect(parseWhen('two days ago', now)).toBe(now - 2 * DAY);
    expect(parseWhen('a few hours ago', now)).toBe(now - 3 * 60);
    expect(parseWhen('about 4 months ago', now)).toBe(now - 120 * DAY);
    expect(parseWhen('in 2 days', now)).toBe(now + 2 * DAY);
    expect(parseWhen('vor drei Wochen', now)).toBe(now - 21 * DAY);
    expect(parseWhen('vor einer Woche', now)).toBe(now - 7 * DAY);
    expect(parseWhen('vor 2 Tagen', now)).toBe(now - 2 * DAY);
    expect(parseWhen('in zwei Stunden', now)).toBe(now + 120);
  });

  it('reads everyday words and days on the clock', () => {
    expect(parseWhen('now', now)).toBe(now);
    expect(parseWhen('', now)).toBe(now);
    expect(parseWhen('yesterday', now)).toBe(now - DAY);
    expect(parseWhen('gestern', now)).toBe(now - DAY);
    expect(parseWhen('this morning', now)).toBe(2 * DAY + 8 * 60);
    expect(parseWhen('tonight', now)).toBe(2 * DAY + 20 * 60);
    expect(parseWhen('heute Abend', now)).toBe(2 * DAY + 20 * 60);
    expect(parseWhen('day 4 06:30', now)).toBe(3 * DAY + 6 * 60 + 30);
    expect(parseWhen('Tag 2', now)).toBe(DAY + 12 * 60);
  });

  it('refuses words too vague to pin down', () => {
    for (const vague of ['in winter', 'im Winter', 'long ago', 'vor Wochen', 'some time ago', 'once']) expect(parseWhen(vague, now)).toBeNull();
  });
});

describe('the timeline', () => {
  it('pins a backstory fact to a date and keeps it when it comes up again', () => {
    const g = newGame();
    const r = logEvent(g, { what: 'Mayor Garn sent two toll guards to watch the mill at night; one came back silent, the other never returned.', when: '3 weeks ago', where: 'the mill', knownBy: 'Emmerich Garn' });
    expect(r.when).toMatch(/before the adventure began \(3 weeks ago\)/);
    const at = g.s.memory.timeline.find((e) => e.id === r.id)!.at;
    g.advanceTime(2 * DAY);
    // Told again, by someone else and with another time: the date stays, and the new listener is added.
    const again = logEvent(g, { what: 'Mayor Garn sent two toll guards to watch the mill at night; one came back silent, the other never returned.', when: 'in winter', knownBy: 'Griet Möllner' });
    expect(again.kept).toBe(true);
    const ev = g.s.memory.timeline.find((e) => e.id === r.id)!;
    expect(ev.at).toBe(at);
    expect(ev.knownBy).toBe('Emmerich Garn, Griet Möllner');
  });

  it('asks for a number instead of a vague time', () => {
    const g = newGame();
    expect(() => logEvent(g, { what: 'The barge sank.', when: 'in winter' })).toThrow(/too vague/);
    expect(() => logEvent(g, { what: '', when: 'now' })).toThrow(/what happened/);
  });

  it('notes first arrivals and new quests by itself, and stamps journal lines with the time', () => {
    const g = newGame();
    expect(g.s.memory.timeline.some((e) => e.by === 'party' && /first time/.test(e.what))).toBe(true);
    g.setQuest({ title: 'The silent mill', summary: 'Find out what counts in the reeds.' });
    expect(g.s.memory.timeline.some((e) => /took on the quest "The silent mill"/.test(e.what))).toBe(true);
    g.advanceTime(90);
    g.addJournal('Garn paid twenty gold in advance.');
    expect(g.s.memory.journal.at(-1)!.at).toBe(g.world.minutes);
    expect(describeWorld(g)).toMatch(/- Day 1, 09:30: Garn paid twenty gold in advance\./);
  });

  it('shows the Dungeon Master the clock, how long ago each event was and who knows it', () => {
    const g = newGame();
    logEvent(g, { what: 'The goblins stole the guild silver.', when: '5 days ago', where: 'the river road', knownBy: 'common talk' });
    logEvent(g, { what: 'The toll barge is due at the mill.', when: 'in 2 days' });
    g.advanceTime(6 * 60);
    const text = describeWorld(g);
    expect(text).toMatch(/The adventure began 6 hours ago, on Day 1 at 08:00\./);
    expect(text).toMatch(/5 days before the adventure began, 5 days ago: The goblins stole the guild silver\. Where: the river road\. Known by: common talk\./);
    expect(text).toMatch(/Planned for Day 3, 08:00, in 2 days: The toll barge is due at the mill\./);
    // Once the clock reaches a planned event, the DM is told it is due.
    g.advanceTime(2 * DAY);
    expect(describeWorld(g)).toMatch(/DUE \(it was planned for then; let it happen now, or say why it did not\): The toll barge/);
  });

  it('keeps old saves without a timeline readable', () => {
    const g = newGame();
    const saved = JSON.parse(JSON.stringify(g.s));
    delete saved.memory.timeline;
    delete saved.memory.secrets;
    const back = new Game('timing', Math.random, saved);
    expect(back.s.memory.timeline).toEqual([]);
    expect(back.s.memory.secrets).toEqual([]);
    expect(() => describeWorld(back)).not.toThrow();
  });
});

describe('held-back secrets', () => {
  it('waits for its earliest time and lists the condition until it comes out', () => {
    const g = newGame();
    const held = secret(g, { action: 'hold', text: 'Bram Riedel pays the goblins in guild silver.', after: 'the party has found the ledger in the mill cellar', notBefore: 'in 2 days' });
    expect(held.held).toBe(true);
    let text = describeWorld(g);
    expect(text).toMatch(/Held back \(secret\)/);
    expect(text).toMatch(/\[secret1\] Bram Riedel pays the goblins in guild silver\. Only after: the party has found the ledger in the mill cellar\. Not before Day 3, 08:00 \(in 2 days\)/);
    expect(() => secret(g, { action: 'reveal', text: 'secret1' })).toThrow(/Too early/);
    g.advanceTime(2 * DAY);
    expect(describeWorld(g)).toMatch(/Its earliest time has come/);
    expect(secret(g, { action: 'reveal', text: 'Bram Riedel pays the goblins in guild silver.' }).revealed).toBe(true);
    text = describeWorld(g);
    expect(text).not.toMatch(/Held back/);
    expect(text).toMatch(/Already revealed: Bram Riedel pays/);
  });

  it('needs a condition, and refuses vague times', () => {
    const g = newGame();
    expect(() => secret(g, { action: 'hold', text: 'The mayor lies.' })).toThrow(/after what/);
    expect(() => secret(g, { action: 'hold', text: 'The mayor lies.', notBefore: 'soonish' })).toThrow(/too vague/);
    expect(() => secret(g, { action: 'shout', text: 'The mayor lies.', after: 'x' })).toThrow(/hold.*reveal/);
  });
});

describe('the Dungeon Master and the clock', () => {
  it('tells the DM to date the past, avoid coincidences, limit what people know and hold back truths', () => {
    expect(DM_SYSTEM_PROMPT).toMatch(/Time, causes and who knows what/);
    expect(DM_SYSTEM_PROMPT).toMatch(/cannot have sent guards to the mill "in winter"/);
    expect(DM_SYSTEM_PROMPT).toMatch(/No coincidence of timing without a cause/);
    expect(DM_SYSTEM_PROMPT).toMatch(/People know only what they could know/);
    expect(DM_SYSTEM_PROMPT).toMatch(/hold it with secret/);
  });

  it('dates a backstory fact and holds a secret through its tools on a German table', async () => {
    const g = newGame('de');
    const garn = 'Bürgermeister Garn schickte zwei Zöllner zur Nachtwache an die Mühle; einer kam stumm zurück, der andere nie.';
    const { dm, requests } = stubbed((req) => {
      if (req.messages.length === 1) return { stop_reason: 'tool_use', content: [
        use('t1', 'log_event', { what: garn, when: 'vor drei Tagen', where: 'an der Mühle', known_by: 'Emmerich Garn' }),
        use('t2', 'secret', { action: 'hold', text: 'Der zweite Zöllner liegt unter dem Mühlrad.', after: 'die Gruppe sucht am Mühlrad', not_before: '' }),
        use('t3', 'secret', { action: 'hold', text: 'Bram zahlt die Goblins.', after: 'die Gruppe findet das Kassenbuch', not_before: 'in 2 Tagen' }),
        use('t4', 'secret', { action: 'reveal', text: 'Bram zahlt die Goblins.' }),
        scene('Emmerich Garn sieht zum Mühlrad hinüber und sagt leise: „Vor drei Tagen schickte ich zwei Zöllner hin."'),
      ] };
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: '' }] };
    });
    const out = await dm.respond(g, [{ player: 'Tester', text: 'Was wisst Ihr über die Mühle?' }], async () => {});
    expect(out?.text).toMatch(/Vor drei Tagen/);
    const ev = g.s.memory.timeline.find((e) => e.what === garn)!;
    expect(ev.at).toBe(g.world.minutes - 3 * DAY);
    expect(g.s.memory.secrets.map((x) => x.revealed)).toEqual([null, null]);
    // The early reveal was refused, so Bram's secret is still held.
    expect(g.s.memory.secrets[1]).toMatchObject({ text: 'Bram zahlt die Goblins.', revealed: null });
    // Next turn the DM sees the date, who knows it and the held truths.
    expect(describeWorld(g)).toMatch(/3 days ago: Bürgermeister Garn schickte[\s\S]*Known by: Emmerich Garn[\s\S]*Der zweite Zöllner liegt unter dem Mühlrad\. Only after: die Gruppe sucht am Mühlrad/);
    expect(requests[0].tools.find((t: any) => t.name === 'log_event').strict).toBeUndefined();
  });

  it('the background check dates what the DM told without the tool, and notes a secret that slipped out', () => {
    const g = newGame('de');
    secret(g, { action: 'hold', text: 'Bram zahlt die Goblins.', after: 'das Kassenbuch', notBefore: 'in 2 days' });
    const narration = 'Garn sagt: „Im Winter schickte ich zwei Zöllner hin." Dann flüstert Griet: „Bram zahlt die Goblins."';
    const t = turn(g, narration);
    const prompt = reconcilePrompt(g, t);
    expect(prompt).toMatch(/\[secret1\] Bram zahlt die Goblins\./);
    expect(prompt).toMatch(/"events": \[/);
    const r = applyFindings(g, { events: [{ what: 'Garn schickte zwei Zöllner zur Mühle.', when: '8 months ago', known_by: 'Emmerich Garn' }], revealed: ['secret1'] }, t);
    expect(r.skipped).toEqual([]);
    expect(g.s.memory.timeline.find((e) => /zwei Zöllner/.test(e.what))!.at).toBe(g.world.minutes - 240 * DAY);
    expect(g.s.memory.secrets[0].revealed).toBe(g.world.minutes);
    // Nothing is redone when the DM used its own tools in that reply.
    const t2 = turn(g, narration, [{ name: 'log_event', input: {} }]);
    applyFindings(g, { events: [{ what: 'Something else happened.', when: '2 days ago' }] }, t2);
    expect(g.s.memory.timeline.some((e) => e.what === 'Something else happened.')).toBe(false);
  });
});

describe('every story turn on the key-moment model', () => {
  it('is an Innkeeper setting with German words, off by default', () => {
    const def = SETTINGS.find((d) => d.key === 'HEARTHFORGE_DM_STORY_ON_KEY')!;
    expect(def).toMatchObject({ group: 'dm', kind: 'choice', fallback: 'off', choices: ['off', 'on'] });
    expect(tr('de', def.label)).toBe('Alle Story-Züge mit dem Modell für Schlüsselmomente');
    expect(tr('de', def.help)).not.toBe(def.help);
    expect(resolveModels({}).storyOnKey).toBe(false);
    expect(resolveModels({ HEARTHFORGE_DM_STORY_ON_KEY: 'on' }).storyOnKey).toBe(true);
    expect(storyTier(resolveModels({ HEARTHFORGE_DM_STORY_ON_KEY: 'on' }), 'background')).toBe('key');
    expect(storyTier(resolveModels({}), 'standard')).toBe('standard');
  });

  it('runs replies and narration on the key model, and leaves the background check on the cheap one', async () => {
    const g = newGame();
    const { dm, requests } = stubbed(() => ({ stop_reason: 'tool_use', content: [scene('The innkeeper nods.')] }), { background: 'bg', standard: 'std', key: 'key', forced: null, storyOnKey: true });
    await dm.respond(g, [{ player: 'Tester', text: 'I order a drink.' }], async () => {});
    await dm.reconcile(g, async () => {});
    g.advanceTime(60);
    await dm.narrate(g, [{ kind: 'travel_end', journey: 'an hour', reason: 'arrived' }], async () => {});
    expect(requests.map((r) => r.model)).toEqual(['key', 'bg', 'key']);
  });
});
