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
import { readBody as readRaw } from './http';
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
import { TableBin } from './bin';
import { accountApi } from './accountApi';
import { Config } from './admin/config';
import { testKey } from './admin/keytest';
import { Logs } from './admin/logs';
import { Updater } from './admin/updater';
import { Usage, sampleCost } from './admin/usage';
import { Credits, type CostKind } from './credits';
import { Illustrator, PictureError } from './illustrations';
import { isAccountId } from '../../shared/accounts';
import { OUT_OF_CREDIT } from '../../shared/credits';
import { CampaignError, CampaignLibrary } from './campaign/library';
import { setShelf } from './campaign/registry';
import { CAMPAIGN_MAX_BYTES, CAMPAIGN_SOURCES } from '../../shared/campaign';

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
const credits = new Credits(DATA_DIR);
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
// Picture keys are read as they are saved in the Innkeeper, so a new key works without a restart.
const illustrator = new Illustrator(env.PICTURES_DIR ?? join(DATA_DIR, 'pictures'), (key) => config.next(key));
const claude = createDM(env, (sample) => {
  usage.record(sample);
  const usd = sampleCost(sample);
  if (usd) bill(sample.table, usd, 'claude');
});
const dm = claude ?? new ScriptedDM();
// Campaign books: read once by the AI when they arrive, then looked up section by section in play.
const campaigns = new CampaignLibrary(DATA_DIR);
if (claude) campaigns.reader = (id, book, progress) => claude.readCampaign(id, book, progress);
setShelf(campaigns, (playerId) => {
  const a = isAccountId(playerId) ? accounts.get(playerId) : null;
  return a ? { id: a.id, innkeeper: a.role === 'innkeeper' } : null;
});
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

/** An account as credits need it. */
function creditAccount(id: string) {
  const a = accounts.get(id);
  return a ? { id: a.id, username: a.username, role: a.role } : null;
}

/**
 * The accounts a cost at a table is shared among: the players sitting there right now, or, when nobody is (memory
 * kept up after everyone left), everyone with a seat. Seats from before accounts pay nothing.
 */
function payersAt(table: string): string[] {
  const room = rooms.get(table);
  if (!room) return [];
  const seats = room.game.s.players.filter((p) => isAccountId(p.id) && accounts.get(p.id));
  const here = seats.filter((p) => p.connected);
  return (here.length ? here : seats).map((p) => p.id);
}

/** Book what the AI cost at a table, and tell the players charged how much credit is left. */
function bill(table: string, usd: number, kind: CostKind) {
  // Reading a campaign book is paid by whoever brought it; books from the list for everyone are on the house.
  if (table.startsWith('campaign:')) {
    const owner = campaigns.info(table.slice(9))?.owner;
    if (owner && accounts.get(owner)) tellCredits(credits.charge([owner], usd, kind));
    return;
  }
  tellCredits(credits.charge(payersAt(table), usd, kind));
}

/** Send these accounts their credit, on every device they are signed in on. Only to those who can run out. */
function tellCredits(ids: string[], always = false) {
  for (const id of ids) {
    const a = creditAccount(id);
    if (!a) continue;
    const credit = credits.view(a);
    if (!credit.limited && !always) continue;
    const payload = JSON.stringify({ t: 'credits', credit } satisfies ServerMessage);
    for (const [ws, c] of conns) if (c.accountId === id && ws.readyState === ws.OPEN) ws.send(payload);
  }
}

const bin = new TableBin(store, accounts);

const hooks: RoomHooks = {
  binned: (state, by) => { bin.add(state, by); },
  renamed: (room) => accounts.retitle(room.name, room.game.s.table.title),
  changed: pushTables,
  detached: (ws) => void seated.delete(ws),
  closed: (room) => { rooms.delete(room.name); pushTables(); },
  newCode,
  paused: (room) => auth.paused(room.name),
  stats: (playerId, delta, heroes) => accounts.credit(playerId, delta, heroes),
  mayAsk: (playerId) => {
    const a = isAccountId(playerId) ? creditAccount(playerId) : null;
    return !a || credits.mayPlay(a) ? null : OUT_OF_CREDIT;
  },
  pictures: {
    gate: (room, moment) => {
      const why = illustrator.gate(room.name, moment);
      if (why) return why;
      // A picture is not started for players whose credit is used up; the story itself goes on.
      const broke = payersAt(room.name).some((id) => { const a = creditAccount(id); return a && !credits.mayPlay(a); });
      return broke ? 'credit' : null;
    },
    paint: (room, entryId, ask) => {
      const scene = room.game.s.log.find((l) => l.id === entryId)?.scene;
      illustrator.paint({ table: room.name, tableTitle: room.game.s.table.title, entry: entryId, ask, where: scene?.where, time: scene?.time }, (usd) => bill(room.name, usd, 'images'))
        .then((p) => { if (room.game.setPicture(entryId, p.id)) room.flush(); })
        .catch(() => { if (room.game.setPicture(entryId, null)) room.flush(); });
    },
  },
};

const openRoom = (id: string) => new Room(id, dm, store, TIMING, hooks);
// Every saved table is listed in the lobby. A table costs nothing until somebody sits down at it.
for (const id of store.names()) rooms.set(id, openRoom(id));

/** A table comes back from the bin and is listed again. */
function restoreTable(binId: number, by: { id: string; innkeeper: boolean }) {
  const out = bin.restore(binId, by, (id) => rooms.has(id), (code) => [...rooms.values()].some((r) => r.game.s.table.code === code));
  rooms.set(out.room, openRoom(out.room));
  pushTables();
  return out;
}

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
  credits.flush();
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
  credits,
  creditsChanged: (ids) => tellCredits(ids, true),
  logs,
  updater,
  store,
  rooms,
  openRoom: (id) => openRoom(id),
  bin,
  restoreTable,
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


const readBody = (req: IncomingMessage, max: number) => readRaw(req, max, () => new ArtError('too_big'));

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

/** Campaign books: every signed-in player may bring one; the Innkeeper sees and manages them all. */
async function campaignApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const me = accounts.account(req.headers[SESSION_HEADER]);
  const viewer = me ? { id: me.id, innkeeper: me.role === 'innkeeper' } : null;
  const shelf = () => ({ books: campaigns.list(viewer), ai: !!claude });
  try {
    if (!viewer) { req.resume(); return json(401, { error: 'signed_out' }); }
    if (req.method === 'GET' && url.pathname === '/api/campaigns') return json(200, shelf());
    if (req.method !== 'POST') return json(405, { error: 'bad_request' });
    if (url.pathname === '/api/campaigns/upload') {
      if (!claude) { req.resume(); return json(400, { error: 'no_dm' }); }
      const body = await readBody(req, CAMPAIGN_MAX_BYTES);
      campaigns.add(String(url.searchParams.get('name') ?? 'campaign.pdf').slice(0, 160), new Uint8Array(body), viewer.id);
      return json(200, shelf());
    }
    if (url.pathname === '/api/campaigns/action') {
      const m = JSON.parse((await readBody(req, 4 * 1024)).toString('utf8') || '{}') as Record<string, unknown>;
      const id = String(m.id ?? '');
      if (m.do === 'fetch') {
        if (!claude) return json(400, { error: 'no_dm' });
        if (!CAMPAIGN_SOURCES.some((x) => x.id === m.source)) throw new CampaignError('bad_request');
        await campaigns.fetchSource(String(m.source), viewer.id);
      } else if (m.do === 'remove') campaigns.remove(id, viewer);
      else if (m.do === 'retry') campaigns.retry(id, viewer);
      else if (m.do === 'share') campaigns.share(id, viewer, m.everyone === true);
      else throw new CampaignError('bad_request');
      return json(200, shelf());
    }
    return json(404, { error: 'bad_request' });
  } catch (err) {
    if (err instanceof CampaignError) return json(err.code === 'not_found' ? 404 : err.code === 'forbidden' ? 403 : 400, { error: err.code });
    if (err instanceof ArtError && err.code === 'too_big') return json(413, { error: 'too_big' });
    if (err instanceof SyntaxError) return json(400, { error: 'bad_request' });
    console.warn('[campaign]', err);
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
      // A player whose credit is used up hears the story in silence; the others' narrator reads on.
      if (!credits.mayPlay(account)) return json(402, { error: 'out_of_credit' });
      const id = Number(url.searchParams.get('entry'));
      const entry = room.game.s.log.find((l) => l.id === id);
      if (!entry || entry.kind !== 'dm') return json(404, { error: 'bad_request' });
      const parts = speechParts(entry.text);
      const part = Math.max(0, Math.floor(Number(url.searchParams.get('part')) || 0));
      if (part >= parts.length) return json(404, { error: 'bad_request' });
      const lang = langOf(room.game.s.language);
      const paid = (provider: 'openai' | 'elevenlabs', chars: number) => bill(room.name, credits.voiceCost(provider, chars), 'voice');
      const audio = await narrator.speak(parts[part], lang, undefined, paid);
      // The next part is made while this one plays.
      if (part + 1 < parts.length) void narrator.speak(parts[part + 1], lang, undefined, paid).catch(() => {});
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
      // The Innkeeper trying voices pays for it like anyone else: it shows in their own costs.
      const me = accounts.account(req.headers[SESSION_HEADER]);
      const audio = await narrator.speak(sample, lang, over, (provider, chars) => { if (me) credits.charge([me.id], credits.voiceCost(provider, chars), 'voice'); });
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

/** Story illustrations: the pictures themselves for anyone with the link, the setup for the Innkeeper. */
async function picturesApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  try {
    if (!admin.authorised(req)) { req.resume(); return json(403, { error: 'forbidden' }); }
    if (req.method === 'GET' && url.pathname === '/api/pictures/library') return json(200, illustrator.library());
    if (req.method === 'POST' && url.pathname === '/api/pictures/action') {
      const body = JSON.parse((await readRaw(req, 16 * 1024, () => new PictureError('bad_request'))).toString('utf8') || '{}') as Record<string, unknown>;
      if (body.do === 'sample') {
        // The Innkeeper trying a style pays for it like anyone else: it shows in their own costs.
        const me = accounts.account(req.headers[SESSION_HEADER]);
        const picture = await illustrator.sample((usd) => { if (me) credits.charge([me.id], usd, 'images'); });
        return json(200, { ...illustrator.library(), sample: picture });
      }
      const done = illustrator.action(body);
      const room = done.removed ? rooms.get(done.removed.table) : null;
      if (room && done.removed) {
        const entry = room.game.s.log.find((l) => l.id === done.removed!.entry);
        if (entry?.scene) { entry.scene.imageId = null; room.flush(); }
      }
      return json(200, illustrator.library());
    }
    return json(404, { error: 'bad_request' });
  } catch (err) {
    if (err instanceof PictureError) return json(err.code === 'failed' ? 502 : 400, { error: err.code });
    if (err instanceof SyntaxError) return json(400, { error: 'bad_request' });
    console.warn('[pictures]', err instanceof Error ? err.message : err);
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
  if (url.pathname.startsWith('/api/account/')) {
    void accountApi({ accounts, rooms, bin, restoreTable, ipOf, tablesChanged: pushTables, creditOf: (id) => { const a = creditAccount(id); return a ? credits.view(a) : null; } }, req, res, url);
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
  if (url.pathname === '/api/campaigns' || url.pathname.startsWith('/api/campaigns/')) {
    void campaignApi(req, res, url);
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
  if (url.pathname.startsWith('/pictures/')) {
    const found = illustrator.file(url.pathname.slice(10));
    if (!found) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': found.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' });
    createReadStream(found.path).pipe(res);
    return;
  }
  if (url.pathname.startsWith('/api/pictures/')) {
    void picturesApi(req, res, url);
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
      if (who) tellCredits([who.id], true);
      seated.get(ws)?.leave(ws);
      seated.delete(ws);
      lobby.add(ws);
      return send(tableList());
    }
    if (msg.t === 'delete_table' || msg.t === 'rename_table') {
      // Both are done from the list of tables, never from inside a game, by the host or the Innkeeper.
      const account = accounts.account(msg.session);
      const refuse = (message: string) => send({ t: 'error', message, join: true });
      if (!account) return refuse(JOIN_ERRORS.signIn);
      const room = rooms.get(tableId(msg.room));
      if (!room) return refuse(JOIN_ERRORS.noTable);
      if (room.game.s.hostId !== account.id && account.role !== 'innkeeper') return refuse(JOIN_ERRORS.notHost);
      const title = room.game.s.table.title;
      if (msg.t === 'delete_table') {
        if (String(msg.confirm ?? '').trim() !== title) return refuse(JOIN_ERRORS.wrongName);
        console.log(`[tables] ${account.username} deleted the table "${title}". It waits in the bin.`);
        auth.setPaused(room.name, false);
        room.close(account.username);
      } else {
        const next = String(msg.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
        if (!next) return refuse(JOIN_ERRORS.titleNeeded);
        room.rename(next);
      }
      return;
    }
    if (msg.t === 'join' || msg.t === 'create_table') {
      try {
        // A seat belongs to an account: whoever is signed in to it sits on it, from any device.
        const account = accounts.account(msg.session);
        if (!account) throw new JoinError(JOIN_ERRORS.signIn);
        const conn = conns.get(ws);
        if (conn) { conn.account = account.username; conn.accountId = account.id; }
        tellCredits([account.id], true);
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
  credits.forget(id);
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
  const pics = illustrator.library();
  console.log(`Story illustrations: ${!pics.config.on ? 'off (switch them on in Innkeeper → Art)' : !pics.keys[pics.config.provider] ? `${pics.config.provider} has no key yet` : `${pics.config.provider} ${pics.config.models[pics.config.provider]}`}.`);
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
  credits.flush();
  accounts.flush();
  store.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
