// Test mode: the toolbox the host gets at a table the owner put in test mode. Each action is a plain
// value from the browser that the server checks and plays through the same engine the story uses, so
// a fight started here is a real fight, a level-up a real level-up. What the owner switches on and
// off (and what happens to the campaign afterwards) lives in room.ts.
import { formatTime, timeOfDay } from '../../../shared/hex';
import { tagged } from '../../../shared/i18n';
import type { TestAction, TestMonster } from '../../../shared/types';
import { MONSTERS, crValue, type MonsterDef } from '../data/monsters';
import { findMonsters, resolveMonster } from '../data/monsterSearch';
import type { GroupSpec } from '../data/world';
import { GameError, type Game } from './engine';

/** The most creatures a test fight holds, as in a story fight. */
const MAX_CREATURES = 8;

/** Every creature of the catalogue, for the toolbox's picker. Names are in the table's language. */
export function monsterCatalog(game: Game): TestMonster[] {
  return Object.values(MONSTERS)
    .map((d) => ({ id: d.id, name: game.n(d.name), cr: d.cr, kind: d.type }))
    .sort((a, b) => crValue(a.cr) - crValue(b.cr) || a.name.localeCompare(b.name));
}

/** A fair set of creatures for a challenge budget (the sum of their challenge ratings), drawn at random. */
export function pickForBudget(game: Game, budget: number, kind = ''): GroupSpec[] {
  const t = tagged(game.lang);
  const max = Math.max(0.125, Math.min(30, Number(budget) || 0));
  const pool = findMonsters({ type: kind, crMax: max, limit: 40 }).filter((d) => crValue(d.cr) > 0);
  if (!pool.length) throw new GameError(t`No creature fits that budget`);
  // The main enemy is one of the stronger ones that fits; the rest of the budget buys more of its kind.
  const strong = pool.filter((d) => crValue(d.cr) >= max / 4);
  const list = strong.length ? strong : pool;
  const main: MonsterDef = list[Math.floor(game.rng() * list.length)];
  const cr = crValue(main.cr);
  const count = Math.max(1, Math.min(MAX_CREATURES - 2, Math.floor(max / cr)));
  const groups: GroupSpec[] = [{ defId: main.id, count }];
  const left = max - count * cr;
  const filler = left > 0 ? pool.filter((d) => crValue(d.cr) <= left && d.id !== main.id) : [];
  if (filler.length) {
    const extra = filler[Math.floor(game.rng() * filler.length)];
    groups.push({ defId: extra.id, count: Math.max(1, Math.min(2, Math.floor(left / Math.max(0.125, crValue(extra.cr))))) });
  }
  return groups;
}

/** The creatures of a `fight` action, from the picked list or from the budget. */
export function groupsFor(game: Game, a: Extract<TestAction, { op: 'fight' }>): GroupSpec[] {
  const t = tagged(game.lang);
  const picked = (Array.isArray(a.monsters) ? a.monsters : []).filter((m) => m && m.id);
  if (!picked.length) return pickForBudget(game, Number(a.budget), String(a.kind ?? ''));
  return picked.slice(0, MAX_CREATURES).map((m) => {
    const def = resolveMonster(m.id);
    if (!def) throw new GameError(t`Unknown monster type "${String(m.id)}".`);
    return { defId: def.id, count: Math.max(1, Math.min(MAX_CREATURES, Math.round(Number(m.count)) || 1)) };
  });
}

/**
 * Play one toolbox action. Returns the text of a hidden hint for the Dungeon Master when the host
 * asked for a scene; the room hands that on. Throws a GameError the host sees as a message.
 */
export function playtest(game: Game, a: TestAction): { hint?: string } | void {
  const t = tagged(game.lang);
  const s = game.s;
  const idle = () => {
    if (s.phase === 'lobby') throw new GameError(t`The adventure has not started`);
    if (s.phase === 'defeat') throw new GameError(t`The party has fallen. Start a new adventure.`);
    if (s.phase === 'combat') throw new GameError(t`Finish the fight first`);
    if (s.travel) throw new GameError(t`The party is on the road`);
  };
  switch (a.op) {
    case 'fight': {
      idle();
      const groups = groupsFor(game, a);
      const opening = a.opening === 'surprise' || a.opening === 'ambush' ? a.opening : 'none';
      const heroes = s.characters.filter((c) => !c.dead);
      let opener = '';
      let surprise = '';
      if (opening === 'ambush') surprise = 'party';
      if (opening === 'surprise') {
        // The heroes creep up: give them the Stealth success the rules ask for, and the first strike from hiding to one of them.
        surprise = 'enemies';
        for (const c of heroes) game.testSneak(c.id);
        if (a.heroId) opener = game.char(String(a.heroId)).id;
      }
      const why = opening === 'surprise'
        ? 'The heroes creep up on them and catch the enemies unawares.'
        : opening === 'ambush' ? 'The enemies lie in wait and ambush the party.' : 'They find the party.';
      game.startEncounter(groups, {
        source: 'wild',
        context: `A test fight the table's host started on purpose, out of nowhere: ${why} Narrate it as a normal encounter that finds the party where it stands.`,
        ...(surprise ? { surprise } : {}),
        ...(opener ? { opener } : {}),
      });
      return;
    }
    case 'level': game.testLevel(String(a.characterId), Number(a.levels) || 1); return;
    case 'xp': {
      const amount = Math.max(1, Math.min(1_000_000, Math.round(Number(a.amount)) || 0));
      game.grantXp(amount, t`the playtest`);
      return;
    }
    case 'hp': {
      const c = game.testHp(String(a.characterId), Number(a.hp));
      game.log('system', t`${c.name} has ${c.hp} of ${c.maxHp} HP now.`);
      return;
    }
    case 'revive': game.testRevive(String(a.characterId)); return;
    case 'condition': {
      const c = game.testCondition(String(a.characterId), String(a.condition), !!a.on);
      game.log('system', a.on ? t`${c.name} is ${game.n(String(a.condition))} now.` : t`${c.name} is no longer ${game.n(String(a.condition))}.`);
      return;
    }
    case 'restore': game.testRestore(a.characterId ? String(a.characterId) : undefined); return;
    case 'item': game.grantItem(String(a.characterId), String(a.itemId), Number(a.qty) || 1); return;
    case 'gold': game.testGold(Number(a.amount)); return;
    case 'jump': idle(); game.testJump(String(a.locationId), String(a.spot ?? '')); return;
    case 'reveal': idle(); game.testReveal(); return;
    case 'time': {
      idle();
      const now = game.world.minutes;
      let minutes = Math.round(Number(a.minutes) || 0);
      if (a.hour !== undefined) {
        const hour = Math.max(0, Math.min(23, Math.round(Number(a.hour))));
        minutes = (hour * 60 - (now % 1440) + 1440) % 1440;
      }
      if (minutes <= 0) return;
      game.advanceTime(Math.min(minutes, 30 * 1440));
      game.log('system', t`Time moves on: ${formatTime(game.world.minutes, game.lang)} (${game.n(timeOfDay(game.world.minutes))}).`);
      return;
    }
    case 'rest': {
      idle();
      // A test rest always works: the clock and the counters are set so the rules let it through.
      if (a.kind === 'long') s.lastLongRest = -100000;
      else s.shortRestsLeft = Math.max(1, s.shortRestsLeft);
      game.storyRest(a.kind === 'long' ? 'long' : 'short');
      return;
    }
    case 'scene': {
      idle();
      const text = String(a.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!text) throw new GameError(t`Tell the Dungeon Master what should happen.`);
      return { hint: text };
    }
    default:
      throw new GameError(t`Unknown action`);
  }
}
