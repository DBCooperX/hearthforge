import { describe, expect, it } from 'vitest';
import { sfxEnabled } from '../src/sfx';

describe('sound effects switch', () => {
  it('is on unless switched off', () => {
    expect(sfxEnabled({})).toBe(true);
    expect(sfxEnabled({ HEARTHFORGE_SFX: 'OFF' })).toBe(false);
  });
});
