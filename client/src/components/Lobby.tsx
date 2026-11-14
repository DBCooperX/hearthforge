import { useState } from 'react';
import { CLASS_INFO } from '../../../shared/content';
import type { ClassId, GameState } from '../../../shared/types';
import { spriteUrl } from '../game/sprites';
import { playerId, type Connection } from '../net';
import { LangSwitch, useT } from '../i18n';
import { LANGS } from '../../../shared/i18n';

export function JoinScreen({ conn }: { conn: Connection }) {
  const t = useT();
  const [name, setName] = useState(() => localStorage.getItem('hearthforge.name') ?? '');
  const [room, setRoom] = useState(() => new URLSearchParams(location.search).get('room') ?? 'hearth');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim() || 'Adventurer';
    localStorage.setItem('hearthforge.name', n);
    conn.join(room.trim() || 'hearth', n);
  };
  return (
    <div className="splash">
      <form className="panel join" onSubmit={submit}>
        <h1>Hearthforge</h1>
        <div className="join-lang"><LangSwitch /></div>
        <p className="tagline">{t('Dungeons & Dragons at your own hearth, with an AI Dungeon Master.')}</p>
        <label>
          {t('Your name')}
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder={t('Adventurer')} autoFocus />
        </label>
        <label>
          {t('Table')}
          <input value={room} onChange={(e) => setRoom(e.target.value)} maxLength={32} placeholder="hearth" />
          <small>{t('Friends who enter the same table name play in the same adventure.')}</small>
        </label>
        <button className="primary" disabled={!conn.connected}>{conn.connected ? t('Sit down at the table') : t('Connecting…')}</button>
      </form>
    </div>
  );
}

export function PartySetup({ state, conn }: { state: GameState; conn: Connection }) {
  const t = useT();
  const [names, setNames] = useState<Record<string, string>>({});
  const full = state.characters.length >= 4;
  const host = state.hostId === playerId;
  return (
    <div className="splash">
      <div className="panel setup">
        <h1>{t('Gather your party')}</h1>
        <p className="tagline">
          {t('Table')} <b>{state.room}</b> · {state.players.filter((p) => p.connected).map((p) => p.name).join(', ')}
        </p>
        <div className="class-grid">
          {(Object.keys(CLASS_INFO) as ClassId[]).map((id) => (
            <div className="class-card" key={id}>
              <img className="pixel" src={spriteUrl(id)} alt="" />
              <h3 style={{ color: CLASS_INFO[id].color }}>{t(CLASS_INFO[id].name)}</h3>
              <p>{t(CLASS_INFO[id].blurb)}</p>
              <input
                placeholder={t('Name (optional)')}
                maxLength={20}
                value={names[id] ?? ''}
                onChange={(e) => setNames({ ...names, [id]: e.target.value })}
              />
              <button
                disabled={full}
                onClick={() => { conn.send({ t: 'add_character', classId: id, name: names[id] ?? '' }); setNames({ ...names, [id]: '' }); }}
              >
                {t('Add {class}', { class: t(CLASS_INFO[id].name) })}
              </button>
            </div>
          ))}
        </div>
        <div className="session-lang">
          <span>{t('Story language')}</span>
          {LANGS.map((l) => (
            <button key={l.id} className={state.language === l.id ? 'on' : ''} disabled={!host} onClick={() => conn.send({ t: 'set_language', lang: l.id })}>{l.label}</button>
          ))}
          <small className="muted">{host ? t('You opened this table, so you choose the language the story is told in. Everyone picks their own interface language.') : t('The host chooses the language the story is told in.')}</small>
        </div>
        <h2>{t('Party')} ({state.characters.length}/4)</h2>
        {state.characters.length === 0 && <p className="muted">{t('No heroes yet. Playing solo? Add up to four and control them all.')}</p>}
        <ul className="roster">
          {state.characters.map((c) => (
            <li key={c.id}>
              <img className="pixel" src={spriteUrl(c.classId)} alt="" />
              <span><b>{c.name}</b> · {t(c.className)}</span>
              <span className="muted">{state.players.find((p) => p.id === c.ownerId)?.name}</span>
              {c.ownerId === playerId && <button className="link" onClick={() => conn.send({ t: 'remove_character', characterId: c.id })}>{t('remove')}</button>}
            </li>
          ))}
        </ul>
        <button className="primary" disabled={!state.characters.length} onClick={() => conn.send({ t: 'start' })}>{t('Begin the adventure')}</button>
        <p className="muted small">
          {t('Dungeon Master')}: {state.dmMode === 'claude' ? `Claude (${state.dmModel})` : t('scripted fallback. Set ANTHROPIC_API_KEY on the server for the AI Dungeon Master.')}
        </p>
      </div>
    </div>
  );
}
