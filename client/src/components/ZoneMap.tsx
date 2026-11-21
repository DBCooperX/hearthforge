import { useMemo, useState } from 'react';
import { useT } from '../i18n';
import { SPOT_ICON, ZONE_H, ZONE_W, zonePaths, zoneRng, type ZoneSpot, type ZoneView } from '../../../shared/zone';

interface Props {
  zone: ZoneView;
  /** Clicking the spot of a known place (the tavern) walks there. Null while that is not allowed. */
  onGo: ((spot: ZoneSpot) => void) | null;
  /** The place the party is in right now, to tell which spot stands for it. */
  placeId: string | null;
  big?: boolean;
}

type Decor = { kind: 'pool' | 'reeds' | 'tree' | 'hill' | 'peak' | 'field' | 'house' | 'rock' | 'rubble'; x: number; y: number; s: number; r: number };

/** Scenery drawn in ink around the spots, from the zone's seed, so the map looks the same every time. */
function decorFor(zone: ZoneView): Decor[] {
  const rnd = zoneRng(zone.seed);
  const { ground, terrain } = zone.style;
  const out: Decor[] = [];
  const lines = zonePaths(zone);
  // Away from the spots and off the paths between them.
  const offPath = (x: number, y: number) => lines.every(([a, b]) => {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
    return Math.hypot(a.x + k * dx - x, a.y + k * dy - y) > 3.5;
  });
  const clear = (x: number, y: number, gap: number) => zone.spots.every((s) => Math.hypot(s.x - x, s.y - y) > gap) && offPath(x, y);
  const scatter = (kind: Decor['kind'], n: number, gap = 7, area?: (x: number, y: number) => boolean) => {
    for (let i = 0, tries = 0; i < n && tries < n * 8; tries++) {
      const x = 3 + rnd() * (ZONE_W - 6), y = 3 + rnd() * (ZONE_H - (zone.style.shore ? 14 : 6));
      if (!clear(x, y, gap) || (area && !area(x, y))) continue;
      out.push({ kind, x, y, s: 0.7 + rnd() * 0.6, r: rnd() });
      i++;
    }
  };
  if (ground === 'underground') { scatter('rock', 60, 6); return out; }
  const centre = zone.spots.find((s) => s.id === 'centre') ?? { x: ZONE_W / 2, y: ZONE_H / 2 };
  if (ground === 'settlement') scatter('house', 16, 6, (x, y) => Math.hypot(x - centre.x, y - centre.y) < 26);
  if (terrain === 's') { scatter('pool', 7, 8); scatter('reeds', 26, 5); }
  else if (terrain === 'f') { scatter('tree', 42, 5); }
  else if (terrain === 'h') { scatter('hill', 14, 7); scatter('tree', 8, 5); }
  else if (terrain === 'm') { scatter('peak', 12, 8); scatter('rock', 10, 5); }
  else { scatter('field', 8, 8, (x, y) => Math.hypot(x - centre.x, y - centre.y) > 14); scatter('tree', 12, 5); }
  if (ground === 'wild' && zone.spots[0]?.kind === 'ruin') scatter('rubble', 10, 5);
  return out;
}

function DecorMark({ d }: { d: Decor }) {
  const { x, y, s, r } = d;
  switch (d.kind) {
    case 'pool': return <ellipse cx={x} cy={y} rx={5 * s} ry={2.6 * s} className="zd-pool" transform={`rotate(${(r - 0.5) * 30} ${x} ${y})`} />;
    case 'reeds': return <path d={`M${x} ${y}l-0.8 -2.4M${x} ${y}l0 -3M${x} ${y}l0.9 -2.3`} className="zd-ink" />;
    case 'tree': return <g><line x1={x} y1={y} x2={x} y2={y + 1.4 * s} className="zd-ink" /><circle cx={x} cy={y - 0.4} r={1.5 * s} className="zd-tree" /></g>;
    case 'hill': return <path d={`M${x - 3 * s} ${y}q${3 * s} ${-3.2 * s} ${6 * s} 0`} className="zd-ink" />;
    case 'peak': return <path d={`M${x - 3 * s} ${y}l${3 * s} ${-4.5 * s}l${3 * s} ${4.5 * s}`} className="zd-peak" />;
    case 'field': return <g transform={`rotate(${(r - 0.5) * 40} ${x} ${y})`}><rect x={x - 4 * s} y={y - 2.5 * s} width={8 * s} height={5 * s} className="zd-field" />{[0.25, 0.5, 0.75].map((f) => <line key={f} x1={x - 4 * s} x2={x + 4 * s} y1={y - 2.5 * s + 5 * s * f} y2={y - 2.5 * s + 5 * s * f} className="zd-hatch" />)}</g>;
    case 'house': return <g transform={`rotate(${(r - 0.5) * 50} ${x} ${y})`}><rect x={x - 1.6 * s} y={y - 1.1 * s} width={3.2 * s} height={2.2 * s} className="zd-house" /><line x1={x - 1.6 * s} x2={x + 1.6 * s} y1={y} y2={y} className="zd-hatch" /></g>;
    case 'rock': return <circle cx={x} cy={y} r={0.35 + s * 0.4} className="zd-rock" />;
    case 'rubble': return <rect x={x} y={y} width={1.4 * s} height={1 * s} className="zd-house" transform={`rotate(${r * 90} ${x} ${y})`} />;
  }
}

/** A path between two spots, gently bent so the map does not look ruled. */
function pathD(a: ZoneSpot, b: ZoneSpot, seed: number): string {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const bend = ((((seed + a.x * 13 + b.y * 7) % 10) / 10) - 0.5) * len * 0.35;
  return `M${a.x} ${a.y}Q${(mx - (dy / len) * bend).toFixed(1)} ${(my + (dx / len) * bend).toFixed(1)} ${b.x} ${b.y}`;
}

interface LabelSpot { text: string; x: number; y: number; anchor: 'middle' | 'start' | 'end'; hidden: boolean }
const LABEL_MAX = 17;
const CHAR_W = 1.8; // width of one letter at the label size, in map units
const shorten = (name: string, max = LABEL_MAX) => (name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name);

/**
 * Where each spot's name goes. Long names are cut short; a name is tried below its spot, above it, then
 * to the right and left, and it takes the first place where it touches no other name or spot. A name that
 * fits nowhere is hidden until the pointer is over its spot (the full name is always in the hint bar).
 * The party's own spot and explored places choose first, so unexplored ones give way.
 */
function placeLabels(spots: ZoneSpot[], at: string | null): Map<string, LabelSpot> {
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const taken: Box[] = spots.map((s) => ({ x0: s.x - 5, x1: s.x + 5, y0: s.y - 5, y1: s.y + 5 }));
  const order = [...spots].sort((a, b) => Number(b.id === at) - Number(a.id === at) || Number(b.visited) - Number(a.visited));
  const out = new Map<string, LabelSpot>();
  for (const sp of order) {
    let placed: { text: string; c: { x: number; y: number; anchor: LabelSpot['anchor']; box: Box } } | null = null;
    // The whole name first, then a shorter one, before a name gives way altogether.
    for (const max of [LABEL_MAX, 11]) {
      const text = shorten(sp.name, max), w = text.length * CHAR_W;
      const tries: { x: number; y: number; anchor: LabelSpot['anchor']; box: Box }[] = [
        { x: sp.x, y: sp.y + 8.4, anchor: 'middle', box: { x0: sp.x - w / 2, x1: sp.x + w / 2, y0: sp.y + 5.4, y1: sp.y + 9.2 } },
        { x: sp.x, y: sp.y - 6.2, anchor: 'middle', box: { x0: sp.x - w / 2, x1: sp.x + w / 2, y0: sp.y - 9.8, y1: sp.y - 6 } },
        { x: sp.x + 6.4, y: sp.y + 1.2, anchor: 'start', box: { x0: sp.x + 6.4, x1: sp.x + 6.4 + w, y0: sp.y - 2, y1: sp.y + 2.4 } },
        { x: sp.x - 6.4, y: sp.y + 1.2, anchor: 'end', box: { x0: sp.x - 6.4 - w, x1: sp.x - 6.4, y0: sp.y - 2, y1: sp.y + 2.4 } },
        { x: sp.x + 4.4, y: sp.y + 8.4, anchor: 'start', box: { x0: sp.x + 4.4, x1: sp.x + 4.4 + w, y0: sp.y + 5.4, y1: sp.y + 9.2 } },
        { x: sp.x - 4.4, y: sp.y + 8.4, anchor: 'end', box: { x0: sp.x - 4.4 - w, x1: sp.x - 4.4, y0: sp.y + 5.4, y1: sp.y + 9.2 } },
        { x: sp.x + 4.4, y: sp.y - 6.2, anchor: 'start', box: { x0: sp.x + 4.4, x1: sp.x + 4.4 + w, y0: sp.y - 9.8, y1: sp.y - 6 } },
        { x: sp.x - 4.4, y: sp.y - 6.2, anchor: 'end', box: { x0: sp.x - 4.4 - w, x1: sp.x - 4.4, y0: sp.y - 9.8, y1: sp.y - 6 } },
      ];
      const free = tries.find((c) => !taken.some((o) => hit(c.box, o)));
      if (free) { placed = { text, c: free }; break; }
    }
    if (placed) taken.push(placed.c.box);
    const text = placed?.text ?? shorten(sp.name);
    const c = placed?.c;
    out.set(sp.id, { text, x: (c?.x ?? sp.x) - sp.x, y: (c?.y ?? sp.y + 8.4) - sp.y, anchor: c?.anchor ?? 'middle', hidden: !placed && sp.id !== at });
  }
  return out;
}

/**
 * The map of the place the party is in: the spots the story has named, the paths between them,
 * where the party stands, and fog over what nobody has explored yet.
 */
export function ZoneMap({ zone, onGo, placeId, big }: Props) {
  const t = useT();
  const [hover, setHover] = useState<ZoneSpot | null>(null);
  const decor = useMemo(() => decorFor(zone), [zone.seed, zone.style.ground, zone.style.terrain, zone.spots.length]);
  const labels = useMemo(() => placeLabels(zone.spots, zone.at), [zone.spots, zone.at]);
  const paths = zonePaths(zone);
  const under = zone.style.ground === 'underground';
  const visited = zone.spots.filter((s) => s.visited).length;
  const status = (s: ZoneSpot) => s.id === zone.at ? t('You are here') : s.cleared ? t('Cleared') : s.visited ? t('Explored') : t('Not explored yet');
  const canGo = (s: ZoneSpot) => !!onGo && s.id !== zone.at && (!!s.placeId || (s.id === 'centre' && placeId !== null && zone.spots.some((x) => x.placeId === placeId)));
  const fogId = `zfog-${zone.seed}${big ? '-big' : ''}`;
  // Zoomed onto the spots the party knows, so a small place does not sit lost in an empty sheet.
  const viewBox = useMemo(() => {
    const xs = zone.spots.map((s) => s.x), ys = zone.spots.map((s) => s.y);
    const pad = 13;
    let w = Math.max(big ? 70 : 58, Math.max(...xs) - Math.min(...xs) + pad * 2);
    let h = Math.max(Math.max(...ys) - Math.min(...ys) + pad * 2, w * 0.7);
    w = Math.min(ZONE_W, Math.max(w, h / 0.7)); h = Math.min(ZONE_H, w * 0.7);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2 + 1.5;
    // Underground the rock goes on past the sheet, so the plan can sit in the middle; above ground the sheet ends.
    const x = under ? cx - w / 2 : Math.max(0, Math.min(ZONE_W - w, cx - w / 2)), y = under ? cy - h / 2 : Math.max(0, Math.min(ZONE_H - h, cy - h / 2));
    return `${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
  }, [zone.spots, big, under]);

  return (
    <div className={`zonemap ${under ? 'under' : `t-${zone.style.terrain}`}${big ? ' big' : ''}`}>
      <svg viewBox={viewBox} onMouseLeave={() => setHover(null)} role="img" aria-label={t('Map of this place')}>
        <defs>
          <radialGradient id={`${fogId}-g`}>
            <stop offset="0.55" stopColor="#000" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <mask id={fogId}>
            <rect x={-ZONE_W} y={-ZONE_H} width={ZONE_W * 3} height={ZONE_H * 3} fill="#fff" />
            {zone.spots.map((s) => <circle key={s.id} cx={s.x} cy={s.y} r={s.visited ? 19 : 10} fill={`url(#${fogId}-g)`} />)}
          </mask>
        </defs>
        <rect x={-ZONE_W} y={-ZONE_H} width={ZONE_W * 3} height={ZONE_H * 3} className="zd-ground" />
        {zone.style.shore && !under && <path d={`M${-ZONE_W} ${ZONE_H - 9} T${-ZONE_W / 2} ${ZONE_H - 9} T0 ${ZONE_H - 9} Q${ZONE_W * 0.25} ${ZONE_H - 13} ${ZONE_W * 0.5} ${ZONE_H - 9} T${ZONE_W} ${ZONE_H - 9} T${ZONE_W * 1.5} ${ZONE_H - 9} T${ZONE_W * 2} ${ZONE_H - 9} V${ZONE_H * 2} H${-ZONE_W}Z`} className="zd-shore" />}
        {decor.map((d, i) => <DecorMark key={i} d={d} />)}
        {paths.map(([a, b]) => (
          <path key={`${a.id}-${b.id}`} d={pathD(a, b, zone.seed)} className={`zd-path${a.visited && b.visited ? '' : ' unknown'}`} />
        ))}
        {under && zone.spots.map((s) => <rect key={`room-${s.id}`} x={s.x - 7} y={s.y - 5} width={14} height={10} rx={1.5} className={`zd-room${s.visited ? '' : ' unknown'}`} />)}
        <rect x={-ZONE_W} y={-ZONE_H} width={ZONE_W * 3} height={ZONE_H * 3} className="zd-fog" mask={`url(#${fogId})`} />
        {zone.spots.map((s) => {
          const here = s.id === zone.at;
          const go = canGo(s);
          return (
            <g key={s.id} className={`zspot${s.visited ? ' visited' : ''}${here ? ' here' : ''}${go ? ' go' : ''}`} transform={`translate(${s.x} ${s.y})`}
              onMouseEnter={() => setHover(s)} onClick={() => go && onGo!(s)}>
              <title>{`${s.name} · ${status(s)}`}</title>
              {here && <circle r={6.4} className="zspot-ring" />}
              <circle r={4.2} className="zspot-disc" />
              <text y={1.55} className="zspot-icon">{s.visited || here ? SPOT_ICON[s.kind] : '?'}</text>
              {s.cleared && <text x={3.4} y={-2.6} className="zspot-badge">✓</text>}
              {(() => { const l = labels.get(s.id); return l && <text x={l.x} y={l.y} style={{ textAnchor: l.anchor }} className={`zspot-name${l.hidden ? ' hidden' : ''}`}>{l.text}</text>; })()}
              {here && <text x={4.2} y={-3.4} className="zspot-flag">🚩</text>}
            </g>
          );
        })}
      </svg>
      <div className="hexmap-hint">
        {hover ? <><b>{hover.name}</b> · {status(hover)}{canGo(hover) ? ` · ${t('click to go there')}` : ''}</> : t('{n} of {total} spots explored', { n: visited, total: zone.spots.length })}
      </div>
    </div>
  );
}
