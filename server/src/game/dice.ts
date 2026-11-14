export type Rng = () => number;

export function rollDie(sides: number, rng: Rng): number {
  return Math.floor(rng() * sides) + 1;
}

export interface RollResult {
  total: number;
  rolls: number[];
  modifier: number;
}

/** Roll a dice expression like "2d6+3", "1d8" or "1d4-1". With crit, dice are doubled. */
export function roll(expr: string, rng: Rng, crit = false): RollResult {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(expr.replace(/\s+/g, ''));
  if (!m) throw new Error(`Bad dice expression: ${expr}`);
  const count = Number(m[1]) * (crit ? 2 : 1);
  const sides = Number(m[2]);
  const modifier = m[3] ? Number(m[3]) : 0;
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) rolls.push(rollDie(sides, rng));
  return { total: Math.max(0, rolls.reduce((a, b) => a + b, 0) + modifier), rolls, modifier };
}

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export function rollMode(advantage: boolean, disadvantage: boolean): RollMode {
  if (advantage && !disadvantage) return 'advantage';
  if (disadvantage && !advantage) return 'disadvantage';
  return 'normal';
}

export function d20(rng: Rng, mode: RollMode = 'normal'): { value: number; rolls: number[] } {
  const a = rollDie(20, rng);
  if (mode === 'normal') return { value: a, rolls: [a] };
  const b = rollDie(20, rng);
  return { value: mode === 'advantage' ? Math.max(a, b) : Math.min(a, b), rolls: [a, b] };
}

export function fmtD20(r: { value: number; rolls: number[] }, mode: RollMode): string {
  if (mode === 'normal') return `${r.value}`;
  return `${r.value} (${mode}: ${r.rolls.join(', ')})`;
}

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
