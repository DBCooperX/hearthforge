// Sound effects: sword hits, shots, spells, footsteps, coins and fanfares. One player for the page, with its own volume
// and mute (separate from the music and the ambient loops). Recordings the server downloaded are used where there is
// one; everything else is made by sfxSynth.ts.
import { useEffect, useRef } from 'react';
import { SFX_DOM_EVENT, SFX_EVENTS, pickSample, sfxForLog, type SfxEvent, type SfxManifest } from '../../shared/sfx';
import type { GameState } from '../../shared/types';
import { synth } from './sfxSynth';
import { masterLevel, onMasterChange } from './ui/prefs';

const KEY = 'hearthforge.sfx';
/** The same sound is not started twice within this many milliseconds, so a volley is not a roar. */
const MIN_GAP_MS = 45;
/** Fanfares are never doubled, also not when another part of the app asks for the same one. */
const LONG_GAP: SfxEvent[] = ['victory', 'defeat', 'combat_start', 'level_up'];

interface Settings { muted: boolean; volume: number }
export interface SfxSnapshot extends Settings { enabled: boolean }

function storedSettings(): Settings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && typeof v.muted === 'boolean' && typeof v.volume === 'number') return { muted: v.muted, volume: Math.min(1, Math.max(0, v.volume)) };
  } catch { /* private window or old value */ }
  return { muted: false, volume: 0.6 };
}

export class SfxPlayer {
  private settings = storedSettings();
  private manifest: SfxManifest = { enabled: true, pending: false, files: [] };
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer | null>();
  private last = new Map<SfxEvent, number>();
  private listeners = new Set<() => void>();
  private snap: SfxSnapshot;
  private started = false;

  constructor() { this.snap = this.snapshot(); onMasterChange(() => this.save(this.settings)); }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => void this.listeners.delete(fn); };
  getSnapshot = () => this.snap;
  private snapshot(): SfxSnapshot { return { ...this.settings, enabled: this.manifest.enabled }; }
  private emit() { this.snap = this.snapshot(); this.listeners.forEach((fn) => fn()); }

  /** Read which recordings the server has, and wait for the first click, which browsers require before any sound. */
  start() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    void this.refresh();
    const unlock = () => {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        try {
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.master.gain.value = this.level(this.settings);
          this.master.connect(this.ctx.destination);
        } catch { this.ctx = null; return; }
      }
      void this.ctx.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // Any component may ask for a sound without importing this file: window.dispatchEvent(new CustomEvent('hearthforge:sfx', { detail: 'victory' })).
    window.addEventListener(SFX_DOM_EVENT, (e) => { const d = (e as CustomEvent).detail; if (typeof d === 'string') this.play(d); });
  }

  async refresh() {
    try {
      const res = await fetch('/api/sfx', { cache: 'no-store' });
      if (res.ok) { this.manifest = await res.json() as SfxManifest; this.buffers.clear(); }
    } catch { /* keep what we have */ }
    this.emit();
  }

  private level(s: Settings) { return (s.muted ? 0 : s.volume) * masterLevel(); }
  setMuted(muted: boolean) { this.save({ ...this.settings, muted }); }
  /** Dragging to zero mutes and keeps the old level for when the effects come back. */
  setVolume(volume: number) { this.save(volume <= 0 ? { ...this.settings, muted: true } : { muted: false, volume: Math.min(1, volume) }); }
  private save(next: Settings) {
    this.settings = next;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* applies until the page closes */ }
    if (this.ctx && this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.level(next), now, 0.03);
    }
    this.emit();
  }

  /** Play a sound by name; unknown names are ignored. A short delay in milliseconds lines a sound up behind another. */
  play(name: string, delayMs = 0) {
    if (!(SFX_EVENTS as readonly string[]).includes(name)) return;
    const event = name as SfxEvent;
    if (delayMs > 0) { setTimeout(() => this.play(event), delayMs); return; }
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running' || !this.manifest.enabled || this.level(this.settings) <= 0) return;
    const now = performance.now();
    if (now - (this.last.get(event) ?? -1e9) < (LONG_GAP.includes(event) ? 2500 : MIN_GAP_MS)) return;
    this.last.set(event, now);
    // The server's own library first, then the older recordings, then the browser's own sound.
    const own = this.manifest.events?.[event];
    const file = own?.length ? null : pickSample(event, this.manifest.files.map((f) => f.name));
    const src = own?.length ? own[Math.floor(Math.random() * own.length)] : file ? this.manifest.files.find((f) => f.name === file)?.src : undefined;
    if (!src) { synth(ctx, this.master, event); return; }
    void this.buffer(src).then((buf) => {
      if (!buf) { synth(ctx, this.master!, event); return; }
      const node = ctx.createBufferSource();
      node.buffer = buf;
      node.playbackRate.value = 0.94 + Math.random() * 0.12;
      node.connect(this.master!);
      node.start();
    });
  }

  /** A sound the Dungeon Master put on, from the library: played once, as it is. */
  playSrc(src: string) {
    const ctx = this.ctx;
    if (!src || !ctx || !this.master || ctx.state !== 'running' || !this.manifest.enabled || this.level(this.settings) <= 0) return;
    void this.buffer(src).then((buf) => {
      if (!buf) return;
      const node = ctx.createBufferSource();
      node.buffer = buf;
      node.connect(this.master!);
      node.start();
    });
  }

  private async buffer(src: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(src)) return this.buffers.get(src)!;
    this.buffers.set(src, null);
    try {
      const data = await (await fetch(src)).arrayBuffer();
      const buf = await this.ctx!.decodeAudioData(data);
      this.buffers.set(src, buf);
      return buf;
    } catch { return null; }
  }
}

export const sfx = new SfxPlayer();

interface Seen {
  room: string; phase: string; gold: number; logId: number;
  /** How many effects the Dungeon Master has put on at this table. */
  effect: number;
  heroes: Map<string, { hp: number; maxHp: number; x: number; y: number; dead: boolean }>;
  monsters: Map<string, { alive: boolean; x: number; y: number }>;
}

function take(state: GameState): Seen {
  return {
    room: state.room, phase: state.phase, gold: state.gold, effect: state.soundtrack?.effect?.n ?? 0, logId: state.log.length ? state.log[state.log.length - 1].id : 0,
    heroes: new Map(state.characters.map((c) => [c.id, { hp: c.hp, maxHp: c.maxHp, x: c.x, y: c.y, dead: c.dead }])),
    monsters: new Map(state.monsters.map((m) => [m.id, { alive: m.alive, x: m.x, y: m.y }])),
  };
}

/** What changed between two looks at the game, as sounds with a delay in milliseconds, in the order they happened. */
export function sfxForChange(prev: Seen, state: GameState): { event: SfxEvent; at: number }[] {
  const out: { event: SfxEvent; at: number }[] = [];
  let at = 0;
  const add = (event: SfxEvent, gap = 170) => { out.push({ event, at }); at += gap; };
  if (prev.phase !== state.phase) {
    if (state.phase === 'combat') add('combat_start', 400);
    else if (prev.phase === 'combat' && state.phase === 'explore') add('victory', 0);
    else if (state.phase === 'defeat') add('defeat', 0);
  }
  const fresh = state.log.filter((e) => e.id > prev.logId);
  for (const ev of sfxForLog(fresh)) add(ev, 230);
  const inFight = state.phase === 'combat';
  for (const c of state.characters) {
    const was = prev.heroes.get(c.id);
    if (!was) continue;
    if (c.hp < was.hp && !c.dead) add('hurt', 150);
    else if (c.dead && !was.dead) add('hero_down', 250);
    else if (c.hp > was.hp && c.maxHp === was.maxHp && !c.dead) add('heal', 250);
    if (inFight && (c.x !== was.x || c.y !== was.y)) for (let i = 0; i < Math.min(3, Math.max(Math.abs(c.x - was.x), Math.abs(c.y - was.y))); i++) add('footstep', 190);
  }
  for (const m of state.monsters) {
    const was = prev.monsters.get(m.id);
    if (!was) continue;
    if (was.alive && !m.alive) add('monster_death', 250);
    else if (inFight && m.alive && (m.x !== was.x || m.y !== was.y)) for (let i = 0; i < Math.min(3, Math.max(Math.abs(m.x - was.x), Math.abs(m.y - was.y))); i++) add('footstep', 190);
  }
  return out.slice(0, 8);
}

/** Make the sounds of the game happen. Call once, near the top of the app. */
export function useSfx(state: GameState | null) {
  const seen = useRef<Seen | null>(null);
  useEffect(() => { sfx.start(); }, []);
  useEffect(() => {
    if (!state) { seen.current = null; return; }
    const prev = seen.current;
    seen.current = take(state);
    // A new table or a first look (join, reload) is not an event.
    if (!prev || prev.room !== state.room) return;
    for (const s of sfxForChange(prev, state)) sfx.play(s.event, s.at);
    const effect = state.soundtrack?.effect;
    if (effect && effect.n > prev.effect) sfx.playSrc(effect.src);
  }, [state]);
}
