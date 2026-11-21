import { describe, expect, it } from 'vitest';
import { PASSES, REVEAL_MS, blur, candidates, darkestShare, darkness, gradient, planStrokes, pointAt, seeded, traceEdges } from './charcoal';

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
  it('traces the real edges of a picture', () => {
    const w = 200, h = 160;
    const d = new Float32Array(w * h);
    for (let y = 50; y < 110; y++) for (let x = 60; x < 140; x++) d[y * w + x] = 1; // a dark rectangle
    const lines = traceEdges(gradient(blur(d, w, h, 1), w, h), w, h, seeded(3));
    expect(lines.length).toBeGreaterThan(0);
    // every traced point lies close to the rectangle's border, none far inside it or far outside
    for (const l of lines) for (const [x, y] of l) {
      const dist = Math.min(Math.abs(x - 60), Math.abs(x - 140), Math.abs(y - 50), Math.abs(y - 110));
      expect(dist).toBeLessThan(6);
    }
    const length = lines.reduce((n, l) => n + l.length, 0) * 3.5;
    expect(length).toBeGreaterThan(280); // most of the 280 px perimeter is followed
  });
  it('plans outlines first, then tones from dark to light, all inside the time', () => {
    const w = 400, h = 260;
    const d = new Float32Array(w * h).map((_, i) => ((i % w) % 40 < 6 ? 0.9 : 0.5));
    const edges = [[[10, 10], [20, 12], [30, 14], [40, 14]] as [number, number][]];
    const tones = [0.9, 0.8, 0.7, 0.6].map((lo, k) => candidates(d, w, h, lo, k === 0 ? 2 : 1, 12));
    const strokes = planStrokes(w, h, edges, tones, seeded(7));
    for (let layer = 0; layer <= 4; layer++) expect(strokes.some((s) => s.layer === layer)).toBe(true);
    for (const s of strokes) expect(s.start + s.dur).toBeLessThanOrEqual(REVEAL_MS);
    expect(Math.min(...strokes.filter((s) => s.layer === 0).map((s) => s.start))).toBeLessThan(PASSES[0][0]);
    const mean = (l: number) => { const st = strokes.filter((x) => x.layer === l).map((x) => x.start); return st.reduce((n, v) => n + v, 0) / st.length; };
    for (let l = 1; l < 5; l++) expect(mean(l - 1)).toBeLessThan(mean(l));
  });
  it('walks along a stroke', () => {
    expect(pointAt([[0, 0], [10, 0], [10, 10]], 0.5)).toEqual([10, 0]);
    expect(pointAt([[0, 0], [10, 0]], 2)).toEqual([10, 0]);
  });
});
