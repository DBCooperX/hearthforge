// My heroes: heroes kept on an account and used again as fresh copies at any table.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { MAX_TEMPLATES, cleanSpec } from '../../shared/accounts';
import { PREMADES } from '../../shared/premades';
import { Accounts, AccountsError } from '../src/accounts';
import type { Store } from '../src/db';
import { ScriptedDM } from '../src/dm/scripted';
import { Game, GameError } from '../src/game/engine';
import { Room } from '../src/room';

const brann = PREMADES.find((p) => p.id === 'brann')!.spec;
const accounts = () => new Accounts(mkdtempSync(join(tmpdir(), 'hf-heroes-')), { HEARTHFORGE_ADMIN_PASSWORD: 'secret-password' });

class MemoryStore {
  saved = new Map<string, string>();
  load(room: string) { const s = this.saved.get(room); return s ? JSON.parse(s) : undefined; }
  save(room: string, state: unknown) { this.saved.set(room, JSON.stringify(state)); }
  names() { return [...this.saved.keys()]; }
  delete(room: string) { this.saved.delete(room); }
  close() {}
}
const socket = () => ({ OPEN: 1, readyState: 1, send: (_: string) => {} } as unknown as WebSocket);

describe('My heroes on the account', () => {
  it('keeps, changes and deletes heroes, per account, and survives a restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hf-heroes-'));
    const a = new Accounts(dir, { HEARTHFORGE_ADMIN_PASSWORD: 'secret-password' });
    const me = a.list()[0].id;
    const saved = a.saveTemplate(me, brann);
    expect(a.templates(me).map((h) => h.name)).toEqual(['Brann']);
    a.saveTemplate(me, { ...brann, name: 'Bran' }, saved.id);
    expect(a.templates(me)).toHaveLength(1);
    expect(a.template(me, saved.id)?.name).toBe('Bran');
    expect(new Accounts(dir, {}).templates(me).map((h) => h.name)).toEqual(['Bran']);
    a.removeTemplate(me, saved.id);
    expect(a.templates(me)).toEqual([]);
    expect(() => a.removeTemplate(me, saved.id)).toThrow(AccountsError);
  });

  it('stops at the limit', () => {
    const a = accounts();
    const me = a.list()[0].id;
    for (let i = 0; i < MAX_TEMPLATES; i++) a.saveTemplate(me, brann);
    expect(() => a.saveTemplate(me, brann)).toThrow(expect.objectContaining({ code: 'too_many_heroes' }));
  });

  it('keeps only the creator choices, cut to length', () => {
    const spec = cleanSpec({ ...brann, backstory: 'x'.repeat(5000), gold: 9999, extra: { hack: true } })!;
    expect(spec.backstory).toHaveLength(1200);
    expect(spec).not.toHaveProperty('gold');
    expect(spec).not.toHaveProperty('extra');
    expect(cleanSpec('nope')).toBeNull();
  });
});

describe('a saved hero at a table', () => {
  it('joins as a fresh copy and never changes the template', () => {
    const g = new Game('t', () => 0.42);
    g.upsertPlayer('acc_mira', 'Mira', true);
    const spec = cleanSpec(brann)!;
    const c = g.addTemplate('acc_mira', 'hero_1', spec);
    expect(c).toMatchObject({ name: 'Brann', level: 1, xp: 0, templateId: 'hero_1', ownerId: 'acc_mira' });
    c.xp = 999;
    expect(spec.name).toBe('Brann');
    // The same saved hero is not in the party twice.
    expect(() => g.addTemplate('acc_mira', 'hero_1', spec)).toThrow(GameError);
    expect(() => g.addTemplate('acc_mira', 'hero_2', null)).toThrow(GameError);
  });

  it('checks the rules again, so a doctored template builds nothing', () => {
    const g = new Game('t', () => 0.42);
    g.upsertPlayer('acc_mira', 'Mira', true);
    expect(() => g.addTemplate('acc_mira', 'hero_1', { ...cleanSpec(brann)!, base: { str: 18, dex: 18, con: 18, int: 18, wis: 18, cha: 18 } })).toThrow(GameError);
  });

  it('remembers the recipe of a hero, with its current name and looks, for keeping', () => {
    const g = new Game('t', () => 0.42);
    g.upsertPlayer('acc_mira', 'Mira', true);
    g.upsertPlayer('acc_jonas', 'Jonas', true);
    const c = g.createCharacter('acc_mira', { ...brann, premadeId: undefined });
    c.name = 'Brannoch';
    expect(g.recipe('acc_mira', c.id)).toMatchObject({ name: 'Brannoch', classId: 'fighter', method: brann.method });
    expect(() => g.recipe('acc_jonas', c.id)).toThrow(GameError);
    g.removeCharacter('acc_mira', c.id);
    expect(g.s.origins?.[c.id]).toBeUndefined();
  });

  it('keeps rolled scores usable only because the server rolled them once', () => {
    const g = new Game('t', () => 0.42);
    g.upsertPlayer('acc_mira', 'Mira', true);
    const scores = g.rollAbilities('acc_mira');
    const base = { str: scores[0], dex: scores[1], con: scores[2], int: scores[3], wis: scores[4], cha: scores[5] };
    const rolled = { ...brann, method: 'roll' as const, base, boosts: brann.boosts };
    const c = g.createCharacter('acc_mira', rolled);
    g.removeCharacter('acc_mira', c.id);
    // Another table has no roll of its own: the scores come with the saved hero.
    const other = new Game('u', () => 0.1);
    other.upsertPlayer('acc_mira', 'Mira', true);
    expect(other.addTemplate('acc_mira', 'hero_1', cleanSpec(rolled)!).name).toBe('Brann');
    expect(other.s.rolled['acc_mira']).toBeUndefined();
  });
});

describe('through the table', () => {
  it('keeps a new hero when asked, and adds a saved one with add_template', () => {
    const kept: string[] = [];
    const room = new Room('friday', new ScriptedDM(), new MemoryStore() as unknown as Store, {}, {
      keep: (_id, spec) => { kept.push(spec.name); return 'hero_9'; },
      template: (_id, tid) => (tid === 'hero_8' ? cleanSpec({ ...brann, name: 'Saved' }) : null),
    });
    const ws = socket();
    room.join(ws, 'acc_mira', 'account:acc_mira', 'Mira');
    room.handle(ws, { t: 'create_character', spec: { ...brann, premadeId: undefined }, keep: true });
    room.handle(ws, { t: 'add_template', templateId: 'hero_8' });
    return new Promise<void>((resolve) => setTimeout(() => {
      expect(kept).toEqual(['Brann']);
      expect(room.game.s.characters.map((c) => [c.name, c.templateId])).toEqual([['Brann', 'hero_9'], ['Saved', 'hero_8']]);
      resolve();
    }, 50));
  });
});
