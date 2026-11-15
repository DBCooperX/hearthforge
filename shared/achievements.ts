// Trophies the party earns by playing. Each one is a number the server can count and a goal to reach.

/** Everything a trophy may look at. The server fills it from the game. */
export interface TrophyContext {
  fights: number;
  bosses: number;
  trades: number;
  haggled: number;
  rescued: number;
  undos: number;
  heard: number;
  maxLevel: number;
  quests: number;
  visited: number;
  explored: number;
  gold: number;
  day: number;
  /** The highest standing with any faction, and how far down the lowest one is (as a positive number). */
  bestStanding: number;
  worstStanding: number;
}

export interface TrophyDef {
  id: string;
  name: string;
  text: string;
  icon: string;
  need: number;
  count: (c: TrophyContext) => number;
}

export const TROPHIES: readonly TrophyDef[] = [
  { id: 'first_blood', name: 'First Blood', text: 'Win a fight.', icon: '⚔️', need: 1, count: (c) => c.fights },
  { id: 'battle_hardened', name: 'Battle-Hardened', text: 'Win 10 fights.', icon: '🛡️', need: 10, count: (c) => c.fights },
  { id: 'giant_slayer', name: 'Giant-Slayer', text: 'Defeat a boss.', icon: '👑', need: 1, count: (c) => c.bosses },
  { id: 'seasoned', name: 'Seasoned', text: 'Reach level 3.', icon: '⭐', need: 3, count: (c) => c.maxLevel },
  { id: 'peak_of_power', name: 'Peak of Power', text: 'Reach level 5.', icon: '🌟', need: 5, count: (c) => c.maxLevel },
  { id: 'wanderer', name: 'Wanderer', text: 'Explore 60 hexes of the map.', icon: '🧭', need: 60, count: (c) => c.explored },
  { id: 'pathfinder', name: 'Pathfinder', text: 'Visit 5 places.', icon: '📍', need: 5, count: (c) => c.visited },
  { id: 'oath_kept', name: 'Oath Kept', text: 'Complete a quest.', icon: '📜', need: 1, count: (c) => c.quests },
  { id: 'trusted_fixer', name: 'Trusted Fixer', text: 'Complete 3 quests.', icon: '📚', need: 3, count: (c) => c.quests },
  { id: 'deep_pockets', name: 'Deep Pockets', text: 'Hold 500 gp at once.', icon: '💰', need: 500, count: (c) => c.gold },
  { id: 'regular', name: 'Regular Customer', text: 'Buy or sell 5 times at a merchant.', icon: '🛒', need: 5, count: (c) => c.trades },
  { id: 'silver_tongue', name: 'Silver Tongue', text: 'Win a great haggle.', icon: '🗣️', need: 1, count: (c) => c.haggled },
  { id: 'friend_of_the_people', name: 'Friend of the People', text: 'Be honoured by a faction.', icon: '🤝', need: 60, count: (c) => c.bestStanding },
  { id: 'notorious', name: 'Notorious', text: 'Be hated by a faction.', icon: '☠️', need: 60, count: (c) => c.worstStanding },
  { id: 'ear_to_the_ground', name: 'Ear to the Ground', text: 'Hear 5 rumours.', icon: '👂', need: 5, count: (c) => c.heard },
  { id: 'second_thoughts', name: 'Second Thoughts', text: 'Take an action back before it is answered.', icon: '↩️', need: 1, count: (c) => c.undos },
  { id: 'long_road', name: 'The Long Road', text: 'Last until day 10.', icon: '🌅', need: 10, count: (c) => c.day },
  { id: 'down_not_out', name: 'Down, Not Out', text: 'Wake up after a total defeat.', icon: '🕯️', need: 1, count: (c) => c.rescued },
];

export const TROPHY_IDS = TROPHIES.map((t) => t.id);

/** Counters the server keeps for the trophies that cannot be read from the game itself. */
export interface Stats {
  fights: number;
  bosses: number;
  trades: number;
  haggled: number;
  rescued: number;
  undos: number;
  heard: number;
}
export const emptyStats = (): Stats => ({ fights: 0, bosses: 0, trades: 0, haggled: 0, rescued: 0, undos: 0, heard: 0 });

/** One trophy as the players see it: unlocked on a day, or still short of its goal. */
export interface TrophyView {
  id: string;
  /** The day it was earned, or null. */
  day: number | null;
  have: number;
}
