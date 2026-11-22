import { describe, expect, it } from 'vitest';
import { addFlat, d20Faces, damageSpread, failChance, hitChance, percent } from '../../shared/odds';
import { Game } from '../src/game/engine';

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe('odds math', () => {
  it('weighs the d20 faces', () => {
    for (const mode of ['normal', 'advantage', 'disadvantage'] as const) expect(sum(d20Faces(mode))).toBeCloseTo(1, 10);
    expect(sum(d20Faces('normal', true))).toBeCloseTo(1, 10);
    expect(d20Faces('normal', true)[1]).toBeCloseTo(1 / 400, 10);
  });
  it('gives the chance to hit', () => {
    // +5 against AC 15 needs a 10: 11 faces of 20.
    expect(hitChance(5, 15, 'normal')).toBeCloseTo(0.55, 10);
    // Advantage: 1 - 0.45² ; disadvantage: 0.55².
    expect(hitChance(5, 15, 'advantage')).toBeCloseTo(1 - 0.45 ** 2, 10);
    expect(hitChance(5, 15, 'disadvantage')).toBeCloseTo(0.55 ** 2, 10);
    // A natural 20 always hits, a natural 1 always misses.
    expect(hitChance(0, 40, 'normal')).toBeCloseTo(0.05, 10);
    expect(hitChance(30, 10, 'normal')).toBeCloseTo(0.95, 10);
    expect(hitChance(0, 40, 'normal', { critAt: 19 })).toBeCloseTo(0.1, 10);
    // Bless adds 1d4: needing a 10, it helps on 6 to 9 by a quarter each step.
    expect(hitChance(5, 15, 'normal', { dice: [4] })).toBeCloseTo((11 + (4 + 3 + 2 + 1) / 4) / 20, 10);
  });
  it('gives the chance a save fails', () => {
    // +2 against DC 13 fails on 1 to 10.
    expect(failChance(2, 13, 'normal')).toBeCloseTo(0.5, 10);
    expect(failChance(2, 13, 'advantage')).toBeCloseTo(0.25, 10);
    expect(failChance(30, 13, 'normal')).toBe(0);
  });
  it('spreads damage', () => {
    expect(damageSpread('1d8+3', 'piercing')).toMatchObject({ min: 4, max: 11, avg: 7.5 });
    expect(damageSpread('2d6+1d4', 'fire')).toMatchObject({ min: 3, max: 16, avg: 9.5 });
    expect(damageSpread('1d10', 'fire', 0.5)).toMatchObject({ min: 0, max: 5, avg: 2.8 });
    expect(addFlat('1d8+3', 2)).toBe('1d8+5');
    expect(addFlat('1d8', 1)).toBe('1d9'.replace('9', '8+1'));
    expect(addFlat('1d6-1', 1)).toBe('1d6');
    expect(percent(0.0004)).toBe(1);
    expect(percent(0.9999)).toBe(99);
  });
});

describe('odds in a fight', () => {
  function fight() {
    let seed = 7;
    const g = new Game('odds', () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; });
    g.upsertPlayer('p', 'Chris', true);
    g.addPremade('p', 'fenna', 'Lexe');
    g.start();
    g.startEncounter([{ defId: 'goblin', count: 8 }], { source: 'story', context: 'test', setting: 'plains' });
    const c = g.s.characters[0];
    const cb = g.s.combat!;
    cb.turnIndex = cb.order.findIndex((o) => o.id === c.id);
    return { g, c };
  }
  it('shows the acting hero\'s odds against every foe, matching the attack it would roll', () => {
    const { g, c } = fight();
    const m = g.s.monsters[0];
    m.x = c.x + 3; m.y = c.y;
    const state = g.publicState({ busy: false, mode: 'scripted', model: null });
    const odds = state.odds!;
    expect(odds.heroId).toBe(c.id);
    const o = odds.attack[m.id];
    expect(o.kind).toBe('attack');
    expect(o.ac).toBe(15);
    expect(o.chance).toBeGreaterThan(0);
    expect(o.chance).toBeLessThan(100);
    expect(o.damage!.max).toBeGreaterThan(o.damage!.min);
    // The odds roll nothing and use nothing up.
    expect(JSON.stringify(g.s.combat)).toBe(JSON.stringify(g.publicState({ busy: false, mode: 'scripted', model: null }).combat));
  });
  it('says why: a goblin right next to an archer gives disadvantage', () => {
    const { g, c } = fight();
    const [a, b] = g.s.monsters;
    expect(b).toBeDefined();
    a.x = c.x + 1; a.y = c.y;
    b.x = c.x + 4; b.y = c.y + 2;
    const o = g.publicState({ busy: false, mode: 'scripted', model: null }).odds!.attack[b.id];
    expect(g.s.characters[0].equipment.mainHand?.defId).toMatch(/bow/);
    expect(o.mode).toBe('disadvantage');
    expect(o.reasons.some((r) => r.code === 'foe_adjacent')).toBe(true);
  });
  it('has nothing while a monster acts', () => {
    const { g } = fight();
    const cb = g.s.combat!;
    cb.turnIndex = cb.order.findIndex((o) => o.kind === 'monster');
    expect(g.publicState({ busy: false, mode: 'scripted', model: null }).odds).toBeNull();
  });
});
