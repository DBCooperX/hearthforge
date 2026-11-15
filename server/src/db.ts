// SQLite persistence: one JSON snapshot per room, so a restart resumes the adventure.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { InternalState } from './game/engine';

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

  close() {
    this.db.close();
  }
}
