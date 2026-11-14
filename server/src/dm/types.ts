import type { Beat, Game, Monster } from '../game/engine';

export interface DungeonMaster {
  readonly mode: 'claude' | 'scripted';
  readonly model: string | null;
  /** Narrate story beats. Returns null when there is nothing to say. */
  narrate(game: Game, beats: Beat[]): Promise<string | null>;
  /**
   * Play every monster in the block. `onAction` is awaited after each monster
   * acts so clients can animate it. Returns narration for the block.
   */
  runMonsters(game: Game, block: Monster[], onAction: () => Promise<void>): Promise<string | null>;
  /** Answer a player talking to the DM. */
  chat(game: Game, playerName: string, text: string, onRoll: () => Promise<void>): Promise<string | null>;
}
