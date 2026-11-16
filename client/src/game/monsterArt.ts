// Monster tokens, drawn from a look: a body shape scaled to the creature's size,
// with heads, horns, wings, armour, a weapon, an aura and a mutation layered on.
// Original generated art, CC0 like the rest, drawn in ink with curved outlines,
// materials (fur, scales, metal) and a small per-creature variation.

import { SIZE_TILES, lookKey, type Body, type Color, type MonsterLook } from '../../../shared/monsterLook';
import { INK, Ink, fitCrop, framed, hex, mix, seeded as mulberry, type Material, type P, type RGB } from './ink';

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

function draw(look: MonsterLook, variant: number): HTMLCanvasElement {
  const S = TOKEN_PX * SIZE_TILES[look.size];
  const f = look.size === 'tiny' ? 0.55 : look.size === 'small' ? 0.78 : 1;
  const g = new Ink(S, f);
  const rnd = mulberry([...lookKey(look)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) | 0, 7));
  const base0 = PALETTE[look.color]; const tone0 = [0, 0.5, -0.5, 0.25][variant & 3];
  const base = tone0 > 0 ? mix(base0, WHITE, tone0 * 0.3) : mix(base0, BLACK, -tone0 * 0.4), dark = mix(base, BLACK, 0.35), light = mix(base, WHITE, 0.3), deep = mix(base, BLACK, 0.55);
  const sh = SHAPES[look.body];
  const body = look.body;
  const eyes: { p: P; big?: boolean; brow?: number }[] = [];
  // Two goblins in one fight should not be twins: the variant shifts bulk, tone, horns, jaw and a scar.
  const vr = mulberry(variant * 7919 + 13);
  const v = variant ? { bulk: [1, 0.9, 1.12, 1.04][variant & 3], horn: 0.8 + vr() * 0.45, jaw: 0.88 + vr() * 0.26, wing: 0.92 + vr() * 0.12, scar: variant & 1 ? 1 : 0, strap: variant === 2 } : { bulk: 1, horn: 1, jaw: 1, wing: 1, scar: 0, strap: false };
  const bodyMat: Material = body === 'beast' || body === 'rodent' ? 'fur' : body === 'dragon' || body === 'serpent' ? 'scales' : body === 'construct' ? 'metal' : body === 'plant' ? 'wood' : look.mutation === 'skeletal' ? 'bone' : 'plain';
  // Ready to strike: a melee weapon is lifted over the shoulder, everything else is held at the side.
  const raised = !!look.weapon && (look.weapon === 'club' || look.weapon === 'sword' || look.weapon === 'axe');
  const hand: P = body === 'humanoid' ? (raised ? [0.78, 0.38] : sh.hand!) : body === 'giant' ? (raised ? [0.84, 0.32] : sh.hand!) : sh.hand ?? [0.5, 0.5];

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
      const span = (body === 'dragon' ? 0.36 : 0.44) * v.wing, tip: P = [wx + s * span, wy - (body === 'dragon' ? 0.34 : 0.38) * v.wing], low: P = [wx + s * span * 0.96, wy + 0.1], elbow: P = [wx + s * span * 0.5, wy - 0.3 * v.wing];
      if (wings === 'bat') {
        // A membrane scalloped between the finger bones.
        g.mat = 'leather';
        g.blob([[wx, wy - 0.07], elbow, tip, [wx + s * span * 0.8, wy - 0.12], low, [wx + s * span * 0.62, wy + 0.04], [wx + s * 0.18, wy + 0.16], [wx + s * 0.06, wy + 0.06]], c, true, 0.55);
        g.mat = 'bone';
        g.limb([[wx, wy - 0.05], elbow, tip], [0.035, 0.028, 0.008], deep);
        g.limb([elbow, [wx + s * span * 0.8, wy - 0.12]], [0.02, 0.008], deep);
        g.limb([elbow, low], [0.02, 0.008], deep);
      } else {
        g.mat = 'hair';
        g.blob([[wx, wy - 0.07], elbow, tip, [wx + s * span * 0.98, wy - 0.18], low, [wx + s * span * 0.6, wy + 0.13], [wx + s * 0.16, wy + 0.16]], c, true, 0.7);
        for (let i = 0; i < 5; i++) g.fineCurve([[wx + s * (0.12 + i * 0.07), wy - 0.14 - i * 0.04], [wx + s * (0.15 + i * 0.075), wy + 0.0 - i * 0.02], [wx + s * (0.17 + i * 0.075), wy + 0.12 - i * 0.02]], 0.006, mix(c, BLACK, 0.4), 0.7);
      }
    }
  }
  if ((look.tail || body === 'rodent' || body === 'dragon') && sh.tail) {
    const c = body === 'rodent' ? hex('#c89a90') : base;
    const w = body === 'dragon' || body === 'serpent' ? 0.1 : body === 'rodent' ? 0.035 : 0.06;
    const [t0, t1, t2] = sh.tail;
    g.mat = body === 'rodent' ? 'plain' : bodyMat;
    g.limb([t0, [(t0[0] + t1[0]) / 2, (t0[1] + t1[1]) / 2 + 0.03], t1, t2], [w, w * 0.8, w * 0.55, w * 0.15], c);
    if (body === 'humanoid' || body === 'giant' || body === 'dragon') { g.mat = 'bone'; g.blob([[t2[0] - 0.035, t2[1] + 0.01], [t2[0] + 0.03, t2[1] + 0.0], [t2[0] + 0.01, t2[1] - 0.08]], body === 'dragon' ? dark : c, true, 0.3); }
  }

  // --- the body
  const tunic = look.armor === 'plate' ? STEEL : look.armor === 'leather' ? LEATHER : mix(CLOTH, [CLOTH, hex('#3e4a36'), hex('#5a3a2e'), hex('#3a3e4e')][variant & 3], 0.6);
  const tunicMat = look.armor === 'plate' ? 'metal' : look.armor === 'leather' ? 'leather' : 'cloth';
  const W = v.bulk, X = (x: number) => 0.5 + (x - 0.5) * W; // wider or narrower about the middle
  switch (body) {
    case 'humanoid': {
      // Striding legs, a torso narrowing to the waist; the weapon arm is raised to strike, the other reaches forward.
      for (const sd of [-1, 1]) {
        const foot: P = [0.5 + sd * 0.13 * W - (sd < 0 ? 0.04 : -0.02), 0.915];
        g.mat = look.armor ? tunicMat : 'cloth';
        g.limb([[X(0.5 + sd * 0.07), 0.62], [X(0.5 + sd * 0.1), 0.77], foot], [0.085 * W, 0.06, 0.05], mix(tunic, BLACK, 0.25));
        g.mat = 'leather';
        g.blob([[foot[0] - 0.035, 0.85], [foot[0] + 0.035, 0.85], [foot[0] + 0.04, 0.95], [foot[0] - 0.065, 0.955], [foot[0] - 0.055, 0.92]], deep, true, 0.6);
      }
      g.mat = bodyMat;
      if (look.arms === 4) for (const sd of [-1, 1]) g.limb([[X(0.5 + sd * 0.14), 0.5], [0.5 + sd * 0.27 * W, 0.42], [0.5 + sd * 0.32 * W, 0.32]], [0.06, 0.05, 0.04], base);
      g.limb([[X(0.36), 0.44], [X(0.28), 0.54], [0.22, 0.6]], [0.075, 0.06, 0.05], base);
      g.ell(0.215, 0.61, 0.035, 0.035, base);
      g.mat = look.armor ? tunicMat : 'cloth';
      g.blob([[X(0.33), 0.41], [0.5, 0.385], [X(0.67), 0.41], [X(0.64), 0.52], [X(0.61), 0.65], [X(0.39), 0.65], [X(0.36), 0.52]], tunic, true, 0.8);
      g.mat = 'leather'; g.blob([[X(0.38), 0.61], [X(0.62), 0.61], [X(0.62), 0.66], [X(0.38), 0.66]], mix(tunic, BLACK, 0.45), true, 0.4);
      if (look.armor === 'plate') { g.mat = 'metal'; g.blob([[X(0.28), 0.44], [X(0.33), 0.39], [X(0.41), 0.41], [X(0.38), 0.47]], mix(STEEL, WHITE, 0.15)); g.blob([[X(0.72), 0.44], [X(0.67), 0.39], [X(0.59), 0.41], [X(0.62), 0.47]], STEEL); g.fineCurve([[0.5, 0.42], [0.505, 0.5], [0.5, 0.6]], 0.005, mix(STEEL, BLACK, 0.4)); }
      else if (look.armor === 'leather') for (const y of [0.48, 0.54]) g.fineCurve([[X(0.37), y], [0.5, y + 0.01], [X(0.63), y]], 0.005, mix(tunic, BLACK, 0.4), 0.7);
      else { g.mat = bodyMat; g.blob([[0.43, 0.4], [0.57, 0.4], [0.5, 0.47]], mix(base, BLACK, 0.1), true, 0.5); } // bare throat in a ragged collar
      if (v.strap) { g.mat = 'leather'; g.seg([X(0.36), 0.42], [X(0.62), 0.62], 0.025, mix(LEATHER, BLACK, 0.3)); g.mat = 'metal'; g.ell(X(0.45), 0.49, 0.018, 0.018, hex('#b08a3a')); }
      g.mat = bodyMat;
      g.limb([[X(0.64), 0.44], [X(0.74), 0.47], hand], [0.075, 0.06, 0.05], base);
      g.ell(hand[0], hand[1], 0.035, 0.035, base);
      break;
    }
    case 'giant': {
      for (const sd of [-1, 1]) {
        g.mat = bodyMat;
        g.limb([[X(0.5 + sd * 0.1), 0.62], [X(0.5 + sd * 0.135), 0.78], [X(0.5 + sd * 0.12), 0.9]], [0.13 * W, 0.1, 0.085], base);
        g.mat = 'leather';
        g.blob([[X(0.5 + sd * 0.12) - 0.06, 0.88], [X(0.5 + sd * 0.12) + 0.06, 0.88], [X(0.5 + sd * 0.12) + 0.07, 0.96], [X(0.5 + sd * 0.12) - 0.08, 0.96]], dark, true, 0.6);
      }
      g.mat = bodyMat;
      if (look.arms === 4) for (const sd of [-1, 1]) g.limb([[X(0.5 + sd * 0.2), 0.44], [0.5 + sd * 0.36 * W, 0.36], [0.5 + sd * 0.42 * W, 0.24]], [0.09, 0.075, 0.06], base);
      g.limb([[X(0.27), 0.36], [X(0.18), 0.52], [X(0.16), 0.68]], [0.11, 0.095, 0.08], base); g.ell(X(0.16), 0.7, 0.055, 0.05, base);
      g.mat = look.armor ? tunicMat : bodyMat;
      g.blob([[X(0.27), 0.33], [0.5, 0.3], [X(0.73), 0.33], [X(0.71), 0.5], [X(0.64), 0.68], [X(0.36), 0.68], [X(0.29), 0.5]], look.armor ? tunic : base, true, 0.8);
      if (!look.armor) { g.mat = bodyMat; g.blob([[X(0.37), 0.5], [X(0.63), 0.5], [X(0.6), 0.64], [X(0.4), 0.64]], light, false, 0.9); g.fineCurve([[0.5, 0.36], [0.5, 0.48]], 0.006, dark, 0.8); g.fineCurve([[X(0.36), 0.42], [X(0.44), 0.46], [0.5, 0.44], [X(0.56), 0.46], [X(0.64), 0.42]], 0.006, dark, 0.8); }
      g.mat = look.armor === 'plate' ? 'metal' : 'leather';
      g.blob([[X(0.34), 0.62], [X(0.66), 0.62], [X(0.68), 0.76], [X(0.56), 0.74], [0.5, 0.79], [X(0.44), 0.74], [X(0.32), 0.76]], look.armor === 'plate' ? mix(STEEL, BLACK, 0.3) : hex('#5a4028'), true, 0.6);
      g.blob([[X(0.34), 0.6], [X(0.66), 0.6], [X(0.66), 0.645], [X(0.34), 0.645]], mix(LEATHER, BLACK, 0.4), true, 0.4);
      g.mat = bodyMat;
      g.limb([[X(0.73), 0.36], [X(0.82), 0.42], hand], [0.11, 0.095, 0.08], base); g.ell(hand[0], hand[1], 0.055, 0.05, base);
      break;
    }
    case 'beast': {
      // Side view, facing left, crouched to spring: the near forepaw is lifted, the haunches are low.
      const legs: [P, P, P, boolean][] = [
        [[0.36, 0.6], [0.37, 0.76], [0.34, 0.92], true], [[0.73, 0.58], [0.79, 0.74], [0.72, 0.92], true],
        [[0.33, 0.6], [0.24, 0.7], [0.18, 0.69], false], [[0.76, 0.6], [0.83, 0.76], [0.77, 0.92], false],
      ];
      g.mat = bodyMat;
      const leg = ([hp, kn, ft, far]: [P, P, P, boolean]) => {
        g.limb([hp, kn, ft], [hp[0] > 0.5 ? 0.11 : 0.085, 0.06, 0.045], far ? dark : base);
        g.blob([[ft[0] - 0.05, ft[1] - 0.012], [ft[0] + 0.025, ft[1] - 0.022], [ft[0] + 0.03, ft[1] + 0.02], [ft[0] - 0.055, ft[1] + 0.02]], far ? deep : dark, true, 0.6);
        if (!far && ft[1] < 0.8) for (let i = 0; i < 3; i++) { g.mat = 'bone'; g.limb([[ft[0] - 0.035 - i * 0.006, ft[1] - 0.01 + i * 0.012], [ft[0] - 0.065 - i * 0.004, ft[1] + 0.005 + i * 0.016]], [0.012, 0.002], BONE); g.mat = bodyMat; }
      };
      legs.filter((l) => l[3]).forEach(leg);
      g.blob([[0.27, 0.56], [0.35, 0.44], [0.5, 0.46], [0.66, 0.44], [0.8, 0.45], [0.88, 0.52], [0.85, 0.64], [0.72, 0.68], [0.55, 0.65], [0.4, 0.7], [0.29, 0.66]].map(([x, y]) => [X(x), y] as P), base, true, 0.85);
      g.blob([[X(0.36), 0.64], [X(0.56), 0.62], [X(0.52), 0.68], [X(0.38), 0.7]], light, false, 0.8);
      legs.filter((l) => !l[3]).forEach(leg);
      g.mat = bodyMat;
      for (let i = 0; i < 6; i++) g.fineCurve([[X(0.4 + i * 0.075), 0.47], [X(0.42 + i * 0.075), 0.5], [X(0.42 + i * 0.075), 0.54]], 0.006, dark, 0.7); // ruff along the back
      if (look.armor) { g.mat = tunicMat; g.blob([[X(0.44), 0.44], [X(0.74), 0.45], [X(0.72), 0.6], [X(0.46), 0.6]], tunic, true, 0.6); }
      break;
    }
    case 'rodent':
      g.mat = bodyMat;
      g.blob([[0.32, 0.72], [0.42, 0.58], [0.6, 0.54], [0.8, 0.6], [0.88, 0.74], [0.8, 0.86], [0.55, 0.89], [0.36, 0.85]], base, true, 0.9);
      g.blob([[0.45, 0.82], [0.72, 0.82], [0.68, 0.88], [0.48, 0.88]], light, false, 0.8);
      g.mat = 'plain';
      for (const x of [0.42, 0.72]) g.limb([[x, 0.82], [x - 0.01, 0.88], [x - 0.04, 0.92]], [0.04, 0.025, 0.02], hex('#c89a90'));
      for (let i = 0; i < 5; i++) g.fineCurve([[0.46 + i * 0.08, 0.6 + (i % 2) * 0.02], [0.48 + i * 0.08, 0.64]], 0.006, dark, 0.7);
      break;
    case 'insect':
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
        const knee: P = [0.5 + s * (0.25 + i * 0.02), 0.26 + i * 0.13], foot: P = [0.5 + s * (0.4 + (i % 2) * 0.05), 0.5 + i * 0.14];
        g.mat = 'metal'; g.limb([[0.5 + s * 0.08, 0.42 + i * 0.03], knee, foot], [0.045, 0.035, 0.012], dark);
      }
      g.mat = 'metal';
      g.blob([[0.5, 0.45], [0.68, 0.55], [0.7, 0.72], [0.5, 0.9], [0.3, 0.72], [0.32, 0.55]], base, true, 0.9); g.ell(0.5, 0.42, 0.13, 0.11, base);
      g.mat = 'plain'; g.ell(0.5, 0.66, 0.07, 0.1, light); g.ell(0.5, 0.74, 0.04, 0.05, mix(base, hex('#c0392b'), 0.7));
      break;
    case 'serpent': {
      // Coils on the ground, rising to a head poised to strike.
      g.mat = 'scales';
      g.limb([[0.14, 0.86], [0.36, 0.92], [0.7, 0.9], [0.86, 0.8], [0.72, 0.7], [0.42, 0.72], [0.36, 0.62], [0.42, 0.5], [heads[0][0] + 0.06, heads[0][1] + 0.12]], [0.05, 0.11, 0.12, 0.12, 0.11, 0.1, 0.09, 0.08, 0.07], base);
      g.mat = 'plain';
      g.fineCurve([[0.3, 0.92], [0.6, 0.93], [0.82, 0.84]], 0.012, light, 0.6);
      g.fineCurve([[0.4, 0.62], [0.44, 0.52], [heads[0][0] + 0.06, heads[0][1] + 0.18]], 0.012, light, 0.6);
      break;
    }
    case 'dragon': {
      // Low and coiled to lunge: the near foreleg reaches forward, the neck curls back towards the head.
      const legs: [P, P, P, boolean][] = [
        [[0.42, 0.62], [0.4, 0.77], [0.38, 0.93], true], [[0.7, 0.62], [0.77, 0.77], [0.69, 0.93], true],
        [[0.38, 0.64], [0.29, 0.76], [0.24, 0.9], false], [[0.74, 0.64], [0.82, 0.79], [0.74, 0.93], false],
      ];
      g.mat = 'scales';
      const leg = ([hp, kn, ft, far]: [P, P, P, boolean]) => {
        g.mat = 'scales';
        g.limb([hp, kn, ft], [hp[0] > 0.5 ? 0.12 : 0.095, 0.07, 0.055], far ? dark : base);
        g.mat = 'bone';
        for (let i = -1; i <= 1; i++) g.limb([[ft[0] - 0.02 + i * 0.02, ft[1] - 0.01], [ft[0] - 0.06 + i * 0.025, ft[1] + 0.03]], [0.016, 0.003], BONE);
        g.mat = 'scales';
      };
      legs.filter((l) => l[3]).forEach(leg);
      g.blob([[0.33, 0.58], [0.44, 0.47], [0.62, 0.46], [0.78, 0.52], [0.82, 0.64], [0.7, 0.75], [0.48, 0.76], [0.36, 0.72]].map(([x, y]) => [X(x), y] as P), base, true, 0.9);
      legs.filter((l) => !l[3]).forEach(leg);
      g.mat = 'plain';
      g.blob([[X(0.38), 0.68], [X(0.7), 0.7], [X(0.62), 0.76], [X(0.42), 0.755]], light, false, 0.7);
      for (let i = 0; i < 5; i++) g.fineCurve([[X(0.41 + i * 0.065), 0.695], [X(0.415 + i * 0.065), 0.755]], 0.005, mix(light, BLACK, 0.3), 0.6); // belly plates
      g.mat = 'bone';
      for (let i = 0; i < 6; i++) g.blob([[X(0.4 + i * 0.07), 0.475 + Math.abs(i - 2.5) * 0.005], [X(0.445 + i * 0.07), 0.475 + Math.abs(i - 2.5) * 0.005], [X(0.425 + i * 0.07), 0.425 + Math.abs(i - 2.5) * 0.008]], dark, true, 0.3);
      g.mat = 'scales';
      g.limb([[0.44, 0.58], [0.3, 0.5], [0.31, 0.39], [heads[0][0] + 0.05, heads[0][1] + 0.04]], [0.13, 0.1, 0.085, 0.08], base, false); // the neck
      break;
    }
    case 'bird':
      g.mat = 'plain';
      for (const s of [-1, 1]) { g.limb([[0.5 + s * 0.06, 0.78], [0.5 + s * 0.08, 0.93]], [0.035, 0.03], hex('#c8a040')); g.blob([[0.5 + s * 0.08 - 0.06, 0.93], [0.5 + s * 0.08 + 0.05, 0.925], [0.5 + s * 0.08 + 0.05, 0.955], [0.5 + s * 0.08 - 0.06, 0.955]], hex('#c8a040'), true, 0.5); }
      g.mat = 'hair';
      g.blob([[0.5, 0.38], [0.68, 0.48], [0.7, 0.66], [0.58, 0.82], [0.42, 0.82], [0.3, 0.66], [0.32, 0.48]], base, true, 1); g.blob([[0.5, 0.52], [0.6, 0.6], [0.58, 0.76], [0.42, 0.76], [0.4, 0.6]], light, false, 1);
      break;
    case 'ooze':
      g.mat = 'plain';
      g.blob([[0.1, 0.94], [0.14, 0.7], [0.3, 0.52], [0.5, 0.47], [0.72, 0.52], [0.88, 0.7], [0.9, 0.94]], base, true, 0.9);
      g.ell(0.5, 0.86, 0.3, 0.08, dark, false); g.ell(0.34, 0.62, 0.08, 0.045, light, false); g.ell(0.3, 0.7, 0.03, 0.03, light, false);
      for (let i = 0; i < 5; i++) g.ell(0.26 + rnd() * 0.5, 0.62 + rnd() * 0.24, 0.025, 0.025, i % 2 ? light : dark);
      break;
    case 'elemental':
      g.mat = 'plain';
      g.limb([[0.36, 0.56], [0.22, 0.52], [0.14, 0.42]], [0.1, 0.08, 0.06], base); g.limb([[0.64, 0.56], [0.78, 0.48], [0.86, 0.36]], [0.1, 0.08, 0.06], base);
      g.blob([[0.5, 0.06], [0.62, 0.3], [0.7, 0.5], [0.76, 0.86], [0.5, 0.96], [0.24, 0.86], [0.3, 0.5], [0.38, 0.3]], base, true, 0.9);
      g.blob([[0.3, 0.3], [0.4, 0.42], [0.36, 0.52]], base, true, 0.5); g.blob([[0.72, 0.26], [0.62, 0.4], [0.68, 0.52]], base, true, 0.5);
      g.ell(0.5, 0.68, 0.1, 0.16, light, false); g.ell(0.5, 0.48, 0.07, 0.08, light, false);
      break;
    case 'plant':
      g.mat = 'wood';
      g.limb([[0.46, 0.86], [0.36, 0.92], [0.26, 0.95]], [0.06, 0.045, 0.02], WOOD); g.limb([[0.54, 0.86], [0.64, 0.92], [0.74, 0.95]], [0.06, 0.045, 0.02], WOOD);
      g.limb([[0.46, 0.56], [0.32, 0.46], [0.2, 0.44]], [0.06, 0.05, 0.03], WOOD); g.limb([[0.54, 0.56], [0.7, 0.54], [0.82, 0.5]], [0.06, 0.05, 0.03], WOOD);
      g.blob([[0.42, 0.44], [0.58, 0.44], [0.6, 0.7], [0.58, 0.93], [0.42, 0.93], [0.4, 0.7]], WOOD, true, 0.6);
      g.mat = 'plain'; g.ell(0.18, 0.4, 0.09, 0.07, base); g.ell(0.84, 0.46, 0.09, 0.07, base);
      break;
    case 'aberration':
      g.mat = 'plain';
      for (let i = 0; i < 5; i++) { const x = 0.26 + i * 0.12, sway = (i % 2 ? 1 : -1) * 0.05; g.limb([[x, 0.6], [x + sway, 0.78], [x - sway, 0.94]], [0.065, 0.045, 0.015], dark); }
      g.blob([[0.24, 0.48], [0.3, 0.28], [0.5, 0.2], [0.7, 0.28], [0.76, 0.48], [0.66, 0.66], [0.34, 0.66]], base, true, 1); g.ell(0.42, 0.34, 0.1, 0.06, light, false);
      g.fineCurve([[0.34, 0.56], [0.5, 0.6], [0.66, 0.56]], 0.03, deep);
      g.mat = 'bone'; for (let i = 0; i < 5; i++) g.tri([0.36 + i * 0.06, 0.565], [0.4 + i * 0.06, 0.57], [0.38 + i * 0.06, 0.62], BONE);
      break;
    case 'construct':
      g.mat = 'metal';
      g.box(0.36, 0.68, 0.46, 0.93, dark); g.box(0.54, 0.68, 0.64, 0.93, dark);
      g.box(0.33, 0.9, 0.48, 0.96, deep); g.box(0.52, 0.9, 0.67, 0.96, deep);
      g.box(0.19, 0.4, 0.29, 0.72, base); g.box(0.71, 0.4, 0.81, 0.72, base);
      if (look.arms === 4) { g.box(0.12, 0.3, 0.2, 0.52, dark); g.box(0.8, 0.3, 0.88, 0.52, dark); }
      g.box(0.3, 0.38, 0.7, 0.7, base); g.box(0.3, 0.38, 0.7, 0.41, light); g.box(0.3, 0.66, 0.7, 0.7, dark);
      for (const [x, y] of [[0.34, 0.45], [0.66, 0.45], [0.34, 0.62], [0.66, 0.62]]) g.dot(x, y, deep);
      g.mat = 'plain'; g.ell(0.5, 0.53, 0.05, 0.05, GLOW[look.eyes ?? 'blue']);
      break;
    case 'ghost':
      g.mat = 'cloth';
      g.limb([[0.36, 0.46], [0.24, 0.5], [0.13, 0.42]], [0.075, 0.06, 0.03], base); g.limb([[0.64, 0.46], [0.76, 0.5], [0.87, 0.42]], [0.075, 0.06, 0.03], base);
      g.blob([[0.3, 0.44], [0.5, 0.3], [0.7, 0.44], [0.68, 0.7], [0.62, 0.97], [0.54, 0.86], [0.46, 0.95], [0.38, 0.84], [0.32, 0.7]], base, true, 0.9);
      g.ell(0.5, 0.56, 0.1, 0.12, dark, false);
      break;
  }

  // --- necks and heads
  if (look.heads > 1 && body !== 'serpent') { g.mat = bodyMat; for (const h of heads) g.limb([sh.neck, h], [sh.r * 0.95, sh.r * 0.85], base); }
  if (look.heads > 1 && body === 'serpent') { g.mat = 'scales'; for (const h of heads.slice(1)) g.limb([[0.42, 0.55], [h[0] + 0.05, h[1] + 0.1]], [0.08, 0.065], base); }
  const skull = look.mutation === 'skeletal';
  heads.forEach(([x, y]) => {
    const r = sh.r;
    g.mat = bodyMat;
    // A dark rim keeps neighbouring heads apart.
    if (look.heads > 1 && body !== 'aberration' && body !== 'ooze' && body !== 'elemental') g.ell(x, y, r * 1.14, r * 1.14, deep);
    switch (body) {
      case 'beast': {
        // A long muzzle facing left, ears laid back, the jaw open to bite.
        g.blob([[x - r * 0.1, y - r * 0.6], [x + r * 0.55, y - r * 0.55], [x + r * 0.55, y - r * 1.45]], base, true, 0.3);
        g.blob([[x + r * 0.35, y - r * 0.5], [x + r, y - r * 0.4], [x + r * 0.98, y - r * 1.3]], dark, true, 0.3);
        g.blob([[x - r * 1.3, y + r * 0.62], [x - r * 0.4, y + r * 0.55], [x + r * 0.1, y + r * 0.8], [x - r * 0.4, y + r * 1.05], [x - r * 1.2, y + r * 0.95]], dark, true, 0.7); // lower jaw, dropped
        g.mat = 'plain'; g.blob([[x - r * 1.25, y + r * 0.55], [x - r * 0.3, y + r * 0.5], [x - r * 0.4, y + r * 0.85], [x - r * 1.15, y + r * 0.85]], hex('#5a1e1e'), false, 0.7); // the mouth
        g.mat = 'bone'; for (let i = 0; i < 4; i++) { g.tri([x - r * (1.35 - i * 0.28), y + r * 0.5], [x - r * (1.2 - i * 0.28), y + r * 0.5], [x - r * (1.28 - i * 0.28), y + r * 0.72], BONE, false); g.tri([x - r * (1.2 - i * 0.28), y + r * 0.88], [x - r * (1.05 - i * 0.28), y + r * 0.88], [x - r * (1.12 - i * 0.28), y + r * 0.7], BONE, false); }
        g.mat = bodyMat;
        g.blob([[x - r * 0.95, y + r * 0.0], [x - r * 0.3, y - r * 0.8], [x + r * 0.7, y - r * 0.7], [x + r, y + r * 0.1], [x + r * 0.6, y + r * 0.75], [x - r * 0.2, y + r * 0.62]], base, true, 0.9);
        g.blob([[x - r * 0.2, y - r * 0.55], [x - r * 1.4, y - r * 0.1], [x - r * 1.7, y + r * 0.2], [x - r * 1.55, y + r * 0.52], [x - r * 0.2, y + r * 0.55]], base, true, 0.8);
        g.mat = 'plain'; g.ell(x - r * 1.6, y + r * 0.14, r * 0.16, r * 0.13, deep);
        g.fineCurve([[x - r * 1.3, y - r * 0.05], [x - r * 0.9, y - r * 0.3], [x - r * 0.55, y - r * 0.38]], r * 0.07, dark, 0.7); // the snarl on the muzzle
        g.fineCurve([[x - r * 0.9, y + r * 0.2], [x - r * 0.35, y + r * 0.25]], r * 0.06, dark, 0.7);
        break;
      }
      case 'rodent':
        g.mat = 'plain'; g.ell(x + r * 0.45, y - r * 0.85, r * 0.5, r * 0.5, base); g.ell(x + r * 0.45, y - r * 0.85, r * 0.28, r * 0.28, hex('#c89a90'), false);
        g.mat = bodyMat; g.blob([[x + r, y], [x + r * 0.3, y - r * 0.85], [x - r * 0.6, y - r * 0.5], [x - r * 1.7, y + r * 0.35], [x - r * 0.6, y + r * 0.75], [x + r * 0.4, y + r * 0.8]], base, true, 0.8);
        g.mat = 'plain'; g.dot(x - r * 1.6, y + r * 0.3, hex('#c89a90'), 2);
        g.box(x - r * 1.25, y + r * 0.55, x - r * 1.05, y + r * 0.95, hex('#e8e0c8'));
        for (const dy of [0.2, 0.35]) g.fineCurve([[x - r * 1.4, y + r * dy], [x - r * 1.9, y + r * (dy - 0.15)]], r * 0.03, OUTLINE, 0.7);
        break;
      case 'dragon': {
        // A wedge of a head: a long snout, a horned brow and frill, the jaw open on a row of teeth.
        g.mat = 'bone';
        g.limb([[x + r * 0.15, y - r * 0.5], [x + r * 0.6, y - r * 1.15], [x + r * 1.3 * v.horn, y - r * 1.6 * v.horn]], [r * 0.34, r * 0.22, r * 0.03], mix(BONE, BLACK, 0.2));
        for (let i = 0; i < 3; i++) g.blob([[x + r * (0.4 + i * 0.22), y - r * 0.3], [x + r * (0.7 + i * 0.22), y - r * 0.1], [x + r * (1.25 + i * 0.2), y - r * (0.5 - i * 0.2)]], dark, true, 0.3); // frill
        g.mat = 'scales';
        g.blob([[x - r * 1.5, y + r * 0.55], [x - r * 0.3, y + r * 0.45], [x + r * 0.2, y + r * 0.75], [x - r * 0.3, y + r * 1.0], [x - r * 1.4, y + r * 0.95]], dark, true, 0.6); // lower jaw
        g.mat = 'plain'; g.blob([[x - r * 1.55, y + r * 0.45], [x - r * 0.3, y + r * 0.42], [x - r * 0.35, y + r * 0.82], [x - r * 1.4, y + r * 0.82]], hex('#5a1e1e'), false, 0.6);
        g.mat = 'bone'; for (let i = 0; i < 4; i++) { g.tri([x - r * (1.55 - i * 0.3), y + r * 0.42], [x - r * (1.4 - i * 0.3), y + r * 0.42], [x - r * (1.47 - i * 0.3), y + r * 0.64], BONE, false); g.tri([x - r * (1.4 - i * 0.3), y + r * 0.85], [x - r * (1.25 - i * 0.3), y + r * 0.85], [x - r * (1.32 - i * 0.3), y + r * 0.66], BONE, false); }
        g.mat = 'scales';
        g.blob([[x + r * 0.95, y + r * 0.05], [x + r * 0.5, y - r * 0.75], [x - r * 0.3, y - r * 0.62], [x - r * 1.75, y - r * 0.02], [x - r * 1.9, y + r * 0.3], [x - r * 0.3, y + r * 0.45], [x + r * 0.5, y + r * 0.7]], base, true, 0.7);
        g.mat = 'plain'; g.ell(x - r * 1.68, y + r * 0.08, r * 0.09, r * 0.06, deep);
        g.fineCurve([[x - r * 0.15, y - r * 0.52], [x - r * 0.45, y - r * 0.5], [x - r * 0.8, y - r * 0.32]], r * 0.12, deep); // brow ridge
        break;
      }
      case 'serpent':
        g.mat = 'scales';
        g.blob([[x + r * 1.0, y], [x + r * 0.5, y - r * 0.75], [x - r * 0.6, y - r * 0.6], [x - r * 1.5, y + r * 0.1], [x - r * 1.3, y + r * 0.5], [x - r * 0.2, y + r * 0.8], [x + r * 0.7, y + r * 0.6]], base, true, 0.8);
        g.mat = 'plain'; g.fineCurve([[x - r * 1.35, y + r * 0.35], [x - r * 0.5, y + r * 0.45]], r * 0.05, deep);
        g.limb([[x - r * 1.45, y + r * 0.35], [x - r * 1.9, y + r * 0.5], [x - r * 2.1, y + r * 0.4]], [0.012, 0.01, 0.003], hex('#a03028'));
        if (look.heads === 1) { g.mat = 'bone'; g.limb([[x - r * 1.1, y + r * 0.42], [x - r * 1.14, y + r * 0.82]], [r * 0.12, r * 0.02], BONE); }
        break;
      case 'insect':
        g.mat = 'metal'; g.ell(x, y, r, r * 0.9, base);
        g.mat = 'bone'; g.limb([[x - r * 0.5, y + r * 0.7], [x - r * 0.5, y + r * 1.2], [x - r * 0.25, y + r * 1.5]], [0.035, 0.025, 0.005], BONE); g.limb([[x + r * 0.5, y + r * 0.7], [x + r * 0.5, y + r * 1.2], [x + r * 0.25, y + r * 1.5]], [0.035, 0.025, 0.005], BONE);
        break;
      case 'bird':
        g.mat = 'hair'; g.ell(x, y, r, r, base);
        g.mat = 'bone'; g.blob([[x - r * 0.38, y + r * 0.15], [x + r * 0.38, y + r * 0.15], [x + r * 0.1, y + r * 0.8], [x - r * 0.05, y + r * 1.15]], hex('#c8a040'), true, 0.5);
        break;
      case 'plant':
        g.mat = 'plain'; g.blob([[x - r * 1.7, y], [x - r * 0.9, y - r * 1.1], [x + r * 0.6, y - r * 1.25], [x + r * 1.7, y - r * 0.2], [x + r * 1.2, y + r * 1.0], [x - r * 1.1, y + r * 1.0]], base, true, 0.9);
        g.ell(x - r * 0.7, y - r * 0.4, r * 0.7, r * 0.5, light, false); g.ell(x + r * 0.9, y + r * 0.4, r * 0.6, r * 0.45, dark, false);
        break;
      case 'construct':
        g.mat = 'metal'; g.box(x - r, y - r * 0.9, x + r, y + r * 0.9, base); g.box(x - r, y - r * 0.9, x + r, y - r * 0.6, light); g.box(x - r * 0.75, y - r * 0.15, x + r * 0.75, y + r * 0.2, deep);
        break;
      case 'ghost':
        g.mat = 'cloth'; g.blob([[x - r, y + r * 0.2], [x - r * 0.8, y - r * 0.8], [x, y - r * 1.1], [x + r * 0.8, y - r * 0.8], [x + r, y + r * 0.2], [x + r * 0.6, y + r * 1.0], [x - r * 0.6, y + r * 1.0]], base, true, 0.9);
        g.mat = 'plain'; g.ell(x, y + r * 0.1, r * 0.7, r * 0.75, deep, false);
        break;
      case 'aberration':
        // The body is the head: one great eye, and a stalk per extra head.
        break;
      case 'ooze': case 'elemental':
        break;
      default: {
        // humanoid and giant: a skull and a square jaw in one outline, a heavy brow, a snarl
        const skin = skull ? BONE : base;
        g.mat = skull ? 'bone' : bodyMat;
        const jw = (body === 'giant' ? 0.78 : 0.58) * v.jaw;
        g.blob([[x - r * 0.9, y - r * 0.05], [x - r * 0.7, y - r * 0.85], [x, y - r * 1.06], [x + r * 0.7, y - r * 0.85], [x + r * 0.9, y - r * 0.05], [x + r * jw * 1.3, y + r * 0.6], [x + r * jw, y + r * 0.92], [x, y + r * 1.05], [x - r * jw, y + r * 0.92], [x - r * jw * 1.3, y + r * 0.6]], skin, true, 0.85);
        g.mat = 'plain';
        g.soft(x, y - r * 0.05, r * 0.75, r * 0.22, mix(skin, BLACK, 0.6), 0.45); // shadow under the brow
        if (skull) { g.flat(x, y + r * 0.45, r * 0.12, r * 0.12, deep); for (let i = -2; i <= 2; i++) g.fineCurve([[x + i * r * 0.14, y + r * 0.68], [x + i * r * 0.14, y + r * 0.86]], r * 0.05, deep, 0.7); }
        else {
          // An open, snarling mouth with tusks for giants and teeth for the rest.
          g.blob([[x - r * 0.38, y + r * 0.55], [x + r * 0.38, y + r * 0.52], [x + r * 0.28, y + r * 0.78], [x - r * 0.28, y + r * 0.8]], hex('#3a1414'), false, 0.7);
          g.mat = 'bone';
          if (body === 'giant') { g.tri([x - r * 0.42, y + r * 0.74], [x - r * 0.22, y + r * 0.74], [x - r * 0.36, y + r * 0.32], BONE); g.tri([x + r * 0.22, y + r * 0.72], [x + r * 0.42, y + r * 0.72], [x + r * 0.36, y + r * 0.3], BONE); }
          else for (let i = -2; i <= 2; i++) g.tri([x + i * r * 0.13 - r * 0.05, y + r * 0.55], [x + i * r * 0.13 + r * 0.05, y + r * 0.55], [x + i * r * 0.13, y + r * 0.64], BONE, false);
          g.mat = 'plain';
          g.fineCurve([[x - r * 0.05, y + r * 0.05], [x + r * 0.06, y + r * 0.32], [x - r * 0.06, y + r * 0.4]], r * 0.06, mix(skin, BLACK, 0.4), 0.8);
          if (v.scar > 0.5) g.fineCurve([[x + r * 0.55, y - r * 0.55], [x + r * 0.4, y - r * 0.05], [x + r * 0.5, y + r * 0.4]], r * 0.07, mix(skin, hex('#5a2020'), 0.55));
        }
        if (look.armor === 'plate' && body === 'humanoid') {
          g.mat = 'metal';
          g.blob([[x - r * 1.0, y + r * 0.35], [x - r * 1.02, y - r * 0.5], [x - r * 0.5, y - r * 1.12], [x + r * 0.5, y - r * 1.12], [x + r * 1.02, y - r * 0.5], [x + r * 1.0, y + r * 0.35], [x + r * 0.7, y + r * 0.35], [x + r * 0.7, y - r * 0.05], [x - r * 0.7, y - r * 0.05], [x - r * 0.7, y + r * 0.35]], STEEL, true, 0.5);
          g.fineCurve([[x, y - r * 1.05], [x, y - r * 0.1]], r * 0.08, mix(STEEL, BLACK, 0.4), 0.9);
        } else if (look.armor === 'leather' && body === 'humanoid') { g.mat = 'leather'; g.blob([[x - r * 0.98, y - r * 0.1], [x - r * 0.9, y - r * 0.7], [x - r * 0.3, y - r * 1.1], [x + r * 0.4, y - r * 1.07], [x + r * 0.95, y - r * 0.6], [x + r * 0.98, y - r * 0.1], [x + r * 0.6, y - r * 0.4], [x - r * 0.6, y - r * 0.4]], LEATHER, true, 0.6); }
      }
    }
    if (look.horns && body !== 'ooze' && body !== 'elemental' && body !== 'aberration' && body !== 'dragon') {
      const hr = (body === 'plant' ? r * 1.3 : r) * v.horn;
      g.mat = 'bone';
      for (const sd of [-1, 1]) g.limb([[x + sd * r * 0.5, y - r * 0.6], [x + sd * hr * 1.05, y - hr * 0.85], [x + sd * hr * 1.3, y - hr * 1.4], [x + sd * hr * 1.05, y - hr * 1.9]], [r * 0.3, r * 0.24, r * 0.15, r * 0.02], mix(BONE, BLACK, 0.15));
    }
    if (body === 'aberration') return;
    if (body === 'insect') { for (const [ex, ey] of [[-0.5, -0.2], [0.5, -0.2], [-0.2, 0.25], [0.2, 0.25]]) eyes.push({ p: [x + r * ex, y + r * ey] }); }
    else if (sh.side) eyes.push({ p: [x - r * (body === 'rodent' ? 0.25 : body === 'serpent' ? 0.6 : 0.3), y - r * 0.2], brow: body === 'rodent' ? 0 : 2 });
    else { const ey = body === 'plant' ? y + r * 0.1 : y + r * 0.05; const angry = body === 'humanoid' || body === 'giant' ? 1 : 0; eyes.push({ p: [x - r * 0.38, ey], brow: -angry }, { p: [x + r * 0.38, ey], brow: angry }); }
  });
  g.mat = 'plain';
  if (body === 'aberration') {
    g.ell(0.5, 0.42, 0.12, 0.1, WHITE);
    eyes.push({ p: [0.5, 0.42], big: true });
    for (let i = 0; i < look.heads * 2; i++) {
      const s = i % 2 ? 1 : -1, k = Math.floor(i / 2), tip: P = [0.5 + s * (0.16 + k * 0.1), 0.1 + k * 0.05];
      g.limb([[0.5 + s * (0.1 + k * 0.06), 0.26], [0.5 + s * (0.14 + k * 0.08), 0.18], tip], [0.04, 0.03, 0.025], base); g.ell(tip[0], tip[1], 0.045, 0.045, WHITE);
      eyes.push({ p: tip });
    }
  }
  if (look.horns && (body === 'ooze' || body === 'elemental' || body === 'aberration')) { g.mat = 'bone'; for (const s of [-1, 1]) g.limb([[0.5 + s * 0.16, 0.36], [0.5 + s * 0.26, 0.28], [0.5 + s * 0.3, 0.16]], [0.05, 0.035, 0.005], BONE); }

  // --- weapon in hand: raised to strike, or a spear, staff or bow held ready
  if (look.weapon && sh.hand) {
    const k = body === 'giant' ? 1.25 : 1;
    let d: P = raised ? [0.42, -0.9] : [0.1, -1];
    const dl = Math.hypot(d[0], d[1]); d = [d[0] / dl, d[1] / dl];
    const n: P = [-d[1], d[0]];
    const at = (t: number, side = 0): P => [hand[0] + d[0] * t * k + n[0] * side * k, hand[1] + d[1] * t * k + n[1] * side * k];
    const steel = hex('#c4cad2');
    switch (look.weapon) {
      case 'club':
        g.mat = 'wood'; g.limb([at(-0.05), at(0.12), at(0.3)], [0.045 * k, 0.07 * k, 0.11 * k], mix(WOOD, WHITE, 0.12));
        g.mat = 'bone'; for (let i = 0; i < 3; i++) g.tri(at(0.2 + i * 0.04, 0.04), at(0.22 + i * 0.04, 0.04), at(0.21 + i * 0.04, 0.08), BONE);
        break;
      case 'sword':
        g.mat = 'leather'; g.seg(at(-0.05), at(0.04), 0.04, WOOD);
        g.mat = 'metal'; g.seg(at(0.045, 0.06), at(0.045, -0.06), 0.035, hex('#b08a3a'));
        g.poly([at(0.06, 0.022), at(0.36, 0.016), at(0.41), at(0.36, -0.016), at(0.06, -0.022)], steel);
        break;
      case 'axe':
        g.mat = 'wood'; g.seg(at(-0.06), at(0.4), 0.04, WOOD);
        g.mat = 'metal'; g.blob([at(0.27, 0.005), at(0.24, -0.07), at(0.22, -0.13), at(0.34, -0.15), at(0.45, -0.13), at(0.42, -0.07), at(0.4, 0.005)], steel, true, 0.8);
        break;
      case 'spear':
        g.mat = 'wood'; g.seg(at(-0.2), at(0.46), 0.035, WOOD);
        g.mat = 'metal'; g.poly([at(0.45, 0.035), at(0.6), at(0.45, -0.035), at(0.43)], steel);
        break;
      case 'staff': {
        g.mat = 'wood'; g.curve([at(-0.24), at(0.1, 0.008), at(0.44)], 0.04, WOOD);
        const tip = at(0.48);
        g.mat = 'plain'; g.ell(tip[0], tip[1], 0.05, 0.05, GLOW[look.eyes ?? 'blue']);
        break;
      }
      case 'bow': {
        const [hx, hy] = hand;
        g.seg([hx + 0.01, hy - 0.44], [hx + 0.01, hy + 0.16], 0.012, BONE, false);
        g.mat = 'wood'; g.curve(Array.from({ length: 9 }, (_, i) => { const t = (i / 8 - 0.5) * 2; return [hx + 0.1 - t * t * 0.09, hy - 0.14 + t * 0.3] as P; }), 0.035, WOOD);
        break;
      }
    }
    g.mat = 'plain';
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
/** Which of four small variations a creature gets, steady for its id. */
export const monsterVariant = (id: string) => [...id].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) | 0, 3) >>> 0 & 3;

/** The creature alone, on a transparent background. */
export function monsterFigure(look: MonsterLook, variant = 0): HTMLCanvasElement {
  const k = `${lookKey(look)}#${variant}`;
  let c = figures.get(k);
  if (!c) { c = draw(look, variant); figures.set(k, c); }
  return c;
}

const canvases = new Map<string, HTMLCanvasElement>();

/** The token for a look: the creature in a round iron frame. Square, TOKEN_PX pixels per map square the creature occupies. */
export function monsterCanvas(look: MonsterLook, variant = 0): HTMLCanvasElement {
  const k = `${lookKey(look)}#${variant}`;
  let c = canvases.get(k);
  if (!c) {
    const fig = monsterFigure(look, variant);
    c = framed(fig, fig.width, 'monster', fitCrop(fig, 0.1, 0.32), SIZE_TILES[look.size]);
    canvases.set(k, c);
  }
  return c;
}

const urls = new Map<string, string>();
/** The token as a data URL, for hover cards. */
export function monsterUrl(look: MonsterLook, variant = 0): string {
  const k = `${lookKey(look)}#${variant}`;
  let u = urls.get(k);
  if (!u) { u = monsterCanvas(look, variant).toDataURL(); urls.set(k, u); }
  return u;
}
