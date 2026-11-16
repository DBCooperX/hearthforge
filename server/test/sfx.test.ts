import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { SfxError, addSfxUpload, importDroppedSfx, packFor, removeSfxPack, sfxFile, sfxLibrary, sfxManifest } from '../src/sfx';

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'sfx-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const ogg = new Uint8Array(400).fill(7);
const zip = zipSync({ 'Audio/impactMetal_heavy_000.ogg': ogg, 'Audio/../evil.ogg': ogg, 'Audio/readme.txt': new Uint8Array(10), 'x/Preview.mp3': ogg });

describe('sound effect packs', () => {
  it('sorts a zip into its pack by name, keeps only .ogg files and serves them', () => {
    const dir = tmp();
    expect(packFor('kenney_impact-sounds.zip')).toBe('impact-sounds');
    expect(packFor('kenney_rpg-audio.zip')).toBe('rpg-audio');
    expect(packFor('kenney_interface-sounds (1).zip')).toBe('interface-sounds');
    expect(packFor('mystery.zip')).toBe('other');
    expect(addSfxUpload(dir, 'kenney_impact-sounds.zip', zip)).toBe(2);
    const m = sfxManifest(dir, {});
    expect(m.files.map((f) => f.name).sort()).toEqual(['evil.ogg', 'impactMetal_heavy_000.ogg']);
    expect(sfxFile(dir, '/sfx/impact-sounds/impactMetal_heavy_000.ogg')).toBeTruthy();
    expect(sfxFile(dir, '/sfx/impact-sounds/..%2Fx.ogg')).toBeNull();
    expect(sfxFile(dir, '/sfx/nope/impactMetal_heavy_000.ogg')).toBeNull();
    expect(sfxLibrary(dir, {}).packs.find((p) => p.id === 'impact-sounds')?.count).toBe(2);
    removeSfxPack(dir, 'impact-sounds');
    expect(sfxManifest(dir, {}).files).toEqual([]);
  });
  it('rejects things that are not audio', () => {
    const dir = tmp();
    expect(() => addSfxUpload(dir, 'notes.zip', new Uint8Array([1, 2, 3]))).toThrow(SfxError);
    expect(() => addSfxUpload(dir, 'song.mp3', ogg)).toThrow(SfxError);
    expect(() => removeSfxPack(dir, '../etc')).toThrow(SfxError);
  });
  it('takes in a zip copied into the data folder by hand, and honours the switch', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'kenney_rpg-audio.zip'), zip);
    importDroppedSfx(dir, { HEARTHFORGE_SFX: 'off' });
    expect(readdirSync(dir)).toEqual(['kenney_rpg-audio.zip']);
    importDroppedSfx(dir, {});
    expect(readdirSync(join(dir, 'rpg-audio'))).toContain('impactMetal_heavy_000.ogg');
    expect(readFileSync(join(dir, 'rpg-audio', 'evil.ogg')).length).toBe(400);
    expect(sfxManifest(dir, { HEARTHFORGE_SFX: 'off' }).enabled).toBe(false);
  });
});
