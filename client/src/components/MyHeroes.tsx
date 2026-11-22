// My heroes at the table before the adventure: the heroes this account keeps, each one added as a
// fresh level 1 copy. The saved hero itself never changes by playing.
import { useMemo, useState } from 'react';
import { ABILITIES, CLASS_INFO } from '../../../shared/content';
import { buildSheet } from '../../../shared/build';
import { ABILITY_KEYS, BACKGROUNDS, CLASSES } from '../../../shared/rules';
import type { HeroTemplate } from '../../../shared/accounts';
import type { GameState } from '../../../shared/types';
import { artOfDraft, heroPortraitUrl } from '../game/heroArt';
import { classLabel, heroTitle } from '../game/util';
import { traitLines, traitText } from '../../../shared/traits';
import { useLang, useT } from '../i18n';
import type { Connection } from '../net';
import { deleteTemplate } from '../templates';
import { ask } from '../ui/Confirm';
import { Info } from '../ui/Hint';

export function MyHeroes({ heroes, state, conn, onEdit }: { heroes: HeroTemplate[]; state: GameState; conn: Connection; onEdit: (h: HeroTemplate) => void }) {
  const t = useT();
  const { lang } = useLang();
  const [picked, setPicked] = useState<string | null>(null);
  const full = state.characters.length >= 4;
  const inParty = (h: HeroTemplate) => state.characters.some((c) => c.templateId === h.id);
  const shown = heroes.find((h) => h.id === picked);
  const sheet = useMemo(() => (shown ? buildSheet(shown.spec) : null), [shown]);
  if (!heroes.length) return null;

  const remove = async (h: HeroTemplate) => {
    if (!(await ask(t('Delete {name} from My heroes? Heroes already at a table keep playing.', { name: h.name }), { ok: t('Delete') }))) return;
    setPicked(null);
    try { await deleteTemplate(h.id); } catch { /* the list stays; try again */ }
  };

  return (
    <section className="hero-pick my-heroes">
      <h2>{t('My heroes')} <Info text={t('Heroes you keep on your account. A hero joins the party as a fresh level 1 copy, so playing never changes the saved one.')} /></h2>
      <div className="hero-strip">
        {heroes.map((h) => (
          <button type="button" key={h.id} className={['hero-tile', picked === h.id && 'on', inParty(h) && 'taken'].filter(Boolean).join(' ')} aria-pressed={picked === h.id}
            onClick={() => setPicked(picked === h.id ? null : h.id)}>
            <img className="hero-art" src={heroPortraitUrl(artOfDraft(h.spec)!)} alt="" />
            <b style={{ color: CLASS_INFO[h.spec.classId].color }}>{h.name}</b>
            <small>{inParty(h) ? `✓ ${t('In the party')}` : classLabel({ className: CLASSES[h.spec.classId].name, gender: h.spec.gender }, t)}</small>
          </button>
        ))}
      </div>
      {shown && sheet && (
        <div className="hero-detail">
          <img className="hero-art" src={heroPortraitUrl(artOfDraft(shown.spec)!)} alt="" />
          <div className="hero-detail-text">
            <h3>{shown.name} <small>{heroTitle({ className: CLASSES[shown.spec.classId].name, gender: shown.spec.gender, speciesId: shown.spec.speciesId }, t)} · {t(BACKGROUNDS[shown.spec.backgroundId].name)}</small></h3>
            {shown.spec.backstory && <p className="bio">{shown.spec.backstory}</p>}
            {traitLines(shown.spec.traits).length > 0 && <p className="bio muted">{traitText(shown.spec.traits, lang)}</p>}
          </div>
          <div className="hero-detail-stats">
            <p className="hero-stats"><b>{sheet.maxHp}</b> {t('HP')} · <b>{sheet.ac}</b> {t('AC')}{sheet.maxMana > 0 && <> · <b>{sheet.maxMana}</b> {t('Mana')}</>}</p>
            <p className="abil">{ABILITY_KEYS.map((k) => <span key={k}>{t(k.toUpperCase())} <b>{sheet.abilities[k]}</b></span>)}</p>
            <p><b>{t('Skills')}:</b> {sheet.skills.map((s) => t(s)).join(', ')}</p>
            {sheet.abilityIds.some((id) => ABILITIES[id]?.spellLevel !== undefined) && <p><b>{t('Spells and abilities')}:</b> {sheet.abilityIds.filter((id) => ABILITIES[id]?.spellLevel !== undefined).map((id) => t(ABILITIES[id].name)).join(', ')}</p>}
          </div>
          <div className="hero-actions">
            <button type="button" className="primary" disabled={full || inParty(shown)} onClick={() => { conn.send({ t: 'add_template', templateId: shown.id }); setPicked(null); }}>{inParty(shown) ? t('In the party') : t('Add to party')}</button>
            <button type="button" onClick={() => onEdit(shown)} title={t('Change the saved hero in the character creator')}>{t('Edit')}</button>
            <button type="button" onClick={() => void remove(shown)}>{t('Delete')}</button>
            <button type="button" className="link" onClick={() => setPicked(null)}>{t('Close')}</button>
          </div>
        </div>
      )}
    </section>
  );
}
