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
import { INK, Ink, framed, hex, mix, seeded, type P, type RGB } from './ink';

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

/** How each class stands: casters hold up their focus, skirmishers crouch, guards brace behind the shield, brutes shoulder their weapon. */
type Stance = 'caster' | 'skirmisher' | 'guard' | 'brute' | 'plain';
const STANCE: Record<ClassId, Stance> = {
  wizard: 'caster', sorcerer: 'caster', warlock: 'caster', druid: 'caster', rogue: 'skirmisher', ranger: 'skirmisher', monk: 'skirmisher',
  fighter: 'guard', paladin: 'guard', cleric: 'guard', barbarian: 'brute', bard: 'plain',
};
/** The colour of the spell a caster holds in the off hand. */
const SPELL: Partial<Record<ClassId, string>> = { wizard: '#6fc3ff', sorcerer: '#ff9a3a', warlock: '#b46aff', druid: '#7ee07a' };

const hashStr = (s: string) => [...s].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) | 0, 17) >>> 0;

/** The hero alone on a transparent background, S pixels square, and where the head is (in parts of the picture). */
type View = { x: number; y: number; size: number };
function draw(a: HeroArt, S: number, weight: number, view?: (head: { r: number; hy: number }) => View): { c: HTMLCanvasElement; head: P; r: number; top: number; knee: number } {
  const b = BUILD[a.speciesId] ?? BUILD.human;
  const { look, gear } = a;
  // Small differences that stay with the hero: the jaw, the nose, the brows, a scar, freckles, a little height.
  const vr = seeded(hashStr(`${a.name ?? ''}|${a.speciesId}|${a.classId}`));
  const v = { jaw: 0.86 + vr() * 0.26, nose: 0.3 + vr() * 0.16, brow: 0.8 + vr() * 0.5, eye: 0.85 + vr() * 0.3, tall: 0.97 + vr() * 0.05, scar: vr(), freckles: vr(), mouth: vr() };
  const female = a.gender === 'female';
  const stance = gear.weapon === 'staff' && STANCE[a.classId] !== 'caster' ? 'plain' : STANCE[a.classId] ?? 'plain';
  const wide = b.wide - (female ? 0.018 : 0);
  const waist = wide * (female ? 0.7 : 0.8);
  const tall = b.tall * v.tall;
  const r = tall * b.head;
  const crouch = stance === 'skirmisher' ? 0.035 : stance === 'brute' ? 0.015 : 0;
  const feet = 0.955, top = feet - tall + crouch;
  const hy = top + r * 1.12; // centre of the head
  const sy = hy + r * 1.55; // shoulders
  const hip = sy + (feet - sy) * 0.44;
  const knee = hip + (feet - hip) * 0.5;
  const limb = Math.max(0.045, wide * 0.4);
  const k = b.tall / 0.84; // weapon lengths follow the hero's height
  const L = (x: number) => 0.5 - x, R = (x: number) => 0.5 + x;
  // A portrait paints only the head and shoulders, at full resolution, instead of cropping a small full figure.
  const g = new Ink(S, 1, weight, view?.({ r, hy }));

  const skin = hex(SKINS[look.skin] ?? SKINS.fair), skinD = mix(skin, BLACK, 0.3);
  const hair = hex(HAIR_COLORS[look.hairColor] ?? HAIR_COLORS.brown), hairD = mix(hair, BLACK, 0.35);
  const cloth = mix(hex(OUTFITS[look.color] ?? OUTFITS.red), hex('#6a5a48'), 0.15), clothD = mix(cloth, BLACK, 0.35), clothL = mix(cloth, WHITE, 0.25);
  const scaly = a.speciesId === 'dragonborn';
  const bare = gear.armor === 'none' && (a.classId === 'barbarian' || a.classId === 'monk'); // fighters without armour show skin and a wrap, not a robe
  const robe = gear.armor === 'none' && !bare;
  const heavy = gear.armor === 'heavy', medium = gear.armor === 'medium', light = gear.armor === 'light';
  const torso = heavy ? STEEL : medium ? mix(STEEL, LEATHER, 0.3) : light ? LEATHER : bare && a.classId === 'barbarian' ? skin : cloth;
  const torsoD = mix(torso, BLACK, 0.3);
  const legs = heavy ? mix(STEEL, BLACK, 0.15) : mix(LEATHER, BLACK, 0.3);
  const boot = mix(LEATHER, BLACK, 0.55);
  const skinMat = scaly ? 'scales' : 'skin';

  // --- where the hands go, by stance
  let handL: P = [L(wide + 0.045), hip + 0.015], handR: P = [R(wide + 0.05), hip];
  let dir: P = [0.12, -1]; // the way the weapon points from the right hand
  if (stance === 'caster') { handR = [R(wide + 0.07), sy + 0.07]; handL = [L(wide + 0.02), sy + (hip - sy) * 0.55]; dir = [0.02, -1]; }
  else if (stance === 'guard') { handR = [R(wide + 0.07), sy + 0.06]; if (gear.shield) handL = [L(wide * 0.55), (sy + hip) / 2 + 0.01]; dir = [0.42, -1]; }
  else if (stance === 'brute') { handR = [R(wide + 0.06), sy + 0.1]; handL = [L(wide + 0.07), hip - 0.04]; dir = [0.55, -1]; }
  else if (stance === 'skirmisher') { handR = [R(wide + 0.08), hip - 0.04]; handL = [L(wide + 0.05), hip - 0.03]; dir = [0.75, -0.7]; }
  if (gear.weapon === 'bow') { handR = [R(wide + 0.06), (sy + hip) / 2]; dir = [0, -1]; }
  if (gear.weapon === 'greatsword' || gear.weapon === 'axe') if (stance === 'guard') { handR = [R(wide + 0.06), sy + 0.1]; handL = [R(wide * 0.5), sy + 0.16]; dir = [0.3, -1]; }
  const dl = Math.hypot(dir[0], dir[1]);
  dir = [dir[0] / dl, dir[1] / dl];
  const nrm: P = [-dir[1], dir[0]];
  const along = (t: number, side = 0): P => [handR[0] + dir[0] * t * k + nrm[0] * side, handR[1] + dir[1] * t * k + nrm[1] * side];
  const spell = SPELL[a.classId] ? hex(SPELL[a.classId]!) : null;

  // --- behind the body: tail, cloak, hair that falls down the back, a weapon carried over the shoulder
  if (a.speciesId === 'tiefling') { g.mat = 'plain'; g.limb([[R(waist * 0.5), hip], [R(wide + 0.08), hip + 0.1], [R(wide + 0.15), hip + 0.02], [R(wide + 0.13), hip - 0.06]], [0.03, 0.026, 0.02, 0.012], skinD); }
  const cloak = a.classId === 'rogue' || a.classId === 'ranger' || a.classId === 'warlock' || a.classId === 'druid';
  if (cloak) { g.mat = 'cloth'; g.blob([[L(wide * 0.95), sy - 0.01], [R(wide * 0.95), sy - 0.01], [R(wide * 1.2), hip], [R(wide * 1.32), feet - 0.05], [R(wide * 0.5), feet - 0.03], [L(wide * 0.4), feet - 0.02], [L(wide * 1.35), feet - 0.06], [L(wide * 1.2), hip]], clothD); }
  if (!scaly && (look.hair === 'long' || look.hair === 'wild')) {
    g.mat = 'hair';
    if (look.hair === 'long') g.blob([[L(r * 1.1), hy - r * 0.6], [R(r * 1.1), hy - r * 0.6], [R(r * 1.25), sy + r * 0.4], [R(r * 1.1), sy + r * 1.3], [L(r * 1.1), sy + r * 1.3], [L(r * 1.25), sy + r * 0.4]], hairD);
    else g.blob([[L(r * 1.3), hy], [L(r * 1.0), hy - r * 1.2], [R(r * 1.0), hy - r * 1.2], [R(r * 1.3), hy], [R(r * 0.9), hy + r * 1.0], [L(r * 0.9), hy + r * 1.0]], hairD);
  }

  // --- legs, or the skirt of a robe
  const spread = stance === 'skirmisher' ? 1.35 : stance === 'brute' || stance === 'guard' ? 1.15 : 1;
  if (robe) {
    g.mat = 'cloth';
    g.blob([[L(waist), hip - 0.03], [R(waist), hip - 0.03], [R(wide * 1.0), knee], [R(wide * 1.18), feet - 0.03], [0.5, feet - 0.015], [L(wide * 1.18), feet - 0.03], [L(wide * 1.0), knee]], cloth, true, 0.6);
    g.fineCurve([[0.5 - wide * 0.15, hip + 0.04], [0.5 - wide * 0.25, knee], [0.5 - wide * 0.35, feet - 0.04]], 0.006, clothD, 0.7);
    g.fineCurve([[0.5 + wide * 0.35, hip + 0.04], [0.5 + wide * 0.5, knee], [0.5 + wide * 0.65, feet - 0.04]], 0.006, clothD, 0.7);
    g.mat = 'leather';
    g.ell(L(wide * 0.42), feet - 0.012, wide * 0.36, 0.022, boot);
    g.ell(R(wide * 0.42), feet - 0.012, wide * 0.36, 0.022, boot);
  } else {
    for (const s of [-1, 1]) {
      const hx = 0.5 + s * waist * 0.55, fx = 0.5 + s * waist * 0.62 * spread, kx = (hx + fx) / 2 + (crouch ? s * limb * 0.4 : 0);
      g.mat = heavy ? 'metal' : 'leather';
      g.limb([[hx, hip - 0.02], [kx, knee + crouch * 0.4], [fx, feet - 0.05]], [limb * 1.35, limb * 0.95, limb * 0.72], legs);
      g.mat = 'leather';
      g.blob([[fx - limb * 0.6, knee + 0.05], [fx + limb * 0.6, knee + 0.05], [fx + limb * 0.55, feet - 0.03], [fx + s * limb * 0.1 + limb * 0.4, feet], [fx - limb * 0.8, feet], [fx - limb * 0.62, feet - 0.03]], boot, true, 0.7);
      g.fine([fx - limb * 0.62, knee + 0.06], [fx + limb * 0.6, knee + 0.055], 0.004, mix(boot, WHITE, 0.25), 0.7);
      if (heavy) { g.mat = 'metal'; g.ell(kx, knee + crouch * 0.4, limb * 0.5, limb * 0.42, STEEL); }
    }
  }

  // --- hands: a fist closed round a grip (fingers across the shaft, thumb on top), or an open palm holding a spell
  const handC = heavy ? STEEL : skin, handD = mix(handC, BLACK, 0.45);
  const fist = (hd: P, d: P) => {
    const a = limb * 0.42, b = limb * 0.55, nn: P = [-d[1], d[0]];
    const q = (t: number, sd: number): P => [hd[0] + d[0] * t + nn[0] * sd, hd[1] + 0.004 + d[1] * t + nn[1] * sd];
    g.mat = heavy ? 'metal' : skinMat;
    g.blob([q(-a, -b), q(a, -b * 0.95), q(a * 1.1, b * 0.85), q(0, b * 1.05), q(-a * 1.1, b * 0.85)], handC, true, 0.7);
    for (const t of [-0.55, 0, 0.55]) g.fine(q(t * a, -b * 0.15), q(t * a * 1.05, b * 0.8), 0.0035, handD, 0.75); // the fingers
    g.ell(...q(a * 0.75, -b * 0.75), limb * 0.2, limb * 0.17, handC); // thumb
  };
  const openHand = (hd: P) => {
    g.mat = heavy ? 'metal' : skinMat;
    for (let i = 0; i < 4; i++) g.limb([[hd[0] + (i - 1.5) * limb * 0.2, hd[1] - limb * 0.15], [hd[0] + (i - 1.5) * limb * 0.3, hd[1] - limb * (0.62 + (i === 1 || i === 2 ? 0.12 : 0))]], [limb * 0.2, limb * 0.15], handC);
    g.ell(hd[0], hd[1], limb * 0.45, limb * 0.4, handC);
    g.limb([[hd[0] + limb * 0.3, hd[1]], [hd[0] + limb * 0.62, hd[1] - limb * 0.3]], [limb * 0.2, limb * 0.15], handC); // thumb
  };

  // --- the off-hand arm behind the torso when it reaches across
  const shL: P = [L(wide * 0.9), sy + 0.035], shR: P = [R(wide * 0.9), sy + 0.035];
  const sleeve = heavy ? torsoD : robe ? clothD : bare ? skin : medium ? clothD : torsoD;
  const sleeveMat = heavy ? 'metal' : bare ? skinMat : robe || medium ? 'cloth' : 'leather';
  const arm = (sh: P, hd: P, out: number) => {
    const el: P = [(sh[0] + hd[0]) / 2 + out, (sh[1] + hd[1]) / 2 + 0.01];
    g.mat = sleeveMat;
    g.limb([sh, el, hd], [limb * 1.15, limb * 0.9, limb * 0.72], sleeve);
    if (robe) { g.mat = 'cloth'; g.blob([[hd[0] - limb * 0.7, hd[1] - 0.045], [hd[0] + limb * 0.7, hd[1] - 0.045], [hd[0] + limb * 0.8, hd[1] - 0.005], [hd[0] - limb * 0.8, hd[1] - 0.005]], clothD); }
    else if (heavy) { g.mat = 'metal'; g.ell(el[0], el[1], limb * 0.5, limb * 0.45, STEEL); g.blob([[hd[0] - limb * 0.6, hd[1] - 0.05], [hd[0] + limb * 0.6, hd[1] - 0.05], [hd[0] + limb * 0.65, hd[1] - 0.01], [hd[0] - limb * 0.65, hd[1] - 0.01]], STEEL); }
    else { g.mat = 'leather'; g.blob([[hd[0] - limb * 0.55, hd[1] - 0.05], [hd[0] + limb * 0.55, hd[1] - 0.05], [hd[0] + limb * 0.6, hd[1] - 0.012], [hd[0] - limb * 0.6, hd[1] - 0.012]], mix(LEATHER, BLACK, 0.3)); }
    if (hd === handL && stance === 'caster' && !gear.shield) openHand(hd);
    else fist(hd, hd === handR ? dir : [0, 1]);
  };
  const leftAcross = stance === 'guard' && gear.shield;
  
  // --- weapons carried behind the body (over the shoulder)
  const drawWeapon = () => {
    const blade = mix(STEEL, WHITE, 0.2);
    switch (gear.weapon) {
      case 'sword': case 'greatsword': case 'dagger': {
        const len = gear.weapon === 'greatsword' ? 0.56 : gear.weapon === 'dagger' ? 0.15 : 0.35, bw = gear.weapon === 'greatsword' ? 0.018 : gear.weapon === 'dagger' ? 0.011 : 0.014;
        g.mat = 'leather'; g.seg(along(-0.04), along(0.035), 0.024, WOOD);
        g.mat = 'metal'; g.ell(...along(-0.05), 0.014, 0.014, GOLD);
        g.poly([along(0.05, bw), along(len, bw * 0.75), along(len + 0.035), along(len, -bw * 0.75), along(0.05, -bw)], blade);
        g.fine(along(0.06), along(len - 0.01), 0.003, mix(STEEL, BLACK, 0.3), 0.6);
        g.seg(along(0.04, 0.045), along(0.04, -0.045), 0.02, GOLD);
        break;
      }
      case 'axe':
        g.mat = 'wood'; g.seg(along(-0.08), along(0.4), 0.022, WOOD);
        g.mat = 'metal'; g.blob([along(0.29, 0.005), along(0.27, 0.06), along(0.25, 0.1), along(0.35, 0.115), along(0.45, 0.1), along(0.43, 0.06), along(0.41, 0.005)], blade);
        break;
      case 'mace':
        g.mat = 'wood'; g.seg(along(-0.06), along(0.3), 0.022, WOOD);
        g.mat = 'metal'; for (const s of [-1, 1]) g.tri(along(0.29, s * 0.03), along(0.39, s * 0.03), along(0.34, s * 0.06), STEEL);
        g.ell(...along(0.34), 0.04, 0.046, STEEL);
        break;
      case 'spear':
        g.mat = 'wood'; g.seg(along(-0.3), along(0.62), 0.02, WOOD);
        g.mat = 'metal'; g.poly([along(0.6, 0.022), along(0.76), along(0.6, -0.022), along(0.58)], blade);
        break;
      case 'staff': {
        g.mat = 'wood'; g.curve([along(-0.5), along(-0.1, 0.006), along(0.25, -0.004), along(0.44)], 0.024, WOOD);
        const tip = along(0.47);
        g.mat = 'plain'; g.ell(tip[0], tip[1], 0.026, 0.028, spell ? mix(spell, BLACK, 0.3) : hex('#4ab8d8'));
        g.glow(tip[0], tip[1], spell ?? hex('#6fe3ff'), 3);
        break;
      }
      case 'bow': {
        const y0 = Math.max(0.05, handR[1] - 0.3 * k), y1 = Math.min(feet - 0.02, handR[1] + 0.28 * k), mid = (y0 + y1) / 2, hx = handR[0];
        g.seg([hx - 0.02, y0], [hx - 0.02, y1], 0.006, BONE, false);
        g.mat = 'wood'; g.curve([[hx - 0.02, y0], [hx + 0.035, (y0 + mid) / 2], [hx + 0.055, mid], [hx + 0.035, (mid + y1) / 2], [hx - 0.02, y1]], 0.022, WOOD);
        break;
      }
      default: break;
    }
  };
  if (stance === 'guard' && (gear.weapon === 'greatsword' || gear.weapon === 'axe')) drawWeapon();

  // --- torso, tapering from the shoulders to the waist, with the hero's colour on it
  g.mat = heavy ? 'metal' : medium ? 'chain' : light ? 'leather' : bare && a.classId === 'barbarian' ? skinMat : 'cloth';
  g.blob([[L(wide * 1.02), sy + 0.005], [L(wide * 0.5), sy - 0.012], [R(wide * 0.5), sy - 0.012], [R(wide * 1.02), sy + 0.005], [R(wide * 0.95), sy + (hip - sy) * 0.45], [R(waist), hip], [L(waist), hip], [L(wide * 0.95), sy + (hip - sy) * 0.45]], torso, true, 0.8);
  if (heavy) {
    g.mat = 'metal';
    g.blob([[L(wide * 0.66), sy + 0.02], [R(wide * 0.66), sy + 0.02], [R(waist * 0.72), hip - 0.06], [0.5, hip - 0.03], [L(waist * 0.72), hip - 0.06]], mix(STEEL, WHITE, 0.08));
    g.fineCurve([[0.5, sy + 0.03], [0.5 + 0.004, (sy + hip) / 2], [0.5, hip - 0.04]], 0.004, torsoD, 0.8);
    g.mat = 'cloth'; g.poly([[L(waist * 0.85), hip - 0.015], [R(waist * 0.85), hip - 0.015], [R(waist * 0.5), hip + 0.08], [L(waist * 0.5), hip + 0.08]], cloth); // tabard
  } else if (medium) {
    g.mat = 'cloth';
    g.blob([[L(wide * 0.5), sy + 0.004], [R(wide * 0.5), sy + 0.004], [R(waist * 0.5), hip - 0.02], [L(waist * 0.5), hip - 0.02]], cloth, true, 0.5);
  } else if (light) {
    g.mat = 'cloth'; g.poly([[L(wide * 0.38), sy - 0.005], [R(wide * 0.38), sy - 0.005], [0.5, sy + (hip - sy) * 0.42]], cloth);
    for (const y of [0.4, 0.62]) g.fineCurve([[L(wide * 0.85), sy + (hip - sy) * y], [0.5, sy + (hip - sy) * y + 0.008], [R(wide * 0.85), sy + (hip - sy) * y]], 0.004, torsoD, 0.7);
    g.mat = 'metal'; for (const s of [-1, 1]) for (let i = 0; i < 3; i++) g.dot(0.5 + s * wide * 0.55, sy + (hip - sy) * (0.25 + i * 0.22), mix(STEEL, WHITE, 0.2), 0.8);
  } else if (bare && a.classId === 'barbarian') {
    // Bare chest: the line of the muscles, a strap across, a fur mantle on the shoulders.
    g.fineCurve([[L(wide * 0.7), sy + (hip - sy) * 0.38], [L(wide * 0.2), sy + (hip - sy) * 0.45], [0.5, sy + (hip - sy) * 0.36], [R(wide * 0.2), sy + (hip - sy) * 0.45], [R(wide * 0.7), sy + (hip - sy) * 0.38]], 0.005, skinD, 0.8);
    g.fine([0.5, sy + (hip - sy) * 0.5], [0.5, hip - 0.04], 0.004, skinD, 0.6);
    g.mat = 'leather'; g.seg([L(wide * 0.8), sy + 0.01], [R(wide * 0.75), hip - 0.04], 0.022, mix(LEATHER, BLACK, 0.35));
    g.mat = 'fur'; g.blob([[L(wide * 1.12), sy + 0.02], [L(wide * 0.6), sy - 0.03], [R(wide * 0.6), sy - 0.03], [R(wide * 1.12), sy + 0.02], [R(wide * 0.9), sy + 0.06], [L(wide * 0.9), sy + 0.06]], hex('#7a6248'));
  } else {
    g.mat = 'cloth';
    g.poly([[L(wide * 0.3), sy - 0.01], [R(wide * 0.3), sy - 0.01], [R(0.015), hip - 0.02], [L(0.015), hip - 0.02]], clothL);
    g.fineCurve([[L(wide * 0.6), sy + 0.03], [L(wide * 0.45), (sy + hip) / 2], [L(wide * 0.5), hip - 0.02]], 0.004, clothD, 0.6);
  }
  g.mat = 'leather';
  g.blob([[L(waist * 1.04), hip - 0.032], [R(waist * 1.04), hip - 0.032], [R(waist * 1.04), hip + 0.003], [L(waist * 1.04), hip + 0.003]], robe ? GOLD : mix(LEATHER, BLACK, 0.5), true, 0.4);
  g.mat = 'metal'; g.box(L(0.018), hip - 0.034, R(0.018), hip + 0.005, GOLD);
  if (heavy) {
    g.mat = 'metal';
    for (const s of [-1, 1]) g.blob([[0.5 + s * wide * 0.55, sy - 0.005], [0.5 + s * wide * 0.95, sy - 0.02], [0.5 + s * (wide + limb * 0.75), sy + 0.03], [0.5 + s * (wide + limb * 0.6), sy + 0.06], [0.5 + s * wide * 0.6, sy + 0.045]], s < 0 ? STEEL : mix(STEEL, BLACK, 0.1));
  } else if (cloak) {
    g.mat = 'cloth';
    g.blob([[L(wide * 1.05), sy + 0.0], [L(wide * 0.6), sy - 0.02], [R(wide * 0.6), sy - 0.02], [R(wide * 1.05), sy + 0.0], [R(wide * 0.8), sy + 0.065], [0.5, sy + 0.085], [L(wide * 0.8), sy + 0.065]], clothD); // mantle
    g.mat = 'metal'; g.ell(0.5, sy + 0.055, 0.014, 0.014, GOLD);
  }
  if (a.classId === 'cleric' || a.classId === 'paladin') {
    const cy = sy + (hip - sy) * 0.42;
    g.mat = 'metal'; g.seg([0.5, cy - 0.035], [0.5, cy + 0.035], 0.016, GOLD, false); g.seg([0.5 - 0.025, cy - 0.01], [0.5 + 0.025, cy - 0.01], 0.016, GOLD, false);
  }

  // --- arms in front
  arm(shL, handL, leftAcross ? 0.04 : -0.025);
  arm(shR, handR, stance === 'caster' ? 0.05 : stance === 'guard' ? 0.05 : 0.025);

  // --- the shield, carried before the body by a guard
  if (gear.shield) {
    const cx = leftAcross ? L(wide * 0.45) : L(wide + 0.06), cy = (sy + hip) / 2 + 0.03;
    const sx = 0.1 * k, syy = 0.125 * k;
    g.mat = 'metal'; g.blob([[cx - sx, cy - syy * 0.85], [cx, cy - syy], [cx + sx, cy - syy * 0.85], [cx + sx * 0.9, cy + syy * 0.15], [cx, cy + syy], [cx - sx * 0.9, cy + syy * 0.15]], mix(STEEL, BLACK, 0.15), true, 0.7);
    g.mat = 'wood'; g.blob([[cx - sx * 0.8, cy - syy * 0.7], [cx, cy - syy * 0.82], [cx + sx * 0.8, cy - syy * 0.7], [cx + sx * 0.72, cy + syy * 0.12], [cx, cy + syy * 0.8], [cx - sx * 0.72, cy + syy * 0.12]], cloth, false, 0.7);
    g.fine([cx, cy - syy * 0.8], [cx, cy + syy * 0.78], 0.006, clothL, 0.7);
    g.fine([cx - sx * 0.75, cy - syy * 0.25], [cx + sx * 0.75, cy - syy * 0.25], 0.006, clothL, 0.7);
    g.mat = 'metal'; g.ell(cx, cy - syy * 0.25, 0.022 * k, 0.022 * k, GOLD);
  }
  if (!(stance === 'guard' && (gear.weapon === 'greatsword' || gear.weapon === 'axe'))) drawWeapon();
  // The fingers close over the grip, in front of the weapon.
  if (gear.weapon && gear.weapon !== 'none') fist(handR, dir);
  // A spell held ready in the off hand.
  if (stance === 'caster' && spell && !gear.shield) g.glow(handL[0], handL[1] - 0.025, spell, 3.2);

  // --- neck and head
  g.mat = skinMat;
  g.limb([[0.5, hy + r * 0.5], [0.5, sy - 0.002]], [r * 0.82, r * 1.1], skinD);
  g.mat = 'plain'; g.soft(0.5, hy + r * 1.12, r * 0.42, r * 0.16, mix(skin, BLACK, 0.55), 0.55); g.mat = skinMat; // the jaw's shadow on the neck
  const turn = r * 0.1; // faces are turned a little to the right, three-quarter
  const earY = hy + r * 0.05;
  const ear = (dir: 1 | -1, len: number, lift: number) => g.blob([[0.5 + dir * r * 0.78, earY - r * 0.2], [0.5 + dir * (r * 0.9 + len * k * 0.7), earY - lift * k * 0.6], [0.5 + dir * (r * 0.9 + len * k), earY - lift * k], [0.5 + dir * r * 0.92, earY + r * 0.25], [0.5 + dir * r * 0.78, earY + r * 0.25]], skin, true, 0.5);
  if (a.speciesId === 'elf') { ear(-1, 0.05, 0.055); ear(1, 0.035, 0.05); }
  else if (a.speciesId === 'gnome') { ear(-1, 0.04, 0.02); ear(1, 0.03, 0.02); }
  else if (a.speciesId === 'orc' || a.speciesId === 'tiefling' || a.speciesId === 'halfling') { ear(-1, 0.026, 0.026); ear(1, 0.018, 0.02); }
  else if (!scaly) g.ell(L(r * 0.88), earY, r * 0.15, r * 0.24, skinD);
  const F = (w: number) => w * r; // face line widths follow the head

  if (scaly) {
    // A dragon's head seen from the front: cheek frills, a long tapering snout with nostrils, a heavy brow and swept-back horns.
    const scale = mix(skin, BLACK, 0.12), belly = mix(skin, hex('#e8d8a8'), 0.35);
    g.mat = 'bone';
    for (const dir of [1, -1] as const) g.limb([[0.5 + dir * r * 0.4, hy - r * 0.65], [0.5 + dir * r * 0.85, hy - r * 1.2], [0.5 + dir * r * 1.1, hy - r * 1.75]], [r * 0.32, r * 0.24, r * 0.06], mix(BONE, skinD, 0.3));
    g.mat = 'scales';
    for (const dir of [1, -1] as const) g.blob([[0.5 + dir * r * 0.6, hy - r * 0.25], [0.5 + dir * r * 1.25, hy + r * 0.15], [0.5 + dir * r * 0.95, hy + r * 0.35], [0.5 + dir * r * 0.6, hy + r * 0.45]], scale, true, 0.5);
    g.blob([[L(r * 0.7), hy - r * 0.35], [L(r * 0.45), hy - r * 0.95], [R(r * 0.45), hy - r * 0.95], [R(r * 0.7), hy - r * 0.35], [R(r * 0.42), hy + r * 0.95], [R(turn), hy + r * 1.1], [L(r * 0.38), hy + r * 0.95]], skin, true, 0.8);
    g.mat = 'plain';
    g.blob([[L(r * 0.28), hy + r * 0.6], [R(r * 0.32), hy + r * 0.6], [R(r * 0.22), hy + r * 1.03], [L(r * 0.18), hy + r * 1.03]], belly, false, 0.6);
    for (const s of [-1, 1]) {
      g.flat(0.5 + turn + s * r * 0.13, hy + r * 0.82, r * 0.05, r * 0.03, OUTLINE);
      g.fineCurve([[0.5 + turn + s * r * 0.12, hy - r * 0.32], [0.5 + turn + s * r * 0.4, hy - r * 0.3], [0.5 + turn + s * r * 0.62, hy - r * 0.16]], F(0.09), mix(skin, BLACK, 0.5));
      g.soft(0.5 + turn + s * r * 0.34, hy - r * 0.04, r * 0.22, r * 0.14, mix(skin, BLACK, 0.5), 0.5);
      g.flat(0.5 + turn + s * r * 0.34, hy - r * 0.02, r * 0.11 * (s > 0 ? 0.85 : 1), r * 0.06, hex('#d8a030'));
      g.fine([0.5 + turn + s * r * 0.34, hy - r * 0.08], [0.5 + turn + s * r * 0.34, hy + r * 0.04], F(0.035), OUTLINE, 1);
    }
    g.fineCurve([[L(r * 0.35), hy + r * 0.93], [0.5 + turn, hy + r * 0.98], [R(r * 0.4), hy + r * 0.9]], F(0.04), mix(skin, BLACK, 0.5));
    if (look.hair !== 'bald') { g.mat = 'hair'; for (let i = -1; i <= 1; i++) g.limb([[0.5 + i * r * 0.3, hy - r * 0.8], [0.5 + i * r * 0.34, hy - r * 1.4]], [r * 0.2, r * 0.02], hair); }
  } else {
    // Skull and jaw in one smooth outline; the jaw's width is the hero's own.
    const j = v.jaw * (female ? 0.85 : 1);
    g.blob([[L(r * 0.92), hy - r * 0.1], [L(r * 0.78), hy - r * 0.8], [0.5, hy - r * 1.08], [R(r * 0.8), hy - r * 0.8], [R(r * 0.94), hy - r * 0.1], [R(r * 0.72 * j), hy + r * 0.62], [R(turn + r * 0.2), hy + r * 1.08], [L(r * 0.22 - turn), hy + r * 1.06], [L(r * 0.7 * j), hy + r * 0.62]], skin, true, 0.85);
    if (!female && a.speciesId !== 'elf') g.soft(0.5 + turn, hy + r * 0.88, r * 0.55, r * 0.25, mix(skin, BLACK, 0.3), 0.25); // shadow under the jaw
    g.soft(R(r * 0.7), hy + r * 0.2, r * 0.3, r * 0.6, mix(skin, BLACK, 0.4), 0.25); // the far cheek turns away
  }
  if (a.speciesId === 'tiefling') { g.mat = 'bone'; for (const dir of [1, -1] as const) g.limb([[0.5 + dir * r * 0.35, hy - r * 0.78], [0.5 + dir * r * 0.55, hy - r * 1.32], [0.5 + dir * r * 0.95, hy - r * 1.52], [0.5 + dir * r * 1.18, hy - r * 1.25]], [r * 0.32, r * 0.26, r * 0.18, r * 0.05], mix(BONE, BLACK, 0.5)); }
  if (a.speciesId === 'goliath') {
    const mark = mix(skin, BLACK, 0.5);
    g.fineCurve([[L(r * 0.5), hy - r * 0.55], [L(r * 0.3), hy - r * 0.42], [L(r * 0.2), hy - r * 0.25]], F(0.06), mark);
    g.fineCurve([[R(r * 0.6), hy + r * 0.2], [R(r * 0.48), hy + r * 0.4], [R(r * 0.4), hy + r * 0.6]], F(0.06), mark);
  }

  // --- face: brows, eyes, nose and mouth, turned three-quarter so a portrait has an expression
  if (!scaly) {
    const iris = a.speciesId === 'tiefling' ? hex('#ff9a2e') : a.speciesId === 'orc' ? hex('#5a1c14') : a.speciesId === 'elf' ? hex('#3a5a4a') : hex('#3a2a1e');
    const ey = hy + r * 0.04, ex = r * 0.33;
    // The mood of the class: guards and brutes frown, skirmishers raise one brow and smirk, casters and bards are calm or smiling.
    const mood = stance === 'guard' || stance === 'brute' ? 'grim' : stance === 'skirmisher' ? 'sly' : 'calm';
    for (const s of [-1, 1]) {
      const far = s > 0, x = 0.5 + turn + s * ex * (far ? 0.88 : 1), es = v.eye * (far ? 0.85 : 1);
      g.soft(x, ey - r * 0.02, r * 0.24 * es, r * 0.14, mix(skin, BLACK, 0.4), 0.45); // the socket's shadow
      g.flat(x, ey, r * 0.12 * es, r * 0.05 * v.eye, mix(skin, WHITE, 0.45));
      if (a.speciesId === 'tiefling') g.glow(x, ey, iris, 0.5);
      else { g.flat(x + r * 0.02, ey, r * 0.05 * v.eye, r * 0.05 * v.eye, iris); g.flat(x + r * 0.005, ey - r * 0.015, r * 0.014, r * 0.014, mix(WHITE, iris, 0.2)); }
      g.fineCurve([[x - r * 0.14 * es, ey - r * 0.01], [x, ey - r * 0.06], [x + r * 0.14 * es, ey - r * 0.03]], F(0.04), OUTLINE); // upper lid
      g.fineCurve([[x - r * 0.12 * es, ey + r * 0.045], [x + r * 0.1 * es, ey + r * 0.035]], F(0.022), mix(skin, BLACK, 0.45), 0.6); // lower lid
      const inner = mood === 'grim' ? 0.13 : mood === 'sly' && far ? 0.27 : 0.2, peak = mood === 'grim' ? 0.22 : mood === 'sly' && far ? 0.34 : female ? 0.29 : 0.25;
      g.fineCurve([[0.5 + turn + s * r * 0.12, ey - r * inner], [0.5 + turn + s * r * 0.34, ey - r * peak], [0.5 + turn + s * r * 0.56 * (far ? 0.9 : 1), ey - r * (female ? 0.24 : 0.2)]], F((female ? 0.045 : 0.075) * v.brow), hairD); // brow
      if (mood === 'grim' && !female) g.fineCurve([[0.5 + turn + s * r * 0.08, ey - r * 0.17], [0.5 + turn + s * r * 0.05, ey - r * 0.27]], F(0.025), mix(skin, BLACK, 0.4), 0.55); // furrow
    }
    const nl = v.nose;
    g.fineCurve([[0.5 + turn + r * 0.03, ey + r * 0.02], [0.5 + turn + r * 0.1, ey + nl * r * 0.7], [0.5 + turn + r * 0.13, ey + nl * r]], F(0.035), skinD);
    g.fineCurve([[0.5 + turn + r * 0.13, ey + nl * r], [0.5 + turn + r * 0.04, ey + nl * r + r * 0.06], [0.5 + turn - r * 0.06, ey + nl * r + r * 0.02]], F(0.03), skinD);
    g.soft(0.5 + turn + r * 0.03, ey + nl * r + r * 0.07, r * 0.12, r * 0.045, mix(skin, BLACK, 0.45), 0.55); // under the nose
    const my = hy + r * 0.64, smile = ((v.mouth - 0.5) * 0.04 + (mood === 'calm' ? 0.05 : mood === 'grim' ? -0.035 : 0)) * r;
    const lipC = mix(skinD, hex('#6a2a2a'), 0.35);
    if (stance === 'brute') {
      // Teeth bared in a battle grin.
      g.blob([[0.5 + turn - r * 0.2, my - r * 0.01], [0.5 + turn + r * 0.18, my - r * 0.02], [0.5 + turn + r * 0.13, my + r * 0.07], [0.5 + turn - r * 0.15, my + r * 0.07]], hex('#e8e0cc'), true, 0.6);
      g.fine([0.5 + turn - r * 0.17, my + r * 0.03], [0.5 + turn + r * 0.15, my + r * 0.025], F(0.02), mix(skin, BLACK, 0.5), 0.6);
    } else if (mood === 'sly') g.fineCurve([[0.5 + turn - r * 0.19, my + r * 0.01], [0.5 + turn, my + r * 0.015], [0.5 + turn + r * 0.19, my - r * 0.05]], F(0.045), lipC);
    else g.fineCurve([[0.5 + turn - r * 0.2, my - smile * 0.6], [0.5 + turn, my + r * 0.015 + Math.max(0, smile) * 0.4], [0.5 + turn + r * 0.18, my - smile]], F(0.045), lipC);
    if (!female && (mood === 'grim' || v.jaw > 1.02)) for (const sd of [-1, 1]) g.fineCurve([[0.5 + turn + sd * r * 0.2, ey + nl * r + r * 0.02], [0.5 + turn + sd * r * 0.27, my - r * 0.02]], F(0.025), mix(skin, BLACK, 0.35), 0.45); // lines from nose to mouth
    g.soft(0.5 + turn, my + r * 0.1, r * 0.13, r * 0.045, mix(skin, hex('#7a3a30'), 0.35), 0.5); // lower lip
    g.soft(L(r * 0.42) + turn, hy + r * 0.38, r * 0.2, r * 0.14, hex('#b05a48'), 0.12); // a little warmth on the cheeks
    if (v.freckles > 0.7 && (look.skin === 'fair' || look.skin === 'porcelain' || look.skin === 'tan')) {
      const fr = seeded(hashStr(a.name ?? 'x'));
      for (let n = 0; n < 14; n++) g.flat(0.5 + turn + (fr() - 0.5) * r * 0.9, hy + r * (0.2 + fr() * 0.25), r * 0.018, r * 0.018, mix(skin, hex('#8a4a2a'), 0.45));
    }
    if (v.scar > 0.62 && (a.classId === 'fighter' || a.classId === 'barbarian' || a.classId === 'rogue' || a.classId === 'paladin')) {
      g.fineCurve([[L(r * 0.55) + turn, hy - r * 0.35], [L(r * 0.38) + turn, hy + r * 0.05], [L(r * 0.3) + turn, hy + r * 0.38]], F(0.05), mix(skin, hex('#7a3a30'), 0.5));
      g.fineCurve([[L(r * 0.5) + turn, hy - r * 0.2], [L(r * 0.36) + turn, hy - r * 0.18]], F(0.03), mix(skin, hex('#7a3a30'), 0.4), 0.7);
    }
  }
  if (a.speciesId === 'orc') { g.mat = 'bone'; for (const s of [-1, 1]) g.tri([0.5 + turn + s * r * 0.28, hy + r * 0.72], [0.5 + turn + s * r * 0.4, hy + r * 0.72], [0.5 + turn + s * r * 0.36, hy + r * 0.44], BONE); }

  // --- beard
  if (!scaly && look.beard !== 'none') {
    g.mat = 'hair';
    g.blob([[L(r * 0.92), hy + r * 0.12], [L(r * 0.72), hy + r * 0.88], [0.5 + turn, hy + r * 1.15], [R(r * 0.74), hy + r * 0.88], [R(r * 0.94), hy + r * 0.12], [R(r * 0.6), hy + r * 0.5], [0.5 + turn + r * 0.25, hy + r * 0.56], [0.5 + turn, hy + r * 0.5], [0.5 + turn - r * 0.25, hy + r * 0.56], [L(r * 0.6), hy + r * 0.5]], hair, true, 0.7);
    g.fineCurve([[0.5 + turn - r * 0.3, hy + r * 0.68], [0.5 + turn, hy + r * 0.72], [0.5 + turn + r * 0.3, hy + r * 0.66]], F(0.05), hairD);
    if (look.beard !== 'short') {
      const tip = Math.min(hip - 0.02, hy + r * 2.6);
      g.blob([[L(r * 0.78), hy + r * 0.75], [R(r * 0.78), hy + r * 0.75], [R(r * 0.45), tip - r * 0.5], [0.5 + turn, tip], [L(r * 0.45), tip - r * 0.5]], hair, true, 0.8);
      if (look.beard === 'braided') for (const s of [-1, 1]) { g.limb([[0.5 + s * r * 0.3, hy + r * 1.3], [0.5 + s * r * 0.32, tip + 0.02]], [r * 0.24, r * 0.16], hairD); g.mat = 'metal'; g.dot(0.5 + s * r * 0.32, tip + 0.02, GOLD, 1.4); g.mat = 'hair'; }
    }
  }

  // --- hair on top
  if (!scaly && look.hair !== 'bald') {
    g.mat = 'hair';
    g.mat = 'plain'; g.soft(0.5 + turn, hy - r * 0.3, r * 0.75, r * 0.14, mix(skin, BLACK, 0.5), 0.4); g.mat = 'hair'; // the hair's shadow on the brow
    // A crown of hair with a side parting: it hugs the temples, and a lock sweeps across the brow.
    const part = 0.5 + turn + r * 0.28;
    g.blob([[L(r * 0.96), hy + r * 0.22], [L(r * 1.06), hy - r * 0.45], [L(r * 0.66), hy - r * 1.04], [R(r * 0.25), hy - r * 1.16], [R(r * 0.86), hy - r * 0.84], [R(r * 1.05), hy - r * 0.25], [R(r * 0.95), hy + r * 0.2], [R(r * 0.82), hy - r * 0.2], [R(r * 0.62), hy - r * 0.42], [part, hy - r * 0.62], [0.5 + turn - r * 0.15, hy - r * 0.5], [L(r * 0.4), hy - r * 0.36], [L(r * 0.78), hy - r * 0.15]], hair, true, 0.85);
    // A lock sweeps from the parting across the brow to the temple, so the hairline is not one smooth edge.
    if (look.hair !== 'topknot') {
      g.limb([[part, hy - r * 0.66], [0.5 + turn - r * 0.05, hy - r * 0.52], [L(r * 0.45), hy - r * 0.34], [L(r * 0.78), hy - r * 0.08]], [r * 0.34, r * 0.3, r * 0.2, r * 0.05], hair);
      g.limb([[part + r * 0.05, hy - r * 0.66], [R(r * 0.68), hy - r * 0.42], [R(r * 0.82), hy - r * 0.1]], [r * 0.26, r * 0.18, r * 0.04], hair);
    }
    // Strands flowing away from the parting, and a sheen where the light catches the crown.
    for (let i = 0; i < 5; i++) {
      const t = i / 4, ex2 = L(r * (0.9 - t * 0.5)), ey2 = hy - r * (0.2 + t * 0.25);
      g.fineCurve([[part - r * 0.04 * i, hy - r * (0.75 + t * 0.2)], [(part + ex2) / 2, hy - r * (0.85 - t * 0.1)], [ex2, ey2]], F(0.03), hairD, 0.55);
    }
    g.fineCurve([[part + r * 0.05, hy - r * 0.72], [R(r * 0.7), hy - r * 0.6], [R(r * 0.9), hy - r * 0.2]], F(0.03), hairD, 0.55);
    g.fineCurve([[L(r * 0.5), hy - r * 0.92], [0.5 - r * 0.05, hy - r * 1.02], [R(r * 0.1), hy - r * 1.02]], F(0.06), mix(hair, WHITE, 0.3), 0.45);
    if (look.hair === 'long') for (const s of [-1, 1]) g.blob([[0.5 + s * r * 0.82, hy - r * 0.35], [0.5 + s * r * 1.02, hy - r * 0.2], [0.5 + s * r * 1.08, sy + r * 0.5], [0.5 + s * r * 0.98, sy + r * 0.85], [0.5 + s * r * 0.84, sy + r * 0.3], [0.5 + s * r * 0.86, hy + r * 0.4]], hair, true, 0.7);
    if (look.hair === 'braid') { g.limb([[R(r * 0.9), hy], [R(r * 1.2), sy], [R(r * 1.1), sy + r * 1.4]], [r * 0.4, r * 0.36, r * 0.22], hair); g.mat = 'metal'; g.dot(R(r * 1.1), sy + r * 1.5, GOLD, 1.4); g.mat = 'hair'; }
    if (look.hair === 'topknot') { g.ell(0.5, hy - r * 1.25, r * 0.38, r * 0.34, hair); g.mat = 'metal'; g.box(L(r * 0.18), hy - r * 1.02, R(r * 0.18), hy - r * 0.92, GOLD); }
    // Tousled locks curling every which way, not spikes.
    if (look.hair === 'wild') for (let i = -2; i <= 2; i++) { const bend = (i % 2 ? 1 : -1) * r * 0.22; g.limb([[0.5 + i * r * 0.38, hy - r * 0.75], [0.5 + i * r * 0.5 + bend * 0.4, hy - r * (1.08 - Math.abs(i) * 0.08)], [0.5 + i * r * 0.55 + bend, hy - r * (1.3 - Math.abs(i) * 0.12)], [0.5 + i * r * 0.5 + bend * 1.5, hy - r * (1.22 - Math.abs(i) * 0.12)]], [r * 0.42, r * 0.34, r * 0.2, r * 0.05], hair); }
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

/** The head and shoulders alone, painted at full size: the crop is chosen before drawing, not after. */
function bust(a: HeroArt): HTMLCanvasElement {
  const k = `bust|${heroArtKey(a)}`;
  let f = figures.get(k);
  if (!f) {
    f = draw(a, 512, 0.55, ({ r, hy }) => {
      const half = Math.max(0.16, r * 2.05);
      return { x: 0.5 - half, y: Math.max(0, hy - half * 0.82), size: half * 2 };
    });
    figures.set(k, f);
  }
  return f.c;
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

/** The whole hero standing, on a transparent background: the miniature in the 2.5D battle view. */
export function heroStanding(a: HeroArt): HTMLCanvasElement {
  return figure(a, 256, 1).c;
}

const urls = new Map<string, string>();
const cached = (k: string, make: () => string) => { let u = urls.get(k); if (!u) { u = make(); urls.set(k, u); } return u; };

/** The whole hero, standing, on a transparent background: for the sheet, the inventory and the creator. */
export function heroUrl(a: HeroArt): string {
  return cached(`full|${heroArtKey(a)}`, () => figure(a, 256, 1).c.toDataURL());
}

/** Head and shoulders in a round brass frame: for the party panel, the lobby and hero tabs. */
/** Painted portraits from the server, once loaded. Until then the drawn bust stands in. */
const photos = new Map<string, HTMLImageElement | 'loading' | 'failed'>();
const photoListeners = new Set<() => void>();

/** Called whenever a painted portrait has loaded, so the screens showing heroes can draw it. */
export function onPortraitLoaded(fn: () => void): () => void {
  photoListeners.add(fn);
  return () => { photoListeners.delete(fn); };
}

function photo(id: string): HTMLImageElement | null {
  const got = photos.get(id);
  if (got instanceof HTMLImageElement) return got;
  if (!got && /^[a-f0-9]{18}$/.test(id)) {
    photos.set(id, 'loading');
    const img = new Image();
    img.onload = () => { photos.set(id, img); for (const fn of photoListeners) fn(); };
    img.onerror = () => { photos.set(id, 'failed'); };
    img.src = `/pictures/${id}`;
  }
  return null;
}

export function heroPortraitUrl(a: HeroArt, size = 160): string {
  const img = a.portrait ? photo(a.portrait) : null;
  if (img) {
    return cached(`photo|${size}|${a.portrait}`, () => {
      // The painting fills the round brass frame every hero portrait has.
      const S = Math.max(img.naturalWidth, img.naturalHeight, size);
      const square = document.createElement('canvas');
      square.width = square.height = S;
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      square.getContext('2d')!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, S, S);
      return framed(square, size, 'hero', { x: 0.03, y: 0.02, size: 0.94 }).toDataURL();
    });
  }
  return cached(`bust|${size}|${heroArtKey(a)}`, () => {
    return framed(bust(a), size, 'hero', { x: 0, y: 0, size: 1 }).toDataURL();
  });
}

/** A hero in play: the stored look and whatever they have equipped right now. */
export function artOfCharacter(c: Character, items?: Record<string, ItemDef>): HeroArt {
  const def = (slot: 'armor' | 'mainHand' | 'offHand') => (c.equipment[slot] ? itemDef(items, c.equipment[slot]!.defId) : null);
  return { speciesId: c.speciesId, gender: c.gender, classId: c.classId, name: c.name, look: heroLook(c), gear: heroGear(def('armor'), def('mainHand'), def('offHand')), portrait: c.portraitId ?? null };
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
