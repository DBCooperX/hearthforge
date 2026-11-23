// The player's own settings, opened from the game menu: the game (language, text size, voice input,
// edge scrolling), the sound and the keyboard. What belongs to the table or the server is in the menu itself.
import { useState } from 'react';
import { LangSwitch, useT } from '../i18n';
import { SoundMixer } from '../music';
import { BATTLE_NARRATION_MODES, type BattleNarrationMode } from '../../../shared/battleNarration';
import { Info } from './Hint';
import { SETTINGS_TABS, SHORTCUTS, SIZE_LABELS, TEXT_SIZES } from './labels';
import { setPrefs, usePrefs, type StoryPortraits } from './prefs';
import { sfx } from './sound';
import { Kbd, TabBar, Window } from './Window';
import { dictationBlocker } from '../dictation';

interface Props {
  onClose: () => void;
}

type Tab = keyof typeof SETTINGS_TABS;

/** Choices for the end turn reminder, in seconds; 0 is off. */
const TURN_REMINDERS = [0, 20, 45, 90];

const STORY_PORTRAITS: Record<StoryPortraits, string> = { large: 'Large', small: 'Small', off: 'Off' };

const BATTLE_NARRATION_LABELS: Record<BattleNarrationMode, string> = { off: 'Off', key: 'Key moments', all: 'Every comment' };

export function Settings({ onClose }: Props) {
  const t = useT();
  const prefs = usePrefs();
  const [tab, setTab] = useState<Tab>('game');
  const tabs = (Object.keys(SETTINGS_TABS) as Tab[]).map((id) => ({ id, label: t(SETTINGS_TABS[id]) }));
  return (
    <Window title={t('Settings')} icon="settings" size="small" className="settings" onClose={onClose} tabs={<TabBar tabs={tabs} value={tab} onChange={setTab} />}>
      <div className="settings-body">
        {tab === 'game' && (
          <>
            <div className="setting"><span>{t('Interface language')} <Info text={t('The language of the story is chosen by the host of the table.')} /></span><LangSwitch /></div>
            <div className="setting">
              <span>{t('Voice input')} <Info text={t('Hold the microphone beside the text box, or Ctrl+M, and speak. The words land in the box, so you can fix them before sending.')} /></span>
              <span className="muted small">{dictationBlocker() === 'insecure' ? t('Voice input needs a secure connection (https). Ask whoever runs this server to switch on HTTPS.') : dictationBlocker() === 'unsupported' ? t('This browser cannot turn speech into text. Chrome, Edge and Safari can.') : t('Available')}</span>
            </div>
            <div className="setting">
              <span>{t('Edge scrolling in fights')} <Info text={t('When the battle map is zoomed in, pointing at its edge moves the view that way. Dragging the map and Shift with the arrow keys work too.')} /></span>
              <button type="button" role="switch" aria-checked={prefs.edgeScroll} className={prefs.edgeScroll ? 'switch on' : 'switch'}
                onClick={() => { setPrefs({ edgeScroll: !prefs.edgeScroll }); sfx('tab'); }}>{prefs.edgeScroll ? t('On') : t('Off')}</button>
            </div>
            <div className="setting">
              <span>{t('End turn reminder')} <Info text={t('On your turn in a fight, the End turn button glows and a short note appears when you have done nothing for this long, and soon after you have used up your action and movement. Moving the mouse or pressing a key puts it away. The turn never ends by itself.')} /></span>
              <span className="pick">
                {TURN_REMINDERS.map((s) => <button key={s} type="button" className={prefs.turnReminder === s ? 'on' : ''} aria-pressed={prefs.turnReminder === s} onClick={() => { setPrefs({ turnReminder: s }); sfx('tab'); }}>{s ? t('{n} s', { n: s }) : t('Off')}</button>)}
              </span>
            </div>
            <div className="setting">
              <span>{t('Battle ground')} <Info text={t('Painted: the battle map as one painted picture, with soft ground, water and inked trees. Pixel tiles: the older square tiles, which an art pack on the server can replace.')} /></span>
              <span className="pick">
                {(['painted', 'pixel'] as const).map((m) => <button key={m} type="button" className={prefs.battleGround === m ? 'on' : ''} aria-pressed={prefs.battleGround === m} onClick={() => { setPrefs({ battleGround: m }); sfx('tab'); }}>{t(m === 'painted' ? 'Painted' : 'Pixel tiles')}</button>)}
              </span>
            </div>
            <div className="setting">
              <span>{t('Portraits in the story')} <Info text={t('A framed face beside what a person says in the story, and beside what your hero says. On small screens the portraits shrink by themselves. Until a portrait is painted, an initial takes its place.')} /></span>
              <span className="pick">
                {(Object.keys(STORY_PORTRAITS) as StoryPortraits[]).map((m) => <button key={m} type="button" className={prefs.storyPortraits === m ? 'on' : ''} aria-pressed={prefs.storyPortraits === m} onClick={() => { setPrefs({ storyPortraits: m }); sfx('tab'); }}>{t(STORY_PORTRAITS[m])}</button>)}
              </span>
            </div>
            <div className="setting">
              <span>{t('Text size')} <Info text={t('For the story, the journal and item descriptions.')} /></span>
              <span className="pick">
                {TEXT_SIZES.map((s) => <button key={s} type="button" className={prefs.textSize === s ? 'on' : ''} aria-pressed={prefs.textSize === s} onClick={() => { setPrefs({ textSize: s }); sfx('tab'); }}>{t(SIZE_LABELS[s])}</button>)}
              </span>
            </div>
          </>
        )}
        {tab === 'sound' && (
          <>
            <div className="setting setting-mix"><span>{t('Sound')} <Info text={t('Music, ambient sound, effects, the narrator and the interface. The speaker in the top bar opens the same controls.')} /></span><SoundMixer /></div>
            <div className="setting">
              <span>{t('Narrator in fights')} <Info text={t('Key moments: the narrator reads only the big ones, such as the start and the end of a fight, a creature or hero going down, or a critical hit. Every comment: also the short remarks in between, which come every few rounds. A line that is out of date by the time it would be read is skipped.')} /></span>
              <span className="pick">
                {BATTLE_NARRATION_MODES.map((m) => <button key={m} type="button" className={prefs.battleNarration === m ? 'on' : ''} aria-pressed={prefs.battleNarration === m} onClick={() => { setPrefs({ battleNarration: m }); sfx('tab'); }}>{t(BATTLE_NARRATION_LABELS[m])}</button>)}
              </span>
            </div>
          </>
        )}
        {tab === 'keys' && (
          <ul className="shortcuts">
            {SHORTCUTS.map((s) => (
              <li key={s.text}><span className="keys">{s.keys.map((k, i) => <span key={k}>{i > 0 && (s.combo ? '+' : s.keys.length === 2 ? '–' : '')}<Kbd>{k}</Kbd></span>)}</span>{t(s.text)}</li>
            ))}
          </ul>
        )}
      </div>
    </Window>
  );
}
