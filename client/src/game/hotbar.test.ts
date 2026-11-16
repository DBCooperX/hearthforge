import { describe, expect, it } from 'vitest';
import { HOTBAR_SLOTS, placeOnHotbar, removeFromHotbar, syncHotbar } from './hotbar';

describe('combat hotbar', () => {
  it('fills a fresh bar in order and leaves the rest empty', () => {
    const l = syncHotbar(null, ['ab:a', 'ab:b', 'ab:c']);
    expect(l.slots.length).toBe(HOTBAR_SLOTS);
    expect(l.slots.slice(0, 4)).toEqual(['ab:a', 'ab:b', 'ab:c', null]);
  });

  it('keeps the player\'s arrangement and does not bring back what they removed', () => {
    let l = syncHotbar(null, ['ab:a', 'ab:b', 'ab:c']);
    l = placeOnHotbar(l, 'ab:a', 5, 0);
    l = removeFromHotbar(l, 1);
    const again = syncHotbar(l, ['ab:a', 'ab:b', 'ab:c']);
    expect(again.slots[5]).toBe('ab:a');
    expect(again.slots).not.toContain('ab:b');
  });

  it('puts a newly learned spell into the first free slot and empties slots of lost ones', () => {
    const l = syncHotbar(null, ['ab:a', 'ab:b']);
    const next = syncHotbar(l, ['ab:b', 'ab:new']);
    expect(next.slots.slice(0, 3)).toEqual(['ab:new', 'ab:b', null]);
  });

  it('only places what is meant to be placed by itself', () => {
    const l = syncHotbar(null, ['ab:fight', 'ab:ritual'], ['ab:fight']);
    expect(l.slots).toContain('ab:fight');
    expect(l.slots).not.toContain('ab:ritual');
    expect(syncHotbar(l, ['ab:fight', 'ab:ritual'], ['ab:fight', 'ab:ritual']).slots).not.toContain('ab:ritual');
  });

  it('swaps two slots when one is dragged onto the other, and moves a spell dragged in from the book', () => {
    const l = syncHotbar(null, ['ab:a', 'ab:b']);
    expect(placeOnHotbar(l, 'ab:a', 1, 0).slots.slice(0, 2)).toEqual(['ab:b', 'ab:a']);
    const moved = placeOnHotbar(l, 'ab:a', 7);
    expect(moved.slots[0]).toBeNull();
    expect(moved.slots[7]).toBe('ab:a');
  });
});
