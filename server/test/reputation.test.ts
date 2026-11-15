import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../shared/content';
import { TROPHIES } from '../../shared/achievements';
import { FACTIONS, MAX_PER_DAY, shiftDisposition, tierOf } from '../../shared/reputation';
import { buyPrice } from '../../shared/trade';
import { DM_TOOLS } from '../src/dm/claude';
import { DM_SYSTEM_PROMPT, describeWorld } from '../src/dm/context';
import { Game, GameError } from '../src/game/engine';
import { makeFactions, reaches } from '../src/game/reputation';

function game(lang: 'en' | 'de' = 'en', d20 = 0.5) {
  const g = new Game('rep', () => d20);
  g.upsertPlayer('p1', 'Chris', true);
  if (lang === 'de') g.setLanguage('p1', 'de');
  g.addCharacter('p1', 'rogue', 'Vex');
  g.start('p1');
  g.takeBeats();
  return g;
}
const view = (g: Game) => g.publicState({ busy: false, mode: 'scripted', model: null });
const faction = (g: Game, id: string) => g.s.factions.find((f) => f.id === id)!;

describe('factions', () => {
  it('gives every region the same four factions, named by its seed', () => {
    const ids = (xs: { id: string }[]) => xs.map((f) => f.id);
    expect(ids(makeFactions('ABC', 'en', false))).toEqual(FACTIONS.map((f) => f.id));
    expect(makeFactions('ABC', 'en', false)).toEqual(makeFactions('ABC', 'en', false));
    expect(makeFactions('ABC', 'en', true).map((f) => f.name)).toEqual(["Folk and Watch", "Traders' Guild", 'Shrine-Keepers', 'The Underhand']);
    expect(makeFactions('ABC', 'de', true)[1].name).toBe('Händlergilde');
    const names = new Set(Array.from({ length: 30 }, (_, i) => makeFactions(`S${i}`, 'en', false)[0].name));
    expect(names.size).toBeGreaterThan(1);
  });

  it('starts at neutral in the state the players see, in the table language', () => {
    const g = game('de');
    expect(view(g).factions.map((f) => [f.standing, f.tier])).toEqual(Array(4).fill([0, 'neutral']));
    expect(view(g).factions[0].blurb).toContain('Bauern');
    expect(view(game()).factions[0].name).toBe('Folk and Watch');
  });

  it('keeps old saves working', () => {
    const g = game();
    const saved = JSON.parse(JSON.stringify(g.s));
    delete saved.factions; delete saved.achievements; delete saved.stats; delete saved.memory.rumours;
    const loaded = new Game('rep', () => 0.5, saved);
    expect(loaded.s.factions).toHaveLength(4);
    expect(loaded.s.memory.rumours).toEqual([]);
    expect(loaded.s.stats.fights).toBe(0);
  });

  it('names the tiers and moves attitudes one step per tier', () => {
    expect([-100, -60, -59, -20, -19, 0, 19, 20, 59, 60, 100].map(tierOf)).toEqual(['hated', 'hated', 'distrusted', 'distrusted', 'neutral', 'neutral', 'neutral', 'liked', 'liked', 'honoured', 'honoured']);
    expect(shiftDisposition('neutral', 'hated')).toBe('hostile');
    expect(shiftDisposition('wary', 'liked')).toBe('neutral');
    expect(shiftDisposition('friendly', 'honoured')).toBe('friendly');
    expect(shiftDisposition('neutral', 'neutral')).toBe('neutral');
  });
});

describe('changing standing', () => {
  it('clamps one change, a day, and the whole scale, and says so in the log', () => {
    const g = game();
    expect(g.adjustStanding({ faction: 'commons', change: 50, reason: 'saved the town' })).toMatchObject({ applied: 12, standing: 12 });
    expect(g.s.log.at(-1)!.text).toBe('Standing with Folk and Watch: +12 (saved the town).');
    g.adjustStanding({ faction: 'Folk and Watch', change: 12, reason: 'again' });
    expect(g.s.log.at(-1)!.text).toContain('Now liked.');
    const third = g.adjustStanding({ faction: 'folk', change: 12, reason: 'and again' });
    expect(third.applied).toBe(MAX_PER_DAY - 24);
    expect(third.note).toMatch(/one day/);
    // A loss the same day is allowed, and the next day the budget is fresh.
    expect(g.adjustStanding({ faction: 'commons', change: -5, reason: 'oops' }).applied).toBe(-5);
    g.advanceTime(24 * 60);
    expect(g.adjustStanding({ faction: 'commons', change: 12, reason: 'next day' }).applied).toBe(12);
    for (let day = 0; day < 20; day++) { g.advanceTime(24 * 60); g.adjustStanding({ faction: 'commons', change: 12, reason: 'x' }); }
    expect(faction(g, 'commons').standing).toBe(100);
    expect(() => g.adjustStanding({ faction: 'nobody', change: 3, reason: '' })).toThrow(GameError);
    expect(() => g.adjustStanding({ faction: 'guild', change: 0, reason: '' })).toThrow(GameError);
  });

  it('rewards finished quests and punishes failed ones', () => {
    const g = game();
    const quest = g.s.memory.quests[0];
    g.setQuest({ id: quest.id, status: 'completed' });
    expect(faction(g, 'commons').standing).toBe(6);
    g.setQuest({ title: 'Doomed errand' });
    g.setQuest({ title: 'Doomed errand', status: 'failed' });
    expect(faction(g, 'commons').standing).toBe(2);
  });

  it('is written in the German log at a German table', () => {
    const g = game('de');
    g.adjustStanding({ faction: 'guild', change: 8, reason: 'ehrliche Preise' });
    expect(g.s.log.at(-1)!.text).toBe('Ansehen bei Händlergilde: +8 (ehrliche Preise).');
  });
});

describe('what standing does', () => {
  const smith = (g: Game) => g.shopsHere().find((s) => s.kind === 'smith')!;

  it('moves prices in every shop by the traders\' guild opinion, the same for buying and for the shop view', () => {
    const g = game();
    const sh = smith(g);
    const fair = buyPrice(ITEMS.chain_shirt, g.priced(sh));
    expect(fair).toBe(50);
    g.adjustStanding({ faction: 'guild', change: 12, reason: 'a' });
    g.advanceTime(1440); g.adjustStanding({ faction: 'guild', change: 12, reason: 'b' });
    g.advanceTime(1440); g.adjustStanding({ faction: 'guild', change: 12, reason: 'c' });
    expect(tierOf(faction(g, 'guild').standing)).toBe('liked');
    const view1 = view(g).shops.find((s) => s.id === sh.id)!;
    expect(view1.factor).toBe(0.95);
    expect(buyPrice(ITEMS.chain_shirt, view1)).toBe(buyPrice(ITEMS.chain_shirt, g.priced(sh)));
    expect(buyPrice(ITEMS.chain_shirt, view1)).toBeLessThan(fair);
    g.s.factions.find((f) => f.id === 'guild')!.standing = -70;
    expect(buyPrice(ITEMS.chain_shirt, g.priced(smith(g)))).toBe(63);
    expect(view(g).shops.find((s) => s.id === sh.id)!.factor).toBe(1.25);
  });

  it('makes a merchant refuse the party when their trade hates it, and not before', () => {
    const g = game();
    const sh = smith(g);
    sh.npcId = g.rememberNpc({ name: 'Gerda Ironhand', locationId: g.place()!.id }).id;
    g.s.gold = 500;
    const vex = g.s.characters[0];
    g.buy('p1', vex.id, sh.id, sh.stock[0].defId, 1);
    faction(g, 'guild').standing = -40; // distrusted: neutral becomes wary, still trading
    expect(view(g).shops.find((s) => s.id === sh.id)!.disposition).toBe('wary');
    g.buy('p1', vex.id, sh.id, sh.stock[0].defId, 1);
    faction(g, 'guild').standing = -80; // hated: neutral becomes hostile
    expect(() => g.buy('p1', vex.id, sh.id, sh.stock[0].defId, 1)).toThrow(/will not trade/);
    expect(describeWorld(g)).toContain('hostile (was neutral; Traders\' Guild think hated of the party)');
  });

  it('gives a little goodwill for steady custom, but only up to a point', () => {
    const g = game();
    const sh = g.shopsHere().find((s) => s.kind === 'alchemist')!;
    g.s.gold = 2000;
    const vex = g.s.characters[0];
    g.buy('p1', vex.id, sh.id, 'potion_healing', 2);
    expect(faction(g, 'guild').standing).toBe(1);
    expect(g.s.stats.trades).toBe(1);
  });
});

describe('rumours', () => {
  it('start with what the party did, spread a few hexes a day, and are heard on request', () => {
    const g = game();
    g.recordDeed('The party drove the goblins out of the Rat-Gnawed Storeroom.');
    const [r] = g.s.memory.rumours;
    expect(r).toMatchObject({ aboutParty: true, heard: null, day: 1 });
    expect(r.at).toEqual({ q: g.place()!.q, r: g.place()!.r });
    expect(reaches(r, r.at, 1)).toBe(true);
    const far = { q: r.at.q + 7, r: r.at.r };
    expect(reaches(r, far, 1)).toBe(false);
    expect(reaches(r, far, 3)).toBe(false);
    expect(reaches(r, far, 4)).toBe(true);
    expect(reaches(r, far, 40)).toBe(false); // gone stale
    expect(describeWorld(g)).toContain(`[${r.id}] The party drove the goblins out`);
    expect(view(g).rumours).toEqual([]);
    g.hearRumour(r.id);
    expect(view(g).rumours).toMatchObject([{ id: r.id, heard: 1, aboutParty: true }]);
    expect(g.s.stats.heard).toBe(1);
    g.hearRumour(r.id);
    expect(g.s.stats.heard).toBe(1);
    expect(() => g.hearRumour('r999')).toThrow(/Nobody here/);
  });

  it('lets the Dungeon Master loose gossip that the party hears at once or not', () => {
    const g = game();
    expect(g.startRumour('They say the reeve pays smugglers.', false, true)).toMatchObject({ text: 'They say the reeve pays smugglers.' });
    g.startRumour('They say the reeve pays smugglers.', false, true); // the same words are one rumour
    g.startRumour('A grey wolf was seen on the north road.', false, false);
    expect(g.s.memory.rumours).toHaveLength(2);
    expect(view(g).rumours.map((x) => x.text)).toEqual(['They say the reeve pays smugglers.']);
    expect(() => g.startRumour('   ', false, false)).toThrow(GameError);
    for (let i = 0; i < 40; i++) g.startRumour(`Rumour number ${i}`, false, false);
    expect(g.s.memory.rumours).toHaveLength(30);
  });

  it('does not reach a place with nobody in it to repeat it', () => {
    const g = game();
    g.startRumour('Something at the shrine.', false, false);
    g.s.world!.placeId = null;
    expect(describeWorld(g)).not.toContain('Rumours going round here');
  });
});

describe('trophies', () => {
  it('are earned once, when their goal is reached, and shown with progress', () => {
    const g = game();
    g.checkTrophies();
    expect(g.s.achievements.map((a) => a.id)).toEqual([]);
    g.s.stats.fights = 1;
    g.s.gold = 650;
    expect(g.checkTrophies().sort()).toEqual(['deep_pockets', 'first_blood']);
    expect(g.checkTrophies()).toEqual([]);
    expect(g.s.log.at(-1)!.text).toMatch(/^🏆 Trophy earned: /);
    const t = view(g).trophies;
    expect(t).toHaveLength(TROPHIES.length);
    expect(t.find((x) => x.id === 'battle_hardened')).toEqual({ id: 'battle_hardened', day: null, have: 1 });
    expect(t.find((x) => x.id === 'first_blood')?.day).toBe(1);
  });

  it('count fights from the story beats and read standing off the factions', () => {
    const g = game();
    g.beats.push({ kind: 'combat_end', boss: true, rewards: '' }, { kind: 'rescued' });
    g.takeBeats();
    faction(g, 'faith').standing = 75;
    faction(g, 'outlaws').standing = -61;
    expect(g.checkTrophies().sort()).toEqual(['down_not_out', 'first_blood', 'friend_of_the_people', 'giant_slayer', 'notorious']);
  });

  it('are named in German at a German table', () => {
    const g = game('de');
    g.s.stats.fights = 1;
    g.checkTrophies();
    expect(g.s.log.at(-1)!.text).toBe('🏆 Trophäe errungen: Erstes Blut');
  });
});

describe('the Dungeon Master', () => {
  it('has the tools and the instructions, and sees where the party stands', () => {
    for (const name of ['change_standing', 'rumour']) expect(DM_TOOLS.find((t) => t.name === name)?.strict, name).toBeUndefined();
    expect(DM_SYSTEM_PROMPT).toContain('call change_standing');
    expect(DM_SYSTEM_PROMPT).toContain('action "heard"');
    const world = describeWorld(game());
    expect(world).toContain("Standing with the factions of the region");
    expect(world).toContain("Traders' Guild [guild]: 0, neutral");
  });
});
