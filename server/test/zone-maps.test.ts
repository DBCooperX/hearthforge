// Zone maps: inside a place the players see its spots, where the party stands and what it has explored.
import { describe, expect, it } from 'vitest';
import { describeWorld } from '../src/dm/context';
import { applyFindings, reconcilePrompt, type TurnRecord } from '../src/dm/reconcile';
import { Game } from '../src/game/engine';
import { MAX_SPOTS, ZONE_H, ZONE_W, findSpot, spotKind, zonePaths, type ZoneView } from '../../shared/zone';

function newGame() {
  let seed = 11;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const g = new Game('zones', rng);
  g.upsertPlayer('p1', 'Tester', true);
  g.addCharacter('p1', 'fighter', 'Brann');
  g.start();
  g.takeBeats();
  return g;
}

const view = (g: Game) => g.publicState({ busy: false, mode: 'scripted', model: null });
const zoneOf = (g: Game, id: string) => view(g).world!.locations.find((l) => l.id === id)!.zone as ZoneView;
const names = (z: ZoneView) => z.spots.map((s) => s.name);
const at = (z: ZoneView) => z.spots.find((s) => s.id === z.at)?.name;
const turn = (narration: string, calls: TurnRecord['calls'] = []): TurnRecord => ({ said: [{ player: 'Tester', text: 'We walk on' }], narration, startMinutes: 0, calls });

describe('spot kinds', () => {
  it('reads what a spot is from its name, in English and German', () => {
    expect(spotKind('Zollhaus')).toBe('house');
    expect(spotKind('Steg')).toBe('jetty');
    expect(spotKind('Schilf')).toBe('reeds');
    expect(spotKind('the old jetty')).toBe('jetty');
    expect(spotKind('Dorfplatz')).toBe('square');
    expect(spotKind('Alte Mühle')).toBe('mill');
    expect(spotKind('the Rat-Gnawed Storeroom')).toBe('room');
    expect(spotKind('Stadttor')).toBe('gate');
    expect(spotKind('Friedhof')).toBe('grave');
    expect(spotKind('Wirtshaus zum Krug')).toBe('tavern');
    expect(spotKind('something odd')).toBe('spot');
  });
});

describe('zone maps', () => {
  it('maps the starting town with its tavern, and the party stands in the middle of it', () => {
    const g = newGame();
    const z = zoneOf(g, 'emberfall');
    expect(names(z)).toEqual(['Emberfall', 'The Gilded Anvil']);
    expect(at(z)).toBe('Emberfall');
    expect(z.style.ground).toBe('settlement');
    expect(z.spots.find((s) => s.name === 'The Gilded Anvil')).toMatchObject({ kind: 'tavern', placeId: 'gilded_anvil', visited: false, links: ['centre'] });
    // Places inside another one have no map of their own; places not yet visited have none either.
    expect(view(g).world!.locations.find((l) => l.id === 'gilded_anvil')!.zone).toBeNull();
    expect(view(g).world!.locations.find((l) => l.id === 'old_hearthforge')!.zone).toBeNull();
    g.goTo('gilded_anvil');
    expect(at(zoneOf(g, 'emberfall'))).toBe('The Gilded Anvil');
  });

  it('puts the spots the Dungeon Master names on the map, and moves the party between them', () => {
    const g = newGame();
    const r = g.setStage({ where: 'Toll house, front room', present: 'the toll keeper', spot: 'Toll house', nearby: 'Jetty, the Reeds' });
    expect(r.zone_map).toMatchObject({ spot: 'Toll house', new_spot: true, known_nearby: ['Jetty', 'the Reeds'] });
    let z = zoneOf(g, 'emberfall');
    expect(at(z)).toBe('Toll house');
    expect(z.spots.find((s) => s.name === 'Toll house')).toMatchObject({ kind: 'house', visited: true, links: ['centre'] });
    expect(z.spots.find((s) => s.name === 'Jetty')).toMatchObject({ kind: 'jetty', visited: false });
    expect(zonePaths(z).map(([a, b]) => [a.name, b.name].sort().join('-'))).toContain('Jetty-Toll house');
    // A name with or without its article is the same spot, and going there marks it explored.
    g.setStage({ where: 'Out on the reeds', present: 'none', spot: 'reeds' });
    z = zoneOf(g, 'emberfall');
    expect(at(z)).toBe('the Reeds');
    expect(z.spots.filter((s) => /reeds/i.test(s.name))).toHaveLength(1);
    expect(z.spots.find((s) => s.name === 'the Reeds')!.visited).toBe(true);
    for (const s of z.spots) {
      expect(s.x).toBeGreaterThanOrEqual(0); expect(s.x).toBeLessThanOrEqual(ZONE_W);
      expect(s.y).toBeGreaterThanOrEqual(0); expect(s.y).toBeLessThanOrEqual(ZONE_H);
    }
    // A spot keeps its place on the map.
    const before = z.spots.map((s) => [s.x, s.y]);
    g.setStage({ spot: 'Toll house' });
    expect(zoneOf(g, 'emberfall').spots.slice(0, before.length).map((s) => [s.x, s.y])).toEqual(before);
  });

  it('follows the scene header when it names a spot on the map', () => {
    const g = newGame();
    g.setStage({ where: 'Market square', spot: 'Mill', nearby: 'Toll house' });
    g.setStage({ where: 'Toll house, upper floor', present: 'Hendrick' });
    expect(at(zoneOf(g, 'emberfall'))).toBe('Toll house');
    // A header that names no spot leaves the party where it was.
    g.setStage({ where: 'by the fire' });
    expect(at(zoneOf(g, 'emberfall'))).toBe('Toll house');
  });

  it('walks the party into the tavern, and back out, when the spot is a known place', () => {
    const g = newGame();
    g.setStage({ where: '', spot: 'The Gilded Anvil' });
    expect(g.world.placeId).toBe('gilded_anvil');
    expect(g.stage().where).toContain('The Gilded Anvil');
    g.setStage({ where: 'At the well', spot: 'Well' });
    expect(g.world.placeId).toBe('emberfall');
    const z = zoneOf(g, 'emberfall');
    expect(at(z)).toBe('Well');
    expect(z.spots.find((s) => s.name === 'Well')!.links).toEqual(['gilded_anvil']);
  });

  it('shows a dungeon section by section, as far as the party has got', () => {
    const g = newGame();
    const forge = g.location('old_hearthforge')!;
    forge.discovered = true;
    g.world.party = { q: forge.q, r: forge.r };
    g.world.placeId = null;
    g.journeyTo('old_hearthforge');
    let z = zoneOf(g, 'old_hearthforge');
    expect(z.style.ground).toBe('underground');
    expect(names(z)).toEqual(['The Old Hearthforge', 'Rat-Gnawed Storeroom']);
    forge.cleared = 2;
    z = zoneOf(g, 'old_hearthforge');
    expect(names(z)).toEqual(['The Old Hearthforge', 'Rat-Gnawed Storeroom', 'Goblin Guardroom', 'Old Crypt']);
    expect(z.spots.map((s) => !!s.cleared)).toEqual([false, true, true, false]);
    expect(z.spots[3].links).toEqual([z.spots[2].id]);
  });

  it('tells the Dungeon Master and the state check which spots the players see', () => {
    const g = newGame();
    expect(describeWorld(g)).toContain('Zone map of Emberfall');
    g.setStage({ where: 'Toll house', spot: 'Toll house', nearby: 'Jetty' });
    expect(describeWorld(g)).toContain('Zone map of Emberfall, as the players see it (reuse these names in set_stage\'s "spot"): Emberfall (visited); The Gilded Anvil (known, not yet visited); Toll house (the party is here); Jetty (known, not yet visited).');
    expect(reconcilePrompt(g, turn('You walk down to the jetty.'))).toContain('Spots on the zone map of this place: Emberfall, The Gilded Anvil, Toll house (party here), Jetty.');
    // The check moves the party when the narration walked them, unless the DM's own set_stage did.
    applyFindings(g, { spot: 'Jetty' }, turn('You walk down to the jetty.'));
    expect(at(zoneOf(g, 'emberfall'))).toBe('Jetty');
    applyFindings(g, { spot: 'Toll house' }, turn('You stay.', [{ name: 'set_stage', input: { where: 'Jetty' } }]));
    expect(at(zoneOf(g, 'emberfall'))).toBe('Jetty');
  });

  it('keeps a map to a readable size, forgetting old rumoured spots first', () => {
    const g = newGame();
    for (let i = 0; i < MAX_SPOTS + 6; i++) g.setStage({ nearby: `Hut ${String.fromCharCode(65 + i)}` });
    const z = zoneOf(g, 'emberfall');
    expect(z.spots.length).toBe(MAX_SPOTS);
    expect(findSpot(z, 'Hut A')).toBeNull();
    expect(findSpot(z, `Hut ${String.fromCharCode(65 + MAX_SPOTS + 5)}`)).not.toBeNull();
    expect(names(z).slice(0, 2)).toEqual(['Emberfall', 'The Gilded Anvil']);
  });

  it('has no zone in the wilderness, and old saves get theirs when the party is in a place', () => {
    const g = newGame();
    const town = g.location('emberfall')!;
    town.zone = null; // a save from before zone maps
    expect(zoneOf(g, 'emberfall').spots[0].name).toBe('Emberfall');
    g.world.placeId = null;
    expect(g.setStage({ where: 'On the road', spot: 'Milestone' }).zone_map).toMatchObject({ note: expect.stringContaining('wilderness') });
  });
});
