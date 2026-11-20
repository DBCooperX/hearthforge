// Player credits: the AI's costs per account in francs, the Innkeeper's payments, and the stop at zero.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { OUT_OF_CREDIT } from '../../shared/credits';
import type { InternalState } from '../src/game/engine';
import type { ServerMessage } from '../../shared/types';
import { Credits } from '../src/credits';
import type { Store } from '../src/db';
import { ScriptedDM } from '../src/dm/scripted';
import { Room } from '../src/room';

const dir = () => mkdtempSync(join(tmpdir(), 'hf-credits-'));
const mira = { id: 'acc_mira', username: 'Mira', role: 'player' as const };
const jonas = { id: 'acc_jonas', username: 'Jonas', role: 'player' as const };
const chris = { id: 'acc_chris', username: 'Chris', role: 'innkeeper' as const };

describe('credits', () => {
  it('counts costs per account in francs, shared among those at the table', () => {
    const c = new Credits(dir());
    c.setConfig({ chfPerUsd: 0.8 });
    c.charge([mira.id, jonas.id], 1, 'claude');
    c.charge([mira.id], c.voiceCost('elevenlabs', 5000), 'voice');
    expect(c.voiceCost('elevenlabs', 5000)).toBeCloseTo(0.2);
    const r = c.report([mira, jonas]);
    expect(r.rows[0]).toMatchObject({ username: 'Mira', spentClaude: 0.4, last30: 0.56 });
    expect(r.rows[0].spentVoice).toBeCloseTo(0.16);
    expect(r.rows[1]).toMatchObject({ username: 'Jonas', spentClaude: 0.4, spentVoice: 0 });
    // Off by default: counted, but nobody is stopped.
    expect(c.view(mira)).toMatchObject({ limited: false, out: false });
    expect(c.mayPlay(mira)).toBe(true);
  });

  it('warns early and stops at zero once credits are on, but never an innkeeper or a free account', () => {
    const c = new Credits(dir());
    c.setConfig({ on: true, chfPerUsd: 1, warnChf: 2 });
    expect(c.view(mira)).toMatchObject({ limited: true, balance: 0, out: true });
    c.topUp(mira.id, 10, 'TWINT');
    expect(c.view(mira)).toMatchObject({ paid: 10, balance: 10, low: false, out: false });
    c.charge([mira.id], 8.5, 'claude');
    expect(c.view(mira)).toMatchObject({ balance: 1.5, low: true, out: false });
    c.charge([mira.id], 2, 'claude');
    expect(c.view(mira)).toMatchObject({ balance: -0.5, low: false, out: true });
    expect(c.mayPlay(mira)).toBe(false);
    // A correction, and a friend who plays for free.
    c.topUp(mira.id, -0.5, 'typo');
    expect(c.view(mira).paid).toBe(9.5);
    c.setFree(mira.id, true);
    expect(c.view(mira)).toMatchObject({ limited: false, free: true, out: false });
    c.charge([chris.id], 50, 'claude');
    expect(c.view(chris)).toMatchObject({ limited: false, out: false, spent: 50 });
  });

  it('refuses nonsense and keeps what it was told across a restart', () => {
    const d = dir();
    const c = new Credits(d);
    expect(() => c.setConfig({ chfPerUsd: -1 })).toThrow();
    expect(() => c.topUp(mira.id, 'lots', '')).toThrow();
    expect(() => c.topUp(mira.id, 0, '')).toThrow();
    c.setConfig({ on: true, voiceUsdPer1k: { elevenlabs: 0.05 } });
    c.topUp(mira.id, 20, 'cash');
    c.charge([mira.id], 1, 'claude');
    c.flush();
    const again = new Credits(d);
    expect(again.config).toMatchObject({ on: true, chfPerUsd: 0.85, voiceUsdPer1k: { elevenlabs: 0.05, openai: 0.015 } });
    expect(again.view(mira).balance).toBeCloseTo(19.15);
    // A backup brings back accounts this server does not know, and leaves the others alone.
    const fresh = new Credits(dir());
    expect(fresh.restore(again.exportable())).toBe(1);
    expect(fresh.view(mira).paid).toBe(20);
    again.forget(mira.id);
    expect(again.view(mira).paid).toBe(0);
  });
});

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

describe('a table with credits', () => {
  it('lets a player without credit fight and chat, but not ask the Dungeon Master for more', () => {
    const broke = new Set(['acc_jonas']);
    const room = new Room('t', new ScriptedDM(), new MemoryStore() as unknown as Store, {}, { mayAsk: (id) => (broke.has(id) ? OUT_OF_CREDIT : null) });
    const a = socket(), b = socket();
    room.join(a.ws, 'acc_mira', 'account:acc_mira', 'Mira');
    room.join(b.ws, 'acc_jonas', 'account:acc_jonas', 'Jonas');
    for (const t of ['say', 'start', 'travel', 'go', 'delve', 'short_rest', 'long_rest'] as const) {
      room.handle(b.ws, { t, text: 'Hello', q: 0, r: 0, locationId: 'x' } as never);
      expect(b.sent.at(-1), t).toEqual({ t: 'error', message: OUT_OF_CREDIT });
    }
    room.handle(b.ws, { t: 'chat', text: 'brb, paying Chris' });
    expect(b.sent.at(-1)).not.toEqual({ t: 'error', message: OUT_OF_CREDIT });
    const before = a.sent.length;
    room.handle(a.ws, { t: 'say', text: 'Hello' });
    expect(a.sent.slice(before)).not.toContainEqual({ t: 'error', message: OUT_OF_CREDIT });
  });
});
