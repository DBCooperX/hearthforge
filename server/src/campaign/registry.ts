// The one campaign shelf of this server, reachable from the engine and the Dungeon Master
// without threading it through every constructor. Tests can put a shelf of their own here.
import type { CampaignLibrary, Viewer } from './library';

let shelf: CampaignLibrary | null = null;
let viewerOf: (playerId: string) => Viewer | null = () => null;

export function setShelf(lib: CampaignLibrary | null, viewers?: (playerId: string) => Viewer | null) {
  shelf = lib;
  if (viewers) viewerOf = viewers;
}
export const campaignShelf = () => shelf;
export const viewer = (playerId: string) => viewerOf(playerId);
