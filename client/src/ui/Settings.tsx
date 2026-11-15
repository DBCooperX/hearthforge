// Settings: language, music, interface sounds, text size and the keyboard shortcuts in one place.
import type { ReactNode } from 'react';
import { LangSwitch, useT } from '../i18n';
import { MusicControl } from '../music';
import { SHORTCUTS, SIZE_LABELS, TEXT_SIZES } from './labels';
import { setPrefs, usePrefs } from './prefs';
import { sfx } from './sound';
import { Kbd, Window } from './Window';

interface Props {
  onClose: () => void;
  /** Shown for the host only: abandon the adventure. */
  onNewAdventure?: () => void;
  onTable: () => void;
  onArt: () => void;
  onInnkeeper: () => void;
  children?: ReactNode;
}

export function Settings({ onClose, onNewAdventure, onTable, onArt, onInnkeeper }: Props) {
  const t = useT();
  const prefs = usePrefs();
  return (
    <Window title={t('Settings')} icon="settings" size="small" className="settings" onClose={onClose}>
      <div className="settings-body">
        <section>
          <h3>{t('Language')}</h3>
          <div className="setting"><span>{t('Interface language')}<small>{t('The language of the story is chosen by the host of the table.')}</small></span><LangSwitch /></div>
        </section>
        <section>
          <h3>{t('Sound')}</h3>
          <div className="setting"><span>{t('Music')}</span><MusicControl /><span className="muted small setting-none">{t('Music is switched off on this server.')}</span></div>
          <div className="setting">
            <span>{t('Interface sounds')}<small>{t('Quiet sounds for windows, pages and gear.')}</small></span>
            <span className="setting-controls">
              <input type="range" min={0} max={1} step={0.05} value={prefs.soundVolume} disabled={!prefs.sounds} aria-label={t('Volume of the interface sounds')}
                onChange={(e) => setPrefs({ soundVolume: Number(e.target.value) })} onPointerUp={() => sfx('equip')} />
              <button type="button" role="switch" aria-checked={prefs.sounds} className={prefs.sounds ? 'switch on' : 'switch'}
                onClick={() => { setPrefs({ sounds: !prefs.sounds }); sfx('tab'); }}>{prefs.sounds ? t('On') : t('Off')}</button>
            </span>
          </div>
        </section>
        <section>
          <h3>{t('Reading')}</h3>
          <div className="setting">
            <span>{t('Text size')}<small>{t('For the story, the journal and item descriptions.')}</small></span>
            <span className="pick">
              {TEXT_SIZES.map((s) => <button key={s} type="button" className={prefs.textSize === s ? 'on' : ''} aria-pressed={prefs.textSize === s} onClick={() => { setPrefs({ textSize: s }); sfx('tab'); }}>{t(SIZE_LABELS[s])}</button>)}
            </span>
          </div>
        </section>
        <section>
          <h3>{t('Art')}</h3>
          <div className="setting"><span>{t('Art packs')}<small>{t('The packs in use on this server, with their credits.')}</small></span><button type="button" onClick={onArt}>{t('Art & Assets')}</button></div>
        </section>
        <section>
          <h3>{t('Keyboard')}</h3>
          <ul className="shortcuts">
            {SHORTCUTS.map((s) => (
              <li key={s.text}><span className="keys">{s.keys.map((k, i) => <span key={k}>{i > 0 && (s.keys.length === 2 ? '–' : '')}<Kbd>{k}</Kbd></span>)}</span>{t(s.text)}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3>{t('Server')}</h3>
          <div className="setting"><span>{t('Innkeeper')}<small>{t('For whoever runs this server: tables, players, art packs, API key, updates and backups.')}</small></span><button type="button" onClick={onInnkeeper}>{t('Open')}</button></div>
        </section>
        <section>
          <h3>{t('Table')}</h3>
          <div className="row">
            <button type="button" onClick={onTable}>{t('Players and invites')}</button>
            {onNewAdventure && <button type="button" className="link danger" onClick={onNewAdventure}>{t('New adventure')}</button>}
          </div>
        </section>
      </div>
    </Window>
  );
}
