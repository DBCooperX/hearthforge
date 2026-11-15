// Level-up choices: a feat (or ability score increase) or a new spell, explained the same
// way as in the character creator, with a preview of what the choice changes.
import { useMemo, useState } from 'react';
import { ABILITIES, SKILLS } from '../../../shared/content';
import { applyFeat, armorClass, castingAbility, classSpellList, spellOptions, weaponAttack, type Sheet } from '../../../shared/build';
import { recommendFeat } from '../../../shared/recommend';
import { ABILITY_HELP, CLASS_GUIDE, FEATS, OPTION_CARDS, SKILL_HELP, STYLES, loc, type Option } from '../../../shared/rules';
import { EPIC_BOON_LEVEL, GROUPS, optionsFor, saveProfs } from '../../../shared/classes';
import { SLOT_IDS, abilityMod, type Character, type FeatId, type FeatPick, type ItemDef } from '../../../shared/types';
import { ABILITY_NAMES } from '../../../shared/content';
import { itemDef } from '../../../shared/items';
import { artOfCharacter, heroUrl } from '../game/heroArt';
import { useLang, useT } from '../i18n';
import { CloseButton } from '../ui/Window';
import type { Connection } from '../net';
import { FeatPicker, OptionDetail, PickRow, Preview, Rich, Section, SpellDetail, featProblem, type Focus } from './Guide';
import { AbilityGlyph, OptionGlyph, SkillGlyph } from '../ui/Glyph';

/** A character in play, in the shape the stat preview understands. */
export function sheetOf(c: Character, items?: Record<string, ItemDef>): Sheet {
  const worn = Object.fromEntries(SLOT_IDS.map((s) => [s, c.equipment[s]?.defId])) as Sheet['equipment'];
  const defs = Object.fromEntries(SLOT_IDS.map((s) => [s, c.equipment[s] ? itemDef(items, c.equipment[s]!.defId) : null]));
  const atk = weaponAttack(c, defs.mainHand);
  const cast = castingAbility(c);
  const hasSpells = c.abilityIds.some((id) => ABILITIES[id]?.spellLevel !== undefined);
  return {
    classId: c.classId, level: c.level, abilities: c.abilities, maxHp: c.maxHp, hp: c.hp, maxMana: c.maxMana, mana: c.mana,
    skills: c.skills, abilityIds: c.abilityIds, feats: c.feats, features: c.features, profBonus: c.profBonus,
    ac: armorClass(c, defs), speed: c.speed,
    initiative: abilityMod(c.abilities.dex) + (c.feats.includes('alert') ? c.profBonus : 0),
    expertise: c.expertise, saves: saveProfs(c), resist: c.resist, equipment: worn, bag: [], gold: 0,
    attack: { name: atk.name, bonus: atk.bonus, damage: atk.damage, type: atk.type },
    spell: hasSpells ? { ability: cast, attack: abilityMod(c.abilities[cast]) + c.profBonus, dc: 8 + c.profBonus + abilityMod(c.abilities[cast]) } : null,
  };
}

interface Props { character: Character; items?: Record<string, ItemDef>; conn: Connection; onClose: () => void }

export function LevelUp({ character: c, items, conn, onClose }: Props) {
  const t = useT();
  const { lang } = useLang();
  const choice = c.pending[0];
  const [feat, setFeat] = useState<FeatPick | undefined>();
  const [spell, setSpell] = useState<string | undefined>();
  const [filter, setFilter] = useState('');
  const [opts, setOpts] = useState<string[]>([]);
  const [focus, setFocus] = useState<Focus>(null);
  const [hover, setHover] = useState<{ feat?: FeatPick; spell?: string } | null>(null);

  const now = useMemo(() => sheetOf(c, items), [c, items]);
  const after = (pick: { feat?: FeatPick; spell?: string } | null) => {
    if (!pick) return null;
    const copy = structuredClone(c);
    if (pick.feat) applyFeat(copy, pick.feat, false);
    if (pick.spell) copy.abilityIds.unshift(pick.spell);
    return sheetOf(copy, items);
  };
  const next = useMemo(() => after(hover ?? (feat ? { feat } : spell ? { spell } : null)), [hover, feat, spell, c]);
  if (!choice) return null;

  const list = classSpellList(c.classId);
  const spells = choice.kind === 'spell' && list ? spellOptions(c, list, choice.pool) : [];
  const feats = (Object.keys(FEATS) as FeatId[]).filter((f) => (f === 'asi' || !c.feats.includes(f)) && (!FEATS[f].epic || choice.level >= EPIC_BOON_LEVEL));
  const recommended = recommendFeat({ ...c, level: choice.level }, false);
  // Class options: styles and options have cards, expertise and bonus proficiencies pick skills.
  const group = choice.kind === 'option' ? choice.group : '';
  const bySkill = group === 'expertise' || group === 'lore';
  const cards: Option[] = choice.kind !== 'option' || bySkill ? []
    : group === 'style' ? Object.values(STYLES).filter((o) => !c.feats.includes(`style_${o.id}`))
    : optionsFor(c, group).map((o) => OPTION_CARDS[o.id]);
  const skillPicks = choice.kind !== 'option' ? []
    : group === 'expertise' ? c.skills.filter((x) => !c.expertise.includes(x) && (!choice.from || choice.from.includes(x)))
    : group === 'lore' ? Object.keys(SKILLS).filter((x) => !c.skills.includes(x)) : [];
  const want = choice.kind === 'option' ? choice.count : 1;
  const toggle = (x: string) => setOpts((cur) => (cur.includes(x) ? cur.filter((y) => y !== x) : cur.length >= want ? [...cur.slice(1), x] : [...cur, x]));
  const problem = choice.kind === 'feat' ? featProblem(c, feat, false)
    : choice.kind === 'option' ? (opts.length === want ? null : { en: `Choose ${want}`, de: `Wähle ${want}` })
    : spell ? null : { en: 'Choose a spell', de: 'Wähle einen Zauber' };
  const confirm = () => {
    if (problem) return;
    conn.send({ t: 'choose', characterId: c.id, choiceId: choice.id, pick: choice.kind === 'feat' ? { feat: feat! } : choice.kind === 'option' ? { options: opts } : { spell: spell! } });
    setFeat(undefined); setSpell(undefined); setOpts([]); setFocus(null); setHover(null);
  };
  const guide = CLASS_GUIDE[c.classId];

  let detail;
  if (focus?.kind === 'option') detail = <OptionDetail option={focus.option} kicker={focus.kicker} />;
  else if (focus?.kind === 'skill') {
    detail = (
      <article className="detail">
        <header><span className="detail-icon"><SkillGlyph skill={focus.id} /></span><div><small className="kicker">{t('Skill')} · {t(ABILITY_NAMES[SKILLS[focus.id]])}</small><h2 className="cap">{t(focus.id)}</h2><p className="summary">{loc(SKILL_HELP[focus.id], lang)}</p></div></header>
      </article>
    );
  } else if (focus?.kind === 'spell') detail = <SpellDetail id={focus.id} sheet={next ?? now} />;
  else if (focus?.kind === 'ability') {
    const rank = guide.priority.indexOf(focus.key);
    detail = (
      <article className="detail">
        <header><div><small className="kicker">{t('Ability')}</small><h2>{t(ABILITY_NAMES[focus.key])}</h2><p className="summary">{loc(ABILITY_HELP[focus.key].text, lang)}</p></div></header>
        <h4>{t('What it is used for')}</h4>
        <p><Rich text={loc(ABILITY_HELP[focus.key].uses, lang)} /></p>
        <h4>{t('For a {class}', { class: t(guide.name) })}</h4>
        <p className="goodfor">{rank === 0 ? t('Your most important ability. Make it as high as you can.') : rank === 1 ? t('Your second most important ability.') : rank >= 4 ? t('Least important for your class. A good place for your lowest score.') : t('Useful, but not a priority.')}</p>
      </article>
    );
  } else {
    detail = (
      <article className="detail intro">
        <header><div><small className="kicker">{t('Level {n}', { n: choice.level })}</small><h2>{choice.kind === 'feat' ? t('A feat, or stronger abilities') : choice.kind === 'option' ? t(GROUPS[group]?.name ?? group) : choice.pool === 'cantrip' ? t('A new cantrip') : t('A new spell')}</h2></div></header>
        <p><Rich text={choice.kind === 'feat'
          ? t('At this level you either raise your ability scores or learn a feat. Raising your main ability is the strongest choice for most heroes; a feat makes you more versatile. Hover an option to see what it changes.')
          : choice.kind === 'option' ? `${loc(GROUPS[group]?.text ?? { en: '', de: '' }, lang)} ${t('Choose {n}.', { n: want })}`
          : t('Your studies pay off: choose one spell to add to those you know. Hover a spell to see its numbers for your hero.')} /></p>
        {c.pending.length > 1 && <p className="muted small">{t('{n} more choices follow.', { n: c.pending.length - 1 })}</p>}
      </article>
    );
  }

  return (
    <div className="overlay creator-overlay">
      <div className="panel creator levelup">
        <span className="win-corner tl" /><span className="win-corner tr" /><span className="win-corner bl" /><span className="win-corner br" />
        <header className="creator-head">
          <img className="pixel" src={heroUrl(artOfCharacter(c, items))} alt="" />
          <h1>{t('{name} reaches level {level}', { name: c.name, level: choice.level })}</h1>
          <span className="spacer" />
          <CloseButton onClose={onClose} label={t('Decide later')} />
        </header>
        <div className="creator-body">
          <div className="creator-left">
            {choice.kind === 'feat' ? (
              <Section title={t('Choose one')}>
                <FeatPicker build={c} options={feats} recommended={recommended.id} value={feat} focus={focus}
                  onChange={(p) => { setFeat(p); setHover(null); }}
                  onFocus={(f, p) => { setFocus(f); setHover(p ? { feat: p } : null); }} />
              </Section>
            ) : choice.kind === 'option' ? (
              <Section title={t(GROUPS[group]?.name ?? group)} hint={`${opts.length}/${want}`} done={opts.length === want}>
                {cards.map((o) => (
                  <PickRow key={o.id} mark={want > 1 ? 'check' : 'radio'} icon={<OptionGlyph option={o} />} title={t(o.name)} sub={loc(o.summary, lang)} selected={opts.includes(o.id)}
                    focused={focus?.kind === 'option' && focus.option === o}
                    onClick={() => toggle(o.id)} onFocus={() => setFocus({ kind: 'option', option: o, kicker: t(GROUPS[group]?.name ?? group) })} />
                ))}
                {skillPicks.map((x) => (
                  <PickRow key={x} compact mark="check" icon={<SkillGlyph skill={x} />} title={t(x)} sub={t(ABILITY_NAMES[SKILLS[x]])} selected={opts.includes(x)}
                    focused={focus?.kind === 'skill' && focus.id === x} onClick={() => toggle(x)} onFocus={() => setFocus({ kind: 'skill', id: x })} />
                ))}
              </Section>
            ) : (
              <>
                {spells.length > 12 && (
                  <input className="spell-filter" type="search" value={filter} placeholder={t('Search spells')} onChange={(e) => setFilter(e.target.value)} />
                )}
                {[...new Set(spells.map((s) => ABILITIES[s].spellLevel ?? 0))].map((l) => {
                  const shown = spells.filter((s) => (ABILITIES[s].spellLevel ?? 0) === l && (!filter || t(ABILITIES[s].name).toLowerCase().includes(filter.toLowerCase())));
                  if (!shown.length) return null;
                  return (
                    <Section key={l} title={l === 0 ? t('Cantrips') : t('Spells of level {n}', { n: l })}>
                      {shown.map((s) => (
                        <PickRow key={s} icon={<AbilityGlyph def={ABILITIES[s]} />} title={t(ABILITIES[s].name)} sub={(ABILITIES[s].kind === 'story' ? `${t('Told by the Dungeon Master.')} ` : '') + t(ABILITIES[s].description)} selected={spell === s}
                          focused={focus?.kind === 'spell' && focus.id === s}
                          onClick={() => { setSpell(s); setHover(null); }} onFocus={() => { setFocus({ kind: 'spell', id: s }); setHover(spell === s ? null : { spell: s }); }} onLeave={() => setHover(null)} />
                      ))}
                    </Section>
                  );
                })}
              </>
            )}
          </div>
          <div className="creator-mid">{detail}</div>
          <Preview now={now} next={next} title={c.name} />
        </div>
        <footer className="creator-foot">
          <button type="button" onClick={onClose}>{t('Decide later')}</button>
          <span className="spacer" />
          {problem && (feat || spell || opts.length > 0) && <span className="muted small">{loc(problem, lang)}</span>}
          <button type="button" className="primary" disabled={!!problem} onClick={confirm}>{t('Confirm choice')}</button>
        </footer>
      </div>
    </div>
  );
}
