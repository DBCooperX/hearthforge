// Turns the choices of the character creator into a character sheet. The browser uses it
// for the live preview and the server uses the very same code to build the hero, so what
// the preview shows is what the player gets.
import { ABILITIES, ITEMS, SKILLS } from './content';
import { BEAST_FORMS, GROUPS, OPTIONS, grantedChoices, hasFeature, manaFor, martialDie, optionLine } from './classes';
import { BACKGROUNDS, CLASSES, FEATS, KITS, SPECIES, SPELL_LISTS, STYLES, effectLine, maxSpellLevel, type L } from './rules';
import { abilityMod, type Abilities, type AbilityKey, type CharacterSpec, type ClassId, type FeatPick, type ItemDef, type SlotId } from './types';

const L = (en: string, de: string): L => ({ en, de });
const KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const POINT_BUDGET = 27;
export const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const MAX_SCORE = 20;

export const pointsSpent = (a: Abilities) => KEYS.reduce((sum, k) => sum + (POINT_COST[a[k]] ?? Infinity), 0);
const sameSet = (a: number[], b: number[]) => a.length === b.length && [...a].sort((x, y) => x - y).join() === [...b].sort((x, y) => x - y).join();

export type StepId = 'species' | 'class' | 'background' | 'abilities' | 'skills' | 'talents' | 'equipment' | 'identity';
export interface Problem { step: StepId; text: L }
export type Draft = Partial<CharacterSpec>;

/** The parts of a hero that feats and spell choices change. A Character and a preview Sheet both fit. */
export interface Build {
  classId: ClassId;
  level: number;
  abilities: Abilities;
  maxHp: number;
  hp: number;
  maxMana: number;
  mana: number;
  skills: string[];
  abilityIds: string[];
  feats: string[];
  features: string[];
  /** Class options chosen so far: a Divine Order, invocations, metamagic. */
  options?: string[];
}

export interface Sheet extends Build {
  profBonus: number;
  ac: number;
  speed: number;
  initiative: number;
  expertise: string[];
  saves: AbilityKey[];
  resist: string[];
  equipment: Partial<Record<SlotId, string>>;
  bag: { id: string; qty: number }[];
  gold: number;
  attack: { name: string; bonus: number; damage: string; type: string } | null;
  spell: { ability: AbilityKey; attack: number; dc: number } | null;
}

/** The ability a hero casts with: the class's, or the best mental one for spells from a species or feat. */
export function castingAbility(c: { classId: ClassId; abilities: Abilities }): AbilityKey {
  const own = CLASSES[c.classId]?.castingAbility;
  if (own) return own;
  return (['int', 'wis', 'cha'] as AbilityKey[]).reduce((best, k) => (c.abilities[k] > c.abilities[best] ? k : best), 'int' as AbilityKey);
}

type Who = { classId: ClassId; options?: string[] };

export function isProficient(who: ClassId | Who, def: ItemDef): boolean {
  const c: Who = typeof who === 'string' ? { classId: who } : who;
  const cls = CLASSES[c.classId];
  const has = (o: string) => !!c.options?.includes(o);
  const martial = has('order_protector') || has('primal_warden');
  if (def.kind === 'weapon') {
    return cls.weaponProf.includes(def.weapon!.category) || martial || (has('inv_blade') && !def.weapon!.ranged)
      || !!cls.weaponProfIds?.some((id) => (def.story?.baseId ?? def.id).startsWith(id));
  }
  if (def.kind === 'armor') return cls.armorProf.includes(def.armor!.category) || (def.armor!.category === 'heavy' && has('order_protector')) || (def.armor!.category === 'medium' && has('primal_warden'));
  if (def.kind === 'shield') return cls.armorProf.includes('shield');
  return true;
}

type Wearer = { abilities: Abilities; feats: string[]; conditions?: string[]; classId?: ClassId; level?: number; options?: string[]; form?: string | null };

/** Armor class from what is worn, plus the Defense style, Mage Armor and the unarmored defenses of some classes. */
export function armorClass(c: Wearer, worn: Partial<Record<SlotId, ItemDef | null | undefined>>): number {
  if (c.form && BEAST_FORMS[c.form]) return BEAST_FORMS[c.form].ac;
  const dex = abilityMod(c.abilities.dex);
  const armor = worn.armor?.armor;
  let ac: number;
  if (armor) ac = armor.baseAc + (armor.dexCap === null ? dex : Math.min(dex, armor.dexCap));
  else {
    const who = c.classId ? { classId: c.classId, level: c.level ?? 1 } : null;
    const shield = Object.values(worn).some((d) => d?.kind === 'shield');
    ac = 10 + dex;
    if (c.conditions?.includes('mage armor') || c.options?.includes('inv_armor')) ac = 13 + dex;
    if (who?.classId === 'barbarian' && hasFeature(who, 'unarmored_defense')) ac = Math.max(ac, 10 + dex + abilityMod(c.abilities.con));
    if (who?.classId === 'monk' && hasFeature(who, 'unarmored_defense') && !shield) ac = Math.max(ac, 10 + dex + abilityMod(c.abilities.wis));
    if (who && hasFeature(who, 'draconic_resilience')) ac = Math.max(ac, 10 + dex + abilityMod(c.abilities.cha));
  }
  for (const def of Object.values(worn)) ac += def?.acBonus ?? 0;
  // Bracers of Defense, Robe of the Archmagi: only with no armor and no shield.
  if (!armor && !Object.values(worn).some((d) => d?.kind === 'shield')) for (const def of Object.values(worn)) ac += def?.unarmored ?? 0;
  if (armor && c.feats.includes('style_defense')) ac += 1;
  return ac;
}

/** Weapons a monk fights with as if they were fists: simple melee weapons, and the light blades monks train with. */
export const isMonkWeapon = (def: ItemDef) => !!def.weapon && !def.weapon.ranged && !def.weapon.twoHanded
  && (def.weapon.category === 'simple' || ['shortsword', 'scimitar'].some((id) => (def.story?.baseId ?? def.id).startsWith(id)));

type Attacker = { classId: ClassId; abilities: Abilities; feats: string[]; profBonus: number; level?: number; options?: string[]; form?: string | null };

/** Whether a weapon can be wielded in the off hand: a light melee weapon. */
export const isLightWeapon = (def: ItemDef | null | undefined) => !!def?.weapon?.light && !def.weapon.ranged && !def.weapon.twoHanded;

/** The weapon attack a hero makes with what they hold: bonus to hit and damage. `dice` are the damage dice alone. */
export function weaponAttack(c: Attacker, def: ItemDef | null | undefined) {
  const form = c.form ? BEAST_FORMS[c.form] : undefined;
  if (form) {
    const a = form.attacks[0];
    return { name: a.name, bonus: Math.max(a.toHit, 0), damage: a.damage, dice: a.damage, type: a.type, mod: 0, flat: 0, toHit: 0 };
  }
  const wp = def?.weapon;
  const str = abilityMod(c.abilities.str), dex = abilityMod(c.abilities.dex);
  const die = c.classId === 'monk' ? martialDie({ classId: c.classId, level: c.level ?? 1 }) : 0;
  if (!def || !wp) {
    if (die) {
      const m = Math.max(str, dex);
      return { name: 'Unarmed strike', bonus: m + c.profBonus, damage: `1d${die}${m ? (m > 0 ? `+${m}` : m) : ''}`, dice: `1d${die}`, type: 'bludgeoning', mod: m, flat: 0, toHit: 0 };
    }
    return { name: 'Unarmed strike', bonus: str + c.profBonus, damage: String(Math.max(1, 1 + str)), dice: '', type: 'bludgeoning', mod: str, flat: 0, toHit: 0 };
  }
  const monk = die > 0 && isMonkWeapon(def);
  let mod = wp.ranged ? dex : wp.finesse || monk ? Math.max(str, dex) : str;
  if (c.options?.includes('inv_blade') && !wp.ranged) mod = Math.max(mod, abilityMod(c.abilities.cha));
  const sides = Number(/^1d(\d+)$/.exec(wp.damage)?.[1] ?? 99);
  const dice = monk && sides < die ? `1d${die}` : wp.damage;
  const toHit = wp.ranged && c.feats.includes('style_archery') ? 2 : 0;
  const flat = !wp.ranged && !wp.twoHanded && c.feats.includes('style_dueling') ? 2 : 0;
  const bonus = mod + (isProficient(c, def) ? c.profBonus : 0) + (wp.bonus ?? 0) + toHit;
  const plus = mod + (wp.bonus ?? 0) + flat;
  return { name: def.name, bonus, damage: `${dice}${plus ? (plus > 0 ? `+${plus}` : plus) : ''}`, dice, type: wp.damageType, mod, flat, toHit };
}

/** Spells of a list the hero could still learn. */
export function spellOptions(c: { abilityIds: string[]; level: number }, list: ClassId, pool: 'cantrip' | 'spell', maxLevel = maxSpellLevel(list, c.level)): string[] {
  const levels = pool === 'cantrip' ? [0] : Array.from({ length: maxLevel }, (_, i) => i + 1);
  return levels.flatMap((l) => SPELL_LISTS[list]?.[l] ?? []).filter((id) => !c.abilityIds.includes(id));
}

export const classSpellList = (classId: ClassId): ClassId | null => (SPELL_LISTS[classId] ? classId : null);

/** Mana of a rested hero: the class table, plus 2 for each Magic Initiate feat. */
export const maxManaOf = (c: { classId: ClassId; level: number; feats: string[] }) =>
  manaFor(c.classId, c.level) + 2 * c.feats.filter((f) => FEATS[f as keyof typeof FEATS]?.spellList).length;

/** What a Magic Initiate pick has to contain for this hero: how many cantrips and spells, and from where. */
export function initiateNeeds(c: { abilityIds: string[]; level: number }, list: ClassId) {
  const cantrips = spellOptions(c, list, 'cantrip');
  const spells = spellOptions(c, list, 'spell', 1);
  return { cantrips, spells, needCantrip: cantrips.length ? 1 : 0, needSpell: spells.length ? 1 : 0 };
}

/** Background increases as a map: the same ability twice gives +2. */
export function boostMap(boosts: AbilityKey[] = []): Partial<Record<AbilityKey, number>> {
  const out: Partial<Record<AbilityKey, number>> = {};
  for (const k of boosts) out[k] = (out[k] ?? 0) + 1;
  return out;
}

const uniq = (xs: string[]) => new Set(xs).size === xs.length;

/**
 * Apply a feat with its sub-choices. Returns what is wrong with the pick, or null after applying it.
 * `origin` limits the choice to origin feats (level 1).
 */
export function applyFeat(c: Build, pick: FeatPick, origin: boolean): L | null {
  const def = FEATS[pick?.id];
  if (!def) return L('Choose a feat', 'Wähle ein Talent');
  if (origin && !def.origin) return L('That feat is only available from level 4', 'Dieses Talent gibt es erst ab Stufe 4');
  if (def.epic && c.level < 19) return L('Epic boons are only available from level 19', 'Epische Gaben gibt es erst ab Stufe 19');
  if (def.id !== 'asi' && c.feats.includes(def.id)) return L(`You already have ${def.name}`, `Du hast dieses Talent bereits`);
  const raise = (next: Abilities) => {
    const con = abilityMod(next.con) - abilityMod(c.abilities.con);
    c.abilities = next;
    c.maxHp += con * c.level;
    c.hp += con * c.level;
  };
  if (def.id === 'asi') {
    const ks = pick.abilities ?? [];
    if (ks.length !== 2 || !ks.every((k) => KEYS.includes(k))) return L('Choose which ability scores to raise', 'Wähle, welche Attributswerte du erhöhst');
    const next = { ...c.abilities };
    for (const k of ks) next[k]++;
    if (KEYS.some((k) => next[k] > MAX_SCORE)) return L('An ability score cannot go above 20', 'Ein Attributswert kann nicht über 20 steigen');
    raise(next);
    return null;
  }
  if (def.boost) {
    const k = pick.abilities?.[0];
    const cap = def.epic ? 30 : MAX_SCORE;
    if (!k || pick.abilities!.length !== 1 || !def.boost.includes(k)) return L(`${def.name}: choose the ability score to raise`, 'Wähle, welchen Attributswert du erhöhst');
    if (c.abilities[k] >= cap) return L(`That ability score cannot go above ${cap}`, `Dieser Attributswert kann nicht über ${cap} steigen`);
    raise({ ...c.abilities, [k]: c.abilities[k] + 1 });
  }
  if (def.id === 'skilled') {
    const ss = pick.skills ?? [];
    if (ss.length !== 3 || !uniq(ss) || !ss.every((s) => s in SKILLS && !c.skills.includes(s))) return L('Skilled: choose three skills you are not proficient in yet', 'Geübt: Wähle drei Fertigkeiten, in denen du noch nicht geübt bist');
    c.skills.push(...ss);
  }
  if (def.spellList) {
    const need = initiateNeeds(c, def.spellList);
    const picks = pick.spells ?? [];
    const cantrips = picks.filter((id) => need.cantrips.includes(id));
    const spells = picks.filter((id) => need.spells.includes(id));
    if (!uniq(picks) || picks.length !== cantrips.length + spells.length || cantrips.length !== need.needCantrip || spells.length !== need.needSpell) {
      return L(`${def.name}: choose a cantrip and a 1st-level spell you do not know yet`, 'Eingeweihter der Magie: Wähle einen Zaubertrick und einen Zauber des 1. Grades, die du noch nicht kennst');
    }
    c.abilityIds.unshift(...picks);
    c.maxMana += 2;
    c.mana += 2;
  }
  c.feats.push(def.id);
  if (def.feature) c.features.push(def.feature);
  return null;
}

const GROUP_NAMES: Record<string, L> = Object.fromEntries(Object.values(GROUPS).map((g) => [g.id, L(g.name, g.de)]));
const emptyAbilities = (): Abilities => ({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });

/** Everything wrong or still missing in a draft, by wizard step. An empty list means the hero can be created. */
export function checkSpec(d: Draft, rolled?: number[]): Problem[] {
  const out: Problem[] = [];
  const bad = (step: StepId, en: string, de: string) => out.push({ step, text: L(en, de) });
  const sp = d.speciesId ? SPECIES[d.speciesId] : undefined;
  const cls = d.classId ? CLASSES[d.classId] : undefined;
  const bg = d.backgroundId ? BACKGROUNDS[d.backgroundId] : undefined;
  if (!sp) bad('species', 'Choose a species', 'Wähle eine Spezies');
  if (!cls) bad('class', 'Choose a class', 'Wähle eine Klasse');
  if (!bg) bad('background', 'Choose a background', 'Wähle einen Hintergrund');

  // Ability scores
  const base = d.base;
  if (!base || !KEYS.every((k) => Number.isInteger(base[k]))) bad('abilities', 'Assign your ability scores', 'Verteile deine Attributswerte');
  else {
    const vals = KEYS.map((k) => base[k]);
    if (d.method === 'array') { if (!sameSet(vals, STANDARD_ARRAY)) bad('abilities', 'Assign each value of the standard array once', 'Verteile jeden Wert des Standardsatzes genau einmal'); }
    else if (d.method === 'pointbuy') { if (!(pointsSpent(base) <= POINT_BUDGET)) bad('abilities', 'Point buy: scores from 8 to 15 for at most 27 points', 'Punktekauf: Werte von 8 bis 15 für höchstens 27 Punkte'); }
    else if (d.method === 'roll') { if (!rolled || !sameSet(vals, rolled)) bad('abilities', 'Roll your scores and assign each of them once', 'Würfle deine Werte aus und verteile jeden genau einmal'); }
    else bad('abilities', 'Choose how to determine your ability scores', 'Wähle, wie du deine Attributswerte bestimmst');
  }
  if (bg) {
    const b = d.boosts ?? [];
    const counts = Object.values(boostMap(b)).sort().join();
    if (b.length !== 3 || !b.every((k) => bg.abilities.includes(k)) || (counts !== '1,2' && counts !== '1,1,1')) bad('abilities', 'Distribute the background increases: +2 and +1, or +1 to all three', 'Verteile die Erhöhungen des Hintergrunds: +2 und +1 oder +1 auf alle drei');
  }

  // Skills
  if (cls && bg) {
    const granted = [...bg.skills];
    const picks = d.skills ?? [];
    if (picks.length !== cls.skillCount || !uniq(picks) || !picks.every((s) => cls.skillList.includes(s) && !granted.includes(s))) {
      bad('skills', `Choose ${cls.skillCount} class skills`, `Wähle ${cls.skillCount} Klassenfertigkeiten`);
    }
    granted.push(...picks);
    if (sp?.skillChoice) {
      if (!d.speciesSkill || !sp.skillChoice.includes(d.speciesSkill) || granted.includes(d.speciesSkill)) bad('skills', `Choose the skill your species grants`, 'Wähle die Fertigkeit, die deine Spezies verleiht');
      else granted.push(d.speciesSkill);
    }
    const exCount = grantedChoices(cls.id, 1).expertise?.count ?? 0;
    if (exCount) {
      const ex = d.expertise ?? [];
      if (ex.length !== exCount || !uniq(ex) || !ex.every((s) => granted.includes(s))) bad('skills', 'Choose two of your skills for Expertise', 'Wähle zwei deiner Fertigkeiten für Expertise');
    }
  }

  // Talents: fighting style, spells and feats. Built up in order so later picks see earlier ones.
  if (cls && sp && bg) {
    if (grantedChoices(cls.id, 1).style && !(d.fightingStyle && STYLES[d.fightingStyle])) bad('talents', 'Choose a fighting style', 'Wähle einen Kampfstil');
    const picked = d.classOptions ?? [];
    const groups = startGroups(cls.id);
    for (const [group, n] of groups) {
      const mine = picked.filter((o) => OPTIONS[o]?.group === group && (OPTIONS[o].minLevel ?? 1) <= 1 && !OPTIONS[o].needs);
      if (mine.length !== n) bad('talents', `Choose your ${GROUP_NAMES[group]?.en ?? group}`, `Wähle: ${GROUP_NAMES[group]?.de ?? group}`);
    }
    if (!uniq(picked) || picked.some((o) => !groups.some(([g]) => OPTIONS[o]?.group === g))) bad('talents', 'Choose your class options again', 'Wähle deine Klassenoptionen erneut');
    const b = startBuild(d, cls.id);
    const list = classSpellList(cls.id);
    if (list) {
      const cantrips = spellOptions(b, list, 'cantrip');
      const spells = spellOptions(b, list, 'spell', 1);
      const picks = d.spells ?? [];
      const pc = picks.filter((id) => cantrips.includes(id)), ps = picks.filter((id) => spells.includes(id));
      const wantC = Math.min(cls.cantrips.pick, cantrips.length), wantS = Math.min(cls.spellPicks, spells.length);
      if (!uniq(picks) || picks.length !== pc.length + ps.length || pc.length !== wantC || ps.length !== wantS) {
        bad('talents', wantC ? `Choose ${wantC} cantrips and ${wantS} spells` : `Choose ${wantS} spells`, wantC ? `Wähle ${wantC} Zaubertricks und ${wantS} Zauber` : `Wähle ${wantS} Zauber`);
      } else b.abilityIds.unshift(...picks);
    }
    const e1 = applyFeat(b, { id: bg.feat, ...d.backgroundFeat }, true);
    if (e1) out.push({ step: 'talents', text: e1 });
    if (sp.originFeat) {
      const e2 = d.originFeat ? applyFeat(b, d.originFeat, true) : L('Choose your extra origin feat', 'Wähle dein zusätzliches Herkunftstalent');
      if (e2) out.push({ step: 'talents', text: e2 });
    }
  }

  if (cls && !(d.kit && KITS[d.kit]?.classId === cls.id)) bad('equipment', 'Choose your starting equipment', 'Wähle deine Startausrüstung');
  return out;
}

/** The option groups a class picks from at level 1, with how many picks each. Styles and expertise have their own fields. */
export const startGroups = (classId: ClassId): [string, number][] =>
  Object.entries(grantedChoices(classId, 1)).filter(([g]) => !['style', 'expertise', 'lore'].includes(g)).map(([g, v]) => [g, v.count]);

/** The valid level-1 class options of a draft. */
export function startOptions(d: Draft, classId: ClassId): string[] {
  const out: string[] = [];
  for (const [group, n] of startGroups(classId)) {
    out.push(...[...new Set(d.classOptions ?? [])].filter((o) => OPTIONS[o]?.group === group && (OPTIONS[o].minLevel ?? 1) <= 1 && !OPTIONS[o].needs).slice(0, n));
  }
  return out;
}

/** The hero before spells and feats: class and species basics with the chosen skills. */
export function startBuild(d: Draft, classId: ClassId): Build {
  const cls = CLASSES[classId];
  const sp = d.speciesId ? SPECIES[d.speciesId] : undefined;
  const bg = d.backgroundId ? BACKGROUNDS[d.backgroundId] : undefined;
  const abilities = { ...emptyAbilities(), ...d.base };
  for (const [k, n] of Object.entries(boostMap(bg ? d.boosts : []))) abilities[k as AbilityKey] = Math.min(MAX_SCORE, abilities[k as AbilityKey] + (n ?? 0));
  const maxHp = Math.max(1, cls.hitDie + abilityMod(abilities.con) + (sp?.hpPerLevel ?? 0));
  const skills = [...new Set([...(bg?.skills ?? []), ...(d.skills ?? []), ...(sp?.skillChoice && d.speciesSkill ? [d.speciesSkill] : [])])];
  const options = startOptions(d, classId);
  const abilityIds = [...new Set([...cls.cantrips.fixed, ...(sp?.grants ?? []), ...options.flatMap((o) => OPTIONS[o].grants ?? []), ...cls.abilityIds])];
  const style = grantedChoices(classId, 1).style && d.fightingStyle ? STYLES[d.fightingStyle] : undefined;
  return {
    classId, level: 1, abilities, maxHp, hp: maxHp, maxMana: cls.maxMana, mana: cls.maxMana, skills, abilityIds,
    feats: style ? [`style_${style.id}`] : [],
    features: [...cls.features, ...(style ? [style.feature] : []), ...options.map((o) => optionLine(OPTIONS[o]))],
    options,
  };
}

/**
 * The sheet a draft produces. Works on incomplete drafts (the creator previews after every click);
 * returns null until a class is chosen, because hit points and proficiencies depend on it.
 */
export function buildSheet(d: Draft): Sheet | null {
  if (!d.classId || !CLASSES[d.classId]) return null;
  const cls = CLASSES[d.classId];
  const sp = d.speciesId ? SPECIES[d.speciesId] : undefined;
  const bg = d.backgroundId ? BACKGROUNDS[d.backgroundId] : undefined;
  const b = startBuild(d, cls.id);
  const list = classSpellList(cls.id);
  if (list) {
    const ok = [...spellOptions(b, list, 'cantrip'), ...spellOptions(b, list, 'spell', 1)];
    b.abilityIds.unshift(...new Set((d.spells ?? []).filter((id) => ok.includes(id))));
  }
  // An unfinished feat pick simply has no effect yet.
  if (bg) applyFeat(b, { id: bg.feat, ...d.backgroundFeat }, true);
  if (sp?.originFeat && d.originFeat) applyFeat(b, d.originFeat, true);
  if (sp) b.features.push(...sp.effects.map(effectLine));

  const kit = d.kit && KITS[d.kit]?.classId === cls.id ? KITS[d.kit] : undefined;
  const equipment = { ...(kit?.equipment ?? {}) };
  const bag: { id: string; qty: number }[] = [];
  const have = new Set(Object.values(equipment));
  for (const it of [...(kit?.bag ?? []), ...(bg?.bag ?? [])]) {
    const def = ITEMS[it.id];
    if (!def) continue;
    const qty = it.qty ?? 1;
    const stack = def.stackable ? bag.find((x) => x.id === it.id) : undefined;
    if (stack) stack.qty += qty;
    else if (def.stackable) bag.push({ id: it.id, qty });
    else if ((def.kind === 'misc' || def.kind === 'wondrous') && have.has(it.id)) continue;
    else for (let i = 0; i < qty; i++) bag.push({ id: it.id, qty: 1 });
    have.add(it.id);
  }

  const profBonus = 2;
  const hasSpells = b.abilityIds.some((id) => ABILITIES[id]?.spellLevel !== undefined);
  const cast = castingAbility(b);
  const atk = weaponAttack({ ...b, profBonus }, equipment.mainHand ? ITEMS[equipment.mainHand] : null);
  return {
    ...b, profBonus,
    ac: armorClass(b, Object.fromEntries(Object.entries(equipment).map(([slot, id]) => [slot, id ? ITEMS[id] : null]))),
    speed: sp?.speed ?? 30,
    initiative: abilityMod(b.abilities.dex) + (b.feats.includes('alert') ? profBonus : 0),
    expertise: grantedChoices(cls.id, 1).expertise ? (d.expertise ?? []).filter((s) => b.skills.includes(s)) : [],
    saves: cls.saves,
    resist: [...(sp?.resist ?? [])],
    equipment, bag,
    gold: 5 + (bg?.gold ?? 0),
    attack: { name: atk.name, bonus: atk.bonus, damage: atk.damage, type: atk.type },
    spell: hasSpells ? { ability: cast, attack: abilityMod(b.abilities[cast]) + profBonus, dc: 8 + profBonus + abilityMod(b.abilities[cast]) } : null,
  };
}
