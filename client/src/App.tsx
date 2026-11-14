import { useCallback, useEffect, useMemo, useState } from 'react';
import { ABILITIES } from '../../shared/content';
import type { Character } from '../../shared/types';
import { ActionBar, LogPanel, TurnBar, type Targeting } from './components/Hud';
import { Inventory } from './components/Inventory';
import { JoinScreen, PartySetup } from './components/Lobby';
import { MapView } from './components/MapView';
import { PartyPanel } from './components/PartyPanel';
import type { ViewOptions } from './game/MapRenderer';
import { cheb, fogAt, reachable, tileAt } from './game/util';
import { playerId, useConnection } from './net';

export function App() {
  const conn = useConnection();
  const { state, send } = conn;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [invOpen, setInvOpen] = useState(false);
  const [targeting, setTargeting] = useState<Targeting>(null);

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
    const ok = selected && (selected.ownerId !== playerId || (selected.hp > 0 && !selected.dead) || combat);
    if (!ok) {
      const next = mine.find((c) => c.hp > 0 && !c.dead) ?? mine[0] ?? state.characters[0];
      if (next && next.id !== selectedId) setSelectedId(next.id);
    }
  }, [state, selected, mine, combat, selectedId]);

  useEffect(() => { if (!combat) setTargeting((t) => (t?.kind === 'attack' ? null : t)); }, [!!combat]);

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
      if (!state || state.phase === 'lobby') return;
      if (fogAt(state, x, y) === 0) return;
      const monster = state.monsters.find((m) => m.alive && m.x === x && m.y === y && fogAt(state, x, y) === 2);
      const hero = state.characters.find((c) => !c.dead && c.x === x && c.y === y);
      if (monster) {
        if (!actor) return conn.toast(combat ? 'Wait for your turn' : 'Select one of your heroes first');
        if (targeting?.kind === 'ability' && targetAbility?.target === 'enemy') send({ t: 'ability', characterId: actor.id, abilityId: targeting.abilityId, targetId: monster.id });
        else send({ t: 'attack', characterId: actor.id, targetId: monster.id });
        setTargeting(null);
        return;
      }
      if (hero && (wantsAlly || hero.id !== actor?.id)) {
        // Clicking a fallen ally's tile while exploring should still let you walk there.
        if (wantsAlly || hero.hp > 0) return pickCharacter(hero);
      }
      if (!actor) return conn.toast(combat ? 'Wait for your turn' : 'Select one of your heroes first');
      const chest = state.chests.find((c) => c.x === x && c.y === y);
      if (chest) {
        if (cheb(actor, chest) > 1) {
          const spots = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]
            .map(([dx, dy]) => ({ x: chest.x + dx, y: chest.y + dy }))
            .filter((p) => tileAt(state, p.x, p.y) === '.' && fogAt(state, p.x, p.y) !== 0)
            .sort((a, b) => cheb(a, actor) - cheb(b, actor));
          if (spots[0]) send({ t: 'move', characterId: actor.id, x: spots[0].x, y: spots[0].y });
        }
        send({ t: 'open_chest', characterId: actor.id, chestId: chest.id });
        return;
      }
      setTargeting(null);
      send({ t: 'move', characterId: actor.id, x, y });
    },
    [state, actor, combat, targeting, targetAbility, wantsAlly, pickCharacter, send, conn],
  );

  // Keyboard: i inventory, WASD / arrows move, Space ends the turn, digits fire action buttons, Tab cycles heroes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
      if (!state || state.phase === 'lobby') return;
      const k = e.key.toLowerCase();
      if (k === 'i') { setInvOpen((o) => !o); e.preventDefault(); return; }
      if (k === 'escape') { if (targeting) setTargeting(null); else setInvOpen(false); return; }
      if (invOpen) return;
      if (k === 'tab' && !combat && mine.length > 1) {
        e.preventDefault();
        const i = mine.findIndex((c) => c.id === selectedId);
        setSelectedId(mine[(i + 1) % mine.length].id);
        return;
      }
      const dirs: Record<string, [number, number]> = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
      if (dirs[k] && actor) {
        e.preventDefault();
        const nx = actor.x + dirs[k][0], ny = actor.y + dirs[k][1];
        const t = tileAt(state, nx, ny);
        const occupied = state.monsters.some((m) => m.alive && m.x === nx && m.y === ny);
        if ((t === '.' || t === '+') && !occupied) send({ t: 'move', characterId: actor.id, x: nx, y: ny });
        return;
      }
      if ((k === ' ' || k === 'enter') && actor && combat) { e.preventDefault(); send({ t: 'end_turn', characterId: actor.id }); return; }
      if (/^[1-9]$/.test(k)) document.querySelector<HTMLButtonElement>(`.actionbar button[data-hotkey="${k}"]:not(:disabled)`)?.click();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, actor, combat, mine, selectedId, targeting, invOpen, send]);

  const view: ViewOptions = useMemo(() => {
    const reach = state && combat && turnChar ? reachable(state, turnChar, combat.movementLeft) : new Set<string>();
    const targetIds = new Set<string>();
    if (state && wantsEnemy) for (const m of state.monsters) if (m.alive) targetIds.add(m.id);
    if (state && wantsAlly) for (const c of state.characters) if (!c.dead) targetIds.add(c.id);
    return { selectedId, activeId, reach, targetIds, myIds: new Set(mine.map((c) => c.id)) };
  }, [state, combat, turnChar, selectedId, activeId, wantsEnemy, wantsAlly, mine]);

  if (!state) return <><JoinScreen conn={conn} /><Toasts conn={conn} /></>;
  if (state.phase === 'lobby') return <><PartySetup state={state} conn={conn} /><Toasts conn={conn} /></>;

  let hint: string;
  if (targeting?.kind === 'attack') hint = 'Attack: click an enemy. Esc to cancel.';
  else if (targetAbility) hint = `${targetAbility.name}: click ${targetAbility.target === 'ally' ? 'a hero on the map or in the party panel' : 'an enemy'}. Esc to cancel.`;
  else if (targeting?.kind === 'item') hint = 'Potion: click the hero who should drink it. Esc to cancel.';
  else if (state.phase === 'defeat') hint = 'The party has fallen.';
  else if (combat && turnChar) hint = `${turnChar.name}'s turn · ${combat.movementLeft * 5} ft of movement · ${combat.actionUsed ? 'action used' : 'action ready'}`;
  else if (combat) hint = `Waiting for ${state.characters.find((c) => c.id === activeId)?.name ?? state.monsters.find((m) => m.id === activeId)?.name ?? 'the Dungeon Master'}…`;
  else hint = actor ? `Click the map or use WASD to move ${actor.name}. Click chests to loot them. Press i for the inventory.` : 'Select one of your heroes.';

  const invChar = selected ?? mine[0] ?? state.characters[0];
  const newAdventure = () => { if (window.confirm('Abandon this adventure and return to the party screen?')) send({ t: 'reset' }); };

  return (
    <div className="game">
      <header className="topbar">
        <h1>Hearthforge</h1>
        <span className="muted">Table {state.room}</span>
        <span className={conn.connected ? 'dot ok' : 'dot'} title={conn.connected ? 'Connected' : 'Reconnecting…'} />
        <span className="spacer" />
        <button className="link" onClick={newAdventure}>New adventure</button>
      </header>
      <PartyPanel
        state={state}
        selectedId={selectedId}
        activeId={activeId}
        targeting={!!wantsAlly}
        onPick={pickCharacter}
        onGive={(fromId, from, to) => send({ t: 'give', characterId: fromId, from, toCharacterId: to.id })}
      />
      <main className="stage">
        <TurnBar state={state} />
        <MapView state={state} view={view} onTile={onTile} onMoved={conn.onMoved} />
        {(state.phase === 'victory' || state.phase === 'defeat') && (
          <div className={`banner ${state.phase}`}>
            <b>{state.phase === 'victory' ? 'The warren is cleared!' : 'Your party has fallen.'}</b>
            <button onClick={() => send({ t: 'reset' })}>New adventure</button>
          </div>
        )}
        <ActionBar state={state} actor={actor} targeting={targeting} setTargeting={setTargeting} conn={conn} onInventory={() => setInvOpen(true)} hint={hint} />
      </main>
      <LogPanel state={state} conn={conn} />
      {invOpen && invChar && <Inventory state={state} character={invChar} conn={conn} onSelect={setSelectedId} onClose={() => setInvOpen(false)} />}
      <Toasts conn={conn} />
    </div>
  );
}

function Toasts({ conn }: { conn: ReturnType<typeof useConnection> }) {
  return (
    <div className="toasts">
      {conn.toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}
    </div>
  );
}
