import { describe, expect, it } from 'vitest';
import { Game, GameError } from '../src/game/engine';

function table() {
  const g = new Game('roll', () => 0.5);
  g.upsertPlayer('p1', 'Chris', true);
  g.upsertPlayer('p2', 'Mira', true);
  g.addPremade('p1', 'fenna', 'Lexe');
  g.addPremade('p2', 'vex', 'Zarek');
  g.start();
  for (const p of g.s.players) p.connected = true;
  return g;
}

describe('the dice moment', () => {
  it('rolls at once when nothing waits for a player', async () => {
    const g = table();
    const out = await g.requestCheck(g.s.characters[0].id, 'cha', 'persuasion', 13);
    expect(out).toBeTruthy();
    expect(g.s.log.at(-1)?.roll?.checkId).toBeUndefined();
  });

  it('waits for the hero\'s player to press Roll, showing the DC and every part of the modifier first', async () => {
    const g = table();
    const lexe = g.s.characters[0];
    let release: () => void = () => {};
    g.checkWaiter = () => new Promise<void>((r) => { release = r; });
    const asked = g.requestCheck(lexe.id, 'wis', 'perception', 12);
    const pending = g.publicState({ busy: true, mode: 'scripted', model: null }).check!;
    expect(pending).toMatchObject({ characterId: lexe.id, dc: 12, skill: 'perception' });
    expect(pending.parts.map((p) => p.label)).toContain('Proficiency');
    expect(pending.modifier).toBe(4);
    const before = g.s.log.length;
    // Another player may not roll for Lexe.
    expect(() => g.pressRoll('p2', pending.id)).toThrow(GameError);
    expect(() => g.pressRoll('p1', 'nope')).toThrow(GameError);
    g.pressRoll('p1', pending.id);
    expect(g.s.log.length).toBe(before);
    release();
    await asked;
    expect(g.pendingCheck).toBeNull();
    expect(g.s.log.at(-1)?.roll?.checkId).toBe(pending.id);
  });

  it('does not wait for a player who is away', async () => {
    const g = table();
    g.s.players[0].connected = false;
    let asked = 0;
    g.checkWaiter = async () => { asked++; };
    await g.requestCheck(g.s.characters[0].id, 'dex', 'stealth', 10);
    expect(asked).toBe(0);
  });
});
