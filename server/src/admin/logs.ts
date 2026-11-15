// The server log, kept where the Innkeeper can show it: the last lines in memory, and a small
// file in the data volume so the reason for a crash is still there after the restart.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { format } from 'node:util';
import type { LogLine } from '../../../shared/admin';

const KEEP = 1500;
const MAX_FILE = 1024 * 1024;

export class Logs {
  private lines: LogLine[] = [];
  private seq = 0;
  private file: string | null = null;

  /** Remember what the previous run wrote, then start writing to the file. */
  open(dataDir: string) {
    try {
      const dir = join(dataDir, 'logs');
      mkdirSync(dir, { recursive: true });
      const file = join(dir, 'server.log');
      if (existsSync(file)) {
        for (const raw of readFileSync(file, 'utf8').split('\n').slice(-400)) {
          const m = /^(\S+) (info|warn|error) (.*)$/.exec(raw);
          if (m) this.push(Date.parse(m[1]) || 0, m[2] as LogLine['level'], m[3], false);
        }
      }
      this.file = file;
    } catch {
      this.file = null; // the log still shows in the Innkeeper, it just does not survive a restart
    }
  }

  private push(at: number, level: LogLine['level'], text: string, persist = true) {
    this.lines.push({ id: ++this.seq, at, level, text: text.slice(0, 2000) });
    if (this.lines.length > KEEP) this.lines.splice(0, this.lines.length - KEEP);
    if (!persist || !this.file) return;
    try {
      if (existsSync(this.file) && statSync(this.file).size > MAX_FILE) renameSync(this.file, `${this.file}.1`);
      appendFileSync(this.file, `${new Date(at).toISOString()} ${level} ${text.replace(/\n/g, ' ⏎ ').slice(0, 2000)}\n`);
    } catch { /* a full disk must not take the game down */ }
  }

  /** Copy everything written to the console into the log. */
  capture() {
    for (const level of ['info', 'warn', 'error'] as const) {
      const method = level === 'info' ? 'log' : level;
      const original = console[method].bind(console);
      console[method] = (...args: unknown[]) => {
        original(...args);
        this.push(Date.now(), level, format(...args));
      };
    }
  }

  /** Lines newer than `after`, oldest first. */
  since(after = 0, limit = 500): LogLine[] {
    return this.lines.filter((l) => l.id > after).slice(-limit);
  }
}
