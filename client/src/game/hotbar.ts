// The combat hotbar: which spells, features and wands sit in which slot, per hero. The player
// arranges it by dragging; the layout is remembered in this browser. Pure functions here, so the
// rules (new spells find a free slot, removed ones stay away) can be tested without a browser.

/** Slots on the hotbar: two rows of ten. The first row answers to the keys 1 to 0. */
export const HOTBAR_SLOTS = 20;
export const HOTBAR_ROW = 10;

/** What a slot holds: "ab:<ability id>" for a spell or feature, "item:<uid>" for a wand or staff. */
export type SlotRef = string;

export interface HotbarLayout {
  slots: (SlotRef | null)[];
  /** Everything this hero has had on offer so far. Something new is placed once; after that the player decides. */
  seen: SlotRef[];
}

export const abilityRef = (id: string): SlotRef => `ab:${id}`;
export const itemRef = (uid: string): SlotRef => `item:${uid}`;
export function parseRef(ref: SlotRef): { kind: 'ab' | 'item'; id: string } | null {
  const m = /^(ab|item):(.+)$/.exec(ref);
  return m ? { kind: m[1] as 'ab' | 'item', id: m[2] } : null;
}

const empty = (): (SlotRef | null)[] => Array.from({ length: HOTBAR_SLOTS }, () => null);

/**
 * Bring a stored layout up to date with what the hero can use now. Slots whose spell is gone
 * (a spell swapped at level-up, a wand sold) are emptied; anything new goes into the first free
 * slot, unless the bar is full, in which case it waits in the spellbook. Only `autoPlace` is placed by
 * itself; the rest of `available` (spells that take minutes to cast) waits until the player drags it in.
 */
export function syncHotbar(stored: HotbarLayout | null, available: SlotRef[], autoPlace: SlotRef[] = available): HotbarLayout {
  const have = new Set(available);
  const slots = empty();
  (stored?.slots ?? []).slice(0, HOTBAR_SLOTS).forEach((r, i) => { slots[i] = r && have.has(r) ? r : null; });
  const seen = new Set(stored?.seen ?? []);
  const placed = new Set(slots.filter(Boolean));
  for (const r of autoPlace) {
    if (!have.has(r) || seen.has(r) || placed.has(r)) continue;
    const free = slots.indexOf(null);
    if (free < 0) break;
    slots[free] = r;
    placed.add(r);
  }
  return { slots, seen: [...new Set([...seen, ...available])] };
}

/** Put `ref` into slot `to`. When it came from slot `from`, the two swap places; otherwise whatever was there is pushed off. */
export function placeOnHotbar(layout: HotbarLayout, ref: SlotRef, to: number, from?: number): HotbarLayout {
  const slots = [...layout.slots];
  if (to < 0 || to >= slots.length) return layout;
  const was = slots.indexOf(ref);
  if (from !== undefined && from >= 0 && from < slots.length) {
    [slots[from], slots[to]] = [slots[to], ref];
  } else {
    if (was >= 0) slots[was] = null;
    slots[to] = ref;
  }
  return { ...layout, slots };
}

export function removeFromHotbar(layout: HotbarLayout, index: number): HotbarLayout {
  const slots = [...layout.slots];
  slots[index] = null;
  return { ...layout, slots };
}

const KEY = (heroId: string) => `hearthforge.hotbar.${heroId}`;

export function loadHotbar(heroId: string): HotbarLayout | null {
  try {
    const raw = localStorage.getItem(KEY(heroId));
    if (!raw) return null;
    const v = JSON.parse(raw) as HotbarLayout;
    return Array.isArray(v.slots) && Array.isArray(v.seen) ? v : null;
  } catch {
    return null;
  }
}

export function saveHotbar(heroId: string, layout: HotbarLayout) {
  try { localStorage.setItem(KEY(heroId), JSON.stringify(layout)); } catch { /* private window: lasts this visit */ }
}

/** The drag type for a spell, feature or wand dragged onto the hotbar, from the spellbook, the sheet or another slot. */
export const HOTBAR_DRAG = 'application/x-hearthforge-hotbar';
export interface HotbarDrag { ref: SlotRef; from?: number }
