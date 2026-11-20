// The Dungeon Master's prompts are laid out for the Claude API's prompt cache: what stays the same comes first,
// the transcript only grows at the end, and what changes every turn comes last.
import { describe, expect, it } from 'vitest';
import { ClaudeDM } from '../src/dm/claude';
import { transcriptLines } from '../src/dm/context';
import type { ModelConfig } from '../src/dm/models';
import { Game } from '../src/game/engine';
import { Usage, sampleCost } from '../src/admin/usage';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MODELS: ModelConfig = { background: 'bg', standard: 'std', key: 'key', forced: null };

function stubbed(responses: (req: any) => any) {
  const dm = new ClaudeDM({ models: MODELS, effort: 'low', apiKey: 'test' });
  const requests: any[] = [];
  (dm as any).client = { beta: { messages: { create: async (req: any) => { requests.push(JSON.parse(JSON.stringify(req))); return responses(req); } } } };
  return { dm, requests };
}

function newGame() {
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const g = new Game('cache', rng);
  g.upsertPlayer('p1', 'Tester', true);
  g.addCharacter('p1', 'fighter', 'Brann');
  g.start();
  g.takeBeats();
  return g;
}

const scene = (text: string) => ({ type: 'tool_use', id: 's', name: 'scene', input: { title: 'Inn', mood: 'warm', narration: text, suggested_actions: [], journal_entry: '', important: false } });
const marks = (req: any) => [
  ...(req.cache_control ? [req.cache_control] : []),
  ...(Array.isArray(req.system) ? req.system : []).filter((b: any) => b.cache_control).map((b: any) => b.cache_control),
  ...req.messages.flatMap((m: any) => (Array.isArray(m.content) ? m.content : [])).filter((b: any) => b.cache_control).map((b: any) => b.cache_control),
];
const transcriptOf = (req: any) => {
  const blocks = req.messages[0].content as any[];
  const start = blocks.findIndex((b) => b.text.startsWith('Recent play'));
  const end = blocks.findIndex((b) => b.text.startsWith('\nCurrent state'));
  return blocks.slice(start, end).map((b) => b.text);
};

describe('prompt caching', () => {
  it('keeps tools and the system prompt for an hour and caches the rest of the turn as the tool loop goes', async () => {
    const g = newGame();
    let n = 0;
    const { dm, requests } = stubbed(() => (n++ === 0
      ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c', name: 'advance_time', input: { minutes: 10, reason: 'talk' } }] }
      : { stop_reason: 'tool_use', content: [scene('Bram nods.')] }));
    await dm.respond(g, [{ player: 'Tester', text: 'I sit down' }], async () => {});
    expect(requests).toHaveLength(2);
    for (const req of requests) {
      expect(req.system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
      expect(req.cache_control).toEqual({ type: 'ephemeral' });
      // The API allows four breakpoints in a request.
      expect(marks(req).length).toBeLessThanOrEqual(4);
    }
    const blocks = requests[0].messages[0].content;
    expect(blocks[0].text).toMatch(/^About this table:[\s\S]*Table style[\s\S]*Setting: /);
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(blocks.at(-1).text).toMatch(/^\nCurrent state:[\s\S]*I sit down/);
    expect(blocks.at(-2).cache_control).toEqual({ type: 'ephemeral' });
    // The second call of the loop sends the first one unchanged, so all of it is read from the cache.
    expect(requests[1].messages[0]).toEqual(requests[0].messages[0]);
  });

  it('sends the transcript so the next turn only adds to its end', async () => {
    const g = newGame();
    const { dm, requests } = stubbed(() => ({ stop_reason: 'tool_use', content: [scene('Bram pours you a drink.')] }));
    for (const said of ['Hello', 'Any news?', 'Thanks']) {
      g.log('chat', said, { speaker: 'Tester' });
      const out = await dm.respond(g, [{ player: 'Tester', text: said }], async () => {});
      g.addScene(out!);
    }
    const [a, b, c] = requests.map(transcriptOf);
    expect(b.slice(0, a.length)).toEqual(a);
    expect(c.slice(0, b.length)).toEqual(b);
    expect(c.length).toBeGreaterThan(b.length);
    // What stays the same for the whole adventure is sent the same way every time.
    expect(requests[2].messages[0].content[0]).toEqual(requests[0].messages[0].content[0]);
  });

  it('moves the transcript window on in steps, not one entry per turn', () => {
    const g = newGame();
    for (let i = 0; i < 80; i++) g.log('system', `line ${i}`);
    const seen: string[][] = [];
    for (let i = 0; i < 20; i++) { g.log('system', `more ${i}`); seen.push(transcriptLines(g, 28)); }
    for (const t of seen) { expect(t.length).toBeGreaterThanOrEqual(28); expect(t.length).toBeLessThan(28 + 14); }
    // Most turns keep the same first line; it changes at most twice in twenty entries.
    const starts = new Set(seen.map((t) => t[0]));
    expect(starts.size).toBeLessThanOrEqual(2);
  });

  it('does not mark one-off background calls for caching', async () => {
    const g = newGame();
    for (let i = 0; i < 50; i++) g.s.memory.journal.push({ day: 1, text: `entry ${i}` });
    const { dm, requests } = stubbed(() => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'The story so far.' }] }));
    await dm.maintain(g);
    expect(requests[0].model).toBe('bg');
    expect(marks(requests[0])).toEqual([]);
  });

  it('prices hour-long cache writes at twice the input price', () => {
    const five = sampleCost({ table: 't', model: 'claude-sonnet-5-5', input: 0, output: 0, cacheRead: 0, cacheWrite: 1_000_000 });
    const hour = sampleCost({ table: 't', model: 'claude-sonnet-5-5', input: 0, output: 0, cacheRead: 0, cacheWrite: 1_000_000, cacheWrite1h: 1_000_000 });
    expect(five).toBeCloseTo(2.5);
    expect(hour).toBeCloseTo(4);
    const usage = new Usage(mkdtempSync(join(tmpdir(), 'hf-usage-')));
    usage.record({ table: 't', model: 'claude-sonnet-5-5', input: 0, output: 0, cacheRead: 0, cacheWrite: 1_000_000, cacheWrite1h: 1_000_000 });
    expect(usage.totals().cost).toBeCloseTo(4);
  });
});
