// The zone map of the place the party is in. Spots come from three sources: the known places
// inside it (the tavern of a village), the sections of a dungeon as far as the party knows them,
// and the spots the Dungeon Master names with set_stage ("Zollhaus", "Steg", "Schilf").
// Everything here is plain strings the server checks; the DM never sends coordinates.
import { neighbors, type TerrainCode } from '../../../shared/hex';
import {
  MAX_SPOTS, ZONE_H, ZONE_W, findSpot, hashText, kindOfPlace, placeSpot, spotInText, spotKey, spotKind, zoneStyle,
  type ZoneSpot, type ZoneView,
} from '../../../shared/zone';
import type { Game } from './engine';
import { trueTerrain, type LocationState } from './world';

const MAX_NEARBY = 4;

/** The place a zone belongs to: a tavern's village, or the place itself. */
export function zoneRoot(game: Game, loc: LocationState | null): LocationState | null {
  if (!loc) return null;
  return (loc.parentId && game.location(loc.parentId)) || loc;
}

/** "the Goblin Guardroom" is labelled "Goblin Guardroom" on the map. */
function label(name: string): string {
  const bare = name.trim().replace(/^(the|der|die|das)\s+/i, '');
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

function newId(zone: ZoneView, name: string): string {
  const base = (spotKey(name).replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '') || 'spot').slice(0, 30);
  let id = base, n = 2;
  while (zone.spots.some((s) => s.id === id)) id = `${base}_${n++}`;
  return id;
}

function addSpot(zone: ZoneView, name: string, from: ZoneSpot | null, extra: Partial<ZoneSpot> = {}): ZoneSpot | null {
  if (zone.spots.length >= MAX_SPOTS) {
    // A full map makes room by forgetting the oldest spot nobody has been to and nothing hangs on.
    const linked = new Set(zone.spots.flatMap((s) => s.links));
    const drop = zone.spots.findIndex((s) => !s.visited && !s.placeId && s.section === undefined && s.id !== zone.at && !linked.has(s.id));
    if (drop < 0) return null;
    zone.spots.splice(drop, 1);
  }
  const { x, y } = placeSpot(zone, from);
  const spot: ZoneSpot = { id: newId(zone, name), name: name.slice(0, 40), kind: spotKind(name), x, y, visited: false, links: from ? [from.id] : [], ...extra };
  zone.spots.push(spot);
  return spot;
}

function centreOf(zone: ZoneView): ZoneSpot | null {
  return zone.spots.find((s) => s.id === 'centre') ?? zone.spots[0] ?? null;
}

/**
 * The zone of a place, made the first time it is needed and brought up to date with what the game
 * knows: places inside it that the party has discovered, and dungeon sections cleared or next.
 */
export function syncZone(game: Game, root: LocationState): ZoneView {
  const w = game.world;
  if (!root.zone) {
    const terrain = (root.q >= 0 ? trueTerrain(w, root) : 'p') as TerrainCode;
    const shore = neighbors(root, w.width, w.height).some((h) => trueTerrain(w, h) === 'w');
    const style = zoneStyle(root.kind, terrain, shore, !!root.stages?.length);
    const zone: ZoneView = { style, seed: hashText(`${w.seed}:${root.id}`), spots: [], at: 'centre' };
    // Underground, the way in is in a corner and the sections lead away from it.
    const pos = style.ground === 'underground' ? { x: 14, y: 14 } : { x: ZONE_W / 2, y: ZONE_H / 2 + 2 };
    zone.spots.push({ id: 'centre', name: root.name, kind: kindOfPlace(root.kind), ...pos, visited: root.visited, links: [] });
    root.zone = zone;
  }
  const zone = root.zone;
  const centre = centreOf(zone);
  if (centre) centre.visited ||= root.visited;
  for (const child of w.locations.filter((l) => l.parentId === root.id && l.discovered)) {
    let spot = zone.spots.find((s) => s.placeId === child.id);
    if (!spot) {
      // A spot the story named before the place was known becomes that place.
      spot = findSpot(zone, child.name) ?? undefined;
      if (spot && !spot.placeId && spot.section === undefined) { spot.placeId = child.id; spot.name = child.name; spot.kind = kindOfPlace(child.kind); }
      else spot = addSpot(zone, child.name, centre, { kind: kindOfPlace(child.kind), placeId: child.id }) ?? undefined;
    }
    if (spot) spot.visited ||= child.visited;
  }
  if (root.stages?.length) {
    const cleared = root.cleared ?? 0;
    let prev = centre;
    root.stages.forEach((st, i) => {
      if (i > cleared) return; // later sections stay off the map until the party gets that far
      let spot = zone.spots.find((s) => s.section === i);
      if (!spot) spot = addSpot(zone, label(st.name), prev, { kind: spotKind(st.name, 'room'), section: i }) ?? undefined;
      if (spot) { spot.cleared = i < cleared; spot.visited ||= i < cleared; prev = spot; }
    });
  }
  if (zone.at && !zone.spots.some((s) => s.id === zone.at)) zone.at = centre?.id ?? null;
  return zone;
}

/** The zone of the place the party is in, or null in the wilderness. */
export function currentZone(game: Game): ZoneView | null {
  if (!game.s.world) return null;
  const root = zoneRoot(game, game.place());
  return root ? syncZone(game, root) : null;
}

/** The party settled into a place: it stands at the spot of that place, or in the middle of it. */
export function enterPlace(game: Game, loc: LocationState) {
  const root = zoneRoot(game, loc)!;
  const zone = syncZone(game, root);
  const spot = loc === root ? centreOf(zone) : zone.spots.find((s) => s.placeId === loc.id);
  if (spot) { zone.at = spot.id; spot.visited = true; }
}

/**
 * The Dungeon Master named the spot the scene plays at, and maybe others the heroes now know of.
 * A known spot is matched by name; a new one goes on the map next to where the party came from.
 * Stepping into or out of a known place inside this one (the tavern) moves the party there too.
 */
export function enterSpot(game: Game, name: string, nearby = ''): { spot: string; new_spot?: boolean; known_nearby?: string[] } | { note: string } {
  const place = game.place();
  const root = zoneRoot(game, place);
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!root) return { note: 'The party is in the wilderness, which has no zone map; the scene header still changed.' };
  const zone = syncZone(game, root);
  const from = zone.spots.find((s) => s.id === zone.at) ?? centreOf(zone);
  let spot: ZoneSpot | null = from;
  let fresh = false;
  if (clean) {
    spot = findSpot(zone, clean);
    // The place itself by name: back in the middle of it.
    if (!spot && spotKey(clean) === spotKey(root.name)) spot = centreOf(zone);
    if (!spot) { spot = addSpot(zone, clean, from); fresh = !!spot; }
  }
  if (!spot) return { note: `The zone map of ${root.name} is full; reuse a spot already on it.` };
  // Walking into the tavern, or out of it into the village, moves the party in the game as well.
  const target = spot.placeId ? game.location(spot.placeId) : spot.id === 'centre' || !place?.parentId ? null : root;
  if (target && target.id !== game.world.placeId) game.enterQuietly(target);
  zone.at = spot.id;
  spot.visited = true;
  const known: string[] = [];
  for (const raw of nearby.split(/[,;\n]+/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, MAX_NEARBY)) {
    if (/^(none|nothing|nichts|keine?)$/i.test(raw)) continue;
    const there = findSpot(zone, raw);
    if (there) {
      if (there !== spot && !there.links.includes(spot.id) && !spot.links.includes(there.id)) there.links.push(spot.id);
      continue;
    }
    const added = addSpot(zone, raw, spot);
    if (added) known.push(added.name);
  }
  return { spot: spot.name, ...(fresh ? { new_spot: true } : {}), ...(known.length ? { known_nearby: known } : {}) };
}

/** No spot named: if the scene header names a spot on the map ("Zollhaus, upper floor"), the party is there. */
export function followHeader(game: Game, where: string) {
  const zone = currentZone(game);
  if (!zone || !where) return;
  const spot = spotInText(zone, where);
  if (spot && spot.id !== zone.at && !spot.placeId) { zone.at = spot.id; spot.visited = true; }
}

/** The zone map for the Dungeon Master, so it reuses the names the players see. */
export function describeZone(game: Game): string[] {
  const root = zoneRoot(game, game.place());
  if (!root) return [];
  const zone = syncZone(game, root);
  if (zone.spots.length < 2 && zone.at === 'centre') {
    return [`Zone map of ${root.name}: nothing but the place itself yet. When a scene plays at a particular spot (a building, the jetty, the reeds), name it in set_stage's "spot", and name places the heroes hear of or see in "nearby"; the players see them on the zone map.`];
  }
  const parts = zone.spots.map((s) => `${s.name}${s.id === zone.at ? ' (the party is here)' : s.cleared ? ' (cleared)' : s.visited ? ' (visited)' : ' (known, not yet visited)'}`);
  return [`Zone map of ${root.name}, as the players see it (reuse these names in set_stage's "spot"): ${parts.join('; ')}.`];
}
