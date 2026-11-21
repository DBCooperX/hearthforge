// Battle figures: a hero's figure is painted from their portrait, a monster's once per kind and look for the whole
// server, both on a flat key colour; the state players get carries the figure, and switching figures off, or deleting
// one, brings the drawn figure back.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PICTURE_CONFIG, type PictureConfig } from '../../shared/illustrations';
import { baseLook } from '../../shared/monsterLook';
import { Game } from '../src/game/engine';
import { heroFigurePrompt, heroFigureSubject, monsterFigurePrompt, monsterFigureSubject, tallBody } from '../src/game/pictures';
import { Illustrator, cleanConfig } from '../src/illustrations';
import { MONSTERS } from '../src/data/monsters';
import { Room } from '../src/room';
import type { Store } from '../src/db';
import { ScriptedDM } from '../src/dm/scripted';
import { MemoryStore } from './memoryStore';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

function setup(config: Partial<PictureConfig> = {}, status = 200) {
  const calls: any[] = [];
  const fetchFn = (async (_url: string, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)));
    if (status !== 200) return new Response('{"error":"blocked"}', { status });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG.toString('base64') } }] } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  let now = Date.UTC(2026, 10, 21, 18, 0);
  const ill = new Illustrator(mkdtempSync(join(tmpdir(), 'hf-figures-')), (k) => (k === 'GEMINI_API_KEY' ? 'g-key' : ''), fetchFn, () => now);
  ill.action({ do: 'config', config: { ...DEFAULT_PICTURE_CONFIG, on: true, ...config } });
  return { ill, calls, later: (min: number) => { now += min * 60_000; } };
}

function game() {
  const g = new Game('figs', () => 0.42);
  g.upsertPlayer('acc_mira', 'Mira', true);
  g.addCharacter('acc_mira', 'fighter', 'Brann');
  g.start();
  return g;
}

describe('battle figure prompts', () => {
  it('ask for one full figure on a flat key colour, green for pink and purple ones', () => {
    const goblin = monsterFigurePrompt('Goblin', 'humanoid', baseLook('humanoid', 'small', 'green', { weapon: 'sword' }));
    expect(goblin.key).toBe('magenta');
    expect(goblin.prompt).toContain('miniature figure');
    expect(goblin.prompt).toContain('#FF00FF');
    expect(goblin.prompt).toContain('a Goblin (humanoid)');
    expect(goblin.prompt).toContain('wielding a sword');
    expect(goblin.prompt).toMatch(/no cast shadow/i);
    expect(monsterFigurePrompt('Ooze', 'ooze', baseLook('ooze', 'large', 'pink')).key).toBe('green');
    expect(tallBody(baseLook('humanoid', 'small', 'green'))).toBe(true);
    expect(tallBody(baseLook('dragon', 'huge', 'red'))).toBe(false);
  });

  it('paint a hero as the same person as in the portrait', () => {
    const brann = game().s.characters[0];
    expect(heroFigureSubject(brann)).toBeNull();
    brann.portraitId = 'a1b2c3d4e5f6a7b8c9';
    expect(heroFigureSubject(brann)).toBe(`h:${brann.id}|a1b2c3d4e5f6a7b8c9`);
    const { prompt } = heroFigurePrompt(brann);
    expect(prompt).toContain('Brann: a');
    expect(prompt).toContain('painted portrait');
    expect(prompt).toContain('full length');
  });

  it('share one subject among monsters of the same kind and look', () => {
    const look = MONSTERS.goblin.look;
    expect(monsterFigureSubject('goblin', look)).toBe(monsterFigureSubject('goblin', { ...look }));
    expect(monsterFigureSubject('goblin', look)).not.toBe(monsterFigureSubject('goblin', { ...look, heads: 3 }));
    // The cached picture id is not part of the look that decides the subject.
    expect(monsterFigureSubject('goblin', { ...look, imageId: 'a1b2c3d4e5f6a7b8c9' })).toBe(monsterFigureSubject('goblin', look));
  });
});

describe('the illustrator paints figures', () => {
  it('once per subject, tall, with the portrait along, and keeps them across restarts', async () => {
    const { ill, calls } = setup();
    const g = game();
    const brann = g.s.characters[0];
    const portrait = await ill.paintPortrait({ table: 'figs', tableTitle: 'Figs', account: 'acc_mira', hero: brann }, () => {});
    brann.portraitId = portrait.id;
    const subject = heroFigureSubject(brann)!;
    expect(ill.figureGate(subject)).toBeNull();
    let billed = 0;
    const { prompt, key } = heroFigurePrompt(brann);
    const fig = await ill.paintFigure({ table: 'figs', tableTitle: 'Figs', subject, caption: 'Brann', prompt, key, tall: true, portraitId: portrait.id, account: 'acc_mira' }, (usd) => { billed += usd; });
    expect(billed).toBeCloseTo(0.067);
    expect(fig.moment).toBe('figure');
    expect(fig.keyColor).toBe(key);
    expect(calls[1].generationConfig.imageConfig.aspectRatio).toBe('2:3');
    expect(calls[1].contents[0].parts).toHaveLength(2); // the prompt and the portrait
    expect(ill.figure(subject)).toBe(fig.id);
    expect(ill.figureGate(subject)).toBe('done');
    // Figures do not use up the scene pictures of a table.
    expect(ill.gate('figs', 'boss')).toBeNull();
  });

  it('stops at the daily limit, on refusals and when switched off, and shows none while off', async () => {
    const { ill, later } = setup({ figuresPerDay: 1 });
    const look = MONSTERS.goblin.look;
    const goblin = monsterFigureSubject('goblin', look);
    const { prompt, key } = monsterFigurePrompt('Goblin', 'humanoid', look);
    await ill.paintFigure({ table: 'figs', tableTitle: 'Figs', subject: goblin, caption: 'Goblin', prompt, key, tall: true }, () => {});
    const wolf = monsterFigureSubject('wolf', MONSTERS.wolf.look);
    expect(ill.figureGate(wolf)).toBe('day');
    later(24 * 60);
    expect(ill.figureGate(wolf)).toBeNull();
    ill.action({ do: 'config', config: { figures: false } });
    expect(ill.figureGate(wolf)).toBe('figures');
    expect(ill.figure(goblin)).toBeNull();
    ill.action({ do: 'config', config: { figures: true } });
    expect(ill.figure(goblin)).not.toBeNull();
    // Deleting a figure brings back the drawn one, and it may be painted again.
    ill.action({ do: 'delete', id: ill.figure(goblin) });
    expect(ill.figure(goblin)).toBeNull();
    expect(ill.figureGate(goblin)).toBeNull();
  });

  it('does not pay twice for a figure the service refused', async () => {
    const { ill } = setup({}, 400);
    const subject = monsterFigureSubject('goblin', MONSTERS.goblin.look);
    const { prompt, key } = monsterFigurePrompt('Goblin', 'humanoid', MONSTERS.goblin.look);
    await expect(ill.paintFigure({ table: 'figs', tableTitle: 'Figs', subject, caption: 'Goblin', prompt, key, tall: true }, () => {})).rejects.toMatchObject({ code: 'refused' });
    expect(ill.figureGate(subject)).toBe('busy');
  });

  it('keeps the new settings valid', () => {
    const c = cleanConfig({ figures: 'yes' as never, figuresPerDay: 9999 }, DEFAULT_PICTURE_CONFIG);
    expect(c.figures).toBe(true);
    expect(c.figuresPerDay).toBe(200);
    // Saved setups from before battle figures get them on.
    const { figures: _f, figuresPerDay: _d, ...old } = DEFAULT_PICTURE_CONFIG;
    expect(cleanConfig({}, old as PictureConfig).figures).toBe(true);
  });
});

it('the state players get carries the painted figures, and the room asks for the missing ones', () => {
  const painted = new Map<string, string>();
  let asked = 0;
  const room = new Room('t', new ScriptedDM(), new MemoryStore() as unknown as Store, {}, {
    pictures: { gate: () => null, paint: () => {}, figure: (s) => painted.get(s) ?? null, figures: () => { asked++; } },
  });
  room.game.upsertPlayer('acc_mira', 'Mira', true);
  room.game.addCharacter('acc_mira', 'fighter', 'Brann');
  room.flush();
  expect(asked).toBeGreaterThan(0);
  const g = room.game;
  const brann = g.s.characters[0];
  brann.portraitId = 'a1b2c3d4e5f6a7b8c9';
  g.s.monsters.push({ id: 'm1', defId: 'goblin', name: 'Goblin', x: 1, y: 1, hp: 7, maxHp: 7, alive: true, conditions: [] });
  const view = () => g.publicState({ busy: false, mode: 'scripted', model: null });
  expect(view().characters[0].figureId).toBeUndefined();
  expect(view().monsters[0].look.imageId).toBeNull();
  painted.set(heroFigureSubject(brann)!, 'b1b2c3d4e5f6a7b8c9');
  painted.set(monsterFigureSubject('goblin', MONSTERS.goblin.look), 'c1b2c3d4e5f6a7b8c9');
  expect(view().characters[0].figureId).toBe('b1b2c3d4e5f6a7b8c9');
  expect(view().monsters[0].look.imageId).toBe('c1b2c3d4e5f6a7b8c9');
  // The saved hero and the catalogue look are left as they were.
  expect(brann.figureId).toBeUndefined();
  expect(MONSTERS.goblin.look.imageId).toBeNull();
});
