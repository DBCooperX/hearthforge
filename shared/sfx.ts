// Sound effects: which sound belongs to which game moment, and what a roll or a log entry sounds like.
import type { LogEntry, RollInfo } from './types';

export const SFX_EVENTS = [
  'hit_slash', 'hit_pierce', 'hit_blunt', 'hit_crit', 'miss', 'shot', 'shot_hit',
  'spell_fire', 'spell_frost', 'spell_shock', 'spell_shadow', 'spell_holy', 'spell_arcane', 'spell_nature',
  'hurt', 'heal', 'monster_death', 'hero_down', 'footstep', 'combat_start', 'victory', 'defeat', 'level_up', 'coins', 'click', 'turn', 'scratch', 'pencil_tap',
] as const;
export type SfxEvent = (typeof SFX_EVENTS)[number];

/** Fired on `window` as a CustomEvent named this, with the sound's name as detail, by anything that wants a sound without importing the player. */
export const SFX_DOM_EVENT = 'hearthforge:sfx';

export interface SfxManifest {
  enabled: boolean;
  pending: boolean;
  /** Takes from the server's own library, per game moment. A moment without one is made by the browser. */
  events?: Partial<Record<SfxEvent, string[]>>;
}

const RANGED = /bow|sling|dart|javelin|bogen|armbrust|schleuder|wurfpfeil|speer/i;

/** The sound for a damage type that is not a weapon's: a spell, a breath, a bite of frost. */
function spellSound(type: string): SfxEvent | null {
  switch (type) {
    case 'fire': return 'spell_fire';
    case 'cold': return 'spell_frost';
    case 'lightning': case 'thunder': return 'spell_shock';
    case 'necrotic': case 'psychic': return 'spell_shadow';
    case 'radiant': return 'spell_holy';
    case 'force': return 'spell_arcane';
    case 'acid': case 'poison': return 'spell_nature';
    default: return null;
  }
}

/** What a new roll in the log sounds like. Saves and skill checks are silent; their effects (damage, healing) are heard separately. */
export function sfxForRoll(r: RollInfo): SfxEvent[] {
  if (r.target.kind !== 'AC') return [];
  const type = r.damage?.type ?? '';
  const spell = spellSound(type);
  if (r.outcome === 'miss') return [spell ? 'spell_arcane' : RANGED.test(r.label) ? 'shot' : 'miss'];
  if (spell) return [spell];
  if (r.outcome === 'crit') return ['hit_crit'];
  if (RANGED.test(r.label)) return ['shot_hit'];
  return [type === 'piercing' ? 'hit_pierce' : type === 'bludgeoning' ? 'hit_blunt' : 'hit_slash'];
}

/** Sounds for log entries that arrived since the last look. Only the last few count, so a reload does not play the whole story. */
export function sfxForLog(entries: LogEntry[]): SfxEvent[] {
  const out: SfxEvent[] = [];
  for (const e of entries.slice(-4)) {
    if (e.kind === 'levelup') out.push('level_up');
    else if (e.roll) out.push(...sfxForRoll(e.roll));
  }
  return out;
}
