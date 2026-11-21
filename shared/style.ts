// How the Dungeon Master runs the table: its tone, how strictly it plays the rules and what content is allowed.
// The host sets it in the table room (and may change it during play); the Innkeeper sets the defaults for new tables.
import type { Lang } from './i18n';

type L = Record<Lang, string>;

export const TONES = ['heroic', 'grim', 'comedic', 'cozy', 'mysterious'] as const;
export type Tone = (typeof TONES)[number];
export const RATINGS = ['family', 'teen', 'mature'] as const;
export type Rating = (typeof RATINGS)[number];
/** 1 is coaching, 3 balanced, 5 strict. */
export const RULES_MIN = 1;
export const RULES_MAX = 5;

export interface DmStyle {
  tone: Tone;
  rules: number;
  rating: Rating;
}

export const DEFAULT_STYLE: DmStyle = { tone: 'heroic', rules: 3, rating: 'teen' };

export interface StyleInfo<T extends string> {
  id: T;
  icon: string;
  label: L;
  blurb: L;
  /** What the Dungeon Master is told. English only. */
  prompt: string;
}

export const TONE_INFO: StyleInfo<Tone>[] = [
  {
    id: 'heroic', icon: '🛡️',
    label: { en: 'Heroic', de: 'Heldenhaft' },
    blurb: { en: 'Bold deeds, clear stakes and a world worth saving.', de: 'Kühne Taten, klare Einsätze und eine Welt, die es zu retten lohnt.' },
    prompt: 'Heroic adventure. Brave deeds matter and are noticed, good triumphs through effort, and even dark moments carry hope. Describe action with vigour.',
  },
  {
    id: 'grim', icon: '🕯️',
    label: { en: 'Grim', de: 'Düster' },
    blurb: { en: 'A hard, dangerous world where victory costs something.', de: 'Eine harte, gefährliche Welt, in der jeder Sieg etwas kostet.' },
    prompt: 'Grim and gritty. The world is hard and dangerous, resources are scarce, wounds and losses weigh on people, and victories cost something. Keep the prose sober and atmospheric, with little comic relief.',
  },
  {
    id: 'comedic', icon: '🎭',
    label: { en: 'Comedic', de: 'Humorvoll' },
    blurb: { en: 'Absurd, witty and fond of a good joke.', de: 'Absurd, witzig und immer für einen guten Scherz zu haben.' },
    prompt: 'Comedic and playful. Lean into absurd situations, dry wit, eccentric characters and running gags, while the story still hangs together and the dice still matter. Never mock the players themselves.',
  },
  {
    id: 'cozy', icon: '🍲',
    label: { en: 'Cozy', de: 'Gemütlich' },
    blurb: { en: 'Warm, gentle stories about people, places and small wonders.', de: 'Warme, sanfte Geschichten über Menschen, Orte und kleine Wunder.' },
    prompt: 'Cozy and warm. Favour friendship, food, local colour, small mysteries and gentle wonder. Danger exists but is rarely deadly, and conflicts are more often solved by kindness and cleverness than by blood.',
  },
  {
    id: 'mysterious', icon: '🔍',
    label: { en: 'Mysterious', de: 'Geheimnisvoll' },
    blurb: { en: 'Secrets, clues and an uneasy sense that something is hidden.', de: 'Geheimnisse, Hinweise und das ungute Gefühl, dass etwas verborgen bleibt.' },
    prompt: 'Mysterious and uncanny. Plant clues and secrets, reward curiosity and keep some questions unanswered. Let strange details build up over the session, one at a time and always against a clear, ordinary scene, and build suspense through what is hinted at rather than shown.',
  },
];

export const RATING_INFO: StyleInfo<Rating>[] = [
  {
    id: 'family', icon: '🌼',
    label: { en: 'Family', de: 'Familie' },
    blurb: { en: 'Suitable for all ages: peril without gore or dark themes.', de: 'Für alle Altersstufen: Gefahr ohne Blut und düstere Themen.' },
    prompt: 'Content rating: family. Suitable for children. Fights are described without gore, defeated foes flee, fall or are knocked out, and there is no graphic violence, torture, sexual content, drug use or crude language. Keep fear mild and always leave the heroes a way forward.',
  },
  {
    id: 'teen', icon: '⚔️',
    label: { en: 'Teen', de: 'Jugendfrei' },
    blurb: { en: 'Classic fantasy: fights and death, but little gore and no explicit content.', de: 'Klassische Fantasy: Kämpfe und Tod, aber wenig Blut und nichts Explizites.' },
    prompt: 'Content rating: teen. Classic fantasy adventure. Combat and death are allowed and described briefly, with little gore. No graphic violence, torture, sexual content or hard drug use, and only mild language.',
  },
  {
    id: 'mature', icon: '🩸',
    label: { en: 'Mature', de: 'Ab 18' },
    blurb: { en: 'Darker themes and visceral fights; still nothing sexually explicit.', de: 'Düstere Themen und derbe Kämpfe; weiterhin nichts Sexuelles.' },
    prompt: 'Content rating: mature. Darker themes such as cruelty, loss, war and moral horror are allowed, and fights may be visceral and bloody. Handle them with purpose, not for shock. Never write sexually explicit content, and never write sexual violence or harm to children.',
  },
];

/** Stops of the rules slider, from forgiving to unforgiving. */
export const RULES_INFO: { value: number; label: L; blurb: L; prompt: string }[] = [
  {
    value: 1, label: { en: 'Coaching', de: 'Anleitung' },
    blurb: { en: 'Teaches as you play: hints, options and second chances. Good for newcomers.', de: 'Lehrt beim Spielen: Hinweise, Optionen und zweite Chancen. Gut für Neulinge.' },
    prompt: 'Rules style: coaching. These players may be new to the game. Name the relevant ability or skill when you call for a check and say briefly why, point out options they may not have noticed, and keep the first suggested actions simple. Prefer lower difficulty classes (about 3 below the typical ones), call for checks only when they add something, give failures an interesting way forward, and warn clearly before a deadly risk. Heroes rarely die when the players had no warning.',
  },
  {
    value: 2, label: { en: 'Gentle', de: 'Sanft' },
    blurb: { en: 'Forgiving: lower difficulties, clear warnings and soft failures.', de: 'Nachsichtig: leichtere Schwierigkeiten, klare Warnungen und weiche Fehlschläge.' },
    prompt: 'Rules style: gentle. Be forgiving. Prefer difficulty classes about 2 below the typical ones, warn before serious danger, let failures cost time, comfort or resources rather than the whole attempt, and let clever ideas succeed easily.',
  },
  {
    value: 3, label: { en: 'Balanced', de: 'Ausgewogen' },
    blurb: { en: 'The default: fair difficulties, real risk, no hand-holding.', de: 'Der Standard: faire Schwierigkeiten, echtes Risiko, kein Händchenhalten.' },
    prompt: 'Rules style: balanced. Use the typical difficulty classes, treat failures as real setbacks, and let consequences follow from the fiction. Give players the information a careful hero would notice, but do not explain the rules unless asked.',
  },
  {
    value: 4, label: { en: 'Firm', de: 'Streng' },
    blurb: { en: 'Little mercy: risks are real, enemies play smart and plans matter.', de: 'Wenig Gnade: Risiken sind echt, Gegner spielen klug und Pläne zählen.' },
    prompt: 'Rules style: firm. Use difficulty classes one or two above the typical ones for rash or poorly prepared actions, give no warnings beyond what the heroes could plainly see, and play enemies smartly (focus fire, retreat to heal, use terrain). Reward careful planning with easier checks and let reckless choices cost dearly.',
  },
  {
    value: 5, label: { en: 'Strict', de: 'Hart' },
    blurb: { en: 'Unforgiving: the rules and the world do not bend for the heroes.', de: 'Unerbittlich: Regeln und Welt biegen sich nicht für die Helden.' },
    prompt: 'Rules style: strict. Play by the rules as written and never soften a result. Use difficulty classes at least two above the typical ones for ill-prepared actions, give no hints or second chances, let enemies play ruthlessly and as intelligently as their kind would, and let death and lasting loss happen when the dice and the choices lead there. Still stay fair: never punish players for things the fiction gave them no way to know.',
  },
];

const clampRules = (n: unknown) => Math.min(RULES_MAX, Math.max(RULES_MIN, Math.round(Number(n)) || DEFAULT_STYLE.rules));
export const isTone = (v: unknown): v is Tone => TONES.includes(v as Tone);
export const isRating = (v: unknown): v is Rating => RATINGS.includes(v as Rating);

/** A style from untrusted input (a saved game, an environment variable): anything unknown falls back to the default. */
export function cleanStyle(raw: unknown, fallback: DmStyle = DEFAULT_STYLE): DmStyle {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    tone: isTone(r.tone) ? r.tone : fallback.tone,
    rules: r.rules === undefined ? fallback.rules : clampRules(r.rules),
    rating: isRating(r.rating) ? r.rating : fallback.rating,
  };
}

/** What the Dungeon Master is told about the table's style, to be sent with every turn. */
export function styleText(style: DmStyle): string {
  const tone = TONE_INFO.find((t) => t.id === style.tone) ?? TONE_INFO[0];
  const rules = RULES_INFO.find((r) => r.value === clampRules(style.rules)) ?? RULES_INFO[2];
  const rating = RATING_INFO.find((r) => r.id === style.rating) ?? RATING_INFO[1];
  return [
    `Tone: ${tone.prompt}`,
    rules.prompt,
    rating.prompt,
    'The content rating always wins over the tone and over what a player asks for. If a player pushes past it, steer the scene elsewhere in the fiction without lecturing.',
  ].join('\n');
}

/**
 * What the challenge level changes, shown as a table under the picker so nobody has to hover:
 * one row per aspect, one cell per level (Coaching … Strict).
 */
export const CHALLENGE_ROWS: { label: L; cells: [L, L, L, L, L] }[] = [
  {
    label: { en: 'Check difficulty', de: 'Schwierigkeit der Proben' },
    cells: [
      { en: '3 easier', de: '3 leichter' }, { en: '2 easier', de: '2 leichter' }, { en: 'Standard', de: 'Standard' },
      { en: '1–2 harder if rash', de: '1–2 schwerer, wenn unbedacht' }, { en: '2+ harder if rash', de: '2+ schwerer, wenn unbedacht' },
    ],
  },
  {
    label: { en: 'Warnings before danger', de: 'Warnungen vor Gefahr' },
    cells: [
      { en: 'Always, clearly', de: 'Immer und deutlich' }, { en: 'Before serious danger', de: 'Vor ernster Gefahr' }, { en: 'What a careful hero notices', de: 'Was ein umsichtiger Held bemerkt' },
      { en: 'Only what you can see', de: 'Nur was ihr seht' }, { en: 'None', de: 'Keine' },
    ],
  },
  {
    label: { en: 'A failed check', de: 'Eine misslungene Probe' },
    cells: [
      { en: 'Opens another way', de: 'Öffnet einen anderen Weg' }, { en: 'Costs time or supplies', de: 'Kostet Zeit oder Vorräte' }, { en: 'A real setback', de: 'Ein echter Rückschlag' },
      { en: 'Costs dearly', de: 'Kostet viel' }, { en: 'No second chances', de: 'Keine zweite Chance' },
    ],
  },
  {
    label: { en: 'Rules hints', de: 'Regelhinweise' },
    cells: [
      { en: 'Names the skill and why', de: 'Nennt Fertigkeit und Grund' }, { en: 'Now and then', de: 'Ab und zu' }, { en: 'Only when asked', de: 'Nur auf Nachfrage' },
      { en: 'None', de: 'Keine' }, { en: 'None', de: 'Keine' },
    ],
  },
  {
    label: { en: 'Enemies in a fight', de: 'Gegner im Kampf' },
    cells: [
      { en: 'Spread their attacks', de: 'Verteilen ihre Angriffe' }, { en: 'Spread their attacks', de: 'Verteilen ihre Angriffe' }, { en: 'Fight sensibly', de: 'Kämpfen vernünftig' },
      { en: 'Gang up on the weakest', de: 'Gehen gemeinsam auf den Schwächsten' }, { en: 'Gang up, ruthlessly', de: 'Gehen gemeinsam und gnadenlos vor' },
    ],
  },
  {
    label: { en: 'Death of a hero', de: 'Tod eines Helden' },
    cells: [
      { en: 'Rare, only after warnings', de: 'Selten, nur nach Warnung' }, { en: 'Unlikely', de: 'Unwahrscheinlich' }, { en: 'Possible', de: 'Möglich' },
      { en: 'Likely if reckless', de: 'Wahrscheinlich bei Leichtsinn' }, { en: 'Happens', de: 'Kommt vor' },
    ],
  },
];

/** How monsters choose whom to attack at each challenge level. The server uses it when the DM names no target. */
export type TargetHabit = 'spread' | 'sensible' | 'focus';
export const targetHabit = (rules: number): TargetHabit => (clampRules(rules) <= 2 ? 'spread' : clampRules(rules) >= 4 ? 'focus' : 'sensible');

/** The line the Dungeon Master gets before running the monsters' turns. */
export function monsterTacticsText(style: DmStyle): string {
  switch (targetHabit(style.rules)) {
    case 'spread': return 'Challenge for this table is low: spread the monsters\' attacks over different heroes rather than piling onto one, and prefer the hero who was attacked least this fight. Heroes at 0 hit points are never attacked.';
    case 'focus': return 'Challenge for this table is high: monsters fight as a pack. Gang up on the most wounded or least armoured hero they can reach, finish what they started and pull back to heal when hurt.';
    default: return 'Monsters fight sensibly for their kind: they go for whoever threatens them most or is closest, and switch targets when it makes sense.';
  }
}
