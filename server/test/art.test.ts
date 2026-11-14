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

  it('never throws when a download is impossible', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hf-art-'));
    await expect(ensureArt(dir, '0x72', {})).resolves.toBeUndefined();
    expect(artManifest(dir, '0x72')).toBeNull();
  });
});
