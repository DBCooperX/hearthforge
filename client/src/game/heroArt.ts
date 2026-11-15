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
import { Pix, TOKEN_PX, hex, mix, type P, type RGB } from './monsterArt';

const BLACK: RGB = [0, 0, 0], WHITE: RGB = [255, 255, 255];
const OUTLINE = hex('#17121c');
const STEEL = hex('#aab3bd'), LEATHER = hex('#7a5a3a'), WOOD = hex('#7a5430'), BONE = hex('#e8e0c8'), GOLD = hex('#d4a857');

/** How tall and broad each people stands, and how big the head is, in parts of the token. */
const BUILD: Record<SpeciesId, { tall: number; wide: number; r: number }> = {
  human: { tall: 0.8, wide: 0.15, r: 0.125 },
  elf: { tall: 0.85, wide: 0.125, r: 0.115 },
  dwarf: { tall: 0.62, wide: 0.19, r: 0.135 },
  halfling: { tall: 0.56, wide: 0.13, r: 0.125 },
  gnome: { tall: 0.52, wide: 0.115, r: 0.145 },
  orc: { tall: 0.86, wide: 0.195, r: 0.125 },
  dragonborn: { tall: 0.86, wide: 0.17, r: 0.125 },
  tiefling: { tall: 0.8, wide: 0.145, r: 0.12 },
  goliath: { tall: 0.91, wide: 0.2, r: 0.115 },
};

function draw(a: HeroArt): Uint8ClampedArray {
  const S = TOKEN_PX;
  const g = new Pix(S, 1);
  const b = BUILD[a.speciesId] ?? BUILD.human;
  const { look, gear } = a;
  const wide = b.wide - (a.gender === 'female' ? 0.015 : 0);
  const r = b.r;
  const feet = 0.95, top = feet - b.tall;
  const hy = top + r + 0.01; // centre of the head
  const sy = hy + r * 0.95; // shoulders
  const hip = sy + (feet - sy) * 0.52;

  const skin = hex(SKINS[look.skin] ?? SKINS.fair), skinD = mix(skin, BLACK, 0.28);
  const hair = hex(HAIR_COLORS[look.hairColor] ?? HAIR_COLORS.brown), hairD = mix(hair, BLACK, 0.3);
  const cloth = hex(OUTFITS[look.color] ?? OUTFITS.red), clothD = mix(cloth, BLACK, 0.35), clothL = mix(cloth, WHITE, 0.3);
  const scaly = a.speciesId === 'dragonborn';
  const robe = gear.armor === 'none';
  const torso = gear.armor === 'heavy' ? STEEL : gear.armor === 'medium' ? mix(STEEL, LEATHER, 0.45) : gear.armor === 'light' ? LEATHER : cloth;
  const torsoD = mix(torso, BLACK, 0.3);
  const legs = gear.armor === 'heavy' ? mix(STEEL, BLACK, 0.25) : mix(LEATHER, BLACK, 0.35);

  // --- behind the body: tail, cloak, hair that falls down the back
  if (a.speciesId === 'tiefling') {
    g.seg([0.5 + wide * 0.4, hip + 0.02], [0.5 + wide + 0.1, hip + 0.16], 0.04, skinD);
    g.seg([0.5 + wide + 0.1, hip + 0.16], [0.5 + wide + 0.16, hip + 0.04], 0.035, skinD);
  }
  if (a.classId === 'rogue') g.box(0.5 - wide - 0.025, sy + 0.01, 0.5 + wide + 0.025, hip + (feet - hip) * 0.45, clothD);
  if (!scaly && (look.hair === 'long' || look.hair === 'wild')) {
    g.ell(0.5, hy, r * 1.22, r * 1.15, hairD);
    if (look.hair === 'long') g.box(0.5 - r * 1.15, hy, 0.5 + r * 1.15, sy + 0.1, hairD);
  }

  // --- legs, or the skirt of a robe
  if (robe) {
    g.box(0.5 - wide * 1.08, hip - 0.01, 0.5 + wide * 1.08, feet - 0.035, cloth);
    g.box(0.5 - wide * 1.08, feet - 0.07, 0.5 + wide * 1.08, feet - 0.035, clothD);
    g.box(0.5 - wide * 0.7, feet - 0.035, 0.5 - 0.03, feet, OUTLINE);
    g.box(0.5 + 0.03, feet - 0.035, 0.5 + wide * 0.7, feet, OUTLINE);
  } else {
    g.box(0.5 - wide * 0.82, hip - 0.01, 0.5 - 0.025, feet, legs);
    g.box(0.5 + 0.025, hip - 0.01, 0.5 + wide * 0.82, feet, legs);
    g.box(0.5 - wide * 0.82, feet - 0.05, 0.5 - 0.025, feet, mix(legs, BLACK, 0.45));
    g.box(0.5 + 0.025, feet - 0.05, 0.5 + wide * 0.82, feet, mix(legs, BLACK, 0.45));
  }

  // --- arms and hands
  const handL: P = [0.5 - wide - 0.05, hip - 0.01], handR: P = [0.5 + wide + 0.05, hip - 0.01];
  const sleeve = gear.armor === 'heavy' ? torsoD : robe ? clothD : gear.armor === 'medium' ? clothD : torsoD;
  g.seg([0.5 - wide - 0.005, sy + 0.05], handL, 0.075, sleeve);
  g.seg([0.5 + wide + 0.005, sy + 0.05], handR, 0.075, sleeve);
  g.dot(handL[0], handL[1], skin, 2);
  g.dot(handR[0], handR[1], skin, 2);

  // --- torso, with the hero's colour on it
  g.box(0.5 - wide, sy, 0.5 + wide, hip, torso);
  g.box(0.5 + wide * 0.45, sy + 0.02, 0.5 + wide, hip, torsoD);
  if (gear.armor === 'heavy' || gear.armor === 'medium') g.box(0.5 - 0.045, sy + 0.01, 0.5 + 0.045, hip - 0.02, cloth);
  else if (gear.armor === 'light') g.box(0.5 - wide, sy, 0.5 + wide, sy + 0.04, cloth);
  else g.box(0.5 - 0.02, sy + 0.01, 0.5 + 0.02, hip - 0.02, clothL);
  g.box(0.5 - wide, hip - 0.035, 0.5 + wide, hip, robe ? GOLD : mix(LEATHER, BLACK, 0.5));
  if (gear.armor === 'heavy') {
    g.ell(0.5 - wide, sy + 0.03, 0.055, 0.045, mix(STEEL, WHITE, 0.25));
    g.ell(0.5 + wide, sy + 0.03, 0.055, 0.045, STEEL);
  }
  if (a.classId === 'cleric') g.dot(0.5, sy + (hip - sy) * 0.42, GOLD, 2);

  // --- shield on the left arm
  if (gear.shield) {
    const cx = 0.5 - wide - 0.07, cy = (sy + hip) / 2 + 0.05;
    g.ell(cx, cy, 0.1, 0.12, mix(STEEL, BLACK, 0.2));
    g.ell(cx, cy, 0.075, 0.095, cloth);
    g.dot(cx, cy, GOLD, 2);
  }

  // --- weapon in the right hand
  const hx = handR[0] + 0.02, hyd = handR[1];
  const up = (len: number) => Math.max(0.04, hyd - len);
  switch (gear.weapon) {
    case 'sword': g.seg([hx, hyd], [hx + 0.02, up(0.36)], 0.045, STEEL); g.seg([hx - 0.045, hyd - 0.04], [hx + 0.05, hyd - 0.04], 0.035, GOLD); break;
    case 'greatsword': g.seg([hx, hyd + 0.04], [hx + 0.03, up(0.56)], 0.06, STEEL); g.seg([hx - 0.06, hyd - 0.05], [hx + 0.07, hyd - 0.05], 0.04, GOLD); break;
    case 'dagger': g.seg([hx, hyd], [hx + 0.01, up(0.15)], 0.04, STEEL); g.seg([hx - 0.03, hyd - 0.02], [hx + 0.035, hyd - 0.02], 0.03, WOOD); break;
    case 'axe': g.seg([hx, hyd + 0.06], [hx, up(0.36)], 0.035, WOOD); g.tri([hx, up(0.36)], [hx + 0.11, up(0.4)], [hx + 0.09, up(0.22)], STEEL); g.tri([hx, up(0.36)], [hx, up(0.22)], [hx + 0.09, up(0.22)], STEEL); break;
    case 'mace': g.seg([hx, hyd + 0.06], [hx, up(0.3)], 0.035, WOOD); g.ell(hx, up(0.34), 0.06, 0.06, STEEL); g.dot(hx - 0.02, up(0.36), mix(STEEL, WHITE, 0.5), 1); break;
    case 'spear': g.seg([hx, feet], [hx, up(0.6)], 0.03, WOOD); g.tri([hx - 0.035, up(0.6)], [hx + 0.035, up(0.6)], [hx, up(0.74)], STEEL); break;
    case 'staff': g.seg([hx, feet], [hx, Math.max(0.1, top + 0.04)], 0.035, WOOD); g.ell(hx, Math.max(0.07, top + 0.01), 0.04, 0.04, hex('#6fe3ff')); g.dot(hx - 0.01, Math.max(0.06, top), hex('#e6fbff'), 1); break;
    case 'bow': {
      const y0 = up(0.3), y1 = Math.min(feet - 0.02, hyd + 0.26), mid = (y0 + y1) / 2;
      g.seg([hx - 0.02, y0], [hx + 0.06, mid], 0.035, WOOD);
      g.seg([hx + 0.06, mid], [hx - 0.02, y1], 0.035, WOOD);
      g.seg([hx - 0.02, y0], [hx - 0.02, y1], 0.012, BONE);
      break;
    }
    default: break;
  }

  // --- head
  g.box(0.5 - r * 0.35, hy + r * 0.7, 0.5 + r * 0.35, sy + 0.01, skinD);
  g.ell(0.5, hy, r, r * 1.03, skin);
  const earY = hy + r * 0.1;
  const ear = (dir: 1 | -1, len: number, lift: number) => g.tri([0.5 + dir * r * 0.85, earY - 0.03], [0.5 + dir * r * 0.85, earY + 0.035], [0.5 + dir * (r + len), earY - lift], skin);
  if (a.speciesId === 'elf') { ear(1, 0.085, 0.085); ear(-1, 0.085, 0.085); }
  else if (a.speciesId === 'gnome') { ear(1, 0.06, 0.03); ear(-1, 0.06, 0.03); }
  else if (a.speciesId === 'orc' || a.speciesId === 'tiefling' || a.speciesId === 'halfling') { ear(1, 0.04, 0.045); ear(-1, 0.04, 0.045); }
  else if (!scaly) { g.dot(0.5 - r - 0.005, earY, skinD, 1); g.dot(0.5 + r + 0.005, earY, skinD, 1); }

  if (scaly) {
    // A blunt snout, nostrils and swept-back horns.
    g.ell(0.5, hy + r * 0.5, r * 0.72, r * 0.5, mix(skin, WHITE, 0.18));
    g.dot(0.5 - r * 0.25, hy + r * 0.42, OUTLINE, 1);
    g.dot(0.5 + r * 0.25, hy + r * 0.42, OUTLINE, 1);
    for (const dir of [1, -1] as const) g.tri([0.5 + dir * r * 0.45, hy - r * 0.8], [0.5 + dir * r * 0.95, hy - r * 0.45], [0.5 + dir * r * 1.25, hy - r * 1.55], skinD);
    if (look.hair !== 'bald') for (let i = -1; i <= 1; i++) g.tri([0.5 + i * r * 0.3 - 0.02, hy - r * 0.9], [0.5 + i * r * 0.3 + 0.02, hy - r * 0.9], [0.5 + i * r * 0.3, hy - r * 1.45], hair);
  }
  if (a.speciesId === 'tiefling') for (const dir of [1, -1] as const) g.tri([0.5 + dir * r * 0.3, hy - r * 0.85], [0.5 + dir * r * 0.85, hy - r * 0.45], [0.5 + dir * r * 1.05, hy - r * 1.75], mix(BONE, BLACK, 0.45));
  if (a.speciesId === 'goliath') {
    const mark = mix(skin, BLACK, 0.5);
    g.dot(0.5, hy - r * 0.55, mark, 1);
    g.dot(0.5 - r * 0.6, hy + r * 0.45, mark, 1);
    g.dot(0.5 + r * 0.6, hy + r * 0.45, mark, 1);
  }

  // --- face
  const eye = a.speciesId === 'tiefling' ? hex('#ff9a2e') : scaly ? hex('#ffe14d') : a.speciesId === 'orc' ? hex('#3a1414') : OUTLINE;
  const ey = hy + (scaly ? -r * 0.1 : r * 0.15);
  g.dot(0.5 - r * 0.42, ey, eye, 1);
  g.dot(0.5 + r * 0.42, ey, eye, 1);
  if (a.speciesId === 'orc') { g.dot(0.5 - r * 0.42, hy + r * 0.62, BONE, 1); g.dot(0.5 + r * 0.42, hy + r * 0.62, BONE, 1); }

  // --- beard
  if (!scaly && look.beard !== 'none') {
    g.ell(0.5, hy + r * 0.78, r * 0.8, r * 0.42, hair);
    if (look.beard !== 'short') {
      const tip = Math.min(hip - 0.02, hy + r * 2.5);
      g.tri([0.5 - r * 0.8, hy + r * 0.7], [0.5 + r * 0.8, hy + r * 0.7], [0.5, tip], hair);
      if (look.beard === 'braided') { g.seg([0.5 - r * 0.3, hy + r * 1.3], [0.5 - r * 0.3, tip + 0.02], 0.035, hairD); g.seg([0.5 + r * 0.3, hy + r * 1.3], [0.5 + r * 0.3, tip + 0.02], 0.035, hairD); g.dot(0.5 - r * 0.3, tip + 0.02, GOLD, 1); g.dot(0.5 + r * 0.3, tip + 0.02, GOLD, 1); }
    }
  }

  // --- hair on top
  if (!scaly && look.hair !== 'bald') {
    const cap = () => { g.ell(0.5, hy - r * 0.5, r * 1.04, r * 0.56, hair); g.box(0.5 - r * 1.02, hy - r * 0.45, 0.5 - r * 0.78, hy + r * 0.05, hair); g.box(0.5 + r * 0.78, hy - r * 0.45, 0.5 + r * 1.02, hy + r * 0.05, hair); };
    cap();
    if (look.hair === 'long') { g.box(0.5 - r * 1.1, hy - r * 0.2, 0.5 - r * 0.82, sy + 0.07, hair); g.box(0.5 + r * 0.82, hy - r * 0.2, 0.5 + r * 1.1, sy + 0.07, hair); }
    if (look.hair === 'braid') { g.seg([0.5 + r * 0.9, hy], [0.5 + r * 1.15, sy + 0.13], 0.05, hair); g.dot(0.5 + r * 1.15, sy + 0.14, GOLD, 1); }
    if (look.hair === 'topknot') g.ell(0.5, hy - r * 1.2, r * 0.4, r * 0.38, hair);
    if (look.hair === 'wild') for (let i = -2; i <= 2; i++) g.tri([0.5 + i * r * 0.42 - 0.03, hy - r * 0.75], [0.5 + i * r * 0.42 + 0.03, hy - r * 0.75], [0.5 + i * r * 0.55, hy - r * (1.55 - Math.abs(i) * 0.15)], hair);
  }

  // --- outline
  const d1 = g.d.slice();
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && d1[(y * S + x) * 4 + 3] > 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) g.set(x, y, OUTLINE);
  }
  return g.d;
}

const canvases = new Map<string, HTMLCanvasElement>();

/** The drawn token for a hero, TOKEN_PX pixels square. */
export function heroCanvas(a: HeroArt): HTMLCanvasElement {
  const k = heroArtKey(a);
  let c = canvases.get(k);
  if (!c) {
    c = document.createElement('canvas');
    c.width = TOKEN_PX;
    c.height = TOKEN_PX;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(TOKEN_PX, TOKEN_PX);
    img.data.set(draw(a));
    ctx.putImageData(img, 0, 0);
    canvases.set(k, c);
  }
  return c;
}

const urls = new Map<string, string>();
/** The same picture as a data URL, for portraits in the interface. */
export function heroUrl(a: HeroArt): string {
  const k = heroArtKey(a);
  let u = urls.get(k);
  if (!u) { u = heroCanvas(a).toDataURL(); urls.set(k, u); }
  return u;
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
