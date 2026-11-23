import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/engine';

function fight() {
  const g = new Game('battle', () => 0.5);
  g.upsertPlayer('p1', 'Chris', true);
  g.addPremade('p1', 'fenna', 'Lexe');
  g.addPremade('p1', 'vex', 'Zarek');
  g.addPremade('p1', 'maeve', '');
  g.start();
  g.s.log.push({ id: ++g.s.logSeq, kind: 'dm', text: 'The tavern before the fight.' });
  g.startEncounter([{ defId: 'goblin', count: 8 }], { source: 'story', context: 'test' });
  return g;
}

describe('battle structure', () => {
  it('marks where the fight starts in the log, and where each round starts', () => {
    const g = fight();
    const c = g.s.combat!;
    const story = g.s.log.find((l) => l.text === 'The tavern before the fight.')!;
    expect(c.logFrom).toBe(story.id + 1);
    expect(c.roundFrom).toEqual([c.logFrom]);
    expect(g.s.log.find((l) => l.id === c.logFrom)?.text).toMatch(/Combat!/);
    // Play turns until the second round begins: its first log entry is remembered.
    for (let i = 0; i < 40 && g.s.combat && g.s.combat.round < 2; i++) {
      const cur = g.s.combat.order[g.s.combat.turnIndex];
      const hero = g.s.characters.find((h) => h.id === cur.id);
      if (hero) g.endTurn('p1', hero.id);
      else g.finishMonsterBlock(g.monsterBlock());
    }
    expect(g.s.combat?.round).toBe(2);
    expect(g.s.combat!.roundFrom).toHaveLength(2);
    expect(g.s.combat!.roundFrom![1]).toBeGreaterThan(c.logFrom!);
  });

  it('stands the heroes a square apart at the start, so no miniature hides another', () => {
    const g = fight();
    const heroes = g.s.characters;
    for (const a of heroes) for (const b of heroes) {
      if (a === b) continue;
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(1);
      expect(a.x === b.x && Math.abs(a.y - b.y) < 2).toBe(false);
    }
  });
});
