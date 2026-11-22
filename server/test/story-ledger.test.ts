import { afterEach, describe, expect, it } from 'vitest';
import { describeTable } from '../src/dm/context';
import { Game } from '../src/game/engine';
import { LEDGER_DAYS, LEDGER_TABLES, StoryLedger, isCommonName, setLedger } from '../src/story/ledger';
import { MemoryStore } from './memoryStore';

/** A started table whose Dungeon Master has made up some people, a place and a quest. */
function played(room: string, names: { npcs?: string[]; place?: string; quest?: string } = {}) {
  const g = new Game(room);
  g.addCharacter('p1', 'fighter', 'Brienne');
  g.start();
  for (const [i, name] of (names.npcs ?? []).entries()) g.s.memory.npcs.push({ id: `n${room}${i}`, name, role: 'x', description: '', disposition: 'neutral', locationId: null, notes: [], origin: 'dm', visual: { description: '', imageId: null }, met: true });
  if (names.quest) g.s.memory.quests.push({ id: `q${room}`, title: names.quest, status: 'active', summary: '', notes: [] });
  if (names.place && g.s.world) g.s.world.locations.push({ ...g.s.world.locations[0], id: `l${room}`, name: names.place, origin: 'dm' });
  return g;
}

describe('story ledger', () => {
  afterEach(() => setLedger(null));

  it('keeps what a table made up after the table is gone, and nudges a new table away from it', () => {
    const store = new MemoryStore();
    const ledger = new StoryLedger(store);
    setLedger(ledger);
    const old = played('old', { npcs: ['Elara Voss', 'the guard'], place: 'Whisperwood Hollow', quest: 'The Thorn Ledger' });
    ledger.record('old', old.s);
    store.delete('old'); // the table is deleted; the memory stays

    const fresh = played('new');
    const avoid = fresh.s.setting?.avoid ?? '';
    expect(avoid).toContain('Elara Voss');
    expect(avoid).toContain('Whisperwood Hollow');
    expect(avoid).toContain('The Thorn Ledger');
    expect(avoid).not.toContain('the guard');
    expect(avoid).toContain('the story comes first');
    expect(describeTable(fresh)).toContain('Elara Voss');
  });

  it('does not remember the table it is asked about, lobbies or campaign books', () => {
    const ledger = new StoryLedger(new MemoryStore());
    const g = played('a', { npcs: ['Mira Quill'] });
    ledger.record('a', g.s);
    expect(ledger.note('a')).toBe('');
    const lobby = new Game('b');
    ledger.record('b', lobby.s);
    expect(ledger.summary().tables).toBe(1);
  });

  it('keeps the prompt small, newest tables first, and lets old ones fade', () => {
    let clock = 1_000_000_000_000;
    const store = new MemoryStore();
    const ledger = new StoryLedger(store, () => clock);
    for (let i = 0; i < LEDGER_TABLES + 5; i++) {
      clock += 1000;
      ledger.record(`t${i}`, played(`t${i}`, { npcs: [`Person${i} Name`] }).s);
    }
    expect(ledger.rows()).toHaveLength(LEDGER_TABLES);
    expect(ledger.summary().npcs.length).toBeLessThanOrEqual(24);
    expect(ledger.summary().npcs[0]).toBe(`Person${LEDGER_TABLES + 4} Name`);
    clock += (LEDGER_DAYS + 1) * 86_400_000;
    expect(ledger.rows()).toHaveLength(0);
    expect(ledger.note()).toBe('');
  });

  it('skips everyday words and can be cleared', () => {
    expect(isCommonName('The Old Tavern')).toBe(true);
    expect(isCommonName('Goblin Caves')).toBe(true);
    expect(isCommonName('Elara Voss')).toBe(false);
    const ledger = new StoryLedger(new MemoryStore());
    ledger.record('a', played('a', { npcs: ['Elara Voss'] }).s);
    expect(ledger.summary().npcs).toEqual(['Elara Voss']);
    ledger.clear();
    expect(ledger.summary().tables).toBe(0);
  });

  it('adds nothing when no ledger runs', () => {
    expect(played('x').s.setting?.avoid).toBeUndefined();
  });
});
