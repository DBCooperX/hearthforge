// Story illustrations: the Innkeeper's setup and limits, the request each service gets, and the way a picture the
// Dungeon Master asks for reaches the scene card and the players' credit.
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PICTURE_CONFIG, pictureUsd, type PictureConfig } from '../../shared/illustrations';
import { Credits } from '../src/credits';
import { DM_TOOLS } from '../src/dm/claude';
import { Game } from '../src/game/engine';
import { askPicture, castOf, picturePrompt, pictureState } from '../src/game/pictures';
import { Illustrator, cleanConfig } from '../src/illustrations';

const dir = () => mkdtempSync(join(tmpdir(), 'hf-pictures-'));
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

function newGame() {
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const g = new Game('pics', rng);
  g.upsertPlayer('p1', 'Tester', true);
  g.addCharacter('p1', 'fighter', 'Brann');
  g.addCharacter('p1', 'cleric', 'Mira');
  g.start();
  return g;
}

/** A fetch that records each request and answers like the service would. */
function fakeFetch(answer: (url: string, body: any) => unknown) {
  const calls: { url: string; headers: Record<string, string>; body: any }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body });
    const out = answer(url, body);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const geminiAnswer = () => ({ candidates: [{ content: { parts: [{ text: 'Here it is.' }, { inlineData: { mimeType: 'image/png', data: PNG.toString('base64') } }] } }] });

function illustrator(config: Partial<PictureConfig>, answer: (url: string, body: any) => unknown = geminiAnswer, keys: Record<string, string> = { GEMINI_API_KEY: 'g-key' }) {
  let now = Date.UTC(2026, 10, 21, 18, 0);
  const f = fakeFetch(answer);
  const ill = new Illustrator(dir(), (k) => keys[k] ?? '', f.fn, () => now);
  ill.action({ do: 'config', config: { ...DEFAULT_PICTURE_CONFIG, on: true, ...config } });
  return { ill, calls: f.calls, later: (min: number) => { now += min * 60_000; } };
}

const job = (table = 't1') => ({ table, tableTitle: 'The Mill', entry: 5, ask: { moment: 'boss' as const, picture: 'A troll bursts through the mill wall in a cloud of flour.', cast: ['Brann: a dwarf man'] } });

describe('the Innkeeper setup', () => {
  it('keeps what is valid and ignores the rest', () => {
    const c = cleanConfig({ provider: 'nope' as never, perTableDay: 999, gapMinutes: -4, style: 'woodcut', models: { gemini: 'rm -rf /' } as never, moments: { reveal: false } as never, usd: { 'gemini:gemini-3.1-flash-image': 0.05, 'bad key': 1 } as never }, DEFAULT_PICTURE_CONFIG);
    expect(c.provider).toBe('gemini');
    expect(c.perTableDay).toBe(50);
    expect(c.gapMinutes).toBe(0);
    expect(c.style).toBe('woodcut');
    expect(c.models.gemini).toBe('gemini-3.1-flash-image');
    expect(c.moments).toMatchObject({ boss: true, reveal: false });
    expect(pictureUsd(c, 'gemini', 'gemini-3.1-flash-image')).toBe(0.05);
    expect(Object.keys(c.usd)).toEqual(['gemini:gemini-3.1-flash-image']);
    // Clearing a price goes back to the list price.
    expect(pictureUsd(cleanConfig({ usd: { 'gemini:gemini-3.1-flash-image': null } as never }, c), 'gemini', 'gemini-3.1-flash-image')).toBe(0.067);
  });

  it('is off until the Innkeeper switches it on, and needs a key for the chosen service', () => {
    const off = new Illustrator(dir(), () => 'key');
    expect(off.gate('t1', 'boss')).toBe('off');
    const { ill } = illustrator({ provider: 'fal' });
    expect(ill.gate('t1', 'boss')).toBe('no_key');
    expect(ill.library().keys).toEqual({ gemini: true, fal: false, replicate: false, openai: false });
  });

  it('holds to the moments ticked, the limit per day, the gap and the monthly budget', async () => {
    const { ill, later } = illustrator({ perTableDay: 2, gapMinutes: 15, monthUsd: 0.2 });
    expect(ill.gate('t1', 'arrival')).toBe('moment');
    expect(ill.gate('t1', 'boss')).toBeNull();
    let billed = 0;
    await ill.paint(job(), (usd) => { billed += usd; });
    expect(billed).toBeCloseTo(0.067);
    expect(ill.gate('t1', 'boss')).toBe('gap');
    expect(ill.gate('t2', 'boss')).toBeNull();
    later(20);
    await ill.paint(job(), () => {});
    later(20);
    expect(ill.gate('t1', 'victory')).toBe('day');
    // A third picture elsewhere would pass the budget of 20 cents.
    expect(ill.gate('t2', 'boss')).toBe('month');
    expect(ill.library().month).toEqual({ count: 2, usd: 0.134 });
  });
});

describe('the services', () => {
  it('asks Gemini with the prompt and, from the second picture on, the earlier pictures of the table', async () => {
    const { ill, calls, later } = illustrator({ gapMinutes: 0 });
    const first = await ill.paint(job(), () => {});
    expect(first.url).toMatch(/^\/pictures\/[a-f0-9]{18}$/);
    expect(ill.file(first.id)?.mime).toBe('image/png');
    expect(calls[0].url).toContain('/models/gemini-3.1-flash-image:generateContent');
    expect(calls[0].headers['x-goog-api-key']).toBe('g-key');
    expect(calls[0].body.generationConfig).toMatchObject({ responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '3:2' } });
    const parts = calls[0].body.contents[0].parts;
    expect(parts).toHaveLength(1);
    expect(parts[0].text).toContain('ink and watercolour');
    expect(parts[0].text).toContain('A troll bursts through the mill wall');
    expect(parts[0].text).toContain('Brann: a dwarf man');
    later(1);
    await ill.paint(job(), () => {});
    expect(calls[1].body.contents[0].parts).toHaveLength(2);
    expect(calls[1].body.contents[0].parts[1].inline_data.mime_type).toBe('image/png');
    expect(calls[1].body.contents[0].parts[0].text).toContain('earlier moments of the same adventure');
    // Another table gets none of them.
    await ill.paint(job('t2'), () => {});
    expect(calls[2].body.contents[0].parts).toHaveLength(1);
  });

  it('asks again without the aspect ratio when an older Gemini model does not know it', async () => {
    let n = 0;
    const { ill, calls } = illustrator({}, () => (n++ === 0 ? new Response('{"error":{"message":"Unknown name \\"imageConfig\\""}}', { status: 400 }) : geminiAnswer()));
    await ill.paint(job(), () => {});
    expect(calls).toHaveLength(2);
    expect(calls[1].body.generationConfig.imageConfig).toBeUndefined();
  });

  it('does not bill a picture the service refused', async () => {
    const { ill } = illustrator({}, () => ({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] }));
    let billed = 0;
    await expect(ill.paint(job(), (usd) => { billed += usd; })).rejects.toMatchObject({ code: 'refused' });
    expect(billed).toBe(0);
    expect(ill.library().error).toContain('IMAGE_SAFETY');
    expect(ill.library().recent).toHaveLength(0);
  });

  it('asks fal.ai and fetches the picture from its link', async () => {
    const { ill, calls } = illustrator({ provider: 'fal' }, (url) => (url.startsWith('https://fal.run/') ? { images: [{ url: 'https://v3.fal.media/files/x.png' }] } : new Response(PNG, { headers: { 'content-type': 'image/png' } })), { FAL_KEY: 'f-key' });
    await ill.paint(job(), () => {});
    expect(calls[0].url).toBe('https://fal.run/fal-ai/flux-2');
    expect(calls[0].headers.authorization).toBe('Key f-key');
    expect(calls[0].body).toMatchObject({ image_size: 'landscape_4_3', num_images: 1 });
    expect(calls[1].url).toBe('https://v3.fal.media/files/x.png');
  });

  it('asks Replicate and waits for the prediction', async () => {
    const { ill, calls } = illustrator({ provider: 'replicate' }, (url) => (url.includes('/predictions') ? { status: 'succeeded', output: 'https://replicate.delivery/x.webp' } : new Response(PNG, { headers: { 'content-type': 'image/webp' } })), { REPLICATE_API_TOKEN: 'r8_x' });
    const p = await ill.paint(job(), () => {});
    expect(calls[0].url).toBe('https://api.replicate.com/v1/models/black-forest-labs/flux-2-pro/predictions');
    expect(calls[0].headers).toMatchObject({ authorization: 'Bearer r8_x', prefer: 'wait=60' });
    expect(calls[0].body.input).toMatchObject({ aspect_ratio: '3:2' });
    expect(ill.file(p.id)?.mime).toBe('image/webp');
  });

  it('asks OpenAI for a new picture, and for an edit once it has earlier ones', async () => {
    const { ill, calls, later } = illustrator({ provider: 'openai', gapMinutes: 0 }, () => ({ data: [{ b64_json: PNG.toString('base64') }] }), { OPENAI_API_KEY: 'sk-x' });
    await ill.paint(job(), () => {});
    later(1);
    await ill.paint(job(), () => {});
    expect(calls[0].url).toBe('https://api.openai.com/v1/images/generations');
    expect(calls[0].body).toMatchObject({ model: 'gpt-image-2.5-flare', size: '1536x1024', quality: 'medium' });
    expect(calls[1].url).toBe('https://api.openai.com/v1/images/edits');
    expect(calls[1].body.images[0].image_url).toMatch(/^data:image\/webp;base64,/);
  });

  it('removes a picture when the Innkeeper deletes it', async () => {
    const { ill } = illustrator({});
    const p = await ill.paint(job(), () => {});
    expect(ill.action({ do: 'delete', id: p.id })).toEqual({ removed: { table: 't1', entry: 5 } });
    expect(ill.file(p.id)).toBeNull();
  });
});

describe('the Dungeon Master and the scene card', () => {
  it('offers illustrate as a small tool without a strict schema', () => {
    const tool = DM_TOOLS.find((t) => t.name === 'illustrate') as { strict?: boolean; input_schema: { properties: Record<string, { type: string }> } };
    expect(tool).toBeTruthy();
    expect(tool.strict).toBeUndefined();
    expect(Object.values(tool.input_schema.properties).every((p) => p.type === 'string')).toBe(true);
  });

  it('describes the heroes and people by their fixed looks', () => {
    const g = newGame();
    const cast = castOf(g, ['Brann', 'nobody', 'mira']);
    expect(cast).toHaveLength(2);
    expect(cast[0]).toMatch(/^Brann: a \w+ (man|woman|person), fighter, .* skin, /);
    expect(picturePrompt('Ink.', { picture: 'A duel.', cast }, { where: 'The mill', time: 'night', refs: 0 })).toContain('Place: The mill, night.');
  });

  it('paints only what the server allows, and puts the picture on the scene of the same reply', () => {
    const g = newGame();
    expect(askPicture(g, { moment: 'boss', picture: 'A troll bursts through the wall.' })).toMatchObject({ painted: false });
    const painted: { entry: number; moment: string; cast: number }[] = [];
    let gate: string | null = 'moment';
    g.pictures = { gate: () => gate as never, paint: (entry, ask) => painted.push({ entry, moment: ask.moment, cast: ask.cast.length }) };
    expect(() => askPicture(g, { moment: 'selfie', picture: 'A troll bursts through the wall.' })).toThrow(/moment must be one of/);
    expect(askPicture(g, { moment: 'reveal', picture: 'A troll bursts through the wall.' })).toMatchObject({ painted: false, reason: expect.stringContaining('does not get a picture') });
    expect(pictureState(g)).toBe('Illustrations: none available right now.');
    gate = null;
    expect(pictureState(g)).toContain('boss, victory, reveal');
    expect(askPicture(g, { moment: 'BOSS', picture: 'A troll bursts through the wall.', who: '' })).toMatchObject({ painted: true });
    expect(askPicture(g, { moment: 'boss', picture: 'And a second one, please.' })).toMatchObject({ painted: false });
    g.addScene({ title: 'The wall gives way', mood: 'danger', text: 'Stone and flour fly.', actions: [] });
    const entry = g.s.log[g.s.log.length - 1];
    expect(entry.scene?.painting).toBe(true);
    expect(painted).toEqual([{ entry: entry.id, moment: 'boss', cast: 2 }]);
    expect(g.setPicture(entry.id, 'abc')).toBe(true);
    expect(entry.scene).toMatchObject({ imageId: 'abc' });
    expect(entry.scene?.painting).toBeUndefined();
    // The next scene has no picture.
    g.addScene({ title: 'After', mood: 'calm', text: 'Quiet.', actions: [] });
    expect(g.s.log[g.s.log.length - 1].scene?.painting).toBeUndefined();
  });
});

describe('credits', () => {
  it('books pictures as their own kind of cost', () => {
    const c = new Credits(dir());
    c.setConfig({ chfPerUsd: 0.8 });
    c.charge(['acc_mira', 'acc_jonas'], 0.1, 'images');
    const row = c.report([{ id: 'acc_mira', username: 'Mira', role: 'player' }]).rows[0];
    expect(row.spentImages).toBeCloseTo(0.04);
    expect(row.spent).toBeCloseTo(0.04);
    expect(row.last30).toBeCloseTo(0.04);
  });
});

it('keeps pictures in their own folder', async () => {
  const d = dir();
  const ill = new Illustrator(d, () => 'k', fakeFetch(geminiAnswer).fn);
  ill.action({ do: 'config', config: { on: true } });
  await ill.paint(job(), () => {});
  expect(readdirSync(d).sort()).toEqual(expect.arrayContaining(['config.json', 'index.json']));
  expect(readdirSync(d).some((f) => f.endsWith('.png'))).toBe(true);
});
