// The Innkeeper: who gets in, what the settings file does to the environment, what the AI costs,
// and the admin API end to end over a real HTTP server.
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import type { AdminConnection, AdminOverview, AdminTable, SettingValue } from '../../shared/admin';
import type { ServerMessage } from '../../shared/types';
import { AdminApi, NOTICES, type AdminContext } from '../src/admin/api';
import { Auth, AuthError } from '../src/admin/auth';
import { Config, ConfigError, mask } from '../src/admin/config';
import { Logs } from '../src/admin/logs';
import { Updater } from '../src/admin/updater';
import { Usage } from '../src/admin/usage';
import type { Store } from '../src/db';
import { ScriptedDM } from '../src/dm/scripted';
import type { InternalState } from '../src/game/engine';
import { PAUSED_MESSAGE, Room } from '../src/room';

const dir = () => mkdtempSync(join(tmpdir(), 'hf-admin-'));

describe('innkeeper password', () => {
  it('starts with the password from the environment and then only takes the owner\'s own', () => {
    const d = dir();
    const auth = new Auth(d, { HEARTHFORGE_ADMIN_PASSWORD: 'from-installer' });
    expect(auth.usesFirstPassword).toBe(true);
    expect(auth.firstPasswordNote).toBeNull();
    expect(() => auth.login('nope', '10.0.0.1')).toThrow(AuthError);
    const token = auth.login('from-installer', '10.0.0.1');
    expect(auth.valid(token)).toBe(true);
    expect(() => auth.changePassword('from-installer', 'short', token, '10.0.0.1')).toThrow('weak_password');
    auth.changePassword('from-installer', 'my own secret', token, '10.0.0.1');
    expect(auth.usesFirstPassword).toBe(false);
    // The file holds hashes only, and survives a restart; the installer's password no longer works.
    const file = readFileSync(join(d, 'innkeeper.json'), 'utf8');
    expect(file).not.toContain('my own secret');
    expect(file).not.toContain(token);
    const again = new Auth(d, { HEARTHFORGE_ADMIN_PASSWORD: 'from-installer' });
    expect(again.valid(token)).toBe(true);
    expect(() => again.login('from-installer', '10.0.0.2')).toThrow('wrong_password');
    expect(again.valid(again.login('my own secret', '10.0.0.2'))).toBe(true);
  });

  it('makes up a first password when none was set, and forgets it once it is replaced', () => {
    const d = dir();
    const auth = new Auth(d, {});
    const note = auth.firstPasswordNote!;
    expect(note.password.length).toBeGreaterThanOrEqual(12);
    expect(readFileSync(note.file, 'utf8').trim()).toBe(note.password);
    // The same one after a restart, so the log line of the first start stays true.
    expect(new Auth(d, {}).firstPasswordNote!.password).toBe(note.password);
    const token = auth.login(note.password, 'ip');
    auth.changePassword(note.password, 'something better', token, 'ip');
    expect(existsSync(note.file)).toBe(false);
  });

  it('locks an address out after five wrong passwords, for five minutes', () => {
    let now = 1_000_000;
    const auth = new Auth(dir(), { HEARTHFORGE_ADMIN_PASSWORD: 'right' }, () => now);
    for (let i = 0; i < 5; i++) expect(() => auth.login('wrong', '1.1.1.1')).toThrow('wrong_password');
    expect(() => auth.login('right', '1.1.1.1')).toThrow('too_many');
    expect(auth.valid(auth.login('right', '2.2.2.2'))).toBe(true); // someone else is not locked out
    now += 5 * 60 * 1000 + 1;
    expect(auth.valid(auth.login('right', '1.1.1.1'))).toBe(true);
  });

  it('ends sessions after a week and on sign-out', () => {
    let now = 0;
    const auth = new Auth(dir(), { HEARTHFORGE_ADMIN_PASSWORD: 'right' }, () => now);
    const a = auth.login('right', 'ip'), b = auth.login('right', 'ip');
    auth.logout(a);
    expect(auth.valid(a)).toBe(false);
    expect(auth.valid(b)).toBe(true);
    now += 8 * 24 * 3600 * 1000;
    expect(auth.valid(b)).toBe(false);
    expect(auth.valid('')).toBe(false);
    expect(auth.valid(undefined)).toBe(false);
  });
});

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

class MemoryStore {
  saved = new Map<string, string>();
  load(room: string) { const s = this.saved.get(room); return s ? (JSON.parse(s) as InternalState) : undefined; }
  save(room: string, state: InternalState) { this.saved.set(room, JSON.stringify(state)); }
  names() { return [...this.saved.keys()]; }
  delete(room: string) { this.saved.delete(room); }
  close() {}
}

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
  const auth = new Auth(dataDir, config.env);
  const openRoom = (id: string): Room => new Room(id, new ScriptedDM(), store as unknown as Store, {}, { closed: (r) => void rooms.delete(r.name), paused: (r) => auth.paused(r.name) });
  const out = { notices: [] as string[], restarts: 0, closed: [] as unknown[] };
  const ctx: AdminContext = {
    dataDir, version: '0.1.0', startedAt: Date.now() - 5000, env: config.env, config, auth,
    usage: new Usage(dataDir), logs: new Logs(), updater: new Updater(dataDir),
    store, rooms, openRoom, tablesChanged: () => {},
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
  if (api.enabled) r.session = (await call(r, '/login', { password: 'open sesame' })).body.session;
  return r;
}

async function call(r: Rig, path: string, body?: unknown, session = r.session) {
  const res = await fetch(r.url + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-innkeeper-session': session, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
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
    for (const path of ['/overview', '/tables', '/players', '/env', '/usage', '/logs', '/backups', '/backup']) {
      expect((await call(r, path, undefined, '')).status, path).toBe(401);
      expect((await call(r, path, undefined, 'f'.repeat(64))).status, path).toBe(401);
    }
    for (const path of ['/env', '/server', '/tables', '/players', '/notice', '/restore', '/password']) {
      expect((await call(r, path, { do: 'restart', values: {} }, '')).body, path).toEqual({ error: 'signed_out' });
    }
    expect(r.restarts).toBe(0);
    expect((await call(r, '/login', { password: 'wrong' }, '')).body).toEqual({ error: 'wrong_password' });
  });

  it('can be switched off altogether', async () => {
    const r = await rig({ HEARTHFORGE_ADMIN: 'off', HEARTHFORGE_ADMIN_PASSWORD: 'open sesame' });
    expect((await call(r, '/status')).body).toEqual({ enabled: false, firstPassword: false });
    expect((await call(r, '/login', { password: 'open sesame' })).status).toBe(403);
  });

  it('shows the server at a glance', async () => {
    const r = await rig();
    seatTable(r, 'friday', ['Chris', 'Mira']);
    const o = (await call(r, '/overview')).body as AdminOverview;
    expect(o).toMatchObject({ version: '0.1.0', tables: 1, playing: 1, connections: 1, restartPending: false, restartAt: null, dm: { mode: 'scripted' } });
    expect(o.updater.connected).toBe(false);
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
    const other = (await call(r, '/login', { password: 'open sesame' })).body.session;
    expect((await call(r, '/password', { current: 'nope', next: 'a better one' })).body).toEqual({ error: 'wrong_password' });
    expect((await call(r, '/password', { current: 'open sesame', next: 'a better one' })).status).toBe(200);
    expect((await call(r, '/overview')).status).toBe(200);
    expect((await call(r, '/overview', undefined, other)).status).toBe(401);
    expect((await call(r, '/status')).body.firstPassword).toBe(false);
  });
});
