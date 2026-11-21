// The charcoal reveal: a story picture is "drawn" on aged paper in three passes of brush strokes (dark outlines, then
// shading, then the lightest tones). It all happens in the browser on a canvas; the picture file is the same one the
// server already serves, so it costs nothing and needs no extra asset.

export interface Stroke { pts: [number, number][]; width: number; start: number; dur: number; layer: 0 | 1 | 2 }
export type Rng = () => number;

/** Total time of the animation in milliseconds. */
export const REVEAL_MS = 4200;
/** When each pass starts and ends, in milliseconds. They overlap, so the shading begins while the outlines still finish. */
export const PASSES: [number, number][] = [[0, 1700], [1000, 2900], [1900, 3300]];

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

/** Points where a pass has something to draw (every `step` pixels), so strokes go where the picture has marks. */
export function candidates(d: Float32Array, w: number, h: number, lo: number, hi: number, step = 6): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) { const v = d[y * w + x]; if (v >= lo && v < hi) out.push([x, y]); }
  return out;
}

const wobble = (rng: Rng, a: number, len: number, from: [number, number], n: number, bend: number): [number, number][] => {
  const pts: [number, number][] = [from];
  let ang = a;
  for (let i = 1; i <= n; i++) {
    ang += (rng() - 0.5) * bend;
    const p = pts[i - 1];
    pts.push([p[0] + Math.cos(ang) * len / n, p[1] + Math.sin(ang) * len / n]);
  }
  return pts;
};

/** Every stroke of the picture, planned up front: where, how wide, when it starts and how long it takes. */
export function planStrokes(w: number, h: number, outline: [number, number][], shade: [number, number][], rng: Rng): Stroke[] {
  const scale = Math.max(w, h) / 960;
  const strokes: Stroke[] = [];
  const pick = (c: [number, number][]): [number, number] => c[Math.floor(rng() * c.length)];
  const spread = (layer: 0 | 1, count: number, cands: [number, number][], widthRange: [number, number], lenRange: [number, number], bend: number, flow: number | null) => {
    if (!cands.length) return;
    const [t0, t1] = PASSES[layer];
    const span = t1 - t0;
    for (let i = 0; i < count; i++) {
      const [x, y] = pick(cands);
      const len = (lenRange[0] + rng() * (lenRange[1] - lenRange[0])) * scale;
      const ang = flow === null ? rng() * Math.PI * 2 : flow + (rng() - 0.5) * 0.5;
      // The pass sweeps from left to right, with some scatter, like a hand moving across the page.
      const start = t0 + (0.65 * (x / w) + 0.35 * rng()) * span * 0.85;
      strokes.push({
        pts: wobble(rng, ang, len, [x, y], 6, bend), width: (widthRange[0] + rng() * (widthRange[1] - widthRange[0])) * scale,
        start, dur: 110 + rng() * 180, layer,
      });
    }
  };
  spread(0, 300, outline, [6, 12], [36, 90], 0.9, null);
  spread(1, 460, shade.length ? shade : outline, [18, 34], [70, 150], 0.35, -0.6);
  // The broad final pass: wide, slightly wavy strokes back and forth over the whole page.
  const rows = 16;
  const [t0, t1] = PASSES[2];
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * (h / rows);
    const ltr = r % 2 === 0;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 8; i++) { const x = -50 * scale + (w + 100 * scale) * (ltr ? i / 8 : 1 - i / 8); pts.push([x, y + (rng() - 0.5) * 16 * scale]); }
    strokes.push({ pts, width: (h / rows) * 1.9, start: t0 + (r / rows) * (t1 - t0) * 0.8, dur: 600 + rng() * 200, layer: 2 });
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
    const d = darkness(px.data);
    const t1 = darkestShare(d, 0.1), t2 = darkestShare(d, 0.38);
    const soft = 0.08;
    // Pass 1 keeps only the darkest marks, pass 2 the mid tones as well, pass 3 everything.
    for (const t of [t1, t2]) {
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
    this.strokes = planStrokes(w, h, candidates(d, w, h, t1, 2), candidates(d, w, h, t2, t1), rng);
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
