// The server cannot rebuild its own container, so it asks for it. A small updater container
// (see updater/ and docker-compose.yml) shares the data volume, watches the control folder for
// a request and reports back in a status file. The request is one of three fixed words; the
// updater never runs anything the server sends it.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UpdaterStatus } from '../../../shared/admin';

export type UpdaterJob = 'check' | 'update';

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
