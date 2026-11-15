import { useCallback, useEffect, useMemo, useState } from 'react';
import { ABILITIES } from '../../shared/content';
import type { Hex } from '../../shared/hex';
import type { Character } from '../../shared/types';
import { CharacterSheet } from './components/CharacterSheet';
import { ActionBar, TurnBar, type Targeting } from './components/Hud';
import { Inventory } from './components/Inventory';
import { JoinScreen, PartySetup } from './components/Lobby';
import { MapView } from './components/MapView';
import { PartyPanel } from './components/PartyPanel';
import { EntityProvider, StoryFeed } from './components/Story';
import { LevelUp } from './components/LevelUp';
import { Journal, MapOverlay, WorldPanel } from './components/WorldPanel';
import type { ViewOptions } from './game/MapRenderer';
import { reachable, tileAt } from './game/util';
import { tileWalkable } from '../../shared/battlemap';
import { inFootprint } from '../../shared/monsterLook';
import { musicContext } from '../../shared/music';
import { LangSwitch, useT } from './i18n';
import { MusicControl, useMusic } from './music';
import { playerId, useConnection } from './net';

type Overlay = 'inventory' | 'sheet' | 'map' | 'journal' | 'levelup' | null;

export function App() {
  const t = useT();
  const conn = useConnection();
  const { state, send } = conn;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [targeting, setTargeting] = useState<Targeting>(null);
  const [travelTarget, setTravelTarget] = useState<Hex | null>(null);
  useMusic(musicContext(state));

  const mine = useMemo(() => state?.characters.filter((c) => c.ownerId === playerId) ?? [], [state]);
  const combat = state?.phase === 'combat' ? state.combat : null;
  const activeId = combat?.order[combat.turnIndex]?.id ?? null;
  const turnChar = mine.find((c) => c.id === activeId) ?? null;
  const selected = state?.characters.find((c) => c.id === selectedId) ?? null;
  /** The hero the player's clicks and buttons control right now. */
  const actor: Character | null = combat ? turnChar : selected && selected.ownerId === playerId ? selected : null;

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

  // Leaving a fight or the map drops whatever was being aimed or planned.
  useEffect(() => { if (!combat) setTargeting(null); else { setTravelTarget(null); setOverlay((o) => (o === 'map' ? null : o)); } }, [!!combat]);

  const targetAbility = targeting?.kind === 'ability' ? ABILITIES[targeting.abilityId] : null;
  const wantsAlly = targeting?.kind === 'item' || targetAbility?.target === 'ally';
  const wantsEnemy = targeting?.kind === 'attack' || targetAbility?.target === 'enemy';

  const pickCharacter = useCallback(
    (c: Character) => {
      if (actor && targeting?.kind === 'ability' && targetAbility?.target === 'ally') {
        send({ t: 'ability', characterId: actor.id, abilityId: targeting.abilityId, targetId: c.id });
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
        if (targeting?.kind === 'ability' && targetAbility?.target === 'enemy') send({ t: 'ability', characterId: actor.id, abilityId: targeting.abilityId, targetId: monster.id });
        else send({ t: 'attack', characterId: actor.id, targetId: monster.id });
        setTargeting(null);
        return;
      }
      if (hero && (wantsAlly || hero.id !== actor?.id) && (wantsAlly || hero.hp > 0)) return pickCharacter(hero);
      if (!actor) return conn.toast(t('Wait for your turn'));
      setTargeting(null);
      send({ t: 'move', characterId: actor.id, x, y });
    },
    [state, actor, combat, targeting, targetAbility, wantsAlly, pickCharacter, send, conn],
  );

  // Keyboard: i inventory, c sheet, m map, j journal; in a fight WASD moves, Space ends the turn, digits fire action buttons.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') { if (e.key === 'Escape') el.blur(); return; }
      if (!state || state.phase === 'lobby' || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const toggles: Record<string, Overlay> = { i: 'inventory', c: 'sheet', m: 'map', j: 'journal' };
      if (toggles[k] && !(k === 'm' && combat)) { setOverlay((o) => (o === toggles[k] ? null : toggles[k])); e.preventDefault(); return; }
      if (k === 'escape') { if (targeting) setTargeting(null); else if (overlay) setOverlay(null); else setTravelTarget(null); return; }
      if (overlay || !combat) return;
      const dirs: Record<string, [number, number]> = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
      if (dirs[k] && actor) {
        e.preventDefault();
        const nx = actor.x + dirs[k][0], ny = actor.y + dirs[k][1];
        const occupied = state.monsters.some((m) => m.alive && inFootprint(m, m.tiles, nx, ny));
        if (tileWalkable(tileAt(state, nx, ny)) && !occupied) send({ t: 'move', characterId: actor.id, x: nx, y: ny });
        return;
      }
      if ((k === ' ' || k === 'enter') && actor) { e.preventDefault(); send({ t: 'end_turn', characterId: actor.id }); return; }
      if (/^[1-9]$/.test(k)) document.querySelector<HTMLButtonElement>(`.actionbar button[data-hotkey="${k}"]:not(:disabled)`)?.click();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, actor, combat, targeting, overlay, send]);

  const view: ViewOptions = useMemo(() => {
    const reach = state && combat && turnChar ? reachable(state, turnChar, combat.movementLeft) : new Set<string>();
    const targetIds = new Set<string>();
    if (state && wantsEnemy) for (const m of state.monsters) if (m.alive) targetIds.add(m.id);
    if (state && wantsAlly) for (const c of state.characters) if (!c.dead) targetIds.add(c.id);
    return { selectedId, activeId, reach, targetIds, myIds: new Set(mine.map((c) => c.id)) };
  }, [state, combat, turnChar, selectedId, activeId, wantsEnemy, wantsAlly, mine]);

  if (!state) return <><JoinScreen conn={conn} /><Toasts conn={conn} /></>;
  if (state.phase === 'lobby' || !state.world) return <><PartySetup state={state} conn={conn} /><Toasts conn={conn} /></>;

  let hint: string;
  if (targeting?.kind === 'attack') hint = t('Attack: click an enemy. Esc to cancel.');
  else if (targetAbility) hint = `${t(targetAbility.name)}: ${targetAbility.target === 'ally' ? t('click a hero on the map or in the party panel. Esc to cancel.') : t('click an enemy. Esc to cancel.')}`;
  else if (targeting?.kind === 'item') hint = t('Potion: click the hero who should drink it. Esc to cancel.');
  else if (combat && turnChar) hint = `${t("{name}'s turn", { name: turnChar.name })} · ${t('{n} ft of movement', { n: combat.movementLeft * 5 })} · ${combat.actionUsed ? (combat.attacksLeft > 0 ? t('one more attack') : t('action used')) : t('action ready')}`;
  else if (combat) hint = t('Waiting for {name}…', { name: state.characters.find((c) => c.id === activeId)?.name ?? state.monsters.find((m) => m.id === activeId)?.name ?? t('the Dungeon Master') });
  else hint = '';

  const focus = selected ?? mine[0] ?? state.characters[0];
  const newAdventure = () => { if (window.confirm(t('Abandon this adventure and return to the party screen?'))) send({ t: 'reset' }); };
  const travel = { world: state.world, state, conn, target: travelTarget, setTarget: setTravelTarget };

  return (
    <EntityProvider state={state}>
      <div className={combat ? 'game fighting' : 'game'}>
        <header className="topbar">
          <h1>Hearthforge</h1>
          <span className="muted">{t('Table')} {state.room}</span>
          <span className={conn.connected ? 'dot ok' : 'dot'} title={conn.connected ? t('Connected') : t('Reconnecting…')} />
          <span className="spacer" />
          <button className="link" onClick={() => setOverlay('sheet')} title={t('Character sheet (c)')}>{t('Character')}</button>
          <button className="link" onClick={() => setOverlay('inventory')} title={t('Inventory (i)')}>{t('Inventory')}</button>
          <button className="link" onClick={() => setOverlay('journal')} title={t('Journal (j)')}>{t('Journal')}</button>
          <MusicControl />
          <LangSwitch />
          <button className="link" onClick={newAdventure}>{t('New adventure')}</button>
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
              <ActionBar state={state} actor={actor} targeting={targeting} setTargeting={setTargeting} conn={conn} onInventory={() => setOverlay('inventory')} hint={hint} />
            </main>
            <StoryFeed state={state} conn={conn} compact />
          </>
        ) : (
          <>
            <main className="stage">
              {state.phase === 'defeat' && (
                <div className="banner defeat">
                  <b>{t('Your party has fallen.')}</b>
                  <button onClick={() => send({ t: 'reset' })}>{t('New adventure')}</button>
                </div>
              )}
              <StoryFeed state={state} conn={conn} />
            </main>
            <WorldPanel {...travel} onExpand={() => setOverlay('map')} onJournal={() => setOverlay('journal')} />
          </>
        )}
        {overlay === 'inventory' && focus && <Inventory state={state} character={focus} conn={conn} onSelect={setSelectedId} onClose={() => setOverlay(null)} />}
        {overlay === 'sheet' && focus && <CharacterSheet state={state} character={focus} onSelect={setSelectedId} onClose={() => setOverlay(null)} mine={focus.ownerId === playerId} onLevelUp={() => setOverlay('levelup')} />}
        {overlay === 'levelup' && focus && focus.ownerId === playerId && focus.pending.length > 0 && <LevelUp key={focus.pending[0].id} character={focus} items={state.items} conn={conn} onClose={() => setOverlay(null)} />}
        {overlay === 'journal' && <Journal state={state} onClose={() => setOverlay(null)} />}
        {overlay === 'map' && !combat && <MapOverlay {...travel} onClose={() => setOverlay(null)} />}
        <Toasts conn={conn} />
      </div>
    </EntityProvider>
  );
}

function Toasts({ conn }: { conn: ReturnType<typeof useConnection> }) {
  return (
    <div className="toasts">
      {conn.toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}
    </div>
  );
}
