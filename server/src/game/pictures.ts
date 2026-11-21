// The game's side of story illustrations: the Dungeon Master marks a moment with the illustrate tool, the server checks
// whether a picture may be painted, and the scene card written in the same reply gets it. Who is in the picture is
// described from the fixed facts the game keeps (a hero's species, class and looks; a person's appearance), so the
// heroes look the same from one picture to the next even before earlier pictures are passed along.
import { PICTURE_GATES, PICTURE_MOMENTS, type PictureMoment } from '../../../shared/illustrations';
import { LOOK_NAMES, heroLook } from '../../../shared/heroLook';
import { SPECIES } from '../../../shared/rules';
import type { Game } from './engine';
import type { Character } from '../../../shared/types';

/** What the Dungeon Master asked to be shown. */
export interface PictureAsk {
  moment: PictureMoment;
  /** The picture in plain words, in English. */
  picture: string;
  /** Fixed descriptions of the people in it, in English. */
  cast: string[];
  /** The painted portraits of the heroes in it, to keep them recognisable. */
  portraits?: string[];
}

/** What the room gives the game, so it can ask the server. */
export interface PictureHooks {
  /** Why no picture may be painted for this moment now (a key of PICTURE_GATES), or null. */
  gate(moment: PictureMoment): keyof typeof PICTURE_GATES | null;
  /** Paint it for this story entry. Runs in the background; the entry is updated when it is done. */
  paint(entryId: number, ask: PictureAsk): void;
}

const clean = (raw: unknown, max: number) => String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const look = (k: string) => (LOOK_NAMES[k] ?? k).toLowerCase();

/** How a hero looks, in one sentence for an image model. */
function heroLine(game: Game, name: string): string | null {
  const c = game.s.characters.find((h) => h.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  return c ? describeHero(c) : null;
}

/** A hero's looks as the creator set them, in words. */
export function describeHero(c: Character): string {
  const l = heroLook(c);
  const species = SPECIES[c.speciesId]?.name ?? c.speciesId;
  const gender = c.gender === 'female' ? 'woman' : c.gender === 'male' ? 'man' : 'person';
  const hair = l.hair === 'bald' ? 'no hair' : `${look(l.hairColor)} ${look(l.hair)} hair`;
  const beard = l.beard !== 'none' ? `, a ${look(l.beard)} beard` : '';
  const extra = clean(c.appearance, 220);
  return `${c.name}: a ${species} ${gender}, ${c.className.toLowerCase()}, ${look(l.skin)} skin, ${hair}${beard}, clothes and trim in ${look(l.color)}${c.dead ? ' (fallen)' : ''}.${extra ? ` ${extra}` : ''}`;
}

/** How someone the party met looks, from the appearance fixed when they were first described. */
function npcLine(game: Game, name: string): string | null {
  const n = game.s.memory?.npcs.find((p) => p.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (!n) return null;
  const looks = clean(n.visual?.description, 240);
  return `${n.name}${n.role ? ` (${clean(n.role, 60)})` : ''}${looks ? `: ${looks}` : ''}`;
}

/** The people named for the picture. Heroes nobody named are added when the picture is of the party. */
export function castOf(game: Game, names: string[]): string[] {
  const out: string[] = [];
  for (const raw of names) {
    const name = clean(raw, 60);
    if (!name) continue;
    const line = heroLine(game, name) ?? npcLine(game, name);
    if (line && !out.includes(line)) out.push(line);
  }
  return out.slice(0, 6);
}

/**
 * The illustrate tool. Validates what the model sent, asks the server whether a picture may be made now, and keeps
 * the request until the scene of this reply is written. Returns what the model is told.
 */
export function askPicture(game: Game, raw: { moment?: unknown; picture?: unknown; who?: unknown }): Record<string, unknown> {
  const moment = clean(raw.moment, 20).toLowerCase() as PictureMoment;
  if (!PICTURE_MOMENTS.includes(moment)) throw new Error(`moment must be one of: ${PICTURE_MOMENTS.join(', ')}`);
  const picture = clean(raw.picture, 700);
  if (picture.length < 20) throw new Error('Describe the picture in one to three sentences.');
  if (game.s.phase === 'lobby') return { painted: false, reason: 'The adventure has not begun.' };
  const gate = game.pictures ? game.pictures.gate(moment) : 'off';
  if (gate) return { painted: false, reason: PICTURE_GATES[gate], note: 'Carry on with the scene as usual.' };
  if (game.pictureAsk) return { painted: false, reason: 'This reply already has a picture.' };
  const names = String(raw.who ?? '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  // A picture of the party with no names shows every hero who is still standing.
  const who = names.length ? names : game.s.characters.filter((c) => !c.dead).map((c) => c.name);
  const lower = who.map((n) => n.toLocaleLowerCase());
  const portraits = game.s.characters.filter((c) => c.portraitId && lower.includes(c.name.toLocaleLowerCase())).map((c) => c.portraitId!);
  game.pictureAsk = { moment, picture, cast: castOf(game, who), ...(portraits.length ? { portraits } : {}) };
  return { painted: true, note: 'The picture is painted while the players read your scene, and shown above it. Do not mention it in the narration.' };
}

/** A line for the Dungeon Master's state: whether a picture can be had right now. Null when illustrations are off. */
export function pictureState(game: Game): string | null {
  const hooks = game.pictures;
  if (!hooks) return null;
  const allowed = PICTURE_MOMENTS.filter((m) => !hooks.gate(m));
  const gate = hooks.gate('boss');
  if (gate === 'off' || gate === 'no_key') return null;
  if (!allowed.length) return 'Illustrations: none available right now.';
  return `Illustrations: available for these moments: ${allowed.join(', ')}. Call illustrate only for one of them.`;
}

/** Everything the image model is told, apart from the earlier pictures it gets along. */
export function picturePrompt(style: string, ask: Pick<PictureAsk, 'picture' | 'cast'>, setting: { where?: string; time?: string; refs: number }): string {
  return [
    `Style: ${style}`,
    `Scene: ${ask.picture}`,
    setting.where ? `Place: ${setting.where}${setting.time ? `, ${setting.time}` : ''}.` : '',
    ask.cast.length ? `People in the picture, drawn exactly as described:\n${ask.cast.map((c) => `- ${c}`).join('\n')}` : '',
    setting.refs ? `The ${setting.refs === 1 ? 'image attached shows' : `${setting.refs} images attached show`} the heroes' portraits or earlier moments of the same adventure. Keep every person who appears again looking the same (face, hair, build, clothes, gear), but draw them in the style above, not in the style of the attached images. Do not copy their compositions.` : '',
    'A wide landscape composition, one clear moment, fantasy tabletop adventure. No text, no letters, no captions, no frame, no border, no watermark, no signature.',
  ].filter(Boolean).join('\n\n');
}

/** What a portrait is painted from. A hero whose key changes gets a new portrait. */
export function portraitKey(c: Character): string {
  const l = heroLook(c);
  return [c.speciesId, c.classId, c.gender, l.skin, l.hair, l.hairColor, l.beard, l.color, clean(c.appearance, 220)].join('|');
}

/** The prompt for a hero's portrait. */
export function portraitPrompt(style: string, c: Character): string {
  return [
    `Style: ${style}`,
    `Subject: ${describeHero(c).replace(/ \(fallen\)/, '')}`,
    'Show the class through clothing and gear (armour, robes, holy symbol, bow, staff) without a weapon covering the face. No text, no letters, no frame, no border, no watermark, no signature.',
  ].join('\n\n');
}
