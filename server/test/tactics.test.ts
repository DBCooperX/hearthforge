import { describe, expect, it } from 'vitest';
import { hasCover } from '../../shared/battlemap';
import { MONSTERS } from '../src/data/monsters';
import { Game } from '../src/game/engine';
import { affordablePrefix, reachableSpots, type Board } from '../src/game/tactics';

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type P = { x: number; y: number };

/** A running fight on a hand-drawn map, with heroes and monsters where the test puts them. */
function field(rows: string[], heroes: P[], monsters: { defId: string; at: P }[], seed = 3) {
  const g = new Game('test', seeded(seed));
  g.upsertPlayer('p1', 'Tester', true);
  for (let i = 0; i < heroes.length; i++) g.addCharacter('p1', (['fighter', 'wizard', 'rogue', 'cleric'] as const)[i], '');
  g.start();
  const groups = new Map<string, number>();
  for (const m of monsters) groups.set(m.defId, (groups.get(m.defId) ?? 0) + 1);
  g.startEncounter([...groups].map(([defId, count]) => ({ defId, count })), { source: 'story', context: 'test' });
  g.s.rows = rows;
  g.s.characters.forEach((c, i) => Object.assign(c, heroes[i]));
  const placed = new Set<string>();
  const ms = monsters.map((spec) => {
    const m = g.s.monsters.find((x) => x.defId === spec.defId && !placed.has(x.id))!;
    placed.add(m.id);
    Object.assign(m, spec.at);
    return m;
  });
  // Bright light everywhere, so sight never gets in the way of what is being tested.
  if (g.s.combat) (g.s.combat as { light?: unknown }).light = 'bright';
  return { g, ms, heroes: g.s.characters };
}

const open = (w: number, h: number, extra: Record<string, string> = {}) =>
  Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (y === 0 || y === h - 1 || x === 0 || x === w - 1 ? '#' : extra[`${x},${y}`] ?? '.')).join(''));

describe('monster tactics', () => {
  it('walks through allies but never stops on them', () => {
    const rows = ['#######', '#.....#', '#######'];
    const board: Board = {
      canPass: (p) => rows[p.y]?.[p.x] === '.',
      canStop: (p) => !(p.x === 2 && p.y === 1),
      cost: () => 1,
      cutsCorner: () => false,
    };
    const spots = reachableSpots(board, { x: 1, y: 1 }, 3);
    expect(spots.map((s) => s.p.x).sort()).toEqual([1, 3, 4]);
    expect(affordablePrefix(board, [{ x: 2, y: 1 }, { x: 3, y: 1 }], 1)).toEqual([]);
    expect(affordablePrefix(board, [{ x: 2, y: 1 }, { x: 3, y: 1 }], 2)).toEqual([{ x: 2, y: 1 }, { x: 3, y: 1 }]);
  });

  it('sends an archer in the open behind cover it can still shoot from', () => {
    // A short row of trees a few steps off; the goblin starts in the open, well within bow range.
    const trees: Record<string, string> = {};
    for (let y = 4; y <= 6; y++) trees[`12,${y}`] = 'T';
    const rows = open(20, 11, trees);
    const { g, ms, heroes } = field(rows, [{ x: 3, y: 5 }], [{ defId: 'goblin', at: { x: 9, y: 5 } }]);
    const m = ms[0];
    expect(hasCover(rows, heroes[0], m)).toBe(false);
    const r = g.monsterAct(m.id, { targetId: heroes[0].id, attack: 'Shortbow', tactic: 'engage' });
    expect(r.moved).toBeGreaterThan(0);
    expect(hasCover(rows, heroes[0], m)).toBe(true);
    expect(r.attack?.name).toBe('Shortbow');
  });

  it('keeps an archer out of arm\'s reach, slipping away with Nimble Escape', () => {
    const rows = open(20, 11);
    const { g, ms, heroes } = field(rows, [{ x: 5, y: 5 }], [{ defId: 'goblin', at: { x: 6, y: 5 } }]);
    const m = ms[0];
    const r = g.monsterAct(m.id, { targetId: heroes[0].id, attack: 'Shortbow', tactic: 'engage' });
    expect(r.moved).toBeGreaterThan(1);
    expect(r.disengaged).toBe(true);
    expect(r.struckBy ?? []).toEqual([]);
    expect(Math.max(Math.abs(m.x - heroes[0].x), Math.abs(m.y - heroes[0].y))).toBeGreaterThan(1);
    expect(r.attack?.name).toBe('Shortbow');
  });

  it('takes a small step to cover when told to hold its position', () => {
    const rows = open(20, 11, { '11,5': 'o', '11,4': 'o', '11,6': 'o' });
    const { g, ms, heroes } = field(rows, [{ x: 3, y: 5 }], [{ defId: 'goblin', at: { x: 13, y: 5 } }]);
    const m = ms[0];
    const r = g.monsterAct(m.id, { targetId: heroes[0].id, attack: 'Shortbow', tactic: 'hold_position' });
    expect(r.moved).toBeLessThanOrEqual(2);
    expect(hasCover(rows, heroes[0], m)).toBe(true);
  });

  it('lets a flier move at its flying speed', () => {
    expect(MONSTERS.bat.fly).toBeGreaterThan(MONSTERS.bat.speed);
    const rows = open(24, 9);
    const { g, ms, heroes } = field(rows, [{ x: 2, y: 4 }], [{ defId: 'bat', at: { x: 20, y: 4 } }]);
    const r = g.monsterAct(ms[0].id, { targetId: heroes[0].id, tactic: 'engage' });
    expect(r.moved).toBe(MONSTERS.bat.fly! / 5);
  });

  it('squeezes past an ally standing in a doorway to reach the fight', () => {
    const rows = ['##########', '#...#....#', '#.........#'.slice(0, 10), '#...#....#', '##########'];
    const { g, ms, heroes } = field(rows, [{ x: 1, y: 2 }], [{ defId: 'orc', at: { x: 4, y: 2 } }, { defId: 'goblin', at: { x: 6, y: 2 } }]);
    const goblin = ms[1];
    const r = g.monsterAct(goblin.id, { targetId: heroes[0].id, attack: 'Scimitar', tactic: 'engage' });
    expect(Math.max(Math.abs(goblin.x - heroes[0].x), Math.abs(goblin.y - heroes[0].y))).toBe(1);
    expect(r.attack?.name).toBe('Scimitar');
  });

  it('goes for another hero when its chosen one is walled in', () => {
    // pc1 sits in a dead end, its only open side taken by a zombie; the wolf picks the wizard instead.
    const rows = ['############', '#.#........#', '#.#........#', '############'];
    const { g, ms, heroes } = field(rows, [{ x: 1, y: 1 }, { x: 9, y: 2 }], [{ defId: 'zombie', at: { x: 1, y: 2 } }, { defId: 'wolf', at: { x: 5, y: 1 } }]);
    const wolf = ms[1];
    const r = g.monsterAct(wolf.id, { targetId: heroes[0].id, tactic: 'engage' });
    expect(r.moved).toBeGreaterThan(0);
    expect(r.attack?.target).toBe(heroes[1].name);
  });
});
