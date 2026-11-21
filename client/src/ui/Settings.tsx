// The player's own settings, opened from the game menu: the game (language, text size, voice input,
// edge scrolling), the sound and the keyboard. What belongs to the table or the server is in the menu itself.
import { useState } from 'react';
import { LangSwitch, useT } from '../i18n';
import { SoundMixer } from '../music';
import { Info } from './Hint';
import { SETTINGS_TABS, SHORTCUTS, SIZE_LABELS, TEXT_SIZES } from './labels';
import { setPrefs, usePrefs } from './prefs';
import { sfx } from './sound';
import { Kbd, TabBar, Window } from './Window';
import { dictationBlocker } from '../dictation';

interface Props {
  onClose: () => void;
}

type Tab = keyof typeof SETTINGS_TABS;

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
              <span className="muted small">{dictationBlocker() === 'insecure' ? t('Voice input needs a secure connection (https). Ask whoever runs this server to switch on HTTPS.') : dictationBlocker() === 'unsupported' ? t('This browser cannot turn speech into text. Chrome, Edge and Safari can.') : t('On')}</span>
            </div>
            <div className="setting">
              <span>{t('Edge scrolling in fights')} <Info text={t('When the battle map is zoomed in, pointing at its edge moves the view that way. Dragging the map and Shift with the arrow keys work too.')} /></span>
              <button type="button" role="switch" aria-checked={prefs.edgeScroll} className={prefs.edgeScroll ? 'switch on' : 'switch'}
                onClick={() => { setPrefs({ edgeScroll: !prefs.edgeScroll }); sfx('tab'); }}>{prefs.edgeScroll ? t('On') : t('Off')}</button>
            </div>
            <div className="setting">
              <span>{t('Text size')} <Info text={t('For the story, the journal and item descriptions.')} /></span>
              <span className="pick">
                {TEXT_SIZES.map((s) => <button key={s} type="button" className={prefs.textSize === s ? 'on' : ''} aria-pressed={prefs.textSize === s} onClick={() => { setPrefs({ textSize: s }); sfx('tab'); }}>{t(SIZE_LABELS[s])}</button>)}
              </span>
            </div>
          </>
        )}
        {tab === 'sound' && <div className="setting setting-mix"><span>{t('Sound')} <Info text={t('Music, ambient sound, effects, the narrator and the interface. The speaker in the top bar opens the same controls.')} /></span><SoundMixer /></div>}
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
