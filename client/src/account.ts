// The account this browser is signed in to. "Remember me" keeps the session in localStorage for a
// month; otherwise it lives in sessionStorage and ends with the tab (and on the server after a day).
import { useCallback, useEffect, useState } from 'react';
import type { AccountView, Profile } from '../../shared/accounts';
import { legacyIdentity, setPlayerId } from './net';

const KEY = 'hearthforge.session';
const CLAIMED_KEY = 'hearthforge.claimed';
export const SESSION_HEADER = 'x-hearthforge-session';
/** For browsers that refuse storage: the session of this tab. */
let memory = '';

export function accountSession(): string {
  try { return localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY) ?? memory; } catch { return memory; }
}

function storeSession(token: string, remember: boolean) {
  memory = token;
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
    if (token) (remember ? localStorage : sessionStorage).setItem(KEY, token);
  } catch { /* lasts until the tab closes */ }
}

export class AccountFail extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

export async function accountCall<T = unknown>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/account${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      headers: { [SESSION_HEADER]: accountSession(), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AccountFail('offline', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AccountFail(String(data?.error ?? 'failed'), res.status);
  return data as T;
}

const listeners = new Set<() => void>();
/** Anything that finds the session has ended (the server says so) calls this, and every view signs out. */
export function signedOut() {
  storeSession('', false);
  for (const fn of listeners) fn();
}

export interface AccountState {
  /** Undefined while the server is asked, null when nobody is signed in. */
  profile: Profile | null | undefined;
  account: AccountView | null;
  /** Seats this browser had before accounts that just moved to the account, to say so once. */
  claimed: { table: string; title: string; heroes: string[] }[];
  signIn: (session: string, remember: boolean) => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
}

/** Seats from before accounts that this browser can prove are its own move to the account, once. */
async function claimOldSeats(): Promise<AccountState['claimed']> {
  const old = legacyIdentity();
  if (!old) return [];
  try { if (localStorage.getItem(CLAIMED_KEY) === old.playerId) return []; } catch { /* try anyway */ }
  try {
    const { claimed } = await accountCall<{ claimed: AccountState['claimed'] }>('/claim', old);
    try { localStorage.setItem(CLAIMED_KEY, old.playerId); } catch { /* asked again next time, harmlessly */ }
    return claimed;
  } catch {
    return [];
  }
}

export function useAccount(): AccountState {
  const [profile, setProfile] = useState<Profile | null | undefined>(accountSession() ? undefined : null);
  const [claimed, setClaimed] = useState<AccountState['claimed']>([]);

  const refresh = useCallback(async () => {
    if (!accountSession()) { setProfile(null); return; }
    try {
      const p = await accountCall<Profile>('/me');
      setPlayerId(p.account.id);
      setProfile(p);
    } catch (err) {
      if (err instanceof AccountFail && err.status === 401) { storeSession('', false); setProfile(null); }
      // The server is away (a restart): try again shortly, the session is still good.
      else setTimeout(() => void refresh(), 3000);
    }
  }, []);

  useEffect(() => {
    void refresh().then(async () => { if (accountSession()) setClaimed(await claimOldSeats()); });
    const fn = () => setProfile(null);
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, [refresh]);

  const signIn = useCallback(async (session: string, remember: boolean) => {
    storeSession(session, remember);
    // Seats move before the lobby is shown, so it already lists them as this account's.
    const moved = await claimOldSeats();
    await refresh();
    setClaimed(moved);
  }, [refresh]);

  const signOut = useCallback(() => {
    void accountCall('/logout', {}).catch(() => {});
    storeSession('', false);
    // A fresh page drops every connection and seat this tab had.
    location.reload();
  }, []);

  return { profile, account: profile?.account ?? null, claimed, signIn, signOut, refresh };
}
