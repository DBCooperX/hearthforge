import { CLASS_INFO } from '../../../shared/content';
import type { Character, GameState, InvLoc } from '../../../shared/types';
import { spriteUrl } from '../game/sprites';
import { playerId } from '../net';

interface Props {
  state: GameState;
  selectedId: string | null;
  activeId: string | null;
  targeting: boolean;
  onPick: (c: Character) => void;
  onGive: (fromCharacterId: string, from: InvLoc, to: Character) => void;
}

function Bar({ kind, value, max }: { kind: 'hp' | 'mana'; value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`bar ${kind}`} title={kind === 'hp' ? 'Hit points' : 'Mana (spell points)'}>
      <div className="fill" style={{ width: `${pct}%` }} />
      <span>{value} / {max}</span>
    </div>
  );
}

export function PartyPanel({ state, selectedId, activeId, targeting, onPick, onGive }: Props) {
  return (
    <aside className="party">
      <h2>Party</h2>
      {state.characters.map((c) => {
        const down = c.hp <= 0 && !c.dead;
        const mine = c.ownerId === playerId;
        const owner = state.players.find((p) => p.id === c.ownerId);
        const cls = ['card', c.id === selectedId && 'selected', c.id === activeId && 'active', c.dead && 'dead', down && 'down', targeting && 'targetable'].filter(Boolean).join(' ');
        return (
          <div
            key={c.id}
            className={cls}
            onClick={() => onPick(c)}
            onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-hearthforge-item')) e.preventDefault(); }}
            onDrop={(e) => {
              const raw = e.dataTransfer.getData('application/x-hearthforge-item');
              if (!raw) return;
              e.preventDefault();
              const d = JSON.parse(raw) as { characterId: string; from: InvLoc };
              if (d.characterId !== c.id) onGive(d.characterId, d.from, c);
            }}
          >
            <div className="portrait" style={{ borderColor: CLASS_INFO[c.classId].color }}>
              <img className="pixel" src={spriteUrl(c.classId)} alt="" />
              <span className="ac" title="Armor Class">{c.ac}</span>
            </div>
            <div className="info">
              <div className="name">
                <b>{c.name}</b>
                <span className="muted">{c.className} {c.level}</span>
              </div>
              <Bar kind="hp" value={c.hp} max={c.maxHp} />
              {c.maxMana > 0 && <Bar kind="mana" value={c.mana} max={c.maxMana} />}
              <div className="conditions">
                {c.conditions.map((x) => <span key={x} className={`chip ${x}`}>{x}</span>)}
                {down && !c.conditions.includes('stable') && (
                  <span className="saves" title="Death saves">
                    {'●'.repeat(c.deathSaves.successes)}{'○'.repeat(3 - c.deathSaves.successes)} <i>{'✖'.repeat(c.deathSaves.failures)}</i>
                  </span>
                )}
                {!mine && <span className="chip owner">{owner?.name ?? 'someone'}{owner && !owner.connected ? ' (away)' : ''}</span>}
              </div>
            </div>
          </div>
        );
      })}
      <div className="gold" title="Party gold">🪙 {state.gold} gp</div>
    </aside>
  );
}
