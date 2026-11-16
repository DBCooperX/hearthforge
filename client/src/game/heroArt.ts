// Hero tokens and portraits, drawn in layers with the same pixel painter as the
// monsters: a body built for the species, skin, ears, tusks, horns, hair and
// beard as chosen in the creator, and the armour, shield and weapon the hero
// actually carries. One picture serves the picker, the party panel, the
// character sheet and the battle map. Original generated art, CC0.

import { HAIR_COLORS, OUTFITS, SKINS, heroArtKey, heroGear, heroLook, type HeroArt, type HeroLook } from '../../../shared/heroLook';
import { ITEMS } from '../../../shared/content';
import { itemDef } from '../../../shared/items';
import { buildSheet, type Draft } from '../../../shared/build';
import { CLASS_GUIDE } from '../../../shared/rules';
import type { Character, ClassId, Gender, ItemDef, SpeciesId } from '../../../shared/types';
import { TOKEN_PX } from './monsterArt';
import { INK, Ink, framed, hex, mix, type P, type RGB } from './ink';

const BLACK: RGB = [0, 0, 0], WHITE: RGB = [255, 255, 255];
const OUTLINE = INK;
const STEEL = hex('#868b90'), LEATHER = hex('#6e5034'), WOOD = hex('#6a4a2a'), BONE = hex('#ddd4bc'), GOLD = hex('#c49a4a');

/** How tall and broad each people stands, in parts of the token, and how big the head is against the height. */
const BUILD: Record<SpeciesId, { tall: number; wide: number; head: number }> = {
  human: { tall: 0.84, wide: 0.15, head: 0.098 },
  elf: { tall: 0.88, wide: 0.13, head: 0.094 },
  dwarf: { tall: 0.66, wide: 0.19, head: 0.118 },
  halfling: { tall: 0.6, wide: 0.13, head: 0.12 },
  gnome: { tall: 0.56, wide: 0.12, head: 0.13 },
  orc: { tall: 0.88, wide: 0.19, head: 0.094 },
  dragonborn: { tall: 0.88, wide: 0.17, head: 0.098 },
  tiefling: { tall: 0.84, wide: 0.145, head: 0.098 },
  goliath: { tall: 0.93, wide: 0.2, head: 0.088 },
};

/** The hero alone on a transparent background, S pixels square, and where the head is (in parts of the picture). */
function draw(a: HeroArt, S: number, weight: number): { c: HTMLCanvasElement; head: P; r: number; top: number; knee: number } {
  const g = new Ink(S, 1, weight);
  const b = BUILD[a.speciesId] ?? BUILD.human;
  const { look, gear } = a;
  const female = a.gender === 'female';
  const wide = b.wide - (female ? 0.018 : 0);
  const waist = wide * (female ? 0.7 : 0.8);
  const r = b.tall * b.head;
  const feet = 0.955, top = feet - b.tall;
  const hy = top + r * 1.12; // centre of the head
  const sy = hy + r * 1.55; // shoulders
  const hip = sy + (feet - sy) * 0.44;
  const knee = hip + (feet - hip) * 0.5;
  const limb = Math.max(0.045, wide * 0.4);
  const k = b.tall / 0.84; // weapon lengths follow the hero's height

  const skin = hex(SKINS[look.skin] ?? SKINS.fair), skinD = mix(skin, BLACK, 0.3);
  const hair = hex(HAIR_COLORS[look.hairColor] ?? HAIR_COLORS.brown), hairD = mix(hair, BLACK, 0.35);
  const cloth = mix(hex(OUTFITS[look.color] ?? OUTFITS.red), hex('#6a5a48'), 0.15), clothD = mix(cloth, BLACK, 0.35), clothL = mix(cloth, WHITE, 0.25);
  const scaly = a.speciesId === 'dragonborn';
  const robe = gear.armor === 'none';
  const torso = gear.armor === 'heavy' ? STEEL : gear.armor === 'medium' ? mix(STEEL, LEATHER, 0.45) : gear.armor === 'light' ? LEATHER : cloth;
  const torsoD = mix(torso, BLACK, 0.3);
  const legs = gear.armor === 'heavy' ? mix(STEEL, BLACK, 0.2) : mix(LEATHER, BLACK, 0.3);
  const boot = mix(LEATHER, BLACK, 0.55);
  const L = (x: number) => 0.5 - x, R = (x: number) => 0.5 + x;

  // --- behind the body: tail, cloak, hair that falls down the back
  if (a.speciesId === 'tiefling') g.curve([[R(waist * 0.5), hip], [R(wide + 0.08), hip + 0.1], [R(wide + 0.14), hip + 0.02], [R(wide + 0.12), hip - 0.05]], 0.028, skinD);
  const cloak = a.classId === 'rogue' || a.classId === 'ranger' || a.classId === 'warlock' || a.classId === 'druid';
  if (cloak) g.poly([[L(wide * 0.9), sy - 0.01], [R(wide * 0.9), sy - 0.01], [R(wide * 1.25), feet - 0.05], [0.5, feet - 0.02], [L(wide * 1.25), feet - 0.05]], clothD);
  if (!scaly && (look.hair === 'long' || look.hair === 'wild')) {
    g.ell(0.5, hy - r * 0.05, r * 1.22, r * 1.25, hairD);
    if (look.hair === 'long') g.poly([[L(r * 1.15), hy], [R(r * 1.15), hy], [R(r * 1.25), sy + r * 1.1], [L(r * 1.25), sy + r * 1.1]], hairD);
  }

  // --- legs, or the skirt of a robe
  if (robe) {
    g.poly([[L(waist), hip - 0.02], [R(waist), hip - 0.02], [R(wide * 1.12), feet - 0.03], [L(wide * 1.12), feet - 0.03]], cloth);
    g.hair([0.5 - wide * 0.15, hip + 0.04], [0.5 - wide * 0.3, feet - 0.05], clothD, 1);
    g.hair([0.5 + wide * 0.35, hip + 0.04], [0.5 + wide * 0.6, feet - 0.05], clothD, 1);
    g.poly([[L(wide * 1.12), feet - 0.06], [R(wide * 1.12), feet - 0.06], [R(wide * 1.12), feet - 0.03], [L(wide * 1.12), feet - 0.03]], clothD);
    g.ell(L(wide * 0.42), feet - 0.012, wide * 0.36, 0.022, boot);
    g.ell(R(wide * 0.42), feet - 0.012, wide * 0.36, 0.022, boot);
  } else {
    for (const s of [-1, 1]) {
      const x0 = 0.5 + s * 0.012, x1 = 0.5 + s * waist * 1.02, kx = 0.5 + s * waist * 0.62;
      g.poly([[x0, hip - 0.02], [x1, hip - 0.02], [kx + s * limb * 0.55, knee], [kx + s * limb * 0.45, feet - 0.05], [kx - s * limb * 0.45, feet - 0.05], [kx - s * limb * 0.6, knee]], legs);
      g.poly([[kx - s * limb * 0.62, knee + 0.04], [kx + s * limb * 0.62, knee + 0.04], [kx + s * limb * 0.55, feet - 0.01], [kx - s * limb * 0.75, feet - 0.01]], boot);
      g.ell(kx - s * limb * 0.1, feet - 0.012, limb * 0.8, 0.02, boot);
      if (gear.armor === 'heavy') g.ell(kx, knee, limb * 0.5, limb * 0.4, STEEL);
    }
  }

  // --- arms and hands
  const handL: P = [L(wide + 0.045), hip + 0.015], handR: P = [R(wide + 0.05), hip + 0.0];
  const elbowL: P = [L(wide + 0.05), (sy + hip) / 2 + 0.01], elbowR: P = [R(wide + 0.055), (sy + hip) / 2];
  const sleeve = gear.armor === 'heavy' ? torsoD : robe ? cloth : gear.armor === 'medium' ? clothD : torsoD;
  for (const [sh, el, hd] of [[[L(wide * 0.92), sy + 0.03], elbowL, handL], [[R(wide * 0.92), sy + 0.03], elbowR, handR]] as [P, P, P][]) {
    g.seg(sh, el, limb * 1.05, sleeve);
    g.seg(el, hd, limb * 0.9, sleeve);
    if (robe) g.ell(hd[0], hd[1] - 0.02, limb * 0.75, limb * 0.55, clothD); // wide cuff
    else if (gear.armor === 'heavy') g.ell(el[0], el[1], limb * 0.5, limb * 0.45, STEEL);
    else g.box(hd[0] - limb * 0.55, hd[1] - 0.05, hd[0] + limb * 0.55, hd[1] - 0.015, mix(LEATHER, BLACK, 0.3)); // bracer
    g.ell(hd[0], hd[1] + 0.005, limb * 0.5, limb * 0.55, skin);
  }

  // --- torso, tapering from the shoulders to the waist, with the hero's colour on it
  g.poly([[L(wide), sy], [R(wide), sy], [R(waist), hip], [L(waist), hip]], torso);
  if (gear.armor === 'heavy') {
    g.poly([[L(wide * 0.62), sy + 0.02], [R(wide * 0.62), sy + 0.02], [R(waist * 0.6), hip - 0.05], [0.5, hip - 0.025], [L(waist * 0.6), hip - 0.05]], mix(STEEL, WHITE, 0.1));
    g.hair([0.5, sy + 0.03], [0.5, hip - 0.04], torsoD, 0.8);
    g.poly([[L(waist * 0.9), hip - 0.015], [R(waist * 0.9), hip - 0.015], [R(waist * 0.45), hip + 0.07], [L(waist * 0.45), hip + 0.07]], cloth); // tabard
  } else if (gear.armor === 'medium') {
    g.poly([[L(wide * 0.5), sy + 0.005], [R(wide * 0.5), sy + 0.005], [R(waist * 0.45), hip - 0.02], [L(waist * 0.45), hip - 0.02]], cloth);
    for (let i = 1; i < 4; i++) { const y = sy + (hip - sy) * (i / 4); g.hair([L(wide - (wide - waist) * (i / 4)), y], [L(waist * 0.45), y], torsoD, 0.6); g.hair([R(waist * 0.45), y], [R(wide - (wide - waist) * (i / 4)), y], torsoD, 0.6); }
  } else if (gear.armor === 'light') {
    g.poly([[L(wide * 0.35), sy], [R(wide * 0.35), sy], [0.5, sy + (hip - sy) * 0.4]], cloth);
    for (const y of [0.35, 0.6]) g.hair([L(wide * 0.8), sy + (hip - sy) * y], [R(wide * 0.8), sy + (hip - sy) * y + 0.01], torsoD, 0.6);
  } else {
    g.poly([[L(wide * 0.3), sy], [R(wide * 0.3), sy], [R(0.015), hip - 0.02], [L(0.015), hip - 0.02]], clothL);
    g.hair([L(wide * 0.3), sy], [L(0.015), hip - 0.02], clothD, 0.7);
    g.hair([R(wide * 0.3), sy], [R(0.015), hip - 0.02], clothD, 0.7);
  }
  g.box(L(waist * 1.02), hip - 0.03, R(waist * 1.02), hip + 0.002, robe ? GOLD : mix(LEATHER, BLACK, 0.5));
  g.box(L(0.018), hip - 0.032, R(0.018), hip + 0.004, GOLD);
  if (gear.armor === 'heavy') {
    g.ell(L(wide * 0.92), sy + 0.022, limb * 0.85, limb * 0.62, STEEL);
    g.ell(R(wide * 0.92), sy + 0.022, limb * 0.85, limb * 0.62, mix(STEEL, BLACK, 0.12));
  } else if (cloak) {
    g.poly([[L(wide * 1.02), sy - 0.01], [R(wide * 1.02), sy - 0.01], [R(wide * 0.75), sy + 0.06], [0.5, sy + 0.08], [L(wide * 0.75), sy + 0.06]], clothD); // mantle
    g.ell(0.5, sy + 0.052, 0.014, 0.014, GOLD);
  }
  if (a.classId === 'cleric' || a.classId === 'paladin') {
    const cy = sy + (hip - sy) * 0.4;
    g.seg([0.5, cy - 0.035], [0.5, cy + 0.035], 0.016, GOLD, false);
    g.seg([0.5 - 0.025, cy - 0.01], [0.5 + 0.025, cy - 0.01], 0.016, GOLD, false);
  }

  // --- shield on the left arm
  if (gear.shield) {
    const cx = L(wide + 0.06), cy = (sy + hip) / 2 + 0.04;
    g.ell(cx, cy, 0.1 * k, 0.12 * k, mix(STEEL, BLACK, 0.15));
    g.ell(cx, cy, 0.078 * k, 0.098 * k, cloth);
    g.hair([cx, cy - 0.09 * k], [cx, cy + 0.09 * k], clothL, 0.8);
    g.ell(cx, cy, 0.024 * k, 0.024 * k, GOLD);
  }

  // --- weapon in the right hand
  const hx = handR[0] + 0.005, hyd = handR[1];
  const up = (len: number) => Math.max(0.03, hyd - len * k);
  const blade = mix(STEEL, WHITE, 0.2);
  switch (gear.weapon) {
    case 'sword': g.seg([hx, hyd + 0.03], [hx, hyd - 0.03], 0.024, WOOD); g.poly([[hx - 0.014, hyd - 0.045], [hx + 0.014, hyd - 0.045], [hx + 0.01, up(0.34)], [hx, up(0.37)], [hx - 0.01, up(0.34)]], blade); g.seg([hx - 0.04, hyd - 0.04], [hx + 0.04, hyd - 0.04], 0.02, GOLD); break;
    case 'greatsword': g.seg([hx, hyd + 0.06], [hx, hyd - 0.04], 0.026, WOOD); g.poly([[hx - 0.018, hyd - 0.055], [hx + 0.018, hyd - 0.055], [hx + 0.014, up(0.55)], [hx, up(0.59)], [hx - 0.014, up(0.55)]], blade); g.seg([hx - 0.055, hyd - 0.05], [hx + 0.055, hyd - 0.05], 0.024, GOLD); break;
    case 'dagger': g.seg([hx, hyd + 0.02], [hx, hyd - 0.02], 0.02, WOOD); g.poly([[hx - 0.01, hyd - 0.03], [hx + 0.01, hyd - 0.03], [hx, up(0.15)]], blade); g.seg([hx - 0.025, hyd - 0.028], [hx + 0.025, hyd - 0.028], 0.016, GOLD); break;
    case 'axe': g.seg([hx, hyd + 0.07], [hx, up(0.38)], 0.022, WOOD); g.poly([[hx, up(0.36)], [hx + 0.05, up(0.4)], [hx + 0.1, up(0.43)], [hx + 0.085, up(0.3)], [hx + 0.1, up(0.2)], [hx + 0.05, up(0.25)], [hx, up(0.26)]], blade); break;
    case 'mace': g.seg([hx, hyd + 0.06], [hx, up(0.3)], 0.022, WOOD); g.ell(hx, up(0.33), 0.042, 0.048, STEEL); for (const s of [-1, 1]) g.tri([hx + s * 0.035, up(0.36)], [hx + s * 0.035, up(0.3)], [hx + s * 0.06, up(0.33)], STEEL); break;
    case 'spear': g.seg([hx, feet - 0.01], [hx, up(0.62)], 0.02, WOOD); g.poly([[hx - 0.022, up(0.6)], [hx, up(0.76)], [hx + 0.022, up(0.6)], [hx, up(0.58)]], blade); break;
    case 'staff': {
      const tip = Math.max(0.07, top + 0.04);
      g.curve([[hx, feet - 0.01], [hx + 0.005, (feet + tip) / 2], [hx - 0.004, tip + 0.03], [hx + 0.01, tip]], 0.024, WOOD);
      g.ell(hx + 0.005, tip - 0.02, 0.026, 0.028, hex('#4ab8d8'));
      g.glow(hx + 0.005, tip - 0.02, hex('#6fe3ff'), 3);
      break;
    }
    case 'bow': {
      const y0 = up(0.32), y1 = Math.min(feet - 0.02, hyd + 0.28), mid = (y0 + y1) / 2;
      g.seg([hx - 0.02, y0], [hx - 0.02, y1], 0.006, BONE, false);
      g.curve([[hx - 0.02, y0], [hx + 0.035, (y0 + mid) / 2], [hx + 0.055, mid], [hx + 0.035, (mid + y1) / 2], [hx - 0.02, y1]], 0.022, WOOD);
      break;
    }
    default: break;
  }

  // --- neck and head
  g.box(L(r * 0.38), hy + r * 0.6, R(r * 0.38), sy + 0.012, skinD);
  const earY = hy + r * 0.05;
  const ear = (dir: 1 | -1, len: number, lift: number) => g.tri([0.5 + dir * r * 0.8, earY - r * 0.2], [0.5 + dir * r * 0.82, earY + r * 0.28], [0.5 + dir * (r * 0.9 + len * k), earY - lift * k], skin);
  if (a.speciesId === 'elf') { ear(1, 0.05, 0.055); ear(-1, 0.05, 0.055); }
  else if (a.speciesId === 'gnome') { ear(1, 0.04, 0.02); ear(-1, 0.04, 0.02); }
  else if (a.speciesId === 'orc' || a.speciesId === 'tiefling' || a.speciesId === 'halfling') { ear(1, 0.026, 0.026); ear(-1, 0.026, 0.026); }
  else if (!scaly) { g.ell(L(r * 0.9), earY, r * 0.15, r * 0.24, skinD); g.ell(R(r * 0.9), earY, r * 0.15, r * 0.24, skinD); }
  const F = (w: number) => w * r; // face line widths follow the head

  if (scaly) {
    // A dragon's head seen from the front: cheek frills, a long tapering snout with nostrils, a heavy brow and swept-back horns.
    const scale = mix(skin, BLACK, 0.12), belly = mix(skin, hex('#e8d8a8'), 0.35);
    for (const dir of [1, -1] as const) {
      g.curve([[0.5 + dir * r * 0.45, hy - r * 0.7], [0.5 + dir * r * 0.85, hy - r * 1.25], [0.5 + dir * r * 1.05, hy - r * 1.75]], r * 0.28, mix(BONE, skinD, 0.3));
      g.tri([0.5 + dir * r * 0.62, hy - r * 0.2], [0.5 + dir * r * 0.62, hy + r * 0.45], [0.5 + dir * r * 1.2, hy + r * 0.25], scale);
    }
    g.ell(0.5, hy - r * 0.15, r * 0.78, r * 0.82, skin);
    g.poly([[L(r * 0.62), hy - r * 0.05], [R(r * 0.62), hy - r * 0.05], [R(r * 0.4), hy + r * 0.95], [R(r * 0.25), hy + r * 1.08], [L(r * 0.25), hy + r * 1.08], [L(r * 0.4), hy + r * 0.95]], skin);
    g.poly([[L(r * 0.3), hy + r * 0.62], [R(r * 0.3), hy + r * 0.62], [R(r * 0.22), hy + r * 1.05], [L(r * 0.22), hy + r * 1.05]], belly, false);
    for (const s of [-1, 1]) {
      g.flat(0.5 + s * r * 0.13, hy + r * 0.84, r * 0.05, r * 0.03, OUTLINE);
      g.fine([0.5 + s * r * 0.15, hy - r * 0.3], [0.5 + s * r * 0.62, hy - r * 0.18], F(0.09), mix(skin, BLACK, 0.5)); // brow ridge
      g.soft(0.5 + s * r * 0.34, hy - r * 0.04, r * 0.22, r * 0.14, mix(skin, BLACK, 0.5), 0.5); g.flat(0.5 + s * r * 0.34, hy - r * 0.02, r * 0.11, r * 0.06, hex('#d8a030'));
      g.fine([0.5 + s * r * 0.34, hy - r * 0.08], [0.5 + s * r * 0.34, hy + r * 0.04], F(0.035), OUTLINE, 1);
    }
    for (let i = 0; i < 3; i++) g.fine([L(r * (0.18 - i * 0.03)), hy + r * (0.2 + i * 0.18)], [R(r * (0.18 - i * 0.03)), hy + r * (0.2 + i * 0.18)], F(0.025), mix(skin, BLACK, 0.35), 0.6);
    if (look.hair !== 'bald') for (let i = -1; i <= 1; i++) g.tri([0.5 + i * r * 0.3 - 0.015, hy - r * 0.85], [0.5 + i * r * 0.3 + 0.015, hy - r * 0.85], [0.5 + i * r * 0.32, hy - r * 1.35], hair);
  } else {
    g.ell(0.5, hy, r * (female ? 0.88 : 0.93), r * 1.1, skin);
    if (!female && a.speciesId !== 'elf') g.soft(0.5, hy + r * 0.85, r * 0.6, r * 0.3, mix(skin, BLACK, 0.3), 0.25); // shadow under a firmer jaw
  }
  if (a.speciesId === 'tiefling') for (const dir of [1, -1] as const) g.curve([[0.5 + dir * r * 0.35, hy - r * 0.78], [0.5 + dir * r * 0.55, hy - r * 1.3], [0.5 + dir * r * 0.95, hy - r * 1.5], [0.5 + dir * r * 1.15, hy - r * 1.25]], r * 0.26, mix(BONE, BLACK, 0.5));
  if (a.speciesId === 'goliath') {
    const mark = mix(skin, BLACK, 0.5);
    g.fine([L(r * 0.5), hy - r * 0.55], [L(r * 0.2), hy - r * 0.3], F(0.06), mark);
    g.fine([R(r * 0.6), hy + r * 0.2], [R(r * 0.4), hy + r * 0.6], F(0.06), mark);
  }

  // --- face: brows, eyes, nose and mouth, so a portrait has an expression
  if (!scaly) {
    const iris = a.speciesId === 'tiefling' ? hex('#ff9a2e') : a.speciesId === 'orc' ? hex('#5a1c14') : a.speciesId === 'elf' ? hex('#3a5a4a') : hex('#3a2a1e');
    const ey = hy + r * 0.04, ex = r * 0.34;
    for (const s of [-1, 1]) {
      const x = 0.5 + s * ex;
      g.soft(x, ey - r * 0.02, r * 0.24, r * 0.14, mix(skin, BLACK, 0.4), 0.45); // the socket's shadow
      g.flat(x, ey, r * 0.12, r * 0.05, mix(skin, WHITE, 0.45));
      if (a.speciesId === 'tiefling') g.glow(x, ey, iris, 0.5);
      else g.flat(x + s * r * 0.01, ey, r * 0.05, r * 0.05, iris);
      g.fine([x - r * 0.14, ey - r * 0.035], [x + r * 0.14, ey - r * 0.045], F(0.04), OUTLINE); // upper lid
      g.fine([0.5 + s * r * 0.14, ey - r * 0.22], [0.5 + s * r * 0.55, ey - r * (female ? 0.27 : 0.2)], F(female ? 0.045 : 0.08), hairD); // brow
    }
    g.fine([0.5 + r * 0.02, ey + r * 0.05], [0.5 + r * 0.09, ey + r * 0.36], F(0.035), skinD);
    g.soft(0.5 + r * 0.03, ey + r * 0.4, r * 0.12, r * 0.05, mix(skin, BLACK, 0.45), 0.6); // under the nose
    g.fine([L(r * 0.2), hy + r * 0.66], [R(r * 0.2), hy + r * 0.64], F(0.05), mix(skinD, hex('#6a2a2a'), 0.35));
    g.soft(0.5, hy + r * 0.74, r * 0.13, r * 0.045, mix(skin, hex('#7a3a30'), 0.35), 0.5); // lower lip
    g.soft(L(r * 0.45), hy + r * 0.38, r * 0.2, r * 0.14, hex('#b05a48'), 0.12); // a little warmth on the cheeks
    g.soft(R(r * 0.45), hy + r * 0.38, r * 0.2, r * 0.14, hex('#b05a48'), 0.12);
  }
  if (a.speciesId === 'orc') for (const s of [-1, 1]) g.tri([0.5 + s * r * 0.3, hy + r * 0.7], [0.5 + s * r * 0.44, hy + r * 0.7], [0.5 + s * r * 0.4, hy + r * 0.38], BONE);

  // --- beard
  if (!scaly && look.beard !== 'none') {
    g.poly([[L(r * 0.92), hy + r * 0.15], [L(r * 0.72), hy + r * 0.88], [0.5, hy + r * 1.12], [R(r * 0.72), hy + r * 0.88], [R(r * 0.92), hy + r * 0.15], [R(r * 0.6), hy + r * 0.48], [R(r * 0.28), hy + r * 0.52], [0.5, hy + r * 0.46], [L(r * 0.28), hy + r * 0.52], [L(r * 0.6), hy + r * 0.48]], hair);
    g.hair([L(r * 0.3), hy + r * 0.66], [R(r * 0.3), hy + r * 0.64], hairD, 0.8);
    if (look.beard !== 'short') {
      const tip = Math.min(hip - 0.02, hy + r * 2.6);
      g.poly([[L(r * 0.78), hy + r * 0.75], [R(r * 0.78), hy + r * 0.75], [R(r * 0.35), tip - r * 0.3], [0.5, tip], [L(r * 0.35), tip - r * 0.3]], hair);
      g.hair([0.5, hy + r * 1.1], [0.5, tip - r * 0.2], hairD, 0.7);
      if (look.beard === 'braided') for (const s of [-1, 1]) { g.seg([0.5 + s * r * 0.3, hy + r * 1.3], [0.5 + s * r * 0.3, tip + 0.02], 0.022, hairD); g.dot(0.5 + s * r * 0.3, tip + 0.02, GOLD, 1.4); }
    }
  }

  // --- hair on top
  if (!scaly && look.hair !== 'bald') {
    g.poly([[L(r * 1.0), hy + r * 0.1], [L(r * 1.02), hy - r * 0.45], [L(r * 0.6), hy - r * 1.02], [R(r * 0.3), hy - r * 1.12], [R(r * 0.85), hy - r * 0.8], [R(r * 1.02), hy - r * 0.2], [R(r * 0.95), hy + r * 0.1], [R(r * 0.72), hy - r * 0.42], [L(r * 0.1), hy - r * 0.55], [L(r * 0.78), hy - r * 0.35]], hair);
    g.hair([L(r * 0.3), hy - r * 0.95], [R(r * 0.1), hy - r * 0.6], hairD, 0.7);
    if (look.hair === 'long') for (const s of [-1, 1]) g.poly([[0.5 + s * r * 0.82, hy - r * 0.3], [0.5 + s * r * 1.08, hy - r * 0.2], [0.5 + s * r * 1.2, sy + r * 0.9], [0.5 + s * r * 0.9, sy + r * 0.7]], hair);
    if (look.hair === 'braid') { g.curve([[R(r * 0.9), hy], [R(r * 1.2), sy], [R(r * 1.1), sy + r * 1.4]], r * 0.36, hair); g.dot(R(r * 1.1), sy + r * 1.5, GOLD, 1.4); }
    if (look.hair === 'topknot') { g.ell(0.5, hy - r * 1.25, r * 0.38, r * 0.34, hair); g.box(L(r * 0.18), hy - r * 1.02, R(r * 0.18), hy - r * 0.92, GOLD); }
    if (look.hair === 'wild') for (let i = -2; i <= 2; i++) g.tri([0.5 + i * r * 0.42 - 0.02, hy - r * 0.75], [0.5 + i * r * 0.42 + 0.02, hy - r * 0.75], [0.5 + i * r * 0.58, hy - r * (1.55 - Math.abs(i) * 0.15)], hair);
  }

  // --- engraving and the heavy outer line
  g.engrave(heroArtKey(a).length * 131 + S, { mute: weight > 1 ? 0.12 : 0.26 });
  g.outline(OUTLINE);
  return { c: g.canvas(), head: [0.5, hy], r, top: top - (look.hair === 'topknot' || a.speciesId === 'tiefling' || scaly ? r * 0.8 : 0), knee };
}

const figures = new Map<string, ReturnType<typeof draw>>();
function figure(a: HeroArt, S: number, weight = 1) {
  const k = `${heroArtKey(a)}|${S}|${weight}`;
  let f = figures.get(k);
  if (!f) { f = draw(a, S, weight); figures.set(k, f); }
  return f;
}

const canvases = new Map<string, HTMLCanvasElement>();

/** The battle-map token for a hero: the whole figure in a round brass frame, TOKEN_PX pixels square. */
export function heroCanvas(a: HeroArt): HTMLCanvasElement {
  const k = heroArtKey(a);
  let c = canvases.get(k);
  if (!c) {
    // Head to knees, so every hero fills the frame and reads at a glance on the map.
    const f = figure(a, TOKEN_PX * 2, 1.15);
    const y = Math.max(0, f.top - 0.03), size = Math.min(1 - y, Math.max(0.5, f.knee + 0.06 - y));
    c = framed(f.c, TOKEN_PX, 'hero', { x: 0.5 - size / 2, y, size });
    canvases.set(k, c);
  }
  return c;
}

const urls = new Map<string, string>();
const cached = (k: string, make: () => string) => { let u = urls.get(k); if (!u) { u = make(); urls.set(k, u); } return u; };

/** The whole hero, standing, on a transparent background: for the sheet, the inventory and the creator. */
export function heroUrl(a: HeroArt): string {
  return cached(`full|${heroArtKey(a)}`, () => figure(a, 256, 1).c.toDataURL());
}

/** Head and shoulders in a round brass frame: for the party panel, the lobby and hero tabs. */
export function heroPortraitUrl(a: HeroArt, size = 160): string {
  return cached(`bust|${size}|${heroArtKey(a)}`, () => {
    const f = figure(a, 512, 0.32);
    const half = Math.max(0.16, f.r * 2.05);
    const y = Math.max(0, Math.min(1 - half * 2, f.head[1] - half * 0.82));
    return framed(f.c, size, 'hero', { x: 0.5 - half, y, size: half * 2 }).toDataURL();
  });
}

/** A hero in play: the stored look and whatever they have equipped right now. */
export function artOfCharacter(c: Character, items?: Record<string, ItemDef>): HeroArt {
  const def = (slot: 'armor' | 'mainHand' | 'offHand') => (c.equipment[slot] ? itemDef(items, c.equipment[slot]!.defId) : null);
  return { speciesId: c.speciesId, gender: c.gender, classId: c.classId, look: heroLook(c), gear: heroGear(def('armor'), def('mainHand'), def('offHand')) };
}

/** A hero still being made, or a premade: the look so far and the gear of the chosen kit. */
export function artOfDraft(d: Draft): HeroArt | null {
  if (!d.classId) return null;
  const who = { speciesId: (d.speciesId ?? 'human') as SpeciesId, gender: (d.gender ?? 'neutral') as Gender, classId: d.classId as ClassId, name: d.name };
  const eq = buildSheet({ ...d, kit: d.kit ?? CLASS_GUIDE[d.classId].recKit })?.equipment ?? {};
  const def = (id?: string | null) => (id ? ITEMS[id] : null);
  const look: HeroLook = heroLook({ ...who, look: d.look });
  return { ...who, look, gear: heroGear(def(eq.armor), def(eq.mainHand), def(eq.offHand)) };
}
