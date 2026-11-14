// Building blocks for explained choices, used by the character creator and by level-ups:
// rules text with hover explanations, pick rows, option details and the live stat preview.
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { ABILITIES, ABILITY_NAMES, ITEMS, SKILLS } from '../../../shared/content';
import { applyFeat, initiateNeeds, type Build, type Sheet } from '../../../shared/build';
import type { Lang } from '../../../shared/i18n';
import { fillFeat } from '../../../shared/recommend';
import { ABILITY_KEYS, EFFECT_LINES, FEATS, GLOSSARY, SPELL_TIPS, loc, type Effect, type L, type Option, type Term } from '../../../shared/rules';
import { abilityMod, type AbilityKey, type FeatId, type FeatPick } from '../../../shared/types';
import { useLang, useT, type Translate } from '../i18n';

export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
/** German dice notation uses W (Würfel) where English uses d. */
export const dice = (expr: string, lang: Lang) => (lang === 'de' ? expr.replace(/(\d)d(\d)/g, '$1W$2') : expr);

/** A sheet feature line in the interface language. Species traits carry their own German text. */
export function featureText(line: string, lang: Lang, t: Translate): string {
  const e = EFFECT_LINES[line];
  return e && lang === 'de' ? `${t(e.name)}: ${e.de}` : t(line);
}

// ------------------------------------------------------------ glossary text

const matchers: Partial<Record<Lang, { all: RegExp; terms: { term: Term; re: RegExp }[] }>> = {};
function matcher(lang: Lang) {
  return (matchers[lang] ??= {
    // Longer alternatives first, so "proficiency bonus" wins over "proficiency".
    all: new RegExp(`(?<![\\p{L}\\d])(?:${GLOSSARY.map((g) => g.match[lang]).join('|')})(?![\\p{L}\\d])`, 'giu'),
    terms: GLOSSARY.map((term) => ({ term, re: new RegExp(`^(?:${term.match[lang]})$`, 'iu') })),
  });
}

function Tip({ term, children }: { term: Term; children: ReactNode }) {
  const { lang } = useLang();
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const below = r.top < 190;
    setPos({ x: Math.max(8, Math.min(window.innerWidth - 328, r.left + r.width / 2 - 160)), y: below ? r.bottom + 6 : r.top - 6, below });
  };
  return (
    <span className="term" tabIndex={0} onMouseEnter={(e) => show(e.currentTarget)} onMouseLeave={() => setPos(null)} onFocus={(e) => show(e.currentTarget)} onBlur={() => setPos(null)}>
      {children}
      {pos && (
        <span className={pos.below ? 'term-tip below' : 'term-tip'} role="tooltip" style={{ left: pos.x, top: pos.y }}>
          <b>{loc(term.name, lang)}</b>
          {loc(term.text, lang)}
        </span>
      )}
    </span>
  );
}

/** Rules text in which every glossary term (proficiency, saving throw, AC, …) explains itself on hover. */
export function Rich({ text }: { text: string }) {
  const { lang } = useLang();
  const parts = useMemo(() => {
    const m = matcher(lang);
    const out: ReactNode[] = [];
    let last = 0;
    for (const hit of text.matchAll(m.all)) {
      const term = m.terms.find((x) => x.re.test(hit[0]))?.term;
      if (!term) continue;
      out.push(text.slice(last, hit.index), <Tip key={hit.index} term={term}>{hit[0]}</Tip>);
      last = hit.index + hit[0].length;
    }
    out.push(text.slice(last));
    return out;
  }, [text, lang]);
  return <>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</>;
}

// --------------------------------------------------------------- pick rows

interface PickProps {
  icon?: string;
  title: string;
  sub?: string;
  selected?: boolean;
  recommended?: boolean;
  /** Granted by something else and cannot be changed here. */
  locked?: string;
  disabled?: boolean;
  focused?: boolean;
  mark?: 'check' | 'radio';
  onClick?: () => void;
  onFocus?: () => void;
  onLeave?: () => void;
  children?: ReactNode;
}

/** One selectable row. Hovering it shows its explanation and previews what it would change. */
export function PickRow({ icon, title, sub, selected, recommended, locked, disabled, focused, mark = 'radio', onClick, onFocus, onLeave, children }: PickProps) {
  const t = useT();
  const cls = ['pick', selected && 'on', (disabled || locked) && 'off', focused && 'focused'].filter(Boolean).join(' ');
  return (
    <div className={cls} onMouseEnter={onFocus} onMouseLeave={onLeave}>
      <button type="button" className="pick-main" disabled={disabled || !!locked} onClick={onClick} onFocus={onFocus} aria-pressed={!!selected}>
        <span className={`pick-mark ${mark}`}>{selected || locked ? '✓' : ''}</span>
        {icon && <span className="pick-icon">{icon}</span>}
        <span className="pick-text">
          <b>{title}</b>
          {sub && <small>{sub}</small>}
        </span>
        {locked && <span className="badge locked">{locked}</span>}
        {recommended && !locked && <span className="badge rec" title={t('A good pick for your class')}>★ {t('Recommended')}</span>}
      </button>
      {children}
    </div>
  );
}

export function Section({ title, hint, done, children }: { title: string; hint?: string; done?: boolean; children: ReactNode }) {
  return (
    <section className="pick-section">
      <h3><span>{title}</span>{hint && <small className={done ? 'done' : ''}>{done ? '✓ ' : ''}{hint}</small>}</h3>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ details

export function Effects({ effects }: { effects: Effect[] }) {
  const t = useT();
  const { lang } = useLang();
  if (!effects.length) return null;
  return (
    <>
      <h4>{t('What it does')}</h4>
      <ul className="effects">
        {effects.map((e) => (
          <li key={e.name} className={`by-${e.by}`}>
            <span className="by" title={e.by === 'engine' ? t('Rules: the game applies this automatically.') : t('Story: the Dungeon Master plays this out in the narration.')}>{e.by === 'engine' ? '⚙' : '📖'}</span>
            <span><b>{t(e.name)}.</b> <Rich text={loc(e.text, lang)} /></span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The explanation panel for a species, class, background, feat, fighting style or equipment kit. */
export function OptionDetail({ option, kicker, children }: { option: Option; kicker?: string; children?: ReactNode }) {
  const t = useT();
  const { lang } = useLang();
  return (
    <article className="detail">
      <header>
        <span className="detail-icon">{option.icon}</span>
        <div>
          {kicker && <small className="kicker">{kicker}</small>}
          <h2>{t(option.name)}</h2>
          <p className="summary"><Rich text={loc(option.summary, lang)} /></p>
        </div>
      </header>
      <p><Rich text={loc(option.description, lang)} /></p>
      <Effects effects={option.effects} />
      {children}
      <h4>{t('Good for')}</h4>
      <p className="goodfor"><Rich text={loc(option.goodFor, lang)} /></p>
    </article>
  );
}

/** A spell or special action, with the numbers it would have for this hero. */
export function SpellDetail({ id, sheet }: { id: string; sheet: Pick<Sheet, 'spell'> | null }) {
  const t = useT();
  const { lang } = useLang();
  const a = ABILITIES[id];
  if (!a) return null;
  const level = a.spellLevel === undefined ? t('Special ability') : a.spellLevel === 0 ? t('Cantrip') : t('Level {n} spell', { n: a.spellLevel });
  const rows: [string, string][] = [
    [t('Cost'), a.cost ? t('{n} mana', { n: a.cost }) : a.oncePerRest ? t('Once per rest') : t('Free, every turn')],
    [t('Uses'), a.bonusAction ? t('Bonus action') : t('Action')],
    [t('Range'), a.range === 0 ? t('Self') : a.range <= 5 ? t('Touch (5 ft)') : `${a.range} ft`],
  ];
  if (a.dice && a.damageType) rows.push([t('Damage'), `${dice(a.dice, lang)} ${t(`${a.damageType} damage`)}`]);
  if (a.kind === 'heal') rows.push([t('Healing'), `${dice(a.dice ?? '', lang)} + ${t('spellcasting modifier')}`]);
  if (a.kind === 'attack') rows.push([t('To hit'), sheet?.spell ? `${t('d20')} ${signed(sheet.spell.attack)} ${t('vs')} ${t('AC')}` : t('Spell attack against AC')]);
  if (a.kind === 'save') rows.push([t('Defence'), `${t(ABILITY_NAMES[a.saveAbility!])}: ${t('saving throw')}${sheet?.spell && !a.dcAbility ? ` ${t('vs')} ${t('DC')} ${sheet.spell.dc}` : ''}`]);
  if (a.kind === 'auto') rows.push([t('To hit'), t('Always hits')]);
  if (a.area) rows.push([t('Area'), t('Also hits every enemy next to the target')]);
  return (
    <article className="detail">
      <header>
        <span className="detail-icon">{a.icon}</span>
        <div>
          <small className="kicker">{level}</small>
          <h2>{t(a.name)}</h2>
        </div>
      </header>
      <p><Rich text={t(a.description)} /></p>
      <dl className="facts">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd><Rich text={v} /></dd></div>)}</dl>
      {SPELL_TIPS[id] && <><h4>{t('Good for')}</h4><p className="goodfor"><Rich text={loc(SPELL_TIPS[id], lang)} /></p></>}
    </article>
  );
}

/** What an item is, for equipment explanations. */
export function itemLine(id: string, qty: number, t: Translate): string {
  const def = ITEMS[id];
  return `${def.icon} ${qty > 1 ? `${qty}× ` : ''}${t(def.name)}`;
}

// ------------------------------------------------------------- stat preview

function Stat({ label, now, next, text }: { label: string; now: number | undefined; next: number | undefined; text?: (n: number) => string }) {
  const show = text ?? String;
  const changed = now !== undefined && next !== undefined && now !== next;
  return (
    <div className={changed ? (next! > now! ? 'up' : 'down') : ''}>
      <b>{next === undefined ? '–' : show(next)}</b>
      {changed && <i>{signed(next! - now!)}</i>}
      <small>{label}</small>
    </div>
  );
}

/**
 * The hero as they stand, updated after every choice. While the player hovers an option,
 * `next` is the sheet that option would produce, and every number that would change is
 * marked with its difference.
 */
export function Preview({ now, next, title }: { now: Sheet | null; next: Sheet | null; title?: string }) {
  const t = useT();
  const { lang } = useLang();
  const s = next ?? now;
  if (!s) return <aside className="preview"><h3>{title ?? t('Your hero')}</h3><p className="muted">{t('Choose a class to see your hero take shape here.')}</p></aside>;
  const base = now ?? s;
  const skillBonus = (x: Sheet, skill: string) => abilityMod(x.abilities[SKILLS[skill]]) + (x.skills.includes(skill) ? x.profBonus * (x.expertise.includes(skill) ? 2 : 1) : 0);
  const gained = (a: string[], b: string[]) => a.filter((x) => !b.includes(x));
  const newSkills = gained(s.skills, base.skills), lostSkills = gained(base.skills, s.skills);
  const spells = s.abilityIds.filter((id) => ABILITIES[id]);
  const preview = next && now && next !== now;
  return (
    <aside className={preview ? 'preview previewing' : 'preview'}>
      <h3>{title ?? t('Your hero')}{preview && <small>{t('preview')}</small>}</h3>
      <div className="pv-stats">
        <Stat label={t('Hit points')} now={base.maxHp} next={s.maxHp} />
        <Stat label={t('Armor class')} now={base.ac} next={s.ac} />
        <Stat label={t('Initiative')} now={base.initiative} next={s.initiative} text={signed} />
        <Stat label={t('Speed')} now={base.speed} next={s.speed} text={(n) => `${n} ft`} />
        {(s.maxMana > 0 || base.maxMana > 0) && <Stat label={t('Mana')} now={base.maxMana} next={s.maxMana} />}
        {(s.spell || base.spell) && <Stat label={t('Spell DC')} now={base.spell?.dc} next={s.spell?.dc} />}
      </div>
      <table className="pv-abilities">
        <tbody>
          {ABILITY_KEYS.map((k) => {
            const a = base.abilities[k], b = s.abilities[k];
            const save = (x: Sheet) => abilityMod(x.abilities[k]) + (x.saves.includes(k) ? x.profBonus : 0);
            return (
              <tr key={k} className={a !== b ? (b > a ? 'up' : 'down') : ''}>
                <th>{t(ABILITY_NAMES[k])}</th>
                <td className="score">{b}{a !== b && <i>{signed(b - a)}</i>}</td>
                <td className="mod">{signed(abilityMod(b))}</td>
                <td className={s.saves.includes(k) ? 'save prof' : 'save'} title={s.saves.includes(k) ? t('Proficient saving throw') : t('Saving throw')}>{t('save')} {signed(save(s))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {s.attack && (
        <p className={`pv-line ${base.attack && (base.attack.bonus !== s.attack.bonus || base.attack.damage !== s.attack.damage || base.attack.name !== s.attack.name) ? 'changed' : ''}`}>
          <small>{t('Attack')}</small> {t(s.attack.name)} {signed(s.attack.bonus)}, {dice(s.attack.damage, lang)} {t(`${s.attack.type} damage`)}
        </p>
      )}
      {s.spell && <p className="pv-line"><small>{t('Spells')}</small> {t(ABILITY_NAMES[s.spell.ability])}, {t('attack')} {signed(s.spell.attack)}, {t('DC')} {s.spell.dc}</p>}
      <h4>{t('Skills')}</h4>
      <ul className="pv-skills">
        {Object.keys(SKILLS).filter((k) => s.skills.includes(k) || lostSkills.includes(k)).map((k) => (
          <li key={k} className={newSkills.includes(k) ? 'up' : lostSkills.includes(k) ? 'down' : ''}>
            {t(k)}{s.expertise.includes(k) && <span title={t('Expertise')}> ★</span>} <b>{signed(skillBonus(s, k))}</b>
          </li>
        ))}
        {s.skills.length === 0 && <li className="muted">{t('None yet.')}</li>}
      </ul>
      <h4>{t('Actions and spells')}</h4>
      <ul className="pv-skills">
        {spells.map((id) => <li key={id} className={base.abilityIds.includes(id) ? '' : 'up'}>{ABILITIES[id].icon} {t(ABILITIES[id].name)}</li>)}
      </ul>
      {s.resist.length > 0 && <p className="pv-line"><small>{t('Resistance')}</small> {s.resist.map((r) => t(`${r} damage`)).join(', ')}</p>}
    </aside>
  );
}

// --------------------------------------------------------------- feat picks

export type Focus =
  | { kind: 'option'; option: Option; kicker?: string }
  | { kind: 'spell'; id: string }
  | { kind: 'ability'; key: AbilityKey }
  | { kind: 'skill'; id: string }
  | null;

interface FeatPickerProps {
  /** The hero before this feat. */
  build: Build;
  /** The feat is fixed (a background's feat): only its sub-choices are picked. */
  fixed?: FeatId;
  /** Feats the player may choose from. */
  options?: FeatId[];
  recommended?: FeatId;
  value: FeatPick | undefined;
  onChange: (pick: FeatPick) => void;
  onFocus: (f: Focus, pick?: FeatPick) => void;
  focus: Focus;
}

/** Is this pick complete and valid for the hero? Applies it to a copy. */
export function featProblem(build: Build, pick: FeatPick | undefined, origin: boolean): L | null {
  if (!pick) return { en: 'Choose a feat', de: 'Wähle ein Talent' };
  return applyFeat(structuredClone(build), pick, origin);
}

/** Choose a feat and whatever it asks for: abilities to raise, skills, or spells. */
export function FeatPicker({ build, fixed, options, recommended, value, onChange, onFocus, focus }: FeatPickerProps) {
  const t = useT();
  const { lang } = useLang();
  const id = fixed ?? value?.id;
  const def = id ? FEATS[id] : undefined;
  const pick: FeatPick | undefined = id ? { ...value, id } : undefined;
  const toggle = (list: string[] | undefined, x: string, max: number) => {
    const cur = list ?? [];
    return cur.includes(x) ? cur.filter((y) => y !== x) : cur.length >= max ? [...cur.slice(1), x] : [...cur, x];
  };
  const isFocus = (o: Option) => focus?.kind === 'option' && focus.option === o;
  const need = def?.spellList ? initiateNeeds(build, def.spellList) : null;
  const spellRow = (sid: string, max: number, pool: string[]) => {
    const others = (pick?.spells ?? []).filter((x) => !pool.includes(x));
    const mine = (pick?.spells ?? []).filter((x) => pool.includes(x));
    const next = { ...pick!, spells: [...others, ...toggle(mine, sid, max)] };
    return (
      <PickRow key={sid} mark="check" icon={ABILITIES[sid].icon} title={t(ABILITIES[sid].name)} sub={t(ABILITIES[sid].description)} selected={mine.includes(sid)}
        focused={focus?.kind === 'spell' && focus.id === sid} onClick={() => onChange(next)} onFocus={() => onFocus({ kind: 'spell', id: sid }, mine.includes(sid) ? undefined : next)} onLeave={() => onFocus(focus)} />
    );
  };
  return (
    <div className="featpicker">
      {!fixed && (options ?? []).map((f) => {
        const o = FEATS[f];
        const filled = fillFeat(build, f);
        return (
          <PickRow key={f} icon={o.icon} title={t(o.name)} sub={loc(o.summary, lang)} selected={id === f} recommended={recommended === f} focused={isFocus(o)}
            onClick={() => onChange(id === f ? pick! : filled)} onFocus={() => onFocus({ kind: 'option', option: o, kicker: t('Feat') }, id === f ? undefined : filled)} onLeave={() => onFocus(focus)} />
        );
      })}
      {def?.id === 'asi' && pick && (
        <div className="subpick">
          <small>{t('Raise two points. Click the same ability twice for +2.')}</small>
          <div className="asi">
            {ABILITY_KEYS.map((k) => {
              const n = (pick.abilities ?? []).filter((x) => x === k).length;
              const cur = pick.abilities ?? [];
              const next = build.abilities[k] + n >= 20 ? cur : cur.length >= 2 ? [cur[1], k] : [...cur, k];
              return (
                <button key={k} type="button" className={n ? 'on' : ''} disabled={build.abilities[k] >= 20} onClick={() => onChange({ ...pick, abilities: next })}
                  onMouseEnter={() => onFocus({ kind: 'ability', key: k }, { ...pick, abilities: next })} onMouseLeave={() => onFocus(focus)}>
                  {t(k.toUpperCase())} {build.abilities[k]}{n > 0 && <b> +{n}</b>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {def?.id === 'skilled' && pick && (
        <div className="subpick">
          <small>{t('Choose three skills ({n}/3).', { n: pick.skills?.length ?? 0 })}</small>
          <div className="chips">
            {Object.keys(SKILLS).filter((s) => !build.skills.includes(s)).map((s) => {
              const next = { ...pick, skills: toggle(pick.skills, s, 3) };
              return (
                <button key={s} type="button" className={pick.skills?.includes(s) ? 'on' : ''} onClick={() => onChange(next)}
                  onMouseEnter={() => onFocus({ kind: 'skill', id: s }, pick.skills?.includes(s) ? undefined : next)} onMouseLeave={() => onFocus(focus)}>
                  {t(s)} <small>{t(SKILLS[s].toUpperCase())}</small>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {need && pick && (
        <div className="subpick">
          {need.needCantrip > 0 && <><small>{t('Choose a cantrip.')}</small>{need.cantrips.map((s) => spellRow(s, 1, need.cantrips))}</>}
          {need.needSpell > 0 && <><small>{t('Choose a 1st-level spell.')}</small>{need.spells.map((s) => spellRow(s, 1, need.spells))}</>}
        </div>
      )}
    </div>
  );
}
