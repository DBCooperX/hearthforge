// Everything under /api/account: signing in and out, invite links, your own password and profile,
// and taking over the seats this browser had before accounts existed.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isAccountId, cleanSpec, type LegacySeat } from '../../shared/accounts';
import { checkSpec } from '../../shared/build';
import { ABILITY_KEYS } from '../../shared/rules';
import type { CharacterSpec } from '../../shared/types';
import type { CreditView } from '../../shared/credits';
import { AccountsError, type Accounts } from './accounts';
import { hashToken, readBody as readRaw } from './http';
import { BinError, type TableBin } from './bin';
import type { Room } from './room';
import { HeroRefError, type HeroRefs } from './heroRefs';
import { HERO_REF_MAX_BYTES, REF_ID } from '../../shared/accounts';

export const SESSION_HEADER = 'x-hearthforge-session';


export interface AccountApiContext {
  accounts: Accounts;
  rooms: Map<string, Room>;
  bin: TableBin;
  restoreTable(binId: number, by: { id: string; innkeeper: boolean }): { room: string; title: string };
  ipOf(req: IncomingMessage): string;
  tablesChanged(): void;
  /** An account's AI credit. */
  creditOf?(id: string): CreditView | null;
  /** Players' own pictures of their heroes, for the painter only. */
  heroRefs?: HeroRefs;
  /** Whether the painter can use such a picture right now. */
  refsUsable?(): boolean;
}


/** A JSON object body; anything else is a bad request. */
async function readBody(req: IncomingMessage, max = 16 * 1024): Promise<Record<string, unknown>> {
  const raw = await readRaw(req, max, () => new AccountsError('bad_request'));
  let body: unknown;
  try { body = JSON.parse(raw.toString('utf8') || '{}'); } catch { throw new AccountsError('bad_request'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AccountsError('bad_request');
  return body as Record<string, unknown>;
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
      if (path === '/heroes') {
        const me = accounts.account(token);
        if (!me) return send(401, { error: 'signed_out' });
        return send(200, { heroes: accounts.templates(me.id) });
      }
      if (path === '/hero-ref') {
        // Only the account the picture belongs to ever gets it back.
        const me = accounts.account(token);
        if (!me) return send(401, { error: 'signed_out' });
        const pic = ctx.heroRefs?.read(me.id, String(url.searchParams.get('id') ?? ''));
        if (!pic) return send(404, { error: 'not_found' });
        res.writeHead(200, { 'content-type': pic.mime, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-length': pic.data.length });
        return void res.end(pic.data);
      }
      if (path === '/bin') {
        const me = accounts.account(token);
        if (!me) return send(401, { error: 'signed_out' });
        return send(200, { tables: ctx.bin.list(me.id) });
      }
      return send(404, { error: 'bad_request' });
    }
    if (req.method !== 'POST') return send(405, { error: 'bad_request' });
    if (path === '/hero-ref/upload') {
      const me = accounts.account(token);
      if (!me || !ctx.heroRefs) { req.resume(); return send(401, { error: 'signed_out' }); }
      const bytes = await readRaw(req, HERO_REF_MAX_BYTES, () => new HeroRefError('picture_too_big'));
      const inUse = new Set(accounts.templates(me.id).map((h) => h.spec.refId).filter((x): x is string => !!x));
      const id = ctx.heroRefs.save(me.id, bytes, inUse);
      return send(200, { id, used: ctx.refsUsable?.() ?? false });
    }
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
      case '/rename': {
        const me = accounts.account(token);
        if (!me) return send(401, { error: 'signed_out' });
        const next = accounts.rename(me.id, body.username);
        if (next.username !== me.username) console.log(`[accounts] ${me.username} is now called ${next.username}.`);
        return send(200, accounts.profile(me.id));
      }
      case '/stats': {
        const me = accounts.account(token);
        if (!me) return send(401, { error: 'signed_out' });
        const what = body.what === 'hero' ? 'hero' : body.what === 'heroes' ? 'heroes' : 'all';
        accounts.clearStats(me.id, what, typeof body.hero === 'string' ? body.hero : undefined);
        return send(200, accounts.profile(me.id));
      }

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
      case '/hero-ref/delete': {
        const me = accounts.account(token);
        if (!me) return send(401, { error: 'signed_out' });
        // A picture a saved hero still uses is only removed by changing that hero.
        const id = String(body.id ?? '');
        if (REF_ID.test(id) && !accounts.templates(me.id).some((h) => h.spec.refId === id)) ctx.heroRefs?.remove(me.id, id);
        return send(200, null);
      }
      case '/heroes': {
        const me = accounts.account(token);
        if (!me) return send(401, { error: 'signed_out' });
        /** Forget a picture, unless another saved hero of the account uses it too. */
        const dropRef = (account: string, id: string) => { if (!accounts.templates(account).some((h) => h.spec.refId === id)) ctx.heroRefs?.remove(account, id); };
        const room = ctx.rooms.get(String(body.table ?? ''));
        const own = (id: unknown) => (typeof id === 'string' ? accounts.template(me.id, id) : undefined);
        if (body.do === 'delete') {
          if (typeof body.id !== 'string') return send(400, { error: 'bad_request' });
          const gone = own(body.id)?.spec.refId;
          accounts.removeTemplate(me.id, body.id);
          if (gone) dropRef(me.id, gone);
        } else if (body.do === 'save') {
          const spec = cleanSpec(body.spec);
          const old = own(body.id);
          if (body.id && !old) return send(404, { error: 'not_found' });
          // Rolled scores count only if the server rolled them: at this table, or already in the hero being edited.
          const rolled = room?.game.s.rolled[me.id];
          const kept = old?.spec.method === 'roll' && old.spec.base ? ABILITY_KEYS.map((k) => old.spec.base[k]) : undefined;
          if (!spec || !spec.name || (checkSpec(spec, rolled).length && checkSpec(spec, kept).length)) return send(400, { error: 'bad_hero' });
          accounts.saveTemplate(me.id, spec, old?.id);
          // A picture the saved hero no longer has goes away with the change.
          if (old?.spec.refId && old.spec.refId !== spec.refId) dropRef(me.id, old.spec.refId);
        } else if (body.do === 'from_hero') {
          if (!room) return send(404, { error: 'not_found' });
          let spec: CharacterSpec | null;
          try { spec = room.game.recipe(me.id, String(body.characterId ?? '')); } catch { return send(400, { error: 'bad_request' }); }
          if (!spec) return send(400, { error: 'no_recipe' });
          const clean = cleanSpec(spec);
          const hero = room.game.s.characters.find((c) => c.id === body.characterId);
          // The recipe was checked when the hero was made, rolled scores included.
          const rolled = clean?.method === 'roll' && clean.base ? ABILITY_KEYS.map((k) => clean.base[k]) : undefined;
          if (!clean || !clean.name || checkSpec(clean, rolled).length) return send(400, { error: 'bad_hero' });
          const saved = accounts.saveTemplate(me.id, clean, own(hero?.templateId)?.id);
          if (hero && hero.templateId !== saved.id) { hero.templateId = saved.id; room.flush(); }
        } else return send(400, { error: 'bad_request' });
        return send(200, { heroes: accounts.templates(me.id) });
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
    if (err instanceof HeroRefError) return send(err.code === 'picture_too_big' ? 413 : 400, { error: err.code });
    if (err instanceof AccountsError) {
      const status = err.code === 'too_many' ? 429 : err.code === 'signed_out' || err.code === 'wrong_login' ? 401 : 400;
      return send(status, { error: err.code });
    }
    if (err instanceof BinError) return send(err.code === 'forbidden' ? 403 : 404, { error: err.code });
    console.error('[accounts]', err);
    send(500, { error: 'failed' });
  }
}
