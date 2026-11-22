// Companions: people of the story who travel with the party. Each is built from one of these SRD stat blocks.
import type { CompanionStance } from './types';

export interface CompanionTemplate {
  /** Id of the SRD creature in the monster catalogue whose numbers they use. */
  id: string;
  /** Catalogue weapons the stat block carries: the first is held, the rest go in the backpack. */
  kit: string[];
  /** How they fight when the Dungeon Master does not say. */
  stance: CompanionStance;
}

/**
 * The stat blocks a companion can have, weakest first. Only people without spells, so that the server can play them
 * with weapon attacks alone. Their weapons are the nearest the item catalogue has (a dagger for the commoner's club,
 * a light crossbow for the tough's heavy one).
 */
export const COMPANION_TEMPLATES: CompanionTemplate[] = [
  { id: 'commoner', kit: ['dagger'], stance: 'back' },
  { id: 'noble', kit: ['rapier'], stance: 'back' },
  { id: 'guard', kit: ['spear'], stance: 'guard' },
  { id: 'warrior_infantry', kit: ['spear'], stance: 'fight' },
  { id: 'bandit', kit: ['scimitar', 'light_crossbow'], stance: 'fight' },
  { id: 'priest_acolyte', kit: ['mace'], stance: 'guard' },
  { id: 'scout', kit: ['longbow', 'shortsword'], stance: 'guard' },
  { id: 'tough', kit: ['mace', 'light_crossbow'], stance: 'fight' },
  { id: 'spy', kit: ['shortsword'], stance: 'guard' },
  { id: 'warrior_veteran', kit: ['greatsword'], stance: 'fight' },
  { id: 'knight', kit: ['greatsword'], stance: 'fight' },
];

export const COMPANION_TEMPLATE_IDS = COMPANION_TEMPLATES.map((t) => t.id);

/** A template by id or by a loose name: "Guard", "warrior infantry", "Wache" when the German name is passed in. */
export function companionTemplate(ref: string, names: Record<string, string[]> = {}): CompanionTemplate | null {
  const k = ref.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!k) return null;
  return COMPANION_TEMPLATES.find((t) => t.id === k || (names[t.id] ?? []).some((n) => n.toLowerCase().replace(/[\s-]+/g, '_') === k)) ?? null;
}

/** A stance from loose words: the three ids, and what a Dungeon Master is likely to write instead. */
export function parseStance(raw: unknown): CompanionStance | null {
  const k = String(raw ?? '').trim().toLowerCase();
  if (!k) return null;
  if (['fight', 'attack', 'engage', 'aggressive', 'front'].includes(k)) return 'fight';
  if (['guard', 'defend', 'protect', 'support', 'follow'].includes(k)) return 'guard';
  if (['back', 'keep back', 'keep_back', 'stay back', 'hide', 'flee', 'retreat', 'passive', 'none'].includes(k)) return 'back';
  return null;
}
