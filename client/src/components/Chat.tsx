import { useEffect, useRef, useState } from 'react';
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
