// What tells a player, in the middle of the battle map, that it is their move: a short "Your
// turn" banner with a bell when one of their heroes comes up, and the end turn reminder when
// they have been quiet for a while (the End turn button glows at the same time).
import { useEffect, useRef, useState } from 'react';
import type { Character, GameState } from '../../../shared/types';
import { useT } from '../i18n';
import { sfx } from '../ui/sound';
import { useTurnNudge } from './Hud';

const BANNER_MS = 1900;

export function TurnCallout({ state, actor }: { state: GameState; actor: Character | null }) {
  const t = useT();
  const combat = state.phase === 'combat' ? state.combat : null;
  const mine = !!actor && actor.hp > 0;
  const turnKey = combat && mine ? `${state.room}:${combat.round}:${combat.turnIndex}:${actor!.id}` : '';
  const [banner, setBanner] = useState<{ key: string; name: string } | null>(null);
  const seen = useRef('');
  useEffect(() => {
    if (!turnKey || seen.current === turnKey) return;
    seen.current = turnKey;
    setBanner({ key: turnKey, name: actor!.name });
    sfx('turn');
    const timer = window.setTimeout(() => setBanner(null), BANNER_MS);
    return () => window.clearTimeout(timer);
  }, [turnKey]);
  const nudge = useTurnNudge(mine, combat, state.log.length);
  // Several heroes of one player: say whose turn it is.
  const own = state.characters.filter((c) => actor && c.ownerId === actor.ownerId && !c.dead).length;
  if (banner && banner.key === turnKey) {
    return (
      <div className="turn-callout your-turn" role="status" aria-live="assertive" key={banner.key}>
        <b>{t('Your turn')}</b>
        {own > 1 && <span>{banner.name}</span>}
      </div>
    );
  }
  if (nudge) {
    return (
      <div className="turn-callout nudge" role="status" aria-live="polite">
        <b>{nudge === 'spent' ? t('Nothing left to do?') : t('Still there?')}</b>
        <span>{t('End your turn when you are done.')} <em>{t('Space')}</em></span>
      </div>
    );
  }
  return null;
}
