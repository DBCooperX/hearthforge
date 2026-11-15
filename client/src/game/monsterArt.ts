// Monster tokens, drawn from a look: a body shape scaled to the creature's size,
// with heads, horns, wings, armour, a weapon, an aura and a mutation layered on.
// Original generated art, CC0 like the rest. Tokens are drawn at 32 pixels per
// map square so that a third head or a pair of horns stays readable.

import { SIZE_TILES, lookKey, type Body, type Color, type MonsterLook } from '../../../shared/monsterLook';

export const TOKEN_PX = 32;

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const BLACK: RGB = [0, 0, 0], WHITE: RGB = [255, 255, 255];
const OUTLINE = hex('#17121c');

const PALETTE: Record<Color, RGB> = {
  red: hex('#b8433a'), orange: hex('#c9772e'), yellow: hex('#cdb040'), green: hex('#6f9a4a'), teal: hex('#5a8f84'), blue: hex('#4a72b8'), purple: hex('#7a55a8'),
  pink: hex('#c97a9a'), brown: hex('#7a5536'), tan: hex('#c49a6c'), grey: hex('#8a8a92'), black: hex('#3d3944'), white: hex('#dcdce4'), bone: hex('#e2dcc6'),
};
const GLOW: Record<Color, RGB> = {
  red: hex('#ff4a3a'), orange: hex('#ff9a2e'), yellow: hex('#ffe14d'), green: hex('#7dff5a'), teal: hex('#5affd8'), blue: hex('#6ab8ff'), purple: hex('#c07aff'),
  pink: hex('#ff8ac8'), brown: hex('#c98a4a'), tan: hex('#f0c890'), grey: hex('#d0d0d8'), black: hex('#17121c'), white: hex('#ffffff'), bone: hex('#fff4d0'),
};
const AURA: Record<NonNullable<MonsterLook['aura']>, [RGB, RGB]> = {
  fire: [hex('#ff8a1e'), hex('#ffd24a')], frost: [hex('#8fd8ff'), hex('#e6f8ff')], poison: [hex('#6fd24a'), hex('#c8f08a')],
  shadow: [hex('#3a2466'), hex('#6a4aa8')], holy: [hex('#ffe9a0'), hex('#fffbe6')], lightning: [hex('#fff07a'), hex('#9ad0ff')],
};
const STEEL = hex('#9aa3ad'), LEATHER = hex('#7a5a3a'), WOOD = hex('#6a4a2c'), CLOTH = hex('#5a4a3c'), BONE = hex('#e8e0c8');

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type P = [number, number];

/** A square pixel buffer with shapes given in unit coordinates (0..1, y down). */
class Pix {
  readonly d: Uint8ClampedArray;
  /** The figure is shrunk towards the bottom centre for small creatures. */
  constructor(readonly S: number, private f: number) { this.d = new Uint8ClampedArray(S * S * 4); }
  private tx = (x: number) => (0.5 + (x - 0.5) * this.f) * this.S;
  private ty = (y: number) => (0.97 - (0.97 - y) * this.f) * this.S;
  set(px: number, py: number, c: RGB, a = 255) {
    if (px < 0 || py < 0 || px >= this.S || py >= this.S) return;
    const i = (py * this.S + px) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a;
  }
  alpha(px: number, py: number) { return px < 0 || py < 0 || px >= this.S || py >= this.S ? 0 : this.d[(py * this.S + px) * 4 + 3]; }
  private each(x0: number, y0: number, x1: number, y1: number, test: (cx: number, cy: number) => boolean, c: RGB) {
    for (let py = Math.max(0, Math.floor(y0)); py <= Math.min(this.S - 1, Math.ceil(y1)); py++)
      for (let px = Math.max(0, Math.floor(x0)); px <= Math.min(this.S - 1, Math.ceil(x1)); px++) if (test(px + 0.5, py + 0.5)) this.set(px, py, c);
  }
  ell(cx: number, cy: number, rx: number, ry: number, c: RGB) {
    const X = this.tx(cx), Y = this.ty(cy), RX = Math.max(0.6, rx * this.f * this.S), RY = Math.max(0.6, ry * this.f * this.S);
    this.each(X - RX, Y - RY, X + RX, Y + RY, (x, y) => ((x - X) / RX) ** 2 + ((y - Y) / RY) ** 2 <= 1, c);
  }
  box(x0: number, y0: number, x1: number, y1: number, c: RGB) {
    const X0 = this.tx(x0), Y0 = this.ty(y0), X1 = this.tx(x1), Y1 = this.ty(y1);
    this.each(X0, Y0, X1, Y1, (x, y) => x >= X0 && x <= X1 && y >= Y0 && y <= Y1, c);
  }
  seg(a: P, b: P, w: number, c: RGB) {
    const ax = this.tx(a[0]), ay = this.ty(a[1]), bx = this.tx(b[0]), by = this.ty(b[1]), r = Math.max(0.55, (w * this.f * this.S) / 2);
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy || 1;
    this.each(Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.max(ax, bx) + r, Math.max(ay, by) + r, (x, y) => {
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len));
      return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= r * r;
    }, c);
  }
  tri(a: P, b: P, c3: P, c: RGB) {
    const p = [a, b, c3].map(([x, y]) => [this.tx(x), this.ty(y)]);
    const sign = (x: number, y: number, i: number, j: number) => (x - p[j][0]) * (p[i][1] - p[j][1]) - (p[i][0] - p[j][0]) * (y - p[j][1]);
    this.each(Math.min(p[0][0], p[1][0], p[2][0]), Math.min(p[0][1], p[1][1], p[2][1]), Math.max(p[0][0], p[1][0], p[2][0]), Math.max(p[0][1], p[1][1], p[2][1]), (x, y) => {
      const d1 = sign(x, y, 0, 1), d2 = sign(x, y, 1, 2), d3 = sign(x, y, 2, 0);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    }, c);
  }
  /** One pixel-sized dot (or a small block on big tokens). */
  dot(x: number, y: number, c: RGB, size = 1) {
    const s = Math.max(1, Math.round((size * this.S) / 32 * Math.max(this.f, 0.75)));
    const px = Math.round(this.tx(x) - s / 2), py = Math.round(this.ty(y) - s / 2);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) this.set(px + i, py + j, c);
  }
}

interface Shape {
  /** Where the (first) head sits and how big it is. */
  head: P;
  r: number;
  /** Seen from the side, facing left: one eye per head. */
  side?: boolean;
  /** Where extra heads and wings attach. */
  neck: P;
  wing: P;
  /** The weapon hand. */
  hand?: P;
  tail?: [P, P, P];
}

const SHAPES: Record<Body, Shape> = {
  humanoid: { head: [0.5, 0.27], r: 0.15, neck: [0.5, 0.44], wing: [0.5, 0.48], hand: [0.77, 0.66], tail: [[0.56, 0.68], [0.8, 0.84], [0.9, 0.74]] },
  giant: { head: [0.5, 0.2], r: 0.12, neck: [0.5, 0.36], wing: [0.5, 0.44], hand: [0.87, 0.7], tail: [[0.6, 0.66], [0.84, 0.86], [0.94, 0.76]] },
  beast: { head: [0.22, 0.42], r: 0.13, side: true, neck: [0.36, 0.52], wing: [0.56, 0.48], tail: [[0.84, 0.54], [0.93, 0.44], [0.96, 0.3]] },
  rodent: { head: [0.25, 0.7], r: 0.13, side: true, neck: [0.38, 0.7], wing: [0.58, 0.6], tail: [[0.86, 0.74], [0.97, 0.62], [0.9, 0.46]] },
  insect: { head: [0.5, 0.3], r: 0.09, neck: [0.5, 0.4], wing: [0.5, 0.46], tail: [[0.5, 0.84], [0.56, 0.92], [0.66, 0.9]] },
  serpent: { head: [0.38, 0.24], r: 0.11, side: true, neck: [0.5, 0.46], wing: [0.5, 0.5], tail: [[0.8, 0.84], [0.93, 0.78], [0.96, 0.66]] },
  dragon: { head: [0.2, 0.27], r: 0.11, side: true, neck: [0.36, 0.52], wing: [0.56, 0.5], tail: [[0.76, 0.66], [0.93, 0.8], [0.97, 0.62]] },
  bird: { head: [0.5, 0.32], r: 0.12, neck: [0.5, 0.46], wing: [0.5, 0.54], tail: [[0.5, 0.78], [0.5, 0.9], [0.56, 0.94]] },
  ooze: { head: [0.5, 0.66], r: 0.13, neck: [0.5, 0.6], wing: [0.5, 0.6] },
  elemental: { head: [0.5, 0.4], r: 0.12, neck: [0.5, 0.5], wing: [0.5, 0.52] },
  plant: { head: [0.5, 0.28], r: 0.15, neck: [0.5, 0.46], wing: [0.5, 0.5], hand: [0.82, 0.5] },
  aberration: { head: [0.5, 0.45], r: 0.13, neck: [0.5, 0.3], wing: [0.5, 0.45] },
  construct: { head: [0.5, 0.27], r: 0.1, neck: [0.5, 0.4], wing: [0.5, 0.46], hand: [0.76, 0.72] },
  ghost: { head: [0.5, 0.3], r: 0.15, neck: [0.5, 0.44], wing: [0.5, 0.48], hand: [0.84, 0.6] },
};

function draw(look: MonsterLook): { S: number; data: Uint8ClampedArray } {
  const S = TOKEN_PX * SIZE_TILES[look.size];
  const f = look.size === 'tiny' ? 0.55 : look.size === 'small' ? 0.78 : 1;
  const g = new Pix(S, f);
  const rnd = mulberry([...lookKey(look)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) | 0, 7));
  const base = PALETTE[look.color], dark = mix(base, BLACK, 0.35), light = mix(base, WHITE, 0.3), deep = mix(base, BLACK, 0.55);
  const sh = SHAPES[look.body];
  const body = look.body;
  const eyes: { p: P; big?: boolean }[] = [];

  // Head positions: one in place, two side by side, three with the middle one raised.
  // Creatures seen from the side grow their extra heads up and back, so no snout leaves the picture.
  const d = sh.r;
  const offsets: P[] = look.heads === 1 ? [[0, 0]]
    : sh.side ? (look.heads === 2 ? [[d * 1.5, -d * 1.3], [0, d * 0.2]] : [[d * 2.6, -d * 0.9], [d * 1.2, -d * 1.7], [0, d * 0.3]])
    : look.heads === 2 ? [[-d * 1.05, 0], [d * 1.05, 0]] : [[-d * 1.85, d * 0.35], [d * 1.85, d * 0.35], [0, -d * 0.6]];
  const heads: P[] = offsets.map(([dx, dy]) => [Math.max(sh.r + 0.03, Math.min(0.97 - sh.r, sh.head[0] + dx)), Math.max(sh.r + 0.05, sh.head[1] + dy)]);

  // --- behind the body: wings and tail
  const wings = look.wings ?? (body === 'bird' ? 'feather' : null);
  if (wings) {
    const [wx, wy] = sh.wing;
    const c = wings === 'bat' ? mix(base, BLACK, 0.25) : mix(base, WHITE, 0.45);
    for (const s of [-1, 1]) {
      const tip: P = [wx + s * 0.46, wy - 0.38], low: P = [wx + s * 0.44, wy + 0.1];
      g.tri([wx, wy - 0.06], tip, low, c);
      g.tri([wx, wy - 0.06], low, [wx + s * 0.16, wy + 0.16], c);
      if (wings === 'bat') { g.seg([wx, wy - 0.04], tip, 0.035, deep); g.seg([wx, wy - 0.04], low, 0.03, deep); g.seg([wx, wy - 0.04], [wx + s * 0.3, wy - 0.3], 0.025, deep); }
      else for (let i = 0; i < 4; i++) g.seg([wx + s * (0.14 + i * 0.09), wy - 0.1 - i * 0.05], [wx + s * (0.18 + i * 0.09), wy + 0.1 - i * 0.02], 0.03, mix(base, WHITE, 0.65));
    }
  }
  if ((look.tail || body === 'rodent' || body === 'dragon') && sh.tail) {
    const c = body === 'rodent' ? hex('#d8a0a0') : base;
    const w = body === 'dragon' || body === 'serpent' ? 0.1 : body === 'rodent' ? 0.035 : 0.06;
    g.seg(sh.tail[0], sh.tail[1], w, c);
    g.seg(sh.tail[1], sh.tail[2], w * 0.7, c);
    if (body === 'humanoid' || body === 'giant') g.tri([sh.tail[2][0] - 0.04, sh.tail[2][1]], [sh.tail[2][0] + 0.04, sh.tail[2][1]], [sh.tail[2][0], sh.tail[2][1] - 0.08], c);
  }

  // --- the body
  const tunic = look.armor === 'plate' ? STEEL : look.armor === 'leather' ? LEATHER : CLOTH;
  switch (body) {
    case 'humanoid':
      g.box(0.38, 0.66, 0.47, 0.92, mix(tunic, BLACK, 0.25)); g.box(0.53, 0.66, 0.62, 0.92, mix(tunic, BLACK, 0.25));
      g.box(0.35, 0.9, 0.48, 0.95, deep); g.box(0.52, 0.9, 0.65, 0.95, deep);
      if (look.arms === 4) { g.seg([0.36, 0.5], [0.18, 0.4], 0.075, base); g.seg([0.64, 0.5], [0.82, 0.4], 0.075, base); }
      g.seg([0.35, 0.47], [0.24, 0.66], 0.085, base); g.seg([0.65, 0.47], [0.77, 0.66], 0.085, base);
      g.box(0.34, 0.42, 0.66, 0.7, tunic);
      g.box(0.34, 0.62, 0.66, 0.65, mix(tunic, BLACK, 0.4));
      if (look.armor === 'plate') { g.ell(0.33, 0.45, 0.07, 0.05, mix(STEEL, WHITE, 0.25)); g.ell(0.67, 0.45, 0.07, 0.05, mix(STEEL, WHITE, 0.25)); g.box(0.48, 0.44, 0.52, 0.6, mix(STEEL, BLACK, 0.3)); }
      break;
    case 'giant':
      g.box(0.34, 0.66, 0.46, 0.93, base); g.box(0.54, 0.66, 0.66, 0.93, base);
      g.box(0.32, 0.9, 0.48, 0.96, dark); g.box(0.52, 0.9, 0.68, 0.96, dark);
      if (look.arms === 4) { g.seg([0.3, 0.46], [0.1, 0.34], 0.1, base); g.seg([0.7, 0.46], [0.9, 0.34], 0.1, base); }
      g.seg([0.26, 0.42], [0.14, 0.7], 0.115, base); g.seg([0.74, 0.42], [0.87, 0.7], 0.115, base);
      g.ell(0.5, 0.5, 0.27, 0.2, look.armor ? tunic : base);
      if (!look.armor) g.ell(0.5, 0.56, 0.16, 0.1, light);
      g.box(0.34, 0.62, 0.66, 0.73, look.armor === 'plate' ? mix(STEEL, BLACK, 0.3) : hex('#6a4a2c'));
      break;
    case 'beast':
      g.box(0.44, 0.66, 0.5, 0.92, dark); g.box(0.66, 0.66, 0.72, 0.92, dark);
      g.ell(0.58, 0.58, 0.29, 0.17, base); g.ell(0.38, 0.56, 0.15, 0.17, base);
      g.ell(0.56, 0.66, 0.2, 0.07, light);
      g.box(0.31, 0.64, 0.38, 0.93, base); g.box(0.78, 0.62, 0.85, 0.93, base);
      g.box(0.29, 0.9, 0.39, 0.95, deep); g.box(0.76, 0.9, 0.86, 0.95, deep);
      if (look.armor) g.box(0.44, 0.44, 0.74, 0.6, tunic);
      break;
    case 'rodent':
      g.ell(0.58, 0.72, 0.3, 0.17, base); g.ell(0.6, 0.8, 0.2, 0.07, light);
      g.box(0.4, 0.86, 0.48, 0.92, hex('#d8a0a0')); g.box(0.7, 0.86, 0.78, 0.92, hex('#d8a0a0'));
      for (let i = 0; i < 5; i++) g.dot(0.46 + i * 0.08, 0.6 + (i % 2) * 0.03, dark);
      break;
    case 'insect':
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
        const knee: P = [0.5 + s * (0.25 + i * 0.02), 0.26 + i * 0.13], foot: P = [0.5 + s * (0.4 + (i % 2) * 0.05), 0.5 + i * 0.14];
        g.seg([0.5 + s * 0.08, 0.42 + i * 0.03], knee, 0.04, dark); g.seg(knee, foot, 0.035, dark);
      }
      g.ell(0.5, 0.67, 0.2, 0.21, base); g.ell(0.5, 0.42, 0.13, 0.11, base);
      g.ell(0.5, 0.66, 0.07, 0.1, light); g.ell(0.5, 0.74, 0.04, 0.05, mix(base, hex('#c0392b'), 0.7));
      break;
    case 'serpent':
      g.ell(0.52, 0.84, 0.36, 0.11, base); g.ell(0.52, 0.71, 0.27, 0.1, dark); g.ell(0.52, 0.71, 0.25, 0.085, base); g.ell(0.54, 0.59, 0.17, 0.085, base);
      for (let i = 0; i < 6; i++) g.dot(0.24 + i * 0.11, 0.86, light, 2);
      break;
    case 'dragon':
      g.box(0.44, 0.7, 0.52, 0.93, dark); g.box(0.66, 0.7, 0.74, 0.93, base);
      g.ell(0.57, 0.62, 0.26, 0.17, base); g.ell(0.55, 0.69, 0.19, 0.08, light);
      g.box(0.36, 0.7, 0.44, 0.93, base); g.box(0.33, 0.9, 0.46, 0.95, deep); g.box(0.64, 0.9, 0.77, 0.95, deep);
      for (let i = 0; i < 4; i++) g.tri([0.42 + i * 0.1, 0.47], [0.48 + i * 0.1, 0.47], [0.45 + i * 0.1, 0.4], dark);
      break;
    case 'bird':
      g.seg([0.44, 0.78], [0.42, 0.93], 0.035, hex('#d8a83a')); g.seg([0.56, 0.78], [0.58, 0.93], 0.035, hex('#d8a83a'));
      g.box(0.36, 0.92, 0.46, 0.95, hex('#d8a83a')); g.box(0.54, 0.92, 0.64, 0.95, hex('#d8a83a'));
      g.ell(0.5, 0.6, 0.2, 0.22, base); g.ell(0.5, 0.66, 0.12, 0.13, light);
      break;
    case 'ooze':
      g.ell(0.5, 0.8, 0.4, 0.34, base);
      for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) if (py > S * (0.97 - 0.04 * f)) g.set(px, py, BLACK, 0);
      g.ell(0.5, 0.86, 0.3, 0.08, dark); g.ell(0.34, 0.62, 0.08, 0.045, light); g.ell(0.3, 0.7, 0.03, 0.03, light);
      for (let i = 0; i < 5; i++) g.ell(0.26 + rnd() * 0.5, 0.62 + rnd() * 0.24, 0.025, 0.025, i % 2 ? light : dark);
      break;
    case 'elemental':
      g.seg([0.34, 0.56], [0.14, 0.44], 0.09, base); g.seg([0.66, 0.56], [0.86, 0.44], 0.09, base);
      g.ell(0.5, 0.82, 0.27, 0.14, base); g.ell(0.5, 0.63, 0.21, 0.18, base); g.ell(0.5, 0.42, 0.16, 0.16, base);
      g.tri([0.5, 0.06], [0.38, 0.36], [0.62, 0.36], base); g.tri([0.3, 0.3], [0.36, 0.52], [0.46, 0.4], base); g.tri([0.72, 0.26], [0.56, 0.4], [0.66, 0.52], base);
      g.ell(0.5, 0.68, 0.1, 0.16, light); g.ell(0.5, 0.48, 0.07, 0.08, light);
      break;
    case 'plant':
      g.seg([0.44, 0.9], [0.28, 0.95], 0.05, WOOD); g.seg([0.56, 0.9], [0.72, 0.95], 0.05, WOOD);
      g.seg([0.44, 0.56], [0.2, 0.44], 0.06, WOOD); g.seg([0.56, 0.56], [0.82, 0.5], 0.06, WOOD);
      g.box(0.41, 0.44, 0.59, 0.93, WOOD); g.box(0.46, 0.5, 0.49, 0.9, mix(WOOD, BLACK, 0.3));
      g.ell(0.18, 0.4, 0.09, 0.07, base); g.ell(0.84, 0.46, 0.09, 0.07, base);
      break;
    case 'aberration':
      for (let i = 0; i < 5; i++) { const x = 0.26 + i * 0.12, sway = (i % 2 ? 1 : -1) * 0.05; g.seg([x, 0.6], [x + sway, 0.78], 0.06, dark); g.seg([x + sway, 0.78], [x - sway, 0.94], 0.045, dark); }
      g.ell(0.5, 0.45, 0.27, 0.24, base); g.ell(0.42, 0.34, 0.1, 0.06, light);
      g.seg([0.34, 0.56], [0.66, 0.56], 0.03, deep);
      for (let i = 0; i < 5; i++) g.tri([0.36 + i * 0.06, 0.56], [0.4 + i * 0.06, 0.56], [0.38 + i * 0.06, 0.61], BONE);
      break;
    case 'construct':
      g.box(0.36, 0.68, 0.46, 0.93, dark); g.box(0.54, 0.68, 0.64, 0.93, dark);
      g.box(0.33, 0.9, 0.48, 0.96, deep); g.box(0.52, 0.9, 0.67, 0.96, deep);
      g.box(0.19, 0.4, 0.29, 0.72, base); g.box(0.71, 0.4, 0.81, 0.72, base);
      if (look.arms === 4) { g.box(0.12, 0.3, 0.2, 0.52, dark); g.box(0.8, 0.3, 0.88, 0.52, dark); }
      g.box(0.3, 0.38, 0.7, 0.7, base); g.box(0.3, 0.38, 0.7, 0.41, light); g.box(0.3, 0.66, 0.7, 0.7, dark);
      for (const [x, y] of [[0.34, 0.45], [0.66, 0.45], [0.34, 0.62], [0.66, 0.62]]) g.dot(x, y, deep);
      g.ell(0.5, 0.53, 0.05, 0.05, GLOW[look.eyes ?? 'blue']);
      break;
    case 'ghost':
      g.seg([0.34, 0.48], [0.16, 0.6], 0.075, base); g.seg([0.66, 0.48], [0.84, 0.6], 0.075, base);
      g.ell(0.5, 0.5, 0.21, 0.2, base);
      g.tri([0.29, 0.5], [0.71, 0.5], [0.6, 0.97], base); g.tri([0.29, 0.5], [0.5, 0.6], [0.36, 0.9], base);
      g.ell(0.5, 0.56, 0.1, 0.12, dark);
      break;
  }

  // --- necks and heads
  if (look.heads > 1) for (const h of heads) g.seg(sh.neck, h, sh.r * 0.95, base);
  const skull = look.mutation === 'skeletal';
  heads.forEach(([x, y]) => {
    const r = sh.r;
    // A dark rim keeps neighbouring heads apart.
    if (look.heads > 1 && body !== 'aberration' && body !== 'ooze' && body !== 'elemental') g.ell(x, y, r * 1.14, r * 1.14, deep);
    switch (body) {
      case 'beast':
        g.tri([x - r * 0.2, y - r * 0.6], [x + r * 0.5, y - r * 0.7], [x + r * 0.25, y - r * 1.6], base); g.tri([x + r * 0.3, y - r * 0.6], [x + r, y - r * 0.5], [x + r * 0.8, y - r * 1.5], dark);
        g.ell(x, y, r, r * 0.9, base); g.ell(x - r * 0.85, y + r * 0.3, r * 0.62, r * 0.42, base);
        g.dot(x - r * 1.35, y + r * 0.15, deep, 2); g.seg([x - r * 1.3, y + r * 0.55], [x - r * 0.5, y + r * 0.6], 0.02, deep);
        g.tri([x - r * 1.1, y + r * 0.6], [x - r * 0.9, y + r * 0.6], [x - r, y + r * 0.9], BONE);
        break;
      case 'rodent':
        g.ell(x + r * 0.45, y - r * 0.85, r * 0.5, r * 0.5, base); g.ell(x + r * 0.45, y - r * 0.85, r * 0.28, r * 0.28, hex('#d8a0a0'));
        g.ell(x, y, r, r * 0.85, base); g.tri([x - r * 0.6, y - r * 0.6], [x - r * 0.6, y + r * 0.7], [x - r * 1.7, y + r * 0.35], base);
        g.dot(x - r * 1.6, y + r * 0.3, hex('#d8a0a0'), 2);
        g.box(x - r * 1.25, y + r * 0.55, x - r * 1.05, y + r * 0.95, WHITE);
        break;
      case 'dragon':
        g.ell(x, y, r, r * 0.85, base); g.ell(x - r * 0.95, y + r * 0.25, r * 0.75, r * 0.45, base);
        g.dot(x - r * 1.5, y + r * 0.05, deep, 1); g.seg([x - r * 1.6, y + r * 0.5], [x - r * 0.4, y + r * 0.55], 0.02, deep);
        for (let i = 0; i < 3; i++) g.tri([x - r * (1.4 - i * 0.4), y + r * 0.55], [x - r * (1.2 - i * 0.4), y + r * 0.55], [x - r * (1.3 - i * 0.4), y + r * 0.85], BONE);
        break;
      case 'serpent':
        g.ell(x, y, r * 1.1, r * 0.8, base); g.ell(x - r * 0.9, y + r * 0.15, r * 0.6, r * 0.45, base);
        g.seg([x - r * 1.4, y + r * 0.3], [x - r * 2, y + r * 0.5], 0.02, hex('#c0392b'));
        break;
      case 'insect':
        g.ell(x, y, r, r * 0.9, base);
        g.seg([x - r * 0.5, y + r * 0.7], [x - r * 0.3, y + r * 1.5], 0.035, BONE); g.seg([x + r * 0.5, y + r * 0.7], [x + r * 0.3, y + r * 1.5], 0.035, BONE);
        break;
      case 'bird':
        g.ell(x, y, r, r, base); g.tri([x - r * 0.35, y + r * 0.2], [x + r * 0.35, y + r * 0.2], [x, y + r * 1.1], hex('#d8a83a'));
        break;
      case 'plant':
        g.ell(x, y, r * 1.7, r * 1.25, base); g.ell(x - r * 0.7, y - r * 0.4, r * 0.7, r * 0.5, light); g.ell(x + r * 0.9, y + r * 0.4, r * 0.6, r * 0.45, dark);
        break;
      case 'construct':
        g.box(x - r, y - r * 0.9, x + r, y + r * 0.9, base); g.box(x - r, y - r * 0.9, x + r, y - r * 0.6, light); g.box(x - r * 0.75, y - r * 0.15, x + r * 0.75, y + r * 0.2, deep);
        break;
      case 'ghost':
        g.ell(x, y, r, r * 1.05, base); g.ell(x, y + r * 0.1, r * 0.7, r * 0.75, deep);
        break;
      case 'aberration':
        // The body is the head: one great eye, and a stalk per extra head.
        break;
      case 'ooze': case 'elemental':
        break;
      default: {
        // humanoid and giant
        const skin = skull ? BONE : base;
        g.ell(x, y, r, r, skin);
        if (body === 'giant') { g.box(x - r * 0.75, y + r * 0.35, x + r * 0.75, y + r * 0.5, deep); g.tri([x - r * 0.5, y + r * 0.35], [x - r * 0.3, y + r * 0.35], [x - r * 0.4, y + r * 0.05], BONE); g.tri([x + r * 0.3, y + r * 0.35], [x + r * 0.5, y + r * 0.35], [x + r * 0.4, y + r * 0.05], BONE); }
        else if (!skull) g.box(x - r * 0.4, y + r * 0.45, x + r * 0.4, y + r * 0.52, deep);
        if (look.armor === 'plate' && body === 'humanoid') { g.box(x - r, y - r, x + r, y - r * 0.3, STEEL); g.ell(x, y - r * 0.4, r, r * 0.7, STEEL); g.box(x - r, y - r * 0.35, x + r, y - r * 0.2, mix(STEEL, BLACK, 0.35)); }
        else if (look.armor === 'leather' && body === 'humanoid') g.ell(x, y - r * 0.5, r * 1.05, r * 0.6, LEATHER);
      }
    }
    if (look.horns && body !== 'ooze' && body !== 'elemental' && body !== 'aberration') {
      const hr = body === 'plant' ? r * 1.3 : r;
      g.seg([x - hr * 0.6, y - hr * 0.6], [x - hr * 1.15, y - hr * 1.5], 0.045, BONE); g.seg([x + hr * 0.6, y - hr * 0.6], [x + hr * 1.15, y - hr * 1.5], 0.045, BONE);
      g.seg([x - hr * 1.15, y - hr * 1.5], [x - hr * 0.9, y - hr * 1.9], 0.03, BONE); g.seg([x + hr * 1.15, y - hr * 1.5], [x + hr * 0.9, y - hr * 1.9], 0.03, BONE);
    }
    if (body === 'aberration') return;
    if (body === 'insect') { for (const [ex, ey] of [[-0.5, -0.2], [0.5, -0.2], [-0.2, 0.25], [0.2, 0.25]]) eyes.push({ p: [x + r * ex, y + r * ey] }); }
    else if (sh.side) eyes.push({ p: [x - r * (body === 'rodent' ? 0.25 : 0.3), y - r * 0.2] });
    else { const ey = body === 'plant' ? y + r * 0.1 : y - r * 0.05; eyes.push({ p: [x - r * 0.42, ey] }, { p: [x + r * 0.42, ey] }); }
  });
  if (body === 'aberration') {
    g.ell(0.5, 0.42, 0.12, 0.1, WHITE);
    eyes.push({ p: [0.5, 0.42], big: true });
    for (let i = 0; i < look.heads * 2; i++) {
      const s = i % 2 ? 1 : -1, k = Math.floor(i / 2), tip: P = [0.5 + s * (0.16 + k * 0.1), 0.1 + k * 0.05];
      g.seg([0.5 + s * (0.1 + k * 0.06), 0.26], tip, 0.035, base); g.ell(tip[0], tip[1], 0.045, 0.045, WHITE);
      eyes.push({ p: tip });
    }
  }
  if (look.horns && (body === 'ooze' || body === 'elemental' || body === 'aberration')) for (const s of [-1, 1]) g.tri([0.5 + s * 0.14, 0.34], [0.5 + s * 0.24, 0.4], [0.5 + s * 0.3, 0.16], BONE);

  // --- weapon in hand
  if (look.weapon && sh.hand) {
    const [hx, hy] = sh.hand;
    const k = body === 'giant' ? 1.25 : 1;
    const top: P = [hx + 0.05 * k, hy - 0.46 * k], grip: P = [hx - 0.01, hy + 0.06];
    switch (look.weapon) {
      case 'club': g.seg(grip, [hx + 0.03, hy - 0.2 * k], 0.05, WOOD); g.seg([hx + 0.03, hy - 0.2 * k], top, 0.11 * k, mix(WOOD, WHITE, 0.12)); for (let i = 0; i < 3; i++) g.dot(hx + 0.02 + i * 0.02, hy - (0.26 + i * 0.07) * k, BONE); break;
      case 'sword': g.seg(grip, [hx + 0.01, hy - 0.05], 0.045, WOOD); g.seg([hx - 0.06, hy - 0.06], [hx + 0.09, hy - 0.08], 0.04, hex('#c9a24a')); g.seg([hx + 0.015, hy - 0.08], top, 0.05, hex('#d8dee6')); break;
      case 'axe': g.seg(grip, top, 0.04, WOOD); g.tri([top[0], top[1] + 0.02], [top[0] + 0.14 * k, top[1] - 0.02], [top[0] + 0.12 * k, top[1] + 0.2 * k], hex('#c0c8d2')); g.tri([top[0], top[1] + 0.02], [top[0], top[1] + 0.16 * k], [top[0] + 0.12 * k, top[1] + 0.2 * k], hex('#c0c8d2')); break;
      case 'spear': g.seg([hx - 0.02, hy + 0.2], top, 0.035, WOOD); g.tri([top[0] - 0.04, top[1] + 0.02], [top[0] + 0.05, top[1] + 0.03], [top[0] + 0.02, top[1] - 0.12], hex('#d8dee6')); break;
      case 'staff': g.seg([hx - 0.02, hy + 0.24], top, 0.04, WOOD); g.ell(top[0], top[1] - 0.03, 0.05, 0.05, GLOW[look.eyes ?? 'blue']); break;
      case 'bow': for (let i = 0; i < 8; i++) { const t0 = (i / 8 - 0.5) * 2, t1 = ((i + 1) / 8 - 0.5) * 2; g.seg([hx + 0.1 - t0 * t0 * 0.09, hy - 0.14 + t0 * 0.3], [hx + 0.1 - t1 * t1 * 0.09, hy - 0.14 + t1 * 0.3], 0.035, WOOD); } g.seg([hx + 0.01, hy - 0.44], [hx + 0.01, hy + 0.16], 0.015, BONE); break;
    }
  }

  // --- light from above, shadow below
  const d0 = g.d.slice();
  const filled = (px: number, py: number) => px >= 0 && py >= 0 && px < S && py < S && d0[(py * S + px) * 4 + 3] > 0;
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    if (!filled(px, py)) continue;
    const i = (py * S + px) * 4;
    const k = !filled(px, py - 1) ? 1.16 : !filled(px, py + 1) || !filled(px + 1, py) ? 0.76 : 1;
    if (k !== 1) for (let c = 0; c < 3; c++) g.d[i + c] = Math.min(255, d0[i + c] * k);
  }

  // --- mutation
  if (look.mutation) {
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const i = (py * S + px) * 4;
      if (!g.d[i + 3]) continue;
      const c: RGB = [g.d[i], g.d[i + 1], g.d[i + 2]];
      const lum = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
      let out = c, a = 255;
      switch (look.mutation) {
        case 'spectral': out = mix(c, hex('#bfe4ff'), 0.6); a = Math.round(215 * Math.max(0.15, Math.min(1, (0.99 - py / S) / 0.32))); break;
        case 'shadowy': out = mix(c, hex('#140f1e'), 0.72); break;
        case 'crystal': out = (px + py) % Math.max(5, Math.round(S / 5)) === 0 ? mix(c, WHITE, 0.75) : mix(c, hex('#8fe4ff'), 0.4); a = 235; break;
        case 'rotting': out = mix(c, hex('#6b7a4a'), 0.3); break;
        case 'skeletal': if (body !== 'humanoid' && body !== 'giant') out = mix(mix(BLACK, BONE, 0.35 + lum * 0.65), c, 0.12); break;
      }
      g.set(px, py, out, a);
    }
    if (look.mutation === 'rotting') {
      for (let n = 0; n < Math.round(S * 0.45); n++) {
        const px = Math.floor(rnd() * S), py = Math.floor(rnd() * S);
        if (!g.alpha(px, py)) continue;
        const c = rnd() < 0.5 ? hex('#4a5a2c') : rnd() < 0.6 ? hex('#6b3a34') : BONE;
        const s = S > 32 ? 2 : 1;
        for (let j = 0; j < s; j++) for (let i = 0; i < s + (rnd() < 0.5 ? 1 : 0); i++) if (g.alpha(px + i, py + j)) g.set(px + i, py + j, c);
      }
    }
    if (look.mutation === 'skeletal' && (body === 'humanoid' || body === 'giant')) {
      // Bare ribs and limbs: bone over a dark hollow.
      const wide = body === 'giant' ? 0.2 : 0.14;
      g.box(0.5 - wide, 0.42, 0.5 + wide, 0.62, hex('#2a2430'));
      g.box(0.485, 0.4, 0.515, 0.66, BONE);
      for (let i = 0; i < 4; i++) g.box(0.5 - wide + 0.01, 0.435 + i * 0.05, 0.5 + wide - 0.01, 0.455 + i * 0.05, BONE);
    }
  }

  // --- eyes
  for (const e of eyes) {
    const glow = look.eyes ? GLOW[look.eyes] : null;
    const size = e.big ? 4 : sh.r >= 0.12 ? 2 : 1;
    if (e.big) { g.ell(e.p[0], e.p[1], 0.06, 0.06, glow ?? hex('#7a2a2a')); g.dot(e.p[0], e.p[1], OUTLINE, 2); continue; }
    if (glow) { g.dot(e.p[0], e.p[1], glow, size + (look.body === 'ooze' ? 1 : 0)); if (size > 1) g.dot(e.p[0] - 0.01, e.p[1] - 0.01, mix(glow, WHITE, 0.7), 1); }
    else if (skull || look.body === 'ghost') g.dot(e.p[0], e.p[1], OUTLINE, size);
    else { g.dot(e.p[0], e.p[1], look.body === 'ooze' || look.body === 'elemental' ? WHITE : OUTLINE, size); }
  }

  // --- outline, then the aura outside it
  const d1 = g.d.slice();
  const solid = (px: number, py: number) => px >= 0 && py >= 0 && px < S && py < S && d1[(py * S + px) * 4 + 3] > 0;
  const edge: number[] = [];
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    if (solid(px, py)) continue;
    if (solid(px - 1, py) || solid(px + 1, py) || solid(px, py - 1) || solid(px, py + 1)) { g.set(px, py, look.mutation === 'spectral' ? hex('#5a7a9a') : OUTLINE, look.mutation === 'spectral' ? 170 : 255); edge.push(py * S + px); }
  }
  if (look.aura) {
    const [inner, outer] = AURA[look.aura];
    let ring = edge;
    const rings = S > 32 ? 4 : 3;
    for (let n = 0; n < rings; n++) {
      const next: number[] = [];
      for (const at of ring) {
        const px = at % S, py = Math.floor(at / S);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = px + dx, y = py + dy - (look.aura === 'fire' && n > 0 && rnd() < 0.5 ? 1 : 0);
          if (x < 0 || y < 0 || x >= S || y >= S || g.alpha(x, y)) continue;
          if (n > 0 && rnd() < 0.18 * n) continue;
          g.set(x, y, n === 0 ? inner : mix(inner, outer, n / rings), Math.round(230 - n * (170 / rings)));
          next.push(y * S + x);
        }
      }
      ring = next;
    }
  }
  return { S, data: g.d };
}

const canvases = new Map<string, HTMLCanvasElement>();

/** The drawn token for a look. Square, TOKEN_PX pixels per map square the creature occupies. */
export function monsterCanvas(look: MonsterLook): HTMLCanvasElement {
  const k = lookKey(look);
  let c = canvases.get(k);
  if (!c) {
    const { S, data } = draw(look);
    c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    img.data.set(data);
    ctx.putImageData(img, 0, 0);
    canvases.set(k, c);
  }
  return c;
}

const urls = new Map<string, string>();
/** The token as a data URL, for hover cards. */
export function monsterUrl(look: MonsterLook): string {
  const k = lookKey(look);
  let u = urls.get(k);
  if (!u) { u = monsterCanvas(look).toDataURL(); urls.set(k, u); }
  return u;
}
