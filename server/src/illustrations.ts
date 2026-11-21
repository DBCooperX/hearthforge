// Story illustrations on the server: what the Innkeeper set up, which pictures were painted, and the painting itself.
// Pictures live in the data folder (pictures/<id>.<ext>) with an index beside them, and are served to the browsers
// of the table by an id nobody can guess. See shared/illustrations.ts.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_PICTURE_CONFIG, PICTURE_KEYS, PICTURE_MOMENTS, PICTURE_PROVIDERS, PICTURE_STYLES, STYLE_PROMPTS, pictureRefs, pictureUsd,
  type PictureConfig, type PictureGate, type PictureInfo, type PictureLibrary, type PictureMoment, type PictureProvider,
} from '../../shared/illustrations';
import { readJson, writePrivate } from './admin/config';
import { PAINTERS, PictureFailure, type PaintRequest } from './pictureServices';
import { picturePrompt, type PictureAsk } from './game/pictures';

export class PictureError extends Error {
  constructor(readonly code: 'bad_request' | 'no_key' | 'refused' | 'failed' | 'busy' | 'not_found') { super(code); }
}

interface Stored extends Omit<PictureInfo, 'url'> { file: string; mime: string }

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_INDEX = 5000;
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const monthOf = (ms: number) => new Date(ms).toISOString().slice(0, 7);
const ID = /^[a-f0-9]{18}$/;

/** A test picture, to try a style. */
const SAMPLE: PictureAsk = {
  moment: 'boss',
  picture: 'In a torchlit crypt, a towering skeletal knight in rusted armour rises from an open sarcophagus, green fire in its eyes, while two heroes raise sword and lantern against it.',
  cast: [
    'Brann: a dwarf man, fighter, tan skin, red short hair, a long braided beard, clothes and trim in red. Broad-shouldered, dented steel breastplate.',
    'Mira: a human woman, cleric, fair skin, auburn braid, clothes and trim in white. Holds up a brass lantern and a holy symbol.',
  ],
};

export interface PaintJob {
  table: string;
  tableTitle: string;
  entry: number;
  ask: PictureAsk;
  where?: string;
  time?: string;
}

export class Illustrator {
  private config: PictureConfig;
  private index: Stored[];
  private readonly configFile: string;
  private readonly indexFile: string;
  /** Tables with a picture being painted right now. */
  private busy = new Set<string>();
  private lastError = '';

  constructor(private dir: string, private keyOf: (name: string) => string, private fetchFn: typeof fetch = fetch, private now: () => number = Date.now) {
    mkdirSync(dir, { recursive: true });
    this.configFile = join(dir, 'config.json');
    this.indexFile = join(dir, 'index.json');
    this.config = cleanConfig(readJson<Partial<PictureConfig>>(this.configFile, {}), DEFAULT_PICTURE_CONFIG);
    const saved = readJson<Stored[]>(this.indexFile, []);
    this.index = Array.isArray(saved) ? saved.filter((p) => p && ID.test(p.id) && typeof p.file === 'string') : [];
  }

  private key(p: PictureProvider) { return this.keyOf(PICTURE_KEYS[p]).trim(); }
  private get model() { return this.config.models[this.config.provider]; }

  get enabled() { return this.config.on && !!this.key(this.config.provider); }

  /** Dollars and pictures since the start of the month, or of the day. */
  private spent(since: (ms: number) => string) {
    const now = since(this.now());
    const list = this.index.filter((p) => since(p.at) === now);
    return { count: list.length, usd: Math.round(list.reduce((n, p) => n + p.usd, 0) * 1000) / 1000 };
  }

  /** Why no picture may be painted at this table now, or null. Credits are checked by whoever bills. */
  gate(table: string, moment: PictureMoment): PictureGate | null {
    const c = this.config;
    if (!c.on) return 'off';
    if (!this.key(c.provider)) return 'no_key';
    if (!c.moments[moment]) return 'moment';
    if (this.busy.has(table)) return 'busy';
    const mine = this.index.filter((p) => p.table === table && p.moment !== 'sample');
    const today = dayOf(this.now());
    if (mine.filter((p) => dayOf(p.at) === today).length >= c.perTableDay) return 'day';
    const last = mine.reduce((n, p) => Math.max(n, p.at), 0);
    if (last && this.now() - last < c.gapMinutes * 60_000) return 'gap';
    if (c.monthUsd > 0 && this.spent(monthOf).usd + pictureUsd(c, c.provider, this.model) > c.monthUsd) return 'month';
    return null;
  }

  /** The style sentence for the prompt. */
  private styleText(): string {
    const c = this.config;
    return c.style === 'custom' && c.customStyle.trim() ? c.customStyle.trim() : STYLE_PROMPTS[c.style === 'custom' ? 'ink' : c.style];
  }

  /** The newest pictures of this table, to keep its people looking the same. */
  private refsFor(table: string, max: number): PaintRequest['refs'] {
    if (max <= 0) return [];
    const out: PaintRequest['refs'] = [];
    for (const p of [...this.index].reverse()) {
      if (p.table !== table) continue;
      const file = join(this.dir, p.file);
      try { out.push({ mime: p.mime, data: readFileSync(file) }); } catch { continue; }
      if (out.length >= max) break;
    }
    return out;
  }

  /** Paint a picture and keep it. Resolves to the picture; `bill` is told what it cost, once it exists. */
  async paint(job: PaintJob, bill: (usd: number) => void): Promise<PictureInfo> {
    const c = this.config;
    const provider = c.provider, model = this.model, key = this.key(provider);
    if (!key) throw new PictureError('no_key');
    if (this.busy.has(job.table)) throw new PictureError('busy');
    this.busy.add(job.table);
    try {
      const refs = this.refsFor(job.table, pictureRefs(provider, model));
      const prompt = picturePrompt(this.styleText(), job.ask, { where: job.where, time: job.time, refs: refs.length });
      const started = this.now();
      let painted;
      try {
        painted = await PAINTERS[provider](this.fetchFn, model, key, { prompt, refs });
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
        console.warn(`[pictures] ${provider} ${model}: ${this.lastError}`);
        if (err instanceof PictureFailure) throw new PictureError(err.code);
        throw new PictureError('failed');
      }
      const id = randomBytes(9).toString('hex');
      const file = `${id}.${EXT[painted.mime] ?? 'png'}`;
      writeFileSync(join(this.dir, file), painted.data);
      const usd = pictureUsd(c, provider, model);
      const stored: Stored = {
        id, table: job.table, tableTitle: job.tableTitle, entry: job.entry, moment: job.table === 'sample' ? 'sample' : job.ask.moment,
        caption: job.ask.picture, provider, model, usd, at: this.now(), file, mime: EXT[painted.mime] ? painted.mime : 'image/png',
      };
      this.index.push(stored);
      if (this.index.length > MAX_INDEX) this.index.splice(0, this.index.length - MAX_INDEX);
      this.save();
      this.lastError = '';
      console.log(`[pictures] painted ${id} for ${job.table} (${stored.moment}) with ${provider} ${model} in ${Math.round((this.now() - started) / 1000)} s`);
      bill(usd);
      return view(stored);
    } finally {
      this.busy.delete(job.table);
    }
  }

  /** A test picture in the current style, for the Innkeeper. */
  sample(bill: (usd: number) => void): Promise<PictureInfo> {
    return this.paint({ table: 'sample', tableTitle: '', entry: 0, ask: SAMPLE, where: 'A crypt under an old chapel', time: 'night' }, bill);
  }

  /** The file of a picture, for serving it. */
  file(id: string): { path: string; mime: string } | null {
    const p = ID.test(id) ? this.index.find((x) => x.id === id) : null;
    if (!p) return null;
    const path = join(this.dir, p.file);
    return existsSync(path) ? { path, mime: p.mime } : null;
  }

  library(): PictureLibrary {
    let bytes = 0;
    for (const p of this.index) { try { bytes += statSync(join(this.dir, p.file)).size; } catch { /* gone */ } }
    return {
      config: structuredClone(this.config),
      keys: Object.fromEntries(PICTURE_PROVIDERS.map((p) => [p, !!this.key(p)])) as PictureLibrary['keys'],
      month: this.spent(monthOf),
      today: this.spent(dayOf),
      recent: this.index.slice(-24).reverse().map(view),
      diskMb: Math.round((bytes / 1024 / 1024) * 10) / 10,
      error: this.lastError,
    };
  }

  /** Change the setup, or remove a picture. Pictures of a table are removed when the Innkeeper says so. */
  action(raw: Record<string, unknown>): { removed?: { table: string; entry: number } } {
    if (raw.do === 'config') {
      this.config = cleanConfig((raw.config ?? {}) as Partial<PictureConfig>, this.config);
      writePrivate(this.configFile, JSON.stringify(this.config, null, 2));
      return {};
    }
    if (raw.do === 'delete') {
      const at = this.index.findIndex((p) => p.id === raw.id);
      if (at < 0) throw new PictureError('not_found');
      const [p] = this.index.splice(at, 1);
      rmSync(join(this.dir, p.file), { force: true });
      this.save();
      return { removed: { table: p.table, entry: p.entry } };
    }
    throw new PictureError('bad_request');
  }

  private save() {
    try { writeFileSync(this.indexFile, JSON.stringify(this.index)); } catch (err) { console.error('[pictures] the index could not be saved:', err); }
  }
}

function view(p: Stored): PictureInfo {
  const { file: _file, mime: _mime, ...rest } = p;
  return { ...rest, url: `/pictures/${p.id}` };
}

const bound = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return v === undefined || v === null || v === '' || !Number.isFinite(n) ? fallback : Math.max(min, Math.min(max, Math.round(n * 100) / 100));
};

/** The setup with every value checked; anything missing or wrong keeps what `base` had. */
export function cleanConfig(raw: Partial<PictureConfig>, base: PictureConfig): PictureConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const models = { ...base.models };
  for (const p of PICTURE_PROVIDERS) {
    const m = String(r.models?.[p] ?? '').trim();
    if (m && /^[a-z0-9][a-z0-9./:_-]{0,120}$/i.test(m)) models[p] = m;
  }
  const moments = { ...base.moments };
  for (const m of PICTURE_MOMENTS) if (typeof r.moments?.[m] === 'boolean') moments[m] = r.moments[m];
  const usd: PictureConfig['usd'] = { ...base.usd };
  if (r.usd && typeof r.usd === 'object') {
    for (const [k, v] of Object.entries(r.usd as Record<string, unknown>)) {
      if (!/^[a-z]+:[a-z0-9./:_-]{1,120}$/i.test(k)) continue;
      if (v === null || v === '') delete usd[k];
      else if (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 5) usd[k] = Number(v);
    }
  }
  return {
    on: typeof r.on === 'boolean' ? r.on : base.on,
    provider: PICTURE_PROVIDERS.includes(r.provider) ? r.provider : base.provider,
    models,
    style: PICTURE_STYLES.includes(r.style) ? r.style : base.style,
    customStyle: typeof r.customStyle === 'string' ? r.customStyle.replace(/\s+/g, ' ').trim().slice(0, 600) : base.customStyle,
    moments,
    perTableDay: bound(r.perTableDay, 0, 50, base.perTableDay),
    gapMinutes: bound(r.gapMinutes, 0, 600, base.gapMinutes),
    monthUsd: bound(r.monthUsd, 0, 1000, base.monthUsd),
    usd,
  };
}
