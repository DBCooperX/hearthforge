import { CLASS_INFO } from '../../../shared/content';
import { BEAST_FORMS, shownResources } from '../../../shared/classes';
import { MAX_LEVEL, XP_THRESHOLDS, type Character, type CompanionStance, type GameState, type InvLoc } from '../../../shared/types';
import { artOfCharacter, companionFace, heroPortraitUrl } from '../game/heroArt';
import { playerId } from '../net';
import { useT } from '../i18n';
import { classLabel, conditionHelp } from '../game/util';
import { FeatureGlyph, UiGlyph } from '../ui/Glyph';
import { itemDef } from '../../../shared/items';

interface Props {
  state: GameState;
  selectedId: string | null;
  activeId: string | null;
  targeting: boolean;
  onPick: (c: Character) => void;
  onGive: (fromCharacterId: string, from: InvLoc, to: Character) => void;
  onSheet: (c: Character) => void;
  onLevelUp: (c: Character) => void;
  /** Open a companion's gear. */
  onCompanion: (c: Character) => void;
}

export const STANCE_LABELS: Record<CompanionStance, string> = { fight: 'Fights', guard: 'Guards the heroes', back: 'Keeps back' };
const STANCE_HELP: Record<CompanionStance, string> = {
  fight: 'Goes for the nearest enemy.',
  guard: 'Stays by the heroes and strikes whatever comes close.',
  back: 'Stays out of harm\'s way and only dodges.',
};
const MIME = 'application/x-hearthforge-item';


function Bar({ kind, value, max, temp }: { kind: 'hp' | 'mana'; value: number; max: number; temp?: number }) {
  const t = useT();
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`bar ${kind}`} title={kind === 'hp' ? t('Hit points') : t('Mana (spell points)')}>
      <div className="fill" style={{ width: `${pct}%` }} />
      <span>{value} / {max}{temp ? <b title={t('Temporary hit points')}> +{temp}</b> : null}</span>
    </div>
  );
}

/**
 * In a fight, what a hero still has: action, bonus action and reaction on the hero whose turn it
 * is, and the reaction on everyone else, as the same pips as the hotbar. Spent ones empty.
 */
function TurnPips({ state, c, active }: { state: GameState; c: Character; active: boolean }) {
  const t = useT();
  const combat = state.phase === 'combat' ? state.combat : null;
  if (!combat || c.dead || c.hp <= 0 || !combat.order.some((o) => o.id === c.id)) return null;
  const reaction = !combat.reacted?.includes(c.id);
  const pips: { kind: 'action' | 'bonus' | 'reaction'; left: boolean; label: string }[] = [
    ...(active ? [
      { kind: 'action' as const, left: !combat.actionUsed || combat.attacksLeft > 0, label: t('Action') },
      { kind: 'bonus' as const, left: !combat.bonusUsed, label: t('Bonus action') },
    ] : []),
    { kind: 'reaction', left: reaction, label: t('Reaction') },
  ];
  const say = pips.map((p) => `${p.label}: ${p.left ? t('ready') : t('used')}`).join(' · ');
  return (
    <span className="turn-pips" title={say} aria-label={say}>
      {pips.map((p) => <i key={p.kind} className={`pip ${p.kind}${p.left ? '' : ' spent'}`} />)}
    </span>
  );
}

export function PartyPanel({ state, selectedId, activeId, targeting, onPick, onGive, onSheet, onLevelUp, onCompanion }: Props) {
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
              <img className="hero-art" src={heroPortraitUrl(artOfCharacter(c, state.items))} alt="" />
              <span className="ac" title={t('Armor Class')}>{c.ac}</span>
            </div>
            <div className="info">
              <div className="name">
                <b title={c.name}>{c.name}</b>
                {c.heroic && <span className="heroic-spark" title={t('Inspiration: the next failed check is rolled again')} aria-label={t('Inspiration: the next failed check is rolled again')}><UiGlyph id="inspiration" emoji="✨" /></span>}
                <button className="link sheet-link" title={t('Character sheet (c)')} onClick={(e) => { e.stopPropagation(); onSheet(c); }}>{classLabel(c, t)} {c.level}</button>
              </div>
              <Bar kind="hp" value={c.hp} max={c.maxHp} temp={c.tempHp} />
              {c.maxMana > 0 && <Bar kind="mana" value={c.mana} max={c.maxMana} />}
              <div className="xpbar" title={c.level < MAX_LEVEL ? t('{xp} / {next} XP to level {level}', { xp: c.xp, next: XP_THRESHOLDS[c.level], level: c.level + 1 }) : `${c.xp} XP`}>
                <div style={{ width: `${c.level < MAX_LEVEL ? Math.min(100, ((c.xp - XP_THRESHOLDS[c.level - 1]) / (XP_THRESHOLDS[c.level] - XP_THRESHOLDS[c.level - 1])) * 100) : 100}%` }} />
              </div>
              {mine && c.pending.length > 0 && <button className="levelup-badge" onClick={(e) => { e.stopPropagation(); onLevelUp(c); }}><UiGlyph id="level_up" emoji="⬆" /> {t('Level up')}</button>}
              {shownResources(c).length > 0 && (
                <div className="uses">
                  {shownResources(c).map((r) => <span key={r.def.id} className={r.left ? '' : 'out'} title={`${t(r.def.name)}: ${r.left} / ${r.max}`}><FeatureGlyph id={r.def.id} emoji={r.def.icon} /> {r.left}</span>)}
                </div>
              )}
              <div className="conditions">
                <TurnPips state={state} c={c} active={c.id === activeId} />
                {c.form && BEAST_FORMS[c.form] && <span className="chip form" title={t('Wild Shape')}>{BEAST_FORMS[c.form].icon} {t(BEAST_FORMS[c.form].name)}</span>}
                {c.conditions.map((x) => <span key={x} className={`chip ${x}`} title={conditionHelp(x, t)}>{t(x)}</span>)}
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
      {(state.companions ?? []).length > 0 && (
        <section className="companions" aria-label={t('Companions')}>
          <h3>{t('Companions')}</h3>
          {state.companions.map((c) => {
            const info = c.companion!;
            const down = c.hp <= 0 && !c.dead;
            const weapon = c.equipment.mainHand ? itemDef(state.items, c.equipment.mainHand.defId)?.name ?? null : null;
            const cls = ['card', 'companion', c.id === activeId && 'active', c.dead && 'dead', down && 'down', targeting && !c.dead && 'targetable'].filter(Boolean).join(' ');
            return (
              <div
                key={c.id}
                className={cls}
                title={t('{name} travels with the party. Drop an item here to hand it over; click to see what they carry.', { name: c.name })}
                onClick={() => (targeting ? onPick(c) : onCompanion(c))}
                onDragOver={(e) => { if (!c.dead && e.dataTransfer.types.includes(MIME)) e.preventDefault(); }}
                onDrop={(e) => {
                  const raw = e.dataTransfer.getData(MIME);
                  if (!raw) return;
                  e.preventDefault();
                  const d = JSON.parse(raw) as { characterId: string; from: InvLoc };
                  if (d.characterId !== c.id) onGive(d.characterId, d.from, c);
                }}
              >
                <div className="portrait small">
                  <img className="hero-art face" src={companionFace(c, state.items)} alt="" />
                  <span className="ac" title={t('Armor Class')}>{c.ac}</span>
                </div>
                <div className="info">
                  <div className="name">
                    <b title={c.name}>{c.name}</b>
                    <span className="role" title={t('Fights like: {kind}', { kind: info.kind })}>{info.role}</span>
                  </div>
                  <Bar kind="hp" value={c.hp} max={c.maxHp} temp={c.tempHp} />
                  <div className="conditions">
                    <TurnPips state={state} c={c} active={c.id === activeId} />
                    {c.dead ? <span className="chip">{t('fallen')}</span> : <span className={`chip stance ${info.stance}`} title={t(STANCE_HELP[info.stance])}>{t(STANCE_LABELS[info.stance])}</span>}
                    <span className="chip weapon" title={t('Weapon in hand')}>{weapon ? t(weapon) : t('unarmed')}</span>
                    {c.conditions.map((x) => <span key={x} className={`chip ${x}`} title={conditionHelp(x, t)}>{t(x)}</span>)}
                    {down && !c.conditions.includes('stable') && (
                      <span className="saves" title={t('Death saves')}>
                        {'●'.repeat(c.deathSaves.successes)}{'○'.repeat(3 - c.deathSaves.successes)} <i>{'✖'.repeat(c.deathSaves.failures)}</i>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}
      <div className="gold" title={t('Party gold')}><UiGlyph id="gold" emoji="🪙" /> {state.gold} {t('gp')}</div>
    </aside>
  );
}
