// Level 1 pregenerated heroes built from the SRD 5.1 classes with the standard array.
import type { Abilities, AbilityKey, ClassId, SlotId } from '../../../shared/types';

export interface ClassDef {
  id: ClassId;
  name: string;
  hitDie: number;
  abilities: Abilities;
  castingAbility?: 'int' | 'wis';
  maxMana: number;
  armorProf: ('light' | 'medium' | 'heavy' | 'shield')[];
  weaponProf: ('simple' | 'martial')[];
  /** Extra weapons the class is proficient with by item id. */
  weaponProfIds?: string[];
  abilityIds: string[];
  skills: string[];
  equipment: Partial<Record<SlotId, string>>;
  bag: { id: string; qty?: number }[];
  defaultNames: string[];
  /** What each level after the first grants, keyed by the level reached. */
  levels: Record<number, LevelGain>;
}

export interface LevelGain {
  /** Ability ids from ABILITIES learned at this level. */
  abilities?: string[];
  /** Passive features, as lines for the character sheet. A later line with the same prefix before ':' replaces the earlier one. */
  features?: string[];
  /** Ability score improvement: +2 to this ability. */
  asi?: AbilityKey;
}

/** Spell points by level for casters (house rule; a 1st-level spell costs 2). */
export const MANA_BY_LEVEL = [4, 6, 8, 10, 14];

export const profBonusFor = (level: number) => (level >= 5 ? 3 : 2);

export const CLASSES: Record<ClassId, ClassDef> = {
  fighter: {
    id: 'fighter',
    name: 'Fighter',
    hitDie: 10,
    abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 13, cha: 10 },
    maxMana: 0,
    armorProf: ['light', 'medium', 'heavy', 'shield'],
    weaponProf: ['simple', 'martial'],
    abilityIds: ['second_wind', 'dodge'],
    skills: ['athletics', 'perception', 'intimidation'],
    equipment: { armor: 'chain_mail', mainHand: 'longsword', offHand: 'shield' },
    bag: [{ id: 'handaxe' }, { id: 'potion_healing' }, { id: 'torch', qty: 3 }],
    defaultNames: ['Brann', 'Kara', 'Thorgar'],
    levels: {
      2: { abilities: ['action_surge'] },
      3: { features: ['Improved Critical: weapon attacks crit on 19 or 20'] },
      4: { asi: 'str' },
      5: { features: ['Extra Attack: two weapon attacks with each Attack action'] },
    },
  },
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    hitDie: 8,
    abilities: { str: 10, dex: 16, con: 12, int: 13, wis: 14, cha: 8 },
    maxMana: 0,
    armorProf: ['light'],
    weaponProf: ['simple'],
    weaponProfIds: ['shortsword', 'longsword'],
    abilityIds: ['dodge'],
    skills: ['stealth', 'acrobatics', 'perception', 'investigation', 'sleight of hand'],
    equipment: { armor: 'leather', mainHand: 'shortsword' },
    bag: [{ id: 'shortbow' }, { id: 'dagger' }, { id: 'potion_healing' }, { id: 'thieves_tools' }],
    defaultNames: ['Vex', 'Nim', 'Sable'],
    levels: {
      2: { abilities: ['dash'] },
      3: { features: ['Sneak Attack: 2d6'] },
      4: { asi: 'dex' },
      5: { features: ['Sneak Attack: 3d6'] },
    },
  },
  wizard: {
    id: 'wizard',
    name: 'Wizard',
    hitDie: 6,
    abilities: { str: 8, dex: 14, con: 13, int: 16, wis: 12, cha: 10 },
    castingAbility: 'int',
    maxMana: 4,
    armorProf: [],
    weaponProf: [],
    weaponProfIds: ['dagger', 'quarterstaff'],
    abilityIds: ['fire_bolt', 'magic_missile', 'dodge'],
    skills: ['arcana', 'history', 'investigation'],
    equipment: { mainHand: 'quarterstaff' },
    bag: [{ id: 'dagger' }, { id: 'potion_healing' }, { id: 'spellbook' }],
    defaultNames: ['Elowen', 'Mirth', 'Zarek'],
    levels: {
      2: { features: ['Arcane Recovery: a short rest restores 1 extra mana'] },
      3: { abilities: ['acid_arrow'] },
      4: { asi: 'int' },
      5: { features: ['Potent Cantrips: cantrips roll twice as many damage dice'] },
    },
  },
  cleric: {
    id: 'cleric',
    name: 'Cleric',
    hitDie: 8,
    abilities: { str: 14, dex: 10, con: 13, int: 8, wis: 16, cha: 12 },
    castingAbility: 'wis',
    maxMana: 4,
    armorProf: ['light', 'medium', 'shield'],
    weaponProf: ['simple'],
    abilityIds: ['sacred_flame', 'guiding_bolt', 'cure_wounds', 'dodge'],
    skills: ['medicine', 'religion', 'insight'],
    equipment: { armor: 'scale_mail', mainHand: 'mace', offHand: 'shield', amulet: 'holy_symbol' },
    bag: [{ id: 'potion_healing', qty: 2 }],
    defaultNames: ['Osric', 'Maeve', 'Tomas'],
    levels: {
      2: { abilities: ['healing_word'] },
      3: { features: ['Disciple of Life: your healing spells restore 3 extra hit points'] },
      4: { asi: 'wis' },
      5: { features: ['Potent Cantrips: cantrips roll twice as many damage dice'] },
    },
  },
};
