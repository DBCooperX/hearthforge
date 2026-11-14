import { useEffect, useRef } from 'react';
import type { GameState } from '../../../shared/types';
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

  return <div className="map" ref={host} />;
}
