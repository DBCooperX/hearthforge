// Recommended picks: what the creator's "recommended" buttons choose, and what the
// premade heroes are built from. A beginner can accept all of them and get a sound hero.
import { SKILLS } from './content';
import { STANDARD_ARRAY, applyFeat, classSpellList, initiateNeeds, spellOptions, startBuild, type Build, type Draft } from './build';
import { BACKGROUNDS, CLASSES, CLASS_GUIDE, FEATS, ORIGIN_FEATS, SPECIES, kitsFor } from './rules';
import type { Abilities, AbilityKey, CharacterSpec, ClassId, FeatId, FeatPick } from './types';

const SKILL_ORDER = ['perception', 'stealth', 'insight', 'persuasion', 'athletics', 'investigation', 'survival', 'acrobatics', 'deception', 'arcana', 'medicine', ...Object.keys(SKILLS)];
const SPELL_ORDER = ['fire_bolt', 'shocking_grasp', 'ray_of_frost', 'chill_touch', 'acid_splash', 'poison_spray', 'sacred_flame',
  'healing_word', 'cure_wounds', 'guiding_bolt', 'inflict_wounds', 'magic_missile', 'mage_armor', 'burning_hands', 'thunderwave', 'shatter', 'acid_arrow'];
const byOrder = (order: string[]) => (a: string, b: string) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999);

/** The origin feat recommended for a class, avoiding the one the background already gives. */
const FEAT_ORDER: Record<ClassId, FeatId[]> = {
  fighter: ['savage_attacker', 'alert', 'magic_initiate_cleric', 'skilled'],
  rogue: ['alert', 'skilled', 'magic_initiate_wizard', 'savage_attacker'],
  wizard: ['magic_initiate_wizard', 'alert', 'skilled', 'magic_initiate_cleric'],
  cleric: ['magic_initiate_wizard', 'alert', 'magic_initiate_cleric', 'skilled'],
};

/** Recommended sub-choices for a feat on this hero. */
export function fillFeat(b: Build, id: FeatId): FeatPick {
  const def = FEATS[id];
  const pick: FeatPick = { id };
  if (id === 'skilled') pick.skills = SKILL_ORDER.filter((s, i, a) => a.indexOf(s) === i && !b.skills.includes(s)).slice(0, 3);
  if (def.spellList) {
    const need = initiateNeeds(b, def.spellList);
    pick.spells = [...need.cantrips.sort(byOrder(SPELL_ORDER)).slice(0, need.needCantrip), ...need.spells.sort(byOrder(SPELL_ORDER)).slice(0, need.needSpell)];
  }
  if (id === 'asi') {
    const [p0, p1] = CLASS_GUIDE[b.classId].priority.filter((k) => b.abilities[k] < 20);
    pick.abilities = b.abilities[p0] % 2 === 1 && p1 && b.abilities[p1] % 2 === 1 ? [p0, p1] : b.abilities[p0] <= 18 ? [p0, p0] : [p0, p1 ?? p0];
  }
  return pick;
}

/** The best feat to suggest at a level-up, with its sub-choices filled in. */
export function recommendFeat(b: Build, origin: boolean): FeatPick {
  if (!origin) return fillFeat(b, 'asi');
  const id = FEAT_ORDER[b.classId].find((f) => ORIGIN_FEATS.includes(f) && !b.feats.includes(f)) ?? 'alert';
  return fillFeat(b, id);
}

/** The standard array laid out by the class's ability priority. */
export function recommendedArray(classId: ClassId): Abilities {
  const out = {} as Abilities;
  CLASS_GUIDE[classId].priority.forEach((k, i) => { out[k] = STANDARD_ARRAY[i]; });
  return out;
}

/** Background increases that suit the class: round the best odd score up and put the rest where it helps. */
export function recommendedBoosts(classId: ClassId, base: Abilities, allowed: AbilityKey[]): AbilityKey[] {
  const order = CLASS_GUIDE[classId].priority.filter((k) => allowed.includes(k));
  const [a, b] = order;
  return base[a] % 2 === 1 ? [a, b, b] : [a, a, b];
}

/**
 * Complete a draft with recommended picks. Anything listed in `keep` that the draft already
 * has is left alone; everything else is chosen to suit the class.
 */
export function recommend(d: Draft & { classId: ClassId }, keep: (keyof CharacterSpec)[] = ['speciesId', 'backgroundId', 'name', 'gender', 'appearance', 'backstory', 'method', 'base', 'premadeId']): CharacterSpec {
  const g = CLASS_GUIDE[d.classId], cls = CLASSES[d.classId];
  const kept = <K extends keyof CharacterSpec>(k: K): CharacterSpec[K] | undefined => (keep.includes(k) ? (d[k] as CharacterSpec[K] | undefined) : undefined);
  const speciesId = kept('speciesId') ?? g.recSpecies;
  const backgroundId = kept('backgroundId') ?? g.recBackground;
  const sp = SPECIES[speciesId], bg = BACKGROUNDS[backgroundId];
  const method = kept('method') ?? 'array';
  const base = kept('base') ?? recommendedArray(d.classId);
  const out: CharacterSpec = {
    name: kept('name') ?? '', gender: kept('gender') ?? 'neutral', speciesId, classId: d.classId, backgroundId, method, base,
    boosts: kept('boosts') ?? recommendedBoosts(d.classId, base, bg.abilities),
    skills: kept('skills') ?? [...g.recSkills, ...cls.skillList].filter((s, i, a) => a.indexOf(s) === i && cls.skillList.includes(s) && !bg.skills.includes(s)).slice(0, cls.skillCount),
    spells: [], kit: kept('kit') ?? (kitsFor(d.classId).some((k) => k.id === g.recKit) ? g.recKit : kitsFor(d.classId)[0].id),
    appearance: kept('appearance') ?? '', backstory: kept('backstory') ?? '',
    ...(d.premadeId && keep.includes('premadeId') ? { premadeId: d.premadeId } : {}),
  };
  const granted = [...bg.skills, ...out.skills];
  if (sp.skillChoice) {
    const cur = kept('speciesSkill');
    out.speciesSkill = cur && sp.skillChoice.includes(cur) && !granted.includes(cur) ? cur : sp.skillChoice.filter((s) => !granted.includes(s)).sort(byOrder(SKILL_ORDER))[0];
    granted.push(out.speciesSkill);
  }
  if (cls.id === 'rogue') out.expertise = kept('expertise') ?? [...(g.recExpertise ?? []), ...granted].filter((s, i, a) => a.indexOf(s) === i && granted.includes(s)).slice(0, 2);
  if (cls.id === 'fighter') out.fightingStyle = kept('fightingStyle') ?? g.recStyle;

  const b = startBuild(out, cls.id);
  const list = classSpellList(cls.id);
  if (list) {
    const pref = [...g.recSpells, ...SPELL_ORDER];
    const cantrips = spellOptions(b, list, 'cantrip').sort(byOrder(pref)).slice(0, cls.cantrips.pick);
    const spells = spellOptions(b, list, 'spell', 1).sort(byOrder(pref)).slice(0, cls.spellPicks);
    out.spells = kept('spells') ?? [...cantrips, ...spells];
    b.abilityIds.unshift(...out.spells);
  }
  const bgPick = kept('backgroundFeat') ? { id: bg.feat, ...d.backgroundFeat } : fillFeat(b, bg.feat);
  out.backgroundFeat = { skills: bgPick.skills, spells: bgPick.spells };
  applyFeat(b, bgPick, true);
  if (sp.originFeat) out.originFeat = kept('originFeat') ?? recommendFeat(b, true);
  return out;
}
