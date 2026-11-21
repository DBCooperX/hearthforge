import { describe, expect, it } from 'vitest';
import { pickByHabit } from '../src/game/engine';
import { CHALLENGE_ROWS, RULES_INFO, monsterTacticsText, targetHabit } from '../../shared/style';

const hero = (name: string, hp: number, maxHp: number, ac = 14) => ({ name, hp, maxHp, ac });

describe('challenge and monster targets', () => {
  const tank = hero('tank', 30, 30, 18);
  const hurt = hero('hurt', 4, 20, 12);
  const mid = hero('mid', 12, 18, 13);
  const list = [{ t: tank, d: 1 }, { t: mid, d: 3 }, { t: hurt, d: 4 }];

  it('maps the five levels to three habits', () => {
    expect([1, 2, 3, 4, 5].map(targetHabit)).toEqual(['spread', 'spread', 'sensible', 'focus', 'focus']);
  });

  it('takes the nearest on balanced, the most wounded on firm, the healthiest on gentle', () => {
    expect(pickByHabit('sensible', list, 6).name).toBe('tank');
    expect(pickByHabit('focus', list, 6).name).toBe('hurt');
    expect(pickByHabit('spread', [{ t: hurt, d: 1 }, { t: mid, d: 2 }, { t: tank, d: 3 }], 6).name).toBe('tank');
  });

  it('only weighs heroes it can reach this turn', () => {
    expect(pickByHabit('focus', list, 3).name).toBe('mid');
    expect(pickByHabit('focus', [{ t: tank, d: 20 }, { t: hurt, d: 30 }], 6).name).toBe('tank');
  });

  it('tells the Dungeon Master how monsters fight at this table', () => {
    expect(monsterTacticsText({ tone: 'heroic', rules: 1, rating: 'teen' })).toMatch(/spread/);
    expect(monsterTacticsText({ tone: 'heroic', rules: 5, rating: 'teen' })).toMatch(/Gang up/);
  });

  it('has a cell for every level in every row of the challenge table', () => {
    for (const r of CHALLENGE_ROWS) expect(r.cells).toHaveLength(RULES_INFO.length);
  });
});
