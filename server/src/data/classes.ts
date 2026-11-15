// Class rules live in shared/rules.ts so the character creator in the browser can use them too.
import type { Gender } from '../../../shared/types';

export { CLASSES, MANA_BY_LEVEL, profBonusFor, type ClassDef, type LevelGain } from '../../../shared/rules';

/** The names heroes had before the character creator, with the gender each was written as. */
const OLD_NAMES: Record<string, Gender> = {
  Brann: 'male', Kara: 'female', Thorgar: 'male', Vex: 'female', Nim: 'male', Sable: 'female',
  Elowen: 'female', Mirth: 'male', Zarek: 'male', Osric: 'male', Maeve: 'female', Tomas: 'male',
};

/** Gender for a hero saved before heroes had one. A name the player made up says nothing, so it stays neutral. */
export const defaultGender = (name: string): Gender => OLD_NAMES[name] ?? 'neutral';
