import { describe, expect, it } from 'vitest';
import { BATTLE_STALE_MS, COMMENT_EVERY, addToQueue, battleLineFor, highlightOf, speaksBattleLine, takeFromQueue } from '../../shared/battleNarration';

const hit = { crit: false, targetDown: false };

describe('battle narration', () => {
  it('writes a big moment for a crit, a hero going down or a monster falling', () => {
    expect(highlightOf({ attack: { crit: true, targetDown: false } })).toBe(true);
    expect(highlightOf({ attacks: [hit, { crit: false, targetDown: true }] })).toBe(true);
    expect(highlightOf({ attack: hit })).toBe(false);
    expect(highlightOf({})).toBe(false);
    expect(battleLineFor({ highlight: true, monsterDown: false, round: 1 })).toBe('key');
    expect(battleLineFor({ highlight: false, monsterDown: true, round: 1 })).toBe('key');
  });

  it('comments only every few quiet rounds', () => {
    const lines = Array.from({ length: COMMENT_EVERY * 2 }, (_, i) => battleLineFor({ highlight: false, monsterDown: false, round: i + 1 }));
    expect(lines.filter(Boolean)).toEqual(['note', 'note']);
    expect(lines[COMMENT_EVERY - 1]).toBe('note');
  });

  it('reads what each setting allows', () => {
    expect(speaksBattleLine('off', 'key')).toBe(false);
    expect(speaksBattleLine('key', 'key')).toBe(true);
    expect(speaksBattleLine('key', 'note')).toBe(false);
    expect(speaksBattleLine('all', 'note')).toBe(true);
  });

  it('keeps only the newest fight line waiting, and story lines as before', () => {
    const l = (entry: number, battle: boolean, at = 0) => ({ entry, battle, at });
    let q = addToQueue([], l(1, false), 3);
    q = addToQueue(q, l(2, true), 3);
    q = addToQueue(q, l(3, true), 3);
    expect(q.map((j) => j.entry)).toEqual([1, 3]);
    q = addToQueue(addToQueue(addToQueue(q, l(4, false), 3), l(5, false), 3), l(6, false), 3);
    expect(q.length).toBe(3);
  });

  it('drops fight lines that waited too long', () => {
    const q = [{ entry: 1, battle: true, at: 0 }, { entry: 2, battle: false, at: 0 }];
    const late = takeFromQueue(q, BATTLE_STALE_MS + 1);
    expect(late.job?.entry).toBe(2);
    expect(takeFromQueue(q, 1000).job?.entry).toBe(1);
    expect(takeFromQueue([], 0).job).toBeUndefined();
  });
});
