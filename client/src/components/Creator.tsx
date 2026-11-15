// The character creator: eight steps, each with explained options, recommended picks for
// the chosen class and a live preview of the hero. The server checks and builds the result
// with the same shared code the preview uses.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ABILITIES, ABILITY_NAMES, ITEMS, SKILLS } from '../../../shared/content';
import {
  POINT_BUDGET, POINT_COST, STANDARD_ARRAY, applyFeat, boostMap, buildSheet, checkSpec, classSpellList, pointsSpent, spellOptions, startBuild,
  type Build, type Draft, type StepId,
} from '../../../shared/build';
import { recommend, recommendFeat, recommendedArray, recommendedBoosts } from '../../../shared/recommend';
import {
  ABILITY_HELP, ABILITY_KEYS, BACKGROUNDS, CLASSES, CLASS_GUIDE, FEATS, KITS, ORIGIN_FEATS, SKILL_HELP, SPECIES, STYLES, kitsFor, loc,
} from '../../../shared/rules';
import { GENDERS, abilityMod, type Abilities, type AbilityKey, type CharacterSpec, type ClassId, type GameState } from '../../../shared/types';
import { artOfDraft, heroUrl } from '../game/heroArt';
import { BEARDS, HAIR_COLORS, HAIR_STYLES, LOOK_NAMES, OUTFITS, SKINS, SPECIES_SKINS, heroLook } from '../../../shared/heroLook';
import { LangSwitch, useLang, useT } from '../i18n';
import { playerId, type Connection } from '../net';
import { Effects, FeatPicker, OptionDetail, PickRow, Preview, Rich, Section, SpellDetail, dice, itemLine, signed, type Focus } from './Guide';

const STEPS: StepId[] = ['class', 'species', 'background', 'abilities', 'skills', 'talents', 'equipment', 'identity'];

/** Which draft fields a step decides. "Recommended" re-picks exactly these. */
const STEP_FIELDS: Record<StepId, (keyof CharacterSpec)[]> = {
  class: [],
  species: ['speciesId', 'speciesSkill', 'originFeat'],
  background: ['backgroundId', 'boosts', 'backgroundFeat', 'skills', 'expertise', 'speciesSkill'],
  abilities: ['method', 'base', 'boosts'],
  skills: ['skills', 'speciesSkill', 'expertise'],
  talents: ['fightingStyle', 'spells', 'backgroundFeat', 'originFeat'],
  equipment: ['kit'],
  identity: [],
};
const ALL_FIELDS = [...new Set(Object.values(STEP_FIELDS).flat())];

/** Drop picks that an earlier change made impossible, so the draft never carries stale choices. */
function tidy(d: Draft): Draft {
  const out = { ...d };
  const cls = d.classId ? CLASSES[d.classId] : undefined;
  const sp = d.speciesId ? SPECIES[d.speciesId] : undefined;
  const bg = d.backgroundId ? BACKGROUNDS[d.backgroundId] : undefined;
  out.skills = (d.skills ?? []).filter((s) => cls?.skillList.includes(s) && !bg?.skills.includes(s)).slice(0, cls?.skillCount ?? 0);
  const granted = [...(bg?.skills ?? []), ...out.skills];
  if (!sp?.skillChoice || !d.speciesSkill || !sp.skillChoice.includes(d.speciesSkill) || granted.includes(d.speciesSkill)) delete out.speciesSkill;
  else granted.push(d.speciesSkill);
  out.expertise = cls?.id === 'rogue' ? (d.expertise ?? []).filter((s) => granted.includes(s)) : undefined;
  if (cls?.id !== 'fighter') delete out.fightingStyle;
  if (!sp?.originFeat) delete out.originFeat;
  // A Skilled talent may not repeat a skill the hero has since gained elsewhere.
  const fresh = (skills: string[] | undefined) => {
    const kept = (skills ?? []).filter((s) => !granted.includes(s));
    granted.push(...kept);
    return kept;
  };
  if (bg?.feat === 'skilled' && out.backgroundFeat?.skills) out.backgroundFeat = { ...out.backgroundFeat, skills: fresh(out.backgroundFeat.skills) };
  if (out.originFeat?.id === 'skilled' && out.originFeat.skills) out.originFeat = { ...out.originFeat, skills: fresh(out.originFeat.skills) };
  out.boosts = (d.boosts ?? []).filter((k) => bg?.abilities.includes(k));
  // Scores and the background bonus start out the way that suits the class; the Abilities step changes them.
  if (cls && !out.base && out.method !== 'roll') out.base = recommendedArray(cls.id);
  if (cls && bg && out.base && out.boosts.length !== 3) out.boosts = recommendedBoosts(cls.id, out.base, bg.abilities);
  if (out.kit && KITS[out.kit]?.classId !== cls?.id) delete out.kit;
  // The look is always complete and fits the species, so the portrait never jumps while a name is typed.
  if (cls) out.look = heroLook({ speciesId: sp?.id ?? 'human', gender: out.gender ?? 'neutral', classId: cls.id, name: '', look: d.look });
  const list = cls ? classSpellList(cls.id) : null;
  if (cls && list) {
    const b = startBuild(out, cls.id);
    const ok = [...spellOptions(b, list, 'cantrip'), ...spellOptions(b, list, 'spell', 1)];
    out.spells = (d.spells ?? []).filter((s) => ok.includes(s));
  } else out.spells = [];
  return out;
}

/** The hero as built so far, up to the point where a feat is applied. */
function buildUntil(d: Draft, stage: 'background' | 'origin'): Build | null {
  if (!d.classId) return null;
  const b = startBuild(d, d.classId);
  b.abilityIds.unshift(...(d.spells ?? []));
  const bg = d.backgroundId ? BACKGROUNDS[d.backgroundId] : undefined;
  if (stage === 'origin' && bg) applyFeat(b, { id: bg.feat, ...d.backgroundFeat }, true);
  return b;
}

interface Props { state: GameState; conn: Connection; onClose: () => void; /** Start from these choices, for example a premade hero. */ initial?: Draft }

export function Creator({ state, conn, onClose, initial }: Props) {
  const t = useT();
  const { lang } = useLang();
  const [d, setD] = useState<Draft>(() => tidy({ name: '', gender: 'neutral', method: 'array', boosts: [], skills: [], spells: [], appearance: '', backstory: '', ...initial }));
  const [step, setStep] = useState<StepId>('class');
  const [focus, setFocus] = useState<Focus>(null);
  const [hover, setHover] = useState<Draft | null>(null);

  const rolled = state.rolled[playerId];
  const cls = d.classId ? CLASSES[d.classId] : undefined;
  const guide = d.classId ? CLASS_GUIDE[d.classId] : undefined;
  const sp = d.speciesId ? SPECIES[d.speciesId] : undefined;
  const bg = d.backgroundId ? BACKGROUNDS[d.backgroundId] : undefined;
  const now = useMemo(() => buildSheet(d), [d]);
  const next = useMemo(() => (hover ? buildSheet(tidy(hover)) : null), [hover]);
  const problems = useMemo(() => checkSpec(d, rolled), [d, rolled]);
  /** What "recommended" would pick, given everything chosen so far. */
  const rec = useMemo(() => (d.classId ? recommend({ ...d, classId: d.classId }, ['classId', 'speciesId', 'backgroundId', 'method', 'base', 'gender']) : null), [d.classId, d.speciesId, d.backgroundId, d.method, d.base]);

  const update = (patch: Draft) => setD((cur) => tidy({ ...cur, ...patch }));
  const go = (s: StepId) => { setStep(s); setFocus(null); setHover(null); };
  const stepIndex = STEPS.indexOf(step);

  // Freshly rolled scores are laid out by the class's priorities; the player can swap them afterwards.
  useEffect(() => {
    if (d.method !== 'roll' || !rolled) return;
    const sorted = [...rolled].sort((a, b) => b - a);
    const order = guide?.priority ?? ABILITY_KEYS;
    const base = {} as Abilities;
    order.forEach((k, i) => { base[k] = sorted[i]; });
    update({ base });
  }, [rolled?.join(), d.method]);

  const labels: Record<StepId, string> = {
    class: t('Class'), species: t('Species'), background: t('Background'), abilities: t('Abilities'),
    skills: t('Skills'), talents: t('Talents'), equipment: t('Equipment'), identity: t('Identity'),
  };
  const intro: Record<StepId, [string, string]> = {
    class: [t('What do you do?'), t('Your class is the biggest decision: it sets your hit points, what you can wear and wield, and what you do every turn of a fight. Hover an option to read about it. Words with a dotted underline explain themselves when you hover them.')],
    species: [t('Who are your people?'), t('Your species gives you a few inborn traits. Traits marked with a cog are applied by the game itself; traits marked with a book are handed to the Dungeon Master, who plays them out in the story.')],
    background: [t('What did you do before?'), t('Your background is your life before adventuring. It raises three ability scores, gives you two skills and an origin feat, and adds a few belongings.')],
    abilities: [t('How strong, quick and clever are you?'), t('Six ability scores describe your hero. What counts in play is the modifier each score gives. Put your best scores where your class needs them: the star marks them.')],
    skills: [t('What are you good at?'), t('Outside combat the Dungeon Master asks for skill checks: a d20 plus the ability modifier, plus your proficiency bonus if you are proficient. Pick the things you want your hero to be reliable at.')],
    talents: [t('What makes you special?'), t('Fighting styles, spells and feats. Each choice shows what it changes on the right before you commit.')],
    equipment: [t('What do you carry?'), t('Pick a starting kit for your class. You will find and buy better gear on your adventures, and you can swap weapons in the inventory at any time.')],
    identity: [t('Who are you?'), t('A name, how the Dungeon Master should refer to you, and as much or as little description as you like. The Dungeon Master reads the appearance and backstory and weaves them into the story.')],
  };

  const hoverPatch = (patch: Draft | null) => setHover(patch ? { ...d, ...patch } : null);
  const optionRow = (o: (typeof SPECIES)[keyof typeof SPECIES] | (typeof BACKGROUNDS)[keyof typeof BACKGROUNDS] | (typeof KITS)[string] | (typeof STYLES)[string] | (typeof CLASS_GUIDE)[ClassId], patch: Draft, selected: boolean, recommended: boolean, kicker: string, sub?: string) => (
    <PickRow key={o.id} icon={o.icon} title={t(o.name)} sub={sub ?? loc(o.summary, lang)} selected={selected} recommended={recommended}
      focused={focus?.kind === 'option' && focus.option === o}
      onClick={() => { update(patch); setFocus({ kind: 'option', option: o, kicker }); setHover(null); }}
      onFocus={() => { setFocus({ kind: 'option', option: o, kicker }); hoverPatch(selected ? null : patch); }}
      onLeave={() => setHover(null)} />
  );

  // ------------------------------------------------------------- the steps

  let left: ReactNode = null;

  if (step === 'class') {
    left = (
      <Section title={t('Choose a class')}>
        {(Object.keys(CLASS_GUIDE) as ClassId[]).map((id) => optionRow(CLASS_GUIDE[id], { classId: id, ...(d.method === 'array' && d.classId !== id ? { base: recommendedArray(id), boosts: [] } : {}) }, d.classId === id, false, t('Class'), loc(CLASS_GUIDE[id].role, lang)))}
        <p className="muted small">{t('New to the game? The Fighter is the easiest to play, the Wizard the most demanding.')}</p>
      </Section>
    );
  }

  if (step === 'species') {
    left = (
      <Section title={t('Choose a species')}>
        {Object.values(SPECIES).map((o) => optionRow(o, { speciesId: o.id }, d.speciesId === o.id, !!d.classId && o.recommendedFor.includes(d.classId) && o.recommendedFor.length < 4, t('Species')))}
      </Section>
    );
  }

  if (step === 'background') {
    left = (
      <Section title={t('Choose a background')}>
        {Object.values(BACKGROUNDS).map((o) => optionRow(o, { backgroundId: o.id, boosts: d.classId && d.base ? recommendedBoosts(d.classId, d.base, o.abilities) : [], backgroundFeat: undefined }, d.backgroundId === o.id, !!d.classId && o.recommendedFor.includes(d.classId), t('Background')))}
      </Section>
    );
  }

  if (step === 'abilities') {
    const base = d.base;
    const boosts = boostMap(d.boosts);
    const pool = d.method === 'roll' ? rolled : STANDARD_ARRAY;
    const spent = base ? pointsSpent(base) : 0;
    const setMethod = (method: CharacterSpec['method']) => {
      if (method === 'roll') return update({ method, base: undefined });
      update({ method, base: d.classId ? recommendedArray(d.classId) : { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } });
    };
    const assign = (k: AbilityKey, v: number) => {
      if (!base) return;
      const other = ABILITY_KEYS.find((j) => j !== k && base[j] === v);
      update({ base: { ...base, [k]: v, ...(other ? { [other]: base[k] } : {}) } });
    };
    const step1 = (k: AbilityKey, delta: number) => base && update({ base: { ...base, [k]: base[k] + delta } });
    const plusTwo = d.boosts?.find((k, i, a) => a.indexOf(k) !== i);
    const plusOne = d.boosts?.find((k) => k !== plusTwo);
    const spread = (d.boosts?.length ?? 0) === 3 && !plusTwo;
    left = (
      <>
        <Section title={t('Method')}>
          <div className="segmented">
            <button type="button" className={d.method === 'array' ? 'on' : ''} onClick={() => setMethod('array')} title={t('Six fixed values: 15, 14, 13, 12, 10 and 8. Balanced and quick.')}>{t('Standard array')}</button>
            <button type="button" className={d.method === 'pointbuy' ? 'on' : ''} onClick={() => setMethod('pointbuy')} title={t('Buy scores from 8 to 15 with 27 points. High scores cost more.')}>{t('Point buy')}</button>
            <button type="button" className={d.method === 'roll' ? 'on' : ''} onClick={() => setMethod('roll')} title={t('The server rolls 4d6 and drops the lowest die, six times. Could be great, could be terrible.')}>{t('Roll')}</button>
          </div>
          {d.method === 'array' && <p className="muted small">{t('Assign each of 15, 14, 13, 12, 10 and 8 to one ability. Choosing a value that is already used swaps the two.')}</p>}
          {d.method === 'pointbuy' && <p className="muted small">{t('Points left: {n} of {max}. Scores from 8 to 15; 14 and 15 cost two points each step.', { n: POINT_BUDGET - (Number.isFinite(spent) ? spent : 0), max: POINT_BUDGET })}</p>}
          {d.method === 'roll' && (
            <p className="muted small">
              <button type="button" onClick={() => conn.send({ t: 'roll_abilities' })}>🎲 {rolled ? t('Roll again') : t('Roll 4d6, drop the lowest')}</button>{' '}
              {rolled ? t('You rolled {scores}. The dice are rolled by the server.', { scores: [...rolled].sort((a, b) => b - a).join(', ') }) : t('The dice are rolled by the server.')}
            </p>
          )}
        </Section>
        {base && (
          <Section title={t('Ability scores')}>
            <table className="scores">
              <thead><tr><th /><th>{t('Base')}</th><th title={t('From your background')}>{t('Bonus')}</th><th>{t('Total')}</th><th>{t('Modifier')}</th></tr></thead>
              <tbody>
                {ABILITY_KEYS.map((k) => {
                  const rank = guide ? guide.priority.indexOf(k) : -1;
                  const total = base[k] + (boosts[k] ?? 0);
                  return (
                    <tr key={k} className={focus?.kind === 'ability' && focus.key === k ? 'focused' : ''} onMouseEnter={() => setFocus({ kind: 'ability', key: k })}>
                      <th>{t(ABILITY_NAMES[k])}{rank === 0 && <span className="star" title={t('The most important ability for your class')}> ★</span>}{rank === 1 && <span className="star dim" title={t('The second most important ability for your class')}> ☆</span>}</th>
                      <td>
                        {d.method === 'pointbuy' ? (
                          <span className="stepper">
                            <button type="button" disabled={base[k] <= 8} onClick={() => step1(k, -1)} aria-label={t('Lower')}>−</button>
                            <b>{base[k]}</b>
                            <button type="button" disabled={base[k] >= 15 || spent - POINT_COST[base[k]] + POINT_COST[base[k] + 1] > POINT_BUDGET} onClick={() => step1(k, 1)} aria-label={t('Raise')}>+</button>
                          </span>
                        ) : (
                          <select value={base[k]} onChange={(e) => assign(k, Number(e.target.value))}>
                            {[...new Set(pool ?? [])].sort((a, b) => b - a).map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="boost">{boosts[k] ? `+${boosts[k]}` : ''}</td>
                      <td className="total">{total}</td>
                      <td className="mod">{signed(abilityMod(total))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>
        )}
        {bg ? (
          <Section title={t('Background: {name}', { name: t(bg.name) })} hint={d.boosts?.length === 3 ? t('done') : t('choose')} done={d.boosts?.length === 3}>
            <div className="segmented">
              <button type="button" className={!spread ? 'on' : ''} onClick={() => update({ boosts: d.classId && base ? recommendedBoosts(d.classId, base, bg.abilities) : [bg.abilities[0], bg.abilities[0], bg.abilities[1]] })}>{t('+2 and +1')}</button>
              <button type="button" className={spread ? 'on' : ''} onClick={() => update({ boosts: [...bg.abilities] })}>{t('+1 to all three')}</button>
            </div>
            {!spread && (
              <div className="boost-pick">
                <label>+2 <select value={plusTwo ?? ''} onChange={(e) => { const a = e.target.value as AbilityKey; update({ boosts: [a, a, plusOne && plusOne !== a ? plusOne : bg.abilities.find((x) => x !== a)!] }); }}>
                  {!plusTwo && <option value="">…</option>}
                  {bg.abilities.map((k) => <option key={k} value={k}>{t(ABILITY_NAMES[k])}</option>)}
                </select></label>
                <label>+1 <select value={plusOne ?? ''} onChange={(e) => { const b = e.target.value as AbilityKey; const a = plusTwo && plusTwo !== b ? plusTwo : bg.abilities.find((x) => x !== b)!; update({ boosts: [a, a, b] }); }}>
                  {!plusOne && <option value="">…</option>}
                  {bg.abilities.filter((k) => k !== plusTwo).map((k) => <option key={k} value={k}>{t(ABILITY_NAMES[k])}</option>)}
                </select></label>
              </div>
            )}
            <p className="muted small">{t('An odd score rounds down: 15 and 14 both give +2. Use the background bonus to reach the next even number.')}</p>
          </Section>
        ) : <p className="muted small">{t('Choose a background to get its ability score increases.')}</p>}
      </>
    );
  }

  if (step === 'skills' && cls) {
    const fromBg = bg?.skills ?? [];
    const picks = d.skills ?? [];
    const granted = [...fromBg, ...picks, ...(d.speciesSkill ? [d.speciesSkill] : [])];
    const recSkills = rec?.skills ?? [];
    const toggle = (list: string[], s: string, max: number) => (list.includes(s) ? list.filter((x) => x !== s) : list.length >= max ? [...list.slice(1), s] : [...list, s]);
    const skillRow = (s: string, o: { selected: boolean; patch?: Draft; locked?: string; recommended?: boolean; mark?: 'check' | 'radio'; key?: string }) => (
      <PickRow key={o.key ?? s} mark={o.mark ?? 'check'} title={t(s)} sub={`${t(SKILLS[s].toUpperCase())} · ${loc(SKILL_HELP[s], lang)}`} selected={o.selected} locked={o.locked} recommended={o.recommended}
        focused={focus?.kind === 'skill' && focus.id === s}
        onClick={() => o.patch && update(o.patch)}
        onFocus={() => { setFocus({ kind: 'skill', id: s }); hoverPatch(o.selected || !o.patch ? null : o.patch); }}
        onLeave={() => setHover(null)} />
    );
    left = (
      <>
        {fromBg.length > 0 && <Section title={t('From your background')}>{fromBg.map((s) => skillRow(s, { selected: true, locked: t(bg!.name) }))}</Section>}
        <Section title={t('Class skills')} hint={`${picks.length}/${cls.skillCount}`} done={picks.length === cls.skillCount}>
          {cls.skillList.filter((s) => !fromBg.includes(s)).map((s) => skillRow(s, { selected: picks.includes(s), patch: { skills: toggle(picks, s, cls.skillCount) }, recommended: recSkills.includes(s) }))}
        </Section>
        {sp?.skillChoice && (
          <Section title={t('From your species: {name}', { name: t(sp.name) })} hint={d.speciesSkill ? t('done') : t('choose one')} done={!!d.speciesSkill}>
            {sp.skillChoice.filter((s) => !fromBg.includes(s) && !picks.includes(s)).map((s) => skillRow(s, { key: `sp-${s}`, mark: 'radio', selected: d.speciesSkill === s, patch: { speciesSkill: s }, recommended: rec?.speciesSkill === s }))}
          </Section>
        )}
        {cls.id === 'rogue' && (
          <Section title={t('Expertise')} hint={`${d.expertise?.length ?? 0}/2`} done={d.expertise?.length === 2}>
            <p className="muted small"><Rich text={t('Choose two of your skills. Your proficiency bonus counts twice for them.')} /></p>
            {granted.map((s) => skillRow(s, { key: `ex-${s}`, selected: !!d.expertise?.includes(s), patch: { expertise: toggle(d.expertise ?? [], s, 2) }, recommended: rec?.expertise?.includes(s) }))}
          </Section>
        )}
      </>
    );
  }

  if (step === 'talents' && cls) {
    const list = classSpellList(cls.id);
    const start = startBuild(d, cls.id);
    const picks = d.spells ?? [];
    const spellSection = (title: string, pool: string[], max: number) => {
      if (!pool.length || !max) return null;
      const mine = picks.filter((s) => pool.includes(s));
      const want = Math.min(max, pool.length);
      return (
        <Section title={title} hint={`${mine.length}/${want}`} done={mine.length === want}>
          {pool.map((s) => {
            const on = mine.includes(s);
            const patch = { spells: [...picks.filter((x) => !pool.includes(x)), ...(on ? mine.filter((x) => x !== s) : mine.length >= want ? [...mine.slice(1), s] : [...mine, s])] };
            return (
              <PickRow key={s} mark="check" icon={ABILITIES[s].icon} title={t(ABILITIES[s].name)} sub={t(ABILITIES[s].description)} selected={on} recommended={rec?.spells.includes(s)}
                focused={focus?.kind === 'spell' && focus.id === s}
                onClick={() => update(patch)} onFocus={() => { setFocus({ kind: 'spell', id: s }); hoverPatch(on ? null : patch); }} onLeave={() => setHover(null)} />
            );
          })}
        </Section>
      );
    };
    const known = start.abilityIds.filter((id) => ABILITIES[id]?.spellLevel !== undefined || sp?.grants?.includes(id));
    const beforeBg = buildUntil(d, 'background');
    const beforeOrigin = buildUntil(d, 'origin');
    const bgFeat = bg ? FEATS[bg.feat] : undefined;
    left = (
      <>
        {cls.id === 'fighter' && (
          <Section title={t('Fighting style')} hint={d.fightingStyle ? t('done') : t('choose one')} done={!!d.fightingStyle}>
            {Object.values(STYLES).map((o) => optionRow(o, { fightingStyle: o.id }, d.fightingStyle === o.id, guide?.recStyle === o.id, t('Fighting style')))}
          </Section>
        )}
        {known.length > 0 && (
          <Section title={t('You already know')}>
            {known.map((s) => (
              <PickRow key={s} icon={ABILITIES[s].icon} title={t(ABILITIES[s].name)} sub={t(ABILITIES[s].description)} selected locked={sp?.grants?.includes(s) ? t(sp.name) : t(cls.name)}
                focused={focus?.kind === 'spell' && focus.id === s} onFocus={() => setFocus({ kind: 'spell', id: s })} />
            ))}
          </Section>
        )}
        {list && spellSection(t('Cantrips'), spellOptions(start, list, 'cantrip'), cls.cantrips.pick)}
        {list && spellSection(t('1st-level spells'), spellOptions(start, list, 'spell', 1), cls.spellPicks)}
        {bgFeat && beforeBg && (
          <Section title={t('From your background: {name}', { name: t(bgFeat.name) })}>
            <PickRow icon={bgFeat.icon} title={t(bgFeat.name)} sub={loc(bgFeat.summary, lang)} selected locked={t(bg!.name)}
              focused={focus?.kind === 'option' && focus.option === bgFeat} onFocus={() => setFocus({ kind: 'option', option: bgFeat, kicker: t('Feat') })} />
            <FeatPicker build={beforeBg} fixed={bgFeat.id} value={{ id: bgFeat.id, ...d.backgroundFeat }} focus={focus}
              onChange={(p) => update({ backgroundFeat: { skills: p.skills, spells: p.spells } })}
              onFocus={(f, p) => { setFocus(f); hoverPatch(p ? { backgroundFeat: { skills: p.skills, spells: p.spells } } : null); }} />
          </Section>
        )}
        {sp?.originFeat && beforeOrigin && (
          <Section title={t('Extra origin feat ({name})', { name: t(sp.name) })} hint={d.originFeat ? t('done') : t('choose one')} done={!!d.originFeat}>
            <FeatPicker build={beforeOrigin} options={ORIGIN_FEATS.filter((f) => f !== bg?.feat)} recommended={recommendFeat(beforeOrigin, true).id} value={d.originFeat} focus={focus}
              onChange={(p) => update({ originFeat: p })}
              onFocus={(f, p) => { setFocus(f); hoverPatch(p ? { originFeat: p } : null); }} />
          </Section>
        )}
        {!list && cls.id !== 'fighter' && !sp?.originFeat && bgFeat && !bgFeat.spellList && bgFeat.id !== 'skilled' && <p className="muted small">{t('Nothing to choose here for this combination. Your background feat is listed above.')}</p>}
      </>
    );
  }

  if (step === 'equipment' && cls) {
    left = (
      <Section title={t('Starting equipment')} hint={d.kit ? t('done') : t('choose one')} done={!!d.kit}>
        {kitsFor(cls.id).map((o) => optionRow(o, { kit: o.id }, d.kit === o.id, guide?.recKit === o.id, t('Equipment')))}
      </Section>
    );
  }

  if (step === 'identity') {
    const names = sp?.names ?? SPECIES.human.names;
    const look = heroLook({ speciesId: d.speciesId ?? 'human', gender: d.gender ?? 'neutral', classId: d.classId ?? 'fighter', name: '', look: d.look });
    left = (
      <div className="identity">
        <label>
          {t('Name')}
          <span className="row">
            <input value={d.name ?? ''} maxLength={20} onChange={(e) => update({ name: e.target.value })} placeholder={names[0]} />
            <button type="button" onClick={() => update({ name: names[(names.indexOf(d.name ?? '') + 1 + Math.floor(Math.random() * (names.length - 1))) % names.length] })} title={t('Suggest a name that fits your species')}>🎲</button>
          </span>
        </label>
        <label>
          {t('The Dungeon Master refers to your hero as')}
          <span className="segmented">
            {GENDERS.map((g) => (
              <button key={g} type="button" className={d.gender === g ? 'on' : ''} onClick={() => update({ gender: g })}>
                {g === 'female' ? t('she') : g === 'male' ? t('he') : t('neutral')}
              </button>
            ))}
          </span>
          <small className="muted">{t('Neutral avoids gendered words and uses the name instead.')}</small>
        </label>
        <div className="look">
          <img className="pixel look-portrait" src={heroUrl(artOfDraft(d)!)} alt="" />
          <div className="look-rows">
            <Swatches label={t('Skin')} value={look.skin} options={SPECIES_SKINS[d.speciesId ?? 'human']} colors={SKINS} onPick={(skin) => update({ look: { ...look, skin } })} />
            {d.speciesId !== 'dragonborn' && <Choices label={t('Hair')} value={look.hair} options={HAIR_STYLES} onPick={(hair) => update({ look: { ...look, hair } })} />}
            {d.speciesId !== 'dragonborn' && <Swatches label={t('Hair colour')} value={look.hairColor} options={Object.keys(HAIR_COLORS)} colors={HAIR_COLORS} onPick={(hairColor) => update({ look: { ...look, hairColor } })} />}
            {d.speciesId !== 'dragonborn' && <Choices label={t('Beard')} value={look.beard} options={BEARDS} onPick={(beard) => update({ look: { ...look, beard } })} />}
            <Swatches label={t('Colours')} value={look.color} options={Object.keys(OUTFITS)} colors={OUTFITS} onPick={(color) => update({ look: { ...look, color } })} />
          </div>
        </div>
        <label>
          {t('Appearance')}
          <textarea value={d.appearance ?? ''} maxLength={400} rows={3} onChange={(e) => update({ appearance: e.target.value })} placeholder={t('Build, face, hair, clothing, anything people notice first.')} />
        </label>
        <label>
          {t('Backstory')}
          <textarea value={d.backstory ?? ''} maxLength={1200} rows={6} onChange={(e) => update({ backstory: e.target.value })} placeholder={t('Where do you come from, what do you want, who or what did you leave behind? A few sentences are enough.')} />
        </label>
      </div>
    );
  }

  if (!left) left = <p className="muted">{t('Choose a class first.')}</p>;

  // ------------------------------------------------------------- the detail

  let detail: ReactNode;
  if (focus?.kind === 'option') {
    const o = focus.option;
    const g = (Object.values(CLASS_GUIDE) as (typeof CLASS_GUIDE)[ClassId][]).find((x) => x === o);
    const k = Object.values(KITS).find((x) => x === o);
    const b = Object.values(BACKGROUNDS).find((x) => x === o);
    detail = (
      <OptionDetail option={o} kicker={focus.kicker}>
        {g && (
          <>
            <dl className="facts">
              <div><dt>{t('Hit die')}</dt><dd><Rich text={dice(`1d${CLASSES[g.id as ClassId].hitDie}`, lang)} /></dd></div>
              <div><dt>{t('Main abilities')}</dt><dd>{g.priority.slice(0, 2).map((x) => t(ABILITY_NAMES[x])).join(', ')}</dd></div>
              <div><dt>{t('Saving throws')}</dt><dd>{CLASSES[g.id as ClassId].saves.map((x) => t(ABILITY_NAMES[x])).join(', ')}</dd></div>
              <div><dt>{t('Armor')}</dt><dd>{loc(g.armor, lang)}</dd></div>
              <div><dt>{t('Weapons')}</dt><dd>{loc(g.weapons, lang)}</dd></div>
              <div><dt>{t('Skills')}</dt><dd>{t('{n} from {list}', { n: CLASSES[g.id as ClassId].skillCount, list: CLASSES[g.id as ClassId].skillList.map((s) => t(s)).join(', ') })}</dd></div>
            </dl>
            <h4>{t('Your path')}</h4>
            <ol className="path">{g.path.map((p) => <li key={p.level}><b>{t('Level {n}', { n: p.level })}</b> <Rich text={loc(p.text, lang)} /></li>)}</ol>
          </>
        )}
        {k && (
          <>
            <h4>{t('In this kit')}</h4>
            <ul className="items">
              {[...Object.values(k.equipment).map((id) => ({ id: id!, qty: 1, worn: true })), ...k.bag.map((x) => ({ id: x.id, qty: x.qty ?? 1, worn: false }))].map((it, i) => (
                <li key={i}><b>{itemLine(it.id, it.qty, t)}</b>{it.worn && <small> ({t('equipped')})</small>}<br /><small><Rich text={t(ITEMS[it.id].description)} /></small></li>
              ))}
            </ul>
            {bg && <><h4>{t('From your background')}</h4><p>{[...bg.bag.map((x) => itemLine(x.id, x.qty ?? 1, t)), `🪙 ${bg.gold} ${t('gp')}`].join(' · ')}</p></>}
          </>
        )}
        {b && <p className="muted small">{t('The ability score increases are distributed in the Abilities step.')}</p>}
      </OptionDetail>
    );
  } else if (focus?.kind === 'spell') {
    detail = <SpellDetail id={focus.id} sheet={next ?? now} />;
  } else if (focus?.kind === 'ability') {
    const k = focus.key;
    const rank = guide ? guide.priority.indexOf(k) : -1;
    detail = (
      <article className="detail">
        <header><div><small className="kicker">{t('Ability')}</small><h2>{t(ABILITY_NAMES[k])}</h2><p className="summary">{loc(ABILITY_HELP[k].text, lang)}</p></div></header>
        <h4>{t('What it is used for')}</h4>
        <p><Rich text={loc(ABILITY_HELP[k].uses, lang)} /></p>
        <h4>{t('Score and modifier')}</h4>
        <p><Rich text={t('The modifier is what gets added to your rolls. 8-9 gives -1, 10-11 gives +0, 12-13 gives +1, 14-15 gives +2, 16-17 gives +3, 18-19 gives +4.')} /></p>
        {guide && (
          <>
            <h4>{t('For a {class}', { class: t(guide.name) })}</h4>
            <p className="goodfor">
              {rank === 0 ? t('Your most important ability. Make it as high as you can.') : rank === 1 ? t('Your second most important ability.') : rank >= 4 ? t('Least important for your class. A good place for your lowest score.') : t('Useful, but not a priority.')}
            </p>
          </>
        )}
      </article>
    );
  } else if (focus?.kind === 'skill') {
    const s = focus.id;
    const sheet = next ?? now;
    const prof = sheet?.skills.includes(s);
    const bonus = sheet ? abilityMod(sheet.abilities[SKILLS[s]]) + (prof ? sheet.profBonus * (sheet.expertise.includes(s) ? 2 : 1) : 0) : 0;
    detail = (
      <article className="detail">
        <header><div><small className="kicker">{t('Skill')} · {t(ABILITY_NAMES[SKILLS[s]])}</small><h2 className="cap">{t(s)}</h2><p className="summary">{loc(SKILL_HELP[s], lang)}</p></div></header>
        <h4>{t('How a check works')}</h4>
        <p><Rich text={t('The Dungeon Master sets a DC, usually between 10 (easy) and 20 (very hard). You roll a d20 and add your {ability} modifier, plus your proficiency bonus if you are proficient in the skill.', { ability: t(ABILITY_NAMES[SKILLS[s]]) })} /></p>
        {sheet && <><h4>{t('Your bonus')}</h4><p className="goodfor"><b>{signed(bonus)}</b> {prof ? (sheet.expertise.includes(s) ? t('(proficient, with Expertise)') : t('(proficient)')) : t('(not proficient)')}</p></>}
      </article>
    );
  } else {
    detail = (
      <article className="detail intro">
        <header><div><small className="kicker">{t('Step {n} of {total}', { n: stepIndex + 1, total: STEPS.length })} · {labels[step]}</small><h2>{intro[step][0]}</h2></div></header>
        <p><Rich text={intro[step][1]} /></p>
        {step === 'identity' && (
          <>
            {problems.length > 0 ? (
              <>
                <h4>{t('Still to do')}</h4>
                <ul className="todo">{problems.map((p, i) => <li key={i}><button type="button" className="link" onClick={() => go(p.step)}>{labels[p.step]}</button> {loc(p.text, lang)}</li>)}</ul>
              </>
            ) : <p className="goodfor">✓ {t('Everything is chosen. Your hero is ready.')}</p>}
            {cls && sp && bg && <p>{t('{species} {class}, {background}', { species: t(sp.name), class: t(cls.name), background: t(bg.name) })}</p>}
            {guide && <><h4>{t('Your path')}</h4><ol className="path">{guide.path.map((p) => <li key={p.level}><b>{t('Level {n}', { n: p.level })}</b> <Rich text={loc(p.text, lang)} /></li>)}</ol></>}
            {now && now.features.length > 0 && <Effects effects={[...(sp?.effects ?? [])]} />}
          </>
        )}
      </article>
    );
  }

  // ------------------------------------------------------------- the frame

  const canRecommend = !!d.classId && STEP_FIELDS[step].length > 0;
  const recommendStep = () => {
    if (!d.classId) return;
    const keep: (keyof CharacterSpec)[] = ['classId', 'name', 'gender', 'appearance', 'backstory', ...ALL_FIELDS.filter((f) => !STEP_FIELDS[step].includes(f))];
    if (step === 'abilities' && d.method === 'roll' && rolled) {
      // Rolled scores stay rolled: lay them out by priority and re-pick only the background bonus.
      const sorted = [...rolled].sort((x, y) => y - x);
      const base = {} as Abilities;
      CLASS_GUIDE[d.classId].priority.forEach((k, i) => { base[k] = sorted[i]; });
      return setD(tidy({ ...d, base, boosts: bg ? recommendedBoosts(d.classId, base, bg.abilities) : [] }));
    }
    setD(tidy({ ...d, ...recommend({ ...d, classId: d.classId }, keep) }));
  };
  const quickBuild = () => {
    if (!d.classId) return;
    setD(tidy(recommend({ ...d, classId: d.classId, method: 'array', base: undefined }, ['classId', 'name', 'gender', 'appearance', 'backstory'])));
    go('identity');
  };
  const create = () => {
    if (problems.length) return go(problems[0].step);
    conn.send({ t: 'create_character', spec: { ...(d as CharacterSpec), name: (d.name ?? '').trim() } });
    onClose();
  };
  const full = state.characters.length >= 4;

  return (
    <div className="overlay creator-overlay">
      <div className="panel creator">
        <header className="creator-head">
          {d.classId && <img className="pixel" src={heroUrl(artOfDraft(d)!)} alt="" />}
          <h1>{t('Create your hero')}</h1>
          <nav className="steps">
            {STEPS.map((s, i) => {
              const bad = problems.some((p) => p.step === s);
              return (
                <button key={s} type="button" className={[s === step && 'on', !bad && 'done'].filter(Boolean).join(' ')} onClick={() => go(s)}>
                  <i>{bad ? i + 1 : '✓'}</i>{labels[s]}
                </button>
              );
            })}
          </nav>
          <LangSwitch />
          <button className="link close" onClick={onClose} title={t('Close')}>✕</button>
        </header>
        <div className="creator-body">
          <div className="creator-left">{left}</div>
          <div className="creator-mid">{detail}</div>
          <Preview now={now} next={next} />
        </div>
        <footer className="creator-foot">
          <button type="button" disabled={stepIndex === 0} onClick={() => go(STEPS[stepIndex - 1])}>← {t('Back')}</button>
          {canRecommend && <button type="button" onClick={recommendStep} title={t('Fill this step with picks that suit your class')}>★ {t('Recommended picks')}</button>}
          {d.classId && step !== 'identity' && <button type="button" onClick={quickBuild} title={t('Let the game choose everything that suits your class, then go straight to name and story')}>⚡ {t('Quick build')}</button>}
          <span className="spacer" />
          {problems.filter((p) => p.step === step).slice(0, 1).map((p, i) => <span key={i} className="muted small">{loc(p.text, lang)}</span>)}
          {step === 'identity'
            ? <button type="button" className="primary" disabled={full} onClick={create}>{full ? t('The party is full') : problems.length ? t('Finish the open steps') : t('Create hero')}</button>
            : <button type="button" className="primary" onClick={() => go(STEPS[stepIndex + 1])}>{t('Next')} →</button>}
        </footer>
      </div>
    </div>
  );
}

/** A row of colour dots to choose from. */
function Swatches({ label, value, options, colors, onPick }: { label: string; value: string; options: string[]; colors: Record<string, string>; onPick: (id: string) => void }) {
  const t = useT();
  return (
    <div className="look-row">
      <span>{label}</span>
      <span className="swatches">
        {options.map((id) => (
          <button key={id} type="button" className={id === value ? 'swatch on' : 'swatch'} style={{ background: colors[id] }} title={t(LOOK_NAMES[id] ?? id)} aria-label={t(LOOK_NAMES[id] ?? id)} aria-pressed={id === value} onClick={() => onPick(id)} />
        ))}
      </span>
    </div>
  );
}

/** A row of named choices. */
function Choices<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: readonly T[]; onPick: (id: T) => void }) {
  const t = useT();
  return (
    <div className="look-row">
      <span>{label}</span>
      <span className="segmented small">
        {options.map((id) => <button key={id} type="button" className={id === value ? 'on' : ''} onClick={() => onPick(id)}>{t(LOOK_NAMES[id] ?? id)}</button>)}
      </span>
    </div>
  );
}
