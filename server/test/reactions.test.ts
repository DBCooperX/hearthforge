import { describe, expect, it } from 'vitest';
import { LIGHT_KINDS, ambientLight, canSee, lightGrid, perceivedLight, placeFixedLights } from '../../shared/light';
import { buildBattleMap } from '../../shared/battlemap';
import { Game, GameError, type Monster } from '../src/game/engine';
import type { Character } from '../../shared/types';
import { scriptedIntent } from '../src/dm/scripted';
import { describeCombat } from '../src/dm/context';

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An open room, 22 by 13, walled all round. */
const ROOM = Array.from({ length: 13 }, (_, y) => (y === 0 || y === 12 ? '#'.repeat(22) : `#${'.'.repeat(20)}#`));

/** One hero and one monster on an open floor, in the light asked for, with the hero to act. */
function duel(opts: { light?: 'bright' | 'dim' | 'dark'; monster?: string; species?: Character['speciesId']; seed?: number } = {}) {
  const g = new Game('test', seeded(opts.seed ?? 3));
  g.upsertPlayer('p1', 'Tester', true);
  g.addCharacter('p1', 'fighter', '');
  g.start();
  g.takeBeats();
  g.startEncounter([{ defId: opts.monster ?? 'goblin', count: 1 }], { source: 'story', context: 'test', setting: 'dungeon', light: opts.light ?? 'bright' });
  const s = g.s;
  s.rows = [...ROOM];
  s.lights = [];
  const c = s.characters[0];
  if (opts.species) c.speciesId = opts.species;
  c.light = null;
  const m = s.monsters[0];
  c.x = 5; c.y = 6;
  m.x = 6; m.y = 6;
  heroTurn(g, c);
  return { g, c, m };
}

function heroTurn(g: Game, c: Character) {
  const combat = g.s.combat!;
  combat.turnIndex = combat.order.findIndex((o) => o.id === c.id);
  combat.movementLeft = 6;
  combat.actionUsed = false;
  combat.bonusUsed = false;
  combat.disengaged = false;
  combat.reacted = [];
}

const lastRoll = (g: Game) => [...g.s.log].reverse().find((l) => l.roll)!.roll!;
const logSince = (g: Game, n: number) => g.s.log.slice(n).map((l) => l.text).join('\n');

describe('light', () => {
  it('lights a torch radius: bright, then dim, then dark, and walls cast shadow', () => {
    const rows = [...ROOM];
    rows[6] = '#.........#..........#';
    const grid = lightGrid(rows, 'dark', [{ kind: 'torch', x: 5, y: 6 }]);
    const at = (x: number, y: number) => grid[y * 22 + x];
    expect(at(5, 6)).toBe('bright');
    expect(at(9, 6)).toBe('bright'); // 20 ft
    expect(at(5, 2)).toBe('bright');
    expect(at(1, 2)).toBe('bright'); // four squares diagonally is 20 ft on the grid
    expect(at(1, 11)).toBe('dim');
    expect(at(13, 6)).toBe('dark'); // behind the wall at x = 10
    expect(at(5 + 8, 3)).toBe('dim'); // 40 ft, past the wall's line
    expect(at(5 + 9, 3)).toBe('dark');
    expect(LIGHT_KINDS.torch.bright + LIGHT_KINDS.torch.dim).toBe(40);
  });

  it('lets darkvision see darkness as dim light, out to its range, and blindsight see everything', () => {
    expect(perceivedLight('dark', { darkvision: 60, blindsight: 0 }, 60)).toBe('dim');
    expect(perceivedLight('dark', { darkvision: 60, blindsight: 0 }, 65)).toBe('dark');
    expect(perceivedLight('dim', { darkvision: 60, blindsight: 0 }, 30)).toBe('bright');
    expect(perceivedLight('dark', { darkvision: 0, blindsight: 10 }, 10)).toBe('bright');
    expect(canSee(ROOM, { x: 2, y: 2 }, { darkvision: 0, blindsight: 0 }, { x: 5, y: 2 }, 'dark')).toBe(false);
    expect(canSee(ROOM, { x: 2, y: 2 }, { darkvision: 0, blindsight: 0 }, { x: 5, y: 2 }, 'dim')).toBe(true);
  });

  it('follows the place and the time of day', () => {
    expect(ambientLight('dungeon', 12 * 60)).toBe('dark');
    expect(ambientLight('tavern', 2 * 60)).toBe('bright');
    expect(ambientLight('forest', 12 * 60)).toBe('bright');
    expect(ambientLight('forest', 20 * 60)).toBe('dim');
    expect(ambientLight('forest', 23 * 60)).toBe('dark');
    expect(ambientLight('town', 23 * 60)).toBe('dim');
    const rng = seeded(4);
    const map = buildBattleMap('dungeon', rng);
    const lights = placeFixedLights('dungeon', map, rng);
    expect(lights.length).toBeGreaterThan(0);
    for (const l of lights) expect(map[l.y][l.x]).toBe('#');
    expect(placeFixedLights('camp', buildBattleMap('camp', rng), rng)).toEqual([{ kind: 'fire', x: 11, y: 6 }]);
  });

  it('has heroes without darkvision light a torch when a fight starts in the dark', () => {
    const g = new Game('test', seeded(2));
    g.upsertPlayer('p1', 'Tester', true);
    g.addCharacter('p1', 'cleric', ''); // Maeve, human
    g.addCharacter('p1', 'fighter', ''); // Brann, dwarf
    g.start();
    const [maeve, brann] = g.s.characters;
    expect(maeve.speciesId).toBe('human');
    maeve.bag[maeve.bag.findIndex((b) => b === null)] = { uid: 'torch1', defId: 'torch', qty: 1 };
    g.startEncounter([{ defId: 'bandit', count: 1 }], { source: 'story', context: 'test', setting: 'dungeon' });
    expect(g.s.ambient).toBe('dark');
    expect(maeve.light).toBe('torch');
    expect(brann.light).toBeNull();
    expect(g.s.monsters[0].light).toBe('torch'); // bandits cannot see in the dark
    const view = g.publicState({ busy: false, mode: 'scripted', model: null });
    expect(view.light.ambient).toBe('dark');
    expect(view.light.sources.some((l) => l.holder === maeve.id)).toBe(true);
    expect(view.monsters[0].senses).toEqual({ darkvision: 0, blindsight: 0 });
    expect(describeCombat(g)).toContain('Holds a lit torch');
  });

  it('gives disadvantage against the unseen and advantage to the unseen attacker', () => {
    const { g, c, m } = duel({ light: 'dark', species: 'human' });
    g.attack('p1', c.id, m.id);
    const roll = lastRoll(g);
    // The goblin sees in the dark; the human does not: disadvantage on the hero's swing.
    expect(roll.mode).toBe('disadvantage');
    expect(g.s.log.at(-1)!.text).toContain('cannot see');

    const lit = duel({ light: 'dark', species: 'human', seed: 5 });
    lit.c.light = 'torch';
    lit.g.attack('p1', lit.c.id, lit.m.id);
    expect(lastRoll(lit.g).mode).toBe('normal');

    // A wolf has no darkvision: the dwarf it cannot see strikes with advantage.
    const wolf = duel({ light: 'dark', monster: 'wolf', species: 'dwarf' });
    wolf.g.attack('p1', wolf.c.id, wolf.m.id);
    expect(lastRoll(wolf.g).mode).toBe('advantage');
  });

  it('needs sight for spells with a saving throw', () => {
    const { g, c, m } = duel({ light: 'dark', species: 'human' });
    c.abilityIds.push('sacred_flame');
    c.x = 2; m.x = 10;
    expect(() => g.useAbility('p1', c.id, 'sacred_flame', m.id)).toThrow(/cannot see/);
    c.light = 'lantern';
    expect(() => g.useAbility('p1', c.id, 'sacred_flame', m.id)).not.toThrow();
  });

  it('lets a hero light and put out a torch, lighting taking the bonus action', () => {
    const { g, c } = duel({ light: 'dark', species: 'human' });
    g.setLight('p1', c.id, true);
    expect(c.light).toBe('torch'); // the fighter's kit packs three
    expect(g.s.combat!.bonusUsed).toBe(true);
    expect(g.lightAt({ x: c.x + 4, y: c.y })).toBe('bright');
    g.setLight('p1', c.id, false);
    expect(c.light).toBeNull();
    expect(g.lightAt({ x: c.x + 4, y: c.y })).toBe('dark');
    c.bag = c.bag.map((b) => (b?.defId === 'torch' ? null : b));
    expect(() => g.setLight('p1', c.id, true)).toThrow(/no torch/);
  });
});

describe('opportunity attacks', () => {
  it('lets a monster strike a hero who walks out of its reach, once per round', () => {
    const { g, c, m } = duel();
    const before = g.s.log.length;
    g.move('p1', c.id, 2, 6);
    expect(logSince(g, before)).toMatch(/^Opportunity attack! Goblin attacks Brann/m);
    expect(g.s.combat!.reacted).toContain(m.id);
    // Its reaction is spent: walking back in and out again provokes nothing.
    heroTurn(g, c);
    g.s.combat!.reacted = [m.id];
    c.x = 5;
    const again = g.s.log.length;
    g.move('p1', c.id, 2, 6);
    expect(logSince(g, again)).not.toContain('Opportunity attack');
  });

  it('provokes nothing after Disengage, and a rogue disengages as a bonus action', () => {
    const { g, c, m } = duel();
    g.disengage('p1', c.id);
    expect(g.s.combat!.actionUsed).toBe(true);
    expect(g.provokers(c, [{ x: 4, y: 6 }])).toEqual([]);
    const before = g.s.log.length;
    g.move('p1', c.id, 2, 6);
    expect(logSince(g, before)).not.toContain('Opportunity attack');
    expect(m.alive).toBe(true);

    const r = new Game('test', seeded(9));
    r.upsertPlayer('p1', 'Tester', true);
    r.addCharacter('p1', 'rogue', '');
    r.start();
    r.startEncounter([{ defId: 'goblin', count: 1 }], { source: 'story', context: 'test', light: 'bright' });
    const vex = r.s.characters[0];
    // Cunning Action comes at level 2; before that Disengage takes the action like for anyone.
    expect(vex.abilityIds).not.toContain('dash');
    vex.abilityIds.push('dash');
    heroTurn(r, vex);
    r.disengage('p1', vex.id);
    expect(r.s.combat!.bonusUsed).toBe(true);
    expect(r.s.combat!.actionUsed).toBe(false);
    expect(() => r.disengage('p1', vex.id)).toThrow(GameError);
  });

  it('warns about the enemies a path would provoke', () => {
    const { g, c, m } = duel();
    expect(g.provokers(c, [{ x: 4, y: 6 }, { x: 3, y: 6 }]).map((x) => x.id)).toEqual([m.id]);
    expect(g.provokers(c, [{ x: 5, y: 7 }])).toEqual([]); // still next to it
  });

  it('does not let a monster strike what it cannot see', () => {
    const { g, c } = duel({ light: 'dark', monster: 'wolf', species: 'dwarf' });
    const before = g.s.log.length;
    g.move('p1', c.id, 2, 6);
    expect(logSince(g, before)).not.toContain('Opportunity attack');
  });

  /** Put the monster up next and have it walk away from the hero. */
  function monsterLeaves(g: Game, m: Monster) {
    const combat = g.s.combat!;
    combat.turnIndex = combat.order.findIndex((o) => o.id === m.id);
    return g.monsterAct(m.id, { tactic: 'retreat' });
  }

  it('has a hero strike a monster that walks away, following the hero\'s setting', () => {
    const { g, c, m } = duel({ monster: 'bandit' });
    const res = monsterLeaves(g, m);
    expect(res.struckBy).toEqual([c.name]);
    expect(g.s.log.some((l) => l.text.startsWith(`Opportunity attack! ${c.name} attacks`))).toBe(true);
    expect(g.s.combat!.reacted).toContain(c.id);

    const never = duel({ monster: 'bandit' });
    never.c.opportunity = 'never';
    expect(monsterLeaves(never.g, never.m).struckBy).toBeUndefined();
    expect(() => never.g.setOpportunity('p1', never.c.id, 'sometimes')).toThrow(GameError);
  });

  it('lets a monster disengage: it slips away unharmed and gives up its attack, unless it is nimble', () => {
    const { g, m } = duel({ monster: 'bandit' });
    const combat = g.s.combat!;
    combat.turnIndex = combat.order.findIndex((o) => o.id === m.id);
    const res = g.monsterAct(m.id, { tactic: 'disengage' });
    expect(res.disengaged).toBe(true);
    expect(res.struckBy).toBeUndefined();
    expect(res.attack).toBeUndefined();
    expect(res.moved).toBeGreaterThan(0);

    const gob = duel({ monster: 'goblin' });
    gob.m.hp = 2;
    expect(scriptedIntent(gob.g, gob.m)).toEqual({ tactic: 'disengage' });
    const combat2 = gob.g.s.combat!;
    combat2.turnIndex = combat2.order.findIndex((o) => o.id === gob.m.id);
    const shot = gob.g.monsterAct(gob.m.id, { tactic: 'disengage' });
    expect(shot.struckBy).toBeUndefined();
    expect(shot.attack?.name).toBe('Shortbow');
  });

  it('asks the player when the table is live, and finishes the move once they answer', () => {
    const { g, c, m } = duel({ monster: 'bandit' });
    g.interactiveReactions = true;
    const start = { x: m.x, y: m.y };
    const res = monsterLeaves(g, m);
    expect(res.waiting).toBe(true);
    expect(g.reactionPrompt()).toMatchObject({ heroId: c.id, monsterId: m.id });
    expect({ x: m.x, y: m.y }).toEqual(start); // still in reach while the player decides
    expect(() => g.checkReaction('p2', c.id)).toThrow(GameError);
    g.upsertPlayer('p2', 'Other', true);
    expect(() => g.checkReaction('p2', c.id)).toThrow(/another player/);
    expect(() => g.checkReaction('p1', c.id)).not.toThrow();
    // Another monster cannot act while the fight waits.
    expect(g.monsterAct(m.id).waiting).toBe(true);
    const done = g.resumeMonster(false)!;
    expect(done.waiting).toBeUndefined();
    expect(done.moved).toBeGreaterThan(0);
    expect(g.reactionPrompt()).toBeNull();
    expect(g.s.log.some((l) => l.text === `${c.name} lets ${m.name} go.`)).toBe(true);
    // Letting it go keeps the reaction for later.
    expect(g.s.combat!.reacted ?? []).not.toContain(c.id);
  });

  it('strikes without asking for a hero whose player is away', () => {
    const { g, c, m } = duel({ monster: 'bandit' });
    g.interactiveReactions = true;
    g.setConnected('p1', false);
    const res = monsterLeaves(g, m);
    expect(res.waiting).toBeUndefined();
    expect(res.struckBy).toEqual([c.name]);
  });

  it('forgets an unanswered prompt across a restart', () => {
    const { g, m } = duel({ monster: 'bandit' });
    g.interactiveReactions = true;
    monsterLeaves(g, m);
    const saved = JSON.parse(JSON.stringify(g.s));
    const loaded = new Game('test', seeded(1), saved);
    expect(loaded.reactionPrompt()).toBeNull();
  });
});
