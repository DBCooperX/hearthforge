// Settings: language, music, interface sounds, text size, the Dungeon Master's style, the keyboard
// shortcuts and the table, sorted into tabs so that nothing needs scrolling.
import { useState, type ReactNode } from 'react';
import { LangSwitch, useT } from '../i18n';
import { MusicControl } from '../music';
import { Info } from './Hint';
import { SETTINGS_TABS, SHORTCUTS, SIZE_LABELS, TEXT_SIZES } from './labels';
import { setPrefs, usePrefs } from './prefs';
import { sfx } from './sound';
import { Kbd, TabBar, Window } from './Window';
import { dictationBlocker } from '../dictation';

interface Props {
  onClose: () => void;
  /** Shown for the host only: abandon the adventure. */
  onNewAdventure?: () => void;
  onTable: () => void;
  onArt: () => void;
  /** Only for accounts with the Innkeeper role. */
  onInnkeeper?: () => void;
  onProfile: () => void;
  /** The Dungeon Master's style for this table. */
  children?: ReactNode;
}

type Tab = keyof typeof SETTINGS_TABS;

export function Settings({ onClose, onNewAdventure, onTable, onArt, onInnkeeper, onProfile, children }: Props) {
  const t = useT();
  const prefs = usePrefs();
  const [tab, setTab] = useState<Tab>('game');
  const tabs = (Object.keys(SETTINGS_TABS) as Tab[]).filter((id) => id !== 'dm' || !!children).map((id) => ({ id, label: t(SETTINGS_TABS[id]) }));
  return (
    <Window title={t('Settings')} icon="settings" size="small" className="settings" onClose={onClose} tabs={<TabBar tabs={tabs} value={tab} onChange={setTab} />}>
      <div className="settings-body">
        {tab === 'game' && (
          <>
            <div className="setting"><span>{t('Interface language')} <Info text={t('The language of the story is chosen by the host of the table.')} /></span><LangSwitch /></div>
            <div className="setting"><span>{t('Music')}</span><MusicControl /><span className="muted small setting-none">{t('Music is switched off on this server.')}</span></div>
            <div className="setting">
              <span>{t('Interface sounds')} <Info text={t('Quiet sounds for windows, pages and gear.')} /></span>
              <span className="setting-controls">
                <input type="range" min={0} max={1} step={0.05} value={prefs.soundVolume} disabled={!prefs.sounds} aria-label={t('Volume of the interface sounds')}
                  onChange={(e) => setPrefs({ soundVolume: Number(e.target.value) })} onPointerUp={() => sfx('equip')} />
                <button type="button" role="switch" aria-checked={prefs.sounds} className={prefs.sounds ? 'switch on' : 'switch'}
                  onClick={() => { setPrefs({ sounds: !prefs.sounds }); sfx('tab'); }}>{prefs.sounds ? t('On') : t('Off')}</button>
              </span>
            </div>
            <div className="setting">
              <span>{t('Voice input')} <Info text={t('Hold the microphone beside the text box, or Ctrl+M, and speak. The words land in the box, so you can fix them before sending.')} /></span>
              <span className="muted small">{dictationBlocker() === 'insecure' ? t('Voice input needs a secure connection (https). Ask whoever runs this server to switch on HTTPS.') : dictationBlocker() === 'unsupported' ? t('This browser cannot turn speech into text. Chrome, Edge and Safari can.') : t('On')}</span>
            </div>
            <div className="setting">
              <span>{t('Text size')} <Info text={t('For the story, the journal and item descriptions.')} /></span>
              <span className="pick">
                {TEXT_SIZES.map((s) => <button key={s} type="button" className={prefs.textSize === s ? 'on' : ''} aria-pressed={prefs.textSize === s} onClick={() => { setPrefs({ textSize: s }); sfx('tab'); }}>{t(SIZE_LABELS[s])}</button>)}
              </span>
            </div>
          </>
        )}
        {tab === 'dm' && children}
        {tab === 'keys' && (
          <ul className="shortcuts">
            {SHORTCUTS.map((s) => (
              <li key={s.text}><span className="keys">{s.keys.map((k, i) => <span key={k}>{i > 0 && (s.combo ? '+' : s.keys.length === 2 ? '–' : '')}<Kbd>{k}</Kbd></span>)}</span>{t(s.text)}</li>
            ))}
          </ul>
        )}
        {tab === 'table' && (
          <>
            <div className="setting"><span>{t('Table')}</span><button type="button" onClick={onTable}>{t('Players and invites')}</button></div>
            <div className="setting"><span>{t('Art credits')} <Info text={t('Who made the art used on this server. Only the Innkeeper can change it.')} /></span><button type="button" onClick={onArt}>{t('Open')}</button></div>
            <div className="setting"><span>{t('Your account')} <Info text={t('Your stats, your heroes and your password.')} /></span><button type="button" onClick={onProfile}>{t('Open')}</button></div>
            {onInnkeeper && <div className="setting"><span>{t('Innkeeper')} <Info text={t('For whoever runs this server: tables, players, art packs, API key, updates and backups.')} /></span><button type="button" onClick={onInnkeeper}>{t('Open')}</button></div>}
            {onNewAdventure && <div className="setting"><span>{t('New adventure')} <Info text={t('Ends this story for everyone at the table and starts a fresh one.')} /></span><button type="button" className="danger" onClick={onNewAdventure}>{t('New adventure')}</button></div>}
          </>
        )}
      </div>
    </Window>
  );
}
