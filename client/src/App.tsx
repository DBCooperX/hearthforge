import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ABILITIES } from '../../shared/content';
import { sameHex, type Hex } from '../../shared/hex';
import type { Character } from '../../shared/types';
import { CharacterSheet } from './components/CharacterSheet';
import { ActionBar, ReactionPrompt, TurnBar, type Targeting } from './components/Hud';
import { Inventory } from './components/Inventory';
import { StyleSetup } from './components/StyleSetup';
import { ChatPanel, lastForeignChat } from './components/Chat';
import { Invite, LobbyScreen, PartySetup, Players } from './components/Lobby';
import { MapView } from './components/MapView';
import { FightEndBanner, SurpriseBanner, useFightEnd } from './components/FightEnd';
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
import { LangSwitch, useT } from './i18n';
import { MusicControl, useMusic } from './music';
import { playerId, useConnection } from './net';
import { Icon, type IconName } from './ui/icons';
import { NAV_LABELS } from './ui/labels';
import { Settings } from './ui/Settings';
import { ArtWindow } from './ui/ArtWindow';
import { Innkeeper } from './ui/Innkeeper';
import { Kbd, Window } from './ui/Window';
import { Wordmark } from './ui/Brand';

type Overlay = 'trade' | 'inventory' | 'sheet' | 'map' | 'journal' | 'levelup' | 'table' | 'settings' | 'art' | null;

const NAV: { id: keyof typeof NAV_LABELS; key: string; icon: IconName }[] = [
  { id: 'sheet', key: 'C', icon: 'character' },
  { id: 'inventory', key: 'I', icon: 'inventory' },
  { id: 'journal', key: 'J', icon: 'journal' },
  { id: 'map', key: 'M', icon: 'map' },
];

export function App() {
  const t = useT();
  const conn = useConnection();
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
  useMusic(musicContext(state));

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
  const wantsEnemy = targeting?.kind === 'attack' || targetAbility?.target === 'enemy';

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
        else send({ t: 'attack', characterId: actor.id, targetId: monster.id });
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
      if (k === 'escape') { if (risky) setRisky(null); else if (targeting) setTargeting(null); else if (overlay) setOverlay(null); else setTravelTarget(null); return; }
      if (overlay || !combat) return;
      const dirs: Record<string, [number, number]> = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
      if (dirs[k] && actor) {
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
  }, [state, actor, combat, targeting, overlay, innkeeper, send, risky]);

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

  const inn = innkeeper && <Innkeeper onClose={closeInnkeeper} />;
  if (!state) return <><LobbyScreen conn={conn} onInnkeeper={() => setInnkeeper(true)} />{inn}<Toasts conn={conn} /></>;
  if (state.phase === 'lobby' || !state.world) return <><PartySetup state={state} conn={conn} />{inn}<Toasts conn={conn} /></>;

  let hint: string;
  if (targeting?.kind === 'attack') hint = t('Attack: click an enemy. Esc to cancel.');
  else if (targetAbility) hint = `${t(targetAbility.name)}: ${targetAbility.target === 'ally' ? t('click a hero on the map or in the party panel. Esc to cancel.') : t('click an enemy. Esc to cancel.')}`;
  else if (targeting?.kind === 'item') hint = t('Potion: click the hero who should drink it. Esc to cancel.');
  else if (risky && state) hint = t('Leaving the reach of {names} invites an opportunity attack. Click the same square again to go anyway, or Disengage first.', { names: risky.ids.map((id) => state.monsters.find((m) => m.id === id)?.name ?? '?').join(', ') });
  else if (combat && turnChar) hint = `${turnChar.ownerId === playerId ? t("{name}'s turn", { name: turnChar.name }) : t("{name}'s turn. Their player is away, so anyone may act for them.", { name: turnChar.name })}`;
  else if (combat) hint = t('Waiting for {name}…', { name: state.characters.find((c) => c.id === activeId)?.name ?? state.monsters.find((m) => m.id === activeId)?.name ?? t('the Dungeon Master') });
  else hint = '';

  const focus = selected ?? mine[0] ?? state.characters[0];
  const newAdventure = () => { if (window.confirm(t('Abandon this adventure and return to the party screen?'))) { setOverlay(null); send({ t: 'reset' }); } };
  const travel = { world: state.world, state, conn, target: travelTarget, setTarget: setTravelTarget };

  return (
    <EntityProvider state={state}>
      <div className={combat ? 'game fighting' : 'game'}>
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
          <LangSwitch />
          <button type="button" className={overlay === 'settings' ? 'nav-btn icon-only on' : 'nav-btn icon-only'} onClick={() => setOverlay((o) => (o === 'settings' ? null : 'settings'))} title={t('Settings')} aria-label={t('Settings')}><Icon name="settings" size={18} /></button>
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
        {combat ? (
          <>
            <main className="stage">
              <TurnBar state={state} />
              <MapView state={state} view={view} onTile={onTile} onMoved={conn.onMoved} />
              <SurpriseBanner state={state} />
              <ReactionPrompt state={state} playable={playable} conn={conn} />
              <ActionBar state={state} actor={actor} hero={actor ?? (selected && playable.includes(selected) ? selected : null)} targeting={targeting} setTargeting={setTargeting} conn={conn} hint={hint} />
            </main>
            <StoryFeed state={state} conn={conn} compact />
          </>
        ) : fightEnd ? (
          <>
            {/* The battle map stays a moment after the last blow, under the victory or defeat screen. */}
            <main className={fightEnd.leaving ? 'stage fight-over leaving' : 'stage fight-over'}>
              <TurnBar state={fightEnd.frozen} />
              <MapView state={fightEnd.frozen} view={view} onTile={() => {}} onMoved={conn.onMoved} />
              <FightEndBanner end={fightEnd} onContinue={endFight} />
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
              <StoryFeed state={state} conn={conn} />
            </main>
            <WorldPanel {...travel} onExpand={() => setOverlay('map')} onJournal={() => setOverlay('journal')} onTrade={openTrade} />
          </>
        )}
        {overlay === 'trade' && focus && shop && <Trade state={state} shop={shop} character={focus} mine={playable.includes(focus)} conn={conn} onSelect={setSelectedId} onShop={setShopId} onClose={() => setOverlay(null)} />}
        {overlay === 'inventory' && focus && <Inventory state={state} character={focus} conn={conn} onSelect={setSelectedId} onClose={() => setOverlay(null)} />}
        {overlay === 'sheet' && focus && <CharacterSheet state={state} character={focus} onSelect={setSelectedId} onClose={() => setOverlay(null)} mine={focus.ownerId === playerId} onLevelUp={() => setOverlay('levelup')}
          onCast={focus.ownerId === playerId ? (abilityId, targetId, level) => send({ t: 'ability', characterId: focus.id, abilityId, ...(targetId ? { targetId } : {}), ...(level ? { level } : {}) }) : undefined} />}
        {overlay === 'levelup' && focus && focus.ownerId === playerId && focus.pending.length > 0 && <LevelUp key={focus.pending[0].id} character={focus} items={state.items} conn={conn} onClose={() => setOverlay(null)} />}
        {overlay === 'journal' && <Journal state={state} onClose={() => setOverlay(null)} onShowMap={combat ? undefined : (hex) => { setTravelTarget(sameHex(hex, state.world!.party) ? null : hex); setOverlay('map'); }} />}
        {overlay === 'settings' && <Settings onClose={() => setOverlay(null)} onTable={() => setOverlay('table')} onArt={() => setOverlay('art')} onInnkeeper={() => { setOverlay(null); setInnkeeper(true); }} onNewAdventure={state.hostId === playerId ? newAdventure : undefined}><StyleSetup bare state={state} conn={conn} /></Settings>}
        {overlay === 'art' && <ArtWindow onClose={() => setOverlay('settings')} />}
        {overlay === 'table' && (
          <Window title={state.table.title} icon="table" size="small" className="table-sheet" onClose={() => setOverlay(null)}>
            <Players state={state} conn={conn} />
            <p className="muted small">{t('A player who is away keeps their seat and their heroes. Until they are back, anyone may play their heroes in a fight, and the Dungeon Master keeps them in the background of the story.')}</p>
            <Invite state={state} conn={conn} />
            <div className="row">
              <button onClick={() => { setOverlay(null); conn.leave(); }} title={t('Your seat and your heroes stay yours. Come back from the list of tables.')}>{t('Back to the tables')}</button>
              {state.hostId === playerId && <button className="link danger" onClick={() => { if (window.confirm(t('Close this table for everyone? Its heroes and its story are deleted.'))) send({ t: 'close_table' }); }}>{t('Close the table')}</button>}
            </div>
          </Window>
        )}
        {chatOpen && state.table.maxPlayers > 1 && <div className="chat-float panel"><ChatPanel state={state} conn={conn} onClose={() => setChatOpen(false)} /></div>}
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
      {conn.toasts.map((x) => <div key={x.id} className={x.notice ? 'toast notice' : 'toast'} role={x.notice ? 'alert' : undefined}>{x.notice && <b>{t('The innkeeper says')}</b>}{t(x.text)}</div>)}
    </div>
  );
}
