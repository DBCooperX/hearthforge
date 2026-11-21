// Player credits, kept in one private JSON file in the data folder. Every cost of the AI (Claude for the Dungeon
// Master, a paid voice for the narrator) is shared out among the accounts it was spent for and booked in francs at
// the rate of the day. The Innkeeper books what players have paid in. See shared/credits.ts.
import { join } from 'node:path';
import { DEFAULT_CREDIT_CONFIG, type CreditConfig, type CreditReport, type CreditRow, type CreditView, type TopUp } from '../../shared/credits';
import { readJson, writePrivate } from './admin/config';

const KEEP_DAYS = 90;
const MAX_TOPUPS = 200;

interface Ledger {
  topUps: TopUp[];
  /** Francs spent, ever. */
  claude: number;
  voice: number;
  /** Francs spent per day (YYYY-MM-DD): [claude, voice]. Kept for 90 days. */
  days: Record<string, [number, number]>;
  free?: boolean;
}

interface Saved {
  config: CreditConfig;
  accounts: Record<string, Ledger>;
}

export interface CreditAccount { id: string; username: string; role: 'player' | 'innkeeper' }

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

export class Credits {
  private file: string;
  private s: Saved;
  private timer: NodeJS.Timeout | null = null;

  constructor(dataDir: string, private now: () => number = Date.now) {
    this.file = join(dataDir, 'credits.json');
    const saved = readJson<Partial<Saved>>(this.file, {});
    const c = saved.config ?? {} as Partial<CreditConfig>;
    this.s = {
      config: { ...DEFAULT_CREDIT_CONFIG, ...c, voiceUsdPer1k: { ...DEFAULT_CREDIT_CONFIG.voiceUsdPer1k, ...(c.voiceUsdPer1k ?? {}) } },
      accounts: saved.accounts ?? {},
    };
  }

  get config(): CreditConfig { return { ...this.s.config, voiceUsdPer1k: { ...this.s.config.voiceUsdPer1k } }; }

  setConfig(raw: Record<string, unknown>) {
    const c = this.s.config;
    const v = (raw.voiceUsdPer1k ?? {}) as Record<string, unknown>;
    const next: CreditConfig = {
      on: raw.on === undefined ? c.on : raw.on === true,
      chfPerUsd: raw.chfPerUsd === undefined ? c.chfPerUsd : num(raw.chfPerUsd, 0.1, 10),
      warnChf: raw.warnChf === undefined ? c.warnChf : num(raw.warnChf, 0, 1000),
      voiceUsdPer1k: {
        elevenlabs: v.elevenlabs === undefined ? c.voiceUsdPer1k.elevenlabs : num(v.elevenlabs, 0, 10),
        openai: v.openai === undefined ? c.voiceUsdPer1k.openai : num(v.openai, 0, 10),
      },
    };
    this.s.config = next;
    this.save();
  }

  private ledger(id: string): Ledger {
    return (this.s.accounts[id] ??= { topUps: [], claude: 0, voice: 0, days: {} });
  }

  /** What a voice costs for this many characters, in dollars. */
  voiceCost(provider: 'elevenlabs' | 'openai', chars: number): number {
    return (Math.max(0, chars) / 1000) * (this.s.config.voiceUsdPer1k[provider] ?? 0);
  }

  /**
   * Book a cost in dollars, shared equally among the accounts it was spent for. Returns the accounts charged, so
   * their players can be told how much is left.
   */
  charge(ids: string[], usd: number, kind: 'claude' | 'voice'): string[] {
    const who = [...new Set(ids)];
    if (!who.length || !(usd > 0)) return [];
    const share = (usd * this.s.config.chfPerUsd) / who.length;
    const day = dayOf(this.now());
    for (const id of who) {
      const l = this.ledger(id);
      l[kind] = round(l[kind] + share);
      const d = (l.days[day] ??= [0, 0]);
      d[kind === 'claude' ? 0 : 1] = round(d[kind === 'claude' ? 0 : 1] + share);
    }
    this.saveSoon();
    return who;
  }

  /** The Innkeeper books a payment (or, negative, a correction). */
  topUp(id: string, amount: unknown, note: unknown) {
    const chf = Math.round(num(amount, -100000, 100000) * 100) / 100;
    if (chf === 0) throw new CreditsError('bad_value');
    const l = this.ledger(id);
    l.topUps.push({ at: this.now(), chf, note: String(note ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) });
    if (l.topUps.length > MAX_TOPUPS) {
      // The oldest payments fold into one line, so the balance stays right.
      const old = l.topUps.splice(0, l.topUps.length - MAX_TOPUPS + 1);
      l.topUps.unshift({ at: old[0].at, chf: round(old.reduce((n, t) => n + t.chf, 0)), note: 'earlier payments' });
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
    const paid = round((l?.topUps ?? []).reduce((n, t) => n + t.chf, 0));
    const spent = round((l?.claude ?? 0) + (l?.voice ?? 0));
    const balance = round(paid - spent);
    const free = !!l?.free;
    const limited = this.s.config.on && a.role !== 'innkeeper' && !free;
    const out = limited && balance <= 0;
    return { limited, free, paid, spent, balance, low: limited && !out && balance < this.s.config.warnChf, out, warnChf: this.s.config.warnChf };
  }

  /** False when credits are on and this account has none left. */
  mayPlay(a: CreditAccount): boolean {
    return !this.view(a).out;
  }

  report(accounts: CreditAccount[]): CreditReport {
    const since = dayOf(this.now() - 30 * 86400000);
    const rows: CreditRow[] = accounts.map((a) => {
      const l = this.s.accounts[a.id];
      const last30 = Object.entries(l?.days ?? {}).filter(([d]) => d >= since).reduce((n, [, v]) => n + v[0] + v[1], 0);
      return { ...this.view(a), id: a.id, username: a.username, role: a.role, spentClaude: round(l?.claude ?? 0), spentVoice: round(l?.voice ?? 0), last30: round(last30), topUps: [...(l?.topUps ?? [])].reverse() };
    });
    return { config: this.config, rows };
  }

  private save() {
    const oldest = dayOf(this.now() - KEEP_DAYS * 86400000);
    for (const l of Object.values(this.s.accounts)) for (const d of Object.keys(l.days)) if (d < oldest) delete l.days[d];
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
    for (const [id, l] of Object.entries(r.accounts)) {
      if (this.s.accounts[id] || !l || !Array.isArray(l.topUps)) continue;
      this.s.accounts[id] = { topUps: l.topUps, claude: Number(l.claude) || 0, voice: Number(l.voice) || 0, days: l.days ?? {}, ...(l.free ? { free: true } : {}) };
      added++;
    }
    if (added) this.save();
    return added;
  }
}
