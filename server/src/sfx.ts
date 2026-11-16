// Sound effects. Kenney's CC0 packs (impact, RPG and interface sounds) sit in the server's data folder. Kenney does not
// allow automatic downloads, so the owner opens the pack's page, downloads the zip and drops it into the Innkeeper
// (or copies it into the data folder). Nothing is bundled or mirrored. Sounds without a recording (bow, spells, fanfares)
// are made by the browser, so a server with no packs still has effects.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { unzipSync } from 'fflate';
import { SFX_FOLDERS, SFX_OTHER, SFX_PACKS, type SfxLibrary, type SfxManifest } from '../../shared/sfx';

export const sfxEnabled = (env: NodeJS.ProcessEnv) => (env.HEARTHFORGE_SFX ?? 'on').toLowerCase() !== 'off';

export class SfxError extends Error {
  constructor(readonly code: 'not_audio' | 'too_big' | 'bad_request') { super(code); }
}

const oggsIn = (folder: string) => (existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith('.ogg')).sort() : []);

/** Which pack a file belongs to, judged by its name ("kenney_impact-sounds.zip"); anything else goes to "other". */
export function packFor(fileName: string): string {
  const n = fileName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return SFX_PACKS.find((p) => n.includes(p.id) || n.includes(p.id.replace(/-sounds$|-audio$/, '') + '-'))?.id ?? SFX_OTHER;
}

/** Keep only short .ogg recordings, flattened to <dest>/<name>.ogg. Zip entries are untrusted. */
export function unpackSfx(zip: Uint8Array, dest: string): number {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(zip, { filter: (f) => extname(f.name).toLowerCase() === '.ogg' && f.originalSize < 3_000_000 }); } catch { throw new SfxError('not_audio'); }
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

/** Take in an uploaded zip (or a single .ogg). Returns how many recordings were added. */
export function addSfxUpload(dir: string, fileName: string, data: Uint8Array): number {
  if (!data.length) throw new SfxError('bad_request');
  const dest = join(dir, packFor(fileName));
  let n = 0;
  if (/\.zip$/i.test(fileName)) n = unpackSfx(data, dest);
  else if (/\.ogg$/i.test(fileName) && String.fromCharCode(...data.slice(0, 4)) === 'OggS') {
    const file = basename(fileName).replace(/[^A-Za-z0-9_.-]/g, '_');
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, file), data);
    n = 1;
  }
  if (!n) throw new SfxError('not_audio');
  return n;
}

/** On start: take in zips the owner copied into the data folder by hand, then set them aside. Never throws. */
export function importDroppedSfx(dir: string, env: NodeJS.ProcessEnv): void {
  if (!sfxEnabled(env) || !existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((n) => /\.zip$/i.test(n))) {
    try {
      const n = addSfxUpload(dir, f, new Uint8Array(readFileSync(join(dir, f))));
      renameSync(join(dir, f), join(dir, `${f}.done`));
      console.log(`[sfx] Took in ${n} sounds from ${f}.`);
    } catch (err) {
      console.warn(`[sfx] Could not use ${f}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

export function sfxLibrary(dir: string, env: NodeJS.ProcessEnv): SfxLibrary {
  return {
    enabled: sfxEnabled(env),
    packs: SFX_PACKS.map((p) => ({ ...p, count: oggsIn(join(dir, p.id)).length })).concat(
      oggsIn(join(dir, SFX_OTHER)).length ? [{ id: SFX_OTHER, name: 'Other recordings', author: '', license: '', page: '', count: oggsIn(join(dir, SFX_OTHER)).length }] : []),
  };
}

export function removeSfxPack(dir: string, id: unknown) {
  if (typeof id !== 'string' || !SFX_FOLDERS().includes(id)) throw new SfxError('bad_request');
  for (const f of oggsIn(join(dir, id))) unlinkSync(join(dir, id, f));
  rmSync(join(dir, id), { recursive: true, force: true });
}

/** The recordings on the server, for the browsers. */
export function sfxManifest(dir: string, env: NodeJS.ProcessEnv): SfxManifest {
  if (!sfxEnabled(env)) return { enabled: false, pending: false, files: [] };
  const files: SfxManifest['files'] = [];
  for (const id of SFX_FOLDERS()) for (const f of oggsIn(join(dir, id))) files.push({ name: f, src: `/sfx/${id}/${encodeURIComponent(f)}` });
  return { enabled: true, pending: false, files };
}

/** The file behind /sfx/<pack>/<file>, or null for anything else. */
export function sfxFile(dir: string, pathname: string): string | null {
  const parts = pathname.slice(5).split('/').map((p) => { try { return decodeURIComponent(p); } catch { return ''; } });
  if (parts.length !== 2 || !SFX_FOLDERS().includes(parts[0]) || !/^[A-Za-z0-9_.-]+\.ogg$/.test(parts[1]) || parts[1].startsWith('.')) return null;
  const file = join(dir, parts[0], parts[1]);
  return existsSync(file) && statSync(file).isFile() ? file : null;
}
