import { useEffect, useState } from 'react';
import { ABILITIES } from '../../../shared/content';
import { RESOURCES, hasFeature, resourceLeft } from '../../../shared/classes';
import { LIGHT_ITEMS } from '../../../shared/light';
import { itemDef } from '../../../shared/items';
import { OPPORTUNITY_MODES, type Character, type GameState, type OpportunityMode } from '../../../shared/types';
import type { Connection } from '../net';
import { useLang, useT } from '../i18n';
import { dice } from './Guide';
import { Hint } from '../ui/Hint';
import { Kbd } from '../ui/Window';

/** Powers that stay on once used, and the chip that shows them. */
const ACTIVE: Record<string, string> = {
  rage: 'raging', reckless: 'reckless', sacred_weapon: 'sacred weapon', innate_sorcery: 'innate sorcery',
  superior_defense: 'superior defense', holy_nimbus: 'holy nimbus', natures_veil: 'invisible', dodge: 'dodging',
};

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
  hint: string;
}

export function ActionBar({ state, actor, targeting, setTargeting, conn, hint }: ActionBarProps) {
  const t = useT();
  const { lang } = useLang();
  const combat = state.phase === 'combat' ? state.combat : null;
  const myTurn = !!actor && (!combat || combat.order[combat.turnIndex]?.id === actor.id);
  const canAct = myTurn && !!actor && actor.hp > 0;
  const actionUsed = !!combat?.actionUsed;
  const potion = actor?.bag.find((b) => b && itemDef(state.items, b.defId)?.consumable) ?? null;
  const potions = actor?.bag.reduce((n, b) => n + (b && itemDef(state.items, b.defId)?.consumable ? b.qty : 0), 0) ?? 0;
  const toggle = (t: NonNullable<Targeting>) => setTargeting(JSON.stringify(targeting) === JSON.stringify(t) ? null : t);
  const hasLight = !!actor && LIGHT_ITEMS.some((l) => [...actor.bag, ...Object.values(actor.equipment)].some((b) => b?.defId === l.itemId));
  const held = actor?.effects?.find((e) => e.escapeDc) ?? null;
  let hotkey = 0;
  const key = () => ++hotkey;

  return (
    <div className="actionbar">
      <div className="hint">{hint}</div>
      <div className="buttons">
        {actor && combat && (
          <Hint title={t('Attack')} text={t('Attack with your main-hand weapon. You can also just click an enemy.')}>
            <button
              className={targeting?.kind === 'attack' ? 'act on' : 'act'}
              disabled={!canAct || (actionUsed && combat.attacksLeft <= 0)}
              data-hotkey={key()}
              onClick={() => toggle({ kind: 'attack' })}
            >
              <span className="icon">⚔️</span>{t('Attack')}
            </button>
          </Hint>
        )}
        {actor?.abilityIds.map((id) => {
          const ab = ABILITIES[id];
          if (!ab) return null;
          if (!combat) return null;
          // A druid in beast form sees the way back instead of more shapes.
          if (id.startsWith('wild_shape_') && actor.form) return null;
          if (id === 'revert_form' && !actor.form) return null;
          const spent = ab.oncePerRest && actor.spent.includes(id);
          const used = ab.kind === 'surge' ? !actionUsed : ab.free ? false : ab.bonusAction ? combat.bonusUsed : actionUsed;
          // Class resources: rages, focus points, Channel Divinity. Some spells have free castings before they cost mana.
          const pool = id === 'lay_on_hands' ? 'lay_on_hands' : id === 'hunters_mark' ? 'favored_enemy' : id === 'divine_smite' ? 'free_smite' : ab.resource;
          const left = pool ? resourceLeft(actor, pool) : null;
          const freeCast = (id === 'hunters_mark' || id === 'divine_smite') && (left ?? 0) > 0;
          const mana = id === 'hunters_mark' || id === 'divine_smite' ? (freeCast ? 0 : 2) : ab.cost;
          const dry = left !== null && !mana && left < (ab.resourceCost ?? 1);
          const isSpell = ab.spellLevel !== undefined;
          const barred = isSpell && (actor.conditions.includes('raging') || (!!actor.form && !hasFeature(actor, 'beast_spells')));
          const active = !!ACTIVE[id] && actor.conditions.includes(ACTIVE[id]);
          const blocked = !canAct || spent || actor.mana < mana || used || dry || barred || active;
          const on = active || (targeting?.kind === 'ability' && targeting.abilityId === id);
          const why = spent ? t('Already used. It comes back after a rest.')
            : barred ? (actor.form ? t('No spells in beast form.') : t('No spells while raging.'))
            : dry ? t('None left. It comes back after a rest.')
            : actor.mana < mana ? t('Not enough mana.') : '';
          const facts = [
            ab.range > 5 ? t('Range {n} ft', { n: ab.range }) : ab.range === 5 ? t('Touch') : '', ab.dice ? dice(ab.dice, lang) : '',
            ab.free ? t('Free') : ab.bonusAction ? t('Bonus action') : '',
            left !== null && pool && RESOURCES[pool] ? `${t(RESOURCES[pool].name)}: ${left}` : '',
          ].filter(Boolean).join(' · ');
          return (
            <Hint key={id} title={t(ab.name)} text={<>{t(ab.description)}{facts && <em>{facts}</em>}{why && <em className="warn-line">{why}</em>}</>}>
              <button
                className={on ? 'act on' : 'act'}
                disabled={blocked}
                data-hotkey={key()}
                onClick={() => {
                  if (ab.target === 'self') { conn.send({ t: 'ability', characterId: actor.id, abilityId: id }); setTargeting(null); }
                  else toggle({ kind: 'ability', abilityId: id });
                }}
              >
                <span className="icon">{ab.icon}</span>{t(ab.name)}
                {mana > 0 && <span className="cost">{mana}</span>}
                {left !== null && !(mana > 0) && <span className="cost uses">{left}</span>}
              </button>
            </Hint>
          );
        })}
        {actor && combat && (
          <Hint title={t('Disengage')} text={<>{t('Until the end of your turn, leaving an enemy\'s reach invites no opportunity attack.')}<em>{hasFeature(actor, 'cunning_action') ? t('Bonus action (Cunning Action)') : t('Action')}</em></>}>
            <button
              className={combat.disengaged ? 'act on' : 'act'}
              disabled={!canAct || !!combat.disengaged || (hasFeature(actor, 'cunning_action') ? combat.bonusUsed && actionUsed : actionUsed)}
              data-hotkey={key()}
              onClick={() => conn.send({ t: 'disengage', characterId: actor.id })}
            >
              <span className="icon">🏃</span>{t('Disengage')}
            </button>
          </Hint>
        )}
        {actor && combat && held && (
          <Hint title={t('Break free')} text={<>{t('Wrestle out of the grip: a Strength (Athletics) or Dexterity (Acrobatics) check against DC {dc}. Until you are free you cannot move.', { dc: held.escapeDc ?? 0 })}<em>{t('Action')}</em></>}>
            <button className="act" disabled={!canAct || actionUsed} data-hotkey={key()} onClick={() => conn.send({ t: 'escape', characterId: actor.id })}>
              <span className="icon">💪</span>{t('Break free')}
            </button>
          </Hint>
        )}
        {actor && combat && state.light?.ambient !== 'bright' && (actor.light || hasLight) && (
          <Hint title={actor.light ? t('Put out the light') : t('Light a torch')} text={actor.light ? t('Darkness hides you from enemies without darkvision, but you cannot see them either. Free.') : t('Bright light for 20 ft and dim light 20 ft beyond (a lantern: 30 and 30). Enemies see you too. Bonus action.')}>
            <button
              className={actor.light ? 'act on' : 'act'}
              disabled={!canAct || (!actor.light && combat.bonusUsed)}
              data-hotkey={key()}
              onClick={() => conn.send({ t: 'light', characterId: actor.id, on: !actor.light })}
            >
              <span className="icon">{actor.light ? '🌑' : '🔥'}</span>{actor.light ? t('Douse') : t('Light')}
            </button>
          </Hint>
        )}
        {actor && potion && (
          <Hint title={t('Potion')} text={t('Drink a healing potion, or feed it to an adjacent ally.')}>
            <button
              className={targeting?.kind === 'item' ? 'act on' : 'act'}
              disabled={!canAct || actionUsed}
              data-hotkey={key()}
              onClick={() => toggle({ kind: 'item', uid: potion.uid })}
            >
              <span className="icon">🧪</span>{t('Potion')}<span className="cost">{potions}</span>
            </button>
          </Hint>
        )}
        <span className="spacer" />
        {actor && combat && <OpportunitySwitch actor={actor} conn={conn} />}
        {actor && combat && (
          <button className="act end" disabled={!canAct} onClick={() => conn.send({ t: 'end_turn', characterId: actor.id })} >
            <span className="icon">⏭️</span>{t('End turn')}<Kbd>{t('Space')}</Kbd>
          </button>
        )}
      </div>
    </div>
  );
}

const MODE_LABELS: Record<OpportunityMode, string> = { ask: 'Ask me', always: 'Always strike', never: 'Never' };

/** What the hero does when an enemy walks out of reach. Changeable at any time, also on others' turns. */
function OpportunitySwitch({ actor, conn }: { actor: Character; conn: Connection }) {
  const t = useT();
  const mode = actor.opportunity ?? 'ask';
  const next = OPPORTUNITY_MODES[(OPPORTUNITY_MODES.indexOf(mode) + 1) % OPPORTUNITY_MODES.length];
  return (
    <Hint title={t('Opportunity attacks')} text={t('When an enemy {name} can see leaves their reach, they may strike at it with their reaction, once per round. Ask me: you decide each time. Always strike or Never: the game decides for you. Click to switch.', { name: actor.name })}>
      <button className="act small oa-mode" onClick={() => conn.send({ t: 'set_opportunity', characterId: actor.id, mode: next })}>
        <span className="icon">🛡️</span>{t(MODE_LABELS[mode])}
      </button>
    </Hint>
  );
}

/**
 * An enemy is leaving a hero's reach. The hero's player decides: strike or let it go. Everyone
 * else sees who the fight is waiting for. Enter strikes, Escape lets it go.
 */
export function ReactionPrompt({ state, playable, conn }: { state: GameState; playable: Character[]; conn: Connection }) {
  const t = useT();
  const prompt = state.phase === 'combat' ? state.combat?.reaction : null;
  const hero = prompt ? state.characters.find((c) => c.id === prompt.heroId) : undefined;
  const foe = prompt ? state.monsters.find((m) => m.id === prompt.monsterId) : undefined;
  const [now, setNow] = useState(() => Date.now());
  const [span, setSpan] = useState(20000);
  useEffect(() => {
    if (!prompt) return;
    setSpan(Math.max(1000, prompt.until - Date.now()));
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [prompt?.until]);
  const mine = !!hero && playable.some((c) => c.id === hero.id);
  const answer = (take: boolean) => hero && conn.send({ t: 'reaction', characterId: hero.id, take });
  useEffect(() => {
    if (!mine) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); answer(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); answer(false); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mine, hero?.id]);
  if (!prompt || !hero || !foe) return null;
  const left = Math.max(0, prompt.until - now);
  const owner = state.players.find((p) => p.id === hero.ownerId)?.name ?? '?';
  return (
    <div className={mine ? 'reaction-prompt panel mine' : 'reaction-prompt panel'} role={mine ? 'alertdialog' : 'status'} aria-live="assertive">
      <div className="rp-head">
        <span className="icon">⚔️</span>
        <b>{t('{monster} is leaving the reach of {hero}!', { monster: foe.name, hero: hero.name })}</b>
      </div>
      {mine ? (
        <>
          <p>{t('Opportunity attack: strike at it with your reaction before it gets away. Your reaction comes back at the start of your next turn.')}</p>
          <div className="row">
            <button className="primary" onClick={() => answer(true)}>{t('Strike')}<kbd>{t('Enter')}</kbd></button>
            <button onClick={() => answer(false)}>{t('Let it go')}<kbd>Esc</kbd></button>
          </div>
        </>
      ) : (
        <p className="muted">{t('Waiting for {player} to decide whether {hero} strikes.', { player: owner, hero: hero.name })}</p>
      )}
      <div className="rp-timer" title={t('After that, the hero strikes.')}><span style={{ width: `${Math.min(100, (left / span) * 100)}%` }} /></div>
    </div>
  );
}
