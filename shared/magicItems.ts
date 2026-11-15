// Magic items of the System Reference Document 5.2.1 (CC BY 4.0), built from the table in
// magicItemTable.ts and the imported names in srd/magic-items.json, plus +1 to +3 versions of
// every weapon, armor and shield of the catalogue. content.ts calls buildMagicItems with its
// catalogue, so this file never imports it.

import { MAGIC_ITEM_ROWS } from './magicItemTable';
import raw from './srd/magic-items.json';
import { SLOT_IDS, type AbilityKey, type ItemDef, type Rarity, type SlotId } from './types';

interface SrdItem { id: string; name: string; category: string; rarity: Rarity; attune?: boolean }
export const SRD_MAGIC_ITEMS = raw as unknown as Record<string, SrdItem>;

/** What a magic item costs by rarity, in gold. */
export const RARITY_VALUE: Record<Rarity, number> = { common: 100, uncommon: 400, rare: 4000, very_rare: 40000, legendary: 200000, artifact: 500000 };
/** Rarity of the plain +1, +2 and +3 weapons and shields (armor is one step rarer). */
const PLUS_RARITY: Rarity[] = ['uncommon', 'rare', 'very_rare'];

/** German names and texts of the table's items. */
export const MAGIC_ITEMS_DE: Record<string, string> = {};

/** The words of a spec, as `key → value` (a word without a colon maps to ''). */
function words(spec: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const w of spec.split(/\s+/).filter(Boolean)) {
    const i = w.indexOf(':');
    out.set(i < 0 ? w : w.slice(0, i), i < 0 ? '' : w.slice(i + 1));
  }
  return out;
}

/** The fixed sentence of a plain magic weapon, armor or shield. */
export const plusText = (kind: 'weapon' | 'armor' | 'shield', n: number) =>
  kind === 'weapon' ? `A magic weapon: +${n} to attack and damage rolls.` : kind === 'armor' ? `Magic armor: +${n} armor class.` : `A magic shield: +${n} armor class beyond the shield's own.`;

export const PLUS_TEXT_DE: Record<string, string> = Object.fromEntries([1, 2, 3].flatMap((n) => [
  [plusText('weapon', n), `Eine magische Waffe: +${n} auf Angriffs- und Schadenswürfe.`],
  [plusText('armor', n), `Magische Rüstung: +${n} Rüstungsklasse.`],
  [plusText('shield', n), `Ein magischer Schild: +${n} Rüstungsklasse über die des Schildes hinaus.`],
]));

/** A copy of a weapon, armor or shield of the catalogue with a magic bonus. */
function enchant(base: ItemDef, bonus: number, extra: Partial<ItemDef>): ItemDef {
  const def: ItemDef = { ...base, ...extra, base: base.id };
  if (base.weapon) def.weapon = { ...base.weapon, ...(bonus ? { bonus } : {}) };
  if (base.armor) def.armor = { ...base.armor, baseAc: base.armor.baseAc + bonus };
  if (base.kind === 'shield') def.acBonus = (base.acBonus ?? 2) + bonus;
  return def;
}

/**
 * Every magic item the game knows beyond the hand-made ones of the catalogue.
 * Items the table marks with alias: give their SRD id and attunement to the catalogue item instead.
 */
export function buildMagicItems(catalogue: Record<string, ItemDef>): ItemDef[] {
  const out: ItemDef[] = [];
  const have = (id: string) => !!catalogue[id] || out.some((d) => d.id === id);
  // Plain +1 to +3 gear, keeping the hand-made ones already in the catalogue.
  for (const base of Object.values(catalogue)) {
    if (!(base.weapon || base.armor || base.kind === 'shield') || base.rarity || base.story) continue;
    const kind = base.weapon ? 'weapon' : base.armor ? 'armor' : 'shield';
    for (let n = 1; n <= 3; n++) {
      const id = `${base.id}_plus${n}`;
      if (have(id)) continue;
      const rarity = kind === 'armor' ? (['rare', 'very_rare', 'legendary'] as Rarity[])[n - 1] : PLUS_RARITY[n - 1];
      out.push(enchant(base, n, { id, name: `${base.name} +${n}`, rarity, value: RARITY_VALUE[rarity] + base.value, description: plusText(kind, n) }));
    }
  }
  for (const [id, icon, de, spec, en, deText] of MAGIC_ITEM_ROWS) {
    const srd = SRD_MAGIC_ITEMS[id];
    if (!srd) throw new Error(`magic item ${id} is not in the SRD import`);
    const w = words(spec);
    MAGIC_ITEMS_DE[srd.name] = de;
    MAGIC_ITEMS_DE[en] = deText;
    if (w.has('no')) continue;
    if (w.has('alias')) {
      const c = catalogue[w.get('alias')!];
      if (!c) throw new Error(`magic item ${id}: no catalogue item ${w.get('alias')}`);
      c.srd = id;
      if (srd.attune) c.attune = true;
      continue;
    }
    const num = (k: string) => (w.has(k) ? Number(w.get(k)) : undefined);
    const props: Partial<ItemDef> = { id, name: srd.name, icon, description: en, rarity: srd.rarity, value: RARITY_VALUE[srd.rarity], srd: id };
    if (srd.attune) props.attune = true;
    if (w.has('ac')) props.acBonus = num('ac');
    if (w.has('save')) props.saveBonus = num('save');
    if (w.has('resist')) props.resist = w.get('resist')!.split(',');
    if (w.has('speed')) props.speed = num('speed');
    if (w.has('unarmored')) props.unarmored = num('unarmored');
    if (w.has('dv')) props.darkvision = num('dv');
    for (const [k, v] of w) {
      if (k !== 'set') continue;
      const [abil, score] = v.split(':');
      props.scores = { ...props.scores, [abil as AbilityKey]: Number(score) };
    }
    if (w.has('casts')) {
      const [spell, level, charges] = w.get('casts')!.split(':');
      props.casts = { spell, level: Number(level), charges: Number(charges) };
    }
    const bonus = num('bonus') ?? 0;
    let def: ItemDef;
    const baseOf = (k: string) => {
      const b = catalogue[w.get(k)!];
      if (!b) throw new Error(`magic item ${id}: no catalogue item ${w.get(k)}`);
      return b;
    };
    if (w.has('weapon')) {
      def = enchant(baseOf('weapon'), bonus, props);
      const [dice, type] = (w.get('extra') ?? '').split(':');
      if (dice) def.weapon!.extra = { dice, type };
      const [vtype, vdice] = (w.get('vs') ?? '').split(':');
      if (vtype) def.weapon!.vs = { type: vtype, dice: vdice };
    } else if (w.has('armor')) def = enchant(baseOf('armor'), bonus, props);
    else if (w.has('shield')) def = enchant(catalogue.shield, bonus, props);
    else if (w.has('heal') || w.has('buff') || w.has('temp')) {
      def = { ...props, kind: 'consumable', weight: 0.5, stackable: true, consumable: { ...(w.has('heal') ? { heal: w.get('heal') } : {}), ...(w.has('buff') ? { buff: w.get('buff') } : {}), ...(w.has('temp') ? { temp: num('temp') } : {}) } } as ItemDef;
    } else {
      const slot = w.get('slot') as SlotId | undefined;
      if (slot && !(SLOT_IDS as readonly string[]).includes(slot)) throw new Error(`magic item ${id}: bad slot ${slot}`);
      def = { ...props, kind: slot || props.casts ? 'wondrous' : 'misc', weight: 1, ...(slot ? { slot } : {}) } as ItemDef;
    }
    def.value = RARITY_VALUE[srd.rarity] + (w.has('weapon') || w.has('armor') ? baseOf(w.has('weapon') ? 'weapon' : 'armor').value : 0);
    out.push(def);
  }
  return out;
}

/** German for "<item> +n", from the German of the item. */
export const plusName = (name: string): [base: string, n: string] | null => {
  const m = /^(.+) \+([1-3])$/.exec(name);
  return m ? [m[1], m[2]] : null;
};
