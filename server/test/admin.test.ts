// The Innkeeper: who gets in, what the settings file does to the environment, what the AI costs,
// and the admin API end to end over a real HTTP server.
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import type { AdminConnection, AdminOverview, AdminTable, SettingValue } from '../../shared/admin';
import type { ServerMessage } from '../../shared/types';
import { AdminApi, NOTICES, type AdminContext } from '../src/admin/api';
import { Auth } from '../src/admin/auth';
import { Accounts } from '../src/accounts';
import { Config, ConfigError, mask } from '../src/admin/config';
import { Logs } from '../src/admin/logs';
import { Updater } from '../src/admin/updater';
import { Usage } from '../src/admin/usage';
import { Credits } from '../src/credits';
import type { Store } from '../src/db';
import { TableBin } from '../src/bin';
import { MemoryStore } from './memoryStore';
import { ScriptedDM } from '../src/dm/scripted';
import { PAUSED_MESSAGE, Room } from '../src/room';

const dir = () => mkdtempSync(join(tmpdir(), 'hf-admin-'));

describe('innkeeper settings', () => {
  it('lays saved settings over the environment at the next start', () => {
    const d = dir();
    const base = { ANTHROPIC_API_KEY: 'sk-ant-from-env-0000000000', HEARTHFORGE_TURN_WAIT: '8' };
    const config = new Config(d, base);
    expect(config.env.ANTHROPIC_API_KEY).toBe(base.ANTHROPIC_API_KEY);
    config.set({ ANTHROPIC_API_KEY: 'sk-ant-new-key-1234567890abcd', HEARTHFORGE_TURN_WAIT: '12', HEARTHFORGE_MUSIC: 'off' });
    // The running server keeps its values until it restarts.
    expect(config.env.ANTHROPIC_API_KEY).toBe(base.ANTHROPIC_API_KEY);
    expect(config.pending).toBe(true);
    const next = new Config(d, base);
    expect(next.env).toMatchObject({ ANTHROPIC_API_KEY: 'sk-ant-new-key-1234567890abcd', HEARTHFORGE_TURN_WAIT: '12', HEARTHFORGE_MUSIC: 'off' });
    expect(next.pending).toBe(false);
    // null hands a setting back to the installer's value.
    next.set({ ANTHROPIC_API_KEY: null });
    expect(new Config(d, base).env.ANTHROPIC_API_KEY).toBe(base.ANTHROPIC_API_KEY);
  });

  it('never shows a secret in full and never puts one in a backup', () => {
    const config = new Config(dir(), {});
    config.set({ ANTHROPIC_API_KEY: 'sk-ant-api03-abcdefghijklmnop-WXYZ', HEARTHFORGE_DM_EFFORT: 'high' });
    const key = config.list().find((s) => s.key === 'ANTHROPIC_API_KEY')!;
    expect(key).toMatchObject({ value: 'sk-ant-…WXYZ', source: 'panel', set: true });
    expect(JSON.stringify(config.list())).not.toContain('abcdefghijklmnop');
    expect(config.exportable()).toEqual({ HEARTHFORGE_DM_EFFORT: 'high' });
    expect(mask('short')).toBe('••••••••');
  });

  it('refuses values that are not allowed', () => {
    const config = new Config(dir(), {});
    expect(() => config.set({ HEARTHFORGE_DM_EFFORT: 'extreme' })).toThrow(ConfigError);
    expect(() => config.set({ HEARTHFORGE_TURN_WAIT: '-1' })).toThrow(ConfigError);
    expect(() => config.set({ HEARTHFORGE_TURN_WAIT: 'soon' })).toThrow(ConfigError);
    expect(() => config.set({ HEARTHFORGE_DM_MODEL_KEY: 'claude opus; rm -rf' })).toThrow(ConfigError);
    expect(() => config.set({ ANTHROPIC_API_KEY: 'two\nlines' })).toThrow(ConfigError);
    expect(() => config.set({ PATH: '/tmp' })).toThrow(ConfigError);
    expect(() => config.set({ DATA_DIR: '/elsewhere' })).toThrow(ConfigError);
    expect(config.pending).toBe(false);
  });
});

describe('AI costs', () => {
  it('adds up tokens per day, table and model and prices them', () => {
    let now = Date.parse('2026-11-15T10:00:00Z');
    const d = dir();
    const usage = new Usage(d, () => now);
    usage.record({ table: 'friday', model: 'claude-sonnet-5-5', input: 1_000_000, output: 100_000, cacheRead: 2_000_000, cacheWrite: 0 });
    usage.record({ table: 'friday', model: 'claude-opus-5-5', input: 0, output: 50_000, cacheRead: 0, cacheWrite: 400_000 });
    now += 86400000;
    usage.record({ table: 'solo', model: 'claude-haiku-5-5', input: 500_000, output: 0, cacheRead: 0, cacheWrite: 0 });
    // Sonnet: 2 + 1 + 0.2. Opus: 1 + 400k at 4 * 1.25 = 2.
    expect(usage.totals('', 'friday').cost).toBeCloseTo(6.2, 5);
    expect(usage.totals('2026-11-16').cost).toBeCloseTo(0.05, 5);
    usage.flush();
    const report = new Usage(d, () => now).report((id) => id.toUpperCase());
    expect(report.days.map((x) => x.day)).toEqual(['2026-11-16', '2026-11-15']);
    expect(report.tables[0]).toMatchObject({ table: 'friday', title: 'FRIDAY', calls: 2 });
    expect(report.models.map((m) => m.model)).toEqual(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5']);
    expect(report.total.calls).toBe(3);
  });

  it('says so when it does not know what a model costs', () => {
    const usage = new Usage(dir());
    usage.record({ table: 't', model: 'some-future-model', input: 10, output: 10, cacheRead: 0, cacheWrite: 0 });
    expect(usage.totals().cost).toBeNull();
    expect(usage.totals().output).toBe(10);
  });
});

describe('the updater as the server sees it', () => {
  it('only counts as running while it shows signs of life, and takes one request at a time', () => {
    const d = dir();
    let now = 1_700_000_000_000;
    const updater = new Updater(d, () => now);
    expect(updater.status().connected).toBe(false);
    expect(updater.request('update')).toBe('no_updater');
    writeFileSync(join(d, 'control', 'heartbeat'), String(now / 1000));
    writeFileSync(join(d, 'control', 'status'), 'state=idle\ncommit=abc1234\nbehind=2\nmessage=Updated to abc1234.\n');
    writeFileSync(join(d, 'control', 'incoming'), 'def5678\t2026-11-15T09:00:00Z\tAdd a thing\n');
    writeFileSync(join(d, 'control', 'updater.log'), 'one\n');
    expect(updater.status()).toMatchObject({ connected: true, state: 'idle', commit: 'abc1234', behind: 2, incoming: [{ subject: 'Add a thing' }] });
    expect(updater.request('update')).toBe('ok');
    expect(readFileSync(join(d, 'control', 'request'), 'utf8')).toBe('update\n');
    expect(updater.request('check')).toBe('busy');
    now += 5 * 60 * 1000;
    expect(updater.status().connected).toBe(false);
  });
});

// ------------------------------------------------------------------------------ the API

function socket() {
  const sent: ServerMessage[] = [];
  const ws = { OPEN: 1, readyState: 1, send: (data: string) => { sent.push(JSON.parse(data)); } } as unknown as WebSocket;
  return { ws, sent };
}

interface Rig { url: string; ctx: AdminContext; rooms: Map<string, Room>; store: MemoryStore; notices: string[]; restarts: number; closed: unknown[]; session: string; server: Server; dataDir: string }
const servers: Server[] = [];
afterEach(() => { for (const s of servers.splice(0)) s.close(); });

async function rig(env: NodeJS.ProcessEnv = { HEARTHFORGE_ADMIN_PASSWORD: 'open sesame' }): Promise<Rig> {
  const dataDir = dir();
  const store = new MemoryStore();
  const rooms = new Map<string, Room>();
  const config = new Config(dataDir, env);
  const auth = new Auth(dataDir);
  const accounts = new Accounts(dataDir, config.env);
  const bin = new TableBin(store, accounts);
  const openRoom = (id: string): Room => new Room(id, new ScriptedDM(), store as unknown as Store, {}, { closed: (r) => void rooms.delete(r.name), paused: (r) => auth.paused(r.name), binned: (state, by) => { bin.add(state, by); } });
  const restoreTable = (binId: number, by: { id: string; innkeeper: boolean }) => {
    const out = bin.restore(binId, by, (id) => rooms.has(id), () => false);
    rooms.set(out.room, openRoom(out.room));
    return out;
  };
  const out = { notices: [] as string[], restarts: 0, closed: [] as unknown[] };
  const ctx: AdminContext = {
    dataDir, version: '0.1.0', startedAt: Date.now() - 5000, env: config.env, config, auth, accounts,
    usage: new Usage(dataDir), credits: new Credits(dataDir), logs: new Logs(), updater: new Updater(dataDir),
    store, rooms, openRoom, bin, restoreTable, tablesChanged: () => {},
    connections: (): AdminConnection[] => [{ id: 7, ip: '192.168.1.20', since: Date.now() - 60000, agent: 'Firefox/130', table: '', tableTitle: '', name: '', playerId: '', host: false }],
    disconnect: (target) => void out.closed.push(target),
    notice: (text) => void out.notices.push(text),
    dm: { mode: 'scripted', background: null, standard: null, key: null, forced: null },
    ipOf: () => '192.168.1.10',
    restart: () => { out.restarts++; },
    testKey: async (key, models) => (key === 'sk-ant-good' ? { ok: true, missing: models.filter((m) => m.includes('opus')) } : { ok: false, reason: 'invalid' }),
  };
  const api = new AdminApi(ctx);
  const server = createServer((req, res) => void api.handle(req, res, new URL(req.url ?? '/', 'http://localhost')));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin`;
  const r: Rig = { url, ctx, rooms, store, session: '', server, dataDir, ...out, get notices() { return out.notices; }, get restarts() { return out.restarts; }, get closed() { return out.closed; } };
  if (api.enabled) r.session = accounts.login('innkeeper', 'open sesame', false, '127.0.0.1').session;
  return r;
}

async function call(r: Rig, path: string, body?: unknown, session = r.session) {
  const res = await fetch(r.url + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-hearthforge-session': session, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* a download */ }
  return { status: res.status, body: parsed, headers: res.headers };
}

function seatTable(r: Rig, id: string, players: string[]) {
  const room = r.ctx.openRoom(id);
  r.rooms.set(id, room);
  const socks = players.map((name) => { const s = socket(); room.join(s.ws, name.toLowerCase(), `token-of-${name}-1234567890`, name); return s; });
  room.game.s.table.title = `${id} night`;
  room.saveNow();
  return { room, socks };
}

describe('innkeeper API', () => {
  it('tells anyone whether the panel exists, and nothing else without a session', async () => {
    const r = await rig();
    expect((await call(r, '/status', undefined, '')).body).toEqual({ enabled: true, firstPassword: true });
    for (const path of ['/overview', '/tables', '/campaign?id=friday', '/players', '/env', '/usage', '/logs', '/backups', '/backup']) {
      expect((await call(r, path, undefined, '')).status, path).toBe(401);
      expect((await call(r, path, undefined, 'f'.repeat(64))).status, path).toBe(401);
    }
    for (const path of ['/env', '/server', '/tables', '/players', '/notice', '/restore', '/password']) {
      expect((await call(r, path, { do: 'restart', values: {} }, '')).body, path).toEqual({ error: 'signed_out' });
    }
    expect(r.restarts).toBe(0);
    // A player's account is turned away too.
    const player = r.ctx.accounts.create('Mira', 'player');
    const mira = r.ctx.accounts.login('Mira', player.password, false, '1.2.3.4').session;
    expect((await call(r, '/overview', undefined, mira)).body).toEqual({ error: 'not_innkeeper' });
  });

  it('can be switched off altogether', async () => {
    const r = await rig({ HEARTHFORGE_ADMIN: 'off', HEARTHFORGE_ADMIN_PASSWORD: 'open sesame' });
    expect((await call(r, '/status')).body).toEqual({ enabled: false, firstPassword: false });
    expect((await call(r, '/overview')).status).toBe(403);
  });

  it('shows the server at a glance', async () => {
    const r = await rig();
    seatTable(r, 'friday', ['Chris', 'Mira']);
    const o = (await call(r, '/overview')).body as AdminOverview;
    expect(o).toMatchObject({ version: '0.1.0', tables: 1, playing: 1, connections: 1, restartPending: false, restartAt: null, dm: { mode: 'scripted' } });
    expect(o.updater.connected).toBe(false);
  });

  it('shows the story of a table, with what the party has not found marked', async () => {
    const r = await rig();
    const { room } = seatTable(r, 'friday', ['Chris']);
    const m = room.game.s.memory;
    m.chronicle = 'The party reached the mill.';
    m.secrets = [{ id: 's1', text: 'The miller is the culprit.', after: 'the ledger is found', notBefore: null, revealed: null }, { id: 's2', text: 'The well is cursed.', after: 'x', notBefore: null, revealed: 1500 }];
    m.mysteries = [{ id: 'm1', question: 'Who poisoned the well?', solved: false, clues: [{ day: 1, text: 'A wet coin', source: 'Griet', place: 'the mill' }] }];
    m.timeline = [{ id: 'e1', at: -2880, what: 'The miller hid the ledger', where: 'the mill', knownBy: '', by: 'story' }];
    const c = (await call(r, '/campaign?id=friday')).body;
    expect(c).toMatchObject({ id: 'friday', chronicle: 'The party reached the mill.', mysteries: [{ question: 'Who poisoned the well?', clues: [{ text: 'A wet coin' }] }] });
    expect(c.secrets).toEqual([{ id: 's1', text: 'The miller is the culprit.', after: 'the ledger is found', revealedDay: null }, { id: 's2', text: 'The well is cursed.', after: 'x', revealedDay: 2 }]);
    expect(c.timeline[0]).toMatchObject({ day: -1, by: 'story' });
    expect((await call(r, '/campaign?id=nope')).status).toBe(404);
  });

  it('lists tables and lets the innkeeper pause, clear and delete them', async () => {
    const r = await rig();
    const { room, socks } = seatTable(r, 'friday', ['Chris', 'Mira']);
    const tables = (await call(r, '/tables')).body.tables as AdminTable[];
    expect(tables[0]).toMatchObject({ id: 'friday', title: 'friday night', phase: 'lobby', paused: false, players: [{ name: 'Chris', connected: true }, { name: 'Mira', connected: true }] });

    await call(r, '/tables', { table: 'friday', do: 'pause' });
    room.handle(socks[0].ws, { t: 'make_host', playerId: 'mira' });
    expect(socks[0].sent.at(-1)).toEqual({ t: 'error', message: PAUSED_MESSAGE });
    expect(room.game.s.hostId).toBe('chris');
    await call(r, '/tables', { table: 'friday', do: 'resume' });
    room.handle(socks[0].ws, { t: 'make_host', playerId: 'mira' });
    expect(room.game.s.hostId).toBe('mira');

    await call(r, '/tables', { table: 'friday', do: 'remove', playerId: 'mira' });
    expect(socks[1].sent.at(-1)).toEqual({ t: 'left', reason: 'removed' });
    expect(room.game.s.players.map((p) => p.name)).toEqual(['Chris']);

    const after = (await call(r, '/tables', { table: 'friday', do: 'delete' })).body.tables;
    expect(after).toEqual([]);
    expect(socks[0].sent.at(-1)).toEqual({ t: 'left', reason: 'closed' });
    expect(r.store.names()).toEqual([]);
    expect((await call(r, '/tables', { table: 'friday', do: 'delete' })).status).toBe(404);

    // The deleted table waits in the bin, and the Innkeeper can bring it back.
    const waiting = (await call(r, '/bin')).body.tables;
    expect(waiting).toMatchObject([{ title: 'friday night', deletedBy: 'innkeeper' }]);
    expect((await call(r, '/bin', { do: 'restore', id: waiting[0].id })).body.tables).toEqual([]);
    expect(r.store.names()).toEqual(['friday']);
    expect(r.rooms.get('friday')?.game.s.players.map((p) => p.name)).toEqual(['Chris']);
    expect((await call(r, '/bin', { do: 'restore', id: waiting[0].id })).status).toBe(404);
  });

  it('shows who is connected and bans by address, but never the innkeeper\'s own', async () => {
    const r = await rig();
    const players = (await call(r, '/players')).body;
    expect(players.connections[0]).toMatchObject({ ip: '192.168.1.20', agent: 'Firefox/130' });
    await call(r, '/players', { do: 'disconnect', id: 7 });
    expect(r.closed).toEqual([{ id: 7 }]);
    const banned = (await call(r, '/players', { do: 'ban', ip: '192.168.1.20', note: 'Tom' })).body;
    expect(banned.bans).toMatchObject([{ ip: '192.168.1.20', note: 'Tom' }]);
    expect(r.ctx.auth.banned('192.168.1.20')).toBe(true);
    expect(r.closed.at(-1)).toEqual({ ip: '192.168.1.20' });
    expect((await call(r, '/players', { do: 'ban', ip: '192.168.1.10' })).status).toBe(400);
    expect((await call(r, '/players', { do: 'unban', ip: '192.168.1.20' })).body.bans).toEqual([]);
  });

  it('changes settings and the API key without ever sending the key back', async () => {
    const r = await rig();
    const saved = (await call(r, '/env', { values: { ANTHROPIC_API_KEY: 'sk-ant-api03-secretsecretsecret-TAIL', HEARTHFORGE_TURN_WAIT: '15' } })).body;
    const byKey = Object.fromEntries((saved.settings as SettingValue[]).map((s) => [s.key, s]));
    expect(byKey.ANTHROPIC_API_KEY).toMatchObject({ value: 'sk-ant-…TAIL', source: 'panel', set: true, pending: true });
    expect(byKey.HEARTHFORGE_TURN_WAIT).toMatchObject({ value: '15', pending: true });
    expect(byKey.HEARTHFORGE_DM_MODEL_KEY).toMatchObject({ value: 'claude-opus-5-5', source: 'default' });
    expect(saved.restartPending).toBe(true);
    expect(JSON.stringify((await call(r, '/env')).body)).not.toContain('secretsecret');
    expect(JSON.stringify((await call(r, '/overview')).body)).not.toContain('secretsecret');
    expect((await call(r, '/env', { values: { HEARTHFORGE_DM_EFFORT: 'silly' } })).body).toEqual({ error: 'bad_value', key: 'HEARTHFORGE_DM_EFFORT' });
    // The file on disk is for the server only.
    expect(readFileSync(join(r.dataDir, 'settings.json'), 'utf8')).toContain('secretsecret');
  });

  it('tests a key against the models in use', async () => {
    const r = await rig();
    expect((await call(r, '/env/test', {})).body).toEqual({ ok: false, reason: 'none' });
    expect((await call(r, '/env/test', { key: 'sk-ant-bad' })).body).toEqual({ ok: false, reason: 'invalid' });
    expect((await call(r, '/env/test', { key: 'sk-ant-good' })).body).toEqual({ ok: true, missing: ['claude-opus-5-5'] });
    await call(r, '/env', { values: { ANTHROPIC_API_KEY: 'sk-ant-good', HEARTHFORGE_DM_FORCE_MODEL: 'claude-sonnet-5-5' } });
    expect((await call(r, '/env/test', {})).body).toEqual({ ok: true, missing: [] });
  });

  it('restarts at once or after a warning, and the warning can be called off', async () => {
    const r = await rig();
    const planned = (await call(r, '/server', { do: 'restart', delay: 300 })).body;
    expect(planned.restartAt).toBeGreaterThan(Date.now() + 290_000);
    expect(r.notices).toEqual([NOTICES.restart5]);
    expect((await call(r, '/overview')).body.restartAt).toBe(planned.restartAt);
    await call(r, '/server', { do: 'cancel' });
    expect(r.notices.at(-1)).toBe(NOTICES.restartOff);
    expect((await call(r, '/overview')).body.restartAt).toBeNull();
    await call(r, '/server', { do: 'restart' });
    expect(r.notices.at(-1)).toBe(NOTICES.restartNow);
    await new Promise((done) => setTimeout(done, 500));
    expect(r.restarts).toBe(1);
  });

  it('asks the updater, and says so when there is none', async () => {
    const r = await rig();
    expect((await call(r, '/server', { do: 'update' })).body).toEqual({ error: 'no_updater' });
    mkdirSync(join(r.dataDir, 'control'), { recursive: true });
    writeFileSync(join(r.dataDir, 'control', 'heartbeat'), String(Date.now() / 1000));
    expect((await call(r, '/server', { do: 'update' })).status).toBe(200);
    expect(readFileSync(join(r.dataDir, 'control', 'request'), 'utf8').trim()).toBe('update');
    expect(r.notices).toEqual([NOTICES.update]);
    expect((await call(r, '/server', { do: 'check' })).body).toEqual({ error: 'busy' });
    expect((await call(r, '/server', { do: 'rm -rf /' })).status).toBe(400);
  });

  it('sends an announcement to everyone', async () => {
    const r = await rig();
    await call(r, '/notice', { text: '  Pizza   is here  ' });
    expect(r.notices).toEqual(['Pizza is here']);
    expect((await call(r, '/notice', { text: '   ' })).status).toBe(400);
  });

  it('books what players paid in, and switches credits on and off', async () => {
    const r = await rig();
    const told: string[][] = [];
    r.ctx.creditsChanged = (ids) => void told.push(ids);
    const mira = r.ctx.accounts.create('Mira', 'player').account;
    let rep = (await call(r, '/credits')).body;
    expect(rep.config).toMatchObject({ on: false, chfPerUsd: 0.85, warnChf: 2, voiceUsdPer1k: { elevenlabs: 0.04 } });
    expect(rep.rows.map((x: { username: string }) => x.username)).toEqual(['innkeeper', 'Mira']);
    rep = (await call(r, '/credits', { do: 'top_up', id: mira.id, chf: 10, note: 'TWINT' })).body;
    expect(rep.rows[1]).toMatchObject({ paid: 10, limited: false, topUps: [{ chf: 10, note: 'TWINT' }] });
    expect(told).toEqual([[mira.id]]);
    rep = (await call(r, '/credits', { do: 'config', config: { on: true, warnChf: 3 } })).body;
    expect(rep.config).toMatchObject({ on: true, warnChf: 3, chfPerUsd: 0.85 });
    expect(rep.rows[1]).toMatchObject({ limited: true, balance: 10 });
    expect(rep.rows[0]).toMatchObject({ limited: false });
    expect((await call(r, '/credits', { do: 'config', config: { chfPerUsd: 'lots' } })).body).toEqual({ error: 'bad_value' });
    expect((await call(r, '/credits', { do: 'top_up', id: 'acc_nobody', chf: 5 })).status).toBe(404);
    rep = (await call(r, '/credits', { do: 'free', id: mira.id, free: true })).body;
    expect(rep.rows[1]).toMatchObject({ free: true, limited: false });
    // A backup keeps them.
    const made = (await call(r, '/backup')).body;
    expect(made.credits.accounts[mira.id].topUps[0].chf).toBe(10);
  });

  it('backs tables up and puts them back, without secrets', async () => {
    const r = await rig();
    await call(r, '/env', { values: { ANTHROPIC_API_KEY: 'sk-ant-api03-secretsecretsecret-TAIL', HEARTHFORGE_MUSIC: 'off' } });
    const { room, socks } = seatTable(r, 'friday', ['Chris']);
    room.game.addCharacter('chris', 'fighter', 'Brann');
    const made = (await call(r, '/backup', {})).body.backups;
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ tables: 1 });

    const file = await call(r, `/backup?name=${made[0].name}`);
    expect(file.headers.get('content-disposition')).toContain(made[0].name);
    expect(JSON.stringify(file.body)).not.toContain('secretsecret');
    expect(file.body).toMatchObject({ format: 'hearthforge-backup', settings: { HEARTHFORGE_MUSIC: 'off' } });
    expect(file.body.tables.friday.characters[0].name).toBe('Brann');

    // Play on, lose the hero, then go back to the backup.
    room.game.removeCharacter('chris', room.game.s.characters[0].id);
    expect(room.game.s.characters).toHaveLength(0);
    const restored = (await call(r, `/restore?name=${made[0].name}`, {})).body;
    expect(restored.restored).toBe(1);
    expect(socks[0].sent.at(-1)).toEqual({ t: 'left', reason: 'restored' });
    expect(r.rooms.get('friday')).not.toBe(room);
    expect(r.rooms.get('friday')!.game.s.characters.map((c) => c.name)).toEqual(['Brann']);
    // What was overwritten was kept as a backup of its own.
    expect(restored.backups.some((b: { name: string }) => b.name.includes('before-restore'))).toBe(true);

    // An uploaded file works the same way; rubbish is refused and changes nothing.
    r.rooms.get('friday')!.close();
    expect((await call(r, '/restore', JSON.stringify(file.body))).body.restored).toBe(1);
    expect(r.rooms.has('friday')).toBe(true);
    expect((await call(r, '/restore', '{"format":"something else"}')).body).toEqual({ error: 'bad_backup' });
    expect((await call(r, '/restore', 'not json')).body).toEqual({ error: 'bad_backup' });
    expect((await call(r, '/restore', JSON.stringify({ format: 'hearthforge-backup', tables: { '../etc': {} } }))).body).toEqual({ error: 'bad_backup' });
    expect((await call(r, '/backup?name=../../settings.json')).status).toBe(404);
  });

  it('changes the password and signs the other browsers out', async () => {
    const r = await rig();
    const other = r.ctx.accounts.login('innkeeper', 'open sesame', true, '127.0.0.1').session;
    expect((await call(r, '/password', { current: 'nope', next: 'a better one' })).body).toEqual({ error: 'wrong_login' });
    expect((await call(r, '/password', { current: 'open sesame', next: 'a better one' })).status).toBe(200);
    expect((await call(r, '/overview')).status).toBe(200);
    expect((await call(r, '/overview', undefined, other)).status).toBe(401);
    expect((await call(r, '/status')).body.firstPassword).toBe(false);
  });
});
