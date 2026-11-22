// The chances shown before a hero commits to an attack or a spell: hit chance, the chance a
// target fails its save, and the spread of a damage roll. Pure math, shared by server and browser.

import { abilityMod, type AbilityDef, type Character } from './types';
import { castingAbility } from './build';
import { cantripScale, hasFeature } from './classes';
import { diceAtLevel } from './spells';

export type OddsMode = 'normal' | 'advantage' | 'disadvantage';

/** Why the odds are what they are. `good` reasons help the hero, the rest hinder them. */
export type OddsReason =
  | 'cover' | 'cant_see' | 'unseen' | 'prone_near' | 'prone_far' | 'long_range' | 'foe_adjacent'
  | 'hampered' | 'exposed' | 'guided' | 'studied' | 'aimed' | 'reckless' | 'invisible' | 'buff_adv'
  | 'hunted' | 'bless' | 'bane' | 'slowed' | 'crit_range' | 'magic_resistance' | 'helpless'
  | 'heightened' | 'resists' | 'immune' | 'vulnerable' | 'sneak' | 'mark' | 'out_of_range' | 'no_sight';

export const GOOD_REASONS: ReadonlySet<OddsReason> = new Set<OddsReason>(['unseen', 'prone_near', 'exposed', 'guided', 'studied', 'aimed', 'reckless', 'invisible', 'buff_adv', 'hunted', 'bless', 'bane', 'slowed', 'crit_range', 'helpless', 'heightened', 'vulnerable', 'sneak', 'mark']);

export interface DamageSpread { min: number; max: number; avg: number; type: string; dice: string }

export interface Odds {
  kind: 'attack' | 'save';
  /** 0 to 100: the chance to hit, or the chance the target fails its save. */
  chance: number;
  mode: OddsMode;
  /** Attack: the hero's bonus to hit and the armour class to beat (cover included). */
  bonus?: number;
  ac?: number;
  /** Save: the save, the hero's DC and the target's bonus. */
  save?: string;
  dc?: number;
  saveMod?: number;
  /** On a save spell: half damage when the target succeeds. */
  half?: boolean;
  damage?: DamageSpread;
  reasons: { code: OddsReason; n?: number }[];
  /** The target cannot be reached or seen from here: the chance is what it would be. */
  blocked?: 'range' | 'sight';
}

/** For each hero who may act now, the odds against every monster: the weapon and each enemy spell. */
export interface CombatOdds {
  heroId: string;
  attack: Record<string, Odds>;
  abilities: Record<string, Record<string, Odds>>;
}

/** The chance of each d20 face, with advantage or disadvantage and Halfling Luck (a natural 1 is rolled again once). */
export function d20Faces(mode: OddsMode, lucky = false): number[] {
  const base = Array.from({ length: 21 }, (_, v) => {
    if (v === 0) return 0;
    if (mode === 'normal') return 1 / 20;
    // P(max = v) = (v² - (v-1)²) / 400; P(min = v) = ((21-v)² - (20-v)²) / 400.
    return mode === 'advantage' ? (2 * v - 1) / 400 : (41 - 2 * v) / 400;
  });
  if (!lucky) return base;
  const one = base[1];
  return base.map((p, v) => (v === 0 ? 0 : v === 1 ? one * one : p + one * p));
}

/** The chance of each total of extra dice (Bless adds 1d4, Bane takes 1d4): sides > 0 add, < 0 subtract. */
function diceSpread(dice: number[]): Map<number, number> {
  let spread = new Map<number, number>([[0, 1]]);
  for (const sides of dice) {
    const n = Math.abs(sides), sign = Math.sign(sides);
    const next = new Map<number, number>();
    for (const [sum, p] of spread) for (let f = 1; f <= n; f++) next.set(sum + sign * f, (next.get(sum + sign * f) ?? 0) + p / n);
    spread = next;
  }
  return spread;
}

/** The chance an attack roll hits: a natural 1 misses, a natural crit (20, or less with Improved Critical) hits. */
export function hitChance(bonus: number, ac: number, mode: OddsMode, opts: { critAt?: number; lucky?: boolean; dice?: number[] } = {}): number {
  const faces = d20Faces(mode, opts.lucky);
  const extra = diceSpread(opts.dice ?? []);
  const critAt = opts.critAt ?? 20;
  let p = 0;
  for (let v = 1; v <= 20; v++) {
    if (v === 1) continue;
    if (v >= critAt) { p += faces[v]; continue; }
    for (const [add, q] of extra) if (v + bonus + add >= ac) p += faces[v] * q;
  }
  return p;
}

/** The chance a creature fails a save against `dc`. A save has no automatic success or failure on a 20 or a 1. */
export function failChance(saveMod: number, dc: number, mode: OddsMode, dice: number[] = []): number {
  const faces = d20Faces(mode);
  const extra = diceSpread(dice);
  let p = 0;
  for (let v = 1; v <= 20; v++) for (const [add, q] of extra) if (v + saveMod + add < dc) p += faces[v] * q;
  return p;
}

/** A whole percentage for showing: never 0 or 100 unless it truly is. */
export function percent(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 100;
  return Math.min(99, Math.max(1, Math.round(p * 100)));
}

/** Min, max and average of "2d6+3", "1d8 + 1d6" or "4". Unknown parts count as nothing. */
export function damageSpread(expr: string, type: string, scale = 1): DamageSpread {
  let min = 0, max = 0, avg = 0;
  const clean = expr.replace(/\s+/g, '');
  for (const m of clean.matchAll(/([+-]?)(\d+)(?:d(\d+))?/g)) {
    const sign = m[1] === '-' ? -1 : 1;
    const n = Number(m[2]);
    if (m[3]) { const s = Number(m[3]); min += sign * n; max += sign * n * s; avg += sign * n * (s + 1) / 2; }
    else { min += sign * n; max += sign * n; avg += sign * n; }
  }
  const f = (x: number) => Math.max(0, Math.floor(x * scale));
  return { min: f(min), max: f(max), avg: Math.max(0, Math.round(avg * scale * 10) / 10), type, dice: clean };
}

/** "1d8+3" plus a flat bonus, written the usual way. */
export function addFlat(dice: string, flat: number): string {
  if (!flat) return dice;
  const m = /^(.*?)([+-]\d+)$/.exec(dice);
  const base = m && /d/.test(m[1]) ? m[1] : dice;
  const had = m && /d/.test(m[1]) ? Number(m[2]) : 0;
  const total = had + flat;
  return total ? `${base}${total > 0 ? '+' : ''}${total}` : base;
}

/**
 * A spell's or feature's numbers for this hero, as the game will roll them: the attack bonus or the
 * save DC, and the dice with the hero's modifier already in. For tooltips.
 */
export function abilityFigures(c: Character, ab: AbilityDef, level: number): { toHit?: number; dc?: number; save?: string; dice?: string; spread?: DamageSpread; heal?: boolean } {
  const cmod = abilityMod(c.abilities[castingAbility(c)]);
  const isSpell = ab.spellLevel !== undefined;
  const base = ab.spellLevel ? diceAtLevel(ab, level) : ab.dice;
  const scale = ab.spellLevel === 0 || ab.id === 'breath_weapon' ? cantripScale(c.level) : 1;
  let dice = base && scale > 1 && ab.id !== 'eldritch_blast' ? base.replace(/^(\d+)/, (n) => String(Number(n) * scale)) : base;
  const out: ReturnType<typeof abilityFigures> = {};
  if (ab.kind === 'heal' && ab.flat === undefined && dice) {
    const bonus = cmod + (isSpell && (ab.spellLevel ?? 0) > 0 && hasFeature(c, 'disciple_of_life') ? 2 + level : 0);
    dice = addFlat(dice, bonus);
    out.heal = true;
  }
  if (ab.kind === 'attack') out.toHit = cmod + c.profBonus;
  if (ab.kind === 'save' && ab.saveAbility) {
    out.dc = 8 + c.profBonus + (ab.dcAbility ? abilityMod(c.abilities[ab.dcAbility]) : cmod) + (isSpell && c.conditions.includes('innate sorcery') ? 1 : 0);
    out.save = ab.saveAbility;
  }
  if (dice) { out.dice = dice; out.spread = damageSpread(dice, ab.damageType ?? ''); }
  return out;
}
