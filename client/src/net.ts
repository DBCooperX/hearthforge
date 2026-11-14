import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, GameState, ServerMessage } from '../../shared/types';

function makeId(): string {
  // crypto.randomUUID needs a secure context, and LAN installs are usually plain http.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
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

export const playerId = stored('hearthforge.playerId', makeId);

export type MoveListener = (id: string, path: { x: number; y: number }[]) => void;

export interface Connection {
  state: GameState | null;
  connected: boolean;
  toasts: { id: number; text: string }[];
  send: (msg: ClientMessage) => void;
  join: (room: string, name: string) => void;
  onMoved: (fn: MoveListener) => () => void;
  toast: (text: string) => void;
}

export function useConnection(): Connection {
  const [state, setState] = useState<GameState | null>(null);
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const ws = useRef<WebSocket | null>(null);
  const session = useRef<{ room: string; name: string } | null>(null);
  const listeners = useRef(new Set<MoveListener>());
  const toastSeq = useRef(0);

  const toast = useCallback((text: string) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-3), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

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
        if (s) sock.send(JSON.stringify({ t: 'join', room: s.room, name: s.name, playerId }));
      };
      sock.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as ServerMessage;
        if (msg.t === 'state') setState(msg.state);
        else if (msg.t === 'moved') listeners.current.forEach((fn) => fn(msg.id, msg.path));
        else if (msg.t === 'error') toast(msg.message);
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
  }, [toast]);

  const send = useCallback((msg: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
  }, []);

  const join = useCallback(
    (room: string, name: string) => {
      session.current = { room, name };
      send({ t: 'join', room, name, playerId });
    },
    [send],
  );

  const onMoved = useCallback((fn: MoveListener) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);

  return { state, connected, toasts, send, join, onMoved, toast };
}
