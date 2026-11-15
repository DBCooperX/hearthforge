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
    expect(m.tracks).toEqual([{ id: 'tavern/thatched-villagers.mp3', context: 'tavern', layer: 'music', title: 'Thatched Villagers', artist: 'Kevin MacLeod (incompetech.com)', license: 'CC BY 4.0', src: '/music/tavern/thatched-villagers.mp3' }]);
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
    expect(musicManifest(d, {}).tracks).toEqual([{ id: 'combat/My_Battle-Song.ogg', context: 'combat', layer: 'music', title: 'My Battle Song', artist: '', license: '', src: '/music/combat/My_Battle-Song.ogg' }]);

    writeFileSync(join(d, 'tracks.json'), JSON.stringify([
      { context: 'town', title: 'Market Day', artist: 'Someone', license: 'CC0', url: 'https://example.org/market.ogg' },
      { context: 'nowhere', title: 'Bad', url: 'https://example.org/x.mp3' },
      { context: 'town', title: 'Local file', url: 'file:///etc/passwd' },
    ]));
    expect(trackList(d)).toEqual([{ context: 'town', layer: 'music', title: 'Market Day', artist: 'Someone', license: 'CC0', url: 'https://example.org/market.ogg' }]);
    writeFileSync(join(d, 'tracks.json'), 'not json');
    expect(trackList(d)).toBe(DEFAULT_TRACKS);
  });

  it('keeps ambient loops apart from the music', async () => {
    const d = dir();
    mkdirSync(join(d, 'ambient', 'tavern'), { recursive: true });
    writeFileSync(join(d, 'ambient', 'tavern', 'crowd_murmur.ogg'), mp3);
    writeFileSync(join(d, 'tracks.json'), JSON.stringify([
      { context: 'tavern', layer: 'ambient', title: 'Crowd murmur', artist: 'Someone', license: 'CC0', url: 'https://example.org/crowd.ogg' },
      { context: 'town', title: 'Market Day', url: 'https://example.org/market.ogg' },
    ]));
    await ensureMusic(d, {}, (async () => answer(mp3)) as unknown as typeof fetch);
    expect(existsSync(join(d, 'ambient', 'tavern', 'crowd-murmur.ogg'))).toBe(true);
    expect(existsSync(join(d, 'tavern', 'crowd-murmur.ogg'))).toBe(false);
    const tracks = musicManifest(d, {}).tracks;
    expect(tracks.filter((x) => x.layer === 'music').map((x) => x.id)).toEqual(['town/market-day.ogg']);
    expect(tracks.filter((x) => x.layer === 'ambient')).toEqual([
      { id: 'ambient/tavern/crowd-murmur.ogg', context: 'tavern', layer: 'ambient', title: 'Crowd murmur', artist: 'Someone', license: 'CC0', src: '/music/ambient/tavern/crowd-murmur.ogg' },
      { id: 'ambient/tavern/crowd_murmur.ogg', context: 'tavern', layer: 'ambient', title: 'crowd murmur', artist: '', license: '', src: '/music/ambient/tavern/crowd_murmur.ogg' },
    ]);
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

describe('music library managed by the owner', () => {
  const audioFile = () => { const b = new Uint8Array(20_000).fill(0x55); b.set([0x49, 0x44, 0x33], 0); return b; };

  it('lists built-in tracks that are missing and files that are there, and lets the owner switch one off and move it', async () => {
    const d = dir();
    const { musicAction, musicLibrary } = await import('../src/music');
    mkdirSync(join(d, 'tavern'), { recursive: true });
    writeFileSync(join(d, 'tavern', 'mine.mp3'), audioFile());
    let lib = musicLibrary(d, {});
    expect(lib.items.find((i) => i.id === 'tavern/mine.mp3')?.ready).toBe(true);
    expect(lib.items.some((i) => !i.ready && i.builtIn)).toBe(true);
    await musicAction(d, {}, { do: 'set', id: 'tavern/mine.mp3', enabled: false, context: 'dungeon' });
    expect(musicManifest(d, {}).tracks.find((t) => t.id === 'tavern/mine.mp3')).toBeUndefined();
    lib = musicLibrary(d, {});
    expect(lib.items.find((i) => i.id === 'tavern/mine.mp3')).toMatchObject({ enabled: false, context: 'dungeon' });
    await musicAction(d, {}, { do: 'set', id: 'tavern/mine.mp3', enabled: true });
    expect(musicManifest(d, {}).tracks.find((t) => t.id === 'tavern/mine.mp3')?.context).toBe('dungeon');
    await expect(musicAction(d, {}, { do: 'set', id: '../etc/passwd', enabled: false })).rejects.toMatchObject({ code: 'unknown_track' });
  });

  it('does not fetch a removed built-in track again, until the owner presses Download', async () => {
    const d = dir();
    const { musicAction } = await import('../src/music');
    const calls: string[] = [];
    const fetchFn = (async (u: string) => { calls.push(u); return answer(audioFile()); }) as unknown as typeof fetch;
    await ensureMusic(d, {}, fetchFn);
    const id = `tavern/thatched-villagers.mp3`;
    expect(existsSync(join(d, id))).toBe(true);
    await musicAction(d, {}, { do: 'remove', id });
    expect(existsSync(join(d, id))).toBe(false);
    calls.length = 0;
    await ensureMusic(d, {}, fetchFn);
    expect(existsSync(join(d, id))).toBe(false);
    await musicAction(d, {}, { do: 'fetch', id }, fetchFn);
    expect(existsSync(join(d, id))).toBe(true);
  });

  it('takes in uploads, single files and zips, into the chosen scene', async () => {
    const d = dir();
    const { addUpload, musicLibrary } = await import('../src/music');
    const { zipSync } = await import('fflate');
    const added = addUpload(d, 'Crackling Fire.ogg', Object.assign(audioFile(), { 0: 0x4f, 1: 0x67, 2: 0x67, 3: 0x53 }), 'ambient', 'tavern');
    expect(added[0].id).toBe('ambient/tavern/crackling-fire.ogg');
    const zip = zipSync({ 'a/Wind.mp3': audioFile(), 'readme.txt': new Uint8Array(5000) });
    expect(addUpload(d, 'pack.zip', zip, 'ambient', 'overworld').map((a) => a.id)).toEqual(['ambient/overworld/wind.mp3']);
    expect(musicLibrary(d, {}).items.filter((i) => i.layer === 'ambient' && !i.builtIn)).toHaveLength(2);
    expect(() => addUpload(d, 'x.mp3', new Uint8Array(5000), 'music', 'town')).toThrow();
    expect(() => addUpload(d, 'x.mp3', audioFile(), 'music', 'nowhere')).toThrow();
  });

  it('adds a file from a link the owner pasted, and refuses private addresses', async () => {
    const d = dir();
    const { musicAction, musicLibrary, linkAllowed } = await import('../src/music');
    const fetchFn = (async () => answer(audioFile())) as unknown as typeof fetch;
    await musicAction(d, {}, { do: 'add_link', url: 'https://example.org/sounds/Tavern%20Crowd.mp3', layer: 'ambient', context: 'tavern', artist: 'Someone', license: 'CC0' }, fetchFn);
    expect(musicLibrary(d, {}).items.find((i) => i.layer === 'ambient')).toMatchObject({ title: 'Tavern Crowd', artist: 'Someone', license: 'CC0', ready: true });
    for (const bad of ['http://localhost/a.mp3', 'http://192.168.1.5/a.mp3', 'http://127.0.0.1/a.mp3', 'file:///etc/passwd', 'ftp://x.org/a.mp3', 'http://nas/a.mp3', 'http://[::1]/a.mp3']) expect(linkAllowed(bad), bad).toBeNull();
    await expect(musicAction(d, {}, { do: 'add_link', url: 'http://127.0.0.1/a.mp3', layer: 'music', context: 'town' }, fetchFn)).rejects.toMatchObject({ code: 'bad_link' });
  });
});

describe('freesound', () => {
  const key = { FREESOUND_API_KEY: 'k' };
  const mk = () => mkdtempSync(join(tmpdir(), 'hf-fs-'));
  const audio = () => Object.assign(new Uint8Array(20000), { 0: 0x49, 1: 0x44, 2: 0x33 });
  const fake = (asked: string[]) => (async (input: string | URL | Request) => {
    const u = String(input);
    asked.push(u);
    if (u.includes('/apiv2/search/text/')) {
      return new Response(JSON.stringify({ results: [1, 2, 3].map((id) => ({ id, name: `Crowd ${id}.wav`, username: 'bob', url: `https://freesound.org/s/${id}/`, previews: { 'preview-hq-mp3': `https://cdn.freesound.org/p/${id}.mp3` } })) }), { status: 200 });
    }
    return new Response(audio(), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  }) as typeof fetch;

  it('needs a key', async () => {
    const { fetchFreesound } = await import('../src/music');
    await expect(fetchFreesound(mk(), {})).rejects.toMatchObject({ code: 'no_key' });
  });

  it('fetches CC0 previews with credits, and never twice', async () => {
    const { fetchFreesound, musicLibrary } = await import('../src/music');
    const d = mk();
    const asked: string[] = [];
    expect(await fetchFreesound(d, key, ['tavern'], fake(asked))).toBe(2);
    expect(asked[0]).toContain('Creative+Commons+0');
    const items = musicLibrary(d, {}).items.filter((i) => i.layer === 'ambient' && !i.builtIn);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ context: 'tavern', license: 'CC0', artist: 'bob (freesound.org)', ready: true });
    expect(await fetchFreesound(d, key, ['tavern'], fake([]))).toBe(1);
    await expect(fetchFreesound(d, key, ['tavern'], fake([]))).rejects.toMatchObject({ code: 'download_failed' });
  });

  it('on start fills only empty scenes, once', async () => {
    const { ensureFreesound } = await import('../src/music');
    const d = mk();
    const asked: string[] = [];
    await ensureFreesound(d, key, fake(asked));
    expect(asked.filter((u) => u.includes('/search/')).length).toBeGreaterThanOrEqual(4);
    const n = asked.length;
    await ensureFreesound(d, key, fake(asked));
    expect(asked.length).toBe(n);
    const none: string[] = [];
    await ensureFreesound(mk(), {}, fake(none));
    expect(none).toEqual([]);
  });
});

describe('switching a track off', () => {
  it('keeps it out of what players get, and back in when switched on again', async () => {
    const { musicAction } = await import('../src/music');
    const d = dir();
    mkdirSync(join(d, 'tavern'), { recursive: true });
    writeFileSync(join(d, 'tavern', 'a.mp3'), mp3);
    writeFileSync(join(d, 'tavern', 'b.mp3'), mp3);
    const ids = () => musicManifest(d, {}).tracks.map((t) => t.id).sort();
    expect(ids()).toEqual(['tavern/a.mp3', 'tavern/b.mp3']);
    await musicAction(d, {}, { do: 'set', id: 'tavern/a.mp3', enabled: false });
    expect(ids()).toEqual(['tavern/b.mp3']);
    await musicAction(d, {}, { do: 'set', id: 'tavern/a.mp3', enabled: true });
    expect(ids()).toEqual(['tavern/a.mp3', 'tavern/b.mp3']);
  });
});
