// The moments that frame a fight: a banner when one side is caught unawares, and the screen that
// closes the battle map (victory, or the party overwhelmed) before the story takes over again.
import { useEffect, useRef, useState } from 'react';
import type { FightOutcome, GameState } from '../../../shared/types';
import { partyOf } from '../game/util';
import { useT } from '../i18n';
import { sfx } from '../ui/sound';

/**
 * How long the battle map takes to sink away after Continue (the HUD slides off, the map dims, blurs
 * and pulls back), before the story takes the screen. Matches .stage.fight-over.leaving in fight.css.
 * The card itself waits for Continue: the player sets the pace, as in most role-playing games.
 */
const LEAVE_MS = 1500;

export interface FightEnd {
  /** The battle as it stood at the last blow, with the fallen marked; shown under the banner. */
  frozen: GameState;
  outcome: FightOutcome;
  leaving: boolean;
}

/**
 * Keeps the battle map up for a moment after the last blow so the fight does not just vanish.
 * Returns the frozen battle and its outcome while the closing screen shows, then null.
 */
export function useFightEnd(state: GameState | null): [FightEnd | null, () => void] {
  const lastCombat = useRef<GameState | null>(null);
  // Worked out while rendering, so the battle map never leaves the screen between the last blow
  // and the closing screen: it stays mounted and still plays that blow.
  const fresh = useRef<FightEnd | null>(null);
  const [end, setEnd] = useState<FightEnd | null>(null);

  if (state?.phase === 'combat') lastCombat.current = state;
  else if (state && lastCombat.current) {
    const before = lastCombat.current;
    lastCombat.current = null;
    // The fight just left the screen. Show its ending if the server recorded a new one
    // (a fight that was abandoned or replaced by a new adventure has none).
    const f = state.lastFight;
    if (f && f.seq !== before.lastFight?.seq) {
      const slain = new Set(f.slain);
      fresh.current = {
        frozen: {
          ...before,
          // The newest log, so the blows that ended the fight still play on the frozen map.
          log: state.log,
          monsters: before.monsters.map((m) => (slain.has(m.name) ? { ...m, hp: 0, alive: false } : m)),
          combat: before.combat && { ...before.combat, reaction: null },
        },
        outcome: f,
        leaving: false,
      };
    }
  }

  useEffect(() => {
    const next = fresh.current;
    if (!next) return;
    fresh.current = null;
    setEnd(next);
    sfx(next.outcome.result === 'victory' ? 'victory' : 'defeat');
  }, [state]);

  // Later loot that the Dungeon Master hands out while the screen shows.
  useEffect(() => {
    const f = state?.lastFight;
    if (end && f && f.seq === end.outcome.seq && f !== end.outcome) setEnd({ ...end, outcome: f });
  }, [state?.lastFight]);

  useEffect(() => {
    if (!end?.leaving) return;
    const timer = window.setTimeout(() => setEnd(null), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [end?.leaving]);

  const dismiss = () => setEnd((e) => e && { ...e, leaving: true });
  return [fresh.current ?? end, dismiss];
}

/** The banner over the frozen battle map. */
export function FightEndBanner({ end, onContinue, writing }: { end: FightEnd; onContinue: () => void; /** The Dungeon Master is still writing what happens next. */ writing?: boolean }) {
  const t = useT();
  const f = end.outcome;
  useEffect(() => {
    // Captured first, so Esc here continues and does not also open the game menu.
    const key = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); onContinue(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onContinue]);
  const title = f.result === 'victory' ? t('Victory!') : f.result === 'defeat' ? t('Defeat') : t('Overwhelmed');
  const sub = f.result === 'victory'
    ? (f.boss ? t('A dangerous foe lies defeated.') : t('The last enemy falls.'))
    : f.result === 'defeat' ? t('Your party has fallen.') : t('The party is struck down. The survivors are carried to safety.');
  return (
    <div className={`fight-end ${f.result}${end.leaving ? ' leaving' : ''}`} role="dialog" aria-live="assertive" aria-label={title} onClick={onContinue}>
      <div className="fight-end-card" onClick={(e) => e.stopPropagation()}>
        <div className="fight-end-rule" aria-hidden />
        <h2>{title}</h2>
        <p className="fight-end-sub">{sub}</p>
        <dl className="fight-end-stats">
          {f.result === 'victory' && f.xp > 0 && <div><dt>{t('Experience')}</dt><dd>{t('{xp} XP', { xp: f.xp })} <span className="muted">· {t('{n} each', { n: f.xpEach })}</span></dd></div>}
          {f.gold !== 0 && <div><dt>{f.gold > 0 ? t('Gold') : t('Gold lost')}</dt><dd className={f.gold > 0 ? 'coin' : 'lost'}>{t('{n} gp', { n: Math.abs(f.gold) })}</dd></div>}
          {f.slain.length > 0 && <div><dt>{t('Defeated')}</dt><dd>{f.slain.join(', ')}</dd></div>}
          {f.loot.length > 0 && <div><dt>{t('Found')}</dt><dd>{f.loot.join(', ')}</dd></div>}
          {f.leveled.length > 0 && <div className="up"><dt>{t('Level up')}</dt><dd>{f.leveled.join(', ')}</dd></div>}
          <div className="rounds"><dt>{t('Rounds')}</dt><dd>{f.rounds}</dd></div>
        </dl>
        <p className={writing ? 'fight-end-next writing' : 'fight-end-next'} aria-live="polite">{writing ? t('The dust settles…') : t('The story goes on.')}</p>
        <button type="button" className="primary" onClick={onContinue} autoFocus>{t('Continue')}</button>
      </div>
    </div>
  );
}

/** "Surprise!" or "Ambush!" over the battle map for a moment at the start of a fight that opened that way. */
export function SurpriseBanner({ state }: { state: GameState }) {
  const t = useT();
  const surprise = state.combat?.surprise;
  const key = surprise ? `${state.combat!.order.map((o) => o.id).join(',')}` : '';
  const [shown, setShown] = useState<string | null>(null);
  const done = useRef(new Set<string>());
  useEffect(() => {
    if (!key || done.current.has(key) || state.combat!.round > 1) return;
    done.current.add(key);
    setShown(key);
    sfx('ambush');
    const timer = window.setTimeout(() => setShown(null), 2600);
    return () => window.clearTimeout(timer);
  }, [key]);
  if (!surprise || shown !== key) return null;
  const caught = state.combat!.order.filter((o) => o.surprised).map((o) => partyOf(state).find((c) => c.id === o.id)?.name ?? state.monsters.find((m) => m.id === o.id)?.name ?? '?');
  const opener = surprise.opener ? state.characters.find((c) => c.id === surprise.opener)?.name : null;
  return (
    <div className={`surprise-banner ${surprise.side}`} role="status" aria-live="polite">
      <b>{surprise.side === 'enemies' ? t('Surprise!') : t('Ambush!')}</b>
      <span>
        {opener ? t('{name} strikes from hiding.', { name: opener }) : null}
        {caught.length > 0 ? ` ${t('Caught unawares: {names}', { names: caught.join(', ') })}` : ` ${t('Nobody is caught unawares.')}`}
      </span>
    </div>
  );
}
