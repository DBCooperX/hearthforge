// What a hero's attack or spell would do to a foe, shown before it is committed:
// the chance in percent, the damage it deals, and every reason the odds are what they are.
import type { ReactNode } from 'react';
import { GOOD_REASONS, type Odds, type OddsReason } from '../../../shared/odds';
import { ABILITY_NAMES } from '../../../shared/content';
import type { AbilityKey } from '../../../shared/types';
import { useT, type Translate } from '../i18n';

/** The words for each reason, short enough for a chip. */
export function reasonText(code: OddsReason, n: number | undefined, t: Translate): string {
  switch (code) {
    case 'cover': return t('Half cover: +{n} AC', { n: n ?? 2 });
    case 'cant_see': return t('Disadvantage: you cannot see it');
    case 'unseen': return t('Advantage: it cannot see you');
    case 'prone_near': return t('Advantage: it is prone');
    case 'prone_far': return t('Disadvantage: prone, and you are not next to it');
    case 'long_range': return t('Disadvantage: beyond normal range');
    case 'foe_adjacent': return t('Disadvantage: an enemy is next to you');
    case 'hampered': return t('Disadvantage: your condition');
    case 'exposed': return t('Advantage: it is held or helpless');
    case 'guided': return t('Advantage: Guiding Bolt');
    case 'studied': return t('Advantage: Studied Attacks');
    case 'aimed': return t('Advantage: you took aim');
    case 'reckless': return t('Advantage: Reckless Attack');
    case 'invisible': return t('Advantage: you are invisible');
    case 'buff_adv': return t('Advantage: a spell on you');
    case 'hunted': return t("Advantage: Hunter's Mark");
    case 'bless': return t('Bless: +1d4');
    case 'bane': return t('Bane: its save −1d4');
    case 'slowed': return t('Slowed: −{n} AC', { n: n ?? 2 });
    case 'crit_range': return t('Critical hit on {n} or more', { n: n ?? 20 });
    case 'magic_resistance': return t('Advantage on its save: Magic Resistance');
    case 'helpless': return t('It cannot save: stunned or paralysed');
    case 'heightened': return t('Disadvantage on its save: Heightened Spell');
    case 'resists': return t('It resists this damage: halved');
    case 'immune': return t('It is immune to this damage');
    case 'vulnerable': return t('It is vulnerable: doubled');
    case 'sneak': return t('Sneak Attack applies');
    case 'mark': return t('Your mark adds damage');
    case 'out_of_range': return t('Out of range');
    case 'no_sight': return t('No clear line of sight');
  }
}

/** The chance and the damage in one line, for tooltips and the hover card. */
export function OddsBlock({ odds, label }: { odds: Odds; label?: ReactNode }) {
  const t = useT();
  const d = odds.damage;
  const what = odds.kind === 'attack'
    ? t('to hit')
    : odds.save ? t('fails the {save} save', { save: t(ABILITY_NAMES[odds.save as AbilityKey] ?? odds.save.toUpperCase()) }) : t('takes effect');
  const level = odds.chance >= 65 ? 'high' : odds.chance >= 35 ? 'mid' : 'low';
  return (
    <div className={`odds ${level}${odds.blocked ? ' blocked' : ''}`}>
      {label && <div className="odds-label">{label}</div>}
      <div className="odds-main">
        <b className="odds-chance">{odds.chance}%</b>
        <span className="odds-what">{what}</span>
        {d && (
          <span className="odds-dmg" title={d.dice}>
            {d.min === d.max ? d.min : `${d.min}–${d.max}`} <small>{t(`${d.type} damage`)}</small>
            {odds.kind === 'save' && odds.half && <small> · {t('half on a save')}</small>}
          </span>
        )}
      </div>
      <div className="odds-math">
        {odds.kind === 'attack'
          ? t('d20 {bonus} against AC {ac}', { bonus: (odds.bonus ?? 0) >= 0 ? `+${odds.bonus}` : String(odds.bonus), ac: odds.ac ?? 0 })
          : odds.dc ? t('Your DC {dc} against its save {mod}', { dc: odds.dc, mod: (odds.saveMod ?? 0) >= 0 ? `+${odds.saveMod}` : String(odds.saveMod) }) : ''}
        {odds.mode !== 'normal' && <em className={odds.mode}> · {t(odds.mode)}</em>}
      </div>
      {odds.blocked && <div className="odds-blocked">{odds.blocked === 'range' ? t('Out of range from here') : t('No clear line of sight from here')}</div>}
      {odds.reasons.length > 0 && (
        <ul className="odds-why">
          {odds.reasons.map((r, i) => <li key={i} className={GOOD_REASONS.has(r.code) ? 'good' : 'bad'}>{reasonText(r.code, r.n, t)}</li>)}
        </ul>
      )}
    </div>
  );
}
