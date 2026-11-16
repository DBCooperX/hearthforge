// The ink painter behind hero and monster art. Figures are built from simple
// shapes (ellipses, boxes, limbs, triangles) in unit coordinates, as before, but
// each shape is now painted at high resolution with its own shading and a thin
// ink contour, and the finished figure goes through an engraving pass: muted
// colours, cross-hatching in the shadows, a little paper grain and a heavy
// outer line, like an ink illustration in an old rulebook. Tokens and portraits then
// sit in a round brass (heroes) or blackened iron (monsters) frame.
// Original generated art, CC0 like the rest.

export type RGB = [number, number, number];
export type P = [number, number];

export const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE: RGB = [255, 255, 255];
export const INK = hex('#140e0b');
const css = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const lit = (c: RGB, t: number) => mix(c, hex('#fff1d6'), t);
const shade = (c: RGB, t: number) => mix(c, hex('#1a1016'), t);

export function canvas(w: number, h = w): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What a surface is made of. The engraving pass draws each one its own way. */
export type Material = 'plain' | 'metal' | 'fur' | 'scales' | 'chain' | 'wood' | 'cloth' | 'leather' | 'bone' | 'hair' | 'skin';
const MATERIALS: Material[] = ['plain', 'plain', 'metal', 'fur', 'scales', 'chain', 'wood', 'cloth', 'leather', 'bone', 'hair', 'skin'];
const matId = (m: Material) => Math.max(1, MATERIALS.indexOf(m));

type Path = (ctx: CanvasRenderingContext2D) => void;

/** A closed smooth curve through the points (Catmull-Rom, drawn as Bézier segments). */
function smoothClosed(ctx: CanvasRenderingContext2D, p: P[], tension = 1) {
  const n = p.length;
  ctx.moveTo(p[0][0], p[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    const k = tension / 6;
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k, p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k, p2[0], p2[1]);
  }
  ctx.closePath();
}

/** An open smooth curve through the points. */
function smoothOpen(ctx: CanvasRenderingContext2D, p: P[]) {
  ctx.moveTo(p[0][0], p[0][1]);
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
}

const fract = (v: number) => v - Math.floor(v);
const hash2 = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);

/**
 * A square picture with shapes given in unit coordinates (0..1, y down). Shapes go
 * onto a canvas; `d`, `set` and `alpha` work on its pixels, and the painter keeps
 * the two in step, so shape and pixel passes can follow each other freely. Every
 * shape also records its material (set `mat` before drawing) in a second, hidden
 * layer, so the engraving pass knows steel from fur.
 */
export class Ink {
  readonly c: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private readonly mc: HTMLCanvasElement;
  private readonly mctx: CanvasRenderingContext2D;
  private data: ImageData | null = null;
  private dataDirty = false;
  /** Pixels per unit at f = 1, and the width of a shape's ink contour. */
  readonly u: number;
  readonly line: number;
  /** One pixel of the old 32-pixel tokens, in this picture's pixels. */
  readonly px: number;
  /** The material of the shapes drawn next. */
  mat: Material = 'plain';
  /** A steady tremble for curved outlines, so they read as drawn by hand rather than by a ruler. */
  private shake = seeded(7);
  private jitter = (p: P[]): P[] => p.map(([x, y]) => [x + (this.shake() - 0.5) * this.line * 0.7, y + (this.shake() - 0.5) * this.line * 0.7]);

  /**
   * S: side in pixels. f: the figure is shrunk towards the bottom centre for small creatures.
   * weight: how heavy the ink lines and hatching are against the picture, for pictures shown
   * smaller (heavier, so lines survive) or larger (lighter) than one pixel per pixel.
   */
  constructor(readonly S: number, private f: number, readonly weight = 1, private view: { x: number; y: number; size: number } = { x: 0, y: 0, size: 1 }) {
    this.c = canvas(S);
    this.ctx = this.c.getContext('2d', { willReadFrequently: true })!;
    this.mc = canvas(S);
    this.mctx = this.mc.getContext('2d', { willReadFrequently: true })!;
    this.u = (S * f) / view.size;
    this.px = S / 32 / view.size;
    this.line = Math.max(0.8, (S / 64) * weight);
    for (const x of [this.ctx, this.mctx]) { x.lineJoin = 'round'; x.lineCap = 'round'; }
  }

  tx = (x: number) => ((0.5 + (x - 0.5) * this.f - this.view.x) / this.view.size) * this.S;
  ty = (y: number) => ((0.97 - (0.97 - y) * this.f - this.view.y) / this.view.size) * this.S;
  private pt = (p: P): P => [this.tx(p[0]), this.ty(p[1])];

  /** The pixels, for passes that read or write them directly. */
  get d(): Uint8ClampedArray {
    if (!this.data) this.data = this.ctx.getImageData(0, 0, this.S, this.S);
    this.dataDirty = true;
    return this.data.data;
  }
  /** Before drawing shapes again: write pixel edits back to the canvas. */
  private draw(): CanvasRenderingContext2D {
    if (this.data && this.dataDirty) this.ctx.putImageData(this.data, 0, 0);
    this.data = null;
    this.dataDirty = false;
    return this.ctx;
  }
  set(px: number, py: number, c: RGB, a = 255) {
    if (px < 0 || py < 0 || px >= this.S || py >= this.S) return;
    const d = this.d, i = (py * this.S + px) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a;
  }
  alpha(px: number, py: number) {
    if (px < 0 || py < 0 || px >= this.S || py >= this.S) return 0;
    if (!this.data) this.data = this.ctx.getImageData(0, 0, this.S, this.S);
    return this.data.data[(py * this.S + px) * 4 + 3];
  }
  /** The finished picture. */
  canvas(): HTMLCanvasElement { this.draw(); return this.c; }

  private markFill(path: Path) {
    const m = this.mctx;
    m.fillStyle = `rgb(${matId(this.mat) * 20},0,0)`;
    m.beginPath(); path(m); m.fill();
  }
  private markStroke(path: Path, w: number) {
    const m = this.mctx;
    m.strokeStyle = `rgb(${matId(this.mat) * 20},0,0)`;
    m.lineWidth = w;
    m.beginPath(); path(m); m.stroke();
  }

  /** Ink contour first, then the shaded fill on top, so the line shows only outside the shape. */
  private paint(path: Path, fill: CanvasGradient | string, inked: boolean) {
    const ctx = this.draw();
    ctx.beginPath();
    path(ctx);
    if (inked) {
      // Like a pen: a thin line on the lit top-left, a heavier one on the shadow side.
      ctx.strokeStyle = css(INK, 0.92); ctx.lineWidth = this.line * 1.6; ctx.stroke();
      ctx.save(); ctx.translate(this.line * 0.55, this.line * 0.7); ctx.beginPath(); path(ctx); ctx.lineWidth = this.line * 2.1; ctx.stroke(); ctx.restore();
      ctx.beginPath(); path(ctx);
    }
    ctx.fillStyle = fill;
    ctx.fill();
    this.markFill(path);
  }

  private grad(x0: number, y0: number, x1: number, y1: number, c: RGB, l = 0.14, s = 0.42, mid = 0.42) {
    const g = this.ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, css(lit(c, l)));
    g.addColorStop(mid, css(c));
    g.addColorStop(1, css(shade(c, s)));
    return g;
  }

  /** Round forms: lit from the upper left, falling off into shadow. */
  ell(cx: number, cy: number, rx: number, ry: number, c: RGB, inked = true) {
    const X = this.tx(cx), Y = this.ty(cy), RX = Math.max(this.px * 0.6, rx * this.u), RY = Math.max(this.px * 0.6, ry * this.u);
    const ctx = this.draw();
    const R = Math.max(RX, RY);
    const g = ctx.createRadialGradient(X - RX * 0.38, Y - RY * 0.45, R * 0.05, X - RX * 0.1, Y - RY * 0.1, R * 1.25);
    g.addColorStop(0, css(lit(c, 0.2)));
    g.addColorStop(0.45, css(c));
    g.addColorStop(1, css(shade(c, 0.5)));
    this.paint((x) => x.ellipse(X, Y, RX, RY, 0, 0, Math.PI * 2), g, inked && R > this.px * 1.2);
  }

  /** Flat-sided forms: a soft top-left to bottom-right fall-off and slightly rounded corners. */
  box(x0: number, y0: number, x1: number, y1: number, c: RGB, inked = true) {
    const X0 = this.tx(x0), Y0 = this.ty(y0), X1 = this.tx(x1), Y1 = this.ty(y1);
    const w = Math.max(this.px * 0.6, X1 - X0), h = Math.max(this.px * 0.6, Y1 - Y0);
    const g = this.grad(X0, Y0, X0 + w * 0.6, Y0 + h, c, 0.12, 0.38, 0.4);
    const r = Math.min(w, h) * 0.22;
    this.paint((x) => x.roundRect(X0, Y0, w, h, r), g, inked && Math.min(w, h) > this.px);
  }

  /** Limbs, shafts and tails: a round-capped stroke, lit along one side. */
  seg(a: P, b: P, w: number, c: RGB, inked = true) {
    const [ax, ay] = this.pt(a), [bx, by] = this.pt(b), W = Math.max(1, this.line * 0.6, w * this.u);
    const ctx = this.draw();
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let nx = -(by - ay) / len, ny = (bx - ax) / len;
    if (nx + ny > 0) { nx = -nx; ny = -ny; } // the lit side faces up and left
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const g = this.grad(mx + nx * W / 2, my + ny * W / 2, mx - nx * W / 2, my - ny * W / 2, c, 0.18, 0.45, 0.45);
    const path: Path = (x) => { x.moveTo(ax, ay); x.lineTo(bx, by); };
    ctx.beginPath(); path(ctx);
    if (inked && W > this.line * 1.5) { ctx.strokeStyle = css(INK, 0.92); ctx.lineWidth = W + this.line * 2; ctx.stroke(); }
    ctx.strokeStyle = g;
    ctx.lineWidth = W;
    ctx.stroke();
    this.markStroke(path, W);
  }

  /** Any closed outline with straight sides, shaded like a box. */
  poly(pts: P[], c: RGB, inked = true) {
    const p = pts.map(this.pt);
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
    this.paint((x) => { p.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); }, this.grad(x0, y0, x0 + w * 0.7, y0 + h, c), inked);
  }

  /**
   * A closed smooth outline through the points: muscles, bellies, snouts, cloaks.
   * `light` turns the shading: 0 for the usual top-left light, 1 to light it from the left only.
   */
  blob(pts: P[], c: RGB, inked = true, tension = 1) {
    const p = this.jitter(pts.map(this.pt));
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
    const ctx = this.draw();
    const R = Math.max(w, h) / 2;
    const g = ctx.createRadialGradient(x0 + w * 0.32, y0 + h * 0.28, R * 0.05, x0 + w * 0.45, y0 + h * 0.45, R * 1.25);
    g.addColorStop(0, css(lit(c, 0.18)));
    g.addColorStop(0.45, css(c));
    g.addColorStop(1, css(shade(c, 0.48)));
    this.paint((x) => smoothClosed(x, p, tension), g, inked);
  }

  /**
   * A tapering limb along a smooth centre line: arms, legs, necks, tails, horns.
   * `w` gives the width at each point of the line, in parts of the picture.
   */
  limb(pts: P[], w: number[], c: RGB, inked = true) {
    const n = pts.length;
    const left: P[] = [], right: P[] = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l, hw = Math.max(w[Math.min(i, w.length - 1)], 0.004) / 2;
      left.push([pts[i][0] + nx * hw, pts[i][1] + ny * hw]);
      right.push([pts[i][0] - nx * hw, pts[i][1] - ny * hw]);
    }
    // Round the ends a little past the first and last point.
    const cap = (i: number, dir: number): P => {
      const a = pts[i], b = pts[i - dir], dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1, hw = Math.max(w[Math.min(i, w.length - 1)], 0.004) * 0.42;
      return [a[0] + (dx / l) * hw, a[1] + (dy / l) * hw];
    };
    const outline = [cap(0, -1), ...left, cap(n - 1, 1), ...right.reverse()];
    const p = this.jitter(outline.map(this.pt));
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), wd = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
    // Light falls across the limb: perpendicular to its overall direction.
    const [sx, sy] = this.pt(pts[0]), [ex, ey] = this.pt(pts[n - 1]);
    const L = Math.hypot(ex - sx, ey - sy) || 1;
    let nx = -(ey - sy) / L, ny = (ex - sx) / L;
    if (nx + ny > 0) { nx = -nx; ny = -ny; }
    const W = Math.max(...w) * this.u;
    const cx = x0 + wd / 2, cy = y0 + h / 2;
    const g = this.grad(cx + nx * W * 0.6, cy + ny * W * 0.6, cx - nx * W * 0.6, cy - ny * W * 0.6, c, 0.2, 0.48, 0.42);
    this.paint((x) => smoothClosed(x, p, 0.9), g, inked);
  }

  /** A bent shaft, such as a bow: one smooth inked stroke through the points. */
  curve(pts: P[], w: number, c: RGB) {
    const ctx = this.draw();
    const W = Math.max(1, this.line * 0.6, w * this.u);
    const p = pts.map(this.pt);
    const path: Path = (x) => smoothOpen(x, p);
    ctx.beginPath(); path(ctx);
    ctx.strokeStyle = css(INK, 0.92); ctx.lineWidth = W + this.line * 2; ctx.stroke();
    ctx.beginPath(); path(ctx);
    ctx.strokeStyle = css(c); ctx.lineWidth = W; ctx.stroke();
    ctx.beginPath(); path(ctx);
    ctx.strokeStyle = css(lit(c, 0.3), 0.6); ctx.lineWidth = W * 0.3; ctx.stroke();
    this.markStroke(path, W);
  }

  tri(a: P, b: P, c3: P, c: RGB, inked = true) {
    const p = [a, b, c3].map(this.pt);
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    const g = this.grad(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), c, 0.14, 0.4, 0.5);
    const big = Math.max(...xs) - Math.min(...xs) > this.px * 1.5 && Math.max(...ys) - Math.min(...ys) > this.px * 1.5;
    this.paint((x) => { x.moveTo(p[0][0], p[0][1]); x.lineTo(p[1][0], p[1][1]); x.lineTo(p[2][0], p[2][1]); x.closePath(); }, g, inked && big);
  }

  /** A small round mark: an eye, a stud, a gem. `size` is in pixels of the old 32-pixel tokens. */
  dot(x: number, y: number, c: RGB, size = 1) {
    const r = Math.max(0.8, (size * this.px * Math.max(this.f, 0.75)) / 2) * 0.9;
    const ctx = this.draw();
    ctx.beginPath();
    ctx.arc(this.tx(x), this.ty(y), r, 0, Math.PI * 2);
    ctx.fillStyle = css(c);
    ctx.fill();
  }

  /** A glowing mark: a lit eye or a gem, with a soft halo that survives the engraving pass. */
  glow(x: number, y: number, c: RGB, size = 1) {
    const X = this.tx(x), Y = this.ty(y), r = Math.max(1, (size * this.px * Math.max(this.f, 0.75)) / 2);
    const ctx = this.draw();
    const g = ctx.createRadialGradient(X, Y, 0, X, Y, r * 2.6);
    g.addColorStop(0, css(mix(c, WHITE, 0.75)));
    g.addColorStop(0.3, css(c, 0.95));
    g.addColorStop(1, css(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(X, Y, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  /** A flat, soft-edged patch with no contour: shadows under a brow, a lip, the white of an eye. */
  soft(cx: number, cy: number, rx: number, ry: number, c: RGB, alpha = 1) {
    const X = this.tx(cx), Y = this.ty(cy), RX = Math.max(0.6, rx * this.u), RY = Math.max(0.6, ry * this.u);
    const ctx = this.draw();
    ctx.save();
    ctx.translate(X, Y);
    ctx.scale(1, RY / RX);
    const g = ctx.createRadialGradient(0, 0, RX * 0.55, 0, 0, RX);
    g.addColorStop(0, css(c, alpha));
    g.addColorStop(1, css(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, RX, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** A flat fill with a crisp edge and no contour. */
  flat(cx: number, cy: number, rx: number, ry: number, c: RGB) {
    const ctx = this.draw();
    ctx.beginPath();
    ctx.ellipse(this.tx(cx), this.ty(cy), Math.max(0.5, rx * this.u), Math.max(0.5, ry * this.u), 0, 0, Math.PI * 2);
    ctx.fillStyle = css(c);
    ctx.fill();
  }

  /** A fine line whose width is in parts of the picture, so faces keep their proportions at any size. */
  fine(a: P, b: P, w: number, c: RGB = INK, alpha = 0.9) {
    const ctx = this.draw();
    ctx.beginPath();
    ctx.moveTo(this.tx(a[0]), this.ty(a[1]));
    ctx.lineTo(this.tx(b[0]), this.ty(b[1]));
    ctx.strokeStyle = css(c, alpha);
    ctx.lineWidth = Math.max(0.7, w * this.u);
    ctx.stroke();
  }

  /** A fine curved line through the points: a lid, a smile, a scar, a fold. */
  fineCurve(pts: P[], w: number, c: RGB = INK, alpha = 0.9) {
    const ctx = this.draw();
    ctx.beginPath();
    smoothOpen(ctx, pts.map(this.pt));
    ctx.strokeStyle = css(c, alpha);
    ctx.lineWidth = Math.max(0.7, w * this.u);
    ctx.stroke();
  }

  /** A thin ink line for creases, mouths and seams. */
  hair(a: P, b: P, c: RGB = INK, w = 1) {
    const ctx = this.draw();
    ctx.beginPath();
    ctx.moveTo(this.tx(a[0]), this.ty(a[1]));
    ctx.lineTo(this.tx(b[0]), this.ty(b[1]));
    ctx.strokeStyle = css(c, 0.85);
    ctx.lineWidth = Math.max(1, this.line * w);
    ctx.stroke();
  }

  /**
   * The engraving pass over everything drawn so far. First the light: the
   * silhouette is read as a height field (thick in the middle, thin at the edges)
   * and lit from the upper left, so the whole figure turns in the light. Then each
   * material gets its surface: a sheen and reflections on steel, strands of fur and
   * hair, overlapping scales, chainmail rings, wood grain, folds in cloth, grain in
   * leather. Then muted colours, a shadow towards the feet, cross-hatching where the
   * form turns from the light, and a little paper grain.
   */
  engrave(seed: number, opts: { mute?: number; hatch?: number } = {}) {
    const S = this.S, d = this.d, N = S * S, a0 = new Uint8Array(N);
    for (let i = 0; i < N; i++) a0[i] = d[i * 4 + 3];
    const md = this.mctx.getImageData(0, 0, S, S).data;
    const P = Math.max(3, Math.round(this.line * 2)); // hatch and pattern spacing
    const mute = opts.mute ?? 0.32, hatch = opts.hatch ?? 1;
    const rnd = seeded(seed);
    const SEPIA = hex('#8a6a48');

    // Distance to the edge of the figure (two-pass chamfer), as a height field.
    const dist = new Float32Array(N);
    const BIG = 1e6;
    for (let i = 0; i < N; i++) dist[i] = a0[i] > 100 ? BIG : 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x; if (!dist[i]) continue;
      let v = dist[i];
      if (x > 0) v = Math.min(v, dist[i - 1] + 1);
      if (y > 0) v = Math.min(v, dist[i - S] + 1);
      if (x > 0 && y > 0) v = Math.min(v, dist[i - S - 1] + 1.414);
      if (x < S - 1 && y > 0) v = Math.min(v, dist[i - S + 1] + 1.414);
      dist[i] = x === 0 || y === 0 || x === S - 1 || y === S - 1 ? 1 : v;
    }
    for (let y = S - 1; y >= 0; y--) for (let x = S - 1; x >= 0; x--) {
      const i = y * S + x; if (!dist[i]) continue;
      let v = dist[i];
      if (x < S - 1) v = Math.min(v, dist[i + 1] + 1);
      if (y < S - 1) v = Math.min(v, dist[i + S] + 1);
      if (x < S - 1 && y < S - 1) v = Math.min(v, dist[i + S + 1] + 1.414);
      if (x > 0 && y < S - 1) v = Math.min(v, dist[i + S - 1] + 1.414);
      dist[i] = v;
    }
    // The rim that rounds off: never wider than a small part of the picture, or narrow shapes get a ridge down the middle.
    const D = Math.max(3, Math.min(this.u * 0.07, S * 0.045));
    const height = (i: number) => { const t = Math.min(1, dist[i] / D); return Math.sqrt(1 - (1 - t) * (1 - t)); };
    const Lx = -0.55, Ly = -0.62, Lz = 0.56;

    let top = S, bottom = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (a0[y * S + x]) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
    const span = Math.max(1, bottom - top);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const k = y * S + x, i = k * 4;
      if (!a0[k]) continue;
      let c: RGB = [d[i], d[i + 1], d[i + 2]];
      const lum = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
      const sat = Math.max(...c) - Math.min(...c);
      // Glowing marks keep their colour; everything else is lit, given its surface and muted.
      const glowing = lum > 0.62 && sat > 120;
      const m = MATERIALS[Math.round(md[i] / 20)] ?? 'plain';
      let lam = 0.7;
      if (!glowing) {
        const hx = (x > 0 && x < S - 1 ? height(k + 1) - height(k - 1) : 0) * D * 0.5;
        const hy = (y > 0 && y < S - 1 ? height(k + S) - height(k - S) : 0) * D * 0.5;
        const nl = Math.hypot(hx, hy, 1);
        lam = Math.max(0, (-hx * Lx - hy * Ly + Lz) / nl);
        c = mix(c, [c[0] * (0.68 + 0.5 * lam), c[1] * (0.68 + 0.5 * lam), c[2] * (0.68 + 0.5 * lam)], 0.85);
        c = this.surface(m, c, x, y, P, lam);
        const g = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11);
        c = mix(c, mix([g, g, g], SEPIA, 0.25), m === 'metal' ? mute * 0.6 : mute);
        // Darker towards the feet, as if standing in the light of a fire above.
        const t = (y - top) / span;
        if (t > 0.55) c = shade(c, (t - 0.55) * 0.45);
      }
      // Hatching in the shadows, cross-hatching in the deepest ones.
      const l2 = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
      if (!glowing && hatch > 0 && m === 'skin') {
        // Faces and hands keep clean: hatching only in the deepest shadow, and lightly.
        if (l2 < 0.2 && (x + y) % P === 0) c = mix(c, INK, 0.18 * hatch);
      } else if (!glowing && hatch > 0 && m !== 'metal' && m !== 'chain') {
        const wob = rnd() < 0.08 ? 1 : 0;
        if (l2 < 0.42 && (x + y + wob) % P === 0) c = mix(c, INK, 0.38 * hatch * (1 - l2 / 0.42) + 0.08);
        if (l2 < 0.26 && (x - y + S * 4 + wob) % P === 0) c = mix(c, INK, 0.4 * hatch);
      }
      // A little grain, like ink on rough paper.
      const n = (rnd() - 0.5) * 6;
      d[i] = c[0] + n; d[i + 1] = c[1] + n; d[i + 2] = c[2] + n;
    }
  }

  /** The look of one material at one pixel. P is the pattern spacing, lam how much the surface faces the light. */
  private surface(m: Material, c: RGB, x: number, y: number, P: number, lam: number): RGB {
    switch (m) {
      case 'metal': {
        // Hard contrast, a bright sheen where it faces the light, a soft band of reflected sky.
        c = mix(c, shade(c, 0.5), Math.max(0, 0.55 - lam) * 0.8);
        if (lam > 0.8) c = mix(c, hex('#fff6e2'), Math.min(0.7, (lam - 0.8) * 3.5));
        const band = Math.sin((y + x * 0.25) / (P * 4.5));
        if (band > 0.8) c = mix(c, hex('#e8e4dc'), (band - 0.8) * 1.2);
        return c;
      }
      case 'chain': {
        const s = P * 1.3, ix = Math.floor(x / s), iy = Math.floor(y / (s * 0.8));
        const cx = (ix + 0.5 + (iy % 2) * 0.5) * s, cy = (iy + 0.5) * s * 0.8;
        const r = Math.hypot(x - cx, (y - cy) * 1.2);
        if (Math.abs(r - s * 0.36) < 0.75) return shade(c, 0.5);
        if (r < s * 0.2) return mix(c, hex('#fff6e2'), 0.25 * lam);
        return c;
      }
      case 'fur': case 'hair': {
        // Short slanted strands, darker on one side and lit on the other.
        const cw = P * (m === 'hair' ? 1.1 : 1.4), ch = P * (m === 'hair' ? 5 : 2.6), slant = m === 'hair' ? 0.12 : 0.4;
        const ix = Math.floor(x / cw), off = (ix % 2) * ch * 0.5, iy = Math.floor((y + off) / ch);
        const cx = (ix + 0.2 + hash2(ix, iy) * 0.6) * cw, cy = iy * ch - off + ch / 2;
        const dx = x - cx - (y - cy) * slant;
        if (Math.abs(y - cy) < ch * 0.42) {
          if (Math.abs(dx) < 0.6) return shade(c, m === 'hair' ? 0.16 : 0.32);
          if (dx > 0.6 && dx < 1.6) return lit(c, 0.07);
        }
        return c;
      }
      case 'scales': {
        const sw = P * 2.2, sh = P * 1.5, iy = Math.floor(y / sh), off = (iy % 2) * sw * 0.5, ix = Math.floor((x + off) / sw);
        const cx = ix * sw - off + sw / 2, cy = iy * sh;
        const r = Math.hypot(x - cx, (y - cy) * 1.1), R = sw * 0.56;
        if (Math.abs(r - R) < 0.7 && y > cy) return shade(c, 0.4);
        if (r < R * 0.6) return lit(c, 0.06);
        return c;
      }
      case 'wood': {
        const t = x / (P * 1.6) + Math.sin(y / (P * 3)) * 0.5;
        return fract(t) < 0.16 ? shade(c, 0.25) : c;
      }
      case 'cloth': {
        const f = Math.sin((x * 0.9 + y * 0.12) / (P * 1.1) + Math.sin(y / (P * 5)) * 1.6);
        if (f > 0.55) return shade(c, (f - 0.55) * 0.4);
        if (f < -0.85) return lit(c, 0.05);
        return c;
      }
      case 'leather':
        return hash2(Math.floor(x / 2), Math.floor(y / 2)) < 0.07 ? shade(c, 0.18) : c;
      case 'bone': {
        const t = Math.sin(y / (P * 0.9) + Math.sin(x / (P * 2)));
        return t > 0.92 ? shade(c, 0.15) : c;
      }
      default:
        return c;
    }
  }

  /** The heavy outer line around the whole figure, softened at its edge. */
  outline(color: RGB = INK, alpha = 255, width = 1) {
    const S = this.S, d = this.d, a0 = new Uint8Array(S * S);
    for (let i = 0; i < S * S; i++) a0[i] = d[i * 4 + 3];
    const R = Math.max(1.2, this.line * 0.8 * width);
    const r = Math.ceil(R * 1.4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      if (a0[i] >= 250) continue;
      let best = Infinity, bx = 0, by = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= S || Y >= S || a0[Y * S + X] < 128) continue;
        const q = dx * dx + dy * dy;
        if (q < best) { best = q; bx = dx; by = dy; }
      }
      if (best === Infinity) continue;
      // The line swells on the shadow side (outward normal pointing down and right) and wavers a little.
      const dist = Math.sqrt(best) || 1;
      const side = 0.5 + 0.5 * ((-bx * 0.6 - by * 0.8) / dist);
      const Rl = R * (0.62 + 0.72 * side + 0.12 * Math.sin(x * 0.11 + y * 0.07) * Math.sin(y * 0.05 - x * 0.03));
      const cover = Math.max(0, Math.min(1, Rl + 0.5 - Math.sqrt(best)));
      if (cover <= 0) continue;
      // Ink goes under what is already there, so soft edges blend into it.
      const own = a0[i] / 255, inkA = (cover * alpha) / 255;
      const outA = own + inkA * (1 - own);
      const j = i * 4;
      for (let ch = 0; ch < 3; ch++) d[j + ch] = outA ? (d[j + ch] * own + color[ch] * inkA * (1 - own)) / outA : 0;
      d[j + 3] = outA * 255;
    }
  }

  /** A coloured haze around the figure: fire, frost, poison, shadow, holy light or lightning. */
  aura(inner: RGB, outer: RGB, flicker = false, seed = 1) {
    const ctx = this.draw();
    const S = this.S;
    // A silhouette in the aura's colour, blurred outwards; it is painted on its own sheet
    // that fades out towards the edges, so a figure reaching the border shows no hard cut.
    const sil = canvas(S);
    const sctx = sil.getContext('2d')!;
    sctx.drawImage(this.c, 0, 0);
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = css(inner);
    sctx.fillRect(0, 0, S, S);
    const au = canvas(S);
    const actx = au.getContext('2d')!;
    const blur = this.px * 1.1;
    actx.filter = `blur(${blur}px)`;
    actx.globalAlpha = 0.95;
    actx.drawImage(sil, 0, 0);
    actx.filter = `blur(${blur * 2.4}px)`;
    sctx.fillStyle = css(outer);
    sctx.fillRect(0, 0, S, S);
    actx.globalAlpha = 0.55;
    actx.drawImage(sil, 0, flicker ? -this.px * 2 : 0);
    actx.filter = 'none';
    actx.globalAlpha = 1;
    if (flicker) {
      // Tongues of flame rising from the figure.
      const rnd = seeded(seed);
      for (let n = 0; n < 14; n++) {
        const x = S * (0.2 + rnd() * 0.6), y = S * (0.25 + rnd() * 0.6), h = this.px * (3 + rnd() * 5);
        const g = actx.createLinearGradient(x, y, x, y - h);
        g.addColorStop(0, css(inner, 0.7));
        g.addColorStop(1, css(outer, 0));
        actx.fillStyle = g;
        actx.beginPath();
        actx.moveTo(x - h * 0.25, y);
        actx.quadraticCurveTo(x, y - h * 0.3, x + rnd() * h * 0.3 - h * 0.15, y - h);
        actx.quadraticCurveTo(x + h * 0.1, y - h * 0.3, x + h * 0.25, y);
        actx.fill();
      }
    }
    actx.globalCompositeOperation = 'destination-in';
    const fade = actx.createRadialGradient(S / 2, S / 2, S * 0.36, S / 2, S / 2, S * 0.62);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    actx.fillStyle = fade;
    actx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(au, 0, 0);
    ctx.restore();
  }
}

/** The square around what is drawn on a picture, padded, in parts of the picture: a crop for `framed`. */
export function fitCrop(c: HTMLCanvasElement, pad = 0.06, min = 0.5): { x: number; y: number; size: number } {
  const S = c.width, d = c.getContext('2d')!.getImageData(0, 0, S, S).data;
  let x0 = S, y0 = S, x1 = 0, y1 = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < x0) return { x: 0, y: 0, size: 1 };
  const size = Math.min(1, Math.max(min, (Math.max(x1 - x0, y1 - y0) / S) * (1 + pad * 2)));
  const cx = (x0 + x1) / 2 / S, cy = (y0 + y1) / 2 / S;
  return { x: Math.max(0, Math.min(1 - size, cx - size / 2)), y: Math.max(0, Math.min(1 - size, cy - size / 2)), size };
}

export type FrameKind = 'hero' | 'monster';

const FRAME = {
  hero: { back: ['#7a6040', '#3a2a1a', '#140e09'], ring: ['#f6dc96', '#c99a4a', '#7a5320', '#e2b660', '#8a5e24'], edge: '#2a1a0a' },
  monster: { back: ['#5c3a30', '#2c1a16', '#0e0908'], ring: ['#a49a90', '#5c544e', '#2a2422', '#8a7a6c', '#3a302a'], edge: '#0e0a09' },
};

/**
 * A round token: the figure on a dark, fire-lit backdrop inside a bevelled ring
 * of brass (heroes) or blackened iron (monsters). `crop` picks the part of the
 * figure to show, in the figure's own unit coordinates: the whole picture for a
 * token, the head and shoulders for a portrait.
 */
export function framed(figure: HTMLCanvasElement, S: number, kind: FrameKind, crop: { x: number; y: number; size: number } = { x: 0, y: 0, size: 1 }, tiles = 1): HTMLCanvasElement {
  const out = canvas(S);
  const ctx = out.getContext('2d')!;
  const st = FRAME[kind];
  const ring = Math.max(2, (S * 0.065) / Math.sqrt(tiles)), R = S / 2 - 0.5, inner = R - ring;
  const C = S / 2;
  // Backdrop
  const bg = ctx.createRadialGradient(C, C * 0.75, 0, C, C, inner);
  bg.addColorStop(0, st.back[0]);
  bg.addColorStop(0.6, st.back[1]);
  bg.addColorStop(1, st.back[2]);
  ctx.save();
  ctx.beginPath();
  ctx.arc(C, C, inner + 0.5, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);
  // A faint engraved rule inside the backdrop
  ctx.strokeStyle = 'rgba(255,220,160,0.08)';
  ctx.lineWidth = Math.max(1, S / 96);
  ctx.beginPath();
  ctx.arc(C, C, inner * 0.86, 0, Math.PI * 2);
  ctx.stroke();
  // The figure, a little inside the ring, standing on a soft shadow.
  const fw = figure.width;
  const sx = crop.x * fw, sy = crop.y * fw, ss = crop.size * fw;
  const box = inner * 2 * (crop.size === 1 ? 0.9 : 1.02);
  const dx = C - box / 2, dy = crop.size === 1 ? C + inner - box * 0.985 : C - box / 2 + inner * 0.06;
  if (crop.size === 1) {
    const sh = ctx.createRadialGradient(C, dy + box * 0.95, 0, C, dy + box * 0.95, box * 0.36);
    sh.addColorStop(0, 'rgba(0,0,0,0.55)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, S, S);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(figure, sx, sy, ss, ss, dx, dy, box, box);
  // Vignette over the figure, to sink it into the frame
  const vg = ctx.createRadialGradient(C, C, inner * 0.6, C, C, inner);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, S, S);
  ctx.restore();
  // The ring: a bevelled band lit from the upper left
  const g = ctx.createLinearGradient(C - R, C - R, C + R, C + R);
  g.addColorStop(0, st.ring[0]);
  g.addColorStop(0.3, st.ring[1]);
  g.addColorStop(0.55, st.ring[2]);
  g.addColorStop(0.78, st.ring[3]);
  g.addColorStop(1, st.ring[4]);
  ctx.beginPath();
  ctx.arc(C, C, R - ring / 2, 0, Math.PI * 2);
  ctx.strokeStyle = g;
  ctx.lineWidth = ring;
  ctx.stroke();
  // Bevel: light inner edge at the bottom right, light outer edge at the top left
  ctx.lineWidth = Math.max(1, ring * 0.18);
  ctx.strokeStyle = 'rgba(255,240,200,0.55)';
  ctx.beginPath();
  ctx.arc(C, C, R - ring * 0.12, Math.PI * 1.0, Math.PI * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(C, C, inner + ring * 0.12, Math.PI * 0.0, Math.PI * 0.5);
  ctx.stroke();
  ctx.strokeStyle = st.edge;
  ctx.lineWidth = Math.max(1, S / 80);
  for (const rr of [R, inner]) { ctx.beginPath(); ctx.arc(C, C, rr, 0, Math.PI * 2); ctx.stroke(); }
  // Rivets on brass, a notch at the top on iron
  ctx.fillStyle = kind === 'hero' ? '#fbe7b0' : '#c0b4a8';
  const rv = Math.max(0.8, ring * 0.16);
  if (S >= 48) for (let n = 0; n < 4; n++) {
    const ang = Math.PI * (0.25 + n * 0.5);
    ctx.beginPath();
    ctx.arc(C + Math.cos(ang) * (R - ring / 2), C + Math.sin(ang) * (R - ring / 2), rv, 0, Math.PI * 2);
    ctx.fill();
  }
  return out;
}

