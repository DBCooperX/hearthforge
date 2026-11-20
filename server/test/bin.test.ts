import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { BIN_KEEP } from '../../shared/accounts';
import type { ServerMessage } from '../../shared/types';
import { Accounts } from '../src/accounts';
import { BinError, TableBin } from '../src/bin';
import type { Store } from '../src/db';
import { ScriptedDM } from '../src/dm/scripted';
import { Room } from '../src/room';
import { MemoryStore } from './memoryStore';

function rig() {
  const accounts = new Accounts(mkdtempSync(join(tmpdir(), 'hf-bin-')), { HEARTHFORGE_ADMIN_PASSWORD: 'open sesame' });
  const store = new MemoryStore();
  let clock = 1_000;
  const bin = new TableBin(store, accounts, () => clock++);
  const rooms = new Map<string, Room>();
  const open = (id: string) => {
    const room = new Room(id, new ScriptedDM(), store as unknown as Store, {}, {
      binned: (state, by) => { bin.add(state, by); },
      closed: (r) => void rooms.delete(r.name),
    });
    rooms.set(id, room);
    return room;
  };
  const sock = () => ({ OPEN: 1, readyState: 1, send: (_: string) => {} }) as unknown as WebSocket;
  /** A table with a host who has one hero, saved and listed on the host's profile. */
  const table = (id: string, title: string, host: { id: string; username: string }) => {
    const room = open(id);
    room.join(sock(), host.id, `account:${host.id}`, host.username);
    room.game.s.table.title = title;
    room.game.addCharacter(host.id, 'fighter', 'Brienne');
    const hero = room.game.s.characters[0];
    accounts.credit(host.id, { kills: 2 }, [{ table: id, tableTitle: title, id: hero.id, name: hero.name, classId: hero.classId, level: hero.level }]);
    room.saveNow();
    return room;
  };
  return { accounts, store, bin, rooms, open, table, accounts_: accounts };
}

describe('the bin for deleted tables', () => {
  it('keeps a deleted table, takes its heroes off the profile, and brings both back', () => {
    const { accounts, store, bin, rooms, table, open } = rig();
    const chris = accounts.create('Chris', 'player').account;
    const room = table('friday', 'Friday night', chris);
    expect(accounts.profile(chris.id)!.heroes).toHaveLength(1);

    room.close('Chris');
    expect(store.names()).toEqual([]);
    expect(accounts.profile(chris.id)!.heroes).toEqual([]);
    expect(accounts.profile(chris.id)!.stats.kills).toBe(2); // the player's own totals stay
    const [item] = bin.list(chris.id);
    expect(item).toMatchObject({ title: 'Friday night', deletedBy: 'Chris', ownerName: 'Chris', heroes: ['Brienne'], players: ['Chris'] });

    const out = bin.restore(item.id, { id: chris.id, innkeeper: false }, (id) => rooms.has(id), () => false);
    expect(out).toEqual({ room: 'friday', title: 'Friday night' });
    expect(bin.list(chris.id)).toEqual([]);
    const back = open(out.room);
    expect(back.game.s.characters.map((c) => c.name)).toEqual(['Brienne']);
    expect(back.game.s.hostId).toBe(chris.id);
    expect(accounts.profile(chris.id)!.heroes).toMatchObject([{ table: 'friday', tableTitle: 'Friday night', name: 'Brienne', kills: 2 }]);
  });

  it('gives a restored table a new id when its old one is taken, and drops an invite code that is in use', () => {
    const { accounts, bin, rooms, table } = rig();
    const chris = accounts.create('Chris', 'player').account;
    const room = table('friday', 'Friday night', chris);
    room.game.s.table.code = 'ABCDE';
    room.close('Chris');
    table('friday', 'A new Friday', chris); // somebody opened a table with the same id since
    const out = bin.restore(bin.list(chris.id)[0].id, { id: chris.id, innkeeper: false }, (id) => rooms.has(id), (c) => c === 'ABCDE');
    expect(out.room).toBe('friday-2');
    expect(accounts.profile(chris.id)!.heroes.map((h) => h.table).sort()).toEqual(['friday', 'friday-2']);
  });

  it('only lets the host or the Innkeeper bring a table back or delete it for good', () => {
    const { accounts, bin, table } = rig();
    const chris = accounts.create('Chris', 'player').account;
    const mira = accounts.create('Mira', 'player').account;
    table('friday', 'Friday night', chris).close('Chris');
    const id = bin.list(chris.id)[0].id;
    expect(bin.list(mira.id)).toEqual([]);
    expect(() => bin.restore(id, { id: mira.id, innkeeper: false }, () => false, () => false)).toThrow(new BinError('forbidden'));
    expect(() => bin.purge(id, { id: mira.id, innkeeper: false })).toThrow(BinError);
    expect(() => bin.purge(999, { id: chris.id, innkeeper: false })).toThrow(new BinError('not_found'));
    expect(bin.list()).toHaveLength(1); // the Innkeeper sees everybody's
    bin.purge(id, { id: 'acc_innkeeper', innkeeper: true });
    expect(bin.list()).toEqual([]);
  });

  it(`keeps each host's last ${BIN_KEEP} tables and drops the oldest`, () => {
    const { accounts, bin, table } = rig();
    const chris = accounts.create('Chris', 'player').account;
    for (let n = 1; n <= BIN_KEEP + 2; n++) table(`t${n}`, `Table ${n}`, chris).close('Chris');
    const titles = bin.list(chris.id).map((b) => b.title);
    expect(titles).toHaveLength(BIN_KEEP);
    expect(titles[0]).toBe(`Table ${BIN_KEEP + 2}`);
    expect(titles.at(-1)).toBe('Table 3');
  });

  it('does not keep a table that closes because nobody is left at it', () => {
    const { accounts, bin, table } = rig();
    const chris = accounts.create('Chris', 'player').account;
    const room = table('friday', 'Friday night', chris);
    room.handle({ OPEN: 1, readyState: 1, send: () => {} } as unknown as WebSocket, { t: 'leave_table' } as never);
    expect(bin.list()).toEqual([]);
  });

  it('renames a table and its heroes on the profile follow', () => {
    const { accounts, table } = rig();
    const chris = accounts.create('Chris', 'player').account;
    const room = table('friday', 'Friday night', chris);
    room.rename('Saturday night');
    accounts.retitle('friday', 'Saturday night');
    expect(room.game.s.table.title).toBe('Saturday night');
    expect(accounts.profile(chris.id)!.heroes[0].tableTitle).toBe('Saturday night');
  });
});

export type { ServerMessage };
