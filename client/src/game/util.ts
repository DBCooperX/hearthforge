import { ITEMS } from '../../../shared/content';
import type { Character, GameState, ItemDef, SlotId } from '../../../shared/types';

export const key = (x: number, y: number) => `${x},${y}`;
export const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function tileAt(state: GameState, x: number, y: number): string {
  if (y < 0 || y >= state.map.height || x < 0 || x >= state.map.width) return '#';
  return state.map.rows[y][x];
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Tiles the hero can reach with the given number of steps (mirrors the server's pathing rules). */
export function reachable(state: GameState, c: Character, steps: number): Set<string> {
  const out = new Set<string>();
  if (steps <= 0) return out;
  const walk = (x: number, y: number) => tileAt(state, x, y) === '.';
  const blocked = new Set<string>();
  for (const m of state.monsters) if (m.alive) blocked.add(key(m.x, m.y));
  for (const o of state.characters) if (o.id !== c.id && !o.dead && o.hp > 0) blocked.add(key(o.x, o.y));
  const dist = new Map<string, number>([[key(c.x, c.y), 0]]);
  const queue = [{ x: c.x, y: c.y }];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(key(cur.x, cur.y))!;
    if (d >= steps) continue;
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy, k = key(nx, ny);
      if (dist.has(k) || !walk(nx, ny) || blocked.has(k)) continue;
      if (dx && dy && (!walk(cur.x + dx, cur.y) || !walk(cur.x, cur.y + dy))) continue;
      dist.set(k, d + 1);
      out.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return out;
}

export function slotForItem(def: ItemDef): SlotId | null {
  if (def.kind === 'weapon') return 'mainHand';
  if (def.kind === 'shield') return 'offHand';
  if (def.kind === 'armor') return 'armor';
  if (def.kind === 'wondrous') return def.slot ?? null;
  return null;
}

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

export function weaponSummary(c: Character, t: (text: string) => string = (x) => x): string {
  const it = c.equipment.mainHand;
  const def = it ? ITEMS[it.defId] : null;
  if (!def?.weapon) return t('Unarmed strike');
  // German dice notation uses W (Würfel) where English uses d.
  const dice = t('d20') === 'W20' ? def.weapon.damage.replace(/d/g, 'W') : def.weapon.damage;
  return `${t(def.name)} (${dice} ${t(`${def.weapon.damageType} damage`)})`;
}
