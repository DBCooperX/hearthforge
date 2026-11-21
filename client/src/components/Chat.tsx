import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { GameState } from '../../../shared/types';
import { useLang, useT } from '../i18n';
import { playerId, useTypingSignal, type Connection } from '../net';

/** The newest message somebody else wrote, so the chat button can show what is unread. */
export const lastForeignChat = (conn: Connection) => [...conn.chat].reverse().find((m) => m.from !== playerId)?.id ?? 0;

interface Props {
  state: GameState;
  conn: Connection;
  onClose?: () => void;
}

/**
 * Table talk: the players speaking to each other out of character. The Dungeon Master never
 * reads it. A whisper goes to one player only.
 */
export function ChatPanel({ state, conn, onClose }: Props) {
  const t = useT();
  const { lang } = useLang();
  const [text, setText] = useState('');
  const [to, setTo] = useState('');
  const feed = useRef<HTMLDivElement>(null);
  /** Whether the feed shows its newest line; scrolled up to read, it stays put and offers a jump down. */
  const [atEnd, setAtEnd] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const signal = useTypingSignal(conn, 'chat');
  const others = state.players.filter((p) => p.id !== playerId);
  const target = others.find((p) => p.id === to);
  const last = conn.chat[conn.chat.length - 1]?.id;
  const toEnd = () => { const el = feed.current; if (el) el.scrollTop = el.scrollHeight; setAtEnd(true); setUnseen(0); };
  // Scrolls the feed only, never the page around it, so the room does not jump when someone writes.
  useEffect(() => {
    if (last === undefined) return;
    const mine = conn.chat[conn.chat.length - 1]?.from === playerId;
    if (atEnd || mine) toEnd();
    else setUnseen((n) => n + 1);
  }, [last]);
  const onScroll = () => {
    const el = feed.current;
    if (!el) return;
    const end = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setAtEnd(end);
    if (end) setUnseen(0);
  };
  const typing = others.filter((p) => conn.typing[p.id] === 'chat').map((p) => p.name);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    conn.send({ t: 'chat', text: text.trim(), ...(target ? { to: target.id } : {}) });
    setText('');
    signal('');
  };
  return (
    <section className="chat">
      <header>
        <h2>{t('Table talk')}</h2>
        <small className="muted">{t('Between players. The Dungeon Master does not hear it.')}</small>
        {onClose && <button className="link" onClick={onClose} aria-label={t('Close')}>✕</button>}
      </header>
      <div className="chat-feed-wrap">
        <div className="chat-feed" ref={feed} onScroll={onScroll}>
          {conn.chat.length === 0 && <p className="muted">{others.length ? t('Nothing said yet.') : t('You are alone at the table. Talk starts when someone joins.')}</p>}
          {conn.chat.map((m, i) => {
            const mine = m.from === playerId;
            const prev = conn.chat[i - 1];
            // Lines in a row from the same person, said within a few minutes, share one name.
            const follows = !!prev && prev.from === m.from && prev.to === m.to && m.at - prev.at < 5 * 60_000;
            return (
              <p key={m.id} className={['chat-line', mine && 'mine', m.to && 'whisper', follows && 'follows'].filter(Boolean).join(' ')}>
                {!follows && (
                  <b>
                    {mine ? t('You') : m.name}{m.to && <i> {mine ? t('whisper to {name}', { name: m.toName ?? '' }) : t('whispers to you')}</i>}
                    <time dateTime={new Date(m.at).toISOString()}>{new Date(m.at).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}</time>
                  </b>
                )}
                {m.text}
              </p>
            );
          })}
        </div>
        {unseen > 0 && <button type="button" className="chat-new" onClick={toEnd}>↓ {t('New messages')} ({unseen})</button>}
        {typing.length > 0 && <p className="chat-typing">{typing.length === 1 ? t('{name} is typing…', { name: typing[0] }) : t('{names} are typing…', { names: typing.join(', ') })}</p>}
      </div>
      <form className="chat-form" onSubmit={submit}>
        {others.length > 0 && (
          <select value={target ? to : ''} onChange={(e) => setTo(e.target.value)} aria-label={t('Who hears it')} title={t('Who hears it')}>
            <option value="">{t('Everyone')}</option>
            {others.map((p) => <option key={p.id} value={p.id}>{t('Whisper: {name}', { name: p.name })}</option>)}
          </select>
        )}
        <input value={text} maxLength={500} onChange={(e) => { setText(e.target.value); signal(e.target.value); }}
          placeholder={target ? t('Whisper to {name}…', { name: target.name }) : t('Say something to the table…')} />
        <button disabled={!text.trim()}>{t('Send')}</button>
      </form>
    </section>
  );
}

const POS_KEY = 'hf.chatPos';
type Pos = { x: number; y: number };
const SIZE_KEY = 'hf.chatSize';
type Size = { w: number; h: number };
const MIN: Size = { w: 280, h: 220 };
const loadSize = (): Size | null => { try { const p = JSON.parse(localStorage.getItem(SIZE_KEY) ?? 'null'); return p && Number.isFinite(p.w) && Number.isFinite(p.h) ? p : null; } catch { return null; } };
const loadPos = (): Pos | null => { try { const p = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null'); return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null; } catch { return null; } };

/** Table talk as a floating window: drag it by the title bar; it stays where you left it. */
export function ChatWindow(props: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(loadPos);
  const [size, setSize] = useState<Size | null>(loadSize);
  /** A size that fits the window: never below the minimum, never past the screen edge. */
  const fit = (z: Size, at: Pos | null): Size => {
    const left = at?.x ?? Math.max(0, window.innerWidth - 12 - z.w);
    const top = at?.y ?? 52;
    return {
      w: Math.round(Math.max(Math.min(MIN.w, window.innerWidth - 24), Math.min(window.innerWidth - left - 8, z.w))),
      h: Math.round(Math.max(Math.min(MIN.h, window.innerHeight - 24), Math.min(window.innerHeight - top - 8, z.h))),
    };
  };
  const keep = (p: Pos): Pos => {
    const w = ref.current?.offsetWidth ?? 360;
    return { x: Math.max(0, Math.min(window.innerWidth - Math.min(w, 120), p.x)), y: Math.max(0, Math.min(window.innerHeight - 40, p.y)) };
  };
  // Keep it reachable when the browser window gets smaller.
  useEffect(() => {
    const onResize = () => {
      setPos((p) => (p ? keep(p) : p));
      setSize((z) => (z ? fit(z, ref.current ? { x: ref.current.getBoundingClientRect().left, y: ref.current.getBoundingClientRect().top } : null) : z));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    if (!el.closest('.chat > header') || el.closest('button')) return;
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const dx = e.clientX - box.left, dy = e.clientY - box.top;
    let last: Pos = { x: box.left, y: box.top };
    const move = (ev: PointerEvent) => { last = keep({ x: ev.clientX - dx, y: ev.clientY - dy }); setPos(last); };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try { localStorage.setItem(POS_KEY, JSON.stringify(last)); } catch { /* private mode: the position just is not remembered */ }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  };
  const t = useT();
  const grow = (e: RPointerEvent<HTMLDivElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    // From here the window is anchored by its top left corner, so the grip follows the pointer.
    const at: Pos = { x: box.left, y: box.top };
    setPos(at);
    const sx = e.clientX, sy = e.clientY;
    let last: Size = { w: box.width, h: box.height };
    const move = (ev: PointerEvent) => { last = fit({ w: box.width + ev.clientX - sx, h: box.height + ev.clientY - sy }, at); setSize(last); };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try { localStorage.setItem(POS_KEY, JSON.stringify(at)); localStorage.setItem(SIZE_KEY, JSON.stringify(last)); } catch { /* private mode: not remembered */ }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div ref={ref} className={`chat-float panel${size ? ' sized' : ''}`}
      style={{ ...(pos ? { left: pos.x, top: pos.y, right: 'auto' } : {}), ...(size ? { width: size.w, height: size.h } : {}) }}>
      <div className="chat-drag" onPointerDown={down} onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('.chat > header')) return; try { localStorage.removeItem(POS_KEY); localStorage.removeItem(SIZE_KEY); } catch { /* ignore */ } setPos(null); setSize(null); }}>
        <ChatPanel {...props} />
      </div>
      <div className="chat-grip" onPointerDown={grow} role="separator" aria-label={t('Resize window')} title={t('Resize window')} />
    </div>
  );
}
