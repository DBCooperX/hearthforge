// Players' own pictures of their heroes. A picture is only a reference: the painter repaints it once in the game's
// portrait style, and that painted portrait is what everyone sees. The original stays here, in a folder per account,
// and is only ever handed back to the account it belongs to.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERO_REF_MAX_BYTES, MAX_HERO_REFS, REF_ID } from '../../shared/accounts';

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** The kind of picture the bytes are, from their first bytes (never from what the browser claims), or null. */
export function sniffImage(b: Buffer): string | null {
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

export class HeroRefError extends Error {
  constructor(readonly code: 'bad_picture' | 'picture_too_big') { super(code); }
}

export class HeroRefs {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private folder(account: string) {
    // Account ids are ours (acc_ + hex), but never trust a string into a path.
    return join(this.dir, account.replace(/[^A-Za-z0-9_-]/g, '_'));
  }

  private find(account: string, id: string): { file: string; mime: string } | null {
    if (!REF_ID.test(id)) return null;
    const folder = this.folder(account);
    for (const ext of Object.keys(MIME)) {
      const file = join(folder, `${id}.${ext}`);
      if (existsSync(file)) return { file, mime: MIME[ext] };
    }
    return null;
  }

  /** Keep a new picture for the account. `inUse` says which ids must stay when the account has too many. */
  save(account: string, bytes: Buffer, inUse: Set<string> = new Set()): string {
    if (bytes.length > HERO_REF_MAX_BYTES) throw new HeroRefError('picture_too_big');
    const mime = sniffImage(bytes);
    if (!mime) throw new HeroRefError('bad_picture');
    const folder = this.folder(account);
    mkdirSync(folder, { recursive: true });
    const id = randomBytes(8).toString('hex');
    writeFileSync(join(folder, `${id}.${EXT[mime]}`), bytes);
    // Pictures nobody uses any more (a creator closed without saving) are the first to go.
    const all = readdirSync(folder).map((f) => ({ f, id: f.split('.')[0], at: statSync(join(folder, f)).mtimeMs })).sort((a, b) => a.at - b.at);
    for (const old of all) {
      if (all.length <= MAX_HERO_REFS) break;
      if (old.id === id || inUse.has(old.id)) continue;
      rmSync(join(folder, old.f), { force: true });
      all.splice(all.indexOf(old), 1);
    }
    return id;
  }

  /** The picture, or null when it is not this account's (or is gone). */
  read(account: string, id: string): { mime: string; data: Buffer } | null {
    const hit = this.find(account, id);
    if (!hit) return null;
    try { return { mime: hit.mime, data: readFileSync(hit.file) }; } catch { return null; }
  }

  remove(account: string, id: string) {
    const hit = this.find(account, id);
    if (hit) rmSync(hit.file, { force: true });
  }
}
