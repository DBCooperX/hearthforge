import { describe, expect, it } from 'vitest';
import { borderColour, keyOut } from './game/chromaKey';

/** A w×h picture of one colour with a rectangle of another in the middle. */
function picture(w: number, h: number, bg: number[], fig: number[], box: { x: number; y: number; w: number; h: number }) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inside = x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
    d.set([...(inside ? fig : bg), 255], (y * w + x) * 4);
  }
  return d;
}

describe('taking the key colour out of a painted figure', () => {
  it('clears a magenta background and finds the figure', () => {
    const d = picture(40, 60, [252, 4, 250], [90, 60, 40], { x: 10, y: 8, w: 20, h: 44 });
    expect(borderColour(d, 40, 60)).toEqual([252, 4, 250]);
    expect(keyOut(d, 40, 60)).toEqual({ x: 10, y: 8, w: 20, h: 44 });
    expect(d[3]).toBe(0);
    expect(d[(30 * 40 + 20) * 4 + 3]).toBe(255);
    expect(Array.from(d.slice((30 * 40 + 20) * 4, (30 * 40 + 20) * 4 + 3))).toEqual([90, 60, 40]);
  });

  it('softens a pink fringe and takes the magenta out of it', () => {
    const d = picture(20, 20, [255, 0, 255], [40, 40, 40], { x: 5, y: 5, w: 10, h: 10 });
    // Half figure, half magenta: the anti-aliased edge an image model paints.
    const i = (5 * 20 + 10) * 4;
    d.set([148, 20, 148, 255], i);
    keyOut(d, 20, 20);
    expect(d[i + 3]).toBeGreaterThan(0);
    expect(d[i + 3]).toBeLessThan(255);
    expect(d[i]).toBeLessThan(110);
  });

  it('leaves a picture with a clear border alone, and keeps green figures on a green key', () => {
    const clear = picture(10, 10, [0, 0, 0], [200, 0, 0], { x: 3, y: 3, w: 4, h: 4 });
    for (let p = 0; p < 100; p++) { const x = p % 10, y = Math.floor(p / 10); if (x < 3 || x > 6 || y < 3 || y > 6) clear[p * 4 + 3] = 0; }
    expect(borderColour(clear, 10, 10)).toBeNull();
    expect(keyOut(clear, 10, 10)).toEqual({ x: 3, y: 3, w: 4, h: 4 });
    const pink = picture(20, 20, [0, 255, 0], [230, 80, 200], { x: 4, y: 4, w: 12, h: 12 });
    expect(keyOut(pink, 20, 20)).toEqual({ x: 4, y: 4, w: 12, h: 12 });
  });

  it('returns null when nothing but background is left', () => {
    const d = picture(8, 8, [255, 0, 255], [255, 0, 255], { x: 0, y: 0, w: 0, h: 0 });
    expect(keyOut(d, 8, 8)).toBeNull();
  });
});
