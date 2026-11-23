// The server's own icons, painted by the picture service the Innkeeper set up (Gemini by default), four to a sheet so
// they share one look and cost a quarter as much. Every icon the game can show is one "subject": an item slot or a
// skill, spell, feat or feature picture. Subjects that look the same share one icon, the way they shared one picture
// in the older icon set, so the list is the distinct pictures of shared/art.ts and shared/glyphs.ts.
import { GAME_ICON_PATHS } from './art';
import { GLYPH_PATHS } from './glyphs';

export interface IconSubject {
  /** Stable id of the picture (for now the older set's file name, such as "lorc/fire-ray"). */
  id: string;
  /** What it shows, in English, from that name: "fire ray". */
  name: string;
  /** The slots that show it: item slots ("longsword") and picture keys ("spell:fire_bolt"). */
  slots: string[];
}

const humanize = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

function subjects(): IconSubject[] {
  const by = new Map<string, string[]>();
  for (const [slot, path] of [...Object.entries(GAME_ICON_PATHS), ...Object.entries(GLYPH_PATHS)]) {
    const list = by.get(path) ?? [];
    list.push(slot);
    by.set(path, list);
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([id, slots]) => ({ id, name: humanize(id.split('/').pop() ?? id).replace(/ \d+$/, ''), slots }));
}

export const ICON_SUBJECTS: IconSubject[] = subjects();
export const ICON_SUBJECT_BY_ID = new Map(ICON_SUBJECTS.map((s) => [s.id, s]));

/** A slot in words for the painter: "spell:fire_bolt" is "the spell fire bolt", "longsword" is "the item longsword". */
export function slotWords(slot: string): string {
  const [kind, id] = slot.includes(':') ? slot.split(':') : ['item', slot];
  const what: Record<string, string> = { spell: 'the spell', skill: 'the skill', feat: 'the feat', feature: 'the class feature', class: 'the class', ability: 'the ability', school: 'the school of magic', condition: 'the condition', action: 'the action', place: 'a place:', shop: 'a merchant:', ui: 'the button', item: 'the item' };
  return `${what[kind] ?? kind} ${humanize(id.replace(/^(style|trait)_/, ''))}`;
}

/** The one look every icon shares. It follows the hero portraits and battle figures, so the game looks of a piece. */
export const ICON_STYLE = 'Painted fantasy game icons in the same look as Hearthforge\'s hero portraits: oil brushwork over a fine ink underdrawing, rich but muted colours, warm candlelit light from the upper left, a bold clean silhouette with a thin dark outline so it still reads when shown very small. Each icon is one simple object or symbol, centred, seen straight on, filling about three quarters of its square with a clear margin all round. No scenery, no ground, no cast shadow.';

/** The flat colour icons are painted on, which the browser takes out again (image models cannot paint transparency). */
export const ICON_BACKDROP = 'Background: one perfectly flat, uniform pure magenta (#FF00FF) colour filling the whole image edge to edge, no gradient, no texture, no vignette. Do not use that magenta anywhere on the icons. No text, no letters, no numbers, no labels, no frame, no border, no grid lines, no watermark, no signature.';

const describe = (s: IconSubject) => `${s.name} (shown for ${s.slots.slice(0, 3).map(slotWords).join(', ')})`;

/** The prompt for one sheet: four subjects in a 2 by 2 grid, or four takes of one subject. */
export function iconSheetPrompt(subjects: IconSubject[], hint = ''): string {
  const extra = hint ? ` Make it look like this: ${hint}.` : '';
  if (subjects.length === 1) {
    return `${ICON_STYLE} Paint four different takes of the same icon, arranged in a 2 by 2 grid of four equal squares with wide empty gaps between them: ${describe(subjects[0])}.${extra} Each take must stay entirely inside its own quarter of the picture. ${ICON_BACKDROP}`;
  }
  const places = ['top left', 'top right', 'bottom left', 'bottom right'];
  const list = subjects.map((s, i) => `${places[i]}: ${describe(s)}`).join('; ');
  return `${ICON_STYLE} Paint four separate icons in one picture, arranged in a 2 by 2 grid of four equal squares with wide empty gaps between them. ${list}. Each icon must stay entirely inside its own quarter of the picture.${subjects.length < 4 ? ' Leave the remaining quarters empty.' : ''} ${ICON_BACKDROP}`;
}

/** One painted icon as the Innkeeper sees it. */
export interface IconView {
  id: string;
  name: string;
  slots: string[];
  /** The picture in use, or none yet. `rect` cuts it out of its sheet. */
  src?: string;
  rect?: { x: number; y: number; w: number; h: number };
  /** Being painted now. */
  painting: boolean;
  /** Switched off: the game shows the older icon or the emoji. */
  disabled?: boolean;
  /** Other takes to choose from, from a repaint. */
  takes?: { sheet: string; cell: number; src: string; rect: { x: number; y: number; w: number; h: number } }[];
  error?: string;
}

export interface IconLibraryView {
  /** A picture service with a key is set up. */
  canPaint: boolean;
  /** Which one, for the price line: "gemini gemini-3.1-flash-image". */
  painter: string;
  usdPerSheet: number;
  icons: IconView[];
  /** Subjects without an icon, and sheets waiting to be painted. */
  missing: number;
  queued: number;
  /** Dollars spent on icons so far. */
  usd: number;
}

/** What painting the missing icons costs: four to a sheet. */
export const sheetsFor = (icons: number) => Math.ceil(icons / 4);
