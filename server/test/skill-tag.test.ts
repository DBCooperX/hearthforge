import { describe, expect, it } from 'vitest';
import { parseActionTag, skillBonus } from '../../shared/skillTag';
import { Game } from '../src/game/engine';

describe('skill-tagged choices', () => {
  it('splits a skill tag off a suggested action, in English or German', () => {
    expect(parseActionTag('[Persuasion] Talk Hendrick round')).toEqual({ text: 'Talk Hendrick round', skill: 'persuasion' });
    expect(parseActionTag('[Heimlichkeit] An den Wachen vorbeischleichen')).toEqual({ text: 'An den Wachen vorbeischleichen', skill: 'stealth' });
    expect(parseActionTag('[Sleight of Hand]: Lift the key')).toEqual({ text: 'Lift the key', skill: 'sleight of hand' });
    expect(parseActionTag('Order a meal')).toEqual({ text: 'Order a meal', skill: null });
    // Round brackets that are not a skill belong to the action.
    expect(parseActionTag('(quietly) Leave the inn')).toEqual({ text: '(quietly) Leave the inn', skill: null });
    // An unknown tag in square brackets is dropped, not shown.
    expect(parseActionTag('[Strength] Force the door')).toEqual({ text: 'Force the door', skill: null });
  });

  it('keeps the tags as the skills of the scene, and the hero bonus counts proficiency and expertise', () => {
    const g = new Game('tags', () => 0.5);
    g.upsertPlayer('p1', 'Chris', true);
    g.addPremade('p1', 'vex', 'Zarek');
    g.start();
    g.addScene({ title: 'Inn', mood: 'warm', text: 'Hendrick grunts.', actions: ['[Persuasion] Talk him round', 'Order a meal'] });
    const scene = g.s.log.at(-1)!.scene!;
    expect(scene.actions).toEqual(['Talk him round', 'Order a meal']);
    expect(scene.actionSkills).toEqual(['persuasion', null]);
    const c = g.s.characters[0];
    const skill = c.expertise[0] ?? c.skills[0];
    const plain = Object.keys({ athletics: 1, arcana: 1, history: 1 }).find((s) => !c.skills.includes(s))!;
    expect(skillBonus(c, plain)).toBe(Math.floor((c.abilities[plain === 'athletics' ? 'str' : 'int'] - 10) / 2));
    expect(skillBonus(c, skill)).toBeGreaterThan(skillBonus({ ...c, skills: [], expertise: [] }, skill));
  });
  it('rolls a named skill with its own ability, so the roll matches the bonus the chip showed', () => {
    const g = new Game('match', () => 0.5);
    g.upsertPlayer('p1', 'Chris', true);
    g.addPremade('p1', 'vex', 'Zarek');
    g.start();
    const c = g.s.characters[0];
    // The Dungeon Master asked for the wrong ability: the skill's own ability counts.
    for (const skill of ['persuasion', 'athletics', 'perception', 'stealth']) {
      const r = g.skillCheck(c.id, skill === 'persuasion' ? 'str' : 'cha', skill, 10);
      expect(r.modifier).toBe(skillBonus(c, skill));
    }
    // A raw ability check (no skill) keeps the ability that was asked for.
    expect(g.skillCheck(c.id, 'str', '', 10).modifier).toBe(Math.floor((c.abilities.str - 10) / 2));
  });

  it('counts Jack of All Trades in the shown bonus', () => {
    const c = { abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, skills: [] as string[], expertise: [] as string[], profBonus: 3, classId: 'bard' as const, level: 2 };
    expect(skillBonus(c, 'history')).toBe(1);
    expect(skillBonus({ ...c, level: 1 }, 'history')).toBe(0);
    expect(skillBonus({ ...c, skills: ['history'] }, 'history')).toBe(3);
  });
});
