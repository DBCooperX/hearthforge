import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { artManifest, artMode, ensureArt } from '../src/art';

const png = new Uint8Array([137, 80, 78, 71]);

describe('art packs', () => {
  it('defaults to generated art', () => {
    expect(artMode({})).toBe('generated');
    expect(artMode({ HEARTHFORGE_ART: 'Kenney' })).toBe('kenney');
    expect(artManifest('/nonexistent', 'generated')).toBeNull();
    expect(artManifest('/nonexistent', 'kenney')).toBeNull();
  });

  it('unpacks a dropped Kenney zip safely and maps tiles', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hf-art-'));
    writeFileSync(join(dir, 'kenney_tiny-dungeon.zip'), zipSync({ 'Tiles/tile_0096.png': png, 'Tiles/tile_0109.png': png, '../../escape.png': png, 'run.sh': png }));
    await ensureArt(dir, 'kenney', {});
    expect(existsSync(join(dir, 'kenney', 'Tiles', 'tile_0096.png'))).toBe(true);
    expect(existsSync(join(dir, '..', 'escape.png'))).toBe(false);
    expect(existsSync(join(dir, 'kenney', 'run.sh'))).toBe(false);
    const m = artManifest(dir, 'kenney')!;
    expect(m.sprites.fighter.src).toBe('/art/kenney/Tiles/tile_0096.png');
    expect(m.sprites.wizard).toBeUndefined();
    writeFileSync(join(dir, 'kenney-map.json'), JSON.stringify({ wizard: 109 }));
    expect(artManifest(dir, 'kenney')!.sprites.wizard.src).toBe('/art/kenney/Tiles/tile_0109.png');
  });

  it('reads the 0x72 tile list by name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hf-art-'));
    mkdirSync(join(dir, '0x72'));
    writeFileSync(join(dir, '0x72', '0x72_DungeonTilesetII_v1.7.png'), png);
    writeFileSync(join(dir, '0x72', 'tiles_list_v1.7'), 'floor_1 16 64 16 16\nknight_m_idle_anim_f0 128 100 16 28\nnot a tile line\n');
    const m = artManifest(dir, '0x72')!;
    expect(m.sprites.fighter.rect).toEqual({ x: 128, y: 100, w: 16, h: 28 });
    expect(m.sprites.goblin).toBeUndefined();
  });

  it('never contacts kenney.nl by itself and lists Kenney as an owner download', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hf-art-'));
    const real = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => { calls++; return Promise.reject(new Error('no network')); }) as typeof fetch;
    try {
      await ensureArt(dir, 'kenney', {});
      const lib = new ArtStore(dir, { HEARTHFORGE_AUTO_ASSETS: 'off', HEARTHFORGE_ART: 'kenney' });
      await lib.start();
      expect(lib.library(true, true).packs.find((p) => p.id === 'kenney')).toMatchObject({ source: 'upload', installed: false, url: 'https://kenney.nl/assets/tiny-dungeon' });
      await expect(lib.install('kenney')).rejects.toMatchObject({ code: 'unknown_pack' });
    } finally { globalThis.fetch = real; }
    expect(calls).toBe(0);
  });

  it('never throws when a download is impossible', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hf-art-'));
    await expect(ensureArt(dir, '0x72', {})).resolves.toBeUndefined();
    expect(artManifest(dir, '0x72')).toBeNull();
  });
});

import { zipSync as zip } from 'fflate';
import { GAME_ICON_PATHS, ICON_SLOTS, iconSlotsOf } from '../../shared/art';
import { ITEMS } from '../../shared/content';
import { ArtError, ArtStore, cleanSvg } from '../src/artLibrary';

/** A PNG header that says how large the image is; the library never reads past it. */
function pngOf(w: number, h: number) {
  const b = Buffer.alloc(33);
  b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return new Uint8Array(b);
}
const fresh = () => mkdtempSync(join(tmpdir(), 'hf-lib-'));

describe('art library', () => {
  it('gives every icon slot a game-icons picture and finds slots for items', () => {
    for (const s of ICON_SLOTS) expect(GAME_ICON_PATHS[s.id], s.id).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/);
    expect(iconSlotsOf(ITEMS.longsword)).toEqual(['longsword', 'blade']);
    expect(iconSlotsOf({ id: 'story_1', icon: '🗝️' })).toEqual(['key']);
    expect(iconSlotsOf({ id: 'story_2', icon: '❗' })).toEqual([]);
  });

  it('takes in an uploaded icon pack, matches by file name and lets the host assign the rest', () => {
    const dir = fresh();
    const lib = new ArtStore(dir, { HEARTHFORGE_AUTO_ASSETS: 'off', HEARTHFORGE_ART: 'kenney' });
    expect(lib.manifest()).toEqual({ pack: 'generated', sprites: {}, iconPack: 'emoji', icons: {} });
    const added = lib.importZip('Kyrises_16x16_RPG_Icon_Pack_V1.3.zip', zip({
      'icons/16x16/sword_01a.png': pngOf(16, 16), 'icons/32x32/sword_01a.png': pngOf(32, 32), 'icons/32x32/potion_02b.png': pngOf(32, 32),
      'icons/32x32/Keys.png': pngOf(32, 32), 'sheet.png': pngOf(64, 256), '../../escape.png': pngOf(16, 16), 'readme.exe': pngOf(1, 1), '__MACOSX/x.png': pngOf(16, 16),
    }));
    expect(added).toEqual({ id: 'kyrise-rpg-icons', kind: 'icons' });
    expect(existsSync(join(dir, '..', 'escape.png'))).toBe(false);
    expect(existsSync(join(dir, 'icons', 'kyrise-rpg-icons', 'readme.exe'))).toBe(false);
    const m = lib.manifest();
    expect(m.iconPack).toBe('kyrise-rpg-icons');
    expect(m.icons.longsword.src).toBe('/art/icons/kyrise-rpg-icons/icons/32x32/sword_01a.png');
    expect(m.icons.potion_healing.src).toContain('potion_02b');
    expect(m.icons.key.src).toContain('Keys');
    expect(m.icons.bone).toBeUndefined();
    const pack = lib.library(true, true).packs.find((p) => p.id === 'kyrise-rpg-icons')!;
    expect(pack).toMatchObject({ license: 'CC BY 4.0', author: 'Kyrise', active: true, cell: 16 });

    const cells = lib.packIcons('kyrise-rpg-icons').filter((i) => i.rect);
    expect(cells).toHaveLength(4 * 16);
    lib.assign('kyrise-rpg-icons', 'bone', cells[5].name);
    expect(lib.manifest().icons.bone.rect).toEqual({ x: 16, y: 16, w: 16, h: 16 });
    lib.assign('kyrise-rpg-icons', 'longsword', null);
    expect(lib.manifest().icons.longsword).toBeUndefined();
    lib.assign('kyrise-rpg-icons', 'longsword', undefined);
    expect(lib.manifest().icons.longsword).toBeDefined();
    expect(() => lib.assign('kyrise-rpg-icons', 'nonsense', null)).toThrow(ArtError);
    expect(() => lib.assign('kyrise-rpg-icons', 'bone', 'no such icon')).toThrow(ArtError);
    lib.describe('kyrise-rpg-icons', { cell: 32, url: 'javascript:alert(1)' });
    expect(lib.manifest().icons.bone).toBeUndefined();
    expect(lib.library(true, true).packs.find((p) => p.id === 'kyrise-rpg-icons')!.url).toBe('');

    // The choice survives a restart, and removing the pack brings the emoji back.
    const again = new ArtStore(dir, {});
    expect(again.icons).toBe('kyrise-rpg-icons');
    again.activate('icons', 'emoji');
    expect(again.manifest().icons).toEqual({});
    again.remove('kyrise-rpg-icons');
    expect(existsSync(join(dir, 'icons', 'kyrise-rpg-icons'))).toBe(false);
    expect(() => again.activate('icons', 'kyrise-rpg-icons')).toThrow(ArtError);
  });

  it('recognises tile packs by what is inside and refuses rubbish', () => {
    const dir = fresh();
    const lib = new ArtStore(dir, { HEARTHFORGE_ART: 'generated' });
    const tiles: Record<string, Uint8Array> = {};
    for (let i = 0; i < 132; i++) tiles[`Tiles/tile_${String(i).padStart(4, '0')}.png`] = pngOf(16, 16);
    expect(lib.importZip('download.zip', zip(tiles))).toEqual({ id: 'kenney', kind: 'tiles' });
    expect(lib.tiles).toBe('kenney');
    expect(lib.manifest().sprites.fighter.src).toBe('/art/kenney/Tiles/tile_0096.png');
    expect(lib.importZip('pack.zip', zip({ 'frames/0x72_DungeonTilesetII_v1.7.png': pngOf(512, 512), 'tiles_list_v1.7': new TextEncoder().encode('floor_1 16 64 16 16\n') }))).toEqual({ id: '0x72', kind: 'tiles' });
    expect(lib.manifest().pack).toBe('0x72');
    lib.activate('tiles', 'generated');
    expect(lib.manifest().pack).toBe('generated');
    // The server tells open browsers to reload only when the tile sprites differ, so an icon-only change must leave them alone.
    const before = JSON.stringify(lib.manifest().sprites);
    lib.activate('icons', 'emoji');
    expect(JSON.stringify(lib.manifest().sprites)).toBe(before);
    lib.activate('tiles', '0x72');
    expect(JSON.stringify(lib.manifest().sprites)).not.toBe(before);
    lib.activate('tiles', 'generated');
    expect(() => lib.importZip('x.zip', new Uint8Array([1, 2, 3]))).toThrow(ArtError);
    expect(() => lib.importZip('x.zip', zip({ 'a.txt': new Uint8Array([1]) }))).toThrow(ArtError);
    expect(() => lib.activate('icons', 'game-icons')).toThrow(ArtError);
  });

  it('takes in a zip copied into the folder by hand', async () => {
    const dir = fresh();
    writeFileSync(join(dir, 'My Icons.zip'), zip({ 'ring.png': pngOf(24, 24) }));
    const lib = new ArtStore(dir, { HEARTHFORGE_ART: 'generated', HEARTHFORGE_AUTO_ASSETS: 'off' });
    await lib.start();
    expect(lib.manifest().icons.ring_protection.src).toBe('/art/icons/my-icons/ring.png');
    expect(existsSync(join(dir, 'imported', 'My Icons.zip'))).toBe(true);
  });

  it('keeps only harmless svg', () => {
    expect(cleanSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z"/><path fill="#fff" d="M1 1"/></svg>'))
      .toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="#ead9b0" d="M1 1"/></svg>');
    expect(cleanSvg('<svg><script>alert(1)</script></svg>')).toBeNull();
    expect(cleanSvg('<svg onload="x()"></svg>')).toBeNull();
    expect(cleanSvg('<html></html>')).toBeNull();
  });
});
