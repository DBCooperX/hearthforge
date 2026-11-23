// The server's own icons. A sheet is one picture with four icons in a 2 by 2 grid, painted by the picture service the
// Innkeeper set up; the browser cuts its quarter out and takes the magenta background away (see client/src/game/
// itemArt.ts). Sheets sit in ICONS_DIR/sheets under a name taken from their content, the list in ICONS_DIR/icons.json.
// A repaint asks for four takes of one icon on one sheet, and the Innkeeper picks the one to keep.
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { join } from 'node:path';
import { Zip, ZipPassThrough } from 'fflate';
import type { ArtRef } from '../../shared/art';
import { ICON_SUBJECTS, ICON_SUBJECT_BY_ID, iconSheetPrompt, type IconLibraryView, type IconSubject, type IconView } from '../../shared/iconLibrary';

export interface IconPainter {
  /** "gemini gemini-3.1-flash-image", for the Innkeeper. */
  label: string;
  usd: number;
  paint(prompt: string): Promise<{ data: Buffer; mime: string }>;
}

export interface IconPayer { account?: string }
export interface IconHooks {
  /** The picture service in use, or null when none has a key. Asked again for every sheet. */
  painter: () => IconPainter | null;
  onCost?: (usd: number, payer: IconPayer) => void;
  /** Icons players see changed. */
  onChange?: () => void;
}

export class IconError extends Error {
  constructor(readonly code: 'no_key' | 'not_found' | 'bad_request' | 'busy', detail = '') { super(detail || code); }
}

interface Sheet { id: string; file: string; mime: string; w: number; h: number; subjects: string[]; takes: boolean; usd: number; at: number }
interface Saved {
  sheets: Sheet[];
  /** Subject id to the sheet and quarter (0 top left, 1 top right, 2 bottom left, 3 bottom right) it shows. */
  use: Record<string, { sheet: string; cell: number }>;
  off: string[];
  /** Why the last sheet with this subject failed. */
  errors: Record<string, string>;
}
interface Job { subjects: string[]; takes: boolean; hint: string; payer: IconPayer }

const PARALLEL = 2;
const MAX_BYTES = 30_000_000;
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** Width and height of a PNG, JPEG or WebP, read from its header. Null when it is none of those. */
export function imageSize(b: Buffer): { w: number; h: number } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  }
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) }; }
  }
  return null;
}

/** One quarter of a sheet. */
export const cellRect = (s: { w: number; h: number }, cell: number) => {
  const w = Math.floor(s.w / 2), h = Math.floor(s.h / 2);
  return { x: (cell % 2) * w, y: Math.floor(cell / 2) * h, w, h };
};

/** Subjects in the order they are painted: items with items, spells with spells, so a sheet holds things alike. */
const ORDER = [...ICON_SUBJECTS].sort((a, b) => kindOf(a).localeCompare(kindOf(b)) || a.slots[0].localeCompare(b.slots[0]));
function kindOf(s: IconSubject) { const f = s.slots[0]; return f.includes(':') ? f.split(':')[0] : 'item'; }

export class IconLibrary {
  private s: Saved;
  private queue: Job[] = [];
  private running: Job[] = [];
  private idle: (() => void)[] = [];

  constructor(private dir: string, private hooks: IconHooks, private now: () => number = Date.now) {
    mkdirSync(join(dir, 'sheets'), { recursive: true });
    this.s = this.load();
  }

  private load(): Saved {
    try {
      const v = JSON.parse(readFileSync(join(this.dir, 'icons.json'), 'utf8')) as Partial<Saved>;
      return { sheets: Array.isArray(v.sheets) ? v.sheets : [], use: v.use && typeof v.use === 'object' ? v.use : {}, off: Array.isArray(v.off) ? v.off : [], errors: v.errors && typeof v.errors === 'object' ? v.errors : {} };
    } catch { return { sheets: [], use: {}, off: [], errors: {} }; }
  }
  private save() {
    const file = join(this.dir, 'icons.json');
    writeFileSync(`${file}.part`, JSON.stringify(this.s, null, 1));
    renameSync(`${file}.part`, file);
  }

  private sheet(id: string) { return this.s.sheets.find((x) => x.id === id); }
  private src(sh: Sheet) { return `/icons/${sh.file}`; }
  private painting(id: string) { return [...this.queue, ...this.running].some((j) => j.subjects.includes(id)); }

  /** Every picture there is of a subject: its quarter of group sheets, and the four takes of each repaint. */
  private takesOf(id: string) {
    return this.s.sheets.flatMap((sh) => {
      const cells = sh.takes ? (sh.subjects[0] === id ? [0, 1, 2, 3] : []) : sh.subjects.flatMap((x, i) => (x === id ? [i] : []));
      return cells.map((cell) => ({ sheet: sh.id, cell, src: this.src(sh), rect: cellRect(sh, cell) }));
    });
  }

  view(): IconLibraryView {
    const p = this.hooks.painter();
    const icons: IconView[] = ICON_SUBJECTS.map((subj) => {
      const use = this.s.use[subj.id];
      const sh = use && this.sheet(use.sheet);
      const takes = this.takesOf(subj.id);
      return {
        id: subj.id, name: subj.name, slots: subj.slots, painting: this.painting(subj.id),
        ...(sh ? { src: this.src(sh), rect: cellRect(sh, use.cell) } : {}),
        ...(this.s.off.includes(subj.id) ? { disabled: true } : {}),
        ...(takes.length > 1 ? { takes } : {}),
        ...(this.s.errors[subj.id] ? { error: this.s.errors[subj.id] } : {}),
      };
    });
    return {
      canPaint: !!p, painter: p?.label ?? '', usdPerSheet: p?.usd ?? 0, icons,
      missing: icons.filter((i) => !i.src).length, queued: this.queue.length + this.running.length,
      usd: Math.round(this.s.sheets.reduce((n, sh) => n + sh.usd, 0) * 1000) / 1000,
    };
  }

  /** The pictures for the game: every slot whose subject has an icon that is switched on. */
  refs(): Record<string, ArtRef> {
    const out: Record<string, ArtRef> = {};
    for (const subj of ICON_SUBJECTS) {
      const use = this.s.use[subj.id];
      const sh = use && this.sheet(use.sheet);
      if (!sh || this.s.off.includes(subj.id)) continue;
      const ref: ArtRef = { src: this.src(sh), rect: cellRect(sh, use.cell), key: true };
      for (const slot of subj.slots) out[slot] = ref;
    }
    return out;
  }

  /** Put every icon without a picture on the list, four to a sheet. Returns how many sheets were queued. */
  makeMissing(payer: IconPayer = {}): number {
    if (!this.hooks.painter()) throw new IconError('no_key');
    const todo = ORDER.filter((x) => !this.s.use[x.id] && !this.painting(x.id)).map((x) => x.id);
    for (let i = 0; i < todo.length; i += 4) this.queue.push({ subjects: todo.slice(i, i + 4), takes: false, hint: '', payer });
    this.pump();
    return Math.ceil(todo.length / 4);
  }

  /** Four new takes of one icon. The one in use stays until the Innkeeper picks another (a first icon takes the first). */
  repaint(id: unknown, hint: unknown, payer: IconPayer = {}) {
    if (!this.hooks.painter()) throw new IconError('no_key');
    const subj = typeof id === 'string' ? ICON_SUBJECT_BY_ID.get(id) : undefined;
    if (!subj) throw new IconError('not_found');
    if (this.painting(subj.id)) throw new IconError('busy');
    const words = String(hint ?? '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    this.queue.push({ subjects: [subj.id], takes: true, hint: words, payer });
    this.pump();
  }

  /** Use another take of an icon. */
  choose(id: unknown, sheet: unknown, cell: unknown) {
    const subj = typeof id === 'string' ? ICON_SUBJECT_BY_ID.get(id) : undefined;
    if (!subj) throw new IconError('not_found');
    const c = Number(cell);
    if (!this.takesOf(subj.id).some((t) => t.sheet === sheet && t.cell === c)) throw new IconError('bad_request');
    this.s.use[subj.id] = { sheet: String(sheet), cell: c };
    this.save();
    this.hooks.onChange?.();
  }

  setEnabled(id: unknown, on: boolean) {
    const subj = typeof id === 'string' ? ICON_SUBJECT_BY_ID.get(id) : undefined;
    if (!subj) throw new IconError('not_found');
    this.s.off = this.s.off.filter((x) => x !== subj.id);
    if (!on) this.s.off.push(subj.id);
    this.save();
    this.hooks.onChange?.();
  }

  whenIdle(): Promise<void> {
    if (!this.running.length && !this.queue.length) return Promise.resolve();
    return new Promise((r) => this.idle.push(r));
  }

  private pump() {
    while (this.running.length < PARALLEL && this.queue.length) {
      const job = this.queue.shift()!;
      this.running.push(job);
      void this.paint(job).finally(() => {
        this.running = this.running.filter((j) => j !== job);
        this.pump();
        if (!this.running.length && !this.queue.length) for (const r of this.idle.splice(0)) r();
      });
    }
  }

  private async paint(job: Job) {
    const painter = this.hooks.painter();
    const subjects = job.subjects.map((id) => ICON_SUBJECT_BY_ID.get(id)).filter((x): x is IconSubject => !!x);
    const fail = (why: string) => {
      for (const id of job.subjects) this.s.errors[id] = why.slice(0, 300);
      this.save();
      console.warn(`[icons] Could not paint ${subjects.map((x) => x.name).join(', ')}: ${why}`);
    };
    if (!painter) { fail('no picture service with a key'); return; }
    let painted;
    try {
      painted = await painter.paint(iconSheetPrompt(subjects, job.hint));
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
      return;
    }
    // A picture that came back is paid for, even when it turns out unusable.
    this.hooks.onCost?.(painter.usd, job.payer);
    const size = imageSize(painted.data);
    if (!size || painted.data.length > MAX_BYTES || !EXT[painted.mime]) { fail('the picture service sent something that is not a picture'); return; }
    const file = `${createHash('sha256').update(painted.data).digest('hex').slice(0, 20)}.${EXT[painted.mime]}`;
    writeFileSync(join(this.dir, 'sheets', `${file}.part`), painted.data);
    renameSync(join(this.dir, 'sheets', `${file}.part`), join(this.dir, 'sheets', file));
    const sheet: Sheet = { id: `sheet-${randomBytes(5).toString('hex')}`, file, mime: painted.mime, ...size, subjects: job.subjects, takes: job.takes, usd: painter.usd, at: this.now() };
    this.s.sheets.push(sheet);
    job.subjects.forEach((id, i) => {
      delete this.s.errors[id];
      // A repaint leaves the icon in use alone; a new icon takes its quarter.
      if (!job.takes || !this.s.use[id]) this.s.use[id] = { sheet: sheet.id, cell: job.takes ? 0 : i };
    });
    this.save();
    console.log(`[icons] Painted ${job.takes ? `four takes of ${subjects[0]?.name}` : subjects.map((x) => x.name).join(', ')} ($${painter.usd.toFixed(3)}).`);
    this.hooks.onChange?.();
  }

  /** The sheet behind /icons/<name>, or null. */
  file(name: string): { path: string; mime: string } | null {
    const sh = this.s.sheets.find((x) => x.file === name);
    const path = sh && join(this.dir, 'sheets', sh.file);
    return sh && path && existsSync(path) ? { path, mime: sh.mime } : null;
  }

  /** Every sheet and icons.json, as a zip, for the Innkeeper's own copy. */
  archive(res: ServerResponse) {
    const day = new Date(this.now()).toISOString().slice(0, 10);
    res.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="hearthforge-icons-${day}.zip"`, 'cache-control': 'no-store' });
    const zip = new Zip((err, chunk, final) => {
      if (err) { console.warn('[icons] zip failed:', err); res.destroy(err); return; }
      res.write(chunk);
      if (final) res.end();
    });
    const list = new ZipPassThrough('icons.json');
    zip.add(list);
    list.push(new TextEncoder().encode(JSON.stringify({ format: 'hearthforge-icons', version: 1, ...this.s }, null, 1)), true);
    const sheets = this.s.sheets.filter((sh) => existsSync(join(this.dir, 'sheets', sh.file)));
    const next = (i: number) => {
      if (i >= sheets.length) { zip.end(); return; }
      const part = new ZipPassThrough(`sheets/${sheets[i].file}`);
      zip.add(part);
      const stream = createReadStream(join(this.dir, 'sheets', sheets[i].file));
      stream.on('data', (c) => part.push(c as Uint8Array));
      stream.on('end', () => { part.push(new Uint8Array(0), true); next(i + 1); });
      stream.on('error', () => { part.push(new Uint8Array(0), true); next(i + 1); });
    };
    next(0);
  }

  summary(): string {
    const have = ICON_SUBJECTS.filter((x) => this.s.use[x.id]).length;
    return `${have} of ${ICON_SUBJECTS.length} own icons`;
  }
}
