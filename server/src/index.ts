// Hearthforge server: serves the browser client and runs games over WebSockets.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { createHash, randomBytes } from 'node:crypto';
import { isLang } from '../../shared/i18n';
import { JOIN_ERRORS, MAX_SEATS, type ClientMessage, type ServerMessage } from '../../shared/types';
import { ArtError, ArtStore, MAX_UPLOAD } from './artLibrary';
import { AUDIO_TYPES, byteRange, ensureMusic, musicEnabled, musicManifest } from './music';
import { Store } from './db';
import { createDM } from './dm/claude';
import { ScriptedDM } from './dm/scripted';
import { JoinError } from './game/engine';
import { DEFAULT_TIMING, Room, type RoomHooks } from './room';

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = process.env.DATA_DIR ?? resolve('data');
const ART_DIR = process.env.ART_DIR ?? join(DATA_DIR, 'art');
const art = new ArtStore(ART_DIR, process.env);
/** Set HEARTHFORGE_ART_UPLOADS=off to lock the art library against changes from the browser. */
const ART_UPLOADS = (process.env.HEARTHFORGE_ART_UPLOADS ?? 'on').toLowerCase() !== 'off';
const MUSIC_DIR = process.env.MUSIC_DIR ?? join(DATA_DIR, 'music');
const here = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR =
  process.env.CLIENT_DIR ?? [resolve(here, '../client/dist'), resolve(here, '../../client/dist')].find((p) => existsSync(p)) ?? resolve('client/dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const store = new Store(DATA_DIR);
const claude = createDM(process.env);
const dm = claude ?? new ScriptedDM();
const rooms = new Map<string, Room>();
/** Connections looking at the list of tables. */
const lobby = new Set<WebSocket>();
/** The table each connection sits at. */
const seated = new Map<WebSocket, Room>();

const num = (raw: string | undefined, fallback: number) => (raw !== undefined && raw !== '' && Number.isFinite(Number(raw)) ? Math.max(0, Number(raw)) : fallback);
const TIMING = {
  turnWaitMs: num(process.env.HEARTHFORGE_TURN_WAIT, DEFAULT_TIMING.turnWaitMs / 1000) * 1000,
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
};

const openRoom = (id: string) => new Room(id, dm, store, TIMING, hooks);
// Every saved table is listed in the lobby. A table costs nothing until somebody sits down at it.
for (const id of store.names()) rooms.set(id, openRoom(id));

const tableId = (raw: unknown) => String(raw ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);

function createTable(msg: Extract<ClientMessage, { t: 'create_table' }>, ws: WebSocket, playerId: string, token: string): Room {
  const title = String(msg.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!title) throw new JoinError(JOIN_ERRORS.titleNeeded);
  const base = tableId(title.replace(/\s+/g, '-')) || 'table';
  let id = base;
  for (let n = 2; rooms.has(id); n++) id = `${base.slice(0, 28)}-${n}`;
  const room = openRoom(id);
  const s = room.game.s;
  s.table = { title, maxPlayers: Math.min(MAX_SEATS, Math.max(1, Math.round(Number(msg.maxPlayers)) || MAX_SEATS)), code: null };
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

/** The art library may be changed by whoever hosts a table: their browser proves it with its seat token. */
function hostsATable(req: IncomingMessage): boolean {
  const token = String(req.headers['x-hearthforge-token'] ?? '');
  if (token.length < 16) return false;
  const key = createHash('sha256').update(token).digest('hex');
  return [...rooms.values()].some((r) => { const s = r.game.s; return !!s.hostId && s.seats[s.hostId] === key; });
}

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

async function artApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const canEdit = ART_UPLOADS && hostsATable(req);
  try {
    if (req.method === 'GET') {
      if (url.pathname === '/api/art') return json(200, art.manifest());
      if (url.pathname === '/api/art/library') return json(200, art.library(canEdit, ART_UPLOADS));
      if (url.pathname === '/api/art/icons') return json(200, art.packIcons(url.searchParams.get('pack') ?? ''));
      return json(404, { error: 'bad_request' });
    }
    if (req.method !== 'POST') return json(405, { error: 'bad_request' });
    if (!canEdit) { req.resume(); return json(403, { error: 'forbidden' }); }
    if (url.pathname === '/api/art/upload') {
      const zip = await readBody(req, MAX_UPLOAD);
      const added = art.importZip(String(url.searchParams.get('name') ?? 'pack.zip').slice(0, 120), new Uint8Array(zip));
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

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, dm: dm.mode, model: dm.model, models: claude?.models ?? null, rooms: rooms.size }));
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
  if (url.pathname === '/api/music') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    res.end(JSON.stringify(musicManifest(MUSIC_DIR, process.env)));
    return;
  }
  if (url.pathname.startsWith('/music/')) {
    // Only MUSIC_DIR/<context>/<file> is ever served. Browsers ask for audio in byte ranges.
    const parts = url.pathname.slice(7).split('/').map((p) => { try { return decodeURIComponent(p); } catch { return ''; } });
    const ok = parts.length === 2 && parts.every((p) => p && !p.startsWith('.') && !/[\\/]/.test(p));
    const file = ok ? join(MUSIC_DIR, parts[0], parts[1]) : '';
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

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

wss.on('connection', (ws: WebSocket) => {
  const send = (msg: ServerMessage) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    if (msg.t === 'lobby') {
      seated.get(ws)?.leave(ws);
      seated.delete(ws);
      lobby.add(ws);
      return send(tableList());
    }
    if (msg.t === 'join' || msg.t === 'create_table') {
      const playerId = String(msg.playerId ?? '').slice(0, 64);
      const token = String(msg.token ?? '').slice(0, 128);
      if (!playerId || token.length < 16) return;
      try {
        const before = seated.get(ws);
        let room: Room;
        if (msg.t === 'create_table') room = createTable(msg, ws, playerId, token);
        else {
          room = findTable(msg);
          room.join(ws, playerId, token, String(msg.name ?? ''), msg.code);
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
    lobby.delete(ws);
    seated.get(ws)?.leave(ws);
    seated.delete(ws);
  };
  ws.on('close', gone);
  ws.on('error', gone);
});

void art.start();
void ensureMusic(MUSIC_DIR, process.env);

server.listen(PORT, () => {
  console.log(`Hearthforge listening on http://0.0.0.0:${PORT}`);
  console.log(`Art: ${art.tiles === 'generated' ? 'generated pixel art' : `${art.tiles} pack (falls back to generated art if unavailable)`}, item icons: ${art.icons}. Packs are kept in ${ART_DIR}`);
  console.log(`Music: ${musicEnabled(process.env) ? `on, tracks are kept in ${MUSIC_DIR} (silent until some are there)` : 'off (HEARTHFORGE_MUSIC)'}`);
  if (!claude) console.log('Dungeon Master: scripted fallback (set ANTHROPIC_API_KEY to enable the AI DM)');
  else if (claude.models.forced) console.log(`Dungeon Master: Claude, every call on ${claude.models.forced} (HEARTHFORGE_DM_FORCE_MODEL)`);
  else console.log(`Dungeon Master: Claude. Key moments: ${claude.models.key}. Narration and combat: ${claude.models.standard}. Background: ${claude.models.background}.`);
});

function shutdown() {
  for (const room of rooms.values()) room.saveNow();
  store.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
