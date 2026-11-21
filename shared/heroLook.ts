// What a hero looks like in portraits and on the battle map. The body comes from
// the species, the gear from what the hero wears, and the rest is chosen in the
// character creator. Looks never change the rules.
import type { ClassId, Gender, SpeciesId } from './types';

/** Skin, scale and hide tones by id. Each species offers a handful of them. */
export const SKINS: Record<string, string> = {
  porcelain: '#f6dcc6', fair: '#f0c8a0', tan: '#d9a877', olive: '#b98a5e', brown: '#8d5a3a', dark: '#5c3a26',
  moss: '#7d9a5a', greygreen: '#7f8f78', deepgreen: '#4f7045',
  ash: '#9a9aa6', crimson: '#b8433a', violet: '#8a62b0', dusk: '#5a6aa8',
  bronze: '#b0803a', brass: '#c9a84a', copper: '#b86a3c', silver: '#b8c0c8', redscale: '#a83a30', greenscale: '#4f8a4a', bluescale: '#4a6ab8', blackscale: '#3d3944', whitescale: '#dcdce4',
  stone: '#a8a29a', slate: '#7a8088', chalk: '#d8d2c8',
};

const FOLK = ['porcelain', 'fair', 'tan', 'olive', 'brown', 'dark'];
export const SPECIES_SKINS: Record<SpeciesId, string[]> = {
  human: FOLK,
  dwarf: ['fair', 'tan', 'olive', 'brown', 'dark', 'porcelain'],
  elf: ['porcelain', 'fair', 'tan', 'brown', 'dusk', 'ash'],
  halfling: FOLK,
  gnome: ['tan', 'fair', 'olive', 'brown', 'porcelain', 'dark'],
  orc: ['greygreen', 'moss', 'deepgreen', 'ash', 'olive', 'brown'],
  dragonborn: ['bronze', 'brass', 'copper', 'silver', 'redscale', 'greenscale', 'bluescale', 'blackscale', 'whitescale'],
  tiefling: ['crimson', 'ash', 'violet', 'dusk', 'tan', 'fair'],
  goliath: ['stone', 'slate', 'chalk', 'tan', 'brown'],
};

export const HAIR_STYLES = ['bald', 'short', 'long', 'braid', 'topknot', 'wild'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export const HAIR_COLORS: Record<string, string> = {
  black: '#2a2430', brown: '#5a3a22', auburn: '#8a3f22', copper: '#c0652a', blond: '#d8b860', grey: '#8f8f96', white: '#e6e6ea', blue: '#3f6ab0', violet: '#7a4aa0',
};
export const BEARDS = ['none', 'short', 'long', 'braided'] as const;
export type Beard = (typeof BEARDS)[number];
export const OUTFITS: Record<string, string> = {
  red: '#b03a30', blue: '#3b5fb5', green: '#3d6a45', purple: '#6a4a98', gold: '#c9a23a', white: '#e0d8c4', black: '#3a3640', brown: '#7a5536', teal: '#3f8a84',
};

export interface HeroLook {
  skin: string;
  hair: HairStyle;
  hairColor: string;
  beard: Beard;
  /** The colour of cloth, tabard and trim. */
  color: string;
}

/** Display names, in English; the interface translates them. */
export const LOOK_NAMES: Record<string, string> = {
  porcelain: 'Porcelain', fair: 'Fair', tan: 'Tan', olive: 'Olive', brown: 'Brown', dark: 'Dark', moss: 'Moss green', greygreen: 'Grey-green', deepgreen: 'Deep green',
  ash: 'Ash grey', crimson: 'Crimson', violet: 'Violet', dusk: 'Dusk blue', bronze: 'Bronze', brass: 'Brass', copper: 'Copper', silver: 'Silver', redscale: 'Red', greenscale: 'Green',
  bluescale: 'Blue', blackscale: 'Black', whitescale: 'White', stone: 'Stone grey', slate: 'Slate', chalk: 'Chalk',
  bald: 'Bald', short: 'Short', long: 'Long', braid: 'Braid', topknot: 'Topknot', wild: 'Wild',
  black: 'Black', auburn: 'Auburn', blond: 'Blond', grey: 'Grey', white: 'White', blue: 'Blue',
  none: 'None', braided: 'Braided',
  red: 'Red', green: 'Green', purple: 'Purple', gold: 'Gold', teal: 'Teal',
};

const CLASS_COLOR: Record<ClassId, string> = { fighter: 'red', rogue: 'green', wizard: 'blue', cleric: 'white', barbarian: 'brown', bard: 'purple', druid: 'green', monk: 'brown', paladin: 'white', ranger: 'green', sorcerer: 'red', warlock: 'purple' };
const hash = (s: string) => [...s].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) | 0, 7) >>> 0;

interface Who { speciesId: SpeciesId; gender: Gender; classId: ClassId; name?: string }

/** A sensible look for a hero nobody has styled: steady for the same name, different between heroes. */
export function defaultLook(who: Who): HeroLook {
  const h = hash(`${who.name ?? ''}/${who.speciesId}/${who.classId}`);
  const skins = SPECIES_SKINS[who.speciesId] ?? FOLK;
  const colors = Object.keys(HAIR_COLORS).slice(0, 7);
  const scaly = who.speciesId === 'dragonborn';
  const hair: HairStyle = scaly ? 'bald' : who.speciesId === 'goliath' ? 'bald' : who.gender === 'female' ? (['long', 'braid', 'topknot'] as const)[(h >>> 3) % 3] : who.gender === 'male' ? (['short', 'short', 'topknot'] as const)[(h >>> 3) % 3] : (['short', 'long', 'wild'] as const)[(h >>> 3) % 3];
  return {
    skin: skins[h % Math.min(skins.length, 3)],
    hair,
    hairColor: colors[(h >>> 6) % colors.length],
    beard: who.speciesId === 'dwarf' && who.gender === 'male' ? 'long' : 'none',
    color: CLASS_COLOR[who.classId] ?? 'red',
  };
}

/** The look to draw: the stored one where it is valid, the default for anything missing or unknown. */
export function heroLook(who: Who & { look?: Partial<HeroLook> | null }): HeroLook {
  const d = defaultLook(who), l = who.look ?? {};
  const skins = SPECIES_SKINS[who.speciesId] ?? FOLK;
  return {
    skin: typeof l.skin === 'string' && skins.includes(l.skin) ? l.skin : d.skin,
    hair: HAIR_STYLES.includes(l.hair as HairStyle) ? (l.hair as HairStyle) : d.hair,
    hairColor: typeof l.hairColor === 'string' && l.hairColor in HAIR_COLORS ? l.hairColor : d.hairColor,
    beard: BEARDS.includes(l.beard as Beard) ? (l.beard as Beard) : d.beard,
    color: typeof l.color === 'string' && l.color in OUTFITS ? l.color : d.color,
  };
}

/** What the hero carries, as far as the picture is concerned. */
export interface HeroGear {
  armor: 'none' | 'light' | 'medium' | 'heavy';
  weapon: 'none' | 'sword' | 'greatsword' | 'axe' | 'mace' | 'dagger' | 'spear' | 'staff' | 'bow';
  shield: boolean;
}

interface GearItem { id: string; kind: string; weapon?: { ranged?: unknown; twoHanded?: boolean }; armor?: { category: string }; story?: { baseId?: string | null } }

/** Reads the picture's gear from the items in the armor, main hand and off hand slots. */
/** Which drawn weapon an item is held as, or 'none' for something that is not a weapon. */
export function weaponKind(item?: GearItem | null): HeroGear['weapon'] {
  const id = (item?.story?.baseId ?? item?.id ?? '').toLowerCase();
  const w = item?.weapon;
  return !w ? 'none'
    : w.ranged && !/dagger|axe|spear|javelin/.test(id) ? 'bow'
    : /staff/.test(id) ? 'staff'
    : /dagger/.test(id) ? 'dagger'
    : /axe/.test(id) ? 'axe'
    : /mace|hammer|club|morning|flail/.test(id) ? 'mace'
    : /spear|javelin|pike|halberd|glaive/.test(id) ? 'spear'
    : w.twoHanded ? 'greatsword' : 'sword';
}

export function heroGear(armor?: GearItem | null, mainHand?: GearItem | null, offHand?: GearItem | null): HeroGear {
  const cat = armor?.armor?.category;
  return { armor: cat === 'heavy' || cat === 'medium' || cat === 'light' ? cat : 'none', weapon: weaponKind(mainHand), shield: offHand?.kind === 'shield' };
}

export interface HeroArt extends Who { look: HeroLook; gear: HeroGear; /** A painted portrait on the server (/pictures/<id>), shown instead of the drawn bust once it has loaded. */ portrait?: string | null }
export const heroArtKey = (a: HeroArt) => [a.speciesId, a.gender, a.classId, a.name ?? '', ...Object.values(a.look), ...Object.values(a.gear)].join('|');
