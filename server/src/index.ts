// Hearthforge server: serves the browser client and runs games over WebSockets.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { isLang } from '../../shared/i18n';
import { JOIN_ERRORS, MAX_SEATS, type ClientMessage, type ServerMessage } from '../../shared/types';
import { NEW_TABLE_START, newSeed } from '../../shared/start';
import { DEFAULT_STYLE, cleanStyle } from '../../shared/style';
import { ArtError, ArtStore, MAX_UPLOAD } from './artLibrary';
import { SfxError, addSfxUpload, importDroppedSfx, removeSfxPack, sfxFile, sfxLibrary, sfxManifest } from './sfx';
import { AUDIO_TYPES, MusicError, addUpload, byteRange, ensureFreesound, ensureMusic, musicAction, musicEnabled, musicLibrary, musicManifest } from './music';
import { Store } from './db';
import { Narrator, VoiceError, langOf } from './voice';
import { speechParts } from '../../shared/voice';
import { SESSION_HEADER } from './accountApi';
import { createDM } from './dm/claude';
import { ScriptedDM } from './dm/scripted';
import { JoinError } from './game/engine';
import { DEFAULT_TIMING, Room, type RoomHooks } from './room';
import type { AdminConnection } from '../../shared/admin';
import { AdminApi } from './admin/api';
import { Auth } from './admin/auth';
import { Accounts } from './accounts';
import { accountApi } from './accountApi';
import { Config } from './admin/config';
import { testKey } from './admin/keytest';
import { Logs } from './admin/logs';
import { Updater } from './admin/updater';
import { Usage } from './admin/usage';

import pkg from '../../package.json';
import { buildOf } from '../../shared/update';

const VERSION: string = pkg.version;
const STARTED_AT = Date.now();

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = process.env.DATA_DIR ?? resolve('data');
const logs = new Logs();
logs.open(DATA_DIR);
logs.capture();
// What the owner set in the Innkeeper lies over the environment the container was started with.
const config = new Config(DATA_DIR, process.env);
const env = config.env;
// The accounts first: on the first start with accounts they take over the owner password in innkeeper.json.
const accounts = new Accounts(DATA_DIR, env);
const auth = new Auth(DATA_DIR);
const usage = new Usage(DATA_DIR);
const updater = new Updater(DATA_DIR);
const ART_DIR = env.ART_DIR ?? join(DATA_DIR, 'art');
const art = new ArtStore(ART_DIR, env);
/** Set HEARTHFORGE_ART_UPLOADS=off to lock the art library against changes from the browser. */
const ART_UPLOADS = (env.HEARTHFORGE_ART_UPLOADS ?? 'on').toLowerCase() !== 'off';
const MUSIC_DIR = env.MUSIC_DIR ?? join(DATA_DIR, 'music');
const SFX_DIR = env.SFX_DIR ?? join(DATA_DIR, 'sfx');
const VOICE_DIR = env.VOICE_DIR ?? join(DATA_DIR, 'voice');
const TRUST_PROXY = (env.HEARTHFORGE_TRUST_PROXY ?? 'off').toLowerCase() === 'on';

/** The address a request comes from. Behind a reverse proxy the owner trusts, the one it reports. */
function ipOf(req: IncomingMessage): string {
  const forwarded = TRUST_PROXY ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
  return (forwarded || req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}
const here = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR =
  env.CLIENT_DIR ?? [resolve(here, '../client/dist'), resolve(here, '../../client/dist')].find((p) => existsSync(p)) ?? resolve('client/dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const store = new Store(DATA_DIR);
const narrator = new Narrator(VOICE_DIR, env);
const claude = createDM(env, (sample) => usage.record(sample));
const dm = claude ?? new ScriptedDM();
const rooms = new Map<string, Room>();
/** Connections looking at the list of tables. */
const lobby = new Set<WebSocket>();
/** The table each connection sits at. */
const seated = new Map<WebSocket, Room>();
/** Every open connection, for the Innkeeper's list of who is here. */
const conns = new Map<WebSocket, { id: number; ip: string; since: number; agent: string; account?: string; accountId?: string }>();
let connSeq = 0;

const num = (raw: string | undefined, fallback: number) => (raw !== undefined && raw !== '' && Number.isFinite(Number(raw)) ? Math.max(0, Number(raw)) : fallback);
const TIMING = {
  turnWaitMs: num(env.HEARTHFORGE_TURN_WAIT, DEFAULT_TIMING.turnWaitMs / 1000) * 1000,
  reactionWaitMs: num(env.HEARTHFORGE_REACTION_WAIT, DEFAULT_TIMING.reactionWaitMs / 1000) * 1000,
  undoGraceMs: num(env.HEARTHFORGE_UNDO_WINDOW, 3) * 1000,
};

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // nothing that reads two ways aloud
function newCode(): string {
  for (;;) {
    const code = Array.from(randomBytes(5), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
    if (![...rooms.values()].some((r) => r.game.s.table.code === code)) return code;
  }
}

let listTimer: NodeJS.Timeout | null = null;
const tableList = (): ServerMessage => ({ t: 'tables', tables: [...rooms.values()].map((r) => r.summary()) });
/** Tell everyone in the lobby that the list of tables changed, at most a few times a second. */
function pushTables() {
  if (listTimer) return;
  listTimer = setTimeout(() => {
    listTimer = null;
    const payload = JSON.stringify(tableList());
    for (const ws of lobby) if (ws.readyState === ws.OPEN) ws.send(payload);
  }, 150);
}

const hooks: RoomHooks = {
  changed: pushTables,
  detached: (ws) => void seated.delete(ws),
  closed: (room) => { rooms.delete(room.name); pushTables(); },
  newCode,
  paused: (room) => auth.paused(room.name),
  stats: (playerId, delta, heroes) => accounts.credit(playerId, delta, heroes),
};

const openRoom = (id: string) => new Room(id, dm, store, TIMING, hooks);
// Every saved table is listed in the lobby. A table costs nothing until somebody sits down at it.
for (const id of store.names()) rooms.set(id, openRoom(id));

const tableId = (raw: unknown) => String(raw ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);

/** The style new tables start with: what the owner set in the Innkeeper, else the built-in default. */
function defaultStyle() {
  return cleanStyle({ tone: env.HEARTHFORGE_DM_TONE, rules: env.HEARTHFORGE_DM_RULES || undefined, rating: env.HEARTHFORGE_DM_RATING }, DEFAULT_STYLE);
}

function createTable(msg: Extract<ClientMessage, { t: 'create_table' }> & { name: string }, ws: WebSocket, playerId: string, token: string): Room {
  const title = String(msg.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!title) throw new JoinError(JOIN_ERRORS.titleNeeded);
  const base = tableId(title.replace(/\s+/g, '-')) || 'table';
  let id = base;
  for (let n = 2; rooms.has(id); n++) id = `${base.slice(0, 28)}-${n}`;
  const room = openRoom(id);
  const s = room.game.s;
  // A new table gets a region of its own; the host can switch to the classic one in the table room.
  s.table = { title, maxPlayers: Math.min(MAX_SEATS, Math.max(1, Math.round(Number(msg.maxPlayers)) || MAX_SEATS)), code: null, start: { ...NEW_TABLE_START, seed: newSeed() }, style: defaultStyle() };
  if (isLang(msg.language)) s.language = msg.language;
  // The founder sits down before the code exists, so they never have to enter their own code.
  room.join(ws, playerId, token, String(msg.name ?? ''));
  if (msg.locked) s.table.code = newCode();
  rooms.set(id, room);
  room.flush();
  pushTables();
  return room;
}

function findTable(msg: Extract<ClientMessage, { t: 'join' }>): Room {
  const id = tableId(msg.room);
  if (id) {
    const room = rooms.get(id);
    if (!room) throw new JoinError(JOIN_ERRORS.noTable);
    return room;
  }
  const code = String(msg.code ?? '').trim().toUpperCase();
  const room = code ? [...rooms.values()].find((r) => r.game.s.table.code === code) : undefined;
  if (!room) throw new JoinError(JOIN_ERRORS.noCode);
  return room;
}

function connections(): AdminConnection[] {
  return [...conns].map(([ws, { accountId: _id, ...c }]) => {
    const room = seated.get(ws);
    const playerId = room?.playerOf(ws) ?? '';
    return {
      ...c,
      table: room?.name ?? '',
      tableTitle: room?.game.s.table.title ?? '',
      playerId,
      name: (playerId && room?.game.player(playerId)?.name) || '',
      host: !!playerId && room?.game.s.hostId === playerId,
    };
  });
}

function restart() {
  for (const room of rooms.values()) room.saveNow();
  usage.flush();
  accounts.flush();
  store.close();
  // Docker's restart policy starts the container again; the settings are read afresh on the way up.
  process.exit(0);
}

const admin = new AdminApi({
  dataDir: DATA_DIR,
  version: VERSION,
  startedAt: STARTED_AT,
  env,
  config,
  auth,
  accounts,
  usage,
  logs,
  updater,
  store,
  rooms,
  openRoom: (id) => openRoom(id),
  tablesChanged: () => pushTables(),
  connections,
  disconnect: ({ id, ip }) => {
    for (const [ws, c] of conns) if (c.id === id || (ip && c.ip === ip)) ws.close(4403, 'removed');
  },
  notice: (text) => {
    const payload = JSON.stringify({ t: 'notice', text } satisfies ServerMessage);
    for (const ws of conns.keys()) if (ws.readyState === ws.OPEN) ws.send(payload);
  },
  dm: { mode: dm.mode, background: claude?.models.background ?? null, standard: claude?.models.standard ?? null, key: claude?.models.key ?? null, forced: claude?.models.forced ?? null, storyOnKey: !!claude?.models.storyOnKey },
  ipOf,
  restart,
  testKey,
});

function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) { fail(new ArtError('too_big')); req.resume(); } else chunks.push(c);
    });
    req.on('end', () => done(Buffer.concat(chunks)));
    req.on('error', fail);
  });
}

/** Tell every open browser that the owner changed art, music or effects, so nobody has to reload by hand. */
function announceAssets(change: Omit<Extract<ServerMessage, { t: 'assets' }>, 't'>) {
  const payload = JSON.stringify({ t: 'assets', ...change } satisfies ServerMessage);
  for (const ws of conns.keys()) if (ws.readyState === ws.OPEN) ws.send(payload);
}

async function artApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  // The art library belongs to the owner of the server: it is changed from the Innkeeper.
  const canEdit = ART_UPLOADS && admin.authorised(req);
  try {
    if (req.method === 'GET') {
      if (url.pathname === '/api/art') return json(200, art.manifest());
      if (url.pathname === '/api/art/library') return json(200, art.library(canEdit, ART_UPLOADS));
      if (url.pathname === '/api/art/icons') return json(200, art.packIcons(url.searchParams.get('pack') ?? ''));
      return json(404, { error: 'bad_request' });
    }
    if (req.method !== 'POST') return json(405, { error: 'bad_request' });
    if (!canEdit) { req.resume(); return json(403, { error: 'forbidden' }); }
    const tilesBefore = JSON.stringify(art.manifest().sprites ?? {});
    const done = () => announceAssets({ icons: true, tiles: JSON.stringify(art.manifest().sprites ?? {}) !== tilesBefore });
    if (url.pathname === '/api/art/upload') {
      const zip = await readBody(req, MAX_UPLOAD);
      const added = art.importZip(String(url.searchParams.get('name') ?? 'pack.zip').slice(0, 120), new Uint8Array(zip));
      done();
      return json(200, { ...added, library: art.library(canEdit, ART_UPLOADS) });
    }
    if (url.pathname === '/api/art/action') {
      const m = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8') || '{}');
      const id = String(m.pack ?? '');
      if (m.do === 'install') await art.install(id);
      else if (m.do === 'use') art.activate(m.kind === 'tiles' ? 'tiles' : 'icons', id);
      else if (m.do === 'assign') art.assign(id, String(m.slot ?? ''), m.icon === null || m.icon === undefined ? m.icon : String(m.icon));
      else if (m.do === 'describe') art.describe(id, m);
      else if (m.do === 'remove') art.remove(id);
      else throw new ArtError('bad_request');
      done();
      return json(200, { library: art.library(canEdit, ART_UPLOADS) });
    }
    return json(404, { error: 'bad_request' });
  } catch (err) {
    if (err instanceof ArtError) return json(err.code === 'too_big' ? 413 : 400, { error: err.code });
    if (err instanceof SyntaxError) return json(400, { error: 'bad_request' });
    console.warn('[art]', err);
    return json(500, { error: 'failed' });
  }
}

/** The music library belongs to the owner of the server: it is changed from the Innkeeper. */
async function musicApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  try {
    if (!admin.authorised(req)) { req.resume(); return json(403, { error: 'forbidden' }); }
    if (req.method === 'GET' && url.pathname === '/api/music/library') return json(200, musicLibrary(MUSIC_DIR, env));
    if (req.method !== 'POST') return json(405, { error: 'bad_request' });
    if (url.pathname === '/api/music/upload') {
      const body = await readBody(req, 96 * 1024 * 1024);
      addUpload(MUSIC_DIR, String(url.searchParams.get('name') ?? 'track.mp3').slice(0, 160), new Uint8Array(body), url.searchParams.get('layer'), url.searchParams.get('context'));
      announceAssets({ music: true });
      return json(200, musicLibrary(MUSIC_DIR, env));
    }
    if (url.pathname === '/api/music/action') {
      await musicAction(MUSIC_DIR, env, JSON.parse((await readBody(req, 16 * 1024)).toString('utf8') || '{}'));
      announceAssets({ music: true });
      return json(200, musicLibrary(MUSIC_DIR, env));
    }
    return json(404, { error: 'bad_request' });
  } catch (err) {
    if (err instanceof MusicError) {
      const detail = (err as { detail?: string }).detail;
      if (detail) console.warn(`[music] ${detail}`);
      return json(err.code === 'too_big' ? 413 : 400, { error: err.code });
    }
    if (err instanceof ArtError && err.code === 'too_big') return json(413, { error: 'too_big' });
    if (err instanceof SyntaxError) return json(400, { error: 'bad_request' });
    console.warn('[music]', err);
    return json(500, { error: 'failed' });
  }
}

/** The effects library belongs to the owner of the server, like the music. */
async function sfxApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  try {
    if (!admin.authorised(req)) { req.resume(); return json(403, { error: 'forbidden' }); }
    if (req.method === 'GET' && url.pathname === '/api/sfx/library') return json(200, sfxLibrary(SFX_DIR, env));
    if (req.method !== 'POST') return json(405, { error: 'bad_request' });
    if (url.pathname === '/api/sfx/upload') {
      const body = await readBody(req, 60 * 1024 * 1024);
      addSfxUpload(SFX_DIR, String(url.searchParams.get('name') ?? 'sounds.zip').slice(0, 160), new Uint8Array(body));
      announceAssets({ sfx: true });
      return json(200, sfxLibrary(SFX_DIR, env));
    }
    if (url.pathname === '/api/sfx/remove') {
      removeSfxPack(SFX_DIR, JSON.parse((await readBody(req, 4 * 1024)).toString('utf8') || '{}').id);
      announceAssets({ sfx: true });
      return json(200, sfxLibrary(SFX_DIR, env));
    }
    return json(404, { error: 'bad_request' });
  } catch (err) {
    if (err instanceof SfxError) return json(err.code === 'too_big' ? 413 : 400, { error: err.code });
    if (err instanceof ArtError && err.code === 'too_big') return json(413, { error: 'too_big' });
    if (err instanceof SyntaxError) return json(400, { error: 'bad_request' });
    console.warn('[sfx]', err);
    return json(500, { error: 'failed' });
  }
}

/** Send a finished speech file. Browsers ask for audio in byte ranges. */
function sendAudio(req: IncomingMessage, res: ServerResponse, file: string, type: string, extra: Record<string, string> = {}) {
  const size = statSync(file).size;
  const range = byteRange(req.headers.range, size);
  const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=86400', ...extra };
  if (range) {
    res.writeHead(206, { ...headers, 'content-range': `bytes ${range.start}-${range.end}/${size}`, 'content-length': range.end - range.start + 1 });
    createReadStream(file, range).pipe(res);
  } else {
    res.writeHead(200, { ...headers, 'content-length': size });
    createReadStream(file).pipe(res);
  }
}

/**
 * The narrator. Anyone may ask what it can do; a player at a table may hear that table's story read aloud, one part at a
 * time; only the Innkeeper chooses the voice. Nothing but the Dungeon Master's own story is ever spoken, so a key for a
 * paid voice cannot be spent on anything else.
 */
async function voiceApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  try {
    if (url.pathname === '/api/voice') return json(200, narrator.manifest());
    if (req.method === 'GET' && url.pathname === '/api/voice/line') {
      const account = accounts.account(req.headers[SESSION_HEADER]);
      const room = rooms.get(tableId(url.searchParams.get('table')));
      if (!account || !room || !room.game.player(account.id)) return json(403, { error: 'forbidden' });
      const id = Number(url.searchParams.get('entry'));
      const entry = room.game.s.log.find((l) => l.id === id);
      if (!entry || entry.kind !== 'dm') return json(404, { error: 'bad_request' });
      const parts = speechParts(entry.text);
      const part = Math.max(0, Math.floor(Number(url.searchParams.get('part')) || 0));
      if (part >= parts.length) return json(404, { error: 'bad_request' });
      const lang = langOf(room.game.s.language);
      const audio = await narrator.speak(parts[part], lang);
      // The next part is made while this one plays.
      if (part + 1 < parts.length) void narrator.speak(parts[part + 1], lang).catch(() => {});
      return sendAudio(req, res, audio.file, audio.type, { 'x-parts': String(parts.length), 'access-control-expose-headers': 'x-parts' });
    }
    if (!admin.authorised(req)) { req.resume(); return json(403, { error: 'forbidden' }); }
    if (req.method === 'GET' && url.pathname === '/api/voice/library') return json(200, narrator.library());
    if (req.method === 'GET' && url.pathname === '/api/voice/preview') {
      const lang = langOf(url.searchParams.get('lang'));
      const sample = lang === 'de'
        ? 'Der Regen trommelt auf das Dach der Taverne. Am Kamin hebt eine Fremde den Kopf und mustert euch lange. «Ihr seid spät», sagt sie leise. «Setzt euch. Die Strasse nach Norden ist nicht mehr sicher.»'
        : 'Rain drums on the roof of the tavern. By the hearth, a stranger lifts her head and studies you for a long moment. "You are late," she says quietly. "Sit. The north road is no longer safe."';
      const over: Record<string, unknown> = {};
      for (const k of ['provider', 'openai', 'elevenlabs', 'speed'] as const) if (url.searchParams.has(k)) over[k] = k === 'speed' ? Number(url.searchParams.get(k)) : url.searchParams.get(k);
      if (url.searchParams.has('piper')) over.piper = { ...narrator.library().choice.piper, [lang]: url.searchParams.get('piper') };
      const audio = await narrator.speak(sample, lang, over);
      return sendAudio(req, res, audio.file, audio.type);
    }
    if (req.method === 'POST' && url.pathname === '/api/voice/action') {
      await narrator.action(JSON.parse((await readBody(req, 16 * 1024)).toString('utf8') || '{}'));
      return json(200, narrator.library());
    }
    return json(404, { error: 'bad_request' });
  } catch (err) {
    if (err instanceof VoiceError) return json(err.code === 'failed' ? 500 : 400, { error: err.code });
    if (err instanceof SyntaxError) return json(400, { error: 'bad_request' });
    console.warn('[voice]', err instanceof Error ? err.message : err);
    return json(502, { error: 'failed' });
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, dm: dm.mode, model: dm.model, models: claude?.models ?? null, rooms: rooms.size }));
    return;
  }
  if (url.pathname.startsWith('/api/account/')) {
    void accountApi({ accounts, rooms, ipOf, tablesChanged: pushTables }, req, res, url);
    return;
  }
  if (url.pathname.startsWith('/api/admin/')) {
    void admin.handle(req, res, url);
    return;
  }
  if (url.pathname === '/api/art' || url.pathname.startsWith('/api/art/')) {
    void artApi(req, res, url);
    return;
  }
  if (url.pathname.startsWith('/art/')) {
    let rel = '';
    try { rel = normalize(decodeURIComponent(url.pathname.slice(5))).replace(/^(\.\.[/\\])+/, ''); } catch { /* 404 below */ }
    const file = join(ART_DIR, rel);
    const ext = extname(file).toLowerCase();
    // Uploaded packs are only ever served as PNG. SVG is served for the game-icons.net set alone, which the server fetched and cleaned itself.
    const allowed = ext === '.png' || (ext === '.svg' && rel.split(/[/\\]/)[0] === 'game-icons');
    if (!rel || !file.startsWith(ART_DIR) || !allowed || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'content-type': ext === '.svg' ? 'image/svg+xml' : 'image/png', 'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    });
    createReadStream(file).pipe(res);
    return;
  }
  if (url.pathname.startsWith('/api/music/')) {
    void musicApi(req, res, url);
    return;
  }
  if (url.pathname === '/api/music') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    res.end(JSON.stringify(musicManifest(MUSIC_DIR, env)));
    return;
  }
  if (url.pathname === '/api/voice' || url.pathname.startsWith('/api/voice/')) {
    void voiceApi(req, res, url);
    return;
  }
  if (url.pathname.startsWith('/api/sfx/')) {
    void sfxApi(req, res, url);
    return;
  }
  if (url.pathname === '/api/sfx') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    res.end(JSON.stringify(sfxManifest(SFX_DIR, env)));
    return;
  }
  if (url.pathname.startsWith('/sfx/')) {
    const file = sfxFile(SFX_DIR, url.pathname);
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'audio/ogg', 'cache-control': 'public, max-age=86400', 'content-length': statSync(file).size });
    createReadStream(file).pipe(res);
    return;
  }
  if (url.pathname.startsWith('/music/')) {
    // Only MUSIC_DIR/<context>/<file> and MUSIC_DIR/ambient/<context>/<file> are ever served. Browsers ask for audio in byte ranges.
    const parts = url.pathname.slice(7).split('/').map((p) => { try { return decodeURIComponent(p); } catch { return ''; } });
    const ok = (parts.length === 2 || (parts.length === 3 && parts[0] === 'ambient')) && parts.every((p) => p && !p.startsWith('.') && !/[\\/]/.test(p));
    const file = ok ? join(MUSIC_DIR, ...parts) : '';
    const type = AUDIO_TYPES[extname(file).toLowerCase()];
    if (!ok || !type || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const size = statSync(file).size;
    const range = byteRange(req.headers.range, size);
    const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=86400' };
    if (req.headers.range && !range) {
      res.writeHead(416, { 'content-range': `bytes */${size}` });
      res.end();
    } else if (range) {
      res.writeHead(206, { ...headers, 'content-range': `bytes ${range.start}-${range.end}/${size}`, 'content-length': range.end - range.start + 1 });
      createReadStream(file, range).pipe(res);
    } else {
      res.writeHead(200, { ...headers, 'content-length': size });
      createReadStream(file).pipe(res);
    }
    return;
  }
  // Static client with SPA fallback.
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(CLIENT_DIR, rel);
  // A script or style from an older build must fail loudly, not come back as the page (which breaks lazy chunks).
  if (rel.replace(/\\/g, '/').startsWith('/assets/') && (!existsSync(file) || statSync(file).isDirectory())) {
    res.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
    res.end('Not found');
    return;
  }
  if (!file.startsWith(CLIENT_DIR) || !existsSync(file) || statSync(file).isDirectory()) file = join(CLIENT_DIR, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Client build not found. Run "npm run build" first.');
    return;
  }
  const immutable = file.includes(`${join(CLIENT_DIR, 'assets')}`);
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
});

/** The client build this server serves, read from the built index.html so a swapped-in build is noticed. */
function clientBuild(): string {
  try {
    return buildOf(readFileSync(join(CLIENT_DIR, 'index.html'), 'utf8'));
  } catch {
    return '';
  }
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const send = (msg: ServerMessage) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
  const ip = ipOf(req);
  if (auth.banned(ip)) return ws.close(4403, 'banned');
  send({ t: 'hello', build: clientBuild() });
  conns.set(ws, { id: ++connSeq, ip, since: Date.now(), agent: String(req.headers['user-agent'] ?? '').slice(0, 200) });
  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    if (msg.t === 'lobby') {
      // Who is in the lobby shows in the Innkeeper's list of connections.
      const who = accounts.account(msg.session);
      const conn = conns.get(ws);
      if (who && conn) { conn.account = who.username; conn.accountId = who.id; }
      seated.get(ws)?.leave(ws);
      seated.delete(ws);
      lobby.add(ws);
      return send(tableList());
    }
    if (msg.t === 'join' || msg.t === 'create_table') {
      try {
        // A seat belongs to an account: whoever is signed in to it sits on it, from any device.
        const account = accounts.account(msg.session);
        if (!account) throw new JoinError(JOIN_ERRORS.signIn);
        const conn = conns.get(ws);
        if (conn) { conn.account = account.username; conn.accountId = account.id; }
        const playerId = account.id;
        const token = `account:${account.id}`;
        const before = seated.get(ws);
        let room: Room;
        if (msg.t === 'create_table') room = createTable({ ...msg, name: account.username }, ws, playerId, token);
        else {
          room = findTable(msg);
          room.join(ws, playerId, token, account.username, msg.code);
        }
        if (before && before !== room) before.leave(ws);
        seated.set(ws, room);
        lobby.delete(ws);
      } catch (err) {
        if (!(err instanceof JoinError)) throw err;
        send({ t: 'error', message: err.message, join: true });
      }
      return;
    }
    seated.get(ws)?.handle(ws, msg);
  });
  const gone = () => {
    conns.delete(ws);
    lobby.delete(ws);
    seated.get(ws)?.leave(ws);
    seated.delete(ws);
  };
  ws.on('close', gone);
  ws.on('error', gone);
});

// A deleted account is sent away at once, from every table and device.
accounts.onDeleted = (id) => {
  for (const [ws, c] of conns) if (c.accountId === id) ws.close(4403, 'removed');
};

// A renamed account is renamed at its seats too.
accounts.onRenamed = (id, username) => {
  let seats = 0;
  for (const c of conns.values()) if (c.accountId === id) c.account = username;
  for (const room of rooms.values()) if (room.renamePlayer(id, username)) seats++;
  if (seats) pushTables();
};

void art.start();
narrator.onChange = () => announceAssets({ voice: true });
void narrator.start();
importDroppedSfx(SFX_DIR, env);
void ensureMusic(MUSIC_DIR, env).then(() => ensureFreesound(MUSIC_DIR, env));
admin.start();

server.listen(PORT, () => {
  console.log(`Hearthforge listening on http://0.0.0.0:${PORT}`);
  console.log(`Art: ${art.tiles === 'generated' ? 'generated pixel art' : `${art.tiles} pack (falls back to generated art if unavailable)`}, item icons: ${art.icons}. Packs are kept in ${ART_DIR}`);
  console.log(`Music: ${musicEnabled(env) ? `on, tracks are kept in ${MUSIC_DIR} (silent until some are there)` : 'off (HEARTHFORGE_MUSIC)'}`);
  const voice = narrator.manifest();
  console.log(`Narrator: ${!narrator.enabled ? 'off (HEARTHFORGE_NARRATOR)' : voice.provider === 'off' ? 'off (chosen in the Innkeeper)' : voice.provider === 'piper' && !narrator.piperReady ? 'Piper is not in this image' : `${voice.provider}${voice.langs.length ? `, reads ${voice.langs.join(' and ')}` : ', voices are still being fetched'}`}. Kept in ${VOICE_DIR}`);
  if (!claude) console.log('Dungeon Master: scripted fallback (set ANTHROPIC_API_KEY to enable the AI DM)');
  else if (claude.models.forced) console.log(`Dungeon Master: Claude, every call on ${claude.models.forced} (HEARTHFORGE_DM_FORCE_MODEL)`);
  else if (claude.models.storyOnKey) console.log(`Dungeon Master: Claude. Every story turn: ${claude.models.key} (HEARTHFORGE_DM_STORY_ON_KEY). Combat: ${claude.models.standard}. Background: ${claude.models.background}.`);
  else console.log(`Dungeon Master: Claude. Key moments: ${claude.models.key}. Narration and combat: ${claude.models.standard}. Background: ${claude.models.background}.`);
  if (!admin.enabled) console.log('Innkeeper: switched off (HEARTHFORGE_ADMIN).');
  else if (accounts.firstPasswordNote) console.log(`Innkeeper: no password was set, so one was made up. Sign in as "${accounts.firstPasswordNote.username}" with "${accounts.firstPasswordNote.password}" (also in ${accounts.firstPasswordNote.file}) and choose your own.`);
  else console.log(`Innkeeper: ready${accounts.firstPasswordPending ? '. Sign in as "innkeeper" with the password from HEARTHFORGE_ADMIN_PASSWORD and choose your own' : ''}.`);
});

function shutdown() {
  for (const room of rooms.values()) room.saveNow();
  usage.flush();
  accounts.flush();
  store.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
