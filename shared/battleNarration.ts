// How much of a fight is told in words. Heroes' own actions show on the battle map, so the Dungeon Master only
// speaks at the big moments, and now and then in between. The server decides what is written, and each player's
// setting decides what is read aloud to them.
/** Under Settings → Sound: no battle narration, the big moments only, or every comment the Dungeon Master writes. */
export const BATTLE_NARRATION_MODES = ['off', 'key', 'all'] as const;
export type BattleNarrationMode = (typeof BATTLE_NARRATION_MODES)[number];
export const DEFAULT_BATTLE_NARRATION: BattleNarrationMode = 'key';

/** 'key' is a big moment (a kill, a hero down, a critical hit, the start or end), 'note' is a passing comment. */
export type BattleLine = 'key' | 'note';

/** Between the big moments, the Dungeon Master comments once in this many monster turns. */
export const COMMENT_EVERY = 3;

/** Whether a monster's turn held a critical hit or put a hero down. */
type Strike = { crit: boolean; targetDown: boolean };
export function highlightOf(r: { attack?: Strike; attacks?: Strike[] }): boolean {
  return [...(r.attacks ?? []), ...(r.attack ? [r.attack] : [])].some((a) => a.crit || a.targetDown);
}

/**
 * What to write after a round of monster turns: a big moment when something notable happened, a short comment on
 * every third quiet round, otherwise nothing.
 * @param round how many monster rounds this fight has had, this one included, counting from 1
 */
export function battleLineFor(o: { highlight: boolean; monsterDown: boolean; round: number }): BattleLine | null {
  if (o.highlight || o.monsterDown) return 'key';
  return o.round % COMMENT_EVERY === 0 ? 'note' : null;
}

/** Whether a player with this setting hears a line of the fight. */
export function speaksBattleLine(mode: BattleNarrationMode, line: BattleLine): boolean {
  return mode === 'all' || (mode === 'key' && line === 'key');
}

/** How long a fight line may wait to be read before it is out of date and dropped, in milliseconds. */
export const BATTLE_STALE_MS = 12_000;

export interface QueuedLine { entry: number; battle: boolean; at: number }

/** Adds a line to the reading queue. In a fight only the newest line waits; older fight lines are dropped. */
export function addToQueue<T extends QueuedLine>(queue: T[], line: T, max: number): T[] {
  const next = line.battle ? [...queue.filter((j) => !j.battle), line] : [...queue, line];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** The next line to read, and what is left. Fight lines that waited too long are dropped. */
export function takeFromQueue<T extends QueuedLine>(queue: T[], now: number): { job: T | undefined; rest: T[] } {
  const fresh = queue.filter((j) => !j.battle || now - j.at <= BATTLE_STALE_MS);
  return { job: fresh[0], rest: fresh.slice(1) };
}
