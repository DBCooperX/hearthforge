import { useState } from 'react';
import { CLASS_INFO } from '../../../shared/content';
import type { ClassId, GameState } from '../../../shared/types';
import { spriteUrl } from '../game/sprites';
import { playerId, type Connection } from '../net';

export function JoinScreen({ conn }: { conn: Connection }) {
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
        <p className="tagline">Dungeons &amp; Dragons at your own hearth, with an AI Dungeon Master.</p>
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Adventurer" autoFocus />
        </label>
        <label>
          Table
          <input value={room} onChange={(e) => setRoom(e.target.value)} maxLength={32} placeholder="hearth" />
          <small>Friends who enter the same table name play in the same adventure.</small>
        </label>
        <button className="primary" disabled={!conn.connected}>{conn.connected ? 'Sit down at the table' : 'Connecting…'}</button>
      </form>
    </div>
  );
}

export function PartySetup({ state, conn }: { state: GameState; conn: Connection }) {
  const [names, setNames] = useState<Record<string, string>>({});
  const full = state.characters.length >= 4;
  return (
    <div className="splash">
      <div className="panel setup">
        <h1>Gather your party</h1>
        <p className="tagline">
          Table <b>{state.room}</b> · {state.players.filter((p) => p.connected).map((p) => p.name).join(', ')}
        </p>
        <div className="class-grid">
          {(Object.keys(CLASS_INFO) as ClassId[]).map((id) => (
            <div className="class-card" key={id}>
              <img className="pixel" src={spriteUrl(id)} alt="" />
              <h3 style={{ color: CLASS_INFO[id].color }}>{CLASS_INFO[id].name}</h3>
              <p>{CLASS_INFO[id].blurb}</p>
              <input
                placeholder="Name (optional)"
                maxLength={20}
                value={names[id] ?? ''}
                onChange={(e) => setNames({ ...names, [id]: e.target.value })}
              />
              <button
                disabled={full}
                onClick={() => { conn.send({ t: 'add_character', classId: id, name: names[id] ?? '' }); setNames({ ...names, [id]: '' }); }}
              >
                Add {CLASS_INFO[id].name}
              </button>
            </div>
          ))}
        </div>
        <h2>Party ({state.characters.length}/4)</h2>
        {state.characters.length === 0 && <p className="muted">No heroes yet. Playing solo? Add up to four and control them all.</p>}
        <ul className="roster">
          {state.characters.map((c) => (
            <li key={c.id}>
              <img className="pixel" src={spriteUrl(c.classId)} alt="" />
              <span><b>{c.name}</b> the {c.className}</span>
              <span className="muted">{state.players.find((p) => p.id === c.ownerId)?.name}</span>
              {c.ownerId === playerId && <button className="link" onClick={() => conn.send({ t: 'remove_character', characterId: c.id })}>remove</button>}
            </li>
          ))}
        </ul>
        <button className="primary" disabled={!state.characters.length} onClick={() => conn.send({ t: 'start' })}>Descend into the cellar</button>
        <p className="muted small">
          Dungeon Master: {state.dmMode === 'claude' ? `Claude (${state.dmModel})` : 'scripted fallback. Set ANTHROPIC_API_KEY on the server for the AI Dungeon Master.'}
        </p>
      </div>
    </div>
  );
}
