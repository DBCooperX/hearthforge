import { useMemo, useState } from 'react';
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
    if (!local) return `0 0 ${fullW.toFixed(0)} ${fullH.toFixed(0)}`;
    const vw = Math.min(fullW, W * 11), vh = Math.min(fullH, vw * 0.72);
    const aim = target ? hexCenter(target, SIZE) : party;
    const cx = (party.x + aim.x) / 2, cy = (party.y + aim.y) / 2;
    const x = Math.max(0, Math.min(fullW - vw, cx - vw / 2)), y = Math.max(0, Math.min(fullH - vh, cy - vh / 2));
    return `${x.toFixed(0)} ${y.toFixed(0)} ${vw.toFixed(0)} ${vh.toFixed(0)}`;
  }, [local, party.x, party.y, target?.q, target?.r, fullW, fullH]);
  const line = route?.length ? [world.party, ...route].map((h) => { const c = hexCenter(h, SIZE); return `${c.x.toFixed(1)},${c.y.toFixed(1)}`; }).join(' ') : null;
  const hovered = hover && (byHex.get(hexKey(hover))?.name ?? (world.terrain[hover.r * world.width + hover.q] === UNKNOWN ? 'Uncharted' : TERRAIN[world.terrain[hover.r * world.width + hover.q] as TerrainCode].name));

  return (
    <div className="hexmap">
      <svg viewBox={viewBox} onMouseLeave={() => setHover(null)}>
        {hexes.map(({ h, code, points, c }) => {
          const known = code !== UNKNOWN;
          const reachable = known || byHex.has(hexKey(h));
          return (
            <g key={hexKey(h)} className={reachable ? 'hex pick' : 'hex'} onMouseEnter={() => setHover(h)} onClick={() => reachable && onPick(h)}>
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
      <div className="hexmap-hint">{hovered ?? (sameHex(world.party, target ?? { q: -1, r: -1 }) ? '' : 'Click a hex to plan a journey')}</div>
    </div>
  );
}
