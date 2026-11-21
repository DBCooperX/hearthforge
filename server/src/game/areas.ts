// Areas of effect on the battle grid, measured between tile centres. One tile is 5 feet.

import type { MonsterArea } from '../data/monsters';

interface Pt { x: number; y: number }

/** Half the opening of a cone, as a cosine: a cone is as wide as it is long, with a little slack for the grid. */
const CONE_COS = 0.86;

/**
 * Is `p` inside an area that starts at `origin` (the centre of the creature's space) and is
 * aimed at `aim`? Distance limits are the caller's business; this only checks the shape.
 * For a sphere, `aim` is its centre.
 */
export function inArea(area: MonsterArea, origin: Pt, aim: Pt, p: Pt): boolean {
  if (area.shape === 'emanation') return true;
  if (area.shape === 'sphere') return Math.max(Math.abs(p.x - aim.x), Math.abs(p.y - aim.y)) * 5 <= area.size;
  const dx = aim.x - origin.x, dy = aim.y - origin.y;
  const len = Math.hypot(dx, dy);
  if (!len) return true;
  const ux = dx / len, uy = dy / len;
  const vx = p.x - origin.x, vy = p.y - origin.y;
  const along = vx * ux + vy * uy;
  if (along < 0) return false;
  const dist = Math.hypot(vx, vy);
  if (area.shape === 'cone') return dist === 0 || along / dist >= CONE_COS;
  const across = Math.abs(vx * uy - vy * ux);
  return across <= (area.width ?? 5) / 10 + 0.3;
}

