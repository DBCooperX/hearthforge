// Keeps the game in step with the story. After each Dungeon Master reply a small background model
// reads the narration next to the game state and lists what the story says happened that the
// game does not know yet: the party walked somewhere, time passed, a hero pocketed, handed over
// or drew something, the party rested, people left. The server applies each change through the
// same checks as the DM's own tools, and anything it cannot place is skipped, not guessed.
import { HEX_MILES, direction, formatTime, hexDistance } from '../../../shared/hex';
import { SLOT_IDS } from '../../../shared/types';
import type { Game } from '../game/engine';
import type { PlayerLine } from './types';

/** What the DM did during one reply, so the check does not repeat it. */
export interface TurnRecord {
  said: PlayerLine[];
  narration: string;
  /** World clock when the reply began. */
  startMinutes: number;
  /** The DM's tool calls in this reply, by name, with their arguments. */
  calls: { name: string; input: Record<string, unknown> }[];
}

/** The model's findings, before the server checks them. Every field may be missing. */
export interface Findings {
  place?: unknown;
  minutes?: unknown;
  rest?: unknown;
  gold?: unknown;
  gold_for?: unknown;
  gained?: unknown;
  lost?: unknown;
  equipped?: unknown;
  where?: unknown;
  present?: unknown;
}

export const RECONCILE_SYSTEM = 'You keep the game state of a Dungeons & Dragons game in step with what the Dungeon Master narrated. You read carefully, you report only what the narration plainly says has happened, and you answer with exactly the JSON you are asked for.';

const MAX_MINUTES = 720;
const MAX_GOLD = 200;
const MAX_ITEMS = 3;

/** The state the check needs, kept short: where the party is, who carries what, and the scene. */
function stateFor(game: Game, turn: TurnRecord): string {
  const s = game.s, w = game.world;
  const place = game.place();
  const lines: string[] = [];
  const passed = w.minutes - turn.startMinutes;
  lines.push(`Clock: ${formatTime(w.minutes)}. ${passed > 0 ? `${passed} minutes were already added during this reply.` : 'No time was added during this reply.'}`);
  lines.push(place ? `The game has the party at: ${place.name} [${place.id}], a ${place.kind}.` : 'The game has the party in the wilderness, at no particular place.');
  const known = w.locations.filter((l) => l.discovered);
  lines.push('Known places (id, name, kind, how far):');
  for (const l of known) {
    const d = hexDistance(l, w.party);
    const parent = l.parentId ? game.location(l.parentId) : null;
    lines.push(`- [${l.id}] ${l.name} (${l.kind}${parent ? ` in ${parent.name}` : ''}), ${d ? `${d * HEX_MILES} miles ${direction(w.party, l)}` : 'right here'}`);
  }
  lines.push('Heroes and what they carry:');
  for (const c of s.characters.filter((c) => !c.dead)) {
    const worn = SLOT_IDS.flatMap((slot) => (c.equipment[slot] ? [`${slot.replace(/[A-Z]/g, (ch) => ` ${ch.toLowerCase()}`)}: ${game.n(game.def(c.equipment[slot]!.defId).name)}`] : []));
    const bag = c.bag.filter((b) => !!b).map((b) => `${game.n(game.def(b!.defId).name)}${b!.qty > 1 ? ` ×${b!.qty}` : ''}`);
    lines.push(`- ${c.name} [${c.id}]. Wearing or wielding: ${worn.join(', ') || 'nothing'}. Backpack: ${bag.join(', ') || 'empty'}.`);
  }
  lines.push(`Party gold: ${s.gold}.`);
  const stage = game.stage();
  lines.push(`Scene header now: ${stage.where}. With the heroes: ${stage.present.join(', ') || 'nobody'}.`);
  const met = s.memory.npcs.filter((n) => n.met).map((n) => n.name);
  if (met.length) lines.push(`People the party knows: ${met.join(', ')}.`);
  return lines.join('\n');
}

function callLine(c: TurnRecord['calls'][number]): string {
  const args = Object.entries(c.input).filter(([, v]) => v !== '' && v !== null && v !== undefined).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(', ');
  return `- ${c.name}(${args.slice(0, 200)})`;
}

export function reconcilePrompt(game: Game, turn: TurnRecord): string {
  const tools = turn.calls.filter((c) => c.name !== 'scene');
  return `The game state:
${stateFor(game, turn)}

What the players said:
${turn.said.map((l) => `- ${l.player}: ${JSON.stringify(l.text)}`).join('\n')}

The Dungeon Master's reply, which the players have just read:
"""
${turn.narration}
"""

What the Dungeon Master already changed in the game during this reply, through its tools:
${tools.length ? tools.map(callLine).join('\n') : '(nothing)'}

Compare the reply with the game state. List only what the reply plainly says has already happened and the game does not show yet. Leave out anything the tools above already did, anything that is only planned, offered, suggested or thought about, and anything you are not sure of. Most replies need no change at all; then answer with {}.

Answer with one JSON object and nothing else. Every field is optional:
{"place": "<id of the known place the party is at by the end of the reply>", "minutes": <minutes of time the reply lets pass that the clock does not show yet>, "rest": "short" | "long", "gold": <gold the party received, negative when it paid>, "gold_for": "<what for, a few words in the language of the reply>", "gained": [{"hero": "<hero id>", "item": "<name>", "description": "<one sentence, only for something new>", "quantity": 1}], "lost": [{"hero": "<hero id>", "item": "<name exactly as carried>", "quantity": 1}], "equipped": [{"hero": "<hero id>", "item": "<name exactly as carried>"}], "where": "<where the scene now plays, a few words>", "present": "<everyone in the scene besides the heroes, comma separated, or none>"}

- place: only when the party went to one of the known places listed, and the game has it somewhere else. The server adds the travel time itself, so do not count the walk in minutes. A place that is not listed: leave place out and use where.
- minutes: a long talk, a search, a meal, waiting, a rest. 0 or leave out for an ordinary exchange. At most ${MAX_MINUTES}.
- rest: "short" when the party rested for an hour or more, "long" for a night's sleep of about eight hours. Leave out when it only talked about resting.
- gold: coin that actually changed hands in the reply, not trade in a shop window.
- gained: things a hero picked up, was handed or took. lost: things a hero gave away, left behind, used up, threw away or that were taken from them.
- equipped: a hero drew, wielded, put on or switched to something from the backpack.
- where and present: when the reply moved the scene to another room or spot, or people came or went. Name people as the reply does; use "none" when the heroes are alone. Leave both out when nothing changed.`;
}

/** Pull the JSON object out of the model's answer. Returns null when there is none. */
export function parseFindings(text: string | null): Findings | null {
  if (!text) return null;
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try {
    const v = JSON.parse(text.slice(a, b + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Findings : null;
  } catch {
    return null;
  }
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : 0; };
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').slice(0, MAX_ITEMS) : []);
const same = (a: unknown, b: string) => text(a).toLowerCase() === b.toLowerCase();

export interface ReconcileResult {
  applied: string[];
  skipped: string[];
}

/**
 * Apply what the check found, each part on its own: a change the engine refuses is skipped and
 * the rest still goes through. Anything the DM's own tools already handled this reply is left alone.
 */
export function applyFindings(game: Game, f: Findings, turn: TurnRecord): ReconcileResult {
  const out: ReconcileResult = { applied: [], skipped: [] };
  const used = (...names: string[]) => turn.calls.some((c) => names.includes(c.name));
  const tryIt = (label: string, fn: () => unknown) => {
    try {
      const r = fn() as Record<string, unknown> | undefined;
      if (r && (r.moved === false || r.changed === false || r.rested === false)) out.skipped.push(`${label}: ${String(r.note ?? 'nothing to change')}`);
      else out.applied.push(label);
    } catch (err) {
      out.skipped.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  // Heroes by id, or by name when the model wrote that instead.
  const hero = (v: unknown) => { const t = text(v); return game.s.characters.find((c) => c.id === t || c.name.toLowerCase() === t.toLowerCase())?.id ?? t; };

  const place = text(f.place);
  if (place && !used('move_to_place', 'travel_to') && place !== game.world.placeId) tryIt(`place ${place}`, () => game.journeyTo(place));

  const minutes = Math.max(0, Math.min(MAX_MINUTES, num(f.minutes)));
  if (minutes && !used('advance_time', 'rest')) tryIt(`${minutes} minutes`, () => game.advanceTime(minutes));

  const rest = text(f.rest);
  if ((rest === 'short' || rest === 'long') && !used('rest')) tryIt(`${rest} rest`, () => game.storyRest(rest, game.world.minutes - turn.startMinutes));

  const gold = Math.max(-MAX_GOLD, Math.min(MAX_GOLD, num(f.gold)));
  if (gold && !used('change_gold', 'open_shop')) tryIt(`gold ${gold}`, () => game.changeGold(gold, text(f.gold_for).slice(0, 60)));

  const given = turn.calls.filter((c) => c.name === 'give_item' || c.name === 'give_story_item').map((c) => text(c.input.name ?? c.input.item_id));
  for (const g of list(f.gained)) {
    const item = text(g.item);
    if (!item || given.some((x) => same(x, item))) continue;
    const who = hero(g.hero) || game.s.characters.find((c) => !c.dead)?.id || '';
    tryIt(`gained ${item}`, () => {
      const def = game.findItemDef(item);
      if (def && !def.story) return game.grantItem(who, def.id, num(g.quantity) || 1);
      return game.giveStoryItem({ characterId: who, name: item, description: text(g.description), icon: 'auto', quantity: num(g.quantity) || 1, note: 'Found in the story.' });
    });
  }

  const taken = turn.calls.filter((c) => c.name === 'take_item').map((c) => text(c.input.item));
  for (const l of list(f.lost)) {
    const item = text(l.item);
    if (!item || taken.some((x) => same(x, item))) continue;
    // Quest items stay: only the DM itself may part the party from one.
    tryIt(`lost ${item}`, () => game.takeItem({ characterId: hero(l.hero), item, quantity: num(l.quantity) || 1, allowQuest: false }));
  }

  if (!used('equip_item')) {
    for (const e of list(f.equipped)) {
      const item = text(e.item);
      if (item) tryIt(`equipped ${item}`, () => game.equipItem(hero(e.hero), item));
    }
  }

  const where = text(f.where), present = text(f.present);
  if ((where || present) && !used('set_stage')) tryIt('scene', () => game.setStage({ where, present }));

  // The DM already told the arrival and the rest; the narrator should not tell them again.
  game.dropBeats('arrive');
  game.dropBeats('rest');
  if (out.applied.length) game.restageLastScene();
  return out;
}
