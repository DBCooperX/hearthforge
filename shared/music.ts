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

/**
 * How a source of free audio or art gets onto the server, from least to most work for the owner.
 * auto: free licence with a direct link, so the server fetches it by itself.
 * click: the owner presses a button (or pastes a link) and the server fetches the file from the source.
 * manual: the source wants a login or forbids automatic downloads, so the owner gets a link and drops the file in.
 * Hearthforge never hosts or mirrors third-party files: every download goes from the source to the server.
 */
export type AssetAccess = 'auto' | 'click' | 'manual';

/** A place to find music or ambient loops. */
export interface SoundSource {
  id: string;
  layer: MusicLayer | 'both';
  name: string;
  author: string;
  license: string;
  url: string;
  access: AssetAccess;
}

export const SOUND_SOURCES: SoundSource[] = [
  { id: 'incompetech', layer: 'music', name: 'Kevin MacLeod: royalty-free music', author: 'Kevin MacLeod', license: 'CC BY 4.0', url: 'https://incompetech.com/music/royalty-free/', access: 'auto' },
  { id: 'opengameart', layer: 'both', name: 'OpenGameArt audio', author: 'Many artists', license: 'CC0 or CC BY, per file', url: 'https://opengameart.org/art-search-advanced?field_art_type_tid%5B%5D=12', access: 'click' },
  { id: 'freesound', layer: 'ambient', name: 'Freesound', author: 'Many artists', license: 'CC0 or CC BY, per sound', url: 'https://freesound.org', access: 'manual' },
  { id: 'sonniss', layer: 'ambient', name: 'Sonniss GDC Game Audio Bundle', author: 'Sonniss', license: 'Royalty-free, no credit needed', url: 'https://sonniss.com/gameaudiogdc', access: 'manual' },
  { id: 'pixabay', layer: 'both', name: 'Pixabay music and sound effects', author: 'Many artists', license: 'Pixabay Content License', url: 'https://pixabay.com/music/', access: 'manual' },
];

/** One file in the owner's music library. A built-in track that is not on the server yet has `ready: false`. */
export interface MusicItem {
  id: string;
  context: MusicContext;
  layer: MusicLayer;
  title: string;
  artist: string;
  license: string;
  /** Where the file came from, when it was fetched. */
  url: string;
  /** Empty while the file is not on the server. */
  src: string;
  ready: boolean;
  /** Players hear it. */
  enabled: boolean;
  builtIn: boolean;
}

export interface MusicLibrary {
  enabled: boolean;
  pending: boolean;
  items: MusicItem[];
}

export const MUSIC_ERRORS = {
  failed: 'That did not work. The server log says more.',
  no_key: 'Add your free Freesound API key first (Sound and voice → Switches and keys).',
  forbidden: 'Music is managed in the Innkeeper, by the owner of this server.',
  not_audio: 'This is not an audio file (mp3, ogg, m4a, wav or flac).',
  too_big: 'This file is too large (96 MB at most).',
  bad_link: 'This is not a link to a file on the internet.',
  download_failed: 'The download failed. The server may not reach that site, or the link does not lead to an audio file.',
  unknown_track: 'The server does not know this track.',
  bad_request: 'That did not work. The server log says more.',
} as const;
