// Background music. One player for the whole page: it follows the game's music context,
// crossfades between tracks, and remembers each player's mute and volume in the browser.
import { useEffect, useSyncExternalStore } from 'react';
import { MUSIC_FALLBACK, type MusicContext, type MusicManifest, type MusicTrack } from '../../shared/music';
import { useT } from './i18n';

const KEY = 'hearthforge.music';
const FADE = 2.2;
/** Fights cut in faster than a walk into town. */
const FADE_FIGHT = 0.9;

interface Settings { muted: boolean; volume: number }
interface Voice { track: MusicTrack; context: MusicContext; el: HTMLAudioElement; gain: GainNode }
export interface MusicSnapshot extends Settings {
  /** The server has music switched on. */
  enabled: boolean;
  /** At least one track is on the server. */
  available: boolean;
  pending: boolean;
  /** The browser has let us start playing (it needs a first click or key press). */
  unlocked: boolean;
  context: MusicContext;
  track: MusicTrack | null;
}

function storedSettings(): Settings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && typeof v.muted === 'boolean' && typeof v.volume === 'number') return { muted: v.muted, volume: Math.min(1, Math.max(0, v.volume)) };
  } catch { /* private window or old value */ }
  return { muted: false, volume: 0.5 };
}

class MusicPlayer {
  private settings = storedSettings();
  private manifest: MusicManifest = { enabled: true, pending: false, tracks: [] };
  private context: MusicContext = 'tavern';
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voice: Voice | null = null;
  /** Where each context's music was interrupted, so the tavern tune resumes after a fight. */
  private resume = new Map<MusicContext, { id: string; time: number }>();
  private lastPlayed = new Map<MusicContext, string>();
  private listeners = new Set<() => void>();
  private snap: MusicSnapshot;
  private started = false;

  constructor() { this.snap = this.snapshot(); }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => void this.listeners.delete(fn); };
  getSnapshot = () => this.snap;

  private snapshot(): MusicSnapshot {
    return {
      ...this.settings, enabled: this.manifest.enabled, available: this.manifest.tracks.length > 0, pending: this.manifest.pending,
      unlocked: !!this.ctx && this.ctx.state === 'running', context: this.context, track: this.voice?.track ?? null,
    };
  }
  private emit() { this.snap = this.snapshot(); this.listeners.forEach((fn) => fn()); }

  /** Load the track list and wait for the first click or key press, which browsers require before any sound. */
  start() {
    if (this.started) return;
    this.started = true;
    void this.loadManifest();
    const unlock = () => {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        try {
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.master.gain.value = this.settings.muted ? 0 : this.settings.volume;
          this.master.connect(this.ctx.destination);
          this.ctx.onstatechange = () => this.emit();
        } catch { this.ctx = null; return; }
      }
      void this.ctx.resume().then(() => { this.sync(); this.emit(); }).catch(() => {});
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private async loadManifest() {
    try {
      const res = await fetch('/api/music');
      if (res.ok) this.manifest = await res.json() as MusicManifest;
    } catch { /* stay silent */ }
    this.sync();
    this.emit();
    // The server may still be downloading tracks after a fresh install.
    if (this.manifest.pending) setTimeout(() => void this.loadManifest(), 20_000);
  }

  setContext(context: MusicContext) {
    if (context === this.context) return;
    this.context = context;
    this.sync();
    this.emit();
  }

  setMuted(muted: boolean) { this.save({ ...this.settings, muted }); }
  /** Dragging the slider to zero mutes, and keeps the old volume for when the music is turned back on. */
  setVolume(volume: number) { this.save(volume <= 0 ? { ...this.settings, muted: true } : { muted: false, volume: Math.min(1, volume) }); }

  private save(next: Settings) {
    this.settings = next;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* applies until the page closes */ }
    if (this.ctx && this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(next.muted ? 0 : next.volume, now, 0.08);
    }
    this.sync();
    this.emit();
  }

  private candidates(context: MusicContext): MusicTrack[] {
    for (const c of [context, ...MUSIC_FALLBACK[context]]) {
      const found = this.manifest.tracks.filter((t) => t.context === c);
      if (found.length) return found;
    }
    return [];
  }

  /** Bring what is playing in line with the context, the track list and the mute setting. */
  private sync() {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return;
    const options = this.settings.muted ? [] : this.candidates(this.context);
    if (this.voice && this.voice.context === this.context && options.some((t) => t.id === this.voice!.track.id)) return;
    const fight = this.context === 'combat' || this.context === 'boss';
    this.fadeOut(fight ? FADE_FIGHT : FADE);
    if (!options.length) return;
    const saved = this.resume.get(this.context);
    const resumed = !fight && saved ? options.find((t) => t.id === saved.id) : undefined;
    this.play(resumed ?? this.pick(options), resumed ? saved!.time : 0, fight ? FADE_FIGHT : FADE);
  }

  private pick(options: MusicTrack[]): MusicTrack {
    const last = this.lastPlayed.get(this.context);
    const fresh = options.length > 1 ? options.filter((t) => t.id !== last) : options;
    return fresh[Math.floor(Math.random() * fresh.length)];
  }

  private play(track: MusicTrack, at: number, fade: number) {
    const ctx = this.ctx!;
    const el = new Audio(track.src);
    el.preload = 'auto';
    const gain = ctx.createGain();
    gain.gain.value = 0;
    try { ctx.createMediaElementSource(el).connect(gain).connect(this.master!); } catch { return; }
    const voice: Voice = { track, context: this.context, el, gain };
    this.voice = voice;
    this.lastPlayed.set(this.context, track.id);
    if (at > 0) el.addEventListener('loadedmetadata', () => { if (at < el.duration - 5) el.currentTime = at; }, { once: true });
    const next = () => {
      if (this.voice !== voice) return;
      this.resume.delete(voice.context);
      this.drop(voice);
      this.voice = null;
      this.sync();
      this.emit();
    };
    el.addEventListener('ended', next);
    // A broken or missing file: forget it and try another one.
    el.addEventListener('error', () => {
      if (this.voice !== voice) return;
      this.manifest = { ...this.manifest, tracks: this.manifest.tracks.filter((t) => t.id !== track.id) };
      next();
    });
    el.play().then(() => {
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + fade);
    }).catch(() => { /* the error handler above, or the browser wants another gesture */ });
  }

  private fadeOut(fade: number) {
    const voice = this.voice;
    if (!voice || !this.ctx) return;
    this.voice = null;
    this.resume.set(voice.context, { id: voice.track.id, time: voice.el.currentTime });
    const now = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + fade);
    setTimeout(() => this.drop(voice), fade * 1000 + 100);
  }

  private drop(voice: Voice) {
    voice.el.pause();
    voice.el.removeAttribute('src');
    voice.el.load();
    voice.gain.disconnect();
  }
}

export const music = new MusicPlayer();

/** Keep the music in step with the game. Call once, near the top of the app. */
export function useMusic(context: MusicContext) {
  useEffect(() => { music.start(); }, []);
  useEffect(() => { music.setContext(context); }, [context]);
}

/** Mute button and volume slider, with the current track's credit on hover. */
export function MusicControl() {
  const t = useT();
  const m = useSyncExternalStore(music.subscribe, music.getSnapshot);
  if (!m.enabled) return null;
  const silent = m.muted;
  let status: string;
  if (!m.available) status = m.pending ? t('The server is still fetching the music…') : t('No music on this server yet.');
  else if (silent) status = t('Music is off');
  else if (!m.unlocked) status = t('Music starts with your first click.');
  else if (m.track) status = `${t('Now playing')}: ${m.track.title}${m.track.artist ? ` · ${m.track.artist}` : ''}${m.track.license ? ` · ${m.track.license}` : ''}`;
  else status = t('No music for this scene.');
  return (
    <span className={`music ${silent || !m.available ? 'off' : ''}`} role="group" aria-label={t('Music')}>
      <button type="button" className="music-toggle" onClick={() => music.setMuted(!silent)} aria-pressed={!silent} title={silent ? t('Turn music on') : t('Turn music off')}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M9 17.5V5.2l10-2v12.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="6.5" cy="17.6" rx="2.9" ry="2.3" fill="currentColor" />
          <ellipse cx="16.5" cy="15.4" rx="2.9" ry="2.3" fill="currentColor" />
          {silent && <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
        </svg>
      </button>
      <input
        type="range" min={0} max={100} step={1} value={m.muted ? 0 : Math.round(m.volume * 100)}
        onChange={(e) => music.setVolume(Number(e.target.value) / 100)}
        aria-label={t('Music volume')} title={t('Music volume')}
      />
      <span className="music-now" role="status">{status}</span>
    </span>
  );
}
