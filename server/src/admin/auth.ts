// What the Innkeeper keeps besides the accounts: banned addresses and paused tables.
// Who may open the Innkeeper is now a matter of accounts (server/src/accounts.ts). The owner
// password from before accounts may still sit in this file; the accounts take it over once.
import type { AdminBan } from '../../../shared/admin';
import { readJson, writePrivate } from './config';
import { join } from 'node:path';

interface Saved {
  bans: AdminBan[];
  paused: string[];
}

export class Auth {
  private file: string;
  private s: Saved;

  constructor(dataDir: string, private now: () => number = Date.now) {
    this.file = join(dataDir, 'innkeeper.json');
    const saved = readJson<Partial<Saved>>(this.file, {});
    this.s = { bans: saved.bans ?? [], paused: saved.paused ?? [] };
  }

  private save() { writePrivate(this.file, JSON.stringify(this.s, null, 2)); }

  get bans(): AdminBan[] { return this.s.bans; }
  banned(ip: string): boolean { return this.s.bans.some((b) => b.ip === ip); }

  ban(ip: string, note: string) {
    if (!ip || this.banned(ip)) return;
    this.s.bans.push({ ip: ip.slice(0, 64), note: note.slice(0, 80), at: this.now() });
    this.save();
  }

  unban(ip: string) {
    this.s.bans = this.s.bans.filter((b) => b.ip !== ip);
    this.save();
  }

  paused(table: string): boolean { return this.s.paused.includes(table); }

  setPaused(table: string, paused: boolean) {
    this.s.paused = this.s.paused.filter((t) => t !== table);
    if (paused) this.s.paused.push(table);
    this.save();
  }

  /** For a backup: who is banned. */
  exportable() { return { bans: this.s.bans }; }
}
