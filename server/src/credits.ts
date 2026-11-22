// Player credits, kept in one private JSON file in the data folder. Every cost of the AI (Claude for the Dungeon
// Master, a paid voice for the narrator) is shared out among the accounts it was spent for and booked in the one
// global currency, at the fixed rate the Innkeeper entered (1 for dollars). The Innkeeper books what players have paid in. See shared/credits.ts.
import { join } from 'node:path';
import { CURRENCY_CODE, DEFAULT_CREDIT_CONFIG, type CreditConfig, type CreditReport, type CreditRow, type CreditView, type TopUp, type UsageView } from '../../shared/credits';
import { readJson, writePrivate } from './admin/config';
import { VOICE_QUALITY_FACTOR, type VoiceQuality } from '../../shared/voice';

const KEEP_DAYS = 90;
const MAX_TOPUPS = 200;

interface Ledger {
  topUps: TopUp[];
  /** Spent, ever, in the global currency. */
  claude: number;
  voice: number;
  /** Story illustrations. Missing in ledgers from before them. */
  images?: number;
  /** Spent per day (YYYY-MM-DD): [claude, voice, illustrations]. Kept for 90 days. */
  days: Record<string, [number, number, number?]>;
  /** Spent per table (its name), with its title as last seen and the cost per day. Kept for 90 days. */
  tables?: Record<string, { title: string; days: Record<string, number> }>;
  free?: boolean;
}

interface Saved {
  config: CreditConfig;
  accounts: Record<string, Ledger>;
}

export interface CreditAccount { id: string; username: string; role: 'player' | 'innkeeper' }

/** What a cost was for. */
export type CostKind = 'claude' | 'voice' | 'images';

export class CreditsError extends Error {
  constructor(readonly code: 'bad_value' | 'not_found') { super(code); }
}

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const num = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new CreditsError('bad_value');
  return n;
};

/** Ledgers and configs saved before the global currency counted in francs, as chf and chfPerUsd. */
function legacyConfig(c: Record<string, unknown>): Partial<CreditConfig> {
  const out: Partial<CreditConfig> = { ...(c as Partial<CreditConfig>) };
  const old = c as { chfPerUsd?: number; warnChf?: number };
  if (out.currency === undefined && old.chfPerUsd !== undefined) { out.currency = 'CHF'; out.rate = old.chfPerUsd; }
  if (out.warn === undefined && old.warnChf !== undefined) out.warn = old.warnChf;
  return out;
}

const legacyTopUps = (list: unknown[]): TopUp[] =>
  list.map((t) => { const x = t as { at: number; amount?: number; chf?: number; note: string }; return { at: x.at, amount: x.amount ?? x.chf ?? 0, note: x.note }; });

/** Every amount in a ledger, times `f`. Used once, when the currency changes. */
function scaleLedger(l: Ledger, f: number) {
  l.topUps = l.topUps.map((t) => ({ ...t, amount: Math.round(t.amount * f * 100) / 100 }));
  l.claude = round(l.claude * f); l.voice = round(l.voice * f);
  if (l.images) l.images = round(l.images * f);
  for (const d of Object.values(l.days)) for (let i = 0; i < d.length; i++) d[i] = round((d[i] ?? 0) * f);
  for (const t of Object.values(l.tables ?? {})) for (const k of Object.keys(t.days)) t.days[k] = round(t.days[k] * f);
}

export class Credits {
  private file: string;
  private s: Saved;
  private timer: NodeJS.Timeout | null = null;

  constructor(dataDir: string, private now: () => number = Date.now) {
    this.file = join(dataDir, 'credits.json');
    const saved = readJson<Partial<Saved>>(this.file, {});
    const c = legacyConfig((saved.config ?? {}) as Record<string, unknown>);
    const accounts = saved.accounts ?? {};
    for (const l of Object.values(accounts)) l.topUps = legacyTopUps(l.topUps ?? []);
    this.s = {
      config: {
        on: c.on === true,
        currency: CURRENCY_CODE.test(String(c.currency)) ? String(c.currency) : DEFAULT_CREDIT_CONFIG.currency,
        rate: Number(c.rate) > 0 ? Number(c.rate) : DEFAULT_CREDIT_CONFIG.rate,
        warn: Number.isFinite(Number(c.warn)) && c.warn !== undefined ? Number(c.warn) : DEFAULT_CREDIT_CONFIG.warn,
        voiceUsdPer1k: { elevenlabs: Number(c.voiceUsdPer1k?.elevenlabs) >= 0 && c.voiceUsdPer1k?.elevenlabs !== undefined ? Number(c.voiceUsdPer1k.elevenlabs) : DEFAULT_CREDIT_CONFIG.voiceUsdPer1k.elevenlabs },
      },
      accounts,
    };
    if (this.s.config.currency === 'USD') this.s.config.rate = 1;
  }

  get config(): CreditConfig { return { ...this.s.config, voiceUsdPer1k: { ...this.s.config.voiceUsdPer1k } }; }

  setConfig(raw: Record<string, unknown>) {
    const c = this.s.config;
    const v = (raw.voiceUsdPer1k ?? {}) as Record<string, unknown>;
    const currency = raw.currency === undefined ? c.currency : String(raw.currency).trim().toUpperCase();
    if (!CURRENCY_CODE.test(currency)) throw new CreditsError('bad_value');
    const switching = currency !== c.currency;
    // Dollars are the providers' own prices: no conversion. Any other currency needs the Innkeeper's own fixed rate.
    if (switching && currency !== 'USD' && raw.rate === undefined) throw new CreditsError('bad_value');
    const rate = currency === 'USD' ? 1 : raw.rate === undefined ? c.rate : num(raw.rate, 0.0001, 100000);
    const next: CreditConfig = {
      on: raw.on === undefined ? c.on : raw.on === true,
      currency,
      rate,
      // A warning line left as it was moves with the money when the currency changes.
      warn: raw.warn === undefined || (switching && Number(raw.warn) === c.warn) ? (switching ? Math.round(c.warn * (rate / c.rate) * 100) / 100 : c.warn) : num(raw.warn, 0, 100000),
      voiceUsdPer1k: {
        elevenlabs: v.elevenlabs === undefined ? c.voiceUsdPer1k.elevenlabs : num(v.elevenlabs, 0, 10),
      },
    };
    // The one conversion: money already booked moves from the old currency into the new one, so balances keep their
    // worth. From then on every cost is booked straight in the new currency.
    if (switching) for (const l of Object.values(this.s.accounts)) scaleLedger(l, next.rate / c.rate);
    this.s.config = next;
    this.save();
  }

  private ledger(id: string): Ledger {
    return (this.s.accounts[id] ??= { topUps: [], claude: 0, voice: 0, days: {} });
  }

  /** What a voice costs for this many characters, in dollars. */
  voiceCost(chars: number, quality: VoiceQuality = 'quality'): number {
    return (Math.max(0, chars) / 1000) * this.s.config.voiceUsdPer1k.elevenlabs * VOICE_QUALITY_FACTOR[quality];
  }

  /**
   * Book a cost in dollars, shared equally among the accounts it was spent for. Returns the accounts charged, so
   * their players can be told how much is left.
   */
  charge(ids: string[], usd: number, kind: CostKind, table?: { id: string; title: string }): string[] {
    const who = [...new Set(ids)];
    if (!who.length || !(usd > 0)) return [];
    const share = (usd * this.s.config.rate) / who.length;
    const day = dayOf(this.now());
    for (const id of who) {
      const l = this.ledger(id);
      l[kind] = round((l[kind] ?? 0) + share);
      const d = (l.days[day] ??= [0, 0, 0]);
      const i = kind === 'claude' ? 0 : kind === 'voice' ? 1 : 2;
      d[i] = round((d[i] ?? 0) + share);
      if (table) {
        const t = ((l.tables ??= {})[table.id] ??= { title: table.title, days: {} });
        t.title = table.title;
        t.days[day] = round((t.days[day] ?? 0) + share);
      }
    }
    this.saveSoon();
    return who;
  }

  /** The Innkeeper books a payment (or, negative, a correction). */
  topUp(id: string, amount: unknown, note: unknown) {
    const paid = Math.round(num(amount, -1e7, 1e7) * 100) / 100;
    if (paid === 0) throw new CreditsError('bad_value');
    const l = this.ledger(id);
    l.topUps.push({ at: this.now(), amount: paid, note: String(note ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) });
    if (l.topUps.length > MAX_TOPUPS) {
      // The oldest payments fold into one line, so the balance stays right.
      const old = l.topUps.splice(0, l.topUps.length - MAX_TOPUPS + 1);
      l.topUps.unshift({ at: old[0].at, amount: round(old.reduce((n, t) => n + t.amount, 0)), note: 'earlier payments' });
    }
    this.save();
  }

  setFree(id: string, free: boolean) {
    this.ledger(id).free = free || undefined;
    this.save();
  }

  /** An account was deleted: its credit goes with it. */
  forget(id: string) {
    if (!this.s.accounts[id]) return;
    delete this.s.accounts[id];
    this.save();
  }

  view(a: CreditAccount): CreditView {
    const l = this.s.accounts[a.id];
    const paid = round((l?.topUps ?? []).reduce((n, t) => n + t.amount, 0));
    const spent = round((l?.claude ?? 0) + (l?.voice ?? 0) + (l?.images ?? 0));
    const balance = round(paid - spent);
    const free = !!l?.free;
    const limited = this.s.config.on && a.role !== 'innkeeper' && !free;
    const out = limited && balance <= 0;
    return { currency: this.s.config.currency, limited, free, paid, spent, balance, low: limited && !out && balance < this.s.config.warn, out, warn: this.s.config.warn };
  }

  /** What this account spent over the last `days` days (today included): by kind and by table, biggest first. */
  usage(a: CreditAccount, days = 7): UsageView {
    const l = this.s.accounts[a.id];
    const since = dayOf(this.now() - (days - 1) * 86400000);
    const sum: [number, number, number] = [0, 0, 0];
    for (const [d, v] of Object.entries(l?.days ?? {})) if (d >= since) for (let i = 0; i < 3; i++) sum[i] += v[i] ?? 0;
    const byTable = Object.entries(l?.tables ?? {})
      .map(([id, t]) => ({ id, title: t.title, amount: round(Object.entries(t.days).filter(([d]) => d >= since).reduce((n, [, v]) => n + v, 0)) }))
      .filter((t) => t.amount > 0).sort((x, y) => y.amount - x.amount);
    const total = round(sum[0] + sum[1] + sum[2]);
    const tabled = round(byTable.reduce((n, t) => n + t.amount, 0));
    return { currency: this.s.config.currency, days, total, claude: round(sum[0]), voice: round(sum[1]), images: round(sum[2]), byTable, elsewhere: Math.max(0, round(total - tabled)) };
  }

  /** False when credits are on and this account has none left. */
  mayPlay(a: CreditAccount): boolean {
    return !this.view(a).out;
  }

  report(accounts: CreditAccount[]): CreditReport {
    const since = dayOf(this.now() - 30 * 86400000);
    const rows: CreditRow[] = accounts.map((a) => {
      const l = this.s.accounts[a.id];
      const last30 = Object.entries(l?.days ?? {}).filter(([d]) => d >= since).reduce((n, [, v]) => n + v[0] + v[1] + (v[2] ?? 0), 0);
      return { ...this.view(a), id: a.id, username: a.username, role: a.role, spentClaude: round(l?.claude ?? 0), spentVoice: round(l?.voice ?? 0), spentImages: round(l?.images ?? 0), last30: round(last30), topUps: [...(l?.topUps ?? [])].reverse() };
    });
    return { config: this.config, rows };
  }

  private save() {
    const oldest = dayOf(this.now() - KEEP_DAYS * 86400000);
    for (const l of Object.values(this.s.accounts)) {
      for (const d of Object.keys(l.days)) if (d < oldest) delete l.days[d];
      for (const [id, t] of Object.entries(l.tables ?? {})) {
        for (const d of Object.keys(t.days)) if (d < oldest) delete t.days[d];
        if (!Object.keys(t.days).length) delete l.tables![id];
      }
    }
    try { writePrivate(this.file, JSON.stringify(this.s)); } catch (err) { console.error('[credits] could not be saved:', err); }
  }

  private saveSoon() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.save(); }, 3000);
    this.timer.unref?.();
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.save();
  }

  /** For a backup: everything, there is nothing secret in it. */
  exportable(): Saved { return JSON.parse(JSON.stringify(this.s)); }

  /** Bring back the credits of accounts this server does not know yet; the config only when none was set here. */
  restore(raw: unknown): number {
    const r = raw as Partial<Saved> | null;
    if (!r || typeof r !== 'object' || !r.accounts || typeof r.accounts !== 'object') return 0;
    let added = 0;
    // A backup in another currency is converted at the fixed rates of both servers, once.
    const was = legacyConfig((r.config ?? {}) as Record<string, unknown>);
    const f = was.currency && was.currency !== this.s.config.currency && Number(was.rate) > 0 ? this.s.config.rate / Number(was.rate) : 1;
    for (const [id, l] of Object.entries(r.accounts)) {
      if (this.s.accounts[id] || !l || !Array.isArray(l.topUps)) continue;
      this.s.accounts[id] = { topUps: legacyTopUps(l.topUps), claude: Number(l.claude) || 0, voice: Number(l.voice) || 0, ...(Number(l.images) ? { images: Number(l.images) } : {}), days: l.days ?? {}, ...(l.tables ? { tables: l.tables } : {}), ...(l.free ? { free: true } : {}) };
      if (f !== 1) scaleLedger(this.s.accounts[id], f);
      added++;
    }
    if (added) this.save();
    return added;
  }
}
