import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../shared/content';
import { arrangeBag, carriedWeight, carryCapacity, diceAverage, equipPreview, itemGroup, itemWeight } from '../../shared/inventory';
import type { Character, ItemDef, ItemInstance } from '../../shared/types';

const inst = (defId: string, qty = 1): ItemInstance => ({ uid: `${defId}-${qty}`, defId, qty });
const empty = { head: null, amulet: null, armor: null, cloak: null, mainHand: null, offHand: null, ring: null, boots: null };
const fighter = {
  classId: 'fighter', profBonus: 2, feats: [] as string[], conditions: [] as string[],
  abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 },
  equipment: { ...empty, armor: inst('chain_mail'), mainHand: inst('longsword'), offHand: inst('shield') },
  bag: [inst('potion_healing', 3), null, inst('longsword_plus1'), inst('torch', 2)],
} as unknown as Character;

const splinter: ItemDef = {
  id: 'story_splinter', name: 'Notched Bone Splinter', kind: 'misc', icon: '🦴', description: '', value: 0,
  story: { category: 'clue', quest: true, baseId: null, foundDay: 1, foundAt: null, notes: [], imageId: null },
};
const oddDagger: ItemDef = { ...ITEMS.dagger, id: 'story_dagger', name: 'Strange Dagger', weight: undefined, story: { ...splinter.story!, quest: false, category: 'weapon', baseId: 'dagger' } };

describe('inventory', () => {
  it('weighs what a hero wears and carries', () => {
    expect(itemWeight(ITEMS.chain_mail)).toBe(55);
    expect(itemWeight(oddDagger)).toBe(1);
    expect(itemWeight(splinter)).toBe(0);
    // chain mail 55 + longsword 3 + shield 6 + three potions 1.5 + longsword 3 + two torches 2
    expect(carriedWeight(fighter)).toBe(70.5);
    expect(carryCapacity(fighter)).toBe(240);
  });

  it('gives every catalogue item a weight', () => {
    for (const def of Object.values(ITEMS)) expect(def.weight, def.id).toBeTypeOf('number');
  });

  it('groups items for the filters', () => {
    expect(itemGroup(ITEMS.longsword)).toBe('weapon');
    expect(itemGroup(ITEMS.shield)).toBe('armor');
    expect(itemGroup(ITEMS.ring_protection)).toBe('armor');
    expect(itemGroup(ITEMS.potion_healing)).toBe('consumable');
    expect(itemGroup(ITEMS.torch)).toBe('other');
    expect(itemGroup(splinter)).toBe('quest');
  });

  it('filters and sorts the backpack without losing where things really are', () => {
    const story = { [splinter.id]: splinter };
    const bag = [...fighter.bag, inst(splinter.id)];
    expect(arrangeBag(bag, story, 'all', 'manual').map((e) => e.index)).toEqual([0, 2, 3, 4]);
    expect(arrangeBag(bag, story, 'weapon', 'manual').map((e) => e.def.id)).toEqual(['longsword_plus1']);
    expect(arrangeBag(bag, story, 'all', 'type').map((e) => e.def.id)).toEqual([splinter.id, 'longsword_plus1', 'potion_healing', 'torch']);
    expect(arrangeBag(bag, story, 'all', 'value').map((e) => e.def.id)[0]).toBe('longsword_plus1');
    expect(arrangeBag(bag, story, 'all', 'name').map((e) => e.def.name)).toEqual(['Longsword +1', 'Notched Bone Splinter', 'Potion of Healing', 'Torch']);
    expect(arrangeBag(bag, story, 'all', 'rarity').find((e) => e.def.id === 'longsword_plus1')!.index).toBe(2);
  });

  it('averages dice', () => {
    expect(diceAverage('1d8')).toBe(4.5);
    expect(diceAverage('2d6+3')).toBe(10);
    expect(diceAverage('1d4-1')).toBe(1.5);
    expect(diceAverage('4')).toBe(4);
  });

  it('previews what equipping an item changes', () => {
    const better = equipPreview(fighter, ITEMS.longsword_plus1)!;
    expect(better.slot).toBe('mainHand');
    expect(better.usable).toBe(true);
    expect(better.replaces?.id).toBe('longsword');
    expect(better.changes).toEqual([{ stat: 'toHit', now: 5, then: 6 }, { stat: 'damage', now: 7.5, then: 8.5 }]);

    const lighter = equipPreview(fighter, ITEMS.leather)!;
    expect(lighter.changes).toEqual([{ stat: 'ac', now: 18, then: 14 }]);

    expect(equipPreview(fighter, ITEMS.longsword)!.changes).toEqual([]);
    expect(equipPreview(fighter, ITEMS.torch)).toBeNull();
    expect(equipPreview({ ...fighter, classId: 'wizard' } as Character, ITEMS.chain_mail)!.usable).toBe(false);
  });
});
