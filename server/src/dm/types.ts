import type { Mood } from '../../../shared/types';
import type { Beat, Game, Monster } from '../game/engine';

/** A piece of narration ready to show as a scene card. */
export interface Scene {
  title: string;
  mood: Mood;
  text: string;
  /** Suggested next actions for the players. */
  actions: string[];
}

export interface DungeonMaster {
  readonly mode: 'claude' | 'scripted';
  /** Model shown to players: the one used for ordinary narration. */
  readonly model: string | null;
  /** Narrate story beats. Returns null when there is nothing to say. */
  narrate(game: Game, beats: Beat[], onUpdate: () => Promise<void>): Promise<Scene | null>;
  /**
   * Play every monster in the block. `onAction` is awaited after each monster
   * acts so clients can animate it. Returns narration for the block.
   */
  runMonsters(game: Game, block: Monster[], onAction: () => Promise<void>): Promise<string | null>;
  /** Respond to something a player says or tries. `onUpdate` is awaited whenever the DM changes the game. */
  respond(game: Game, playerName: string, text: string, onUpdate: () => Promise<void>): Promise<Scene | null>;
  /** Background housekeeping, such as condensing old memory. Never throws. */
  maintain(game: Game): Promise<void>;
}
