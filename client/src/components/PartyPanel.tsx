import { CLASS_INFO } from '../../../shared/content';
import { MAX_LEVEL, XP_THRESHOLDS, type Character, type GameState, type InvLoc } from '../../../shared/types';
import { artOfCharacter, heroUrl } from '../game/heroArt';
import { playerId } from '../net';
import { useT } from '../i18n';
import { classLabel } from '../game/util';

interface Props {
  state: GameState;
  selectedId: string | null;
  activeId: string | null;
  targeting: boolean;
  onPick: (c: Character) => void;
  onGive: (fromCharacterId: string, from: InvLoc, to: Character) => void;
  onSheet: (c: Character) => void;
  onLevelUp: (c: Character) => void;
}

function Bar({ kind, value, max }: { kind: 'hp' | 'mana'; value: number; max: number }) {
  const t = useT();
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`bar ${kind}`} title={kind === 'hp' ? t('Hit points') : t('Mana (spell points)')}>
      <div className="fill" style={{ width: `${pct}%` }} />
      <span>{value} / {max}</span>
    </div>
  );
}

export function PartyPanel({ state, selectedId, activeId, targeting, onPick, onGive, onSheet, onLevelUp }: Props) {
  const t = useT();
  return (
    <aside className="party">
      <h2>{t('Party')}</h2>
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
              <img className="pixel" src={heroUrl(artOfCharacter(c, state.items))} alt="" />
              <span className="ac" title={t('Armor Class')}>{c.ac}</span>
            </div>
            <div className="info">
              <div className="name">
                <b>{c.name}</b>
                <button className="link sheet-link" title={t('Character sheet (c)')} onClick={(e) => { e.stopPropagation(); onSheet(c); }}>{classLabel(c, t)} {c.level}</button>
              </div>
              <Bar kind="hp" value={c.hp} max={c.maxHp} />
              {c.maxMana > 0 && <Bar kind="mana" value={c.mana} max={c.maxMana} />}
              <div className="xpbar" title={c.level < MAX_LEVEL ? t('{xp} / {next} XP to level {level}', { xp: c.xp, next: XP_THRESHOLDS[c.level], level: c.level + 1 }) : `${c.xp} XP`}>
                <div style={{ width: `${c.level < MAX_LEVEL ? Math.min(100, ((c.xp - XP_THRESHOLDS[c.level - 1]) / (XP_THRESHOLDS[c.level] - XP_THRESHOLDS[c.level - 1])) * 100) : 100}%` }} />
              </div>
              {mine && c.pending.length > 0 && <button className="levelup-badge" onClick={(e) => { e.stopPropagation(); onLevelUp(c); }}>⬆ {t('Level up')}</button>}
              <div className="conditions">
                {c.conditions.map((x) => <span key={x} className={`chip ${x}`}>{t(x)}</span>)}
                {down && !c.conditions.includes('stable') && (
                  <span className="saves" title={t('Death saves')}>
                    {'●'.repeat(c.deathSaves.successes)}{'○'.repeat(3 - c.deathSaves.successes)} <i>{'✖'.repeat(c.deathSaves.failures)}</i>
                  </span>
                )}
                {!mine && owner && <span className={owner.connected ? 'chip owner' : 'chip owner away'} title={owner.connected ? t('Played by {name}', { name: owner.name }) : t('{name} is away. Anyone may play this hero in a fight.', { name: owner.name })}>{owner.name}{!owner.connected && ` · ${t('away')}`}</span>}
              </div>
            </div>
          </div>
        );
      })}
      <div className="gold" title={t('Party gold')}>🪙 {state.gold} {t('gp')}</div>
    </aside>
  );
}
