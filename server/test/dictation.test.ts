import { describe, expect, it } from 'vitest';
import { dictationError, dictationLangs } from '../../client/src/dictation';

describe('voice input errors', () => {
  it('names the reason instead of a general failure', () => {
    expect(dictationError('not-allowed')).toBe('denied');
    expect(dictationError('service-not-allowed')).toBe('service');
    expect(dictationError('audio-capture')).toBe('no_mic');
    expect(dictationError('network')).toBe('network');
    expect(dictationError('no-speech')).toBe('no_speech');
    expect(dictationError('aborted')).toBeNull();
    expect(dictationError('bad-grammar')).toBe('failed');
  });
  it('falls back from the Swiss and British variants', () => {
    expect(dictationLangs('de')).toEqual(['de-CH', 'de-DE', 'de']);
    expect(dictationLangs('en')[0]).toBe('en-GB');
  });
});
