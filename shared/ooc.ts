// Out-of-character questions to the Dungeon Master. A story line that opens with "to DM:",
// "an SL:", "Spielleiter:" or "OOC:" is a question to the person behind the screen, not
// something a hero says or does, so it gets a plain answer instead of a scene.

/** Forms that are unmistakable even without a colon: "to DM how many coins…", "an den Spielleiter, wie…". */
const ADDRESSED = /^\s*(?:@|(?:to|an|at)\s+(?:the\s+|den\s+|die\s+)?)(?:dungeon\s*master|spielleiter(?:in|ung)?|dm|sl)\b\s*[:,\-–—]?\s*/i;
/** Bare labels that need a colon (or brackets), so that "DM the door" stays a story action. */
const LABELLED = /^\s*(?:[(\[]\s*(?:ooc|ot|dm|sl)\s*[)\]]\s*[:,\-–—]?|(?:ooc|ot|dm|sl|dungeon\s*master|spielleiter(?:in|ung)?|frage\s+an\s+(?:den\s+)?(?:sl|spielleiter(?:in)?|dm))\s*:)\s*/i;

/** The question without its label, or null when the line is an ordinary story line. */
export function parseOoc(text: string): string | null {
  const m = ADDRESSED.exec(text) ?? LABELLED.exec(text);
  if (!m) return null;
  const rest = text.slice(m[0].length).trim();
  return rest || null;
}
