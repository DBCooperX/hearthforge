// A suggested action may carry the skill it would likely test, as "[Persuasion] Convince Hendrick".
// The tag is split off: the chip shows the skill's icon and the hero's bonus, never a DC, and the
// player still decides what to do. The Dungeon Master still decides whether a roll is needed.
import { abilityMod, type Character } from './types';
import { SKILLS as SKILL_ABILITY } from './content';
import { DE } from './i18n-de';

const BY_NAME = new Map<string, string>();
for (const skill of Object.keys(SKILL_ABILITY)) {
  BY_NAME.set(skill, skill);
  const de = DE[skill];
  if (de) BY_NAME.set(de.toLowerCase(), skill);
}

/** The text of a suggested action without its tag, and the skill the tag names (null when none or unknown). */
export function parseActionTag(raw: string): { text: string; skill: string | null } {
  const m = /^\s*([[(])([^\])]{2,30})[\])]\s*[:\-–]?\s*(.+)$/.exec(raw);
  if (!m) return { text: raw.trim(), skill: null };
  const skill = BY_NAME.get(m[2].trim().toLowerCase()) ?? null;
  // "(quietly) slip past" is part of the action; only a skill in round brackets is a tag.
  if (!skill && m[1] === '(') return { text: raw.trim(), skill: null };
  return { text: m[3].trim(), skill };
}

/** A hero's bonus for a skill check: the ability modifier, plus proficiency (doubled with expertise). */
export function skillBonus(c: Pick<Character, 'abilities' | 'skills' | 'expertise' | 'profBonus'>, skill: string): number {
  const ability = SKILL_ABILITY[skill];
  if (!ability) return 0;
  const prof = c.skills.includes(skill) ? c.profBonus * (c.expertise.includes(skill) ? 2 : 1) : 0;
  return abilityMod(c.abilities[ability]) + prof;
}
