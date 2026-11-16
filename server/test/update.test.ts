import { describe, expect, it } from 'vitest';
import { buildOf, isStale, mayAutoReload } from '../../shared/update';

const page = (hash: string) => `<!doctype html><html><head><script type="module" crossorigin src="/assets/index-${hash}.js"></script><link rel="stylesheet" href="/assets/index-${hash}.css"></head><body></body></html>`;

describe('client build detection', () => {
  it('names the build by the entry script', () => {
    expect(buildOf(page('abc123'))).toBe('/assets/index-abc123.js');
    expect(buildOf(page('abc123'))).not.toBe(buildOf(page('def456')));
  });

  it('knows nothing about a dev page or no page', () => {
    expect(buildOf('<script type="module" src="/src/main.tsx"></script>')).toBe('');
    expect(buildOf('')).toBe('');
  });

  it('calls a tab stale only when both builds are known and differ', () => {
    expect(isStale('/assets/index-a.js', '/assets/index-b.js')).toBe(true);
    expect(isStale('/assets/index-a.js', '/assets/index-a.js')).toBe(false);
    expect(isStale('', '/assets/index-b.js')).toBe(false);
    expect(isStale('/assets/index-a.js', '')).toBe(false);
    expect(isStale('/assets/index-a.js', undefined)).toBe(false);
  });

  it('reloads by itself only when nothing would be lost, and never in a loop', () => {
    const base = { seated: false, hasDraft: false, lastReload: 0, now: 1_000_000 };
    expect(mayAutoReload(base)).toBe(true);
    expect(mayAutoReload({ ...base, seated: true })).toBe(false);
    expect(mayAutoReload({ ...base, hasDraft: true })).toBe(false);
    expect(mayAutoReload({ ...base, lastReload: base.now - 5_000 })).toBe(false);
  });
});
