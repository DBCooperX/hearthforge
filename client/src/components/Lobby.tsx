import { useEffect, useMemo, useRef, useState } from 'react';
import { ABILITIES, CLASS_INFO } from '../../../shared/content';
import { buildSheet, type Draft } from '../../../shared/build';
import { PREMADES, type Premade } from '../../../shared/premades';
import { ABILITY_KEYS, BACKGROUNDS, CLASSES, SPECIES, loc } from '../../../shared/rules';
import { MAX_SEATS, type GameState, type TableSummary } from '../../../shared/types';
import { Creator } from './Creator';
import { artOfCharacter, artOfDraft, heroUrl } from '../game/heroArt';
import { inviteLink, linkedTable, playerId, savedName, type Connection } from '../net';
import { ChatPanel } from './Chat';
import { LangSwitch, useLang, useT } from '../i18n';
import { LANGS } from '../../../shared/i18n';
import { MusicControl } from '../music';
import { classLabel } from '../game/util';

/** The list of tables: sit down at one, come back to your seat, or open a new table. */
export function LobbyScreen({ conn }: { conn: Connection }) {
  const t = useT();
  const { lang } = useLang();
  const link = useMemo(linkedTable, []);
  const [name, setName] = useState(savedName);
  /** The locked table whose invite code is being asked for. */
  const [asking, setAsking] = useState<string | null>(null);
  const [code, setCode] = useState(link.code);
  const [anyCode, setAnyCode] = useState('');
  const [opening, setOpening] = useState(false);
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState(lang);
  const [seats, setSeats] = useState(MAX_SEATS);
  const [locked, setLocked] = useState(false);
  const me = name.replace(/\s+/g, ' ').trim();
  const tables = conn.tables ?? [];
  const ready = conn.connected && !!me && !conn.joining;

  // An invite link, or a reload while seated, goes straight to that table once we know who is asking.
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || !conn.connected || !link.room) return;
    tried.current = true;
    if (me) conn.join(link.room, me, link.code || undefined);
  }, [conn.connected]);

  const sit = (tb: TableSummary) => {
    const mine = tb.players.some((p) => p.id === playerId);
    if (tb.locked && !mine && asking !== tb.id) { setAsking(tb.id); setCode(tb.id === link.room ? link.code : ''); return; }
    conn.join(tb.id, me, tb.locked && !mine ? code.trim() : undefined);
  };
  const open = (e: React.FormEvent) => {
    e.preventDefault();
    conn.create(me, { title: title.trim() || t("{name}'s table", { name: me }), language, maxPlayers: seats, locked });
  };

  return (
    <div className="splash">
      <div className="splash-tools"><MusicControl /></div>
      <div className="panel lobby">
        <header className="join">
          <h1>Hearthforge</h1>
          <div className="join-lang"><LangSwitch /></div>
          <p className="tagline">{t('Dungeons & Dragons at your own hearth, with an AI Dungeon Master.')}</p>
        </header>
        <label className="lobby-name">
          {t('Your name')}
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder={t('Adventurer')} autoFocus={!me} />
          <small>{t('This is how the others see you. Each name can sit at a table only once, and this browser keeps your seat and your heroes for you.')}</small>
        </label>
        {conn.joinError && <p className="notice error" role="alert">{t(conn.joinError)}</p>}
        {!conn.connected && <p className="notice">{t('Connecting…')}</p>}

        <h2>{t('Tables')}</h2>
        {conn.tables && tables.length === 0 && <p className="muted">{t('Nobody has opened a table yet. Open the first one below.')}</p>}
        <ul className="tables">
          {tables.map((tb) => {
            const mine = tb.players.some((p) => p.id === playerId);
            const full = !mine && tb.players.length >= tb.maxPlayers;
            const clash = !mine && !!me && tb.players.some((p) => p.name.toLocaleLowerCase() === me.toLocaleLowerCase());
            return (
              <li key={tb.id} className={['table-card', mine && 'mine', tb.id === link.room && 'invited'].filter(Boolean).join(' ')}>
                <div className="table-head">
                  <b>{tb.locked && <span title={t('Needs an invite code')}>🔒 </span>}{tb.title}</b>
                  <span className={tb.playing ? 'status playing' : 'status'}>{tb.playing ? t('Adventure under way') : t('Gathering the party')}</span>
                </div>
                <div className="table-meta">
                  <span>{LANGS.find((l) => l.id === tb.language)?.label}</span>
                  <span>{t('{n} of {max} seats taken', { n: tb.players.length, max: tb.maxPlayers })}</span>
                  <span>{t('{n} heroes', { n: tb.heroes })}</span>
                </div>
                <div className="table-players">
                  {tb.players.map((p) => (
                    <span key={p.id} className={p.connected ? 'who here' : 'who'} title={p.connected ? t('At the table') : t('Away')}>
                      {p.id === tb.hostId && <span title={t('Host')}>👑 </span>}{p.name}
                    </span>
                  ))}
                  {tb.players.length === 0 && <span className="muted">{t('Nobody sits here.')}</span>}
                </div>
                <div className="table-join">
                  {asking === tb.id && !mine && (
                    <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} placeholder={t('Invite code')} autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter' && ready && code.trim()) sit(tb); }} />
                  )}
                  {clash && <small className="warn">{t('Someone called {name} already sits here.', { name: me })}</small>}
                  <button className={mine ? 'primary' : ''} disabled={!ready || full || clash || (asking === tb.id && !mine && !code.trim())} onClick={() => sit(tb)}
                    title={!me ? t('Enter your name first.') : undefined}>
                    {mine ? t('Back to your seat') : full ? t('Full') : t('Sit down')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="lobby-foot">
          {opening ? (
            <form className="open-table" onSubmit={open}>
              <h2>{t('Open a new table')}</h2>
              <label>
                {t('Name of the table')}
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} placeholder={me ? t("{name}'s table", { name: me }) : ''} autoFocus />
              </label>
              <div className="field">
                <span>{t('Story language')}</span>
                <span className="pick">
                  {LANGS.map((l) => <button type="button" key={l.id} className={language === l.id ? 'on' : ''} onClick={() => setLanguage(l.id)}>{l.label}</button>)}
                </span>
              </div>
              <div className="field">
                <span>{t('Players')}</span>
                <span className="pick">
                  {[1, 2, 3, 4].map((n) => <button type="button" key={n} className={seats === n ? 'on' : ''} onClick={() => setSeats(n)}>{n === 1 ? t('Solo') : n}</button>)}
                </span>
              </div>
              <label className="check">
                <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
                <span>{t('Only with an invite code')}<small>{t('The table is listed for everyone, but only people you give the code or the invite link to can sit down.')}</small></span>
              </label>
              <div className="row">
                <button className="primary" disabled={!ready} title={!me ? t('Enter your name first.') : undefined}>{t('Open the table')}</button>
                <button type="button" className="link" onClick={() => setOpening(false)}>{t('Cancel')}</button>
              </div>
            </form>
          ) : (
            <>
              <button className="primary" disabled={!conn.connected} onClick={() => setOpening(true)}>{t('Open a new table')}</button>
              <form className="by-code" onSubmit={(e) => { e.preventDefault(); if (anyCode.trim()) conn.join('', me, anyCode.trim()); }}>
                <input value={anyCode} onChange={(e) => setAnyCode(e.target.value.toUpperCase())} maxLength={8} placeholder={t('Invite code')} aria-label={t('Invite code')} />
                <button disabled={!ready || !anyCode.trim()}>{t('Join with a code')}</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function copyText(text: string, field: HTMLInputElement | null): boolean {
  // The clipboard API needs https; on a plain-http LAN address fall back to selecting the field.
  if (navigator.clipboard && window.isSecureContext) { void navigator.clipboard.writeText(text); return true; }
  if (!field) return false;
  field.select();
  try { return document.execCommand('copy'); } catch { return false; }
}

/** How to bring friends to this table: a link, and the code if it has one. */
export function Invite({ state, conn }: { state: GameState; conn: Connection }) {
  const t = useT();
  const field = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const host = state.hostId === playerId;
  const link = inviteLink(state.room, state.table.code);
  const free = state.table.maxPlayers - state.players.length;
  if (state.table.maxPlayers < 2) return null;
  return (
    <div className="invite">
      <span className="invite-title">{t('Invite friends')}</span>
      <input ref={field} readOnly value={link} onFocus={(e) => e.target.select()} aria-label={t('Invite link')} />
      <button onClick={() => { setCopied(copyText(link, field.current)); setTimeout(() => setCopied(false), 2000); }}>{copied ? t('Copied') : t('Copy link')}</button>
      <small className="muted">
        {state.table.code ? <>{t('Invite code')}: <b className="code">{state.table.code}</b> · </> : null}
        {free > 0 ? t('{n} free seats', { n: free }) : t('Every seat is taken.')}
      </small>
      {host && (
        <label className="check">
          <input type="checkbox" checked={!!state.table.code} onChange={(e) => conn.send({ t: 'set_code', locked: e.target.checked })} />
          <span>{t('Only with an invite code')}</span>
        </label>
      )}
    </div>
  );
}

/** Everyone with a seat: who is here, who is away, who hosts, who is ready. The host can pass the table on or remove someone. */
export function Players({ state, conn, pregame }: { state: GameState; conn: Connection; pregame?: boolean }) {
  const t = useT();
  const host = state.hostId === playerId;
  return (
    <ul className="players">
      {state.players.map((p) => {
        const heroes = state.characters.filter((c) => c.ownerId === p.id);
        const isHost = p.id === state.hostId;
        const typing = conn.typing[p.id];
        return (
          <li key={p.id} className={p.connected ? 'here' : 'away'}>
            <span className={p.connected ? 'dot ok' : 'dot'} title={p.connected ? t('At the table') : t('Away')} />
            <span className="who-name">
              <b>{p.name}</b>{p.id === playerId && <small> ({t('you')})</small>}
              <small>
                {isHost && <>👑 {t('Host')} · </>}
                {!p.connected ? t('Away') : typing ? t('is typing…') : heroes.length ? heroes.map((c) => c.name).join(', ') : t('no hero yet')}
              </small>
            </span>
            {pregame && state.players.length > 1 && !isHost && (
              <span className={state.ready.includes(p.id) ? 'ready yes' : 'ready'}>{state.ready.includes(p.id) ? `✔ ${t('Ready')}` : t('Not ready')}</span>
            )}
            {host && p.id !== playerId && (
              <span className="host-tools">
                <button className="link" title={t('Hand the table over to this player')} onClick={() => { if (window.confirm(t('Make {name} the host of this table?', { name: p.name }))) conn.send({ t: 'make_host', playerId: p.id }); }}>{t('Make host')}</button>
                <button className="link danger" title={pregame ? t('Their seat and their heroes are removed') : t('Their seat is freed and you take over their heroes')}
                  onClick={() => { if (window.confirm(t('Remove {name} from the table?', { name: p.name }))) conn.send({ t: 'kick', playerId: p.id }); }}>{t('Remove')}</button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The table before the adventure: everyone picks a hero, says they are ready, and the host begins. */
export function PartySetup({ state, conn }: { state: GameState; conn: Connection }) {
  const t = useT();
  const { lang } = useLang();
  const [flipped, setFlipped] = useState<string | null>(null);
  const [creating, setCreating] = useState<Draft | null>(null);
  const full = state.characters.length >= 4;
  const host = state.hostId === playerId;
  const hostName = state.players.find((p) => p.id === state.hostId)?.name ?? '';
  const many = state.players.length > 1;
  const iAmReady = state.ready.includes(playerId);
  const myHeroes = state.characters.filter((c) => c.ownerId === playerId).length;
  const waiting = state.players.filter((p) => p.connected && p.id !== state.hostId && !state.ready.includes(p.id));
  const begin = () => {
    if (waiting.length && !window.confirm(t('Not everyone is ready yet ({names}). Begin anyway?', { names: waiting.map((p) => p.name).join(', ') }))) return;
    conn.send({ t: 'start' });
  };
  const close = () => { if (window.confirm(t('Close this table for everyone? Its heroes and its story are deleted.'))) conn.send({ t: 'close_table' }); };
  return (
    <div className="splash">
      <div className="splash-tools"><MusicControl /><LangSwitch /></div>
      <div className="panel setup">
        <h1>{state.table.title}</h1>
        <p className="tagline">{t('Gather your party')}</p>
        <div className="table-room">
          <section className="seats">
            <h2>{t('At the table')} ({state.players.length}/{state.table.maxPlayers})</h2>
            <Players state={state} conn={conn} pregame />
            <Invite state={state} conn={conn} />
          </section>
          {state.table.maxPlayers > 1 && <ChatPanel state={state} conn={conn} />}
        </div>
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
          <small className="muted">{host ? t('You host this table, so you choose the language the story is told in. Everyone picks their own interface language.') : t('The host chooses the language the story is told in.')}</small>
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
        <div className="begin">
          {host ? (
            <>
              <button className="primary" disabled={!state.characters.length} onClick={begin}>{t('Begin the adventure')}</button>
              {many && <small className="muted">{waiting.length ? t('Still getting ready: {names}', { names: waiting.map((p) => p.name).join(', ') }) : t('Everyone is ready.')}</small>}
            </>
          ) : (
            <>
              <button className={iAmReady ? '' : 'primary'} disabled={!myHeroes} onClick={() => conn.send({ t: 'ready', ready: !iAmReady })}>{iAmReady ? t('Not ready after all') : t('I am ready')}</button>
              <small className="muted">{!myHeroes ? t('Choose a hero first.') : iAmReady ? t('Waiting for {name} to begin the adventure…', { name: hostName }) : t('{name} begins the adventure once everyone is ready.', { name: hostName })}</small>
            </>
          )}
          <span className="spacer" />
          <button className="link" onClick={() => conn.leave()} title={t('Your seat and your heroes at this table are given up')}>{t('Leave the table')}</button>
          {host && <button className="link danger" onClick={close}>{t('Close the table')}</button>}
        </div>
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
