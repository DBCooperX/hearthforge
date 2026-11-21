import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '../../shared/i18n';
import { buildOf, isStale, mayAutoReload } from '../../shared/update';
import { reloadItemIcons } from './game/itemArt';
import { music } from './music';
import { sfx } from './sfx';
import { narrator } from './narrator';
import { CLOSED_REASONS } from './ui/labels';
import { accountSession, signedOut } from './account';
import { JOIN_ERRORS, type ChatMessage, type ClientMessage, type GameState, type ServerMessage, type TableSummary, type TestMonster, type TypingWhere } from '../../shared/types';
import type { CreditView } from '../../shared/credits';

function makeId(bytes = 16): string {
  // crypto.randomUUID needs a secure context, and LAN installs are usually plain http.
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Public: everyone at the table sees it next to your name and your heroes. It is the id of the
 * account this browser is signed in to, set once the server has said who that is. Until then it
 * is a throwaway that matches nobody.
 */
export let playerId = `guest-${makeId(8)}`;
export function setPlayerId(id: string) { playerId = id; }

/**
 * Before accounts, each browser had its own id and a secret token that proved its seats. They are
 * only read now, once, so the seats can move to the account.
 */
export function legacyIdentity(): { playerId: string; token: string } | null {
  try {
    const id = localStorage.getItem('hearthforge.playerId');
    const secret = localStorage.getItem('hearthforge.token');
    return id && secret ? { playerId: id, token: secret } : null;
  } catch {
    return null;
  }
}

const NAME_KEY = 'hearthforge.name';
export function savedName(): string {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}
function saveName(name: string) {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* not remembered */ }
}

/** The table named in the address bar: an invite link, or the table this tab sat at before a reload. */
export function linkedTable(): { room: string; code: string } {
  const q = new URLSearchParams(location.search);
  return { room: q.get('room') ?? '', code: q.get('code') ?? '' };
}
function setLinkedTable(room: string | null) {
  const url = new URL(location.href);
  if ((url.searchParams.get('room') ?? null) === room && !url.searchParams.has('code')) return;
  if (room) url.searchParams.set('room', room); else url.searchParams.delete('room');
  url.searchParams.delete('code');
  history.replaceState(null, '', url);
}

/** A link that brings a friend straight to this table. */
export function inviteLink(room: string, code: string | null): string {
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('room', room);
  if (code) url.searchParams.set('code', code);
  return url.toString();
}

/** The build this tab runs, read from its own entry script. Empty under the dev server. */
const ownBuild = typeof document === 'undefined' ? '' : buildOf(document.documentElement.outerHTML);
const RELOAD_KEY = 'hearthforge.reloaded';

function hasDraft(): boolean {
  return [...document.querySelectorAll('textarea, input[type="text"], input:not([type])')].some((el) => (el as HTMLInputElement).value.trim() !== '');
}

export type MoveListener = (id: string, path: { x: number; y: number }[]) => void;
export interface NewTable { title: string; language: Lang; maxPlayers: number; locked: boolean }

export interface Connection {
  state: GameState | null;
  connected: boolean;
  /** The tables the lobby lists. Null until the server has answered. */
  tables: TableSummary[] | null;
  /** Table talk this player may read, oldest first. */
  chat: ChatMessage[];
  /** Who is typing right now, by player id. */
  typing: Record<string, TypingWhere>;
  /** The monsters the test toolbox can pick from. Empty until the host asks for them. */
  testCatalog: TestMonster[];
  /** Why the last attempt to sit down was refused, in English. */
  joinError: string | null;
  /** True between asking for a seat and the server's answer. */
  joining: boolean;
  /** True when the server has been updated and this tab still runs the old client. */
  updateReady: boolean;
  /** Load the new client. Your seat comes back by itself, because the token and table are remembered. */
  reload: () => void;
  /** Short messages at the edge of the screen. A notice comes from the owner of the server and stays longer. */
  toasts: { id: number; text: string; notice?: boolean }[];
  send: (msg: ClientMessage) => void;
  join: (room: string, name: string, code?: string) => void;
  create: (name: string, table: NewTable) => void;
  /** Get up from the table and go back to the lobby. */
  leave: () => void;
  onMoved: (fn: MoveListener) => () => void;
  toast: (text: string, notice?: boolean) => void;
  /** This account's AI credit, once the server has said. */
  credit: CreditView | null;
}

type Session = { room: string; name: string; code?: string };

export function useConnection(): Connection {
  const [state, setState] = useState<GameState | null>(null);
  const [connected, setConnected] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [tables, setTables] = useState<TableSummary[] | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState<Record<string, TypingWhere>>({});
  const [testCatalog, setTestCatalog] = useState<TestMonster[]>([]);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string; notice?: boolean }[]>([]);
  const [credit, setCredit] = useState<CreditView | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const session = useRef<Session | null>(null);
  const listeners = useRef(new Set<MoveListener>());
  const toastSeq = useRef(0);
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const toast = useCallback((text: string, notice = false) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-3), { id, text, notice }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), notice ? 15000 : 3500);
  }, []);

  const raw = useCallback((msg: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
  }, []);

  /** Back to the list of tables. */
  const toLobby = useCallback(() => {
    session.current = null;
    setState(null);
    setChat([]);
    setTyping({});
    setJoining(false);
    setLinkedTable(null);
    raw({ t: 'lobby', session: accountSession() });
  }, [raw]);

  useEffect(() => {
    let closed = false;
    let retry = 500;
    let timer: ReturnType<typeof setTimeout>;
    // A new client build and new map tiles both need a fresh page: it happens by itself when that costs the player nothing.
    const reloadOrAsk = () => {
      let last = 0;
      try { last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch { /* no memory */ }
      if (mayAutoReload({ seated: !!session.current, hasDraft: hasDraft(), lastReload: last, now: Date.now() })) {
        try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* no memory */ }
        location.reload();
      } else setUpdateReady(true);
    };
    const connect = () => {
      const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      ws.current = sock;
      sock.onopen = () => {
        retry = 500;
        setConnected(true);
        const s = session.current;
        // After a dropped connection the token gets the seat back; nobody else can take it meanwhile.
        if (s) sock.send(JSON.stringify({ t: 'join', room: s.room, code: s.code, session: accountSession() } satisfies ClientMessage));
        else sock.send(JSON.stringify({ t: 'lobby', session: accountSession() } satisfies ClientMessage));
      };
      sock.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as ServerMessage;
        switch (msg.t) {
          case 'hello':
            if (isStale(ownBuild, msg.build)) reloadOrAsk();
            break;
          case 'assets':
            // The owner picks art, music and effects for the whole server; every open tab follows without asking the player.
            if (msg.icons) void reloadItemIcons();
            if (msg.music) void music.refresh();
            if (msg.sfx) void sfx.refresh();
            if (msg.voice) void narrator.refresh();
            if (msg.tiles) reloadOrAsk();
            break;
          case 'state':
            setState(msg.state);
            setJoining(false);
            setJoinError(null);
            setLinkedTable(msg.state.room);
            break;
          case 'tables': setTables(msg.tables); break;
          case 'test_catalog': setTestCatalog(msg.monsters); break;
          case 'moved': listeners.current.forEach((fn) => fn(msg.id, msg.path)); break;
          case 'chat': setChat((c) => (msg.replace ? msg.messages : [...c, ...msg.messages].slice(-200))); break;
          case 'typing': {
            const { playerId: id, where } = msg;
            clearTimeout(typingTimers.current.get(id));
            setTyping((t) => { const next = { ...t }; if (where) next[id] = where; else delete next[id]; return next; });
            // The other side renews the notice while it lasts, so a lost "stopped" never sticks.
            if (where) typingTimers.current.set(id, setTimeout(() => setTyping((t) => { const next = { ...t }; delete next[id]; return next; }), 5000));
            break;
          }
          case 'left':
            toLobby();
            if (msg.reason === 'kicked') toast('The host has removed you from the table.');
            if (msg.reason === 'closed') toast('The host has closed the table.');
            if (msg.reason === 'removed') toast('The innkeeper has removed you from the table.');
            if (msg.reason === 'restored') toast('This table was restored from a backup. Sit down again to carry on.');
            break;
          case 'notice': toast(msg.text, true); break;
          case 'credits': setCredit(msg.credit); break;
          case 'error':
            if (msg.join && msg.message === JOIN_ERRORS.signIn) { toLobby(); signedOut(); }
            else if (msg.join) { toLobby(); setJoinError(msg.message); }
            else toast(msg.message);
            break;
        }
      };
      sock.onclose = (ev) => {
        setConnected(false);
        if (closed) return;
        // The owner of the server closed this connection: do not knock again until the page is reloaded.
        if (ev.code === 4403) {
          closed = true;
          session.current = null;
          setState(null);
          setJoinError(ev.reason === 'banned' ? CLOSED_REASONS.banned : CLOSED_REASONS.removed);
          return;
        }
        timer = setTimeout(connect, retry);
        retry = Math.min(retry * 2, 8000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws.current?.close();
    };
  }, [toast, toLobby]);

  const join = useCallback(
    (room: string, name: string, code?: string) => {
      saveName(name);
      session.current = { room, name, code };
      setJoinError(null);
      setJoining(true);
      raw({ t: 'join', room, code, session: accountSession() });
    },
    [raw],
  );

  const create = useCallback(
    (name: string, table: NewTable) => {
      saveName(name);
      setJoinError(null);
      setJoining(true);
      raw({ t: 'create_table', session: accountSession(), ...table });
    },
    [raw],
  );

  // Once seated, remember the table so a dropped connection finds its way back.
  const room = state?.room;
  useEffect(() => {
    if (room && session.current?.room !== room) session.current = { room, name: savedName() };
  }, [room]);

  const reload = useCallback(() => location.reload(), []);

  const leave = useCallback(() => raw({ t: 'leave_table' }), [raw]);

  const onMoved = useCallback((fn: MoveListener) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);

  return { state, connected, tables, chat, typing, testCatalog, joinError, joining, updateReady, reload, toasts, send: raw, join, create, leave, onMoved, toast, credit };
}

/**
 * Tells the table that this player is typing, at most every two seconds, and that they
 * stopped when the box is emptied. Call the result with the box's current text.
 */
export function useTypingSignal(conn: Connection, where: TypingWhere) {
  const last = useRef(0);
  const { send } = conn;
  return useCallback((text: string) => {
    const now = Date.now();
    if (!text.trim()) {
      if (last.current) send({ t: 'typing', where: null });
      last.current = 0;
    } else if (now - last.current > 2000) {
      last.current = now;
      send({ t: 'typing', where });
    }
  }, [send, where]);
}
