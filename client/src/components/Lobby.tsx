import { useEffect, useMemo, useRef, useState } from 'react';
import { ABILITIES, CLASS_INFO } from '../../../shared/content';
import { buildSheet, type Draft } from '../../../shared/build';
import { PREMADES, type Premade } from '../../../shared/premades';
import { ABILITY_KEYS, BACKGROUNDS, CLASSES, loc } from '../../../shared/rules';
import { MAX_SEATS, type GameState, type TableSummary } from '../../../shared/types';
import { CUSTOM, CUSTOM_MAX, PREMISES, SEED_MAX, SURPRISE, normalizeSeed, type StartOptions } from '../../../shared/start';
import { Creator } from './Creator';
import { StyleSetup } from './StyleSetup';
import { artOfCharacter, artOfDraft, heroPortraitUrl } from '../game/heroArt';
import { inviteLink, linkedTable, playerId, type Connection } from '../net';
import type { AccountView } from '../../../shared/accounts';
import { ChatPanel } from './Chat';
import { Backdrop, Embers, Logo } from '../ui/Brand';
import { LangSwitch, useLang, useT } from '../i18n';
import { LANGS } from '../../../shared/i18n';
import { RATING_INFO, RULES_INFO, TONE_INFO } from '../../../shared/style';
import { Chip, Hint, Info } from '../ui/Hint';
import { TabBar } from '../ui/Window';
import { MusicControl } from '../music';
import { classLabel, heroTitle } from '../game/util';

/** The list of tables: sit down at one, come back to your seat, or open a new table. */
export interface Me { account: AccountView; onProfile: () => void; onSignOut: () => void }

export function LobbyScreen({ conn, me: who, onInnkeeper }: { conn: Connection; me: Me; onInnkeeper: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const link = useMemo(linkedTable, []);
  // At a table you are your account's name.
  const name = who.account.username;
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
    <div className="splash tavern">
      <Backdrop />
      <Embers />
      <div className="splash-tools"><MusicControl /></div>
      {who.account.role === 'innkeeper' && <button type="button" className="link innkeeper-door" onClick={onInnkeeper} title={t('For whoever runs this server')}>{t('Innkeeper')}</button>}
      <div className="panel lobby">
        <header className="join">
          <h1><Logo /></h1>
          <div className="rune-line" aria-hidden="true" />
          <div className="join-lang"><LangSwitch /></div>
          <p className="tagline">{t('Dungeons & Dragons at your own hearth, with an AI Dungeon Master.')}</p>
        </header>
        <div className="account-bar">
          <span>{t('Signed in as')} <b>{name}</b></span>
          {who.account.role === 'innkeeper' && <span className="role">{t('Innkeeper')}</span>}
          <Info text={t('Your seats and heroes belong to your account, so you can pick them up on any device.')} />
          <span className="spacer" />
          <button type="button" className="link" onClick={who.onProfile}>{t('Your account')}</button>
          <button type="button" className="link" onClick={who.onSignOut}>{t('Sign out')}</button>
        </div>
        {who.account.mustChange && <p className="notice">{t('You are still using a password you did not choose.')} <button type="button" className="link" onClick={who.onProfile}>{t('Choose your own')}</button></p>}
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
          <form className="open-table" onSubmit={open}>
            <div className="open-row">
              <b>{t('Open a new table')}</b>
              <span className="pick" role="group" aria-label={t('Players')}>
                {[1, 2, 3, 4].map((n) => <button type="button" key={n} className={seats === n ? 'on' : ''} aria-pressed={seats === n} title={n === 1 ? undefined : t('{n} players', { n })} onClick={() => setSeats(n)}>{n === 1 ? t('Solo') : `👥 ${n}`}</button>)}
              </span>
              <button className="primary" disabled={!ready} title={!me ? t('Enter your name first.') : undefined}>{t('Open the table')}</button>
              <button type="button" className="link" aria-expanded={opening} onClick={() => setOpening(!opening)}>{opening ? '▴' : '▾'} {t('More options')}</button>
            </div>
            {opening && (
              <div className="open-more">
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
                <label className="check">
                  <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
                  <span>{t('Only with an invite code')} <Info text={t('The table is listed for everyone, but only people you give the code or the invite link to can sit down.')} /></span>
                </label>
              </div>
            )}
          </form>
          <form className="by-code" onSubmit={(e) => { e.preventDefault(); if (anyCode.trim()) conn.join('', me, anyCode.trim()); }}>
            <input value={anyCode} onChange={(e) => setAnyCode(e.target.value.toUpperCase())} maxLength={8} placeholder={t('Invite code')} aria-label={t('Invite code')} />
            <button disabled={!ready || !anyCode.trim()}>{t('Join with a code')}</button>
          </form>
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

/** Where and how the adventure begins: the region, the premise and the world seed. The host chooses; everyone sees it. */
function WorldSetup({ state, conn }: { state: GameState; conn: Connection }) {
  const t = useT();
  const { lang } = useLang();
  const host = state.hostId === playerId;
  const start = state.table.start;
  const set = (patch: Partial<StartOptions>) => conn.send({ t: 'set_start', start: patch });
  // The seed and the host's own premise are typed locally and sent when the host is done with the field.
  const [seed, setSeed] = useState(start.seed);
  const [custom, setCustom] = useState(start.custom);
  const [copied, setCopied] = useState(false);
  const seedField = useRef<HTMLInputElement>(null);
  useEffect(() => setSeed(start.seed), [start.seed]);
  useEffect(() => setCustom(start.custom), [start.custom]);
  return (
    <div className="world-setup bare">
      <div className="field">
        <span>{t('Region')}</span>
        <span className="pick">
          <Chip on={start.region === 'random'} disabled={!host} onClick={() => set({ region: 'random' })}
            hint={t('Its own country, towns, people and troubles, rolled from the seed. Nobody at the table knows it yet.')}>🎲 {t('A new region')}</Chip>
          <Chip on={start.region === 'classic'} disabled={!host} onClick={() => set({ region: 'classic' })}
            hint={t('The handcrafted valley around Emberfall and the Old Hearthforge. Only its wilderness changes with the seed.')}>🔥 {t('Classic: the Emberfall Vale')}</Chip>
        </span>
      </div>
      <div className="field">
        <span>{t('How it begins')}</span>
        <span className="pick">
          <Chip on={start.premise === SURPRISE} disabled={!host} onClick={() => set({ premise: SURPRISE })}
            hint={t('The seed picks one of the openings. You find out when the story begins.')}>✨ {t('Surprise us')}</Chip>
          {PREMISES.map((p) => (
            <Chip key={p.id} on={start.premise === p.id} disabled={!host} hint={loc(p.blurb, lang)} onClick={() => set({ premise: p.id })}>{p.icon} {loc(p.label, lang)}</Chip>
          ))}
          <Chip on={start.premise === CUSTOM} disabled={!host} onClick={() => set({ premise: CUSTOM })}
            hint={t('Describe in a sentence or two how the story opens. The Dungeon Master builds the first scene around it.')}>✒️ {t('Our own idea')}</Chip>
        </span>
        {start.premise === CUSTOM && (
          <textarea className="field-wide" value={custom} maxLength={CUSTOM_MAX} rows={2} disabled={!host} placeholder={t('For example: We are a travelling circus, and last night our bear went missing.')}
            onChange={(e) => setCustom(e.target.value)} onBlur={() => { if (custom !== start.custom) set({ custom }); }} />
        )}
      </div>
      <div className="field">
        <span>{t('World seed')} <Info text={host
          ? t('The same seed with the same region and opening builds the same map, places, people and quests again. Type in a seed a friend gave you, or share yours. The Dungeon Master still tells the story anew each time.')
          : t('The host chooses the world. The same seed with the same region and opening builds the same map, places, people and quests again.')} /></span>
        <span className="seed-row">
          <input ref={seedField} className="code" value={seed} maxLength={SEED_MAX} readOnly={!host} spellCheck={false} aria-label={t('World seed')}
            onChange={(e) => setSeed(e.target.value.toUpperCase())}
            onBlur={() => { if (normalizeSeed(seed) !== start.seed) set({ seed }); else setSeed(start.seed); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
          {host && <button type="button" onClick={() => set({ seed: '' })} title={t('Roll a new seed')}>🎲 {t('New seed')}</button>}
          <button type="button" onClick={() => { setCopied(copyText(start.seed, seedField.current)); setTimeout(() => setCopied(false), 2000); }}>{copied ? t('Copied') : t('Copy')}</button>
        </span>
      </div>
    </div>
  );
}

type AdventureTab = 'world' | 'dm';

/**
 * Everything the host may decide about the adventure, folded into one line: what is set shows as chips,
 * and the choices themselves open on demand. A new table is ready to start without opening it.
 */
function AdventureSetup({ state, conn }: { state: GameState; conn: Connection }) {
  const t = useT();
  const { lang } = useLang();
  const [open, setOpen] = useState<AdventureTab | null>(null);
  const host = state.hostId === playerId;
  const { start, style } = state.table;
  const premise = PREMISES.find((p) => p.id === start.premise);
  const tone = TONE_INFO.find((x) => x.id === style.tone);
  const rules = RULES_INFO.find((x) => x.value === style.rules);
  const rating = RATING_INFO.find((x) => x.id === style.rating);
  const chips: { tab: AdventureTab; label: string; text: string }[] = [
    { tab: 'world', label: t('Region'), text: start.region === 'random' ? `🎲 ${t('A new region')}` : `🔥 ${t('Classic: the Emberfall Vale')}` },
    { tab: 'world', label: t('How it begins'), text: premise ? `${premise.icon} ${loc(premise.label, lang)}` : start.premise === CUSTOM ? `✒️ ${t('Our own idea')}` : `✨ ${t('Surprise us')}` },
    ...(tone ? [{ tab: 'dm' as const, label: t('Tone'), text: `${tone.icon} ${loc(tone.label, lang)}` }] : []),
    ...(rules ? [{ tab: 'dm' as const, label: t('Rules'), text: `⚖️ ${loc(rules.label, lang)}` }] : []),
    ...(rating ? [{ tab: 'dm' as const, label: t('Content rating'), text: `${rating.icon} ${loc(rating.label, lang)}` }] : []),
    { tab: 'dm', label: t('Story language'), text: `💬 ${LANGS.find((l) => l.id === state.language)?.label ?? state.language}` },
  ];
  return (
    <section className={open ? 'adventure open' : 'adventure'}>
      <div className="adventure-bar">
        <h2>{t('The adventure')}</h2>
        <span className="sum-chips">
          {chips.map((c) => (
            <Hint key={c.label} text={c.label}>
              <button type="button" className={open === c.tab ? 'sum-chip on' : 'sum-chip'} onClick={() => setOpen(c.tab)}>{c.text}</button>
            </Hint>
          ))}
        </span>
        <button type="button" className="adventure-toggle" aria-expanded={!!open} onClick={() => setOpen(open ? null : 'world')}>
          {open ? `▴ ${t('Hide options')}` : `▾ ${host ? t('Customize') : t('Show details')}`}
        </button>
      </div>
      {open && (
        <>
          <TabBar tabs={[{ id: 'world', label: t('The world') }, { id: 'dm', label: t('The Dungeon Master') }]} value={open} onChange={setOpen} />
          <div className="adventure-body">
            {open === 'world' ? <WorldSetup state={state} conn={conn} /> : (
              <>
                <StyleSetup bare state={state} conn={conn} />
                <div className="style-setup bare">
                  <div className="field">
                    <span>{t('Story language')} <Info text={host ? t('You host this table, so you choose the language the story is told in. Everyone picks their own interface language.') : t('The host chooses the language the story is told in.')} /></span>
                    <span className="pick">
                      {LANGS.map((l) => <Chip key={l.id} on={state.language === l.id} disabled={!host} onClick={() => conn.send({ t: 'set_language', lang: l.id })}>{l.label}</Chip>)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** The table before the adventure: everyone picks a hero, says they are ready, and the host begins. */
export function PartySetup({ state, conn }: { state: GameState; conn: Connection }) {
  const t = useT();
  const { lang } = useLang();
  const [picked, setPicked] = useState<string | null>(null);
  const [creating, setCreating] = useState<Draft | null>(null);
  const full = state.characters.length >= 4;
  const host = state.hostId === playerId;
  const hostName = state.players.find((p) => p.id === state.hostId)?.name ?? '';
  const many = state.players.length > 1;
  const shared = state.table.maxPlayers > 1;
  const iAmReady = state.ready.includes(playerId);
  const myHeroes = state.characters.filter((c) => c.ownerId === playerId).length;
  const waiting = state.players.filter((p) => p.connected && p.id !== state.hostId && !state.ready.includes(p.id));
  const free = PREMADES.filter((p) => !state.characters.some((c) => c.premadeId === p.id));
  const shown = PREMADES.find((p) => p.id === picked);
  const addPremade = (id: string) => { conn.send({ t: 'add_premade', premadeId: id, name: '' }); setPicked(null); };
  const addRandom = () => { const p = free[Math.floor(Math.random() * free.length)]; if (p) addPremade(p.id); };
  const begin = () => {
    if (waiting.length && !window.confirm(t('Not everyone is ready yet ({names}). Begin anyway?', { names: waiting.map((p) => p.name).join(', ') }))) return;
    // Quick start: with no hero chosen, the table gets one and the adventure begins with the settings as they are.
    if (!state.characters.length) addRandom();
    conn.send({ t: 'start' });
  };
  const close = () => { if (window.confirm(t('Close this table for everyone? Its heroes and its story are deleted.'))) conn.send({ t: 'close_table' }); };
  return (
    <div className="splash tavern">
      <Backdrop />
      <Embers count={14} />
      <div className="splash-tools"><MusicControl /><LangSwitch /></div>
      <div className={shared ? 'panel setup with-side' : 'panel setup'}>
        <header className="setup-head">
          <h1>{state.table.title}</h1>
          <p className="tagline">{t('Gather your party')}</p>
        </header>
        <div className="setup-body">
          <div className="setup-main">
            <section className="party-bar">
              <h2>{t('Party')} ({state.characters.length}/4) <Info text={t('Take a ready-made hero, or create your own. Playing solo? Add up to four and control them all.')} /></h2>
              <ul className="party-slots">
                {[0, 1, 2, 3].map((i) => {
                  const c = state.characters[i];
                  if (!c) return <li key={i} className="slot empty" aria-label={t('Free place in the party')}>＋</li>;
                  return (
                    <li key={c.id} className="slot">
                      <img className="hero-art" src={heroPortraitUrl(artOfCharacter(c, state.items))} alt="" />
                      <span className="slot-text">
                        <b>{c.name}</b>
                        <small>{heroTitle(c, t)}</small>
                        {shared && <small className="muted">{state.players.find((p) => p.id === c.ownerId)?.name}</small>}
                      </span>
                      {c.ownerId === playerId && <button type="button" className="slot-x" title={t('remove')} aria-label={`${t('remove')}: ${c.name}`} onClick={() => conn.send({ t: 'remove_character', characterId: c.id })}>×</button>}
                    </li>
                  );
                })}
              </ul>
            </section>
            <section className="hero-pick">
              <h2>{t('Choose a hero')}</h2>
              <div className="hero-strip">
                <Hint text={t('Choose class, species, background, abilities, skills and gear, with an explanation and a recommendation for every choice.')}>
                  <button type="button" className="hero-tile make" disabled={full} onClick={() => setCreating({})}><span className="tile-icon">✒️</span><b>{t('Create your own')}</b></button>
                </Hint>
                <Hint text={t('Adds one of the ready-made heroes that is still free.')}>
                  <button type="button" className="hero-tile make" disabled={full || !free.length} onClick={addRandom}><span className="tile-icon">🎲</span><b>{t('Random hero')}</b></button>
                </Hint>
                {PREMADES.map((p) => {
                  const taken = state.characters.some((c) => c.premadeId === p.id);
                  return (
                    <button type="button" key={p.id} className={['hero-tile', picked === p.id && 'on', taken && 'taken'].filter(Boolean).join(' ')} aria-pressed={picked === p.id}
                      onClick={() => setPicked(picked === p.id ? null : p.id)}>
                      <img className="hero-art" src={heroPortraitUrl(artOfDraft(p.spec)!)} alt="" />
                      <b style={{ color: CLASS_INFO[p.spec.classId].color }}>{p.spec.name}</b>
                      <small>{taken ? `✓ ${t('In the party')}` : classLabel({ className: CLASSES[p.spec.classId].name, gender: p.spec.gender }, t)}</small>
                    </button>
                  );
                })}
              </div>
              {shown && (
                <PremadeDetail premade={shown} taken={state.characters.some((c) => c.premadeId === shown.id)} full={full} onClose={() => setPicked(null)}
                  onAdd={() => addPremade(shown.id)} onCustomize={() => setCreating({ ...shown.spec, premadeId: undefined, backstory: loc(shown.bio, lang) })} />
              )}
            </section>
            <AdventureSetup state={state} conn={conn} />
          </div>
          {shared && (
            <aside className="setup-side">
              <section className="seats">
                <h2>{t('At the table')} ({state.players.length}/{state.table.maxPlayers})</h2>
                <Players state={state} conn={conn} pregame />
                <Invite state={state} conn={conn} />
              </section>
              <ChatPanel state={state} conn={conn} />
            </aside>
          )}
        </div>
        <footer className="begin">
          {host ? (
            <>
              <Hint text={state.characters.length ? '' : t('Picks a hero for you and begins right away with the settings above.')}>
                <button className="primary" onClick={begin}>{state.characters.length ? t('Begin the adventure') : `⚡ ${t('Quick start')}`}</button>
              </Hint>
              {many && <small className="muted">{waiting.length ? t('Still getting ready: {names}', { names: waiting.map((p) => p.name).join(', ') }) : t('Everyone is ready.')}</small>}
            </>
          ) : (
            <>
              <button className={iAmReady ? '' : 'primary'} disabled={!myHeroes} onClick={() => conn.send({ t: 'ready', ready: !iAmReady })}>{iAmReady ? t('Not ready after all') : t('I am ready')}</button>
              <small className="muted">{!myHeroes ? t('Choose a hero first.') : iAmReady ? t('Waiting for {name} to begin the adventure…', { name: hostName }) : t('{name} begins the adventure once everyone is ready.', { name: hostName })}</small>
            </>
          )}
          <span className="spacer" />
          <Hint text={state.dmMode === 'claude' ? '' : t('scripted fallback. Set ANTHROPIC_API_KEY on the server for the AI Dungeon Master.')}>
            <small className="muted dm-mode" tabIndex={state.dmMode === 'claude' ? undefined : 0}>{t('Dungeon Master')}: {state.dmMode === 'claude' ? `Claude (${state.dmModel})` : t('scripted')}</small>
          </Hint>
          <button className="link" onClick={() => conn.leave()} title={t('Your seat and your heroes at this table are given up')}>{t('Leave the table')}</button>
          {host && <button className="link danger" onClick={close}>{t('Close the table')}</button>}
        </footer>
      </div>
      {creating && <Creator state={state} conn={conn} initial={creating} onClose={() => setCreating(null)} />}
    </div>
  );
}

interface DetailProps { premade: Premade; taken: boolean; full: boolean; onClose: () => void; onAdd: () => void; onCustomize: () => void }

/** A premade hero opened up: who they are, how they play and their numbers, with the buttons to take or change them. */
function PremadeDetail({ premade: p, taken, full, onClose, onAdd, onCustomize }: DetailProps) {
  const t = useT();
  const { lang } = useLang();
  const sheet = useMemo(() => buildSheet(p.spec)!, [p]);
  const spec = p.spec;
  const title = heroTitle({ className: CLASSES[spec.classId].name, gender: spec.gender, speciesId: spec.speciesId }, t);
  const spells = sheet.abilityIds.filter((id) => ABILITIES[id]?.spellLevel !== undefined || ABILITIES[id]?.oncePerRest);
  return (
    <div className="hero-detail">
      <img className="hero-art" src={heroPortraitUrl(artOfDraft(spec)!)} alt="" />
      <div className="hero-detail-text">
        <h3>{spec.name} <small>{title} · {t(BACKGROUNDS[spec.backgroundId].name)}</small></h3>
        <p className="bio"><b>{loc(p.tagline, lang)}.</b> {loc(p.bio, lang)}</p>
        <p><b>{t('How to play')}:</b> {loc(p.playstyle, lang)}</p>
      </div>
      <div className="hero-detail-stats">
        <p className="hero-stats"><b>{sheet.maxHp}</b> {t('HP')} · <b>{sheet.ac}</b> {t('AC')}{sheet.maxMana > 0 && <> · <b>{sheet.maxMana}</b> {t('Mana')}</>}</p>
        <p className="abil">{ABILITY_KEYS.map((k) => <span key={k}>{t(k.toUpperCase())} <b>{sheet.abilities[k]}</b></span>)}</p>
        <p><b>{t('Skills')}:</b> {sheet.skills.map((s) => t(s)).join(', ')}</p>
        {spells.length > 0 && <p><b>{t('Spells and abilities')}:</b> {spells.map((id) => t(ABILITIES[id].name)).join(', ')}</p>}
        {sheet.attack && <p><b>{t('Attack')}:</b> {t(sheet.attack.name)} {sheet.attack.bonus >= 0 ? '+' : ''}{sheet.attack.bonus}</p>}
      </div>
      <div className="hero-actions">
        <button type="button" className="primary" disabled={full || taken} onClick={onAdd}>{taken ? t('In the party') : t('Add to party')}</button>
        <button type="button" disabled={full} onClick={onCustomize} title={t('Open this hero in the character creator and change anything you like')}>{t('Customize')}</button>
        <button type="button" className="link" onClick={onClose}>{t('Close')}</button>
      </div>
    </div>
  );
}
