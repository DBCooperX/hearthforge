import { describe, expect, it } from 'vitest';
import { PASSES, REVEAL_MS, candidates, darkestShare, darkness, planStrokes, pointAt, seeded } from './charcoal';

describe('charcoal reveal planning', () => {
  it('finds the level of the darkest share', () => {
    const d = new Float32Array(100).map((_, i) => i / 100);
    expect(darkestShare(d, 0.1)).toBeGreaterThanOrEqual(0.88);
    expect(darkestShare(d, 0.5)).toBeGreaterThan(0.4);
  });
  it('measures darkness from colour', () => {
    const d = darkness(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]));
    expect(d[0]).toBeCloseTo(1); expect(d[1]).toBeCloseTo(0);
  });
  it('plans outlines first, then shading, then a broad pass, all inside the time', () => {
    const w = 400, h = 260;
    const d = new Float32Array(w * h).map((_, i) => ((i % w) % 40 < 6 ? 0.9 : 0.5));
    const strokes = planStrokes(w, h, candidates(d, w, h, 0.8, 2), candidates(d, w, h, 0.4, 0.8), seeded(7));
    for (const layer of [0, 1, 2] as const) expect(strokes.some((s) => s.layer === layer)).toBe(true);
    for (const s of strokes) {
      expect(s.start).toBeGreaterThanOrEqual(PASSES[s.layer][0]);
      expect(s.start + s.dur).toBeLessThanOrEqual(REVEAL_MS);
    }
    const first = (l: number) => Math.min(...strokes.filter((s) => s.layer === l).map((s) => s.start));
    expect(first(0)).toBeLessThan(first(1));
    expect(first(1)).toBeLessThan(first(2));
  });
  it('walks along a stroke', () => {
    expect(pointAt([[0, 0], [10, 0], [10, 10]], 0.5)).toEqual([10, 0]);
    expect(pointAt([[0, 0], [10, 0]], 2)).toEqual([10, 0]);
  });
});
