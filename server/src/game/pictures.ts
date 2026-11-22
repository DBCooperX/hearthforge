// The game's side of story illustrations: the Dungeon Master marks a moment with the illustrate tool, the server checks
// whether a picture may be painted, and the scene card written in the same reply gets it. Who is in the picture is
// described from the fixed facts the game keeps (a hero's species, class and looks; a person's appearance), so the
// heroes look the same from one picture to the next even before earlier pictures are passed along.
import { FIGURE_STYLE, PICTURE_GATES, PICTURE_MOMENTS, figureBackdrop, type FigureKey, type PictureAskOutcome, type PictureMoment } from '../../../shared/illustrations';
import { createHash } from 'node:crypto';
import { lookKey, type MonsterLook } from '../../../shared/monsterLook';
import { MONSTERS, type MonsterDef } from '../data/monsters';
import { anatomyOf } from '../data/monsterAnatomy';
import { LOOK_NAMES, heroLook } from '../../../shared/heroLook';
import { SPECIES } from '../../../shared/rules';
import type { Game } from './engine';
import type { Character, Npc } from '../../../shared/types';
import { ITEMS } from '../../../shared/content';

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
  /** The painted battle figure for a subject (see heroFigureSubject), if there is one and figures are on. */
  figure?(subject: string): string | null;
  /** Tell the Innkeeper what came of a request for a picture, or of a scene that could have had one. */
  note?(moment: PictureMoment | 'none', outcome: PictureAskOutcome): void;
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
  // A picture of a place is for the first arrival only, never a revisit.
  if (moment === 'place' && !game.newPlace) { game.pictures?.note?.(moment, 'not_first_arrival'); return { painted: false, reason: 'Only the first arrival at a new place gets a picture.', note: 'Carry on with the scene as usual.' }; }
  if (gate) game.pictures?.note?.(moment, gate);
  if (gate) return { painted: false, reason: PICTURE_GATES[gate], note: 'Carry on with the scene as usual.' };
  if (game.pictureAsk) return { painted: false, reason: 'This reply already has a picture.' };
  const names = String(raw.who ?? '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  // A picture of the party with no names shows every hero who is still standing.
  const who = names.length ? names : game.s.characters.filter((c) => !c.dead).map((c) => c.name);
  const lower = who.map((n) => n.toLocaleLowerCase());
  const portraits = [
    ...game.s.characters.filter((c) => c.portraitId && lower.includes(c.name.toLocaleLowerCase())).map((c) => c.portraitId!),
    ...(game.s.memory?.npcs ?? []).filter((n) => n.portraitId && lower.includes(n.name.toLocaleLowerCase())).map((n) => n.portraitId!),
  ];
  game.pictureAsk = { moment, picture, cast: castOf(game, who), ...(portraits.length ? { portraits } : {}) };
  game.pictures?.note?.(moment, 'painting');
  if (moment === 'place') game.newPlace = null; // this arrival has its picture
  return { painted: true, note: 'The picture is painted while the players read your scene, and shown above it. Do not mention it in the narration.' };
}

/** A line for the Dungeon Master's state: whether a picture can be had right now. Null when illustrations are off. */
export function pictureState(game: Game): string | null {
  const hooks = game.pictures;
  if (!hooks) return null;
  const allowed = PICTURE_MOMENTS.filter((m) => !hooks.gate(m) && (m !== 'place' || game.newPlace));
  const gate = hooks.gate('boss');
  if (gate === 'off' || gate === 'no_key') return null;
  if (!allowed.length) return 'Illustrations: none available right now.';
  const arrived = game.newPlace && allowed.includes('place') ? ` The party has just arrived at ${game.newPlace.name} for the first time: call illustrate with moment "place" in this reply, before scene, to show the place.` : '';
  return `Illustrations: available for these moments: ${allowed.join(', ')}. Call illustrate only for one of them.${arrived}`;
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

type NpcLook = Pick<Npc, 'name' | 'role' | 'description' | 'visual'>;

/** What an NPC's looks are painted from: the appearance fixed when they were first described, else their description. */
const npcLooks = (n: NpcLook) => clean(n.visual?.description || n.description, 300);

/** What an NPC's portrait is painted from. Empty: nothing to paint from yet. A changed appearance gets a new portrait. */
export function npcPortraitKey(n: NpcLook): string {
  const looks = npcLooks(n);
  return looks ? createHash('sha1').update(`${n.name}|${looks}`).digest('hex').slice(0, 10) : '';
}

/** The prompt for the portrait of someone the party met, in the style the hero portraits share. */
export function npcPortraitPrompt(style: string, n: NpcLook): string {
  const role = clean(n.role, 80);
  return [
    `Style: ${style}`,
    `Subject: ${n.name}${role ? `, ${role}` : ''}. Looks: ${npcLooks(n)}`,
    'An ordinary person of this world, not a hero: dressed and equipped as their trade and station suggest, with an expression that fits who they are. No text, no letters, no frame, no border, no watermark, no signature.',
  ].join('\n\n');
}

/**
 * For the result of moving the party: when it has just come to a place for the first time and a picture of a new place
 * may be painted now, a hint telling the Dungeon Master so. Nothing otherwise, so revisits never ask.
 */
export function placePictureHint(game: Game): Record<string, string> {
  const hooks = game.pictures;
  if (!game.newPlace || !hooks || game.s.phase === 'combat' || hooks.gate('place')) return {};
  return { picture_available: `The party is at ${game.newPlace.name} for the first time. You may call illustrate once with moment "place" to show it, before scene, with the place as the painter sees it from where the party stands.` };
}

// --- Battle figures --------------------------------------------------------------------------------------------------

/** What a hero's battle figure is painted from: their portrait. No portrait, no painted figure. */
export function heroFigureSubject(c: Pick<Character, 'id' | 'portraitId'>): string | null {
  return c.portraitId ? `h:${c.id}|${c.portraitId}|${HERO_FIGURE_VERSION}` : null;
}

/**
 * Bumped whenever how a hero's figure is painted changes, so every figure painted the old way is replaced, once and
 * lazily, the next time its hero is on a battle map. v2: figures are painted unarmed, the overlay draws the gear.
 */
export const HERO_FIGURE_VERSION = 'v2';

/** What the hero holds, wields or wears on the back, which the overlay draws and the painter must therefore leave out. */
function heldGear(c: Character): string[] {
  const names = (['mainHand', 'offHand'] as const).map((slot) => c.equipment?.[slot]).filter((i) => !!i).map((i) => ITEMS[i!.defId]?.name ?? i!.defId);
  return [...new Set(names)];
}

/**
 * What the battle figure of a named person is painted from: their portrait and what they carry. They are painted in
 * the stance of a monster, armed as the fight's look says, so the drawn figure shows nothing on top of them.
 */
export function npcFigureSubject(n: Pick<Npc, 'id' | 'portraitId'>, look: MonsterLook): string | null {
  return n.portraitId ? `n:${n.id}|${n.portraitId}|${look.weapon ?? 'none'}|${look.armor ?? 'none'}|v1` : null;
}

/**
 * The look a companion's figure is painted in: their stat block's, but empty-handed and without armour, because the
 * battle map draws what they hold now on top of it, as for the heroes.
 */
export function companionLook(template: string): MonsterLook {
  const look = MONSTERS[template]?.look ?? MONSTERS.commoner.look;
  return { ...look, weapon: null, armor: null };
}

/** What a companion's battle figure is painted from: the portrait of the person they are. */
export function companionFigureSubject(n: Pick<Npc, 'id' | 'portraitId'>, template: string): string | null {
  return npcFigureSubject(n, companionLook(template));
}

/** The prompt for the battle figure of a named person, with their portrait as the only reference. */
export function npcFigurePrompt(n: NpcLook, look: MonsterLook): { prompt: string; key: FigureKey } {
  const key = keyFor(look.color);
  const carried = [look.weapon ? `a ${look.weapon}` : '', look.armor ? `${look.armor === 'plate' ? 'heavy plate' : 'leather'} armour` : ''].filter(Boolean);
  return {
    key,
    prompt: [
      `Style: ${FIGURE_STYLE}`,
      `Subject: ${n.name}${n.role ? `, ${clean(n.role, 80)}` : ''}. ${npcLooks(n)}`,
      'The attached image is this person\'s painted portrait. Use it ONLY as a reference for the face, skin, hair, beard, build, colours and clothes. Paint the very same person, now standing at full length, upright on both feet, turned toward the viewer and ready for a fight.',
      carried.length ? `They carry only: ${carried.join(' and ')}. Nothing else is held or worn on the back.` : 'Both hands are empty. They hold and carry nothing.',
      figureBackdrop(key),
    ].join('\n\n'),
  };
}

/** A monster's figure is shared by every monster of the same kind and look, on every table of the server. */
export function monsterFigureSubject(defId: string, look: MonsterLook): string {
  const def = MONSTERS[defId];
  // The prompt is part of the subject: when how a creature is described changes, its old figure is no longer used and
  // a new one is painted, so a wrongly drawn creature does not stay wrong for good.
  const version = def ? `|${createHash('sha1').update(monsterFigurePrompt(def, look).prompt).digest('hex').slice(0, 8)}` : '';
  return `m:${defId}|${lookKey(look)}${version}`;
}

/** Green is the key colour for figures that are pink or purple themselves, magenta for the rest. */
const keyFor = (color: string): FigureKey => (/pink|purple|magenta|violet/i.test(color) ? 'green' : 'magenta');

/** The prompt for a hero's battle figure. The hero's portrait goes along as the only reference. */
export function heroFigurePrompt(c: Character): { prompt: string; key: FigureKey } {
  const key = keyFor(heroLook(c).color);
  const gear = heldGear(c);
  return {
    key,
    prompt: [
      `Style: ${FIGURE_STYLE}`,
      `Subject: ${describeHero(c).replace(/ \(fallen\)/, '')}`,
      'The attached image is this hero\'s painted portrait. Use it ONLY as a reference for the face, skin, hair, beard, build, colours and for the clothes and armour. Paint the very same person, now standing at full length, wearing their armour or robes, in a calm, ready stance upright on both feet.',
      `Both hands must be EMPTY, open and relaxed at the sides, with nothing in or near them. Leave out every item a hero can hold or carry: no weapon of any kind (sword, axe, mace, dagger, spear, bow, crossbow, club, hammer), no shield, no quiver or arrows, no staff, wand, orb, torch, lantern, book, tool or any other held object, no weapon on the back or sheathed at the belt.${gear.length ? ` In particular, do not draw: ${gear.join(', ')}.` : ''} Even if the portrait shows such things, leave them out: they are added separately by the game. Only clothing and armour are painted.`,
      figureBackdrop(key),
    ].join('\n\n'),
  };
}

/** What the figure of a creature shows: its true anatomy, plus what its look adds. */
function describeFigure(def: Pick<MonsterDef, 'id' | 'name' | 'look'>, l: MonsterLook): string {
  const natural = def.look;
  const a = anatomyOf(def.id, def.name, natural);
  const bits: string[] = [];
  // Natural features are already in the anatomy; only what the Dungeon Master changed is added.
  if (l.heads !== natural.heads && l.heads > 1) bits.push(`${l.heads} heads`);
  if (l.arms !== natural.arms && l.arms > 2) bits.push(`${l.arms} arms`);
  if (l.horns && !natural.horns) bits.push('horns');
  if (l.tail && !natural.tail) bits.push('a tail');
  if (l.wings && l.wings !== natural.wings) bits.push(`${l.wings === 'bat' ? 'leathery bat' : 'feathered'} wings`);
  if (l.eyes) bits.push(`glowing ${l.eyes} eyes`);
  if (a.gear) {
    if (l.armor) bits.push(`${l.armor === 'plate' ? 'heavy plate' : 'leather'} armour`);
    if (l.weapon) bits.push(`wielding a ${l.weapon}`);
  }
  if (l.aura) bits.push(`a faint ${l.aura} aura close around it`);
  if (l.mutation) bits.push(`${l.mutation} body`);
  return `${a.form}; ${l.size} in size, mostly ${l.color}${bits.length ? `, with ${bits.join(', ')}` : ''}`;
}

/** Whether a creature's figure is a tall picture: it stands upright. Everything else is painted square. */
export const tallFigure = (def: Pick<MonsterDef, 'id' | 'name' | 'look'>, l: MonsterLook = def.look) => anatomyOf(def.id, def.name, l).tall;

/** The prompt for a monster's battle figure, from its SRD anatomy and its look. Its stats never change what is drawn. */
export function monsterFigurePrompt(def: Pick<MonsterDef, 'id' | 'name' | 'type' | 'look'>, l: MonsterLook = def.look): { prompt: string; key: FigureKey } {
  const key = keyFor(l.color);
  return {
    key,
    prompt: [
      `Style: ${FIGURE_STYLE}`,
      `Subject: a ${def.name} (${def.type}) from classic fantasy, drawn as ${describeFigure(def, l)}. Draw exactly this creature with the body shape described, and nothing else: no rider and no extra creatures, and carrying only what is named. Menacing and full of character, ready to attack, turned toward the viewer.`,
      figureBackdrop(key),
    ].join('\n\n'),
  };
}

/**
 * The first arrival at a new place gets its picture even when the Dungeon Master did not ask: the server builds an
 * establishing view from the place and the scene just written. Null when no picture may be made now.
 */
export function placeAsk(game: Game, sceneText: string): PictureAsk | null {
  const hooks = game.pictures;
  const arrived = game.newPlace;
  if (!hooks || !arrived || game.s.phase === 'combat' || game.s.phase === 'lobby' || hooks.gate('place')) return null;
  const loc = game.place();
  if (!loc || loc.id !== arrived.id) return null;
  const look = clean(loc.visual?.description || loc.description, 300);
  const scene = clean(sceneText, 260);
  const picture = clean(`An establishing view of ${loc.name}, a ${loc.kind}, as the party first sees it. ${look} ${scene} The heroes are small figures in the scene or seen from behind.`, 700);
  return { moment: 'place', picture, cast: [] };
}
