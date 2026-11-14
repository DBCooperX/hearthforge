import { describe, expect, it } from 'vitest';
import { ClaudeDM } from '../src/dm/claude';
import { Game } from '../src/game/engine';

/** Drives the real tool loop against a stubbed Messages API. */
function stubbed(responses: (req: any) => any) {
  const dm = new ClaudeDM({ model: 'claude-opus-5-5', effort: 'low', apiKey: 'test' });
  const requests: any[] = [];
  (dm as any).client = { beta: { messages: { create: async (req: any) => { requests.push(JSON.parse(JSON.stringify(req))); return responses(req); } } } };
  return { dm, requests };
}

function combatGame() {
  let seed = 5;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const g = new Game('dm', rng);
  g.upsertPlayer('p1', 'Tester', true);
  g.addCharacter('p1', 'fighter', 'Brann');
  g.addCharacter('p1', 'cleric', 'Osric');
  g.start();
  g.move('p1', g.s.characters[0].id, 6, 3);
  g.move('p1', g.s.characters[0].id, 8, 3);
  expect(g.s.phase).toBe('combat');
  // Skip ahead to the monsters.
  for (let i = 0; i < 10 && !g.isMonsterTurn(); i++) g.endTurn('p1', g.current()!.id);
  expect(g.isMonsterTurn()).toBe(true);
  return g;
}

describe('Claude Dungeon Master', () => {
  it('resolves monster tool calls through the engine and returns the narration', async () => {
    const g = combatGame();
    const block = g.monsterBlock();
    const target = g.s.characters[0];
    const { dm, requests } = stubbed((req) => {
      if (req.messages.length === 1) {
        return {
          stop_reason: 'tool_use',
          content: [
            { type: 'tool_use', id: 't1', name: 'monster_action', input: { monster_id: block[0].id, target_id: target.id, attack: 'Bite', tactic: 'engage' } },
            { type: 'tool_use', id: 't2', name: 'monster_action', input: { monster_id: 'nope', target_id: target.id, attack: 'Bite', tactic: 'engage' } },
          ],
        };
      }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'The rats surge forward.' }] };
    });
    let actions = 0;
    const text = await dm.runMonsters(g, block, async () => { actions++; });
    expect(text).toBe('The rats surge forward.');
    // Every monster in the block acted exactly once, including ones the model skipped.
    expect(actions).toBe(block.length);
    expect(requests[0].fallbacks).toBe('default');
    expect(requests[0].tools[0].name).toBe('monster_action');
    const results = requests[1].messages[2].content;
    expect(results).toHaveLength(2);
    expect(JSON.parse(results[0].content).monster).toBe(block[0].name);
    expect(results[1].is_error).toBe(true);
    expect(g.s.log.some((l) => l.text.startsWith(`${block[0].name} `))).toBe(true);
  });

  it('falls back to scripted behaviour when the API fails', async () => {
    const g = combatGame();
    const block = g.monsterBlock();
    const { dm } = stubbed(() => { throw new Error('network down'); });
    let actions = 0;
    const text = await dm.runMonsters(g, block, async () => { actions++; });
    expect(text).toBeNull();
    expect(actions).toBe(block.length);
    expect(await dm.narrate(g, [{ kind: 'combat_end' }])).toMatch(/\w/);
  });

  it('rolls skill checks requested in chat', async () => {
    const g = combatGame();
    const hero = g.s.characters[0];
    const { dm } = stubbed((req) =>
      req.messages.length === 1
        ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c1', name: 'skill_check', input: { character_id: hero.id, ability: 'wis', skill: 'perception', dc: 12 } }] }
        : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'You listen at the wall.' }] },
    );
    expect(await dm.chat(g, 'Tester', 'I listen for more rats', async () => {})).toBe('You listen at the wall.');
    expect(g.s.log.some((l) => /perception check/.test(l.text))).toBe(true);
  });
});
