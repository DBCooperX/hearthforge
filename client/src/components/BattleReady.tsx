// The moment before the first blow. When a fight begins, the story stays on screen (with the
// picture the Dungeon Master painted for it, if any) and a card says why it starts and who stands
// against the party. Each player presses "To battle" (or Enter) to go to the battle map; the
// monsters wait until everyone has, or until the time is up. Players already on the map see who
// is still getting ready.
import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../../../shared/types';
import { useT } from '../i18n';
import { sfx } from '../ui/sound';
import { monsterFace } from '../game/faces';

export function BattleReady({ state, playerId, onReady }: { state: GameState; playerId: string; onReady: () => void }) {
  const t = useT();
  const ready = state.phase === 'combat' ? state.combat?.ready ?? null : null;
  const [now, setNow] = useState(Date.now());
  // The whole wait, for the bar: measured when the card first appears.
  const span = useRef(60000);
  useEffect(() => { if (ready) span.current = Math.max(1000, ready.until - Date.now()); }, [ready?.until]);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [!!ready]);
  const mine = !!ready && ready.waiting.includes(playerId);
  useEffect(() => {
    if (!mine) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onReady(); }
      // Space must never end a turn from behind this card.
      if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mine]);
  if (!ready) return null;
  const left = Math.max(0, Math.ceil((ready.until - now) / 1000));
  const others = ready.waiting.filter((id) => id !== playerId).map((id) => state.players.find((p) => p.id === id)?.name).filter(Boolean) as string[];

  if (!mine) {
    if (!others.length) return null;
    return (
      <div className="ready-wait" role="status">
        {t('Waiting for {names} to get ready', { names: others.join(', ') })} <span className="muted">· {t('{n} s', { n: left })}</span>
      </div>
    );
  }

  // The foes, one face per kind with a count.
  const kinds = new Map<string, { name: string; face: string; n: number }>();
  for (const m of state.monsters) {
    if (!m.alive) continue;
    const k = kinds.get(m.name.replace(/\s+\d+$/, ''));
    if (k) k.n++;
    else kinds.set(m.name.replace(/\s+\d+$/, ''), { name: m.name.replace(/\s+\d+$/, ''), face: monsterFace(m), n: 1 });
  }
  const painting = state.log.slice(-6).some((e) => e.kind === 'dm' && e.scene?.painting);
  return (
    <div className="battle-ready" role="dialog" aria-live="assertive" aria-label={t('Get ready for battle')}>
      <div className="br-card">
        <small className="br-kicker">{t('Get ready for battle')}</small>
        <p className="br-why">{ready.why}</p>
        <ul className="br-foes">
          {[...kinds.values()].map((k) => (
            <li key={k.name}><img src={k.face} alt="" /><span>{k.n > 1 ? `${k.n} × ${k.name}` : k.name}</span></li>
          ))}
        </ul>
        {painting && <small className="br-note">{t('The Dungeon Master is still painting this moment.')}</small>}
        <button type="button" className="primary br-go" autoFocus onClick={() => { sfx('click'); onReady(); }}>
          {t('To battle!')} <kbd>{t('Enter')}</kbd>
        </button>
        {others.length > 0 && <small className="br-note">{t('Also getting ready: {names}', { names: others.join(', ') })}</small>}
        <div className="cr-timer" title={t('After that, the battle begins anyway.')}><span style={{ width: `${Math.min(100, ((ready.until - now) / span.current) * 100)}%` }} /></div>
      </div>
    </div>
  );
}
