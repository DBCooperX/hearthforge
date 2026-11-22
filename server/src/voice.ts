// The narrator on the server: turns the Dungeon Master's story into speech and keeps it on disk.
// Piper runs here, as a program in the image; its voices are downloaded from Piper's own collection
// the first time they are needed, never mirrored. ElevenLabs is asked over its API.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebStream } from 'node:stream/web';
import { isLang, type Lang } from '../../shared/i18n';
import {
  DEFAULT_VOICE, ELEVENLABS_MODELS, VOICE_QUALITIES, type VoiceQuality, PIPER_BASE, PIPER_VOICES, VOICE_PROVIDERS,
  piperCard, piperPath, speakable, type VoiceChoice, type VoiceLibrary, type VoiceManifest, type VoiceProvider,
} from '../../shared/voice';

export class VoiceError extends Error {
  constructor(readonly code: 'failed' | 'no_key' | 'not_installed' | 'no_piper' | 'bad_request') { super(code); }
}

/** Speech kept on disk before the oldest files are deleted. */
const CACHE_MAX_BYTES = 400 * 1024 * 1024;
const MAX_TEXT = 1200;

/** How the hosted voices are told to read. */

export interface Audio { file: string; type: string }

/** Runs Piper: text on stdin, a WAV file out. Replaceable in tests. */
export type PiperRun = (bin: string, args: string[], text: string) => Promise<void>;

const runPiper: PiperRun = (bin, args, text) => new Promise((done, fail) => {
  const child = spawn(bin, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', (c: Buffer) => { err = (err + c.toString()).slice(-2000); });
  child.on('error', fail);
  child.on('close', (code) => (code === 0 ? done() : fail(new Error(`piper exited with ${code}: ${err.trim().split('\n').pop() ?? ''}`))));
  // Piper reads one line per utterance and writes each to the same file, so the text goes in as one line.
  child.stdin.end(`${text.replace(/\s+/g, ' ')}\n`);
});

export function narratorEnabled(env: NodeJS.ProcessEnv): boolean {
  return !/^(off|none|false|0|no)$/i.test((env.HEARTHFORGE_NARRATOR ?? 'on').trim());
}

export class Narrator {
  private choice: VoiceChoice;
  private readonly file: string;
  private readonly voices: string;
  private readonly cache: string;
  private readonly bin: string;
  private downloading = new Set<string>();
  private inflight = new Map<string, Promise<Audio>>();
  private elevenVoices: { id: string; name: string }[] = [];
  private lastError = '';
  /** Piper is run one at a time: two at once on a small server only makes both slow. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Called when what browsers should know changed: a voice arrived, or the Innkeeper chose another. */
  onChange: () => void = () => {};

  constructor(private dir: string, private env: NodeJS.ProcessEnv, private fetchFn: typeof fetch = fetch, private piper: PiperRun = runPiper) {
    this.file = join(dir, 'voice.json');
    this.voices = join(dir, 'piper');
    this.cache = join(dir, 'cache');
    this.bin = env.HEARTHFORGE_PIPER ?? '/opt/piper/piper';
    this.choice = this.load();
  }

  private load(): VoiceChoice {
    try {
      const raw = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : {};
      return cleanChoice(raw);
    } catch {
      return cleanChoice({});
    }
  }

  get enabled() { return narratorEnabled(this.env); }
  /** Set when the Piper program is there but does not start, for example on a processor it was not built for. */
  private piperBroken = false;
  get piperReady() { return !this.piperBroken && existsSync(this.bin); }
  private key() { return this.env.ELEVENLABS_API_KEY?.trim() ?? ''; }
  private installed(id: string) { return existsSync(join(this.voices, `${id}.onnx`)) && existsSync(join(this.voices, `${id}.onnx.json`)); }

  /** The languages the chosen narrator can read right now. */
  langs(): Lang[] {
    if (!this.enabled) return [];
    const p = this.choice.provider;
    if (p === 'off') return [];
    if (p === 'piper') return this.piperReady ? (['en', 'de'] as Lang[]).filter((l) => this.installed(this.choice.piper[l])) : [];
    return this.key() ? ['en', 'de'] : [];
  }

  manifest(): VoiceManifest {
    const langs = this.langs();
    return { enabled: langs.length > 0, provider: this.choice.provider, langs };
  }

  library(): VoiceLibrary {
    return {
      choice: this.choice,
      piperReady: this.piperReady,
      piper: PIPER_VOICES.map((v) => ({ ...v, installed: this.installed(v.id), downloading: this.downloading.has(v.id), card: piperCard(v.id) })),
      keys: { elevenlabs: !!this.key() },
      elevenlabsVoices: this.elevenVoices,
      cacheMb: Math.round(this.cacheBytes() / 1024 / 1024),
      error: this.lastError,
    };
  }

  /** On start: fetch the Piper voices that are chosen but missing, and the ElevenLabs voice list. */
  async start(): Promise<void> {
    if (!this.enabled) return;
    if (existsSync(this.bin)) {
      const ok = await new Promise<string>((done) => {
        const child = spawn(this.bin, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        child.stdout.on('data', (c: Buffer) => { out += c.toString(); });
        child.stderr.on('data', (c: Buffer) => { out += c.toString(); });
        child.on('error', (err) => done(err.message));
        child.on('close', (code) => done(code === 0 ? '' : out.trim().split('\n').pop() || `exit ${code}`));
      });
      if (ok) { this.piperBroken = true; this.lastError = `Piper does not start: ${ok}`; console.warn(`[voice] ${this.lastError}`); }
    }
    if (this.key()) await this.loadElevenVoices().catch(() => {});
    if (this.choice.provider !== 'piper' || !this.piperReady) return;
    for (const lang of ['en', 'de'] as Lang[]) await this.download(this.choice.piper[lang]).catch((err) => console.warn(`[voice] ${err instanceof Error ? err.message : err}`));
  }

  async loadElevenVoices(): Promise<void> {
    const res = await this.fetchFn('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': this.key() }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`ElevenLabs voices: HTTP ${res.status}`);
    const body = await res.json() as { voices?: { voice_id?: string; name?: string }[] };
    this.elevenVoices = (body.voices ?? []).filter((v) => v.voice_id && v.name).map((v) => ({ id: String(v.voice_id), name: String(v.name).slice(0, 80) })).slice(0, 200);
  }

  /** Download a Piper voice from its source, unless it is already here. */
  async download(id: string): Promise<void> {
    if (!PIPER_VOICES.some((v) => v.id === id)) throw new VoiceError('bad_request');
    if (this.installed(id) || this.downloading.has(id)) return;
    this.downloading.add(id);
    try {
      mkdirSync(this.voices, { recursive: true });
      for (const ext of ['.onnx.json', '.onnx']) {
        const target = join(this.voices, `${id}${ext}`);
        if (existsSync(target)) continue;
        const res = await this.fetchFn(`${PIPER_BASE}/${piperPath(id)}${ext}?download=true`, { signal: AbortSignal.timeout(15 * 60_000) });
        if (!res.ok || !res.body) throw new Error(`Piper voice ${id}${ext}: HTTP ${res.status}`);
        const tmp = `${target}.part`;
        await pipeline(Readable.fromWeb(res.body as unknown as WebStream), createWriteStream(tmp));
        renameSync(tmp, target);
      }
      console.log(`[voice] Piper voice ${id} is ready`);
      this.onChange();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      this.downloading.delete(id);
    }
  }

  /** The Innkeeper changes the narrator. Takes effect at once, for every table. */
  async action(m: Record<string, unknown>): Promise<void> {
    if (m.do === 'choose') {
      const next = cleanChoice({ ...this.choice, ...(typeof m.choice === 'object' && m.choice ? m.choice : {}), piper: { ...this.choice.piper, ...((m.choice as { piper?: object })?.piper ?? {}) } });
      if (next.provider === 'elevenlabs' && !this.key()) throw new VoiceError('no_key');
      this.choice = next;
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(this.file, JSON.stringify(next, null, 2));
      this.lastError = '';
      // A newly chosen Piper voice is fetched in the background; the Innkeeper sees it arrive.
      if (next.provider === 'piper' && this.piperReady) for (const lang of ['en', 'de'] as Lang[]) void this.download(next.piper[lang]).catch(() => {});
      this.onChange();
      return;
    }
    if (m.do === 'download') {
      if (!this.piperReady) throw new VoiceError('no_piper');
      void this.download(String(m.voice ?? '')).catch(() => {});
      return;
    }
    if (m.do === 'remove') {
      const id = String(m.voice ?? '');
      if (!PIPER_VOICES.some((v) => v.id === id)) throw new VoiceError('bad_request');
      for (const ext of ['.onnx', '.onnx.json']) rmSync(join(this.voices, `${id}${ext}`), { force: true });
      this.onChange();
      return;
    }
    if (m.do === 'refresh') { await this.loadElevenVoices().catch((err) => { this.lastError = err instanceof Error ? err.message : String(err); }); return; }
    if (m.do === 'clear') { rmSync(this.cache, { recursive: true, force: true }); return; }
    throw new VoiceError('bad_request');
  }

  /**
   * Speech for a piece of story, from the cache or freshly made. `paid` hears when the paid voice
   * (ElevenLabs) had to read it: speech from the cache, and Piper, cost nothing.
   */
  async speak(raw: string, lang: Lang, override?: Partial<VoiceChoice>, paid?: (chars: number, quality: VoiceQuality) => void): Promise<Audio> {
    if (!this.enabled) throw new VoiceError('bad_request');
    const choice = override ? cleanChoice({ ...this.choice, ...override }) : this.choice;
    const text = speakable(raw).slice(0, MAX_TEXT);
    if (!text) throw new VoiceError('bad_request');
    const { provider } = choice;
    if (provider === 'off') throw new VoiceError('bad_request');
    const voice = provider === 'piper' ? choice.piper[lang] : choice.elevenlabs;
    const ext = provider === 'piper' ? 'wav' : 'mp3';
    const hash = createHash('sha256').update(`${provider}\n${voice}\n${provider === 'elevenlabs' ? choice.quality : ''}\n${choice.speed}\n${lang}\n${text}`).digest('hex').slice(0, 40);
    const file = join(this.cache, `${hash}.${ext}`);
    const type = ext === 'wav' ? 'audio/wav' : 'audio/mpeg';
    if (existsSync(file)) {
      try { const now = new Date(); utimesSync(file, now, now); } catch { /* only used to keep recent speech longer */ }
      return { file, type };
    }
    const running = this.inflight.get(hash);
    if (running) return running;
    const job = (async () => {
      mkdirSync(this.cache, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      try {
        if (provider === 'piper') await this.viaPiper(voice, choice.speed, text, tmp);
        else await this.viaElevenLabs(voice, choice.speed, choice.quality, text, tmp);
        renameSync(tmp, file);
        // Booking the cost must never lose speech that is already made and paid for.
        if (provider !== 'piper') try { paid?.(text.length, choice.quality); } catch (err) { console.warn('[voice] cost not booked:', err); }
      } catch (err) {
        rmSync(tmp, { force: true });
        this.lastError = err instanceof Error ? err.message : String(err);
        throw err;
      }
      this.prune();
      return { file, type };
    })();
    this.inflight.set(hash, job);
    try { return await job; } finally { this.inflight.delete(hash); }
  }

  private async viaPiper(voice: string, speed: number, text: string, out: string) {
    if (!this.piperReady) throw new VoiceError('no_piper');
    if (!this.installed(voice)) {
      void this.download(voice).catch(() => {});
      throw new VoiceError('not_installed');
    }
    // Piper's length scale is the inverse of speed: 1.1 reads a little slower than the voice's own pace.
    const args = ['--model', join(this.voices, `${voice}.onnx`), '--output_file', out, '--length_scale', (1.08 / speed).toFixed(2), '--sentence_silence', '0.35'];
    const run = this.queue.then(() => this.piper(this.bin, args, text));
    this.queue = run.catch(() => {});
    await run;
    if (!existsSync(out) || statSync(out).size < 100) throw new Error('piper wrote no audio');
  }

  private async viaElevenLabs(voice: string, speed: number, quality: VoiceQuality, text: string, out: string) {
    const key = this.key();
    if (!key) throw new VoiceError('no_key');
    const res = await this.fetchFn(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: ELEVENLABS_MODELS[quality], voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, speed: Math.min(1.2, Math.max(0.7, speed)) } }),
      signal: AbortSignal.timeout(60_000),
    });
    await save(res, out, 'ElevenLabs');
  }

  private cacheBytes(): number {
    try { return readdirSync(this.cache).reduce((n, f) => n + statSync(join(this.cache, f)).size, 0); } catch { return 0; }
  }

  /** Keep the cache under its limit, oldest first. */
  private prune() {
    try {
      const files = readdirSync(this.cache).map((f) => { const p = join(this.cache, f); const s = statSync(p); return { p, size: s.size, at: s.mtimeMs }; });
      let total = files.reduce((n, f) => n + f.size, 0);
      for (const f of files.sort((a, b) => a.at - b.at)) {
        if (total <= CACHE_MAX_BYTES) break;
        rmSync(f.p, { force: true });
        total -= f.size;
      }
    } catch { /* a full cache only costs disk */ }
  }
}

async function save(res: Response, out: string, who: string) {
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`${who} speech: HTTP ${res.status} ${detail}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 100) throw new Error(`${who} speech: no audio`);
  writeFileSync(out, bytes);
}

/** A voice choice with everything unknown replaced by the default. */
export function cleanChoice(raw: unknown): VoiceChoice {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const piperIn = (r.piper && typeof r.piper === 'object' ? r.piper : {}) as Record<string, unknown>;
  const piperFor = (lang: Lang) => {
    const id = String(piperIn[lang] ?? '');
    return PIPER_VOICES.some((v) => v.id === id && v.lang === lang) ? id : DEFAULT_VOICE.piper[lang];
  };
  const provider = VOICE_PROVIDERS.includes(r.provider as VoiceProvider) ? (r.provider as VoiceProvider) : DEFAULT_VOICE.provider;
  const quality = VOICE_QUALITIES.includes(r.quality as VoiceQuality) ? (r.quality as VoiceQuality) : DEFAULT_VOICE.quality;
  const eleven = typeof r.elevenlabs === 'string' && /^[A-Za-z0-9]{8,40}$/.test(r.elevenlabs) ? r.elevenlabs : DEFAULT_VOICE.elevenlabs;
  const speed = Number(r.speed);
  return {
    provider,
    piper: { en: piperFor('en'), de: piperFor('de') },
    elevenlabs: eleven,
    quality,
    speed: Number.isFinite(speed) ? Math.round(Math.min(1.3, Math.max(0.7, speed)) * 100) / 100 : DEFAULT_VOICE.speed,
  };
}

export const langOf = (raw: unknown): Lang => (isLang(raw) ? raw : 'en');
