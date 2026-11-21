// What the browser's speech recognition reports, in the game's own terms. Kept apart from the React code so that
// the tests can load it.
import type { Lang } from '../../shared/i18n';

export type DictationError = 'denied' | 'service' | 'no_speech' | 'no_mic' | 'network' | 'failed' | null;

/** Languages to try in turn: some browsers know only the main variant (de-DE, en-US). */
export const dictationLangs = (lang: Lang) => (lang === 'de' ? ['de-CH', 'de-DE', 'de'] : ['en-GB', 'en-US', 'en']);

/** The browser's error code as one of ours. */
export function dictationError(code: string): DictationError {
  if (code === 'aborted') return null;
  if (code === 'not-allowed') return 'denied';
  // Safari says this when Dictation is switched off in macOS (or iOS) settings.
  if (code === 'service-not-allowed') return 'service';
  if (code === 'no-speech') return 'no_speech';
  if (code === 'audio-capture') return 'no_mic';
  if (code === 'network') return 'network';
  return 'failed';
}
