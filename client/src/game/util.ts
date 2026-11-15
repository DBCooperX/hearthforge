import { SPECIES } from '../../../shared/rules';
import { BUFF_HELP, CONDITION_HELP } from '../../../shared/conditions';
import { movementCosts } from '../../../shared/battlemap';
import { SPECIES_DARKVISION, canSee, lightGrid, type LightLevel, type Senses } from '../../../shared/light';
import { distToFootprint, nearestFootprintTile } from '../../../shared/monsterLook';
import type { MonsterView } from '../../../shared/types';
import { itemDef } from '../../../shared/items';
import type { Character, GameState } from '../../../shared/types';

export const key = (x: number, y: number) => `${x},${y}`;
export const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function tileAt(state: GameState, x: number, y: number): string {
  if (y < 0 || y >= state.map.height || x < 0 || x >= state.map.width) return '#';
  return state.map.rows[y][x];
}

function blockedFor(state: GameState, c: Character): Set<string> {
  const blocked = new Set<string>();
  for (const m of state.monsters) if (m.alive) for (let dy = 0; dy < m.tiles; dy++) for (let dx = 0; dx < m.tiles; dx++) blocked.add(key(m.x + dx, m.y + dy));
  for (const o of state.characters) if (o.id !== c.id && !o.dead && o.hp > 0) blocked.add(key(o.x, o.y));
  return blocked;
}

/** Tiles the hero can reach with the given movement (the same pathing rules the server enforces). */
export function reachable(state: GameState, c: Character, steps: number): Set<string> {
  const out = new Set<string>();
  if (steps <= 0) return out;
  const blocked = blockedFor(state, c);
  for (const [k, v] of movementCosts(state.map.rows, c, steps, (x, y) => blocked.has(key(x, y)))) if (v.cost > 0) out.add(k);
  return out;
}

/** The cheapest way to a tile within the movement left, without the start tile, or null. */
export function pathTo(state: GameState, c: Character, steps: number, x: number, y: number): { x: number; y: number }[] | null {
  const blocked = blockedFor(state, c);
  const costs = movementCosts(state.map.rows, c, steps, (bx, by) => blocked.has(key(bx, by)));
  if (!costs.has(key(x, y)) || (c.x === x && c.y === y)) return null;
  const path: { x: number; y: number }[] = [];
  for (let k: string | null = key(x, y); k && k !== key(c.x, c.y); k = costs.get(k)?.prev ?? null) {
    const [px, py] = k.split(',').map(Number);
    path.unshift({ x: px, y: py });
  }
  return path;
}

// ---------------------------------------------------------------- light and sight

/** Light on every tile of the battle map, row-major, exactly as the server rules with it. */
export function lightLevels(state: GameState): LightLevel[] {
  return lightGrid(state.map.rows, state.light?.ambient ?? 'bright', state.light?.sources ?? []);
}

export const heroSenses = (c: Character): Senses => ({ darkvision: SPECIES_DARKVISION[c.speciesId] ?? 0, blindsight: 0 });

const levelAt = (state: GameState, grid: LightLevel[], p: { x: number; y: number }) => grid[p.y * state.map.width + p.x] ?? 'dark';

/** Can this hero make out any square of the monster? */
export function heroSees(state: GameState, grid: LightLevel[], c: Character, m: MonsterView): boolean {
  for (let dy = 0; dy < m.tiles; dy++) for (let dx = 0; dx < m.tiles; dx++) {
    const p = { x: m.x + dx, y: m.y + dy };
    if (canSee(state.map.rows, c, heroSenses(c), p, levelAt(state, grid, p))) return true;
  }
  return false;
}

/** Can the monster make out a hero standing at `at`? */
export function monsterSees(state: GameState, grid: LightLevel[], m: MonsterView, at: { x: number; y: number }): boolean {
  return canSee(state.map.rows, nearestFootprintTile(m, m.tiles, at), m.senses ?? { darkvision: 0, blindsight: 0 }, at, levelAt(state, grid, at));
}

/** Monsters that would make an opportunity attack against the hero walking this path. */
export function provokersOf(state: GameState, c: Character, path: { x: number; y: number }[]): MonsterView[] {
  const combat = state.combat;
  if (!combat || combat.disengaged) return [];
  const grid = lightLevels(state);
  const reacted = combat.reacted ?? [];
  const out: MonsterView[] = [];
  let from: { x: number; y: number } = c;
  for (const q of path) {
    for (const m of state.monsters) {
      if (!m.alive || reacted.includes(m.id) || out.includes(m) || !m.reach) continue;
      if (distToFootprint(m, m.tiles, from) <= m.reach && distToFootprint(m, m.tiles, q) > m.reach && monsterSees(state, grid, m, from)) out.push(m);
    }
    from = q;
  }
  return out;
}

export { slotForItem } from '../../../shared/inventory';

export function mod(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

/** A hero's class in the player's language, in the feminine form where the language has one (Magierin). */
export function classLabel(c: { className: string; gender?: string }, t: (text: string) => string): string {
  const key = `${c.className} (female)`;
  const feminine = c.gender === 'female' ? t(key) : key;
  return feminine === key ? t(c.className) : feminine;
}

/** Species and class together: "Orc Fighter" in English, "Kämpferin (Ork)" in German, where the class carries the gender. */
export function heroTitle(c: { className: string; gender?: string; speciesId?: string }, t: (text: string, vars?: Record<string, string | number>) => string): string {
  const species = c.speciesId ? t(SPECIES[c.speciesId as keyof typeof SPECIES]?.name ?? '') : '';
  return species ? t('{species} {class}', { species, class: classLabel(c, t) }) : classLabel(c, t);
}

export function weaponSummary(state: GameState, c: Character, t: (text: string) => string = (x) => x): string {
  const it = c.equipment.mainHand;
  const def = it ? itemDef(state.items, it.defId) : null;
  if (!def?.weapon) return t('Unarmed strike');
  // German dice notation uses W (Würfel) where English uses d.
  const dice = t('d20') === 'W20' ? def.weapon.damage.replace(/d/g, 'W') : def.weapon.damage;
  return `${t(def.name)} (${dice} ${t(`${def.weapon.damageType} damage`)})`;
}

/** What a condition on a hero does, for the tooltip of its chip. */
export function conditionHelp(condition: string, t: (text: string) => string): string | undefined {
  const help = (CONDITION_HELP as Record<string, string>)[condition] ?? BUFF_HELP[condition];
  return help ? t(help) : undefined;
}
