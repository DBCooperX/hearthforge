// The art library: which packs are on the server, which are in use, and which picture of an
// icon pack stands for which item. Packs arrive as a zip uploaded in the browser (or dropped
// into ART_DIR), or are fetched by the server where a direct link exists. The choice made in
// the game is kept in ART_DIR/library.json and wins over HEARTHFORGE_ART.
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { unzipSync } from 'fflate';
import {
  CATALOG, EMOJI_ICONS, GAME_ICONS, GAME_ICON_PATHS, ICON_SLOTS, isIconSlot,
  type ArtLibrary, type ArtManifest, type ArtRef, type PackIcon, type PackInfo, type TilePack,
} from '../../shared/art';
import { artManifest, artMode, download, ensureArt, walk } from './art';

/** A refusal the interface can explain. `code` is one of the keys of ART_ERRORS in the client. */
export class ArtError extends Error {
  constructor(readonly code: 'no_images' | 'not_a_zip' | 'too_big' | 'unknown_pack' | 'not_installed' | 'download_failed' | 'bad_request') {
    super(code);
  }
}

interface StoredPack {
  name: string;
  author: string;
  license: string;
  url: string;
  cell?: number;
  /** Icons the host chose by hand. null means "no picture for this one". */
  assigned: Record<string, ArtRef | null>;
}
interface State {
  tiles?: TilePack;
  icons?: string;
  packs: Record<string, StoredPack>;
}

export const MAX_UPLOAD = 96 * 1024 * 1024;
const MAX_FILES = 30_000;
const MAX_UNPACKED = 400 * 1024 * 1024;
const GAME_ICONS_BASE = 'https://raw.githubusercontent.com/game-icons/icons/master';
/** Anything larger than this is a sheet of icons, not one icon. */
const SINGLE = 128;
const CELLS = [8, 16, 24, 32, 48, 64];

const TILE_PACKS: Record<TilePack, Omit<PackInfo, 'installed' | 'active'>> = {
  generated: { id: 'generated', kind: 'tiles', name: 'Hearthforge pixel art', author: 'Hearthforge', license: 'CC0 1.0', url: '', source: 'builtin' },
  kenney: { id: 'kenney', kind: 'tiles', name: 'Tiny Dungeon', author: 'Kenney', license: 'CC0 1.0', url: 'https://kenney.nl/assets/tiny-dungeon', source: 'download' },
  '0x72': { id: '0x72', kind: 'tiles', name: 'DungeonTileset II', author: '0x72', license: 'CC0 1.0', url: 'https://0x72.itch.io/dungeontileset-ii', source: 'upload' },
};

function pngSize(file: string): { w: number; h: number } | null {
  try {
    const fd = openSync(file, 'r');
    const b = Buffer.alloc(24);
    const n = readSync(fd, b, 0, 24, 0);
    closeSync(fd);
    if (n < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('latin1', 12, 16) !== 'IHDR') return null;
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch {
    return null;
  }
}

const slug = (s: string) => s.toLowerCase().replace(/\.zip$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'pack';
const words = (file: string) => basename(file).replace(/\.[^.]+$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter(Boolean);

/** Only what is safe to keep from an svg of game-icons.net: no scripts, no links, our colours. */
export function cleanSvg(raw: string): string | null {
  const svg = raw.trim();
  if (!svg.startsWith('<svg') || svg.length > 200_000 || /<script|<foreignObject|\son\w+\s*=|href|<style|<!ENTITY/i.test(svg)) return null;
  return svg.replace('<path d="M0 0h512v512H0z"/>', '').replace(/fill="#fff(fff)?"/gi, 'fill="#ead9b0"');
}

interface Image { file: string; src: string; w: number; h: number }

export class ArtStore {
  private state: State = { packs: {} };
  private images = new Map<string, Image[]>();
  private busy = new Set<string>();

  constructor(readonly dir: string, private env: NodeJS.ProcessEnv = {}) {
    try {
      const raw = JSON.parse(readFileSync(this.stateFile, 'utf8'));
      if (raw && typeof raw === 'object') this.state = { ...raw, packs: raw.packs && typeof raw.packs === 'object' ? raw.packs : {} };
    } catch { /* first start */ }
  }

  private get stateFile() { return join(this.dir, 'library.json'); }
  private save() {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(`${this.stateFile}.tmp`, JSON.stringify(this.state, null, 2));
    renameSync(`${this.stateFile}.tmp`, this.stateFile);
  }
  private packDir(id: string) { return join(this.dir, 'icons', id); }
  private url(file: string) { return `/art/${relative(this.dir, file).split(sep).map(encodeURIComponent).join('/')}`; }

  get tiles(): TilePack { return this.state.tiles ?? artMode(this.env); }
  get icons(): string {
    const id = this.state.icons ?? EMOJI_ICONS;
    return id === EMOJI_ICONS || (id === GAME_ICONS ? this.gameIconsInstalled() : !!this.state.packs[id]) ? id : EMOJI_ICONS;
  }

  /** On start: fetch the chosen tile pack and take in any zip someone copied into ART_DIR by hand. */
  async start(): Promise<void> {
    await ensureArt(this.dir, this.tiles, this.env);
    if (!existsSync(this.dir)) return;
    for (const f of readdirSync(this.dir).filter((n) => /\.zip$/i.test(n))) {
      if (/kenney|tiny|0x72|dungeontileset/i.test(f)) continue; // ensureArt looks after these
      try {
        const done = join(this.dir, 'imported');
        this.importZip(f, readFileSync(join(this.dir, f)));
        mkdirSync(done, { recursive: true });
        renameSync(join(this.dir, f), join(done, f));
        console.log(`[art] Took in ${f}`);
      } catch (err) {
        console.warn(`[art] Could not read ${f}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  private gameIconFiles() { return walk(join(this.dir, GAME_ICONS)).filter((f) => f.endsWith('.svg')); }
  private gameIconsInstalled() { return this.gameIconFiles().length >= 20; }

  private imagesOf(id: string): Image[] {
    let list = this.images.get(id);
    if (!list) {
      list = walk(this.packDir(id)).filter((f) => /\.png$/i.test(f)).sort().flatMap((file) => {
        const size = pngSize(file);
        return size && size.w > 0 && size.h > 0 ? [{ file, src: this.url(file), ...size }] : [];
      });
      this.images.set(id, list);
    }
    return list;
  }

  private cellOf(id: string): number {
    const stored = this.state.packs[id]?.cell;
    if (stored && CELLS.includes(stored)) return stored;
    const sheets = this.imagesOf(id).filter((i) => i.w > SINGLE || i.h > SINGLE);
    const named = /(\d{1,2})x\1/.exec(`${this.state.packs[id]?.name ?? ''} ${sheets.map((s) => basename(s.file)).join(' ')}`);
    if (named && CELLS.includes(Number(named[1]))) return Number(named[1]);
    return sheets.length && sheets.every((s) => s.w % 32 === 0 && s.h % 32 === 0) ? 32 : 16;
  }

  /** Pictures found by file name: "sword_01.png" for the longsword, "potion_red.png" for the healing potion. */
  private autoMatch(id: string): Record<string, ArtRef> {
    const singles = this.imagesOf(id).filter((i) => i.w <= SINGLE && i.h <= SINGLE).map((i) => ({ ...i, words: words(i.file) }));
    const out: Record<string, ArtRef> = {};
    for (const slot of ICON_SLOTS) {
      for (const kw of slot.keywords) {
        const hits = singles.filter((i) => i.words.some((w) => w === kw || w === `${kw}s`));
        if (!hits.length) continue;
        // Packs often ship every icon in several sizes: take the one nearest to 32 pixels.
        hits.sort((a, b) => Math.abs(a.w - 32) - Math.abs(b.w - 32) || a.file.length - b.file.length || a.file.localeCompare(b.file));
        out[slot.id] = { src: hits[0].src };
        break;
      }
    }
    return out;
  }

  private iconsOf(id: string): Record<string, ArtRef> {
    if (id === GAME_ICONS) {
      const have = new Set(this.gameIconFiles().map((f) => relative(join(this.dir, GAME_ICONS), f).split(sep).join('/').replace(/\.svg$/, '')));
      return Object.fromEntries(Object.entries(GAME_ICON_PATHS).filter(([, p]) => have.has(p)).map(([slot, p]) => [slot, { src: `/art/${GAME_ICONS}/${p}.svg` }]));
    }
    const pack = this.state.packs[id];
    if (!pack) return {};
    const out = this.autoMatch(id);
    for (const [slot, ref] of Object.entries(pack.assigned ?? {})) {
      if (ref) out[slot] = ref;
      else delete out[slot];
    }
    return out;
  }

  manifest(): ArtManifest {
    const tiles = artManifest(this.dir, this.tiles);
    const iconPack = this.icons;
    return { pack: tiles?.pack ?? 'generated', sprites: tiles?.sprites ?? {}, iconPack, icons: iconPack === EMOJI_ICONS ? {} : this.iconsOf(iconPack) };
  }

  library(canEdit: boolean, uploads: boolean): ArtLibrary {
    const tilesNow = this.manifest().pack;
    const packs: PackInfo[] = (Object.keys(TILE_PACKS) as TilePack[]).map((id) => ({
      ...TILE_PACKS[id], installed: id === 'generated' || artManifest(this.dir, id) !== null, active: tilesNow === id,
    }));
    const icons = this.icons;
    packs.push({ id: EMOJI_ICONS, kind: 'icons', name: 'Emoji', author: '', license: '', url: '', source: 'builtin', installed: true, active: icons === EMOJI_ICONS });
    packs.push({
      id: GAME_ICONS, kind: 'icons', name: 'Game-icons.net', author: 'Lorc, Delapouite and contributors', license: 'CC BY 3.0', url: 'https://game-icons.net',
      source: 'download', installed: this.gameIconsInstalled(), active: icons === GAME_ICONS, matched: Object.keys(this.iconsOf(GAME_ICONS)).length,
    });
    for (const [id, p] of Object.entries(this.state.packs)) {
      packs.push({
        id, kind: 'icons', name: p.name, author: p.author, license: p.license, url: p.url, source: 'upload', installed: true, active: icons === id,
        matched: Object.keys(this.iconsOf(id)).length, cell: this.cellOf(id), images: this.imagesOf(id).length,
      });
    }
    return { canEdit, uploads, slots: ICON_SLOTS.length, packs };
  }

  /** Everything an uploaded pack offers: single images, and sheets cut into cells. */
  packIcons(id: string): PackIcon[] {
    if (!this.state.packs[id]) throw new ArtError('unknown_pack');
    const cell = this.cellOf(id);
    const out: PackIcon[] = [];
    for (const img of this.imagesOf(id)) {
      const name = relative(this.packDir(id), img.file).split(sep).join('/').replace(/\.png$/i, '');
      if (img.w <= SINGLE && img.h <= SINGLE) out.push({ name, src: img.src });
      else {
        for (let y = 0; y + cell <= img.h; y += cell) {
          for (let x = 0; x + cell <= img.w; x += cell) out.push({ name: `${name} ${y / cell + 1}/${x / cell + 1}`, src: img.src, rect: { x, y, w: cell, h: cell } });
        }
      }
      if (out.length > 12_000) break;
    }
    return out;
  }

  /** Take in an uploaded zip. Tile packs are recognised by what is inside; everything else with images is an icon pack. */
  importZip(fileName: string, zip: Uint8Array): { id: string; kind: 'tiles' | 'icons' } {
    if (zip.length > MAX_UPLOAD) throw new ArtError('too_big');
    const names: string[] = [];
    let total = 0;
    try {
      unzipSync(zip, { filter: (f) => { names.push(f.name); total += f.originalSize; return false; } });
    } catch {
      throw new ArtError('not_a_zip');
    }
    if (names.length > MAX_FILES || total > MAX_UNPACKED) throw new ArtError('too_big');
    const real = names.filter((n) => !/(^|\/)(__MACOSX|\.)/.test(n));
    const tile: TilePack | null = real.filter((n) => /tile_\d{4}\.png$/i.test(n)).length >= 50 ? 'kenney'
      : real.some((n) => /tiles?_list/i.test(n)) && real.some((n) => /dungeon_?tileset_?ii.*\.png$/i.test(n)) ? '0x72' : null;
    if (!real.some((n) => /\.png$/i.test(n))) throw new ArtError('no_images');
    const known = CATALOG.find((c) => c.kind === 'icons' && c.match?.test(fileName));
    const id = tile ?? known?.id ?? slug(fileName);
    if (!tile && (id === EMOJI_ICONS || id === GAME_ICONS || id in TILE_PACKS)) throw new ArtError('bad_request');
    const dest = tile ? join(this.dir, tile) : this.packDir(id);
    rmSync(dest, { recursive: true, force: true });
    const keep = tile ? /\.(png|txt|md|json)$/i : /\.png$/i;
    const files = unzipSync(zip, { filter: (f) => keep.test(f.name) && !/(^|\/)(__MACOSX|\.)/.test(f.name) && f.originalSize < 16_000_000 || (tile === '0x72' && /tiles?_list/i.test(f.name)) });
    for (const [name, data] of Object.entries(files)) {
      // Zip entries are untrusted: keep every path inside dest.
      const clean = name.split(/[\\/]/).filter((p) => p && p !== '.' && p !== '..').join(sep);
      if (!clean || data.length === 0) continue;
      const out = join(dest, clean);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, data);
    }
    if (tile) {
      if (!artManifest(this.dir, tile)) throw new ArtError('no_images');
      this.state.tiles = tile;
    } else {
      this.images.delete(id);
      const before = this.state.packs[id];
      this.state.packs[id] = {
        name: known?.name ?? fileName.replace(/\.zip$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 60), author: known?.author ?? '', license: known?.license ?? '', url: known?.url ?? '',
        cell: before?.cell, assigned: before?.assigned ?? {},
      };
      this.state.icons = id;
    }
    this.save();
    return { id, kind: tile ? 'tiles' : 'icons' };
  }

  /** Fetch a pack the server can get by itself. */
  async install(id: string): Promise<void> {
    if (this.busy.has(id)) return;
    this.busy.add(id);
    try {
      if (id === 'kenney') {
        await ensureArt(this.dir, 'kenney', this.env);
        if (!artManifest(this.dir, 'kenney')) throw new ArtError('download_failed');
        this.state.tiles = 'kenney';
      } else if (id === GAME_ICONS) {
        const base = (this.env.HEARTHFORGE_GAME_ICONS_URL || GAME_ICONS_BASE).replace(/\/+$/, '');
        const paths = [...new Set(Object.values(GAME_ICON_PATHS))];
        let ok = 0;
        const next = async (): Promise<void> => {
          for (let p = paths.pop(); p; p = paths.pop()) {
            const out = join(this.dir, GAME_ICONS, `${p}.svg`);
            if (existsSync(out)) { ok++; continue; }
            try {
              const svg = cleanSvg(new TextDecoder().decode(await download(`${base}/${p}.svg`)));
              if (!svg) continue;
              mkdirSync(dirname(out), { recursive: true });
              writeFileSync(out, svg);
              ok++;
            } catch { /* one missing icon keeps its emoji */ }
          }
        };
        await Promise.all(Array.from({ length: 6 }, next));
        if (!this.gameIconsInstalled()) throw new ArtError('download_failed');
        console.log(`[art] game-icons.net: ${ok} icons in place`);
        this.state.icons = GAME_ICONS;
      } else throw new ArtError('unknown_pack');
      this.save();
    } finally {
      this.busy.delete(id);
    }
  }

  activate(kind: 'tiles' | 'icons', id: string) {
    if (kind === 'tiles') {
      if (!(id in TILE_PACKS)) throw new ArtError('unknown_pack');
      if (id !== 'generated' && !artManifest(this.dir, id as TilePack)) throw new ArtError('not_installed');
      this.state.tiles = id as TilePack;
    } else {
      if (id !== EMOJI_ICONS && !(id === GAME_ICONS ? this.gameIconsInstalled() : this.state.packs[id])) throw new ArtError('not_installed');
      this.state.icons = id;
    }
    this.save();
  }

  /** Give a slot a picture of the pack, no picture (null), or back to the automatic match (undefined). */
  assign(id: string, slot: string, icon: string | null | undefined) {
    const pack = this.state.packs[id];
    if (!pack) throw new ArtError('unknown_pack');
    if (!isIconSlot(slot)) throw new ArtError('bad_request');
    if (icon === undefined) delete pack.assigned[slot];
    else if (icon === null) pack.assigned[slot] = null;
    else {
      const hit = this.packIcons(id).find((i) => i.name === icon);
      if (!hit) throw new ArtError('bad_request');
      pack.assigned[slot] = hit.rect ? { src: hit.src, rect: hit.rect } : { src: hit.src };
    }
    this.save();
  }

  describe(id: string, change: { cell?: unknown; name?: unknown; author?: unknown; license?: unknown; url?: unknown }) {
    const pack = this.state.packs[id];
    if (!pack) throw new ArtError('unknown_pack');
    if (change.cell !== undefined) {
      if (!CELLS.includes(Number(change.cell))) throw new ArtError('bad_request');
      if (pack.cell !== Number(change.cell)) {
        pack.cell = Number(change.cell);
        // Cells cut at the old size no longer exist.
        for (const [slot, ref] of Object.entries(pack.assigned)) if (ref?.rect) delete pack.assigned[slot];
      }
    }
    const text = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
    if (change.name !== undefined && text(change.name, 60)) pack.name = text(change.name, 60);
    if (change.author !== undefined) pack.author = text(change.author, 120);
    if (change.license !== undefined) pack.license = text(change.license, 80);
    if (change.url !== undefined) pack.url = /^https?:\/\//i.test(text(change.url, 300)) ? text(change.url, 300) : '';
    this.save();
  }

  remove(id: string) {
    if (!this.state.packs[id]) throw new ArtError('unknown_pack');
    rmSync(this.packDir(id), { recursive: true, force: true });
    delete this.state.packs[id];
    this.images.delete(id);
    if (this.state.icons === id) this.state.icons = EMOJI_ICONS;
    this.save();
  }
}
