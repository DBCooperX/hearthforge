// Voice input: speak instead of typing. The browser's own speech recognition writes what the player says into the
// text box, where it can be fixed before it is sent. Chrome, Edge and Safari have it; Firefox does not. Browsers only
// allow the microphone on https (or on localhost), so without either the button is not shown at all.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '../../shared/i18n';
import { useT } from './i18n';

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Why there is no microphone button, or null when there is one. */
export function dictationBlocker(): 'insecure' | 'unsupported' | null {
  if (typeof window === 'undefined') return 'unsupported';
  if (!recognitionCtor()) return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  return null;
}

/** The recognition language for the interface language. Swiss players speak Standard German with a Swiss accent. */
export const dictationLang = (lang: Lang) => (lang === 'de' ? 'de-CH' : 'en-GB');

/** Swiss spelling, as everywhere else in the game. */
export const swiss = (text: string, lang: Lang) => (lang === 'de' ? text.replace(/ß/g, 'ss') : text);

export type DictationError = 'denied' | 'no_speech' | 'failed' | null;

/**
 * Speech recognition for one text box. `onText` gets the box's whole new text: what was there when listening began,
 * plus everything heard so far, so a player sees the words arrive as they speak.
 */
export function useDictation(lang: Lang, base: () => string, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<DictationError>(null);
  const rec = useRef<Recognition | null>(null);
  const keep = useRef({ base, onText });
  keep.current = { base, onText };

  const stop = useCallback(() => { rec.current?.stop(); }, []);
  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || rec.current) return;
    const r = new Ctor();
    r.lang = dictationLang(lang);
    r.continuous = true;
    r.interimResults = true;
    const before = keep.current.base().trim();
    let heard = '';
    r.onresult = (e) => {
      let final = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final += res[0].transcript; else interim += res[0].transcript;
      }
      heard = swiss(`${final}${interim}`.replace(/\s+/g, ' ').trim(), lang);
      if (heard) keep.current.onText(`${before ? `${before} ` : ''}${heard.charAt(0).toUpperCase()}${heard.slice(1)}`.slice(0, 500));
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('denied');
      else if (e.error === 'no-speech') setError('no_speech');
      else if (e.error !== 'aborted') setError('failed');
    };
    r.onend = () => { rec.current = null; setListening(false); };
    rec.current = r;
    setError(null);
    try { r.start(); setListening(true); } catch { rec.current = null; setError('failed'); }
  }, [lang]);

  useEffect(() => () => rec.current?.abort(), []);
  return { listening, error, start, stop };
}

const HOLD_MS = 350;

/**
 * The microphone beside the text box. Hold it to talk and let go to stop (push to talk), or tap it once to start and
 * again to stop. Ctrl+M works the same way from the keyboard.
 */
export function MicButton({ lang, text, setText, disabled }: { lang: Lang; text: string; setText: (text: string) => void; disabled?: boolean }) {
  const t = useT();
  const textRef = useRef(text);
  textRef.current = text;
  const { listening, error, start, stop } = useDictation(lang, () => textRef.current, setText);
  const pressedAt = useRef(0);
  const blocker = dictationBlocker();

  useEffect(() => {
    if (blocker) return;
    let held = false;
    const down = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'm') || e.repeat) { if (e.repeat && held) e.preventDefault(); return; }
      e.preventDefault();
      held = true;
      start();
    };
    const up = (e: KeyboardEvent) => { if (held && (e.key.toLowerCase() === 'm' || e.key === 'Control')) { held = false; stop(); } };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [blocker, start, stop]);

  if (blocker) return null;
  const message = error === 'denied' ? t('The browser does not allow the microphone. Allow it in the address bar.') : error === 'no_speech' ? t('Nothing was heard. Try again a little closer to the microphone.') : error ? t('Voice input did not work this time.') : null;
  return (
    <>
      <button
        type="button"
        className={listening ? 'mic on' : 'mic'}
        aria-pressed={listening}
        disabled={disabled}
        title={listening ? t('Listening… let go or tap again to stop') : t('Speak instead of typing: hold to talk, or tap to start and stop (Ctrl+M)')}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          pressedAt.current = Date.now();
          if (listening) { stop(); pressedAt.current = 0; } else start();
        }}
        onPointerUp={() => { if (pressedAt.current && Date.now() - pressedAt.current > HOLD_MS) stop(); pressedAt.current = 0; }}
        onPointerLeave={() => { if (pressedAt.current && Date.now() - pressedAt.current > HOLD_MS) stop(); pressedAt.current = 0; }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span className="sr-only">{t('Voice input')}</span>
      </button>
      {message && <span className="mic-error" role="status">{message}</span>}
    </>
  );
}
