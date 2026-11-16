import { useEffect, useRef, useState } from 'react';
import { tileDifficult, tileGivesCover, type Biome } from '../../../shared/battlemap';
import type { GameState } from '../../../shared/types';
import { useLang, useT } from '../i18n';
import { heroStatuses, monsterStatuses, type TokenStatus } from '../game/statuses';
import { Hint } from '../ui/Hint';
import { Glyph } from '../ui/Glyph';
import { MapRenderer, type TokenHover, type ViewOptions } from '../game/MapRenderer';
import { useEntityHover } from './Story';
import { heroSenses } from '../game/util';
import type { MoveListener } from '../net';

interface Props {
  state: GameState;
  view: ViewOptions;
  onTile: (x: number, y: number) => void;
  onMoved: (fn: MoveListener) => () => void;
}

export function MapView({ state, view, onTile, onMoved }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<MapRenderer | null>(null);
  const [token, setToken] = useState<TokenHover | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const { entities, hover } = useEntityHover();
  const click = useRef(onTile);
  click.current = onTile;

  useEffect(() => {
    const r = new MapRenderer();
    renderer.current = r;
    r.onTile = (x, y) => click.current(x, y);
    r.onHoverMonster = setToken;
    void r.init(host.current!);
    const off = onMoved((id, path) => r.queuePath(id, path));
    return () => {
      off();
      r.destroy();
      renderer.current = null;
    };
  }, [onMoved]);

  useEffect(() => {
    renderer.current?.update(state, view);
  }, [state, view]);

  // Pointing at a monster shows its card, anchored to its token.
  const hovered = token ? state.monsters.find((m) => m.id === token.id && m.alive) : undefined;
  const hoveredName = hovered?.name;
  useEffect(() => {
    const entity = hoveredName ? entities.find((e) => e.kind === 'monster' && e.name === hoveredName) : undefined;
    if (entity && anchor.current) hover.show(entity, anchor.current);
    else hover.hide();
    return () => hover.hide();
  }, [hoveredName, token, entities, hover]);

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
        el.style.transform = `translate(${Math.round(rect.left + rect.size / 2)}px, ${Math.round(rect.top - rect.size * 0.12)}px) translate(-50%, -100%)`;
      }
      frame = requestAnimationFrame(place);
    };
    frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, []);

  const t = useT();
  const { lang } = useLang();
  const statuses: { id: string; list: TokenStatus[] }[] = state.phase === 'combat' ? [
    ...state.characters.filter((c) => !c.dead).map((c) => ({ id: c.id, list: heroStatuses(c, state, t, lang) })),
    ...state.monsters.filter((m) => m.alive && !view.unseenIds.has(m.id)).map((m) => ({ id: m.id, list: monsterStatuses(m, state, t, lang) })),
  ].filter((x) => x.list.length > 0) : [];
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
    <div className="map" ref={host}>
      <div className="token-statuses" ref={layer}>
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
