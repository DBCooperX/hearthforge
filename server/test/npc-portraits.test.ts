// Portraits of people the party meets: painted once when they are first met, shown on hover cards and in the journal,
// handed on to scene pictures, and the model of the battle figure of a person who fights. Paid by the table.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PICTURE_CONFIG, type PictureConfig } from '../../shared/illustrations';
import { baseLook } from '../../shared/monsterLook';
import { Game } from '../src/game/engine';
import { askPicture, npcFigurePrompt, npcFigureSubject, npcPortraitKey, npcPortraitPrompt } from '../src/game/pictures';
import { Illustrator, cleanConfig } from '../src/illustrations';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const answer = () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG.toString('base64') } }] } }] });

function illustrator(config: Partial<PictureConfig> = {}) {
  const calls: any[] = [];
  const fn = (async (_url: string, init?: RequestInit) => { calls.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify(answer()), { status: 200, headers: { 'content-type': 'application/json' } }); }) as unknown as typeof fetch;
  let now = Date.UTC(2026, 10, 21, 18, 0);
  const ill = new Illustrator(mkdtempSync(join(tmpdir(), 'hf-npc-')), (k) => (k === 'GEMINI_API_KEY' ? 'k' : ''), fn, () => now);
  ill.action({ do: 'config', config: { ...DEFAULT_PICTURE_CONFIG, on: true, ...config } });
  return { ill, calls, later: (min: number) => { now += min * 60_000; } };
}

function newGame() {
  const g = new Game('npcs', () => 0.5);
  g.upsertPlayer('p1', 'Tester', true);
  g.addCharacter('p1', 'fighter', 'Brann');
  g.start();
  g.rememberNpc({ name: 'Varo Kessel', role: 'caravan master', appearance: 'A heavy man with a grey moustache and a red scarf.' });
  return g;
}

describe('portraits of people', () => {
  it('paints the person in the shared portrait style, once per look, and counts them per table and day', async () => {
    const g = newGame();
    const varo = g.s.memory.npcs.find((n) => n.name === 'Varo Kessel')!;
    const { ill, calls, later } = illustrator({ npcPortraitsPerDay: 1 });
    expect(ill.npcPortraitGate('t1', varo)).toBeNull();
    let billed = 0;
    const p = await ill.paintNpcPortrait({ table: 't1', tableTitle: 'T', npc: varo }, (usd) => { billed += usd; });
    expect(billed).toBeGreaterThan(0);
    expect(p.moment).toBe('npc');
    expect(p.key).toBe(npcPortraitKey(varo));
    expect(calls[0].generationConfig.imageConfig.aspectRatio).toBe('1:1');
    const prompt = calls[0].contents[0].parts[0].text as string;
    expect(prompt).toContain('Painted fantasy character portrait');
    expect(prompt).toContain('Varo Kessel, caravan master');
    expect(prompt).toContain('grey moustache');
    varo.portraitId = p.id; varo.portraitKey = p.key;
    expect(ill.npcPortraitGate('t1', varo)).toBe('done');
    // The limit is per table: another table has its own, and the next day starts afresh.
    const other = { ...varo, portraitKey: undefined };
    expect(ill.npcPortraitGate('t1', other)).toBe('day');
    expect(ill.npcPortraitGate('t2', other)).toBeNull();
    later(24 * 60);
    expect(ill.npcPortraitGate('t1', other)).toBeNull();
    // They do not count against the scene pictures, and can be switched off.
    expect(ill.gate('t1', 'boss')).toBeNull();
    ill.action({ do: 'config', config: { npcPortraits: false } });
    expect(ill.npcPortraitGate('t1', other)).toBe('npcs');
  });

  it('waits until there is something to paint from, and paints anew when the appearance changes', () => {
    const g = newGame();
    g.rememberNpc({ name: 'Nobody Much' });
    const blank = g.s.memory.npcs.find((n) => n.name === 'Nobody Much')!;
    expect(npcPortraitKey(blank)).toBe('');
    expect(illustrator().ill.npcPortraitGate('t1', blank)).toBe('done');
    g.rememberNpc({ name: 'Nobody Much', appearance: 'A thin woman with a scar over one eye.' });
    expect(npcPortraitKey(blank)).not.toBe('');
    expect(npcPortraitPrompt('S', blank)).toContain('thin woman');
  });

  it('does not pay twice for a portrait the service refused', async () => {
    const g = newGame();
    const varo = g.s.memory.npcs[g.s.memory.npcs.length - 1];
    const fn = (async () => new Response('{"error":"blocked"}', { status: 400 })) as unknown as typeof fetch;
    const ill = new Illustrator(mkdtempSync(join(tmpdir(), 'hf-npc-')), () => 'k', fn);
    ill.action({ do: 'config', config: { ...DEFAULT_PICTURE_CONFIG, on: true } });
    await expect(ill.paintNpcPortrait({ table: 't1', tableTitle: 'T', npc: varo }, () => {})).rejects.toMatchObject({ code: 'refused' });
    expect(ill.npcPortraitGate('t1', varo)).toBe('busy');
  });

  it('keeps the setting valid', () => {
    const c = cleanConfig({ npcPortraits: false, npcPortraitsPerDay: 999 }, DEFAULT_PICTURE_CONFIG);
    expect(c.npcPortraits).toBe(false);
    expect(c.npcPortraitsPerDay).toBe(50);
    expect(DEFAULT_PICTURE_CONFIG.npcPortraits).toBe(true);
  });

  it('hands the portrait on to every scene picture the person is in, with the heroes', () => {
    const g = newGame();
    const varo = g.s.memory.npcs.find((n) => n.name === 'Varo Kessel')!;
    varo.portraitId = 'a'.repeat(18);
    g.s.characters[0].portraitId = 'b'.repeat(18);
    g.pictures = { gate: () => null, paint: () => {} };
    askPicture(g, { moment: 'reveal', picture: 'Varo lays the torn contract on the table in front of Brann.', who: 'Brann, Varo Kessel' });
    expect(g.pictureAsk?.portraits).toEqual(['b'.repeat(18), 'a'.repeat(18)]);
  });
});

describe('the battle figure of a person who fights', () => {
  it('is painted from their portrait, carries what the fight says, and is told apart by portrait and gear', () => {
    const g = newGame();
    const varo = g.s.memory.npcs.find((n) => n.name === 'Varo Kessel')!;
    const look = baseLook('humanoid', 'medium', 'red', { weapon: 'sword', armor: 'leather' });
    expect(npcFigureSubject(varo, look)).toBeNull();
    varo.portraitId = 'a'.repeat(18);
    const a = npcFigureSubject(varo, look)!;
    expect(a).toContain(varo.id);
    expect(npcFigureSubject(varo, { ...look, weapon: 'axe' })).not.toBe(a);
    const { prompt, key } = npcFigurePrompt(varo, look);
    expect(prompt).toContain('attached image is this person');
    expect(prompt).toContain('a sword');
    expect(prompt).toContain('flat');
    expect(key).toBe('magenta');
    expect(npcFigurePrompt(varo, { ...look, weapon: null, armor: null }).prompt).toContain('hands are empty');
  });

  it('finds the person behind a monster by name, only with a portrait', () => {
    const g = newGame();
    const varo = g.s.memory.npcs.find((n) => n.name === 'Varo Kessel')!;
    expect(g.npcOfMonster({ name: 'Varo Kessel' })).toBeNull();
    varo.portraitId = 'a'.repeat(18);
    expect(g.npcOfMonster({ name: 'varo kessel' })?.id).toBe(varo.id);
    expect(g.npcOfMonster({ name: 'Goblin' })).toBeNull();
  });
});
