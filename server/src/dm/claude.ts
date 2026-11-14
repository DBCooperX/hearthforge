// The AI Dungeon Master, backed by the Claude API.
// The server stays authoritative: Claude picks monster intents through a tool,
// the engine resolves them with real dice, and Claude narrates the result.
import Anthropic from '@anthropic-ai/sdk';
import type { AbilityKey } from '../../../shared/types';
import type { Beat, Game, Monster, MonsterIntent } from '../game/engine';
import { DM_SYSTEM_PROMPT, describeBeats, describeState, lastNarration, recentEvents } from './context';
import { scriptedNarration } from './scripted';
import type { DungeonMaster } from './types';

type Msg = Anthropic.Beta.BetaMessageParam;
type Tool = Anthropic.Beta.BetaTool;
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Models that accept the server-side refusal fallback parameter. */
const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-2', 'claude-fable-5-1', 'claude-sonnet-5-5'];
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

const MONSTER_TOOL: Tool = {
  name: 'monster_action',
  description:
    "Take one monster's whole turn: it moves according to the tactic, then makes one attack if the target is in reach. The server rolls the dice and returns what happened. Call this exactly once for each monster whose turn it is; you can call it for several monsters in the same response.",
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      monster_id: { type: 'string', description: 'Id of the acting monster, for example "m3".' },
      target_id: { type: 'string', description: 'Id of the hero to attack, for example "pc1". Unconscious heroes cannot be targeted.' },
      attack: { type: 'string', description: "Name of one of the monster's attacks, for example \"Scimitar\"." },
      tactic: {
        type: 'string',
        enum: ['engage', 'hold_position', 'retreat'],
        description: 'engage: move as needed to make the attack. hold_position: stay put and attack only if already in range. retreat: back away from the heroes, then use a ranged attack if it has one.',
      },
    },
    required: ['monster_id', 'target_id', 'attack', 'tactic'],
    additionalProperties: false,
  },
};

const CHECK_TOOL: Tool = {
  name: 'skill_check',
  description:
    'Ask the server to roll an ability check for a hero when a player attempts something with an uncertain outcome. The server rolls d20 plus modifiers against the DC and returns the result, which players also see in the log.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      character_id: { type: 'string', description: 'Id of the hero making the check, for example "pc1".' },
      ability: { type: 'string', enum: ABILITY_KEYS },
      skill: { type: 'string', description: 'Skill name in lower case, for example "perception", or an empty string for a raw ability check.' },
      dc: { type: 'integer', description: 'Difficulty class. 10 easy, 15 moderate, 20 hard.' },
    },
    required: ['character_id', 'ability', 'skill', 'dc'],
    additionalProperties: false,
  },
};

export class ClaudeDM implements DungeonMaster {
  readonly mode = 'claude' as const;
  readonly model: string;
  private client: Anthropic;
  private effort: Effort;

  constructor(opts: { model: string; effort: Effort; apiKey?: string }) {
    this.model = opts.model;
    this.effort = opts.effort;
    this.client = new Anthropic({ apiKey: opts.apiKey, timeout: 90_000, maxRetries: 1 });
  }

  /**
   * Run a tool loop to completion and return Claude's final text.
   * `handle` executes one tool call and returns the JSON-serialisable result.
   */
  private async converse(user: string, tools: Tool[], handle: (name: string, input: unknown) => Promise<unknown>): Promise<string | null> {
    const messages: Msg[] = [{ role: 'user', content: user }];
    const useFallbacks = FALLBACK_MODELS.includes(this.model);
    for (let turn = 0; turn < 6; turn++) {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 8000,
        system: [{ type: 'text', text: DM_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: this.effort },
        ...(tools.length ? { tools } : {}),
        ...(useFallbacks ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
        messages,
      });
      if (response.stop_reason === 'refusal') {
        console.warn('[dm] request declined:', response.stop_details?.category ?? 'unknown');
        return null;
      }
      if (response.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: response.content });
        continue;
      }
      const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || !calls.length) {
        const text = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        return text || null;
      }
      messages.push({ role: 'assistant', content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const call of calls) {
        try {
          results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(await handle(call.name, call.input)) });
        } catch (err) {
          results.push({ type: 'tool_result', tool_use_id: call.id, content: err instanceof Error ? err.message : 'Tool failed', is_error: true });
        }
      }
      messages.push({ role: 'user', content: results });
    }
    return null;
  }

  private report(err: unknown) {
    if (err instanceof Anthropic.AuthenticationError) console.error('[dm] The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.');
    else if (err instanceof Anthropic.RateLimitError) console.error('[dm] Rate limited by the Claude API; using scripted behaviour for this beat.');
    else if (err instanceof Anthropic.APIError) console.error(`[dm] Claude API error ${err.status}: ${err.message}`);
    else console.error('[dm] Unexpected error:', err);
  }

  async narrate(game: Game, beats: Beat[]): Promise<string | null> {
    if (!beats.length) return null;
    const prompt = `Current state of the table:\n${describeState(game)}\n\nYour most recent narration, for continuity:\n${lastNarration(game)}\n\nWhat the server resolved since then:\n${recentEvents(game)}\n\nNarrate this now:\n${describeBeats(beats)}`;
    try {
      return (await this.converse(prompt, [], async () => null)) ?? scriptedNarration(beats);
    } catch (err) {
      this.report(err);
      return scriptedNarration(beats);
    }
  }

  async runMonsters(game: Game, block: Monster[], onAction: () => Promise<void>): Promise<string | null> {
    const acted = new Set<string>();
    const act = async (id: string, intent: MonsterIntent) => {
      acted.add(id);
      const result = game.monsterAct(id, intent);
      await onAction();
      return result;
    };
    const prompt = `Current state of the table:\n${describeState(game)}\n\nYour most recent narration, for continuity:\n${lastNarration(game, 2)}\n\nWhat the server resolved since then (the heroes' actions this round):\n${recentEvents(game)}\n\nIt is now the monsters' turn, in this order: ${block.map((m) => `${m.name} [${m.id}]`).join(', ')}. Call monster_action once for each of them. When you have the results, narrate the heroes' actions above and the monsters' turns together as one short passage.`;
    let text: string | null = null;
    try {
      text = await this.converse(prompt, [MONSTER_TOOL], async (name, input) => {
        if (name !== 'monster_action') throw new Error(`Unknown tool ${name}`);
        const i = input as { monster_id: string; target_id: string; attack: string; tactic: MonsterIntent['tactic'] };
        if (!block.some((m) => m.id === i.monster_id)) throw new Error(`It is not ${i.monster_id}'s turn. Monsters acting now: ${block.map((m) => m.id).join(', ')}.`);
        if (acted.has(i.monster_id)) throw new Error(`${i.monster_id} has already acted this round.`);
        if (game.s.phase !== 'combat') return { note: 'Combat is already over.' };
        return act(i.monster_id, { targetId: i.target_id, attack: i.attack, tactic: i.tactic });
      });
    } catch (err) {
      this.report(err);
    }
    // Anything the model skipped still gets its turn.
    for (const m of block) {
      if (!acted.has(m.id) && m.alive && game.s.phase === 'combat') await act(m.id, {});
    }
    return text;
  }

  async chat(game: Game, playerName: string, text: string, onRoll: () => Promise<void>): Promise<string | null> {
    const prompt = `Current state of the table:\n${describeState(game)}\n\nYour most recent narration, for continuity:\n${lastNarration(game)}\n\nWhat the server resolved since then:\n${recentEvents(game)}\n\nThe player ${playerName} says to you: ${JSON.stringify(text)}\n\nReply to them as the Dungeon Master.`;
    try {
      return await this.converse(prompt, [CHECK_TOOL], async (name, input) => {
        if (name !== 'skill_check') throw new Error(`Unknown tool ${name}`);
        const i = input as { character_id: string; ability: AbilityKey; skill: string; dc: number };
        if (!ABILITY_KEYS.includes(i.ability)) throw new Error('Unknown ability');
        const result = game.skillCheck(i.character_id, i.ability, i.skill, Math.max(1, Math.min(30, Math.round(i.dc))));
        await onRoll();
        return result;
      });
    } catch (err) {
      this.report(err);
      return 'The Dungeon Master is lost in thought for a moment. Try again shortly.';
    }
  }
}

export function createDM(env: NodeJS.ProcessEnv): DungeonMaster | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  const effort = (['low', 'medium', 'high', 'xhigh', 'max'] as const).find((e) => e === env.HEARTHFORGE_DM_EFFORT) ?? 'low';
  return new ClaudeDM({ model: env.HEARTHFORGE_DM_MODEL || 'claude-opus-5-5', effort, apiKey: env.ANTHROPIC_API_KEY });
}
