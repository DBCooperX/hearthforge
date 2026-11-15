import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MusicManifest, MusicTrack } from '../../shared/music';

// A tiny stand-in for the browser, enough to drive the music player.
const played: string[] = [];
const dropped: string[] = [];
const node = () => ({ connect: (n: unknown) => n, disconnect: () => {}, gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} } });
class FakeAudio {
  listeners = new Map<string, () => void>();
  currentTime = 0; duration = 100; loop = false; preload = '';
  constructor(public src: string) {}
  addEventListener(n: string, f: () => void) { this.listeners.set(n, f); }
  play() { played.push(this.src); return Promise.resolve(); }
  pause() { dropped.push(this.src); }
  removeAttribute() {}
  load() {}
}
class FakeContext {
  state = 'running'; currentTime = 0; destination = {}; onstatechange: unknown;
  createGain = node;
  createMediaElementSource = () => node();
  resume() { return Promise.resolve(); }
}

const track = (id: string): MusicTrack => ({ id, context: 'tavern', layer: 'music', title: id, artist: '', license: '', src: `/music/${id}` });
const manifest = (...ids: string[]): MusicManifest => ({ enabled: true, pending: false, tracks: ids.map(track) });

describe('music player', () => {
  let served: MusicManifest;
  beforeEach(() => {
    played.length = 0; dropped.length = 0;
    vi.useFakeTimers();
    served = manifest('tavern/a.mp3', 'tavern/b.mp3');
    vi.stubGlobal('window', { AudioContext: FakeContext, addEventListener: () => {} });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(served), { status: 200 }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('stops a track the owner switched off and never picks it again', async () => {
    const { MusicPlayer } = await import('./music');
    const p = new MusicPlayer();
    await p.refresh();
    // The browser has been unlocked by a click.
    (p as unknown as { ctx: FakeContext; master: unknown }).ctx = new FakeContext();
    (p as unknown as { master: unknown }).master = node();
    await p.refresh();
    const first = p.getSnapshot().track!;
    expect(first).toBeTruthy();

    // The owner switches that track off; the next refresh must fade it out and play the other one.
    served = manifest(...['tavern/a.mp3', 'tavern/b.mp3'].filter((id) => id !== first.id));
    await p.refresh();
    expect(p.getSnapshot().track?.id).not.toBe(first.id);
    expect(p.getSnapshot().track).toBeTruthy();
    vi.advanceTimersByTime(5_000);
    expect(dropped.some((s) => s === first.src)).toBe(true);

    for (let i = 0; i < 20; i++) {
      await p.refresh();
      expect(p.getSnapshot().track?.id).not.toBe(first.id);
    }
  });

  it('goes quiet when the last track of every scene is switched off', async () => {
    const { MusicPlayer } = await import('./music');
    const p = new MusicPlayer();
    await p.refresh();
    (p as unknown as { ctx: FakeContext }).ctx = new FakeContext();
    (p as unknown as { master: unknown }).master = node();
    await p.refresh();
    expect(p.getSnapshot().track).toBeTruthy();
    served = manifest();
    await p.refresh();
    expect(p.getSnapshot().track).toBeNull();
  });
});
