// Recommended picks: what the creator's "recommended" buttons choose, and what the
// premade heroes are built from. A beginner can accept all of them and get a sound hero.
import { SKILLS } from './content';
import { STANDARD_ARRAY, applyFeat, classSpellList, initiateNeeds, spellOptions, startBuild, startGroups, type Build, type Draft } from './build';
import { OPTIONS, grantedChoices } from './classes';
import { BACKGROUNDS, CLASSES, CLASS_GUIDE, FEATS, ORIGIN_FEATS, SPECIES, kitsFor } from './rules';
import type { Abilities, AbilityKey, CharacterSpec, ClassId, FeatId, FeatPick } from './types';

const SKILL_ORDER = ['perception', 'stealth', 'insight', 'persuasion', 'athletics', 'investigation', 'survival', 'acrobatics', 'deception', 'arcana', 'medicine', ...Object.keys(SKILLS)];
const SPELL_ORDER = ['eldritch_blast', 'vicious_mockery', 'produce_flame', 'starry_wisp', 'fire_bolt', 'shocking_grasp', 'ray_of_frost', 'chill_touch', 'acid_splash', 'poison_spray', 'sacred_flame',
  'healing_word', 'cure_wounds', 'guiding_bolt', 'bless', 'shield', 'magic_missile', 'mage_armor', 'sleep', 'burning_hands', 'thunderwave', 'inflict_wounds', 'hex', 'hunters_mark',
  'faerie_fire', 'entangle', 'command', 'chromatic_orb', 'ice_knife', 'dissonant_whispers', 'hellish_rebuke', 'shield_of_faith', 'searing_smite',
  // Higher levels: the strongest fight-changers first.
  'spiritual_weapon', 'misty_step', 'hold_person', 'scorching_ray', 'shatter', 'moonbeam', 'aid', 'web', 'acid_arrow', 'flaming_sphere',
  'fireball', 'spirit_guardians', 'counterspell', 'hypnotic_pattern', 'haste', 'lightning_bolt', 'call_lightning', 'mass_healing_word', 'revivify', 'slow',
  'polymorph', 'banishment', 'greater_invisibility', 'wall_of_fire', 'ice_storm', 'death_ward', 'blight', 'conjure_woodland_beings',
  'hold_monster', 'cone_of_cold', 'synaptic_static', 'flame_strike', 'mass_cure_wounds', 'greater_restoration', 'raise_dead', 'cloudkill', 'insect_plague',
  'chain_lightning', 'heal', 'harm', 'disintegrate', 'circle_of_death', 'sunbeam', 'blade_barrier', 'conjure_fey', 'heroes_feast',
  'finger_of_death', 'fire_storm', 'divine_word', 'regenerate', 'resurrection', 'delayed_blast_fireball', 'prismatic_spray',
  'power_word_stun', 'sunburst', 'incendiary_cloud', 'dominate_monster', 'holy_aura', 'befuddlement',
  'meteor_swarm', 'power_word_kill', 'mass_heal', 'power_word_heal', 'foresight', 'wish'];
/** Spells in the order the recommended picks take them. */
export const recommendSpells = (ids: string[]) => [...ids].sort(byOrder(SPELL_ORDER));
const byOrder = (order: string[]) => (a: string, b: string) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999);

/** The origin feat recommended for a class, avoiding the one the background already gives. */
const FEAT_ORDER: Record<ClassId, FeatId[]> = {
  fighter: ['savage_attacker', 'alert', 'magic_initiate_cleric', 'skilled'],
  rogue: ['alert', 'skilled', 'magic_initiate_wizard', 'savage_attacker'],
  wizard: ['magic_initiate_wizard', 'alert', 'skilled', 'magic_initiate_cleric'],
  cleric: ['magic_initiate_wizard', 'alert', 'magic_initiate_cleric', 'skilled'],
  barbarian: ['savage_attacker', 'alert', 'skilled', 'magic_initiate_cleric'],
  bard: ['skilled', 'alert', 'magic_initiate_wizard', 'magic_initiate_cleric'],
  druid: ['magic_initiate_wizard', 'alert', 'skilled', 'magic_initiate_cleric'],
  monk: ['alert', 'savage_attacker', 'skilled', 'magic_initiate_cleric'],
  paladin: ['savage_attacker', 'alert', 'skilled', 'magic_initiate_cleric'],
  ranger: ['alert', 'savage_attacker', 'skilled', 'magic_initiate_cleric'],
  sorcerer: ['alert', 'magic_initiate_cleric', 'skilled', 'magic_initiate_wizard'],
  warlock: ['magic_initiate_wizard', 'alert', 'magic_initiate_cleric', 'skilled'],
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
    pick.abilities = !p0 ? [] : b.abilities[p0] % 2 === 1 && p1 && b.abilities[p1] % 2 === 1 ? [p0, p1] : b.abilities[p0] <= 18 ? [p0, p0] : [p0, p1 ?? p0];
  }
  else if (def.boost) {
    const cap = def.epic ? 30 : 20;
    const k = CLASS_GUIDE[b.classId].priority.find((x) => def.boost!.includes(x) && b.abilities[x] < cap) ?? def.boost.find((x) => b.abilities[x] < cap);
    pick.abilities = k ? [k] : [];
  }
  return pick;
}

/** The best feat to suggest at a level-up, with its sub-choices filled in. */
export function recommendFeat(b: Build, origin: boolean): FeatPick {
  if (!origin) {
    const top = CLASS_GUIDE[b.classId].priority[0];
    if (b.level >= 19) {
      const boon: FeatId = (['boon_combat_prowess', 'boon_spell_recall', 'boon_fate'] as FeatId[]).find((f) => FEATS[f].recommendedFor.includes(b.classId) && !b.feats.includes(f)) ?? 'boon_fate';
      if (!b.feats.includes(boon)) return { id: boon, abilities: [FEATS[boon].boost!.includes(top) ? top : FEATS[boon].boost![0]] };
    }
    return fillFeat(b, 'asi');
  }
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
    ...(d.look ? { look: d.look } : {}),
  };
  // A species that brings a skill of its own needs one left to bring: swap a class skill out of its way.
  if (sp.skillChoice && !keep.includes('skills') && sp.skillChoice.every((s) => bg.skills.includes(s) || out.skills.includes(s))) {
    const spare = cls.skillList.find((s) => !bg.skills.includes(s) && !out.skills.includes(s) && !sp.skillChoice!.includes(s));
    const i = out.skills.map((s) => sp.skillChoice!.includes(s)).lastIndexOf(true);
    if (spare && i >= 0) out.skills[i] = spare;
  }
  const granted = [...bg.skills, ...out.skills];
  if (sp.skillChoice) {
    const cur = kept('speciesSkill');
    out.speciesSkill = cur && sp.skillChoice.includes(cur) && !granted.includes(cur) ? cur : sp.skillChoice.filter((s) => !granted.includes(s)).sort(byOrder(SKILL_ORDER))[0];
    granted.push(out.speciesSkill);
  }
  const first = grantedChoices(cls.id, 1);
  if (first.expertise) out.expertise = kept('expertise') ?? [...(g.recExpertise ?? []), ...granted].filter((s, i, a) => a.indexOf(s) === i && granted.includes(s)).slice(0, first.expertise.count);
  if (first.style) out.fightingStyle = kept('fightingStyle') ?? g.recStyle ?? 'defense';
  const groups = startGroups(cls.id);
  if (groups.length) {
    out.classOptions = kept('classOptions') ?? groups.flatMap(([group, n]) => {
      const all = Object.values(OPTIONS).filter((o) => o.group === group && (o.minLevel ?? 1) <= 1 && !o.needs).map((o) => o.id);
      return [...(g.recOptions ?? []).filter((o) => all.includes(o)), ...all].filter((o, i, a) => a.indexOf(o) === i).slice(0, n);
    });
  }

  const b = startBuild(out, cls.id);
  const list = classSpellList(cls.id);
  if (list) {
    const pref = [...g.recSpells, ...SPELL_ORDER];
    const cantrips = spellOptions(b, list, 'cantrip').sort(byOrder(pref)).slice(0, cls.cantrips.pick);
    const spells = spellOptions(b, list, 'spell', 1).sort(byOrder(pref)).slice(0, cls.spellPicks);
    out.spells = kept('spells') ?? [...cantrips, ...spells];
    b.abilityIds.unshift(...out.spells);
  }
  // A kept Skilled talent is re-filled when the freshly recommended skills now overlap it.
  const fresh = (p: FeatPick): FeatPick => (p.id === 'skilled' && (p.skills ?? []).some((s) => b.skills.includes(s)) ? fillFeat(b, 'skilled') : p);
  const bgPick = kept('backgroundFeat') ? fresh({ id: bg.feat, ...d.backgroundFeat }) : fillFeat(b, bg.feat);
  out.backgroundFeat = { skills: bgPick.skills, spells: bgPick.spells };
  applyFeat(b, bgPick, true);
  const keptOrigin = kept('originFeat');
  if (sp.originFeat) out.originFeat = keptOrigin ? fresh(keptOrigin) : recommendFeat(b, true);
  return out;
}
