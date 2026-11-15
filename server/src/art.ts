// Optional third-party art packs. With HEARTHFORGE_ART=kenney or 0x72 the server fetches
// the CC0 pack on start, unpacks it into ART_DIR and tells the client which image to use
// for each sprite. Any sprite the pack cannot supply keeps its generated pixel art, and
// if the download fails the whole game simply stays on the generated art.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { unzipSync } from 'fflate';

export type ArtMode = 'generated' | 'kenney' | '0x72';

export interface SpriteRef {
  src: string;
  /** Sub-rectangle of the image. Omitted when the whole image is the sprite. */
  rect?: { x: number; y: number; w: number; h: number };
}
export interface ArtManifest {
  pack: ArtMode;
  sprites: Record<string, SpriteRef>;
}

const KENNEY_PAGE = 'https://kenney.nl/assets/tiny-dungeon';
const OX72_PAGE = 'https://0x72.itch.io/dungeontileset-ii';

/**
 * Kenney "Tiny Dungeon": sprite name -> tile number (Tiles/tile_NNNN.png).
 * NOTE: these numbers were written without being able to view the sheet and are a
 * best guess. Override any of them with ART_DIR/kenney-map.json ({"goblin": 111, ...}).
 */
const KENNEY_TILES: Record<string, number> = {
  floor0: 48, floor1: 49, floor2: 50, floor3: 48,
  wall0: 40, wall1: 40, wall2: 40,
  door: 45, door_open: 33,
  chest: 89, chest_open: 91,
  fighter: 96, rogue: 88, wizard: 84, cleric: 98,
  goblin: 109, skeleton: 121, bugbear: 110, rat: 123,
};

/** 0x72 "DungeonTileset II": sprite name -> candidate names in the pack's tile list. */
const OX72_NAMES: Record<string, string[]> = {
  floor0: ['floor_1'], floor1: ['floor_2'], floor2: ['floor_3'], floor3: ['floor_4'],
  wall0: ['wall_mid'], wall1: ['wall_mid'], wall2: ['wall_mid'],
  chest: ['chest_full_open_anim_f0', 'chest_empty_open_anim_f0'],
  chest_open: ['chest_full_open_anim_f2', 'chest_empty_open_anim_f2'],
  fighter: ['knight_m_idle_anim_f0'],
  rogue: ['elf_m_idle_anim_f0'],
  wizard: ['wizzard_m_idle_anim_f0', 'wizard_m_idle_anim_f0'],
  cleric: ['dwarf_m_idle_anim_f0', 'knight_f_idle_anim_f0'],
  goblin: ['goblin_idle_anim_f0'],
  skeleton: ['skelet_idle_anim_f0', 'skeleton_idle_anim_f0'],
  bugbear: ['ogre_idle_anim_f0', 'masked_orc_idle_anim_f0'],
  rat: ['tiny_zombie_idle_anim_f0', 'imp_idle_anim_f0'],
};

export function artMode(env: NodeJS.ProcessEnv): ArtMode {
  const v = (env.HEARTHFORGE_ART ?? 'generated').toLowerCase();
  return v === 'kenney' || v === '0x72' ? v : 'generated';
}

export function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

function unpack(zip: Uint8Array, dest: string) {
  const files = unzipSync(zip, { filter: (f) => /\.(png|txt|md|json)$/i.test(f.name) && f.originalSize < 8_000_000 });
  for (const [name, data] of Object.entries(files)) {
    // Zip entries are untrusted: keep every path inside dest.
    const clean = name.split(/[\\/]/).filter((p) => p && p !== '.' && p !== '..').join(sep);
    if (!clean) continue;
    const out = join(dest, clean);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, data);
  }
}

export async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { 'user-agent': 'hearthforge-art-fetch' } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** A zip the user dropped into ART_DIR by hand, matched by name. */
function localZip(artDir: string, pattern: RegExp): string | undefined {
  if (!existsSync(artDir)) return undefined;
  return readdirSync(artDir).filter((f) => /\.zip$/i.test(f) && pattern.test(f)).map((f) => join(artDir, f))[0];
}

/** Make sure the selected pack is unpacked in artDir. Never throws. */
export async function ensureArt(artDir: string, mode: ArtMode, env: NodeJS.ProcessEnv): Promise<void> {
  if (mode === 'generated') return;
  const dest = join(artDir, mode);
  try {
    if (walk(dest).some((f) => f.endsWith('.png'))) return;
    mkdirSync(artDir, { recursive: true });
    const dropped = localZip(artDir, mode === 'kenney' ? /kenney|tiny/i : /0x72|dungeontileset/i);
    let zip: Uint8Array;
    if (dropped) {
      zip = readFileSync(dropped);
    } else if (mode === 'kenney') {
      let url = env.HEARTHFORGE_KENNEY_URL;
      if (!url) {
        // The download link carries a content hash, so read it off the asset page.
        const html = new TextDecoder().decode(await download(KENNEY_PAGE));
        url = /https?:\/\/[^"'\s]+\.zip/i.exec(html)?.[0];
        if (!url) throw new Error(`no download link found on ${KENNEY_PAGE}`);
      }
      zip = await download(url);
    } else {
      const url = env.HEARTHFORGE_0X72_URL;
      if (!url) throw new Error(`itch.io has no direct download link. Download the pack from ${OX72_PAGE} and copy the zip into ${artDir}, or set HEARTHFORGE_0X72_URL`);
      zip = await download(url);
    }
    unpack(zip, dest);
    console.log(`[art] Unpacked the ${mode} pack into ${dest}`);
  } catch (err) {
    console.warn(`[art] Could not get the ${mode} art pack, using generated sprites: ${err instanceof Error ? err.message : err}`);
  }
}

/** Describe the unpacked pack for the client. Returns null to keep generated art. */
export function artManifest(artDir: string, mode: ArtMode): ArtManifest | null {
  if (mode === 'generated') return null;
  const root = join(artDir, mode);
  const files = walk(root);
  const url = (file: string) => `/art/${mode}/${relative(root, file).split(sep).map(encodeURIComponent).join('/')}`;
  const sprites: Record<string, SpriteRef> = {};
  try {
    if (mode === 'kenney') {
      let map = KENNEY_TILES;
      const custom = join(artDir, 'kenney-map.json');
      if (existsSync(custom)) map = { ...map, ...JSON.parse(readFileSync(custom, 'utf8')) };
      for (const [name, n] of Object.entries(map)) {
        const file = files.find((f) => f.endsWith(`tile_${String(n).padStart(4, '0')}.png`));
        if (file) sprites[name] = { src: url(file) };
      }
    } else {
      // The pack ships a text file listing "name x y w h" for every tile in its atlas.
      const list = files.find((f) => /tiles?_list.*$/i.test(f) && !f.endsWith('.png'));
      const atlas = files.find((f) => /dungeon_?tileset_?ii.*\.png$/i.test(f) && !/extra/i.test(f));
      if (list && atlas) {
        const rects = new Map<string, { x: number; y: number; w: number; h: number }>();
        for (const line of readFileSync(list, 'utf8').split(/\r?\n/)) {
          const p = line.trim().split(/\s+/);
          if (p.length >= 5 && p.slice(1, 5).every((v) => /^\d+$/.test(v))) rects.set(p[0], { x: +p[1], y: +p[2], w: +p[3], h: +p[4] });
        }
        for (const [name, candidates] of Object.entries(OX72_NAMES)) {
          const hit = candidates.find((c) => rects.has(c));
          if (hit) sprites[name] = { src: url(atlas), rect: rects.get(hit)! };
        }
      }
    }
  } catch (err) {
    console.warn('[art] Could not read the art pack:', err);
  }
  return Object.keys(sprites).length ? { pack: mode, sprites } : null;
}
