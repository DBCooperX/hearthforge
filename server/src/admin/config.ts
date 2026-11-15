// Settings the owner changes in the Innkeeper. They are kept in the data volume and laid over
// the environment the container was started with, so nothing has to be edited on the host.
// A change takes effect with the next start of the server.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SETTINGS, type SettingDef, type SettingValue } from '../../../shared/admin';

export class ConfigError extends Error {}

/** Write a file so that a crash never leaves half of it behind. Only its owner may read it. */
export function writePrivate(file: string, text: string) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  renameSync(tmp, file);
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Show enough of a secret to recognise it, and no more. */
export function mask(secret: string): string {
  if (!secret) return '';
  return secret.length <= 12 ? '••••••••' : `${secret.slice(0, 7)}…${secret.slice(-4)}`;
}

function clean(def: SettingDef, raw: unknown): string {
  if (typeof raw !== 'string') throw new ConfigError(def.key);
  const v = raw.trim();
  if (v.length > 400 || /[\r\n\0]/.test(v)) throw new ConfigError(def.key);
  if (v === '') return v;
  if (def.kind === 'choice' && !def.choices!.includes(v)) throw new ConfigError(def.key);
  if (def.kind === 'number') {
    const n = Number(v);
    if (!Number.isFinite(n) || n < (def.min ?? -Infinity) || n > (def.max ?? Infinity)) throw new ConfigError(def.key);
    return String(n);
  }
  if (def.kind === 'model' && !/^[a-z0-9][a-z0-9.@:_-]*$/i.test(v)) throw new ConfigError(def.key);
  if (def.kind === 'secret' && /\s/.test(v)) throw new ConfigError(def.key);
  return v;
}

export class Config {
  private file: string;
  private overrides: Record<string, string>;
  /** The environment this server process runs with: the container's, with the Innkeeper's settings on top. */
  readonly env: NodeJS.ProcessEnv;

  constructor(dataDir: string, private base: NodeJS.ProcessEnv) {
    this.file = join(dataDir, 'settings.json');
    const saved = readJson<Record<string, unknown>>(this.file, {});
    this.overrides = {};
    for (const def of SETTINGS) if (typeof saved[def.key] === 'string') this.overrides[def.key] = saved[def.key] as string;
    this.env = this.merged();
  }

  private merged(): NodeJS.ProcessEnv {
    return { ...this.base, ...this.overrides };
  }

  /** Change settings. A null value hands the setting back to the installer's .env. */
  set(values: Record<string, unknown>) {
    const next = { ...this.overrides };
    for (const [key, raw] of Object.entries(values)) {
      const def = SETTINGS.find((d) => d.key === key);
      if (!def) throw new ConfigError(key);
      if (raw === null) delete next[key];
      else next[key] = clean(def, raw);
    }
    this.overrides = next;
    writePrivate(this.file, JSON.stringify(next, null, 2));
  }

  /** The settings without secrets, for a backup. */
  exportable(): Record<string, string> {
    return Object.fromEntries(Object.entries(this.overrides).filter(([k]) => SETTINGS.find((d) => d.key === k)?.kind !== 'secret'));
  }

  /** Take the settings of a backup. Anything unknown or invalid in it is skipped. */
  restore(values: unknown) {
    if (!values || typeof values !== 'object') return;
    const ok: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
      const def = SETTINGS.find((d) => d.key === k);
      if (!def || def.kind === 'secret') continue;
      try { ok[k] = clean(def, v); } catch { /* skipped */ }
    }
    this.set(ok);
  }

  /** The value the next start will use, unmasked. */
  next(key: string): string {
    return this.merged()[key] ?? '';
  }

  /** True when a saved change is waiting for a restart. */
  get pending(): boolean {
    const next = this.merged();
    return SETTINGS.some((d) => (next[d.key] ?? '') !== (this.env[d.key] ?? ''));
  }

  list(): SettingValue[] {
    const next = this.merged();
    return SETTINGS.map((def) => {
      const own = def.key in this.overrides;
      const raw = next[def.key] ?? '';
      const value = raw || def.fallback;
      return {
        key: def.key,
        value: def.kind === 'secret' ? mask(raw) : value,
        source: own ? 'panel' : raw ? 'env' : 'default',
        set: !!raw,
        pending: raw !== (this.env[def.key] ?? ''),
      };
    });
  }
}
