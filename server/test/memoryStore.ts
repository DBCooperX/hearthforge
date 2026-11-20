// Stands in for the SQLite store, which the test runner cannot load.
import type { BinRow } from '../src/db';
import type { InternalState } from '../src/game/engine';

export class MemoryStore {
  saved = new Map<string, string>();
  bins: (BinRow & { payload: string })[] = [];
  private seq = 0;
  load(room: string) { const s = this.saved.get(room); return s ? (JSON.parse(s) as InternalState) : undefined; }
  save(room: string, state: InternalState) { this.saved.set(room, JSON.stringify(state)); }
  names() { return [...this.saved.keys()]; }
  delete(room: string) { this.saved.delete(room); }
  binAdd(owner: string, deletedAt: number, meta: string, payload: string) { const id = ++this.seq; this.bins.push({ id, owner, deletedAt, meta, payload }); return id; }
  binList(owner?: string): BinRow[] { return this.bins.filter((b) => owner === undefined || b.owner === owner).sort((a, b) => b.id - a.id).map(({ payload: _p, ...row }) => row); }
  binPayload(id: number) { return this.bins.find((b) => b.id === id)?.payload; }
  binDrop(id: number) { this.bins = this.bins.filter((b) => b.id !== id); }
  close() {}
}
