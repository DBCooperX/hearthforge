// The Hearthforge logo and the pieces cut from it: the full logo for the front door,
// the emblem (frame, anvil and die) for small panels, and the burning d20 as the mark in the top bar.
import { useMemo } from 'react';
import emblemUrl from '../assets/emblem.webp';
import logoUrl from '../assets/logo.webp';
import markUrl from '../assets/mark.webp';

export function Logo() {
  return <img className="brand-logo" src={logoUrl} alt="Hearthforge" width={1200} height={768} draggable={false} />;
}

export function Emblem({ size = 200 }: { size?: number }) {
  return <img className="brand-emblem" src={emblemUrl} alt="" width={size} height={Math.round(size * 535 / 640)} draggable={false} />;
}

/** The mark and the name, for the top bar. */
export function Wordmark() {
  return (
    <h1 className="brand">
      <img className="brand-mark" src={markUrl} alt="" width={28} height={28} draggable={false} />
      <span>Hearthforge</span>
    </h1>
  );
}

/** Sparks rising from the forge. Decoration only; they stand still for people who ask for less motion. */
export function Embers({ count = 22 }: { count?: number }) {
  const sparks = useMemo(() => Array.from({ length: count }, (_, i) => {
    // The same sparks every time, so nothing jumps when the screen is drawn again.
    const r = (n: number) => { const x = Math.sin((i + 1) * 12.9898 * n) * 43758.5453; return x - Math.floor(x); };
    return { left: `${(r(1) * 100).toFixed(1)}%`, size: 2 + Math.round(r(2) * 2), delay: `${(-r(3) * 14).toFixed(1)}s`, time: `${(9 + r(4) * 9).toFixed(1)}s`, drift: `${Math.round((r(5) - 0.5) * 120)}px` };
  }), [count]);
  return (
    <div className="embers" aria-hidden="true">
      {sparks.map((s, i) => (
        <i key={i} style={{ left: s.left, width: s.size, height: s.size, animationDelay: s.delay, animationDuration: s.time, ['--drift' as string]: s.drift }} />
      ))}
    </div>
  );
}
