// The Heroes tab of the main screen: heroes made, rolled and copied away from any table, and where each saved hero plays.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { cleanSpec, type HeroTemplate } from '../../shared/accounts';
import { PREMADES } from '../../shared/premades';
import { ABILITY_KEYS } from '../../shared/rules';
import { Accounts } from '../src/accounts';
import { accountApi, rollScores, type AccountApiContext } from '../src/accountApi';
import type { Store } from '../src/db';
import { ScriptedDM } from '../src/dm/scripted';
import { Room } from '../src/room';

const brann = PREMADES.find((p) => p.id === 'brann')!.spec;

class MemoryStore {
  saved = new Map<string, string>();
  load(room: string) { const s = this.saved.get(room); return s ? JSON.parse(s) : undefined; }
  save(room: string, state: unknown) { this.saved.set(room, JSON.stringify(state)); }
  names() { return [...this.saved.keys()]; }
  delete(room: string) { this.saved.delete(room); }
  close() {}
}

function setup() {
  const accounts = new Accounts(mkdtempSync(join(tmpdir(), 'hf-home-')), { HEARTHFORGE_ADMIN_PASSWORD: 'secret-password' });
  const { session } = accounts.login('innkeeper', 'secret-password', false, 'ip');
  const ctx = { accounts, rooms: new Map(), ipOf: () => 'ip', tablesChanged: () => {} } as unknown as AccountApiContext;
  /** One call to /api/account/heroes, as the browser makes it. */
  const call = async (body?: Record<string, unknown>) => {
    const req = new PassThrough() as unknown as IncomingMessage & PassThrough;
    req.method = body ? 'POST' : 'GET';
    req.headers = { 'x-hearthforge-session': session };
    let status = 0;
    let out = '';
    const res = { writeHead: (s: number) => { status = s; }, end: (text: string) => { out = text; } } as unknown as ServerResponse;
    const done = accountApi(ctx, req, res, new URL('http://x/api/account/heroes'));
    req.end(body ? JSON.stringify(body) : undefined);
    await done;
    return { status, body: JSON.parse(out) as { heroes: HeroTemplate[]; rolled?: number[]; error?: string } };
  };
  return { accounts, call };
}

/** Brann with these six scores as rolled base scores. */
const rolledBrann = (scores: number[]) => ({ ...brann, method: 'roll', base: Object.fromEntries(ABILITY_KEYS.map((k, i) => [k, scores[i]])) });

describe('heroes made in the Heroes tab', () => {
  it('rolls 4d6 drop the lowest, six times', () => {
    const scores = rollScores();
    expect(scores).toHaveLength(6);
    for (const s of scores) expect(s).toBeGreaterThanOrEqual(3), expect(s).toBeLessThanOrEqual(18);
    expect(rollScores(() => 0.999)).toEqual([18, 18, 18, 18, 18, 18]);
  });

  it('saves a hero without a table, and takes rolled scores only when the server rolled them', async () => {
    const { call } = setup();
    expect((await call({ do: 'save', spec: brann, table: '' })).body.heroes.map((h) => h.name)).toEqual(['Brann']);
    // Scores nobody rolled are refused.
    expect((await call({ do: 'save', spec: rolledBrann([18, 18, 18, 18, 18, 18]), table: '' })).status).toBe(400);
    const { rolled } = (await call({ do: 'roll' })).body;
    expect(rolled).toHaveLength(6);
    const saved = await call({ do: 'save', spec: { ...rolledBrann(rolled!), name: 'Lucky' }, table: '' });
    expect(saved.status).toBe(200);
    expect(saved.body.heroes.map((h) => h.name).sort()).toEqual(['Brann', 'Lucky']);
  });

  it('copies a saved hero under a new name, rolled scores and all', async () => {
    const { call } = setup();
    const { rolled } = (await call({ do: 'roll' })).body;
    const [lucky] = (await call({ do: 'save', spec: { ...rolledBrann(rolled!), name: 'Lucky' }, table: '' })).body.heroes;
    const after = (await call({ do: 'copy', id: lucky.id, name: 'Lucky II' })).body.heroes;
    expect(after.map((h) => h.name).sort()).toEqual(['Lucky', 'Lucky II']);
    expect(after.find((h) => h.name === 'Lucky II')!.spec.base).toEqual(lucky.spec.base);
    expect((await call({ do: 'copy', id: 'nope', name: 'X' })).status).toBe(404);
  });
});

describe('where a saved hero plays', () => {
  it('lists the saved heroes at a table, with their level, in the table summary', () => {
    const room = new Room('friday', new ScriptedDM(), new MemoryStore() as unknown as Store, {}, {
      template: (_id, tid) => (tid === 'hero_8' ? cleanSpec({ ...brann, name: 'Saved' }) : null),
    });
    const ws = { OPEN: 1, readyState: 1, send: () => {} } as unknown as WebSocket;
    room.join(ws, 'acc_mira', 'account:acc_mira', 'Mira');
    room.handle(ws, { t: 'add_premade', premadeId: 'vex', name: '' });
    room.handle(ws, { t: 'add_template', templateId: 'hero_8' });
    return new Promise<void>((resolve) => setTimeout(() => {
      expect(room.summary().kept).toEqual([{ templateId: 'hero_8', level: 1 }]);
      resolve();
    }, 50));
  });
});
