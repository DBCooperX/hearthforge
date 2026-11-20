// Accounts: who plays on this server. A player signs in with a name and a password; the
// Innkeeper creates accounts or sends invite links, and decides who else may be an Innkeeper.
// Heroes, seats and saves belong to the account, so a player picks up their hero on any device.

export type Role = 'player' | 'innkeeper';
export const ROLES: Role[] = ['player', 'innkeeper'];

/** What an account has done at the tables. */
export interface PlayStats {
  /** Evenings at a table: sitting down after at least half an hour away counts as a new one. */
  sessions: number;
  /** Time seated at a table, in milliseconds. */
  playMs: number;
  /** Killing blows. */
  kills: number;
  crits: number;
  deaths: number;
  /** Gold the party took in while the hero was in it. */
  gold: number;
}

export const emptyPlayStats = (): PlayStats => ({ sessions: 0, playMs: 0, kills: 0, crits: 0, deaths: 0, gold: 0 });

/** One hero's stats, with enough about the hero to show it after the table is gone. */
export interface HeroStats extends PlayStats {
  table: string;
  tableTitle: string;
  heroId: string;
  name: string;
  classId: string;
  level: number;
  lastPlayed: number;
}

export interface AccountView {
  id: string;
  username: string;
  role: Role;
  createdAt: number;
  lastSeen: number;
  /** The password was made up by the server (a new account, a reset, the first Innkeeper): choose your own. */
  mustChange: boolean;
}

export interface Profile {
  account: AccountView;
  stats: PlayStats;
  heroes: HeroStats[];
}

/** An account as the Innkeeper lists it. */
export interface AccountRow extends AccountView {
  stats: PlayStats;
  heroes: number;
  /** False when the account has no password yet (restored from a backup): reset it to let them in. */
  hasPassword: boolean;
}

export interface InviteView {
  code: string;
  role: Role;
  note: string;
  createdAt: number;
  expiresAt: number;
}

/** A seat taken in a browser before accounts existed, that no account has claimed yet. */
export interface LegacySeat {
  table: string;
  tableTitle: string;
  playerId: string;
  name: string;
  heroes: string[];
  connected: boolean;
}

export const ACCOUNT_ERRORS = {
  wrong_login: 'That name or password is not right.',
  too_many: 'Too many wrong attempts. Wait a few minutes.',
  signed_out: 'You are signed out. Sign in again.',
  weak_password: 'The password needs at least 8 characters.',
  bad_name: 'A name needs 3 to 24 letters, digits, spaces, dots, dashes or underscores.',
  name_taken: 'That name is already taken.',
  bad_invite: 'This invite link is not valid any more. Ask the innkeeper for a new one.',
  last_innkeeper: 'The server needs at least one innkeeper.',
  not_yourself: 'You cannot do that to your own account.',
  not_found: 'That account does not exist any more.',
  bad_request: 'That did not work.',
  failed: 'That did not work.',
} as const;
export type AccountError = keyof typeof ACCOUNT_ERRORS;

/** Account ids start like this; the random ids browsers made before accounts never do. */
export const ACCOUNT_PREFIX = 'acc_';
export const isAccountId = (id: string) => id.startsWith(ACCOUNT_PREFIX);

export const cleanUsername = (raw: unknown) => String(raw ?? '').replace(/\s+/g, ' ').trim();
export const usernameOk = (name: string) => /^[\p{L}\p{N} _.-]{3,24}$/u.test(name);
export const PASSWORD_MIN = 8;

/** A deleted table waiting in the bin, as the lists show it. */
export interface BinItem {
  id: number;
  /** The account that hosted the table. Only they and the Innkeeper can bring it back. */
  owner: string;
  ownerName: string;
  title: string;
  language: string;
  deletedAt: number;
  /** Who deleted it, by name. */
  deletedBy: string;
  players: string[];
  heroes: string[];
  playing: boolean;
}

/** How many deleted tables each host keeps in the bin. The oldest one goes when an eleventh arrives. */
export const BIN_KEEP = 10;
