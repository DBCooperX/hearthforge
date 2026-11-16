import { describe, expect, it } from 'vitest';
import { Game, GameError, SNEAK_MINUTES } from '../src/game/engine';
import { MONSTERS, passivePerception } from '../src/data/monsters';

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

/** Vex the rogue and Brann the fighter, out in the open. */
function party(seed = 7) {
  const g = new Game('test', seeded(seed));
  g.upsertPlayer('p1', 'Tester', true);
  g.addPremade('p1', 'vex', '');
  g.addCharacter('p1', 'fighter', '');
  g.start();
  g.takeBeats();
  const [vex, brann] = g.s.characters;
  return { g, vex, brann };
}

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('surprise', () => {
  it('refuses a fight by surprise without a successful Stealth check', () => {
    const { g, vex } = party();
    expect(() => g.startEncounter([{ defId: 'ogre', count: 1 }], { source: 'story', context: 'test', surprise: 'enemies' })).toThrow(GameError);
    expect(g.s.phase).toBe('explore');
    g.skillCheck(vex.id, 'dex', 'stealth', 30);
    expect(() => g.startEncounter([{ defId: 'ogre', count: 1 }], { source: 'story', context: 'test', opener: vex.id })).toThrow(/Stealth/);
    expect(g.s.phase).toBe('explore');
  });

  it('forgets a Stealth check after a while', () => {
    const { g, vex } = party();
    g.skillCheck(vex.id, 'dex', 'stealth', 1);
    g.advanceTime(SNEAK_MINUTES + 1);
    expect(() => g.startEncounter([{ defId: 'ogre', count: 1 }], { source: 'story', context: 'test', surprise: 'enemies' })).toThrow(GameError);
  });

  it('opens with a strike from hiding: beside the target, first turn, Advantage and Sneak Attack', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { g, vex } = party(seed);
      g.skillCheck(vex.id, 'dex', 'stealth', 1);
      const opening = g.startEncounter([{ defId: 'ogre', count: 1 }], { source: 'story', context: 'test', opener: vex.id })!;
      const ogre = g.s.monsters[0];
      expect(opening.side).toBe('enemies');
      expect(opening.caught).toContain(ogre.name);
      const order = g.s.combat!.order;
      expect(order[0]).toMatchObject({ id: vex.id, ambush: true });
      expect(order.find((o) => o.id === ogre.id)?.surprised).toBe(true);
      expect(g.s.combat!.surprise).toEqual({ side: 'enemies', opener: vex.id });
      expect(cheb(vex, ogre)).toBeLessThanOrEqual(1 + (ogre.tiles ?? 1) - 1);
      expect(g.current()?.id).toBe(vex.id);
      expect(g.s.combat!.actionUsed).toBe(true);
      const roll = [...g.s.log].reverse().find((l) => l.roll && l.roll.actor === vex.name)!.roll!;
      expect(roll.mode).toBe('advantage');
      expect(opening.strike).toBeTruthy();
      if (opening.strike!.hit) {
        expect(opening.strike!.sneakAttack).toBe(true);
        expect(opening.strike!.damage).toBeGreaterThan(0);
        expect(ogre.hp).toBe(ogre.maxHp - opening.strike!.damage);
      }
      // The Stealth check is used up by the fight.
      expect(g.s.sneaks).toEqual({});
    }
  });

  it('lets watchful enemies notice the sneak: no surprise for them, no strike', () => {
    const watcher = Object.values(MONSTERS).find((d) => passivePerception(d) >= 16 && !d.boss && !d.legendary)!;
    expect(watcher).toBeTruthy();
    const { g, vex } = party();
    g.skillCheck(vex.id, 'dex', 'stealth', 1);
    g.s.sneaks![vex.id].total = 12;
    const opening = g.startEncounter([{ defId: watcher.id, count: 1 }], { source: 'story', context: 'test', opener: vex.id })!;
    expect(opening.caught).toEqual([]);
    expect(opening.strike).toBeUndefined();
    expect(opening.noStrike).toMatch(/noticed/);
    expect(g.s.combat!.order.some((o) => o.ambush || o.surprised)).toBe(false);
  });

  it('gives surprised creatures Disadvantage on Initiative', () => {
    const mean = (surprise: boolean) => {
      let sum = 0, n = 0;
      for (let seed = 1; seed <= 150; seed++) {
        const { g, vex } = party(seed);
        if (surprise) g.skillCheck(vex.id, 'dex', 'stealth', 1);
        g.startEncounter([{ defId: 'goblin', count: 2 }], { source: 'story', context: 'test', ...(surprise ? { surprise: 'enemies' } : {}) });
        for (const o of g.s.combat!.order) if (o.kind === 'monster') { sum += o.initiative; n++; if (surprise) expect(o.surprised).toBe(true); }
      }
      return sum / n;
    };
    // A d20 with Disadvantage averages about 7.2 instead of 10.5.
    expect(mean(false) - mean(true)).toBeGreaterThan(2);
  });

  it('rolls the enemies\' Stealth in an ambush and catches heroes whose Passive Perception is lower', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { g } = party(seed);
      const opening = g.startEncounter([{ defId: 'goblin', count: 3 }], { source: 'story', context: 'test', surprise: 'party' })!;
      expect(opening.side).toBe('party');
      for (const c of g.s.characters) {
        const caught = g.heroPassivePerception(c) < opening.stealth;
        expect(opening.caught.includes(c.name)).toBe(caught);
        expect(!!g.s.combat!.order.find((o) => o.id === c.id)!.surprised).toBe(caught);
      }
      expect(g.s.combat!.order.some((o) => o.kind === 'monster' && o.surprised)).toBe(false);
    }
  });

  it('starts normally when nobody is caught unawares', () => {
    const { g } = party();
    expect(g.startEncounter([{ defId: 'goblin', count: 1 }], { source: 'story', context: 'test', surprise: 'none' })).toBeNull();
    expect(g.s.combat!.surprise).toBeUndefined();
  });
});

describe('the end of a fight', () => {
  it('records a victory with experience, loot and what the aftermath adds', () => {
    const { g, vex } = party();
    g.startEncounter([{ defId: 'goblin', count: 1 }], { source: 'story', context: 'test' });
    const gob = g.s.monsters[0];
    gob.hp = 0; gob.alive = false;
    g.nextTurn();
    expect(g.s.phase).toBe('explore');
    const f = g.s.lastFight!;
    expect(f).toMatchObject({ seq: 1, result: 'victory', xp: MONSTERS.goblin.xp, xpEach: MONSTERS.goblin.xp / 2, slain: [gob.name] });
    // The Dungeon Master hands out something while telling of the aftermath.
    g.grantItem(vex.id, 'potion_healing', 1);
    g.changeGold(5, 'coins in the grass');
    expect(f.loot.some((l) => l.includes('Vex'))).toBe(true);
    const gold = f.gold;
    g.addScene({ title: 'After', mood: 'calm', text: 'Quiet.', actions: [] });
    g.changeGold(5, 'later');
    expect(f.gold).toBe(gold);
    expect(g.publicState({ busy: false, mode: 'scripted', model: null }).lastFight?.seq).toBe(1);
    // The next fight gets the next number.
    g.startEncounter([{ defId: 'goblin', count: 1 }], { source: 'story', context: 'test' });
    g.s.monsters[0].alive = false;
    g.nextTurn();
    expect(g.s.lastFight?.seq).toBe(2);
  });

  it('records a defeat when the party is overwhelmed', () => {
    const { g } = party();
    g.startEncounter([{ defId: 'ogre', count: 1 }], { source: 'story', context: 'test' });
    for (const c of g.s.characters) { c.hp = 0; c.deathSaves = { successes: 0, failures: 0 }; }
    g.nextTurn();
    expect(g.s.lastFight?.result).toBe('rescued');
    expect(g.s.phase).toBe('explore');
  });
});
