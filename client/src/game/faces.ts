// Small faces for lists such as the initiative bar: a hero's portrait, a companion's face, or a
// monster's head cut from its painted battle figure (the drawn token until that has loaded).
import type { ClassId, GameState, Gender, MonsterView, SpeciesId } from '../../../shared/types';
import { ITEMS } from '../../../shared/content';
import { heroGear, heroLook, type HeroArt } from '../../../shared/heroLook';
import { artOfCharacter, companionFace, heroPortraitUrl } from './heroArt';
import { monsterUrl, monsterVariant } from './monsterArt';
import { paintedFigure } from './paintedFigures';

const heads = new Map<string, string>();

/** The top of a painted figure, square: the head and shoulders. */
function headOf(id: string, fig: HTMLCanvasElement): string {
  let url = heads.get(id);
  if (url) return url;
  const side = Math.min(fig.width, fig.height);
  const out = document.createElement('canvas');
  out.width = out.height = 96;
  out.getContext('2d')!.drawImage(fig, Math.round((fig.width - side) / 2), 0, side, side, 0, 0, 96, 96);
  url = out.toDataURL();
  heads.set(id, url);
  return url;
}

export function monsterFace(m: MonsterView): string {
  const fig = paintedFigure(m.look.imageId);
  return fig && m.look.imageId ? headOf(m.look.imageId, fig) : monsterUrl(m.look, monsterVariant(m.id));
}

/** The face of anyone in a fight, by id, or null when there is nobody by that id. */
export function combatantFace(state: GameState, id: string): string | null {
  const c = state.characters.find((x) => x.id === id);
  if (c) return heroPortraitUrl(artOfCharacter(c, state.items), 96);
  const a = (state.companions ?? []).find((x) => x.id === id);
  if (a) return companionFace(a, state.items);
  const m = state.monsters.find((x) => x.id === id);
  return m ? monsterFace(m) : null;
}

const SPECIES: [RegExp, SpeciesId][] = [
  [/\b(dwarf|dwarven|zwerg\w*)/i, 'dwarf'], [/\b(half-?ling|halbling\w*)/i, 'halfling'], [/\b(gnome?|gnom\w*)/i, 'gnome'],
  [/\b(elf|elven|elfe\w*|elfisch\w*)\b/i, 'elf'], [/\b(orc|ork\w*)/i, 'orc'], [/\b(dragonborn|drachenbl\w*)/i, 'dragonborn'],
  [/\b(tiefling\w*)/i, 'tiefling'], [/\b(goliath\w*)/i, 'goliath'],
];
const FEMALE = /\b(she|her|hers|woman|women|girl|lady|mother|wife|widow|queen|priestess|sie|ihr|ihre|frau|mädchen|mutter|witwe|königin|wirtin|händlerin|zöllnerin|bäuerin|zwergin|elfin|gnomin|orkin|kriegerin|priesterin|magierin|jägerin)\b/gi;
const MALE = /\b(he|him|his|man|men|boy|lord|father|husband|king|priest|er|sein|seine|mann|junge|vater|könig|wirt|händler)\b/gi;
const CLASSES: [RegExp, ClassId][] = [
  [/(guard|soldier|captain|knight|sergeant|warrior|mercenary|wache|soldat|hauptmann|ritter|söldner)/i, 'fighter'],
  [/(priest|cleric|monk|nun|healer|priester|mönch|nonne|heiler)/i, 'cleric'],
  [/(mage|wizard|scholar|sage|alchemist|magier|zauberer|gelehrt|alchemist)/i, 'wizard'],
  [/(thief|smuggler|spy|cutpurse|dieb|schmuggler|spion)/i, 'rogue'],
  [/(hunter|ranger|trapper|woodsman|jäger|waldläufer|fallensteller)/i, 'ranger'],
  [/(bard|minstrel|singer|barde|sänger|spielmann)/i, 'bard'],
];

/**
 * A drawn face for someone the story names who has no painted portrait (yet): the same drawn bust
 * the heroes have, its folk, build and clothes guessed from what the story says about them, and
 * always the same for the same name.
 */
export function npcBustUrl(name: string, role = '', description = '', size = 144): string {
  const text = `${role} ${description}`;
  const speciesId = SPECIES.find(([re]) => re.test(text))?.[1] ?? 'human';
  const f = (text.match(FEMALE) ?? []).length, m = (text.match(MALE) ?? []).length;
  const gender: Gender = f > m ? 'female' : m > f ? 'male' : 'neutral';
  const classId = CLASSES.find(([re]) => re.test(role))?.[1] ?? CLASSES.find(([re]) => re.test(description))?.[1] ?? 'fighter';
  const armor = classId === 'fighter' && /(guard|soldier|captain|knight|wache|soldat|hauptmann|ritter)/i.test(text) ? ITEMS.chain_shirt ?? null : null;
  const art: HeroArt = { speciesId, gender, classId, name, look: heroLook({ speciesId, gender, classId, name }), gear: heroGear(armor, null, null), portrait: null };
  return heroPortraitUrl(art, size);
}
