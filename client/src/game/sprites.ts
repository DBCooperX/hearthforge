// Original 16x16 pixel art, generated procedurally at runtime so the repository ships
// no binary assets. Everything here is dedicated to the public domain (CC0), and the
// tile size matches Kenney's "Tiny Dungeon" and 0x72's "DungeonTileset II" so those
// CC0 packs can be dropped in later.

import { setItemIcons } from './itemArt';
import { battleTileGrid } from './battleTiles';

export const TILE = 16;
type Grid = (string | null)[][];

const OUTLINE = '#17121c';

function blank(): Grid {
  return Array.from({ length: TILE }, () => Array<string | null>(TILE).fill(null));
}

function rect(g: Grid, x0: number, y0: number, x1: number, y1: number, color: string) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g[y]?.[x] !== undefined) g[y][x] = color;
}

function px(g: Grid, x: number, y: number, color: string) {
  if (g[y]?.[x] !== undefined) g[y][x] = color;
}

function outline(g: Grid): Grid {
  const out = g.map((r) => [...r]);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (g[y][x]) continue;
      if (g[y - 1]?.[x] || g[y + 1]?.[x] || g[y][x - 1] || g[y][x + 1]) out[y][x] = OUTLINE;
    }
  }
  return out;
}

type Weapon = 'sword' | 'staff' | 'mace' | 'dagger' | 'bow' | 'morningstar' | 'scimitar' | 'none';

interface Humanoid {
  skin: string;
  body: string;
  trim: string;
  legs: string;
  eyes?: string;
  hair?: string;
  helmet?: string;
  hat?: string;
  hood?: string;
  ears?: boolean;
  ribs?: string;
  big?: boolean;
  weapon?: Weapon;
  shield?: string;
}

function humanoid(o: Humanoid): Grid {
  const g = blank();
  const l = o.big ? 4 : 5;
  const r = o.big ? 11 : 10;
  // legs and feet
  rect(g, l, 12, l + 1, 14, o.legs);
  rect(g, r - 1, 12, r, 14, o.legs);
  rect(g, l, 14, l + 1, 14, OUTLINE);
  rect(g, r - 1, 14, r, 14, OUTLINE);
  // torso, belt, arms, hands
  rect(g, l, 7, r, 11, o.body);
  rect(g, l, 11, r, 11, o.trim);
  rect(g, l - 1, 7, l - 1, 10, o.body);
  rect(g, r + 1, 7, r + 1, 10, o.body);
  px(g, l - 1, 10, o.skin);
  px(g, r + 1, 10, o.skin);
  if (o.ribs) {
    rect(g, l + 1, 8, r - 1, 8, o.ribs);
    rect(g, l + 1, 10, r - 1, 10, o.ribs);
    px(g, 7, 9, o.ribs);
    px(g, 8, 9, o.ribs);
  } else {
    rect(g, 7, 7, 8, 8, o.trim);
  }
  // head
  rect(g, l, 2, r, 6, o.skin);
  px(g, 6, 4, o.eyes ?? OUTLINE);
  px(g, 9, 4, o.eyes ?? OUTLINE);
  if (o.ribs) rect(g, 6, 6, 9, 6, o.ribs);
  if (o.hair) { rect(g, l, 1, r, 2, o.hair); px(g, l, 3, o.hair); px(g, r, 3, o.hair); }
  if (o.helmet) { rect(g, l, 1, r, 2, o.helmet); px(g, l, 3, o.helmet); px(g, r, 3, o.helmet); rect(g, 7, 0, 8, 0, o.trim); px(g, 7, 3, o.helmet); px(g, 8, 3, o.helmet); }
  if (o.hood) { rect(g, l - 1, 1, r + 1, 2, o.hood); rect(g, l - 1, 3, l - 1, 6, o.hood); rect(g, r + 1, 3, r + 1, 6, o.hood); px(g, l, 3, o.hood); px(g, r, 3, o.hood); }
  if (o.hat) { rect(g, 3, 2, 12, 2, o.hat); rect(g, 5, 1, 10, 1, o.hat); rect(g, 6, 0, 9, 0, o.hat); px(g, 7, 1, o.trim); px(g, 8, 1, o.trim); }
  if (o.ears) { px(g, l - 1, 3, o.skin); px(g, l - 2, 2, o.skin); px(g, l - 1, 4, o.skin); px(g, r + 1, 3, o.skin); px(g, r + 2, 2, o.skin); px(g, r + 1, 4, o.skin); }
  // gear
  const wx = o.big ? 14 : 13;
  const steel = '#cfd8dc', wood = '#8d5a2b';
  switch (o.weapon) {
    case 'sword': rect(g, wx, 3, wx, 9, steel); rect(g, wx - 1, 10, wx + 1, 10, '#d4a857'); px(g, wx, 11, wood); break;
    case 'scimitar': rect(g, wx, 5, wx, 9, steel); px(g, wx + 1, 4, steel); px(g, wx + 1, 5, steel); rect(g, wx - 1, 10, wx + 1, 10, wood); break;
    case 'dagger': rect(g, wx, 7, wx, 9, steel); rect(g, wx - 1, 10, wx + 1, 10, wood); break;
    case 'staff': rect(g, wx, 2, wx, 14, wood); px(g, wx, 1, '#6fe3ff'); px(g, wx, 0, '#c8f6ff'); break;
    case 'mace': rect(g, wx, 6, wx, 12, wood); rect(g, wx - 1, 3, wx + 1, 5, steel); break;
    case 'morningstar': rect(g, wx, 6, wx, 12, wood); rect(g, wx - 1, 2, wx + 1, 5, '#90a4ae'); px(g, wx - 2, 3, steel); px(g, wx + 1, 1, steel); px(g, wx - 1, 1, steel); break;
    case 'bow': rect(g, wx, 4, wx, 11, wood); px(g, wx - 1, 3, wood); px(g, wx - 1, 12, wood); rect(g, wx - 2, 4, wx - 2, 11, '#e8e0d0'); break;
    default: break;
  }
  if (o.shield) { rect(g, 1, 7, 3, 11, o.shield); px(g, 2, 9, '#d4a857'); px(g, 1, 11, null as unknown as string); px(g, 3, 11, null as unknown as string); px(g, 2, 12, o.shield); }
  return outline(g);
}

function rat(): Grid {
  const g = blank();
  const fur = '#7b5b4a', dark = '#5a4034', pink = '#e8a0a8';
  rect(g, 3, 8, 11, 12, fur);
  rect(g, 4, 7, 10, 7, fur);
  rect(g, 4, 12, 10, 12, dark);
  rect(g, 10, 7, 13, 10, fur);
  px(g, 14, 9, pink);
  px(g, 11, 6, pink);
  px(g, 12, 8, OUTLINE);
  rect(g, 0, 11, 2, 11, pink);
  px(g, 0, 10, pink);
  px(g, 4, 13, pink); px(g, 6, 13, pink); px(g, 9, 13, pink); px(g, 11, 13, pink);
  return outline(g);
}

function wolf(): Grid {
  const g = blank();
  const fur = '#8a8f98', dark = '#5c626c', light = '#c9ced6';
  rect(g, 2, 7, 11, 10, fur);
  rect(g, 3, 6, 10, 6, fur);
  rect(g, 10, 4, 13, 8, fur);
  px(g, 10, 3, dark); px(g, 13, 3, dark);
  rect(g, 14, 6, 15, 7, light);
  px(g, 12, 5, '#ffd54f');
  px(g, 15, 6, OUTLINE);
  rect(g, 0, 6, 1, 7, dark);
  for (const x of [3, 5, 8, 10]) rect(g, x, 11, x, 13, dark);
  rect(g, 3, 10, 10, 10, light);
  return outline(g);
}

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

function floor(variant: number): Grid {
  const g = blank();
  const rnd = mulberry(100 + variant);
  const base = ['#3a3340', '#3d3643', '#37313d'];
  rect(g, 0, 0, 15, 15, base[variant % base.length]);
  // flagstone seams
  rect(g, 0, 15, 15, 15, '#2a2530');
  rect(g, 15, 0, 15, 15, '#2a2530');
  if (variant % 2 === 0) rect(g, 7, 0, 7, 15, '#2f2935');
  else rect(g, 0, 7, 15, 7, '#2f2935');
  for (let i = 0; i < 9; i++) px(g, Math.floor(rnd() * 15), Math.floor(rnd() * 15), rnd() > 0.5 ? '#443c4b' : '#322c38');
  return g;
}

function wall(variant: number): Grid {
  const g = blank();
  const rnd = mulberry(500 + variant);
  rect(g, 0, 0, 15, 15, '#1d1922');
  const stone = ['#6b6375', '#625a6c', '#746c7e'];
  // three courses of offset bricks
  for (let row = 0; row < 3; row++) {
    const y0 = row * 5 + (row === 0 ? 0 : 1);
    const y1 = row === 2 ? 15 : y0 + 3 + (row === 0 ? 1 : 0);
    const offset = row % 2 === 0 ? 0 : 4;
    for (let x = -offset; x < 16; x += 8) {
      const c = stone[Math.floor(rnd() * stone.length)];
      rect(g, Math.max(0, x), y0, Math.min(15, x + 6), y1, c);
      rect(g, Math.max(0, x), y0, Math.min(15, x + 6), y0, '#8a8296');
      rect(g, Math.max(0, x), y1, Math.min(15, x + 6), y1, '#4a4454');
    }
  }
  return g;
}

const GRIDS: Record<string, () => Grid> = {
  fighter: () => humanoid({ skin: '#f0c8a0', body: '#9aa5b1', trim: '#c0392b', legs: '#5b6470', helmet: '#b8c2cc', weapon: 'sword', shield: '#c0392b' }),
  rogue: () => humanoid({ skin: '#e8b890', body: '#3d5a45', trim: '#22352a', legs: '#2c2c34', hood: '#2e4435', weapon: 'dagger' }),
  wizard: () => humanoid({ skin: '#f0c8a0', body: '#3b5fb5', trim: '#f1c40f', legs: '#2d4a94', hat: '#3b5fb5', hair: '#dcdcdc', weapon: 'staff' }),
  cleric: () => humanoid({ skin: '#d9a877', body: '#e8e0c8', trim: '#d4a857', legs: '#8a8272', hair: '#6b3f1d', weapon: 'mace', shield: '#e8e0c8' }),
  goblin: () => humanoid({ skin: '#7fae4a', body: '#6b4a2f', trim: '#3d2a1a', legs: '#4a3421', eyes: '#ffe14d', ears: true, weapon: 'scimitar' }),
  skeleton: () => humanoid({ skin: '#e6e2d3', body: '#d8d3c0', trim: '#8f8a78', legs: '#d8d3c0', ribs: '#3a3440', weapon: 'sword' }),
  bugbear: () => humanoid({ skin: '#a0673a', body: '#6e4424', trim: '#3b2413', legs: '#56351c', eyes: '#ff5a3c', ears: true, big: true, hair: '#5a3418', weapon: 'morningstar' }),
  bandit: () => humanoid({ skin: '#d9a877', body: '#5a4632', trim: '#8c2f2f', legs: '#3b3026', hood: '#4a3a2a', weapon: 'scimitar' }),
  orc: () => humanoid({ skin: '#6f8f5a', body: '#4d4038', trim: '#2a2320', legs: '#3a302a', eyes: '#ff5a3c', big: true, hair: '#20201c', weapon: 'morningstar' }),
  zombie: () => humanoid({ skin: '#8fa58a', body: '#5b5a4a', trim: '#3b3a30', legs: '#45443a', eyes: '#e8e8c0', hair: '#3a3f33', weapon: 'none' }),
  rat,
  wolf,
  floor0: () => floor(0),
  floor1: () => floor(1),
  floor2: () => floor(2),
  floor3: () => floor(3),
  wall0: () => wall(0),
  wall1: () => wall(1),
  wall2: () => wall(2),
};

const canvasCache = new Map<string, HTMLCanvasElement>();

export function spriteCanvas(name: string): HTMLCanvasElement {
  let c = canvasCache.get(name);
  if (c) return c;
  const grid = battleTileGrid(name) ?? (GRIDS[name] ?? GRIDS.goblin)();
  c = document.createElement('canvas');
  c.width = TILE;
  c.height = TILE;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const color = grid[y][x];
      if (color) { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }
    }
  }
  canvasCache.set(name, c);
  return c;
}

const urlCache = new Map<string, string>();


const TILE_SPRITES = /^(floor|wall)/;

/** Sprites that came from an art pack. A monster with one keeps it unless the Dungeon Master restyled it. */
export const packSprites = new Set<string>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

/**
 * Replace generated sprites with ones from an optional art pack the server has
 * downloaded (see server/src/art.ts). Anything missing or oddly sized keeps the
 * generated art, so a broken pack can never leave the map blank.
 */
export async function loadArtPack(): Promise<void> {
  try {
    const res = await fetch('/api/art');
    if (!res.ok) return;
    const manifest = (await res.json()) as { sprites: Record<string, { src: string; rect?: { x: number; y: number; w: number; h: number } }>; icons?: Record<string, { src: string; rect?: { x: number; y: number; w: number; h: number } }> };
    void setItemIcons(manifest.icons ?? {});
    const images = new Map<string, Promise<HTMLImageElement>>();
    await Promise.all(
      Object.entries(manifest.sprites ?? {}).map(async ([name, ref]) => {
        try {
          if (!images.has(ref.src)) images.set(ref.src, loadImage(ref.src));
          const img = await images.get(ref.src)!;
          const r = ref.rect ?? { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
          if (r.w < 1 || r.h < 1 || r.w > 48 || r.h > 48) return;
          if (TILE_SPRITES.test(name) && (r.w !== TILE || r.h !== TILE)) return;
          const c = document.createElement('canvas');
          c.width = r.w;
          c.height = r.h;
          c.getContext('2d')!.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
          canvasCache.set(name, c);
          packSprites.add(name);
          urlCache.delete(name);
        } catch {
          /* keep the generated sprite */
        }
      }),
    );
  } catch {
    /* no art pack: generated sprites */
  }
}
