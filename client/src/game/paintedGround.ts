// The painted battle ground: the whole fight's map painted as one picture, soft and loose like a
// gouache sketch on a game board, instead of a mosaic of pixel tiles. Grass runs into mud, water
// has a wet rim, walls cast a shadow, and trees, boulders and tables are inked on top. The squares
// stay readable: every tile keeps its kind of ground, the edges between kinds only wander a little
// inside the square, and a faint grid sits over everything.
// Generated in the browser from the map itself, so it costs nothing and works offline. Original, CC0.

import { tileWalkable, type Biome } from '../../../shared/battlemap';
import { LOOKS, type Look } from './battleTiles';
import { INK, canvas, hex, mix, seeded, smoothClosed, type P, type RGB } from './ink';

const css = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const lit = (c: RGB, t: number) => mix(c, hex('#fff1d6'), t);
const dim = (c: RGB, t: number) => mix(c, hex('#1a1016'), t);

/** A smooth value noise, about one bump per unit. */
function noise2(seed: number) {
  const h = (x: number, y: number) => {
    let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = s(x - x0), fy = s(y - y0);
    const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

type Test = (ch: string) => boolean;

interface Ctx {
  rows: string[];
  W: number;
  H: number;
  /** Pixels per square. */
  S: number;
  look: Look;
  rnd: () => number;
  n1: (x: number, y: number) => number;
  n2: (x: number, y: number) => number;
}

/**
 * Where a kind of ground lies, as an alpha mask the size of the picture: soft edges that wander a
 * little (wobble, in squares) and reach out by bleed squares.
 */
function mask(g: Ctx, test: Test, wobble = 0.3, bleed = 0): HTMLCanvasElement {
  const R = 12;
  const w = g.W * R, h = g.H * R;
  const m = new Float32Array((g.W + 2) * (g.H + 2));
  const at = (x: number, y: number) => m[(y + 1) * (g.W + 2) + (x + 1)];
  for (let y = -1; y <= g.H; y++) for (let x = -1; x <= g.W; x++) {
    const cx = Math.max(0, Math.min(g.W - 1, x)), cy = Math.max(0, Math.min(g.H - 1, y));
    m[(y + 1) * (g.W + 2) + (x + 1)] = test(g.rows[cy][cx]) ? 1 : 0;
  }
  const small = canvas(w, h);
  const sctx = small.getContext('2d')!;
  const img = sctx.createImageData(w, h);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const u = (px + 0.5) / R - 0.5, v = (py + 0.5) / R - 0.5;
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    const val = at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
    const n = (g.n1(px / R * 1.3, py / R * 1.3) - 0.5) * 0.7 + (g.n2(px / R * 4, py / R * 4) - 0.5) * 0.3;
    const f = val + n * wobble + bleed;
    const a = Math.max(0, Math.min(1, (f - 0.44) / 0.12));
    const i = (py * w + px) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.round(a * a * (3 - 2 * a) * 255);
  }
  sctx.putImageData(img, 0, 0);
  const big = canvas(g.W * g.S, g.H * g.S);
  const bctx = big.getContext('2d')!;
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(small, 0, 0, big.width, big.height);
  return big;
}

const any = (g: Ctx, test: Test) => g.rows.some((r) => [...r].some(test));

/** Paints a layer on its own canvas and lays it on the picture through a mask. */
function layer(out: CanvasRenderingContext2D, g: Ctx, m: HTMLCanvasElement, paint: (ctx: CanvasRenderingContext2D) => void, alpha = 1) {
  const c = canvas(g.W * g.S, g.H * g.S);
  const ctx = c.getContext('2d')!;
  paint(ctx);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(m, 0, 0);
  out.globalAlpha = alpha;
  out.drawImage(c, 0, 0);
  out.globalAlpha = 1;
}

/** A flat colour, worked over with soft blotches and loose brush strokes. */
function wash(ctx: CanvasRenderingContext2D, g: Ctx, base: RGB, light: RGB, dark: RGB, strokes = 26, angle = -0.5) {
  const w = g.W * g.S, h = g.H * g.S, S = g.S, rnd = g.rnd;
  ctx.fillStyle = css(base);
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < g.W * g.H * 0.5; i++) {
    const x = rnd() * w, y = rnd() * h, r = S * (0.8 + rnd() * 2);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = rnd() > 0.5 ? light : dark;
    grad.addColorStop(0, css(c, 0.22 + rnd() * 0.15));
    grad.addColorStop(1, css(c, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < g.W * g.H * strokes; i++) {
    const x = rnd() * w, y = rnd() * h, len = S * (0.06 + rnd() * 0.16), a = angle + (rnd() - 0.5) * 0.9;
    const c = rnd() > 0.5 ? lit(light, 0.1) : dim(dark, 0.1);
    ctx.strokeStyle = css(c, 0.12 + rnd() * 0.18);
    ctx.lineWidth = S * (0.025 + rnd() * 0.045);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (rnd() - 0.5) * 3, y + Math.sin(a) * len * 0.5 + (rnd() - 0.5) * 3, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
}

const each = (g: Ctx, test: Test, fn: (x: number, y: number, ch: string) => void) => {
  for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) if (test(g.rows[y][x])) fn(x, y, g.rows[y][x]);
};

function blobPoints(rnd: () => number, cx: number, cy: number, rx: number, ry = rx, n = 9, jitter = 0.16): P[] {
  const p: P[] = [];
  const turn = rnd() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = turn + (i / n) * Math.PI * 2, k = 1 + (rnd() - 0.5) * 2 * jitter;
    p.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return p;
}

/** A lumpy closed shape around a point, as the current path. */
function blob(ctx: CanvasRenderingContext2D, rnd: () => number, cx: number, cy: number, rx: number, ry = rx, n = 9, jitter = 0.16) {
  ctx.beginPath();
  smoothClosed(ctx, blobPoints(rnd, cx, cy, rx, ry, n, jitter));
}

function inkLine(ctx: CanvasRenderingContext2D, S: number, a = 0.85, wide = 1) {
  ctx.strokeStyle = css(INK, a);
  ctx.lineWidth = Math.max(1.2, S * 0.035 * wide);
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function shadow(ctx: CanvasRenderingContext2D, S: number, cx: number, cy: number, r: number) {
  const ox = cx + S * 0.1, oy = cy + S * 0.14;
  const grad = ctx.createRadialGradient(ox, oy, r * 0.3, ox, oy, r * 1.15);
  grad.addColorStop(0, 'rgba(12,8,10,0.45)');
  grad.addColorStop(1, 'rgba(12,8,10,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(ox, oy, r * 1.15, r * 1.0, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---- Floors -------------------------------------------------------------------------------------

function planks(ctx: CanvasRenderingContext2D, g: Ctx, wood: RGB) {
  const S = g.S, w = g.W * S, h = g.H * S, rnd = g.rnd, bh = S / 3;
  ctx.fillStyle = css(dim(wood, 0.5));
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += bh) {
    let x = -rnd() * S;
    while (x < w) {
      const len = S * (1.2 + rnd() * 1.8), c = mix(wood, rnd() > 0.5 ? lit(wood, 0.3) : dim(wood, 0.25), rnd());
      ctx.fillStyle = css(c);
      ctx.fillRect(x + 1, y + 1, len - 2, bh - 2);
      ctx.strokeStyle = css(dim(c, 0.25), 0.35);
      ctx.lineWidth = 1;
      for (let k = 0; k < 2; k++) {
        const gy = y + bh * (0.3 + rnd() * 0.4);
        ctx.beginPath();
        ctx.moveTo(x + 3, gy);
        ctx.bezierCurveTo(x + len * 0.3, gy + (rnd() - 0.5) * 3, x + len * 0.7, gy + (rnd() - 0.5) * 3, x + len - 3, gy);
        ctx.stroke();
      }
      ctx.fillStyle = css(lit(c, 0.25), 0.5);
      ctx.fillRect(x + 1, y + 1, len - 2, 1.5);
      if (rnd() > 0.7) { ctx.fillStyle = css(INK, 0.5); ctx.beginPath(); ctx.arc(x + 5, y + bh / 2, 1.3, 0, 7); ctx.arc(x + len - 5, y + bh / 2, 1.3, 0, 7); ctx.fill(); }
      x += len;
    }
  }
}

function cobbles(ctx: CanvasRenderingContext2D, g: Ctx, stone: RGB) {
  const S = g.S, w = g.W * S, h = g.H * S, rnd = g.rnd, cs = S / 3.2;
  ctx.fillStyle = css(dim(stone, 0.55));
  ctx.fillRect(0, 0, w, h);
  for (let row = 0, y = 0; y < h + cs; row++, y += cs * 0.9) {
    for (let x = (row % 2) * cs * 0.5 - cs; x < w + cs; x += cs) {
      const c = mix(stone, rnd() > 0.5 ? lit(stone, 0.25) : dim(stone, 0.2), rnd());
      blob(ctx, rnd, x + cs / 2, y + cs / 2, cs * 0.44, cs * 0.4, 7, 0.14);
      ctx.fillStyle = css(c);
      ctx.fill();
      ctx.strokeStyle = css(INK, 0.3);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = css(lit(c, 0.35), 0.5);
      ctx.beginPath();
      ctx.ellipse(x + cs * 0.4, y + cs * 0.38, cs * 0.18, cs * 0.1, -0.4, 0, 7);
      ctx.fill();
    }
  }
}

function flagstones(ctx: CanvasRenderingContext2D, g: Ctx) {
  const S = g.S, rnd = g.rnd;
  ctx.strokeStyle = css(INK, 0.28);
  ctx.lineWidth = Math.max(1, S * 0.03);
  for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) {
    if (!tileWalkable(g.rows[y][x]) && g.rows[y][x] !== 't') continue;
    const split = rnd();
    const j = () => (rnd() - 0.5) * S * 0.06;
    const x0 = x * S, y0 = y * S;
    ctx.beginPath();
    ctx.moveTo(x0 + j(), y0 + j()); ctx.lineTo(x0 + S + j(), y0 + j());
    ctx.moveTo(x0 + j(), y0 + j()); ctx.lineTo(x0 + j(), y0 + S + j());
    if (split > 0.55) { const sx = x0 + S * (0.35 + rnd() * 0.3); ctx.moveTo(sx, y0); ctx.lineTo(sx + j(), y0 + S); }
    ctx.stroke();
    if (rnd() > 0.75) { ctx.strokeStyle = css(INK, 0.18); ctx.beginPath(); ctx.moveTo(x0 + S * 0.2, y0 + S * 0.3); ctx.lineTo(x0 + S * 0.45, y0 + S * 0.5); ctx.lineTo(x0 + S * 0.4, y0 + S * 0.75); ctx.stroke(); ctx.strokeStyle = css(INK, 0.28); }
  }
}

function tufts(ctx: CanvasRenderingContext2D, g: Ctx, color: RGB, per: number, test: Test) {
  const S = g.S, rnd = g.rnd;
  ctx.lineCap = 'round';
  each(g, test, (x, y) => {
    for (let i = 0; i < per; i++) {
      const bx = (x + 0.1 + rnd() * 0.8) * S, by = (y + 0.2 + rnd() * 0.75) * S;
      const c = rnd() > 0.5 ? lit(color, 0.2) : dim(color, 0.15);
      ctx.strokeStyle = css(c, 0.75);
      ctx.lineWidth = Math.max(1, S * 0.025);
      for (let b = 0; b < 3; b++) {
        const a = -Math.PI / 2 + (b - 1) * 0.45 + (rnd() - 0.5) * 0.3, len = S * (0.08 + rnd() * 0.08);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + Math.cos(a) * len * 0.5, by + Math.sin(a) * len * 0.6, bx + Math.cos(a) * len, by + Math.sin(a) * len);
        ctx.stroke();
      }
    }
  });
}

function pebbles(ctx: CanvasRenderingContext2D, g: Ctx, color: RGB, per: number, size: number, test: Test) {
  const S = g.S, rnd = g.rnd;
  each(g, test, (x, y) => {
    for (let i = 0; i < per; i++) {
      const cx = (x + 0.12 + rnd() * 0.76) * S, cy = (y + 0.12 + rnd() * 0.76) * S, r = S * size * (0.5 + rnd());
      const c = mix(color, rnd() > 0.5 ? lit(color, 0.3) : dim(color, 0.3), rnd());
      blob(ctx, rnd, cx, cy, r, r * 0.8, 6, 0.2);
      ctx.fillStyle = css(c);
      ctx.fill();
      inkLine(ctx, S, 0.55, 0.6);
      ctx.fillStyle = css(lit(c, 0.45), 0.7);
      ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.3, 0, 7); ctx.fill();
    }
  });
}

// ---- Things that stand on the ground ------------------------------------------------------------

function tree(ctx: CanvasRenderingContext2D, g: Ctx, x: number, y: number) {
  const S = g.S, rnd = g.rnd, cx = (x + 0.5) * S + (rnd() - 0.5) * S * 0.08, cy = (y + 0.5) * S + (rnd() - 0.5) * S * 0.08;
  const kind = g.look.tree;
  if (kind === 'dead') {
    shadow(ctx, S, cx, cy, S * 0.3);
    const bark = hex('#5a4838');
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a = rnd() * Math.PI * 2, len = S * (0.3 + rnd() * 0.18);
      const mx = cx + Math.cos(a) * len * 0.55, my = cy + Math.sin(a) * len * 0.55;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(mx + (rnd() - 0.5) * 6, my + (rnd() - 0.5) * 6, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a + 0.7) * len * 0.35, my + Math.sin(a + 0.7) * len * 0.35);
      ctx.strokeStyle = css(INK, 0.9); ctx.lineWidth = S * 0.075; ctx.stroke();
      ctx.strokeStyle = css(bark); ctx.lineWidth = S * 0.04; ctx.stroke();
    }
    blob(ctx, rnd, cx, cy, S * 0.12);
    ctx.fillStyle = css(dim(bark, 0.1)); ctx.fill(); inkLine(ctx, S);
    return;
  }
  const r = S * (kind === 'bush' ? 0.36 : 0.46);
  const green = kind === 'pine' ? hex('#2a5232') : kind === 'bush' ? hex('#3f6f34') : hex('#3c7a36');
  shadow(ctx, S, cx, cy, r);
  if (kind === 'pine') {
    // From above, a fir is a dark round of needle tufts, lighter towards the top.
    blob(ctx, rnd, cx, cy, r, r, 14, 0.14);
    ctx.fillStyle = css(dim(green, 0.25));
    ctx.fill();
    inkLine(ctx, S, 0.85, 1.1);
    ctx.lineCap = 'round';
    for (const [k, t] of [[0.95, 0], [0.7, 0.15], [0.45, 0.3]] as const) {
      for (let i = 0; i < 26 * k; i++) {
        const a = rnd() * Math.PI * 2, d = r * k * (0.35 + rnd() * 0.6), len = S * (0.05 + rnd() * 0.06);
        const px = cx + Math.cos(a) * d - r * 0.1 * (1 - k), py = cy + Math.sin(a) * d - r * 0.12 * (1 - k);
        ctx.strokeStyle = css(lit(green, t + rnd() * 0.12), 0.85);
        ctx.lineWidth = Math.max(1, S * 0.03);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); ctx.stroke();
      }
    }
    ctx.fillStyle = css(hex('#5a4030')); ctx.beginPath(); ctx.arc(cx - r * 0.05, cy - r * 0.06, S * 0.035, 0, 7); ctx.fill();
    return;
  }
  blob(ctx, rnd, cx, cy, r, r, 11, 0.12);
  ctx.fillStyle = css(dim(green, 0.15));
  ctx.fill();
  inkLine(ctx, S, 0.85, 1.1);
  for (let i = 0; i < 5; i++) {
    const a = rnd() * 6.28, d = r * (0.15 + rnd() * 0.35);
    blob(ctx, rnd, cx + Math.cos(a) * d - r * 0.12, cy + Math.sin(a) * d - r * 0.15, r * (0.28 + rnd() * 0.16), undefined, 8, 0.18);
    ctx.fillStyle = css(mix(green, lit(green, 0.3), rnd()), 0.9);
    ctx.fill();
    inkLine(ctx, S, 0.25, 0.6);
  }
  for (let i = 0; i < 9; i++) {
    const a = rnd() * 6.28, d = r * rnd() * 0.65;
    ctx.fillStyle = css(lit(green, 0.5), 0.55);
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d - r * 0.2, cy + Math.sin(a) * d - r * 0.2, S * 0.03, 0, 7); ctx.fill();
  }
}

function boulder(ctx: CanvasRenderingContext2D, g: Ctx, x: number, y: number) {
  const S = g.S, rnd = g.rnd, cx = (x + 0.5) * S, cy = (y + 0.52) * S, r = S * (0.33 + rnd() * 0.06);
  const stone = g.look.wallStyle === 'rock' ? hex(g.look.wall[1]) : hex('#85807a');
  shadow(ctx, S, cx, cy, r);
  const outline = blobPoints(rnd, cx, cy, r, r * 0.86, 7, 0.14);
  ctx.beginPath(); smoothClosed(ctx, outline);
  ctx.fillStyle = css(dim(stone, 0.15));
  ctx.fill();
  ctx.save();
  ctx.clip();
  blob(ctx, rnd, cx - r * 0.25, cy - r * 0.28, r * 0.62, r * 0.5, 6, 0.12);
  ctx.fillStyle = css(lit(stone, 0.25));
  ctx.fill();
  ctx.strokeStyle = css(INK, 0.3);
  ctx.lineWidth = Math.max(1, S * 0.025);
  ctx.beginPath(); ctx.moveTo(cx - r * 0.2, cy + r * 0.1); ctx.lineTo(cx + r * 0.3, cy + r * 0.45); ctx.stroke();
  ctx.restore();
  ctx.beginPath(); smoothClosed(ctx, outline);
  inkLine(ctx, S, 0.85, 1.1);
}

function prop(ctx: CanvasRenderingContext2D, g: Ctx, x: number, y: number) {
  const S = g.S, cx = (x + 0.5) * S, cy = (y + 0.5) * S;
  const wood = hex('#a07446');
  const v = (x * 7 + y * 13) % 4;
  if (g.look.prop === 'table') {
    const w = S * 0.84, h = S * 0.62;
    ctx.fillStyle = 'rgba(12,8,10,0.4)';
    ctx.fillRect(cx - w / 2 + S * 0.08, cy - h / 2 + S * 0.1, w, h);
    ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, h, S * 0.06);
    ctx.fillStyle = css(wood); ctx.fill(); inkLine(ctx, S);
    ctx.strokeStyle = css(dim(wood, 0.35), 0.6); ctx.lineWidth = 1;
    for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(cx - w / 2 + 3, cy - h / 2 + (h * k) / 3); ctx.lineTo(cx + w / 2 - 3, cy - h / 2 + (h * k) / 3); ctx.stroke(); }
    ctx.fillStyle = css(lit(wood, 0.3), 0.6); ctx.fillRect(cx - w / 2 + 2, cy - h / 2 + 2, w - 4, 2);
    // What lies on it: a tankard, a plate, a candle.
    const put = (px: number, py: number, r: number, c: string) => { ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fillStyle = c; ctx.fill(); inkLine(ctx, S, 0.6, 0.6); };
    if (v % 2) put(cx - w * 0.22, cy - h * 0.1, S * 0.09, '#d8d0c0'); else put(cx + w * 0.2, cy + h * 0.08, S * 0.07, '#c9a24a');
    if (v > 1) put(cx + w * 0.05, cy - h * 0.18, S * 0.05, '#e8dcc0');
    return;
  }
  shadow(ctx, S, cx, cy, S * 0.34);
  if (v % 2) {
    // A barrel, from above: a round lid with hoops.
    const r = S * 0.32;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = css(dim(wood, 0.1)); ctx.fill(); inkLine(ctx, S);
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, 7); ctx.strokeStyle = css(hex('#4a4a52'), 0.9); ctx.lineWidth = S * 0.04; ctx.stroke();
    ctx.strokeStyle = css(dim(wood, 0.4), 0.6); ctx.lineWidth = 1;
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(cx + k * r * 0.3, cy - r * 0.7); ctx.lineTo(cx + k * r * 0.3, cy + r * 0.7); ctx.stroke(); }
  } else {
    // A crate: boards and a cross brace.
    const s = S * 0.62, x0 = cx - s / 2, y0 = cy - s / 2;
    ctx.beginPath(); ctx.rect(x0, y0, s, s); ctx.fillStyle = css(wood); ctx.fill(); inkLine(ctx, S);
    ctx.beginPath(); ctx.moveTo(x0 + 3, y0 + 3); ctx.lineTo(x0 + s - 3, y0 + s - 3); ctx.moveTo(x0 + s - 3, y0 + 3); ctx.lineTo(x0 + 3, y0 + s - 3);
    ctx.strokeStyle = css(dim(wood, 0.35)); ctx.lineWidth = S * 0.05; ctx.stroke();
    ctx.strokeRect(x0 + S * 0.04, y0 + S * 0.04, s - S * 0.08, s - S * 0.08);
  }
}

// ---- Walls --------------------------------------------------------------------------------------

function wallTop(ctx: CanvasRenderingContext2D, g: Ctx) {
  const S = g.S, w = g.W * S, h = g.H * S, rnd = g.rnd;
  const [base, light, dark] = g.look.wall.map(hex) as [RGB, RGB, RGB];
  if (g.look.wallStyle === 'timber') {
    // Buildings seen from above: rows of roof shingles, darker than any floor.
    const roof = mix(dim(base, 0.25), hex('#6a3a2c'), 0.45);
    ctx.fillStyle = css(dim(roof, 0.5));
    ctx.fillRect(0, 0, w, h);
    const sh = S / 4, sw = S / 3;
    for (let row = 0, y = 0; y < h; row++, y += sh) for (let x = (row % 2) * -sw / 2; x < w; x += sw) {
      const c = mix(roof, rnd() > 0.5 ? lit(roof, 0.2) : dim(roof, 0.2), rnd());
      ctx.beginPath(); ctx.roundRect(x + 1, y + 1, sw - 2, sh * 1.2, [0, 0, sw * 0.35, sw * 0.35]);
      ctx.fillStyle = css(c); ctx.fill();
      ctx.strokeStyle = css(INK, 0.35); ctx.lineWidth = 1; ctx.stroke();
    }
    return;
  }
  ctx.fillStyle = css(dim(dark, 0.2));
  ctx.fillRect(0, 0, w, h);
  if (g.look.wallStyle === 'brick') {
    const bh = S / 3, bw = S / 2;
    for (let row = 0, y = 0; y < h; row++, y += bh) for (let x = (row % 2) * -bw / 2; x < w; x += bw) {
      const c = mix(base, rnd() > 0.5 ? light : dark, rnd() * 0.4);
      ctx.beginPath(); ctx.roundRect(x + 1.5, y + 1.5, bw - 3, bh - 3, 2);
      ctx.fillStyle = css(c); ctx.fill();
      ctx.fillStyle = css(lit(c, 0.25), 0.6); ctx.fillRect(x + 2, y + 2, bw - 4, 1.5);
    }
    return;
  }
  // Rough stone: packed boulders.
  for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) {
    if (g.rows[y][x] !== '#') continue;
    for (let i = 0; i < 4; i++) {
      const cx = (x + 0.2 + rnd() * 0.6) * S, cy = (y + 0.2 + rnd() * 0.6) * S, r = S * (0.25 + rnd() * 0.15);
      blob(ctx, rnd, cx, cy, r, r * 0.85, 7, 0.18);
      const c = mix(base, rnd() > 0.5 ? light : dark, rnd() * 0.5);
      ctx.fillStyle = css(c); ctx.fill();
      inkLine(ctx, S, 0.35, 0.7);
      ctx.fillStyle = css(lit(c, 0.2), 0.6);
      ctx.beginPath(); ctx.ellipse(cx - r * 0.25, cy - r * 0.3, r * 0.4, r * 0.25, -0.5, 0, 7); ctx.fill();
    }
  }
}

// ---- The whole picture --------------------------------------------------------------------------

const cache = new Map<string, HTMLCanvasElement>();

/** The painted ground for a map, size pixels per square. Always the same picture for the same map. */
export function paintedGround(rows: string[], biome: Biome, size = 64): HTMLCanvasElement {
  const key = `${biome}|${size}|${rows.join('/')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let seed = 7;
  for (const ch of key) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
  const look = LOOKS[biome] ?? LOOKS.dungeon;
  const g: Ctx = { rows, W: rows[0]?.length ?? 1, H: rows.length || 1, S: size, look, rnd: seeded(seed), n1: noise2(seed), n2: noise2(seed ^ 0x5bd1e995) };
  const out = canvas(g.W * g.S, g.H * g.S);
  const ctx = out.getContext('2d')!;
  const S = g.S;
  const [g0, g1, g2] = look.ground.map(hex) as [RGB, RGB, RGB];

  // The ground everywhere, then what this kind of place has underfoot.
  wash(ctx, g, g0, lit(g2, 0.1), dim(g1, 0.1), 30);
  const floorLike: Test = (c) => c === '.' || c === 't';
  if (biome === 'tavern') {
    layer(ctx, g, mask(g, floorLike, 0.1), (c) => planks(c, g, hex('#7f5a37')));
  } else if (biome === 'dungeon') {
    flagstones(ctx, g);
  } else if (look.tuft) {
    tufts(ctx, g, hex(look.tuft), 3, (c) => c === '.' || c === 'T');
  }

  // Rough ground: mud, brush, long grass, scree or rubble.
  const isRough: Test = (c) => c === ',';
  if (any(g, isRough)) {
    const m = mask(g, isRough, 0.35, 0.02);
    switch (look.rough) {
      case 'mud': layer(ctx, g, m, (c) => wash(c, g, hex('#56432f'), hex('#6e573f'), hex('#3a2d20'), 30, 0.1)); break;
      case 'brush': layer(ctx, g, m, (c) => wash(c, g, dim(g0, 0.15), hex('#4f7a3c'), dim(g1, 0.3), 20)); break;
      case 'grass': layer(ctx, g, m, (c) => wash(c, g, mix(g0, hex('#8fa650'), 0.4), hex('#a8b860'), g1, 20, -1.4)); break;
      case 'scree': layer(ctx, g, m, (c) => wash(c, g, mix(g0, hex('#8f8a84'), 0.4), hex('#b0aba4'), hex('#4a4744'), 20)); break;
      default: layer(ctx, g, m, (c) => wash(c, g, dim(g0, 0.12), lit(g2, 0.15), dim(g1, 0.3), 20));
    }
    if (look.rough === 'brush') tufts(ctx, g, hex('#6f9a4a'), 9, isRough);
    else if (look.rough === 'grass') tufts(ctx, g, hex('#a8b860'), 12, isRough);
    else if (look.rough === 'scree') pebbles(ctx, g, hex('#8f8a84'), 6, 0.05, isRough);
    else if (look.rough === 'rubble') pebbles(ctx, g, hex(look.wall[0]), 5, 0.06, isRough);
    else pebbles(ctx, g, hex('#6b5540'), 2, 0.035, isRough);
  }

  // Decks: planks, cobbles or a beaten path.
  const isDeck: Test = (c) => c === '=' || (look.prop === 'table' && c === 't' && biome !== 'tavern');
  if (any(g, isDeck)) {
    const m = mask(g, isDeck, look.deck === 'dirt' ? 0.4 : 0.12, look.deck === 'dirt' ? 0.03 : 0);
    if (look.deck === 'planks') layer(ctx, g, m, (c) => planks(c, g, hex('#8d6e4a')));
    else if (look.deck === 'cobble') layer(ctx, g, m, (c) => cobbles(c, g, hex('#8a857b')));
    else layer(ctx, g, m, (c) => wash(c, g, hex('#8a7250'), hex('#9a825e'), hex('#6a5a44'), 30, 0));
  }

  // Water: a dark wet rim on the bank, the shallows, the deep, and a few glints.
  const isWater: Test = (c) => c === '~' || c === 'W';
  if (any(g, isWater)) {
    const [shallow, deep] = look.water.map(hex) as [RGB, RGB];
    layer(ctx, g, mask(g, isWater, 0.3, 0.1), (c) => { c.fillStyle = css(dim(g1, 0.45)); c.fillRect(0, 0, out.width, out.height); }, 0.6);
    const wm = mask(g, isWater, 0.3);
    layer(ctx, g, wm, (c) => wash(c, g, shallow, lit(shallow, 0.2), dim(shallow, 0.15), 10, 0));
    const isDeep: Test = (c) => c === 'W';
    if (any(g, isDeep)) layer(ctx, g, mask(g, isDeep, 0.25), (c) => wash(c, g, deep, shallow, dim(deep, 0.3), 8, 0));
    layer(ctx, g, wm, (c) => {
      c.lineCap = 'round';
      each(g, isWater, (x, y) => {
        for (let i = 0; i < 3; i++) {
          const px = (x + 0.15 + g.rnd() * 0.6) * S, py = (y + 0.2 + g.rnd() * 0.6) * S, len = S * (0.15 + g.rnd() * 0.2);
          c.strokeStyle = css(hex('#dcefee'), 0.35 + g.rnd() * 0.3);
          c.lineWidth = Math.max(1, S * 0.025);
          c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo(px + len / 2, py - S * 0.04, px + len, py); c.stroke();
        }
      });
      if (look.tuft) tufts(c, g, hex('#7a8a4a'), 1, (ch) => ch === '~');
    });
    // The inked bank line.
    layer(ctx, g, wm, (c) => {
      c.drawImage(mask(g, (ch) => !isWater(ch), 0.3, 0.06), 0, 0);
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = css(INK, 0.55);
      c.fillRect(0, 0, out.width, out.height);
    });
  }

  // Walls: a shadow cast onto the ground, an inked edge, then the tops.
  const isWall: Test = (c) => c === '#';
  if (any(g, isWall)) {
    const shadowMask = mask(g, isWall, 0.15, 0.06);
    ctx.save();
    ctx.globalAlpha = 0.45;
    const sh = canvas(out.width, out.height);
    const sctx = sh.getContext('2d')!;
    sctx.drawImage(shadowMask, S * 0.16, S * 0.22);
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = '#0c080a';
    sctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(sh, 0, 0);
    ctx.restore();
    layer(ctx, g, mask(g, isWall, 0.15, 0.05), (c) => { c.fillStyle = css(INK, 0.9); c.fillRect(0, 0, out.width, out.height); });
    layer(ctx, g, mask(g, isWall, 0.15, -0.01), (c) => wallTop(c, g));
  }

  // Trees, boulders and furniture, each with its shadow and ink.
  each(g, (c) => c === 'T', (x, y) => tree(ctx, g, x, y));
  each(g, (c) => c === 'o', (x, y) => boulder(ctx, g, x, y));
  each(g, (c) => c === 't', (x, y) => prop(ctx, g, x, y));

  // A faint grid, so every square can still be counted.
  ctx.strokeStyle = css(INK, 0.13);
  ctx.lineWidth = Math.max(1, S / 64);
  ctx.beginPath();
  for (let x = 1; x < g.W; x++) { ctx.moveTo(x * S, 0); ctx.lineTo(x * S, out.height); }
  for (let y = 1; y < g.H; y++) { ctx.moveTo(0, y * S); ctx.lineTo(out.width, y * S); }
  ctx.stroke();

  // Paper grain over everything.
  const rnd = g.rnd;
  for (let i = 0; i < g.W * g.H * 40; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,244,220,0.05)' : 'rgba(20,14,11,0.06)';
    ctx.fillRect(rnd() * out.width, rnd() * out.height, 1.5, 1.5);
  }

  if (cache.size > 6) cache.delete(cache.keys().next().value!);
  cache.set(key, out);
  return out;
}
