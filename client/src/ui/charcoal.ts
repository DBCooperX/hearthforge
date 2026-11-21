// The charcoal reveal: a story picture is "drawn" on aged paper in three passes of brush strokes (dark outlines, then
// shading, then the lightest tones). It all happens in the browser on a canvas; the picture file is the same one the
// server already serves, so it costs nothing and needs no extra asset.

export interface Stroke { pts: [number, number][]; width: number; start: number; dur: number; layer: number }
export type Rng = () => number;

/** Total time of the animation in milliseconds. */
export const REVEAL_MS = 6600;
/** Share of the picture (darkest first) that each tone layer ends at. The last layer is everything. */
export const BAND_SHARES = [0.08, 0.22, 0.42, 0.68];
/** When each layer is drawn, in milliseconds: the dark marks first, the light tones last. They overlap a little. */
export const PASSES: [number, number][] = [[1500, 2700], [2300, 3500], [3100, 4300], [3900, 5100], [4700, 5900]];
/** The outlines that trace the picture's real edges, drawn before the tones. */
export const OUTLINE_PASS: [number, number] = [0, 2300];
/** Hatching direction (radians) of each tone layer, alternating so the shading cross-hatches. */
const HATCH = [-0.7, 0.55, -0.35, 0.9];

/** How dark each pixel is (0 light … 1 dark). */
export function darkness(rgba: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = 1 - (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255;
  return out;
}

/** The darkness above which a share of the picture lies, e.g. 0.12 gives the level of the darkest 12 percent. */
export function darkestShare(d: Float32Array, share: number): number {
  const bins = new Uint32Array(256);
  for (const v of d) bins[Math.min(255, Math.max(0, Math.floor(v * 255)))]++;
  let n = 0;
  const want = d.length * share;
  for (let b = 255; b >= 0; b--) { n += bins[b]; if (n >= want) return b / 255; }
  return 0;
}

/** A box blur (two passes), so noise and paper grain do not count as edges. */
export function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  let a = src;
  for (let pass = 0; pass < 2; pass++) {
    const tmp = new Float32Array(a.length), out = new Float32Array(a.length);
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += a[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = sum / (2 * r + 1);
        sum += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum / (2 * r + 1);
        sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    a = out;
  }
  return a;
}

export interface Gradient { gx: Float32Array; gy: Float32Array; mag: Float32Array }
/** Sobel gradient of the (blurred) darkness: it points across an edge, so the edge itself runs at right angles to it. */
export function gradient(d: Float32Array, w: number, h: number): Gradient {
  const gx = new Float32Array(d.length), gy = new Float32Array(d.length), mag = new Float32Array(d.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = d[i - w - 1], b = d[i - w], c = d[i - w + 1], e = d[i - 1], f = d[i + 1], g = d[i + w - 1], hh = d[i + w], k = d[i + w + 1];
      const sx = (c + 2 * f + k) - (a + 2 * e + g), sy = (g + 2 * hh + k) - (a + 2 * b + c);
      gx[i] = sx; gy[i] = sy; mag[i] = Math.hypot(sx, sy);
    }
  }
  return { gx, gy, mag };
}

/**
 * Follows the picture's real edges: from strong edge points it walks along the edge (at right angles to the gradient) in
 * both directions until the edge fades, turns sharply or has been walked before. The result is a set of polylines.
 */
export function traceEdges(gr: Gradient, w: number, h: number, rng: Rng, maxStrokes = 1100): [number, number][][] {
  const { gx, gy, mag } = gr;
  const strong = percentile(mag, 0.88);
  if (strong <= 1e-4) return [];
  const step = 3.5 * Math.max(1, Math.max(w, h) / 1000), maxLen = 240 * Math.max(1, Math.max(w, h) / 1000);
  const cell = Math.max(3, Math.round(step));
  const cw = Math.ceil(w / cell), visited = new Uint8Array(cw * Math.ceil(h / cell));
  const at = (x: number, y: number) => (Math.round(y) * w + Math.round(x));
  const inside = (x: number, y: number) => x >= 2 && y >= 2 && x < w - 2 && y < h - 2;
  const mark = (x: number, y: number) => { visited[Math.floor(y / cell) * cw + Math.floor(x / cell)] = 1; };
  const seen = (x: number, y: number) => visited[Math.floor(y / cell) * cw + Math.floor(x / cell)] === 1;
  const seeds: [number, number][] = [];
  for (let y = 3; y < h - 3; y += cell) for (let x = 3; x < w - 3; x += cell) if (mag[y * w + x] >= strong) seeds.push([x, y]);
  for (let i = seeds.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [seeds[i], seeds[j]] = [seeds[j], seeds[i]]; }
  const walk = (x: number, y: number, dir: number): [number, number][] => {
    const pts: [number, number][] = [];
    let px = x, py = y;
    const k0 = at(px, py);
    let tx = -gy[k0] / (mag[k0] || 1), ty = gx[k0] / (mag[k0] || 1);
    tx *= dir; ty *= dir;
    for (let len = 0; len < maxLen; len += step) {
      px += tx * step; py += ty * step;
      if (!inside(px, py)) break;
      const k = at(px, py), m = mag[k];
      if (m < strong * 0.55 || seen(px, py)) break;
      let nx = -gy[k] / m, ny = gx[k] / m;
      if (nx * tx + ny * ty < 0) { nx = -nx; ny = -ny; }
      if (nx * tx + ny * ty < 0.5) break;
      tx = nx; ty = ny;
      pts.push([px, py]);
      mark(px, py);
    }
    return pts;
  };
  const out: [number, number][][] = [];
  for (const [sx, sy] of seeds) {
    if (out.length >= maxStrokes) break;
    if (seen(sx, sy)) continue;
    mark(sx, sy);
    const back = walk(sx, sy, -1).reverse(), fwd = walk(sx, sy, 1);
    const line: [number, number][] = [...back, [sx, sy], ...fwd];
    if (line.length >= 4) out.push(line);
  }
  return out;
}

/** The value below which `p` (0..1) of the numbers lie, from a histogram, so it is fast on a million pixels. */
export function percentile(v: Float32Array, p: number): number {
  let max = 0;
  for (const x of v) if (x > max) max = x;
  if (max <= 0) return 0;
  const bins = new Uint32Array(512);
  for (const x of v) bins[Math.min(511, Math.floor((x / max) * 511))]++;
  let n = 0;
  const want = v.length * p;
  for (let b = 0; b < 512; b++) { n += bins[b]; if (n >= want) return ((b + 1) / 512) * max; }
  return max;
}

/** Points where a layer has something to draw (every `step` pixels), so strokes go where the picture has marks. */
export function candidates(d: Float32Array, w: number, h: number, lo: number, hi: number, step = 6): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) { const v = d[y * w + x]; if (v >= lo && v < hi) out.push([x, y]); }
  return out;
}

/** Every stroke of the picture, planned up front: where, how wide, when it starts and how long it takes. */
export function planStrokes(w: number, h: number, edges: [number, number][][], tones: [number, number][][], rng: Rng): Stroke[] {
  const scale = Math.max(w, h) / 960;
  const strokes: Stroke[] = [];
  // 1. Outlines: the real edges, drawn in a sweep from left to right with some scatter, each at a hand's pace.
  const [o0, o1] = OUTLINE_PASS;
  for (const line of edges) {
    let len = 0;
    for (let i = 1; i < line.length; i++) len += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    const cx = line[Math.floor(line.length / 2)][0];
    strokes.push({ pts: line, width: (5 + rng() * 4) * scale, start: o0 + (0.7 * (cx / w) + 0.3 * rng()) * (o1 - o0) * 0.85, dur: 90 + len * 1.6, layer: 0 });
  }
  // 2. Tones from the darkest to the lightest: short hatching strokes over where that tone lies, sweeping across the page.
  const widths = [11, 15, 20, 26];
  tones.forEach((cells, k) => {
    const [t0, t1] = PASSES[k];
    const ang0 = HATCH[k % HATCH.length], len = (60 + k * 14) * scale, wd = widths[k % widths.length] * scale;
    for (const [x, y] of cells) {
      const a = ang0 + (rng() - 0.5) * 0.3, dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2;
      const bend = (rng() - 0.5) * 8 * scale;
      strokes.push({
        pts: [[x - dx, y - dy], [x + bend, y + bend * 0.5], [x + dx, y + dy]], width: wd,
        start: t0 + (0.6 * ((x + y) / (w + h)) + 0.4 * rng()) * (t1 - t0) * 0.85, dur: 120 + rng() * 160, layer: k,
      });
    }
  });
  // 3. The broad final pass: wide, slightly wavy strokes back and forth over the whole page, for the lightest tones.
  const rows = 16, last = tones.length;
  const [f0, f1] = PASSES[last];
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * (h / rows);
    const ltr = r % 2 === 0;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 8; i++) { const x = -50 * scale + (w + 100 * scale) * (ltr ? i / 8 : 1 - i / 8); pts.push([x, y + (rng() - 0.5) * 16 * scale]); }
    strokes.push({ pts, width: (h / rows) * 1.9, start: f0 + (r / rows) * (f1 - f0) * 0.8, dur: 600 + rng() * 200, layer: last });
  }
  return strokes;
}

/** A point part-way along a polyline, t from 0 to 1. */
export function pointAt(pts: [number, number][], t: number): [number, number] {
  const f = Math.min(1, Math.max(0, t)) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f));
  const k = f - i;
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
}

/** A small seeded random source, so the tests can repeat a drawing. */
export function seeded(seed: number): Rng {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function canvas(w: number, h: number): HTMLCanvasElement { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/** Aged paper: warm tone, darker edges, speckles and a few fibres. */
function paper(w: number, h: number, rng: Rng): HTMLCanvasElement {
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  g.fillStyle = '#e9dfca';
  g.fillRect(0, 0, w, h);
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(160,120,60,0)');
  v.addColorStop(1, 'rgba(120,84,40,0.38)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < Math.floor((w * h) / 350); i++) {
    g.fillStyle = rng() < 0.5 ? `rgba(110,80,40,${0.03 + rng() * 0.08})` : `rgba(255,248,230,${0.04 + rng() * 0.1})`;
    g.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2);
  }
  g.strokeStyle = 'rgba(110,84,50,0.07)';
  g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { const x = rng() * w, y = rng() * h; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + rng() * 30 - 15, y + rng() * 30 - 15, x + rng() * 40 - 20, y + rng() * 40 - 20); g.stroke(); }
  return c;
}

/** Draws a loaded picture onto `target` stroke by stroke. Call `frame` from requestAnimationFrame with the elapsed milliseconds. */
export class CharcoalReveal {
  private layers: HTMLCanvasElement[] = [];
  private masks: HTMLCanvasElement[] = [];
  private paper: HTMLCanvasElement;
  private art: HTMLCanvasElement;
  private strokes: Stroke[];
  private drawn: number[];
  private tmp: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  constructor(target: HTMLCanvasElement, img: HTMLImageElement, seed = Date.now()) {
    const w = target.width, h = target.height;
    const rng = seeded(seed);
    this.ctx = target.getContext('2d')!;
    this.paper = paper(w, h, rng);
    // The picture, scaled like `object-fit: cover`.
    this.art = canvas(w, h);
    const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const iw = img.naturalWidth * k, ih = img.naturalHeight * k;
    const a = this.art.getContext('2d', { willReadFrequently: true })!;
    a.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
    const px = a.getImageData(0, 0, w, h);
    const raw = darkness(px.data);
    // Edges and tones are read from a slightly blurred copy, so grain and paper texture do not count.
    const d = blur(raw, w, h, Math.max(1, Math.round(Math.max(w, h) / 500)));
    const th = BAND_SHARES.map((sh) => darkestShare(d, sh));
    const soft = 0.07;
    // Layer k holds every mark at least as dark as its threshold; the last layer is the whole picture.
    for (const t of th) {
      const l = canvas(w, h);
      const lg = l.getContext('2d')!;
      const out = lg.createImageData(w, h);
      for (let i = 0; i < d.length; i++) {
        out.data[i * 4] = px.data[i * 4]; out.data[i * 4 + 1] = px.data[i * 4 + 1]; out.data[i * 4 + 2] = px.data[i * 4 + 2];
        out.data[i * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, (d[i] - (t - soft)) / soft)));
      }
      lg.putImageData(out, 0, 0);
      this.layers.push(l);
    }
    this.layers.push(this.art);
    this.masks = this.layers.map(() => canvas(w, h));
    this.tmp = canvas(w, h);
    const edges = traceEdges(gradient(d, w, h), w, h, rng);
    // Hatching cells: layer 0 fills the dark marks the outlines passed over, each later layer its own band of tone.
    const tones = th.map((t, k) => candidates(d, w, h, t, k === 0 ? 2 : th[k - 1], Math.max(5, Math.round((7 + k * 3) * Math.max(w, h) / 960))));
    this.strokes = planStrokes(w, h, edges, tones, rng);
    this.drawn = this.strokes.map(() => 0);
    this.render();
  }

  /** Advances the drawing to `ms`; returns true once the last stroke is done. */
  frame(ms: number): boolean {
    let touched = false;
    this.strokes.forEach((s, i) => {
      if (ms < s.start || this.drawn[i] >= 1) return;
      const t = Math.min(1, (ms - s.start) / s.dur);
      const g = this.masks[s.layer].getContext('2d')!;
      g.strokeStyle = '#000'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = s.width;
      g.beginPath();
      const from = pointAt(s.pts, this.drawn[i]);
      g.moveTo(from[0], from[1]);
      const steps = Math.max(1, Math.ceil((t - this.drawn[i]) * (s.pts.length - 1)));
      for (let n = 1; n <= steps; n++) { const p = pointAt(s.pts, this.drawn[i] + ((t - this.drawn[i]) * n) / steps); g.lineTo(p[0], p[1]); }
      g.stroke();
      this.drawn[i] = t;
      touched = true;
    });
    if (touched) this.render();
    return ms >= REVEAL_MS;
  }

  private render() {
    const { ctx, tmp } = this;
    const t = tmp.getContext('2d')!;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.paper, 0, 0);
    this.layers.forEach((layer, i) => {
      t.globalCompositeOperation = 'source-over';
      t.clearRect(0, 0, tmp.width, tmp.height);
      t.drawImage(layer, 0, 0);
      t.globalCompositeOperation = 'destination-in';
      t.drawImage(this.masks[i], 0, 0);
      ctx.drawImage(tmp, 0, 0);
    });
  }

  /** Shows the finished picture at once (a click, or the end of the drawing). */
  finish() { this.ctx.drawImage(this.paper, 0, 0); this.ctx.drawImage(this.art, 0, 0); }
}
