import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { musicContext } from '../../shared/music';
import type { GameState, LocationKind } from '../../shared/types';
import { Game } from '../src/game/engine';
import { DEFAULT_TRACKS, byteRange, ensureMusic, musicEnabled, musicManifest, trackList } from '../src/music';

const mp3 = new Uint8Array(20_000).fill(0x55);
mp3.set([0x49, 0x44, 0x33], 0); // "ID3"
const dir = () => mkdtempSync(join(tmpdir(), 'hf-music-'));
const answer = (body: Uint8Array | string, status = 200, type = 'audio/mpeg') => new Response(body, { status, headers: { 'content-type': type } });

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

describe('music library', () => {
  it('is on unless switched off', () => {
    expect(musicEnabled({})).toBe(true);
    expect(musicEnabled({ HEARTHFORGE_MUSIC: 'OFF' })).toBe(false);
    expect(musicManifest('/nonexistent', { HEARTHFORGE_MUSIC: 'off' })).toEqual({ enabled: false, pending: false, tracks: [] });
    expect(musicManifest('/nonexistent', {})).toEqual({ enabled: true, pending: false, tracks: [] });
  });

  it('covers every context with credited tracks', () => {
    for (const c of ['tavern', 'town', 'overworld', 'dungeon', 'combat', 'boss']) expect(DEFAULT_TRACKS.some((t) => t.context === c), c).toBe(true);
    for (const t of DEFAULT_TRACKS) { expect(t.artist).not.toBe(''); expect(t.license).toMatch(/^CC/); expect(t.url).toMatch(/^https:\/\//); }
  });

  it('fetches tracks, skips the ones that fail and stays silent without any', async () => {
    const d = dir();
    const asked: string[] = [];
    const fetchFn = (async (url: string) => {
      asked.push(url);
      if (url.includes('Thatched')) return answer(mp3);
      if (url.includes('Feast')) return answer('<html>moved</html>'.padEnd(20_000), 200, 'text/html');
      if (url.includes('Folk')) throw new Error('offline');
      return answer('gone', 404);
    }) as unknown as typeof fetch;
    await expect(ensureMusic(d, {}, fetchFn)).resolves.toBeUndefined();
    expect(asked).toHaveLength(DEFAULT_TRACKS.length);
    const m = musicManifest(d, {});
    expect(m.tracks).toEqual([{ id: 'tavern/thatched-villagers.mp3', context: 'tavern', title: 'Thatched Villagers', artist: 'Kevin MacLeod (incompetech.com)', license: 'CC BY 4.0', src: '/music/tavern/thatched-villagers.mp3' }]);
    expect(existsSync(join(d, 'tavern', 'master-of-the-feast.mp3'))).toBe(false);
    // A second start only asks for what is still missing.
    asked.length = 0;
    await ensureMusic(d, {}, fetchFn);
    expect(asked).toHaveLength(DEFAULT_TRACKS.length - 1);

    const empty = dir();
    await ensureMusic(empty, {}, (async () => { throw new Error('offline'); }) as unknown as typeof fetch);
    expect(musicManifest(empty, {}).tracks).toEqual([]);
    await ensureMusic(empty, { HEARTHFORGE_MUSIC: 'off' }, (async () => { throw new Error('must not be called'); }) as unknown as typeof fetch);
  });

  it('plays files dropped into a context folder and reads a custom track list', () => {
    const d = dir();
    mkdirSync(join(d, 'combat'));
    mkdirSync(join(d, 'elsewhere'));
    writeFileSync(join(d, 'combat', 'My_Battle-Song.ogg'), mp3);
    writeFileSync(join(d, 'combat', 'notes.txt'), 'x');
    writeFileSync(join(d, 'elsewhere', 'song.mp3'), mp3);
    expect(musicManifest(d, {}).tracks).toEqual([{ id: 'combat/My_Battle-Song.ogg', context: 'combat', title: 'My Battle Song', artist: '', license: '', src: '/music/combat/My_Battle-Song.ogg' }]);

    writeFileSync(join(d, 'tracks.json'), JSON.stringify([
      { context: 'town', title: 'Market Day', artist: 'Someone', license: 'CC0', url: 'https://example.org/market.ogg' },
      { context: 'nowhere', title: 'Bad', url: 'https://example.org/x.mp3' },
      { context: 'town', title: 'Local file', url: 'file:///etc/passwd' },
    ]));
    expect(trackList(d)).toEqual([{ context: 'town', title: 'Market Day', artist: 'Someone', license: 'CC0', url: 'https://example.org/market.ogg' }]);
    writeFileSync(join(d, 'tracks.json'), 'not json');
    expect(trackList(d)).toBe(DEFAULT_TRACKS);
  });

  it('answers byte ranges', () => {
    expect(byteRange(undefined, 100)).toBeNull();
    expect(byteRange('bytes=0-', 100)).toEqual({ start: 0, end: 99 });
    expect(byteRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    expect(byteRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 });
    expect(byteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(byteRange('bytes=100-', 100)).toBeNull();
    expect(byteRange('bytes=5-2', 100)).toBeNull();
    expect(byteRange('lines=1-2', 100)).toBeNull();
  });
});
