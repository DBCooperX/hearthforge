import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../shared/content';
import { CATEGORY_ICONS, ITEM_ICON_IDS, ITEM_ICONS, itemDef, pickIcon } from '../../shared/items';
import { hasTranslation } from '../../shared/i18n';
import { BAG_SIZE, ITEM_CATEGORIES } from '../../shared/types';
import { ClaudeDM, DM_TOOLS } from '../src/dm/claude';
import { describeWorld } from '../src/dm/context';
import { Game } from '../src/game/engine';

function game(lang: 'en' | 'de' = 'en') {
  let seed = 7;
  const g = new Game('items', () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; });
  g.upsertPlayer('p1', 'Tester', true);
  if (lang === 'de') g.setLanguage('p1', 'de');
  g.addCharacter('p1', 'rogue', 'Elowen');
  g.addCharacter('p1', 'fighter', 'Lerroth');
  g.start();
  g.takeBeats();
  return g;
}

describe('story item icons', () => {
  it("uses the DM's pick, then keywords in either language, then the category", () => {
    expect(pickIcon('key', 'Odd thing', '', 'trinket')).toBe(ITEM_ICONS.key);
    expect(pickIcon('auto', 'Knochensplitter', 'Winzige Kerben.', 'clue')).toBe('🦴');
    expect(pickIcon('auto', 'Sealed letter', '', 'document')).toBe('✉️');
    expect(pickIcon(undefined, 'Verknotete Schnur', '', 'trinket')).toBe('🪢');
    // Short keywords only match whole words: "ei" (egg) is not found inside "Seil".
    expect(pickIcon('auto', 'Seil', '', 'tool')).toBe('🪢');
    expect(pickIcon('auto', 'Thing', 'It was wrapped around a goblin tooth.', 'trinket')).toBe('🦷');
    expect(pickIcon('auto', 'Whatsit', 'Nobody knows.', 'clue')).toBe(CATEGORY_ICONS.clue);
    expect(ITEM_ICON_IDS[0]).toBe('auto');
    expect(new Set(ITEM_ICON_IDS).size).toBe(ITEM_ICON_IDS.length);
    for (const c of ITEM_CATEGORIES) { expect(CATEGORY_ICONS[c]).toBeTruthy(); expect(hasTranslation('de', c), c).toBe(true); }
  });
});

describe('story items', () => {
  it('puts a thing the DM invents into the backpack, in the table language', () => {
    const g = game('de');
    const [elowen, lerroth] = g.s.characters;
    const got = g.giveStoryItem({ characterId: elowen.id, name: 'Knochensplitter', description: 'Ein Splitter mit winzigen Kerben, an einer verknoteten Schnur.', category: 'clue', icon: 'auto', quest: true, value: 0, quantity: 1, baseItemId: 'none', note: 'Vom Hals einer toten Ratte im Schilf.' });
    expect(got).toMatchObject({ character: 'Elowen', item: 'Knochensplitter', created: true, quest_item: true });
    const def = itemDef(g.s.items, got.item_id)!;
    expect(def).toMatchObject({ kind: 'misc', icon: '🦴', value: 0, story: { category: 'clue', quest: true, baseId: null, imageId: null, foundDay: 1 } });
    expect(def.story!.foundAt).toBe(g.place()!.name);
    expect(def.story!.notes.map((n) => n.text)).toEqual(['Vom Hals einer toten Ratte im Schilf.']);
    expect(elowen.bag.some((b) => b?.defId === def.id)).toBe(true);
    expect(g.s.log[g.s.log.length - 1].text).toBe('Elowen erhält Knochensplitter.');
    // The players' view carries the definition, and the DM is told what the party holds.
    expect(g.publicState({ busy: false, mode: 'scripted', model: null }).items[def.id].name).toBe('Knochensplitter');
    expect(describeWorld(g)).toMatch(/Story items the party carries[\s\S]*Knochensplitter \[story_knochensplitter\], clue, quest item, carried by Elowen/);

    // Learning more adds notes; quest items resist being taken until the DM insists.
    g.updateStoryItem({ item: 'knochensplitter', note: 'Marta erkennt Goblin-Zählkerben.' });
    expect(def.story!.notes).toHaveLength(2);
    expect(() => g.takeItem({ item: 'Knochensplitter' })).toThrow(/quest item/);
    expect(() => g.takeItem({ characterId: lerroth.id, item: 'Knochensplitter', allowQuest: true })).toThrow(/has no/);
    // Heroes can still pass it between themselves.
    const from = { type: 'bag' as const, index: elowen.bag.findIndex((b) => b?.defId === def.id) };
    g.give('p1', elowen.id, from, lerroth.id);
    expect(lerroth.bag.some((b) => b?.defId === def.id)).toBe(true);
    expect(g.takeItem({ item: def.id, allowQuest: true })).toMatchObject({ character: 'Lerroth', removed: 1, left: 0 });
    expect(g.heldStoryItems()).toHaveLength(0);
    // The definition stays, so the story can still refer to it.
    expect(g.s.items[def.id]).toBeTruthy();
    expect(() => g.updateStoryItem({ item: 'Nonsense' })).toThrow(/No story item/);
  });

  it('borrows its rules from the catalogue and cannot be overpowered', () => {
    const g = game();
    const [rogue, fighter] = g.s.characters;
    const cleaver = g.giveStoryItem({ characterId: fighter.id, name: 'Orcish cleaver', description: 'Heavy and notched.', category: 'weapon', icon: 'axe', rarity: 'rare', value: 99999, baseItemId: 'handaxe' });
    const def = g.s.items[cleaver.item_id];
    expect(def).toMatchObject({ kind: 'weapon', weapon: ITEMS.handaxe.weapon, value: 500, rarity: 'rare', icon: '🪓' });
    expect(def.story!.baseId).toBe('handaxe');
    // It equips like the weapon it is based on.
    g.useItem('p1', fighter.id, fighter.bag.find((b) => b?.defId === def.id)!.uid);
    expect(fighter.equipment.mainHand?.defId).toBe(def.id);
    expect(() => g.giveStoryItem({ characterId: rogue.id, name: 'Sword of doom', baseItemId: 'vorpal' })).toThrow(/Unknown base item/);
    expect(() => g.giveStoryItem({ characterId: rogue.id, name: '  ' })).toThrow(/needs a name/);

    // A draught based on the healing potion heals like one, and stacks.
    const brew = g.giveStoryItem({ characterId: rogue.id, name: "Marta's bitter draught", category: 'consumable', baseItemId: 'potion_healing', quantity: 2 });
    expect(brew.quantity).toBe(2);
    g.giveStoryItem({ characterId: rogue.id, name: "marta's bitter draught", quantity: 1 });
    expect(rogue.bag.find((b) => b?.defId === brew.item_id)!.qty).toBe(3);
    rogue.hp = 1;
    g.useItem('p1', rogue.id, rogue.bag.find((b) => b?.defId === brew.item_id)!.uid);
    expect(rogue.hp).toBeGreaterThan(1);
    expect(g.takeItem({ characterId: rogue.id, item: brew.item_id, quantity: 9 })).toMatchObject({ removed: 2, left: 0 });

    // A catalogue name hands out the catalogue item; catalogue items can be taken too.
    const torches = rogue.bag.find((b) => b?.defId === 'torch')?.qty ?? 0;
    expect(g.giveStoryItem({ characterId: rogue.id, name: 'Torch', quantity: 2 })).toMatchObject({ item: 'Torch' });
    expect(Object.keys(g.s.items)).toHaveLength(2);
    expect(g.takeItem({ characterId: rogue.id, item: 'torch' }).left).toBe(torches + 1);
  });

  it('finds room with a friend when a backpack is full, and survives a save', () => {
    const g = game();
    const [rogue, fighter] = g.s.characters;
    for (let i = 0; i < BAG_SIZE; i++) rogue.bag[i] ??= { uid: `fill${i}`, defId: 'dagger', qty: 1 };
    expect(g.giveStoryItem({ characterId: rogue.id, name: 'Brass key', category: 'key' }).character).toBe(fighter.name);
    for (let i = 0; i < BAG_SIZE; i++) fighter.bag[i] ??= { uid: `full${i}`, defId: 'dagger', qty: 1 };
    expect(() => g.giveStoryItem({ characterId: rogue.id, name: 'Wax seal', category: 'clue' })).toThrow(/bag is full/);
    expect(g.s.items.story_wax_seal).toBeUndefined();
    const view = { busy: false, mode: 'scripted' as const, model: null };
    const saved = JSON.parse(JSON.stringify(g.s));
    expect(new Game('items', Math.random, saved).publicState(view)).toEqual(g.publicState(view));
    // Saves from before story items load with an empty set.
    delete saved.items;
    expect(new Game('items', Math.random, saved).s.items).toEqual({});
  });
});

describe('Dungeon Master item tools', () => {
  it('creates, annotates and removes story items through tool calls', async () => {
    const g = game();
    const hero = g.s.characters[0];
    const dm = new ClaudeDM({ models: { background: 'b', standard: 's', key: 'k', forced: null }, effort: 'low', apiKey: 'test' });
    const requests: any[] = [];
    const use = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input });
    (dm as any).client = { beta: { messages: { create: async (req: any) => {
      requests.push(JSON.parse(JSON.stringify(req)));
      if (req.messages.length === 1) {
        return { stop_reason: 'tool_use', content: [
          use('a', 'give_story_item', { character_id: hero.id, name: 'Notched bone splinter', description: 'A sliver of bone with tiny notches.', category: 'clue', icon: 'bone', rarity: 'common', value: 0, quantity: 1, quest_item: true, base_item: 'none', note: 'Taken from a dead rat in the reeds.' }),
          use('b', 'update_story_item', { item: 'Notched bone splinter', name: '', description: '', note: 'The notches are goblin tally marks.', quest_item: 'unchanged' }),
          use('c', 'take_item', { character_id: '', item: 'Notched bone splinter', quantity: 1, allow_quest_item: false }),
        ] };
      }
      return { stop_reason: 'tool_use', content: [use('s', 'scene', { title: 'In the reeds', mood: 'mystery', narration: 'You pocket the Notched bone splinter.', suggested_actions: [], journal_entry: '', important: false })] };
    } } } };
    const scene = await dm.respond(g, [{ player: 'Tester', text: 'I take the splinter' }], async () => {});
    expect(scene?.text).toMatch(/splinter/);
    const names = requests[0].tools.map((t: any) => t.name);
    expect(names).toEqual(expect.arrayContaining(['give_story_item', 'update_story_item', 'take_item']));
    // Loose tools add nothing to the strict grammar; the cap keeps the tool list (and its cached prefix) from creeping.
    expect(requests[0].tools.length).toBeLessThanOrEqual(25);
    expect(requests[0].tools.every((t: any) => t.input_schema.additionalProperties === false && t.input_schema.required.length === Object.keys(t.input_schema.properties).length)).toBe(true);
    expect(requests[0].system[0].text).toMatch(/give_story_item/);
    expect(requests[1].messages[2].content.map((r: any) => !!r.is_error)).toEqual([false, false, true]);
    const def = g.s.items.story_notched_bone_splinter;
    expect(def.story!.notes).toHaveLength(2);
    expect(hero.bag.some((b) => b?.defId === def.id)).toBe(true);
    // In a fight the DM cannot hand out items.
    g.startEncounter([{ defId: 'giant_rat', count: 2 }], { source: 'story', context: 'test' });
    await dm.respond(g, [{ player: 'Tester', text: 'hello' }], async () => {});
    expect(requests[requests.length - 1].tools.map((t: any) => t.name)).toEqual(['skill_check', 'scene']);
  });
});

describe('strict tool schemas', () => {
  // The API compiles all strict tools of a request into one grammar and answers
  // "400 The compiled grammar is too large" when it outgrows a limit that is not published.
  // Adding the three item tools as strict crossed it. Anything added later should be a
  // looseTool, or be tried against the live API before this list or the budgets change.
  const ACCEPTED = ['advance_time', 'award_xp', 'change_gold', 'create_location', 'delve', 'give_item', 'monster_action', 'move_to_place', 'record_deed', 'remember_npc', 'scene', 'skill_check', 'update_quest'];

  it('keeps the strict set to the tools that were strict before the item tools', () => {
    const strict = DM_TOOLS.filter((t) => t.strict);
    expect(strict.map((t) => t.name).sort()).toEqual(ACCEPTED);
    for (const name of ['give_story_item', 'update_story_item', 'take_item', 'start_combat']) expect(DM_TOOLS.find((t) => t.name === name)?.strict, name).toBeUndefined();
  });

  it('does not let the strict schemas grow unnoticed', () => {
    const strict = DM_TOOLS.filter((t) => t.strict);
    const enumValues = (node: unknown): number => {
      if (!node || typeof node !== 'object') return 0;
      if (Array.isArray(node)) return node.reduce((n: number, x) => n + enumValues(x), 0);
      return Object.entries(node).reduce((n, [k, v]) => n + (k === 'enum' && Array.isArray(v) ? v.length : enumValues(v)), 0);
    };
    const params = strict.reduce((n, t) => n + Object.keys((t.input_schema as any).properties).length, 0);
    // Currently 44 parameters and 66 enum values; the room above that is for new monsters and biomes.
    // Item ids are plain strings checked by the engine, so the catalogue can grow freely.
    expect(params).toBeLessThanOrEqual(44);
    expect(enumValues(strict.map((t) => t.input_schema))).toBeLessThanOrEqual(80);
    expect(JSON.stringify(DM_TOOLS)).not.toContain('"longsword_plus1"');
    // Creature ids and look changes are plain strings too, so restyling monsters adds nothing to the grammar.
    expect(enumValues(DM_TOOLS.find((t) => t.name === 'start_combat')!.input_schema)).toBe(0);
  });

  it('drops strict and carries on if the API still refuses the grammar', async () => {
    const g = game();
    const dm = new ClaudeDM({ models: { background: 'b', standard: 's', key: 'k', forced: null }, effort: 'low', apiKey: 'test' });
    const requests: any[] = [];
    (dm as any).client = { beta: { messages: { create: async (req: any) => {
      requests.push(JSON.parse(JSON.stringify(req)));
      if (req.tools.some((t: any) => t.strict)) throw new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"The compiled grammar is too large, which would cause performance issues."}}');
      return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 's', name: 'scene', input: { title: 'T', mood: 'calm', narration: 'Still here.', suggested_actions: [], journal_entry: '', important: false } }] };
    } } } };
    expect((await dm.respond(g, [{ player: 'Tester', text: 'hello' }], async () => {}))?.text).toBe('Still here.');
    expect(requests).toHaveLength(2);
    await dm.respond(g, [{ player: 'Tester', text: 'again' }], async () => {});
    // It remembers, so later turns do not pay for a failed request first.
    expect(requests).toHaveLength(3);
    expect(requests[2].tools.some((t: any) => t.strict)).toBe(false);
  });

  it('survives loose arguments the model may get wrong', () => {
    const g = game();
    const hero = g.s.characters[0];
    const got = g.giveStoryItem({ characterId: hero.id, name: 'Odd coin', category: 'nonsense' as any, icon: 'nope', rarity: 'legendary', value: NaN, quantity: NaN, baseItemId: 'none' });
    expect(g.s.items[got.item_id]).toMatchObject({ icon: '🪙', value: 0, story: { category: 'trinket' } });
    expect(got.quantity).toBe(1);
  });
});
