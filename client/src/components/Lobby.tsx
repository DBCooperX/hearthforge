import { useMemo, useState } from 'react';
import { ABILITIES, CLASS_INFO } from '../../../shared/content';
import { buildSheet, type Draft } from '../../../shared/build';
import { PREMADES, type Premade } from '../../../shared/premades';
import { ABILITY_KEYS, BACKGROUNDS, CLASSES, SPECIES, loc } from '../../../shared/rules';
import type { GameState } from '../../../shared/types';
import { Creator } from './Creator';
import { artOfCharacter, artOfDraft, heroUrl } from '../game/heroArt';
import { playerId, type Connection } from '../net';
import { LangSwitch, useLang, useT } from '../i18n';
import { LANGS } from '../../../shared/i18n';
import { MusicControl } from '../music';
import { classLabel } from '../game/util';

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
      <div className="splash-tools"><MusicControl /></div>
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
  const { lang } = useLang();
  const [flipped, setFlipped] = useState<string | null>(null);
  const [creating, setCreating] = useState<Draft | null>(null);
  const full = state.characters.length >= 4;
  const host = state.hostId === playerId;
  return (
    <div className="splash">
      <div className="splash-tools"><MusicControl /></div>
      <div className="panel setup">
        <h1>{t('Gather your party')}</h1>
        <p className="tagline">
          {t('Table')} <b>{state.room}</b> · {state.players.filter((p) => p.connected).map((p) => p.name).join(', ')}
        </p>
        <p className="muted center">{t('Take a ready-made hero, or create your own. Click a card to turn it over and read who they are.')}</p>
        <div className="hero-grid">
          <button type="button" className="hero-card create" disabled={full} onClick={() => setCreating({})}>
            <span className="create-icon">✒️</span>
            <h3>{t('Create your own hero')}</h3>
            <p>{t('Choose class, species, background, abilities, skills and gear, with an explanation and a recommendation for every choice.')}</p>
          </button>
          {PREMADES.map((p) => (
            <PremadeCard key={p.id} premade={p} flipped={flipped === p.id} onFlip={() => setFlipped(flipped === p.id ? null : p.id)}
              taken={state.characters.some((c) => c.premadeId === p.id)} full={full}
              onAdd={() => { conn.send({ t: 'add_premade', premadeId: p.id, name: '' }); setFlipped(null); }}
              onCustomize={() => setCreating({ ...p.spec, premadeId: undefined, backstory: loc(p.bio, lang) })} />
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
              <img className="pixel" src={heroUrl(artOfCharacter(c, state.items))} alt="" />
              <span><b>{c.name}</b> · {t(SPECIES[c.speciesId]?.name ?? '')} {classLabel(c, t)}</span>
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
      {creating && <Creator state={state} conn={conn} initial={creating} onClose={() => setCreating(null)} />}
    </div>
  );
}

interface CardProps { premade: Premade; flipped: boolean; taken: boolean; full: boolean; onFlip: () => void; onAdd: () => void; onCustomize: () => void }

/** A premade hero: portrait and pitch on the front, story and numbers on the back. */
function PremadeCard({ premade: p, flipped, taken, full, onFlip, onAdd, onCustomize }: CardProps) {
  const t = useT();
  const { lang } = useLang();
  const sheet = useMemo(() => buildSheet(p.spec)!, [p]);
  const spec = p.spec;
  const title = `${t(SPECIES[spec.speciesId].name)} ${t(CLASSES[spec.classId].name)}`;
  const spells = sheet.abilityIds.filter((id) => ABILITIES[id]?.spellLevel !== undefined || ABILITIES[id]?.oncePerRest);
  return (
    <div className={['hero-card', flipped && 'flipped', taken && 'taken'].filter(Boolean).join(' ')}>
      <div className="hero-inner">
        <button type="button" className="hero-face front" onClick={onFlip} tabIndex={flipped ? -1 : 0} aria-label={t('Turn the card over')}>
          <img className="pixel" src={heroUrl(artOfDraft(spec)!)} alt="" />
          <h3 style={{ color: CLASS_INFO[spec.classId].color }}>{spec.name}</h3>
          <small>{title}</small>
          <p>{loc(p.tagline, lang)}</p>
          <span className="hero-stats"><b>{sheet.maxHp}</b> {t('HP')} · <b>{sheet.ac}</b> {t('AC')}{sheet.maxMana > 0 && <> · <b>{sheet.maxMana}</b> {t('Mana')}</>}</span>
          <span className="flip-hint">{taken ? t('In the party') : `↻ ${t('Turn over')}`}</span>
        </button>
        <div className="hero-face back" aria-hidden={!flipped}>
          <button type="button" className="link flip-back" onClick={onFlip} tabIndex={flipped ? 0 : -1} title={t('Turn the card over')}>↻</button>
          <h3 style={{ color: CLASS_INFO[spec.classId].color }}>{spec.name}</h3>
          <small>{title} · {t(BACKGROUNDS[spec.backgroundId].name)}</small>
          <div className="hero-scroll">
            <p className="bio">{loc(p.bio, lang)}</p>
            <p><b>{t('How to play')}:</b> {loc(p.playstyle, lang)}</p>
            <p className="abil">{ABILITY_KEYS.map((k) => <span key={k}>{t(k.toUpperCase())} <b>{sheet.abilities[k]}</b></span>)}</p>
            <p><b>{t('Skills')}:</b> {sheet.skills.map((s) => t(s)).join(', ')}</p>
            {spells.length > 0 && <p><b>{t('Spells')}:</b> {spells.map((id) => t(ABILITIES[id].name)).join(', ')}</p>}
            {sheet.attack && <p><b>{t('Attack')}:</b> {t(sheet.attack.name)} {sheet.attack.bonus >= 0 ? '+' : ''}{sheet.attack.bonus}</p>}
          </div>
          <div className="hero-actions">
            <button type="button" className="primary" disabled={full || taken} tabIndex={flipped ? 0 : -1} onClick={onAdd}>{taken ? t('In the party') : t('Add to party')}</button>
            <button type="button" disabled={full} tabIndex={flipped ? 0 : -1} onClick={onCustomize} title={t('Open this hero in the character creator and change anything you like')}>{t('Customize')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
