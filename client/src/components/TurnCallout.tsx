// What tells a player, in the middle of the battle map, that it is their move: a short "Your
// turn" banner with a bell when one of their heroes comes up. The end turn reminder sits by the
// End turn button (see Hud), off the board.
import { useEffect, useRef, useState } from 'react';
import type { Character, GameState } from '../../../shared/types';
import { useT } from '../i18n';
import { sfx } from '../ui/sound';

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
  return null;
}
