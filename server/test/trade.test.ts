import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../shared/content';
import { hasTranslation } from '../../shared/i18n';
import { SHOP_BLURBS, SHOP_KINDS, SHOP_NAMES, buyPrice, dealsIn, haggleMood, sellPrice } from '../../shared/trade';
import { SHELVES, rollStock, shopKindOf } from '../src/data/shops';
import { DM_TOOLS } from '../src/dm/claude';
import { DM_SYSTEM_PROMPT, describeWorld } from '../src/dm/context';
import { Game, GameError } from '../src/game/engine';
import { mulberry32 } from '../../shared/start';

/** A table in Emberfall with a rogue (p1) and a fighter (p2). `d20` fixes every die. */
function game(d20 = 0.5, lang: 'en' | 'de' = 'en') {
  const g = new Game('trade', () => d20);
  g.upsertPlayer('p1', 'Chris', true);
  g.upsertPlayer('p2', 'Mira', true);
  if (lang === 'de') g.setLanguage('p1', 'de');
  g.addCharacter('p1', 'rogue', 'Vex');
  g.addCharacter('p2', 'fighter', 'Brann');
  g.start('p1');
  g.takeBeats();
  return g;
}
const view = (g: Game) => g.publicState({ busy: false, mode: 'scripted', model: null });
const shop = (g: Game, kind: string) => g.shopsHere().find((s) => s.kind === kind)!;

describe('prices', () => {
  it('never lets the party sell for more than it paid', () => {
    for (const def of Object.values(ITEMS)) {
      for (const kind of SHOP_KINDS) {
        const best = { kind, markup: 0.9, mood: 2 as const };
        expect(sellPrice(def, best), `${def.id} at ${kind}`).toBeLessThanOrEqual(buyPrice(def, best));
        expect(buyPrice(def, best)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('pays half for a merchant\'s own trade and less for the rest', () => {
    const fair = { markup: 1, mood: 0 as const };
    expect(buyPrice(ITEMS.longsword, { kind: 'smith', ...fair })).toBe(15);
    expect(sellPrice(ITEMS.longsword, { kind: 'smith', ...fair })).toBe(7);
    expect(sellPrice(ITEMS.longsword, { kind: 'alchemist', ...fair })).toBe(4);
    expect(dealsIn('curio', ITEMS.ring_protection)).toBe(true);
    expect(dealsIn('general', ITEMS.ring_protection)).toBe(false);
    expect(buyPrice(ITEMS.potion_healing, { kind: 'alchemist', markup: 1, mood: 1 })).toBe(45);
    expect(buyPrice(ITEMS.potion_healing, { kind: 'alchemist', markup: 1, mood: -1 })).toBe(55);
    expect(sellPrice(ITEMS.potion_healing, { kind: 'alchemist', markup: 1, mood: 2 })).toBe(30);
    expect([haggleMood(18, 13), haggleMood(13, 13), haggleMood(12, 13), haggleMood(8, 13)]).toEqual([2, 1, 0, -1]);
  });
});

describe('stock', () => {
  it('only lists catalogue items, and is the same for the same seed', () => {
    for (const kind of SHOP_KINDS) {
      const shelf = SHELVES[kind];
      for (const id of [...shelf.staples, ...shelf.pool, ...shelf.rare].map((e) => e[0])) expect(ITEMS[id], `${kind}: ${id}`).toBeDefined();
      const a = rollStock(kind, mulberry32(5)), b = rollStock(kind, mulberry32(5));
      expect(a).toEqual(b);
      expect(a.length).toBeGreaterThan(2);
      expect(new Set(a.map((e) => e.defId)).size).toBe(a.length);
    }
    expect(rollStock('smith', mulberry32(1), 0.6).length).toBeLessThan(rollStock('smith', mulberry32(1)).length);
  });

  it('reads the kind of shop from the DM\'s words', () => {
    expect(shopKindOf('smith')).toBe('smith');
    expect(shopKindOf('Blacksmith and armourer')).toBe('smith');
    expect(shopKindOf('Apotheke')).toBe('alchemist');
    expect(shopKindOf('magic shop')).toBe('curio');
    expect(shopKindOf('travelling tinker')).toBe('peddler');
    expect(shopKindOf('Gemischtwarenhändler')).toBe('general');
    expect(shopKindOf('')).toBeNull();
    expect(shopKindOf('zzz')).toBeNull();
  });

  it('has German for every shop name and blurb', () => {
    for (const text of [...Object.values(SHOP_NAMES), ...Object.values(SHOP_BLURBS)]) expect(hasTranslation('de', text), text).toBe(true);
  });
});

describe('trading', () => {
  it('gives a town a general store, a smithy and an apothecary, also from the tavern', () => {
    const g = game();
    expect(g.shopsHere().map((s) => s.kind).sort()).toEqual(['alchemist', 'general', 'smith']);
    g.goTo('gilded_anvil');
    expect(view(g).shops.map((s) => s.name).sort()).toEqual(['Apothecary', 'General store', 'Smithy']);
    expect(view(g).shops.every((s) => s.stock.length > 2 && s.purse > 0 && s.restockIn === 3)).toBe(true);
  });

  it('names the shops in the table language', () => {
    expect(game(0.5, 'de').shopsHere().map((s) => s.name).sort()).toEqual(['Apotheke', 'Gemischtwarenladen', 'Schmiede']);
  });

  it('sells for the party\'s gold and puts the item in the buyer\'s bag', () => {
    const g = game();
    const [vex] = g.s.characters;
    const apo = shop(g, 'alchemist');
    const before = apo.stock.find((e) => e.defId === 'potion_healing')!.qty;
    const had = vex.bag.find((b) => b?.defId === 'potion_healing')?.qty ?? 0;
    g.s.gold = 120;
    g.buy('p1', vex.id, apo.id, 'potion_healing', 2);
    expect(g.s.gold).toBe(20);
    expect(apo.gold).toBe(350);
    expect(apo.stock.find((e) => e.defId === 'potion_healing')?.qty ?? 0).toBe(before - 2);
    expect(vex.bag.find((b) => b?.defId === 'potion_healing')?.qty).toBe(had + 2);
    expect(g.s.log[g.s.log.length - 1].text).toBe('Vex buys 2× Potion of Healing at Apothecary for 100 gp.');
    // Not enough gold, somebody else's hero, something not on the shelf.
    expect(() => g.buy('p1', vex.id, apo.id, 'potion_healing', 1)).toThrow(/only has 20 gp/);
    expect(() => g.buy('p1', g.s.characters[1].id, apo.id, 'antitoxin', 1)).toThrow(/another player/);
    expect(() => g.buy('p1', vex.id, apo.id, 'plate', 1)).toThrow(/sold out/);
    expect(() => g.buy('p1', vex.id, 'shop_nowhere', 'torch', 1)).toThrow(/not here/);
    expect(g.s.gold).toBe(20);
  });

  it('buys from the party, keeps what it bought on the shelf and runs out of gold', () => {
    const g = game();
    const [vex, brann] = g.s.characters;
    const smith = shop(g, 'smith');
    const at = (c: typeof vex, id: string) => ({ type: 'bag' as const, index: c.bag.findIndex((b) => b?.defId === id) });
    const gold = g.s.gold;
    g.sell('p1', vex.id, smith.id, at(vex, 'dagger'), 1);
    expect(g.s.gold).toBe(gold + 1);
    expect(smith.gold).toBe(399);
    expect(vex.bag.find((b) => b?.defId === 'dagger')?.qty ?? 0).toBeLessThan(2);
    // Worn armor can be sold too, and the hero's armor class follows.
    const ac = brann.ac;
    g.sell('p2', brann.id, smith.id, { type: 'slot', slot: 'armor' }, 1);
    expect(brann.equipment.armor).toBeNull();
    expect(brann.ac).toBeLessThan(ac);
    expect(smith.stock.some((e) => e.defId === 'chain_mail')).toBe(true);
    // A quest item stays; a worthless thing finds no buyer; a poor merchant cannot pay.
    const key = g.giveStoryItem({ characterId: vex.id, name: 'Cellar key', category: 'key', quest: true, value: 5 });
    expect(() => g.sell('p1', vex.id, smith.id, at(vex, key.item_id), 1)).toThrow(/quest item/);
    expect(() => g.sell('p1', vex.id, smith.id, at(vex, 'thieves_tools'), 1)).not.toThrow();
    g.grantItem(vex.id, 'torch', 1);
    expect(() => g.sell('p1', vex.id, smith.id, at(vex, 'torch'), 1)).toThrow(/Nobody here will pay/);
    smith.gold = 3;
    g.grantItem(vex.id, 'longsword', 1);
    expect(() => g.sell('p1', vex.id, smith.id, at(vex, 'longsword'), 1)).toThrow(/cannot afford/);
  });

  it('haggles once a day with a Persuasion check', () => {
    const good = game(0.95);
    const [vex] = good.s.characters;
    const store = shop(good, 'general');
    const r = good.haggle('p1', vex.id, store.id);
    expect(r).toMatchObject({ dc: 13, success: true, mood: 2 });
    expect(view(good).shops.find((s) => s.id === store.id)).toMatchObject({ mood: 2, haggled: true });
    expect(good.s.log.some((l) => l.roll?.label === 'Persuasion check')).toBe(true);
    expect(() => good.haggle('p1', vex.id, store.id)).toThrow(/already haggled/);
    good.s.gold = 100;
    good.buy('p1', vex.id, store.id, 'potion_healing', 1);
    expect(good.s.gold).toBe(60);
    // The next day the mood is gone and the party may try again.
    good.advanceTime(1440);
    expect(view(good).shops.find((s) => s.id === store.id)).toMatchObject({ mood: 0, haggled: false });

    const bad = game(0.01);
    const s2 = shop(bad, 'general');
    expect(bad.haggle('p1', bad.s.characters[0].id, s2.id).mood).toBe(-1);
    expect(buyPrice(ITEMS.potion_healing, s2)).toBe(55);
  });

  it('restocks every three days and keeps what the DM put on the shelf', () => {
    const g = game();
    const smith = shop(g, 'smith');
    g.openShop({ shop: smith.id, stock: 'longsword_plus1, Nonsense' });
    const first = JSON.stringify(smith.stock);
    g.s.gold = 1000;
    g.buy('p1', g.s.characters[0].id, smith.id, 'dagger', 1);
    g.advanceTime(1440 * 3);
    g.shopsHere();
    expect(smith.cycle).toBe(1);
    expect(smith.gold).toBe(400);
    expect(JSON.stringify(smith.stock)).not.toBe(first);
    expect(smith.stock.find((e) => e.defId === 'longsword_plus1')).toMatchObject({ qty: 1, keep: true });
  });

  it('closes shop in a fight, on the road and for a hostile keeper', () => {
    const g = game();
    const store = shop(g, 'general');
    const vex = g.s.characters[0];
    g.openShop({ merchant: 'Marta Kell', kind: 'general' });
    g.rememberNpc({ name: 'Marta Kell', disposition: 'hostile' });
    expect(() => g.buy('p1', vex.id, store.id, 'torch', 1)).toThrow(/will not trade/);
    g.rememberNpc({ name: 'Marta Kell', disposition: 'friendly' });
    g.startEncounter([{ defId: 'giant_rat', count: 1 }], { source: 'story', context: 'test' });
    expect(view(g).shops).toEqual([]);
    expect(view(g).tradeOffer).toBeNull();
    expect(() => g.buy('p1', vex.id, store.id, 'torch', 1)).toThrow(GameError);
  });

  it('loads a table saved before trading existed', () => {
    const g = game();
    const saved = JSON.parse(JSON.stringify(g.s));
    delete saved.shops; delete saved.tradeOffer;
    const loaded = new Game('trade', () => 0.5, saved);
    expect(loaded.shopsHere()).toHaveLength(3);
    expect(view(loaded).tradeOffer).toBeNull();
  });
});

describe("the Dungeon Master's shops", () => {
  it('adopts the town smithy for a named smith and opens the window', () => {
    const g = game();
    const out = g.openShop({ merchant: 'Marta Kell', shop: "Marta's Forge", kind: 'blacksmith', prices: 'cheap', stock: 'longsword_plus1', discount: 10 });
    expect(out).toMatchObject({ shop_id: 'shop_emberfall_smith', name: "Marta's Forge", kind: 'smith', created: false, merchant: 'Marta Kell' });
    expect(out.for_sale).toContain('Longsword +1: 405 gp');
    expect(g.shopsHere()).toHaveLength(3);
    expect(g.s.memory.npcs.find((n) => n.name === 'Marta Kell')?.locationId).toBe(g.place()!.id);
    expect(view(g).tradeOffer).toEqual({ shopId: 'shop_emberfall_smith', seq: 1 });
    // Asking again by merchant reopens the same shop and bumps the counter.
    expect(g.openShop({ merchant: 'Marta Kell' }).shop_id).toBe('shop_emberfall_smith');
    expect(view(g).tradeOffer?.seq).toBe(2);
    expect(describeWorld(g)).toMatch(/Shops here[\s\S]*Marta's Forge \[shop_emberfall_smith\], smith, kept by Marta Kell/);
  });

  it('sets up a new shop of another kind, and a peddler on the road who stays behind', () => {
    const g = game();
    const curio = g.openShop({ merchant: 'Old Fen', shop: 'The Cracked Lens', kind: 'curio' });
    expect(curio).toMatchObject({ created: true, kind: 'curio' });
    expect(g.shopsHere()).toHaveLength(4);
    // Out of town: walk one hex, meet a peddler, walk on.
    const w = g.world;
    w.placeId = null;
    const road = g.openShop({ merchant: '', shop: '', kind: '' });
    expect(road).toMatchObject({ kind: 'peddler', created: true, name: 'Travelling peddler' });
    expect(g.shopsHere().map((s) => s.kind)).toEqual(['peddler']);
    expect(g.s.shops[road.shop_id].markup).toBe(1.15);
    const next = [{ q: w.party.q + 1, r: w.party.r }, { q: w.party.q - 1, r: w.party.r }, { q: w.party.q, r: w.party.r + 1 }];
    const went = next.some((h) => { try { g.beginTravel(h.q, h.r); return true; } catch { return false; } });
    expect(went).toBe(true);
    expect(g.s.shops[road.shop_id]).toBeUndefined();
  });

  it('is a small, loose tool and is explained in the prompt', () => {
    const tool = DM_TOOLS.find((t) => t.name === 'open_shop')!;
    expect(tool.strict).toBeUndefined();
    expect(JSON.stringify(tool).length).toBeLessThan(2600);
    expect(JSON.stringify(tool)).not.toContain('enum');
    expect(DM_SYSTEM_PROMPT).toContain('call open_shop');
  });
});
