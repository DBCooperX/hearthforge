// Monster tokens, drawn from a look: a body shape scaled to the creature's size,
// with heads, horns, wings, armour, a weapon, an aura and a mutation layered on.
// Original generated art, CC0 like the rest. Tokens are drawn at 32 pixels per
// map square so that a third head or a pair of horns stays readable.

import { SIZE_TILES, lookKey, type Body, type Color, type MonsterLook } from '../../../shared/monsterLook';
import { INK, Ink, fitCrop, framed, hex, mix, seeded as mulberry, type P, type RGB } from './ink';

/** Pixels per map square in the drawn tokens: enough for crisp ink lines on a zoomed-in map. */
export const TOKEN_PX = 128;

export { hex, mix, type P, type RGB } from './ink';
const BLACK: RGB = [0, 0, 0], WHITE: RGB = [255, 255, 255];
const OUTLINE = INK;

// Muted, earthy pigments: an old bestiary rather than a toy box.
const PALETTE: Record<Color, RGB> = {
  red: hex('#9a3c32'), orange: hex('#a8652c'), yellow: hex('#b09a48'), green: hex('#5f7f45'), teal: hex('#4f7a70'), blue: hex('#46628f'), purple: hex('#664b85'),
  pink: hex('#a8707f'), brown: hex('#6e4e34'), tan: hex('#a8865e'), grey: hex('#7c7a7c'), black: hex('#3a3538'), white: hex('#c8c4b8'), bone: hex('#d2c8ac'),
};
const GLOW: Record<Color, RGB> = {
  red: hex('#ff4a3a'), orange: hex('#ff9a2e'), yellow: hex('#ffe14d'), green: hex('#7dff5a'), teal: hex('#5affd8'), blue: hex('#6ab8ff'), purple: hex('#c07aff'),
  pink: hex('#ff8ac8'), brown: hex('#c98a4a'), tan: hex('#f0c890'), grey: hex('#d0d0d8'), black: hex('#17121c'), white: hex('#ffffff'), bone: hex('#fff4d0'),
};
const AURA: Record<NonNullable<MonsterLook['aura']>, [RGB, RGB]> = {
  fire: [hex('#ff8a1e'), hex('#ffd24a')], frost: [hex('#8fd8ff'), hex('#e6f8ff')], poison: [hex('#6fd24a'), hex('#c8f08a')],
  shadow: [hex('#3a2466'), hex('#6a4aa8')], holy: [hex('#ffe9a0'), hex('#fffbe6')], lightning: [hex('#fff07a'), hex('#9ad0ff')],
};
const STEEL = hex('#8e959c'), LEATHER = hex('#6a4e34'), WOOD = hex('#5e4228'), CLOTH = hex('#4e4236'), BONE = hex('#d8ceb2');

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
  humanoid: { head: [0.5, 0.25], r: 0.105, neck: [0.5, 0.44], wing: [0.5, 0.48], hand: [0.77, 0.66], tail: [[0.56, 0.68], [0.8, 0.84], [0.9, 0.74]] },
  giant: { head: [0.5, 0.19], r: 0.09, neck: [0.5, 0.36], wing: [0.5, 0.44], hand: [0.87, 0.7], tail: [[0.6, 0.66], [0.84, 0.86], [0.94, 0.76]] },
  beast: { head: [0.2, 0.42], r: 0.11, side: true, neck: [0.36, 0.52], wing: [0.56, 0.48], tail: [[0.84, 0.54], [0.93, 0.44], [0.96, 0.3]] },
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

function draw(look: MonsterLook): HTMLCanvasElement {
  const S = TOKEN_PX * SIZE_TILES[look.size];
  const f = look.size === 'tiny' ? 0.55 : look.size === 'small' ? 0.78 : 1;
  const g = new Ink(S, f);
  const rnd = mulberry([...lookKey(look)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) | 0, 7));
  const base = PALETTE[look.color], dark = mix(base, BLACK, 0.35), light = mix(base, WHITE, 0.3), deep = mix(base, BLACK, 0.55);
  const sh = SHAPES[look.body];
  const body = look.body;
  const eyes: { p: P; big?: boolean; brow?: number }[] = [];

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
      // Legs tapering to boots, a torso narrowing to the waist, arms bent at the elbow.
      for (const sd of [-1, 1]) {
        g.poly([[0.5 + sd * 0.01, 0.64], [0.5 + sd * 0.13, 0.64], [0.5 + sd * 0.11, 0.8], [0.5 + sd * 0.1, 0.9], [0.5 + sd * 0.035, 0.9], [0.5 + sd * 0.03, 0.8]], mix(tunic, BLACK, 0.25));
        g.poly([[0.5 + sd * 0.025, 0.86], [0.5 + sd * 0.11, 0.86], [0.5 + sd * (sd < 0 ? 0.14 : 0.13), 0.955], [0.5 + sd * 0.02, 0.955]], deep);
      }
      if (look.arms === 4) for (const sd of [-1, 1]) { g.seg([0.5 + sd * 0.14, 0.5], [0.5 + sd * 0.27, 0.42], 0.06, base); g.seg([0.5 + sd * 0.27, 0.42], [0.5 + sd * 0.32, 0.32], 0.05, base); }
      g.seg([0.36, 0.44], [0.29, 0.56], 0.07, base); g.seg([0.29, 0.56], [0.25, 0.67], 0.06, base);
      g.seg([0.64, 0.44], [0.72, 0.55], 0.07, base); g.seg([0.72, 0.55], [0.77, 0.66], 0.06, base);
      g.ell(0.25, 0.68, 0.035, 0.035, base); g.ell(0.77, 0.67, 0.035, 0.035, base);
      g.poly([[0.33, 0.4], [0.67, 0.4], [0.62, 0.66], [0.38, 0.66]], tunic);
      g.box(0.37, 0.61, 0.63, 0.66, mix(tunic, BLACK, 0.45));
      if (look.armor === 'plate') { g.ell(0.34, 0.43, 0.07, 0.05, mix(STEEL, WHITE, 0.15)); g.ell(0.66, 0.43, 0.07, 0.05, STEEL); g.hair([0.5, 0.42], [0.5, 0.6], mix(STEEL, BLACK, 0.4)); }
      else if (look.armor === 'leather') for (const y of [0.48, 0.54]) g.hair([0.36, y], [0.64, y + 0.01], mix(tunic, BLACK, 0.4), 0.7);
      else g.poly([[0.42, 0.4], [0.58, 0.4], [0.5, 0.47]], mix(base, BLACK, 0.1)); // bare throat in a ragged collar
      break;
    case 'giant':
      for (const sd of [-1, 1]) {
        g.poly([[0.5 + sd * 0.02, 0.64], [0.5 + sd * 0.17, 0.64], [0.5 + sd * 0.155, 0.8], [0.5 + sd * 0.14, 0.91], [0.5 + sd * 0.05, 0.91], [0.5 + sd * 0.04, 0.8]], base);
        g.poly([[0.5 + sd * 0.03, 0.89], [0.5 + sd * 0.15, 0.89], [0.5 + sd * 0.18, 0.96], [0.5 + sd * 0.02, 0.96]], dark);
      }
      if (look.arms === 4) for (const sd of [-1, 1]) { g.seg([0.5 + sd * 0.2, 0.44], [0.5 + sd * 0.36, 0.36], 0.09, base); g.seg([0.5 + sd * 0.36, 0.36], [0.5 + sd * 0.42, 0.24], 0.075, base); }
      for (const sd of [-1, 1]) { g.seg([0.5 + sd * 0.23, 0.36], [0.5 + sd * 0.33, 0.53], 0.11, base); g.seg([0.5 + sd * 0.33, 0.53], [0.5 + sd * 0.37, 0.7], 0.095, base); g.ell(0.5 + sd * 0.37, 0.72, 0.055, 0.05, base); }
      g.poly([[0.27, 0.33], [0.73, 0.33], [0.7, 0.5], [0.64, 0.68], [0.36, 0.68], [0.3, 0.5]], look.armor ? tunic : base);
      if (!look.armor) { g.ell(0.5, 0.56, 0.15, 0.1, light, false); g.hair([0.5, 0.36], [0.5, 0.48], dark, 0.8); g.hair([0.37, 0.43], [0.47, 0.45], dark, 0.8); g.hair([0.63, 0.43], [0.53, 0.45], dark, 0.8); }
      g.poly([[0.34, 0.62], [0.66, 0.62], [0.68, 0.76], [0.56, 0.74], [0.5, 0.78], [0.44, 0.74], [0.32, 0.76]], look.armor === 'plate' ? mix(STEEL, BLACK, 0.3) : hex('#5a4028'));
      g.box(0.34, 0.6, 0.66, 0.64, mix(LEATHER, BLACK, 0.4));
      break;
    case 'beast':
      // Four legs bending at the knee and hock, a deep chest, a lean flank.
      for (const [hx, far] of [[0.36, true], [0.72, true], [0.32, false], [0.76, false]] as [number, boolean][]) {
        const c = far ? dark : base, back = hx > 0.5;
        const knee: P = [hx + (back ? 0.05 : 0.01), 0.74], foot: P = [hx + (back ? -0.01 : 0.02), 0.93];
        g.seg([hx, 0.6], knee, back ? 0.1 : 0.08, c); g.seg(knee, foot, 0.055, c);
        g.ell(foot[0] - 0.02, 0.935, 0.045, 0.022, far ? deep : dark);
      }
      g.ell(0.58, 0.58, 0.27, 0.15, base); g.ell(0.38, 0.55, 0.15, 0.17, base, false); g.ell(0.74, 0.56, 0.13, 0.13, base, false);
      g.ell(0.52, 0.67, 0.18, 0.06, light, false);
      for (let i = 0; i < 6; i++) g.hair([0.4 + i * 0.07, 0.47 + (i % 2) * 0.01], [0.43 + i * 0.07, 0.53], dark, 0.7); // fur
      if (look.armor) g.poly([[0.44, 0.44], [0.74, 0.46], [0.72, 0.6], [0.46, 0.6]], tunic);
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
      for (const [hx, far] of [[0.4, true], [0.7, true], [0.36, false], [0.74, false]] as [number, boolean][]) {
        const c = far ? dark : base, back = hx > 0.5;
        const knee: P = [hx + (back ? 0.06 : 0.0), 0.77], foot: P = [hx + (back ? -0.01 : 0.02), 0.93];
        g.seg([hx, 0.62], knee, back ? 0.11 : 0.085, c); g.seg(knee, foot, 0.06, c);
        for (let i = -1; i <= 1; i++) g.tri([foot[0] - 0.04 + i * 0.02, 0.92], [foot[0] - 0.02 + i * 0.02, 0.92], [foot[0] - 0.06 + i * 0.025, 0.96], BONE);
      }
      g.ell(0.57, 0.62, 0.25, 0.16, base); g.ell(0.4, 0.6, 0.12, 0.13, base, false);
      g.poly([[0.38, 0.68], [0.7, 0.7], [0.62, 0.76], [0.42, 0.75]], light, false);
      for (let i = 0; i < 5; i++) g.hair([0.4 + i * 0.065, 0.7], [0.41 + i * 0.065, 0.755], mix(light, BLACK, 0.3), 0.6); // belly plates
      for (let i = 0; i < 4; i++) g.tri([0.42 + i * 0.1, 0.48], [0.48 + i * 0.1, 0.48], [0.45 + i * 0.1, 0.4], dark);
      g.seg([0.42, 0.56], [0.27, 0.36], 0.11, base, false); // the neck
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
        // A long muzzle facing left, ears laid back, a heavy brow and bared teeth.
        g.tri([x - r * 0.1, y - r * 0.6], [x + r * 0.55, y - r * 0.55], [x + r * 0.5, y - r * 1.45], base); g.tri([x + r * 0.35, y - r * 0.5], [x + r, y - r * 0.4], [x + r * 0.95, y - r * 1.3], dark);
        g.ell(x, y, r, r * 0.88, base);
        g.poly([[x - r * 0.2, y - r * 0.5], [x - r * 1.4, y - r * 0.05], [x - r * 1.65, y + r * 0.25], [x - r * 1.5, y + r * 0.5], [x - r * 0.2, y + r * 0.62]], base);
        g.poly([[x - r * 0.3, y + r * 0.55], [x - r * 1.35, y + r * 0.5], [x - r * 1.25, y + r * 0.78], [x - r * 0.25, y + r * 0.9]], dark); // lower jaw
        for (let i = 0; i < 3; i++) g.tri([x - r * (1.3 - i * 0.3), y + r * 0.5], [x - r * (1.15 - i * 0.3), y + r * 0.5], [x - r * (1.22 - i * 0.3), y + r * 0.72], BONE, false);
        g.ell(x - r * 1.58, y + r * 0.18, r * 0.16, r * 0.13, deep);
        g.hair([x - r * 0.9, y - r * 0.1], [x - r * 0.35, y + r * 0.1], dark, 0.8); // the line of the cheek
        break;
      case 'rodent':
        g.ell(x + r * 0.45, y - r * 0.85, r * 0.5, r * 0.5, base); g.ell(x + r * 0.45, y - r * 0.85, r * 0.28, r * 0.28, hex('#d8a0a0'));
        g.ell(x, y, r, r * 0.85, base); g.tri([x - r * 0.6, y - r * 0.6], [x - r * 0.6, y + r * 0.7], [x - r * 1.7, y + r * 0.35], base);
        g.dot(x - r * 1.6, y + r * 0.3, hex('#d8a0a0'), 2);
        g.box(x - r * 1.25, y + r * 0.55, x - r * 1.05, y + r * 0.95, WHITE);
        break;
      case 'dragon':
        // A wedge of a head: a long snout, a horned brow, a jaw full of teeth and a frill behind.
        for (let i = 0; i < 3; i++) g.tri([x + r * (0.3 + i * 0.25), y - r * 0.5], [x + r * (0.6 + i * 0.25), y - r * 0.3], [x + r * (0.75 + i * 0.3), y - r * (1.1 - i * 0.15)], dark);
        g.ell(x, y, r, r * 0.82, base);
        g.poly([[x - r * 0.3, y - r * 0.55], [x - r * 1.75, y + r * 0.0], [x - r * 1.85, y + r * 0.3], [x - r * 0.3, y + r * 0.45]], base);
        g.poly([[x - r * 0.25, y + r * 0.42], [x - r * 1.6, y + r * 0.42], [x - r * 1.5, y + r * 0.68], [x - r * 0.2, y + r * 0.85]], dark);
        for (let i = 0; i < 4; i++) g.tri([x - r * (1.55 - i * 0.3), y + r * 0.4], [x - r * (1.4 - i * 0.3), y + r * 0.4], [x - r * (1.47 - i * 0.3), y + r * 0.62], BONE, false);
        g.ell(x - r * 1.65, y + r * 0.05, r * 0.09, r * 0.06, deep);
        g.hair([x - r * 0.15, y - r * 0.52], [x - r * 0.75, y - r * 0.32], deep, 1.2); // brow ridge
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
        // humanoid and giant: an oval skull, a square jaw, a heavy brow
        const skin = skull ? BONE : base;
        g.ell(x, y - r * 0.05, r * 0.92, r * 1.0, skin);
        g.poly([[x - r * 0.82, y + r * 0.1], [x + r * 0.82, y + r * 0.1], [x + r * (body === 'giant' ? 0.75 : 0.55), y + r * 0.9], [x, y + r * 1.05], [x - r * (body === 'giant' ? 0.75 : 0.55), y + r * 0.9]], skin);
        g.soft(x, y - r * 0.05, r * 0.75, r * 0.22, mix(skin, BLACK, 0.6), 0.45); // shadow under the brow
        if (skull) { g.flat(x, y + r * 0.45, r * 0.12, r * 0.12, deep); for (let i = -2; i <= 2; i++) g.hair([x + i * r * 0.14, y + r * 0.68], [x + i * r * 0.14, y + r * 0.86], deep, 0.7); }
        else if (body === 'giant') { g.hair([x - r * 0.5, y + r * 0.62], [x + r * 0.5, y + r * 0.62], deep, 1.2); g.tri([x - r * 0.45, y + r * 0.66], [x - r * 0.25, y + r * 0.66], [x - r * 0.38, y + r * 0.32], BONE); g.tri([x + r * 0.25, y + r * 0.66], [x + r * 0.45, y + r * 0.66], [x + r * 0.38, y + r * 0.32], BONE); g.ell(x, y + r * 0.32, r * 0.18, r * 0.12, mix(skin, BLACK, 0.2), false); }
        else { g.hair([x - r * 0.32, y + r * 0.6], [x + r * 0.32, y + r * 0.56], deep, 0.9); g.hair([x, y + r * 0.05], [x + r * 0.08, y + r * 0.35], mix(skin, BLACK, 0.4), 0.7); }
        if (look.armor === 'plate' && body === 'humanoid') {
          g.poly([[x - r * 1.0, y + r * 0.35], [x - r * 1.02, y - r * 0.5], [x - r * 0.5, y - r * 1.08], [x + r * 0.5, y - r * 1.08], [x + r * 1.02, y - r * 0.5], [x + r * 1.0, y + r * 0.35], [x + r * 0.7, y + r * 0.35], [x + r * 0.7, y - r * 0.05], [x - r * 0.7, y - r * 0.05], [x - r * 0.7, y + r * 0.35]], STEEL);
          g.hair([x, y - r * 1.05], [x, y - r * 0.1], mix(STEEL, BLACK, 0.4), 0.9);
        } else if (look.armor === 'leather' && body === 'humanoid') g.poly([[x - r * 0.98, y - r * 0.1], [x - r * 0.9, y - r * 0.7], [x - r * 0.3, y - r * 1.08], [x + r * 0.4, y - r * 1.05], [x + r * 0.95, y - r * 0.6], [x + r * 0.98, y - r * 0.1], [x + r * 0.6, y - r * 0.4], [x - r * 0.6, y - r * 0.4]], LEATHER);
      }
    }
    if (look.horns && body !== 'ooze' && body !== 'elemental' && body !== 'aberration') {
      const hr = body === 'plant' ? r * 1.3 : r;
      for (const sd of [-1, 1]) {
        g.tri([x + sd * hr * 0.45, y - hr * 0.55], [x + sd * hr * 0.85, y - hr * 0.45], [x + sd * hr * 1.25, y - hr * 1.35], mix(BONE, BLACK, 0.15));
        g.tri([x + sd * hr * 0.98, y - hr * 1.0], [x + sd * hr * 1.25, y - hr * 1.35], [x + sd * hr * 0.95, y - hr * 1.95], mix(BONE, BLACK, 0.05));
      }
    }
    if (body === 'aberration') return;
    if (body === 'insect') { for (const [ex, ey] of [[-0.5, -0.2], [0.5, -0.2], [-0.2, 0.25], [0.2, 0.25]]) eyes.push({ p: [x + r * ex, y + r * ey] }); }
    else if (sh.side) eyes.push({ p: [x - r * (body === 'rodent' ? 0.25 : 0.3), y - r * 0.2], brow: body === 'rodent' ? 0 : 2 });
    else { const ey = body === 'plant' ? y + r * 0.1 : y + r * 0.05; const angry = body === 'humanoid' || body === 'giant' ? 1 : 0; eyes.push({ p: [x - r * 0.38, ey], brow: -angry }, { p: [x + r * 0.38, ey], brow: angry }); }
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
      case 'bow': g.seg([hx + 0.01, hy - 0.44], [hx + 0.01, hy + 0.16], 0.012, BONE, false); g.curve(Array.from({ length: 9 }, (_, i) => { const t = (i / 8 - 0.5) * 2; return [hx + 0.1 - t * t * 0.09, hy - 0.14 + t * 0.3] as P; }), 0.035, WOOD); break;
    }
  }

  // --- the engraving pass: muted colour, hatching, rim light
  const seed = [...lookKey(look)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) | 0, 11);
  g.engrave(seed, { mute: look.mutation === 'crystal' ? 0.1 : 0.2 });

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
      for (let n = 0; n < Math.round((S / g.px) * 0.45); n++) {
        const px = Math.floor(rnd() * S), py = Math.floor(rnd() * S);
        if (!g.alpha(px, py)) continue;
        const c = rnd() < 0.5 ? hex('#4a5a2c') : rnd() < 0.6 ? hex('#6b3a34') : BONE;
        const s = Math.max(2, Math.round(g.px * (S > TOKEN_PX ? 1.6 : 1.2)));
        for (let j = 0; j < s; j++) for (let i = 0; i < s + (rnd() < 0.5 ? 1 : 0); i++) if (g.alpha(px + i, py + j)) g.set(px + i, py + j, mix(c, [g.d[((py + j) * S + px + i) * 4], g.d[((py + j) * S + px + i) * 4 + 1], g.d[((py + j) * S + px + i) * 4 + 2]], 0.25));
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
    // A brow slanting down towards the nose: the look of something that means harm.
    if (e.brow) {
      const w = sh.r * 0.42, [x, y] = e.p;
      if (e.brow === 2) g.hair([x - w * 0.6, y - w * 0.75], [x + w * 0.7, y - w * 0.35], OUTLINE, 1.1);
      else g.hair([x - e.brow * w * 0.6, y - w * 0.45], [x + e.brow * w * 0.6, y - w * 0.95], OUTLINE, 1.1);
    }
    const glow = look.eyes ? GLOW[look.eyes] : null;
    const size = e.big ? 4 : sh.r >= 0.12 ? 2 : 1.4;
    if (e.big) { g.ell(e.p[0], e.p[1], 0.06, 0.06, glow ?? hex('#7a2a2a')); g.dot(e.p[0], e.p[1], OUTLINE, 2); if (glow) g.glow(e.p[0], e.p[1], glow, 2); continue; }
    if (glow) g.glow(e.p[0], e.p[1], glow, size + (look.body === 'ooze' ? 1 : 0));
    else if (skull || look.body === 'ghost') g.dot(e.p[0], e.p[1], OUTLINE, size);
    else if (look.body === 'ooze' || look.body === 'elemental') g.dot(e.p[0], e.p[1], hex('#f0e8d8'), size);
    else { g.dot(e.p[0], e.p[1], OUTLINE, size); if (size > 1) g.dot(e.p[0] - 0.006, e.p[1] - 0.008, hex('#d8d0c0'), 0.6); }
  }

  // --- the heavy outer line, then the aura outside it
  if (look.mutation === 'spectral') g.outline(hex('#5a7a9a'), 170);
  else g.outline(OUTLINE, 255, S > TOKEN_PX ? 1.5 : 1);
  if (look.aura) {
    const [inner, outer] = AURA[look.aura];
    g.aura(inner, outer, look.aura === 'fire', seed);
  }
  return g.canvas();
}

const figures = new Map<string, HTMLCanvasElement>();
/** The creature alone, on a transparent background. */
export function monsterFigure(look: MonsterLook): HTMLCanvasElement {
  const k = lookKey(look);
  let c = figures.get(k);
  if (!c) { c = draw(look); figures.set(k, c); }
  return c;
}

const canvases = new Map<string, HTMLCanvasElement>();

/** The token for a look: the creature in a round iron frame. Square, TOKEN_PX pixels per map square the creature occupies. */
export function monsterCanvas(look: MonsterLook): HTMLCanvasElement {
  const k = lookKey(look);
  let c = canvases.get(k);
  if (!c) {
    const fig = monsterFigure(look);
    c = framed(fig, fig.width, 'monster', fitCrop(fig, 0.1, 0.32), SIZE_TILES[look.size]);
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
