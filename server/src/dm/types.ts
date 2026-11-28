import type { Mood } from '../../../shared/types';
import type { Beat, Game, Monster, MonsterActResult, MonsterIntent } from '../game/engine';

/**
 * Plays one monster's turn and resolves to what happened. The room supplies it: it runs the
 * engine, waits for a player who is deciding on an opportunity attack, and paces the animation.
 */
export type MonsterActor = (monsterId: string, intent?: MonsterIntent) => Promise<MonsterActResult>;

/** A piece of narration ready to show as a scene card. */
export interface Scene {
  title: string;
  mood: Mood;
  text: string;
  /** Suggested next actions for the players. */
  actions: string[];
}

/** Something a player said or tried, as typed into the story box. */
export interface PlayerLine {
  player: string;
  text: string;
  /** A hint from the host in test mode, not something a player said: never shown in the story. */
  director?: boolean;
  /** The skill tag of the suggested action the player picked, so the roll the server makes matches the bonus the chip showed. */
  skill?: string;
}

export interface DungeonMaster {
  readonly mode: 'claude' | 'scripted';
  /** Model shown to players: the one used for ordinary narration. */
  readonly model: string | null;
  /** Narrate story beats. Returns null when there is nothing to say. */
  narrate(game: Game, beats: Beat[], onUpdate: () => Promise<void>): Promise<Scene | null>;
  /**
   * Play every monster in the block, each through `act` exactly once. Returns narration for the block.
   */
  runMonsters(game: Game, block: Monster[], act: MonsterActor): Promise<string | null>;
  /**
   * Respond to what the players say or try. Several lines mean they acted at the same moment
   * and get one answer together. `onUpdate` is awaited whenever the DM changes the game.
   */
  respond(game: Game, said: PlayerLine[], onUpdate: () => Promise<void>): Promise<Scene | null>;
  /**
   * Called once when an adventure starts, before the opening scene: a chance to put fresh
   * words to a rolled region. Must leave names, places and rules untouched. Never throws.
   */
  prepare?(game: Game): Promise<void>;
  /**
   * Give heroes who joined after the start, or whose backstory changed, a personal story thread.
   * Touches only the Dungeon Master's notes. Never throws.
   */
  weaveThreads?(game: Game): Promise<void>;
  /**
   * After a reply has reached the players: bring the game in line with anything the reply narrated
   * without the matching tool, such as walking to town or handing over a coin. Never throws.
   */
  reconcile?(game: Game, onUpdate: () => Promise<void>): Promise<void>;
  /**
   * Answer an out-of-character question as plain words, not a scene: nothing happens in the story and
   * no time passes. The DM may correct the game state through its tools when the question shows a mistake.
   * Resolves to null when there is nothing to say. Never throws.
   */
  answerQuestion?(game: Game, asked: PlayerLine, onUpdate: () => Promise<void>): Promise<string | null>;
  /** Background housekeeping, such as condensing old memory. Never throws. */
  maintain(game: Game): Promise<void>;
}
