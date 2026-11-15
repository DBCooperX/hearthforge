// What the AI Dungeon Master costs: tokens per day, table and model, with an estimate in dollars.
// The numbers are added up in one small file in the data volume and kept for ninety days.
import { join } from 'node:path';
import type { UsageReport, UsageTotals } from '../../../shared/admin';
import { readJson, writePrivate } from './config';

/** Dollars per million tokens. Writing to the cache costs a quarter more than plain input. */
const PRICES: { model: string; input: number; output: number; cacheRead: number }[] = [
  { model: 'claude-fable-5-2', input: 8, output: 40, cacheRead: 0.2 },
  { model: 'claude-opus-5-5', input: 4, output: 20, cacheRead: 0.2 },
  { model: 'claude-opus-5', input: 5, output: 25, cacheRead: 0.5 },
  { model: 'claude-sonnet-5-5', input: 2, output: 10, cacheRead: 0.1 },
  { model: 'claude-sonnet-5', input: 2, output: 10, cacheRead: 0.2 },
  { model: 'claude-haiku-5-5', input: 0.1, output: 0.5, cacheRead: 0.01 },
];
const KEEP_DAYS = 90;

export interface UsageSample {
  table: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

type Counts = [calls: number, input: number, output: number, cacheRead: number, cacheWrite: number];
/** day -> table -> model -> counts */
type Book = Record<string, Record<string, Record<string, Counts>>>;

const priceOf = (model: string) => PRICES.find((p) => model === p.model || model.startsWith(`${p.model}-`));

function costOf(model: string, c: Counts): number | null {
  const p = priceOf(model);
  if (!p) return null;
  return (c[1] * p.input + c[2] * p.output + c[3] * p.cacheRead + c[4] * p.input * 1.25) / 1e6;
}

const zero = (): UsageTotals => ({ calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 });

function add(into: UsageTotals, model: string, c: Counts) {
  into.calls += c[0]; into.input += c[1]; into.output += c[2]; into.cacheRead += c[3]; into.cacheWrite += c[4];
  const cost = costOf(model, c);
  into.cost = cost === null || into.cost === null ? null : into.cost + cost;
}

export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export class Usage {
  private file: string;
  private book: Book;
  private timer: NodeJS.Timeout | null = null;

  constructor(dataDir: string, private now: () => number = Date.now) {
    this.file = join(dataDir, 'usage.json');
    this.book = readJson<Book>(this.file, {});
  }

  record(u: UsageSample) {
    const day = ((this.book[dayOf(this.now())] ??= {})[u.table] ??= {});
    const c = (day[u.model] ??= [0, 0, 0, 0, 0]);
    c[0] += 1; c[1] += u.input || 0; c[2] += u.output || 0; c[3] += u.cacheRead || 0; c[4] += u.cacheWrite || 0;
    if (!this.timer) {
      this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 5000);
      this.timer.unref?.();
    }
  }

  flush() {
    const oldest = dayOf(this.now() - KEEP_DAYS * 86400000);
    for (const day of Object.keys(this.book)) if (day < oldest) delete this.book[day];
    try { writePrivate(this.file, JSON.stringify(this.book)); } catch (err) { console.error('[usage] could not be saved:', err); }
  }

  /** Totals for the days from `from` on (YYYY-MM-DD), optionally for one table. */
  totals(from = '', table?: string): UsageTotals {
    const t = zero();
    for (const [day, tables] of Object.entries(this.book)) {
      if (day < from) continue;
      for (const [id, models] of Object.entries(tables)) {
        if (table !== undefined && id !== table) continue;
        for (const [model, c] of Object.entries(models)) add(t, model, c);
      }
    }
    return t;
  }

  report(titleOf: (table: string) => string): UsageReport {
    const days = new Map<string, UsageTotals>(), models = new Map<string, UsageTotals>(), tables = new Map<string, UsageTotals>();
    const total = zero();
    const slot = (m: Map<string, UsageTotals>, k: string) => m.get(k) ?? (m.set(k, zero()), m.get(k)!);
    for (const [day, perTable] of Object.entries(this.book)) {
      for (const [table, perModel] of Object.entries(perTable)) {
        for (const [model, c] of Object.entries(perModel)) {
          add(slot(days, day), model, c); add(slot(models, model), model, c); add(slot(tables, table), model, c); add(total, model, c);
        }
      }
    }
    const byCost = (a: UsageTotals, b: UsageTotals) => (b.cost ?? 0) - (a.cost ?? 0) || b.output - a.output;
    return {
      days: [...days].map(([day, t]) => ({ day, ...t })).sort((a, b) => (a.day < b.day ? 1 : -1)),
      models: [...models].map(([model, t]) => ({ model, ...t })).sort(byCost),
      tables: [...tables].map(([table, t]) => ({ table, title: titleOf(table), ...t })).sort(byCost),
      total,
      prices: PRICES,
    };
  }
}
