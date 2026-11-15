// The spells in monster stat blocks that the engine resolves itself, reduced to what they
// do in a fight: an attack roll or a saving throw, damage, an area, a condition. Numbers
// follow the System Reference Document 5.2.1 (CC BY 4.0) at the spell's own level. Areas
// are simplified to the shapes the battle map knows (a cube becomes a sphere of half its
// side). Spells that are not listed here are left to the Dungeon Master's narration; the
// full spell list, with slots and upcasting, arrives with the spell stage of the import.

import type { MonsterAttack, MonsterSpecial } from './monsters';

type SpellAttack = Pick<MonsterAttack, 'damage' | 'damageType' | 'range' | 'ranged' | 'count' | 'auto' | 'rider' | 'extra'>;
type SpellSave = Pick<MonsterSpecial, 'save' | 'damage' | 'half' | 'area' | 'range' | 'rider'>;

export const MONSTER_SPELLS: Record<string, { attack?: SpellAttack; save?: SpellSave }> = {
  // Attack rolls
  scorching_ray: { attack: { damage: '2d6', damageType: 'fire', range: 120, ranged: true, count: 3 } },
  guiding_bolt: { attack: { damage: '4d6', damageType: 'radiant', range: 120, ranged: true } },
  acid_arrow: { attack: { damage: '4d4', damageType: 'acid', range: 90, ranged: true } },
  ice_knife: { attack: { damage: '1d10', damageType: 'piercing', range: 60, ranged: true, extra: [{ dice: '2d6', type: 'cold' }] } },
  ray_of_sickness: { attack: { damage: '2d8', damageType: 'poison', range: 60, ranged: true, rider: { condition: 'poisoned', ends: 'source_end' } } },
  magic_missile: { attack: { damage: '1d4+1', damageType: 'force', range: 120, ranged: true, count: 3, auto: true } },
  // Saving throws, one target
  mind_spike: { save: { save: 'wis', range: 120, damage: [{ dice: '3d8', type: 'psychic' }], half: true } },
  command: { save: { save: 'wis', range: 60, damage: [], rider: { condition: 'prone', ends: 'none' } } },
  hold_person: { save: { save: 'wis', range: 60, damage: [], rider: { condition: 'paralyzed', ends: 'save_end' } } },
  hold_monster: { save: { save: 'wis', range: 90, damage: [], rider: { condition: 'paralyzed', ends: 'save_end' } } },
  charm_person: { save: { save: 'wis', range: 30, damage: [], rider: { condition: 'charmed', ends: 'minute' } } },
  charm_monster: { save: { save: 'wis', range: 30, damage: [], rider: { condition: 'charmed', ends: 'minute' } } },
  phantasmal_killer: { save: { save: 'wis', range: 120, damage: [{ dice: '4d10', type: 'psychic' }], half: true, rider: { condition: 'frightened', ends: 'save_end' } } },
  finger_of_death: { save: { save: 'con', range: 60, damage: [{ dice: '7d8+30', type: 'necrotic' }], half: true } },
  harm: { save: { save: 'con', range: 60, damage: [{ dice: '14d6', type: 'necrotic' }], half: true } },
  power_word_stun: { save: { save: 'con', range: 60, damage: [], rider: { condition: 'stunned', ends: 'save_end' } } },
  // Saving throws, an area
  fireball: { save: { save: 'dex', area: { shape: 'sphere', size: 20, range: 150 }, damage: [{ dice: '8d6', type: 'fire' }], half: true } },
  lightning_bolt: { save: { save: 'dex', area: { shape: 'line', size: 100, width: 5 }, damage: [{ dice: '8d6', type: 'lightning' }], half: true } },
  cone_of_cold: { save: { save: 'con', area: { shape: 'cone', size: 60 }, damage: [{ dice: '8d8', type: 'cold' }], half: true } },
  shatter: { save: { save: 'con', area: { shape: 'sphere', size: 10, range: 60 }, damage: [{ dice: '3d8', type: 'thunder' }], half: true } },
  thunderwave: { save: { save: 'con', area: { shape: 'emanation', size: 15 }, damage: [{ dice: '2d8', type: 'thunder' }], half: true, rider: { push: 10 } } },
  flame_strike: { save: { save: 'dex', area: { shape: 'sphere', size: 10, range: 60 }, damage: [{ dice: '5d6', type: 'fire' }, { dice: '5d6', type: 'radiant' }], half: true } },
  ice_storm: { save: { save: 'dex', area: { shape: 'sphere', size: 20, range: 300 }, damage: [{ dice: '2d10', type: 'bludgeoning' }, { dice: '4d6', type: 'cold' }], half: true } },
  vitriolic_sphere: { save: { save: 'dex', area: { shape: 'sphere', size: 20, range: 150 }, damage: [{ dice: '10d4', type: 'acid' }], half: true } },
  chain_lightning: { save: { save: 'dex', area: { shape: 'sphere', size: 30, range: 150 }, damage: [{ dice: '10d8', type: 'lightning' }], half: true } },
  insect_plague: { save: { save: 'con', area: { shape: 'sphere', size: 20, range: 300 }, damage: [{ dice: '4d10', type: 'piercing' }], half: true } },
  moonbeam: { save: { save: 'con', area: { shape: 'sphere', size: 5, range: 120 }, damage: [{ dice: '2d10', type: 'radiant' }], half: true } },
  wall_of_fire: { save: { save: 'dex', area: { shape: 'line', size: 60, width: 5 }, damage: [{ dice: '5d8', type: 'fire' }], half: true } },
  fear: { save: { save: 'wis', area: { shape: 'cone', size: 30 }, damage: [], rider: { condition: 'frightened', ends: 'save_end' } } },
  sleep: { save: { save: 'wis', area: { shape: 'sphere', size: 5, range: 60 }, damage: [], rider: { condition: 'incapacitated', escalate: 'unconscious', ends: 'save_end' } } },
  hypnotic_pattern: { save: { save: 'wis', area: { shape: 'sphere', size: 15, range: 120 }, damage: [], rider: { condition: 'incapacitated', ends: 'minute' } } },
  entangle: { save: { save: 'str', area: { shape: 'sphere', size: 10, range: 90 }, damage: [], rider: { condition: 'restrained', ends: 'save_end' } } },
  web: { save: { save: 'dex', area: { shape: 'sphere', size: 10, range: 60 }, damage: [], rider: { condition: 'restrained', ends: 'save_end' } } },
};
