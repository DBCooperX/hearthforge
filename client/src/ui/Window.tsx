// The one window every overlay is built from: the same frame, title bar, tabs and close button,
// the same way in (a short rise) and the same way out (Esc, the close button or a click beside it).
import { useEffect, useRef, type ReactNode } from 'react';
import { CLASS_INFO } from '../../../shared/content';
import type { Character, GameState } from '../../../shared/types';
import { artOfCharacter, companionFace, heroPortraitUrl } from '../game/heroArt';
import { classLabel } from '../game/util';
import { useT } from '../i18n';
import { Icon, type IconName } from './icons';
import { sfx } from './sound';

/** A key cap, for showing which key does something. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function CloseButton({ onClose, label }: { onClose: () => void; label?: string }) {
  const t = useT();
  return (
    <button type="button" className="win-close" onClick={onClose} aria-label={label ?? t('Close')} title={`${label ?? t('Close')} (Esc)`}>
      <Icon name="close" size={16} />
    </button>
  );
}

interface WindowProps {
  title: string;
  icon?: IconName;
  /** The key that opens and closes this window, shown beside the title. */
  hotkey?: string;
  /** Extra text in the title bar, after the title. */
  subtitle?: ReactNode;
  /** Sets the width and height: see ui.css. */
  size?: 'small' | 'medium' | 'large' | 'book' | 'map';
  className?: string;
  /** A strip under the title bar, for hero or section tabs. */
  tabs?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export function Window({ title, icon, hotkey, subtitle, size = 'medium', className, tabs, footer, onClose, children }: WindowProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Take the keyboard away from whatever was focused behind the window, and give it back afterwards.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    sfx('open');
    return () => { sfx('close'); if (before?.isConnected) before.focus({ preventScroll: true }); };
  }, []);
  return (
    <div className="overlay win-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={['panel', 'win', `win-${size}`, className].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <span className="win-corner tl" /><span className="win-corner tr" /><span className="win-corner bl" /><span className="win-corner br" />
        <header className="win-head">
          {icon && <span className="win-icon"><Icon name={icon} size={20} /></span>}
          <h1>{title}</h1>
          {hotkey && <Kbd>{hotkey}</Kbd>}
          {subtitle && <span className="win-sub">{subtitle}</span>}
          <span className="spacer" />
          <CloseButton onClose={onClose} />
        </header>
        {tabs && <div className="win-tabs">{tabs}</div>}
        <div className="win-body">{children}</div>
        {footer && <footer className="win-foot">{footer}</footer>}
      </div>
    </div>
  );
}

interface HeroTabsProps {
  state: GameState;
  selectedId: string;
  onSelect: (id: string) => void;
  /** Called when something is dropped on another hero's tab. */
  onDropOn?: (c: Character, shift: boolean) => void;
  /** Whether a drop is on offer right now. */
  dropping?: boolean;
  /** Also list the companions travelling with the party, after the heroes. */
  companions?: boolean;
}

/** One tab per hero, with portrait, class and health. The number keys 1 to 4 switch between them. */
export function HeroTabs({ state, selectedId, onSelect, onDropOn, dropping, companions }: HeroTabsProps) {
  const t = useT();
  const heroes = state.characters;
  const along = companions ? (state.companions ?? []).filter((c) => !c.dead) : [];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
      const hero = /^[1-9]$/.test(e.key) ? heroes[Number(e.key) - 1] : undefined;
      if (hero && hero.id !== selectedId) { onSelect(hero.id); sfx('tab'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [heroes, selectedId, onSelect]);
  return (
    <div className="hero-tabs" role="tablist">
      {heroes.map((c, i) => {
        const hp = Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100));
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === selectedId}
            className={['hero-tab', c.id === selectedId && 'on', dropping && c.id !== selectedId && 'drop'].filter(Boolean).join(' ')}
            style={{ '--class': CLASS_INFO[c.classId].color } as React.CSSProperties}
            onClick={() => { if (c.id !== selectedId) { onSelect(c.id); sfx('tab'); } }}
            onDragOver={(e) => { if (dropping && c.id !== selectedId) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); if (c.id !== selectedId) onDropOn?.(c, e.shiftKey); }}
          >
            <span className="hero-tab-face"><img className="hero-art" src={heroPortraitUrl(artOfCharacter(c, state.items))} alt="" /></span>
            <span className="hero-tab-text">
              <b>{c.name}</b>
              <small>{classLabel(c, t)} {c.level}</small>
              <span className="hero-tab-hp"><i style={{ width: `${hp}%` }} /></span>
            </span>
            <Kbd>{i + 1}</Kbd>
          </button>
        );
      })}
      {along.map((c) => (
        <button
          key={c.id}
          type="button"
          role="tab"
          aria-selected={c.id === selectedId}
          className={['hero-tab', 'companion', c.id === selectedId && 'on', dropping && c.id !== selectedId && 'drop'].filter(Boolean).join(' ')}
          title={t('Companion')}
          onClick={() => { if (c.id !== selectedId) { onSelect(c.id); sfx('tab'); } }}
          onDragOver={(e) => { if (dropping && c.id !== selectedId) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); if (c.id !== selectedId) onDropOn?.(c, e.shiftKey); }}
        >
          <span className="hero-tab-face"><img className="hero-art" src={companionFace(c, state.items)} alt="" /></span>
          <span className="hero-tab-text">
            <b>{c.name}</b>
            <small>{c.companion?.role}</small>
            <span className="hero-tab-hp"><i style={{ width: `${Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100))}%` }} /></span>
          </span>
        </button>
      ))}
    </div>
  );
}

interface TabDef<T extends string> { id: T; label: string; icon?: IconName; count?: number }

/** Section tabs inside a window. */
export function TabBar<T extends string>({ tabs, value, onChange, sound = 'tab', className }: { tabs: TabDef<T>[]; value: T; onChange: (id: T) => void; sound?: 'tab' | 'page'; className?: string }) {
  return (
    <div className={['tabbar', className].filter(Boolean).join(' ')} role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" aria-selected={tab.id === value} className={tab.id === value ? 'tabbar-tab on' : 'tabbar-tab'}
          onClick={() => { if (tab.id !== value) { onChange(tab.id); sfx(sound); } }}>
          {tab.icon && <Icon name={tab.icon} size={16} />}
          <span>{tab.label}</span>
          {tab.count !== undefined && <span className="tabbar-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}
