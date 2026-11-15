// Who may use the Innkeeper. There is one owner password. Until the owner sets their own, the
// first password is the one the installer wrote into the environment, or failing that one the
// server makes up and leaves in the data folder. The file never holds a password, only hashes.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AdminBan } from '../../../shared/admin';
import { readJson, writePrivate } from './config';

const SESSION_MS = 7 * 24 * 3600 * 1000;
const MAX_SESSIONS = 10;
/** Wrong passwords one address may try in a window, and all addresses together. */
const TRIES = 5;
const TRIES_ALL = 40;
const WINDOW_MS = 5 * 60 * 1000;

interface Saved {
  /** scrypt hash of the owner's own password, as salt:hash in hex. Absent until they set one. */
  password?: string;
  /** sha256 of each session token, with the time it runs out. */
  sessions: Record<string, number>;
  bans: AdminBan[];
  paused: string[];
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(sha(a)), y = Buffer.from(sha(b));
  return timingSafeEqual(x, y);
}

export class AuthError extends Error {
  constructor(readonly code: 'wrong_password' | 'too_many' | 'weak_password') { super(code); }
}

export class Auth {
  private file: string;
  private firstFile: string;
  private s: Saved;
  /** The first password while the owner has not set one. */
  private first: string | null = null;
  private fails = new Map<string, number[]>();
  private now: () => number;

  constructor(dataDir: string, env: NodeJS.ProcessEnv, now: () => number = Date.now) {
    this.now = now;
    this.file = join(dataDir, 'innkeeper.json');
    this.firstFile = join(dataDir, 'innkeeper-first-password.txt');
    const saved = readJson<Partial<Saved>>(this.file, {});
    this.s = { password: saved.password, sessions: saved.sessions ?? {}, bans: saved.bans ?? [], paused: saved.paused ?? [] };
    if (!this.s.password) {
      const fromEnv = env.HEARTHFORGE_ADMIN_PASSWORD?.trim();
      if (fromEnv) this.first = fromEnv;
      else {
        // Nothing was set at install time: make one up and leave it where only the owner of the server can read it.
        const kept = existsSync(this.firstFile) ? readFileSync(this.firstFile, 'utf8').trim() : '';
        this.first = kept || randomBytes(9).toString('base64url');
        if (!kept) writePrivate(this.firstFile, `${this.first}\n`);
      }
    }
  }

  /** The made-up first password and where it is kept, for the server log. Null once it is no longer needed. */
  get firstPasswordNote(): { password: string; file: string } | null {
    return this.first && existsSync(this.firstFile) ? { password: this.first, file: this.firstFile } : null;
  }

  get usesFirstPassword() { return !this.s.password; }

  private save() { writePrivate(this.file, JSON.stringify(this.s, null, 2)); }

  private recent(key: string): number[] {
    const since = this.now() - WINDOW_MS;
    const list = (this.fails.get(key) ?? []).filter((t) => t > since);
    this.fails.set(key, list);
    return list;
  }

  private check(password: string): boolean {
    if (this.s.password) {
      const [salt] = this.s.password.split(':');
      return same(hashPassword(password, salt), this.s.password);
    }
    return !!this.first && same(password, this.first);
  }

  /** Check the password and open a session. Returns the session token. */
  login(password: string, ip: string): string {
    if (this.recent(ip).length >= TRIES || this.recent('*').length >= TRIES_ALL) throw new AuthError('too_many');
    if (typeof password !== 'string' || !password || password.length > 200 || !this.check(password)) {
      this.recent(ip).push(this.now());
      this.recent('*').push(this.now());
      throw new AuthError('wrong_password');
    }
    this.fails.delete(ip);
    const token = randomBytes(32).toString('hex');
    const live = Object.entries(this.s.sessions).filter(([, until]) => until > this.now()).sort((a, b) => b[1] - a[1]).slice(0, MAX_SESSIONS - 1);
    this.s.sessions = Object.fromEntries(live);
    this.s.sessions[sha(token)] = this.now() + SESSION_MS;
    this.save();
    return token;
  }

  /** True when the token belongs to a session that has not run out. */
  valid(token: unknown): boolean {
    if (typeof token !== 'string' || token.length !== 64) return false;
    const until = this.s.sessions[sha(token)];
    return !!until && until > this.now();
  }

  logout(token: string) {
    delete this.s.sessions[sha(token)];
    this.save();
  }

  /** Set the owner's own password. Every other session ends. */
  changePassword(current: string, next: string, keepToken: string, ip: string) {
    if (this.recent(ip).length >= TRIES) throw new AuthError('too_many');
    if (!this.check(String(current ?? ''))) { this.recent(ip).push(this.now()); throw new AuthError('wrong_password'); }
    if (typeof next !== 'string' || next.length < 8 || next.length > 200) throw new AuthError('weak_password');
    this.s.password = hashPassword(next);
    this.first = null;
    const key = sha(keepToken);
    this.s.sessions = this.s.sessions[key] ? { [key]: this.s.sessions[key] } : {};
    this.save();
    rmSync(this.firstFile, { force: true });
  }

  // ------------------------------------------------------------------ bans and paused tables

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
