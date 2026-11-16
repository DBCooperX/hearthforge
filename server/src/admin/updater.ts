// The server cannot rebuild its own container, so it asks for it. A small updater container
// (see updater/ and docker-compose.yml) shares the data volume, watches the control folder for
// a request and reports back in a status file. The request is one of three fixed words; the
// updater never runs anything the server sends it.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HTTPS_DNS_PROVIDERS, type HttpsRequest, type HttpsStatus, type UpdaterStatus } from '../../../shared/admin';

export type UpdaterJob = 'check' | 'update' | 'https';

/** Seconds without a sign of life after which the updater counts as not running. */
const ALIVE_S = 90;

const NONE: UpdaterStatus = { connected: false, state: 'idle', message: '', branch: '', commit: '', commitDate: '', subject: '', behind: 0, incoming: [], recent: [], checkedAt: '', failed: '', log: [] };

export class Updater {
  private dir: string;

  constructor(dataDir: string, private now: () => number = Date.now) {
    this.dir = join(dataDir, 'control');
    try { mkdirSync(this.dir, { recursive: true }); } catch { /* reported as not connected */ }
  }

  private text(name: string): string {
    try { return readFileSync(join(this.dir, name), 'utf8'); } catch { return ''; }
  }

  /** The updater is a plain shell script, so it reports in plain text: key=value lines and tab-separated commits. */
  status(): UpdaterStatus {
    const raw: Record<string, string> = {};
    for (const line of this.text('status').split('\n')) {
      const at = line.indexOf('=');
      if (at > 0) raw[line.slice(0, at)] = line.slice(at + 1).trim();
    }
    const heartbeat = Number(this.text('heartbeat').trim()) || 0;
    const alive = this.now() / 1000 - heartbeat < ALIVE_S;
    const commits = (name: string) => this.text(name).split('\n').filter(Boolean).slice(0, 50).map((line) => {
      const [commit = '', date = '', ...subject] = line.split('\t');
      return { commit, date, subject: subject.join(' ') };
    });
    const state = raw.state ?? '';
    return {
      ...NONE,
      connected: alive,
      // A job that was running when the updater went away is not running any more.
      state: alive && ['checking', 'building', 'restarting', 'failed'].includes(state) ? (state as UpdaterStatus['state']) : state === 'failed' ? 'failed' : 'idle',
      message: raw.message ?? '',
      branch: raw.branch ?? '',
      commit: raw.commit ?? '',
      commitDate: raw.commitDate ?? '',
      subject: raw.subject ?? '',
      behind: Number(raw.behind) || 0,
      incoming: commits('incoming'),
      recent: commits('recent'),
      checkedAt: raw.checkedAt ?? '',
      failed: raw.failed ?? '',
      log: this.text('updater.log').split('\n').filter(Boolean).slice(-60),
    };
  }

  private keyValues(name: string): Record<string, string> {
    const raw: Record<string, string> = {};
    for (const line of this.text(name).split('\n')) {
      const at = line.indexOf('=');
      if (at > 0) raw[line.slice(0, at)] = line.slice(at + 1).trim();
    }
    return raw;
  }

  /** What the updater last reported about HTTPS: the settings in .env (never the token) and whether Caddy runs. */
  https(): HttpsStatus {
    const raw = this.keyValues('https');
    const connected = this.status().connected;
    return {
      connected,
      known: 'on' in raw,
      on: raw.on === '1',
      state: raw.state === 'working' || raw.state === 'failed' ? raw.state : 'idle',
      message: raw.message ?? '',
      domain: raw.domain ?? '',
      local: raw.local ?? '',
      email: raw.email ?? '',
      dnsProvider: raw.dnsProvider ?? '',
      dnsToken: raw.dnsToken === '1',
      caddy: raw.caddy ?? 'none',
      log: [...this.text('https.log').split('\n'), ...this.text('https.build.log').split('\n').slice(-15)].filter(Boolean).slice(-60),
    };
  }

  /** Hand HTTPS settings to the updater, which writes them into .env and restarts Caddy. */
  requestHttps(r: HttpsRequest): 'ok' | 'no_updater' | 'busy' | 'bad_value' {
    const clean = checkHttps(r);
    if (!clean) return 'bad_value';
    const s = this.status();
    if (!s.connected) return 'no_updater';
    if (existsSync(join(this.dir, 'request')) || s.state === 'checking' || s.state === 'building' || s.state === 'restarting') return 'busy';
    const lines = [`mode=${clean.mode}`, `domain=${clean.domain}`, `local=${clean.local}`, `email=${clean.email}`, `dnsProvider=${clean.dnsProvider}`];
    if (clean.dnsToken !== undefined) lines.push(`dnsToken=${clean.dnsToken}`);
    const file = join(this.dir, 'https.request');
    writeFileSync(`${file}.tmp`, `${lines.join('\n')}\n`, { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
    return this.request('https');
  }

  /** Leave a request for the updater. Returns false when it is not running or still busy. */
  request(job: UpdaterJob): 'ok' | 'no_updater' | 'busy' {
    const s = this.status();
    if (!s.connected) return 'no_updater';
    const file = join(this.dir, 'request');
    if (existsSync(file) || s.state === 'checking' || s.state === 'building' || s.state === 'restarting') return 'busy';
    writeFileSync(`${file}.tmp`, `${job}\n`);
    renameSync(`${file}.tmp`, file);
    return 'ok';
  }
}

/**
 * HTTPS settings as the updater will accept them, or null. The updater checks them again with the
 * same patterns, so nothing odd ever reaches .env.
 */
export function checkHttps(r: HttpsRequest): Required<Omit<HttpsRequest, 'dnsToken'>> & { dnsToken?: string } | null {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const mode = r.mode === 'off' ? 'off' : r.mode === 'on' ? 'on' : null;
  const domain = str(r.domain).toLowerCase();
  const local = str(r.local).replace(/\s+/g, '').replace(/,+/g, ',').replace(/^,|,$/g, '');
  const email = str(r.email);
  const dnsProvider = str(r.dnsProvider);
  const dnsToken = r.dnsToken === undefined ? undefined : str(r.dnsToken);
  if (!mode) return null;
  if (domain && !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) return null;
  if (!/^[A-Za-z0-9.:,-]*$/.test(local)) return null;
  if (email && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) return null;
  if (dnsProvider && !(HTTPS_DNS_PROVIDERS as readonly string[]).includes(dnsProvider)) return null;
  if (dnsToken !== undefined && !/^[A-Za-z0-9._~+/=:-]*$/.test(dnsToken)) return null;
  if (mode === 'on' && !domain && !local) return null;
  if (domain.length > 200 || local.length > 300 || email.length > 200 || (dnsToken?.length ?? 0) > 300) return null;
  return { mode, domain, local, email, dnsProvider, ...(dnsToken !== undefined ? { dnsToken } : {}) };
}
