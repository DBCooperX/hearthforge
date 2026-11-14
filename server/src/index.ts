// Hearthforge server: serves the browser client and runs games over WebSockets.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage } from '../../shared/types';
import { artManifest, artMode, ensureArt } from './art';
import { Store } from './db';
import { createDM } from './dm/claude';
import { ScriptedDM } from './dm/scripted';
import { Room } from './room';

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = process.env.DATA_DIR ?? resolve('data');
const ART_DIR = process.env.ART_DIR ?? join(DATA_DIR, 'art');
const ART_MODE = artMode(process.env);
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
};

const store = new Store(DATA_DIR);
const dm = createDM(process.env) ?? new ScriptedDM();
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
    res.end(JSON.stringify({ ok: true, dm: dm.mode, model: dm.model, rooms: rooms.size }));
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

server.listen(PORT, () => {
  console.log(`Hearthforge listening on http://0.0.0.0:${PORT}`);
  console.log(`Art: ${ART_MODE === 'generated' ? 'generated pixel art' : `${ART_MODE} pack (falls back to generated art if unavailable)`}`);
  console.log(dm.mode === 'claude' ? `Dungeon Master: Claude (${dm.model})` : 'Dungeon Master: scripted fallback (set ANTHROPIC_API_KEY to enable the AI DM)');
});

function shutdown() {
  for (const room of rooms.values()) room.saveNow();
  store.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
