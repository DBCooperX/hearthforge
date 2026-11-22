// A player's own picture of a hero: kept privately on the account, sent to the painter as a reference only, and never
// part of what the game shows.
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HERO_REF_MAX_BYTES, MAX_HERO_REFS, cleanSpec } from '../../shared/accounts';
import { DEFAULT_PICTURE_CONFIG } from '../../shared/illustrations';
import { PREMADES } from '../../shared/premades';
import { Game } from '../src/game/engine';
import { portraitKey, portraitPrompt } from '../src/game/pictures';
import { HeroRefError, HeroRefs, sniffImage } from '../src/heroRefs';
import { Illustrator } from '../src/illustrations';

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.alloc(40)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)]);
const brann = PREMADES.find((p) => p.id === 'brann')!.spec;
const dir = () => mkdtempSync(join(tmpdir(), 'hf-refs-'));

describe('reference pictures on the account', () => {
  it('keeps real pictures only, by what the bytes are, and nothing too big', () => {
    expect(sniffImage(PNG)).toBe('image/png');
    expect(sniffImage(JPG)).toBe('image/jpeg');
    expect(sniffImage(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    const refs = new HeroRefs(dir());
    expect(() => refs.save('acc_a', Buffer.from('not a picture'))).toThrow(HeroRefError);
    expect(() => refs.save('acc_a', Buffer.concat([PNG, Buffer.alloc(HERO_REF_MAX_BYTES)]))).toThrow(HeroRefError);
  });

  it('hands a picture back only to its owner, and removes it', () => {
    const refs = new HeroRefs(dir());
    const id = refs.save('acc_a', PNG);
    expect(refs.read('acc_a', id)?.mime).toBe('image/png');
    expect(refs.read('acc_b', id)).toBeNull();
    expect(refs.read('acc_a', '../../etc/passwd')).toBeNull();
    refs.remove('acc_b', id);
    expect(refs.read('acc_a', id)).not.toBeNull();
    refs.remove('acc_a', id);
    expect(refs.read('acc_a', id)).toBeNull();
  });

  it('drops the oldest unused pictures past the cap, never one a hero uses', () => {
    const d = dir();
    const refs = new HeroRefs(d);
    const keep = refs.save('acc_a', PNG);
    for (let i = 0; i < MAX_HERO_REFS + 5; i++) refs.save('acc_a', PNG, new Set([keep]));
    expect(readdirSync(join(d, 'acc_a')).length).toBeLessThanOrEqual(MAX_HERO_REFS);
    expect(refs.read('acc_a', keep)).not.toBeNull();
  });
});

describe('the picture on a hero', () => {
  it('survives cleaning and reaches the hero and its recipe; a made-up id does not', () => {
    expect(cleanSpec({ ...brann, refId: '0123456789abcdef' })?.refId).toBe('0123456789abcdef');
    expect(cleanSpec({ ...brann, refId: '../x' })?.refId).toBeUndefined();
    const g = new Game('refs', Math.random);
    g.upsertPlayer('acc_a', 'Ann', true);
    const c = g.createCharacter('acc_a', { ...brann, refId: '0123456789abcdef' });
    expect(c.refId).toBe('0123456789abcdef');
    expect(g.recipe('acc_a', c.id)?.refId).toBe('0123456789abcdef');
    const plain = g.createCharacter('acc_a', { ...brann, name: 'Plain', refId: 'nope' });
    expect(plain.refId).toBeUndefined();
  });

  it('asks for a new portrait when the picture changes, and says it is only a reference', () => {
    const g = new Game('refs', Math.random);
    g.upsertPlayer('acc_a', 'Ann', true);
    const c = g.createCharacter('acc_a', brann);
    const before = portraitKey(c);
    c.refId = '0123456789abcdef';
    expect(portraitKey(c)).not.toBe(before);
    expect(portraitPrompt('Painted', c)).not.toContain('attached image');
    const prompt = portraitPrompt('Painted', c, true);
    expect(prompt).toContain('ONLY as a reference');
    expect(prompt).toContain('Do not copy the picture');
  });

  it('goes to the painter as an attached image, repainted in the portrait style, only when the painter takes pictures', async () => {
    const g = new Game('refs', Math.random);
    g.upsertPlayer('acc_a', 'Ann', true);
    const c = g.createCharacter('acc_a', { ...brann, refId: '0123456789abcdef' });
    const calls: any[] = [];
    const png = PNG.toString('base64');
    const fetchFn = (async (_u: string, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: png } }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const ill = new Illustrator(dir(), () => 'k', fetchFn);
    ill.action({ do: 'config', config: { ...DEFAULT_PICTURE_CONFIG, on: true } });
    expect(ill.canUseReference()).toBe(true);
    let billed = 0;
    const p = await ill.paintPortrait({ table: 't', tableTitle: 'T', account: 'acc_a', hero: c, reference: { mime: 'image/jpeg', data: JPG } }, (usd) => { billed += usd; });
    expect(billed).toBeGreaterThan(0);
    expect(p.moment).toBe('portrait');
    const parts = calls[0].contents[0].parts;
    expect(parts.some((x: any) => x.inline_data?.mime_type === 'image/jpeg')).toBe(true);
    expect(parts[0].text).toContain('ONLY as a reference');
    expect(parts[0].text).toContain('Painted fantasy character portrait');
  });
});
