// Looking creatures up in the catalogue. The Dungeon Master names a creature by id or by
// name, in English or German, and searches by name, type and challenge rating through a
// tool, so the catalogue never has to be spelled out in a tool schema.

import { tr, type Lang } from '../../../shared/i18n';
import { MONSTERS, crValue, type MonsterDef } from './monsters';

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();

const INDEX: { def: MonsterDef; en: string; de: string }[] = Object.values(MONSTERS).map((def) => ({ def, en: fold(def.name), de: fold(tr('de', def.name)) }));
const BY_NAME = new Map<string, MonsterDef>();
for (const e of INDEX) for (const k of [fold(e.def.id), e.en, e.de]) if (!BY_NAME.has(k)) BY_NAME.set(k, e.def);

/** The creature meant by an id or a name, however it is spelled. */
export function resolveMonster(ref: unknown): MonsterDef | null {
  const raw = String(ref ?? '').trim();
  if (!raw) return null;
  return MONSTERS[raw] ?? BY_NAME.get(fold(raw)) ?? BY_NAME.get(fold(raw).replace(/s$/, '')) ?? null;
}

export interface MonsterQuery {
  query?: string;
  type?: string;
  crMin?: number;
  crMax?: number;
  limit?: number;
}

/** Catalogue creatures matching every given filter, the closest name matches first, then by challenge. */
export function findMonsters(q: MonsterQuery): MonsterDef[] {
  const words = fold(q.query ?? '').split(' ').filter(Boolean);
  const type = fold(q.type ?? '');
  const min = Number.isFinite(q.crMin) ? q.crMin! : 0;
  const max = Number.isFinite(q.crMax) ? q.crMax! : 30;
  const scored: { def: MonsterDef; score: number }[] = [];
  for (const e of INDEX) {
    const cr = crValue(e.def.cr);
    if (cr < min || cr > max) continue;
    if (type && e.def.type !== type) continue;
    const hay = `${e.en} ${e.de} ${e.def.type} ${fold(e.def.id)}`;
    let score = 0;
    for (const w of words) {
      if (` ${hay} `.includes(` ${w} `)) score += 2;
      else if (hay.includes(w)) score += 1;
      else { score = -1; break; }
    }
    if (score < 0) continue;
    scored.push({ def: e.def, score });
  }
  scored.sort((a, b) => b.score - a.score || crValue(a.def.cr) - crValue(b.def.cr) || a.def.name.localeCompare(b.def.name));
  return scored.slice(0, Math.max(1, Math.min(40, q.limit ?? 20))).map((s) => s.def);
}

/** Ids that look like what was asked for, to put in an error the Dungeon Master can act on. */
export function suggestMonsters(ref: string, limit = 5): string[] {
  const words = fold(ref).split(' ').filter((w) => w.length > 2);
  const hits = INDEX.map((e) => ({ id: e.def.id, n: words.filter((w) => e.en.includes(w) || e.de.includes(w) || w.includes(e.en)).length })).filter((h) => h.n > 0);
  hits.sort((a, b) => b.n - a.n || a.id.length - b.id.length);
  return hits.slice(0, limit).map((h) => h.id);
}

/** One line of a creature for the Dungeon Master: what it is and how dangerous. */
export function monsterLine(d: MonsterDef, lang: 'en' | 'de' = 'en'): string {
  const extras = [
    d.multi ? 'multiattack' : '',
    ...(d.specials ?? []).filter((s) => s.slot === 'action' && !s.spell).map((s) => s.name.toLowerCase()),
    d.specials?.some((s) => s.spell) || d.attacks.some((a) => a.spell) ? 'spells' : '',
    d.flags?.regeneration ? 'regeneration' : '',
    d.legendary ? 'legendary actions' : '',
    d.fly ? 'flies' : '',
  ].filter(Boolean);
  const de = lang === 'de' && tr('de', d.name) !== d.name ? ` (German: ${tr('de', d.name)})` : '';
  return `${d.id}: ${d.name}${de}, ${d.size} ${d.type}, CR ${d.cr}, AC ${d.ac}, ${d.hp} HP, ${d.xp} XP${extras.length ? `; ${[...new Set(extras)].join(', ')}` : ''}`;
}

/** XP a fight may be worth per hero of a level before it counts as low, moderate or high difficulty (SRD 5.2.1). */
export const XP_BUDGET: [low: number, moderate: number, high: number][] = [
  [50, 75, 100], [100, 150, 200], [150, 225, 400], [250, 375, 500], [500, 750, 1100], [600, 1000, 1400], [750, 1300, 1700], [1000, 1700, 2100], [1300, 2000, 2600], [1600, 2300, 3100],
  [1900, 2900, 4100], [2200, 3700, 4700], [2600, 4200, 5400], [2900, 4900, 6200], [3300, 5400, 7800], [3800, 6100, 9800], [4500, 7200, 11700], [5000, 8700, 14200], [5500, 10700, 17200], [6400, 13200, 22000],
];

/** The party's budget for one fight: the sum of its heroes' shares. */
export function partyBudget(levels: number[]): { low: number; moderate: number; high: number } {
  const sum = (i: number) => levels.reduce((n, l) => n + XP_BUDGET[Math.max(1, Math.min(20, l)) - 1][i], 0);
  return { low: sum(0), moderate: sum(1), high: sum(2) };
}

export type Difficulty = 'trivial' | 'low' | 'moderate' | 'high' | 'deadly';
/** How hard a fight worth `xp` is for heroes of these levels. Past one and a half times the high budget it is called deadly. */
export function difficulty(xp: number, levels: number[]): Difficulty {
  const b = partyBudget(levels);
  if (xp > b.high * 1.5) return 'deadly';
  if (xp > b.moderate) return 'high';
  if (xp > b.low) return 'moderate';
  return xp > b.low / 2 ? 'low' : 'trivial';
}

/** The highest challenge rating that is still a sensible single foe for these heroes. */
export function soloCr(levels: number[]): number {
  const high = partyBudget(levels).high;
  let best = 0;
  for (const d of Object.values(MONSTERS)) if (d.xp <= high) best = Math.max(best, crValue(d.cr));
  return best;
}
