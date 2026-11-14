import { ABILITIES } from '../../../shared/content';
import { itemDef } from '../../../shared/items';
import type { Character, GameState } from '../../../shared/types';
import type { Connection } from '../net';
import { useT } from '../i18n';

export type Targeting = { kind: 'attack' } | { kind: 'ability'; abilityId: string } | { kind: 'item'; uid: string } | null;

export function TurnBar({ state }: { state: GameState }) {
  const t = useT();
  const combat = state.combat;
  if (!combat) return null;
  const name = (id: string) => state.characters.find((c) => c.id === id)?.name ?? state.monsters.find((m) => m.id === id)?.name ?? '???';
  return (
    <div className="turnbar">
      <span className="phase combat">{t('Round {n}', { n: combat.round })}</span>
      <div className="order">
        {combat.order.map((o, i) => {
          const m = state.monsters.find((x) => x.id === o.id);
          const c = state.characters.find((x) => x.id === o.id);
          const out = m ? !m.alive : c ? c.dead || c.hp <= 0 : true;
          return (
            <span key={o.id} className={['init', o.kind, i === combat.turnIndex && 'now', out && 'out'].filter(Boolean).join(' ')} title={`${t('Initiative')} ${o.initiative}`}>
              {name(o.id)}
            </span>
          );
        })}
      </div>
      {state.dmBusy && <span className="thinking">{t('The Dungeon Master is thinking…')}</span>}
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
  const t = useT();
  const combat = state.phase === 'combat' ? state.combat : null;
  const myTurn = !!actor && (!combat || combat.order[combat.turnIndex]?.id === actor.id);
  const canAct = myTurn && !!actor && actor.hp > 0;
  const actionUsed = !!combat?.actionUsed;
  const potion = actor?.bag.find((b) => b && itemDef(state.items, b.defId)?.consumable) ?? null;
  const potions = actor?.bag.reduce((n, b) => n + (b && itemDef(state.items, b.defId)?.consumable ? b.qty : 0), 0) ?? 0;
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
            disabled={!canAct || (actionUsed && combat.attacksLeft <= 0)}
            data-hotkey={key()}
            onClick={() => toggle({ kind: 'attack' })}
            title={t('Attack with your main-hand weapon. You can also just click an enemy.')}
          >
            <span className="icon">⚔️</span>{t('Attack')}
          </button>
        )}
        {actor?.abilityIds.map((id) => {
          const ab = ABILITIES[id];
          if (!ab) return null;
          if (!combat) return null;
          const spent = ab.oncePerRest && actor.spent.includes(id);
          const used = ab.kind === 'surge' ? !actionUsed : ab.bonusAction ? combat.bonusUsed : actionUsed;
          const blocked = !canAct || spent || actor.mana < ab.cost || used;
          const on = targeting?.kind === 'ability' && targeting.abilityId === id;
          return (
            <button
              key={id}
              className={on ? 'act on' : 'act'}
              disabled={blocked}
              data-hotkey={key()}
              title={t(ab.description)}
              onClick={() => {
                if (ab.target === 'self') { conn.send({ t: 'ability', characterId: actor.id, abilityId: id }); setTargeting(null); }
                else toggle({ kind: 'ability', abilityId: id });
              }}
            >
              <span className="icon">{ab.icon}</span>{t(ab.name)}
              {ab.cost > 0 && <span className="cost">{ab.cost}</span>}
            </button>
          );
        })}
        {actor && potion && (
          <button
            className={targeting?.kind === 'item' ? 'act on' : 'act'}
            disabled={!canAct || actionUsed}
            data-hotkey={key()}
            title={t('Drink a healing potion, or feed it to an adjacent ally.')}
            onClick={() => toggle({ kind: 'item', uid: potion.uid })}
          >
            <span className="icon">🧪</span>{t('Potion')}<span className="cost">{potions}</span>
          </button>
        )}
        <span className="spacer" />
        <button className="act" onClick={onInventory} title={t('Inventory (i)')}><span className="icon">🎒</span>{t('Inventory')}</button>
        {actor && combat && (
          <button className="act end" disabled={!canAct} onClick={() => conn.send({ t: 'end_turn', characterId: actor.id })} title={t('End turn (Space)')}>
            <span className="icon">⏭️</span>{t('End turn')}
          </button>
        )}
      </div>
    </div>
  );
}
