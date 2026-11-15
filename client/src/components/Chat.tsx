import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../../../shared/types';
import { useT } from '../i18n';
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
  const [text, setText] = useState('');
  const [to, setTo] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const signal = useTypingSignal(conn, 'chat');
  const others = state.players.filter((p) => p.id !== playerId);
  const target = others.find((p) => p.id === to);
  const last = conn.chat[conn.chat.length - 1]?.id;
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [last]);
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
      <div className="chat-feed">
        {conn.chat.length === 0 && <p className="muted">{others.length ? t('Nothing said yet.') : t('You are alone at the table. Talk starts when someone joins.')}</p>}
        {conn.chat.map((m) => {
          const mine = m.from === playerId;
          return (
            <p key={m.id} className={['chat-line', mine && 'mine', m.to && 'whisper'].filter(Boolean).join(' ')}>
              <b>{mine ? t('You') : m.name}{m.to && <i> {mine ? t('whisper to {name}', { name: m.toName ?? '' }) : t('whispers to you')}</i>}</b>
              {m.text}
            </p>
          );
        })}
        {typing.length > 0 && <p className="chat-typing">{typing.length === 1 ? t('{name} is typing…', { name: typing[0] }) : t('{names} are typing…', { names: typing.join(', ') })}</p>}
        <div ref={end} />
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
