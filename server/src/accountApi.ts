// Everything under /api/account: signing in and out, invite links, your own password and profile,
// and taking over the seats this browser had before accounts existed.
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isAccountId, type LegacySeat } from '../../shared/accounts';
import type { CreditView } from '../../shared/credits';
import { AccountsError, type Accounts } from './accounts';
import { BinError, type TableBin } from './bin';
import type { Room } from './room';

export const SESSION_HEADER = 'x-hearthforge-session';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface AccountApiContext {
  accounts: Accounts;
  rooms: Map<string, Room>;
  bin: TableBin;
  restoreTable(binId: number, by: { id: string; innkeeper: boolean }): { room: string; title: string };
  ipOf(req: IncomingMessage): string;
  tablesChanged(): void;
  /** An account's AI credit. */
  creditOf?(id: string): CreditView | null;
}

function readBody(req: IncomingMessage, max = 16 * 1024): Promise<Record<string, unknown>> {
  return new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) { fail(new AccountsError('bad_request')); req.resume(); } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!body || typeof body !== 'object' || Array.isArray(body)) fail(new AccountsError('bad_request'));
        else done(body);
      } catch { fail(new AccountsError('bad_request')); }
    });
    req.on('error', fail);
  });
}

/** Seats at the tables that belong to a browser id from before accounts, not to an account. */
export function legacySeats(rooms: Map<string, Room>): LegacySeat[] {
  const out: LegacySeat[] = [];
  for (const room of rooms.values()) {
    const s = room.game.s;
    for (const p of s.players) {
      if (isAccountId(p.id)) continue;
      out.push({ table: room.name, tableTitle: s.table.title, playerId: p.id, name: p.name, connected: p.connected, heroes: s.characters.filter((c) => c.ownerId === p.id).map((c) => c.name) });
    }
  }
  return out;
}

/**
 * The seats this browser took before accounts, proven by its old secret token, move to the account.
 * It happens once: afterwards the seats carry the account's id.
 */
export function claimSeats(rooms: Map<string, Room>, legacyId: string, legacyToken: string, accountId: string, username: string): { table: string; title: string; heroes: string[] }[] {
  if (!legacyId || isAccountId(legacyId) || legacyToken.length < 16) return [];
  const key = hashToken(legacyToken);
  const claimed: { table: string; title: string; heroes: string[] }[] = [];
  for (const room of rooms.values()) {
    const s = room.game.s;
    if (!s.players.some((p) => p.id === legacyId) || s.seats[legacyId] !== key) continue;
    const heroes = s.characters.filter((c) => c.ownerId === legacyId).map((c) => c.name);
    // The account's own name goes to the seat, unless someone else at the table already has it.
    const clash = s.players.some((p) => p.id !== legacyId && p.id !== accountId && p.name.toLocaleLowerCase() === username.toLocaleLowerCase());
    if (room.reassign(legacyId, accountId, clash ? undefined : username)) claimed.push({ table: room.name, title: s.table.title, heroes });
  }
  return claimed;
}

export async function accountApi(ctx: AccountApiContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify(body ?? { ok: true }));
  };
  const { accounts } = ctx;
  const path = url.pathname.slice('/api/account'.length) || '/';
  const token = String(req.headers[SESSION_HEADER] ?? '');
  const ip = ctx.ipOf(req);
  try {
    if (req.method === 'GET') {
      if (path === '/invite') {
        const inv = accounts.checkInvite(url.searchParams.get('code'));
        return inv ? send(200, inv) : send(404, { error: 'bad_invite' });
      }
      if (path === '/me') {
        const me = accounts.account(token);
        if (!me) return send(401, { error: 'signed_out' });
        return send(200, { ...accounts.profile(me.id), credit: ctx.creditOf?.(me.id) ?? undefined });
      }
      if (path === '/bin') {
        const me = accounts.account(token);
        if (!me) return send(401, { error: 'signed_out' });
        return send(200, { tables: ctx.bin.list(me.id) });
      }
      return send(404, { error: 'bad_request' });
    }
    if (req.method !== 'POST') return send(405, { error: 'bad_request' });
    const body = await readBody(req);
    switch (path) {
      case '/login': {
        try {
          const out = accounts.login(String(body.username ?? ''), String(body.password ?? ''), !!body.remember, ip);
          console.log(`[accounts] ${out.account.username} signed in from ${ip}.`);
          return send(200, out);
        } catch (err) {
          if (err instanceof AccountsError) console.warn(`[accounts] Refused sign-in from ${ip} (${err.code}).`);
          throw err;
        }
      }
      case '/join': return send(200, accounts.redeem(body.code, body.username, body.password, !!body.remember, ip));
      case '/logout': accounts.logout(token); return send(200, null);
      case '/password': accounts.changePassword(token, String(body.current ?? ''), body.next, ip); return send(200, null);
      case '/bin': {
        const me = accounts.account(token);
        if (!me) return send(401, { error: 'signed_out' });
        const by = { id: me.id, innkeeper: false };
        const id = Math.round(Number(body.id));
        if (body.do === 'restore') {
          const out = ctx.restoreTable(id, by);
          console.log(`[tables] ${me.username} brought the table "${out.title}" back from the bin.`);
        } else if (body.do === 'purge') ctx.bin.purge(id, by);
        else return send(400, { error: 'bad_request' });
        return send(200, { tables: ctx.bin.list(me.id) });
      }
      case '/claim': {
        const me = accounts.account(token);
        if (!me) return send(401, { error: 'signed_out' });
        const claimed = claimSeats(ctx.rooms, String(body.playerId ?? '').slice(0, 64), String(body.token ?? '').slice(0, 128), me.id, me.username);
        if (claimed.length) {
          console.log(`[accounts] ${me.username} took over their seats from before accounts at ${claimed.map((c) => `"${c.title}"`).join(', ')}.`);
          ctx.tablesChanged();
        }
        return send(200, { claimed });
      }
    }
    return send(404, { error: 'bad_request' });
  } catch (err) {
    if (err instanceof AccountsError) {
      const status = err.code === 'too_many' ? 429 : err.code === 'signed_out' || err.code === 'wrong_login' ? 401 : 400;
      return send(status, { error: err.code });
    }
    if (err instanceof BinError) return send(err.code === 'forbidden' ? 403 : 404, { error: err.code });
    console.error('[accounts]', err);
    send(500, { error: 'failed' });
  }
}
