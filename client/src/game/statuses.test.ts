import { describe, expect, it } from 'vitest';
import { tr } from '../../../shared/i18n';
import type { Character, GameState, MonsterView } from '../../../shared/types';
import { heroStatuses, monsterStatuses } from './statuses';

const tFor = (lang: 'en' | 'de') => (text: string, vars?: Record<string, string | number>) => tr(lang, text, vars);

const hero = (o: Partial<Character>): Character => ({ id: 'h1', name: 'Fenna', conditions: [], buffs: [], effects: [], dead: false, ...o } as Character);
const monster = (o: Partial<MonsterView>): MonsterView => ({ id: 'm1', name: 'Goblin', alive: true, conditions: [], effects: [], ...o } as MonsterView);
const game = (characters: Character[], monsters: MonsterView[]) => ({ characters, monsters } as unknown as GameState);

describe('status icons over the tokens', () => {
  it('shows a Hunter\'s Mark on the marked enemy, naming the ranger', () => {
    const ranger = hero({ mark: { monsterId: 'm1', spell: 'hunters_mark' } });
    const m = monster({});
    const [mark] = monsterStatuses(m, game([ranger], [m]), tFor('en'), 'en');
    expect(mark.name).toBe("Hunter's Mark");
    expect(mark.text).toContain('Fenna');
    expect(mark.tone).toBe('mark');
    expect(monsterStatuses(m, game([ranger], [m]), tFor('de'), 'de')[0].name).toBe('Zeichen des Jägers');
  });

  it('counts the turns a condition on a monster lasts and how to end it', () => {
    const m = monster({ conditions: ['frightened'], effects: [{ condition: 'frightened', turns: 2, save: { ability: 'wis', dc: 13 } }] });
    const [s] = monsterStatuses(m, game([], [m]), tFor('en'), 'en');
    expect(s.badge).toBe(2);
    expect(s.ends).toContain('Wisdom save');
    expect(s.tone).toBe('bad');
    const [de] = monsterStatuses(m, game([], [m]), tFor('de'), 'de');
    expect(de.name).toBe('Verängstigt');
    expect(de.ends).toContain('SG 13');
  });

  it('shows Bless with its caster, concentration and conditions on heroes', () => {
    const cleric = hero({ id: 'h2', name: 'Maeve', conc: { spell: 'bless', level: 1 } });
    const ranger = hero({ conditions: ['blessed', 'poisoned'], buffs: [{ id: 'bless', spell: 'bless', by: 'h2', level: 1 }], effects: [{ condition: 'poisoned', ends: 'save_end', rounds: 3, save: { ability: 'con', dc: 11 } }] });
    const list = heroStatuses(ranger, game([ranger, cleric], []), tFor('en'), 'en');
    expect(list.map((s) => s.key)).toEqual(['buff:bless', 'cond:poisoned']);
    expect(list[0].ends).toContain('Maeve');
    expect(list[1].badge).toBe(3);
    expect(heroStatuses(cleric, game([ranger, cleric], []), tFor('en'), 'en').map((s) => s.key)).toEqual(['conc']);
  });
});
