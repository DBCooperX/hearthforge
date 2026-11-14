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

  close() {
    this.db.close();
  }
}
