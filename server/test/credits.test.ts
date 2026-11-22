// Player credits: the AI's costs per account in one global currency, the Innkeeper's payments, and the stop at zero.
import { mkdtempSync, writeFileSync } from 'node:fs';
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
  it('counts costs per account in the global currency, shared among those at the table', () => {
    const c = new Credits(dir());
    c.setConfig({ currency: 'CHF', rate: 0.8, voiceUsdPer1k: { elevenlabs: 0.04 } });
    c.charge([mira.id, jonas.id], 1, 'claude');
    // The cheaper model counts half.
    expect(c.voiceCost(1000, 'cheaper')).toBeCloseTo(0.02);
    c.charge([mira.id], c.voiceCost(5000), 'voice');
    expect(c.voiceCost(5000)).toBeCloseTo(0.2);
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
    c.setConfig({ on: true, warn: 2 });
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
    expect(() => c.setConfig({ currency: 'CHF', rate: -1 })).toThrow();
    expect(() => c.setConfig({ currency: 'Swiss francs', rate: 1 })).toThrow();
    expect(() => c.topUp(mira.id, 'lots', '')).toThrow();
    expect(() => c.topUp(mira.id, 0, '')).toThrow();
    c.setConfig({ on: true, voiceUsdPer1k: { elevenlabs: 0.05 } });
    c.topUp(mira.id, 20, 'cash');
    c.charge([mira.id], 1, 'claude');
    c.flush();
    const again = new Credits(d);
    expect(again.config).toMatchObject({ on: true, currency: 'USD', rate: 1, voiceUsdPer1k: { elevenlabs: 0.05 } });
    expect(again.view(mira).balance).toBeCloseTo(19);
    // A backup brings back accounts this server does not know, and leaves the others alone.
    const fresh = new Credits(dir());
    expect(fresh.restore(again.exportable())).toBe(1);
    expect(fresh.view(mira).paid).toBe(20);
    again.forget(mira.id);
    expect(again.view(mira).paid).toBe(0);
  });

  it('prices everything in dollars without any conversion by default', () => {
    const c = new Credits(dir());
    c.charge([mira.id], 1.25, 'claude');
    expect(c.view(mira)).toMatchObject({ currency: 'USD', spent: 1.25 });
    // Dollars never take a rate, whatever is sent.
    c.setConfig({ rate: 7 });
    expect(c.config.rate).toBe(1);
  });

  it('converts money already booked once when the currency changes, then books straight in the new one', () => {
    const c = new Credits(dir());
    c.topUp(mira.id, 10, 'cash');
    c.charge([mira.id], 2, 'claude');
    c.setConfig({ currency: 'CHF', rate: 0.8 });
    expect(c.view(mira)).toMatchObject({ currency: 'CHF', paid: 8, spent: 1.6, balance: 6.4 });
    expect(c.config.warn).toBeCloseTo(1.6);
    // Later costs use the fixed rate and nothing else.
    c.charge([mira.id], 1, 'voice');
    expect(c.report([mira]).rows[0]).toMatchObject({ spentVoice: 0.8 });
    // Changing only the rate leaves what is booked alone.
    c.setConfig({ rate: 0.9 });
    expect(c.view(mira).paid).toBe(8);
    // And back to dollars: 8 CHF at 0.9 is about $8.89.
    c.setConfig({ currency: 'USD' });
    expect(c.view(mira).paid).toBeCloseTo(8.89, 2);
    expect(c.config.rate).toBe(1);
  });

  it('reads credits saved in francs by an older version', () => {
    const d = dir();
    writeFileSync(join(d, 'credits.json'), JSON.stringify({
      config: { on: true, chfPerUsd: 0.85, warnChf: 3, voiceUsdPer1k: { elevenlabs: 0.04 } },
      accounts: { [mira.id]: { topUps: [{ at: 1, chf: 10, note: 'TWINT' }], claude: 1, voice: 0.5, days: {} } },
    }));
    const c = new Credits(d);
    expect(c.config).toMatchObject({ on: true, currency: 'CHF', rate: 0.85, warn: 3 });
    expect(c.view(mira)).toMatchObject({ currency: 'CHF', paid: 10, spent: 1.5, balance: 8.5 });
    expect(c.report([mira]).rows[0].topUps[0]).toMatchObject({ amount: 10, note: 'TWINT' });
  });

  it('brings a backup in another currency across at both fixed rates', () => {
    const old = new Credits(dir());
    old.setConfig({ currency: 'CHF', rate: 0.8 });
    old.topUp(mira.id, 8, 'cash');
    const fresh = new Credits(dir());
    expect(fresh.restore(old.exportable())).toBe(1);
    expect(fresh.view(mira)).toMatchObject({ currency: 'USD', paid: 10 });
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

describe('usage', () => {
  it('sums the last seven days by type and table', () => {
    let t = Date.UTC(2026, 10, 10);
    const c = new Credits(dir(), () => t);
    c.charge([mira.id], 1, 'claude', { id: 'a', title: 'Alpha' });
    c.charge([mira.id], 0.5, 'images', { id: 'a', title: 'Alpha' });
    c.charge([mira.id], 0.25, 'voice');
    t += 8 * 86400000;
    c.charge([mira.id, jonas.id], 1, 'claude', { id: 'b', title: 'Beta' });
    const u = c.usage(mira);
    expect(u).toMatchObject({ days: 7, total: 0.5, claude: 0.5, images: 0, voice: 0, byTable: [{ id: 'b', title: 'Beta', amount: 0.5 }], elsewhere: 0 });
    t -= 8 * 86400000;
    expect(c.usage(mira)).toMatchObject({ total: 2.25, elsewhere: 0.25 });
  });
});
