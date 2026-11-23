// The server's own sound library: effects, ambient loops and music made with the owner's ElevenLabs key.
// Files sit in LIBRARY_DIR/files under a name taken from their content, the list of entries in LIBRARY_DIR/library.json.
// Making a sound runs in the background: the entry is there at once with status "making", and turns "ready" (or
// "failed", with ElevenLabs' reason) when the provider answers. Every take is booked as a cost.
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { join } from 'node:path';
import { Zip, ZipPassThrough } from 'fflate';
import { STARTER_SET, starterCost, type StarterSound } from '../../shared/starterLibrary';
import {
  LIBRARY_KINDS, LENGTH_LIMITS, SOUND_USD_PER_MINUTE, isLibraryKind, isScene, isSfxEvent, soundCost, tagsFrom,
  type LibraryEntry, type LibraryErrorCode, type StarterProgress, type LibraryKind, type LibraryOrigin, type LibraryView,
} from '../../shared/library';
import { type MusicManifest, type MusicTrack } from '../../shared/music';
import type { SfxEvent, SfxManifest } from '../../shared/sfx';

export class LibraryError extends Error {
  constructor(readonly code: LibraryErrorCode, readonly detail = '') { super(detail ? `${code}: ${detail}` : code); }
}

/** One entry as saved: the file's name instead of its address. */
interface Stored extends Omit<LibraryEntry, 'src' | 'error'> { file?: string; error?: string }
interface Saved {
  entries: Stored[];
  /** Starter lines the owner deleted, so "make what is missing" leaves them out. */
  droppedStarter?: string[];
}

/** Who pays for a take: the account that pressed the button, or the table that asked. */
export interface Payer { account?: string; table?: string }
export interface LibraryHooks {
  fetchFn?: typeof fetch;
  /** A take was paid for, in dollars. */
  onCost?: (usd: number, entry: LibraryEntry, payer: Payer) => void;
  /** Something players hear changed: a sound became ready, was switched off or removed. */
  onChange?: () => void;
  /** A take is done, made or failed. The entry as it is now. */
  onDone?: (entry: LibraryEntry) => void;
}

export interface MakeInput {
  kind?: unknown; description?: unknown; title?: unknown; tags?: unknown; scene?: unknown; event?: unknown; seconds?: unknown;
}

const ELEVEN = 'https://api.elevenlabs.io/v1';
const MAX_BYTES = 40_000_000;
/** Takes running at the same time. ElevenLabs allows a few per account; music is slow, so two keeps the queue moving. */
const PARALLEL = 2;

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'sound';
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** What is sent to ElevenLabs: the owner's words, plus what every sound of that kind needs. */
export function promptFor(kind: LibraryKind, description: string): string {
  switch (kind) {
    case 'music': return `${description}. Instrumental background music for a fantasy tabletop role-playing game, no vocals, no lyrics.`;
    case 'ambient': return `${description}. Seamless ambient background loop, no music, no voices speaking words.`;
    default: return `${description}. Single sound effect for a fantasy game, clean, no music.`;
  }
}

/** The reason in an ElevenLabs error answer, which is either {detail: "..."} or {detail: {status, message}}. */
function reasonOf(body: string): { status: string; message: string } {
  try {
    const d = (JSON.parse(body) as { detail?: unknown }).detail;
    if (typeof d === 'string') return { status: '', message: d };
    if (d && typeof d === 'object') {
      const o = d as { status?: unknown; message?: unknown };
      return { status: String(o.status ?? ''), message: String(o.message ?? o.status ?? '') };
    }
  } catch { /* not JSON */ }
  return { status: '', message: body.slice(0, 300) };
}

/** Ask ElevenLabs for one sound. Returns the mp3. Throws LibraryError with the provider's reason. */
export async function elevenSound(key: string, kind: LibraryKind, prompt: string, seconds: number, fetchFn: typeof fetch = fetch): Promise<Uint8Array> {
  const music = kind === 'music';
  const url = music ? `${ELEVEN}/music?output_format=mp3_44100_128` : `${ELEVEN}/sound-generation?output_format=mp3_44100_128`;
  const body = music
    ? { prompt, music_length_ms: Math.round(seconds * 1000), model_id: 'music_v1', force_instrumental: true }
    : { text: prompt, duration_seconds: seconds, prompt_influence: 0.4, model_id: 'eleven_text_to_sound_v2', ...(kind === 'ambient' ? { loop: true } : {}) };
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify(body),
      // Music takes a while to compose.
      signal: AbortSignal.timeout(music ? 600_000 : 120_000),
    });
  } catch (err) {
    throw new LibraryError('provider_failed', err instanceof Error ? err.message : String(err));
  }
  if (!res.ok) {
    const why = reasonOf(await res.text().catch(() => ''));
    const text = why.message || `HTTP ${res.status}`;
    if (res.status === 401 && /quota|credit/i.test(`${why.status} ${why.message}`) || res.status === 402 || /quota_exceeded/i.test(why.status)) throw new LibraryError('out_of_credit', text);
    if (res.status === 401 || res.status === 403 || /subscription|plan|not.?allowed|permission|paid/i.test(`${why.status} ${why.message}`)) throw new LibraryError('not_allowed', text);
    throw new LibraryError('provider_failed', text);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 500 || bytes.length > MAX_BYTES) throw new LibraryError('provider_failed', `unexpected answer of ${bytes.length} bytes`);
  return bytes;
}

export class SoundLibrary {
  private s: Saved;
  private queue: { id: string; payer: Payer }[] = [];
  private running = 0;
  private idle: (() => void)[] = [];
  private fetchFn: typeof fetch;

  constructor(private dir: string, private env: NodeJS.ProcessEnv, private hooks: LibraryHooks = {}, private now: () => number = Date.now) {
    this.fetchFn = hooks.fetchFn ?? fetch;
    this.s = this.load();
    // Takes cut off by a restart start again; their earlier tries were never paid for twice.
    for (const e of this.s.entries) if (e.status === 'making') this.queue.push({ id: e.id, payer: {} });
    if (this.queue.length) setTimeout(() => this.pump(), 0).unref?.();
  }

  private key() { return (this.env.ELEVENLABS_API_KEY ?? '').trim(); }

  private load(): Saved {
    try {
      const raw = JSON.parse(readFileSync(join(this.dir, 'library.json'), 'utf8')) as Partial<Saved>;
      const entries = Array.isArray(raw.entries) ? raw.entries.filter((e) => e && typeof e.id === 'string' && isLibraryKind(e.kind)) : [];
      const droppedStarter = Array.isArray(raw.droppedStarter) ? raw.droppedStarter.filter((k) => typeof k === 'string') : [];
      return { entries, droppedStarter };
    } catch {
      return { entries: [] };
    }
  }

  private save() {
    mkdirSync(this.dir, { recursive: true });
    const file = join(this.dir, 'library.json');
    writeFileSync(`${file}.tmp`, JSON.stringify(this.s, null, 1));
    renameSync(`${file}.tmp`, file);
  }

  private view(e: Stored): LibraryEntry {
    const { file, ...rest } = e;
    return { ...rest, src: file && e.status !== 'making' ? `/library/${file}` : '' };
  }

  entries(): LibraryEntry[] { return this.s.entries.map((e) => this.view(e)); }

  library(): LibraryView {
    return { canMake: !!this.key(), entries: this.entries().sort((a, b) => b.createdAt - a.createdAt), usdPerMinute: { ...SOUND_USD_PER_MINUTE }, starter: this.starterProgress() };
  }

  /** Starter lines that have no sound yet (or only a failed one), leaving out the ones the owner deleted. */
  private starterMissing(kinds: readonly LibraryKind[]): StarterSound[] {
    const have = new Set(this.s.entries.filter((e) => e.starter && e.status !== 'failed').map((e) => e.starter));
    const dropped = new Set(this.s.droppedStarter ?? []);
    return STARTER_SET.filter((x) => kinds.includes(x.kind) && !have.has(x.key) && !dropped.has(x.key));
  }

  starterProgress(): Record<LibraryKind, StarterProgress> {
    const out = {} as Record<LibraryKind, StarterProgress>;
    for (const kind of LIBRARY_KINDS) {
      const all = STARTER_SET.filter((x) => x.kind === kind);
      const missing = this.starterMissing([kind]);
      const made = new Set(this.s.entries.filter((e) => e.kind === kind && e.starter && e.status !== 'failed').map((e) => e.starter)).size;
      out[kind] = { total: all.length, made, missing: missing.length, missingUsd: round(starterCost(missing, SOUND_USD_PER_MINUTE)) };
    }
    return out;
  }

  /**
   * Make every missing starter sound of these kinds. A line whose earlier try failed gets a new try in its old
   * entry. Returns how many were put in the queue.
   */
  makeStarter(kinds: unknown, payer: Payer = {}): number {
    if (!this.key()) throw new LibraryError('no_key');
    const wanted = (Array.isArray(kinds) ? kinds : [kinds]).filter(isLibraryKind);
    if (!wanted.length) throw new LibraryError('bad_request');
    const missing = this.starterMissing(wanted);
    for (const x of missing) {
      const failed = this.s.entries.find((e) => e.starter === x.key);
      if (failed) {
        failed.status = 'making';
        delete failed.error;
        this.queue.push({ id: failed.id, payer });
        continue;
      }
      const entry: Stored = {
        id: `${x.kind}-${randomBytes(5).toString('hex')}`, kind: x.kind, title: x.title, description: x.description, tags: [...x.tags],
        seconds: x.seconds, loop: x.kind === 'ambient', ...(x.scene ? { scene: x.scene } : {}), ...(x.event ? { event: x.event } : {}),
        status: 'making', bytes: 0, usd: 0, by: 'starter', createdAt: this.now(), starter: x.key,
      };
      this.s.entries.push(entry);
      this.queue.push({ id: entry.id, payer });
    }
    // Short sounds first, so effects are heard within minutes while the music is still being composed.
    const order: Record<LibraryKind, number> = { sfx: 0, ambient: 1, music: 2 };
    const kindOf = (id: string) => this.s.entries.find((e) => e.id === id)?.kind ?? 'music';
    this.queue.sort((a, b) => order[kindOf(a.id)] - order[kindOf(b.id)]);
    this.save();
    this.pump();
    return missing.length;
  }

  private find(id: unknown): Stored {
    const e = this.s.entries.find((x) => x.id === id);
    if (!e) throw new LibraryError('not_found');
    return e;
  }

  /** Put a new sound on the list and start making it. Returns the entry, still "making". */
  make(input: MakeInput, by: LibraryOrigin, payer: Payer = {}): LibraryEntry {
    if (!this.key()) throw new LibraryError('no_key');
    const kind = input.kind;
    if (!isLibraryKind(kind)) throw new LibraryError('bad_request');
    const description = clean(input.description, 400);
    if (description.length < 3) throw new LibraryError('bad_request');
    const lim = LENGTH_LIMITS[kind];
    const asked = Number(input.seconds);
    const seconds = Number.isFinite(asked) && asked > 0 ? Math.min(lim.max, Math.max(lim.min, Math.round(asked * 10) / 10)) : lim.fallback;
    const scene = kind !== 'sfx' && isScene(input.scene) ? input.scene : undefined;
    const event = kind === 'sfx' && isSfxEvent(input.event) ? input.event : undefined;
    const tags = Array.isArray(input.tags) ? input.tags.map((t) => clean(t, 30).toLowerCase()).filter(Boolean).slice(0, 16) : tagsFrom(description);
    const entry: Stored = {
      id: `${kind}-${randomBytes(5).toString('hex')}`,
      kind, description, tags, seconds, loop: kind === 'ambient',
      title: clean(input.title, 80) || description.slice(0, 60),
      ...(scene ? { scene } : {}), ...(event ? { event } : {}),
      status: 'making', bytes: 0, usd: 0, by, createdAt: this.now(),
      ...(by === 'dm' && payer.table ? { table: payer.table } : {}),
    };
    this.s.entries.push(entry);
    this.save();
    this.queue.push({ id: entry.id, payer });
    this.pump();
    return this.view(entry);
  }

  /** Make a new take of the same sound. The old file plays until the new one is there. */
  regenerate(id: unknown, payer: Payer = {}): LibraryEntry {
    if (!this.key()) throw new LibraryError('no_key');
    const e = this.find(id);
    if (e.status === 'making') throw new LibraryError('busy');
    e.status = 'making';
    delete e.error;
    this.save();
    this.queue.push({ id: e.id, payer });
    this.pump();
    return this.view(e);
  }

  /** The Innkeeper changes what an entry is called, where it plays, or switches it off. */
  set(id: unknown, patch: Record<string, unknown>): LibraryEntry {
    const e = this.find(id);
    if (patch.title !== undefined) e.title = clean(patch.title, 80) || e.title;
    if (patch.description !== undefined) { const d = clean(patch.description, 400); if (d.length >= 3) e.description = d; }
    if (Array.isArray(patch.tags)) e.tags = patch.tags.map((t) => clean(t, 30).toLowerCase()).filter(Boolean).slice(0, 16);
    if (patch.scene !== undefined && e.kind !== 'sfx') { if (patch.scene === null || patch.scene === '') delete e.scene; else if (isScene(patch.scene)) e.scene = patch.scene; else throw new LibraryError('bad_request'); }
    if (patch.event !== undefined && e.kind === 'sfx') { if (patch.event === null || patch.event === '') delete e.event; else if (isSfxEvent(patch.event)) e.event = patch.event; else throw new LibraryError('bad_request'); }
    if (typeof patch.enabled === 'boolean') { if (patch.enabled) delete e.disabled; else e.disabled = true; }
    this.save();
    this.hooks.onChange?.();
    return this.view(e);
  }

  remove(id: unknown) {
    const e = this.find(id);
    this.s.entries = this.s.entries.filter((x) => x !== e);
    if (e.starter && !this.s.entries.some((x) => x.starter === e.starter)) (this.s.droppedStarter ??= []).push(e.starter);
    this.queue = this.queue.filter((q) => q.id !== e.id);
    this.dropFile(e.file);
    this.save();
    this.hooks.onChange?.();
  }

  private dropFile(file: string | undefined) {
    if (file && !this.s.entries.some((x) => x.file === file)) rmSync(join(this.dir, 'files', file), { force: true });
  }

  /** Resolves once nothing is queued or being made. For tests and for a tidy shutdown. */
  whenIdle(): Promise<void> {
    if (!this.running && !this.queue.length) return Promise.resolve();
    return new Promise((r) => this.idle.push(r));
  }

  private pump() {
    while (this.running < PARALLEL && this.queue.length) {
      const job = this.queue.shift()!;
      this.running++;
      void this.take(job.id, job.payer).finally(() => {
        this.running--;
        this.pump();
        if (!this.running && !this.queue.length) for (const r of this.idle.splice(0)) r();
      });
    }
  }

  private async take(id: string, payer: Payer) {
    const e = this.s.entries.find((x) => x.id === id);
    if (!e || e.status !== 'making') return;
    try {
      const bytes = await elevenSound(this.key(), e.kind, promptFor(e.kind, e.description), e.seconds, this.fetchFn);
      const usd = soundCost(e.kind, e.seconds);
      // The entry may have been deleted while it was being made: the take is paid for all the same.
      const still = this.s.entries.includes(e);
      this.hooks.onCost?.(usd, this.view(e), payer);
      if (!still) return;
      const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 20)}.mp3`;
      const folder = join(this.dir, 'files');
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, `${name}.part`), bytes);
      renameSync(join(folder, `${name}.part`), join(folder, name));
      const old = e.file;
      e.file = name; e.bytes = bytes.length; e.usd = round(e.usd + usd); e.status = 'ready';
      delete e.error;
      if (old !== name) this.dropFile(old);
      this.save();
      console.log(`[library] Made ${e.kind} "${e.title}" (${e.seconds} s, $${usd.toFixed(3)}).`);
      this.hooks.onChange?.();
      this.hooks.onDone?.(this.view(e));
    } catch (err) {
      const le = err instanceof LibraryError ? err : new LibraryError('provider_failed', err instanceof Error ? err.message : String(err));
      if (!this.s.entries.includes(e)) return;
      // A sound that had a file keeps playing it; the failure is only noted.
      e.status = e.file ? 'ready' : 'failed';
      e.error = `${le.code}${le.detail ? `: ${le.detail}` : ''}`.slice(0, 400);
      this.save();
      console.warn(`[library] Could not make ${e.kind} "${e.title}": ${e.error}`);
      this.hooks.onChange?.();
      this.hooks.onDone?.(this.view(e));
    }
  }

  /** The entry with this id, or null. */
  get(id: unknown): LibraryEntry | null {
    const e = this.s.entries.find((x) => x.id === id);
    return e ? this.view(e) : null;
  }

  /** Sounds the Dungeon Master ordered at this table: how many since `since`, and how many are still being made. */
  ordersAt(table: string, since: number): { count: number; making: number } {
    const mine = this.s.entries.filter((e) => e.by === 'dm' && e.table === table);
    return { count: mine.filter((e) => e.createdAt >= since).length, making: mine.filter((e) => e.status === 'making').length };
  }

  /** Whether new sounds can be made at all: an ElevenLabs key is set. */
  canMake() { return !!this.key(); }

  /** The file behind /library/<name>, or null. */
  file(name: string): string | null {
    if (!/^[0-9a-f]{20}\.mp3$/.test(name)) return null;
    const path = join(this.dir, 'files', name);
    return existsSync(path) && statSync(path).isFile() ? path : null;
  }

  private playable(): Stored[] { return this.s.entries.filter((e) => e.status === 'ready' && !e.disabled && e.file); }

  /**
   * The music players hear: in a scene (and layer) that has sounds of its own in the library, only those; elsewhere
   * the older tracks as before, until they are retired.
   */
  mergeMusic(m: MusicManifest): MusicManifest {
    if (!m.enabled) return m;
    const own: MusicTrack[] = this.playable().filter((e) => e.kind !== 'sfx' && e.scene).map((e) => ({
      id: `library/${e.id}`, context: e.scene!, layer: e.kind === 'ambient' ? 'ambient' : 'music', title: e.title, artist: '', license: '', src: `/library/${e.file}`,
    }));
    const covered = new Set(own.map((t) => `${t.layer}/${t.context}`));
    return { ...m, tracks: [...own, ...m.tracks.filter((t) => !covered.has(`${t.layer}/${t.context}`))] };
  }

  /** The effects players hear: per game moment, the library's takes. Moments without one keep the older sounds. */
  mergeSfx(m: SfxManifest): SfxManifest {
    if (!m.enabled) return m;
    const events: Partial<Record<SfxEvent, string[]>> = {};
    for (const e of this.playable()) if (e.kind === 'sfx' && e.event) (events[e.event] ??= []).push(`/library/${e.file}`);
    return { ...m, events };
  }

  /**
   * Send every file of one kind (or all) as one zip, with library.json, so the owner can keep a copy. Files are
   * stored as they are (mp3 does not shrink), streamed one after another.
   */
  archive(kind: LibraryKind | null, res: ServerResponse) {
    const pick = this.s.entries.filter((e) => e.file && (!kind || e.kind === kind) && existsSync(join(this.dir, 'files', e.file)));
    const day = new Date(this.now()).toISOString().slice(0, 10);
    res.writeHead(200, {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="hearthforge-library-${kind ?? 'all'}-${day}.zip"`,
      'cache-control': 'no-store',
    });
    const zip = new Zip((err, chunk, final) => {
      if (err) { console.warn('[library] zip failed:', err); res.destroy(err); return; }
      res.write(chunk);
      if (final) res.end();
    });
    const names = new Set<string>();
    const named = pick.map((e) => {
      let name = `${e.kind}/${e.scene ? `${e.scene}/` : e.event ? `${e.event}/` : ''}${slug(e.title)}.mp3`;
      if (names.has(name)) name = name.replace(/\.mp3$/, `-${e.id.slice(-4)}.mp3`);
      names.add(name);
      return { e, name };
    });
    // library.json names each file's place in the zip, so the library can be put back from it.
    const list = new ZipPassThrough('library.json');
    zip.add(list);
    list.push(new TextEncoder().encode(JSON.stringify({ format: 'hearthforge-library', version: 1, entries: named.map(({ e, name }) => ({ ...e, path: name })) }, null, 1)), true);
    const sendNext = (i: number) => {
      if (i >= named.length) { zip.end(); return; }
      const { e, name } = named[i];
      const part = new ZipPassThrough(name);
      zip.add(part);
      const stream = createReadStream(join(this.dir, 'files', e.file!));
      stream.on('data', (c) => part.push(c as Uint8Array));
      stream.on('end', () => { part.push(new Uint8Array(0), true); sendNext(i + 1); });
      stream.on('error', (err) => { console.warn('[library] could not read', e.file, err); part.push(new Uint8Array(0), true); sendNext(i + 1); });
    };
    sendNext(0);
  }

  /** How many entries there are per kind and scene, for the log at start. */
  summary(): string {
    const ready = this.playable();
    if (!ready.length) return 'empty';
    const n = (k: LibraryKind) => ready.filter((e) => e.kind === k).length;
    return `${n('music')} music, ${n('ambient')} ambient, ${n('sfx')} effects`;
  }
}

