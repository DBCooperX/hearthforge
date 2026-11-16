// The accounts of this server, kept in one private JSON file in the data folder. Passwords are
// stored only as scrypt hashes and sessions only as SHA-256 hashes of their tokens.
//
// The very first account is the Innkeeper. It takes over the owner password from before accounts
// (innkeeper.json), or the first password the installer set (HEARTHFORGE_ADMIN_PASSWORD), or one
// the server makes up and leaves in innkeeper-first-password.txt, like the Innkeeper always did.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  ACCOUNT_PREFIX, PASSWORD_MIN, cleanUsername, emptyPlayStats, usernameOk,
  type AccountError, type AccountRow, type AccountView, type HeroStats, type InviteView, type PlayStats, type Profile, type Role,
} from '../../shared/accounts';
import { readJson, writePrivate } from './admin/config';

/** A "remember me" session lasts a month; any other one a day. */
export const REMEMBER_MS = 30 * 24 * 3600 * 1000;
export const SESSION_MS = 24 * 3600 * 1000;
const MAX_SESSIONS = 10;
const INVITE_MS = 7 * 24 * 3600 * 1000;
const TRIES = 5;
const TRIES_ALL = 40;
const WINDOW_MS = 5 * 60 * 1000;
export const FIRST_USERNAME = 'innkeeper';

interface Account {
  id: string;
  username: string;
  /** scrypt salt:hash in hex. Empty for an account restored from a backup, until the Innkeeper resets it. */
  password: string;
  role: Role;
  createdAt: number;
  lastSeen: number;
  mustChange: boolean;
  stats: PlayStats;
  heroes: Record<string, HeroStats>;
}

interface Session { account: string; until: number }
interface Invite { code: string; role: Role; note: string; createdAt: number; expiresAt: number }

interface Saved {
  accounts: Account[];
  sessions: Record<string, Session>;
  invites: Invite[];
}

export class AccountsError extends Error {
  constructor(readonly code: AccountError) { super(code); }
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

function same(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(sha(a)), Buffer.from(sha(b)));
}

function verify(password: string, hash: string): boolean {
  if (!hash) return false;
  const [salt] = hash.split(':');
  return same(hashPassword(password, salt), hash);
}

/** A password that is easy to read out and type: three groups of four. */
function madeUpPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const raw = Array.from(randomBytes(12), (b) => chars[b % chars.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export interface HeroRef { table: string; tableTitle: string; id: string; name: string; classId: string; level: number }

export class Accounts {
  private file: string;
  private firstFile: string;
  private s: Saved;
  private fails = new Map<string, number[]>();
  private saveTimer: NodeJS.Timeout | null = null;
  /** The made-up first password, while the first Innkeeper still uses it. */
  private first: string | null = null;
  /** Told when an account is deleted, so its connections can be closed. */
  onDeleted?: (id: string) => void;

  constructor(dataDir: string, env: NodeJS.ProcessEnv, private now: () => number = Date.now) {
    this.file = join(dataDir, 'accounts.json');
    this.firstFile = join(dataDir, 'innkeeper-first-password.txt');
    const saved = readJson<Partial<Saved>>(this.file, {});
    this.s = { accounts: saved.accounts ?? [], sessions: saved.sessions ?? {}, invites: saved.invites ?? [] };
    for (const a of this.s.accounts) { a.stats = { ...emptyPlayStats(), ...a.stats }; a.heroes ??= {}; }
    if (!this.s.accounts.length) this.bootstrap(dataDir, env);
    else if (existsSync(join(dataDir, 'innkeeper-reset'))) this.rescue(join(dataDir, 'innkeeper-reset'));
    else if (this.s.accounts.some((a) => a.mustChange && a.role === 'innkeeper') && existsSync(this.firstFile)) {
      this.first = readFileSync(this.firstFile, 'utf8').trim() || null;
    }
  }

  /** The first start with accounts: the owner becomes the first Innkeeper and keeps their password. */
  private bootstrap(dataDir: string, env: NodeJS.ProcessEnv) {
    const old = readJson<{ password?: string }>(join(dataDir, 'innkeeper.json'), {});
    let password = old.password ?? '';
    let mustChange = false;
    if (!password) {
      const fromEnv = env.HEARTHFORGE_ADMIN_PASSWORD?.trim();
      let plain = fromEnv ?? '';
      if (!plain) {
        const kept = existsSync(this.firstFile) ? readFileSync(this.firstFile, 'utf8').trim() : '';
        plain = kept || randomBytes(9).toString('base64url');
        if (!kept) writePrivate(this.firstFile, `${plain}\n`);
        this.first = plain;
      }
      password = hashPassword(plain);
      mustChange = true;
    }
    this.s.accounts.push(this.make(FIRST_USERNAME, 'innkeeper', password, mustChange));
    this.save();
    if (old.password) console.log(`[accounts] Accounts are new on this server. The owner is now the account "${FIRST_USERNAME}", with the Innkeeper password as before.`);
  }

  /**
   * The owner forgot their password: an empty file named innkeeper-reset in the data folder gives
   * the account "innkeeper" (made again if it is gone) a new password, once, at the next start.
   */
  private rescue(flag: string) {
    let a = this.byName(FIRST_USERNAME);
    if (!a) { a = this.make(FIRST_USERNAME, 'innkeeper', '', true); this.s.accounts.push(a); }
    const plain = randomBytes(9).toString('base64url');
    a.password = hashPassword(plain);
    a.role = 'innkeeper';
    a.mustChange = true;
    this.s.sessions = Object.fromEntries(Object.entries(this.s.sessions).filter(([, s]) => s.account !== a!.id));
    writePrivate(this.firstFile, `${plain}\n`);
    this.first = plain;
    this.save();
    rmSync(flag, { force: true });
    console.log(`[accounts] The account "${FIRST_USERNAME}" got a new password because of the innkeeper-reset file.`);
  }

  private make(username: string, role: Role, password: string, mustChange: boolean): Account {
    const t = this.now();
    return { id: `${ACCOUNT_PREFIX}${randomBytes(6).toString('hex')}`, username, password, role, createdAt: t, lastSeen: 0, mustChange, stats: emptyPlayStats(), heroes: {} };
  }

  /** The made-up first password and where it is kept, for the server log. */
  get firstPasswordNote(): { username: string; password: string; file: string } | null {
    return this.first && existsSync(this.firstFile) ? { username: FIRST_USERNAME, password: this.first, file: this.firstFile } : null;
  }

  /** True while an Innkeeper still signs in with a password they did not choose. */
  get firstPasswordPending(): boolean {
    return this.s.accounts.some((a) => a.role === 'innkeeper' && a.mustChange);
  }

  private save() { writePrivate(this.file, JSON.stringify(this.s, null, 2)); }

  /** Stats change often while people play: write them a moment later, in one go. */
  private saveSoon() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.save(); }, 2000);
    this.saveTimer.unref?.();
  }

  flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.save();
  }

  private recent(key: string): number[] {
    const since = this.now() - WINDOW_MS;
    const list = (this.fails.get(key) ?? []).filter((t) => t > since);
    this.fails.set(key, list);
    return list;
  }

  private failed(ip: string) {
    this.recent(ip).push(this.now());
    this.recent('*').push(this.now());
  }

  private byName(username: string): Account | undefined {
    const key = cleanUsername(username).toLocaleLowerCase();
    return this.s.accounts.find((a) => a.username.toLocaleLowerCase() === key);
  }

  get(id: string): Account | undefined {
    return this.s.accounts.find((a) => a.id === id);
  }

  private view(a: Account): AccountView {
    return { id: a.id, username: a.username, role: a.role, createdAt: a.createdAt, lastSeen: a.lastSeen, mustChange: a.mustChange };
  }

  private open(a: Account, remember: boolean): string {
    const token = randomBytes(32).toString('hex');
    const t = this.now();
    // Each account keeps its newest sessions; the oldest go when there are too many.
    const others = Object.entries(this.s.sessions).filter(([, x]) => x.until > t && x.account !== a.id);
    const own = Object.entries(this.s.sessions).filter(([, x]) => x.until > t && x.account === a.id).sort((x, y) => y[1].until - x[1].until).slice(0, MAX_SESSIONS - 1);
    this.s.sessions = Object.fromEntries([...others, ...own]);
    this.s.sessions[sha(token)] = { account: a.id, until: t + (remember ? REMEMBER_MS : SESSION_MS) };
    a.lastSeen = t;
    this.save();
    return token;
  }

  private checkPassword(next: unknown): string {
    if (typeof next !== 'string' || next.length < PASSWORD_MIN || next.length > 200) throw new AccountsError('weak_password');
    return next;
  }

  private checkName(raw: unknown, except?: string): string {
    const name = cleanUsername(raw);
    if (!usernameOk(name)) throw new AccountsError('bad_name');
    const other = this.byName(name);
    if (other && other.id !== except) throw new AccountsError('name_taken');
    return name;
  }

  // ------------------------------------------------------------------ signing in

  login(username: string, password: string, remember: boolean, ip: string): { session: string; account: AccountView } {
    if (this.recent(ip).length >= TRIES || this.recent('*').length >= TRIES_ALL) throw new AccountsError('too_many');
    const a = typeof username === 'string' ? this.byName(username) : undefined;
    const ok = typeof password === 'string' && password.length > 0 && password.length <= 200 && !!a && verify(password, a.password);
    if (!ok || !a) { this.failed(ip); throw new AccountsError('wrong_login'); }
    this.fails.delete(ip);
    return { session: this.open(a, !!remember), account: this.view(a) };
  }

  /** The account a session token belongs to, while the session lasts. */
  account(token: unknown): AccountView | null {
    if (typeof token !== 'string' || token.length !== 64) return null;
    const s = this.s.sessions[sha(token)];
    if (!s || s.until <= this.now()) return null;
    const a = this.get(s.account);
    if (!a) return null;
    // Last seen is kept to the hour: no write for every request.
    if (this.now() - a.lastSeen > 3600_000) { a.lastSeen = this.now(); this.saveSoon(); }
    return this.view(a);
  }

  isInnkeeper(token: unknown): boolean {
    return this.account(token)?.role === 'innkeeper';
  }

  logout(token: string) {
    delete this.s.sessions[sha(String(token))];
    this.save();
  }

  /** Choose your own password. Every other session of the account ends. */
  changePassword(token: string, current: string, next: unknown, ip: string) {
    const me = this.account(token);
    const a = me && this.get(me.id);
    if (!a) throw new AccountsError('signed_out');
    if (this.recent(ip).length >= TRIES) throw new AccountsError('too_many');
    if (!verify(String(current ?? ''), a.password)) { this.failed(ip); throw new AccountsError('wrong_login'); }
    a.password = hashPassword(this.checkPassword(next));
    const wasFirst = a.mustChange && a.username === FIRST_USERNAME;
    a.mustChange = false;
    const key = sha(token);
    this.s.sessions = Object.fromEntries(Object.entries(this.s.sessions).filter(([k, s]) => s.account !== a.id || k === key));
    this.save();
    if (wasFirst || !this.firstPasswordPending) { this.first = null; rmSync(this.firstFile, { force: true }); }
  }

  // ------------------------------------------------------------------ invites

  invite(role: Role, note: string): InviteView {
    const t = this.now();
    this.s.invites = this.s.invites.filter((i) => i.expiresAt > t);
    const inv: Invite = { code: randomBytes(12).toString('base64url'), role: role === 'innkeeper' ? 'innkeeper' : 'player', note: String(note ?? '').trim().slice(0, 60), createdAt: t, expiresAt: t + INVITE_MS };
    this.s.invites.push(inv);
    this.save();
    return { ...inv };
  }

  invites(): InviteView[] {
    const t = this.now();
    return this.s.invites.filter((i) => i.expiresAt > t).map((i) => ({ ...i }));
  }

  revoke(code: string) {
    this.s.invites = this.s.invites.filter((i) => i.code !== code);
    this.save();
  }

  /** Whether an invite link still works, for the sign-up form. */
  checkInvite(code: unknown): { role: Role } | null {
    const inv = this.s.invites.find((i) => i.code === code && i.expiresAt > this.now());
    return inv ? { role: inv.role } : null;
  }

  /** Make an account from an invite link. The link works once. */
  redeem(code: unknown, username: unknown, password: unknown, remember: boolean, ip: string): { session: string; account: AccountView } {
    if (this.recent(ip).length >= TRIES || this.recent('*').length >= TRIES_ALL) throw new AccountsError('too_many');
    const inv = this.s.invites.find((i) => i.code === code && i.expiresAt > this.now());
    if (!inv) { this.failed(ip); throw new AccountsError('bad_invite'); }
    const name = this.checkName(username);
    const a = this.make(name, inv.role, hashPassword(this.checkPassword(password)), false);
    this.s.accounts.push(a);
    this.s.invites = this.s.invites.filter((i) => i !== inv);
    console.log(`[accounts] ${name} joined with an invite link${inv.note ? ` (${inv.note})` : ''}.`);
    return { session: this.open(a, !!remember), account: this.view(a) };
  }

  // ------------------------------------------------------------------ the Innkeeper's tools

  list(): AccountRow[] {
    return this.s.accounts.map((a) => ({ ...this.view(a), stats: { ...a.stats }, heroes: Object.keys(a.heroes).length, hasPassword: !!a.password }))
      .sort((x, y) => (x.role === y.role ? x.username.localeCompare(y.username) : x.role === 'innkeeper' ? -1 : 1));
  }

  /** A new account with a made-up password, shown to the Innkeeper once. */
  create(username: unknown, role: Role): { account: AccountView; password: string } {
    const name = this.checkName(username);
    const password = madeUpPassword();
    const a = this.make(name, role === 'innkeeper' ? 'innkeeper' : 'player', hashPassword(password), true);
    this.s.accounts.push(a);
    this.save();
    return { account: this.view(a), password };
  }

  private innkeepers() { return this.s.accounts.filter((a) => a.role === 'innkeeper' && a.password).length; }

  setRole(id: string, role: Role, by: string) {
    const a = this.get(id);
    if (!a) throw new AccountsError('not_found');
    if (id === by) throw new AccountsError('not_yourself');
    const next: Role = role === 'innkeeper' ? 'innkeeper' : 'player';
    if (a.role === 'innkeeper' && next === 'player' && this.innkeepers() <= 1) throw new AccountsError('last_innkeeper');
    a.role = next;
    this.save();
  }

  rename(id: string, username: unknown) {
    const a = this.get(id);
    if (!a) throw new AccountsError('not_found');
    a.username = this.checkName(username, id);
    this.save();
  }

  /** A forgotten password: a made-up one replaces it, and every session of the account ends. */
  reset(id: string, by: string): string {
    const a = this.get(id);
    if (!a) throw new AccountsError('not_found');
    if (id === by) throw new AccountsError('not_yourself');
    const password = madeUpPassword();
    a.password = hashPassword(password);
    a.mustChange = true;
    this.endSessions(id);
    return password;
  }

  remove(id: string, by: string) {
    const a = this.get(id);
    if (!a) throw new AccountsError('not_found');
    if (id === by) throw new AccountsError('not_yourself');
    if (a.role === 'innkeeper' && this.innkeepers() <= 1) throw new AccountsError('last_innkeeper');
    this.s.accounts = this.s.accounts.filter((x) => x !== a);
    this.endSessions(id);
    this.onDeleted?.(id);
  }

  private endSessions(id: string) {
    this.s.sessions = Object.fromEntries(Object.entries(this.s.sessions).filter(([, s]) => s.account !== id));
    this.save();
  }

  // ------------------------------------------------------------------ stats

  /** Add to an account's stats, and to each of the heroes named. Ids that are no account are ignored. */
  credit(id: string, delta: Partial<PlayStats>, heroes: HeroRef[] = []) {
    const a = this.get(id);
    if (!a) return;
    const add = (into: PlayStats) => { for (const [k, v] of Object.entries(delta) as [keyof PlayStats, number][]) if (Number.isFinite(v) && v > 0) into[k] += v; };
    add(a.stats);
    for (const h of heroes) {
      const key = `${h.table}/${h.id}`;
      const row = (a.heroes[key] ??= { ...emptyPlayStats(), table: h.table, tableTitle: h.tableTitle, heroId: h.id, name: h.name, classId: h.classId, level: h.level, lastPlayed: 0 });
      Object.assign(row, { tableTitle: h.tableTitle, name: h.name, classId: h.classId, level: h.level, lastPlayed: this.now() });
      add(row);
    }
    this.saveSoon();
  }

  profile(id: string): Profile | null {
    const a = this.get(id);
    if (!a) return null;
    return { account: this.view(a), stats: { ...a.stats }, heroes: Object.values(a.heroes).sort((x, y) => y.lastPlayed - x.lastPlayed).map((h) => ({ ...h })) };
  }

  // ------------------------------------------------------------------ backups

  /** For a backup: who has an account, with roles and stats. Never passwords or sessions. */
  exportable() {
    return this.s.accounts.map(({ password: _p, ...rest }) => rest);
  }

  /** Bring back accounts a backup has and this server does not. They get in once the Innkeeper resets their password. */
  restore(list: unknown): number {
    if (!Array.isArray(list)) return 0;
    let added = 0;
    for (const raw of list) {
      const r = raw as Partial<Account>;
      if (!r || typeof r.id !== 'string' || !r.id.startsWith(ACCOUNT_PREFIX) || typeof r.username !== 'string') continue;
      if (this.get(r.id) || this.byName(r.username) || !usernameOk(cleanUsername(r.username))) continue;
      this.s.accounts.push({
        id: r.id, username: cleanUsername(r.username), password: '', role: r.role === 'innkeeper' ? 'innkeeper' : 'player',
        createdAt: Number(r.createdAt) || this.now(), lastSeen: Number(r.lastSeen) || 0, mustChange: true,
        stats: { ...emptyPlayStats(), ...(r.stats ?? {}) }, heroes: r.heroes && typeof r.heroes === 'object' ? r.heroes : {},
      });
      added++;
    }
    if (added) this.save();
    return added;
  }
}
