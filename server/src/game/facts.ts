// What is true in the story, and what each person has told the party about it. When the Dungeon
// Master makes up an answer on the spot (who brought the letter, where the miller was last night),
// it is settled here once and listed every turn, together with what people have said about it. A
// second person questioned later then knows the same truth, or tells a lie that the Dungeon Master
// chose on purpose, and the first person repeats what they said before instead of a new version.
// A settled truth is never replaced: the story moves on, it does not rewrite itself.
import { GameError, type Game } from './engine';

/** One thing someone said to the party about a settled question, true or not. */
export interface Statement {
  /** The speaker's name, as the Dungeon Master gave it. */
  who: string;
  /** The speaker in the DM's memory, when they are there. */
  npcId: string | null;
  text: string;
  day: number;
}

/** A question of the story and its fixed answer. */
export interface FactState {
  id: string;
  /** The question it answers, in a few words: "who brought the letter". */
  about: string;
  /** What is really so. Empty when the server noted a statement before the Dungeon Master settled it. */
  truth: string;
  day: number;
  /** World minutes when it was last settled or talked about, so the busiest ones stay in view. */
  touched: number;
  /** Oldest first. */
  told: Statement[];
}

const MAX_FACTS = 60;
const MAX_TOLD = 8;
/** How many facts the Dungeon Master sees each turn, besides those of people in the scene. */
const SHOWN = 20;

const clean = (v: string | undefined, max: number) => (v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const STOP = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'and', 'or', 'is', 'was', 'were', 'did', 'does', 'do', 'it', 'that', 'this', 'with', 'from', 'by',
  'who', 'what', 'where', 'when', 'why', 'how', 'which', 'whom', 'whose',
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'und', 'oder', 'ist', 'war', 'hat', 'hatte', 'von', 'zu', 'im', 'in', 'am', 'an', 'auf', 'mit', 'für', 'bei',
  'wer', 'was', 'wo', 'wann', 'warum', 'wie', 'welche', 'welcher', 'welches', 'wem', 'wen', 'wessen', 'woher', 'wohin',
]);
const words = (t: string) => new Set(t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter((w) => w && !STOP.has(w)));
const key = (t: string) => [...words(t)].sort().join(' ');

/** Two wordings of the same question: most of the words that matter are the same. */
function sameQuestion(a: string, b: string): boolean {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return false;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both) >= 0.6;
}

function newId(taken: FactState[]) {
  let n = taken.length + 1;
  while (taken.some((x) => x.id === `fact${n}`)) n++;
  return `fact${n}`;
}

export function findFact(g: Game, about: string): FactState | undefined {
  const facts = g.s.memory.facts;
  const a = clean(about, 120);
  if (!a) return undefined;
  return facts.find((f) => f.id === a) ?? facts.find((f) => key(f.about) === key(a)) ?? facts.find((f) => sameQuestion(f.about, a));
}

/**
 * Settle a question of the story, note what someone told the party about it, or both. A truth that
 * is already settled stays as it is; the answer says so and gives it back. `by` is "dm" for the
 * Dungeon Master's own call and "check" for the after-reply check, which only notes statements.
 */
export function settleFact(g: Game, input: { about?: string; truth?: string; toldBy?: string; told?: string; by?: 'dm' | 'check' }) {
  const mem = g.s.memory;
  const about = clean(input.about, 120);
  if (!about) throw new GameError('Say in about which question of the story this answers, in a few words, for example "who brought the letter".');
  const truth = clean(input.truth, 300);
  const who = clean(input.toldBy, 60);
  const said = clean(input.told, 300);
  if (!truth && !(who && said)) throw new GameError('Give the truth, or who told the party something about it (told_by) and what they said (told).');
  const now = g.s.world?.minutes ?? 0, day = g.day();
  let fact = findFact(g, about);
  const created = !fact;
  if (!fact) {
    if (input.by !== 'check' && !truth) throw new GameError(`"${about}" is not settled yet. Decide what is really so and give it in truth, so that everyone you play later agrees with it.`);
    fact = { id: newId(mem.facts), about, truth: '', day, touched: now, told: [] };
    mem.facts.push(fact);
    if (mem.facts.length > MAX_FACTS) {
      const oldest = mem.facts.reduce((a, b) => (b.touched < a.touched ? b : a));
      mem.facts.splice(mem.facts.indexOf(oldest), 1);
    }
  }
  fact.touched = now;
  const result: Record<string, unknown> = { id: fact.id, about: fact.about };
  if (truth) {
    if (!fact.truth) { fact.truth = truth; result.truth = truth; result.note = created ? 'Settled. Everyone you play from now on agrees with this, or lies about it on purpose.' : 'Settled, and it must fit what people have already told the party.'; }
    else if (key(fact.truth) !== key(truth)) {
      result.kept = true;
      result.truth = fact.truth;
      result.note = 'This was already settled and stays as it is. Tell it the same way. Someone may be wrong or lie about it, but only for a reason you can name, and the truth itself does not change.';
    } else result.truth = fact.truth;
  }
  if (who && said) {
    const npc = mem.npcs.find((n) => n.name.toLowerCase() === who.toLowerCase() || n.id === who);
    const mine = fact.told.filter((s) => (npc ? s.npcId === npc.id : s.who.toLowerCase() === who.toLowerCase()));
    if (mine.some((s) => key(s.text) === key(said))) result.told = 'Already noted.';
    else {
      if (mine.length) {
        result.said_before = mine.map((s) => s.text);
        result.told_note = `${npc?.name ?? who} said otherwise before. If they now change their story, it must be on purpose (caught in a lie, remembering better, changing sides), and your narration should show it.`;
      }
      fact.told.push({ who: npc?.name ?? who, npcId: npc?.id ?? null, text: said, day });
      if (fact.told.length > MAX_TOLD) fact.told.splice(0, fact.told.length - MAX_TOLD);
      result.told = 'Noted.';
    }
  }
  return result;
}

/** What a person has told the party, newest last, for the journal. */
export function toldBy(g: Game, npcId: string): { about: string; text: string; day: number }[] {
  return g.s.memory.facts.flatMap((f) => f.told.filter((s) => s.npcId === npcId).map((s) => ({ about: f.about, text: s.text, day: s.day })))
    .sort((a, b) => a.day - b.day);
}

/**
 * The settled facts as the Dungeon Master sees them each turn: those that people in the scene have
 * spoken about, then the most recently touched others.
 */
export function describeFacts(g: Game, presentIds: string[]): string[] {
  const facts = g.s.memory.facts;
  if (!facts.length) return [];
  const here = facts.filter((f) => f.told.some((s) => s.npcId && presentIds.includes(s.npcId)));
  const rest = facts.filter((f) => !here.includes(f)).sort((a, b) => b.touched - a.touched).slice(0, Math.max(0, SHOWN - here.length));
  const shown = [...here, ...rest].sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
  const lines = ['Settled facts: answers you have fixed and what people have told the party about them. The truth is for you; the party knows only what it was told. Whoever is asked again says the same thing, unless they lie or change their story on purpose. Add or check with fact:'];
  for (const f of shown) {
    const told = f.told.map((s) => `${s.who} (day ${s.day}): "${s.text}"`).join(' / ');
    lines.push(`- [${f.id}] ${f.about}: ${f.truth || 'NOT SETTLED YET; decide a truth that fits what was said and call fact with it'}.${told ? ` Told the party: ${told}` : ''}`);
  }
  if (facts.length > shown.length) lines.push(`(${facts.length - shown.length} older facts not shown; fact with the same about gives one back.)`);
  return lines;
}
