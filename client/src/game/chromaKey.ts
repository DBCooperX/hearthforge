// Painted battle figures come from the image model on one flat key colour (magenta, or green for pink and purple
// figures), because image models cannot paint a transparent background. This takes the colour out again: everything
// of the key colour that touches the edge of the picture goes, the outline of the figure is softened against it, and
// the colour that bled into that outline is taken back out, so no pink fringe is left on the battle map.

/** How close to the key colour a pixel must be to count as background, and where the soft edge ends. */
const HARD = 70;
const SOFT = 220;
/** Pixels this close to the key colour go even when the figure encloses them (between an arm and the body). */
const ENCLOSED = 40;

type RGB = [number, number, number];

const dist = (d: Uint8ClampedArray, i: number, k: RGB) =>
  Math.hypot(d[i] - k[0], d[i + 1] - k[1], d[i + 2] - k[2]);

/**
 * Take the key colour's cast out of one outline pixel: for magenta, red and blue together above green; for green,
 * green above red and blue. A dark outline painted against magenta otherwise keeps a purple rim.
 */
function despill(d: Uint8ClampedArray, i: number, key: RGB) {
  const high = [0, 1, 2].filter((c) => key[c] >= 128), low = [0, 1, 2].filter((c) => key[c] < 128);
  if (!high.length || !low.length) return;
  const spill = Math.min(...high.map((c) => d[i + c])) - Math.max(...low.map((c) => d[i + c]));
  if (spill > 0) for (const c of high) d[i + c] -= spill;
}

/** The key colour, read from the border of the picture: the median of its opaque pixels. Null when the border is already clear. */
export function borderColour(d: Uint8ClampedArray, w: number, h: number): RGB | null {
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  let clear = 0, total = 0;
  const take = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    total++;
    if (d[i + 3] < 128) { clear++; return; }
    rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]);
  };
  const step = Math.max(1, Math.floor(Math.min(w, h) / 64));
  for (let x = 0; x < w; x += step) { take(x, 0); take(x, h - 1); }
  for (let y = 0; y < h; y += step) { take(0, y); take(w - 1, y); }
  if (clear > total * 0.6 || !rs.length) return null;
  const mid = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  return [mid(rs), mid(gs), mid(bs)];
}

/**
 * Take the key colour out of RGBA pixels, in place. Returns the box around what is left of the figure, or null when
 * nothing is left (a picture that was all background).
 */
export function keyOut(d: Uint8ClampedArray, w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  const key = borderColour(d, w, h);
  if (key) {
    // 1. Flood the background in from the edges.
    const bg = new Uint8Array(w * h);
    const stack: number[] = [];
    const seed = (p: number) => { if (!bg[p] && dist(d, p * 4, key) < HARD) { bg[p] = 1; stack.push(p); } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w, y = (p - x) / w;
      if (x > 0) seed(p - 1);
      if (x < w - 1) seed(p + 1);
      if (y > 0) seed(p - w);
      if (y < h - 1) seed(p + w);
    }
    // 2. Enclosed holes of almost exactly the key colour.
    for (let p = 0; p < w * h; p++) if (!bg[p] && dist(d, p * 4, key) < ENCLOSED) bg[p] = 1;
    for (let p = 0; p < w * h; p++) if (bg[p]) d[p * 4 + 3] = 0;
    // 3. The outline: pixels next to the background are part key colour. Soften them and take the key colour out.
    for (let p = 0; p < w * h; p++) {
      if (bg[p]) continue;
      const x = p % w, y = (p - x) / w;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && bg[ny * w + nx]) { near = true; break; }
        }
      }
      if (!near) continue;
      const i = p * 4;
      const dd = dist(d, i, key);
      if (dd >= SOFT) { despill(d, i, key); continue; }
      const a = Math.max(0.05, (dd - HARD * 0.6) / (SOFT - HARD * 0.6));
      for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, Math.round((d[i + c] - (1 - a) * key[c]) / a)));
      d[i + 3] = Math.round(d[i + 3] * Math.min(1, a));
      despill(d, i, key);
    }
  }
  // 4. The box around the figure.
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  return x1 < x0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
