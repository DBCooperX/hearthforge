import { ABILITIES, ABILITY_NAMES, CLASS_INFO, ITEMS, SAVE_PROFS, SKILLS, SLOT_LABELS } from '../../../shared/content';
import { MAX_LEVEL, SLOT_IDS, XP_THRESHOLDS, abilityMod, type AbilityKey, type Character, type GameState } from '../../../shared/types';
import { spriteUrl } from '../game/sprites';
import { weaponSummary } from '../game/util';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

interface Props {
  state: GameState;
  character: Character;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** The full character sheet: abilities, saves, skills, features, spells and progress to the next level. */
export function CharacterSheet({ state, character: c, onSelect, onClose }: Props) {
  const floor = XP_THRESHOLDS[c.level - 1];
  const next = c.level < MAX_LEVEL ? XP_THRESHOLDS[c.level] : null;
  const pct = next ? Math.max(0, Math.min(100, ((c.xp - floor) / (next - floor)) * 100)) : 100;
  const saves = SAVE_PROFS[c.classId] ?? [];
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
          <button className="link close" onClick={onClose} title="Close (c or Esc)">✕</button>
        </header>
        <div className="sheet-body">
          <section className="sheet-id">
            <img className="pixel" src={spriteUrl(c.classId)} alt="" />
            <div>
              <h1 style={{ color: CLASS_INFO[c.classId].color }}>{c.name}</h1>
              <p>Level {c.level} {c.className}{owner ? ` · played by ${owner.name}` : ''}</p>
              <div className="xp" title="Experience">
                <div className="fill" style={{ width: `${pct}%` }} />
                <span>{next ? `${c.xp} / ${next} XP to level ${c.level + 1}` : `${c.xp} XP · highest level`}</span>
              </div>
            </div>
            <div className="vitals">
              <div><b>{c.hp}/{c.maxHp}</b><small>Hit points</small></div>
              <div><b>{c.ac}</b><small>Armor class</small></div>
              <div><b>{signed(c.profBonus)}</b><small>Proficiency</small></div>
              <div><b>{c.speed} ft</b><small>Speed</small></div>
              <div><b>{c.hitDice}/{c.level}</b><small>Hit dice</small></div>
              {c.maxMana > 0 && <div><b>{c.mana}/{c.maxMana}</b><small>Mana</small></div>}
            </div>
          </section>

          <section className="sheet-cols">
            <div>
              <h3>Abilities and saves</h3>
              <table className="abilities">
                <tbody>
                  {KEYS.map((k) => {
                    const mod = abilityMod(c.abilities[k]);
                    const prof = saves.includes(k);
                    return (
                      <tr key={k}>
                        <th>{ABILITY_NAMES[k]}</th>
                        <td className="score">{c.abilities[k]}</td>
                        <td className="mod">{signed(mod)}</td>
                        <td className={prof ? 'save prof' : 'save'} title={prof ? 'Proficient saving throw' : 'Saving throw'}>save {signed(mod + (prof ? c.profBonus : 0))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <h3>Equipment</h3>
              <p className="small">Attack: {weaponSummary(c)}</p>
              <ul className="plain">
                {worn.length === 0 && <li className="muted">Nothing equipped.</li>}
                {worn.map((s) => <li key={s}><small>{SLOT_LABELS[s]}</small> {ITEMS[c.equipment[s]!.defId].icon} {ITEMS[c.equipment[s]!.defId].name}</li>)}
              </ul>
            </div>
            <div>
              <h3>Skills</h3>
              <ul className="skills">
                {Object.entries(SKILLS).map(([skill, ability]) => {
                  const prof = c.skills.includes(skill);
                  return (
                    <li key={skill} className={prof ? 'prof' : ''}>
                      <span className="pip" />{skill}<small>{ability}</small><b>{signed(abilityMod(c.abilities[ability]) + (prof ? c.profBonus : 0))}</b>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <h3>Features</h3>
              <ul className="plain">
                {c.features.length === 0 && <li className="muted">None yet.</li>}
                {c.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <h3>Actions and spells</h3>
              <ul className="plain">
                {c.abilityIds.map((id) => ABILITIES[id]).filter(Boolean).map((a) => (
                  <li key={a.id}><b>{a.icon} {a.name}</b>{a.cost > 0 && <span className="cost">{a.cost}</span>}<br /><small>{a.description}</small></li>
                ))}
              </ul>
              {c.conditions.length > 0 && <><h3>Conditions</h3><div className="conditions">{c.conditions.map((x) => <span key={x} className={`chip ${x}`}>{x}</span>)}</div></>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
