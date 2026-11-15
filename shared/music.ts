// Background music: which kind of track fits what the party is doing right now.
import type { GameState } from './types';

export const MUSIC_CONTEXTS = ['tavern', 'town', 'overworld', 'dungeon', 'combat', 'boss'] as const;
export type MusicContext = (typeof MUSIC_CONTEXTS)[number];

export type MusicLayer = 'music' | 'ambient';

export interface MusicTrack {
  id: string;
  context: MusicContext;
  /** Music is the tune; ambient is a quiet loop under it (crowd, fire, wind). */
  layer: MusicLayer;
  title: string;
  /** Empty for files the server owner dropped in by hand. */
  artist: string;
  license: string;
  src: string;
}

export interface MusicManifest {
  enabled: boolean;
  /** The server is still fetching tracks, so more may appear. */
  pending: boolean;
  tracks: MusicTrack[];
}

/** What to play when a context has no track of its own. An empty list means silence. */
export const MUSIC_FALLBACK: Record<MusicContext, MusicContext[]> = {
  tavern: ['town'],
  town: ['tavern'],
  overworld: ['town'],
  dungeon: [],
  combat: ['boss'],
  boss: ['combat'],
};

/** The music that fits the game right now. The join and party screens sit in the tavern. */
export function musicContext(state: Pick<GameState, 'phase' | 'world' | 'bossFight'> | null): MusicContext {
  if (!state || state.phase === 'lobby' || !state.world) return 'tavern';
  if (state.phase === 'combat') return state.bossFight ? 'boss' : 'combat';
  if (state.phase === 'defeat') return 'dungeon';
  const place = state.world.locations.find((l) => l.id === state.world!.placeId);
  switch (place?.kind) {
    case 'tavern': return 'tavern';
    case 'town': case 'village': case 'shop': case 'temple': return 'town';
    case 'dungeon': case 'ruin': case 'cave': return 'dungeon';
    default: return 'overworld';
  }
}
