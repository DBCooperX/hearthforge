// Hearthforge server: serves the browser client and runs games over WebSockets.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage } from '../../shared/types';
import { artManifest, artMode, ensureArt } from './art';
import { AUDIO_TYPES, byteRange, ensureMusic, musicEnabled, musicManifest } from './music';
import { Store } from './db';
import { createDM } from './dm/claude';
import { ScriptedDM } from './dm/scripted';
import { Room } from './room';

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = process.env.DATA_DIR ?? resolve('data');
const ART_DIR = process.env.ART_DIR ?? join(DATA_DIR, 'art');
const ART_MODE = artMode(process.env);
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

function roomFor(raw: string): Room {
  const name = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'hearth';
  let room = rooms.get(name);
  if (!room) {
    room = new Room(name, dm, store);
    rooms.set(name, room);
  }
  return room;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, dm: dm.mode, model: dm.model, models: claude?.models ?? null, rooms: rooms.size }));
    return;
  }
  if (url.pathname === '/api/art') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    res.end(JSON.stringify(artManifest(ART_DIR, ART_MODE) ?? { pack: 'generated', sprites: {} }));
    return;
  }
  if (url.pathname.startsWith('/art/')) {
    const file = join(ART_DIR, normalize(decodeURIComponent(url.pathname.slice(5))).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ART_DIR) || extname(file).toLowerCase() !== '.png' || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' });
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
  let room: Room | null = null;
  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    if (msg.t === 'join') {
      const playerId = String(msg.playerId ?? '').slice(0, 64);
      if (!playerId) return;
      room?.leave(ws);
      room = roomFor(String(msg.room ?? ''));
      room.join(ws, playerId, String(msg.name ?? ''));
      return;
    }
    room?.handle(ws, msg);
  });
  ws.on('close', () => room?.leave(ws));
  ws.on('error', () => room?.leave(ws));
});

void ensureArt(ART_DIR, ART_MODE, process.env);
void ensureMusic(MUSIC_DIR, process.env);

server.listen(PORT, () => {
  console.log(`Hearthforge listening on http://0.0.0.0:${PORT}`);
  console.log(`Art: ${ART_MODE === 'generated' ? 'generated pixel art' : `${ART_MODE} pack (falls back to generated art if unavailable)`}`);
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
