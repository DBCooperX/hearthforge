// Accounts: the first Innkeeper, signing in, invite links, roles, stats and the move of seats
// from before accounts onto accounts.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import type { ServerMessage } from '../../shared/types';
import { Accounts, AccountsError, REMEMBER_MS, SESSION_MS, hashPassword } from '../src/accounts';
import { claimSeats, legacySeats } from '../src/accountApi';
import type { Store } from '../src/db';
import { ScriptedDM } from '../src/dm/scripted';
import type { InternalState } from '../src/game/engine';
import { Room, SESSION_GAP_MS } from '../src/room';

const dir = () => mkdtempSync(join(tmpdir(), 'hf-accounts-'));
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as AccountsError).code; } return 'ok'; };

class MemoryStore {
  saved = new Map<string, string>();
  load(room: string) { const s = this.saved.get(room); return s ? (JSON.parse(s) as InternalState) : undefined; }
  save(room: string, state: InternalState) { this.saved.set(room, JSON.stringify(state)); }
  names() { return [...this.saved.keys()]; }
  delete(room: string) { this.saved.delete(room); }
  close() {}
}
function socket() {
  const sent: ServerMessage[] = [];
  const ws = { OPEN: 1, readyState: 1, send: (data: string) => { sent.push(JSON.parse(data)); } } as unknown as WebSocket;
  return { ws, sent };
}

describe('the first innkeeper', () => {
  it('takes the password from the installer, and must choose their own', () => {
    const d = dir();
    const a = new Accounts(d, { HEARTHFORGE_ADMIN_PASSWORD: 'from-installer' });
    expect(a.list()).toMatchObject([{ username: 'innkeeper', role: 'innkeeper', mustChange: true }]);
    expect(a.firstPasswordPending).toBe(true);
    expect(code(() => a.login('innkeeper', 'nope', false, 'ip'))).toBe('wrong_login');
    const { session } = a.login('Innkeeper', 'from-installer', false, 'ip');
    expect(a.isInnkeeper(session)).toBe(true);
    expect(code(() => a.changePassword(session, 'from-installer', 'short', 'ip'))).toBe('weak_password');
    a.changePassword(session, 'from-installer', 'my own secret', 'ip');
    expect(a.firstPasswordPending).toBe(false);
    // The file never holds a password, only hashes.
    expect(readFileSync(join(d, 'accounts.json'), 'utf8')).not.toContain('my own secret');
    const again = new Accounts(d, { HEARTHFORGE_ADMIN_PASSWORD: 'from-installer' });
    expect(code(() => again.login('innkeeper', 'from-installer', false, 'ip'))).toBe('wrong_login');
    expect(code(() => again.login('innkeeper', 'my own secret', false, 'ip'))).toBe('ok');
  });

  it('keeps the owner password from before accounts', () => {
    const d = dir();
    writeFileSync(join(d, 'innkeeper.json'), JSON.stringify({ password: hashPassword('the old one'), sessions: {}, bans: [], paused: [] }));
    const a = new Accounts(d, { HEARTHFORGE_ADMIN_PASSWORD: 'from-installer' });
    expect(a.firstPasswordPending).toBe(false);
    expect(code(() => a.login('innkeeper', 'the old one', false, 'ip'))).toBe('ok');
    expect(code(() => a.login('innkeeper', 'from-installer', false, 'ip'))).toBe('wrong_login');
  });

  it('makes one up when nothing was set, and leaves it for the owner', () => {
    const d = dir();
    const a = new Accounts(d, {});
    const note = a.firstPasswordNote!;
    expect(note.username).toBe('innkeeper');
    expect(readFileSync(note.file, 'utf8').trim()).toBe(note.password);
    expect(new Accounts(d, {}).firstPasswordNote!.password).toBe(note.password);
    const { session } = a.login('innkeeper', note.password, false, 'ip');
    a.changePassword(session, note.password, 'something better', 'ip');
    expect(existsSync(note.file)).toBe(false);
  });
});

describe('a forgotten owner password', () => {
  it('is replaced once by an innkeeper-reset file in the data folder', () => {
    const d = dir();
    const a = new Accounts(d, { HEARTHFORGE_ADMIN_PASSWORD: 'first one' });
    a.changePassword(a.login('innkeeper', 'first one', false, 'ip').session, 'first one', 'forgotten one', 'ip');
    writeFileSync(join(d, 'innkeeper-reset'), '');
    const b = new Accounts(d, {});
    const note = b.firstPasswordNote!;
    expect(existsSync(join(d, 'innkeeper-reset'))).toBe(false);
    expect(code(() => b.login('innkeeper', 'forgotten one', false, 'ip'))).toBe('wrong_login');
    expect(b.account(b.login('innkeeper', note.password, false, 'ip').session)).toMatchObject({ role: 'innkeeper', mustChange: true });
  });
});

describe('signing in', () => {
  it('remembers a browser for a month, and any other only for a day', () => {
    let now = 1_000_000;
    const a = new Accounts(dir(), { HEARTHFORGE_ADMIN_PASSWORD: 'right one' }, () => now);
    const short = a.login('innkeeper', 'right one', false, 'ip').session;
    const long = a.login('innkeeper', 'right one', true, 'ip').session;
    now += SESSION_MS + 1;
    expect(a.account(short)).toBeNull();
    expect(a.account(long)?.username).toBe('innkeeper');
    now += REMEMBER_MS;
    expect(a.account(long)).toBeNull();
    expect(a.account('')).toBeNull();
    expect(a.account(undefined)).toBeNull();
  });

  it('slows down guessing, per address', () => {
    let now = 0;
    const a = new Accounts(dir(), { HEARTHFORGE_ADMIN_PASSWORD: 'right one' }, () => now);
    for (let i = 0; i < 5; i++) expect(code(() => a.login('innkeeper', 'wrong', false, '1.1.1.1'))).toBe('wrong_login');
    expect(code(() => a.login('innkeeper', 'right one', false, '1.1.1.1'))).toBe('too_many');
    expect(code(() => a.login('innkeeper', 'right one', false, '2.2.2.2'))).toBe('ok');
    // An unknown name fails the same way as a wrong password, so names cannot be fished for.
    expect(code(() => a.login('nobody', 'right one', false, '3.3.3.3'))).toBe('wrong_login');
    now += 6 * 60 * 1000;
    expect(code(() => a.login('innkeeper', 'right one', false, '1.1.1.1'))).toBe('ok');
  });
});

describe('the innkeeper manages accounts', () => {
  const setup = () => {
    const a = new Accounts(dir(), { HEARTHFORGE_ADMIN_PASSWORD: 'right one' });
    const boss = a.login('innkeeper', 'right one', false, 'ip');
    return { a, me: boss.account.id };
  };

  it('creates accounts with a made-up password the player then changes', () => {
    const { a } = setup();
    const { account, password } = a.create('Mira', 'player');
    expect(password).toMatch(/^\w{4}-\w{4}-\w{4}$/);
    expect(code(() => a.create('mira', 'player'))).toBe('name_taken');
    expect(code(() => a.create('x', 'player'))).toBe('bad_name');
    const s = a.login('MIRA', password, false, 'ip').session;
    expect(a.account(s)).toMatchObject({ id: account.id, role: 'player', mustChange: true });
    a.changePassword(s, password, 'mira likes owls', 'ip');
    expect(a.account(s)?.mustChange).toBe(false);
  });

  it('sends invite links that work once and run out', () => {
    let now = 0;
    const a = new Accounts(dir(), {}, () => now);
    const inv = a.invite('player', 'for Jonas');
    expect(a.checkInvite(inv.code)).toEqual({ role: 'player' });
    expect(code(() => a.redeem(inv.code, 'Jonas', 'short', false, 'ip'))).toBe('weak_password');
    const joined = a.redeem(inv.code, 'Jonas', 'a long password', true, 'ip');
    expect(joined.account).toMatchObject({ username: 'Jonas', role: 'player', mustChange: false });
    expect(a.account(joined.session)?.username).toBe('Jonas');
    expect(code(() => a.redeem(inv.code, 'Jonas2', 'a long password', false, 'ip'))).toBe('bad_invite');
    const late = a.invite('innkeeper', '');
    now += 8 * 24 * 3600 * 1000;
    expect(a.checkInvite(late.code)).toBeNull();
    expect(a.invites()).toEqual([]);
  });

  it('keeps at least one innkeeper and never acts on its own account', () => {
    const { a, me } = setup();
    const mira = a.create('Mira', 'player').account;
    expect(code(() => a.setRole(me, 'player', me))).toBe('not_yourself');
    expect(code(() => a.remove(me, me))).toBe('not_yourself');
    a.setRole(mira.id, 'innkeeper', me);
    a.setRole(me, 'player', mira.id);
    expect(code(() => a.setRole(mira.id, 'player', me))).toBe('last_innkeeper');
    expect(code(() => a.remove(mira.id, me))).toBe('last_innkeeper');
  });

  it('resets a forgotten password and signs that account out everywhere', () => {
    const { a, me } = setup();
    const { account, password } = a.create('Mira', 'player');
    const s = a.login('Mira', password, true, 'ip').session;
    const fresh = a.reset(account.id, me);
    expect(a.account(s)).toBeNull();
    expect(code(() => a.login('Mira', password, false, 'ip'))).toBe('wrong_login');
    expect(code(() => a.login('Mira', fresh, false, 'ip'))).toBe('ok');
  });

  it('deletes an account and says so, so its connections can be closed', () => {
    const { a, me } = setup();
    const gone: string[] = [];
    a.onDeleted = (id) => void gone.push(id);
    const { account, password } = a.create('Mira', 'player');
    const s = a.login('Mira', password, true, 'ip').session;
    a.remove(account.id, me);
    expect(gone).toEqual([account.id]);
    expect(a.account(s)).toBeNull();
  });

  it('puts accounts in a backup without passwords, and brings missing ones back', () => {
    const { a } = setup();
    a.create('Mira', 'player');
    const exported = a.exportable();
    expect(JSON.stringify(exported)).not.toMatch(/password"/);
    const other = new Accounts(dir(), { HEARTHFORGE_ADMIN_PASSWORD: 'x'.repeat(10) });
    expect(other.restore(exported)).toBe(1); // the innkeeper is there already, by name
    expect(other.list().find((r) => r.username === 'Mira')).toMatchObject({ hasPassword: false, mustChange: true });
  });
});

describe('stats', () => {
  it('counts per account and per hero', () => {
    const a = new Accounts(dir(), {});
    const { account } = a.create('Mira', 'player');
    const hero = { table: 'friday', tableTitle: 'Friday night', id: 'c1', name: 'Brann', classId: 'fighter', level: 2 };
    a.credit(account.id, { kills: 1, crits: 1 }, [hero]);
    a.credit(account.id, { gold: 40 }, [hero, { ...hero, id: 'c2', name: 'Vex' }]);
    a.credit('browser-id', { kills: 5 }); // no account: nothing happens
    const p = a.profile(account.id)!;
    expect(p.stats).toMatchObject({ kills: 1, crits: 1, gold: 40 });
    expect(p.heroes.map((h) => [h.name, h.kills, h.gold])).toEqual(expect.arrayContaining([['Brann', 1, 40], ['Vex', 0, 40]]));
  });

  it('come from the table: sessions, play time, kills, deaths and gold, but nothing in test mode', () => {
    const credited: { id: string; delta: Record<string, number>; heroes: string[] }[] = [];
    const room = new Room('friday', new ScriptedDM(), new MemoryStore() as unknown as Store, {}, {
      stats: (id, delta, heroes) => void credited.push({ id, delta: delta as Record<string, number>, heroes: heroes.map((h) => h.name) }),
    });
    const ws = socket().ws;
    room.join(ws, 'acc_mira', 'account:acc_mira', 'Mira');
    expect(credited).toEqual([{ id: 'acc_mira', delta: { sessions: 1 }, heroes: [] }]);
    const c = room.game.addCharacter('acc_mira', 'fighter', 'Brann');
    room.game.start();
    room.flush(); // the starting purse is not earned
    room.game.tally!(c.id, 'kills');
    room.game.s.gold += 25;
    room.flush();
    expect(credited.slice(1)).toEqual([
      { id: 'acc_mira', delta: { kills: 1 }, heroes: ['Brann'] },
      { id: 'acc_mira', delta: { gold: 25 }, heroes: ['Brann'] },
    ]);
    room.game.s.testMode = { since: 0, snapshot: '{}' };
    room.game.tally!(c.id, 'deaths');
    room.game.s.gold += 500;
    room.flush();
    expect(credited).toHaveLength(3);
    room.game.s.testMode = undefined;
    room.leave(ws);
    expect(credited.at(-1)).toMatchObject({ id: 'acc_mira', heroes: ['Brann'] });
    expect(credited.at(-1)!.delta.playMs).toBeGreaterThanOrEqual(0);
    // Back within half an hour is the same session.
    room.join(ws, 'acc_mira', 'account:acc_mira', 'Mira');
    expect(credited.filter((x) => x.delta.sessions)).toHaveLength(1);
    expect(SESSION_GAP_MS).toBe(30 * 60 * 1000);
  });
});

describe('seats from before accounts', () => {
  const oldTable = () => {
    const room = new Room('friday', new ScriptedDM(), new MemoryStore() as unknown as Store);
    const a = socket(), b = socket();
    room.join(a.ws, 'old-browser-of-mira', 'mira-secret-token-123456', 'Mira');
    room.join(b.ws, 'old-browser-of-jonas', 'jonas-secret-token-12345', 'Jonas');
    room.game.addCharacter('old-browser-of-mira', 'fighter', 'Brann');
    room.leave(a.ws);
    room.leave(b.ws);
    return room;
  };

  it('move to the account when the old browser proves the seat was its own', () => {
    const room = oldTable();
    const rooms = new Map([['friday', room]]);
    expect(legacySeats(rooms).map((s) => s.name)).toEqual(['Mira', 'Jonas']);
    expect(claimSeats(rooms, 'old-browser-of-mira', 'wrong-token-1234567890', 'acc_mira', 'Mira')).toEqual([]);
    const claimed = claimSeats(rooms, 'old-browser-of-mira', 'mira-secret-token-123456', 'acc_mira', 'Mira');
    expect(claimed).toEqual([{ table: 'friday', title: room.game.s.table.title, heroes: ['Brann'] }]);
    const s = room.game.s;
    expect(s.players.map((p) => p.id)).toEqual(['acc_mira', 'old-browser-of-jonas']);
    expect(s.hostId).toBe('acc_mira');
    expect(s.characters[0].ownerId).toBe('acc_mira');
    expect(s.seats['old-browser-of-mira']).toBeUndefined();
    // The account sits down on it with its own key.
    room.join(socket().ws, 'acc_mira', 'account:acc_mira', 'Mira');
    expect(s.players.find((p) => p.id === 'acc_mira')?.connected).toBe(true);
    expect(legacySeats(rooms).map((x) => x.name)).toEqual(['Jonas']);
    // It happens once: the old id is gone.
    expect(claimSeats(rooms, 'old-browser-of-mira', 'mira-secret-token-123456', 'acc_mira', 'Mira')).toEqual([]);
  });

  it('can be handed to an account by the innkeeper, joining a seat the account already has', () => {
    const room = oldTable();
    room.join(socket().ws, 'acc_jonas', 'account:acc_jonas', 'Jonas G');
    room.game.addCharacter('acc_jonas', 'cleric', 'Ilse');
    room.game.addCharacter('old-browser-of-jonas', 'wizard', 'Vex');
    expect(room.reassign('old-browser-of-jonas', 'acc_jonas')).toBe(true);
    const s = room.game.s;
    expect(s.players.map((p) => p.name)).toEqual(['Mira', 'Jonas G']);
    expect(s.characters.filter((c) => c.ownerId === 'acc_jonas').map((c) => c.name)).toEqual(['Ilse', 'Vex']);
    expect(s.seats['old-browser-of-jonas']).toBeUndefined();
  });
});
