// The twelve classes of the SRD 5.2.1 from level 1 to 20: which feature arrives when, the
// numbers that grow with level, the resources a hero spends and the choices a class asks for.
//
// The tables come from shared/srd/classes.json (written by scripts/srd/import-classes.mjs);
// what each feature does in this game is in shared/classFeatures.ts. Server and browser
// both use this file, so the character sheet shows exactly what the engine enforces.
import raw from './srd/classes.json';
import { FEATURE_TEXT } from './classFeatures';
import { abilityMod, type Abilities, type AbilityKey, type ClassId } from './types';

/** Text in both interface languages. */
interface L { en: string; de: string }
const L = (en: string, de: string): L => ({ en, de });

interface RawFeature { id: string; name: string; levels: number[] }
interface RawRow { level: number; spec?: Record<string, number>; cantrips?: number; prepared?: number; slots?: number[] }
interface RawClass {
  id: string; name: string; hitDie: number; saves: AbilityKey[];
  armor: ('light' | 'medium' | 'heavy' | 'shield')[]; weapons: ('simple' | 'martial')[]; weaponIds: string[];
  skillCount: number; skills: string[];
  features: RawFeature[]; subclass: { id: string; name: string; features: RawFeature[] };
  asi: number[]; table: RawRow[];
}
export const SRD_CLASSES = raw as unknown as Record<ClassId, RawClass>;

/** The four classes the game began with come first, then the others in the order of the SRD. */
export const CLASS_IDS: ClassId[] = ['fighter', 'rogue', 'wizard', 'cleric', 'barbarian', 'bard', 'druid', 'monk', 'paladin', 'ranger', 'sorcerer', 'warlock'];

export const SUBCLASS_LEVEL = 3;
export const EPIC_BOON_LEVEL = 19;

export interface FeatureDef {
  id: string;
  classId: ClassId;
  /** English name; translated like other game terms. */
  name: string;
  de: string;
  /** The level it arrives at, and any later level at which it improves or returns. */
  levels: number[];
  /** A feature of the subclass. */
  sub: boolean;
  by: 'engine' | 'story';
  text: L;
}

const build = (classId: ClassId): FeatureDef[] => {
  const c = SRD_CLASSES[classId];
  const one = (f: RawFeature, sub: boolean): FeatureDef => {
    const t = FEATURE_TEXT[classId]?.[f.id];
    return { id: f.id, classId, name: f.name, de: t?.[0] ?? f.name, levels: f.levels, sub, by: t?.[1] ?? 'story', text: L(t?.[2] ?? '', t?.[3] ?? '') };
  };
  return [...c.features.map((f) => one(f, false)), ...c.subclass.features.map((f) => one(f, true))].sort((a, b) => a.levels[0] - b.levels[0]);
};
export const CLASS_FEATURES = Object.fromEntries(CLASS_IDS.map((id) => [id, build(id)])) as Record<ClassId, FeatureDef[]>;

/** The line a class feature puts on the character sheet. */
export const featureLine = (f: FeatureDef) => `${f.name}: ${f.text.en}`;

type Who = { classId: ClassId; level: number };

/** How many times the hero has gained this feature: 0 without it, more than 1 once it has improved. */
export function featureRank(c: Who, id: string): number {
  const f = CLASS_FEATURES[c.classId]?.find((x) => x.id === id);
  return f ? f.levels.filter((l) => l <= c.level).length : 0;
}
export const hasFeature = (c: Who, id: string) => featureRank(c, id) > 0;

/** Features gained or improved on reaching exactly this level. */
export const featuresAt = (classId: ClassId, level: number) => CLASS_FEATURES[classId].filter((f) => f.levels.includes(level));

/** A number from the class table that grows with level: rages, focus points, sneak attack dice. */
export const classSpec = (c: Who, key: string): number => SRD_CLASSES[c.classId]?.table[Math.min(20, Math.max(1, c.level)) - 1]?.spec?.[key] ?? 0;

export const profBonusFor = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4);

// ------------------------------------------------------------------- magic

/** What a spell of each level costs in mana: the spell point value of a slot of that level. */
export const SLOT_COST = [2, 3, 5, 6, 7, 9, 10, 11, 13];

/** Mana a class has at a level: the spell point value of the spell slots in its table. */
export function manaFor(classId: ClassId, level: number): number {
  const slots = SRD_CLASSES[classId]?.table[Math.min(20, Math.max(1, level)) - 1]?.slots;
  return slots ? slots.reduce((sum, n, i) => sum + n * SLOT_COST[i], 0) : 0;
}

/** The highest spell level a class can cast at a character level; 0 for classes without magic. */
export function maxSpellLevelFor(classId: ClassId, level: number): number {
  const slots = SRD_CLASSES[classId]?.table[Math.min(20, Math.max(1, level)) - 1]?.slots ?? [];
  let top = 0;
  slots.forEach((n, i) => { if (n > 0) top = i + 1; });
  return top;
}

/** Cantrips roll more dice as the caster grows: twice at level 5, three times at 11, four times at 17. */
export const cantripScale = (level: number) => 1 + (level >= 5 ? 1 : 0) + (level >= 11 ? 1 : 0) + (level >= 17 ? 1 : 0);

export const CASTING: Partial<Record<ClassId, AbilityKey>> = {
  wizard: 'int', cleric: 'wis', druid: 'wis', ranger: 'wis', bard: 'cha', paladin: 'cha', sorcerer: 'cha', warlock: 'cha',
};

// ------------------------------------------------------------ level numbers

type Hero = Who & { options?: string[] };

/** Attacks beyond the first with each Attack action. */
export function extraAttacks(c: Hero): number {
  if (hasFeature(c, 'three_extra_attacks')) return 3;
  if (hasFeature(c, 'two_extra_attacks')) return 2;
  if (hasFeature(c, 'extra_attack')) return 1;
  return c.options?.includes('inv_thirsting') ? 1 : 0;
}

/** The lowest d20 roll that is a critical hit with a weapon. */
export const critFrom = (c: Who) => (hasFeature(c, 'superior_critical') ? 18 : hasFeature(c, 'improved_critical') ? 19 : 20);

export const sneakDice = (c: Who) => classSpec(c, 'sneak_attack');
export const rageDamage = (c: Who) => classSpec(c, 'rage_damage_bonus');
export const martialDie = (c: Who) => classSpec(c, 'martial_arts_die');
export const inspirationDie = (c: Who) => classSpec(c, 'bardic_inspiration_die');

/** Extra speed in feet from class features, for what the hero wears. */
export function speedBonus(c: Who, worn: { armor?: 'light' | 'medium' | 'heavy'; shield?: boolean }): number {
  let n = 0;
  if ((hasFeature(c, 'fast_movement') || hasFeature(c, 'roving')) && worn.armor !== 'heavy') n += 10;
  if (!worn.armor && !worn.shield) n += classSpec(c, 'unarmored_movement_bonus');
  return n;
}

/** Saving throws a hero is proficient in. */
export function saveProfs(c: Who): AbilityKey[] {
  if (hasFeature(c, 'disciplined_survivor')) return ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  const own = SRD_CLASSES[c.classId]?.saves ?? [];
  return hasFeature(c, 'slippery_mind') ? [...new Set<AbilityKey>([...own, 'wis', 'cha'])] : own;
}

// --------------------------------------------------------------- resources

type Spender = Hero & { abilities: Abilities; uses?: Record<string, number> };

export interface ResourceDef {
  id: string;
  name: string;
  de: string;
  icon: string;
  /** How many the hero has when rested; 0 means the hero does not have this resource. */
  max: (c: Spender) => number;
  /** The rest that brings all of it back. */
  rest: 'short' | 'long';
  /** How many return on a short rest when a long rest is needed for all of it. */
  shortGain?: number;
  /** Shown as a counter on the hero; the others only limit one ability. */
  show?: boolean;
}

const mod = (c: Spender, k: AbilityKey) => Math.max(1, abilityMod(c.abilities[k]));
const resources: ResourceDef[] = [
  { id: 'rage', name: 'Rage', de: 'Kampfrausch', icon: '💢', rest: 'long', shortGain: 1, show: true, max: (c) => classSpec(c, 'rage_count') },
  { id: 'second_wind', name: 'Second Wind', de: 'Durchschnaufen', icon: '❤️‍🔥', rest: 'long', shortGain: 1, show: true, max: (c) => classSpec(c, 'second_wind_uses') },
  { id: 'action_surge', name: 'Action Surge', de: 'Tatendrang', icon: '⚡', rest: 'short', show: true, max: (c) => featureRank(c, 'action_surge') },
  { id: 'indomitable', name: 'Indomitable', de: 'Unbeugsam', icon: '🗿', rest: 'long', show: true, max: (c) => featureRank(c, 'indomitable') },
  { id: 'inspiration', name: 'Bardic Inspiration', de: 'Bardische Inspiration', icon: '🎶', rest: 'long', show: true, max: (c) => (hasFeature(c, 'bardic_inspiration') ? mod(c, 'cha') : 0) },
  { id: 'channel', name: 'Channel Divinity', de: 'Göttliche Macht fokussieren', icon: '✨', rest: 'long', shortGain: 1, show: true, max: (c) => classSpec(c, 'channel_divinity_charges') },
  { id: 'wild_shape', name: 'Wild Shape', de: 'Tiergestalt', icon: '🐾', rest: 'long', shortGain: 1, show: true, max: (c) => classSpec(c, 'wild_shape_uses') },
  { id: 'focus', name: 'Focus', de: 'Fokus', icon: '☯️', rest: 'short', show: true, max: (c) => classSpec(c, 'focus_points') },
  { id: 'lay_on_hands', name: 'Lay on Hands', de: 'Handauflegen', icon: '🤲', rest: 'long', show: true, max: (c) => (hasFeature(c, 'lay_on_hands') ? 5 * c.level : 0) },
  { id: 'free_smite', name: 'Free Divine Smite', de: 'Freies Göttliches Niederstrecken', icon: '🌟', rest: 'long', max: (c) => (hasFeature(c, 'paladins_smite') ? 1 : 0) },
  { id: 'favored_enemy', name: 'Favored Enemy', de: 'Erzfeind', icon: '🎯', rest: 'long', show: true, max: (c) => classSpec(c, 'favored_enemies') },
  { id: 'tireless', name: 'Tireless', de: 'Unermüdlich', icon: '🥾', rest: 'long', max: (c) => (hasFeature(c, 'tireless') ? mod(c, 'wis') : 0) },
  { id: 'natures_veil', name: "Nature's Veil", de: 'Schleier der Natur', icon: '🍃', rest: 'long', max: (c) => (hasFeature(c, 'natures_veil') ? mod(c, 'wis') : 0) },
  { id: 'innate_sorcery', name: 'Innate Sorcery', de: 'Angeborene Zauberei', icon: '🔥', rest: 'long', show: true, max: (c) => (hasFeature(c, 'innate_sorcery') ? 2 : 0) },
  { id: 'sorcery', name: 'Sorcery Points', de: 'Zauberpunkte', icon: '💠', rest: 'long', show: true, max: (c) => classSpec(c, 'sorcery_points') },
  { id: 'magical_cunning', name: 'Magical Cunning', de: 'Magische Raffinesse', icon: '🕯️', rest: 'long', max: (c) => (hasFeature(c, 'magical_cunning') ? 1 : 0) },
  { id: 'dark_luck', name: "Dark One's Own Luck", de: 'Glück des Finsteren', icon: '🎲', rest: 'long', max: (c) => (hasFeature(c, 'dark_ones_own_luck') ? mod(c, 'cha') : 0) },
  { id: 'hurl', name: 'Hurl Through Hell', de: 'Durch die Hölle schleudern', icon: '🕳️', rest: 'long', max: (c) => (hasFeature(c, 'hurl_through_hell') ? 1 : 0) },
  { id: 'wholeness', name: 'Wholeness of Body', de: 'Ganzheit des Körpers', icon: '🧘', rest: 'long', max: (c) => (hasFeature(c, 'wholeness_of_body') ? mod(c, 'wis') : 0) },
  { id: 'overchannel', name: 'Overchannel', de: 'Überladen', icon: '🌋', rest: 'long', max: (c) => (hasFeature(c, 'overchannel') ? 1 : 0) },
  { id: 'presence', name: 'Intimidating Presence', de: 'Einschüchternde Präsenz', icon: '😱', rest: 'long', max: (c) => (hasFeature(c, 'intimidating_presence') ? 1 : 0) },
  { id: 'nimbus', name: 'Holy Nimbus', de: 'Heiliger Nimbus', icon: '😇', rest: 'long', max: (c) => (hasFeature(c, 'holy_nimbus') ? 1 : 0) },
  { id: 'stroke_of_luck', name: 'Stroke of Luck', de: 'Glückstreffer', icon: '🍀', rest: 'short', max: (c) => (hasFeature(c, 'stroke_of_luck') ? 1 : 0) },
  // Spent without a button: the engine uses them when their moment comes.
  { id: 'persistent_rage', name: 'Persistent Rage', de: 'Anhaltender Kampfrausch', icon: '💢', rest: 'long', max: (c) => (hasFeature(c, 'persistent_rage') ? 1 : 0) },
  { id: 'uncanny_metabolism', name: 'Uncanny Metabolism', de: 'Unheimlicher Stoffwechsel', icon: '☯️', rest: 'long', max: (c) => (hasFeature(c, 'uncanny_metabolism') ? 1 : 0) },
  { id: 'recovery', name: 'Recovery', de: 'Erholung', icon: '📖', rest: 'long', max: (c) => (hasFeature(c, 'arcane_recovery') || hasFeature(c, 'natural_recovery') || hasFeature(c, 'sorcerous_restoration') ? 1 : 0) },
];
export const RESOURCES: Record<string, ResourceDef> = Object.fromEntries(resources.map((r) => [r.id, r]));

export const resourceMax = (c: Spender, id: string) => RESOURCES[id]?.max(c) ?? 0;
export const resourceLeft = (c: Spender, id: string) => Math.max(0, resourceMax(c, id) - (c.uses?.[id] ?? 0));

/** The counters a hero shows: what is left of each resource the class has. */
export function shownResources(c: Spender): { def: ResourceDef; left: number; max: number }[] {
  return resources.filter((r) => r.show).map((def) => ({ def, max: def.max(c), left: resourceLeft(c, def.id) })).filter((r) => r.max > 0);
}

// -------------------------------------------------------------- wild shape

export interface BeastForm {
  id: string;
  name: string;
  icon: string;
  /** Druid level needed. */
  minLevel: number;
  ac: number;
  speed: number;
  /** What one Attack action does, in order. `prone` knocks the target down on a hit. */
  attacks: { name: string; toHit: number; damage: string; type: string; prone?: boolean }[];
}

/** Beasts of the SRD 5.2.1 a druid can become, with the numbers of their stat blocks. */
export const BEAST_FORMS: Record<string, BeastForm> = {
  wolf: { id: 'wolf', name: 'Wolf', icon: '🐺', minLevel: 2, ac: 12, speed: 40, attacks: [{ name: 'Bite', toHit: 4, damage: '1d6+2', type: 'piercing', prone: true }] },
  black_bear: { id: 'black_bear', name: 'Black Bear', icon: '🐻', minLevel: 4, ac: 11, speed: 30, attacks: [{ name: 'Rend', toHit: 4, damage: '1d6+2', type: 'slashing' }, { name: 'Rend', toHit: 4, damage: '1d6+2', type: 'slashing' }] },
  dire_wolf: { id: 'dire_wolf', name: 'Dire Wolf', icon: '🐺', minLevel: 8, ac: 14, speed: 50, attacks: [{ name: 'Bite', toHit: 5, damage: '1d10+3', type: 'piercing', prone: true }] },
  brown_bear: { id: 'brown_bear', name: 'Brown Bear', icon: '🐻', minLevel: 8, ac: 11, speed: 40, attacks: [{ name: 'Bite', toHit: 5, damage: '1d8+3', type: 'piercing' }, { name: 'Claw', toHit: 5, damage: '1d4+3', type: 'slashing', prone: true }] },
};

// ------------------------------------------------------- abilities by level

/** Actions a class gains at a level, as ids of ABILITIES. */
export const LEVEL_ABILITIES: Record<ClassId, Record<number, string[]>> = {
  fighter: { 1: ['second_wind'], 2: ['action_surge'] },
  rogue: { 2: ['dash'], 3: ['steady_aim'], 5: ['cunning_trip', 'cunning_poison'], 14: ['cunning_daze'] },
  wizard: { 14: ['overchannel'] },
  cleric: { 2: ['divine_spark_heal', 'divine_spark_harm', 'turn_undead'], 3: ['preserve_life'] },
  barbarian: { 1: ['rage'], 2: ['reckless'], 9: ['brutal_strike'], 14: ['intimidating_presence'] },
  bard: { 1: ['bardic_inspiration'] },
  druid: { 2: ['wild_shape_wolf', 'revert_form'], 3: ['lands_aid'], 4: ['wild_shape_black_bear'], 8: ['wild_shape_dire_wolf', 'wild_shape_brown_bear'] },
  monk: { 1: ['martial_strike'], 2: ['flurry_of_blows', 'patient_defense', 'step_of_the_wind'], 5: ['stunning_strike'], 6: ['wholeness_of_body'], 17: ['quivering_palm'], 18: ['superior_defense'] },
  paladin: { 1: ['lay_on_hands'], 2: ['divine_smite'], 3: ['sacred_weapon'], 9: ['abjure_foes'], 20: ['holy_nimbus'] },
  ranger: { 1: ['hunters_mark'], 10: ['tireless'], 14: ['natures_veil'] },
  sorcerer: { 1: ['innate_sorcery'], 2: ['font_of_magic'] },
  warlock: { 2: ['magical_cunning'], 14: ['hurl_through_hell'] },
};

/** Every action the class has granted up to a level. */
export const classAbilities = (classId: ClassId, level: number) =>
  Object.entries(LEVEL_ABILITIES[classId] ?? {}).filter(([l]) => Number(l) <= level).flatMap(([, ids]) => ids);

// ----------------------------------------------------------------- choices

export interface ClassOption {
  id: string;
  group: string;
  name: string;
  de: string;
  icon: string;
  by: 'engine' | 'story';
  text: L;
  /** Character level needed to pick it. */
  minLevel?: number;
  /** Another option that must be chosen first. */
  needs?: string;
  /** An action it grants, as an id of ABILITIES. */
  grants?: string;
}

const opt = (id: string, group: string, name: string, de: string, icon: string, by: 'engine' | 'story', en: string, deText: string, more: Partial<ClassOption> = {}): ClassOption =>
  ({ id, group, name, de, icon, by, text: L(en, deText), ...more });

const DAMAGE_DE: Record<string, string> = { acid: 'Säure', cold: 'Kälte', fire: 'Feuer', lightning: 'Blitz', poison: 'Gift', necrotic: 'Nekrotisch', psychic: 'Psychisch', thunder: 'Schall' };
const DAMAGE_ICON: Record<string, string> = { acid: '🧪', cold: '❄️', fire: '🔥', lightning: '⚡', poison: '☠️', necrotic: '💀', psychic: '🌀', thunder: '🔊' };
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

const options: ClassOption[] = [
  // Cleric: Divine Order
  opt('order_protector', 'order', 'Protector', 'Beschützer', '🛡️', 'engine', 'Trained for battle: you can wear heavy armor and use martial weapons.', 'Für den Kampf ausgebildet: Du kannst schwere Rüstung tragen und Kriegswaffen führen.'),
  opt('order_thaumaturge', 'order', 'Thaumaturge', 'Thaumaturg', '📿', 'engine', 'Steeped in lore: your Wisdom modifier (at least +1) is added to Arcana and Religion checks.', 'In Wissen bewandert: Dein Weisheitsmodifikator (mindestens +1) wird auf Würfe für Arkane Kunde und Religion addiert.'),
  // Druid: Primal Order
  opt('primal_magician', 'primal', 'Magician', 'Magier', '🌙', 'engine', 'A keeper of secrets: your Wisdom modifier (at least +1) is added to Arcana and Nature checks.', 'Ein Hüter der Geheimnisse: Dein Weisheitsmodifikator (mindestens +1) wird auf Würfe für Arkane Kunde und Naturkunde addiert.'),
  opt('primal_warden', 'primal', 'Warden', 'Wächter', '🪓', 'engine', 'A guardian of the wild: you can wear medium armor and use martial weapons.', 'Ein Wächter der Wildnis: Du kannst mittelschwere Rüstung tragen und Kriegswaffen führen.'),
  // Druid: Circle of the Land
  opt('land_arid', 'land', 'Arid Land', 'Trockenes Land', '🏜️', 'engine', 'Deserts and badlands. Nature\'s Ward will make you resist fire.', 'Wüsten und Ödland. Schutz der Natur macht dich später resistent gegen Feuer.'),
  opt('land_polar', 'land', 'Polar Land', 'Polares Land', '🧊', 'engine', 'Ice and tundra. Nature\'s Ward will make you resist cold.', 'Eis und Tundra. Schutz der Natur macht dich später resistent gegen Kälte.'),
  opt('land_temperate', 'land', 'Temperate Land', 'Gemäßigtes Land', '🌳', 'engine', 'Forests and meadows. Nature\'s Ward will make you resist lightning.', 'Wälder und Wiesen. Schutz der Natur macht dich später resistent gegen Blitz.'),
  opt('land_tropical', 'land', 'Tropical Land', 'Tropisches Land', '🌴', 'engine', 'Jungles and swamps. Nature\'s Ward will make you resist poison.', 'Dschungel und Sümpfe. Schutz der Natur macht dich später resistent gegen Gift.'),
  // Druid: Elemental Fury
  opt('fury_spellcasting', 'fury', 'Potent Spellcasting', 'Mächtiges Zauberwirken', '🌩️', 'engine', 'Your Wisdom modifier is added to the damage of your cantrips.', 'Dein Weisheitsmodifikator wird auf den Schaden deiner Zaubertricks addiert.'),
  opt('fury_strike', 'fury', 'Primal Strike', 'Urtümlicher Schlag', '🐺', 'engine', 'Once per turn, a hit with a weapon or in beast form deals 1d8 extra cold damage, 2d8 from level 15.', 'Einmal pro Zug verursacht ein Treffer mit einer Waffe oder in Tiergestalt 1W8 zusätzlichen Kälteschaden, ab Stufe 15 2W8.'),
  // Ranger: Hunter's Prey
  opt('prey_colossus', 'prey', 'Colossus Slayer', 'Kolossbezwinger', '🗡️', 'engine', 'Once per turn, a weapon hit on a creature that is already wounded deals 1d8 extra damage.', 'Einmal pro Zug verursacht ein Waffentreffer gegen eine bereits verwundete Kreatur 1W8 zusätzlichen Schaden.'),
  opt('prey_horde', 'prey', 'Horde Breaker', 'Hordenbrecher', '⚔️', 'engine', 'Once per turn, after a weapon attack you make another against a different enemy next to your target.', 'Einmal pro Zug führst du nach einem Waffenangriff einen weiteren gegen einen anderen Gegner neben deinem Ziel aus.'),
  // Sorcerer: Metamagic
  opt('meta_quickened', 'metamagic', 'Quickened Spell', 'Beschleunigter Zauber', '⏩', 'engine', 'Free, 2 sorcery points: your next spell this turn takes a bonus action instead of your action.', 'Frei, 2 Zauberpunkte: Dein nächster Zauber in diesem Zug kostet eine Bonusaktion statt deiner Aktion.', { grants: 'meta_quickened' }),
  opt('meta_empowered', 'metamagic', 'Empowered Spell', 'Verstärkter Zauber', '💥', 'engine', 'Free, 1 sorcery point: your next spell this turn rolls its damage twice and keeps the higher result.', 'Frei, 1 Zauberpunkt: Dein nächster Zauber in diesem Zug würfelt seinen Schaden zweimal und behält das höhere Ergebnis.', { grants: 'meta_empowered' }),
  opt('meta_heightened', 'metamagic', 'Heightened Spell', 'Gesteigerter Zauber', '🎯', 'engine', 'Free, 2 sorcery points: targets roll their saving throws against your next spell this turn with disadvantage.', 'Frei, 2 Zauberpunkte: Ziele würfeln ihre Rettungswürfe gegen deinen nächsten Zauber in diesem Zug mit Nachteil.', { grants: 'meta_heightened' }),
  opt('meta_distant', 'metamagic', 'Distant Spell', 'Weitreichender Zauber', '🏹', 'engine', 'Free, 1 sorcery point: your next spell this turn has twice its range, and a touch spell reaches 30 ft.', 'Frei, 1 Zauberpunkt: Dein nächster Zauber in diesem Zug hat die doppelte Reichweite, ein Berührungszauber reicht 30 ft.', { grants: 'meta_distant' }),
  opt('meta_seeking', 'metamagic', 'Seeking Spell', 'Suchender Zauber', '🧭', 'engine', 'When a spell attack of yours misses, 1 sorcery point rolls it again. The game does this for you.', 'Wenn dein Zauberangriff verfehlt, würfelt 1 Zauberpunkt ihn erneut. Das Spiel erledigt das für dich.'),
  opt('meta_subtle', 'metamagic', 'Subtle Spell', 'Subtiler Zauber', '🤫', 'story', '1 sorcery point: cast a spell without words or gestures, unnoticed.', '1 Zauberpunkt: Wirke einen Zauber ohne Worte und Gesten, unbemerkt.'),
  opt('meta_extended', 'metamagic', 'Extended Spell', 'Verlängerter Zauber', '⏳', 'story', '1 sorcery point: double the duration of a spell.', '1 Zauberpunkt: Verdopple die Dauer eines Zaubers.'),
  opt('meta_transmuted', 'metamagic', 'Transmuted Spell', 'Verwandelter Zauber', '🌈', 'story', '1 sorcery point: change a spell\'s acid, cold, fire, lightning, poison or thunder damage into another of these.', '1 Zauberpunkt: Wandle den Säure-, Kälte-, Feuer-, Blitz-, Gift- oder Schallschaden eines Zaubers in eine andere dieser Arten um.'),
  // Sorcerer: Elemental Affinity
  ...['acid', 'cold', 'fire', 'lightning', 'poison'].map((t) => opt(`aff_${t}`, 'affinity', cap(t), DAMAGE_DE[t], DAMAGE_ICON[t], 'engine', `You resist ${t} damage, and your ${t} spells add your Charisma modifier to their damage.`, `Du bist resistent gegen ${DAMAGE_DE[t]}schaden, und deine Zauber dieser Art addieren deinen Charismamodifikator auf ihren Schaden.`)),
  // Warlock: Fiendish Resilience
  ...['acid', 'cold', 'fire', 'lightning', 'poison', 'necrotic', 'psychic', 'thunder'].map((t) => opt(`res_${t}`, 'resilience', cap(t), DAMAGE_DE[t], DAMAGE_ICON[t], 'engine', `You resist ${t} damage.`, `Du bist resistent gegen diese Schadensart: ${DAMAGE_DE[t]}.`)),
  // Warlock: Eldritch Invocations
  opt('inv_armor', 'invocation', 'Armor of Shadows', 'Rüstung der Schatten', '🌑', 'engine', 'Mage Armor is always on you: without armor your AC is 13 + Dexterity.', 'Magierrüstung liegt immer auf dir: Ohne Rüstung beträgt deine RK 13 + Geschicklichkeit.'),
  opt('inv_blade', 'invocation', 'Pact of the Blade', 'Pakt der Klinge', '🗡️', 'engine', 'Your weapon is bound to you: you are proficient with any melee weapon you hold and may attack with Charisma instead of Strength or Dexterity.', 'Deine Waffe ist an dich gebunden: Du bist mit jeder Nahkampfwaffe geübt, die du hältst, und kannst mit Charisma statt Stärke oder Geschicklichkeit angreifen.'),
  opt('inv_chain', 'invocation', 'Pact of the Chain', 'Pakt der Kette', '⛓️', 'story', 'Your patron sends you a familiar: an imp, a quasit, a pseudodragon or a sprite.', 'Dein Schutzherr schickt dir einen Vertrauten: einen Imp, einen Quasit, einen Pseudodrachen oder ein Feenwesen.'),
  opt('inv_tome', 'invocation', 'Pact of the Tome', 'Pakt des Buches', '📕', 'story', 'A book of shadows with extra cantrips and rituals. It takes effect with the spell import.', 'Ein Buch der Schatten mit zusätzlichen Zaubertricks und Ritualen. Das wird mit dem Zauberimport wirksam.'),
  opt('inv_mind', 'invocation', 'Eldritch Mind', 'Schauerlicher Geist', '🧠', 'story', 'Advantage on saves to keep your concentration. The game has no concentration checks.', 'Vorteil auf Rettungswürfe, um deine Konzentration zu halten. Das Spiel kennt keine Konzentrationswürfe.'),
  opt('inv_agonizing', 'invocation', 'Agonizing Blast', 'Qualvoller Strahl', '💢', 'engine', 'Each beam of your Eldritch Blast adds your Charisma modifier to its damage.', 'Jeder Strahl deines Schauerstrahls addiert deinen Charismamodifikator auf seinen Schaden.', { minLevel: 2 }),
  opt('inv_repelling', 'invocation', 'Repelling Blast', 'Abstoßender Strahl', '🌬️', 'engine', 'Each beam of your Eldritch Blast that hits pushes the target 10 ft away.', 'Jeder Strahl deines Schauerstrahls, der trifft, stößt das Ziel 10 ft zurück.', { minLevel: 2 }),
  opt('inv_spear', 'invocation', 'Eldritch Spear', 'Schauerlicher Speer', '📏', 'engine', 'Your Eldritch Blast reaches 300 ft.', 'Dein Schauerstrahl reicht 300 ft weit.', { minLevel: 2 }),
  opt('inv_sight', 'invocation', "Devil's Sight", 'Teufelssicht', '👁️', 'engine', 'You see normally in darkness out to 120 ft.', 'Du siehst in Dunkelheit bis 120 ft normal.', { minLevel: 2 }),
  opt('inv_vigor', 'invocation', 'Fiendish Vigor', 'Unholde Lebenskraft', '🫀', 'engine', 'You start every fight with 12 temporary hit points.', 'Du beginnst jeden Kampf mit 12 temporären Trefferpunkten.', { minLevel: 2 }),
  opt('inv_mask', 'invocation', 'Mask of Many Faces', 'Maske der vielen Gesichter', '🎭', 'story', 'You can disguise yourself with an illusion at will.', 'Du kannst dich nach Belieben mit einer Illusion verkleiden.', { minLevel: 2 }),
  opt('inv_visions', 'invocation', 'Misty Visions', 'Neblige Visionen', '🌫️', 'story', 'You can create silent illusions at will.', 'Du kannst nach Belieben stumme Illusionen erschaffen.', { minLevel: 2 }),
  opt('inv_leap', 'invocation', 'Otherworldly Leap', 'Jenseitiger Sprung', '🦘', 'story', 'You can jump three times as far at will.', 'Du kannst nach Belieben dreimal so weit springen.', { minLevel: 2 }),
  opt('inv_thirsting', 'invocation', 'Thirsting Blade', 'Durstige Klinge', '⚔️', 'engine', 'Two attacks with each Attack action.', 'Zwei Angriffe mit jeder Angriffsaktion.', { minLevel: 5, needs: 'inv_blade' }),
  opt('inv_shadows', 'invocation', 'One with Shadows', 'Eins mit den Schatten', '🕶️', 'story', 'In dim light or darkness you can turn invisible while you stand still.', 'In schwachem Licht oder Dunkelheit kannst du unsichtbar werden, solange du stillstehst.', { minLevel: 5 }),
  opt('inv_step', 'invocation', 'Ascendant Step', 'Aufsteigender Schritt', '🪽', 'story', 'You can levitate at will.', 'Du kannst nach Belieben schweben.', { minLevel: 5 }),
  opt('inv_lifedrinker', 'invocation', 'Lifedrinker', 'Lebenstrinker', '🩸', 'engine', 'Once per turn your weapon hit deals 1d6 extra necrotic damage and heals you for the same amount.', 'Einmal pro Zug verursacht dein Waffentreffer 1W6 zusätzlichen nekrotischen Schaden und heilt dich um denselben Betrag.', { minLevel: 9, needs: 'inv_blade' }),
  opt('inv_whispers', 'invocation', 'Whispers of the Grave', 'Flüstern des Grabes', '⚰️', 'story', 'You can speak with the dead at will.', 'Du kannst nach Belieben mit den Toten sprechen.', { minLevel: 9 }),
  opt('inv_witch', 'invocation', 'Witch Sight', 'Hexensicht', '🔮', 'story', 'You see through illusions and shape-changers within 30 ft.', 'Du durchschaust Illusionen und Gestaltwandler im Umkreis von 30 ft.', { minLevel: 15 }),
];
export const OPTIONS: Record<string, ClassOption> = Object.fromEntries(options.map((o) => [o.id, o]));

/** The line a chosen option puts on the character sheet. */
export const optionLine = (o: ClassOption) => `${o.name}: ${o.text.en}`;

export interface GroupDef { id: string; name: string; de: string; text: L }
const groups: GroupDef[] = [
  { id: 'style', name: 'Fighting Style', de: 'Kampfstil', text: L('A combat specialty that shapes how you fight.', 'Eine Kampfspezialisierung, die prägt, wie du kämpfst.') },
  { id: 'order', name: 'Divine Order', de: 'Göttliche Ordnung', text: L('The sacred role you were trained for.', 'Die heilige Rolle, für die du ausgebildet wurdest.') },
  { id: 'primal', name: 'Primal Order', de: 'Urtümliche Ordnung', text: L('The sacred role you were trained for.', 'Die heilige Rolle, für die du ausgebildet wurdest.') },
  { id: 'land', name: 'Land', de: 'Land', text: L('The land your circle draws its power from.', 'Das Land, aus dem dein Zirkel seine Kraft zieht.') },
  { id: 'fury', name: 'Elemental Fury', de: 'Elementarer Zorn', text: L('How the might of the elements flows through you.', 'Wie die Macht der Elemente durch dich fließt.') },
  { id: 'prey', name: "Hunter's Prey", de: 'Beute des Jägers', text: L('The kind of quarry you have learned to bring down.', 'Die Art von Beute, die du zu erlegen gelernt hast.') },
  { id: 'metamagic', name: 'Metamagic', de: 'Metamagie', text: L('Ways to bend your spells with sorcery points.', 'Wege, deine Zauber mit Zauberpunkten zu formen.') },
  { id: 'affinity', name: 'Elemental Affinity', de: 'Elementare Affinität', text: L('The element of your draconic ancestor.', 'Das Element deines drakonischen Ahnen.') },
  { id: 'resilience', name: 'Fiendish Resilience', de: 'Unholde Widerstandskraft', text: L('The damage your patron shields you from.', 'Der Schaden, vor dem dich dein Schutzherr bewahrt.') },
  { id: 'invocation', name: 'Eldritch Invocation', de: 'Schauerliche Anrufung', text: L('Fragments of forbidden lore that give you lasting powers.', 'Bruchstücke verbotenen Wissens, die dir dauerhafte Kräfte verleihen.') },
  { id: 'expertise', name: 'Expertise', de: 'Expertise', text: L('Skills that use double your proficiency bonus.', 'Fertigkeiten, die den doppelten Übungsbonus nutzen.') },
  { id: 'lore', name: 'Bonus Proficiencies', de: 'Zusätzliche Übung', text: L('Skills you become proficient in.', 'Fertigkeiten, in denen du geübt wirst.') },
];
export const GROUPS: Record<string, GroupDef> = Object.fromEntries(groups.map((g) => [g.id, g]));

/** Options of a group a hero could still take at their level. */
export function optionsFor(c: Hero, group: string): ClassOption[] {
  const have = c.options ?? [];
  return options.filter((o) => o.group === group && !have.includes(o.id) && (o.minLevel ?? 1) <= c.level && (!o.needs || have.includes(o.needs)));
}

export interface ChoiceRule {
  level: number;
  group: string;
  /** Picks added at that level. */
  count: number;
  /** Expertise: only these skills qualify. */
  from?: string[];
}

const invocations: ChoiceRule[] = SRD_CLASSES.warlock.table
  .map((row, i, all) => ({ level: row.level, group: 'invocation', count: (row.spec?.eldritch_invocations ?? 0) - (i ? all[i - 1].spec?.eldritch_invocations ?? 0 : 0) }))
  .filter((r) => r.count > 0);

/** What each class chooses, and when. Fighting styles are stored as feats, expertise as skills, the rest as options. */
export const CHOICES: Record<ClassId, ChoiceRule[]> = {
  fighter: [{ level: 1, group: 'style', count: 1 }, { level: 7, group: 'style', count: 1 }],
  rogue: [{ level: 1, group: 'expertise', count: 2 }, { level: 6, group: 'expertise', count: 2 }],
  wizard: [{ level: 2, group: 'expertise', count: 1, from: ['arcana', 'history', 'investigation', 'medicine', 'nature', 'religion'] }],
  cleric: [{ level: 1, group: 'order', count: 1 }],
  barbarian: [],
  bard: [{ level: 2, group: 'expertise', count: 2 }, { level: 3, group: 'lore', count: 3 }, { level: 9, group: 'expertise', count: 2 }],
  druid: [{ level: 1, group: 'primal', count: 1 }, { level: 3, group: 'land', count: 1 }, { level: 7, group: 'fury', count: 1 }],
  monk: [],
  paladin: [{ level: 2, group: 'style', count: 1 }],
  ranger: [{ level: 2, group: 'expertise', count: 1 }, { level: 2, group: 'style', count: 1 }, { level: 3, group: 'prey', count: 1 }, { level: 9, group: 'expertise', count: 2 }],
  sorcerer: [{ level: 2, group: 'metamagic', count: 2 }, { level: 6, group: 'affinity', count: 1 }, { level: 10, group: 'metamagic', count: 2 }, { level: 17, group: 'metamagic', count: 2 }],
  warlock: [...invocations, { level: 10, group: 'resilience', count: 1 }],
};

type Chooser = Hero & { feats: string[]; expertise: string[] };

/** How many picks of a group the hero has made so far. */
export function chosenIn(c: Chooser, group: string): number {
  if (group === 'style') return c.feats.filter((f) => f.startsWith('style_')).length;
  if (group === 'expertise') return c.expertise.length;
  if (group === 'lore') return (c.options ?? []).filter((o) => o === 'lore').length;
  return (c.options ?? []).filter((o) => OPTIONS[o]?.group === group).length;
}

/** Picks the class has granted up to the hero's level, by group. */
export function grantedChoices(classId: ClassId, level: number): Record<string, { count: number; from?: string[] }> {
  const out: Record<string, { count: number; from?: string[] }> = {};
  for (const r of CHOICES[classId] ?? []) {
    if (r.level > level) continue;
    const g = (out[r.group] ??= { count: 0 });
    g.count += r.count;
    if (r.from) g.from = r.from;
  }
  return out;
}

/** German names of features, options, groups and resources, for the dictionary. */
export const CLASS_DE: Record<string, string> = Object.fromEntries([
  ...CLASS_IDS.flatMap((id) => CLASS_FEATURES[id].map((f) => [f.name, f.de] as [string, string])),
  ...options.map((o) => [o.name, o.de] as [string, string]),
  ...groups.map((g) => [g.name, g.de] as [string, string]),
  ...resources.map((r) => [r.name, r.de] as [string, string]),
]);
