// The AI Dungeon Master, backed by the Claude API.
// The server stays authoritative: Claude proposes through tools, the engine
// validates and resolves with real dice, and Claude narrates the result.
import Anthropic from '@anthropic-ai/sdk';
import { ITEMS } from '../../../shared/content';
import { ITEM_ICON_IDS } from '../../../shared/items';
import { COMPASS, type Compass } from '../../../shared/hex';
import { DISPOSITIONS, ITEM_CATEGORIES, LOCATION_KINDS, MOODS, RARITIES, type AbilityKey, type Disposition, type LocationKind, type Mood, type QuestStatus } from '../../../shared/types';
import { MONSTERS } from '../data/monsters';
import type { Beat, Game, Monster, MonsterIntent } from '../game/engine';
import { DM_SYSTEM_PROMPT, describeBeats, describeCombat, describeWorld, transcript } from './context';
import { resolveModels, tierForBeats, tierForMonsters, tierForReply, type ModelConfig, type Tier } from './models';
import { defaultActions, scriptedScene } from './scripted';
import type { DungeonMaster, Scene } from './types';

type Msg = Anthropic.Beta.BetaMessageParam;
type Tool = Anthropic.Beta.BetaTool;
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Models that accept the server-side refusal fallback parameter. */
const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-2', 'claude-fable-5-1', 'claude-sonnet-5-5'];
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
/** Journal entries kept verbatim; older ones are condensed into the chronicle. */
const JOURNAL_KEEP = 20;
const JOURNAL_LIMIT = 45;

const str = (description: string) => ({ type: 'string', description });
const int = (description: string) => ({ type: 'integer', description });
function tool(name: string, description: string, properties: Record<string, unknown>): Tool {
  return { name, description, strict: true, input_schema: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } };
}

const MONSTER_TOOL = tool(
  'monster_action',
  "Take one monster's whole turn: it moves according to the tactic, then makes one attack if the target is in reach. The server rolls the dice and returns what happened. Call this exactly once for each monster whose turn it is; you can call it for several monsters in the same response.",
  {
    monster_id: str('Id of the acting monster, for example "m3".'),
    target_id: str('Id of the hero to attack, for example "pc1". Unconscious heroes cannot be targeted.'),
    attack: str("Name of one of the monster's attacks, for example \"Scimitar\"."),
    tactic: {
      type: 'string',
      enum: ['engage', 'hold_position', 'retreat'],
      description: 'engage: move as needed to make the attack. hold_position: stay put and attack only if already in range. retreat: back away from the heroes, then use a ranged attack if it has one.',
    },
  },
);

const SCENE_TOOL = tool(
  'scene',
  'Deliver your narration to the players as a scene card. Call this once, last, on every turn; your turn ends when you call it.',
  {
    title: str('Short heading for the card: the place or the moment, for example "The Gilded Anvil" or "Ambush on the hill road".'),
    mood: { type: 'string', enum: [...MOODS], description: 'Sets the colour of the card.' },
    narration: str('What the players read. Two to five sentences of plain text, at most two short paragraphs.'),
    suggested_actions: { type: 'array', items: { type: 'string' }, description: 'Two to four short things the players might do next, each a few words. Empty during combat.' },
    journal_entry: str('One line to remember from this exchange, or an empty string if nothing lasting happened.'),
    important: { type: 'boolean', description: 'True when the story has reached a turning point and the next exchange deserves extra care.' },
  },
);

const STORY_TOOLS: Tool[] = [
  tool('skill_check', 'Ask the server to roll an ability check for a hero attempting something with an uncertain outcome. The players see the roll. Returns the result to narrate from.', {
    character_id: str('Id of the hero making the check, for example "pc1".'),
    ability: { type: 'string', enum: ABILITY_KEYS },
    skill: str('Skill name in lower case, for example "perception" or "persuasion", or an empty string for a raw ability check.'),
    dc: int('Difficulty class. 10 easy, 13 moderate, 16 hard, 19 very hard.'),
  }),
  tool('remember_npc', 'Save or update a named character in your memory. Call it when you introduce someone or the party learns something lasting about them. Matching is by name.', {
    name: str("The character's full name."),
    role: str('Who they are in a few words, for example "blacksmith\'s apprentice". Empty string to leave unchanged.'),
    description: str('One or two sentences on personality and situation. Empty string to leave unchanged.'),
    appearance: str('One sentence describing how they look: age, build, hair, clothing, distinguishing marks. Only used the first time; it is then fixed so pictures of them stay consistent. Empty string if already given.'),
    disposition: { type: 'string', enum: [...DISPOSITIONS], description: 'How they currently feel about the party.' },
    location_id: str('Id of the location where they are. Empty string for the place the party is in now.'),
    note: str('A new fact worth remembering about them, or an empty string.'),
  }),
  tool('create_location', 'Add a new place to the world so the party can find it again. It is marked on their map. Use direction "here" for a place inside or beside where the party is now (a shop in town, a cave mouth in this hex).', {
    name: str('Name of the place.'),
    kind: { type: 'string', enum: [...LOCATION_KINDS] },
    description: str('One or two sentences on what it is and what goes on there.'),
    appearance: str('One sentence describing how it looks, kept fixed so later pictures of it stay consistent.'),
    direction: { type: 'string', enum: ['here', ...COMPASS], description: 'Direction from the party.' },
    distance: int('Distance from the party in hexes (one hex is 6 miles). 0 for "here"; otherwise 1 to 8.'),
  }),
  tool('update_quest', 'Create a quest, add progress to it, or mark it completed or failed. Matching is by title.', {
    title: str('Quest title. Reuse the exact title to update an existing quest.'),
    status: { type: 'string', enum: ['active', 'completed', 'failed'] },
    summary: str('What the quest is and who gave it. Empty string to leave unchanged.'),
    note: str('A line of progress to add, or an empty string.'),
  }),
  tool('record_deed', 'Record something the party did that the world would remember them for.', {
    text: str('One sentence, in the past tense.'),
  }),
  tool('award_xp', 'Give the party experience for an achievement outside combat. The server splits it between the heroes and caps large awards.', {
    amount: int('Total experience for the party. 25 to 100 is typical.'),
    reason: str('What it is for, in a few words.'),
  }),
  tool('change_gold', "Add to or take from the party's shared gold: purchases, sales, payments, bribes, found coin. Fails if the party cannot afford it.", {
    amount: int('Gold pieces; negative when the party pays.'),
    reason: str('What it is for, in a few words.'),
  }),
  tool('give_item', 'Put an item from the catalogue into a hero\'s backpack.', {
    character_id: str('Id of the hero who receives it.'),
    item_id: { type: 'string', enum: Object.keys(ITEMS) },
    quantity: int('How many. Usually 1.'),
  }),
  tool('give_story_item', "Put something that is not in the catalogue into a hero's backpack: a clue, a keepsake, a letter, a key, a trophy, odd loot. Call it whenever a hero pockets, is handed or buys such a thing, so it shows up in their inventory. Reusing the name of an existing item hands out more of it.", {
    character_id: str('Id of the hero who receives it.'),
    name: str('Short name as the players will see it, for example "Notched bone splinter". Use this exact name whenever you mention the item afterwards.'),
    description: str('One or two sentences on what it is and looks like, as the hero would see it. No hidden truths.'),
    category: { type: 'string', enum: [...ITEM_CATEGORIES], description: 'quest: needed for a quest. clue: evidence or a lead. key: opens something. document: letters, maps, books. trinket: keepsakes and curios. material: ingredients, pelts, ore. consumable, weapon, armor, tool: as named.' },
    icon: { type: 'string', enum: ITEM_ICON_IDS, description: 'The picture that fits best, or "auto" to let the server choose from the name.' },
    rarity: { type: 'string', enum: [...RARITIES], description: 'common for nearly everything. uncommon or rare only for things that are truly special.' },
    value: int('What a merchant would pay in gold pieces. 0 for things with no market value. Capped by the server.'),
    quantity: int('How many. Usually 1.'),
    quest_item: { type: 'boolean', description: 'True if losing it would break a quest or a lead. Such items cannot leave the party by accident.' },
    base_item: { type: 'string', enum: ['none', ...Object.keys(ITEMS)], description: 'For gear that should work in play, the catalogue item whose rules it uses: an orcish cleaver might use "handaxe", a bitter draught "potion_healing". "none" for everything else. Story items never have rules of their own.' },
    note: str('Where it came from or what is known about it so far, in one line, or an empty string.'),
  }),
  tool('update_story_item', 'Change a story item as the party learns more: add what they found out, rewrite its description, or rename it once its true nature is known.', {
    item: str('Current name or id of the story item.'),
    name: str('New name, or an empty string to keep the name.'),
    description: str('New description, or an empty string to keep it.'),
    note: str('A new fact the party learned about it, or an empty string.'),
    quest_item: { type: 'string', enum: ['unchanged', 'yes', 'no'], description: 'Change whether it is protected as a quest item.' },
  }),
  tool('take_item', "Remove an item from a hero because the story used it up, or the party sold it, gave it away, or lost it. Works for catalogue and story items. Pair a sale with change_gold.", {
    character_id: str('Id of the hero who has it, or an empty string to look through the whole party.'),
    item: str('Name or id of the item.'),
    quantity: int('How many to take. Usually 1.'),
    allow_quest_item: { type: 'boolean', description: 'Quest items are refused unless this is true. Set it only when the story truly consumes the item or the party knowingly hands it over.' },
  }),
  tool('start_combat', 'Begin a fight. The server builds a battle map, places the party and the monsters, and rolls initiative. Counts are for a party of four and are scaled down for smaller parties.', {
    monsters: {
      type: 'array',
      description: 'The enemies, grouped by type.',
      items: { type: 'object', properties: { type: { type: 'string', enum: Object.keys(MONSTERS) }, count: int('How many of this type.') }, required: ['type', 'count'], additionalProperties: false },
    },
    reason: str('One sentence on how the fight started, for the record.'),
  }),
  tool('delve', 'The party pushes into the next uncleared section of the dungeon it is standing in. The server sets up that fight.', {}),
  tool('move_to_place', "Move the party to another known place in its current hex, such as into a tavern in the town it is in.", {
    location_id: str('Id of the place.'),
  }),
  tool('advance_time', 'Let time pass for activities that take a while, such as a long conversation, a search or a meal.', {
    minutes: int('Minutes to advance, 1 to 720.'),
  }),
  SCENE_TOOL,
];

interface SceneInput {
  title: string;
  mood: Mood;
  narration: string;
  suggested_actions: string[];
  journal_entry: string;
  important: boolean;
}

export class ClaudeDM implements DungeonMaster {
  readonly mode = 'claude' as const;
  readonly model: string;
  readonly models: ModelConfig;
  private client: Anthropic;
  private effort: Effort;
  private maintaining = false;

  constructor(opts: { models?: ModelConfig; model?: string; effort: Effort; apiKey?: string }) {
    this.models = opts.models ?? { background: opts.model!, standard: opts.model!, key: opts.model!, forced: opts.model! };
    this.model = this.models.standard;
    this.effort = opts.effort;
    this.client = new Anthropic({ apiKey: opts.apiKey, timeout: 90_000, maxRetries: 1 });
  }

  /**
   * Run a tool loop to completion. `handle` executes one tool call and returns the
   * JSON-serialisable result. The loop ends when Claude answers in plain text or
   * calls the scene tool, which is its way of handing over the finished narration.
   */
  private async converse(
    purpose: string,
    tier: Tier,
    user: string,
    tools: Tool[],
    handle: (name: string, input: unknown) => Promise<unknown>,
    system = DM_SYSTEM_PROMPT,
  ): Promise<{ text: string | null; scene: SceneInput | null }> {
    const model = this.models[tier];
    console.log(`[dm] ${purpose}: tier=${tier} model=${model}`);
    const messages: Msg[] = [{ role: 'user', content: user }];
    const useFallbacks = FALLBACK_MODELS.includes(model);
    for (let turn = 0; turn < 8; turn++) {
      const response = await this.client.beta.messages.create({
        model,
        max_tokens: 8000,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: this.effort },
        ...(tools.length ? { tools } : {}),
        ...(useFallbacks ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
        messages,
      });
      if (response.stop_reason === 'refusal') {
        console.warn('[dm] request declined:', response.stop_details?.category ?? 'unknown');
        return { text: null, scene: null };
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
        return { text: text || null, scene: null };
      }
      messages.push({ role: 'assistant', content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      let scene: SceneInput | null = null;
      for (const call of calls) {
        if (call.name === 'scene') { scene = call.input as SceneInput; continue; }
        try {
          results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(await handle(call.name, call.input)) });
        } catch (err) {
          results.push({ type: 'tool_result', tool_use_id: call.id, content: err instanceof Error ? err.message : 'Tool failed', is_error: true });
        }
      }
      if (scene) return { text: null, scene };
      messages.push({ role: 'user', content: results });
    }
    return { text: null, scene: null };
  }

  private report(err: unknown) {
    if (err instanceof Anthropic.AuthenticationError) console.error('[dm] The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.');
    else if (err instanceof Anthropic.RateLimitError) console.error('[dm] Rate limited by the Claude API; using scripted behaviour for this beat.');
    else if (err instanceof Anthropic.APIError) console.error(`[dm] Claude API error ${err.status}: ${err.message}`);
    else console.error('[dm] Unexpected error:', err);
  }

  /** Executes the DM's world-changing tools against the engine. */
  private storyHandler(game: Game, onUpdate: () => Promise<void>) {
    return async (name: string, raw: unknown): Promise<unknown> => {
      const i = raw as Record<string, any>;
      const result = ((): unknown => {
        switch (name) {
          case 'skill_check':
            if (!ABILITY_KEYS.includes(i.ability)) throw new Error('Unknown ability');
            return game.skillCheck(String(i.character_id), i.ability as AbilityKey, String(i.skill ?? ''), Math.max(1, Math.min(30, Math.round(i.dc))));
          case 'remember_npc':
            return game.rememberNpc({ name: String(i.name), role: i.role, description: i.description, appearance: i.appearance, disposition: i.disposition as Disposition, locationId: i.location_id, note: i.note });
          case 'create_location':
            return game.createLocation({ name: String(i.name), kind: i.kind as LocationKind, description: String(i.description ?? ''), appearance: i.appearance, direction: i.direction as Compass | 'here', distance: Number(i.distance) });
          case 'update_quest':
            return game.setQuest({ title: String(i.title), status: i.status as QuestStatus, summary: i.summary, note: i.note });
          case 'record_deed':
            return game.recordDeed(String(i.text));
          case 'award_xp':
            return game.awardXp(Number(i.amount), String(i.reason ?? ''));
          case 'change_gold':
            return game.changeGold(Number(i.amount), String(i.reason ?? ''));
          case 'give_item':
            return game.grantItem(String(i.character_id), String(i.item_id), Number(i.quantity));
          case 'give_story_item':
            return game.giveStoryItem({
              characterId: String(i.character_id), name: String(i.name ?? ''), description: String(i.description ?? ''), category: i.category, icon: String(i.icon ?? 'auto'),
              rarity: String(i.rarity ?? 'common'), value: Number(i.value), quantity: Number(i.quantity), quest: !!i.quest_item, baseItemId: String(i.base_item ?? 'none'), note: String(i.note ?? ''),
            });
          case 'update_story_item':
            return game.updateStoryItem({ item: String(i.item ?? ''), name: String(i.name ?? ''), description: String(i.description ?? ''), note: String(i.note ?? ''), ...(i.quest_item === 'yes' || i.quest_item === 'no' ? { quest: i.quest_item === 'yes' } : {}) });
          case 'take_item':
            return game.takeItem({ characterId: String(i.character_id ?? ''), item: String(i.item ?? ''), quantity: Number(i.quantity), allowQuest: !!i.allow_quest_item });
          case 'start_combat': {
            const groups = (Array.isArray(i.monsters) ? i.monsters : []).map((m: any) => ({ defId: String(m.type), count: Number(m.count) }));
            game.startEncounter(groups, { source: 'story', context: String(i.reason ?? '') });
            game.dropBeats('combat_start'); // the DM narrates the opening itself
            return { started: true, enemies: game.s.monsters.map((m) => m.name), note: 'Combat has begun on the battle map. Describe its opening in the scene and suggest no actions.' };
          }
          case 'delve':
            game.delve();
            game.dropBeats('combat_start');
            return { started: true, enemies: game.s.monsters.map((m) => m.name), note: 'Combat has begun on the battle map. Describe its opening in the scene and suggest no actions.' };
          case 'move_to_place':
            game.goTo(String(i.location_id));
            game.dropBeats('arrive'); // the DM is already narrating this arrival
            return { now_at: game.place()?.name, people_here: game.presentNpcs().map((n) => `${n.name} (${n.role})`) };
          case 'advance_time':
            game.advanceTime(Math.max(1, Math.min(720, Number(i.minutes) || 0)));
            return { ok: true };
          default:
            throw new Error(`Unknown tool ${name}`);
        }
      })();
      await onUpdate();
      return result;
    };
  }

  private finish(game: Game, out: { text: string | null; scene: SceneInput | null }): Scene | null {
    const place = game.s.world ? game.place() : null;
    if (out.scene) {
      const s = out.scene;
      game.addJournal(String(s.journal_entry ?? ''));
      game.s.escalate = !!s.important;
      const text = String(s.narration ?? '').trim();
      if (!text) return null;
      return {
        title: String(s.title ?? '').trim() || place?.name || 'The wilds',
        mood: MOODS.includes(s.mood) ? s.mood : 'calm',
        text,
        actions: game.s.phase === 'explore' && Array.isArray(s.suggested_actions) ? s.suggested_actions.map(String) : [],
      };
    }
    game.s.escalate = false;
    // Plain text instead of the scene tool still reaches the table.
    return out.text ? { title: place?.name ?? 'The wilds', mood: 'calm', text: out.text, actions: defaultActions(game) } : null;
  }

  private situation(game: Game): string {
    return game.s.phase === 'combat' ? describeCombat(game) : describeWorld(game);
  }

  async narrate(game: Game, beats: Beat[], onUpdate: () => Promise<void>): Promise<Scene | null> {
    if (!beats.length) return null;
    const prompt = `Current state:\n${this.situation(game)}\n\nRecent play, oldest first:\n${transcript(game)}\n\nNarrate this now:\n${describeBeats(beats)}\n\nSave anything new you introduce with your memory tools, then call scene.`;
    try {
      const out = await this.converse(`narrate ${beats.map((b) => b.kind).join('+')}`, tierForBeats(beats), prompt, STORY_TOOLS, this.storyHandler(game, onUpdate));
      return this.finish(game, out) ?? scriptedScene(game, beats);
    } catch (err) {
      this.report(err);
      return scriptedScene(game, beats);
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
    const prompt = `Current state:\n${describeCombat(game)}\n\nRecent play, oldest first:\n${transcript(game, 16)}\n\nIt is now the monsters' turn, in this order: ${block.map((m) => `${m.name} [${m.id}]`).join(', ')}. Call monster_action once for each of them. When you have the results, narrate the heroes' latest actions and the monsters' turns together as one short passage in plain text.`;
    let text: string | null = null;
    try {
      const out = await this.converse('monsters', tierForMonsters(game, block), prompt, [MONSTER_TOOL], async (name, input) => {
        if (name !== 'monster_action') throw new Error(`Unknown tool ${name}`);
        const i = input as { monster_id: string; target_id: string; attack: string; tactic: MonsterIntent['tactic'] };
        if (!block.some((m) => m.id === i.monster_id)) throw new Error(`It is not ${i.monster_id}'s turn. Monsters acting now: ${block.map((m) => m.id).join(', ')}.`);
        if (acted.has(i.monster_id)) throw new Error(`${i.monster_id} has already acted this round.`);
        if (game.s.phase !== 'combat') return { note: 'Combat is already over.' };
        return act(i.monster_id, { targetId: i.target_id, attack: i.attack, tactic: i.tactic });
      });
      text = out.text;
    } catch (err) {
      this.report(err);
    }
    // Anything the model skipped still gets its turn.
    for (const m of block) {
      if (!acted.has(m.id) && m.alive && game.s.phase === 'combat') await act(m.id, {});
    }
    return text;
  }

  async respond(game: Game, playerName: string, text: string, onUpdate: () => Promise<void>): Promise<Scene | null> {
    const inCombat = game.s.phase === 'combat';
    const ask = inCombat
      ? `In the middle of the fight, the player ${playerName} says to you: ${JSON.stringify(text)}\n\nAnswer briefly as the Dungeon Master. Attacks, spells and movement happen through the battle map, so point them there for those. Then call scene with no suggested actions.`
      : `The player ${playerName} says or does this: ${JSON.stringify(text)}\n\nResolve it as the Dungeon Master: use your tools for anything that changes the world or needs a roll, then call scene.`;
    const prompt = `Current state:\n${this.situation(game)}\n\nRecent play, oldest first:\n${transcript(game)}\n\n${ask}`;
    try {
      const tools = inCombat ? STORY_TOOLS.filter((t) => ['skill_check', 'scene'].includes(t.name)) : STORY_TOOLS;
      const out = await this.converse('reply', tierForReply(game), prompt, tools, this.storyHandler(game, onUpdate));
      return this.finish(game, out);
    } catch (err) {
      this.report(err);
      return { title: 'A pause at the table', mood: 'calm', text: 'The Dungeon Master is lost in thought for a moment. Try again shortly.', actions: [] };
    }
  }

  /** Condense old journal entries into the running chronicle, on the cheapest model. */
  async maintain(game: Game): Promise<void> {
    const mem = game.s.memory;
    if (this.maintaining || mem.journal.length <= JOURNAL_LIMIT) return;
    this.maintaining = true;
    try {
      const old = mem.journal.slice(0, mem.journal.length - JOURNAL_KEEP);
      const prompt = `Story so far:\n${mem.chronicle || '(nothing yet)'}\n\nNew journal entries, oldest first:\n${old.map((j) => `- Day ${j.day}: ${j.text}`).join('\n')}\n\nRewrite the story so far to include the new entries. Keep names, promises, debts, grudges and unresolved threads; drop colour. At most 250 words of plain prose.`;
      const out = await this.converse('memory summary', 'background', prompt, [], async () => null, 'You keep the campaign notes for a Dungeons & Dragons game. You write compact, factual summaries that a Dungeon Master can rely on later.');
      if (out.text) {
        mem.chronicle = out.text.slice(0, 2500);
        mem.journal.splice(0, old.length);
      }
    } catch (err) {
      this.report(err);
    } finally {
      this.maintaining = false;
    }
  }
}

export function createDM(env: NodeJS.ProcessEnv): ClaudeDM | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  const effort = (['low', 'medium', 'high', 'xhigh', 'max'] as const).find((e) => e === env.HEARTHFORGE_DM_EFFORT) ?? 'low';
  return new ClaudeDM({ models: resolveModels(env), effort, apiKey: env.ANTHROPIC_API_KEY });
}
