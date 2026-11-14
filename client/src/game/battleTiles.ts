// Generated 16x16 tiles for battle maps: one look per kind of place. Like the
// rest of the generated art these are original and CC0. Every tile is drawn
// complete (ground first, then the tree, rock or water on top) so the map needs
// a single sprite per square.

import type { Biome } from '../../../shared/battlemap';

type Grid = (string | null)[][];
const N = 16;

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

const rect = (g: Grid, x0: number, y0: number, x1: number, y1: number, c: string) => { for (let y = Math.max(0, y0); y <= Math.min(N - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(N - 1, x1); x++) g[y][x] = c; };
const px = (g: Grid, x: number, y: number, c: string) => { if (x >= 0 && y >= 0 && x < N && y < N) g[y][x] = c; };
const disc = (g: Grid, cx: number, cy: number, r: number, c: string) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + 1) px(g, cx + x, cy + y, c); };

interface Look {
  /** Ground: base colour, darker and lighter flecks. */
  ground: [string, string, string];
  /** Grass tufts on the ground, if any. */
  tuft?: string;
  /** What '=' is. */
  deck: 'dirt' | 'planks' | 'cobble';
  /** What ',' is. */
  rough: 'mud' | 'brush' | 'grass' | 'scree' | 'rubble';
  /** What 'T' is. */
  tree: 'leafy' | 'pine' | 'dead' | 'bush';
  /** What 't' is. */
  prop: 'table' | 'crate';
  /** What '#' is: base, light edge, dark edge. */
  wall: [string, string, string];
  wallStyle: 'brick' | 'rock' | 'timber';
  /** Shallow and deep water. */
  water: [string, string];
}

const GRASS: Pick<Look, 'deck' | 'prop' | 'wall' | 'wallStyle' | 'water'> = { deck: 'dirt', prop: 'crate', wall: ['#6d6a66', '#8d8a85', '#45423f'], wallStyle: 'rock', water: ['#4f8fae', '#2c5f86'] };

const LOOKS: Record<Biome, Look> = {
  dungeon: { ground: ['#3a3340', '#322c38', '#443c4b'], deck: 'planks', rough: 'rubble', tree: 'dead', prop: 'crate', wall: ['#6b6375', '#8a8296', '#4a4454'], wallStyle: 'brick', water: ['#3f6f8a', '#27485f'] },
  cave: { ground: ['#40372f', '#352d27', '#4c4239'], deck: 'planks', rough: 'rubble', tree: 'dead', prop: 'crate', wall: ['#2a2420', '#3d352e', '#1a1613'], wallStyle: 'rock', water: ['#3f7a86', '#24505c'] },
  ruin: { ground: ['#55574a', '#494b40', '#62644f'], tuft: '#6f8a4a', deck: 'cobble', rough: 'rubble', tree: 'leafy', prop: 'crate', wall: ['#77766a', '#96957f', '#4f4e45'], wallStyle: 'brick', water: ['#4f8fae', '#2c5f86'] },
  tavern: { ground: ['#7a5a3a', '#6a4d31', '#8a6843'], deck: 'planks', rough: 'rubble', tree: 'bush', prop: 'table', wall: ['#4a3423', '#6a4b32', '#2e2016'], wallStyle: 'timber', water: ['#4f8fae', '#2c5f86'] },
  town: { ground: ['#6f6050', '#625446', '#7c6c5a'], deck: 'cobble', rough: 'mud', tree: 'leafy', prop: 'crate', wall: ['#8c6f58', '#b08d70', '#5a4638'], wallStyle: 'timber', water: ['#4f8fae', '#2c5f86'] },
  road: { ...GRASS, ground: ['#5a7438', '#4f6831', '#688440'], tuft: '#7a9a4a', rough: 'mud', tree: 'leafy' },
  bridge: { ...GRASS, ground: ['#5a7438', '#4f6831', '#688440'], tuft: '#7a9a4a', deck: 'planks', rough: 'mud', tree: 'leafy' },
  camp: { ...GRASS, ground: ['#5f6f3a', '#536233', '#6c7d43'], tuft: '#7a9a4a', rough: 'grass', tree: 'leafy' },
  plains: { ...GRASS, ground: ['#62803c', '#577335', '#709045'], tuft: '#86a652', rough: 'grass', tree: 'bush' },
  forest: { ...GRASS, ground: ['#37542f', '#2f4a29', '#416236'], tuft: '#4f7a3c', rough: 'brush', tree: 'pine' },
  hills: { ...GRASS, ground: ['#76703f', '#696338', '#857e49'], tuft: '#8f9a4e', rough: 'scree', tree: 'bush' },
  mountains: { ...GRASS, ground: ['#65615e', '#595552', '#74706c'], rough: 'scree', tree: 'pine', wall: ['#4a4744', '#6a6662', '#2f2d2b'] },
  swamp: { ...GRASS, ground: ['#3d4a34', '#34402d', '#48563c'], tuft: '#5f7040', rough: 'mud', tree: 'dead', water: ['#4a6b5a', '#2c4a42'] },
};

function ground(look: Look, rnd: () => number): Grid {
  const g: Grid = Array.from({ length: N }, () => Array<string | null>(N).fill(look.ground[0]));
  for (let i = 0; i < 22; i++) px(g, Math.floor(rnd() * N), Math.floor(rnd() * N), rnd() > 0.5 ? look.ground[1] : look.ground[2]);
  if (look.tuft) for (let i = 0; i < 3; i++) { const x = 1 + Math.floor(rnd() * 13), y = 2 + Math.floor(rnd() * 12); px(g, x, y, look.tuft); px(g, x + 1, y - 1, look.tuft); }
  return g;
}

function deck(g: Grid, look: Look, rnd: () => number) {
  if (look.deck === 'planks') {
    const wood = look === LOOKS.tavern ? ['#8a6540', '#7d5a38', '#946e47'] : ['#8d6e4a', '#7f6241', '#9a7a53'];
    for (let row = 0; row < 4; row++) {
      rect(g, 0, row * 4, 15, row * 4 + 3, wood[Math.floor(rnd() * 3)]);
      rect(g, 0, row * 4 + 3, 15, row * 4 + 3, '#4f3a25');
      const seam = 2 + Math.floor(rnd() * 12);
      rect(g, seam, row * 4, seam, row * 4 + 2, '#5c452d');
    }
  } else if (look.deck === 'cobble') {
    rect(g, 0, 0, 15, 15, '#4c4841');
    for (let row = 0; row < 4; row++) for (let x = row % 2 ? -2 : 0; x < 16; x += 4) rect(g, x, row * 4, x + 2, row * 4 + 2, ['#8a857b', '#7c776e', '#969186'][Math.floor(rnd() * 3)]);
  } else {
    rect(g, 0, 0, 15, 15, '#8a7250');
    for (let i = 0; i < 26; i++) px(g, Math.floor(rnd() * N), Math.floor(rnd() * N), rnd() > 0.5 ? '#7a6445' : '#9a825e');
    for (let i = 0; i < 2; i++) { const x = Math.floor(rnd() * 14), y = Math.floor(rnd() * 15); rect(g, x, y, x + 1, y, '#6a5a44'); }
  }
}

function rough(g: Grid, look: Look, rnd: () => number) {
  const spots = (n: number, colors: string[], r: number) => { for (let i = 0; i < n; i++) disc(g, 2 + Math.floor(rnd() * 12), 2 + Math.floor(rnd() * 12), r, colors[Math.floor(rnd() * colors.length)]); };
  switch (look.rough) {
    case 'mud':
      spots(5, ['#5a4632', '#4f3d2b'], 3);
      spots(4, ['#6b5540'], 1);
      for (let i = 0; i < 3; i++) { const x = 2 + Math.floor(rnd() * 10), y = 2 + Math.floor(rnd() * 12); rect(g, x, y, x + 2, y, '#3a2d20'); }
      break;
    case 'brush':
      for (let i = 0; i < 9; i++) { const x = 1 + Math.floor(rnd() * 13), y = 3 + Math.floor(rnd() * 12); px(g, x, y, '#6f9a4a'); px(g, x - 1, y - 1, '#5c8a3e'); px(g, x + 1, y - 1, '#5c8a3e'); px(g, x, y - 2, '#84b05a'); }
      break;
    case 'grass':
      for (let i = 0; i < 14; i++) { const x = Math.floor(rnd() * 16), y = 3 + Math.floor(rnd() * 13); rect(g, x, y - 2, x, y, rnd() > 0.5 ? '#a8b860' : '#8fa650'); px(g, x + 1, y - 3, '#c4cc74'); }
      break;
    case 'scree':
      for (let i = 0; i < 9; i++) { const x = 1 + Math.floor(rnd() * 13), y = 1 + Math.floor(rnd() * 13); rect(g, x, y, x + 1, y + 1, '#8f8a84'); px(g, x, y, '#b0aba4'); px(g, x + 1, y + 2, '#4a4744'); }
      break;
    default:
      for (let i = 0; i < 8; i++) { const x = 1 + Math.floor(rnd() * 13), y = 1 + Math.floor(rnd() * 13); rect(g, x, y, x + 1, y + 1, look.wall[0]); px(g, x, y, look.wall[1]); px(g, x + 1, y + 2, look.wall[2]); px(g, x + 2, y + 1, look.wall[2]); }
  }
}

function water(g: Grid, look: Look, deep: boolean, rnd: () => number) {
  const c = look.water[deep ? 1 : 0];
  if (deep) rect(g, 0, 0, 15, 15, c);
  else for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (rnd() > 0.12) g[y][x] = c;
  const light = deep ? look.water[0] : '#a8d0d8';
  for (let i = 0; i < (deep ? 3 : 4); i++) { const x = 1 + Math.floor(rnd() * 11), y = 1 + Math.floor(rnd() * 14); rect(g, x, y, x + 2, y, light); }
  if (!deep && look.tuft) for (let i = 0; i < 2; i++) { const x = 1 + Math.floor(rnd() * 13), y = 4 + Math.floor(rnd() * 11); rect(g, x, y - 3, x, y, '#7a8a4a'); px(g, x, y - 4, '#5a4632'); }
}

function tree(g: Grid, look: Look, rnd: () => number) {
  const O = '#17121c';
  if (look.tree === 'dead') {
    rect(g, 7, 6, 8, 14, '#4a3a2c'); rect(g, 6, 13, 9, 14, '#3a2d22');
    for (const [x, y] of [[6, 5], [5, 4], [4, 3], [9, 6], [10, 5], [11, 3], [8, 4], [8, 2], [11, 4]]) px(g, x, y, '#5a4838');
    px(g, 7, 8, '#6a7a4a'); px(g, 8, 10, '#6a7a4a'); px(g, 5, 4, '#6a7a4a');
  } else if (look.tree === 'bush') {
    disc(g, 8, 9, 5, O); disc(g, 8, 9, 4, '#3f6f34'); disc(g, 6, 8, 2, '#56894a'); disc(g, 10, 10, 2, '#356030');
    for (let i = 0; i < 4; i++) px(g, 5 + Math.floor(rnd() * 7), 6 + Math.floor(rnd() * 6), '#7ab05e');
  } else if (look.tree === 'pine') {
    rect(g, 7, 12, 8, 15, '#5a4030');
    for (const [y, w] of [[1, 0], [2, 1], [3, 1], [4, 2], [5, 2], [6, 3], [7, 3], [8, 4], [9, 4], [10, 5], [11, 5]] as const) { rect(g, 7 - w - 1, y, 8 + w + 1, y, O); rect(g, 7 - w, y, 8 + w, y, y % 3 === 0 ? '#2c5a34' : '#24492b'); }
    for (let i = 0; i < 5; i++) px(g, 6 + Math.floor(rnd() * 4), 3 + Math.floor(rnd() * 8), '#3f7a48');
  } else {
    rect(g, 7, 10, 8, 15, '#5a4030'); px(g, 6, 15, '#5a4030'); px(g, 9, 15, '#5a4030');
    disc(g, 8, 6, 6, O); disc(g, 8, 6, 5, '#3c7a36'); disc(g, 6, 5, 2, '#58994c'); disc(g, 10, 8, 2, '#2f6230');
    for (let i = 0; i < 5; i++) px(g, 4 + Math.floor(rnd() * 9), 2 + Math.floor(rnd() * 8), '#74b060');
  }
}

function rock(g: Grid, rnd: () => number) {
  const O = '#17121c';
  const w = 4 + Math.floor(rnd() * 2);
  disc(g, 8, 10, w + 1, O); rect(g, 8 - w - 1, 11, 8 + w + 1, 14, O);
  disc(g, 8, 10, w, '#85807a'); rect(g, 8 - w, 11, 8 + w, 13, '#6f6a65');
  disc(g, 6, 8, 2, '#a8a39c'); rect(g, 9, 12, 8 + w, 13, '#56524e'); px(g, 5, 7, '#c4c0b8');
}

function prop(g: Grid, look: Look, variant: number) {
  const O = '#17121c';
  if (look.prop === 'table') {
    rect(g, 1, 3, 14, 13, O); rect(g, 2, 4, 13, 11, '#a87a48'); rect(g, 2, 4, 13, 4, '#c4935a'); rect(g, 2, 12, 13, 12, '#6a4a2c');
    rect(g, 2, 7, 13, 7, '#946a3c');
    if (variant % 2) { rect(g, 4, 5, 5, 6, '#d8d0c0'); px(g, 6, 6, '#d8d0c0'); } else { rect(g, 10, 8, 11, 10, '#c9a24a'); px(g, 10, 8, '#f0e6c8'); px(g, 11, 8, '#f0e6c8'); }
    if (variant > 1) disc(g, 5, 9, 1, '#e8dcc0');
  } else if (variant % 2) {
    rect(g, 3, 2, 12, 14, O); rect(g, 4, 3, 11, 13, '#8a5e36'); rect(g, 5, 3, 6, 13, '#a87644'); rect(g, 10, 3, 11, 13, '#6a4628');
    rect(g, 4, 5, 11, 5, '#4a4a52'); rect(g, 4, 11, 11, 11, '#4a4a52');
  } else {
    rect(g, 2, 3, 13, 14, O); rect(g, 3, 4, 12, 13, '#9a7446'); rect(g, 3, 4, 12, 4, '#b88c58'); rect(g, 3, 13, 12, 13, '#6a4e2e');
    for (let i = 0; i < 8; i++) { px(g, 4 + i, 5 + i, '#6a4e2e'); px(g, 11 - i, 5 + i, '#6a4e2e'); }
    rect(g, 3, 4, 3, 13, '#7a5a36'); rect(g, 12, 4, 12, 13, '#7a5a36');
  }
}

function wall(g: Grid, look: Look, rnd: () => number) {
  const [base, light, dark] = look.wall;
  if (look.wallStyle === 'rock') {
    rect(g, 0, 0, 15, 15, base);
    for (let i = 0; i < 6; i++) { const x = Math.floor(rnd() * 13), y = Math.floor(rnd() * 13), w = 2 + Math.floor(rnd() * 3); rect(g, x, y, x + w, y + 2, light); rect(g, x, y + 2, x + w, y + 2, dark); px(g, x + w, y + 1, dark); }
    for (let i = 0; i < 10; i++) px(g, Math.floor(rnd() * N), Math.floor(rnd() * N), dark);
  } else if (look.wallStyle === 'timber') {
    rect(g, 0, 0, 15, 15, base);
    for (let x = 0; x < 16; x += 4) { rect(g, x, 0, x, 15, dark); rect(g, x + 1, 0, x + 1, 15, light); }
    rect(g, 0, 0, 15, 1, dark); rect(g, 0, 14, 15, 15, dark); rect(g, 0, 2, 15, 2, light);
  } else {
    rect(g, 0, 0, 15, 15, dark);
    for (let row = 0; row < 3; row++) {
      const y0 = row * 5 + (row ? 1 : 0), y1 = row === 2 ? 15 : y0 + 3 + (row ? 0 : 1);
      for (let x = row % 2 ? -4 : 0; x < 16; x += 8) { rect(g, x, y0, x + 6, y1, base); rect(g, x, y0, x + 6, y0, light); }
    }
    if (look.tuft) for (let i = 0; i < 4; i++) px(g, Math.floor(rnd() * N), Math.floor(rnd() * N), look.tuft);
  }
}

/** Sprite name for a battle map square. Dungeon floors and walls keep their old names so art packs still replace them. */
export function battleTileName(biome: Biome, ch: string, x: number, y: number): string {
  const h = (x * 7 + y * 13) % 4;
  if (biome === 'dungeon' && ch === '.') return `floor${h}`;
  if (biome === 'dungeon' && ch === '#') return `wall${h % 3}`;
  return `bm|${biome}|${ch}|${h}`;
}

/** Draws a tile named by battleTileName, or null if the name is not one. */
export function battleTileGrid(name: string): Grid | null {
  const [tag, biome, ch, v] = name.split('|');
  if (tag !== 'bm' || !(biome in LOOKS)) return null;
  const look = LOOKS[biome as Biome];
  const variant = Number(v) || 0;
  const rnd = mulberry([...biome].reduce((n, c) => n * 31 + c.charCodeAt(0), 7) + ch.charCodeAt(0) * 131 + variant * 17);
  const g = ground(look, rnd);
  switch (ch) {
    case '=': deck(g, look, rnd); break;
    case ',': rough(g, look, rnd); break;
    case '~': water(g, look, false, rnd); break;
    case 'W': water(g, look, true, rnd); break;
    case 'T': tree(g, look, rnd); break;
    case 'o': rock(g, rnd); break;
    case 't': if (look.prop === 'table') deck(g, look, rnd); prop(g, look, variant); break;
    case '#': wall(g, look, rnd); break;
  }
  return g;
}
