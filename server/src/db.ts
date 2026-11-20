// SQLite persistence: one JSON snapshot per room, so a restart resumes the adventure.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { InternalState } from './game/engine';

export interface BinRow { id: number; owner: string; deletedAt: number; meta: string }

export class Store {
  private db: DatabaseSync;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(join(dataDir, 'hearthforge.db'));
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS rooms (
      room TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    // Deleted tables wait here, so a table deleted by mistake can come back. `meta` is what the
    // list shows, `payload` is the whole table with the heroes' stats.
    this.db.exec(`CREATE TABLE IF NOT EXISTS deleted_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT NOT NULL,
      deleted_at INTEGER NOT NULL,
      meta TEXT NOT NULL,
      payload TEXT NOT NULL
    )`);
  }

  load(room: string): InternalState | undefined {
    const row = this.db.prepare('SELECT state FROM rooms WHERE room = ?').get(room) as { state: string } | undefined;
    if (!row) return undefined;
    try {
      return JSON.parse(row.state) as InternalState;
    } catch {
      return undefined;
    }
  }

  save(room: string, state: InternalState) {
    this.db
      .prepare(
        `INSERT INTO rooms (room, state, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(room) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
      )
      .run(room, JSON.stringify(state));
  }

  /** Every saved table. */
  names(): string[] {
    return (this.db.prepare('SELECT room FROM rooms ORDER BY updated_at').all() as { room: string }[]).map((r) => r.room);
  }

  /** When each table was last saved and how large it is, for the Innkeeper. */
  info(): { room: string; savedAt: string; bytes: number }[] {
    const rows = this.db.prepare('SELECT room, updated_at AS at, length(state) AS bytes FROM rooms').all() as { room: string; at: string; bytes: number }[];
    return rows.map((r) => ({ room: r.room, savedAt: `${r.at.replace(' ', 'T')}Z`, bytes: Number(r.bytes) }));
  }

  delete(room: string) {
    this.db.prepare('DELETE FROM rooms WHERE room = ?').run(room);
  }

  /** Put a deleted table in the bin. Returns its number there. */
  binAdd(owner: string, deletedAt: number, meta: string, payload: string): number {
    const r = this.db.prepare('INSERT INTO deleted_tables (owner, deleted_at, meta, payload) VALUES (?, ?, ?, ?)').run(owner, deletedAt, meta, payload);
    return Number(r.lastInsertRowid);
  }

  /** What is in the bin, newest first: one owner's tables, or everybody's. */
  binList(owner?: string): BinRow[] {
    const sql = `SELECT id, owner, deleted_at AS deletedAt, meta FROM deleted_tables ${owner === undefined ? '' : 'WHERE owner = ?'} ORDER BY id DESC`;
    const rows = (owner === undefined ? this.db.prepare(sql).all() : this.db.prepare(sql).all(owner)) as { id: number; owner: string; deletedAt: number; meta: string }[];
    return rows.map((r) => ({ id: Number(r.id), owner: r.owner, deletedAt: Number(r.deletedAt), meta: r.meta }));
  }

  binPayload(id: number): string | undefined {
    return (this.db.prepare('SELECT payload FROM deleted_tables WHERE id = ?').get(id) as { payload: string } | undefined)?.payload;
  }

  binDrop(id: number) {
    this.db.prepare('DELETE FROM deleted_tables WHERE id = ?').run(id);
  }

  close() {
    this.db.close();
  }
}
