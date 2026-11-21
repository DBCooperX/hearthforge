// The game menu, as in any PC role-playing game: Esc (or the menu button) opens it over the dimmed
// screen, and everything that is not part of playing lives here: settings, the adventure's rules,
// the party, the account, the Innkeeper, fullscreen and the way out.
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { Emblem } from './Brand';
import { Icon, type IconName } from './icons';
import { Kbd } from './Window';
import { sfx } from './sound';

export interface MenuEntry {
  id: string;
  label: string;
  icon: IconName;
  onClick: () => void;
  /** Painted red, for the entries that end something. */
  danger?: boolean;
  /** A short line under the label. */
  note?: string;
}

/** Entries are grouped; a thin rule separates the groups. */
export function GameMenu({ title, groups, onClose }: { title: string; groups: MenuEntry[][]; onClose: () => void }) {
  const t = useT();
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    first.current?.focus({ preventScroll: true });
    sfx('open');
    return () => { if (before?.isConnected) before.focus({ preventScroll: true }); };
  }, []);
  // Up and down walk the entries, like a menu on a game pad.
  const walk = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const all = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.menu-entry')];
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    all[(at + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus();
    sfx('tab');
  };
  let n = 0;
  return (
    <div className="overlay menu-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <nav className="panel game-menu" role="dialog" aria-modal="true" aria-label={t('Game menu')} onKeyDown={walk}>
        <header className="menu-head">
          <Emblem size={92} />
          <h1>{title}</h1>
          <div className="rune-line" aria-hidden="true" />
        </header>
        {groups.filter((g) => g.length).map((g, gi) => (
          <div key={gi} className="menu-group">
            {g.map((m) => {
              const ref = n++ === 0 ? first : undefined;
              return (
                <button key={m.id} ref={ref} type="button" className={m.danger ? 'menu-entry danger' : 'menu-entry'} data-menu={m.id}
                  onMouseEnter={(e) => e.currentTarget.focus({ preventScroll: true })} onClick={() => { sfx('tab'); m.onClick(); }}>
                  <Icon name={m.icon} size={19} />
                  <span>{m.label}{m.note && <small>{m.note}</small>}</span>
                </button>
              );
            })}
          </div>
        ))}
        <footer className="menu-foot"><Kbd>Esc</Kbd> {t('Close')}</footer>
      </nav>
    </div>
  );
}

/** The button that opens the menu, for the top bar and the lobby. */
export function MenuButton({ onClick, on }: { onClick: () => void; on?: boolean }) {
  const t = useT();
  return (
    <button type="button" className={on ? 'nav-btn icon-only menu-btn on' : 'nav-btn icon-only menu-btn'} onClick={onClick} title={`${t('Menu')} (Esc)`} aria-label={t('Menu')}>
      <Icon name="menu" size={19} />
    </button>
  );
}

/** Whether the page fills the screen, and a switch for it. Esc is kept for the game where the browser allows it. */
export function useFullscreen(): [boolean, () => void] {
  const [full, setFull] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) { void document.exitFullscreen().catch(() => {}); return; }
    const root = document.documentElement;
    if (!root.requestFullscreen) return;
    void root.requestFullscreen({ navigationUI: 'hide' }).then(() => {
      // Chrome and Edge can keep Esc for the page in fullscreen (holding Esc still leaves fullscreen).
      const kb = (navigator as Navigator & { keyboard?: { lock?: (keys: string[]) => Promise<void> } }).keyboard;
      void kb?.lock?.(['Escape']).catch(() => {});
    }).catch(() => {});
  };
  return [full, toggle];
}

export const canFullscreen = () => typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;

/**
 * Esc opens and closes the menu on screens that have no other use for it (the list of tables and
 * the table room). A window or dialog that is open keeps Esc for itself.
 */
export function useEscMenu(open: boolean, setOpen: (open: boolean) => void, blocked = false) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || blocked) return;
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') { el.blur(); return; }
      if (open) { setOpen(false); return; }
      // Something else is on top (the creator, a window, a dialog): it closes first.
      if (document.querySelector('.overlay, .creator-overlay, [role="dialog"]')) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, setOpen, blocked]);
}
