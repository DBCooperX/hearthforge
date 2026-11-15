import { describe, expect, it } from 'vitest';
import { ClaudeDM } from '../src/dm/claude';
import { resolveModels, tierForBeats, type ModelConfig } from '../src/dm/models';
import { ScriptedDM } from '../src/dm/scripted';
import { Game } from '../src/game/engine';

const MODELS: ModelConfig = { background: 'bg-model', standard: 'std-model', key: 'key-model', forced: null };

/** Drives the real tool loop against a stubbed Messages API. */
function stubbed(responses: (req: any) => any, models = MODELS) {
  const dm = new ClaudeDM({ models, effort: 'low', apiKey: 'test' });
  const requests: any[] = [];
  (dm as any).client = { beta: { messages: { create: async (req: any) => { requests.push(JSON.parse(JSON.stringify(req))); return responses(req); } } } };
  return { dm, requests };
}

function newGame() {
  let seed = 5;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const g = new Game('dm', rng);
  g.upsertPlayer('p1', 'Tester', true);
  g.addCharacter('p1', 'fighter', 'Brann');
  g.addCharacter('p1', 'cleric', 'Osric');
  g.start();
  return g;
}

function combatGame() {
  const g = newGame();
  g.takeBeats();
  g.startEncounter([{ defId: 'giant_rat', count: 6 }], { source: 'story', context: 'test' });
  // Skip ahead to the monsters.
  for (let i = 0; i < 10 && !g.isMonsterTurn(); i++) g.endTurn('p1', g.current()!.id);
  expect(g.isMonsterTurn()).toBe(true);
  return g;
}

const use = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input });
const sceneCall = (over: Record<string, unknown> = {}) =>
  use('s1', 'scene', { title: 'The Gilded Anvil', mood: 'warm', narration: 'Marta Coppervein slides a mug across the bar.', suggested_actions: ['Ask about the smithy', 'Order stew'], journal_entry: 'Met Marta.', important: false, ...over });
const noop = async () => {};

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
            use('t1', 'monster_action', { monster_id: block[0].id, target_id: target.id, attack: 'Bite', tactic: 'engage' }),
            use('t2', 'monster_action', { monster_id: 'nope', target_id: target.id, attack: 'Bite', tactic: 'engage' }),
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
    expect(requests[0].model).toBe('std-model');
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
    expect((await dm.narrate(g, [{ kind: 'combat_end', boss: false, rewards: '50 XP' }], noop))?.text).toMatch(/50 XP/);
  });

  it('lets a player try anything: rolls checks, updates memory and returns a scene card', async () => {
    const g = newGame();
    g.takeBeats();
    const hero = g.s.characters[0];
    const gold = g.s.gold;
    const { dm, requests } = stubbed((req) =>
      req.messages.length === 1
        ? {
            stop_reason: 'tool_use',
            content: [
              use('c1', 'skill_check', { character_id: hero.id, ability: 'wis', skill: 'perception', dc: 12 }),
              use('c2', 'remember_npc', { name: 'Pip Underbough', role: 'stable boy', description: 'Knows every horse in town.', appearance: 'A freckled halfling lad in a straw hat.', disposition: 'friendly', location_id: '', note: 'Saw riders on the hill road.' }),
              use('c3', 'change_gold', { amount: -5, reason: 'a round of ale' }),
              use('c4', 'change_gold', { amount: -5000, reason: 'the whole inn' }),
              use('c5', 'create_location', { name: 'Hill Road Camp', kind: 'camp', description: 'A cold campfire.', appearance: 'Trampled grass.', direction: 'north-east', distance: 2 }),
              use('c6', 'update_quest', { title: 'Riders on the Hill Road', status: 'active', summary: 'Find out who they are.', note: '' }),
              use('c7', 'move_to_place', { location_id: 'gilded_anvil' }),
            ],
          }
        : { stop_reason: 'tool_use', content: [sceneCall({ important: true })] },
    );
    let updates = 0;
    const scene = await dm.respond(g, 'Tester', 'I buy a round and ask about the riders', async () => { updates++; });
    expect(scene).toEqual({ title: 'The Gilded Anvil', mood: 'warm', text: 'Marta Coppervein slides a mug across the bar.', actions: ['Ask about the smithy', 'Order stew'] });
    expect(updates).toBe(6);
    expect(requests[0].model).toBe('std-model');
    expect(requests[0].tools.map((t: any) => t.name)).toContain('start_combat');
    expect(requests[0].tools.every((t: any) => t.input_schema.additionalProperties === false)).toBe(true);
    expect(requests[0].tools.filter((t: any) => !t.strict).map((t: any) => t.name)).toEqual(['give_story_item', 'update_story_item', 'take_item']);
    expect(requests[0].messages[0].content).toMatch(/Emberfall[\s\S]*Silence the Warren[\s\S]*I buy a round/);
    const results = requests[1].messages[2].content;
    expect(results.map((r: any) => !!r.is_error)).toEqual([false, false, false, true, false, false, false]);
    expect(g.s.gold).toBe(gold - 5);
    expect(g.s.log.some((l) => l.roll?.label === 'Perception check')).toBe(true);
    expect(g.s.memory.npcs.find((n) => n.name === 'Pip Underbough')).toMatchObject({ met: true, locationId: 'emberfall' });
    expect(g.world.locations.find((l) => l.name === 'Hill Road Camp')?.discovered).toBe(true);
    expect(g.s.memory.quests.map((q) => q.title)).toContain('Riders on the Hill Road');
    expect(g.place()?.id).toBe('gilded_anvil');
    expect(g.takeBeats()).toEqual([]);
    expect(g.s.memory.journal.map((j) => j.text)).toEqual(['Met Marta.']);
    // The scene was flagged important, so the next reply is escalated to the key model.
    await dm.respond(g, 'Tester', 'What now?', noop);
    expect(requests[2].model).toBe('key-model');
    expect(requests[2].messages[0].content).toMatch(/Pip Underbough[\s\S]*Met Marta/);
  });

  it('starts fights the DM calls for and accepts plain text in place of a scene', async () => {
    const g = newGame();
    g.takeBeats();
    const { dm } = stubbed((req) =>
      req.messages.length === 1
        ? { stop_reason: 'tool_use', content: [use('f1', 'start_combat', { monsters: [{ type: 'bandit', count: 4 }, { type: 'dragon', count: 1 }], reason: 'A deal gone wrong.' })] }
        : req.messages.length === 3
          ? { stop_reason: 'tool_use', content: [use('f2', 'start_combat', { monsters: [{ type: 'bandit', count: 4 }], reason: 'A deal gone wrong.' })] }
          : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Knives come out.' }] },
    );
    const scene = await dm.respond(g, 'Tester', 'I insult the bandit captain', noop);
    expect(g.s.phase).toBe('combat');
    expect(g.s.monsters.map((m) => m.name)).toEqual(['Bandit 1', 'Bandit 2']);
    expect(scene).toMatchObject({ text: 'Knives come out.', actions: [] });
    expect(g.takeBeats()).toEqual([]);
  });

  it('routes each call to a model tier', async () => {
    expect(tierForBeats([{ kind: 'start' }])).toBe('key');
    expect(tierForBeats([{ kind: 'arrive', location: 'Greywater', firstVisit: true, major: true }])).toBe('key');
    expect(tierForBeats([{ kind: 'arrive', location: 'Greywater', firstVisit: false, major: true }])).toBe('standard');
    expect(tierForBeats([{ kind: 'combat_start', monsters: ['Bugbear Chief'], boss: true, context: '' }])).toBe('key');
    expect(tierForBeats([{ kind: 'combat_end', boss: false, rewards: '' }, { kind: 'level_up', heroes: ['Brann'] }])).toBe('key');
    expect(tierForBeats([{ kind: 'travel_end', journey: '', reason: 'arrived' }])).toBe('background');
    expect(tierForBeats([{ kind: 'combat_start', monsters: ['Wolf'], boss: false, context: '' }])).toBe('standard');

    expect(resolveModels({})).toEqual({ background: 'claude-haiku-5-5', standard: 'claude-sonnet-5-5', key: 'claude-opus-5-5', forced: null });
    expect(resolveModels({ HEARTHFORGE_DM_MODEL_KEY: 'claude-fable-5-2', HEARTHFORGE_DM_MODEL_BACKGROUND: 'x' })).toMatchObject({ background: 'x', standard: 'claude-sonnet-5-5', key: 'claude-fable-5-2' });
    expect(resolveModels({ HEARTHFORGE_DM_FORCE_MODEL: 'claude-opus-5-5', HEARTHFORGE_DM_MODEL_KEY: 'y' })).toEqual({ background: 'claude-opus-5-5', standard: 'claude-opus-5-5', key: 'claude-opus-5-5', forced: 'claude-opus-5-5' });

    const g = newGame();
    const { dm, requests } = stubbed(() => ({ stop_reason: 'tool_use', content: [sceneCall()] }));
    await dm.narrate(g, g.takeBeats(), noop);
    await dm.narrate(g, [{ kind: 'rest', long: true }], noop);
    expect(requests.map((r) => r.model)).toEqual(['key-model', 'bg-model']);
    // The fallback parameter only goes to models that accept it.
    expect(requests[0].fallbacks).toBeUndefined();
    const real = stubbed(() => ({ stop_reason: 'tool_use', content: [sceneCall()] }), resolveModels({}));
    await real.dm.narrate(g, [{ kind: 'start' }], noop);
    await real.dm.narrate(g, [{ kind: 'rest', long: true }], noop);
    expect(real.requests.map((r) => [r.model, r.fallbacks])).toEqual([['claude-opus-5-5', 'default'], ['claude-haiku-5-5', undefined]]);
  });

  it('condenses an overgrown journal into the chronicle on the background model', async () => {
    const g = newGame();
    for (let i = 0; i < 50; i++) g.addJournal(`Event ${i}`);
    const { dm, requests } = stubbed(() => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'The party did fifty things.' }] }));
    await dm.maintain(g);
    expect(requests).toHaveLength(1);
    expect(requests[0].model).toBe('bg-model');
    expect(requests[0].tools).toBeUndefined();
    expect(g.s.memory.chronicle).toBe('The party did fifty things.');
    expect(g.s.memory.journal.map((j) => j.text)).toEqual(Array.from({ length: 20 }, (_, i) => `Event ${i + 30}`));
    await dm.maintain(g);
    expect(requests).toHaveLength(1);
  });
});

describe('scripted Dungeon Master', () => {
  it('opens the adventure and describes arrivals without an API key', async () => {
    const g = newGame();
    const dm = new ScriptedDM();
    const opening = await dm.narrate(g, g.takeBeats());
    expect(opening).toMatchObject({ title: 'Emberfall', actions: ['Talk to Reeve Aldous Venn', 'Look around'] });
    expect(opening!.text).toMatch(/market town/);
    const reply = await dm.respond(g, 'Tester', 'talk to reeve aldous venn');
    expect(reply!.text).toMatch(/bounty[\s\S]*ANTHROPIC_API_KEY/);
  });
});
