import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ABILITIES, CLASS_INFO } from '../../../shared/content';
import { buildSheet, type Draft } from '../../../shared/build';
import { PREMADES, type Premade } from '../../../shared/premades';
import { ABILITY_KEYS, BACKGROUNDS, CLASSES, loc } from '../../../shared/rules';
import { MAX_SEATS, type GameState, type TableSummary } from '../../../shared/types';
import { Creator } from './Creator';
import { MyHeroes } from './MyHeroes';
import { keepHero, useHeroTemplates } from '../templates';
import type { HeroTemplate } from '../../../shared/accounts';
import { AdventureCards } from './AdventureSetup';
import { artOfCharacter, artOfDraft, heroPortraitUrl } from '../game/heroArt';
import { inviteLink, linkedTable, playerId, type Connection } from '../net';
import type { AccountView } from '../../../shared/accounts';
import { ChatPanel } from './Chat';
import { Backdrop, Embers, Logo } from '../ui/Brand';
import { LangSwitch, useLang, useT } from '../i18n';
import { LANGS } from '../../../shared/i18n';
import { Hint, Info } from '../ui/Hint';
import { MusicControl } from '../music';
import { MenuButton } from '../ui/GameMenu';
import { DeletedTables } from '../ui/Bin';
import { AccountFail, accountCall, accountSession } from '../account';
import type { BinItem } from '../../../shared/accounts';
import { classLabel, heroTitle } from '../game/util';
import { ask } from '../ui/Confirm';
import { copyText } from '../ui/clipboard';

const OLDER_AFTER = 6;

/** The list of tables: sit down at one, come back to your seat, or open a new table. */
export interface Me { account: AccountView; onProfile: () => void; onSignOut: () => void }

export function LobbyScreen({ conn, me: who, onInnkeeper, onMenu }: { conn: Connection; me: Me; onInnkeeper: () => void; onMenu: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const link = useMemo(linkedTable, []);
  // At a table you are your account's name.
  const name = who.account.username;
  /** The locked table whose invite code is being asked for. */
  const [asking, setAsking] = useState<string | null>(null);
  const [code, setCode] = useState(link.code);
  const [anyCode, setAnyCode] = useState('');
  const [seats, setSeats] = useState(MAX_SEATS);
  const me = name.replace(/\s+/g, ' ').trim();
  const tables = conn.tables ?? [];
  /** What is typed in the search box, which sections are folded away, and which sections show their older tables. */
  const [query, setQuery] = useState('');
  const [folded, setFolded] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('hf.lobby.folded') || '[]'); } catch { return []; } });
  const [allOf, setAllOf] = useState<string[]>([]);
  const [manageOpen, setManageOpen] = useState<string | null>(null);
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const fold = (id: string) => setFolded((f) => { const next = toggle(f, id); try { localStorage.setItem('hf.lobby.folded', JSON.stringify(next)); } catch { /* a remembered fold is only a convenience */ } return next; });
  const searching = query.trim().length > 0;
  /** Solo tables (one seat) and multiplayer tables, each the most recently played first, narrowed by the search. */
  const groups = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const hit = (x: TableSummary) => !q || [x.title, LANGS.find((l) => l.id === x.language)?.label ?? '', ...x.players.map((p) => p.name)].some((s) => s.toLocaleLowerCase().includes(q));
    const byRecent = (a: TableSummary, b: TableSummary) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0);
    const multi = tables.filter((x) => x.maxPlayers > 1 && hit(x)).sort(byRecent);
    const solo = tables.filter((x) => x.maxPlayers <= 1 && hit(x)).sort(byRecent);
    return [{ id: 'multi', label: t('Multiplayer'), list: multi }, { id: 'solo', label: t('Solo'), list: solo }].filter((g) => g.list.length > 0);
  }, [tables, lang, query]); // eslint-disable-line react-hooks/exhaustive-deps
  /** The table being renamed or deleted from this list, and what has been typed so far. */
  const [editing, setEditing] = useState<{ id: string; mode: 'rename' | 'delete'; text: string } | null>(null);
  const [binError, setBinError] = useState('');
  const loadBin = useCallback(() => accountCall<{ tables: BinItem[] }>('/bin').then((r) => r.tables), []);
  const actBin = useCallback((what: 'restore' | 'purge', id: number) => accountCall<{ tables: BinItem[] }>('/bin', { do: what, id }).then((r) => r.tables), []);
  const binFailed = (err: unknown) => setBinError(err instanceof AccountFail && err.code === 'not_found' ? t('That table is not in the bin any more.') : t('Something went wrong. Try again.'));
  const mayManage = (tb: TableSummary) => tb.hostId === playerId || who.account.role === 'innkeeper';
  const manage = () => {
    if (!editing) return;
    const text = editing.text.trim();
    if (editing.mode === 'rename') conn.send({ t: 'rename_table', session: accountSession(), room: editing.id, title: text });
    else conn.send({ t: 'delete_table', session: accountSession(), room: editing.id, confirm: text });
    setEditing(null);
  };
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
    // Name and story language are set in the table room, under "Table details". Tables for several players start with an invite code, which the host can switch off there.
    conn.create(me, { title: t("{name}'s table", { name: me }), language: lang, maxPlayers: seats, locked: seats > 1 });
  };

  return (
    <div className="splash tavern">
      <Backdrop />
      <Embers />
      <div className="splash-tools"><MusicControl /><MenuButton onClick={onMenu} /></div>
      <div className="panel lobby">
        <header className="join">
          <h1><Logo /></h1>
          <div className="rune-line" aria-hidden="true" />
          <div className="join-lang"><LangSwitch /></div>
          <p className="tagline">{t('Dungeons & Dragons at your own hearth, with an AI Dungeon Master.')}</p>
        </header>
        <div className="account-bar">
          <span>{t('Signed in as')} <b>{name}</b></span>
          {who.account.role === 'innkeeper' && <button type="button" className="role" onClick={onInnkeeper} title={t('For whoever runs this server')}>{t('Innkeeper')}</button>}
          <Info text={t('Your seats and heroes belong to your account, so you can pick them up on any device.')} />
          <span className="spacer" />
          <button type="button" className="link" onClick={who.onProfile}>{t('Your account')}</button>
          <button type="button" className="link" onClick={who.onSignOut}>{t('Sign out')}</button>
        </div>
        {who.account.mustChange && <p className="notice">{t('You are still using a password you did not choose.')} <button type="button" className="link" onClick={who.onProfile}>{t('Choose your own')}</button></p>}
        {conn.joinError && <p className="notice error" role="alert">{t(conn.joinError)}</p>}
        {!conn.connected && <p className="notice">{t('Connecting…')}</p>}

        <div className="lobby-cols">
        <div className="lobby-main">
        <div className="tables-bar">
          <h2>{t('Tables')} <span className="muted">({tables.length})</span></h2>
          {tables.length > 4 && <input type="search" className="table-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search tables or players')} aria-label={t('Search tables or players')} />}
        </div>
        {conn.tables && tables.length === 0 && <p className="muted">{t('Nobody has opened a table yet. Open the first one below.')}</p>}
        {searching && groups.length === 0 && <p className="muted">{t('No table matches your search.')}</p>}
        {groups.map((g) => {
          const isFolded = folded.includes(g.id) && !searching;
          const everything = searching || allOf.includes(g.id);
          const keep = (tb: TableSummary) => tb.players.some((p) => p.id === playerId) || tb.id === link.room;
          const shown = everything ? g.list : g.list.filter((tb, i) => i < OLDER_AFTER || keep(tb));
          const hidden = g.list.length - shown.length;
          return (
        <section key={g.id} className="table-group" aria-label={g.label}>
        <h3 className="table-group-title">
          <button type="button" className="fold" aria-expanded={!isFolded} onClick={() => fold(g.id)}>
            <span className="chev" aria-hidden="true">{isFolded ? '▸' : '▾'}</span> {g.label} <span className="muted">({g.list.length})</span>
          </button>
        </h3>
        {!isFolded && <ul className="tables">
          {shown.map((tb) => {
            const mine = tb.players.some((p) => p.id === playerId);
            const solo = !mine && tb.maxPlayers <= 1 && tb.players.length > 0;
            const full = !mine && !solo && tb.players.length >= tb.maxPlayers;
            const clash = !mine && !!me && tb.players.some((p) => p.name.toLocaleLowerCase() === me.toLocaleLowerCase());
            const managing = editing?.id === tb.id || manageOpen === tb.id;
            return (
              <li key={tb.id} className={['table-card', mine && 'mine', tb.id === link.room && 'invited'].filter(Boolean).join(' ')}>
                <div className="table-main">
                  <b className="table-title">{tb.locked && <span title={t('Needs an invite code')}>🔒 </span>}
                    {mayManage(tb) ? (
                      <button type="button" className="table-name" disabled={!conn.connected} title={t('Click to rename this table')} aria-label={`${t('Rename')}: ${tb.title}`}
                        onClick={() => setEditing({ id: tb.id, mode: 'rename', text: tb.title })}>
                        {tb.title} <span className="pencil" aria-hidden="true">✏️</span>
                      </button>
                    ) : tb.title}
                  </b>
                  <span className="table-meta">
                    <span className={tb.playing ? 'status playing' : 'status'}>{tb.playing ? t('Adventure under way') : t('Gathering the party')}</span>
                    <span>{LANGS.find((l) => l.id === tb.language)?.label}</span>
                    <span>{t('{n} of {max} seats taken', { n: tb.players.length, max: tb.maxPlayers })}</span>
                    <span>{t('{n} heroes', { n: tb.heroes })}</span>
                  </span>
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
                  <button className={mine ? 'primary' : ''} disabled={!ready || full || solo || clash || (asking === tb.id && !mine && !code.trim())} onClick={() => sit(tb)}
                    title={!me ? t('Enter your name first.') : undefined}>
                    {mine ? t('Back to your seat') : solo ? t('Private') : full ? t('Full') : t('Sit down')}
                  </button>
                  {mayManage(tb) && <button type="button" className="more" aria-expanded={managing} aria-label={`${t('Manage')}: ${tb.title}`} title={t('Manage')} onClick={() => { setManageOpen(manageOpen === tb.id ? null : tb.id); if (editing?.id === tb.id) setEditing(null); }}>⋯</button>}
                </div>
                {mayManage(tb) && managing && (
                  <div className="table-manage">
                    {editing?.id === tb.id ? (
                      <form onSubmit={(e) => { e.preventDefault(); if (editing.mode === 'rename' ? editing.text.trim() : editing.text.trim() === tb.title) manage(); }}>
                        {editing.mode === 'rename' ? (
                          <label>{t('New name of the table')}<input value={editing.text} maxLength={40} autoFocus onChange={(e) => setEditing({ ...editing, text: e.target.value })} /></label>
                        ) : (
                          <label>
                            {t('To delete this table, type its name: {title}', { title: tb.title })}
                            <input value={editing.text} maxLength={40} autoFocus autoComplete="off" onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
                          </label>
                        )}
                        {editing.mode === 'delete' && <small className="muted">{t('Its story and heroes are kept in the list of deleted tables, so you can bring it back later.')}</small>}
                        <span className="row">
                          <button className={editing.mode === 'delete' ? 'danger' : 'primary'} disabled={editing.mode === 'rename' ? !editing.text.trim() : editing.text.trim() !== tb.title}>{editing.mode === 'rename' ? t('Rename') : t('Delete the table')}</button>
                          <button type="button" className="link" onClick={() => { setEditing(null); setManageOpen(null); }}>{t('Cancel')}</button>
                        </span>
                      </form>
                    ) : (
                      <span className="row">
                        <button type="button" className="link" disabled={!conn.connected} onClick={() => setEditing({ id: tb.id, mode: 'rename', text: tb.title })}>✏️ {t('Rename')}</button>
                        <button type="button" className="link danger" disabled={!conn.connected} onClick={() => setEditing({ id: tb.id, mode: 'delete', text: '' })}>{t('Delete the table')}</button>
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>}
        {!isFolded && !searching && g.list.length > OLDER_AFTER && (
          <button type="button" className="link older" onClick={() => setAllOf((a) => toggle(a, g.id))}>
            {everything ? t('Show fewer') : t('Show older tables ({n})', { n: hidden })}
          </button>
        )}
        </section>
          );
        })}

        {binError && <p className="notice error" role="alert">{binError}</p>}
        <DeletedTables load={loadBin} act={actBin} onError={binFailed} watch={tables.length} />
        </div>

        <aside className="online-now" aria-label={t('Who is here')}>
          <h3 className="table-group-title">{t('Who is here')} <span className="muted">({conn.online.length})</span></h3>
          <ul className="online-list">
            {conn.online.map((o) => (
              <li key={o.id} className={o.seated ? 'who here' : 'who here lobby'}>
                <b>{o.name}</b>{o.id === playerId && <span className="muted"> ({t('you')})</span>}
                <small className="muted">{o.table ? t('at {table}', { table: o.tableTitle || o.table }) : o.seated ? t('at a table') : t('choosing a table')}</small>
              </li>
            ))}
          </ul>
        </aside>
        </div>

        <div className="lobby-foot">
          <form className="open-table" onSubmit={open}>
            <div className="open-row">
              <b>{t('Open a new table')}</b>
              <span className="pick" role="group" aria-label={t('Players')}>
                {[1, 2, 3, 4].map((n) => <button type="button" key={n} className={seats === n ? 'on' : ''} aria-pressed={seats === n} title={n === 1 ? undefined : t('{n} players', { n })} onClick={() => setSeats(n)}>{n === 1 ? t('Solo') : `👥 ${n}`}</button>)}
              </span>
              <button className="primary" disabled={!ready} title={!me ? t('Enter your name first.') : undefined}>{t('Open the table')}</button>
            </div>
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
                <button className="link" title={t('Hand the table over to this player')} onClick={() => { void ask(t('Make {name} the host of this table?', { name: p.name })).then((yes) => { if (yes) conn.send({ t: 'make_host', playerId: p.id }); }); }}>{t('Make host')}</button>
                <button className="link danger" title={pregame ? t('Their seat and their heroes are removed') : t('Their seat is freed and you take over their heroes')}
                  onClick={() => { void ask(t('Remove {name} from the table?', { name: p.name }), { danger: true }).then((yes) => { if (yes) conn.send({ t: 'kick', playerId: p.id }); }); }}>{t('Remove')}</button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The table before the adventure: everyone picks a hero, says they are ready, and the host begins. */
export function PartySetup({ state, conn, onMenu }: { state: GameState; conn: Connection; onMenu: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const [picked, setPicked] = useState<string | null>(null);
  const [creating, setCreating] = useState<Draft | null>(null);
  /** A saved hero opened in the creator. */
  const [editing, setEditing] = useState<HeroTemplate | null>(null);
  const { heroes: mine } = useHeroTemplates();
  const [kept, setKept] = useState<string | null>(null);
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
  const begin = async () => {
    if (waiting.length && !(await ask(t('Not everyone is ready yet ({names}). Begin anyway?', { names: waiting.map((p) => p.name).join(', ') }), { ok: t('Begin the adventure') }))) return;
    // Quick start: with no hero chosen, the table gets one and the adventure begins with the settings as they are.
    if (!state.characters.length) addRandom();
    conn.send({ t: 'start' });
  };
  return (
    <div className="splash tavern">
      <Backdrop />
      <Embers count={14} />
      <div className="splash-tools"><MusicControl /><MenuButton onClick={onMenu} /></div>
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
                      {c.ownerId === playerId && !mine.some((m) => m.id === c.templateId) && (
                        <button type="button" className="slot-keep" title={kept === c.id ? t('Kept in My heroes') : t('Keep in My heroes')} aria-label={`${t('Keep in My heroes')}: ${c.name}`} disabled={kept === c.id}
                          onClick={() => { setKept(c.id); void keepHero(state.room, c.id).catch(() => setKept(null)); }}>{kept === c.id ? '✓' : '★'}</button>
                      )}
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
                  onAdd={() => addPremade(shown.id)} onCustomize={() => setCreating({ ...shown.spec, premadeId: undefined, appearance: loc(shown.appearance, lang), backstory: loc(shown.bio, lang) })} />
              )}
            </section>
            <MyHeroes heroes={mine} state={state} conn={conn} onEdit={setEditing} />
            <section className="adventure">
              <h2>{t('Your adventure')} {host ? null : <small className="muted">· {t('Set by the host')}</small>}</h2>
              <AdventureCards state={state} conn={conn} world />
            </section>
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
                <button className="primary" onClick={() => void begin()}>{state.characters.length ? t('Begin the adventure') : `⚡ ${t('Quick start')}`}</button>
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
        </footer>
      </div>
      {creating && <Creator state={state} conn={conn} initial={creating} onClose={() => setCreating(null)} />}
      {editing && <Creator state={state} conn={conn} initial={editing.spec} template={editing} onClose={() => setEditing(null)} />}
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
