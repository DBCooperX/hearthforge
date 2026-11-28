// The Innkeeper's side of the server: everything under /api/admin. Only a request that carries
// a live session may do anything beyond asking whether the panel exists and signing in.
import { campaignShelf } from '../campaign/registry';
import { storyLedger } from '../story/ledger';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { SETTINGS, type AdminCampaign, type AdminVariety, type AdminConnection, type AdminError, type AdminOverview, type AdminStatus, type AdminTable, type BackupInfo, type HttpsRequest } from '../../../shared/admin';
import type { InternalState } from '../game/engine';
import type { Room } from '../room';
import type { Auth } from './auth';
import { AccountsError, type Accounts } from '../accounts';
import { readBody as readRaw } from '../http';
import { SESSION_HEADER, legacySeats } from '../accountApi';
import { ROLES, type Role } from '../../../shared/accounts';
import { ConfigError, type Config } from './config';
import { BinError, type TableBin } from '../bin';
import type { Logs } from './logs';
import type { Updater } from './updater';
import { dayOf, type Usage } from './usage';
import { CreditsError, type Credits } from '../credits';
import type { Money } from '../../../shared/credits';

export const NOTICES = {
  restart5: 'The server restarts in 5 minutes. Your game is saved.',
  restart1: 'The server restarts in 1 minute. Your game is saved.',
  restartNow: 'The server is restarting. You will be back in a moment.',
  restartOff: 'The restart was called off.',
  update: 'A new version is being installed. The server restarts in a few minutes; your game is saved.',
} as const;

const BACKUP_FORMAT = 'hearthforge-backup';
const KEEP_BACKUPS = 14;
const MAX_RESTORE = 128 * 1024 * 1024;

export interface KeyTest {
  ok: boolean;
  /** invalid: the key was refused. unreachable: the API could not be reached. error: anything else. */
  reason?: 'none' | 'invalid' | 'unreachable' | 'error';
  detail?: string;
  /** Configured model ids this key cannot use. */
  missing?: string[];
}

export interface AdminContext {
  dataDir: string;
  version: string;
  startedAt: number;
  /** The environment the running server uses. */
  env: NodeJS.ProcessEnv;
  config: Config;
  auth: Auth;
  accounts: Accounts;
  usage: Usage;
  credits: Credits;
  logs: Logs;
  updater: Updater;
  store: { save(room: string, state: InternalState): void; info?(): { room: string; savedAt: string; bytes: number }[] };
  rooms: Map<string, Room>;
  openRoom(id: string): Room;
  bin: TableBin;
  /** The server's own sounds and icons. The audio and pictures stay in their folders; a backup keeps the lists. */
  sounds: { exportable(): { library: unknown; icons: unknown }; restoreList(d: { library?: unknown; icons?: unknown }): number };
  restoreTable(binId: number, by: { id: string; innkeeper: boolean }): { room: string; title: string };
  tablesChanged(): void;
  connections(): AdminConnection[];
  /** Close one connection, or every connection from an address. */
  disconnect(target: { id?: number; ip?: string }): void;
  /** A message to every connection, in the lobby and at the tables. */
  notice(text: string): void;
  dm: AdminOverview['dm'];
  ipOf(req: IncomingMessage): string;
  /** Save everything and end the process; Docker starts it again. */
  restart(): void;
  testKey(key: string, models: string[]): Promise<KeyTest>;
  /** Credits of these accounts changed: tell their players. */
  creditsChanged?(ids: string[]): void;
  now?: () => number;
}

class Refused extends Error {
  constructor(readonly status: number, readonly code: AdminError) { super(code); }
}


const readBody = (req: IncomingMessage, max: number) => readRaw(req, max, () => new Refused(413, 'too_big'));

const tableIdOk = (id: string) => /^[a-z0-9_-]{1,32}$/.test(id);
const backupNameOk = (name: string) => /^hearthforge-[0-9a-z-]{1,40}\.json$/.test(name);

export class AdminApi {
  private restartAt: number | null = null;
  private restartTimers: NodeJS.Timeout[] = [];
  private now: () => number;
  private backupDir: string;
  readonly enabled: boolean;

  constructor(private ctx: AdminContext) {
    this.now = ctx.now ?? Date.now;
    this.backupDir = join(ctx.dataDir, 'backups');
    this.enabled = (ctx.env.HEARTHFORGE_ADMIN ?? 'on').toLowerCase() !== 'off';
  }

  /** True when the request carries the live session of an account with the Innkeeper role. */
  authorised(req: IncomingMessage): boolean {
    return this.enabled && this.ctx.accounts.isInnkeeper(req.headers[SESSION_HEADER]);
  }

  /** Housekeeping that runs while the server is up: a backup a day, and updates when the owner asked for them. */
  start() {
    const tick = () => {
      try { this.dailyBackup(); } catch (err) { console.error('[innkeeper] the daily backup failed:', err); }
      this.autoUpdate();
    };
    setTimeout(tick, 60_000).unref?.();
    setInterval(tick, 15 * 60_000).unref?.();
  }

  private autoUpdate() {
    if ((this.ctx.env.HEARTHFORGE_AUTO_UPDATE ?? 'off') !== 'on') return;
    const s = this.ctx.updater.status();
    if (!s.connected || s.state !== 'idle' || s.behind < 1 || this.ctx.connections().some((c) => c.table)) return;
    // A version that already failed here waits for the owner, or for a newer one.
    if (s.failed && s.incoming[0]?.commit === s.failed) return;
    if (this.ctx.updater.request('update') === 'ok') console.log(`[innkeeper] Nobody is playing, so the new version is being installed (${s.behind} change${s.behind === 1 ? '' : 's'}).`);
  }

  async handle(req: IncomingMessage, res: ServerResponse, url: URL) {
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    try {
      const out = await this.route(req, url);
      if (out && typeof out === 'object' && 'download' in out) {
        const d = out as { download: string; name: string };
        return send(200, d.download, { 'content-disposition': `attachment; filename="${d.name}"` });
      }
      send(200, out ?? { ok: true });
    } catch (err) {
      if (err instanceof Refused) { req.resume(); return send(err.status, { error: err.code }); }
      if (err instanceof AccountsError) return send(err.code === 'too_many' ? 429 : err.code === 'signed_out' ? 401 : 400, { error: err.code });
      if (err instanceof BinError) return send(err.code === 'forbidden' ? 403 : 404, { error: 'not_found' });
      if (err instanceof ConfigError) return send(400, { error: 'bad_value', key: err.message });
      if (err instanceof SyntaxError) return send(400, { error: 'bad_request' });
      console.error('[innkeeper]', err);
      send(500, { error: 'failed' });
    }
  }

  private async json(req: IncomingMessage, max = 64 * 1024): Promise<Record<string, any>> {
    const body = JSON.parse((await readBody(req, max)).toString('utf8') || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Refused(400, 'bad_request');
    return body;
  }

  private async route(req: IncomingMessage, url: URL): Promise<unknown> {
    const { ctx } = this;
    const path = url.pathname.slice('/api/admin'.length) || '/';
    const get = req.method === 'GET', post = req.method === 'POST';
    if (!get && !post) throw new Refused(405, 'bad_request');

    if (get && path === '/status') return { enabled: this.enabled, firstPassword: this.enabled && ctx.accounts.firstPasswordPending } satisfies AdminStatus;
    if (!this.enabled) throw new Refused(403, 'disabled');

    const token = String(req.headers[SESSION_HEADER] ?? '');
    const me = ctx.accounts.account(token);
    if (!me) throw new Refused(401, 'signed_out');
    if (me.role !== 'innkeeper') throw new Refused(403, 'not_innkeeper');

    if (get) {
      switch (path) {
        case '/overview': return this.overview();
        case '/tables': return this.tables();
        case '/bin': return { tables: ctx.bin.list() };
        case '/variety': return this.variety();
        case '/campaign': return this.campaign(url.searchParams.get('id') ?? '');
        case '/players': return { connections: ctx.connections(), bans: ctx.auth.bans };
        case '/accounts': return this.accountList();
        case '/env': return { settings: ctx.config.list(), restartPending: ctx.config.pending };
        case '/https': return ctx.updater.https();
        case '/usage': return { ...ctx.usage.report((id) => ctx.rooms.get(id)?.game.s.table.title
          // Reading a campaign book when it arrives is booked under the book, not a table.
          ?? (id.startsWith('campaign:') ? `📖 ${campaignShelf()?.info(id.slice(9))?.title ?? id.slice(9)}` : id)), money: this.money() };
        case '/credits': return this.credits();
        case '/logs': return { lines: ctx.logs.since(Number(url.searchParams.get('after')) || 0) };
        case '/backups': return { backups: this.backups() };
        case '/backup': {
          const name = url.searchParams.get('name');
          if (!name) return { download: JSON.stringify(this.snapshot()), name: `hearthforge-${this.stamp()}.json` };
          if (!backupNameOk(name) || !existsSync(join(this.backupDir, name))) throw new Refused(404, 'not_found');
          return { download: readFileSync(join(this.backupDir, name), 'utf8'), name };
        }
        case '/table': {
          const room = ctx.rooms.get(url.searchParams.get('id') ?? '');
          if (!room) throw new Refused(404, 'not_found');
          room.saveNow();
          return { download: JSON.stringify(this.snapshot([room.name])), name: `hearthforge-${room.name}-${this.stamp()}.json` };
        }
      }
      throw new Refused(404, 'not_found');
    }

    switch (path) {
      case '/password': {
        const body = await this.json(req);
        ctx.accounts.changePassword(token, String(body.current ?? ''), body.next, ctx.ipOf(req));
        console.log(`[innkeeper] ${me.username} changed their password.`);
        return;
      }
      case '/accounts': {
        const body = await this.json(req);
        const { accounts } = ctx;
        const role: Role = ROLES.includes(body.role) ? body.role : 'player';
        const id = String(body.id ?? '');
        const name = () => accounts.get(id)?.username ?? id;
        let extra: Record<string, unknown> = {};
        switch (body.do) {
          case 'create': {
            const made = accounts.create(body.username, role);
            console.log(`[innkeeper] ${me.username} made the account ${made.account.username} (${role}).`);
            extra = { password: made.password, account: made.account };
            break;
          }
          case 'invite': {
            const inv = accounts.invite(role, String(body.note ?? ''));
            console.log(`[innkeeper] ${me.username} made an invite link (${role}).`);
            extra = { invite: inv };
            break;
          }
          case 'revoke': accounts.revoke(String(body.code ?? '')); break;
          case 'role': accounts.setRole(id, role, me.id); console.log(`[innkeeper] ${name()} is now ${role === 'innkeeper' ? 'an innkeeper' : 'a player'}.`); break;
          case 'rename': { const was = name(); accounts.rename(id, body.username); console.log(`[innkeeper] ${was} is now called ${name()}.`); break; }
          case 'stats': accounts.clearStats(id, body.what === 'hero' ? 'hero' : body.what === 'heroes' ? 'heroes' : 'all', typeof body.hero === 'string' ? body.hero : undefined); console.log(`[innkeeper] Stats of ${name()} were cleared.`); break;
          case 'reset': extra = { password: accounts.reset(id, me.id) }; console.log(`[innkeeper] The password of ${name()} was reset.`); break;
          case 'delete': { const who = name(); accounts.remove(id, me.id); console.log(`[innkeeper] The account ${who} was deleted.`); break; }
          case 'assign': {
            const target = accounts.get(id);
            const room = ctx.rooms.get(String(body.table ?? ''));
            if (!target) throw new AccountsError('not_found');
            if (!room) throw new Refused(404, 'not_found');
            const from = String(body.playerId ?? '');
            if (from.startsWith('acc_') || !room.reassign(from, target.id, target.username)) throw new Refused(404, 'not_found');
            console.log(`[innkeeper] A seat at "${room.game.s.table.title}" now belongs to ${target.username}.`);
            ctx.tablesChanged();
            break;
          }
          default: throw new Refused(400, 'bad_request');
        }
        return { ...this.accountList(), ...extra };
      }
      case '/credits': {
        const body = await this.json(req);
        const id = String(body.id ?? '');
        const target = () => { const a = ctx.accounts.get(id); if (!a) throw new Refused(404, 'not_found'); return a; };
        try {
          switch (body.do) {
            case 'config': ctx.credits.setConfig((body.config ?? {}) as Record<string, unknown>); console.log(`[innkeeper] ${me.username} changed the credit settings (credits ${ctx.credits.config.on ? 'on' : 'off'}, ${ctx.credits.config.currency}).`); ctx.creditsChanged?.(ctx.accounts.list().map((a) => a.id)); break;
            case 'top_up': { const a = target(); ctx.credits.topUp(a.id, body.amount, body.note); console.log(`[innkeeper] ${me.username} booked ${ctx.credits.config.currency} ${Number(body.amount).toFixed(2)} for ${a.username}.`); ctx.creditsChanged?.([a.id]); break; }
            case 'free': { const a = target(); ctx.credits.setFree(a.id, body.free === true); ctx.creditsChanged?.([a.id]); break; }
            default: throw new Refused(400, 'bad_request');
          }
        } catch (err) {
          if (err instanceof CreditsError) throw new Refused(err.code === 'not_found' ? 404 : 400, err.code);
          throw err;
        }
        if (body.do === 'config') ctx.creditsChanged?.(ctx.accounts.list().map((a) => a.id));
        return this.credits();
      }
      case '/tables': {
        const body = await this.json(req);
        const room = ctx.rooms.get(String(body.table ?? ''));
        if (!room) throw new Refused(404, 'not_found');
        if (body.do === 'delete') { console.log(`[innkeeper] Table "${room.game.s.table.title}" was deleted.`); ctx.auth.setPaused(room.name, false); room.close(me.username); }
        else if (body.do === 'pause' || body.do === 'resume') { ctx.auth.setPaused(room.name, body.do === 'pause'); room.flush(); }
        else if (body.do === 'test_on' || body.do === 'test_keep' || body.do === 'test_discard') {
          room.setTestMode(body.do === 'test_on', body.do !== 'test_discard');
          console.log(`[innkeeper] Test mode ${body.do === 'test_on' ? 'on' : body.do === 'test_keep' ? 'ended, changes kept' : 'ended, changes discarded'} at table "${room.game.s.table.title}".`);
        }
        else if (body.do === 'remove') room.remove(String(body.playerId ?? ''));
        else throw new Refused(400, 'bad_request');
        ctx.tablesChanged();
        return this.tables();
      }
      case '/variety': {
        const body = await this.json(req);
        if (body.do !== 'clear') throw new Refused(400, 'bad_request');
        storyLedger()?.clear();
        console.log(`[innkeeper] ${me.username} cleared the memory of earlier stories.`);
        return this.variety();
      }
      case '/bin': {
        const body = await this.json(req);
        const by = { id: me.id, innkeeper: true };
        const id = Math.round(Number(body.id));
        if (body.do === 'restore') {
          const out = ctx.restoreTable(id, by);
          console.log(`[innkeeper] The table "${out.title}" was brought back from the bin.`);
        } else if (body.do === 'purge') { ctx.bin.purge(id, by); console.log('[innkeeper] A table was deleted from the bin for good.'); }
        else throw new Refused(400, 'bad_request');
        return { tables: ctx.bin.list() };
      }
      case '/players': {
        const body = await this.json(req);
        if (body.do === 'disconnect') ctx.disconnect({ id: Number(body.id) });
        else if (body.do === 'ban') {
          const ip = String(body.ip ?? '').trim();
          if (!ip || ip === ctx.ipOf(req)) throw new Refused(400, 'bad_request'); // never lock yourself out
          ctx.auth.ban(ip, String(body.note ?? ''));
          ctx.disconnect({ ip });
          console.log(`[innkeeper] ${ip} was banned.`);
        } else if (body.do === 'unban') ctx.auth.unban(String(body.ip ?? ''));
        else throw new Refused(400, 'bad_request');
        return { connections: ctx.connections(), bans: ctx.auth.bans };
      }
      case '/env': {
        const body = await this.json(req);
        if (!body.values || typeof body.values !== 'object') throw new Refused(400, 'bad_request');
        ctx.config.set(body.values);
        console.log(`[innkeeper] Settings changed: ${Object.keys(body.values).join(', ')}.`);
        return { settings: ctx.config.list(), restartPending: ctx.config.pending };
      }
      case '/env/test': {
        const body = await this.json(req);
        const key = typeof body.key === 'string' && body.key.trim() ? body.key.trim() : ctx.config.next('ANTHROPIC_API_KEY');
        if (!key) return { ok: false, reason: 'none' } satisfies KeyTest;
        const forced = ctx.config.next('HEARTHFORGE_DM_FORCE_MODEL');
        const models = forced ? [forced] : SETTINGS.filter((d) => d.kind === 'model' && d.fallback).map((d) => ctx.config.next(d.key) || d.fallback);
        return ctx.testKey(key, [...new Set(models)]);
      }
      case '/server': {
        const body = await this.json(req);
        if (body.do === 'restart') return this.planRestart(Number(body.delay) || 0);
        if (body.do === 'cancel') return this.cancelRestart();
        if (body.do === 'check' || body.do === 'update') {
          const answer = ctx.updater.request(body.do);
          if (answer !== 'ok') throw new Refused(409, answer);
          if (body.do === 'update') { console.log('[innkeeper] Update requested.'); ctx.notice(NOTICES.update); for (const r of ctx.rooms.values()) r.saveNow(); }
          return;
        }
        throw new Refused(400, 'bad_request');
      }
      case '/https': {
        const body = await this.json(req);
        const answer = ctx.updater.requestHttps(body as unknown as HttpsRequest);
        if (answer !== 'ok') throw new Refused(answer === 'bad_value' ? 400 : 409, answer);
        // Behind Caddy every player would seem to come from Caddy's address; read the real one it passes on.
        if (body.mode === 'on' && ctx.config.next('HEARTHFORGE_TRUST_PROXY') !== 'on') ctx.config.set({ HEARTHFORGE_TRUST_PROXY: 'on' });
        console.log(`[innkeeper] HTTPS ${body.mode === 'off' ? 'switched off' : 'settings changed'}.`);
        return ctx.updater.https();
      }
      case '/notice': {
        const body = await this.json(req);
        const text = String(body.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
        if (!text) throw new Refused(400, 'bad_request');
        ctx.notice(text);
        console.log(`[innkeeper] Announcement: ${text}`);
        return;
      }
      case '/backup': {
        const name = `hearthforge-${this.stamp()}.json`;
        this.writeBackup(name);
        return { backups: this.backups() };
      }
      case '/backup/delete': {
        const body = await this.json(req);
        const name = String(body.name ?? '');
        if (!backupNameOk(name)) throw new Refused(400, 'bad_request');
        rmSync(join(this.backupDir, name), { force: true });
        return { backups: this.backups() };
      }
      case '/restore': {
        const name = url.searchParams.get('name');
        let raw: string;
        if (name) {
          if (!backupNameOk(name) || !existsSync(join(this.backupDir, name))) throw new Refused(404, 'not_found');
          raw = readFileSync(join(this.backupDir, name), 'utf8');
        } else raw = (await readBody(req, MAX_RESTORE)).toString('utf8');
        let data: unknown;
        try { data = JSON.parse(raw); } catch { throw new Refused(400, 'bad_backup'); }
        return this.restore(data, url.searchParams.get('settings') === '1');
      }
    }
    throw new Refused(404, 'not_found');
  }

  // ------------------------------------------------------------------ what the panel shows

  private overview(): AdminOverview {
    const { ctx } = this;
    const now = this.now();
    const rooms = [...ctx.rooms.values()];
    return {
      version: ctx.version,
      startedAt: ctx.startedAt,
      now,
      node: process.version,
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      docker: existsSync('/.dockerenv'),
      dm: ctx.dm,
      tables: rooms.length,
      playing: rooms.filter((r) => !r.empty).length,
      connections: ctx.connections().length,
      restartPending: ctx.config.pending,
      restartAt: this.restartAt,
      updater: ctx.updater.status(),
      usageToday: ctx.usage.totals(dayOf(now)),
      usageMonth: ctx.usage.totals(`${dayOf(now).slice(0, 7)}-01`),
      money: this.money(),
    };
  }

  private accountList() {
    const { accounts, rooms } = this.ctx;
    return { accounts: accounts.list(), invites: accounts.invites(), legacy: legacySeats(rooms) };
  }

  private money(): Money { const { currency, rate } = this.ctx.credits.config; return { currency, rate }; }

  private tables(): { tables: AdminTable[]; money: Money } {
    const { ctx } = this;
    const saved = new Map((ctx.store.info?.() ?? []).map((i) => [i.room, i]));
    const tables = [...ctx.rooms.values()].map((room): AdminTable => {
      const s = room.game.s;
      const info = saved.get(room.name);
      return {
        id: room.name,
        title: s.table.title,
        language: room.game.lang,
        phase: s.phase,
        paused: ctx.auth.paused(room.name),
        testMode: !!s.testMode,
        region: s.setting?.name ?? '',
        seed: s.table.start.seed ?? '',
        code: s.table.code,
        day: s.world ? Math.floor(s.world.minutes / 1440) + 1 : 0,
        maxPlayers: s.table.maxPlayers,
        hostId: s.hostId,
        players: s.players.map((p) => ({ id: p.id, name: p.name, connected: p.connected })),
        heroes: s.characters.map((c) => ({ name: c.name, classId: c.classId, level: c.level, owner: s.players.find((p) => p.id === c.ownerId)?.name ?? '' })),
        savedAt: info?.savedAt ?? '',
        sizeKb: Math.round((info?.bytes ?? 0) / 1024),
        usage: ctx.usage.totals('', room.name),
      };
    });
    tables.sort((a, b) => Number(b.players.some((p) => p.connected)) - Number(a.players.some((p) => p.connected)) || (a.savedAt < b.savedAt ? 1 : -1));
    return { tables, money: this.money() };
  }

  /** The names and quests of earlier tables, which new stories are nudged away from. */
  private variety(): AdminVariety {
    return storyLedger()?.summary() ?? { tables: 0, npcs: [], places: [], quests: [] };
  }

  /** The story of one table: what the Dungeon Master set up and what the party has found so far. */
  private campaign(id: string): AdminCampaign {
    const room = this.ctx.rooms.get(id);
    if (!room) throw new Refused(404, 'not_found');
    const s = room.game.s;
    const m = s.memory;
    const dayOf = (minutes: number) => Math.floor(minutes / 1440) + 1;
    const places = s.world?.locations ?? [];
    const placeName = (pid: string | null) => places.find((l) => l.id === pid)?.name ?? '';
    return {
      id: room.name,
      title: s.table.title,
      language: room.game.lang,
      phase: s.phase,
      day: s.world ? dayOf(s.world.minutes) : 0,
      region: s.setting?.name ?? '',
      premise: s.setting?.premise ?? '',
      premiseId: s.setting?.premiseId ?? '',
      custom: s.setting?.custom ?? '',
      chronicle: m.chronicle ?? '',
      quests: m.quests.map((q) => ({ id: q.id, title: q.title, status: q.status, summary: q.summary, notes: q.notes ?? [], rewardXp: q.rewardXp ?? 0, rewardGold: q.rewardGold ?? 0 })),
      mysteries: (m.mysteries ?? []).map((x) => ({ id: x.id, question: x.question, solved: x.solved, clues: x.clues.map((c) => ({ day: c.day, text: c.text, source: c.source, place: c.place })) })),
      secrets: (m.secrets ?? []).map((x) => ({ id: x.id, text: x.text, after: x.after, revealedDay: x.revealed === null ? null : dayOf(x.revealed) })),
      npcs: m.npcs.map((n) => ({ id: n.id, name: n.name, role: n.role, disposition: n.disposition, met: n.met, place: placeName(n.locationId), notes: n.notes ?? [] })),
      places: places.map((l) => ({ id: l.id, name: l.name, kind: l.kind, discovered: l.discovered, visited: l.visited, origin: l.origin, cleared: l.stages?.length ? (l.cleared ?? 0) : null, total: l.stages?.length ?? null })),
      factions: (s.factions ?? []).map((f) => ({ id: f.id, name: f.name, standing: f.standing })),
      timeline: (m.timeline ?? []).map((e) => ({ id: e.id, day: Math.floor(e.at / 1440) + 1, what: e.what, where: e.where, knownBy: e.knownBy, by: e.by, planned: !!e.planned })),
      journal: m.journal.map((j) => ({ day: j.day, text: j.text })),
      rumours: (m.rumours ?? []).map((r) => ({ text: r.text, day: r.day, heardDay: r.heard, from: placeName(r.fromId), aboutParty: r.aboutParty })),
    };
  }

  // ------------------------------------------------------------------ restart

  private clearRestart() {
    for (const t of this.restartTimers) clearTimeout(t);
    this.restartTimers = [];
    this.restartAt = null;
  }

  private planRestart(delayS: number) {
    const { ctx } = this;
    const delay = [0, 60, 300].includes(delayS) ? delayS : 0;
    this.clearRestart();
    const go = () => {
      ctx.notice(NOTICES.restartNow);
      console.log('[innkeeper] Restarting on request.');
      // Give the announcement a moment to reach the browsers.
      setTimeout(() => ctx.restart(), 400);
    };
    if (!delay) { this.restartAt = this.now(); go(); return { restartAt: this.restartAt }; }
    this.restartAt = this.now() + delay * 1000;
    ctx.notice(delay === 300 ? NOTICES.restart5 : NOTICES.restart1);
    if (delay === 300) this.restartTimers.push(setTimeout(() => ctx.notice(NOTICES.restart1), 240_000));
    this.restartTimers.push(setTimeout(go, delay * 1000));
    return { restartAt: this.restartAt };
  }

  private cancelRestart() {
    if (this.restartAt) this.ctx.notice(NOTICES.restartOff);
    this.clearRestart();
    return { restartAt: null };
  }

  // ------------------------------------------------------------------ backups

  private stamp(): string {
    return new Date(this.now()).toISOString().replace(/[:T]/g, '-').slice(0, 19);
  }

  /** Everything worth keeping, as one JSON document. API keys and passwords are never part of it. */
  private credits() {
    return this.ctx.credits.report(this.ctx.accounts.list().map((a) => ({ id: a.id, username: a.username, role: a.role })));
  }

  private snapshot(only?: string[]) {
    const { ctx } = this;
    const tables: Record<string, InternalState> = {};
    for (const room of ctx.rooms.values()) if (!only || only.includes(room.name)) tables[room.name] = room.game.s;
    return {
      format: BACKUP_FORMAT,
      version: 1,
      createdAt: new Date(this.now()).toISOString(),
      app: ctx.version,
      tables,
      ...(only ? {} : { ...ctx.sounds.exportable(), settings: ctx.config.exportable(), ...ctx.auth.exportable(), accounts: ctx.accounts.exportable(), credits: ctx.credits.exportable() }),
    };
  }

  private writeBackup(name: string) {
    mkdirSync(this.backupDir, { recursive: true });
    for (const room of this.ctx.rooms.values()) room.saveNow();
    writeFileSync(join(this.backupDir, name), JSON.stringify(this.snapshot()), { mode: 0o600 });
    const all = this.backups();
    for (const old of all.slice(KEEP_BACKUPS)) rmSync(join(this.backupDir, old.name), { force: true });
  }

  private dailyBackup() {
    if (!this.ctx.rooms.size) return;
    const today = dayOf(this.now());
    if (this.backups().some((b) => b.name.startsWith(`hearthforge-${today}`))) return;
    this.writeBackup(`hearthforge-${today}-daily.json`);
  }

  private backups(): BackupInfo[] {
    if (!existsSync(this.backupDir)) return [];
    return readdirSync(this.backupDir)
      .filter(backupNameOk)
      .map((name) => {
        const file = join(this.backupDir, name);
        const st = statSync(file);
        // The number of tables sits near the start of the file; reading all of it for a list would be wasteful.
        let tables = 0;
        try { tables = Object.keys((JSON.parse(readFileSync(file, 'utf8')) as { tables?: object }).tables ?? {}).length; } catch { /* shown as 0 */ }
        return { name, at: st.mtimeMs, sizeKb: Math.max(1, Math.round(st.size / 1024)), tables };
      })
      .sort((a, b) => b.at - a.at);
  }

  /** Put the tables of a backup back. Tables that are not in it stay as they are. */
  private restore(data: unknown, withSettings: boolean) {
    const { ctx } = this;
    const d = data as { format?: unknown; tables?: unknown; settings?: unknown; bans?: unknown; accounts?: unknown; credits?: unknown; library?: unknown; icons?: unknown };
    if (!d || typeof d !== 'object' || d.format !== BACKUP_FORMAT || !d.tables || typeof d.tables !== 'object') throw new Refused(400, 'bad_backup');
    const entries = Object.entries(d.tables as Record<string, InternalState>);
    for (const [id, s] of entries) {
      if (!tableIdOk(id) || !s || typeof s !== 'object' || !Array.isArray(s.players) || !Array.isArray(s.characters) || typeof s.phase !== 'string') throw new Refused(400, 'bad_backup');
    }
    // Whatever is about to be overwritten can be brought back.
    if (ctx.rooms.size) this.writeBackup(`hearthforge-${this.stamp()}-before-restore.json`);
    for (const [id, s] of entries) {
      ctx.rooms.get(id)?.retire();
      s.room = id;
      ctx.store.save(id, s);
      ctx.rooms.set(id, ctx.openRoom(id));
    }
    if (withSettings) {
      ctx.config.restore(d.settings);
      if (Array.isArray(d.bans)) for (const b of d.bans) if (b && typeof b.ip === 'string') ctx.auth.ban(b.ip, String(b.note ?? ''));
      const added = ctx.accounts.restore(d.accounts);
      if (added) console.log(`[innkeeper] ${added} account${added === 1 ? '' : 's'} came back from the backup. Reset their passwords to let them in.`);
      ctx.credits.restore(d.credits);
      const sounds = ctx.sounds.restoreList(d);
      if (sounds) console.log(`[innkeeper] ${sounds} sound or icon entr${sounds === 1 ? 'y' : 'ies'} came back from the backup.`);
    }
    ctx.tablesChanged();
    console.log(`[innkeeper] Restored ${entries.length} table${entries.length === 1 ? '' : 's'} from a backup.`);
    return { restored: entries.length, backups: this.backups(), restartPending: ctx.config.pending };
  }
}
