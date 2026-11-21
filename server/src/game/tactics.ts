// Where a monster stands at the end of its move. The Dungeon Master names a target and a broad
// tactic; this picks the square. Archers and casters look for a square they can shoot from,
// out of arm's reach and behind a tree, rock or crate; creatures backing off look for distance
// and cover; brutes that cannot reach their target get as close as they can. Pure functions over
// a small board interface, so the rules are easy to test without a whole game.

import { distToFootprint, nearestFootprintTile } from '../../../shared/monsterLook';

export type Pt = { x: number; y: number };

export interface Spot {
  p: Pt;
  /** Movement spent to get there, in 5 ft steps. */
  cost: number;
  /** The squares walked, excluding the start. */
  path: Pt[];
}

export interface Board {
  /** Whether its whole space could pass through here (allies may be walked through, enemies not). */
  canPass(p: Pt): boolean;
  /** Whether it could end its move with its top-left square here. */
  canStop(p: Pt): boolean;
  /** Movement it costs to step into this square. */
  cost(p: Pt): number;
  /** Whether a diagonal step from a to b cuts the corner of something solid. */
  cutsCorner(a: Pt, b: Pt): boolean;
}

const DIRS: Pt[] = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];
const k = (p: Pt) => `${p.x},${p.y}`;

/** Every square it could end its move on within the budget, with the cheapest way there. The start is always one. */
export function reachableSpots(board: Board, start: Pt, budget: number, maxNodes = 4000): Spot[] {
  const best = new Map<string, { cost: number; prev: string | null; p: Pt }>([[k(start), { cost: 0, prev: null, p: start }]]);
  const buckets: Pt[][] = [[start]];
  for (let cost = 0; cost < buckets.length && cost <= budget && best.size < maxNodes; cost++) {
    for (const cur of buckets[cost] ?? []) {
      if (best.get(k(cur))!.cost !== cost) continue;
      for (const d of DIRS) {
        const n = { x: cur.x + d.x, y: cur.y + d.y };
        if (!board.canPass(n)) continue;
        if (d.x !== 0 && d.y !== 0 && board.cutsCorner(cur, n)) continue;
        const c = cost + board.cost(n);
        if (c > budget) continue;
        const seen = best.get(k(n));
        if (seen && seen.cost <= c) continue;
        best.set(k(n), { cost: c, prev: k(cur), p: n });
        (buckets[c] ??= []).push(n);
      }
    }
  }
  const out: Spot[] = [];
  for (const [key, v] of best) {
    if (key !== k(start) && !board.canStop(v.p)) continue;
    const path: Pt[] = [];
    let at: string | null = key;
    while (at && at !== k(start)) {
      const node: { cost: number; prev: string | null; p: Pt } = best.get(at)!;
      path.unshift(node.p);
      at = node.prev;
    }
    out.push({ p: v.p, cost: v.cost, path });
  }
  return out;
}

/** The longest part of a path it can afford that ends on a square it may stop on. */
export function affordablePrefix(board: Board, path: Pt[], budget: number): Pt[] {
  let spent = 0;
  let end = 0;
  for (let i = 0; i < path.length; i++) {
    spent += board.cost(path[i]);
    if (spent > budget) break;
    if (board.canStop(path[i])) end = i + 1;
  }
  return path.slice(0, end);
}

export interface Foe extends Pt {
  id: string;
  /** It still threatens the squares around it (conscious, not incapacitated). */
  threatens: boolean;
}

export interface Shot {
  /** Normal and long range, in feet. */
  range: number;
  long: number;
}

export type Stance = 'engage' | 'hold_position' | 'retreat' | 'disengage';

export interface SpotQuery {
  spots: Spot[];
  start: Pt;
  /** Squares along one side of its space. */
  size: number;
  foes: Foe[];
  target: Foe;
  /** Its ranged attack, or null when it fights in melee. */
  shot: Shot | null;
  stance: Stance;
  /** Its movement never provokes (Disengage, Flyby). */
  noProvoke: boolean;
  los(a: Pt, b: Pt): boolean;
  /** Does a shot from `from` at `to` have to pass cover next to `to`? */
  cover(from: Pt, to: Pt): boolean;
}

export interface Scored { spot: Spot; score: number; shot: 0 | 1 | 2 }

/** How good a square is to end the move on, for a creature that shoots or one that backs off. */
export function scoreSpot(q: SpotQuery, spot: Spot): Scored {
  const { size, foes, target, shot, stance } = q;
  const p = spot.p;
  const live = foes.filter((f) => f.threatens);
  const dist = (f: Pt) => distToFootprint(p, size, f);
  const eye = (f: Pt) => nearestFootprintTile(p, size, f);
  let canShoot: 0 | 1 | 2 = 0;
  if (shot) {
    const d = dist(target) * 5;
    if (q.los(eye(target), target)) canShoot = d <= shot.range ? 2 : d <= shot.long ? 1 : 0;
  }
  const adjacent = live.filter((f) => dist(f) <= 1).length;
  // Heroes who would have to shoot past cover to hit it here, or cannot see it at all.
  const sheltered = foes.filter((f) => !q.los(f, eye(f)) || q.cover(f, eye(f))).length;
  const targetShelter = !q.los(target, eye(target)) || q.cover(target, eye(target));
  const nearest = live.length ? Math.min(...live.map(dist)) : 10;
  // Heroes whose reach it would leave on the way, each of whom may strike as it goes.
  const provokes = q.noProvoke ? 0 : live.filter((f) => distToFootprint(q.start, size, f) <= 1 && dist(f) > 1).length;
  let score = 0;
  if (stance === 'retreat' || stance === 'disengage') {
    score += Math.min(nearest, 8) * 12 + sheltered * 6 + canShoot * 8 - provokes * 30 - adjacent * 40;
  } else {
    // Engage or hold: a clear shot first, then out of reach, then cover, then a little room.
    score += canShoot === 2 ? 100 : canShoot === 1 ? 35 : 0;
    score -= adjacent * 60;
    score += sheltered * 8 + (targetShelter ? 10 : 0);
    score += Math.min(nearest, 5) * 3;
    score -= provokes * 30;
    // Do not wander for nothing; holding a position means barely moving at all.
    score -= spot.cost * (stance === 'hold_position' ? 4 : 0.6);
  }
  return { spot, score, shot: canShoot };
}

/** The best square to end the move on. Ties keep it where it is, then the shorter walk. */
export function bestSpot(q: SpotQuery): Scored {
  let best: Scored | null = null;
  for (const s of q.spots) {
    const r = scoreSpot(q, s);
    if (!best || r.score > best.score + 1e-9 || (Math.abs(r.score - best.score) < 1e-9 && s.cost < best.spot.cost)) best = r;
  }
  return best ?? { spot: { p: q.start, cost: 0, path: [] }, score: 0, shot: 0 };
}
