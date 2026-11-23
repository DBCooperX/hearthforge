import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { searchLibrary } from '../../shared/library';
import { Game } from '../src/game/engine';
import { SoundLibrary } from '../src/library';
import { findSound, orderSound, playSound, sceneNow, soundReady, soundState, type SoundHit, type SoundHooks } from '../src/game/sounds';
import { DM_TOOLS } from '../src/dm/claude';

function started() {
  const g = new Game('test', () => 0.42);
  g.upsertPlayer('p1', 'Tester', true);
  g.addCharacter('p1', 'fighter', '');
  g.start();
  g.takeBeats();
  return g;
}

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A library with a fake ElevenLabs, wired to a game the way the server does it. */
function wired(opts: { cap?: number; key?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hf-dmsound-'));
  dirs.push(dir);
  let n = 0;
  const fetchFn = (async () => {
    const bytes = new Uint8Array(2000).fill(0x30 + (n++ % 9));
    bytes.set([0x49, 0x44, 0x33]);
    return new Response(bytes, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  }) as unknown as typeof fetch;
  const game = started();
  const hit = (e: ReturnType<SoundLibrary['entries']>[number]): SoundHit => ({ id: e.id, kind: e.kind, title: e.title, description: e.description, scene: e.scene, seconds: e.seconds, src: e.src, status: e.status });
  let changed = 0;
  const lib = new SoundLibrary(dir, opts.key === false ? {} : { ELEVENLABS_API_KEY: 'k' }, {
    fetchFn,
    onDone: (e) => { if (e.table === 'test' && soundReady(game, hit(e))) changed++; },
  });
  const hooks: SoundHooks = {
    find: (k, w) => searchLibrary(lib.entries(), k, w, 5).map(hit),
    get: (id) => { const e = lib.get(id); return e ? hit(e) : null; },
    orderGate: () => {
      if (!lib.canMake()) return 'the server has no ElevenLabs key';
      const o = lib.ordersAt('test', 0);
      if (o.making) return 'the last sound you ordered is still being made';
      return opts.cap && o.count >= opts.cap ? 'cap reached' : null;
    },
    order: (k, d) => hit(lib.make({ kind: k, description: d }, 'dm', { table: 'test' })),
  };
  game.sounds = hooks;
  return { game, lib, changed: () => changed };
}

describe('the Dungeon Master and the sound library', () => {
  it('offers one small sound tool', () => {
    const tool = DM_TOOLS.find((t) => t.name === 'sound');
    expect(tool).toBeTruthy();
    expect(JSON.stringify(tool!.input_schema)).not.toContain('enum');
  });

  it('finds a sound by words and puts it on for the scene the party is in', async () => {
    const { game, lib } = wired();
    lib.make({ kind: 'music', description: 'slow fiddle, misty harbour at night', title: 'Harbour mist' }, 'innkeeper');
    lib.make({ kind: 'sfx', description: 'heavy wooden door creaks open' }, 'innkeeper');
    await lib.whenIdle();
    const found = findSound(game, { kind: 'song', words: 'harbour fog at night' }) as { found: { id: string; title: string }[] };
    expect(found.found.map((f) => f.title)).toEqual(['Harbour mist']);
    const out = playSound(game, { id: found.found[0].id });
    expect(out.playing).toBe('Harbour mist');
    expect(game.s.soundtrack?.music).toMatchObject({ title: 'Harbour mist', context: sceneNow(game) });
    expect(game.publicState({ busy: false, mode: 'scripted', model: null }).soundtrack?.music?.src).toMatch(/^\/library\//);
    expect(soundState(game)).toContain('Harbour mist');
    // Leaving the place ends the pick; the server's own music for the scene comes back.
    const was = game.s.world!.placeId;
    game.s.world!.placeId = 'somewhere-else';
    expect(game.publicState({ busy: false, mode: 'scripted', model: null }).soundtrack?.music).toBeNull();
    game.s.world!.placeId = was;

    const door = (findSound(game, { kind: 'effect', words: 'door creak' }) as { found: { id: string }[] }).found[0];
    playSound(game, { id: door.id });
    playSound(game, { id: door.id });
    expect(game.s.soundtrack?.effect?.n).toBe(2);
  });

  it('plays the closest match meanwhile and swaps the ordered sound in when it is made', async () => {
    const { game, lib, changed } = wired();
    lib.make({ kind: 'ambient', description: 'wind over moorland, distant birds', title: 'Moor wind' }, 'innkeeper');
    await lib.whenIdle();
    const stand = lib.entries()[0];
    const out = orderSound(game, { kind: 'ambient', description: 'wind over a moor with a far-off bell tolling', meanwhile: stand.id });
    expect(out).toMatchObject({ ordered: true, meanwhile: 'Moor wind' });
    expect(game.s.soundtrack?.ambient?.title).toBe('Moor wind');
    expect(game.s.soundtrack?.waiting?.ambient?.id).toBe(out.id);
    // Only one order at a time.
    expect(orderSound(game, { kind: 'music', description: 'a sad lute for the fallen' })).toMatchObject({ ordered: false });
    await lib.whenIdle();
    expect(changed()).toBe(1);
    expect(game.s.soundtrack?.ambient?.id).toBe(out.id);
    expect(game.s.soundtrack?.waiting?.ambient).toBeUndefined();
    expect(lib.get(out.id)).toMatchObject({ by: 'dm', table: 'test', status: 'ready' });
  });

  it('keeps a sound that arrives after the party moved on in the library, without putting it on', async () => {
    const { game, lib } = wired();
    const out = orderSound(game, { kind: 'music', description: 'tense drums for a chase through alleys' });
    // The party is somewhere else now.
    game.s.soundtrack!.waiting!.music!.context = 'boss';
    await lib.whenIdle();
    expect(game.s.soundtrack?.music ?? null).toBeNull();
    expect(game.s.soundtrack?.waiting?.music).toBeUndefined();
    expect(lib.get(out.id)?.status).toBe('ready');
  });

  it('respects the per-table cap and a missing key', async () => {
    const capped = wired({ cap: 1 });
    expect(orderSound(capped.game, { kind: 'effect', description: 'a raven caws twice' })).toMatchObject({ ordered: true });
    await capped.lib.whenIdle();
    expect(orderSound(capped.game, { kind: 'effect', description: 'a bell rings far away' })).toMatchObject({ ordered: false, reason: 'cap reached' });
    const none = wired({ key: false });
    expect(orderSound(none.game, { kind: 'effect', description: 'a raven caws twice' })).toMatchObject({ ordered: false });
    expect(soundState(none.game)).toContain('cannot be ordered');
  });

  it('says so plainly when the server has no library', () => {
    const g = started();
    expect(findSound(g, { words: 'rain' })).toMatchObject({ found: [] });
    expect(soundState(g)).toBeNull();
    expect(() => orderSound({ ...g, sounds: { find: () => [], get: () => null, orderGate: () => null, order: () => { throw new Error('no'); } } } as unknown as Game, { kind: 'drums', description: 'loud war drums' })).toThrow(/kind/);
  });
});
