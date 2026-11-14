import { useEffect, useRef, useState } from 'react';
import { ABILITIES, ITEMS } from '../../../shared/content';
import type { Character, GameState } from '../../../shared/types';
import type { Connection } from '../net';

export type Targeting = { kind: 'attack' } | { kind: 'ability'; abilityId: string } | { kind: 'item'; uid: string } | null;

export function TurnBar({ state }: { state: GameState }) {
  const combat = state.combat;
  if (!combat) {
    return (
      <div className="turnbar">
        <span className="phase">{state.phase === 'victory' ? 'Victory' : state.phase === 'defeat' ? 'Defeat' : 'Exploring'}</span>
        {state.dmBusy && <span className="thinking">The Dungeon Master is speaking…</span>}
      </div>
    );
  }
  const name = (id: string) => state.characters.find((c) => c.id === id)?.name ?? state.monsters.find((m) => m.id === id)?.name ?? '???';
  return (
    <div className="turnbar">
      <span className="phase combat">Round {combat.round}</span>
      <div className="order">
        {combat.order.map((o, i) => {
          const m = state.monsters.find((x) => x.id === o.id);
          const c = state.characters.find((x) => x.id === o.id);
          const out = m ? !m.alive : c ? c.dead || c.hp <= 0 : true;
          return (
            <span key={o.id} className={['init', o.kind, i === combat.turnIndex && 'now', out && 'out'].filter(Boolean).join(' ')} title={`Initiative ${o.initiative}`}>
              {name(o.id)}
            </span>
          );
        })}
      </div>
      {state.dmBusy && <span className="thinking">The Dungeon Master is thinking…</span>}
    </div>
  );
}

interface ActionBarProps {
  state: GameState;
  actor: Character | null;
  targeting: Targeting;
  setTargeting: (t: Targeting) => void;
  conn: Connection;
  onInventory: () => void;
  hint: string;
}

export function ActionBar({ state, actor, targeting, setTargeting, conn, onInventory, hint }: ActionBarProps) {
  const combat = state.phase === 'combat' ? state.combat : null;
  const myTurn = !!actor && (!combat || combat.order[combat.turnIndex]?.id === actor.id);
  const canAct = myTurn && !!actor && actor.hp > 0;
  const actionUsed = !!combat?.actionUsed;
  const potion = actor?.bag.find((b) => b && ITEMS[b.defId].consumable) ?? null;
  const potions = actor?.bag.reduce((n, b) => n + (b && ITEMS[b.defId].consumable ? b.qty : 0), 0) ?? 0;
  const toggle = (t: NonNullable<Targeting>) => setTargeting(JSON.stringify(targeting) === JSON.stringify(t) ? null : t);
  let hotkey = 0;
  const key = () => ++hotkey;

  return (
    <div className="actionbar">
      <div className="hint">{hint}</div>
      <div className="buttons">
        {actor && combat && (
          <button
            className={targeting?.kind === 'attack' ? 'act on' : 'act'}
            disabled={!canAct || actionUsed}
            data-hotkey={key()}
            onClick={() => toggle({ kind: 'attack' })}
            title="Attack with your main-hand weapon. You can also just click an enemy."
          >
            <span className="icon">⚔️</span>Attack
          </button>
        )}
        {actor?.abilityIds.map((id) => {
          const ab = ABILITIES[id];
          if (!ab) return null;
          if ((ab.target === 'enemy' || ab.kind === 'dodge') && !combat) return null;
          const spent = ab.oncePerRest && actor.spent.includes(id);
          const blocked = !canAct || spent || actor.mana < ab.cost || (combat ? (ab.bonusAction ? combat.bonusUsed : actionUsed) : false);
          const on = targeting?.kind === 'ability' && targeting.abilityId === id;
          return (
            <button
              key={id}
              className={on ? 'act on' : 'act'}
              disabled={blocked}
              data-hotkey={key()}
              title={ab.description}
              onClick={() => {
                if (ab.target === 'self') { conn.send({ t: 'ability', characterId: actor.id, abilityId: id }); setTargeting(null); }
                else toggle({ kind: 'ability', abilityId: id });
              }}
            >
              <span className="icon">{ab.icon}</span>{ab.name}
              {ab.cost > 0 && <span className="cost">{ab.cost}</span>}
            </button>
          );
        })}
        {actor && potion && (
          <button
            className={targeting?.kind === 'item' ? 'act on' : 'act'}
            disabled={!canAct || actionUsed}
            data-hotkey={key()}
            title="Drink a healing potion, or feed it to an adjacent ally."
            onClick={() => toggle({ kind: 'item', uid: potion.uid })}
          >
            <span className="icon">🧪</span>Potion<span className="cost">{potions}</span>
          </button>
        )}
        <span className="spacer" />
        {!combat && (state.phase === 'explore' || state.phase === 'victory') && (
          <button className="act" disabled={state.shortRestsLeft <= 0} onClick={() => conn.send({ t: 'short_rest' })} title="Spend a hit die to heal and recover some mana.">
            <span className="icon">⛺</span>Short rest<span className="cost">{state.shortRestsLeft}</span>
          </button>
        )}
        <button className="act" onClick={onInventory} title="Inventory (i)"><span className="icon">🎒</span>Inventory</button>
        {actor && combat && (
          <button className="act end" disabled={!canAct} onClick={() => conn.send({ t: 'end_turn', characterId: actor.id })} title="End turn (Space)">
            <span className="icon">⏭️</span>End turn
          </button>
        )}
      </div>
    </div>
  );
}

export function LogPanel({ state, conn }: { state: GameState; conn: Connection }) {
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const last = state.log[state.log.length - 1]?.id;
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [last, state.dmBusy]);
  return (
    <aside className="log">
      <h2>
        Dungeon Master
        <small>{state.dmMode === 'claude' ? 'AI' : 'scripted'}</small>
      </h2>
      <div className="entries">
        {state.log.map((l) => (
          <p key={l.id} className={`entry ${l.kind}`}>
            {l.kind === 'chat' && <b>{l.speaker}: </b>}
            {l.text}
          </p>
        ))}
        {state.dmBusy && <p className="entry dm typing">…</p>}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) conn.send({ t: 'say', text });
          setText('');
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Speak to the Dungeon Master…" />
      </form>
    </aside>
  );
}
