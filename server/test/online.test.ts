import { describe, expect, it } from 'vitest';
import { JOIN_ERRORS } from '../../shared/types';
import { Game } from '../src/game/engine';
import { onlineList } from '../src/online';

describe('solo tables', () => {
  it('stay closed to everyone but their owner', () => {
    const g = new Game('solo', () => 0.5);
    g.s.table = { ...g.s.table, maxPlayers: 1, code: null };
    g.seat('owner', 'k1', 'Chris');
    expect(() => g.seat('other', 'k2', 'Mira')).toThrow(JOIN_ERRORS.soloClosed);
    // Even with a code, and even once the owner has gone: the seat stays theirs.
    g.s.table.code = 'ABC23';
    expect(() => g.seat('other', 'k2', 'Mira', 'ABC23')).toThrow(JOIN_ERRORS.soloClosed);
    expect(g.seat('owner', 'k1', 'Chris').id).toBe('owner');
    expect(() => g.seat('owner', 'wrong-key', 'Chris')).toThrow(JOIN_ERRORS.seatTaken);
  });

  it('does not lock out a seat on a table with several seats', () => {
    const g = new Game('party', () => 0.5);
    g.seat('a', 'k1', 'Chris');
    g.seat('b', 'k2', 'Mira');
    expect(g.s.players).toHaveLength(2);
  });
});

describe('who is online', () => {
  const room = (name: string, ...seated: string[]) => ({ name, title: `T ${name}`, sits: (id: string) => seated.includes(id) });
  const conns = [
    { accountId: 'a', account: 'Anna', room: room('t1', 'a', 'b') },
    { accountId: 'a', account: 'Anna' }, // second tab in the lobby
    { accountId: 'b', account: 'Ben', room: room('t1', 'a', 'b') },
    { accountId: 'c', account: 'Cleo', room: room('t2', 'c') },
    { accountId: 'd', account: 'Dan' },
    { account: 'ghost' }, // not signed in
  ];

  it('lists each account once, at a table when they are at one', () => {
    const list = onlineList(conns, { id: 'd', innkeeper: false });
    expect(list.map((o) => o.name)).toEqual(['Anna', 'Ben', 'Cleo', 'Dan']);
    expect(list.find((o) => o.id === 'a')).toMatchObject({ seated: true });
  });

  it('tells players the table only of those who sit at one of their own', () => {
    const list = onlineList(conns, { id: 'a', innkeeper: false });
    expect(list.find((o) => o.id === 'b')).toMatchObject({ table: 't1', tableTitle: 'T t1' });
    expect(list.find((o) => o.id === 'c')).toMatchObject({ seated: true, table: null, tableTitle: null });
    expect(list.find((o) => o.id === 'd')).toMatchObject({ seated: false, table: null });
  });

  it('shows the Innkeeper every table', () => {
    const list = onlineList(conns, { id: 'd', innkeeper: true });
    expect(list.find((o) => o.id === 'c')).toMatchObject({ table: 't2', tableTitle: 'T t2' });
  });
});
