// The game's own "are you sure?" dialog, in place of the browser's confirm() box: the same frame
// as every window, Enter confirms, Esc cancels. `ask()` can be called from anywhere and resolves
// once the player has answered; <ConfirmHost /> is mounted once at the top of the app.
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { sfx } from './sound';

export interface AskOptions {
  /** The button that confirms. Defaults to "Yes". */
  ok?: string;
  /** Paints the confirm button red: for deleting, removing, ending. */
  danger?: boolean;
}

interface Pending extends AskOptions { text: string; done: (yes: boolean) => void }

let show: ((p: Pending) => void) | null = null;

/** Asks the player a yes/no question in a game dialog. Falls back to the browser's box if no host is mounted (tests). */
export function ask(text: string, options: AskOptions = {}): Promise<boolean> {
  if (!show) return Promise.resolve(window.confirm(text));
  return new Promise((done) => show!({ text, ...options, done }));
}

export function ConfirmHost() {
  const t = useT();
  const [list, setList] = useState<Pending[]>([]);
  const yesRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    show = (p) => setList((l) => [...l, p]);
    return () => { show = null; };
  }, []);
  const now = list[0];
  const answer = (yes: boolean) => {
    if (!now) return;
    now.done(yes);
    sfx(yes ? 'tab' : 'close');
    setList((l) => l.slice(1));
  };
  useEffect(() => {
    if (!now) return;
    const before = document.activeElement as HTMLElement | null;
    yesRef.current?.focus({ preventScroll: true });
    sfx('open');
    // Captured before any other listener, so Esc here never also closes the window underneath.
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); answer(false); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); answer(true); }
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); if (before?.isConnected) before.focus({ preventScroll: true }); };
  }, [now]);
  if (!now) return null;
  return (
    <div className="overlay confirm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) answer(false); }}>
      <div className="panel confirm" role="alertdialog" aria-modal="true" aria-label={now.text}>
        <div className="confirm-rule" aria-hidden />
        <p>{now.text}</p>
        <div className="confirm-buttons">
          <button type="button" onClick={() => answer(false)}>{t('Cancel')}</button>
          <button ref={yesRef} type="button" className={now.danger ? 'danger solid' : 'primary'} onClick={() => answer(true)}>{now.ok ?? t('Yes')}</button>
        </div>
      </div>
    </div>
  );
}
