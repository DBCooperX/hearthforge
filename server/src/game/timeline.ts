// When things happened. The world clock says what time it is now; the timeline pins every event
// the story mentions to a fixed moment on that clock, so a date given once stays the same when
// someone mentions it again ("three weeks ago" today is still three weeks before that day, not
// "in winter" tomorrow). Held-back secrets wait here for the condition under which they may come
// out, and the server refuses one whose earliest time has not come yet.
import { formatTime } from '../../../shared/hex';
import { GameError, type Game } from './engine';

/** One thing that happened, or is planned, at a fixed moment on the world clock. */
export interface TimelineEvent {
  id: string;
  /** World minutes. Negative for things that happened before the adventure began. */
  at: number;
  what: string;
  where: string;
  /** Who knows about it, as the Dungeon Master put it. Empty for things the party did itself. */
  knownBy: string;
  /** "story" for what the Dungeon Master logged, "party" for what the server noted by itself. */
  by: 'story' | 'party';
  /** It lay ahead of the clock when it was logged: something expected, not something that happened. */
  planned?: boolean;
}

/** A truth the players should only learn once something has happened first. */
export interface SecretState {
  id: string;
  text: string;
  /** The condition, in plain words: "after the party has found the ledger". */
  after: string;
  /** World minutes before which the server refuses to let it out, or null. */
  notBefore: number | null;
  /** World minutes when it came out, or null while it is held. */
  revealed: number | null;
}

/** Every new adventure starts at 08:00 on day 1. */
export const ADVENTURE_START = 8 * 60;
const MAX_EVENTS = 80;
const MAX_SECRETS = 30;
const HOUR = 60, DAY = 1440;
const UNITS: [RegExp, number][] = [
  [/^(?:min|mins|minute|minutes|minute[n]?)$/, 1],
  [/^(?:h|hr|hrs|hour|hours|stunde|stunden)$/, HOUR],
  [/^(?:day|days|tag|tage|tagen)$/, DAY],
  [/^(?:week|weeks|woche|wochen)$/, 7 * DAY],
  [/^(?:month|months|monat|monate|monaten)$/, 30 * DAY],
  [/^(?:season|seasons|jahreszeit|jahreszeiten)$/, 91 * DAY],
  [/^(?:year|years|jahr|jahre|jahren)$/, 365 * DAY],
];
const WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20, thirty: 30, a_few: 3, few: 3, several: 4, couple: 2,
  ein: 1, eine: 1, einem: 1, einer: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, zwölf: 12, zwanzig: 20, dreissig: 30, paar: 3, einigen: 4, einige: 4,
};
const amount = (w: string) => (/^\d+(?:[.,]\d+)?$/.test(w) ? Number(w.replace(',', '.')) : WORDS[w]);
const unitOf = (w: string) => UNITS.find(([re]) => re.test(w))?.[1];
const startOfDay = (m: number) => Math.floor(m / DAY) * DAY;

/**
 * Read a moment as the Dungeon Master writes it: "now", "3 weeks ago", "two days ago", "in 2 days",
 * "yesterday", "this morning", "tonight", "day 3", "day 3 14:00", and the German forms of these
 * ("vor drei Wochen", "gestern", "in zwei Tagen"). Returns world minutes, or null when it is too vague
 * to pin down, such as "in winter" or "long ago".
 */
export function parseWhen(raw: string, now: number): number | null {
  const s = raw.toLowerCase().replace(/[.!]+$/, '').replace(/\s+/g, ' ').trim()
    .replace(/^(?:about|around|some|roughly|etwa|ungefähr|rund|gut) /, '').replace(/ (?:or so|oder so)$/, '');
  if (!s || /^(?:now|just now|right now|today|jetzt|gerade|eben|heute|soeben)$/.test(s)) return now;
  const day = /^(?:day|tag) (-?\d+)(?:[, ]+(?:at )?(\d{1,2})[:.h](\d{2}))?$/.exec(s);
  if (day) return (Number(day[1]) - 1) * DAY + (day[2] ? Number(day[2]) * HOUR + Number(day[3]) : 12 * HOUR);
  const fixed: [RegExp, () => number][] = [
    [/^(?:yesterday|gestern)$/, () => now - DAY],
    [/^(?:the day before yesterday|vorgestern)$/, () => now - 2 * DAY],
    [/^(?:tomorrow|morgen)$/, () => now + DAY],
    [/^(?:this morning|heute morgen|heute früh)$/, () => Math.min(now, startOfDay(now) + 8 * HOUR)],
    [/^(?:last night|letzte nacht|heute nacht|in der nacht)$/, () => (now - startOfDay(now) >= 20 * HOUR ? now : startOfDay(now) - HOUR)],
    [/^(?:yesterday evening|last evening|gestern abend)$/, () => startOfDay(now) - 4 * HOUR],
    [/^(?:tonight|this evening|heute abend)$/, () => Math.max(now, startOfDay(now) + 20 * HOUR)],
    [/^(?:last week|letzte woche|vorige woche)$/, () => now - 7 * DAY],
    [/^(?:last month|letzten monat|letzter monat|vorigen monat)$/, () => now - 30 * DAY],
    [/^(?:last year|letztes jahr|voriges jahr|letzten jahres)$/, () => now - 365 * DAY],
  ];
  for (const [re, at] of fixed) if (re.test(s)) return Math.round(at());
  // "3 weeks ago", "a few days ago", "vor drei Wochen", "in 2 days", "in zwei Tagen".
  const words = s.replace(/a few/g, 'a_few').replace(/a couple of/g, 'couple').replace(/ein paar/g, 'paar').split(' ');
  let sign = 0;
  if (words[words.length - 1] === 'ago') { sign = -1; words.pop(); } else if (words[0] === 'vor') { sign = -1; words.shift(); } else if (words[0] === 'in') { sign = 1; words.shift(); }
  if (!sign) return null;
  if (words.length !== 2) return null;
  const n = amount(words[0]), unit = unitOf(words[1]);
  if (n === undefined || unit === undefined || n <= 0) return null;
  return Math.round(now + sign * n * unit);
}

/** "Day 3, 14:30", or "23 days before the adventure began" for times before day 1. */
function stamp(at: number): string {
  if (at >= 0) return formatTime(at);
  return `${Math.ceil((ADVENTURE_START - at) / DAY)} days before the adventure began`;
}

/** How long ago or how far ahead, in rough words: "2 days ago", "in 5 hours", "just now". */
export function since(at: number, now: number): string {
  const d = now - at;
  if (Math.abs(d) < 5) return 'just now';
  return d > 0 ? `${span(d)} ago` : `in ${span(-d)}`;
}

/** A length of time in rough words: "45 minutes", "3 hours", "2 days", "3 weeks". */
function span(abs: number): string {
  return abs < HOUR ? `${Math.round(abs)} minutes`
    : abs < DAY ? `${Math.round(abs / HOUR)} hours`
      : abs < 14 * DAY ? `${Math.round(abs / DAY)} days`
        : abs < 60 * DAY ? `${Math.round(abs / (7 * DAY))} weeks`
          : abs < 730 * DAY ? `${Math.round(abs / (30 * DAY))} months`
            : `${Math.round(abs / (365 * DAY))} years`;
}

const clean = (v: string | undefined, max: number) => (v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const key = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function newId(prefix: string, taken: { id: string }[]) {
  let n = taken.length + 1;
  while (taken.some((x) => x.id === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/**
 * Pin something the story mentions to the clock. An event already on the timeline keeps the date it
 * was first given, so the same fact cannot drift from "three weeks ago" to "last winter".
 */
export function logEvent(g: Game, input: { what?: string; when?: string; where?: string; knownBy?: string; by?: 'story' | 'party' }) {
  const mem = g.s.memory;
  const now = g.world.minutes;
  const what = clean(input.what, 240);
  if (!what) throw new GameError('Say what happened, in one sentence.');
  const existing = mem.timeline.find((e) => key(e.what) === key(what));
  if (existing) {
    const known = clean(input.knownBy, 120);
    if (known && !existing.knownBy.toLowerCase().includes(known.toLowerCase())) existing.knownBy = clean(existing.knownBy ? `${existing.knownBy}, ${known}` : known, 160);
    return { id: existing.id, kept: true, when: `${stamp(existing.at)} (${since(existing.at, now)})`, note: 'This event is already on the timeline. Its date stays as it is; tell it consistently with that date.' };
  }
  const at = parseWhen(clean(input.when, 60), now);
  if (at === null) throw new GameError(`"${input.when}" is too vague to pin down. Give when as "now", a number and a unit ("3 weeks ago", "2 days ago", "in 3 days", "4 months ago"), "yesterday", "this morning", "tonight" or "day N". Pick a time that fits what the party has already seen.`);
  const ev: TimelineEvent = { id: newId('ev', mem.timeline), at, what, where: clean(input.where, 80), knownBy: clean(input.knownBy, 160), by: input.by ?? 'story', ...(at > now ? { planned: true } : {}) };
  mem.timeline.push(ev);
  mem.timeline.sort((a, b) => a.at - b.at);
  // Keep the timeline short: the server's own notes go first, then the oldest of the rest.
  while (mem.timeline.length > MAX_EVENTS) {
    const i = mem.timeline.findIndex((e) => e.by === 'party');
    mem.timeline.splice(i >= 0 ? i : 0, 1);
  }
  return { id: ev.id, when: `${stamp(at)} (${since(at, now)})`, note: at > now ? 'Planned: it will show as due once the clock reaches it.' : 'Fixed. Everyone who mentions it from now on agrees with this date.' };
}

/** Hold a revelation back, or let it out. Letting one out before its earliest time is refused. */
export function secret(g: Game, input: { action?: string; text?: string; after?: string; notBefore?: string }) {
  const mem = g.s.memory;
  const now = g.world.minutes;
  const action = clean(input.action, 10).toLowerCase();
  const text = clean(input.text, 300);
  if (!text) throw new GameError('Give the secret, or its id.');
  const found = mem.secrets.find((x) => x.id === text || key(x.text) === key(text));
  if (action === 'reveal') {
    if (!found) return { revealed: true, note: 'Nothing like this was held back, so nothing stood in the way.' };
    if (found.revealed !== null) return { id: found.id, revealed: true, note: 'It is already out.' };
    if (found.notBefore !== null && now < found.notBefore) {
      throw new GameError(`Too early: "${found.text}" may come out at ${stamp(found.notBefore)} at the earliest (${since(found.notBefore, now)}). Hold it back for now; at most let the heroes notice one small sign of it.`);
    }
    found.revealed = now;
    return { id: found.id, revealed: true };
  }
  if (action !== 'hold') throw new GameError('action must be "hold" or "reveal".');
  const after = clean(input.after, 200);
  const nb = clean(input.notBefore, 40);
  const notBefore = nb ? parseWhen(nb, now) : null;
  if (nb && notBefore === null) throw new GameError(`"${input.notBefore}" is too vague. Give not_before as "in 2 days", "tomorrow", "tonight", "day N" or an empty string.`);
  if (found) {
    if (after) found.after = after;
    if (nb) found.notBefore = notBefore;
    return { id: found.id, held: found.revealed === null, note: found.revealed === null ? 'Updated.' : 'This one is already out.' };
  }
  if (!after && notBefore === null) throw new GameError('Say after what the secret may come out, in after, or when at the earliest, in not_before.');
  if (mem.secrets.filter((x) => x.revealed === null).length >= MAX_SECRETS) throw new GameError('Too many secrets are held. Reveal or drop one first.');
  const s: SecretState = { id: newId('secret', mem.secrets), text, after, notBefore, revealed: null };
  mem.secrets.push(s);
  if (mem.secrets.length > MAX_SECRETS * 2) mem.secrets.splice(mem.secrets.findIndex((x) => x.revealed !== null), 1);
  return { id: s.id, held: true };
}

/** The clock, the timeline and the held secrets, as the Dungeon Master sees them every turn. */
export function describeTimeline(g: Game): string[] {
  const mem = g.s.memory, now = g.world.minutes;
  const lines: string[] = [];
  lines.push(now - ADVENTURE_START < 5 ? 'The adventure begins now, on Day 1 at 08:00.' : `The adventure began ${span(now - ADVENTURE_START)} ago, on Day 1 at 08:00.`);
  const past = mem.timeline.filter((e) => e.at <= now);
  const ahead = mem.timeline.filter((e) => e.at > now);
  if (past.length || ahead.length) {
    lines.push('Timeline: when things happened. Every date here is fixed; whoever mentions an event agrees with it, and you count from it (add new ones with log_event):');
    // The oldest backstory stays; of the rest, the newest matter most.
    const shown = [...past.filter((e) => e.by === 'story' && e.at < ADVENTURE_START).slice(0, 12), ...past.filter((e) => !(e.by === 'story' && e.at < ADVENTURE_START)).slice(-24)];
    for (const e of shown) {
      const due = e.planned && now - e.at < DAY ? 'DUE (it was planned for then; let it happen now, or say why it did not)' : e.planned ? 'planned for then' : '';
      lines.push(`- ${stamp(e.at)}, ${since(e.at, now)}${due ? `, ${due}` : ''}: ${e.what}${e.where ? ` Where: ${e.where}.` : ''}${e.knownBy ? ` Known by: ${e.knownBy}.` : ''}`);
    }
    for (const e of ahead.slice(0, 8)) lines.push(`- Planned for ${stamp(e.at)}, ${since(e.at, now)}: ${e.what}${e.where ? ` Where: ${e.where}.` : ''}`);
  }
  const held = mem.secrets.filter((x) => x.revealed === null);
  if (held.length) {
    lines.push('Held back (secret): truths the players must not learn yet. Until a condition is met, nobody states them and no clue gives them away; at most one small sign of one per scene. Call secret with action "reveal" in the response that lets one out:');
    for (const x of held) {
      const time = x.notBefore === null ? '' : now < x.notBefore ? ` Not before ${stamp(x.notBefore)} (${since(x.notBefore, now)}); the server refuses it until then.` : ' Its earliest time has come.';
      lines.push(`- [${x.id}] ${x.text}${x.after ? ` Only after: ${x.after}.` : ''}${time}`);
    }
  }
  const out = mem.secrets.filter((x) => x.revealed !== null).slice(-5);
  if (out.length) lines.push(`Already revealed: ${out.map((x) => x.text).join(' / ')}`);
  return lines;
}
