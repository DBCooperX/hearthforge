// What a monster looks like on the battle map. A look is a body shape, a size
// and a handful of layered extras. Every creature in the catalogue has a default
// look, and the Dungeon Master can restyle a creature when it spawns one, so a
// "three-headed ogre" shows three heads. Looks never change the rules: the
// statistics always come from the catalogue entry the monster is built on.

export const BODIES = ['humanoid', 'giant', 'beast', 'rodent', 'insect', 'serpent', 'dragon', 'bird', 'ooze', 'elemental', 'plant', 'aberration', 'construct', 'ghost', 'bear', 'spider', 'owlbear'] as const;
export type Body = (typeof BODIES)[number];

export const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;
export type Size = (typeof SIZES)[number];
/** Squares along one side of the space a creature takes up on the battle map. */
export const SIZE_TILES: Record<Size, number> = { tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };

/** SRD creature types. */
export const CREATURE_TYPES = ['aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead'] as const;
export type CreatureType = (typeof CREATURE_TYPES)[number];

/** The body a creature type gets when its catalogue entry does not say otherwise. */
export const TYPE_BODY: Record<CreatureType, Body> = {
  aberration: 'aberration', beast: 'beast', celestial: 'humanoid', construct: 'construct', dragon: 'dragon', elemental: 'elemental', fey: 'humanoid',
  fiend: 'humanoid', giant: 'giant', humanoid: 'humanoid', monstrosity: 'beast', ooze: 'ooze', plant: 'plant', undead: 'humanoid',
};

export const COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'tan', 'grey', 'black', 'white', 'bone'] as const;
export type Color = (typeof COLORS)[number];
export const WINGS = ['bat', 'feather'] as const;
export const ARMORS = ['leather', 'plate'] as const;
export const WEAPONS = ['club', 'sword', 'axe', 'spear', 'bow', 'staff'] as const;
export const AURAS = ['fire', 'frost', 'poison', 'shadow', 'holy', 'lightning'] as const;
export const MUTATIONS = ['rotting', 'spectral', 'skeletal', 'crystal', 'shadowy'] as const;

export interface MonsterLook {
  body: Body;
  size: Size;
  color: Color;
  heads: 1 | 2 | 3;
  arms: 2 | 4;
  horns: boolean;
  tail: boolean;
  wings: (typeof WINGS)[number] | null;
  /** Glowing eyes in this colour. */
  eyes: Color | null;
  armor: (typeof ARMORS)[number] | null;
  weapon: (typeof WEAPONS)[number] | null;
  aura: (typeof AURAS)[number] | null;
  mutation: (typeof MUTATIONS)[number] | null;
  /** Reserved for the image phase: id of a cached generated token that replaces the drawn one. */
  imageId: string | null;
}

export const baseLook = (body: Body, size: Size, color: Color, extra: Partial<MonsterLook> = {}): MonsterLook => ({
  body, size, color, heads: 1, arms: 2, horns: false, tail: false, wings: null, eyes: null, armor: null, weapon: null, aura: null, mutation: null, imageId: null, ...extra,
});

/**
 * The extras the Dungeon Master may ask for, as short tokens such as "heads:3",
 * "horns" or "aura:fire". A flat list keeps the tool schema small.
 */
export const LOOK_TOKENS: readonly string[] = [
  ...BODIES.map((b) => `body:${b}`),
  ...SIZES.map((s) => `size:${s}`),
  ...COLORS.map((c) => `color:${c}`),
  'heads:2', 'heads:3', 'arms:4', 'horns', 'tail',
  ...WINGS.map((w) => `wings:${w}`),
  ...COLORS.map((c) => `eyes:${c}`),
  ...ARMORS.map((a) => `armor:${a}`),
  ...WEAPONS.map((w) => `weapon:${w}`), 'weapon:none',
  ...AURAS.map((a) => `aura:${a}`),
  ...MUTATIONS.map((m) => `mutation:${m}`),
];

/** The same values grouped for a tool description. */
export const LOOK_HELP = [
  `body:${BODIES.join('|')}`, `size:${SIZES.join('|')}`, `color:${COLORS.join('|')}`, 'heads:2|3', 'arms:4', 'horns', 'tail', `wings:${WINGS.join('|')}`,
  'eyes:<a colour> (glowing)', `armor:${ARMORS.join('|')}`, `weapon:${WEAPONS.join('|')}|none`, `aura:${AURAS.join('|')}`, `mutation:${MUTATIONS.join('|')}`,
].join('; ');

const has = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

/** Applies requested extras to a look. Unknown tokens are ignored and reported. */
export function applyLookTokens(base: MonsterLook, tokens: readonly unknown[]): { look: MonsterLook; ignored: string[] } {
  const look = { ...base };
  const ignored: string[] = [];
  for (const raw of tokens) {
    const token = String(raw).trim().toLowerCase();
    const [key, value = ''] = token.split(':');
    if (key === 'body' && has(BODIES, value)) look.body = value;
    else if (key === 'size' && has(SIZES, value)) look.size = value;
    else if (key === 'color' && has(COLORS, value)) look.color = value;
    else if (key === 'heads' && (value === '2' || value === '3')) look.heads = Number(value) as 2 | 3;
    else if (key === 'arms' && value === '4') look.arms = 4;
    else if (key === 'horns') look.horns = true;
    else if (key === 'tail') look.tail = true;
    else if (key === 'wings' && has(WINGS, value)) look.wings = value;
    else if (key === 'eyes' && has(COLORS, value)) look.eyes = value;
    else if (key === 'armor' && has(ARMORS, value)) look.armor = value;
    else if (key === 'weapon' && has(WEAPONS, value)) look.weapon = value;
    else if (key === 'weapon' && value === 'none') look.weapon = null;
    else if (key === 'aura' && has(AURAS, value)) look.aura = value;
    else if (key === 'mutation' && has(MUTATIONS, value)) look.mutation = value;
    else ignored.push(token);
  }
  return { look, ignored };
}

/** A stable key for caching a drawn token. */
export const lookKey = (l: MonsterLook) => [l.body, l.size, l.color, l.heads, l.arms, +l.horns, +l.tail, l.wings, l.eyes, l.armor, l.weapon, l.aura, l.mutation].join('|');

/** How much tougher or weaker than the catalogue entry a restyled monster may be. Only hit points and experience scale. */
export const POWER = { weaker: 0.75, standard: 1, stronger: 1.5 } as const;
export type Power = keyof typeof POWER;

interface Pt { x: number; y: number }
/** Chebyshev distance from a point to the square a creature of `tiles` width occupies at `at`. */
export function distToFootprint(at: Pt, tiles: number, p: Pt): number {
  const dx = Math.max(at.x - p.x, 0, p.x - (at.x + tiles - 1));
  const dy = Math.max(at.y - p.y, 0, p.y - (at.y + tiles - 1));
  return Math.max(dx, dy);
}
/** The tile of a creature's square nearest to a point. */
export const nearestFootprintTile = (at: Pt, tiles: number, p: Pt): Pt => ({ x: Math.max(at.x, Math.min(at.x + tiles - 1, p.x)), y: Math.max(at.y, Math.min(at.y + tiles - 1, p.y)) });
export const inFootprint = (at: Pt, tiles: number, x: number, y: number) => x >= at.x && x < at.x + tiles && y >= at.y && y < at.y + tiles;
