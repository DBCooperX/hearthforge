// Game content shared by server and client: items, abilities and skills.
// Rules text and statistics are adapted from the D&D 5e System Reference Document 5.1
// (CC-BY-4.0, Wizards of the Coast). See CREDITS.md.

import type { AbilityDef, AbilityKey, ItemDef } from './types';

const items: ItemDef[] = [
  // Weapons
  { id: 'longsword', name: 'Longsword', kind: 'weapon', icon: '🗡️', value: 15, description: 'Martial melee weapon. 1d8 slashing.', weapon: { damage: '1d8', damageType: 'slashing', category: 'martial' } },
  { id: 'longsword_plus1', name: 'Longsword +1', kind: 'weapon', icon: '⚔️', value: 500, rarity: 'uncommon', description: 'A finely balanced blade that hums faintly. +1 to attack and damage rolls. 1d8 slashing.', weapon: { damage: '1d8', damageType: 'slashing', category: 'martial', bonus: 1 } },
  { id: 'shortsword', name: 'Shortsword', kind: 'weapon', icon: '🗡️', value: 10, description: 'Martial melee weapon, finesse. 1d6 piercing.', weapon: { damage: '1d6', damageType: 'piercing', category: 'martial', finesse: true } },
  { id: 'dagger', name: 'Dagger', kind: 'weapon', icon: '🔪', value: 2, description: 'Simple melee weapon, finesse. 1d4 piercing.', weapon: { damage: '1d4', damageType: 'piercing', category: 'simple', finesse: true } },
  { id: 'mace', name: 'Mace', kind: 'weapon', icon: '🔨', value: 5, description: 'Simple melee weapon. 1d6 bludgeoning.', weapon: { damage: '1d6', damageType: 'bludgeoning', category: 'simple' } },
  { id: 'handaxe', name: 'Handaxe', kind: 'weapon', icon: '🪓', value: 5, description: 'Simple melee weapon. 1d6 slashing.', weapon: { damage: '1d6', damageType: 'slashing', category: 'simple' } },
  { id: 'quarterstaff', name: 'Quarterstaff', kind: 'weapon', icon: '🦯', value: 1, description: 'Simple melee weapon. 1d6 bludgeoning.', weapon: { damage: '1d6', damageType: 'bludgeoning', category: 'simple' } },
  { id: 'shortbow', name: 'Shortbow', kind: 'weapon', icon: '🏹', value: 25, description: 'Simple ranged weapon, two-handed. 1d6 piercing, range 80/320 ft.', weapon: { damage: '1d6', damageType: 'piercing', category: 'simple', ranged: { normal: 80, long: 320 }, twoHanded: true } },
  { id: 'spear', name: 'Spear', kind: 'weapon', icon: '🔱', value: 1, description: 'Simple melee weapon. 1d6 piercing.', weapon: { damage: '1d6', damageType: 'piercing', category: 'simple' } },
  { id: 'rapier', name: 'Rapier', kind: 'weapon', icon: '🤺', value: 25, description: 'Martial melee weapon, finesse. 1d8 piercing.', weapon: { damage: '1d8', damageType: 'piercing', category: 'martial', finesse: true } },
  { id: 'greatsword', name: 'Greatsword', kind: 'weapon', icon: '⚔️', value: 50, description: 'Martial melee weapon, two-handed. 2d6 slashing.', weapon: { damage: '2d6', damageType: 'slashing', category: 'martial', twoHanded: true } },
  { id: 'longbow', name: 'Longbow', kind: 'weapon', icon: '🏹', value: 50, description: 'Martial ranged weapon, two-handed. 1d8 piercing, range 150/600 ft.', weapon: { damage: '1d8', damageType: 'piercing', category: 'martial', ranged: { normal: 150, long: 600 }, twoHanded: true } },
  // Armor
  { id: 'leather', name: 'Leather Armor', kind: 'armor', icon: '🧥', value: 10, description: 'Light armor. AC 11 + DEX.', armor: { category: 'light', baseAc: 11, dexCap: null } },
  { id: 'studded_leather', name: 'Studded Leather', kind: 'armor', icon: '🧥', value: 45, description: 'Light armor. AC 12 + DEX.', armor: { category: 'light', baseAc: 12, dexCap: null } },
  { id: 'chain_shirt', name: 'Chain Shirt', kind: 'armor', icon: '🥋', value: 50, description: 'Medium armor. AC 13 + DEX (max 2).', armor: { category: 'medium', baseAc: 13, dexCap: 2 } },
  { id: 'scale_mail', name: 'Scale Mail', kind: 'armor', icon: '🥋', value: 50, description: 'Medium armor. AC 14 + DEX (max 2).', armor: { category: 'medium', baseAc: 14, dexCap: 2 } },
  { id: 'chain_mail', name: 'Chain Mail', kind: 'armor', icon: '🛡', value: 75, description: 'Heavy armor. AC 16.', armor: { category: 'heavy', baseAc: 16, dexCap: 0 } },
  { id: 'shield', name: 'Shield', kind: 'shield', icon: '🛡️', value: 10, description: '+2 AC while held in the off hand.', acBonus: 2 },
  // Consumables
  { id: 'potion_healing', name: 'Potion of Healing', kind: 'consumable', icon: '🧪', value: 50, description: 'Restores 2d4+2 hit points. Using it in combat takes your action.', consumable: { heal: '2d4+2' }, stackable: true },
  { id: 'potion_greater_healing', name: 'Potion of Greater Healing', kind: 'consumable', icon: '⚗️', value: 150, rarity: 'uncommon', description: 'Restores 4d4+4 hit points. Using it in combat takes your action.', consumable: { heal: '4d4+4' }, stackable: true },
  // Wondrous items
  { id: 'cloak_protection', name: 'Cloak of Protection', kind: 'wondrous', slot: 'cloak', icon: '🧣', value: 800, rarity: 'uncommon', description: '+1 AC while worn.', acBonus: 1 },
  { id: 'ring_protection', name: 'Ring of Protection', kind: 'wondrous', slot: 'ring', icon: '💍', value: 1500, rarity: 'rare', description: '+1 AC while worn.', acBonus: 1 },
  { id: 'holy_symbol', name: 'Holy Symbol', kind: 'wondrous', slot: 'amulet', icon: '📿', value: 5, description: 'An amulet bearing the sign of a god. A cleric channels divine magic through it.' },
  // Misc
  { id: 'spellbook', name: 'Spellbook', kind: 'misc', icon: '📖', value: 50, description: 'A leather-bound tome of arcane formulae.' },
  { id: 'thieves_tools', name: "Thieves' Tools", kind: 'misc', icon: '🗝️', value: 25, description: 'Picks, files and a small mirror on a handle.' },
  { id: 'torch', name: 'Torch', kind: 'misc', icon: '🔥', value: 0, description: 'Burns for an hour.', stackable: true },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(items.map((i) => [i.id, i]));

const abilities: AbilityDef[] = [
  { id: 'dodge', name: 'Dodge', icon: '💨', kind: 'dodge', cost: 0, range: 0, target: 'self', description: 'Until your next turn, attacks against you have disadvantage.' },
  { id: 'second_wind', name: 'Second Wind', icon: '❤️‍🔥', kind: 'self_heal', cost: 0, range: 0, dice: '1d10', target: 'self', bonusAction: true, oncePerRest: true, description: 'Bonus action. Regain 1d10 + your level hit points. Once per rest.' },
  { id: 'fire_bolt', name: 'Fire Bolt', icon: '🔥', kind: 'attack', spellLevel: 0, cost: 0, range: 120, dice: '1d10', damageType: 'fire', target: 'enemy', description: 'Cantrip. Ranged spell attack, 1d10 fire damage.' },
  { id: 'magic_missile', name: 'Magic Missile', icon: '✨', kind: 'auto', spellLevel: 1, cost: 2, range: 120, dice: '3d4+3', damageType: 'force', target: 'enemy', description: '1st-level spell (2 mana). Three darts strike unerringly for 1d4+1 force damage each.' },
  { id: 'sacred_flame', name: 'Sacred Flame', icon: '☀️', kind: 'save', spellLevel: 0, cost: 0, range: 60, dice: '1d8', damageType: 'radiant', saveAbility: 'dex', target: 'enemy', description: 'Cantrip. Target makes a DEX save or takes 1d8 radiant damage.' },
  { id: 'guiding_bolt', name: 'Guiding Bolt', icon: '🌟', kind: 'attack', spellLevel: 1, cost: 2, range: 120, dice: '4d6', damageType: 'radiant', target: 'enemy', description: '1st-level spell (2 mana). Ranged spell attack, 4d6 radiant damage. The next attack against the target has advantage.' },
  { id: 'action_surge', name: 'Action Surge', icon: '⚡', kind: 'surge', cost: 0, range: 0, target: 'self', oncePerRest: true, description: 'Push past your limits: take one more action this turn. Once per rest.' },
  { id: 'dash', name: 'Cunning Dash', icon: '👟', kind: 'dash', cost: 0, range: 0, target: 'self', bonusAction: true, description: 'Bonus action. Gain extra movement equal to your speed this turn.' },
  { id: 'acid_arrow', name: 'Acid Arrow', icon: '🧫', kind: 'attack', spellLevel: 2, cost: 3, range: 90, dice: '4d4', damageType: 'acid', target: 'enemy', description: '2nd-level spell (3 mana). Ranged spell attack, 4d4 acid damage.' },
  { id: 'healing_word', name: 'Healing Word', icon: '🗣️', kind: 'heal', spellLevel: 1, cost: 2, range: 60, dice: '1d4', target: 'ally', bonusAction: true, description: '1st-level spell (2 mana). Bonus action. A creature within 60 ft regains 1d4 + your spellcasting modifier hit points.' },
  { id: 'cure_wounds', name: 'Cure Wounds', icon: '💚', kind: 'heal', spellLevel: 1, cost: 2, range: 5, dice: '1d8', target: 'ally', description: '1st-level spell (2 mana). A creature you touch regains 1d8 + your spellcasting modifier hit points.' },
  // Wizard cantrips
  { id: 'ray_of_frost', name: 'Ray of Frost', icon: '❄️', kind: 'attack', spellLevel: 0, cost: 0, range: 60, dice: '1d8', damageType: 'cold', target: 'enemy', description: 'Cantrip. Ranged spell attack, 1d8 cold damage.' },
  { id: 'chill_touch', name: 'Chill Touch', icon: '💀', kind: 'attack', spellLevel: 0, cost: 0, range: 120, dice: '1d8', damageType: 'necrotic', target: 'enemy', description: 'Cantrip. Ranged spell attack, 1d8 necrotic damage.' },
  { id: 'shocking_grasp', name: 'Shocking Grasp', icon: '🌩️', kind: 'attack', spellLevel: 0, cost: 0, range: 5, dice: '1d8', damageType: 'lightning', target: 'enemy', description: 'Cantrip. Melee spell attack, 1d8 lightning damage. Safe to cast with an enemy next to you.' },
  { id: 'acid_splash', name: 'Acid Splash', icon: '🫧', kind: 'save', spellLevel: 0, cost: 0, range: 60, dice: '1d6', damageType: 'acid', saveAbility: 'dex', area: true, target: 'enemy', description: 'Cantrip. The target and every enemy next to it make a DEX save or take 1d6 acid damage.' },
  { id: 'poison_spray', name: 'Poison Spray', icon: '☠️', kind: 'save', spellLevel: 0, cost: 0, range: 10, dice: '1d12', damageType: 'poison', saveAbility: 'con', target: 'enemy', description: 'Cantrip. A target within 10 ft makes a CON save or takes 1d12 poison damage.' },
  // 1st- and 2nd-level spells
  { id: 'burning_hands', name: 'Burning Hands', icon: '🖐️', kind: 'save', spellLevel: 1, cost: 2, range: 15, dice: '3d6', damageType: 'fire', saveAbility: 'dex', half: true, area: true, target: 'enemy', description: '1st-level spell (2 mana). The target and every enemy next to it make a DEX save, taking 3d6 fire damage or half on a success. Range 15 ft.' },
  { id: 'thunderwave', name: 'Thunderwave', icon: '💥', kind: 'save', spellLevel: 1, cost: 2, range: 15, dice: '2d8', damageType: 'thunder', saveAbility: 'con', half: true, area: true, target: 'enemy', description: '1st-level spell (2 mana). The target and every enemy next to it make a CON save, taking 2d8 thunder damage or half on a success. Range 15 ft.' },
  { id: 'mage_armor', name: 'Mage Armor', icon: '🔰', kind: 'ward', spellLevel: 1, cost: 2, range: 0, target: 'self', description: '1st-level spell (2 mana). While you wear no armor, your AC is 13 + DEX. Lasts until your next long rest.' },
  { id: 'inflict_wounds', name: 'Inflict Wounds', icon: '🩸', kind: 'attack', spellLevel: 1, cost: 2, range: 5, dice: '3d10', damageType: 'necrotic', target: 'enemy', description: '1st-level spell (2 mana). Melee spell attack, 3d10 necrotic damage.' },
  { id: 'shatter', name: 'Shatter', icon: '🔊', kind: 'save', spellLevel: 2, cost: 3, range: 60, dice: '3d8', damageType: 'thunder', saveAbility: 'con', half: true, area: true, target: 'enemy', description: '2nd-level spell (3 mana). The target and every enemy next to it make a CON save, taking 3d8 thunder damage or half on a success.' },
  // Species traits
  { id: 'breath_weapon', name: 'Breath Weapon', icon: '🐲', kind: 'save', cost: 0, range: 15, dice: '1d10', damageType: 'fire', saveAbility: 'dex', dcAbility: 'con', half: true, area: true, oncePerRest: true, target: 'enemy', description: 'Exhale fire: the target and every enemy next to it make a DEX save (DC 8 + CON + proficiency), taking 1d10 fire damage or half on a success. 2d10 from level 5. Once per rest.' },
  { id: 'adrenaline_rush', name: 'Adrenaline Rush', icon: '💢', kind: 'dash', cost: 0, range: 0, target: 'self', bonusAction: true, oncePerRest: true, description: 'Bonus action. Gain extra movement equal to your speed this turn. Once per rest.' },
];

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(abilities.map((a) => [a.id, a]));

export const SLOT_LABELS: Record<string, string> = {
  head: 'Head',
  amulet: 'Amulet',
  armor: 'Armor',
  cloak: 'Cloak',
  mainHand: 'Main hand',
  offHand: 'Off hand',
  ring: 'Ring',
  boots: 'Boots',
};

export const CLASS_INFO: Record<string, { name: string; blurb: string; color: string }> = {
  fighter: { name: 'Fighter', blurb: 'Heavily armored front-liner. Longsword, shield and Second Wind.', color: '#c0392b' },
  rogue: { name: 'Rogue', blurb: 'Quick and precise. Sneak Attack when an ally flanks the target.', color: '#27ae60' },
  wizard: { name: 'Wizard', blurb: 'Fragile arcane caster. Fire Bolt and Magic Missile.', color: '#2980b9' },
  cleric: { name: 'Cleric', blurb: 'Armored healer. Sacred Flame, Guiding Bolt and Cure Wounds.', color: '#f1c40f' },
};

/** The 5e skills and the ability each one uses. */
export const SKILLS: Record<string, AbilityKey> = {
  acrobatics: 'dex', 'animal handling': 'wis', arcana: 'int', athletics: 'str', deception: 'cha', history: 'int',
  insight: 'wis', intimidation: 'cha', investigation: 'int', medicine: 'wis', nature: 'int', perception: 'wis',
  performance: 'cha', persuasion: 'cha', religion: 'int', 'sleight of hand': 'dex', stealth: 'dex', survival: 'wis',
};

export const ABILITY_NAMES: Record<AbilityKey, string> = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};

/** Saving throw proficiencies by class. */
export const SAVE_PROFS: Record<string, AbilityKey[]> = {
  fighter: ['str', 'con'], rogue: ['dex', 'int'], wizard: ['int', 'wis'], cleric: ['wis', 'cha'],
};
