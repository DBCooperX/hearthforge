// How the Dungeon Master runs the table: tone, rules strictness and content rating.
// The host chooses in the table room and may change it during play; everyone sees it.
import { loc } from '../../../shared/rules';
import { RATING_INFO, RULES_INFO, RULES_MAX, RULES_MIN, TONE_INFO } from '../../../shared/style';
import type { GameState } from '../../../shared/types';
import { useLang, useT } from '../i18n';
import { playerId, type Connection } from '../net';

export function StyleSetup({ state, conn, bare }: { state: GameState; conn: Connection; /** Without its own heading, for use inside another window. */ bare?: boolean }) {
  const t = useT();
  const { lang } = useLang();
  const host = state.hostId === playerId;
  const style = state.table.style;
  const set = (patch: Partial<typeof style>) => conn.send({ t: 'set_style', style: patch });
  const tone = TONE_INFO.find((x) => x.id === style.tone);
  const rating = RATING_INFO.find((x) => x.id === style.rating);
  const rules = RULES_INFO.find((x) => x.value === style.rules);
  return (
    <div className={bare ? 'style-setup bare' : 'world-setup style-setup'}>
      {!bare && <h2>{t('The Dungeon Master')}</h2>}
      <div className="field">
        <span>{t('Tone')}</span>
        <span className="pick">
          {TONE_INFO.map((x) => (
            <button type="button" key={x.id} className={style.tone === x.id ? 'on' : ''} aria-pressed={style.tone === x.id} disabled={!host} onClick={() => set({ tone: x.id })}>{x.icon} {loc(x.label, lang)}</button>
          ))}
        </span>
        {tone && <small className="muted">{loc(tone.blurb, lang)}</small>}
      </div>
      <div className="field">
        <span>{t('Rules')}</span>
        <span className="rules-slider">
          <small>{t('Coaching')}</small>
          <input type="range" min={RULES_MIN} max={RULES_MAX} step={1} value={style.rules} disabled={!host} aria-label={t('How strictly the Dungeon Master plays the rules')}
            aria-valuetext={rules ? loc(rules.label, lang) : undefined} onChange={(e) => set({ rules: Number(e.target.value) })} />
          <small>{t('Strict')}</small>
        </span>
        {rules && <small className="muted"><b>{loc(rules.label, lang)}.</b> {loc(rules.blurb, lang)}</small>}
      </div>
      <div className="field">
        <span>{t('Content rating')}</span>
        <span className="pick">
          {RATING_INFO.map((x) => (
            <button type="button" key={x.id} className={style.rating === x.id ? 'on' : ''} aria-pressed={style.rating === x.id} disabled={!host} onClick={() => set({ rating: x.id })}>{x.icon} {loc(x.label, lang)}</button>
          ))}
        </span>
        {rating && <small className="muted">{loc(rating.blurb, lang)}</small>}
      </div>
      <small className="muted">{host
        ? t('You can change this at any time, also during the adventure. The next scene follows it.')
        : t('The host chooses how the Dungeon Master tells the story.')}</small>
    </div>
  );
}
