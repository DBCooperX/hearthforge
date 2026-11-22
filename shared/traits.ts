// Personality traits of a hero, set by the player in the creator. All optional. They tell the Dungeon Master how the
// world and its people answer this hero and how outcomes land; they never decide or speak for the hero.
import type { Lang } from './i18n';

type L = Record<Lang, string>;

export interface TraitGroup {
  id: string;
  title: L;
  /** The one-line hint under the title. */
  hint: L;
  options: { id: string; text: L }[];
}

const o = (id: string, en: string, de: string) => ({ id, text: { en, de } });

export const TRAIT_GROUPS: TraitGroup[] = [
  {
    id: 'personality', title: { en: 'Personality', de: 'Persönlichkeit' }, hint: { en: 'The core of who they are.', de: 'Das Wesen deines Helden.' },
    options: [o('curious', 'curious', 'neugierig'), o('loyal', 'loyal', 'loyal'), o('honest', 'honest', 'ehrlich'), o('cunning', 'cunning', 'listig'), o('kind', 'kind', 'gütig'), o('proud', 'proud', 'stolz'), o('greedy', 'greedy', 'habgierig'), o('brave', 'brave', 'mutig'), o('cautious', 'cautious', 'vorsichtig'), o('idealistic', 'idealistic', 'idealistisch'), o('cynical', 'cynical', 'zynisch'), o('devout', 'devout', 'gläubig')],
  },
  {
    id: 'temperament', title: { en: 'Temperament', de: 'Temperament' }, hint: { en: 'How they feel things.', de: 'Wie sie Dinge empfinden.' },
    options: [o('calm', 'calm', 'ruhig'), o('hot_headed', 'hot-headed', 'hitzköpfig'), o('stubborn', 'stubborn', 'stur'), o('impulsive', 'impulsive', 'impulsiv'), o('patient', 'patient', 'geduldig'), o('anxious', 'anxious', 'ängstlich'), o('moody', 'moody', 'launisch'), o('cheerful', 'cheerful', 'fröhlich'), o('grim', 'grim', 'düster')],
  },
  {
    id: 'social', title: { en: 'Social behaviour', de: 'Umgang mit Leuten' }, hint: { en: 'How they treat other people.', de: 'Wie sie mit anderen umgehen.' },
    options: [o('friendly', 'friendly', 'freundlich'), o('shy', 'shy', 'schüchtern'), o('charming', 'charming', 'charmant'), o('blunt', 'blunt', 'unverblümt'), o('suspicious', 'suspicious', 'misstrauisch'), o('protective', 'protective', 'beschützend'), o('aloof', 'aloof', 'distanziert'), o('flirtatious', 'flirtatious', 'flirtend'), o('polite', 'polite', 'höflich'), o('bossy', 'bossy', 'herrisch')],
  },
  {
    id: 'humour', title: { en: 'Humour', de: 'Humor' }, hint: { en: 'What makes them laugh.', de: 'Worüber sie lachen.' },
    options: [o('dry', 'dry', 'trocken'), o('sarcastic', 'sarcastic', 'sarkastisch'), o('goofy', 'goofy', 'albern'), o('dark', 'dark', 'schwarz'), o('witty', 'witty', 'witzig'), o('none', 'hardly laughs', 'lacht kaum')],
  },
  {
    id: 'speech', title: { en: 'Speech', de: 'Sprechweise' }, hint: { en: 'How they talk.', de: 'Wie sie reden.' },
    options: [o('few_words', 'few words', 'wortkarg'), o('chatty', 'chatty', 'redselig'), o('formal', 'formal', 'förmlich'), o('rough', 'rough', 'derb'), o('poetic', 'poetic', 'poetisch'), o('loud', 'loud', 'laut'), o('soft', 'soft-spoken', 'leise'), o('swears', 'swears a lot', 'flucht viel')],
  },
  {
    id: 'quirks', title: { en: 'Quirks', de: 'Marotten' }, hint: { en: 'Little habits and oddities.', de: 'Kleine Eigenheiten und Gewohnheiten.' },
    options: [o('superstitious', 'superstitious', 'abergläubisch'), o('collector', 'collects odd things', 'sammelt Kurioses'), o('hums', 'hums or sings', 'summt oder singt'), o('fidgets', 'fidgets', 'zappelig'), o('animal_lover', 'loves animals', 'tierlieb'), o('foodie', 'loves food', 'Feinschmecker'), o('neat', 'very tidy', 'sehr ordentlich'), o('gambler', 'loves a wager', 'wettfreudig'), o('night_owl', 'night owl', 'Nachtmensch')],
  },
  {
    id: 'provoked', title: { en: 'When provoked', de: 'Bei Provokation' }, hint: { en: 'Insults, taunts and pushing.', de: 'Beleidigungen, Spott und Drängeln.' },
    options: [o('ignores', 'ignores it', 'ignoriert es'), o('fires_back', 'fires back', 'gibt Kontra'), o('goes_cold', 'goes cold and quiet', 'wird kalt und still'), o('fights', 'reaches for a weapon', 'greift zur Waffe'), o('laughs_off', 'laughs it off', 'lacht darüber'), o('holds_grudges', 'holds a grudge', 'trägt es nach')],
  },
  {
    id: 'danger', title: { en: 'In danger', de: 'In Gefahr' }, hint: { en: 'Fights, threats and fear.', de: 'Kämpfe, Drohungen und Angst.' },
    options: [o('charges', 'charges in', 'stürmt vor'), o('freezes', 'freezes first', 'erstarrt zuerst'), o('stays_calm', 'stays calm', 'bleibt ruhig'), o('protects_others', 'shields others first', 'schützt zuerst andere'), o('cracks_jokes', 'cracks jokes', 'macht Witze'), o('plans', 'looks for a plan', 'sucht einen Plan'), o('flees', 'runs when it is hopeless', 'flieht, wenn es aussichtslos ist')],
  },
  {
    id: 'scenes', title: { en: 'In social scenes', de: 'In Gesellschaft' }, hint: { en: 'Taverns, feasts, courts and crowds.', de: 'Tavernen, Feste, Höfe und Menschenmengen.' },
    options: [o('centre', 'centre of attention', 'steht im Mittelpunkt'), o('corner', 'finds a quiet corner', 'sucht eine ruhige Ecke'), o('listens', 'listens more than talks', 'hört mehr zu, als zu reden'), o('haggles', 'loves to haggle', 'feilscht gern'), o('drinks', 'drinks and sings', 'trinkt und singt'), o('observes', 'sizes everyone up', 'mustert alle'), o('mediates', 'smooths over quarrels', 'schlichtet Streit')],
  },
];

/** What a hero keeps: a few picks for every group, and a free note. */
export interface HeroTraits {
  /** The chosen option ids, per group id. */
  picks: Record<string, string[]>;
  /** Anything else the player wants the Dungeon Master to know about how this hero acts. */
  note: string;
}

export const TRAIT_NOTE_MAX = 400;
/** At most this many picks in one group, so a hero stays a person and not a list. */
export const TRAIT_PICKS_MAX = 4;

/** Known picks only, per group capped and without repeats; empty groups dropped. Null: nothing set at all. */
export function cleanTraits(raw: unknown): HeroTraits | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as { picks?: unknown; note?: unknown };
  const picks: Record<string, string[]> = {};
  const src = r.picks && typeof r.picks === 'object' && !Array.isArray(r.picks) ? (r.picks as Record<string, unknown>) : {};
  for (const g of TRAIT_GROUPS) {
    const list = src[g.id];
    if (!Array.isArray(list)) continue;
    const ids = g.options.map((x) => x.id).filter((id) => list.includes(id)).slice(0, TRAIT_PICKS_MAX);
    if (ids.length) picks[g.id] = ids;
  }
  const note = typeof r.note === 'string' ? r.note.trim().slice(0, TRAIT_NOTE_MAX) : '';
  return Object.keys(picks).length || note ? { picks, note } : null;
}

/** The traits as plain English lines for the Dungeon Master, one per group that has picks, then the note. */
export function traitLines(t: HeroTraits | null | undefined): string[] {
  const c = cleanTraits(t);
  if (!c) return [];
  const lines = TRAIT_GROUPS.flatMap((g) => {
    const ids = c.picks[g.id];
    return ids ? [`${g.title.en}: ${ids.map((id) => g.options.find((x) => x.id === id)!.text.en).join(', ')}`] : [];
  });
  if (c.note) lines.push(`In the player's words: ${c.note}`);
  return lines;
}

/** The traits as a short readable text in the player's language, for the sheet and My heroes. */
export function traitText(t: HeroTraits | null | undefined, lang: Lang): string {
  const c = cleanTraits(t);
  if (!c) return '';
  const words = TRAIT_GROUPS.flatMap((g) => (c.picks[g.id] ?? []).map((id) => g.options.find((x) => x.id === id)!.text[lang]));
  return [words.join(', '), c.note].filter(Boolean).join('. ');
}
