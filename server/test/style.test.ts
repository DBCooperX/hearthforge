// DM style: tone, rules strictness and content rating reach the Dungeon Master and stay under the host's control.
import { describe, expect, it } from 'vitest';
import { FLAVOUR_INFO, RATING_INFO, RULES_INFO, TONE_INFO, DEFAULT_STYLE, cleanStyle, styleText } from '../../shared/style';
import { SETTINGS } from '../../shared/admin';
import { DM_SYSTEM_PROMPT, describeCombat, describeWorld } from '../src/dm/context';
import { Game, GameError } from '../src/game/engine';

function table() {
  const g = new Game('test', () => 0.42);
  g.seat('host', 'key', 'Chris');
  g.seat('guest', 'key2', 'Mira');
  g.addCharacter('host', 'fighter', '');
  return g;
}

describe('DM style', () => {
  it('starts with the default and keeps old saves playable', () => {
    expect(table().s.table.style).toEqual(DEFAULT_STYLE);
    const saved = table().s as any;
    delete saved.table.style;
    expect(new Game('test', () => 0.42, saved).s.table.style).toEqual(DEFAULT_STYLE);
  });

  it('lets only the host change it, at any time, and checks the values', () => {
    const g = table();
    expect(() => g.setStyle('guest', { tone: 'grim' })).toThrow(GameError);
    g.setStyle('host', { tone: 'grim', rules: 5 });
    expect(g.s.table.style).toEqual({ tone: 'grim', rules: 5, rating: 'teen', flavour: 'pronounced' });
    g.start('host');
    g.setStyle('host', { rating: 'family' });
    expect(g.s.table.style.rating).toBe('family');
    expect(() => g.setStyle('host', { tone: 'nope' })).toThrow('Unknown tone');
    expect(() => g.setStyle('host', { rating: 'x' })).toThrow('Unknown content rating');
    g.setStyle('host', { rules: 99 });
    expect(g.s.table.style.rules).toBe(5);
    g.setStyle('host', { rules: -4 });
    expect(g.s.table.style.rules).toBe(1);
  });

  it('cleans untrusted values', () => {
    expect(cleanStyle({ tone: 'cozy', rules: '2', rating: 'mature' })).toEqual({ tone: 'cozy', rules: 2, rating: 'mature', flavour: 'pronounced' });
    expect(cleanStyle({ tone: 'x', rules: 'y', rating: 7 })).toEqual(DEFAULT_STYLE);
    expect(cleanStyle(null)).toEqual(DEFAULT_STYLE);
    expect(cleanStyle({ flavour: 'bold' }).flavour).toBe('bold');
    expect(cleanStyle({ flavour: 'loud' }).flavour).toBe('pronounced');
  });

  it('is sent to the Dungeon Master on every turn, in the world and in combat', () => {
    const g = table();
    g.setStyle('host', { tone: 'comedic', rules: 1, rating: 'family' });
    g.start('host');
    for (const text of [describeWorld(g), describeCombat(g)]) {
      expect(text).toContain('Comedic and playful');
      expect(text).toContain('Rules style: coaching');
      expect(text).toContain('Content rating: family');
    }
  });

  it('has a prompt and both languages for every option', () => {
    for (const i of [...TONE_INFO, ...RATING_INFO]) { expect(i.prompt.length).toBeGreaterThan(40); expect(i.label.de && i.blurb.de).toBeTruthy(); }
    expect(RULES_INFO.map((r) => r.value)).toEqual([1, 2, 3, 4, 5]);
    for (const r of RULES_INFO) expect(r.label.de && r.blurb.de && r.prompt).toBeTruthy();
    expect(styleText(DEFAULT_STYLE)).toContain('content rating always wins');
  });

  it('can be given server defaults in the Innkeeper', () => {
    for (const k of ['HEARTHFORGE_DM_TONE', 'HEARTHFORGE_DM_RULES', 'HEARTHFORGE_DM_RATING', 'HEARTHFORGE_DM_FLAVOUR']) expect(SETTINGS.some((s) => s.key === k)).toBe(true);
    expect(SETTINGS.find((s) => s.key === 'HEARTHFORGE_DM_TONE')!.choices).toEqual(TONE_INFO.map((t) => t.id));
    expect(SETTINGS.find((s) => s.key === 'HEARTHFORGE_DM_RATING')!.choices).toEqual(RATING_INFO.map((t) => t.id));
  });

  it('has a character flavour for NPCs only, set by the host and sent every turn', () => {
    const g = table();
    expect(g.s.table.style.flavour).toBe('pronounced');
    expect(() => g.setStyle('guest', { flavour: 'bold' })).toThrow(GameError);
    expect(() => g.setStyle('host', { flavour: 'loud' })).toThrow('Unknown character flavour');
    g.setStyle('host', { flavour: 'bold' });
    g.start('host');
    expect(describeWorld(g)).toContain('Character flavour: over the top');
    expect(FLAVOUR_INFO.map((f) => f.id)).toEqual(['subtle', 'pronounced', 'bold']);
    for (const f of FLAVOUR_INFO) { expect(f.prompt).toContain('People of the story'); expect(f.label.de && f.blurb.de).toBeTruthy(); }
    expect(SETTINGS.find((s) => s.key === 'HEARTHFORGE_DM_FLAVOUR')!.choices).toEqual(FLAVOUR_INFO.map((t) => t.id));
  });

  it('keeps heroes with their players in the prompt', () => {
    expect(DM_SYSTEM_PROMPT).toContain('Never decide for a hero');
    expect(DM_SYSTEM_PROMPT).toContain('Offer hooks, never orders');
    expect(DM_SYSTEM_PROMPT).toContain('call inspiration');
  });

  it('awards Heroic Inspiration once and rerolls the next failed check with it', () => {
    const g = table();
    g.start('host');
    const hero = g.s.characters[0];
    expect(() => g.inspire('nobody', 'x')).toThrow(GameError);
    expect(g.inspire(hero.id, 'kept an oath')).toEqual({ granted: true });
    expect(g.inspire(hero.id, 'again')).toEqual({ already: true });
    expect(describeWorld(g)).toContain('Has Heroic Inspiration');
    g.skillCheck(hero.id, 'str', 'athletics', 99);
    expect(hero.heroic).toBe(false);
    expect(g.s.log.some((l) => l.text.includes('Inspiration rerolls'))).toBe(true);
  });
});
