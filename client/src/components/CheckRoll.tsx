// The dice moment: a check the Dungeon Master asks for opens in the middle of the table, with the
// DC and every part of the modifier listed before the die is cast. The hero's player presses Roll
// (or Space); everyone else watches. The die tumbles and lands, then the result stays a moment.
import { useEffect, useRef, useState } from 'react';
import type { GameState, PendingCheck, RollInfo } from '../../../shared/types';
import { useT } from '../i18n';
import { sfx } from '../ui/sound';

const SHOW_RESULT_MS = 2600;

export function CheckRoll({ state, playerId, send }: { state: GameState; playerId: string; send: (msg: { t: 'roll_check'; id: string }) => void }) {
  const t = useT();
  const live = state.check ?? null;
  // The check stays on screen after the server has rolled it, until the result has been seen.
  const [shown, setShown] = useState<PendingCheck | null>(live);
  const [pressed, setPressed] = useState(false);
  const [result, setResult] = useState<RollInfo | null>(null);
  const [face, setFace] = useState(20);
  const ids = useRef(new Set<string>());

  useEffect(() => {
    if (live && live.id !== shown?.id) { setShown(live); setPressed(false); setResult(null); ids.current.add(live.id); }
  }, [live?.id]);

  // The roll lands in the story log with the check's id.
  const landed = shown ? state.log.slice(-12).map((e) => e.roll).find((r) => r?.checkId === shown.id) : undefined;
  useEffect(() => {
    if (!shown || !landed || result) return;
    setPressed(true);
    const timer = window.setTimeout(() => setResult(landed), 650);
    return () => window.clearTimeout(timer);
  }, [landed, shown, result]);
  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => { setShown(null); setResult(null); setPressed(false); }, SHOW_RESULT_MS);
    return () => window.clearTimeout(timer);
  }, [result]);

  // While it tumbles, the face flickers.
  const tumbling = pressed && !result;
  useEffect(() => {
    if (!tumbling) return;
    const timer = window.setInterval(() => setFace(1 + Math.floor(Math.random() * 20)), 70);
    return () => window.clearInterval(timer);
  }, [tumbling]);

  // The countdown to the game rolling by itself.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [live?.id]);

  const hero = shown ? state.characters.find((c) => c.id === shown.characterId) : undefined;
  const mine = !!hero && hero.ownerId === playerId;
  const roll = () => {
    if (!live || !mine || pressed) return;
    setPressed(true);
    sfx('click');
    send({ t: 'roll_check', id: live.id });
  };
  useEffect(() => {
    if (!live || !mine) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); roll(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!shown) return null;
  const owner = state.players.find((p) => p.id === hero?.ownerId)?.name ?? '';
  const left = live ? Math.max(0, live.until - now) : 0;
  const span = Math.max(1, shown.until - shown.since);
  const good = result ? result.outcome === 'success' : false;
  const total = shown.modifier;
  return (
    <div className="check-roll" role="dialog" aria-live="assertive" aria-label={t('{hero}: {label}', { hero: shown.hero, label: shown.label })}>
      <div className={`cr-card${result ? (good ? ' success' : ' failure') : ''}`}>
        <div className="cr-head">
          <b>{shown.hero}</b>
          <span>{shown.label}</span>
        </div>
        <div className="cr-body">
          <div className={`cr-die${tumbling ? ' tumbling' : ''}${result?.die === 20 ? ' nat20' : result?.die === 1 ? ' nat1' : ''}`} aria-hidden>
            <span>{result ? result.die : tumbling ? face : '?'}</span>
          </div>
          <div className="cr-dc">
            <small>{t('Difficulty')}</small>
            <b>{t('DC')} {shown.dc}</b>
          </div>
        </div>
        <ul className="cr-parts">
          <li><span>{t('d20')}</span><b>{result ? result.die : '?'}</b></li>
          {shown.parts.map((p, i) => <li key={i}><span>{p.label}</span><b>{p.value}</b></li>)}
          {shown.mode !== 'normal' && <li className={shown.mode}><span>{t(shown.mode)}</span><b>{t('roll twice')}</b></li>}
        </ul>
        {result ? (
          <div className="cr-result">
            <b>{result.total}</b> <span>{t('vs')} {t('DC')} {result.target.value}</span>
            <strong>{good ? t('Success') : t('Failure')}</strong>
          </div>
        ) : mine ? (
          <button type="button" className="primary cr-roll" onClick={roll} disabled={pressed} autoFocus>
            {pressed ? t('rolling…') : t('Roll')} <kbd>{t('Space')}</kbd>
          </button>
        ) : (
          <div className="cr-wait">{t('Waiting for {name} to roll…', { name: owner || shown.hero })}</div>
        )}
        {!result && live && (
          <div className="cr-timer" title={t('After that, the game rolls for you.')}><span style={{ width: `${Math.min(100, (left / span) * 100)}%` }} /></div>
        )}
        {!result && <small className="cr-total">{t('Modifier {n}', { n: total >= 0 ? `+${total}` : String(total) })}</small>}
      </div>
    </div>
  );
}
