// Interface preferences of this browser: interface sounds, text size, how the backpack is shown.
// Kept apart from the game state because they belong to the player, not to the table.
import { useSyncExternalStore } from 'react';
import type { InvFilter, InvSort } from '../../../shared/inventory';

import { DEFAULT_BATTLE_NARRATION, type BattleNarrationMode } from '../../../shared/battleNarration';
import type { TextSize } from './labels';

export interface Prefs {
  sounds: boolean;
  /** 0 to 1. */
  soundVolume: number;
  /** Master volume, 0 to 1: scales every sound of the game (music, ambient, effects, narrator, interface). */
  master: number;
  masterMuted: boolean;
  /** The sound menu shows each sound's own slider, not only the master volume. */
  mixerOpen: boolean;
  textSize: TextSize;
  invSort: InvSort;
  invFilter: InvFilter;
  /** The character creator shows all eight steps instead of the short three. */
  creatorDetailed: boolean;
  /** In a fight, the pointer at the edge of the battle map moves the view. */
  edgeScroll: boolean;
  /** In a fight, seconds without doing anything on your turn before End turn reminds you. 0 is off. */
  turnReminder: number;
  /** A soft chime when another player writes in table talk. */
  chatChime: boolean;
  /** 0 to 1, a share of the master volume. */
  chatChimeVolume: number;
  /** How much of a fight the narrator reads aloud: nothing, the big moments, or every comment. */
  battleNarration: BattleNarrationMode;
}

const KEY = 'hearthforge.prefs';
const DEFAULTS: Prefs = { sounds: true, soundVolume: 0.5, master: 1, masterMuted: false, mixerOpen: false, textSize: 'normal', invSort: 'manual', invFilter: 'all', creatorDetailed: false, edgeScroll: true, turnReminder: 20, chatChime: true, chatChimeVolume: 0.5, battleNarration: DEFAULT_BATTLE_NARRATION };
const SCALE: Record<TextSize, string> = { normal: '1', large: '1.12', larger: '1.25' };

function load(): Prefs {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) }; } catch { return { ...DEFAULTS }; }
}

let current = load();
const listeners = new Set<() => void>();

function apply() {
  if (typeof document !== 'undefined') document.documentElement.style.setProperty('--text-scale', SCALE[current.textSize] ?? '1');
}
apply();

export const getPrefs = () => current;

/** What every sound is multiplied by: the master volume, or 0 when it is muted. */
export const masterLevel = (p: Prefs = current) => (p.masterMuted ? 0 : Math.min(1, Math.max(0, p.master)));

/** Calls `fn` whenever the master level changes. Returns the unsubscribe. */
export function onMasterChange(fn: () => void): () => void {
  let last = masterLevel();
  const check = () => { const now = masterLevel(); if (now !== last) { last = now; fn(); } };
  listeners.add(check);
  return () => void listeners.delete(check);
}

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* applied, not remembered */ }
  apply();
  listeners.forEach((fn) => fn());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => void listeners.delete(fn); }, getPrefs);
}
