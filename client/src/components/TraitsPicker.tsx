// Personality traits in the creator: chips per group plus a free note, all optional.
import { TRAIT_GROUPS, TRAIT_NOTE_MAX, TRAIT_PICKS_MAX, cleanTraits, type HeroTraits } from '../../../shared/traits';
import { useLang, useT } from '../i18n';

interface Props { value: HeroTraits | undefined; onChange: (traits: HeroTraits | undefined) => void }

export function TraitsPicker({ value, onChange }: Props) {
  const t = useT();
  const { lang } = useLang();
  const picks = value?.picks ?? {};
  const note = value?.note ?? '';
  // Keep what was typed while the note is still being written; cleanTraits only trims it when saved.
  const set = (next: HeroTraits) => onChange(next.note || Object.values(next.picks).some((x) => x.length) ? next : undefined);
  const toggle = (group: string, id: string) => {
    const cur = picks[group] ?? [];
    const list = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < TRAIT_PICKS_MAX ? [...cur, id] : cur;
    set({ picks: { ...picks, [group]: list }, note });
  };
  const count = Object.values(picks).reduce((n, x) => n + x.length, 0);
  return (
    <details className="traits" open={!!cleanTraits(value)}>
      <summary>{t('Personality')} <small className="muted">({t('optional')}{count ? `, ${count}` : ''})</small></summary>
      <p className="muted small">{t('How your hero acts. The Dungeon Master uses this so people and the world answer you fittingly. It never speaks or decides for your hero: that stays yours.')}</p>
      {TRAIT_GROUPS.map((g) => (
        <div className="trait-group" key={g.id}>
          <h5>{g.title[lang]} <small className="muted">{g.hint[lang]}</small></h5>
          <div className="chips">
            {g.options.map((o) => {
              const on = (picks[g.id] ?? []).includes(o.id);
              return <button type="button" key={o.id} className={on ? 'on' : ''} aria-pressed={on} onClick={() => toggle(g.id, o.id)}>{o.text[lang]}</button>;
            })}
          </div>
        </div>
      ))}
      <label>
        <span>{t('Anything else about how your hero acts')} <small className="muted">({t('optional')})</small></span>
        <textarea value={note} maxLength={TRAIT_NOTE_MAX} rows={2} onChange={(e) => set({ picks, note: e.target.value })} placeholder={t('For example: never turns down a dare, hates being called small, whistles when nervous.')} />
      </label>
    </details>
  );
}
