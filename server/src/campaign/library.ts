// The server's shelf of campaign books. A book is read once when it arrives: split into
// sections (read.ts) and condensed by the AI into a digest (ClaudeDM.readCampaign). Tables
// keep a copy of the digest, so a game goes on even if the book is later taken off the shelf.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { CAMPAIGN_MAX_BYTES, CAMPAIGN_SOURCES, type CampaignInfo } from '../../../shared/campaign';
import { BookError, readBook, type Book, type Section } from './read';

/** What the Dungeon Master knows of a book at all times. Written by the AI from the whole book. */
export interface CampaignDigest {
  title: string;
  levels: string;
  /** One line for the shelf, in English. */
  blurb: string;
  /** For the Dungeon Master only: what is really going on, the big secrets and how it can end. English. */
  overview: string;
  /** How the book opens: where the heroes start and what draws them in. English. */
  opening: string;
  /** The rules the book was written for, if not 5e: "B/X", "system neutral". Empty for 5e. */
  system: string;
  /** The kind of country, one of the region themes, so the map looks right. */
  theme: string;
  /** The region as the book names it, or empty. */
  region: string;
  town: { name: string; kind: 'town' | 'village'; description: { en: string; de: string } };
  places: { name: string; kind: string; description: { en: string; de: string }; known: boolean; inTown: boolean }[];
  people: { name: string; role: { en: string; de: string }; description: { en: string; de: string }; disposition: string; place: string; gender: string }[];
  quest: { title: { en: string; de: string }; summary: { en: string; de: string } };
  chapters: { title: string; summary: string; sections: string[] }[];
  /** A few words per section id, for books with not too many sections. */
  gists: Record<string, string>;
}

export interface StoredBook {
  sections: Section[];
  digest: CampaignDigest | null;
}

/** Reads a book with the AI: returns its digest. `progress` goes from 0 to 1. */
export type BookReader = (id: string, book: Book, progress: (p: number) => void) => Promise<CampaignDigest | null>;

export class CampaignError extends Error {
  constructor(readonly code: string) { super(code); }
}

export interface Viewer { id: string; innkeeper: boolean }

export class CampaignLibrary {
  private dir: string;
  private index: CampaignInfo[];
  private cache = new Map<string, StoredBook>();
  reader: BookReader | null = null;
  /** Called whenever a book's state changes, so open browsers can refresh their shelf. */
  onChange: () => void = () => undefined;

  constructor(dataDir: string, private fetcher: typeof fetch = fetch, private now: () => number = Date.now) {
    this.dir = join(dataDir, 'campaigns');
    mkdirSync(this.dir, { recursive: true });
    try { this.index = JSON.parse(readFileSync(join(this.dir, 'index.json'), 'utf8')) as CampaignInfo[]; } catch { this.index = []; }
    // A restart in the middle of reading leaves the book half done: say so instead of spinning forever.
    for (const b of this.index) if (b.status === 'reading') { b.status = 'failed'; b.error = 'failed'; delete b.progress; }
  }

  private save() {
    const file = join(this.dir, 'index.json');
    writeFileSync(`${file}.tmp`, JSON.stringify(this.index, null, 1));
    renameSync(`${file}.tmp`, file);
  }

  /** Books this person may see and play: their own, those everyone may use, and all of them for the Innkeeper. */
  list(viewer: Viewer | null): CampaignInfo[] {
    return this.index.filter((b) => !b.owner || (viewer && (viewer.innkeeper || b.owner === viewer.id))).sort((a, b) => b.addedAt - a.addedAt);
  }

  info(id: string): CampaignInfo | undefined { return this.index.find((b) => b.id === id); }

  mayUse(id: string, viewer: Viewer | null): boolean { return this.list(viewer).some((b) => b.id === id && b.status === 'ready'); }

  book(id: string): StoredBook | null {
    if (this.cache.has(id)) return this.cache.get(id)!;
    const file = join(this.dir, `${id}.json`);
    if (!/^[a-z0-9]+$/.test(id) || !existsSync(file)) return null;
    try {
      const book = JSON.parse(readFileSync(file, 'utf8')) as StoredBook;
      if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(id, book);
      return book;
    } catch { return null; }
  }

  private store(id: string, book: StoredBook) {
    writeFileSync(join(this.dir, `${id}.json`), JSON.stringify(book));
    this.cache.set(id, book);
  }

  private update(id: string, patch: Partial<CampaignInfo>) {
    const b = this.info(id);
    if (!b) return;
    Object.assign(b, patch);
    for (const k of Object.keys(patch) as (keyof CampaignInfo)[]) if (patch[k] === undefined) delete b[k];
    this.save();
    this.onChange();
  }

  /** Put a book on the shelf and start reading it. Returns at once; the shelf shows the progress. */
  add(file: string, data: Uint8Array, owner: string, source?: string): CampaignInfo {
    if (data.length > CAMPAIGN_MAX_BYTES) throw new CampaignError('too_big');
    if (!data.length) throw new CampaignError('not_a_book');
    const name = file.replace(/[\\/]/g, '_').slice(0, 120) || 'campaign.pdf';
    const id = randomBytes(6).toString('hex');
    const info: CampaignInfo = {
      id, title: name.replace(/\.[a-z0-9]+$/i, ''), by: '', file: name, pages: 0, sections: 0, status: 'reading', progress: 0,
      owner, addedAt: this.now(), ...(source ? { source } : {}),
    };
    this.index.push(info);
    this.save();
    this.onChange();
    void this.read(id, name, data);
    return info;
  }

  /** The work behind add, exposed for tests to await. */
  async read(id: string, name: string, data: Uint8Array): Promise<void> {
    try {
      const book = await readBook(name, data);
      this.store(id, { sections: book.sections, digest: null });
      this.update(id, { title: book.title, pages: book.pages, sections: book.sections.length, progress: 0.1 });
      const digest = this.reader ? await this.reader(id, book, (p) => this.update(id, { progress: Math.round((0.1 + 0.9 * p) * 100) / 100 })) : null;
      if (!this.info(id)) return; // taken off the shelf meanwhile
      if (this.reader && !digest) { this.update(id, { status: 'failed', error: 'failed', progress: undefined }); return; }
      const d = digest ?? plainDigest(book);
      this.store(id, { sections: book.sections, digest: d });
      this.update(id, { status: 'ready', progress: undefined, title: d.title || book.title, levels: d.levels || undefined, blurb: d.blurb || undefined });
    } catch (err) {
      const code = err instanceof BookError ? err.code : 'failed';
      if (!(err instanceof BookError)) console.warn('[campaign] reading failed:', err);
      this.update(id, { status: 'failed', error: code, progress: undefined });
    }
  }

  /** Read a failed book again, for example after the API key was fixed. */
  retry(id: string, viewer: Viewer) {
    const b = this.info(id);
    if (!b || !this.mayChange(b, viewer)) throw new CampaignError('not_found');
    const stored = this.book(id);
    if (!stored?.sections.length) throw new CampaignError('not_found');
    this.update(id, { status: 'reading', error: undefined, progress: 0.1 });
    const book: Book = { title: b.title, pages: b.pages, sections: stored.sections };
    void (async () => {
      try {
        const digest = this.reader ? await this.reader(id, book, (p) => this.update(id, { progress: Math.round((0.1 + 0.9 * p) * 100) / 100 })) : plainDigest(book);
        if (!digest) { this.update(id, { status: 'failed', error: 'failed', progress: undefined }); return; }
        this.store(id, { sections: stored.sections, digest });
        this.update(id, { status: 'ready', progress: undefined, title: digest.title || b.title, levels: digest.levels || undefined, blurb: digest.blurb || undefined });
      } catch (err) {
        console.warn('[campaign] reading failed:', err);
        this.update(id, { status: 'failed', error: 'failed', progress: undefined });
      }
    })();
  }

  /** A free book from the list, fetched by this server straight from its source. */
  async fetchSource(sourceId: string, owner: string): Promise<CampaignInfo> {
    const src = CAMPAIGN_SOURCES.find((s) => s.id === sourceId);
    if (!src || src.access !== 'click' || !src.pdf) throw new CampaignError('bad_request');
    // Everyone on the server shares a book from the list, so it is fetched only once.
    const have = this.index.find((b) => b.source === src.id && b.status !== 'failed');
    if (have) return have;
    let data: Uint8Array;
    try {
      const res = await this.fetcher(src.pdf, { redirect: 'follow', signal: AbortSignal.timeout(60_000), headers: { accept: 'application/pdf' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const size = Number(res.headers.get('content-length') ?? 0);
      if (size > CAMPAIGN_MAX_BYTES) throw new CampaignError('too_big');
      data = new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      if (err instanceof CampaignError) throw err;
      console.warn(`[campaign] could not download ${src.pdf}:`, err instanceof Error ? err.message : err);
      throw new CampaignError('download_failed');
    }
    const info = this.add(`${src.title}.pdf`, data, '', src.id);
    this.update(info.id, { by: src.by });
    return info;
  }

  private mayChange(b: CampaignInfo, viewer: Viewer) { return viewer.innkeeper || (!!b.owner && b.owner === viewer.id); }

  remove(id: string, viewer: Viewer) {
    const b = this.info(id);
    if (!b || !this.mayChange(b, viewer)) throw new CampaignError('not_found');
    this.index = this.index.filter((x) => x.id !== id);
    this.cache.delete(id);
    rmSync(join(this.dir, `${id}.json`), { force: true });
    this.save();
    this.onChange();
  }

  /** The Innkeeper lets everyone on the server use a book, or takes it back to its owner. */
  share(id: string, viewer: Viewer, everyone: boolean) {
    const b = this.info(id);
    if (!b || !viewer.innkeeper) throw new CampaignError('forbidden');
    this.update(id, { owner: everyone ? '' : b.owner || viewer.id });
  }
}

/** Without an AI to read it, a book still gets an index of its sections. */
export function plainDigest(book: Book): CampaignDigest {
  const intro = book.sections[0]?.text.slice(0, 1200) ?? '';
  return {
    title: book.title, levels: '', blurb: '', overview: intro, opening: 'Open the way the first section of the book does.', system: '', theme: 'vale', region: '',
    town: { name: '', kind: 'town', description: { en: '', de: '' } }, places: [], people: [],
    quest: { title: { en: book.title, de: book.title }, summary: { en: '', de: '' } },
    chapters: [], gists: {},
  };
}
