// Player credits: what the AI costs, per account, in the one currency the Innkeeper chose. The Innkeeper books what
// a player has paid in; the server takes off what that player's share of the Dungeon Master (Claude) and the
// narrator (ElevenLabs or OpenAI voices) cost. When credits are switched on, a player whose credit is used up cannot
// start anything that calls the AI until it is topped up. Innkeepers, and accounts marked "free", are never stopped.

/** How the Innkeeper set credits up. Saved in the data folder; changes apply at once. */
export interface CreditConfig {
  /** Off: costs are still counted per account, but nobody is stopped. */
  on: boolean;
  /** The one currency for every price and amount: AI costs, credit, picture prices and the budget. An ISO code. */
  currency: string;
  /** Units of that currency per US dollar, fixed by the Innkeeper. The AI providers bill in dollars, so this is the
   *  only place a conversion happens. Always 1 for USD. */
  rate: number;
  /** The early warning: a player is told once their credit falls below this amount. */
  warn: number;
  /** What the narrator costs, in dollars per 1000 characters read aloud. Piper costs nothing. */
  voiceUsdPer1k: { elevenlabs: number; openai: number };
}

export const DEFAULT_CREDIT_CONFIG: CreditConfig = {
  on: false,
  currency: 'USD',
  rate: 1,
  warn: 2,
  // ElevenLabs Turbo v4 is $0.04 per 1000 characters; OpenAI's mini voice is about $0.015.
  voiceUsdPer1k: { elevenlabs: 0.04, openai: 0.015 },
};

/** One payment the Innkeeper booked. A negative amount corrects a mistake or pays money back. */
export interface TopUp { at: number; amount: number; note: string }

/** An account's credit, as the player and the Innkeeper see it. Amounts are in the global currency. */
export interface CreditView {
  currency: string;
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
  warn: number;
}

/** An account in the Innkeeper's list of credits. */
export interface CreditRow extends CreditView {
  id: string;
  username: string;
  role: 'player' | 'innkeeper';
  spentClaude: number;
  spentVoice: number;
  /** Story illustrations. */
  spentImages: number;
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

/** The currency and fixed rate (units per US dollar) every price is shown in. */
export interface Money { currency: string; rate: number }

export const CURRENCY_CODE = /^[A-Z]{3}$/;

/** An amount already in `currency`: `$1.50` for dollars, `CHF 1.50` for the rest. Tiny prices get a third decimal. */
export function fmtAmount(n: number, currency: string, small = false): string {
  const digits = small && Math.abs(n) < 0.1 ? 3 : 2;
  const v = (Math.round(n * Math.pow(10, digits)) / Math.pow(10, digits)).toFixed(digits);
  return currency === 'USD' ? `$${v}` : `${currency} ${v}`;
}

/** A price the providers quote in dollars, shown in the global currency. */
export const fmtUsd = (usd: number, m: Money, small = false) => fmtAmount(usd * m.rate, m.currency, small);
