// The narrator: the Dungeon Master's story read aloud. The server makes the speech in the voice the Innkeeper chose;
// this player fetches it one part at a time, lowers the music while it speaks, and keeps each player's mute and volume
// in the browser.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { GameState } from '../../shared/types';
import type { VoiceManifest } from '../../shared/voice';
import { SESSION_HEADER, accountSession } from './account';
import { useT } from './i18n';
import { music } from './music';
import { masterLevel, onMasterChange } from './ui/prefs';

const KEY = 'hearthforge.narrator';
/** At most this many story entries wait to be read. In a busy fight the oldest are dropped. */
const MAX_QUEUE = 3;

interface Settings { muted: boolean; volume: number }
export interface NarratorSnapshot extends Settings {
  manifest: VoiceManifest;
  /** The story entry being read, if any. */
  playing: number | null;
  /** The browser refused to start sound before the first click. */
  blocked: boolean;
}

function storedSettings(): Settings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && typeof v.muted === 'boolean' && typeof v.volume === 'number') return { muted: v.muted, volume: Math.min(1, Math.max(0, v.volume)) };
  } catch { /* private window or old value */ }
  return { muted: false, volume: 0.85 };
}

interface Job { table: string; entry: number }

export class NarratorPlayer {
  private settings = storedSettings();
  private manifest: VoiceManifest = { enabled: false, provider: 'off', langs: [] };
  private queue: Job[] = [];
  private current: { job: Job; audio: HTMLAudioElement | null; cancelled: boolean } | null = null;
  private blocked = false;
  private listeners = new Set<() => void>();
  private snap: NarratorSnapshot;
  private started = false;

  constructor() {
    this.snap = this.snapshot();
    onMasterChange(() => { if (this.current?.audio) this.current.audio.volume = this.settings.volume * masterLevel(); });
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => void this.listeners.delete(fn); };
  getSnapshot = () => this.snap;
  private snapshot(): NarratorSnapshot { return { ...this.settings, manifest: this.manifest, playing: this.current?.job.entry ?? null, blocked: this.blocked }; }
  private emit() { this.snap = this.snapshot(); this.listeners.forEach((fn) => fn()); }

  start() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    void this.refresh();
    // The voice may still be downloading on a fresh server; look again now and then.
    setInterval(() => { if (!document.hidden) void this.refresh(); }, 60_000);
    // A refused start is retried on the next click, which browsers count as permission.
    window.addEventListener('pointerdown', () => { if (this.blocked) { this.blocked = false; this.emit(); void this.next(); } });
  }

  async refresh() {
    try {
      const res = await fetch('/api/voice', { cache: 'no-store' });
      if (res.ok) this.manifest = await res.json() as VoiceManifest;
    } catch { /* keep what we know */ }
    if (!this.manifest.enabled) this.stop();
    this.emit();
  }

  /** Whether a story in this language is read aloud for this player. */
  speaks(lang: string) { return this.manifest.enabled && this.manifest.langs.includes(lang as never) && !this.settings.muted; }

  /** Read a new story entry after whatever is being read now. */
  enqueue(table: string, entry: number) {
    if (this.queue.some((j) => j.entry === entry && j.table === table) || this.current?.job.entry === entry) return;
    this.queue.push({ table, entry });
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
    if (!this.current) void this.next();
  }

  /** Read this entry now, or stop when it is the one being read. */
  toggle(table: string, entry: number) {
    if (this.current?.job.entry === entry) return this.stop();
    this.stop();
    this.queue = [{ table, entry }];
    this.blocked = false;
    void this.next();
  }

  stop() {
    this.queue = [];
    if (this.current) {
      this.current.cancelled = true;
      this.current.audio?.pause();
      this.current = null;
    }
    music.duck(false);
    this.emit();
  }

  setMuted(muted: boolean) { this.save({ ...this.settings, muted }); if (muted) this.stop(); }
  /** Dragging to zero mutes, and keeps the old volume for later. */
  setVolume(volume: number) { volume <= 0 ? this.setMuted(true) : this.save({ ...this.settings, muted: false, volume: Math.min(1, volume) }); }

  private save(next: Settings) {
    this.settings = next;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* applies until the page closes */ }
    if (this.current?.audio) this.current.audio.volume = next.volume * masterLevel();
    this.emit();
  }

  private async fetchPart(job: Job, part: number): Promise<{ url: string; parts: number } | null> {
    const res = await fetch(`/api/voice/line?table=${encodeURIComponent(job.table)}&entry=${job.entry}&part=${part}`, { headers: { [SESSION_HEADER]: accountSession() } });
    if (!res.ok) return null;
    const parts = Number(res.headers.get('x-parts')) || 1;
    return { url: URL.createObjectURL(await res.blob()), parts };
  }

  private async next(): Promise<void> {
    if (this.current || this.blocked) return;
    const job = this.queue.shift();
    if (!job) { music.duck(false); this.emit(); return; }
    const me = { job, audio: null as HTMLAudioElement | null, cancelled: false };
    this.current = me;
    this.emit();
    try {
      let part = 0;
      let got = await this.fetchPart(job, 0);
      while (got && !me.cancelled) {
        const parts = got.parts;
        // The next part is fetched while this one plays.
        const following = part + 1 < parts ? this.fetchPart(job, part + 1).catch(() => null) : Promise.resolve(null);
        const audio = new Audio(got.url);
        audio.volume = this.settings.volume * masterLevel();
        me.audio = audio;
        music.duck(true);
        const url = got.url;
        await new Promise<void>((done, fail) => {
          audio.onended = () => done();
          audio.onpause = () => { if (me.cancelled) done(); };
          audio.onerror = () => done();
          audio.play().catch(fail);
        }).finally(() => URL.revokeObjectURL(url));
        if (me.cancelled) { void following.then((f) => f && URL.revokeObjectURL(f.url)); break; }
        part++;
        got = part < parts ? await following : null;
      }
    } catch (err) {
      // Browsers refuse sound until the player has clicked somewhere. Try again then, with this entry.
      if (err instanceof DOMException && err.name === 'NotAllowedError') { this.blocked = true; this.queue.unshift(job); }
    } finally {
      if (this.current === me) this.current = null;
      if (!this.current && (!this.queue.length || this.blocked)) music.duck(false);
      this.emit();
      if (!me.cancelled) void this.next();
    }
  }
}

export const narrator = new NarratorPlayer();

/** Read every new story entry aloud, as it arrives. Call once, near the top of the app. */
export function useNarrator(state: GameState | null) {
  const seen = useRef<{ room: string; last: number } | null>(null);
  useEffect(() => { narrator.start(); }, []);
  useEffect(() => {
    if (!state) { seen.current = null; narrator.stop(); return; }
    const last = state.log[state.log.length - 1]?.id ?? 0;
    const prev = seen.current;
    seen.current = { room: state.room, last };
    // A new table, a reload or a first look is not news: nothing old is read out.
    if (!prev || prev.room !== state.room) { if (prev) narrator.stop(); return; }
    if (!narrator.speaks(state.language)) return;
    for (const l of state.log) if (l.id > prev.last && l.kind === 'dm') narrator.enqueue(state.room, l.id);
  }, [state]);
}

export function useNarratorState() {
  return useSyncExternalStore(narrator.subscribe, narrator.getSnapshot);
}

const SpeakerIcon = ({ off }: { off?: boolean }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M7 4.5h4a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H9.5L6 17.5v-3a3 3 0 0 1-2-2.8v-4.2a3 3 0 0 1 3-3z" fill="currentColor" />
    <path d="M17 7.5a5 5 0 0 1 0 7M19.5 5a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    {off && <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
  </svg>
);

/** The small button on a story card that reads it aloud, or stops it. */
export function ReadAloud({ table, entry, lang }: { table: string; entry: number; lang: string }) {
  const t = useT();
  const n = useNarratorState();
  if (!n.manifest.enabled || !n.manifest.langs.includes(lang as never)) return null;
  const on = n.playing === entry;
  return (
    <button type="button" className={on ? 'read-aloud on' : 'read-aloud'} aria-pressed={on} title={on ? t('Stop reading') : t('Read aloud')} onClick={() => narrator.toggle(table, entry)}>
      <SpeakerIcon />
    </button>
  );
}
