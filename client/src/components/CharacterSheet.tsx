import { ABILITIES, ABILITY_NAMES, CLASS_INFO, ITEMS, SAVE_PROFS, SKILLS, SLOT_LABELS } from '../../../shared/content';
import { MAX_LEVEL, SLOT_IDS, XP_THRESHOLDS, abilityMod, type AbilityKey, type Character, type GameState } from '../../../shared/types';
import { spriteUrl } from '../game/sprites';
import { weaponSummary } from '../game/util';
import { BACKGROUNDS, CLASSES, SPECIES } from '../../../shared/rules';
import { useLang, useT } from '../i18n';
import { featureText } from './Guide';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

interface Props {
  state: GameState;
  character: Character;
  onSelect: (id: string) => void;
  onClose: () => void;
  onLevelUp?: (c: Character) => void;
  mine?: boolean;
}

/** The full character sheet: abilities, saves, skills, features, spells and progress to the next level. */
export function CharacterSheet({ state, character: c, onSelect, onClose, onLevelUp, mine }: Props) {
  const t = useT();
  const { lang } = useLang();
  const floor = XP_THRESHOLDS[c.level - 1];
  const next = c.level < MAX_LEVEL ? XP_THRESHOLDS[c.level] : null;
  const pct = next ? Math.max(0, Math.min(100, ((c.xp - floor) / (next - floor)) * 100)) : 100;
  const saves = CLASSES[c.classId]?.saves ?? SAVE_PROFS[c.classId] ?? [];
  const owner = state.players.find((p) => p.id === c.ownerId);
  const worn = SLOT_IDS.filter((s) => c.equipment[s]);

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel sheet">
        <header>
          <div className="tabs">
            {state.characters.map((o) => (
              <button key={o.id} className={o.id === c.id ? 'tab on' : 'tab'} onClick={() => onSelect(o.id)}>
                <img className="pixel" src={spriteUrl(o.classId)} alt="" /> {o.name}
              </button>
            ))}
          </div>
          <button className="link close" onClick={onClose} title={t('Close (c or Esc)')}>✕</button>
        </header>
        <div className="sheet-body">
          <section className="sheet-id">
            <img className="pixel" src={spriteUrl(c.classId)} alt="" />
            <div>
              <h1 style={{ color: CLASS_INFO[c.classId].color }}>{c.name}</h1>
              <p>{t('Level {level} {class}', { level: c.level, class: `${t(SPECIES[c.speciesId]?.name ?? '')} ${t(c.className)}`.trim() })}{c.subclass ? ` (${t(c.subclass)})` : ''} · {t(BACKGROUNDS[c.backgroundId]?.name ?? '')}{owner ? ` · ${t('played by {name}', { name: owner.name })}` : ''}</p>
              {mine && c.pending.length > 0 && onLevelUp && <button className="primary levelup-btn" onClick={() => onLevelUp(c)}>⬆ {t('Level-up choice waiting')}</button>}
              <div className="xp" title={t('Experience')}>
                <div className="fill" style={{ width: `${pct}%` }} />
                <span>{next ? t('{xp} / {next} XP to level {level}', { xp: c.xp, next, level: c.level + 1 }) : t('{xp} XP · highest level', { xp: c.xp })}</span>
              </div>
            </div>
            <div className="vitals">
              <div><b>{c.hp}/{c.maxHp}</b><small>{t('Hit points')}</small></div>
              <div><b>{c.ac}</b><small>{t('Armor class')}</small></div>
              <div><b>{signed(c.profBonus)}</b><small>{t('Proficiency')}</small></div>
              <div><b>{c.speed} ft</b><small>{t('Speed')}</small></div>
              <div><b>{c.hitDice}/{c.level}</b><small>{t('Hit dice')}</small></div>
              {c.maxMana > 0 && <div><b>{c.mana}/{c.maxMana}</b><small>{t('Mana')}</small></div>}
            </div>
          </section>

          <section className="sheet-cols">
            <div>
              <h3>{t('Abilities and saves')}</h3>
              <table className="abilities">
                <tbody>
                  {KEYS.map((k) => {
                    const mod = abilityMod(c.abilities[k]);
                    const prof = saves.includes(k);
                    return (
                      <tr key={k}>
                        <th>{t(ABILITY_NAMES[k])}</th>
                        <td className="score">{c.abilities[k]}</td>
                        <td className="mod">{signed(mod)}</td>
                        <td className={prof ? 'save prof' : 'save'} title={prof ? t('Proficient saving throw') : t('Saving throw')}>{t('save')} {signed(mod + (prof ? c.profBonus : 0))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <h3>{t('Equipment')}</h3>
              <p className="small">{t('Attack')}: {weaponSummary(c, t)}</p>
              <ul className="plain">
                {worn.length === 0 && <li className="muted">{t('Nothing equipped.')}</li>}
                {worn.map((s) => <li key={s}><small>{t(SLOT_LABELS[s])}</small> {ITEMS[c.equipment[s]!.defId].icon} {t(ITEMS[c.equipment[s]!.defId].name)}</li>)}
              </ul>
            </div>
            <div>
              <h3>{t('Skills')}</h3>
              <ul className="skills">
                {Object.entries(SKILLS).map(([skill, ability]) => {
                  const prof = c.skills.includes(skill);
                  return (
                    <li key={skill} className={prof ? 'prof' : ''}>
                      <span className="pip" />{t(skill)}{c.expertise.includes(skill) && <span title={t('Expertise')}>★</span>}<small>{t(ability.toUpperCase())}</small><b>{signed(abilityMod(c.abilities[ability]) + (prof ? c.profBonus * (c.expertise.includes(skill) ? 2 : 1) : 0))}</b>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <h3>{t('Features')}</h3>
              <ul className="plain">
                {c.features.length === 0 && <li className="muted">{t('None yet.')}</li>}
                {c.features.map((f) => <li key={f}>{featureText(f, lang, t)}</li>)}
              </ul>
              <h3>{t('Actions and spells')}</h3>
              <ul className="plain">
                {c.abilityIds.map((id) => ABILITIES[id]).filter(Boolean).map((a) => (
                  <li key={a.id}><b>{a.icon} {t(a.name)}</b>{a.cost > 0 && <span className="cost">{a.cost}</span>}<br /><small>{t(a.description)}</small></li>
                ))}
              </ul>
              {(c.appearance || c.backstory) && <><h3>{t('Story')}</h3>{c.appearance && <p className="small">{c.appearance}</p>}{c.backstory && <p className="small muted">{c.backstory}</p>}</>}
              {c.conditions.length > 0 && <><h3>{t('Conditions')}</h3><div className="conditions">{c.conditions.map((x) => <span key={x} className={`chip ${x}`}>{t(x)}</span>)}</div></>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
