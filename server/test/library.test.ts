import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { searchLibrary, soundCost, type LibraryEntry } from '../../shared/library';
import { Credits } from '../src/credits';
import { LibraryError, SoundLibrary, elevenSound, promptFor, type Payer } from '../src/library';

const fresh = () => mkdtempSync(join(tmpdir(), 'hf-library-'));
const KEY = { ELEVENLABS_API_KEY: 'test-key' } as NodeJS.ProcessEnv;

/** A fake ElevenLabs: answers every call with a small mp3-ish body, or with what `answer` says. */
function fakeEleven(answer?: (url: string, body: Record<string, unknown>) => Response | undefined) {
  const calls: { url: string; body: Record<string, unknown>; key: string }[] = [];
  let n = 0;
  const fn = (async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push({ url: String(url), body, key: String((init?.headers as Record<string, string>)['xi-api-key']) });
    const own = answer?.(String(url), body);
    if (own) return own;
    const bytes = new Uint8Array(2000).fill(0x30 + (n++ % 9));
    bytes.set([0x49, 0x44, 0x33]);
    return new Response(bytes, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  }) as typeof fetch;
  return { fn, calls };
}

function make(dir = fresh(), answer?: Parameters<typeof fakeEleven>[0]) {
  const eleven = fakeEleven(answer);
  const costs: { usd: number; payer: Payer; id: string }[] = [];
  let changes = 0;
  const lib = new SoundLibrary(dir, KEY, { fetchFn: eleven.fn, onCost: (usd, e, payer) => costs.push({ usd, payer, id: e.id }), onChange: () => { changes++; } });
  return { lib, dir, eleven, costs, changes: () => changes };
}

describe('the sound library', () => {
  it('makes an effect in the background, keeps the file and books the take', async () => {
    const { lib, dir, eleven, costs } = make();
    const e = lib.make({ kind: 'sfx', description: 'Heavy sword hits a wooden shield', event: 'hit_slash', seconds: 2 }, 'innkeeper', { account: 'acc-1' });
    expect(e.status).toBe('making');
    expect(e.src).toBe('');
    await lib.whenIdle();
    const [done] = lib.entries();
    expect(done.status).toBe('ready');
    expect(done.src).toMatch(/^\/library\/[0-9a-f]{20}\.mp3$/);
    expect(lib.file(done.src.slice(9))).toBeTruthy();
    expect(readdirSync(join(dir, 'files'))).toHaveLength(1);
    expect(eleven.calls[0].url).toContain('/v1/sound-generation');
    expect(eleven.calls[0].key).toBe('test-key');
    expect(eleven.calls[0].body).toMatchObject({ duration_seconds: 2, model_id: 'eleven_text_to_sound_v2' });
    expect(eleven.calls[0].body.text).toContain('Heavy sword hits a wooden shield');
    expect(eleven.calls[0].body.loop).toBeUndefined();
    expect(costs).toEqual([{ usd: soundCost('sfx', 2), payer: { account: 'acc-1' }, id: e.id }]);
    expect(done.usd).toBeCloseTo(0.004, 6);
    expect(done.tags).toEqual(expect.arrayContaining(['heavy', 'sword', 'wooden', 'shield']));
  });

  it('asks for a seamless loop for ambient sounds and for instrumental music by length', async () => {
    const { lib, eleven } = make();
    lib.make({ kind: 'ambient', description: 'quiet tavern crowd', scene: 'tavern' }, 'innkeeper');
    lib.make({ kind: 'music', description: 'misty harbour at night, slow fiddle', scene: 'town', seconds: 120 }, 'innkeeper');
    await lib.whenIdle();
    const amb = eleven.calls.find((c) => c.url.includes('sound-generation'))!;
    expect(amb.body).toMatchObject({ loop: true, duration_seconds: 30 });
    const mus = eleven.calls.find((c) => c.url.includes('/v1/music'))!;
    expect(mus.body).toMatchObject({ music_length_ms: 120000, force_instrumental: true, model_id: 'music_v1' });
    expect(String(mus.body.prompt)).toContain('misty harbour at night');
    expect(lib.entries().every((e) => e.status === 'ready')).toBe(true);
    expect(lib.entries().find((e) => e.kind === 'ambient')!.loop).toBe(true);
  });

  it('keeps lengths inside what the providers accept', () => {
    const { lib } = make();
    expect(lib.make({ kind: 'sfx', description: 'a click', seconds: 99 }, 'innkeeper').seconds).toBe(30);
    expect(lib.make({ kind: 'music', description: 'a song', seconds: 1 }, 'innkeeper').seconds).toBe(10);
    expect(lib.make({ kind: 'music', description: 'a song', seconds: 9999 }, 'innkeeper').seconds).toBe(300);
  });

  it('says what ElevenLabs said when music is not part of the account', async () => {
    const { lib, costs } = make(fresh(), (url) => url.includes('/music')
      ? new Response(JSON.stringify({ detail: { status: 'subscription_required', message: 'The music API needs a paid plan.' } }), { status: 403 })
      : undefined);
    lib.make({ kind: 'music', description: 'tavern jig', scene: 'tavern' }, 'innkeeper');
    await lib.whenIdle();
    const [e] = lib.entries();
    expect(e.status).toBe('failed');
    expect(e.error).toBe('not_allowed: The music API needs a paid plan.');
    expect(costs).toEqual([]);
  });

  it('tells an empty ElevenLabs account apart from a refusal', async () => {
    await expect(elevenSound('k', 'sfx', 'x', 1, (async () => new Response(JSON.stringify({ detail: { status: 'quota_exceeded', message: 'You have 0 credits left.' } }), { status: 401 })) as typeof fetch))
      .rejects.toMatchObject({ code: 'out_of_credit' });
    await expect(elevenSound('k', 'sfx', 'x', 1, (async () => new Response('{"detail":"Invalid API key"}', { status: 401 })) as typeof fetch))
      .rejects.toMatchObject({ code: 'not_allowed', detail: 'Invalid API key' });
    await expect(elevenSound('k', 'sfx', 'x', 1, (async () => new Response('busy', { status: 500 })) as typeof fetch))
      .rejects.toMatchObject({ code: 'provider_failed' });
  });

  it('refuses to make anything without a key', () => {
    const lib = new SoundLibrary(fresh(), {} as NodeJS.ProcessEnv);
    expect(() => lib.make({ kind: 'sfx', description: 'a click' }, 'innkeeper')).toThrow(LibraryError);
    expect(lib.library().canMake).toBe(false);
  });

  it('plays the old take until a new one is there, and keeps it when the new one fails', async () => {
    let fail = false;
    const { lib, dir } = make(fresh(), () => (fail ? new Response('nope', { status: 500 }) : undefined));
    const e = lib.make({ kind: 'sfx', description: 'coins on a table', event: 'coins' }, 'innkeeper');
    await lib.whenIdle();
    const first = lib.entries()[0].src;
    lib.regenerate(e.id);
    expect(lib.entries()[0].src).toBe('');
    await lib.whenIdle();
    const second = lib.entries()[0].src;
    expect(second).not.toBe(first);
    expect(readdirSync(join(dir, 'files'))).toHaveLength(1);
    fail = true;
    lib.regenerate(e.id);
    await lib.whenIdle();
    const after = lib.entries()[0];
    expect(after.status).toBe('ready');
    expect(after.src).toBe(second);
    expect(after.error).toMatch(/^provider_failed/);
  });

  it('removes an entry with its file', async () => {
    const { lib, dir } = make();
    const e = lib.make({ kind: 'sfx', description: 'door creaks' }, 'innkeeper');
    await lib.whenIdle();
    lib.remove(e.id);
    expect(lib.entries()).toEqual([]);
    expect(readdirSync(join(dir, 'files'))).toEqual([]);
  });

  it('starts takes again that a restart cut off', async () => {
    const dir = fresh();
    const first = new SoundLibrary(dir, KEY, { fetchFn: (() => new Promise(() => {})) as typeof fetch });
    first.make({ kind: 'sfx', description: 'a bell' }, 'innkeeper');
    const { lib } = make(dir);
    await new Promise((r) => setTimeout(r, 5));
    await lib.whenIdle();
    expect(lib.entries()[0].status).toBe('ready');
  });

  it('lets players hear the library first, scene by scene and moment by moment', async () => {
    const { lib } = make();
    const a = lib.make({ kind: 'music', description: 'tavern jig', scene: 'tavern' }, 'innkeeper');
    lib.make({ kind: 'sfx', description: 'coins', event: 'coins' }, 'innkeeper');
    lib.make({ kind: 'sfx', description: 'more coins', event: 'coins' }, 'innkeeper');
    await lib.whenIdle();
    const old = { enabled: true, pending: false, tracks: [
      { id: 'tavern/folk.mp3', context: 'tavern' as const, layer: 'music' as const, title: 'Folk', artist: 'K', license: 'CC', src: '/music/tavern/folk.mp3' },
      { id: 'town/x.mp3', context: 'town' as const, layer: 'music' as const, title: 'X', artist: 'K', license: 'CC', src: '/music/town/x.mp3' },
      { id: 'ambient/tavern/fire.ogg', context: 'tavern' as const, layer: 'ambient' as const, title: 'Fire', artist: 'K', license: 'CC', src: '/music/ambient/tavern/fire.ogg' },
    ] };
    const merged = lib.mergeMusic(old);
    expect(merged.tracks.map((t) => t.title)).toEqual(['tavern jig', 'X', 'Fire']);
    expect(lib.mergeSfx({ enabled: true, pending: false, files: [] }).events?.coins).toHaveLength(2);
    lib.set(a.id, { enabled: false });
    expect(lib.mergeMusic(old).tracks.map((t) => t.title)).toEqual(['Folk', 'X', 'Fire']);
    expect(lib.mergeMusic({ ...old, enabled: false }).tracks).toHaveLength(3);
  });

  it('finds sounds by words, tags counting most', () => {
    const entry = (id: string, title: string, description: string, tags: string[]): LibraryEntry => ({
      id, kind: 'music', title, description, tags, seconds: 120, loop: false, status: 'ready', src: '/x', bytes: 1, usd: 0, by: 'starter', createdAt: 1,
    });
    const all = [
      entry('a', 'Harbour at night', 'misty harbour at night, slow fiddle', ['harbour', 'night', 'mist', 'dock']),
      entry('b', 'Market day', 'busy market, lutes and drums', ['market', 'day', 'town']),
      entry('c', 'Night watch', 'quiet city walls at night', ['night', 'city']),
    ];
    expect(searchLibrary(all, 'music', 'misty dock at night').map((e) => e.id)).toEqual(['a', 'c']);
    expect(searchLibrary(all, 'music', 'drums').map((e) => e.id)).toEqual(['b']);
    expect(searchLibrary(all, 'sfx', 'night')).toEqual([]);
    expect(searchLibrary([{ ...all[0], disabled: true }], 'music', 'harbour')).toEqual([]);
  });

  it('downloads a kind as one zip with a list that names each file', async () => {
    const { lib } = make();
    lib.make({ kind: 'music', description: 'tavern jig', title: 'Jig', scene: 'tavern' }, 'innkeeper');
    lib.make({ kind: 'sfx', description: 'coins', title: 'Coins', event: 'coins' }, 'innkeeper');
    await lib.whenIdle();
    const chunks: Uint8Array[] = [];
    let head: Record<string, unknown> = {};
    await new Promise<void>((done) => {
      const res = { writeHead: (_s: number, h: Record<string, unknown>) => { head = h; }, write: (c: Uint8Array) => { chunks.push(c); return true; }, end: () => done(), destroy: () => done() };
      lib.archive('music', res as never);
    });
    expect(String(head['content-disposition'])).toMatch(/hearthforge-library-music-\d{4}-\d\d-\d\d\.zip/);
    const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0; for (const c of chunks) { all.set(c, at); at += c.length; }
    const files = unzipSync(all);
    expect(Object.keys(files).sort()).toEqual(['library.json', 'music/tavern/jig.mp3']);
    const list = JSON.parse(new TextDecoder().decode(files['library.json']));
    expect(list.format).toBe('hearthforge-library');
    expect(list.entries[0]).toMatchObject({ title: 'Jig', path: 'music/tavern/jig.mp3' });
    expect(files['music/tavern/jig.mp3'].length).toBe(2000);
  });

  it('serves only files the library made', () => {
    const { lib } = make();
    expect(lib.file('../library.json')).toBeNull();
    expect(lib.file('0123456789abcdef0123.mp3')).toBeNull();
  });

  it('adds what the owner asked for to every prompt', () => {
    expect(promptFor('music', 'a jig')).toMatch(/^a jig\. Instrumental.*no vocals/);
    expect(promptFor('ambient', 'rain')).toMatch(/Seamless ambient/);
    expect(promptFor('sfx', 'a bell')).toMatch(/Single sound effect/);
  });
});

describe('sound costs in the credits', () => {
  it('books sounds as their own kind and counts them in the balance', () => {
    const dir = fresh();
    const c = new Credits(dir);
    c.charge(['a'], 0.5, 'sound');
    c.charge(['a'], 0.25, 'images');
    const view = c.view({ id: 'a', username: 'a', role: 'player' });
    expect(view.spent).toBeCloseTo(0.75);
    const usage = c.usage({ id: 'a', username: 'a', role: 'player' });
    expect(usage.sound).toBeCloseTo(0.5);
    expect(usage.total).toBeCloseTo(0.75);
    expect(c.report([{ id: 'a', username: 'a', role: 'player' }]).rows[0].spentSound).toBeCloseTo(0.5);
    expect(existsSync(dir)).toBe(true);
  });
});
