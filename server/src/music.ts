// Background music. Nothing is bundled: on start the server fetches a small set of openly
// licensed tracks into MUSIC_DIR (one folder per context) and tells the client what it has.
// A track that cannot be fetched is skipped, and with no tracks at all the game is silent.
// Audio files the owner copies into a context folder are played too.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { unzipSync } from 'fflate';
import { MUSIC_CONTEXTS, type MusicContext, type MusicItem, type MusicLayer, type MusicLibrary, type MusicManifest, type MusicTrack } from '../../shared/music';

export interface TrackSource {
  context: MusicContext;
  /** Defaults to music. Ambient files are kept in MUSIC_DIR/ambient/<context>. */
  layer?: MusicLayer;
  title: string;
  artist: string;
  license: string;
  url: string;
}

export const AUDIO_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
};

const MAX_TRACK_BYTES = 40_000_000;
const MACLEOD = 'Kevin MacLeod (incompetech.com)';
const CC_BY = 'CC BY 4.0';
const incompetech = (context: MusicContext, title: string): TrackSource => ({
  context, title, artist: MACLEOD, license: CC_BY, layer: 'music',
  url: `https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(title)}.mp3`,
});

/**
 * The built-in track list, all by Kevin MacLeod. Every link was checked on 15 November 2026
 * (the file answers with HTTP 200); the contexts are assigned by the tracks' character, not
 * by listening to every one. A link that fails later is skipped. Replace the whole list with
 * MUSIC_DIR/tracks.json, an array of {"context", "title", "artist", "license", "url"}.
 */
const BY_CONTEXT: Record<MusicContext, string[]> = {
  tavern: ['Thatched Villagers', 'Master of the Feast', 'Folk Round', 'Fiddles McGinty', 'Celtic Impulse', 'Dragon and Toast', 'Spazzmatica Polka'],
  town: ['Minstrel Guild', 'Village Consort', 'Suonatore di Liuto', 'Virtutes Instrumenti', 'Mystery Bazaar', 'Lord of the Land', 'Winter Reflections', 'Evening Melodrama', 'Night in Venice'],
  overworld: ['Heroic Age', 'Moorland', 'Skye Cuillin', 'Eternal Hope', 'Ice Flow', 'Dreamer', 'Heart of Nowhere', 'Echoes of Time v2', 'Hidden Past', 'Atlantean Twilight', 'Lightless Dawn'],
  dungeon: ['Ossuary 6 - Air', 'Ossuary 5 - Rest', 'Dark Times', 'The Dread', 'The Descent', 'Oppressive Gloom', 'Gathering Darkness', 'Ghost Story', 'Disquiet', 'Dark Walk', 'Dark Fog', 'Anguish', 'Ancient Rite'],
  combat: ['Five Armies', 'Clash Defiant', 'Crossing the Chasm', 'Volatile Reaction', 'Faster Does It', 'Prelude and Action', 'Impact Moderato', 'Killers', 'Unholy Knight', 'Crusade - Heavy Industry'],
  boss: ['Black Vortex', 'Death and Axes', 'Giant Wyrm', 'Epic Unease', 'The Complex', 'Hall of the Mountain King', 'Danse Macabre'],
};

const oga = (file: string) => `https://opengameart.org/sites/default/files/${file}`;
/**
 * Ambient loops, fetched straight from OpenGameArt (CC0 or CC BY, so downloading is allowed).
 * The licences were read on each file's page on 15 November 2026; the direct links follow
 * OpenGameArt's usual pattern and still have to be checked with scripts/check-ambient-links.mjs.
 * A link that fails is skipped. Gaps (tavern crowd, town bustle, cave drips) are filled by hand in the Innkeeper.
 */
export const AMBIENT_TRACKS: TrackSource[] = [
  { context: 'tavern', layer: 'ambient', title: 'Fire loop', artist: 'qubodup (opengameart.org)', license: 'CC BY 3.0', url: oga('qubodupFireLoop.ogg') },
  { context: 'overworld', layer: 'ambient', title: 'Wind loop', artist: 'AntumDeluge, after InspectorJ (opengameart.org)', license: 'CC BY 3.0', url: oga('wind-01_0.ogg') },
  { context: 'dungeon', layer: 'ambient', title: 'Cathedral in the forest', artist: 'congusbongus (opengameart.org)', license: 'CC0', url: oga('forest_2.ogg') },
];
export const DEFAULT_TRACKS: TrackSource[] = [...MUSIC_CONTEXTS.flatMap((c) => BY_CONTEXT[c].map((t) => incompetech(c, t))), ...AMBIENT_TRACKS];

export function musicEnabled(env: NodeJS.ProcessEnv): boolean {
  return !/^(off|none|false|0|no)$/i.test((env.HEARTHFORGE_MUSIC ?? 'on').trim());
}

const isContext = (x: unknown): x is MusicContext => MUSIC_CONTEXTS.includes(x as MusicContext);
const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'track';

function fileFor(dir: string, t: TrackSource): string {
  let ext = '.mp3';
  try { const e = extname(new URL(t.url).pathname).toLowerCase(); if (AUDIO_TYPES[e]) ext = e; } catch { /* keep .mp3 */ }
  return join(dir, ...(t.layer === 'ambient' ? ['ambient'] : []), t.context, `${slug(t.title)}${ext}`);
}

/** The tracks to fetch: MUSIC_DIR/tracks.json when present and valid, else the built-in list. */
export function trackList(dir: string): TrackSource[] {
  const custom = join(dir, 'tracks.json');
  if (!existsSync(custom)) return DEFAULT_TRACKS;
  try {
    const raw: unknown = JSON.parse(readFileSync(custom, 'utf8'));
    if (!Array.isArray(raw)) throw new Error('expected an array');
    return raw.flatMap((r): TrackSource[] => {
      if (!r || typeof r !== 'object' || !isContext(r.context) || typeof r.title !== 'string' || typeof r.url !== 'string' || !/^https?:\/\//i.test(r.url)) return [];
      return [{ context: r.context, layer: r.layer === 'ambient' ? 'ambient' : 'music', title: r.title.slice(0, 120), artist: String(r.artist ?? '').slice(0, 120), license: String(r.license ?? '').slice(0, 60), url: r.url }];
    });
  } catch (err) {
    console.warn(`[music] Ignoring ${custom}: ${err instanceof Error ? err.message : err}`);
    return DEFAULT_TRACKS;
  }
}

function looksLikeAudio(bytes: Uint8Array, contentType: string): boolean {
  if (/^(audio|video)\/|application\/(ogg|octet-stream)/i.test(contentType)) return true;
  const head = String.fromCharCode(...bytes.subarray(0, 4));
  return head.startsWith('ID3') || head === 'OggS' || head === 'RIFF' || head === 'fLaC' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
}

let fetching = false;
export const musicPending = () => fetching;

/** A refusal the interface can explain. `code` is one of the keys of MUSIC_ERRORS. */
export class MusicError extends Error {
  constructor(readonly code: 'no_key' | 'not_audio' | 'too_big' | 'bad_link' | 'download_failed' | 'unknown_track' | 'bad_request') {
    super(code);
  }
}

// ---------------------------------------------------------------------------- what the owner decided
// Kept in MUSIC_DIR/library.json: which files players hear, which scene a file is assigned to,
// the credits of files that were added by hand, and which built-in tracks were taken off.
interface FileState {
  disabled?: boolean;
  context?: MusicContext;
  title?: string;
  artist?: string;
  license?: string;
  url?: string;
}
interface LibraryState {
  files: Record<string, FileState>;
  /** Freesound sounds already fetched (or removed since), so they are not fetched again. */
  freesound: number[];
  /** Scenes the server already filled from Freesound by itself once. */
  freesoundTried: string[];
  /** Ids of built-in tracks the owner removed, so the server does not fetch them again. */
  removed: string[];
}

const stateFile = (dir: string) => join(dir, 'library.json');
function loadState(dir: string): LibraryState {
  try {
    const raw = JSON.parse(readFileSync(stateFile(dir), 'utf8'));
    return {
      files: raw?.files && typeof raw.files === 'object' && !Array.isArray(raw.files) ? raw.files : {},
      removed: Array.isArray(raw?.removed) ? raw.removed.filter((x: unknown) => typeof x === 'string') : [],
      freesound: Array.isArray(raw?.freesound) ? raw.freesound.filter((x: unknown) => typeof x === 'number') : [],
      freesoundTried: Array.isArray(raw?.freesoundTried) ? raw.freesoundTried.filter((x: unknown) => typeof x === 'string') : [],
    };
  } catch {
    return { files: {}, removed: [], freesound: [], freesoundTried: [] };
  }
}
function saveState(dir: string, state: LibraryState) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${stateFile(dir)}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${stateFile(dir)}.tmp`, stateFile(dir));
}

/** The id of a file: its path below MUSIC_DIR, such as "tavern/folk-round.mp3" or "ambient/town/crowd.ogg". */
const idOf = (dir: string, file: string) => relative(dir, file).split(sep).join('/');
const fileOf = (dir: string, id: string) => join(dir, ...id.split('/'));
function validId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const parts = id.split('/');
  const ok = parts.length === 2 || (parts.length === 3 && parts[0] === 'ambient');
  return ok && parts.every((p) => p && !p.startsWith('.') && !/[\\]/.test(p)) && MUSIC_CONTEXTS.includes(parts[parts.length - 2] as MusicContext) && !!AUDIO_TYPES[extname(id).toLowerCase()];
}

// ---------------------------------------------------------------------------- fetching

/** Fetch one audio file. Throws MusicError('download_failed') when it is not one. */
export async function fetchAudio(url: string, fetchFn: typeof fetch = fetch): Promise<{ bytes: Uint8Array; type: string }> {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(120_000), headers: { 'user-agent': 'hearthforge-music-fetch' } });
    if (!res.ok) throw new Error(`answered ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < 10_000 || bytes.length > MAX_TRACK_BYTES) throw new Error(`unexpected size (${bytes.length} bytes)`);
    const type = res.headers.get('content-type') ?? '';
    if (!looksLikeAudio(bytes, type)) throw new Error('not an audio file');
    return { bytes, type };
  } catch (err) {
    throw Object.assign(new MusicError('download_failed'), { detail: err instanceof Error ? err.message : String(err) });
  }
}

function writeAtomic(file: string, bytes: Uint8Array) {
  mkdirSync(dirname(file), { recursive: true });
  // Write under another name first, so a half-written file is never served.
  writeFileSync(`${file}.part`, bytes);
  renameSync(`${file}.part`, file);
}

/** Fetch every listed track that is not on disk yet, one after another. Never throws. */
export async function ensureMusic(dir: string, env: NodeJS.ProcessEnv, fetchFn: typeof fetch = fetch): Promise<void> {
  if (!musicEnabled(env)) return;
  fetching = true;
  let got = 0;
  const failures: string[] = [];
  try {
    const removed = new Set(loadState(dir).removed);
    for (const t of trackList(dir)) {
      const file = fileFor(dir, t);
      if (existsSync(file) || removed.has(idOf(dir, file))) continue;
      try {
        writeAtomic(file, (await fetchAudio(t.url, fetchFn)).bytes);
        got++;
      } catch (err) {
        rmSync(`${file}.part`, { force: true });
        failures.push(`"${t.title}" (${t.url}): ${(err as { detail?: string }).detail ?? (err instanceof Error ? err.message : err)}`);
      }
    }
    if (got) console.log(`[music] Fetched ${got} track${got === 1 ? '' : 's'} into ${dir}.`);
    if (failures.length) console.warn(`[music] ${failures.length} track${failures.length === 1 ? '' : 's'} could not be fetched and will be tried again on the next start. Scenes without a track stay silent.\n  ${failures.join('\n  ')}`);
  } catch (err) {
    console.warn('[music] Could not prepare the music folder:', err);
  } finally {
    fetching = false;
  }
}

// ---------------------------------------------------------------------------- what is there

interface Found extends MusicItem { file: string }

/** Every file on disk plus every built-in track that is not (yet), with the owner's choices applied. */
function scan(dir: string): Found[] {
  const state = loadState(dir);
  const known = new Map(trackList(dir).map((t) => [fileFor(dir, t), t]));
  const out: Found[] = [];
  const seen = new Set<string>();
  const add = (file: string, layer: MusicLayer, folderContext: MusicContext, ready: boolean) => {
    const id = idOf(dir, file);
    const own = state.files[id] ?? {};
    const credit = known.get(file);
    seen.add(file);
    out.push({
      id, file, layer, ready,
      context: own.context && MUSIC_CONTEXTS.includes(own.context) ? own.context : folderContext,
      title: own.title ?? credit?.title ?? basename(file).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
      artist: own.artist ?? credit?.artist ?? '',
      license: own.license ?? credit?.license ?? '',
      url: own.url ?? credit?.url ?? '',
      src: ready ? `/music/${id.split('/').map(encodeURIComponent).join('/')}` : '',
      enabled: !own.disabled,
      builtIn: !!credit,
    });
  };
  for (const layer of ['music', 'ambient'] as const) {
    for (const context of MUSIC_CONTEXTS) {
      const folder = join(dir, ...(layer === 'ambient' ? ['ambient'] : []), context);
      if (!existsSync(folder)) continue;
      for (const name of readdirSync(folder).sort()) {
        const file = join(folder, name);
        if (AUDIO_TYPES[extname(name).toLowerCase()] && statSync(file).isFile()) add(file, layer, context, true);
      }
    }
  }
  for (const [file, t] of known) if (!seen.has(file)) add(file, t.layer === 'ambient' ? 'ambient' : 'music', t.context, false);
  return out;
}

/** What the players' browsers get: files that are on the server and not switched off. */
export function musicManifest(dir: string, env: NodeJS.ProcessEnv): MusicManifest {
  if (!musicEnabled(env)) return { enabled: false, pending: false, tracks: [] };
  const tracks: MusicTrack[] = [];
  try {
    for (const f of scan(dir)) {
      if (!f.ready || !f.enabled) continue;
      tracks.push({ id: f.id, context: f.context, layer: f.layer, title: f.title, artist: f.artist, license: f.license, src: f.src });
    }
  } catch (err) {
    console.warn('[music] Could not read the music folder:', err);
  }
  return { enabled: true, pending: fetching, tracks };
}

/** What the Innkeeper sees: everything, including switched-off files and built-in tracks that are missing. */
export function musicLibrary(dir: string, env: NodeJS.ProcessEnv): MusicLibrary {
  let items: MusicItem[] = [];
  try {
    items = scan(dir).map(({ file: _file, ...item }) => item);
  } catch (err) {
    console.warn('[music] Could not read the music folder:', err);
  }
  return { enabled: musicEnabled(env), pending: fetching, items };
}

// ---------------------------------------------------------------------------- what the owner does

const MAX_UPLOAD_BYTES = 96 * 1024 * 1024;
const text = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

/** Home of a new file: MUSIC_DIR/<scene>, or MUSIC_DIR/ambient/<scene>. Never overwrites an existing file. */
function freeFile(dir: string, layer: MusicLayer, context: MusicContext, title: string, ext: string): string {
  const folder = join(dir, ...(layer === 'ambient' ? ['ambient'] : []), context);
  const base = slug(title);
  for (let n = 1; ; n++) {
    const file = join(folder, `${base}${n > 1 ? `-${n}` : ''}${ext}`);
    if (!existsSync(file)) return file;
  }
}

function parseTarget(layerIn: unknown, contextIn: unknown): { layer: MusicLayer; context: MusicContext } {
  if (!isContext(contextIn)) throw new MusicError('bad_request');
  return { layer: layerIn === 'ambient' ? 'ambient' : 'music', context: contextIn };
}

/** Hosts a link may not point at: this machine and private networks. The panel is owner-only, so this is a second lock, not the first. */
export function linkAllowed(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !h.includes(':')) return null;
  if (/^(10|127|0)\./.test(h) || /^169\.254\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return null;
  if (h.includes(':') && /^(::1?$|f[cd]|fe80|::ffff)/.test(h)) return null;
  return u;
}

export interface AddedFile { id: string }

/** Take in an uploaded audio file, or a zip of them. Returns what was added. */
export function addUpload(dir: string, fileName: string, data: Uint8Array, layerIn: unknown, contextIn: unknown): AddedFile[] {
  const { layer, context } = parseTarget(layerIn, contextIn);
  if (data.length > MAX_UPLOAD_BYTES) throw new MusicError('too_big');
  const state = loadState(dir);
  const added: AddedFile[] = [];
  const keep = (name: string, bytes: Uint8Array) => {
    const ext = extname(name).toLowerCase();
    if (!AUDIO_TYPES[ext] || bytes.length < 1000 || bytes.length > MAX_TRACK_BYTES) return;
    const title = basename(name).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 120) || 'track';
    const file = freeFile(dir, layer, context, title, ext);
    writeAtomic(file, bytes);
    state.files[idOf(dir, file)] = { title };
    added.push({ id: idOf(dir, file) });
  };
  if (/\.zip$/i.test(fileName)) {
    let files: Record<string, Uint8Array>;
    try {
      let count = 0;
      files = unzipSync(data, { filter: (f) => !/(^|\/)(__MACOSX|\.)/.test(f.name) && !!AUDIO_TYPES[extname(f.name).toLowerCase()] && f.originalSize <= MAX_TRACK_BYTES && ++count <= 300 });
    } catch {
      throw new MusicError('not_audio');
    }
    for (const [name, bytes] of Object.entries(files)) keep(name, bytes);
  } else {
    if (!looksLikeAudio(data, '')) throw new MusicError('not_audio');
    keep(fileName, data);
  }
  if (!added.length) throw new MusicError('not_audio');
  saveState(dir, state);
  return added;
}

export interface MusicAction {
  do?: unknown; id?: unknown; enabled?: unknown; context?: unknown; layer?: unknown;
  url?: unknown; title?: unknown; artist?: unknown; license?: unknown;
}

/** One change from the Innkeeper. Throws MusicError for what the owner can fix. */
export async function musicAction(dir: string, env: NodeJS.ProcessEnv, m: MusicAction, fetchFn: typeof fetch = fetch): Promise<void> {
  const state = loadState(dir);
  const id = m.id;
  const exists = () => validId(id) && (existsSync(fileOf(dir, id as string)) || trackList(dir).some((t) => idOf(dir, fileFor(dir, t)) === id));
  switch (m.do) {
    case 'set': {
      if (!exists()) throw new MusicError('unknown_track');
      const own = state.files[id as string] ?? {};
      if (typeof m.enabled === 'boolean') own.disabled = m.enabled ? undefined : true;
      if (m.context !== undefined) { if (!isContext(m.context)) throw new MusicError('bad_request'); own.context = m.context; }
      state.files[id as string] = own;
      break;
    }
    case 'remove': {
      if (!exists()) throw new MusicError('unknown_track');
      const known = trackList(dir).some((t) => idOf(dir, fileFor(dir, t)) === id);
      rmSync(fileOf(dir, id as string), { force: true });
      delete state.files[id as string];
      // A built-in track would come back on the next start unless it is remembered as removed.
      if (known && !state.removed.includes(id as string)) state.removed.push(id as string);
      break;
    }
    case 'fetch': {
      // The owner pressed "Download": one built-in track, or every one that is missing.
      const wanted = m.id === undefined ? trackList(dir) : trackList(dir).filter((t) => idOf(dir, fileFor(dir, t)) === id);
      if (m.id !== undefined && !wanted.length) throw new MusicError('unknown_track');
      state.removed = state.removed.filter((r) => !wanted.some((t) => idOf(dir, fileFor(dir, t)) === r));
      saveState(dir, state);
      let failed = 0;
      for (const t of wanted) {
        const file = fileFor(dir, t);
        if (existsSync(file)) continue;
        try { writeAtomic(file, (await fetchAudio(t.url, fetchFn)).bytes); } catch { failed++; }
      }
      if (failed && failed === wanted.length) throw new MusicError('download_failed');
      return;
    }
    case 'freesound': {
      // The owner pressed "Get CC0 loops from Freesound".
      await fetchFreesound(dir, env, undefined, fetchFn);
      return;
    }
    case 'add_link': {
      const { layer, context } = parseTarget(m.layer, m.context);
      const link = linkAllowed(String(m.url ?? '').trim());
      if (!link) throw new MusicError('bad_link');
      const { bytes, type } = await fetchAudio(link.href, fetchFn);
      let ext = extname(link.pathname).toLowerCase();
      if (!AUDIO_TYPES[ext]) ext = /ogg/i.test(type) ? '.ogg' : /wav/i.test(type) ? '.wav' : /flac/i.test(type) ? '.flac' : /mp4|m4a/i.test(type) ? '.m4a' : '.mp3';
      const title = text(m.title, 120) || decodeURIComponent(basename(link.pathname)).replace(/\.[^.]+$/, '').replace(/[-_+]+/g, ' ').trim() || 'track';
      const file = freeFile(dir, layer, context, title, ext);
      writeAtomic(file, bytes);
      state.files[idOf(dir, file)] = { title, artist: text(m.artist, 120), license: text(m.license, 60), url: link.href };
      break;
    }
    default:
      throw new MusicError('bad_request');
  }
  saveState(dir, state);
}

// ---------------------------------------------------------------------------- Freesound (owner's API key)

/** What to look for per scene. Only CC0 sounds are taken, so no credit is owed, though one is recorded. */
export const FREESOUND_QUERIES: Partial<Record<MusicContext, string>> = {
  tavern: 'tavern crowd murmur loop',
  town: 'town market crowd ambience loop',
  overworld: 'forest birds wind ambience loop',
  dungeon: 'cave dripping water ambience loop',
};
const FREESOUND_PER_SCENE = 2;

interface FreesoundHit { id: number; name: string; username: string; url: string; previews?: Record<string, string> }

/**
 * Ask Freesound's official API (needs the owner's free API key, FREESOUND_API_KEY) for CC0 loops and
 * download their high-quality previews straight from Freesound. Returns how many files were added.
 * Never fetches a sound twice, also not one the owner removed.
 */
export async function fetchFreesound(dir: string, env: NodeJS.ProcessEnv, scenes: MusicContext[] = Object.keys(FREESOUND_QUERIES) as MusicContext[], fetchFn: typeof fetch = fetch): Promise<number> {
  const key = (env.FREESOUND_API_KEY ?? '').trim();
  if (!key) throw new MusicError('no_key');
  const state = loadState(dir);
  let added = 0;
  let asked = 0;
  const problems: string[] = [];
  for (const scene of scenes) {
    const query = FREESOUND_QUERIES[scene];
    if (!query) continue;
    asked++;
    try {
      const api = new URL('https://freesound.org/apiv2/search/text/');
      api.searchParams.set('query', query);
      api.searchParams.set('filter', 'license:"Creative Commons 0" duration:[15 TO 180]');
      api.searchParams.set('sort', 'downloads_desc');
      api.searchParams.set('fields', 'id,name,username,url,previews');
      api.searchParams.set('page_size', '10');
      const res = await fetchFn(api, { headers: { authorization: `Token ${key}`, 'user-agent': 'hearthforge-music-fetch' }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`Freesound answered ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
      const hits: FreesoundHit[] = ((await res.json()) as { results?: FreesoundHit[] }).results ?? [];
      let taken = 0;
      for (const h of hits) {
        if (taken >= FREESOUND_PER_SCENE) break;
        const src = h.previews?.['preview-hq-mp3'];
        if (!src || state.freesound.includes(h.id) || !src.startsWith('https://')) continue;
        try {
          const { bytes } = await fetchAudio(src, fetchFn);
          const title = text(h.name.replace(/\.[^.]+$/, ''), 120) || `Freesound ${h.id}`;
          const file = freeFile(dir, 'ambient', scene, title, '.mp3');
          writeAtomic(file, bytes);
          state.files[idOf(dir, file)] = { title, artist: `${text(h.username, 60)} (freesound.org)`, license: 'CC0', url: text(h.url, 300) };
          state.freesound.push(h.id);
          saveState(dir, state);
          taken++;
          added++;
        } catch (err) {
          const why = `sound ${h.id}: ${(err as { detail?: string }).detail ?? (err instanceof Error ? err.message : err)}`;
          problems.push(why);
          console.warn(`[music] Freesound ${why}`);
        }
      }
    } catch (err) {
      const why = `search for ${scene} failed: ${err instanceof Error ? err.message : err}`;
      problems.push(why);
      console.warn(`[music] Freesound ${why}`);
    }
  }
  if (asked && !added) throw Object.assign(new MusicError('download_failed'), { detail: `Freesound gave no new sound (${problems.join('; ') || 'no usable results'})` });
  return added;
}

/** On start, with a key: fill each scene that has no ambient loop yet, once. Never throws. */
export async function ensureFreesound(dir: string, env: NodeJS.ProcessEnv, fetchFn: typeof fetch = fetch): Promise<void> {
  if (!musicEnabled(env) || !(env.FREESOUND_API_KEY ?? '').trim()) return;
  try {
    const state = loadState(dir);
    const empty = (Object.keys(FREESOUND_QUERIES) as MusicContext[]).filter((c) => {
      if (state.freesoundTried.includes(c)) return false;
      const folder = join(dir, 'ambient', c);
      return !existsSync(folder) || !readdirSync(folder).some((n) => AUDIO_TYPES[extname(n).toLowerCase()]);
    });
    if (!empty.length) return;
    state.freesoundTried.push(...empty);
    saveState(dir, state);
    fetching = true;
    const n = await fetchFreesound(dir, env, empty, fetchFn);
    console.log(`[music] Fetched ${n} CC0 ambient loop${n === 1 ? '' : 's'} from Freesound.`);
  } catch (err) {
    console.warn('[music] Freesound fetch skipped:', (err as { detail?: string }).detail ?? (err instanceof Error ? err.message : err));
  } finally {
    fetching = false;
  }
}

/** The byte range to send for a Range header, or null when the header is absent or unusable. */
export function byteRange(header: string | undefined, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (!m || (!m[1] && !m[2]) || size <= 0) return null;
  let start: number, end: number;
  if (!m[1]) { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
  return start <= end && start < size ? { start, end } : null;
}
