import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onPortraitLoaded } from './game/heroArt';
import { ABILITIES } from '../../shared/content';
import { sameHex, type Hex } from '../../shared/hex';
import type { Character } from '../../shared/types';
import { CharacterSheet } from './components/CharacterSheet';
import { ActionBar, ReactionPrompt, TurnBar, type Targeting } from './components/Hud';
import { Inventory } from './components/Inventory';
import { ChatWindow, lastForeignChat } from './components/Chat';
import { Invite, LobbyScreen, PartySetup, Players } from './components/Lobby';
import { MapView } from './components/MapView';
import { FightEndBanner, SurpriseBanner, useFightEnd } from './components/FightEnd';
import { TurnCallout } from './components/TurnCallout';
import { PartyPanel } from './components/PartyPanel';
import { EntityProvider, StoryFeed } from './components/Story';
import { LevelUp } from './components/LevelUp';
import { Journal } from './components/Journal';
import { Trade } from './components/Trade';
import { MapOverlay, WorldPanel } from './components/WorldPanel';
import type { ViewOptions } from './game/MapRenderer';
import { heroSees, key, lightLevels, pathTo, provokersOf, reachable, tileAt } from './game/util';
import { tileWalkable } from '../../shared/battlemap';
import { inFootprint } from '../../shared/monsterLook';
import { musicContext } from '../../shared/music';
import { useT } from './i18n';
import { MusicControl, useMusic } from './music';
import { useSfx } from './sfx';
import { useNarrator } from './narrator';
import { playerId, useConnection } from './net';
import { useAccount, type AccountState } from './account';
import type { Profile } from '../../shared/accounts';
import { OUT_OF_CREDIT, chf, type CreditView } from '../../shared/credits';
import { SignInScreen } from './components/SignIn';
import { ProfileWindow } from './ui/Profile';
import { Icon, type IconName } from './ui/icons';
import { NAV_LABELS } from './ui/labels';
import { Settings } from './ui/Settings';
import { ArtWindow } from './ui/ArtWindow';
import { Innkeeper } from './ui/Innkeeper';
import { Kbd, Window } from './ui/Window';
import { Wordmark } from './ui/Brand';
import { TestBadge, TestToolbox } from './components/TestToolbox';
import { ConfirmHost, ask } from './ui/Confirm';
import { GameMenu, MenuButton, canFullscreen, useEscMenu, useFullscreen, type MenuEntry } from './ui/GameMenu';
import { AdventureWindow } from './components/StyleSetup';

type Overlay = 'test' | 'trade' | 'inventory' | 'sheet' | 'map' | 'journal' | 'levelup' | 'table' | 'menu' | 'settings' | 'adventure' | 'art' | null;
/** Windows opened from the game menu: Esc and their close button lead back to it. */
const FROM_MENU = new Set<Overlay>(['settings', 'adventure', 'art']);
/** The menu on the list of tables and in the table room, before the adventure. */
type Front = 'menu' | 'settings' | 'art' | null;

const NAV: { id: keyof typeof NAV_LABELS; key: string; icon: IconName }[] = [
  { id: 'sheet', key: 'C', icon: 'character' },
  { id: 'inventory', key: 'I', icon: 'inventory' },
  { id: 'journal', key: 'J', icon: 'journal' },
  { id: 'map', key: 'M', icon: 'map' },
];

/** Nothing but the door until the browser is signed in to an account. */
const noTile = () => {};

export function App() {
  const acct = useAccount();
  if (acct.profile === undefined) return <div className="splash tavern" />;
  if (!acct.profile) return <SignInScreen onSession={acct.signIn} />;
  return <><Game acct={acct} profile={acct.profile} /><ConfirmHost /></>;
}

function Game({ acct, profile }: { acct: AccountState; profile: Profile }) {
  const t = useT();
  // A painted portrait that finished loading replaces the drawn bust everywhere at once.
  const [, portraitsLoaded] = useState(0);
  useEffect(() => onPortraitLoaded(() => portraitsLoaded((n) => n + 1)), []);
  const conn = useConnection();
  const [showProfile, setShowProfile] = useState(false);
  // Seats this browser had before accounts were moved to the account: say so once.
  useEffect(() => {
    for (const c of acct.claimed) conn.toast(t('Your seat at "{table}" now belongs to your account.', { table: c.title }), true);
  }, [acct.claimed]);
  const { state, send } = conn;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [targeting, setTargeting] = useState<Targeting>(null);
  const [travelTarget, setTravelTarget] = useState<Hex | null>(null);
  /** A move that would provoke opportunity attacks waits for a second click on the same tile. */
  const [risky, setRisky] = useState<{ x: number; y: number; path: { x: number; y: number }[]; ids: string[] } | null>(null);
  /** The owner's panel. It sits above everything, also above the list of tables; ?innkeeper opens it directly. */
  const [innkeeper, setInnkeeper] = useState(() => new URLSearchParams(location.search).has('innkeeper'));
  const closeInnkeeper = useCallback(() => {
    setInnkeeper(false);
    const url = new URL(location.href);
    if (url.searchParams.has('innkeeper')) { url.searchParams.delete('innkeeper'); history.replaceState(null, '', url); }
  }, []);
  const [front, setFront] = useState<Front>(null);
  const [fullscreen, toggleFullscreen] = useFullscreen();
  const pregame = !state || state.phase === 'lobby' || !state.world;
  useEscMenu(front !== null, (open) => setFront(open ? 'menu' : (f) => (f === 'menu' ? null : 'menu')), !pregame || innkeeper || showProfile);
  useEffect(() => { if (!pregame) setFront(null); }, [pregame]);
  /** The entries every menu shares: the player's settings, account, the Innkeeper, credits and fullscreen. */
  const common = (open: (o: 'settings' | 'art') => void, close: () => void): MenuEntry[][] => [
    [
      { id: 'settings', label: t('Settings'), icon: 'settings', onClick: () => open('settings') },
      { id: 'account', label: t('Your account'), icon: 'character', onClick: () => { close(); setShowProfile(true); } },
      ...(profile.account.role === 'innkeeper' ? [{ id: 'innkeeper', label: t('Innkeeper'), icon: 'innkeeper' as const, note: t('Run this server'), onClick: () => { close(); setInnkeeper(true); } }] : []),
    ],
    [
      { id: 'credits', label: t('Art credits'), icon: 'lore', onClick: () => open('art') },
      ...(canFullscreen() ? [{ id: 'fullscreen', label: fullscreen ? t('Leave fullscreen') : t('Fullscreen'), icon: 'fullscreen' as const, onClick: () => { toggleFullscreen(); close(); } }] : []),
    ],
  ];
  useMusic(musicContext(state));
  useSfx(state);
  useNarrator(state);

  /** The shop shown in the trade window. */
  const [shopId, setShopId] = useState<string | null>(null);
  const shops = state?.shops ?? [];
  const shop = shops.find((s) => s.id === shopId) ?? shops[0] ?? null;
  const openTrade = useCallback((id?: string) => { if (id) setShopId(id); setOverlay('trade'); }, []);
  // When the Dungeon Master shows a merchant's wares, the window opens for everyone. Not on a reload, though.
  const offerSeen = useRef<number | null>(null);
  const offer = state ? state.tradeOffer : undefined;
  useEffect(() => {
    if (offer === undefined) { offerSeen.current = null; return; }
    const seq = offer?.seq ?? 0;
    if (offerSeen.current !== null && offer && seq !== offerSeen.current) openTrade(offer.shopId);
    offerSeen.current = seq;
  }, [offer?.seq, offer === undefined]);
  // The window closes when the party walks away from the merchant or a fight breaks out.
  useEffect(() => { if (!shops.length) setOverlay((o) => (o === 'trade' ? null : o)); }, [shops.length]);

  const [chatOpen, setChatOpen] = useState(false);
  /** The newest message from someone else that this player has had on screen. */
  const [chatSeen, setChatSeen] = useState(0);
  const newestChat = lastForeignChat(conn);
  const chatShown = chatOpen || state?.phase === 'lobby';
  useEffect(() => { if (chatShown || !state) setChatSeen(newestChat); }, [chatShown, newestChat, !state]);
  const unread = conn.chat.filter((m) => m.from !== playerId && m.id > chatSeen).length;

  const mine = useMemo(() => state?.characters.filter((c) => c.ownerId === playerId) ?? [], [state]);
  /** My heroes, plus those of players who are away: anyone at the table may act for them so a fight never stalls. */
  const playable = useMemo(
    () => state?.characters.filter((c) => c.ownerId === playerId || !state.players.find((p) => p.id === c.ownerId)?.connected) ?? [],
    [state],
  );
  const combat = state?.phase === 'combat' ? state.combat : null;
  const [fightEnd, endFight] = useFightEnd(state);
  // After a fight: the story column and the world panel arrive in steps, and the Dungeon Master's
  // first scene after the battle gets an "After the battle" divider.
  const [afterFight, setAfterFight] = useState<{ logId: number; arriving: boolean } | null>(null);
  const fightShown = useRef<number | null>(null);
  useEffect(() => {
    if (fightEnd && fightShown.current !== fightEnd.outcome.seq) {
      fightShown.current = fightEnd.outcome.seq;
      setAfterFight({ logId: fightEnd.frozen.log[fightEnd.frozen.log.length - 1]?.id ?? 0, arriving: false });
    }
    if (!fightEnd && fightShown.current !== null) {
      fightShown.current = null;
      setAfterFight((a) => a && { ...a, arriving: true });
      const timer = window.setTimeout(() => setAfterFight((a) => a && { ...a, arriving: false }), 1800);
      return () => window.clearTimeout(timer);
    }
  }, [fightEnd?.outcome.seq, !fightEnd]);
  useEffect(() => { if (combat) setAfterFight(null); }, [!!combat]);
  const activeId = combat?.order[combat.turnIndex]?.id ?? null;
  const turnChar = playable.find((c) => c.id === activeId) ?? null;
  const selected = state?.characters.find((c) => c.id === selectedId) ?? null;
  /** The hero the player's clicks and buttons control right now. */
  const actor: Character | null = combat ? turnChar : selected && playable.includes(selected) ? selected : null;

  // Follow the turn order: when one of my heroes is up, select them.
  useEffect(() => {
    if (turnChar) { setSelectedId(turnChar.id); setTargeting(null); }
  }, [turnChar?.id]);

  // Always keep a sensible selection.
  useEffect(() => {
    if (!state || state.phase === 'lobby') return;
    if (!selected) {
      const next = mine.find((c) => c.hp > 0 && !c.dead) ?? mine[0] ?? state.characters[0];
      if (next) setSelectedId(next.id);
    }
  }, [state, selected, mine]);

  // A planned move only holds while nothing else changes.
  useEffect(() => setRisky(null), [state?.combat?.turnIndex, state?.combat?.movementLeft, state?.combat?.disengaged, actor?.id, targeting]);

  // Leaving a fight or the map drops whatever was being aimed or planned.
  useEffect(() => { if (!combat) setTargeting(null); else { setTravelTarget(null); setOverlay((o) => (o === 'map' ? null : o)); } }, [!!combat]);

  const targetAbility = targeting?.kind === 'ability' ? ABILITIES[targeting.abilityId] : null;
  const wantsAlly = targeting?.kind === 'item' || targetAbility?.target === 'ally';
  const wantsEnemy = targeting?.kind === 'attack' || targeting?.kind === 'offhand' || targetAbility?.target === 'enemy';

  const pickCharacter = useCallback(
    (c: Character) => {
      if (actor && targeting?.kind === 'ability' && targeting.item && targetAbility?.target === 'ally') {
        send({ t: 'use_item', characterId: actor.id, uid: targeting.item, targetId: c.id });
        setTargeting(null);
      } else if (actor && targeting?.kind === 'ability' && targetAbility?.target === 'ally') {
        send({ t: 'ability', characterId: actor.id, abilityId: targeting.abilityId, targetId: c.id, ...(targeting.level ? { level: targeting.level } : {}) });
        setTargeting(null);
      } else if (actor && targeting?.kind === 'item') {
        send({ t: 'use_item', characterId: actor.id, uid: targeting.uid, targetId: c.id });
        setTargeting(null);
      } else {
        setSelectedId(c.id);
      }
    },
    [actor, targeting, targetAbility, send],
  );

  const onTile = useCallback(
    (x: number, y: number) => {
      if (!state || !combat) return;
      const monster = state.monsters.find((m) => m.alive && inFootprint(m, m.tiles, x, y));
      const hero = state.characters.find((c) => !c.dead && c.x === x && c.y === y);
      if (monster) {
        if (!actor) return conn.toast(t('Wait for your turn'));
        if (targeting?.kind === 'ability' && targeting.item && targetAbility?.target === 'enemy') send({ t: 'use_item', characterId: actor.id, uid: targeting.item, targetId: monster.id });
        else if (targeting?.kind === 'ability' && targetAbility?.target === 'enemy') send({ t: 'ability', characterId: actor.id, abilityId: targeting.abilityId, targetId: monster.id, ...(targeting.level ? { level: targeting.level } : {}) });
        else send({ t: targeting?.kind === 'offhand' ? 'offhand' : 'attack', characterId: actor.id, targetId: monster.id });
        setTargeting(null);
        return;
      }
      if (hero && (wantsAlly || hero.id !== actor?.id) && (wantsAlly || hero.hp > 0)) return pickCharacter(hero);
      if (!actor) return conn.toast(t('Wait for your turn'));
      setTargeting(null);
      tryMove(x, y);
    },
    [state, actor, combat, targeting, targetAbility, wantsAlly, pickCharacter, send, conn, risky],
  );

  /** Move, but stop once first if the way leads out of an enemy's reach. */
  function tryMove(x: number, y: number) {
    if (!state || !combat || !actor) return;
    const path = pathTo(state, actor, combat.movementLeft, x, y);
    const foes = path ? provokersOf(state, actor, path) : [];
    if (foes.length && !(risky && risky.x === x && risky.y === y)) {
      setRisky({ x, y, path: path!, ids: foes.map((m) => m.id) });
      return;
    }
    setRisky(null);
    send({ t: 'move', characterId: actor.id, x, y });
  }

  // Keyboard: i inventory, c sheet, m map, j journal; in a fight WASD moves, Space ends the turn, digits fire action buttons.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') { if (e.key === 'Escape') el.blur(); return; }
      if (!state || state.phase === 'lobby' || innkeeper || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const toggles: Record<string, Overlay> = { i: 'inventory', c: 'sheet', m: 'map', j: 'journal' };
      if (k === 't' && state.shops.length) { setOverlay((o) => (o === 'trade' ? null : 'trade')); e.preventDefault(); return; }
      if (toggles[k] && !(k === 'm' && combat)) { setOverlay((o) => (o === toggles[k] ? null : toggles[k])); e.preventDefault(); return; }
      if (k === 'escape') {
        if (risky) setRisky(null); else if (targeting) setTargeting(null);
        else if (overlay) setOverlay(FROM_MENU.has(overlay) ? 'menu' : null);
        else if (travelTarget) setTravelTarget(null); else setOverlay('menu');
        return;
      }
      if (overlay || !combat) return;
      const dirs: Record<string, [number, number]> = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
      if (dirs[k] && actor && !e.shiftKey) {
        e.preventDefault();
        const nx = actor.x + dirs[k][0], ny = actor.y + dirs[k][1];
        const occupied = state.monsters.some((m) => m.alive && inFootprint(m, m.tiles, nx, ny));
        if (tileWalkable(tileAt(state, nx, ny)) && !occupied) tryMove(nx, ny);
        return;
      }
      if ((k === ' ' || k === 'enter') && actor && !combat.reaction) { e.preventDefault(); send({ t: 'end_turn', characterId: actor.id }); return; }
      if (/^[0-9]$/.test(k)) document.querySelector<HTMLButtonElement>(`.actionbar button[data-hotkey="${k}"]:not([aria-disabled="true"])`)?.click();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, actor, combat, targeting, overlay, innkeeper, send, risky, travelTarget]);

  const view: ViewOptions = useMemo(() => {
    const reach = state && combat && turnChar ? reachable(state, turnChar, combat.movementLeft) : new Set<string>();
    const targetIds = new Set<string>();
    if (state && wantsEnemy) for (const m of state.monsters) if (m.alive) targetIds.add(m.id);
    if (state && wantsAlly) for (const c of state.characters) if (!c.dead) targetIds.add(c.id);
    // In the dark, a monster is a shape until one of the player's heroes (or anyone's, for a spectator) can make it out.
    const unseenIds = new Set<string>();
    if (state && combat && state.light?.ambient !== 'bright') {
      const grid = lightLevels(state);
      const eyes = (mine.length ? mine : state.characters).filter((c) => !c.dead && c.hp > 0);
      for (const m of state.monsters) if (m.alive && !eyes.some((c) => heroSees(state, grid, c, m))) unseenIds.add(m.id);
    }
    const danger = new Set(risky?.path.map((p) => key(p.x, p.y)) ?? []);
    const warnIds = new Set(risky?.ids ?? []);
    const reaction = combat?.reaction ? { heroId: combat.reaction.heroId, monsterId: combat.reaction.monsterId } : null;
    return { selectedId, activeId, reach, targetIds, myIds: new Set(mine.map((c) => c.id)), unseenIds, danger, warnIds, reaction };
  }, [state, combat, turnChar, selectedId, activeId, wantsEnemy, wantsAlly, mine, risky]);

  const inn = <>
    {innkeeper && <Innkeeper account={profile.account} onClose={closeInnkeeper} />}
    {showProfile && <ProfileWindow profile={profile} onClose={() => setShowProfile(false)} onChanged={() => void acct.refresh()} />}
  </>;
  const me = { account: profile.account, onProfile: () => setShowProfile(true), onSignOut: acct.signOut };
  const closeFront = () => setFront(null);
  const frontLayer = <>
    {front === 'menu' && (
      <GameMenu title={state ? state.table.title : t('Hearthforge')} onClose={closeFront} groups={[
        [{ id: 'resume', label: state ? t('Back to the table') : t('Back to the tables'), icon: 'resume', onClick: closeFront }],
        ...common((o) => setFront(o), closeFront),
        state
          ? [{ id: 'leave', label: t('Leave the table'), icon: 'leave', note: t('Your seat and your heroes stay yours'), onClick: () => { closeFront(); conn.leave(); } }]
          : [{ id: 'signout', label: t('Sign out'), icon: 'leave', onClick: () => { closeFront(); acct.signOut(); } }],
      ]} />
    )}
    {front === 'settings' && <Settings onClose={() => setFront('menu')} />}
    {front === 'art' && <ArtWindow onClose={() => setFront('menu')} />}
  </>;
  const onMenu = () => setFront((f) => (f ? null : 'menu'));
  if (!state) return <><LobbyScreen conn={conn} me={me} onInnkeeper={() => setInnkeeper(true)} onMenu={onMenu} />{frontLayer}{inn}<Toasts conn={conn} /></>;
  if (state.phase === 'lobby' || !state.world) return <><PartySetup state={state} conn={conn} onMenu={onMenu} />{frontLayer}{inn}<Toasts conn={conn} /></>;

  let hint: string;
  if (targeting?.kind === 'offhand') hint = t('Off-hand attack: click an enemy next to you. Esc to cancel.');
  else if (targeting?.kind === 'attack') hint = t('Attack: click an enemy. Esc to cancel.');
  else if (targetAbility) hint = `${t(targetAbility.name)}: ${targetAbility.target === 'ally' ? t('click a hero on the map or in the party panel. Esc to cancel.') : t('click an enemy. Esc to cancel.')}`;
  else if (targeting?.kind === 'item') hint = t('Potion: click the hero who should drink it. Esc to cancel.');
  else if (risky && state) hint = t('Leaving the reach of {names} invites an opportunity attack. Click the same square again to go anyway, or Disengage first.', { names: risky.ids.map((id) => state.monsters.find((m) => m.id === id)?.name ?? '?').join(', ') });
  else if (combat && turnChar) hint = `${turnChar.ownerId === playerId ? t("{name}'s turn", { name: turnChar.name }) : t("{name}'s turn. Their player is away, so anyone may act for them.", { name: turnChar.name })}`;
  else if (combat) hint = t('Waiting for {name}…', { name: state.characters.find((c) => c.id === activeId)?.name ?? state.monsters.find((m) => m.id === activeId)?.name ?? t('the Dungeon Master') });
  else hint = '';

  const focus = selected ?? mine[0] ?? state.characters[0];
  const newAdventure = () => { void ask(t('Abandon this adventure and return to the party screen?'), { danger: true, ok: t('New adventure') }).then((yes) => { if (yes) { setOverlay(null); send({ t: 'reset' }); } }); };
  const travel = { world: state.world, state, conn, target: travelTarget, setTarget: setTravelTarget };

  return (
    <EntityProvider state={state}>
      <div className={combat ? 'game fighting' : afterFight?.arriving ? 'game after-fight' : 'game'}>
        <header className="topbar">
          <Wordmark />
          <button className="link table-name" onClick={() => setOverlay('table')} title={t('Who sits at this table')}>{state.table.title}</button>
          <span className={conn.connected ? 'dot ok' : 'dot'} title={conn.connected ? t('Connected') : t('Reconnecting…')} />
          {state.players.length > 1 && (
            <button className="presence" onClick={() => setOverlay('table')} title={t('Who sits at this table')}>
              {state.players.map((p) => (
                <span key={p.id} className={p.connected ? 'who here' : 'who'} title={p.connected ? t('At the table') : t('Away')}>{p.name}</span>
              ))}
            </button>
          )}
          <TestBadge state={state} onClick={() => setOverlay((o) => (o === 'test' ? null : 'test'))} />
          <span className="spacer" />
          {state.table.maxPlayers > 1 && (
            <button className={unread ? 'link chat-toggle unread' : 'link chat-toggle'} onClick={() => setChatOpen((o) => !o)} title={t('Talk to the other players, out of character')}>
              {t('Table talk')}{unread > 0 && <span className="badge">{unread}</span>}
            </button>
          )}
          <nav className="nav" aria-label={t('Windows')}>
            {NAV.map((n) => (
              <button key={n.id} type="button" className={overlay === n.id ? 'nav-btn on' : 'nav-btn'} aria-pressed={overlay === n.id} disabled={n.id === 'map' && !!combat}
                title={n.id === 'map' && combat ? t('The map is put away during a fight.') : undefined}
                onClick={() => setOverlay((o) => (o === n.id ? null : n.id))}>
                <Icon name={n.icon} size={18} /><span>{t(NAV_LABELS[n.id])}</span><Kbd>{n.key}</Kbd>
              </button>
            ))}
          </nav>
          <MusicControl />
          <MenuButton on={overlay === 'menu' || FROM_MENU.has(overlay)} onClick={() => setOverlay((o) => (o === 'menu' ? null : 'menu'))} />
        </header>
        <PartyPanel
          state={state}
          selectedId={selectedId}
          activeId={activeId}
          targeting={!!wantsAlly}
          onPick={pickCharacter}
          onGive={(fromId, from, to) => send({ t: 'give', characterId: fromId, from, toCharacterId: to.id })}
          onSheet={(c) => { setSelectedId(c.id); setOverlay('sheet'); }}
          onLevelUp={(c) => { setSelectedId(c.id); setOverlay('levelup'); }}
        />
        {combat || fightEnd ? (
          <>
            {/* One battle map from the first blow to the closing screen: it stays a moment after the
                last blow, under the victory or defeat screen, and still plays that blow. */}
            <main className={combat ? 'stage' : fightEnd!.leaving ? 'stage fight-over leaving' : 'stage fight-over'}>
              <TurnBar state={combat ? state : fightEnd!.frozen} />
              <MapView state={combat ? state : fightEnd!.frozen} view={view} onTile={combat ? onTile : noTile} onMoved={conn.onMoved} />
              {combat ? (
                <>
                  <SurpriseBanner state={state} />
                  <TurnCallout state={state} actor={actor} />
                  <ReactionPrompt state={state} playable={playable} conn={conn} />
                  <ActionBar state={state} actor={actor} hero={actor ?? (selected && playable.includes(selected) ? selected : null)} targeting={targeting} setTargeting={setTargeting} conn={conn} hint={hint} />
                </>
              ) : (
                <FightEndBanner end={fightEnd!} onContinue={endFight} writing={state.dmBusy} />
              )}
            </main>
            <StoryFeed state={state} conn={conn} compact />
          </>
        ) : (
          <>
            <main className="stage">
              {state.phase === 'defeat' && (
                <div className="banner defeat">
                  <b>{t('Your party has fallen.')}</b>
                  {state.hostId === playerId
                    ? <button onClick={() => send({ t: 'reset' })}>{t('New adventure')}</button>
                    : <span className="muted">{t('The host can start a new adventure.')}</span>}
                </div>
              )}
              <StoryFeed state={state} conn={conn} afterFight={afterFight?.logId} />
            </main>
            <WorldPanel {...travel} onExpand={() => setOverlay('map')} onJournal={() => setOverlay('journal')} onTrade={openTrade} />
          </>
        )}
        {overlay === 'test' && state.testMode && <TestToolbox state={state} conn={conn} host={state.hostId === playerId} onClose={() => setOverlay(null)} />}
        {overlay === 'trade' && focus && shop && <Trade state={state} shop={shop} character={focus} mine={playable.includes(focus)} conn={conn} onSelect={setSelectedId} onShop={setShopId} onClose={() => setOverlay(null)} />}
        {overlay === 'inventory' && focus && <Inventory state={state} character={focus} conn={conn} onSelect={setSelectedId} onClose={() => setOverlay(null)} />}
        {overlay === 'sheet' && focus && <CharacterSheet state={state} character={focus} onSelect={setSelectedId} onClose={() => setOverlay(null)} mine={focus.ownerId === playerId} onLevelUp={() => setOverlay('levelup')}
          onCast={focus.ownerId === playerId ? (abilityId, targetId, level) => send({ t: 'ability', characterId: focus.id, abilityId, ...(targetId ? { targetId } : {}), ...(level ? { level } : {}) }) : undefined} />}
        {overlay === 'levelup' && focus && focus.ownerId === playerId && focus.pending.length > 0 && <LevelUp key={focus.pending[0].id} character={focus} items={state.items} conn={conn} onClose={() => setOverlay(null)} />}
        {overlay === 'journal' && <Journal state={state} onClose={() => setOverlay(null)} onShowMap={combat ? undefined : (hex) => { setTravelTarget(sameHex(hex, state.world!.party) ? null : hex); setOverlay('map'); }} />}
        {overlay === 'menu' && (
          <GameMenu title={state.table.title} onClose={() => setOverlay(null)} groups={[
            [
              { id: 'resume', label: t('Resume'), icon: 'resume', onClick: () => setOverlay(null) },
              { id: 'adventure', label: t('The adventure'), icon: 'quest', note: state.hostId === playerId ? t('Story style, challenge, content, language') : t('How the host set up the story'), onClick: () => setOverlay('adventure') },
              ...(state.table.maxPlayers > 1 ? [{ id: 'table', label: t('Party and invites'), icon: 'table' as const, onClick: () => setOverlay('table') }] : []),
            ],
            ...common((o) => setOverlay(o), () => setOverlay(null)),
            [
              { id: 'leave', label: t('Leave the table'), icon: 'leave', note: t('Your seat and your heroes stay yours'), onClick: () => { setOverlay(null); conn.leave(); } },
              ...(state.hostId === playerId ? [{ id: 'new', label: t('New adventure'), icon: 'restart' as const, danger: true, note: t('Ends this story for everyone'), onClick: newAdventure }] : []),
            ],
          ]} />
        )}
        {overlay === 'settings' && <Settings onClose={() => setOverlay('menu')} />}
        {overlay === 'adventure' && <AdventureWindow state={state} conn={conn} onClose={() => setOverlay('menu')} />}
        {overlay === 'art' && <ArtWindow onClose={() => setOverlay('menu')} />}
        {overlay === 'table' && (
          <Window title={state.table.title} icon="table" size="small" className="table-sheet" onClose={() => setOverlay(null)}>
            <Players state={state} conn={conn} />
            <p className="muted small">{t('A player who is away keeps their seat and their heroes. Until they are back, anyone may play their heroes in a fight, and the Dungeon Master keeps them in the background of the story.')}</p>
            <Invite state={state} conn={conn} />
            <div className="row">
              <button onClick={() => { setOverlay(null); conn.leave(); }} title={t('Your seat and your heroes stay yours. Come back from the list of tables.')}>{t('Back to the tables')}</button>
            </div>
          </Window>
        )}
        {chatOpen && state.table.maxPlayers > 1 && <ChatWindow state={state} conn={conn} onClose={() => setChatOpen(false)} />}
        {overlay === 'map' && !combat && <MapOverlay {...travel} onClose={() => setOverlay(null)} />}
        {inn}
        <Toasts conn={conn} />
      </div>
    </EntityProvider>
  );
}

function Toasts({ conn }: { conn: ReturnType<typeof useConnection> }) {
  const t = useT();
  const update = conn.updateReady && (
    <div className="toast update" role="alert">
      {t('Update ready')}
      <button className="primary" onClick={conn.reload}>{t('Reload')}</button>
    </div>
  );
  // Messages about the table itself arrive in English; the game's own are already in the story language.
  return (
    <div className="toasts">
      {update}
      <CreditNote credit={conn.credit} />
      {conn.toasts.map((x) => <div key={x.id} className={x.notice ? 'toast notice' : 'toast'} role={x.notice ? 'alert' : undefined}>{x.notice && <b>{t('The innkeeper says')}</b>}{t(x.text)}</div>)}
    </div>
  );
}

/**
 * The early warning when a player's AI credit runs low, and the clear stop when it is used up. It stays until the
 * player closes it, and comes back when the state changes.
 */
function CreditNote({ credit }: { credit: CreditView | null }) {
  const t = useT();
  const state = credit?.out ? 'out' : credit?.low ? 'low' : null;
  const [closed, setClosed] = useState<string | null>(null);
  if (!credit || !state || closed === state) return null;
  return (
    <div className={`toast credit-note is-${state}`} role="alert">
      <b>{t('AI credit')}</b>
      <span>{state === 'out' ? t(OUT_OF_CREDIT) : t('Your AI credit is running low: {left} left. Ask the innkeeper to top it up before it runs out.', { left: chf(credit.balance) })}</span>
      <button type="button" className="link" onClick={() => setClosed(state)}>{t('OK')}</button>
    </div>
  );
}
