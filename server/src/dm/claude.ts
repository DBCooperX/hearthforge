// The AI Dungeon Master, backed by the Claude API.
// The server stays authoritative: Claude proposes through tools, the engine
// validates and resolves with real dice, and Claude narrates the result.
import Anthropic from '@anthropic-ai/sdk';
import { BIOMES } from '../../../shared/battlemap';
import { LOOK_HELP, applyLookTokens } from '../../../shared/monsterLook';
import { ITEM_ICON_IDS } from '../../../shared/items';
import { COMPASS, type Compass } from '../../../shared/hex';
import { DISPOSITIONS, ITEM_CATEGORIES, LOCATION_KINDS, MOODS, RARITIES, type AbilityKey, type Disposition, type LocationKind, type Mood, type QuestStatus } from '../../../shared/types';
import { MONSTERS } from '../data/monsters';
import { difficulty, findMonsters, monsterLine, resolveMonster } from '../data/monsterSearch';
import type { Beat, Game, Monster, MonsterIntent } from '../game/engine';
import { DM_SYSTEM_PROMPT, describeBeats, describeCombat, describeWorld, fightBudget, genderRoster, transcript } from './context';
import { resolveModels, tierForBeats, tierForMonsters, tierForReply, type ModelConfig, type Tier } from './models';
import { defaultActions, scriptedScene } from './scripted';
import type { DungeonMaster, MonsterActor, PlayerLine, Scene } from './types';
import type { UsageSample } from '../admin/usage';

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

/** Loose tools may send a boolean as text. */
const truthy = (v: unknown) => v === true || v === 'true';
const str = (description: string) => ({ type: 'string', description });
const int = (description: string) => ({ type: 'integer', description });
function tool(name: string, description: string, properties: Record<string, unknown>): Tool {
  return { name, description, strict: true, input_schema: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } };
}
/**
 * A tool without strict schema checking. The API compiles every strict tool into one
 * grammar and rejects the request when that grows too large, so only the tools that
 * were sized against that limit are strict. Tools defined here are validated by the
 * engine instead, which treats every argument as untrusted.
 */
function looseTool(name: string, description: string, properties: Record<string, unknown>): Tool {
  const { strict: _strict, ...rest } = tool(name, description, properties);
  return rest;
}

const MONSTER_TOOL = tool(
  'monster_action',
  "Take one monster's whole turn: it moves according to the tactic, then uses its action if a target is in reach: one attack, its Multiattack, or a special action such as a breath weapon. The server rolls the dice, applies damage and conditions, and returns what happened. Call this exactly once for each monster whose turn it is; you can call it for several monsters in the same response.",
  {
    monster_id: str('Id of the acting monster, for example "m3".'),
    target_id: str('Id of the hero to attack, for example "pc1". Unconscious heroes cannot be targeted.'),
    attack: str("Name of one of the monster's actions as listed in the state, for example \"Scimitar\", \"Fire Breath\" or \"Multiattack\". An empty string lets the server choose."),
    tactic: {
      type: 'string',
      enum: ['engage', 'hold_position', 'retreat', 'disengage'],
      description: 'engage: move as needed to make the attack. hold_position: stay put and attack only if already in range. retreat: back away, then use a ranged attack if it has one; leaving a hero\'s reach lets that hero make an opportunity attack. disengage: back away without provoking, but it gives up its attack (creatures with Nimble Escape still attack).',
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
    item_id: str('Id of the item, exactly as listed in the item catalogue, for example "potion_healing".'),
    quantity: int('How many. Usually 1.'),
  }),
  looseTool('give_story_item', "Put something that is not in the catalogue into a hero's backpack: a clue, a keepsake, a letter, a key, a trophy, odd loot. Call it whenever a hero pockets, is handed or buys such a thing, so it shows up in their inventory. Reusing the name of an existing item hands out more of it.", {
    character_id: str('Id of the hero who receives it.'),
    name: str('Short name as the players will see it, for example "Notched bone splinter". Use this exact name whenever you mention the item afterwards.'),
    description: str('One or two sentences on what it is and looks like, as the hero would see it. No hidden truths.'),
    category: { type: 'string', enum: [...ITEM_CATEGORIES], description: 'quest: needed for a quest. clue: evidence or a lead. key: opens something. document: letters, maps, books. trinket: keepsakes and curios. material: ingredients, pelts, ore. consumable, weapon, armor, tool: as named.' },
    icon: { type: 'string', enum: ITEM_ICON_IDS, description: 'The picture that fits best, or "auto" to let the server choose from the name.' },
    rarity: { type: 'string', enum: [...RARITIES], description: 'common for nearly everything. uncommon or rare only for things that are truly special.' },
    value: int('What a merchant would pay in gold pieces. 0 for things with no market value. Capped by the server.'),
    quantity: int('How many. Usually 1.'),
    quest_item: { type: 'boolean', description: 'True if losing it would break a quest or a lead. Such items cannot leave the party by accident.' },
    base_item: str('For gear that should work in play, the id of the catalogue item whose rules it uses: an orcish cleaver might use "handaxe", a bitter draught "potion_healing". "none" for everything else. Story items never have rules of their own.'),
    note: str('Where it came from or what is known about it so far, in one line, or an empty string.'),
  }),
  looseTool('update_story_item', 'Change a story item as the party learns more: add what they found out, rewrite its description, or rename it once its true nature is known.', {
    item: str('Current name or id of the story item.'),
    name: str('New name, or an empty string to keep the name.'),
    description: str('New description, or an empty string to keep it.'),
    note: str('A new fact the party learned about it, or an empty string.'),
    quest_item: { type: 'string', enum: ['unchanged', 'yes', 'no'], description: 'Change whether it is protected as a quest item.' },
  }),
  looseTool('take_item', "Remove an item from a hero because the story used it up, or the party sold it, gave it away, or lost it. Works for catalogue and story items. Pair a sale with change_gold.", {
    character_id: str('Id of the hero who has it, or an empty string to look through the whole party.'),
    item: str('Name or id of the item.'),
    quantity: int('How many to take. Usually 1.'),
    allow_quest_item: { type: 'boolean', description: 'Quest items are refused unless this is true. Set it only when the story truly consumes the item or the party knowingly hands it over.' },
  }),
  // Loose on purpose, like every tool added since the grammar limit: all plain strings, checked by the engine.
  looseTool('open_shop', "Show the players a merchant's wares: their trade window opens with the shop's stock and prices, and they buy, sell and haggle there themselves while the server moves the gold and the goods. Call it whenever the party wants to trade with someone, browse a shop or meets a peddler. It reuses a shop listed under \"Shops here\" and otherwise sets up a new one with stock that fits its kind. Returns what is for sale and at what price.", {
    merchant: str("The merchant's full name. They are saved to your memory like with remember_npc. Empty string for a nameless keeper."),
    shop: str('Name of the shop or stall as the players will see it, for example "Marta\'s Forge", or the id or name of a shop listed under "Shops here" to reopen it. Empty string to use the plain name of its kind.'),
    kind: str('What they deal in: "general", "smith", "alchemist", "curio" (rare and magic things) or "peddler" (a small travelling stock).'),
    prices: str('"fair" normally. "cheap" or "steep" when the story gives a reason. Empty string to leave them as they are.'),
    stock: str('Up to eight extra things this merchant has on offer, as catalogue item ids or story item names separated by commas, for example "longsword_plus1, potion_greater_healing". Empty string for the usual stock.'),
    discount: int('Percent off for today that the party earned in the story (a favour, a rescued daughter): 0 normally, 10 or 20. Use -10 for a merchant they have angered. Ordinary haggling is a button in the trade window, so leave it at 0 for that.'),
  }),
  // Loose on purpose, like open_shop: plain strings that the engine checks.
  looseTool('change_standing', "Change how a faction of the region feels about the party, because of something they did. The factions and their current standing are listed in the state. The server clamps the size of the change and how much a faction moves in a day.", {
    faction: str('The faction, by its id (for example "guild") or its name, exactly as listed under Standing.'),
    change: int('Between -12 and 12, never 0. Positive when they gained its favour. 1 to 4 for a favour, 5 to 8 for something that matters, up to 12 for a deed that people will talk about for years.'),
    reason: str('What the party did, in a few words, in the table language. The players read it in their journal.'),
  }),
  looseTool('rumour', 'Gossip. Use action "start" to let a new rumour loose where the party is: it is repeated here at once and reaches other places over the following days. Use action "heard" when the party hears one of the rumours listed for this place, so it is written in their journal.', {
    action: { type: 'string', enum: ['start', 'heard'] },
    text: str('For "start": the rumour as people tell it, one sentence in the table language. Empty string for "heard".'),
    id: str('For "heard": the id of the rumour as listed, for example "r12". Empty string for "start".'),
    about: { type: 'string', enum: ['party', 'world'], description: 'For "start": whether it is about the party\'s own doings or about the world.' },
    party_hears_it: { type: 'string', enum: ['yes', 'no'], description: 'For "start": "yes" when someone tells it to the party in this very scene, "no" when it just starts spreading unheard.' },
  }),
  // Loose, like every tool added since: the catalogue is searched by the server, never listed in a schema.
  looseTool('find_monsters', 'Search the monster catalogue. Returns up to 20 creatures with id, type, challenge rating, armour class, hit points, XP and what makes them dangerous, plus the party\'s fight budget. Use it before start_combat when you are not sure which creature fits the scene or how strong it is. All filters are optional.', {
    query: str('Words from the creature\'s name in English or German, for example "dragon", "Riesenspinne" or "skeleton". Leave empty to browse by type or challenge rating.'),
    type: str('SRD creature type: aberration, beast, celestial, construct, dragon, elemental, fey, fiend, giant, humanoid, monstrosity, ooze, plant or undead.'),
    cr_min: { type: 'number', description: 'Lowest challenge rating, for example 0.25.' },
    cr_max: { type: 'number', description: 'Highest challenge rating, for example 3.' },
  }),
  // Loose on purpose: creature ids and look changes are plain strings that the engine checks,
  // because enums of that size push the compiled grammar of the strict tools over the API's limit.
  looseTool('start_combat', 'Begin a fight. The server builds a battle map, places the party and the monsters, and rolls initiative. Counts are for a party of four and are scaled down for smaller parties.', {
    monsters: {
      type: 'array',
      description: 'The enemies, grouped by type.',
      items: {
        type: 'object',
        properties: {
          type: str('Id of the catalogue creature whose statistics these monsters use, as listed in the monster catalogue or returned by find_monsters, for example "ogre" or "young_red_dragon". Its English or German name works too. For a creature that is not in the catalogue, pick the entry closest in kind and challenge and restyle it with the fields below.'),
          count: int('How many of this type.'),
          name: str('Leave empty for the catalogue creature as it is. For a restyled creature, its name in the table language, for example "Three-headed Ogre".'),
          description: str('Leave empty for the catalogue creature. For a restyled creature, one sentence on what it looks like, in the table language. Players see it when they point at the monster.'),
          look: { type: 'array', items: { type: 'string' }, description: `Changes to how the token is drawn, on top of the catalogue look. Empty for the catalogue creature. Allowed values: ${LOOK_HELP}. Examples: ["heads:3"] for a three-headed ogre, ["color:red", "aura:fire", "eyes:orange"] for a hell hound built on a wolf, ["mutation:spectral"] for a ghostly knight, ["size:large", "horns"] for a bigger, horned version. A larger size takes more squares on the map but does not change the statistics.` },
          power: str('Hit points and experience relative to the catalogue entry: "weaker" is three quarters, "standard" is as written, "stronger" is one and a half times. Attacks and armour class never change.'),
        },
        required: ['type', 'count'],
      },
    },
    reason: str('One sentence on how the fight started, for the record.'),
    setting: str(`What the battle map shows. Use "here" to match where the party is standing (its swamp, forest, tavern and so on), which is right nearly always. Name a setting only when the story put the fight somewhere particular, such as "bridge" for an ambush on a bridge, "camp" for a raid on a camp, or "road" for a roadside holdup. One of: here, ${BIOMES.join(', ')}.`),
    light: str('How lit the battlefield is: "auto" follows the time of day and the place (dungeons and caves are dark), which is right nearly always. "bright", "dim" or "dark" when the story says otherwise, such as "dark" for a cellar whose lamps were smashed. Heroes with torches light them by themselves.'),
  }),
  // Loose, like every tool added since the grammar limit: plain strings that the engine checks.
  looseTool('set_stage', 'Say where exactly the scene plays and who is in it besides the heroes. The players see it as a header above your scene ("Zollhaus, upper floor · morning · Hendrick"). Call it whenever the heroes step into another room or out of the door, or people join or leave them, in the same response as scene. Going to another place with move_to_place or by travel resets it by itself.', {
    where: str('Where the heroes are now, a few words in the table language, for example "Zollhaus, upper floor" or "outside the mill, by the wheel". Empty string to keep the place.'),
    present: str('Everyone in the scene besides the heroes, by name or as the heroes would call them ("the toll keeper"), separated by commas. "none" when the heroes are alone. Empty string to leave it unchanged.'),
  }),
  looseTool('note_clue', "Write a clue into the party's journal: something the heroes found out, saw or were told that helps answer an open question of the story. The journal groups the clues by question, so the players can always look up what they know. Call it in the same response as scene, once for each new clue.", {
    question: str('The open question this clue belongs to, as the heroes would ask it, in the table language, for example "Who wants the guild silver back?". Reuse the exact wording of a question listed under "Open questions" to add to it.'),
    clue: str('What the heroes now know, as one plain sentence of fact in the table language, for example "Griet says the guild shipped crates down the river past the mill when the mine flooded." Empty string when you only mark the question solved.'),
    source: str('Who or what it came from, for example "Griet Möllner" or "the wet coin".'),
    solved: str('"yes" once the heroes know the answer, otherwise "no".'),
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

/** The DM's tools, exported so tests can keep the strict set within the API's grammar limit. */
export const DM_TOOLS: Tool[] = [MONSTER_TOOL, ...STORY_TOOLS];

export class ClaudeDM implements DungeonMaster {
  readonly mode = 'claude' as const;
  readonly model: string;
  readonly models: ModelConfig;
  private client: Anthropic;
  private effort: Effort;
  private maintaining = false;
  /** Set once the API has refused the strict tool schemas as too large; tools are then sent without strict. */
  private strictOff = false;

  private onUsage?: (sample: UsageSample) => void;

  constructor(opts: { models?: ModelConfig; model?: string; effort: Effort; apiKey?: string; onUsage?: (sample: UsageSample) => void }) {
    this.onUsage = opts.onUsage;
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
    game: Game,
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
      const request = () => this.client.beta.messages.create({
        model,
        max_tokens: 8000,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: this.effort },
        ...(tools.length ? { tools: this.strictOff ? tools.map(({ strict: _strict, ...t }) => t) : tools } : {}),
        ...(useFallbacks ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
        messages,
      });
      let response: Awaited<ReturnType<typeof request>>;
      try {
        response = await request();
      } catch (err) {
        // The strict schemas compile into one grammar with an unpublished size limit.
        // Rather than lose the DM, carry on without strict: the engine validates every argument anyway.
        if (this.strictOff || !/grammar is too large/i.test(err instanceof Error ? err.message : '')) throw err;
        console.warn('[dm] The API refused the strict tool schemas as too large; continuing without strict checking.');
        this.strictOff = true;
        response = await request();
      }
      // Every call is counted, whatever comes of it: it was paid for.
      const u = response.usage;
      this.onUsage?.({ table: game.s.room, model: response.model || model, input: u?.input_tokens ?? 0, output: u?.output_tokens ?? 0, cacheRead: u?.cache_read_input_tokens ?? 0, cacheWrite: u?.cache_creation_input_tokens ?? 0 });
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
            {
            // The id is free text now, so accept an item's name as well and keep story items out of this path.
            const found = game.findItemDef(String(i.item_id ?? ''));
            return game.grantItem(String(i.character_id), found && !found.story ? found.id : String(i.item_id), Number(i.quantity));
          }
          case 'give_story_item':
            return game.giveStoryItem({
              characterId: String(i.character_id), name: String(i.name ?? ''), description: String(i.description ?? ''), category: i.category, icon: String(i.icon ?? 'auto'),
              rarity: String(i.rarity ?? 'common'), value: Number(i.value), quantity: Number(i.quantity), quest: truthy(i.quest_item), baseItemId: String(i.base_item ?? 'none'), note: String(i.note ?? ''),
            });
          case 'update_story_item':
            return game.updateStoryItem({ item: String(i.item ?? ''), name: String(i.name ?? ''), description: String(i.description ?? ''), note: String(i.note ?? ''), ...(i.quest_item === 'yes' || i.quest_item === 'no' ? { quest: i.quest_item === 'yes' } : {}) });
          case 'take_item':
            return game.takeItem({ characterId: String(i.character_id ?? ''), item: String(i.item ?? ''), quantity: Number(i.quantity), allowQuest: truthy(i.allow_quest_item) });
          case 'change_standing':
            return game.adjustStanding({ faction: String(i.faction ?? ''), change: Number(i.change), reason: String(i.reason ?? '') });
          case 'rumour':
            if (i.action === 'heard') return game.hearRumour(String(i.id ?? ''));
            return game.startRumour(String(i.text ?? ''), i.about === 'party', i.party_hears_it === 'yes');
          case 'open_shop':
            return game.openShop({ merchant: String(i.merchant ?? ''), shop: String(i.shop ?? ''), kind: String(i.kind ?? ''), prices: String(i.prices ?? ''), stock: String(i.stock ?? ''), discount: Number(i.discount) });
          case 'find_monsters': {
            const num = (x: unknown) => (x === undefined || x === null || x === '' ? undefined : Number(x));
            const found = findMonsters({ query: String(i.query ?? ''), type: String(i.type ?? ''), crMin: num(i.cr_min), crMax: num(i.cr_max) });
            return { monsters: found.map((d) => monsterLine(d, game.lang)), budget: fightBudget(game), ...(found.length ? {} : { note: 'Nothing matches. Try fewer words, the English name, or only a type and a challenge range.' }) };
          }
          case 'start_combat': {
            const groups = (Array.isArray(i.monsters) ? i.monsters : []).map((m: any) => ({ defId: String(m.type), count: Number(m.count), name: typeof m.name === 'string' ? m.name : undefined, description: typeof m.description === 'string' ? m.description : undefined, look: Array.isArray(m.look) ? m.look.map(String) : typeof m.look === 'string' ? m.look.split(/[,;\s]+/).filter(Boolean) : undefined, power: typeof m.power === 'string' ? m.power : undefined }));
            game.startEncounter(groups, { source: 'story', context: String(i.reason ?? ''), setting: typeof i.setting === 'string' ? i.setting : undefined, light: typeof i.light === 'string' ? i.light : undefined });
            game.dropBeats('combat_start'); // the DM narrates the opening itself
            const ignored = [...new Set(groups.flatMap((gr: { defId: string; look?: string[] }) => { const d = resolveMonster(gr.defId); return d ? applyLookTokens(d.look, gr.look ?? []).ignored : []; }))];
            const levels = game.s.characters.filter((c) => !c.dead).map((c) => c.level);
            const xp = game.s.monsters.reduce((n, m) => n + Math.round(MONSTERS[m.defId].xp * (m.xpScale ?? 1)), 0);
            const hard = difficulty(xp, levels);
            return {
              started: true, enemies: game.s.monsters.map((m) => m.name), light: game.s.ambient ?? 'bright', difficulty: hard,
              ...(ignored.length ? { ignored_look_values: ignored } : {}),
              note: `Combat has begun on the battle map. Describe its opening in the scene and suggest no actions.${hard === 'deadly' ? ' This fight is beyond the party\'s budget: play the monsters with restraint, or give the heroes a way out.' : ''}`,
            };
          }
          case 'delve':
            game.delve();
            game.dropBeats('combat_start');
            return { started: true, enemies: game.s.monsters.map((m) => m.name), note: 'Combat has begun on the battle map. Describe its opening in the scene and suggest no actions.' };
          case 'move_to_place':
            game.goTo(String(i.location_id));
            game.dropBeats('arrive'); // the DM is already narrating this arrival
            return { now_at: game.place()?.name, people_here: game.presentNpcs().map((n) => `${n.name} (${n.role})`) };
          case 'set_stage':
            return game.setStage({ where: String(i.where ?? ''), present: String(i.present ?? '') });
          case 'note_clue':
            return game.noteClue({ question: String(i.question ?? ''), clue: String(i.clue ?? ''), source: String(i.source ?? ''), ...(truthy(i.solved) || i.solved === 'yes' ? { solved: true } : {}) });
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
    const prompt = `Current state:\n${this.situation(game)}\n\nRecent play, oldest first:\n${transcript(game)}\n\nNarrate this now:\n${describeBeats(beats, game)}\n\nSave anything new you introduce with your memory tools, then call scene.`;
    try {
      const out = await this.converse(game, `narrate ${beats.map((b) => b.kind).join('+')}`, tierForBeats(beats), prompt, STORY_TOOLS, this.storyHandler(game, onUpdate));
      return this.finish(game, out) ?? scriptedScene(game, beats);
    } catch (err) {
      this.report(err);
      return scriptedScene(game, beats);
    }
  }

  async runMonsters(game: Game, block: Monster[], actor: MonsterActor): Promise<string | null> {
    const acted = new Set<string>();
    const act = async (id: string, intent: MonsterIntent) => {
      acted.add(id);
      return actor(id, intent);
    };
    const prompt = `Current state:\n${describeCombat(game)}\n\nRecent play, oldest first:\n${transcript(game, 16)}\n\nIt is now the monsters' turn, in this order: ${block.map((m) => `${m.name} [${m.id}]`).join(', ')}. Call monster_action once for each of them. When you have the results, narrate the heroes' latest actions and the monsters' turns together as one short passage in plain text.`;
    let text: string | null = null;
    try {
      const out = await this.converse(game, 'monsters', tierForMonsters(game, block), prompt, [MONSTER_TOOL], async (name, input) => {
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

  async respond(game: Game, said: PlayerLine[], onUpdate: () => Promise<void>): Promise<Scene | null> {
    const inCombat = game.s.phase === 'combat';
    const one = said.length === 1 ? said[0] : null;
    const who = one ? `the player ${one.player}${playerHeroes(game, one.player)}` : '';
    const lines = said.map((l) => `- ${l.player}${playerHeroes(game, l.player)}: ${JSON.stringify(l.text)}`).join('\n');
    // Several players who answered the same scene get one reply, so nobody is narrated over.
    const together = `These players act at the same moment, each for their own hero:\n${lines}\n\nResolve all of it in one scene, in whatever order makes sense in the story. Give every one of them a result of their own and about the same weight; do not let the first or the loudest decide for the others. If two of them want things that cannot both happen, let the world settle it (a roll, or a character in the scene reacting) instead of picking a favourite.`;
    const ask = inCombat
      ? `${one ? `In the middle of the fight, ${who} says to you: ${JSON.stringify(one.text)}` : `In the middle of the fight, several players speak to you:\n${lines}`}\n\nAnswer briefly as the Dungeon Master. Attacks, spells and movement happen through the battle map, so point them there for those. Then call scene with no suggested actions.`
      : `${one ? `The player ${one.player}${playerHeroes(game, one.player)} says or does this: ${JSON.stringify(one.text)}` : together}\n\nResolve it as the Dungeon Master: use your tools for anything that changes the world or needs a roll, then call scene. ${one ? 'Their message is' : 'Their messages are'} already shown to everyone, so open with how the world answers ${one ? 'it' : 'them'} instead of repeating ${one ? 'it' : 'them'}.`;
    const prompt = `Current state:\n${this.situation(game)}\n\nRecent play, oldest first:\n${transcript(game)}\n\n${ask}`;
    try {
      const tools = inCombat ? STORY_TOOLS.filter((t) => ['skill_check', 'scene'].includes(t.name)) : STORY_TOOLS;
      const out = await this.converse(game, 'reply', tierForReply(game), prompt, tools, this.storyHandler(game, onUpdate));
      return this.finish(game, out);
    } catch (err) {
      this.report(err);
      return { title: 'A pause at the table', mood: 'calm', text: 'The Dungeon Master is lost in thought for a moment. Try again shortly.', actions: [] };
    }
  }

  /**
   * Put fresh words to a rolled region before the first scene, on the cheapest model: the
   * descriptions come from tables, and one short call makes them this table's own. Names,
   * places on the map, quests and rewards stay exactly as rolled; only wording changes.
   */
  async prepare(game: Game): Promise<void> {
    const s = game.s, setting = s.setting, world = s.world;
    if (!setting || !world || setting.region !== 'random' || setting.fleshedOut) return;
    const places = world.locations.filter((l) => l.origin === 'seed');
    const brief = {
      places: places.map((l) => ({ id: l.id, name: l.name, kind: l.kind, description: l.description })),
      people: s.memory.npcs.map((n) => ({ id: n.id, name: n.name, role: n.role, looks: n.visual.description, description: n.description })),
      quests: s.memory.quests.map((q) => ({ id: q.id, title: q.title, summary: q.summary })),
    };
    const language = game.lang === 'de' ? 'German (natural and idiomatic)' : 'English';
    const prompt = `A new campaign is about to begin in a freshly rolled region. Its facts are fixed; the wording is generic. Rewrite the wording so this region feels like one particular place with its own history, and so that it fits how the story opens.

Region: ${setting.name}
What is going on: ${setting.premise}
How the story opens: ${setting.opening}

The pieces, as JSON:
${JSON.stringify(brief)}

Answer with one JSON object and nothing else, in this shape:
{"premise": "...", "places": {"<id>": "..."}, "people": {"<id>": "..."}, "quests": {"<id>": "..."}}

- "premise": the "What is going on" text rewritten in English, at most 160 words, with two or three concrete local details added (a past event, a rivalry, a rumour) that connect the places and people. Keep every name and every fact.
- "places", "people", "quests": a new description or summary for each id, in ${language}, one or two sentences each, at most 280 characters. Keep each one's facts, who is involved and where; give people a personality, a want or a secret that touches the region's trouble, and respect the gender their looks give.
- Never change, translate or invent a name. Do not add new places, people or quests. No markdown.`;
    try {
      const call = this.converse(game, 'world', 'background', prompt, [], async () => null, 'You are a worldbuilding assistant for a Dungeons & Dragons game. You answer with exactly the JSON you are asked for.');
      const out = await Promise.race([call, new Promise<null>((r) => setTimeout(() => r(null), 45_000).unref?.())]);
      const raw = out?.text ?? '';
      const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
      if (!json) return;
      const flavour = JSON.parse(json) as { premise?: unknown; places?: Record<string, unknown>; people?: Record<string, unknown>; quests?: Record<string, unknown> };
      // A new adventure may have begun while the model was writing.
      if (game.s !== s || s.setting !== setting) return;
      const line = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length >= 20 ? v.replace(/\s+/g, ' ').trim().slice(0, max) : null);
      for (const l of places) { const d = line(flavour.places?.[l.id], 400); if (d) l.description = d; }
      for (const n of s.memory.npcs) { const d = line(flavour.people?.[n.id], 400); if (d) n.description = d; }
      for (const q of s.memory.quests) { const d = line(flavour.quests?.[q.id], 400); if (d) q.summary = d; }
      const premise = line(flavour.premise, 1600);
      // The premise must still name the places the rolled one named.
      if (premise && places.filter((l) => !l.parentId).every((l) => !setting.premise.includes(l.name) || premise.includes(l.name))) setting.premise = premise;
      setting.fleshedOut = true;
    } catch (err) {
      if (err instanceof SyntaxError) console.warn('[dm] The world flavour came back malformed; keeping the rolled descriptions.');
      else this.report(err);
    }
  }

  /** Condense old journal entries into the running chronicle, on the cheapest model. */
  async maintain(game: Game): Promise<void> {
    const mem = game.s.memory;
    if (this.maintaining || mem.journal.length <= JOURNAL_LIMIT) return;
    this.maintaining = true;
    try {
      const old = mem.journal.slice(0, mem.journal.length - JOURNAL_KEEP);
      const prompt = `Story so far:\n${mem.chronicle || '(nothing yet)'}\n\nNew journal entries, oldest first:\n${old.map((j) => `- Day ${j.day}: ${j.text}`).join('\n')}\n\nRewrite the story so far to include the new entries. Keep names, promises, debts, grudges and unresolved threads; drop colour. At most 250 words of plain prose${game.lang === 'de' ? ', written in German' : ''}.\n\nThe heroes and their genders, which must stay exactly as given: ${genderRoster(game)}. Keep the gender of every other person as the entries have it.`;
      const out = await this.converse(game, 'memory summary', 'background', prompt, [], async () => null, 'You keep the campaign notes for a Dungeons & Dragons game. You write compact, factual summaries that a Dungeon Master can rely on later.');
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

/** Which heroes a player controls, so the DM knows who is speaking without having to guess. */
function playerHeroes(game: Game, playerName: string): string {
  const player = game.s.players.find((p) => p.name === playerName);
  const heroes = player ? game.s.characters.filter((c) => c.ownerId === player.id && !c.dead).map((c) => c.name) : [];
  if (!heroes.length) return '';
  return heroes.length === 1 ? ` (who plays ${heroes[0]})` : ` (who plays ${heroes.join(', ')}; unless they say which hero acts, treat it as the party acting)`;
}

export function createDM(env: NodeJS.ProcessEnv, onUsage?: (sample: UsageSample) => void): ClaudeDM | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  const effort = (['low', 'medium', 'high', 'xhigh', 'max'] as const).find((e) => e === env.HEARTHFORGE_DM_EFFORT) ?? 'low';
  return new ClaudeDM({ models: resolveModels(env), effort, apiKey: env.ANTHROPIC_API_KEY, onUsage });
}
