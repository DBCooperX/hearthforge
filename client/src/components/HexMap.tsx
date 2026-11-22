import { useMemo, useState } from 'react';
import { useT } from '../i18n';
import { TERRAIN, UNKNOWN, hexCenter, hexKey, sameHex, type Hex, type TerrainCode } from '../../../shared/hex';
import type { Location, LocationKind, WorldView } from '../../../shared/types';

export const KIND_ICON: Record<LocationKind, string> = {
  town: '🏘️', village: '🏡', tavern: '🍺', shop: '🛒', temple: '⛪', shrine: '🕯️', camp: '⛺', dungeon: '💀', ruin: '🏚️', cave: '🕳️', landmark: '🗿',
};

const SIZE = 24;
const W = SIZE * Math.sqrt(3);

function corners(c: { x: number; y: number }): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(c.x + SIZE * Math.cos(a)).toFixed(1)},${(c.y + SIZE * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

interface Props {
  world: WorldView;
  target: Hex | null;
  route: Hex[] | null;
  onPick: (h: Hex) => void;
  /** Show only the country around the party instead of the whole map. */
  local?: boolean;
}

/** The hex overworld: explored terrain, known places, the party marker and the planned route. */
export function HexMap({ world, target, route, onPick, local }: Props) {
  const t = useT();
  const [hover, setHover] = useState<Hex | null>(null);
  const top = useMemo(() => world.locations.filter((l) => !l.parentId), [world.locations]);
  const byHex = useMemo(() => new Map<string, Location>(top.map((l) => [hexKey(l), l])), [top]);
  const hexes = useMemo(() => {
    const out: { h: Hex; code: string; points: string; c: { x: number; y: number } }[] = [];
    for (let r = 0; r < world.height; r++) {
      for (let q = 0; q < world.width; q++) {
        const c = hexCenter({ q, r }, SIZE);
        out.push({ h: { q, r }, code: world.terrain[r * world.width + q], points: corners(c), c });
      }
    }
    return out;
  }, [world.terrain, world.width, world.height]);

  const party = hexCenter(world.party, SIZE);
  const fullW = W * (world.width + 0.5), fullH = SIZE * 1.5 * world.height + SIZE * 0.5;
  // The side panel shows about eleven hexes across, centred on the party (and the destination, once one is picked).
  const viewBox = useMemo(() => {
    if (!local) {
      // The big map frames what is known (explored hexes, places, the party and any destination) instead of the whole unexplored world.
      let x0 = party.x, x1 = party.x, y0 = party.y, y1 = party.y;
      const grow = (p: { x: number; y: number }) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); };
      for (const e of hexes) if (e.code !== UNKNOWN) grow(e.c);
      for (const l of top) grow(hexCenter(l, SIZE));
      if (target) grow(hexCenter(target, SIZE));
      const pad = W * 1.5;
      let vx = Math.max(0, x0 - pad), vy = Math.max(0, y0 - pad);
      let vw = Math.min(fullW, x1 + pad) - vx, vh = Math.min(fullH, y1 + pad) - vy;
      const minW = W * 8;
      if (vw < minW) { vx = Math.max(0, Math.min(fullW - minW, vx - (minW - vw) / 2)); vw = Math.min(minW, fullW); }
      const minH = vw * 0.6;
      if (vh < minH) { vy = Math.max(0, Math.min(fullH - minH, vy - (minH - vh) / 2)); vh = Math.min(minH, fullH); }
      return `${vx.toFixed(0)} ${vy.toFixed(0)} ${vw.toFixed(0)} ${vh.toFixed(0)}`;
    }
    const vw = Math.min(fullW, W * 11), vh = Math.min(fullH, vw * 0.72);
    const aim = target ? hexCenter(target, SIZE) : party;
    const cx = (party.x + aim.x) / 2, cy = (party.y + aim.y) / 2;
    const x = Math.max(0, Math.min(fullW - vw, cx - vw / 2)), y = Math.max(0, Math.min(fullH - vh, cy - vh / 2));
    return `${x.toFixed(0)} ${y.toFixed(0)} ${vw.toFixed(0)} ${vh.toFixed(0)}`;
  }, [local, party.x, party.y, target?.q, target?.r, fullW, fullH, hexes, top]);
  const line = route?.length ? [world.party, ...route].map((h) => { const c = hexCenter(h, SIZE); return `${c.x.toFixed(1)},${c.y.toFixed(1)}`; }).join(' ') : null;
  const hovered = hover && (byHex.get(hexKey(hover))?.name ?? (world.terrain[hover.r * world.width + hover.q] === UNKNOWN ? t('Uncharted') : t(TERRAIN[world.terrain[hover.r * world.width + hover.q] as TerrainCode].name)));

  return (
    <div className="hexmap">
      <svg viewBox={viewBox} onMouseLeave={() => setHover(null)}>
        {hexes.map(({ h, code, points, c }) => {
          const known = code !== UNKNOWN;
          const reachable = known || byHex.has(hexKey(h));
          return (
            <g key={hexKey(h)} className={reachable ? 'hex pick' : 'hex'} onMouseEnter={() => setHover(h)} onClick={() => { setHover(h); if (reachable) onPick(h); }}>
              <polygon points={points} fill={known ? TERRAIN[code as TerrainCode].color : '#1a1613'} stroke={known ? 'rgba(0,0,0,0.28)' : '#241e19'} strokeWidth={1} />
              {known && TERRAIN[code as TerrainCode].icon && !byHex.has(hexKey(h)) && <text x={c.x} y={c.y + 5} className="terrain-icon">{TERRAIN[code as TerrainCode].icon}</text>}
            </g>
          );
        })}
        {line && <polyline points={line} className="route" />}
        {target && <polygon points={corners(hexCenter(target, SIZE))} className="target" />}
        {hover && <polygon points={corners(hexCenter(hover, SIZE))} className="hover" />}
        {top.map((l) => {
          const c = hexCenter(l, SIZE);
          return (
            <g key={l.id} className={l.visited ? 'place visited' : 'place'} pointerEvents="none">
              <circle cx={c.x} cy={c.y} r={SIZE * 0.62} />
              <text x={c.x} y={c.y + 6} className="place-icon">{KIND_ICON[l.kind]}</text>
              <text x={c.x} y={c.y + SIZE + 9} className="place-name">{l.name}</text>
            </g>
          );
        })}
        <g className="party-marker" style={{ transform: `translate(${party.x}px, ${party.y}px)` }} pointerEvents="none">
          <circle r={SIZE * 0.78} />
          <text y={6}>🚩</text>
        </g>
      </svg>
      <div className="hexmap-hint">{hovered ?? (sameHex(world.party, target ?? { q: -1, r: -1 }) ? '' : t('Click a hex to plan a journey'))}</div>
    </div>
  );
}
