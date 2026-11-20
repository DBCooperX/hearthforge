// Player credits: what the AI costs, per account, in Swiss francs. The Innkeeper books what a player has paid in;
// the server takes off what that player's share of the Dungeon Master (Claude) and the narrator (ElevenLabs or
// OpenAI voices) cost. When credits are switched on, a player whose credit is used up cannot start anything that
// calls the AI until it is topped up. Innkeepers, and accounts marked "free", are never stopped.

/** How the Innkeeper set credits up. Saved in the data folder; changes apply at once. */
export interface CreditConfig {
  /** Off: costs are still counted per account, but nobody is stopped. */
  on: boolean;
  /** Francs per US dollar. The AI providers bill in dollars. */
  chfPerUsd: number;
  /** The early warning: a player is told once their credit falls below this many francs. */
  warnChf: number;
  /** What the narrator costs, in dollars per 1000 characters read aloud. Piper costs nothing. */
  voiceUsdPer1k: { elevenlabs: number; openai: number };
}

export const DEFAULT_CREDIT_CONFIG: CreditConfig = {
  on: false,
  chfPerUsd: 0.85,
  warnChf: 2,
  // ElevenLabs Turbo v4 is $0.04 per 1000 characters; OpenAI's mini voice is about $0.015.
  voiceUsdPer1k: { elevenlabs: 0.04, openai: 0.015 },
};

/** One payment the Innkeeper booked. A negative amount corrects a mistake or pays money back. */
export interface TopUp { at: number; chf: number; note: string }

/** An account's credit, as the player and the Innkeeper see it. Amounts are in francs. */
export interface CreditView {
  /** Credits are switched on and this account can run out (not an Innkeeper, not marked free). */
  limited: boolean;
  /** Marked free by the Innkeeper: costs are counted but never stop them. */
  free: boolean;
  paid: number;
  spent: number;
  /** Paid minus spent. Can go a little below zero: a fight or reply already under way is finished. */
  balance: number;
  /** Below the warning line but not used up. */
  low: boolean;
  /** Used up: the AI will not start anything new for this account. */
  out: boolean;
  warnChf: number;
}

/** An account in the Innkeeper's list of credits. */
export interface CreditRow extends CreditView {
  id: string;
  username: string;
  role: 'player' | 'innkeeper';
  spentClaude: number;
  spentVoice: number;
  /** Spent in the last 30 days. */
  last30: number;
  topUps: TopUp[];
}

export interface CreditReport {
  config: CreditConfig;
  rows: CreditRow[];
}

/** Sent in English and translated by the browser, like the other refusals at a table. */
export const OUT_OF_CREDIT = 'Your credit is used up. Ask the innkeeper to top it up, then carry on.';

/** A sum of francs the way Swiss prices are written. */
export const chf = (n: number) => `CHF ${(Math.round(n * 100) / 100).toFixed(2)}`;
