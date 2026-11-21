// "The adventure" from the game menu: how the Dungeon Master runs this table. The host can change
// it during play; everyone else sees what was chosen. The same cards as in the table room.
import type { GameState } from '../../../shared/types';
import { useT } from '../i18n';
import { playerId, type Connection } from '../net';
import { Window } from '../ui/Window';
import { AdventureCards } from './AdventureSetup';

export function AdventureWindow({ state, conn, onClose }: { state: GameState; conn: Connection; onClose: () => void }) {
  const t = useT();
  const host = state.hostId === playerId;
  return (
    <Window title={t('The adventure')} icon="quest" size="medium" className="adventure-win" onClose={onClose}
      subtitle={!host ? t('Set by the host') : undefined}>
      <div className="adventure-win-body">
        <AdventureCards state={state} conn={conn} world={false} />
      </div>
    </Window>
  );
}
