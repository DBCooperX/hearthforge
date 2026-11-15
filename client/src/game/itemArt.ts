// Item icons from an art pack. Items keep their emoji until a pack supplies a picture, and
// get it back the moment the pack is switched off.
import { useSyncExternalStore } from 'react';
import { iconSlotsOf, type ArtRef } from '../../../shared/art';
import type { ItemDef } from '../../../shared/types';

let urls = new Map<string, string>();
const listeners = new Set<() => void>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

/** A picture as something an <img> can show: the file itself, or its rectangle cut out of a sheet. */
export async function artUrl(ref: ArtRef): Promise<string> {
  if (!ref.rect) return ref.src;
  const img = await loadImage(ref.src);
  const c = document.createElement('canvas');
  c.width = ref.rect.w;
  c.height = ref.rect.h;
  c.getContext('2d')!.drawImage(img, ref.rect.x, ref.rect.y, ref.rect.w, ref.rect.h, 0, 0, ref.rect.w, ref.rect.h);
  return c.toDataURL();
}

export async function setItemIcons(icons: Record<string, ArtRef>): Promise<void> {
  const next = new Map<string, string>();
  await Promise.all(Object.entries(icons).map(async ([slot, ref]) => {
    try { next.set(slot, await artUrl(ref)); } catch { /* keeps its emoji */ }
  }));
  urls = next;
  listeners.forEach((l) => l());
}

/** Ask the server again which pack is in use. Map tiles only change on the next page load. */
export async function reloadItemIcons(): Promise<void> {
  try {
    const res = await fetch('/api/art', { cache: 'no-store' });
    if (res.ok) await setItemIcons((await res.json()).icons ?? {});
  } catch { /* stays as it is */ }
}

export function itemArtUrl(def: Pick<ItemDef, 'id' | 'icon'> | undefined): string | undefined {
  if (!def) return undefined;
  for (const slot of iconSlotsOf(def)) if (urls.has(slot)) return urls.get(slot);
  return undefined;
}

/** The picture for skills, feats, spells and class features: the first key the icon set has a file for. */
export function glyphUrl(keys: string[]): string | undefined {
  for (const k of keys) if (urls.has(k)) return urls.get(k);
  return undefined;
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** Re-renders when the icon pack changes. */
export function useItemArt(): (def: Pick<ItemDef, 'id' | 'icon'> | undefined) => string | undefined {
  useSyncExternalStore(subscribe, () => urls);
  return itemArtUrl;
}
