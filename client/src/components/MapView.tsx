import { useEffect, useRef } from 'react';
import { tileDifficult, tileGivesCover, type Biome } from '../../../shared/battlemap';
import type { GameState } from '../../../shared/types';
import { useT } from '../i18n';
import { MapRenderer, type ViewOptions } from '../game/MapRenderer';
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
  const click = useRef(onTile);
  click.current = onTile;

  useEffect(() => {
    const r = new MapRenderer();
    renderer.current = r;
    r.onTile = (x, y) => click.current(x, y);
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
      <div className="map-legend">
        <strong>{names[state.map.biome] ?? names.dungeon}</strong>
        {slow && <span>{t('Mud, brush, rubble and shallow water cost double movement.')}</span>}
        {cover && <span>{t('Trees, rocks and furniture give half cover (+2 AC) against shots.')}</span>}
      </div>
    </div>
  );
}
