import { ItemIcon } from '../ui/ItemIcon';
import { useState } from 'react';
import { ABILITIES, ABILITY_NAMES, CLASS_INFO, SAVE_PROFS, SKILLS, SLOT_LABELS } from '../../../shared/content';
import { castingAbility, weaponAttack } from '../../../shared/build';
import { MAX_LEVEL, SLOT_IDS, XP_THRESHOLDS, abilityMod, type AbilityKey, type Character, type GameState, PRONOUNS } from '../../../shared/types';
import { artOfCharacter, heroUrl } from '../game/heroArt';
import { itemDef } from '../../../shared/items';
import { classLabel, conditionHelp } from '../game/util';
import { ABILITY_HELP, BACKGROUNDS, CLASSES, GLOSSARY, SKILL_HELP, SPECIES, loc } from '../../../shared/rules';
import { useLang, useT } from '../i18n';
import { Rich, dice, featureText, signed } from './Guide';
import { Hint } from '../ui/Hint';
import { Icon } from '../ui/icons';
import { HeroTabs, TabBar, Window } from '../ui/Window';

const KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
type Side = 'features' | 'actions' | 'story';
let lastSide: Side = 'features';

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
  const [side, setSideState] = useState<Side>(lastSide);
  const setSide = (s: Side) => { lastSide = s; setSideState(s); };
  const floor = XP_THRESHOLDS[c.level - 1];
  const next = c.level < MAX_LEVEL ? XP_THRESHOLDS[c.level] : null;
  const pct = next ? Math.max(0, Math.min(100, ((c.xp - floor) / (next - floor)) * 100)) : 100;
  const saves = CLASSES[c.classId]?.saves ?? SAVE_PROFS[c.classId] ?? [];
  const owner = state.players.find((p) => p.id === c.ownerId);
  const worn = SLOT_IDS.filter((s) => c.equipment[s]);
  const term = (id: string) => { const g = GLOSSARY.find((x) => x.id === id); return g ? loc(g.text, lang) : ''; };
  const initiative = abilityMod(c.abilities.dex) + (c.feats.includes('alert') ? c.profBonus : 0);
  const attack = weaponAttack(c, c.equipment.mainHand ? itemDef(state.items, c.equipment.mainHand.defId) : null);
  const actions = c.abilityIds.map((id) => ABILITIES[id]).filter(Boolean);
  const casts = c.maxMana > 0 || actions.some((a) => a.spellLevel !== undefined);
  const castWith = castingAbility(c);
  const castMod = abilityMod(c.abilities[castWith]);
  const identity = [t(BACKGROUNDS[c.backgroundId]?.name ?? ''), c.gender !== 'neutral' ? t(PRONOUNS[c.gender]) : '', owner ? t('played by {name}', { name: owner.name }) : ''].filter(Boolean).join(' · ');

  const vitals: { key: string; value: string; label: string; hint: string; tone?: string }[] = [
    { key: 'hp', value: `${c.hp}/${c.maxHp}`, label: t('Hit points'), hint: term('hp'), tone: 'hp' },
    { key: 'ac', value: String(c.ac), label: t('Armor class'), hint: term('ac') },
    { key: 'init', value: signed(initiative), label: t('Initiative'), hint: term('initiative') },
    { key: 'speed', value: `${c.speed} ft`, label: t('Speed'), hint: t('{n} ft of movement', { n: c.speed }) },
    { key: 'prof', value: signed(c.profBonus), label: t('Proficiency'), hint: term('proficiency') },
    { key: 'hd', value: `${c.hitDice}/${c.level}`, label: t('Hit dice'), hint: term('hitdie') },
    ...(c.maxMana > 0 ? [{ key: 'mana', value: `${c.mana}/${c.maxMana}`, label: t('Mana'), hint: term('mana'), tone: 'mana' }] : []),
  ];

  return (
    <Window title={t('Character')} icon="character" hotkey="C" size="large" className="sheet" onClose={onClose}
      tabs={<HeroTabs state={state} selectedId={c.id} onSelect={onSelect} />}>
      <div className="cs">
        <aside className="cs-id">
          <div className="cs-portrait" style={{ '--class': CLASS_INFO[c.classId].color } as React.CSSProperties}>
            <img className="pixel" src={heroUrl(artOfCharacter(c, state.items))} alt="" />
            <span className="cs-level" title={t('Level {n}', { n: c.level })}>{c.level}</span>
          </div>
          <h2>{c.name}</h2>
          <p className="cs-line">{`${t(SPECIES[c.speciesId]?.name ?? '')} ${classLabel(c, t)}`.trim()}{c.subclass ? ` · ${t(c.subclass)}` : ''}</p>
          {identity && <p className="cs-line soft">{identity}</p>}
          <div className="xp" title={t('Experience')}>
            <div className="fill" style={{ width: `${pct}%` }} />
            <span>{next ? t('{xp} / {next} XP to level {level}', { xp: c.xp, next, level: c.level + 1 }) : t('{xp} XP · highest level', { xp: c.xp })}</span>
          </div>
          {mine && c.pending.length > 0 && onLevelUp && <button className="primary levelup-btn" onClick={() => onLevelUp(c)}>⬆ {t('Level-up choice waiting')}</button>}
          <div className="cs-vitals">
            {vitals.map((v) => (
              <Hint key={v.key} title={v.label} text={v.hint}>
                <div className={v.tone} tabIndex={0}><b>{v.value}</b><small>{v.label}</small></div>
              </Hint>
            ))}
          </div>
          {c.conditions.length > 0 && <div className="conditions">{c.conditions.map((x) => <span key={x} className={`chip ${x}`} title={conditionHelp(x, t)}>{t(x)}</span>)}</div>}
        </aside>

        <section className="cs-core">
          <h3><span>{t('Abilities and saves')}</span></h3>
          <div className="cs-abilities">
            {KEYS.map((k) => {
              const mod = abilityMod(c.abilities[k]);
              const prof = saves.includes(k);
              return (
                <Hint key={k} title={t(ABILITY_NAMES[k])} text={<>{loc(ABILITY_HELP[k].text, lang)}<br /><em>{loc(ABILITY_HELP[k].uses, lang)}</em></>}>
                  <div className="plaque" tabIndex={0}>
                    <small>{t(k.toUpperCase())}</small>
                    <b>{signed(mod)}</b>
                    <span className="score">{c.abilities[k]}</span>
                    <span className={prof ? 'save prof' : 'save'}><i className="pip" />{t('save')} {signed(mod + (prof ? c.profBonus : 0))}</span>
                  </div>
                </Hint>
              );
            })}
          </div>
          <h3><span>{t('Skills')}</span><small className="legend"><i className="pip on" /> {t('Proficient')} <i className="pip double" /> {t('Expertise')}</small></h3>
          <ul className="cs-skills">
            {Object.entries(SKILLS).map(([skill, ability]) => {
              const prof = c.skills.includes(skill);
              const expert = c.expertise.includes(skill);
              const mod = abilityMod(c.abilities[ability]);
              const bonus = prof ? c.profBonus * (expert ? 2 : 1) : 0;
              const parts = `${t(ABILITY_NAMES[ability])} ${signed(mod)}${bonus ? ` · ${t(expert ? 'Expertise' : 'Proficiency')} ${signed(bonus)}` : ''}`;
              return (
                <Hint key={skill} title={<span className="cap">{t(skill)}</span>} text={<>{SKILL_HELP[skill] ? loc(SKILL_HELP[skill], lang) : ''}<br /><em>{parts}</em></>}>
                  <li className={prof ? 'prof' : ''} tabIndex={0}>
                    <i className={expert ? 'pip double' : prof ? 'pip on' : 'pip'} />
                    <span className="cap">{t(skill)}</span>
                    <small>{t(ability.toUpperCase())}</small>
                    <b>{signed(mod + bonus)}</b>
                  </li>
                </Hint>
              );
            })}
          </ul>
          <h3><span>{t('In a fight')}</span></h3>
          <div className="cs-combat">
            <Hint title={t('Attack')} text={<>{t(attack.name)}<br /><em>{dice(attack.damage, lang)} {t(`${attack.type} damage`)}</em></>}>
              <div tabIndex={0}><Icon name="sword" size={20} /><b>{signed(attack.bonus)}</b><small>{t(attack.name)} · {dice(attack.damage, lang)}</small></div>
            </Hint>
            {casts && (
              <Hint title={t('Spell attack')} text={<>{term('spellattack')}<br /><em>{t(ABILITY_NAMES[castWith])} {signed(castMod)} · {t('Proficiency')} {signed(c.profBonus)}</em></>}>
                <div tabIndex={0}><span className="cs-glyph">✦</span><b>{signed(castMod + c.profBonus)}</b><small>{t('Spell attack')}</small></div>
              </Hint>
            )}
            {casts && (
              <Hint title={t('Spell save DC')} text={<>{term('dc')}<br /><em>8 · {t(ABILITY_NAMES[castWith])} {signed(castMod)} · {t('Proficiency')} {signed(c.profBonus)}</em></>}>
                <div tabIndex={0}><span className="cs-glyph">◈</span><b>{8 + castMod + c.profBonus}</b><small>{t('Spell save DC')}</small></div>
              </Hint>
            )}
            <Hint title={t('Resistance')} text={term('resistance')}>
              <div tabIndex={0}><Icon name="shield" size={20} /><b className={c.resist.length ? 'words cap' : ''}>{c.resist.length ? c.resist.map((r) => t(`${r} damage`)).join(', ') : '–'}</b><small>{t('Resistance')}</small></div>
            </Hint>
          </div>
        </section>

        <section className="cs-side">
          <TabBar value={side} onChange={setSide} tabs={[
            { id: 'features', label: t('Features'), count: c.features.length },
            { id: 'actions', label: t('Actions and spells'), count: actions.length + 1 },
            { id: 'story', label: t('Story') },
          ]} />
          <div className="cs-scroll">
            {side === 'features' && (
              <ul className="cs-features">
                {c.features.length === 0 && <li className="muted">{t('None yet.')}</li>}
                {c.features.map((f) => {
                  const text = featureText(f, lang, t);
                  const cut = text.indexOf(': ');
                  return <li key={f}>{cut > 0 ? <><b>{text.slice(0, cut)}</b><span><Rich text={text.slice(cut + 2)} /></span></> : <span><Rich text={text} /></span>}</li>;
                })}
              </ul>
            )}
            {side === 'actions' && (
              <ul className="cs-actions">
                <li>
                  <span className="act-icon"><Icon name="sword" size={20} /></span>
                  <div><b>{t(attack.name)}</b><span><Rich text={`${signed(attack.bonus)} ${t('To hit').toLowerCase()} · ${dice(attack.damage, lang)} ${t(`${attack.type} damage`)}`} /></span></div>
                </li>
                {actions.map((a) => (
                  <li key={a.id}>
                    <span className="act-icon">{a.icon}</span>
                    <div>
                      <b>{t(a.name)}{a.cost > 0 && <span className="cost" title={t('Mana (spell points)')}>{a.cost}</span>}{a.oncePerRest && <span className={c.spent.includes(a.id) ? 'use spent' : 'use'}>{c.spent.includes(a.id) ? t('Used') : t('Ready')}</span>}</b>
                      <span><Rich text={t(a.description)} /></span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {side === 'story' && (
              <div className="cs-story">
                {c.appearance && <><h4>{t('Appearance')}</h4><p>{c.appearance}</p></>}
                {c.backstory && <><h4>{t('Backstory')}</h4><p>{c.backstory}</p></>}
                {!c.appearance && !c.backstory && <p className="muted">{t('Nothing is written about this hero yet.')}</p>}
                <h4>{t('Equipment')}</h4>
                <ul className="cs-gear">
                  {worn.length === 0 && <li className="muted">{t('Nothing equipped.')}</li>}
                  {worn.map((s) => { const d = itemDef(state.items, c.equipment[s]!.defId); return <li key={s}><small>{t(SLOT_LABELS[s])}</small><span className={d?.rarity}><ItemIcon def={d} /> {t(d?.name ?? '')}</span></li>; })}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>
    </Window>
  );
}
