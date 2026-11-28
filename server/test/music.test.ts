import { describe, expect, it } from 'vitest';
import { musicContext } from '../../shared/music';
import type { GameState, LocationKind } from '../../shared/types';
import { Game } from '../src/game/engine';
import { byteRange, musicEnabled } from '../src/music';

describe('music context', () => {
  const at = (kind: LocationKind | null, phase: GameState['phase'] = 'explore', bossFight = false) =>
    musicContext({
      phase, bossFight,
      world: { placeId: kind ? 'x' : null, locations: kind ? [{ id: 'x', kind }] : [] } as unknown as GameState['world'],
    });

  it('follows where the party is', () => {
    expect(musicContext(null)).toBe('tavern');
    expect(at('tavern', 'lobby')).toBe('tavern');
    expect(at('tavern')).toBe('tavern');
    expect(at('town')).toBe('town');
    expect(at('village')).toBe('town');
    expect(at(null)).toBe('overworld');
    expect(at('shrine')).toBe('overworld');
    expect(at('dungeon')).toBe('dungeon');
    expect(at('cave')).toBe('dungeon');
  });

  it('switches for fights and back', () => {
    expect(at('town', 'combat')).toBe('combat');
    expect(at('dungeon', 'combat', true)).toBe('boss');
    expect(at('town', 'explore')).toBe('town');
  });

  it('gets the boss flag from the engine', () => {
    const g = new Game('test', () => 0.42);
    g.upsertPlayer('p', 'Tester', true);
    g.addCharacter('p', 'fighter', '');
    g.start();
    const view = () => g.publicState({ busy: false, mode: 'scripted', model: null });
    expect(musicContext(view())).toBe('town');
    g.startEncounter([{ defId: 'giant_rat', count: 1 }], { source: 'story', context: 'test' });
    expect(musicContext(view())).toBe('combat');
    const g2 = new Game('test', () => 0.42);
    g2.upsertPlayer('p', 'Tester', true);
    g2.addCharacter('p', 'fighter', '');
    g2.start();
    g2.startEncounter([{ defId: 'bugbear', count: 1 }], { source: 'story', context: 'test' });
    expect(musicContext(g2.publicState({ busy: false, mode: 'scripted', model: null }))).toBe('boss');
  });
});

describe('music switch and byte ranges', () => {
  it('is on unless switched off', () => {
    expect(musicEnabled({})).toBe(true);
    expect(musicEnabled({ HEARTHFORGE_MUSIC: 'OFF' })).toBe(false);
  });

  it('answers byte ranges', () => {
    expect(byteRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(byteRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 });
    expect(byteRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(byteRange('bytes=0-5000', 1000)).toEqual({ start: 0, end: 999 });
    expect(byteRange('bytes=2000-', 1000)).toBeNull();
    expect(byteRange(undefined, 1000)).toBeNull();
    expect(byteRange('nonsense', 1000)).toBeNull();
  });
});
