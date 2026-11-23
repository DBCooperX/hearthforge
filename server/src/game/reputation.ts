// What the region thinks of the party: standing with its factions, the rumours that travel
// between its places, and the trophies the party earns along the way. The Dungeon Master
// proposes changes through tools; everything here validates and clamps them, so the server
// stays the owner of the numbers.

import { TROPHIES, type TrophyContext, type TrophyView } from '../../../shared/achievements';
import { hexDistance, type Hex } from '../../../shared/hex';
import { tagged, tr, type Lang } from '../../../shared/i18n';
import {
  FACTIONS, MAX_PER_DAY, MAX_STEP, RUMOUR_LIFE, RUMOUR_SPEED, TIER_PRICE, clampStanding, shiftDisposition, tierOf,
  type FactionId, type FactionView, type RumourView,
} from '../../../shared/reputation';
import { seedStream } from '../../../shared/start';
import type { Disposition } from '../../../shared/types';
import { GameError, type Game } from './engine';
import type { NpcState, RumourState } from './world';

/** A faction as the server keeps it. The name and blurb are in the table's language from the start. */
export interface FactionState {
  id: FactionId;
  name: string;
  blurb: string;
  standing: number;
  history: { day: number; delta: number; why: string }[];
}

const MAX_HISTORY = 12;
const MAX_RUMOURS = 30;

/** The factions of a new region. The classic Vale always has the first name of each; a random region rolls its own from the seed. */
export function makeFactions(seed: string, lang: Lang, classic: boolean): FactionState[] {
  const rng = seedStream(seed, 'factions');
  return FACTIONS.map((def) => {
    const roll = rng();
    const [en, de] = def.names[classic ? 0 : Math.floor(roll * def.names.length) % def.names.length];
    return { id: def.id, name: lang === 'de' ? de : en, blurb: tr(lang, def.blurb), standing: 0, history: [] };
  });
}

export function factionBy(g: Game, ref: string): FactionState | undefined {
  const key = ref.trim().toLowerCase();
  if (!key) return undefined;
  const all = g.s.factions;
  return all.find((f) => f.id === key || f.name.toLowerCase() === key)
    ?? all.find((f) => f.name.toLowerCase().includes(key) || key.includes(f.name.toLowerCase()));
}

/** Move a standing, within what one day allows. Returns how far it really moved. */
export function shiftStanding(g: Game, id: FactionId, delta: number, why: string): number {
  const f = g.s.factions.find((x) => x.id === id);
  if (!f) return 0;
  const t = tagged(g.lang);
  const day = g.day();
  const used = f.history.filter((h) => h.day === day && Math.sign(h.delta) === Math.sign(delta)).reduce((n, h) => n + Math.abs(h.delta), 0);
  const room = Math.max(0, MAX_PER_DAY - used);
  const want = Math.sign(delta) * Math.min(Math.abs(Math.round(delta)), room);
  const before = f.standing;
  f.standing = clampStanding(f.standing + want);
  const applied = f.standing - before;
  if (!applied) return 0;
  const note = why.trim().slice(0, 100);
  f.history.push({ day, delta: applied, why: note });
  if (f.history.length > MAX_HISTORY) f.history.shift();
  const now = tierOf(f.standing);
  const signed = `${applied > 0 ? '+' : ''}${applied}`;
  g.log('system', `${t`Standing with ${f.name}: ${signed}`}${note ? ` (${note})` : ''}.${now !== tierOf(before) ? ` ${t`Now ${tr(g.lang, now)}.`}` : ''}`, { event: { type: 'standing' } });
  return applied;
}

/** The Dungeon Master's tool: the party did something a faction would remember. */
export function changeStanding(g: Game, input: { faction: string; change: number; reason: string }) {
  const f = factionBy(g, input.faction);
  if (!f) throw new GameError(`Unknown faction. The factions are: ${g.s.factions.map((x) => `${x.name} [${x.id}]`).join(', ')}.`);
  const want = Math.max(-MAX_STEP, Math.min(MAX_STEP, Math.round(Number(input.change)) || 0));
  if (!want) throw new GameError('Give a change between -12 and 12 that is not zero.');
  const applied = shiftStanding(g, f.id, want, input.reason);
  return { faction: f.name, id: f.id, applied, standing: f.standing, tier: tierOf(f.standing), ...(applied !== want ? { note: 'The change was cut short: a faction only moves so far in one day.' } : {}) };
}

export function factionViews(g: Game): FactionView[] {
  return g.s.factions.map((f) => ({ id: f.id, name: f.name, blurb: f.blurb, standing: f.standing, tier: tierOf(f.standing), history: f.history }));
}

/** Who a person speaks for: the keeper of a shop for the guild, otherwise whoever owns the place they are in. */
export function factionOfNpc(g: Game, npc: NpcState): FactionState | undefined {
  const keeper = Object.values(g.s.shops).some((sh) => sh.npcId === npc.id);
  const kind = npc.locationId ? g.location(npc.locationId)?.kind : undefined;
  const def = keeper ? FACTIONS.find((d) => d.id === 'guild') : kind ? FACTIONS.find((d) => d.kinds.includes(kind)) : undefined;
  return def && g.s.factions.find((f) => f.id === def.id);
}

/** How someone feels about the party once their faction's opinion is counted in. */
export function attitude(g: Game, npc: NpcState): Disposition {
  const f = factionOfNpc(g, npc);
  return f ? shiftDisposition(npc.disposition, tierOf(f.standing)) : npc.disposition;
}

/** What the guild's opinion does to prices where there is a guild trader to ask. */
export function guildFactor(g: Game): number {
  const f = g.s.factions.find((x) => x.id === 'guild');
  return f ? TIER_PRICE[tierOf(f.standing)] : 1;
}

// ------------------------------------------------------------------ rumours

/** Start a rumour where the party stands. People spread it to the places around, a few hexes a day. */
export function addRumour(g: Game, input: { text: string; aboutParty?: boolean }): RumourState {
  const text = input.text.trim().replace(/\s+/g, ' ').slice(0, 220);
  if (!text) throw new GameError('A rumour needs some words.');
  const mem = g.s.memory;
  const same = mem.rumours.find((r) => r.text.toLowerCase() === text.toLowerCase());
  if (same) return same;
  const place = g.place();
  const at: Hex = place ? { q: place.q, r: place.r } : { ...g.world.party };
  const rumour: RumourState = { id: `r${++g.s.uidSeq}`, text, day: g.day(), at, fromId: place ? place.parentId ?? place.id : null, aboutParty: !!input.aboutParty, heard: null };
  mem.rumours.push(rumour);
  if (mem.rumours.length > MAX_RUMOURS) mem.rumours.shift();
  return rumour;
}

/** Whether a rumour has reached a hex yet, and is not stale. */
export function reaches(r: RumourState, hex: Hex, day: number): boolean {
  return r.day + Math.ceil(hexDistance(r.at, hex) / RUMOUR_SPEED) <= day && day - r.day <= RUMOUR_LIFE;
}

/** The rumours people in the party's settlement are repeating today. */
export function rumoursHere(g: Game): RumourState[] {
  const place = g.place();
  if (!g.s.world || !place) return [];
  const here = { q: place.q, r: place.r };
  return g.s.memory.rumours.filter((r) => reaches(r, here, g.day()));
}

/** The Dungeon Master has the party hear one of the rumours going round here. */
export function hearRumour(g: Game, ref: string) {
  const key = ref.trim().toLowerCase();
  const here = rumoursHere(g);
  const r = here.find((x) => x.id.toLowerCase() === key) ?? (key.length > 3 ? here.find((x) => x.text.toLowerCase().includes(key)) : undefined);
  if (!r) throw new GameError('Nobody here is repeating that. Use an id from the rumours listed for this place.');
  if (r.heard === null) {
    r.heard = g.day();
    g.s.stats.heard++;
  }
  return { id: r.id, text: r.text, heard: true };
}

export function rumourViews(g: Game): RumourView[] {
  return g.s.memory.rumours
    .filter((r) => r.heard !== null)
    .map((r) => ({ id: r.id, text: r.text, day: r.day, heard: r.heard!, from: (r.fromId && g.location(r.fromId)?.discovered ? g.location(r.fromId)!.name : null), aboutParty: r.aboutParty }));
}

// ----------------------------------------------------------------- trophies

export function trophyContext(g: Game): TrophyContext {
  const s = g.s, w = s.world;
  const standings = s.factions.map((f) => f.standing);
  return {
    ...s.stats,
    maxLevel: Math.max(0, ...s.characters.map((c) => c.level)),
    quests: s.memory.quests.filter((q) => q.status === 'completed').length,
    visited: w ? w.locations.filter((l) => l.visited).length : 0,
    explored: w ? [...w.explored].filter((c) => c === '1').length : 0,
    gold: s.gold,
    day: w ? g.day() : 0,
    bestStanding: Math.max(0, ...standings),
    worstStanding: Math.max(0, ...standings.map((n) => -n)),
  };
}

/** Award every trophy whose goal has been reached. Returns the ids that are new. */
export function checkTrophies(g: Game): string[] {
  const s = g.s;
  if (s.phase === 'lobby' || !s.world) return [];
  const ctx = trophyContext(g);
  const t = tagged(g.lang);
  const earned: string[] = [];
  for (const def of TROPHIES) {
    if (s.achievements.some((a) => a.id === def.id) || def.count(ctx) < def.need) continue;
    s.achievements.push({ id: def.id, day: g.day() });
    g.log('system', t`Trophy earned: ${tr(g.lang, def.name)}`, { event: { type: 'trophy' } });
    earned.push(def.id);
  }
  return earned;
}

export function trophyViews(g: Game): TrophyView[] {
  const ctx = g.s.world ? trophyContext(g) : null;
  return TROPHIES.map((def) => ({ id: def.id, day: g.s.achievements.find((a) => a.id === def.id)?.day ?? null, have: Math.min(def.need, ctx ? def.count(ctx) : 0) }));
}
