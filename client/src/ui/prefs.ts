// Interface preferences of this browser: interface sounds, text size, how the backpack is shown.
// Kept apart from the game state because they belong to the player, not to the table.
import { useSyncExternalStore } from 'react';
import type { InvFilter, InvSort } from '../../../shared/inventory';

import type { TextSize } from './labels';

export interface Prefs {
  sounds: boolean;
  /** 0 to 1. */
  soundVolume: number;
  textSize: TextSize;
  invSort: InvSort;
  invFilter: InvFilter;
  /** The character creator shows all eight steps instead of the short three. */
  creatorDetailed: boolean;
}

const KEY = 'hearthforge.prefs';
const DEFAULTS: Prefs = { sounds: true, soundVolume: 0.5, textSize: 'normal', invSort: 'manual', invFilter: 'all', creatorDetailed: false };
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

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* applied, not remembered */ }
  apply();
  listeners.forEach((fn) => fn());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => void listeners.delete(fn); }, getPrefs);
}
