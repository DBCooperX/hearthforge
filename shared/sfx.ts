// Sound effects: which sound belongs to which moment, and which downloaded files can stand in for the built-in ones.
import type { LogEntry, RollInfo } from './types';

export const SFX_EVENTS = [
  'hit_slash', 'hit_pierce', 'hit_blunt', 'hit_crit', 'miss', 'shot', 'shot_hit',
  'spell_fire', 'spell_frost', 'spell_shock', 'spell_shadow', 'spell_holy', 'spell_arcane', 'spell_nature',
  'hurt', 'heal', 'monster_death', 'hero_down', 'footstep', 'combat_start', 'victory', 'defeat', 'level_up', 'coins', 'click', 'turn', 'scratch',
] as const;
export type SfxEvent = (typeof SFX_EVENTS)[number];

/** Fired on `window` as a CustomEvent named this, with the sound's name as detail, by anything that wants a sound without importing the player. */
export const SFX_DOM_EVENT = 'hearthforge:sfx';

/** The free CC0 packs the owner can add. Kenney does not allow automatic downloads, so the owner opens the page and drops the zip into the Innkeeper. */
export interface SfxPack { id: string; name: string; page: string; author: string; license: string }
/** Folder for recordings that match none of the packs. */
export const SFX_OTHER = 'other';
export const SFX_FOLDERS = (): string[] => [...SFX_PACKS.map((p) => p.id), SFX_OTHER];
export interface SfxLibraryPack { id: string; name: string; author: string; license: string; page: string; count: number }
export interface SfxLibrary { enabled: boolean; packs: SfxLibraryPack[] }
export const SFX_ERRORS = {
  failed: 'That did not work. The server log says more.',
  forbidden: 'Sound effects are managed in the Innkeeper, by the owner of this server.',
  not_audio: 'This is not an .ogg file or a zip with .ogg files.',
  too_big: 'This file is too large (60 MB at most).',
  bad_request: 'That did not work. The server log says more.',
} as const;

export const SFX_PACKS: SfxPack[] = [
  { id: 'impact-sounds', name: 'Impact Sounds', page: 'https://kenney.nl/assets/impact-sounds', author: 'Kenney', license: 'CC0 1.0' },
  { id: 'rpg-audio', name: 'RPG Audio', page: 'https://kenney.nl/assets/rpg-audio', author: 'Kenney', license: 'CC0 1.0' },
  { id: 'interface-sounds', name: 'Interface Sounds', page: 'https://kenney.nl/assets/interface-sounds', author: 'Kenney', license: 'CC0 1.0' },
];

/**
 * File-name prefixes (lower case, without folder or number) of downloaded recordings that can play for an event.
 * Events not listed here are made by the browser itself (see client/src/sfx.ts), which also covers a server without the packs.
 */
export const SFX_SAMPLES: Partial<Record<SfxEvent, string[]>> = {
  hit_slash: ['knifeslice', 'impactmetal_light', 'impactplate_light'],
  hit_pierce: ['impactmetal_medium', 'impactplate_medium', 'impacttin_medium'],
  hit_blunt: ['impactpunch_medium', 'impactwood_medium', 'impactsoft_heavy'],
  hit_crit: ['impactmetal_heavy', 'impactplate_heavy', 'impactpunch_heavy'],
  hurt: ['impactpunch_heavy', 'impactsoft_medium'],
  footstep: ['footstep0', 'footstep_grass', 'footstep_wood'],
  coins: ['handlecoins'],
  click: ['click_00', 'tick_00'],
  turn: ['bong_001'],
};

export interface SfxManifest { enabled: boolean; pending: boolean; files: { name: string; src: string }[] }

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

/** The recording that fits an event best, picked from the files on the server; null when none of the prefixes match. */
export function pickSample(event: SfxEvent, names: string[], rnd: () => number = Math.random): string | null {
  const prefixes = SFX_SAMPLES[event];
  if (!prefixes) return null;
  for (const prefix of prefixes) {
    const found = names.filter((n) => (n.split('/').pop() ?? n).toLowerCase().startsWith(prefix));
    if (found.length) return found[Math.floor(rnd() * found.length)];
  }
  return null;
}
