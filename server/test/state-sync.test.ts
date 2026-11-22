// The story and the game must not drift apart. The Dungeon Master has tools for travel, rests and
// gear; after every reply a background check catches what it narrated without them, and the side
// panel shows the people the scene header names.
import { describe, expect, it } from 'vitest';
import { ClaudeDM } from '../src/dm/claude';
import { applyFindings, parseFindings, reconcilePrompt, type TurnRecord } from '../src/dm/reconcile';
import { ScriptedDM } from '../src/dm/scripted';
import { Game } from '../src/game/engine';
import { TERRAIN, type TerrainCode } from '../../shared/hex';
import { trueTerrain } from '../src/game/world';

function newGame(lang: 'en' | 'de' = 'en') {
  let seed = 5;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const g = new Game('sync', rng);
  g.upsertPlayer('p1', 'Tester', true);
  if (lang === 'de') g.s.language = 'de';
  g.addCharacter('p1', 'fighter', 'Brann');
  g.addCharacter('p1', 'cleric', 'Osric');
  g.start();
  g.takeBeats();
  return g;
}

/** Step the party out of town into a passable wilderness hex next to it. */
function outsideTown(g: Game) {
  const w = g.world;
  const next = [{ q: 11, r: 7 }, { q: 9, r: 7 }, { q: 10, r: 8 }, { q: 10, r: 6 }].find((h) => TERRAIN[trueTerrain(w, h) as TerrainCode].passable)!;
  w.party = next;
  w.placeId = null;
  delete g.s.stage;
  return next;
}

const hero = (g: Game, name: string) => g.s.characters.find((c) => c.name === name)!;
const use = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input });
const scene = (narration: string) => use('s', 'scene', { title: 'On the road', mood: 'mystery', narration, suggested_actions: ['Look around'], journal_entry: '', important: false });
const lastScene = (g: Game) => [...g.s.log].reverse().find((l) => l.kind === 'dm')!.scene!;
const systemLines = (g: Game) => g.s.log.filter((l) => l.kind === 'system').map((l) => l.text);
const turn = (g: Game, narration: string, calls: TurnRecord['calls'] = [], start = g.world.minutes): TurnRecord => ({ said: [{ player: 'Tester', text: 'go on' }], narration, startMinutes: start, calls });

/**
 * A stubbed Messages API: the reply model answers with `reply` (its tool calls, then a scene);
 * the background model answers the reconcile request with `findings`.
 */
function stubbed(reply: (req: any) => any, findings: string) {
  const dm = new ClaudeDM({ models: { background: 'bg', standard: 'std', key: 'key', forced: null }, effort: 'low', apiKey: 'test' });
  const requests: any[] = [];
  (dm as any).client = { beta: { messages: { create: async (req: any) => {
    requests.push(JSON.parse(JSON.stringify(req)));
    if (req.model === 'bg') return { stop_reason: 'end_turn', content: [{ type: 'text', text: findings }] };
    return reply(req);
  } } } };
  return { dm, requests };
}

describe('travel by story', () => {
  it('walks the party back to a nearby town: the map, the place and the clock follow', () => {
    const g = newGame();
    outsideTown(g);
    const before = g.world.minutes;
    const r = g.journeyTo('emberfall');
    expect(r.moved).toBe(true);
    expect(g.world.placeId).toBe('emberfall');
    expect(g.world.party).toEqual({ q: 10, r: 7 });
    expect(g.world.minutes).toBeGreaterThan(before);
    expect(g.stage().where).toBe('Emberfall');
  });

  it('goes straight on into a tavern of the town it reaches, by name as well as by id', () => {
    const g = newGame();
    outsideTown(g);
    g.journeyTo('The Gilded Anvil');
    expect(g.world.placeId).toBe('gilded_anvil');
    expect(g.location('emberfall')!.visited).toBe(true);
  });

  it('leaves long journeys to the map and refuses places the party does not know', () => {
    const g = newGame();
    g.location('greywater')!.discovered = true;
    expect(() => g.journeyTo('nowhere')).toThrow(/No known place/);
    const far = g.location('old_hearthforge')!;
    far.q = 0; far.r = 0; // far beyond a story walk
    expect(() => g.journeyTo('old_hearthforge')).toThrow(/travel there on the map|knows no way/);
  });
});

describe('trips need a confirm', () => {
  it('proposes a trip to another place and moves nothing until it is confirmed', () => {
    const g = newGame();
    outsideTown(g);
    const before = { ...g.world.party }, minutes = g.world.minutes;
    const r = g.proposeJourney('emberfall');
    expect(r.moved).toBe(false);
    expect(r.note).toMatch(/NOT moved/);
    expect(g.world.party).toEqual(before);
    expect(g.world.minutes).toBe(minutes);
    const view = g.publicState({ busy: false, mode: 'scripted', model: null }).trip;
    expect(view).toMatchObject({ name: 'Emberfall', yes: [], needed: 1 });
    expect(view!.hours).toBeGreaterThan(0);
  });

  it('a solo player confirms and the party travels, with an arrival for the narrator', () => {
    const g = newGame();
    outsideTown(g);
    g.proposeJourney('emberfall');
    expect(g.confirmTrip('p1')).toBe(true);
    expect(g.world.placeId).toBe('emberfall');
    expect(g.world.minutes).toBeGreaterThan(0);
    expect(g.s.trip).toBeNull();
    expect(g.takeBeats().some((b) => b.kind === 'arrive')).toBe(true);
  });

  it('cancelling keeps the party where it is and no time passes', () => {
    const g = newGame();
    outsideTown(g);
    const before = { ...g.world.party }, minutes = g.world.minutes;
    g.proposeJourney('emberfall');
    g.cancelTrip('p1');
    expect(g.s.trip).toBeNull();
    expect(g.world.party).toEqual(before);
    expect(g.world.minutes).toBe(minutes);
    expect(g.publicState({ busy: false, mode: 'scripted', model: null }).trip).toBeNull();
    expect(() => g.confirmTrip('p1')).toThrow(/no trip/);
  });

  it('a place in the party own hex is still reached at once', () => {
    const g = newGame();
    const r = g.proposeJourney('gilded_anvil');
    expect(r.moved).toBe(true);
    expect(g.s.trip).toBeNull();
  });

  it('at a full table the host decides, or a majority', () => {
    const g = newGame();
    g.upsertPlayer('p2', 'Two', true);
    g.upsertPlayer('p3', 'Three', true);
    outsideTown(g);
    g.proposeJourney('emberfall');
    expect(g.publicState({ busy: false, mode: 'scripted', model: null }).trip!.needed).toBe(2);
    expect(g.confirmTrip('p2')).toBe(false);
    expect(g.world.placeId).toBeNull();
    expect(g.confirmTrip('p3')).toBe(true);
    expect(g.world.placeId).toBe('emberfall');
    g.proposeJourney('gilded_anvil');
    outsideTown(g);
    g.proposeJourney('emberfall');
    expect(g.confirmTrip(g.s.hostId!)).toBe(true);
  });
});

describe('rests by the rules', () => {
  it('an afternoon rest of a few hours is a short rest and says what came back', () => {
    const g = newGame();
    const brann = hero(g, 'Brann');
    brann.hp = 3;
    const start = g.world.minutes;
    g.advanceTime(240); // the DM let the afternoon pass
    const r = g.storyRest('short', g.world.minutes - start);
    expect(r).toMatchObject({ rested: true, kind: 'short' });
    expect(brann.hp).toBeGreaterThan(3);
    expect(g.world.minutes - start).toBe(240); // the rest fits in the time already passed
    expect(systemLines(g).at(-1)).toMatch(/^Short rest\. Restored: Brann: \+\d+ HP/);
  });

  it('a night of sleep restores everything; too soon after the last one it counts as a short rest', () => {
    const g = newGame();
    g.advanceTime(20 * 60);
    const osric = hero(g, 'Osric');
    osric.hp = 1; osric.mana = 0;
    expect(g.storyRest('long')).toMatchObject({ rested: true, kind: 'long' });
    expect(osric.hp).toBe(osric.maxHp);
    expect(osric.mana).toBe(osric.maxMana);
    expect(systemLines(g).at(-1)).toMatch(/Long rest\. Restored: .*Osric: \+\d+ HP, \+\d+ mana/);
    osric.hp = 1;
    expect(g.storyRest('long')).toMatchObject({ rested: true, kind: 'short', note: expect.stringMatching(/too soon/i) });
  });

  it('writes the restored note in German', () => {
    const g = newGame('de');
    hero(g, 'Brann').hp = 2;
    g.storyRest('short', 60);
    expect(systemLines(g).at(-1)).toMatch(/^Kurze Rast\. Wiederhergestellt: Brann: \+\d+ TP/);
  });
});

describe('gear by story', () => {
  it('a hero who draws another weapon wields it, and the old one goes back in the pack', () => {
    const g = newGame();
    const brann = hero(g, 'Brann');
    const r = g.equipItem(brann.id, 'Spear');
    expect(r).toMatchObject({ changed: true, put_away: 'Longsword' });
    expect(brann.equipment.mainHand?.defId).toBe('spear');
    expect(brann.bag.some((b) => b?.defId === 'longsword')).toBe(true);
    expect(() => g.equipItem(brann.id, 'Potion of Healing')).toThrow(/not something to wear or wield/);
  });
});

describe('the side panel follows the scene header', () => {
  it('lists exactly the people the header names, matched to the people the party knows', () => {
    const g = newGame();
    g.goTo('gilded_anvil');
    g.rememberNpc({ name: 'Hendrick', role: 'old toll clerk', locationId: 'gilded_anvil' });
    g.rememberNpc({ name: 'Griet Möllner', role: "miller's wife", locationId: 'gilded_anvil' });
    g.setStage({ where: 'Taproom, by the fire', present: 'Marta, Griet Möllner, a hooded stranger' });
    const view = g.publicState({ busy: false, mode: 'scripted', model: null });
    expect(view.scene?.where).toBe('Taproom, by the fire');
    expect(view.scene?.present.map((p) => p.name)).toEqual(['Marta Coppervein', 'Griet Möllner', 'a hooded stranger']);
    expect(view.scene?.present[0]).toMatchObject({ npcId: 'marta', role: expect.any(String) });
    expect(view.scene?.present[2].npcId).toBeUndefined();
  });

  it('falls back to the people known to be at the place, with the scripted DM too', async () => {
    const g = newGame();
    g.goTo('gilded_anvil');
    const out = await new ScriptedDM().narrate(g, g.takeBeats());
    g.addScene(out!);
    expect(g.publicState({ busy: false, mode: 'scripted', model: null }).scene?.present.map((p) => p.name)).toEqual(['Marta Coppervein']);
  });
});

describe('reconcile after each reply', () => {
  it('moves the party to the town it walked back to, and re-heads the scene', async () => {
    const g = newGame();
    outsideTown(g);
    const { dm, requests } = stubbed(() => ({ stop_reason: 'tool_use', content: [scene('You leave the reeds behind and walk back to Emberfall. A guard eyes your wet boots at the gate.')] }), '{"place": "emberfall"}');
    const out = await dm.respond(g, [{ player: 'Tester', text: 'Back to Emberfall' }], async () => {});
    g.addScene(out!);
    expect(lastScene(g).where).not.toBe('Emberfall');
    let updates = 0;
    await dm.reconcile(g, async () => { updates++; });
    // Even a trip the story already told is only proposed: the table confirms before the party moves.
    expect(g.world.placeId).toBeNull();
    expect(g.s.trip?.locationId).toBe('emberfall');
    g.confirmTrip('p1');
    expect(g.world.placeId).toBe('emberfall');
    const check = requests.find((r) => r.model === 'bg')!;
    expect(check.tools).toBeUndefined();
    expect(check.messages[0].content).toMatch(/walk back to Emberfall/);
    expect(check.messages[0].content).toMatch(/\[emberfall\] Emberfall/);
  });

  it('applies items left behind, picked up and drawn, but never a quest item', () => {
    const g = newGame();
    const brann = hero(g, 'Brann'), osric = hero(g, 'Osric');
    g.giveStoryItem({ characterId: brann.id, name: 'Hammer coin', category: 'clue' });
    g.giveStoryItem({ characterId: osric.id, name: 'Guild seal', category: 'quest', quest: true });
    const f = parseFindings('Here you go: {"lost": [{"hero": "Brann", "item": "Hammer coin"}, {"hero": "pc15", "item": "Guild seal"}], "gained": [{"hero": "Osric", "item": "Knotted cord", "description": "A wet cord with knots."}], "equipped": [{"hero": "Brann", "item": "Spear"}]}')!;
    const r = applyFindings(g, f, turn(g, 'Brann leaves the coin in the bowl, Osric picks up the cord and Brann levels his spear.'));
    expect(g.heldStoryItems().map((h) => h.def.name).sort()).toEqual(['Guild seal', 'Knotted cord']);
    expect(brann.equipment.mainHand?.defId).toBe('spear');
    expect(r.applied).toEqual(expect.arrayContaining(['lost Hammer coin', 'gained Knotted cord', 'equipped Spear']));
    expect(r.skipped.join()).toMatch(/Guild seal.*quest item/);
  });

  it('rests the party when the reply let it rest, counting the time the DM already added', () => {
    const g = newGame();
    const brann = hero(g, 'Brann');
    brann.hp = 4;
    const start = g.world.minutes;
    g.advanceTime(240);
    applyFindings(g, { rest: 'short' }, turn(g, 'You rest behind the salt store until the light turns copper.', [{ name: 'advance_time', input: { minutes: 240 } }], start));
    expect(brann.hp).toBeGreaterThan(4);
    expect(g.world.minutes - start).toBe(240);
  });

  it('leaves alone what the DM did with its own tools, and anything it cannot place', () => {
    const g = newGame();
    const gold = g.s.gold;
    const calls = [{ name: 'move_to_place', input: { location_id: 'gilded_anvil' } }, { name: 'change_gold', input: { amount: 20 } }, { name: 'set_stage', input: { where: 'Bar', present: 'Marta' } }];
    const r = applyFindings(g, { place: 'old_hearthforge', gold: 20, where: 'Somewhere else', present: 'none', lost: [{ hero: 'pc9', item: 'Crown of Stars' }] }, turn(g, 'Marta hands you twenty gold.', calls));
    expect(g.world.placeId).toBe('emberfall');
    expect(g.s.gold).toBe(gold);
    expect(r.applied).toEqual([]);
    expect(r.skipped.join()).toMatch(/Crown of Stars/);
  });

  it('updates who is in the scene when people leave', () => {
    const g = newGame();
    g.goTo('gilded_anvil');
    g.setStage({ present: 'Marta' });
    applyFindings(g, { present: 'none' }, turn(g, 'Marta heads into the kitchen and leaves you alone.'));
    expect(g.publicState({ busy: false, mode: 'scripted', model: null }).scene?.present).toEqual([]);
  });

  it('changes nothing when the answer is not JSON, and skips fights and journeys', async () => {
    expect(parseFindings('No changes needed.')).toBeNull();
    const g = newGame();
    const before = JSON.stringify(g.s.world);
    const { dm, requests } = stubbed(() => ({ stop_reason: 'tool_use', content: [scene('Marta polishes a mug.')] }), 'Nothing to do.');
    await dm.respond(g, [{ player: 'Tester', text: 'Wait' }], async () => {});
    await dm.reconcile(g, async () => {});
    expect(JSON.stringify(g.s.world)).toBe(before);
    // A fight began in the reply: no check at all.
    await dm.respond(g, [{ player: 'Tester', text: 'Wait' }], async () => {});
    g.startEncounter([{ defId: 'giant_rat', count: 1 }], { source: 'story', context: 'test' });
    const asked = requests.length;
    await dm.reconcile(g, async () => {});
    expect(requests.length).toBe(asked);
  });

  it('tells the check what the DM already did, the clock, and who carries what', () => {
    const g = newGame();
    const t = turn(g, 'You talk for an hour.', [{ name: 'advance_time', input: { minutes: 60 } }], g.world.minutes - 60);
    const p = reconcilePrompt(g, t);
    expect(p).toMatch(/60 minutes were already added/);
    expect(p).toMatch(/- advance_time\(minutes=60\)/);
    expect(p).toMatch(/Brann \[pc\d+\]\. Wearing or wielding: .*main hand: Longsword/);
  });
});

describe('DM tools for travel, rest and gear', () => {
  it('travels, rests and equips through its own tools, and the check then has nothing to redo', async () => {
    const g = newGame();
    outsideTown(g);
    hero(g, 'Brann').hp = 2;
    const { dm } = stubbed((req) => {
      if (req.messages.length === 1) {
        return { stop_reason: 'tool_use', content: [
          use('a', 'travel_to', { place: 'gilded_anvil' }),
          use('b', 'rest', { kind: 'short' }),
          use('c', 'equip_item', { character_id: hero(g, 'Brann').id, item: 'spear' }),
        ] };
      }
      return { stop_reason: 'tool_use', content: [scene('You reach the Gilded Anvil, rest an hour by the fire, and Brann sets his spear against the table.')] };
    }, '{"place": "gilded_anvil", "rest": "short"}');
    await dm.respond(g, [{ player: 'Tester', text: 'To the tavern, then rest' }], async () => {});
    // The trip is only proposed: the party waits until the table confirms it.
    expect(g.world.placeId).toBeNull();
    expect(g.s.trip?.locationId).toBe('gilded_anvil');
    expect(g.confirmTrip('p1')).toBe(true);
    g.takeBeats();
    expect(g.world.placeId).toBe('gilded_anvil');
    expect(hero(g, 'Brann').hp).toBeGreaterThan(2);
    expect(hero(g, 'Brann').equipment.mainHand?.defId).toBe('spear');
    const rests = g.s.shortRestsLeft;
    await dm.reconcile(g, async () => {});
    expect(g.s.shortRestsLeft).toBe(rests);
  });
});
