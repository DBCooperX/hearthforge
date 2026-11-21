import { describe, expect, it } from 'vitest';
import { Game, GameError } from '../src/game/engine';

const ROOM = Array.from({ length: 13 }, (_, y) => (y === 0 || y === 12 ? '#'.repeat(22) : `#${'.'.repeat(20)}#`));

function rogueDuel() {
  const g = new Game('test', () => 0.5);
  g.upsertPlayer('p1', 'Tester', true);
  g.addCharacter('p1', 'rogue', '');
  g.addCharacter('p1', 'wizard', '');
  g.start();
  const rogue = g.s.characters[0];
  const add = (id: string, qty = 1) => (g as unknown as { addToBag(c: unknown, id: string, qty: number): boolean }).addToBag(rogue, id, qty);
  return { g, rogue, add };
}

describe('two-weapon fighting', () => {
  it('lets a light weapon into the off hand only beside another light weapon', () => {
    const { g, rogue, add } = rogueDuel();
    add('dagger'); add('shortsword');
    const at = (id: string) => rogue.bag.findIndex((b) => b?.defId === id);
    // The rapier is not light, so nothing goes into the off hand yet.
    expect(() => g.invMove('p1', rogue.id, { type: 'bag', index: at('dagger') }, { type: 'slot', slot: 'offHand' })).toThrow(GameError);
    g.invMove('p1', rogue.id, { type: 'bag', index: at('shortsword') }, { type: 'slot', slot: 'mainHand' });
    g.invMove('p1', rogue.id, { type: 'bag', index: at('dagger') }, { type: 'slot', slot: 'offHand' });
    expect(rogue.equipment.mainHand?.defId).toBe('shortsword');
    expect(rogue.equipment.offHand?.defId).toBe('dagger');
    // A heavy weapon never goes there.
    expect(() => g.invMove('p1', rogue.id, { type: 'bag', index: at('rapier') }, { type: 'slot', slot: 'offHand' })).toThrow(GameError);
    // Swapping the main hand to a heavy weapon sends the off-hand weapon back to the bag.
    g.invMove('p1', rogue.id, { type: 'bag', index: at('rapier') }, { type: 'slot', slot: 'mainHand' });
    expect(rogue.equipment.offHand).toBeNull();
    expect(rogue.bag.some((b) => b?.defId === 'dagger')).toBe(true);
  });

  it('allows an off-hand attack as a bonus action after attacking, without the ability modifier', () => {
    const { g, rogue, add } = rogueDuel();
    add('dagger'); add('shortsword');
    const at = (id: string) => rogue.bag.findIndex((b) => b?.defId === id);
    g.invMove('p1', rogue.id, { type: 'bag', index: at('shortsword') }, { type: 'slot', slot: 'mainHand' });
    g.invMove('p1', rogue.id, { type: 'bag', index: at('dagger') }, { type: 'slot', slot: 'offHand' });
    g.startEncounter([{ defId: 'ogre', count: 1 }], { source: 'story', context: 'test', setting: 'dungeon', light: 'bright' });
    g.s.rows = [...ROOM];
    g.s.lights = [];
    const m = g.s.monsters[0];
    rogue.x = 5; rogue.y = 6; m.x = 6; m.y = 6;
    m.hp = m.maxHp = 2000;
    const combat = g.s.combat!;
    combat.turnIndex = combat.order.findIndex((o) => o.id === rogue.id);
    Object.assign(combat, { actionUsed: false, bonusUsed: false, attacksLeft: 0, attacked: false, once: [] });
    expect(() => g.offhandAttack('p1', rogue.id, m.id)).toThrow(/main hand first/);
    g.attack('p1', rogue.id, m.id);
    const before = m.hp;
    g.offhandAttack('p1', rogue.id, m.id);
    expect(combat.bonusUsed).toBe(true);
    expect(m.hp).toBeLessThanOrEqual(before);
    expect(() => g.offhandAttack('p1', rogue.id, m.id)).toThrow(/Bonus action/);
  });
});

describe('splitting stacks', () => {
  it('hands over part of a stack and splits it inside the bag', () => {
    const { g, rogue, add } = rogueDuel();
    const wizard = g.s.characters[1];
    add('torch', 5);
    const at = () => rogue.bag.findIndex((b) => b?.defId === 'torch');
    const had = wizard.bag.reduce((n, b) => n + (b?.defId === 'torch' ? b.qty : 0), 0);
    const total = rogue.bag[at()]!.qty;
    g.give('p1', rogue.id, { type: 'bag', index: at() }, wizard.id, 2);
    expect(rogue.bag[at()]!.qty).toBe(total - 2);
    expect(wizard.bag.reduce((n, b) => n + (b?.defId === 'torch' ? b.qty : 0), 0)).toBe(had + 2);
    const free = rogue.bag.findIndex((b) => !b);
    g.invMove('p1', rogue.id, { type: 'bag', index: at() }, { type: 'bag', index: free }, 1);
    expect(rogue.bag[free]).toMatchObject({ defId: 'torch', qty: 1 });
    expect(() => g.invMove('p1', rogue.id, { type: 'bag', index: at() }, { type: 'bag', index: rogue.bag.findIndex((b) => !b) }, total)).toThrow(GameError);
  });
});
