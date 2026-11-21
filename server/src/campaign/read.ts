// Turns a campaign book (PDF, text or Markdown) into plain-text sections the Dungeon Master
// can look up one at a time. PDFs are read with pdf.js (through unpdf); the book's own table of
// contents decides the sections where it has one, otherwise every couple of pages is one.

/** One part of a book, as the Dungeon Master reads it. */
export interface Section {
  /** "s1", "s2", ... in book order. */
  id: string;
  title: string;
  /** First page, for PDFs; 0 for text files. */
  page: number;
  text: string;
}

export interface Book {
  title: string;
  pages: number;
  sections: Section[];
}

export class BookError extends Error {
  constructor(readonly code: 'not_a_book' | 'no_text') { super(code); }
}

/** About two thousand words: long enough for a room-by-room dungeon, short enough to send every turn. */
export const SECTION_MAX = 12_000;
const SECTION_MIN = 300;
export const SECTIONS_MAX = 160;
const PAGES_PER_CHUNK = 2;

const tidy = (text: string) =>
  text
    .replace(/\r/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    // Words broken over a line end.
    .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const shortTitle = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 90);

/** A long part split at paragraph ends into pieces of at most SECTION_MAX characters. */
function split(title: string, page: number, text: string): Omit<Section, 'id'>[] {
  if (text.length <= SECTION_MAX) return [{ title, page, text }];
  const out: Omit<Section, 'id'>[] = [];
  let rest = text;
  while (rest.length > SECTION_MAX) {
    let cut = rest.lastIndexOf('\n\n', SECTION_MAX);
    if (cut < SECTION_MAX / 2) cut = rest.lastIndexOf('\n', SECTION_MAX);
    if (cut < SECTION_MAX / 2) cut = rest.lastIndexOf(' ', SECTION_MAX);
    if (cut < SECTION_MAX / 2) cut = SECTION_MAX;
    out.push({ title, page, text: rest.slice(0, cut).trim() });
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push({ title, page, text: rest });
  return out.map((s, i) => (out.length > 1 ? { ...s, title: `${title} (${i + 1}/${out.length})` } : s));
}

/** Tiny parts join the next one; very many parts join pairwise until the book fits. */
function settle(parts: Omit<Section, 'id'>[]): Section[] {
  let list = parts.filter((p) => p.text.trim());
  const merged: Omit<Section, 'id'>[] = [];
  for (const p of list) {
    const last = merged[merged.length - 1];
    if (last && last.text.length < SECTION_MIN && last.text.length + p.text.length <= SECTION_MAX) {
      merged[merged.length - 1] = { title: `${last.title} / ${p.title}`.slice(0, 120), page: last.page, text: `${last.text}\n\n${p.title}\n${p.text}` };
    } else merged.push(p);
  }
  list = merged;
  while (list.length > SECTIONS_MAX) {
    const next: Omit<Section, 'id'>[] = [];
    for (let i = 0; i < list.length; i += 2) {
      const a = list[i], b = list[i + 1];
      next.push(b ? { title: `${a.title} / ${b.title}`.slice(0, 120), page: a.page, text: `${a.text}\n\n${b.title}\n${b.text}` } : a);
    }
    list = next;
  }
  return list.map((p, i) => ({ id: `s${i + 1}`, ...p }));
}

function firstLine(text: string): string {
  const line = text.split('\n').map((l) => l.trim()).find((l) => l.length >= 4 && /\p{L}/u.test(l)) ?? '';
  return shortTitle(line).slice(0, 60);
}

/** A text or Markdown book: Markdown headings make the sections, else blank-line paragraphs are gathered up. */
export function readText(raw: string, fallbackTitle: string): Book {
  const text = tidy(raw.replace(/^﻿/, ''));
  if (text.length < 200) throw new BookError('no_text');
  const heads = [...text.matchAll(/^#{1,3}\s+(.+)$/gm)];
  const parts: Omit<Section, 'id'>[] = [];
  if (heads.length >= 2) {
    const before = text.slice(0, heads[0].index).trim();
    if (before) parts.push({ title: firstLine(before) || 'Introduction', page: 0, text: before });
    heads.forEach((h, i) => {
      const end = i + 1 < heads.length ? heads[i + 1].index : text.length;
      parts.push(...split(shortTitle(h[1].replace(/[#*_`]/g, '')), 0, text.slice(h.index! + h[0].length, end).trim()));
    });
  } else {
    let chunk = '';
    for (const para of text.split(/\n\n+/)) {
      if (chunk && chunk.length + para.length > SECTION_MAX * 0.7) { parts.push({ title: firstLine(chunk), page: 0, text: chunk }); chunk = ''; }
      chunk = chunk ? `${chunk}\n\n${para}` : para;
    }
    if (chunk) parts.push(...split(firstLine(chunk), 0, chunk));
  }
  const title = heads.find((h) => h[0].startsWith('# '))?.[1] ?? fallbackTitle;
  return { title: shortTitle(title.replace(/[#*_`]/g, '')), pages: 0, sections: settle(parts) };
}

interface OutlineNode { title: string; dest: unknown; items?: OutlineNode[] }

/** A PDF book. */
export async function readPdf(data: Uint8Array, fallbackTitle: string): Promise<Book> {
  if (String.fromCharCode(...data.subarray(0, 5)) !== '%PDF-') throw new BookError('not_a_book');
  const { getDocumentProxy } = await import('unpdf');
  let doc: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // pdf.js takes over the buffer it is given, so it gets a copy.
    doc = await getDocumentProxy(data.slice(), { isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 } as Parameters<typeof getDocumentProxy>[1]);
  } catch {
    throw new BookError('not_a_book');
  }
  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let out = '';
      for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
        if (typeof item.str !== 'string') continue;
        out += item.str + (item.hasEOL ? '\n' : item.str.endsWith(' ') ? '' : ' ');
      }
      pages.push(tidy(out));
      page.cleanup();
    }
    const total = pages.join('\n').replace(/\s+/g, '');
    // A scanned book without a text layer has nothing to read.
    if (total.length < 200) throw new BookError('no_text');

    // The book's bookmarks, down to two levels, with the page each one starts on.
    const marks: { title: string; page: number }[] = [];
    const outline = ((await doc.getOutline().catch(() => null)) ?? []) as OutlineNode[];
    const pageOf = async (dest: unknown): Promise<number | null> => {
      try {
        const d = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
        if (!Array.isArray(d) || !d[0]) return null;
        const ref = d[0];
        return typeof ref === 'number' ? ref + 1 : (await doc.getPageIndex(ref)) + 1;
      } catch { return null; }
    };
    const walk = async (nodes: OutlineNode[], depth: number) => {
      for (const node of nodes) {
        const page = await pageOf(node.dest);
        if (page && node.title?.trim()) marks.push({ title: shortTitle(node.title), page });
        if (depth < 2 && node.items?.length) await walk(node.items, depth + 1);
      }
    };
    await walk(outline, 1);
    marks.sort((a, b) => a.page - b.page);

    const parts: Omit<Section, 'id'>[] = [];
    // Several bookmarks on one page make one section named after all of them.
    const starts: { title: string; page: number }[] = [];
    for (const m of marks) {
      const last = starts[starts.length - 1];
      if (last && last.page === m.page) last.title = `${last.title} / ${m.title}`.slice(0, 120);
      else starts.push({ ...m });
    }
    if (starts.length >= 3) {
      if (starts[0].page > 1) starts.unshift({ title: firstLine(pages[0]) || 'Front matter', page: 1 });
      starts.forEach((s, i) => {
        const end = i + 1 < starts.length ? starts[i + 1].page - 1 : pages.length;
        const text = pages.slice(s.page - 1, Math.max(s.page, end)).join('\n\n');
        parts.push(...split(s.title, s.page, text));
      });
    } else {
      for (let p = 0; p < pages.length; p += PAGES_PER_CHUNK) {
        const text = pages.slice(p, p + PAGES_PER_CHUNK).join('\n\n');
        const last = Math.min(pages.length, p + PAGES_PER_CHUNK);
        const label = last > p + 1 ? `Pages ${p + 1}-${last}` : `Page ${p + 1}`;
        const head = firstLine(text);
        parts.push(...split(head ? `${label}: ${head}` : label, p + 1, text));
      }
    }
    const meta = await doc.getMetadata().catch(() => null);
    const metaTitle = String((meta?.info as { Title?: unknown } | undefined)?.Title ?? '').trim();
    const title = metaTitle && !/^untitled|\.(docx?|indd|pdf)$/i.test(metaTitle) ? metaTitle : fallbackTitle;
    return { title: shortTitle(title), pages: pages.length, sections: settle(parts) };
  } finally {
    await (doc as unknown as { cleanup?: () => Promise<void> }).cleanup?.().catch(() => undefined);
    await doc.loadingTask?.destroy().catch(() => undefined);
  }
}

/** Any supported book, by its file name. */
export async function readBook(name: string, data: Uint8Array): Promise<Book> {
  const fallback = shortTitle(name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ')) || 'Campaign';
  if (/\.pdf$/i.test(name) || String.fromCharCode(...data.subarray(0, 5)) === '%PDF-') return readPdf(data, fallback);
  if (/\.(txt|md|markdown)$/i.test(name)) return readText(new TextDecoder('utf-8').decode(data), fallback);
  throw new BookError('not_a_book');
}

/** Words that tell sections apart, for a plain search through the book. */
export function searchBook(sections: Section[], query: string, max = 5): { id: string; title: string; excerpt: string }[] {
  const words = query.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter((w) => w.length >= 3);
  if (!words.length) return [];
  const scored = sections.map((s) => {
    const low = s.text.toLowerCase();
    let score = 0, first = -1;
    for (const w of words) {
      let at = low.indexOf(w), hits = 0;
      if (at >= 0 && (first < 0 || at < first)) first = at;
      while (at >= 0 && hits < 20) { hits++; at = low.indexOf(w, at + w.length); }
      score += hits ? 3 + hits : 0;
      if (s.title.toLowerCase().includes(w)) score += 6;
    }
    return { s, score, first };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, max);
  return scored.map(({ s, first }) => {
    const from = Math.max(0, first - 160);
    return { id: s.id, title: s.title, excerpt: `${from ? '...' : ''}${s.text.slice(from, from + 420).replace(/\s+/g, ' ').trim()}...` };
  });
}
