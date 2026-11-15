import { useEffect, useRef, useState } from 'react';
import { tileDifficult, tileGivesCover, type Biome } from '../../../shared/battlemap';
import type { GameState } from '../../../shared/types';
import { useT } from '../i18n';
import { MapRenderer, type TokenHover, type ViewOptions } from '../game/MapRenderer';
import { useEntityHover } from './Story';
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

  const t = useT();
  const names: Record<Biome, string> = {
    dungeon: t('Dungeon'), cave: t('Cave'), ruin: t('Ruins'), tavern: t('Tavern'), town: t('Town streets'), road: t('Road'), bridge: t('Bridge'),
    camp: t('Camp'), plains: t('Plains'), forest: t('Forest'), hills: t('Hills'), mountains: t('Mountains'), swamp: t('Swamp'),
  };
  const tiles = state.map.rows.join('');
  const slow = [...tiles].some(tileDifficult);
  const cover = [...tiles].some(tileGivesCover);
  return (
    <div className="map" ref={host}>
      {token && <div ref={anchor} className="token-anchor" style={{ left: token.left, top: token.top, width: token.size, height: token.size }} />}
      <div className="map-legend">
        <strong>{names[state.map.biome] ?? names.dungeon}</strong>
        {slow && <span>{t('Mud, brush, rubble and shallow water cost double movement.')}</span>}
        {cover && <span>{t('Trees, rocks and furniture give half cover (+2 AC) against shots.')}</span>}
      </div>
    </div>
  );
}
