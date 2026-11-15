// The conditions a monster can put on a hero, after the System Reference Document 5.2.1
// (CC BY 4.0), and what each one does in a fight. The names double as the chips on a
// hero's card; the help lines are what a player reads when pointing at one.

/** Conditions the engine applies and lifts by itself. "asleep" is the Unconscious condition of a hero who still has hit points. */
export const HERO_CONDITIONS = ['blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'asleep'] as const;
export type HeroCondition = (typeof HERO_CONDITIONS)[number];

/** A hero with one of these loses the turn. */
export const INCAPACITATING: readonly string[] = ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'asleep'];
/** Strength and Dexterity saves fail by themselves. */
export const HELPLESS: readonly string[] = ['paralyzed', 'petrified', 'stunned', 'asleep'];
/** The hero cannot leave the square. */
export const HELD: readonly string[] = ['grappled', 'restrained'];
/** Attack rolls against the hero have advantage. */
export const EXPOSED: readonly string[] = ['blinded', 'restrained', 'paralyzed', 'petrified', 'stunned', 'asleep'];
/** The hero's own attack rolls have disadvantage. */
export const HAMPERED: readonly string[] = ['poisoned', 'restrained', 'blinded', 'prone'];

export const CONDITION_HELP: Record<HeroCondition, string> = {
  blinded: 'Cannot see. Own attacks have disadvantage, attacks against you have advantage.',
  charmed: 'Cannot attack the one who charmed you.',
  deafened: 'Cannot hear.',
  frightened: 'Disadvantage on attacks while the source of the fear is near, and you cannot move closer to it.',
  grappled: 'Held in place: speed 0. Use Break free to wrestle loose.',
  incapacitated: 'Cannot act or move this turn.',
  paralyzed: 'Cannot act or move. Attacks against you have advantage, and hits from next to you are critical.',
  petrified: 'Turned to stone until the fight is over. Cannot act; damage is halved.',
  poisoned: 'Disadvantage on attack rolls and ability checks.',
  prone: 'Knocked down. Getting up costs half your movement. Melee attacks against you have advantage.',
  restrained: 'Speed 0. Own attacks have disadvantage, attacks against you have advantage.',
  stunned: 'Cannot act or move. Attacks against you have advantage.',
  asleep: 'Cannot act until woken by damage. Attacks against you have advantage.',
};

/** How long an effect lasts, as the engine tracks it. */
export type EffectEnd = 'save_end' | 'target_end' | 'target_start' | 'source_start' | 'source_end' | 'escape' | 'minute' | 'none' | 'combat';

/** One condition on a hero, with where it came from and how it ends. */
export interface HeroEffect {
  condition: string;
  /** A second condition that lasts exactly as long (Restrained while Grappled). */
  also?: string;
  /** The monster that caused it. */
  sourceId?: string;
  /** The action that caused it, as the stat block names it. */
  source?: string;
  ends: EffectEnd;
  /** Turns of the hero it still lasts at most. */
  rounds?: number;
  /** The save repeated at the end of each of the hero's turns. */
  save?: { ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'; dc: number };
  escapeDc?: number;
  /** The worse condition that takes over when the repeated save fails. */
  escalate?: string;
  noHealing?: boolean;
  /** Set while the monster that caused it is still on the turn it caused it in. */
  skip?: boolean;
}

/** Powers a hero switches on, shown as chips beside the conditions. */
export const BUFF_HELP: Record<string, string> = {
  raging: 'Resists bludgeoning, piercing and slashing damage, hits harder with Strength, advantage on Strength checks and saves. No spells.',
  reckless: 'Strength-based attacks have advantage, and so do all attacks against you, until your next turn.',
  'sacred weapon': 'Charisma is added to weapon attack rolls, and the weapon can deal radiant damage.',
  'innate sorcery': 'Spell save DC +1 and advantage on spell attack rolls.',
  'superior defense': 'Resists all damage except force.',
  'holy nimbus': 'Enemies that start their turn close by take radiant damage; advantage on saves against fiends and undead.',
  invisible: 'Cannot be seen: own attacks have advantage, attacks against you have disadvantage.',
  
};
