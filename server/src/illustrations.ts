// Story illustrations on the server: what the Innkeeper set up, which pictures were painted, and the painting itself.
// Pictures live in the data folder (pictures/<id>.<ext>) with an index beside them, and are served to the browsers
// of the table by an id nobody can guess. See shared/illustrations.ts.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_PICTURE_CONFIG, PICTURE_KEYS, PORTRAIT_STYLE, PICTURE_MOMENTS, PICTURE_PROVIDERS, PICTURE_STYLES, STYLE_PROMPTS, pictureRefs, pictureUsd,
  type FigureKey, type PictureConfig, type PictureGate, type PictureInfo, type PictureLibrary, type PictureMoment, type PictureProvider,
} from '../../shared/illustrations';
import { readJson, writePrivate } from './admin/config';
import { PAINTERS, PictureFailure, type PaintRequest } from './pictureServices';
import { monsterFigurePrompt, picturePrompt, portraitKey, portraitPrompt, type PictureAsk } from './game/pictures';
import { baseLook } from '../../shared/monsterLook';
import type { Character } from '../../shared/types';

export class PictureError extends Error {
  constructor(readonly code: 'bad_request' | 'no_key' | 'refused' | 'failed' | 'busy' | 'not_found') { super(code); }
}

interface Stored extends Omit<PictureInfo, 'url'> { file: string; mime: string; /** The account a portrait was made for. */ account?: string }

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
  /** Portraits that failed in this run, by hero and look, so a refusal is not paid for again and again. */
  private failedPortraits = new Set<string>();
  private lastError = '';
  /** The newest painted figure of each subject. */
  private figures = new Map<string, string>();
  /** Figures that failed in this run, so a refusal is not paid for again and again. */
  private failedFigures = new Set<string>();

  constructor(private dir: string, private keyOf: (name: string) => string, private fetchFn: typeof fetch = fetch, private now: () => number = Date.now) {
    mkdirSync(dir, { recursive: true });
    this.configFile = join(dir, 'config.json');
    this.indexFile = join(dir, 'index.json');
    this.config = cleanConfig(readJson<Partial<PictureConfig>>(this.configFile, {}), DEFAULT_PICTURE_CONFIG);
    const saved = readJson<Stored[]>(this.indexFile, []);
    this.index = Array.isArray(saved) ? saved.filter((p) => p && ID.test(p.id) && typeof p.file === 'string') : [];
    this.indexFigures();
  }

  private indexFigures() {
    this.figures.clear();
    for (const p of this.index) if (p.moment === 'figure' && p.subject) this.figures.set(p.subject, p.id);
  }

  /** The painted battle figure of a subject, while figures are on. Off, everyone sees the drawn ones again at once. */
  figure(subject: string): string | null {
    return this.config.on && this.config.figures ? this.figures.get(subject) ?? null : null;
  }

  /** Why no figure may be painted for this subject now, or null. Credits are checked by whoever bills. */
  figureGate(subject: string): PictureGate | 'figures' | 'done' | null {
    const cfg = this.config;
    if (!cfg.on) return 'off';
    if (!cfg.figures) return 'figures';
    if (!this.key(cfg.provider)) return 'no_key';
    if (this.figures.has(subject)) return 'done';
    if (this.busy.has(`figure:${subject}`) || this.failedFigures.has(subject)) return 'busy';
    const today = dayOf(this.now());
    if (this.index.filter((p) => p.moment === 'figure' && dayOf(p.at) === today).length >= cfg.figuresPerDay) return 'day';
    if (cfg.monthUsd > 0 && this.spent(monthOf).usd + pictureUsd(cfg, cfg.provider, this.model) > cfg.monthUsd) return 'month';
    return null;
  }

  /**
   * Paint a battle figure on a flat key colour. A hero's portrait goes along so the figure is the same person.
   * Resolves to the picture once it is kept; `bill` is told what it cost.
   */
  async paintFigure(job: { table: string; tableTitle: string; subject: string; caption: string; prompt: string; key: FigureKey; tall: boolean; portraitId?: string; account?: string }, bill: (usd: number) => void): Promise<PictureInfo> {
    const cfg = this.config;
    const provider = cfg.provider, model = this.model, key = this.key(provider);
    if (!key) throw new PictureError('no_key');
    const busyKey = `figure:${job.subject}`;
    if (this.busy.has(busyKey)) throw new PictureError('busy');
    this.busy.add(busyKey);
    try {
      const portrait = job.portraitId ? this.index.find((p) => p.id === job.portraitId) : null;
      const refs: PaintRequest['refs'] = [];
      if (portrait && pictureRefs(provider, model) > 0) { try { refs.push({ mime: portrait.mime, data: readFileSync(join(this.dir, portrait.file)) }); } catch { /* gone: paint from the words */ } }
      let painted;
      try {
        painted = await PAINTERS[provider](this.fetchFn, model, key, { prompt: job.prompt, refs, tall: job.tall, square: !job.tall });
      } catch (err) {
        this.failedFigures.add(job.subject);
        this.lastError = err instanceof Error ? err.message : String(err);
        console.warn(`[pictures] figure of ${job.caption}: ${this.lastError}`);
        throw new PictureError(err instanceof PictureFailure ? err.code : 'failed');
      }
      const stored = this.keep(painted, { table: job.table, tableTitle: job.tableTitle, entry: 0, moment: 'figure', subject: job.subject, caption: job.caption, provider, model, usd: pictureUsd(cfg, provider, model), ...(job.account ? { account: job.account } : {}), keyColor: job.key });
      this.figures.set(job.subject, stored.id);
      console.log(`[pictures] painted the battle figure of ${job.caption} (${stored.id}) with ${provider} ${model}`);
      bill(stored.usd);
      return view(stored);
    } finally {
      this.busy.delete(busyKey);
    }
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
    const mine = this.index.filter((p) => p.table === table && p.moment !== 'sample' && p.moment !== 'portrait' && p.moment !== 'figure');
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

  /** The portraits of the heroes in the picture, then the newest scenes of this table, to keep its people looking the same. */
  private refsFor(table: string, max: number, portraits: string[] = []): PaintRequest['refs'] {
    if (max <= 0) return [];
    const out: PaintRequest['refs'] = [];
    const ordered = [...portraits.map((id) => this.index.find((p) => p.id === id)).filter((p): p is Stored => !!p), ...[...this.index].reverse().filter((p) => p.table === table && p.moment !== 'portrait' && p.moment !== 'figure')];
    for (const p of ordered) {
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
      const refs = this.refsFor(job.table, pictureRefs(provider, model), job.ask.portraits);
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
      const stored = this.keep(painted, {
        table: job.table, tableTitle: job.tableTitle, entry: job.entry, moment: job.table === 'sample' ? 'sample' : job.ask.moment,
        caption: job.ask.picture, provider, model, usd: pictureUsd(c, provider, model),
      });
      const id = stored.id, usd = stored.usd;
      console.log(`[pictures] painted ${id} for ${job.table} (${stored.moment}) with ${provider} ${model} in ${Math.round((this.now() - started) / 1000)} s`);
      bill(usd);
      return view(stored);
    } finally {
      this.busy.delete(job.table);
    }
  }

  /** Why no portrait may be painted for this hero now, or null. */
  portraitGate(account: string, c: Character): PictureGate | 'portraits' | 'done' | null {
    const cfg = this.config;
    if (!cfg.on) return 'off';
    if (!cfg.portraits) return 'portraits';
    if (!this.key(cfg.provider)) return 'no_key';
    const key = `${c.id}|${portraitKey(c)}`;
    if (c.portraitKey === portraitKey(c)) return 'done';
    if (this.busy.has(`portrait:${c.id}`) || this.failedPortraits.has(key)) return 'busy';
    const today = dayOf(this.now());
    if (this.index.filter((p) => p.moment === 'portrait' && p.account === account && dayOf(p.at) === today).length >= cfg.portraitsPerDay) return 'day';
    if (cfg.monthUsd > 0 && this.spent(monthOf).usd + pictureUsd(cfg, cfg.provider, this.model) > cfg.monthUsd) return 'month';
    return null;
  }

  /** Paint a hero's portrait from the choices made in the creator, in the one portrait style every hero shares. */
  async paintPortrait(job: { table: string; tableTitle: string; account: string; hero: Character }, bill: (usd: number) => void): Promise<PictureInfo & { key: string }> {
    const cfg = this.config;
    const provider = cfg.provider, model = this.model, key = this.key(provider);
    const look = portraitKey(job.hero);
    if (!key) throw new PictureError('no_key');
    const busyKey = `portrait:${job.hero.id}`;
    if (this.busy.has(busyKey)) throw new PictureError('busy');
    this.busy.add(busyKey);
    try {
      let painted;
      try {
        painted = await PAINTERS[provider](this.fetchFn, model, key, { prompt: portraitPrompt(PORTRAIT_STYLE, job.hero), refs: [], square: true });
      } catch (err) {
        this.failedPortraits.add(`${job.hero.id}|${look}`);
        this.lastError = err instanceof Error ? err.message : String(err);
        console.warn(`[pictures] portrait of ${job.hero.name}: ${this.lastError}`);
        throw new PictureError(err instanceof PictureFailure ? err.code : 'failed');
      }
      const stored = this.keep(painted, { table: job.table, tableTitle: job.tableTitle, entry: 0, moment: 'portrait', caption: job.hero.name, provider, model, usd: pictureUsd(cfg, provider, model), account: job.account });
      console.log(`[pictures] painted the portrait of ${job.hero.name} (${stored.id}) with ${provider} ${model}`);
      bill(stored.usd);
      return { ...view(stored), key: look };
    } finally {
      this.busy.delete(busyKey);
    }
  }

  /** Write a painted picture to disk and into the index. */
  private keep(painted: { data: Buffer; mime: string }, info: Omit<Stored, 'id' | 'file' | 'mime' | 'at'>): Stored {
    const id = randomBytes(9).toString('hex');
    const file = `${id}.${EXT[painted.mime] ?? 'png'}`;
    writeFileSync(join(this.dir, file), painted.data);
    const stored: Stored = { ...info, id, at: this.now(), file, mime: EXT[painted.mime] ? painted.mime : 'image/png' };
    this.index.push(stored);
    if (this.index.length > MAX_INDEX) { this.index.splice(0, this.index.length - MAX_INDEX); this.indexFigures(); }
    this.save();
    this.lastError = '';
    return stored;
  }

  /** A test picture in the current style, for the Innkeeper. */
  sample(bill: (usd: number) => void): Promise<PictureInfo> {
    return this.paint({ table: 'sample', tableTitle: '', entry: 0, ask: SAMPLE, where: 'A crypt under an old chapel', time: 'night' }, bill);
  }

  /** A test portrait in the shared portrait style, for the Innkeeper. */
  async samplePortrait(bill: (usd: number) => void): Promise<PictureInfo> {
    const hero = { id: 'sample', name: 'Brann', speciesId: 'dwarf', classId: 'fighter', className: 'Fighter', gender: 'male', look: { skin: 'tan', hair: 'short', hairColor: 'auburn', beard: 'braided', color: 'red' }, appearance: 'Broad-shouldered, a dented steel breastplate and a round shield on his back.', dead: false } as unknown as Character;
    const p = await this.paintPortrait({ table: 'sample', tableTitle: '', account: '', hero }, bill);
    const stored = this.index.find((x) => x.id === p.id);
    if (stored) { stored.moment = 'sample'; this.save(); }
    return { ...p, moment: 'sample' };
  }

  /** A test battle figure, a goblin, for the Innkeeper. It does not stand in for real goblins. */
  async sampleFigure(bill: (usd: number) => void): Promise<PictureInfo> {
    const look = baseLook('humanoid', 'small', 'green', { weapon: 'sword', armor: 'leather' });
    const { prompt, key } = monsterFigurePrompt('Goblin', 'humanoid', look);
    const subject = `sample:${randomBytes(4).toString('hex')}`;
    const p = await this.paintFigure({ table: 'sample', tableTitle: '', subject, caption: 'Goblin', prompt, key, tall: true }, bill);
    const stored = this.index.find((x) => x.id === p.id);
    if (stored) { stored.moment = 'sample'; this.save(); }
    this.figures.delete(subject);
    return { ...p, moment: 'sample' };
  }

  /** One picture, by id. */
  info(id: string): PictureInfo | null {
    const p = this.index.find((x) => x.id === id);
    return p ? view(p) : null;
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
      if (p.moment === 'figure') { this.indexFigures(); if (p.subject) this.failedFigures.delete(p.subject); }
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
    portraits: typeof r.portraits === 'boolean' ? r.portraits : base.portraits ?? true,
    portraitsPerDay: bound(r.portraitsPerDay, 0, 20, base.portraitsPerDay ?? 3),
    figures: typeof r.figures === 'boolean' ? r.figures : base.figures ?? true,
    figuresPerDay: bound(r.figuresPerDay, 0, 200, base.figuresPerDay ?? 20),
    customStyle: typeof r.customStyle === 'string' ? r.customStyle.replace(/\s+/g, ' ').trim().slice(0, 600) : base.customStyle,
    moments,
    perTableDay: bound(r.perTableDay, 0, 50, base.perTableDay),
    gapMinutes: bound(r.gapMinutes, 0, 600, base.gapMinutes),
    monthUsd: bound(r.monthUsd, 0, 1000, base.monthUsd),
    usd,
  };
}
