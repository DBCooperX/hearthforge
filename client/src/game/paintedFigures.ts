// Painted battle figures from the server (/pictures/<id>), with their key-colour background taken out and cropped to
// the figure, ready for the battle map. Until one has loaded, and if it fails, the drawn figure stands in.
import { keyOut } from './chromaKey';

/** The tallest a figure is kept at: plenty for the closest zoom, small enough to stay quick. */
const MAX = 512;
const ID = /^[a-f0-9]{18}$/;

const figures = new Map<string, HTMLCanvasElement | 'loading' | 'failed'>();
const listeners = new Set<() => void>();

/** Called whenever a painted figure is ready, so the battle map can swap it in. */
export function onFigureLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Cut the figure out of a loaded picture. */
export function cutOut(img: CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width: number; height: number }): HTMLCanvasElement | null {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return null;
  const k = Math.min(1, MAX / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h);
  const box = keyOut(data.data, w, h);
  if (!box) return null;
  g.putImageData(data, 0, 0);
  const out = document.createElement('canvas');
  out.width = box.w; out.height = box.h;
  out.getContext('2d')!.drawImage(c, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return out;
}

/** The figure for a picture id, once it is ready; null while it loads or when there is none. */
export function paintedFigure(id: string | null | undefined): HTMLCanvasElement | null {
  if (!id) return null;
  const got = figures.get(id);
  if (got instanceof HTMLCanvasElement) return got;
  if (!got && ID.test(id) && typeof Image !== 'undefined') {
    figures.set(id, 'loading');
    const img = new Image();
    img.onload = () => {
      let cut: HTMLCanvasElement | null = null;
      try { cut = cutOut(img); } catch { /* unreadable */ }
      figures.set(id, cut ?? 'failed');
      if (cut) for (const fn of listeners) fn();
    };
    img.onerror = () => { figures.set(id, 'failed'); };
    img.src = `/pictures/${id}`;
  }
  return null;
}
