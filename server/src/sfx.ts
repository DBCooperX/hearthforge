// Sound effects. The server fetches Kenney's CC0 packs (impact, RPG and interface sounds) from kenney.nl into its own
// data folder, once; nothing is bundled or mirrored. Sounds without a recording (bow, spells, fanfares) are made by the
// browser, so a server with no packs, or one that cannot reach kenney.nl, still has effects.
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { unzipSync } from 'fflate';
import { SFX_PACKS, type SfxManifest } from '../../shared/sfx';

export const sfxEnabled = (env: NodeJS.ProcessEnv) => (env.HEARTHFORGE_SFX ?? 'on').toLowerCase() !== 'off';
let fetching = false;

const PAGE_ZIP = /https?:\/\/[^"'\s<>]+\.zip/i;

async function download(url: string, fetchFn: typeof fetch): Promise<Uint8Array> {
  const res = await fetchFn(url, { signal: AbortSignal.timeout(120_000), headers: { 'user-agent': 'hearthforge-sfx-fetch' } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Keep only short .ogg recordings, flattened to <dir>/<name>.ogg. Zip entries are untrusted. */
export function unpackSfx(zip: Uint8Array, dest: string): number {
  const files = unzipSync(zip, { filter: (f) => extname(f.name).toLowerCase() === '.ogg' && f.originalSize < 3_000_000 });
  let n = 0;
  for (const [name, data] of Object.entries(files)) {
    const file = basename(name.replace(/\\/g, '/')).replace(/[^A-Za-z0-9_.-]/g, '_');
    if (!file || file.startsWith('.') || data.length < 200) continue;
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, `${file}.part`), data);
    renameSync(join(dest, `${file}.part`), join(dest, file));
    n++;
  }
  return n;
}

/** Fetch every pack that is not on disk yet. The download link carries a content hash, so it is read off the pack's page. Never throws. */
export async function ensureSfx(dir: string, env: NodeJS.ProcessEnv, fetchFn: typeof fetch = fetch): Promise<void> {
  if (!sfxEnabled(env)) return;
  fetching = true;
  try {
    for (const pack of SFX_PACKS) {
      const dest = join(dir, pack.id);
      if (existsSync(dest) && readdirSync(dest).some((f) => f.endsWith('.ogg'))) continue;
      try {
        const page = new TextDecoder().decode(await download(pack.page, fetchFn));
        const link = PAGE_ZIP.exec(page)?.[0];
        if (!link) throw new Error(`no download link found on ${pack.page}`);
        const n = unpackSfx(await download(link, fetchFn), dest);
        if (!n) throw new Error('the zip held no .ogg files');
        console.log(`[sfx] Unpacked ${n} sounds of "${pack.name}" (${pack.author}, ${pack.license}) into ${dest}.`);
      } catch (err) {
        console.warn(`[sfx] Could not get "${pack.name}": ${err instanceof Error ? err.message : err}. The game uses its built-in sounds instead; drop the pack's .ogg files into ${dest} to add them by hand.`);
      }
    }
  } finally {
    fetching = false;
  }
}

/** The recordings on the server, for the browsers. */
export function sfxManifest(dir: string, env: NodeJS.ProcessEnv): SfxManifest {
  if (!sfxEnabled(env)) return { enabled: false, pending: false, files: [] };
  const files: SfxManifest['files'] = [];
  for (const pack of SFX_PACKS) {
    const folder = join(dir, pack.id);
    if (!existsSync(folder)) continue;
    for (const f of readdirSync(folder).sort()) if (f.endsWith('.ogg')) files.push({ name: f, src: `/sfx/${pack.id}/${encodeURIComponent(f)}` });
  }
  return { enabled: true, pending: fetching, files };
}

/** The file behind /sfx/<pack>/<file>, or null for anything else. */
export function sfxFile(dir: string, pathname: string): string | null {
  const parts = pathname.slice(5).split('/').map((p) => { try { return decodeURIComponent(p); } catch { return ''; } });
  if (parts.length !== 2 || !SFX_PACKS.some((p) => p.id === parts[0]) || !/^[A-Za-z0-9_.-]+\.ogg$/.test(parts[1]) || parts[1].startsWith('.')) return null;
  const file = join(dir, parts[0], parts[1]);
  return existsSync(file) && statSync(file).isFile() ? file : null;
}
