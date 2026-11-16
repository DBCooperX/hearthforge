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

/**
 * A square picture with shapes given in unit coordinates (0..1, y down). Shapes go
 * onto a canvas; `d`, `set` and `alpha` work on its pixels, and the painter keeps
 * the two in step, so shape and pixel passes can follow each other freely.
 */
export class Ink {
  readonly c: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private data: ImageData | null = null;
  private dataDirty = false;
  /** Pixels per unit at f = 1, and the width of a shape's ink contour. */
  readonly u: number;
  readonly line: number;
  /** One pixel of the old 32-pixel tokens, in this picture's pixels. */
  readonly px: number;

  /**
   * S: side in pixels. f: the figure is shrunk towards the bottom centre for small creatures.
   * weight: how heavy the ink lines and hatching are against the picture, for pictures shown
   * smaller (heavier, so lines survive) or larger (lighter) than one pixel per pixel.
   */
  constructor(readonly S: number, private f: number, readonly weight = 1) {
    this.c = canvas(S);
    this.ctx = this.c.getContext('2d', { willReadFrequently: true })!;
    this.u = S * f;
    this.px = S / 32;
    this.line = Math.max(0.8, (S / 64) * weight);
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';
  }

  tx = (x: number) => (0.5 + (x - 0.5) * this.f) * this.S;
  ty = (y: number) => (0.97 - (0.97 - y) * this.f) * this.S;

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

  /** Ink contour first, then the shaded fill on top, so the line shows only outside the shape. */
  private paint(path: () => void, fill: CanvasGradient | string, inked: boolean) {
    const ctx = this.draw();
    ctx.beginPath();
    path();
    if (inked) { ctx.strokeStyle = css(INK, 0.92); ctx.lineWidth = this.line * 2; ctx.stroke(); }
    ctx.fillStyle = fill;
    ctx.fill();
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
    this.paint(() => ctx.ellipse(X, Y, RX, RY, 0, 0, Math.PI * 2), g, inked && R > this.px * 1.2);
  }

  /** Flat-sided forms: a soft top-left to bottom-right fall-off and slightly rounded corners. */
  box(x0: number, y0: number, x1: number, y1: number, c: RGB, inked = true) {
    const X0 = this.tx(x0), Y0 = this.ty(y0), X1 = this.tx(x1), Y1 = this.ty(y1);
    const w = Math.max(this.px * 0.6, X1 - X0), h = Math.max(this.px * 0.6, Y1 - Y0);
    const ctx = this.draw();
    const g = ctx.createLinearGradient(X0, Y0, X0 + w * 0.6, Y0 + h);
    g.addColorStop(0, css(lit(c, 0.12)));
    g.addColorStop(0.4, css(c));
    g.addColorStop(1, css(shade(c, 0.38)));
    const r = Math.min(w, h) * 0.22;
    this.paint(() => ctx.roundRect(X0, Y0, w, h, r), g, inked && Math.min(w, h) > this.px);
  }

  /** Limbs, shafts and tails: a round-capped stroke, lit along one side. */
  seg(a: P, b: P, w: number, c: RGB, inked = true) {
    const ax = this.tx(a[0]), ay = this.ty(a[1]), bx = this.tx(b[0]), by = this.ty(b[1]), W = Math.max(1, this.line * 0.6, w * this.u);
    const ctx = this.draw();
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let nx = -(by - ay) / len, ny = (bx - ax) / len;
    if (nx + ny > 0) { nx = -nx; ny = -ny; } // the lit side faces up and left
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const g = ctx.createLinearGradient(mx + nx * W / 2, my + ny * W / 2, mx - nx * W / 2, my - ny * W / 2);
    g.addColorStop(0, css(lit(c, 0.18)));
    g.addColorStop(0.45, css(c));
    g.addColorStop(1, css(shade(c, 0.45)));
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    if (inked && W > this.line * 1.5) { ctx.strokeStyle = css(INK, 0.92); ctx.lineWidth = W + this.line * 2; ctx.stroke(); }
    ctx.strokeStyle = g;
    ctx.lineWidth = W;
    ctx.stroke();
  }

  /** Any closed outline, shaded like a box: tapered torsos, legs, cloaks and robes. */
  poly(pts: P[], c: RGB, inked = true) {
    const p = pts.map(([x, y]) => [this.tx(x), this.ty(y)] as P);
    const ctx = this.draw();
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
    const g = ctx.createLinearGradient(x0, y0, x0 + w * 0.7, y0 + h);
    g.addColorStop(0, css(lit(c, 0.14)));
    g.addColorStop(0.42, css(c));
    g.addColorStop(1, css(shade(c, 0.42)));
    this.paint(() => { p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }, g, inked);
  }

  /** A bent shaft, such as a bow: one smooth inked stroke through the points. */
  curve(pts: P[], w: number, c: RGB) {
    const ctx = this.draw();
    const W = Math.max(1, this.line * 0.6, w * this.u);
    const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(this.tx(x), this.ty(y)) : ctx.moveTo(this.tx(x), this.ty(y)))); };
    path();
    ctx.strokeStyle = css(INK, 0.92); ctx.lineWidth = W + this.line * 2; ctx.stroke();
    path();
    ctx.strokeStyle = css(c); ctx.lineWidth = W; ctx.stroke();
    path();
    ctx.strokeStyle = css(lit(c, 0.3), 0.6); ctx.lineWidth = W * 0.3; ctx.stroke();
  }

  tri(a: P, b: P, c3: P, c: RGB, inked = true) {
    const p = [a, b, c3].map(([x, y]) => [this.tx(x), this.ty(y)] as P);
    const ctx = this.draw();
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    const g = ctx.createLinearGradient(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    g.addColorStop(0, css(lit(c, 0.14)));
    g.addColorStop(0.5, css(c));
    g.addColorStop(1, css(shade(c, 0.4)));
    const big = Math.max(...xs) - Math.min(...xs) > this.px * 1.5 && Math.max(...ys) - Math.min(...ys) > this.px * 1.5;
    this.paint(() => { ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.lineTo(p[2][0], p[2][1]); ctx.closePath(); }, g, inked && big);
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
   * The engraving pass over everything drawn so far: muted colours, a ground
   * shadow towards the feet, cross-hatching where the form turns from the light,
   * and a little paper grain.
   */
  engrave(seed: number, opts: { mute?: number; hatch?: number } = {}) {
    const S = this.S, d = this.d, a0 = new Uint8Array(S * S);
    for (let i = 0; i < S * S; i++) a0[i] = d[i * 4 + 3];
    const P = Math.max(3, Math.round(this.line * 2)); // hatch spacing
    const mute = opts.mute ?? 0.32, hatch = opts.hatch ?? 1;
    const rnd = seeded(seed);
    const SEPIA = hex('#8a6a48');
    let top = S, bottom = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (a0[y * S + x]) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
    const span = Math.max(1, bottom - top);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      if (!a0[y * S + x]) continue;
      let c: RGB = [d[i], d[i + 1], d[i + 2]];
      const lum = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
      const sat = Math.max(...c) - Math.min(...c);
      // Glowing marks keep their colour; everything else is muted towards an old-ink sepia.
      const glowing = lum > 0.62 && sat > 120;
      if (!glowing) {
        const grey: RGB = [lum * 255, lum * 255, lum * 255];
        c = mix(c, mix(grey, SEPIA, 0.25), mute);
        // Darker towards the feet, as if standing in the light of a fire above.
        const t = (y - top) / span;
        if (t > 0.55) c = shade(c, (t - 0.55) * 0.45);
      }
      // Hatching in the shadows, cross-hatching in the deepest ones.
      const l2 = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
      if (!glowing && hatch > 0) {
        const wob = rnd() < 0.08 ? 1 : 0;
        if (l2 < 0.46 && (x + y + wob) % P === 0) c = mix(c, INK, 0.4 * hatch * (1 - l2 / 0.46) + 0.1);
        if (l2 < 0.3 && (x - y + S * 4 + wob) % P === 0) c = mix(c, INK, 0.42 * hatch);
      }
      // A little grain, like ink on rough paper.
      const n = (rnd() - 0.5) * 6;
      d[i] = c[0] + n; d[i + 1] = c[1] + n; d[i + 2] = c[2] + n;
    }
  }

  /** The heavy outer line around the whole figure, softened at its edge. */
  outline(color: RGB = INK, alpha = 255, width = 1) {
    const S = this.S, d = this.d, a0 = new Uint8Array(S * S);
    for (let i = 0; i < S * S; i++) a0[i] = d[i * 4 + 3];
    const R = Math.max(1.2, this.line * 0.8 * width);
    const r = Math.ceil(R);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      if (a0[i] >= 250) continue;
      let best = Infinity;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= S || Y >= S || a0[Y * S + X] < 128) continue;
        best = Math.min(best, dx * dx + dy * dy);
      }
      if (best === Infinity) continue;
      const cover = Math.max(0, Math.min(1, R + 0.5 - Math.sqrt(best)));
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
    // A silhouette in the aura's colour, blurred outwards, behind the figure.
    const sil = canvas(S);
    const sctx = sil.getContext('2d')!;
    sctx.drawImage(this.c, 0, 0);
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = css(inner);
    sctx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    const blur = this.px * 1.1;
    ctx.filter = `blur(${blur}px)`;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(sil, 0, 0);
    ctx.filter = `blur(${blur * 2.4}px)`;
    sctx.fillStyle = css(outer);
    sctx.fillRect(0, 0, S, S);
    ctx.globalAlpha = 0.55;
    ctx.drawImage(sil, 0, flicker ? -this.px * 2 : 0);
    ctx.restore();
    if (flicker) {
      // Tongues of flame rising from the figure.
      const rnd = seeded(seed);
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      for (let n = 0; n < 14; n++) {
        const x = S * (0.2 + rnd() * 0.6), y = S * (0.25 + rnd() * 0.6), h = this.px * (3 + rnd() * 5);
        const g = ctx.createLinearGradient(x, y, x, y - h);
        g.addColorStop(0, css(inner, 0.7));
        g.addColorStop(1, css(outer, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - h * 0.25, y);
        ctx.quadraticCurveTo(x, y - h * 0.3, x + rnd() * h * 0.3 - h * 0.15, y - h);
        ctx.quadraticCurveTo(x + h * 0.1, y - h * 0.3, x + h * 0.25, y);
        ctx.fill();
      }
      ctx.restore();
    }
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

