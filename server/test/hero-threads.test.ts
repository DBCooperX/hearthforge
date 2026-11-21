// Each hero's backstory reaches the Dungeon Master in the cached part of the prompt, and a short call before
// the first scene turns it into a personal thread tied to the region or the campaign book.
import { describe, expect, it } from 'vitest';
import { ClaudeDM } from '../src/dm/claude';
import { describeTable, describeWorld, DM_SYSTEM_PROMPT } from '../src/dm/context';
import type { ModelConfig } from '../src/dm/models';
import { Game } from '../src/game/engine';

const MODELS: ModelConfig = { background: 'bg', standard: 'std', key: 'key', forced: null };
const BACKSTORY = 'Grew up on a salt barge and owes a smuggler named Old Teg forty silver.';

function stubbed(reply: (req: any) => string) {
  const dm = new ClaudeDM({ models: MODELS, effort: 'low', apiKey: 'test' });
  const requests: any[] = [];
  (dm as any).client = { beta: { messages: { create: async (req: any) => { requests.push(JSON.parse(JSON.stringify(req))); return { stop_reason: 'end_turn', content: [{ type: 'text', text: reply(req) }] }; } } } };
  return { dm, requests };
}

function table() {
  const g = new Game('threads', () => 0.42);
  g.upsertPlayer('p1', 'Chris', true);
  const hero = g.addCharacter('p1', 'fighter', 'Brann');
  hero.backstory = BACKSTORY;
  g.addCharacter('p1', 'wizard', 'Ilse');
  g.start();
  return { g, hero };
}

describe('hero backstories', () => {
  it('tells the Dungeon Master what to do with them', () => {
    expect(DM_SYSTEM_PROMPT).toContain("The heroes' own stories");
    expect(DM_SYSTEM_PROMPT).toContain('one personal thread');
  });

  it('sends them in the cached table description, not again with the state of every turn', () => {
    const { g, hero } = table();
    expect(describeTable(g)).toContain(`- Brann [${hero.id}]: ${BACKSTORY}`);
    expect(describeTable(g)).not.toContain('Ilse [');
    expect(describeWorld(g, { live: true })).not.toContain(BACKSTORY);
    // A prompt that does not send the table description still gets them.
    expect(describeWorld(g)).toContain(`Backstory: ${BACKSTORY}`);
  });

  it('weaves a thread for each hero with a backstory and keeps it only while the backstory stands', async () => {
    const { g, hero } = table();
    const { dm, requests } = stubbed(() => JSON.stringify({ [hero.id]: 'Old Teg now runs the ferry and wants his forty silver back before the market.', nobody: 'ignored thread text here' }));
    await dm.weaveThreads(g);
    expect(requests).toHaveLength(1);
    expect(requests[0].model).toBe('bg');
    const asked = JSON.stringify(requests[0].messages);
    expect(asked).toContain(BACKSTORY);
    expect(g.s.setting!.threads).toEqual([{ characterId: hero.id, backstory: BACKSTORY, hook: 'Old Teg now runs the ferry and wants his forty silver back before the market.' }]);
    expect(describeTable(g)).toContain('Personal thread, for you only: Old Teg now runs the ferry');
    // The thread is secret from the players.
    expect(JSON.stringify(g.publicState({ busy: false, mode: 'scripted', model: null }))).not.toContain('Old Teg now runs');

    // Nothing new to weave: no call.
    await dm.weaveThreads(g);
    expect(requests).toHaveLength(1);

    // A rewritten backstory drops the old thread until a new one is woven.
    hero.backstory = 'A former temple guard who lost her post.';
    expect(describeTable(g)).not.toContain('Personal thread');
    await dm.weaveThreads(g);
    expect(requests).toHaveLength(2);
  });

  it('keeps play going when the reply is not JSON', async () => {
    const { g } = table();
    const { dm } = stubbed(() => 'Sorry, no.');
    await expect(dm.weaveThreads(g)).resolves.toBeUndefined();
    expect(g.s.setting!.threads ?? []).toEqual([]);
  });
});
