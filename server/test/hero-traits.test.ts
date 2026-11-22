// Personality traits: set in the creator, kept on heroes and My heroes templates, read by the Dungeon Master only for
// how the world answers; old heroes without them behave as before.
import { describe, expect, it } from 'vitest';
import { cleanSpec } from '../../shared/accounts';
import { PREMADES } from '../../shared/premades';
import { TRAIT_GROUPS, TRAIT_NOTE_MAX, cleanTraits, traitLines, traitText } from '../../shared/traits';
import { describeTable, describeWorld, DM_SYSTEM_PROMPT } from '../src/dm/context';
import { Game } from '../src/game/engine';

const brann = PREMADES.find((p) => p.id === 'brann')!.spec;

describe('hero traits', () => {
  it('keeps known picks only, capped, with a trimmed note', () => {
    const t = cleanTraits({ picks: { humour: ['dry', 'nope'], speech: [], bogus: ['x'], quirks: 'no' }, note: `  ${'y'.repeat(900)}  ` })!;
    expect(t.picks).toEqual({ humour: ['dry'] });
    expect(t.note).toHaveLength(TRAIT_NOTE_MAX);
    expect(cleanTraits({ picks: {}, note: ' ' })).toBeNull();
    expect(cleanTraits('x')).toBeNull();
    const many = TRAIT_GROUPS[0].options.map((o) => o.id);
    expect(cleanTraits({ picks: { personality: many } })!.picks.personality).toHaveLength(4);
  });

  it('has an English and a German label for every option, with no ß', () => {
    for (const g of TRAIT_GROUPS) {
      expect(g.options.length).toBeGreaterThan(0);
      for (const x of [g.title, g.hint, ...g.options.map((o) => o.text)]) { expect(x.en).toBeTruthy(); expect(x.de).toBeTruthy(); expect(x.de).not.toContain('ß'); }
    }
    expect(traitText({ picks: { humour: ['dry'] }, note: 'Whistles.' }, 'de')).toBe('trocken. Whistles.');
  });

  it('is cleaned with the rest of a template spec and dropped when empty', () => {
    expect(cleanSpec({ ...brann, traits: { picks: { speech: ['few_words', 'zzz'] }, note: 'Grim.' } })!.traits).toEqual({ picks: { speech: ['few_words'] }, note: 'Grim.' });
    expect('traits' in cleanSpec({ ...brann, traits: { picks: {}, note: '' } })!).toBe(false);
    expect('traits' in cleanSpec(brann)!).toBe(false);
  });

  it('goes from the creator to the hero and back into the recipe for a template', () => {
    const g = new Game('traits', () => 0.42);
    g.upsertPlayer('p1', 'Chris', true);
    const traits = { picks: { humour: ['sarcastic'], danger: ['plans'] }, note: 'Never turns down a dare.' };
    const hero = g.createCharacter('p1', { ...brann, traits });
    expect(hero.traits).toEqual(traits);
    expect(g.recipe('p1', hero.id)!.traits).toEqual(traits);
    const plain = g.createCharacter('p1', { ...brann, name: 'Plain' });
    expect(plain.traits).toBeUndefined();
    expect('traits' in g.recipe('p1', plain.id)!).toBe(false);
  });

  it('reaches the Dungeon Master as flavour for the world, never as a script for the hero', () => {
    const g = new Game('traits2', () => 0.42);
    g.upsertPlayer('p1', 'Chris', true);
    const hero = g.createCharacter('p1', { ...brann, traits: { picks: { humour: ['dry'] }, note: 'Whistles when nervous.' } });
    expect(traitLines(hero.traits)).toEqual(['Humour: dry', "In the player's words: Whistles when nervous."]);
    g.start();
    expect(describeTable(g)).toContain('Humour: dry');
    expect(describeTable(g)).toContain('never to speak or decide for them');
    expect(describeWorld(g)).toContain('Personality (how the world answers them');
    expect(DM_SYSTEM_PROMPT).toContain('It never lets you write what the hero says, thinks, feels or does');
  });

  it('leaves heroes without traits as they were', () => {
    const g = new Game('traits3', () => 0.42);
    g.upsertPlayer('p1', 'Chris', true);
    g.createCharacter('p1', { ...brann });
    expect(describeTable(g)).not.toContain('Personality');
  });
});
