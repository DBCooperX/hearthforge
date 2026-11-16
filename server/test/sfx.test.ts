import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureSfx, sfxFile, sfxManifest } from '../src/sfx';

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'sfx-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const ogg = new Uint8Array(400).fill(7);
const zip = zipSync({ 'Audio/impactMetal_heavy_000.ogg': ogg, 'Audio/../evil.ogg': ogg, 'Audio/readme.txt': new Uint8Array(10), 'x/Preview.mp3': ogg });

describe('sound effect packs', () => {
  it('reads the zip link off the page, keeps only .ogg files and serves them', async () => {
    const dir = tmp();
    const fetched: string[] = [];
    const fake = (async (url: string) => {
      fetched.push(url);
      return url.endsWith('.zip') ? new Response(zip) : new Response('<a href="https://kenney.nl/media/pack-abc123/kenney.zip">Download</a>');
    }) as unknown as typeof fetch;
    await ensureSfx(dir, {}, fake);
    expect(fetched.filter((u) => u.endsWith('.zip'))).toHaveLength(3);
    const m = sfxManifest(dir, {});
    expect(m.enabled).toBe(true);
    expect(m.files.map((f) => f.name)).toContain('impactMetal_heavy_000.ogg');
    expect(m.files.every((f) => f.name.endsWith('.ogg'))).toBe(true);
    expect(sfxFile(dir, '/sfx/impact-sounds/impactMetal_heavy_000.ogg')).toBeTruthy();
    expect(sfxFile(dir, '/sfx/impact-sounds/..%2Fx.ogg')).toBeNull();
    expect(sfxFile(dir, '/sfx/other/impactMetal_heavy_000.ogg')).toBeNull();
    // Second start: nothing is fetched again.
    fetched.length = 0;
    await ensureSfx(dir, {}, fake);
    expect(fetched).toHaveLength(0);
    expect(readdirSync(dir).sort()).toEqual(['impact-sounds', 'interface-sounds', 'rpg-audio']);
  });
  it('survives a site that cannot be reached, and honours the switch', async () => {
    const dir = tmp();
    await ensureSfx(dir, {}, (async () => { throw new Error('offline'); }) as unknown as typeof fetch);
    expect(sfxManifest(dir, {}).files).toEqual([]);
    expect(sfxManifest(dir, { HEARTHFORGE_SFX: 'off' }).enabled).toBe(false);
  });
});
