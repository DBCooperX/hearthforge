import { useEffect, useRef, useState, type ReactNode } from 'react';
import { tileDifficult, tileGivesCover, type Biome } from '../../../shared/battlemap';
import type { GameState } from '../../../shared/types';
import { useLang, useT } from '../i18n';
import { heroStatuses, monsterStatuses, type TokenStatus } from '../game/statuses';
import { Hint } from '../ui/Hint';
import { Glyph } from '../ui/Glyph';
import { MapRenderer, type BattleView, type TokenHover, type ViewOptions } from '../game/MapRenderer';
import { getPrefs, usePrefs } from '../ui/prefs';
import { ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, clampZoom } from '../game/tilt';
import { useEntityHover } from './Story';
import { OddsBlock } from './Odds';
import { heroSenses, partyOf } from '../game/util';
import type { MoveListener } from '../net';

interface Props {
  state: GameState;
  view: ViewOptions;
  onTile: (x: number, y: number, touch: boolean) => void;
  onMoved: (fn: MoveListener) => () => void;
  /** What the acting hero would do to a monster pointed at: the weapon (null) or a spell, with its name. */
  aim?: { abilityId: string | null; label: string } | null;
  /** The mouse moved onto another square (null: off the map). */
  onHoverTile?: (tile: { x: number; y: number } | null) => void;
  /** A short note that follows the mouse, such as what a move there costs. */
  moveTip?: ReactNode;
}

const VIEW_KEY = 'hearthforge.battleView';
const ZOOM_KEY = 'hearthforge.battleZoom';

function storedView(): BattleView {
  try { if (localStorage.getItem(VIEW_KEY) === 'flat') return 'flat'; } catch { /* private window */ }
  return 'tilt';
}
function storedZoom(): number {
  try { const z = Number(localStorage.getItem(ZOOM_KEY)); if (z) return clampZoom(z); } catch { /* private window */ }
  return ZOOM_DEFAULT;
}
function remember(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* not remembered, still applied */ }
}
const edgeScrollNow = () => getPrefs().edgeScroll;
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function MapView({ state, view, onTile, onMoved, aim, onHoverTile, moveTip }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<MapRenderer | null>(null);
  const [token, setToken] = useState<TokenHover | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const { entities, hover } = useEntityHover();
  const click = useRef(onTile);
  click.current = onTile;
  const hoverTile = useRef(onHoverTile);
  hoverTile.current = onHoverTile;
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const t = useT();
  // The battle view (2.5D or flat) and the zoom are each player's own, remembered in the browser.
  const [mode, setMode] = useState<BattleView>(storedView);
  const [zoom, setZoom] = useState<number>(storedZoom);
  const latest = useRef({ state, view, zoom, miss: t('Miss') });
  latest.current = { state, view, zoom, miss: t('Miss') };

  useEffect(() => {
    const now = latest.current;
    const r = new MapRenderer({ view: mode, zoom: now.zoom, reducedMotion: reducedMotion(), labels: { miss: now.miss } });
    renderer.current = r;
    r.onTile = (x, y, touch) => click.current(x, y, touch);
    r.onZoom = (factor) => setZoom((z) => clampZoom(z * factor));
    r.onHoverMonster = setToken;
    r.onHoverTile = (tile) => hoverTile.current?.(tile);
    r.update(now.state, now.view);
    r.setEdgeScroll(edgeScrollNow());
    void r.init(host.current!);
    const off = onMoved((id, path) => r.queuePath(id, path));
    return () => {
      off();
      r.destroy();
      renderer.current = null;
      setToken(null);
    };
  }, [onMoved, mode]);

  useEffect(() => {
    renderer.current?.update(state, view);
  }, [state, view]);

  useEffect(() => {
    renderer.current?.setZoom(zoom);
    const id = setTimeout(() => remember(ZOOM_KEY, String(zoom)), 400);
    return () => clearTimeout(id);
  }, [zoom]);

  // The mouse wheel over the map zooms it.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.map-legend, .map-controls, .token-statuses')) return;
      e.preventDefault();
      setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  const pickMode = (m: BattleView) => { setMode(m); remember(VIEW_KEY, m); };

  // Looking around: edge scrolling (a setting), and Shift with the arrow keys or WASD.
  const { edgeScroll } = usePrefs();
  useEffect(() => { renderer.current?.setEdgeScroll(edgeScroll); }, [edgeScroll, mode]);
  useEffect(() => {
    const held = new Set<string>();
    const DIRS: Record<string, [number, number]> = { arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0], arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1] };
    const push = () => {
      let x = 0, y = 0;
      for (const k of held) { x += DIRS[k][0]; y += DIRS[k][1]; }
      renderer.current?.setKeyPan(Math.sign(x), Math.sign(y));
    };
    const down = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (!e.shiftKey || !DIRS[k] || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      held.add(k);
      push();
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'shift') held.clear();
      else held.delete(k);
      push();
    };
    const blur = () => { held.clear(); push(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);

  // Pointing at a monster shows its card, anchored to its token.
  const hovered = token ? state.monsters.find((m) => m.id === token.id && m.alive) : undefined;
  const hoveredName = hovered?.name;
  const odds = hovered && aim && state.odds ? (aim.abilityId ? state.odds.abilities[aim.abilityId]?.[hovered.id] : state.odds.attack[hovered.id]) : undefined;
  useEffect(() => {
    const entity = hoveredName ? entities.find((e) => e.kind === 'monster' && e.name === hoveredName) : undefined;
    if (entity && anchor.current) hover.show(entity, anchor.current, odds && aim ? <OddsBlock odds={odds} label={aim.label} /> : undefined);
    else hover.hide();
    return () => hover.hide();
  }, [hoveredName, token, entities, hover, odds, aim?.label]);

  // Status icons ride above their tokens: placed every frame, since tokens slide and the camera pans.
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const place = () => {
      const r = renderer.current;
      for (const el of Array.from(layer.current?.children ?? []) as HTMLElement[]) {
        const rect = r?.tokenRect(el.dataset.token ?? '');
        if (!rect) { el.style.visibility = 'hidden'; continue; }
        el.style.visibility = '';
        // The turn marker rides above the status icons when there are any.
        const lift = Number(el.dataset.lift ?? 0);
        el.style.transform = `translate(${Math.round(rect.left + rect.size / 2)}px, ${Math.round(rect.top - rect.size * 0.12 - lift)}px) translate(-50%, -100%)`;
      }
      frame = requestAnimationFrame(place);
    };
    frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, []);

  const { lang } = useLang();
  const statuses: { id: string; list: TokenStatus[] }[] = state.phase === 'combat' ? [
    ...partyOf(state).filter((c) => !c.dead).map((c) => ({ id: c.id, list: heroStatuses(c, state, t, lang) })),
    ...state.monsters.filter((m) => m.alive && !view.unseenIds.has(m.id)).map((m) => ({ id: m.id, list: monsterStatuses(m, state, t, lang) })),
  ].filter((x) => x.list.length > 0) : [];
  // Whose turn it is, spelled out over their figure: brass for heroes (brighter for your own), red for monsters.
  const activeId = state.phase === 'combat' ? view.activeId : null;
  const activeHero = activeId ? partyOf(state).find((c) => c.id === activeId && !c.dead) : undefined;
  const activeMonster = activeId && !activeHero ? state.monsters.find((m) => m.id === activeId && m.alive && !view.unseenIds.has(m.id)) : undefined;
  const turn = activeHero || activeMonster ? {
    id: activeId!, kind: activeHero ? 'hero' : 'monster', mine: !!activeHero && view.myIds.has(activeHero.id),
    lift: statuses.some((s) => s.id === activeId) ? 30 : 0,
  } : null;
  const names: Record<Biome, string> = {
    dungeon: t('Dungeon'), cave: t('Cave'), ruin: t('Ruins'), tavern: t('Tavern'), town: t('Town streets'), road: t('Road'), bridge: t('Bridge'),
    camp: t('Camp'), plains: t('Plains'), forest: t('Forest'), hills: t('Hills'), mountains: t('Mountains'), swamp: t('Swamp'),
  };
  const tiles = state.map.rows.join('');
  const slow = [...tiles].some(tileDifficult);
  const cover = [...tiles].some(tileGivesCover);
  const ambient = state.light?.ambient ?? 'bright';
  const viewer = state.characters.find((c) => c.id === view.selectedId);
  const dv = viewer ? heroSenses(viewer).darkvision : 0;
  const lightNote = ambient === 'bright' ? '' : [
    ambient === 'dark' ? t('Darkness: without darkvision or a light you cannot see into it.') : t('Dim light everywhere the lights do not reach.'),
    viewer ? (dv ? t('{name} has darkvision out to {n} ft (the grey area).', { name: viewer.name, n: dv }) : t('{name} has no darkvision.', { name: viewer.name })) : '',
    t('Attacking what you cannot see has disadvantage; attacking what cannot see you has advantage.'),
  ].filter(Boolean).join(' ');
  return (
    <div className="map" ref={host} onMouseMove={(e) => { const b = host.current?.getBoundingClientRect(); if (b) setCursor({ x: e.clientX - b.left, y: e.clientY - b.top }); }} onMouseLeave={() => setCursor(null)}>
      {moveTip && cursor && !token && <div className="move-tip" style={{ left: cursor.x + 18, top: cursor.y + 14 }} aria-live="polite">{moveTip}</div>}
      <div className="token-statuses" ref={layer}>
        {turn && (
          <div key={`turn-${turn.id}`} className={`turn-marker ${turn.kind}${turn.mine ? ' mine' : ''}`} data-token={turn.id} data-lift={turn.lift} style={{ visibility: 'hidden' }} aria-hidden>
            <span>{turn.mine ? t('Your turn') : t('Now acting')}</span>
            <i />
          </div>
        )}
        {statuses.map(({ id, list }) => (
          <div key={id} className="token-status" data-token={id} style={{ visibility: 'hidden' }}>
            {list.slice(0, 5).map((s) => <StatusIcon key={s.key} status={s} />)}
            {list.length > 5 && (
              <Hint title={t('More effects')} text={list.slice(5).map((s) => s.name).join(', ')}>
                <span className="status-more">+{list.length - 5}</span>
              </Hint>
            )}
          </div>
        ))}
      </div>
      {token && <div ref={anchor} className="token-anchor" style={{ left: token.left, top: token.top, width: token.size, height: token.size }} />}
      <div className="map-controls" role="toolbar" aria-label={t('Battle view')} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <span className="map-mode" role="group">
          <button type="button" className={mode === 'tilt' ? 'on' : ''} aria-pressed={mode === 'tilt'} onClick={() => pickMode('tilt')} title={t('Tilted view with standing miniatures, light and spell effects')}>2.5D</button>
          <button type="button" className={mode === 'flat' ? 'on' : ''} aria-pressed={mode === 'flat'} onClick={() => pickMode('flat')} title={t('Flat view from above: lighter for older computers')}>{t('Flat')}</button>
        </span>
        <span className="map-zoom" role="group">
          <button type="button" onClick={() => renderer.current?.recenter()} title={t('Back to whoever is acting')} aria-label={t('Back to whoever is acting')}>⌖</button>
          <button type="button" onClick={() => setZoom((z) => clampZoom(z / 1.2))} disabled={zoom <= ZOOM_MIN} title={t('Zoom out (mouse wheel)')} aria-label={t('Zoom out')}>−</button>
          <button type="button" onClick={() => setZoom(ZOOM_DEFAULT)} className="zoom-level" title={t('Reset zoom')}>{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => setZoom((z) => clampZoom(z * 1.2))} disabled={zoom >= ZOOM_MAX} title={t('Zoom in (mouse wheel)')} aria-label={t('Zoom in')}>+</button>
        </span>
      </div>
      <div className="map-legend">
        <strong>{names[state.map.biome] ?? names.dungeon}</strong>
        {slow && <span>{t('Mud, brush, rubble and shallow water cost double movement.')}</span>}
        {cover && <span>{t('Trees, rocks and furniture give half cover (+2 AC) against shots.')}</span>}
        {lightNote && <span className="light-note">{lightNote}</span>}
      </div>
    </div>
  );
}

/** One effect over a token: its icon, turns left as a small number, and what it does on hover. */
function StatusIcon({ status }: { status: TokenStatus }) {
  const t = useT();
  return (
    <Hint title={status.name} text={<>{status.text}{status.ends && <em>{status.ends}</em>}</>}>
      <span className={`status-icon ${status.tone}`} aria-label={status.name}>
        <Glyph keys={status.glyph} emoji={status.emoji} />
        {status.badge ? <b title={t('Turns left')}>{status.badge}</b> : null}
      </span>
    </Hint>
  );
}
