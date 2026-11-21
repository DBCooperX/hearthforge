// How the Dungeon Master runs the table: tone, rules strictness and content rating.
// The host chooses in the table room and may change it during play; everyone sees it.
// Each choice is a chip; what it means waits in its tooltip.
import { loc } from '../../../shared/rules';
import { RATING_INFO, RULES_INFO, RULES_MAX, RULES_MIN, TONE_INFO } from '../../../shared/style';
import type { GameState } from '../../../shared/types';
import { useLang, useT } from '../i18n';
import { playerId, type Connection } from '../net';
import { Chip, Info } from '../ui/Hint';
import { Window } from '../ui/Window';
import { LANGS } from '../../../shared/i18n';

export function StyleSetup({ state, conn, bare }: { state: GameState; conn: Connection; /** Without its own heading, for use inside another window. */ bare?: boolean }) {
  const t = useT();
  const { lang } = useLang();
  const host = state.hostId === playerId;
  const style = state.table.style;
  const set = (patch: Partial<typeof style>) => conn.send({ t: 'set_style', style: patch });
  const rules = RULES_INFO.find((x) => x.value === style.rules);
  return (
    <div className={bare ? 'style-setup bare' : 'world-setup style-setup'}>
      {!bare && <h2>{t('The Dungeon Master')}</h2>}
      <div className="field">
        <span>{t('Tone')} <Info text={host ? t('You can change this at any time, also during the adventure. The next scene follows it.') : t('The host chooses how the Dungeon Master tells the story.')} /></span>
        <span className="pick">
          {TONE_INFO.map((x) => <Chip key={x.id} on={style.tone === x.id} disabled={!host} hint={loc(x.blurb, lang)} onClick={() => set({ tone: x.id })}>{x.icon} {loc(x.label, lang)}</Chip>)}
        </span>
      </div>
      <div className="field">
        <span>{t('Rules')} {rules && <Info title={loc(rules.label, lang)} text={loc(rules.blurb, lang)} />}</span>
        <span className="rules-slider">
          <small>{t('Coaching')}</small>
          <input type="range" min={RULES_MIN} max={RULES_MAX} step={1} value={style.rules} disabled={!host} aria-label={t('How strictly the Dungeon Master plays the rules')}
            aria-valuetext={rules ? loc(rules.label, lang) : undefined} title={rules ? loc(rules.blurb, lang) : undefined} onChange={(e) => set({ rules: Number(e.target.value) })} />
          <small>{t('Strict')}</small>
          {rules && <b className="rules-now">{loc(rules.label, lang)}</b>}
        </span>
      </div>
      <div className="field">
        <span>{t('Content rating')}</span>
        <span className="pick">
          {RATING_INFO.map((x) => <Chip key={x.id} on={style.rating === x.id} disabled={!host} hint={loc(x.blurb, lang)} onClick={() => set({ rating: x.id })}>{x.icon} {loc(x.label, lang)}</Chip>)}
        </span>
      </div>
    </div>
  );
}

/** The language the story is told in. The host picks it; everyone else sees it. */
export function StoryLanguage({ state, conn }: { state: GameState; conn: Connection }) {
  const t = useT();
  const host = state.hostId === playerId;
  return (
    <div className="field">
      <span>{t('Story language')} <Info text={host ? t('You host this table, so you choose the language the story is told in. Everyone picks their own interface language.') : t('The host chooses the language the story is told in.')} /></span>
      <span className="pick">
        {LANGS.map((l) => <Chip key={l.id} on={state.language === l.id} disabled={!host} onClick={() => conn.send({ t: 'set_language', lang: l.id })}>{l.label}</Chip>)}
      </span>
    </div>
  );
}

/** "The adventure" from the game menu: how the Dungeon Master runs this table, changeable by the host during play. */
export function AdventureWindow({ state, conn, onClose }: { state: GameState; conn: Connection; onClose: () => void }) {
  const t = useT();
  const host = state.hostId === playerId;
  return (
    <Window title={t('The adventure')} icon="quest" size="small" className="adventure-win" onClose={onClose}
      subtitle={!host ? t('Set by the host') : undefined}>
      <div className="settings-body">
        <StyleSetup bare state={state} conn={conn} />
        <div className="style-setup bare"><StoryLanguage state={state} conn={conn} /></div>
      </div>
    </Window>
  );
}
