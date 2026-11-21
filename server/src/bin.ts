// The bin for deleted tables. A table that is deleted is not gone at once: its whole saved state,
// with the stats of its heroes, waits here so the host (or the Innkeeper) can bring it back. Each
// host keeps their last BIN_KEEP deleted tables; an eleventh pushes the oldest out for good.
import { BIN_KEEP, isAccountId, type BinItem, type HeroStats } from '../../shared/accounts';
import type { InternalState } from './game/engine';
import type { Accounts } from './accounts';
import type { BinRow } from './db';

/** The part of the store the bin needs; the SQLite store has it, and so does the one the tests use. */
export interface BinStore {
  binAdd(owner: string, deletedAt: number, meta: string, payload: string): number;
  binList(owner?: string): BinRow[];
  binPayload(id: number): string | undefined;
  binDrop(id: number): void;
  save(room: string, state: InternalState): void;
}

type Meta = Omit<BinItem, 'id' | 'owner' | 'ownerName'>;
interface Payload { state: InternalState; heroStats: Record<string, HeroStats[]> }

export class BinError extends Error {
  constructor(readonly code: 'not_found' | 'forbidden') { super(code); }
}

export class TableBin {
  constructor(private store: BinStore, private accounts: Pick<Accounts, 'takeHeroes' | 'giveHeroes' | 'get'>, private now: () => number = Date.now) {}

  /** Put a table in the bin. `by` is the name of whoever deleted it. Returns the bin number. */
  add(state: InternalState, by: string): number {
    const host = state.hostId && isAccountId(state.hostId) ? state.hostId : '';
    // The table's heroes leave the players' profiles now; a restore brings them back.
    const heroStats = this.accounts.takeHeroes(state.room);
    const meta: Meta = {
      title: state.table.title,
      language: state.language,
      deletedAt: this.now(),
      deletedBy: by,
      players: state.players.map((p) => p.name),
      heroes: state.characters.map((c) => c.name),
      playing: state.phase !== 'lobby',
    };
    const id = this.store.binAdd(host, meta.deletedAt, JSON.stringify(meta), JSON.stringify({ state, heroStats } satisfies Payload));
    // The oldest ones beyond the limit are deleted for good.
    for (const row of this.store.binList(host).slice(BIN_KEEP)) this.store.binDrop(row.id);
    return id;
  }

  /** One host's deleted tables, or all of them (for the Innkeeper), newest first. */
  list(owner?: string): BinItem[] {
    return this.store.binList(owner).map((r) => ({
      ...(JSON.parse(r.meta) as Meta),
      id: r.id,
      owner: r.owner,
      ownerName: (r.owner && this.accounts.get(r.owner)?.username) || '',
    }));
  }

  private row(id: number, by: { id: string; innkeeper: boolean }): BinRow {
    const row = this.store.binList().find((r) => r.id === id);
    if (!row) throw new BinError('not_found');
    if (!by.innkeeper && row.owner !== by.id) throw new BinError('forbidden');
    return row;
  }

  /**
   * Bring a table back. The caller opens a room for the id it gets. The table keeps its old id
   * unless another table has taken it since (`taken`), then it gets the next free one.
   */
  restore(id: number, by: { id: string; innkeeper: boolean }, taken: (room: string) => boolean, codeTaken: (code: string) => boolean): { room: string; title: string } {
    const row = this.row(id, by);
    const raw = this.store.binPayload(id);
    if (!raw) throw new BinError('not_found');
    const { state, heroStats } = JSON.parse(raw) as Payload;
    let room = state.room;
    if (taken(room)) {
      const base = room.slice(0, 28);
      for (let n = 2; ; n++) { room = `${base}-${n}`; if (!taken(room)) break; }
    }
    state.room = room;
    // An invite code another table uses now would let people into the wrong table.
    if (state.table.code && codeTaken(state.table.code)) state.table.code = null;
    this.store.save(room, state);
    this.accounts.giveHeroes(heroStats, room, state.table.title);
    this.store.binDrop(row.id);
    return { room, title: state.table.title };
  }

  /** Delete a table in the bin for good. */
  purge(id: number, by: { id: string; innkeeper: boolean }) {
    this.store.binDrop(this.row(id, by).id);
  }
}
