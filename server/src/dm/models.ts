// Which Claude model handles which moment. The server picks a tier from what is
// happening in the game; each tier's model comes from the environment.
import { MONSTERS } from '../data/monsters';
import type { Beat, Game, Monster } from '../game/engine';

export type Tier = 'background' | 'standard' | 'key';

export interface ModelConfig {
  background: string;
  standard: string;
  key: string;
  /** Set when one model is forced for everything. */
  forced: string | null;
}

export const DEFAULT_MODELS = { background: 'claude-haiku-5-5', standard: 'claude-sonnet-5-5', key: 'claude-opus-5-5' } as const;

export function resolveModels(env: NodeJS.ProcessEnv): ModelConfig {
  const forced = env.HEARTHFORGE_DM_FORCE_MODEL?.trim() || null;
  return {
    background: forced ?? (env.HEARTHFORGE_DM_MODEL_BACKGROUND?.trim() || DEFAULT_MODELS.background),
    standard: forced ?? (env.HEARTHFORGE_DM_MODEL_STANDARD?.trim() || DEFAULT_MODELS.standard),
    key: forced ?? (env.HEARTHFORGE_DM_MODEL_KEY?.trim() || DEFAULT_MODELS.key),
    forced,
  };
}

const KEY_BEATS: Beat['kind'][] = ['start', 'level_up', 'defeat', 'rescued'];
const ROUTINE_BEATS: Beat['kind'][] = ['travel_end', 'rest'];

/** Key moments get the strongest model, routine ones the cheapest, everything else the standard one. */
export function tierForBeats(beats: Beat[]): Tier {
  const key = beats.some((b) =>
    KEY_BEATS.includes(b.kind) ||
    (b.kind === 'arrive' && b.firstVisit && b.major) ||
    ((b.kind === 'combat_start' || b.kind === 'combat_end') && b.boss));
  if (key) return 'key';
  return beats.every((b) => ROUTINE_BEATS.includes(b.kind)) ? 'background' : 'standard';
}

/** A player's turn is a key moment when the DM flagged the previous scene as a turning point. */
export function tierForReply(game: Game): Tier {
  return game.s.escalate ? 'key' : 'standard';
}

export function tierForMonsters(game: Game, block: Monster[]): Tier {
  return game.s.encounter?.boss || block.some((m) => MONSTERS[m.defId].boss) ? 'key' : 'standard';
}
