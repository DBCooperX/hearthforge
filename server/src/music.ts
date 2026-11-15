// Background music. Nothing is bundled: on start the server fetches a small set of openly
// licensed tracks into MUSIC_DIR (one folder per context) and tells the client what it has.
// A track that cannot be fetched is skipped, and with no tracks at all the game is silent.
// Audio files the owner copies into a context folder are played too.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { MUSIC_CONTEXTS, type MusicContext, type MusicManifest, type MusicTrack } from '../../shared/music';

export interface TrackSource {
  context: MusicContext;
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
  context, title, artist: MACLEOD, license: CC_BY,
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
export const DEFAULT_TRACKS: TrackSource[] = MUSIC_CONTEXTS.flatMap((c) => BY_CONTEXT[c].map((t) => incompetech(c, t)));

export function musicEnabled(env: NodeJS.ProcessEnv): boolean {
  return !/^(off|none|false|0|no)$/i.test((env.HEARTHFORGE_MUSIC ?? 'on').trim());
}

const isContext = (x: unknown): x is MusicContext => MUSIC_CONTEXTS.includes(x as MusicContext);
const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'track';

function fileFor(dir: string, t: TrackSource): string {
  let ext = '.mp3';
  try { const e = extname(new URL(t.url).pathname).toLowerCase(); if (AUDIO_TYPES[e]) ext = e; } catch { /* keep .mp3 */ }
  return join(dir, t.context, `${slug(t.title)}${ext}`);
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
      return [{ context: r.context, title: r.title.slice(0, 120), artist: String(r.artist ?? '').slice(0, 120), license: String(r.license ?? '').slice(0, 60), url: r.url }];
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

/** Fetch every listed track that is not on disk yet, one after another. Never throws. */
export async function ensureMusic(dir: string, env: NodeJS.ProcessEnv, fetchFn: typeof fetch = fetch): Promise<void> {
  if (!musicEnabled(env)) return;
  fetching = true;
  let got = 0;
  const failures: string[] = [];
  try {
    for (const t of trackList(dir)) {
      const file = fileFor(dir, t);
      if (existsSync(file)) continue;
      try {
        const res = await fetchFn(t.url, { signal: AbortSignal.timeout(120_000), headers: { 'user-agent': 'hearthforge-music-fetch' } });
        if (!res.ok) throw new Error(`answered ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length < 10_000 || bytes.length > MAX_TRACK_BYTES) throw new Error(`unexpected size (${bytes.length} bytes)`);
        if (!looksLikeAudio(bytes, res.headers.get('content-type') ?? '')) throw new Error('not an audio file');
        mkdirSync(join(dir, t.context), { recursive: true });
        // Write under another name first, so a half-written file is never served.
        writeFileSync(`${file}.part`, bytes);
        renameSync(`${file}.part`, file);
        got++;
      } catch (err) {
        rmSync(`${file}.part`, { force: true });
        failures.push(`"${t.title}" (${t.url}): ${err instanceof Error ? err.message : err}`);
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

/** Every playable file in MUSIC_DIR, with credits for the ones that came from the track list. */
export function musicManifest(dir: string, env: NodeJS.ProcessEnv): MusicManifest {
  if (!musicEnabled(env)) return { enabled: false, pending: false, tracks: [] };
  const tracks: MusicTrack[] = [];
  try {
    const known = new Map(trackList(dir).map((t) => [fileFor(dir, t), t]));
    for (const context of MUSIC_CONTEXTS) {
      const folder = join(dir, context);
      if (!existsSync(folder)) continue;
      for (const name of readdirSync(folder).sort()) {
        const file = join(folder, name);
        if (!AUDIO_TYPES[extname(name).toLowerCase()] || !statSync(file).isFile()) continue;
        const credit = known.get(file);
        tracks.push({
          id: `${context}/${name}`,
          context,
          title: credit?.title ?? name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
          artist: credit?.artist ?? '',
          license: credit?.license ?? '',
          src: `/music/${context}/${encodeURIComponent(name)}`,
        });
      }
    }
  } catch (err) {
    console.warn('[music] Could not read the music folder:', err);
  }
  return { enabled: true, pending: fetching, tracks };
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
