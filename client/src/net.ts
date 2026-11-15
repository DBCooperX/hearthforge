import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '../../shared/i18n';
import type { ChatMessage, ClientMessage, GameState, ServerMessage, TableSummary, TypingWhere } from '../../shared/types';

function makeId(bytes = 16): string {
  // crypto.randomUUID needs a secure context, and LAN installs are usually plain http.
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function stored(key: string, make: () => string): string {
  try {
    const v = localStorage.getItem(key);
    if (v) return v;
    const fresh = make();
    localStorage.setItem(key, fresh);
    return fresh;
  } catch {
    return make();
  }
}

/** Public: everyone at the table sees it next to your name and your heroes. */
export const playerId = stored('hearthforge.playerId', makeId);
/** Secret: proves to the server that a seat is yours, so only this browser can take it back. */
const token = stored('hearthforge.token', () => makeId(32));

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
  /** Why the last attempt to sit down was refused, in English. */
  joinError: string | null;
  /** True between asking for a seat and the server's answer. */
  joining: boolean;
  toasts: { id: number; text: string }[];
  send: (msg: ClientMessage) => void;
  join: (room: string, name: string, code?: string) => void;
  create: (name: string, table: NewTable) => void;
  /** Get up from the table and go back to the lobby. */
  leave: () => void;
  onMoved: (fn: MoveListener) => () => void;
  toast: (text: string) => void;
}

type Session = { room: string; name: string; code?: string };

export function useConnection(): Connection {
  const [state, setState] = useState<GameState | null>(null);
  const [connected, setConnected] = useState(false);
  const [tables, setTables] = useState<TableSummary[] | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState<Record<string, TypingWhere>>({});
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const ws = useRef<WebSocket | null>(null);
  const session = useRef<Session | null>(null);
  const listeners = useRef(new Set<MoveListener>());
  const toastSeq = useRef(0);
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const toast = useCallback((text: string) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-3), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
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
    raw({ t: 'lobby' });
  }, [raw]);

  useEffect(() => {
    let closed = false;
    let retry = 500;
    let timer: ReturnType<typeof setTimeout>;
    const connect = () => {
      const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      ws.current = sock;
      sock.onopen = () => {
        retry = 500;
        setConnected(true);
        const s = session.current;
        // After a dropped connection the token gets the seat back; nobody else can take it meanwhile.
        if (s) sock.send(JSON.stringify({ t: 'join', room: s.room, name: s.name, code: s.code, playerId, token }));
        else sock.send(JSON.stringify({ t: 'lobby' }));
      };
      sock.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as ServerMessage;
        switch (msg.t) {
          case 'state':
            setState(msg.state);
            setJoining(false);
            setJoinError(null);
            setLinkedTable(msg.state.room);
            break;
          case 'tables': setTables(msg.tables); break;
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
            break;
          case 'error':
            if (msg.join) { toLobby(); setJoinError(msg.message); }
            else toast(msg.message);
            break;
        }
      };
      sock.onclose = () => {
        setConnected(false);
        if (closed) return;
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
      raw({ t: 'join', room, name, code, playerId, token });
    },
    [raw],
  );

  const create = useCallback(
    (name: string, table: NewTable) => {
      saveName(name);
      setJoinError(null);
      setJoining(true);
      raw({ t: 'create_table', name, playerId, token, ...table });
    },
    [raw],
  );

  // Once seated, remember the table so a dropped connection finds its way back.
  const room = state?.room;
  useEffect(() => {
    if (room && session.current?.room !== room) session.current = { room, name: savedName() };
  }, [room]);

  const leave = useCallback(() => raw({ t: 'leave_table' }), [raw]);

  const onMoved = useCallback((fn: MoveListener) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);

  return { state, connected, tables, chat, typing, joinError, joining, toasts, send: raw, join, create, leave, onMoved, toast };
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
