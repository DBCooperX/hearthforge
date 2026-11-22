import { describe, expect, it } from 'vitest';
import type { ClassId } from '../../shared/types';
import { Game, GameError } from '../src/game/engine';
import { applyFindings, type TurnRecord } from '../src/dm/reconcile';
import { DM_TOOLS } from '../src/dm/claude';
import { describeCombat, describeWorld } from '../src/dm/context';

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

function started(seed = 1, classes: ClassId[] = ['fighter', 'rogue']) {
  const g = new Game('test', seeded(seed));
  g.upsertPlayer('p1', 'Tester', true);
  for (const c of classes) g.addCharacter('p1', c, '');
  g.start();
  g.takeBeats();
  return g;
}

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const tryDo = (fn: () => void) => { try { fn(); return true; } catch (e) { if (!(e instanceof GameError)) throw e; return false; } };

/** Fight to the end: monsters by the scripted AI, companions by the server, heroes swing at the nearest foe. */
function fight(g: Game, heroesAct = true, onAlly?: (did: string) => void) {
  for (let step = 0; step < 3000 && g.s.phase === 'combat'; step++) {
    g.takeMoves();
    if (g.isMonsterTurn()) { const b = g.monsterBlock(); for (const m of b) g.monsterAct(m.id); g.finishMonsterBlock(b); continue; }
    if (g.isAllyTurn()) { const r = g.companionAct(); if (r) onAlly?.(r.did); continue; }
    const c = g.char(g.current()!.id);
    const foe = g.s.monsters.filter((m) => m.alive).sort((a, b) => cheb(a, c) - cheb(b, c))[0];
    if (heroesAct && foe && !tryDo(() => g.attack('p1', c.id, foe.id))) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, -1], [-1, -1], [-1, 1], [1, 1], [1, -1]]) if (tryDo(() => g.move('p1', c.id, foe.x + dx, foe.y + dy))) break;
      tryDo(() => g.attack('p1', c.id, foe.id));
    }
    const seen = new Set<string>();
    for (const e of [...g.consciousChars(), ...g.s.monsters.filter((m) => m.alive)]) {
      const k = `${e.x},${e.y}`;
      expect(seen.has(k), `stacked at ${k}`).toBe(false);
      seen.add(k);
    }
    if (g.s.phase === 'combat' && g.current()?.id === c.id) g.endTurn('p1', c.id);
  }
}

describe('companions', () => {
  it('lets the Dungeon Master bring someone of the story along, built from an SRD stat block', () => {
    const g = started();
    const r = g.companionTool({ action: 'join', name: 'Hartwin', role: 'Guide, no fighter', stats: 'commoner', stance: 'back', gear: '' });
    expect(r).toMatchObject({ companion: 'Hartwin', stats: 'commoner', stance: 'back', hp: '4/4', ac: 10, weapon: 'none (unarmed)' });
    expect(g.s.characters).toHaveLength(2);
    const h = g.s.companions[0];
    expect(h.companion).toMatchObject({ role: 'Guide, no fighter', template: 'commoner', stance: 'back', baseAc: 10 });
    expect(h.abilityIds).toEqual([]);
    expect(h.maxMana).toBe(0);
    // They are remembered as a person, and their portrait is that person's.
    const npc = g.s.memory.npcs.find((n) => n.id === h.companion!.npcId)!;
    expect(npc.name).toBe('Hartwin');
    const view = g.publicState({ busy: false, mode: 'scripted', model: null });
    expect(view.companions.map((c) => c.name)).toEqual(['Hartwin']);
    expect(view.companions[0].companion?.portraitId).toBeNull();
    expect(view.characters.map((c) => c.name)).not.toContain('Hartwin');
  });

  it('checks every argument: stat blocks, stances, names and the number of companions', () => {
    const g = started();
    expect(() => g.companionTool({ action: 'join', name: 'Ada', stats: 'dragon' })).toThrow(/commoner, noble, guard/);
    expect(() => g.companionTool({ action: 'wave', name: 'Ada' })).toThrow(/join/);
    expect(() => g.companionTool({ action: 'join', name: g.s.characters[0].name })).toThrow(/heroes/);
    g.companionTool({ action: 'join', name: 'Ada', stats: 'Guard', gear: 'kit' });
    expect(g.s.companions[0].equipment.mainHand?.defId).toBe('spear');
    expect(g.s.companions[0].companion?.stance).toBe('guard');
    expect(g.s.companions[0].ac).toBe(16);
    g.companionTool({ action: 'join', name: 'Bo', stats: 'warrior infantry' });
    g.companionTool({ action: 'join', name: 'Cy', stats: '' });
    expect(() => g.companionTool({ action: 'join', name: 'Di' })).toThrow(/already has 3/);
    expect(() => g.companionTool({ action: 'update', name: 'Ada', stance: 'dance' })).toThrow(/stance/);
    g.companionTool({ action: 'update', name: 'Ada', stance: 'attack', role: 'Bodyguard' });
    expect(g.s.companions[0].companion).toMatchObject({ stance: 'fight', role: 'Bodyguard' });
    // Joining again only updates.
    g.companionTool({ action: 'join', name: 'Ada', stats: 'scout' });
    expect(g.s.companions).toHaveLength(3);
    expect(g.s.companions[0]).toMatchObject({ maxHp: 16, companion: { template: 'scout' } });
  });

  it('names the stat block in German at a German table', () => {
    const g = started();
    g.setLanguage('p1', 'de');
    g.companionTool({ action: 'join', name: 'Hartwin', stats: 'Wache' });
    expect(g.s.companions[0].companion?.kind).toBe('Wache');
  });

  it('takes a weapon a hero hands over, and the spear no longer vanishes from the story', () => {
    const g = started();
    g.companionTool({ action: 'join', name: 'Hartwin', stats: 'commoner' });
    const lexe = g.s.characters[0];
    const spears = () => lexe.bag.reduce((n, b) => n + (b?.defId === 'spear' ? b.qty : 0), 0);
    g.grantItem(lexe.id, 'spear', 1);
    const before = spears();
    const at = lexe.bag.findIndex((b) => b?.defId === 'spear');
    g.give('p1', lexe.id, { type: 'bag', index: at, }, g.s.companions[0].id, 1);
    expect(g.s.companions[0].equipment.mainHand?.defId).toBe('spear');
    expect(spears()).toBe(before - 1);
    expect(g.s.log.at(-1)?.text).toMatch(/Hartwin takes up Spear/);
  });

  it('moves a hand-over the narration tells of from the hero to the companion', () => {
    const g = started();
    g.companionTool({ action: 'join', name: 'Hartwin', stats: 'commoner' });
    const lexe = g.s.characters[0];
    g.grantItem(lexe.id, 'spear', 1);
    const turn: TurnRecord = { said: [], narration: 'Lexe hands Hartwin the spear.', startMinutes: g.world.minutes, calls: [] };
    const out = applyFindings(g, { handed: [{ from: lexe.name, to: 'Hartwin', item: 'Spear' }], lost: [{ hero: lexe.id, item: 'Spear' }] }, turn);
    expect(out.skipped).toEqual([]);
    expect(out.applied).toEqual(['handed Spear']);
    expect(g.s.companions[0].equipment.mainHand?.defId).toBe('spear');
  });

  it('lets any player sort out a companion\'s gear between fights, but nobody plays them in one', () => {
    const g = started();
    g.companionTool({ action: 'join', name: 'Ada', stats: 'guard', gear: 'kit' });
    const ada = g.s.companions[0];
    g.invMove('p1', ada.id, { type: 'slot', slot: 'mainHand' }, { type: 'bag', index: 0 });
    expect(ada.bag[0]?.defId).toBe('spear');
    expect(() => g.invMove('stranger', ada.id, { type: 'bag', index: 0 }, { type: 'slot', slot: 'mainHand' })).toThrow(GameError);
    g.invMove('p1', ada.id, { type: 'bag', index: 0 }, { type: 'slot', slot: 'mainHand' });
    g.startEncounter([{ defId: 'goblin', count: 2 }], { source: 'story', context: 'test' });
    expect(() => g.invMove('p1', ada.id, { type: 'slot', slot: 'mainHand' }, { type: 'bag', index: 0 })).toThrow(/on their own/);
    expect(() => g.endTurn('p1', ada.id)).toThrow(GameError);
  });

  it('fights on the party\'s side: an ally in the initiative order, played by the server, a target for monsters', () => {
    const g = started(3, ['fighter']);
    g.companionTool({ action: 'join', name: 'Ada', stats: 'warrior_veteran', stance: 'fight', gear: 'kit' });
    const ada = g.s.companions[0];
    g.startEncounter([{ defId: 'goblin', count: 3 }], { source: 'story', context: 'test' });
    expect(g.s.combat!.order.filter((o) => o.kind === 'ally').map((o) => o.id)).toEqual([ada.id]);
    expect(g.consciousChars().map((c) => c.id)).toContain(ada.id);
    expect(ada.x).toBeLessThan(5);
    const xp = g.s.characters[0].xp;
    let acted = 0;
    for (let step = 0; step < 3000 && g.s.phase === 'combat'; step++) {
      if (g.isAllyTurn()) { const r = g.companionAct(); if (r && /attacks/.test(r.did)) acted++; continue; }
      if (g.isMonsterTurn()) { const b = g.monsterBlock(); for (const m of b) g.monsterAct(m.id); g.finishMonsterBlock(b); continue; }
      // The hero only dodges about: the companion has to win this fight.
      g.endTurn('p1', g.current()!.id);
    }
    expect(acted).toBeGreaterThan(0);
    expect(g.s.lastFight?.result).toBe('victory');
    // Companions earn no experience and never level up.
    expect(ada.xp).toBe(0);
    expect(ada.level).toBe(1);
    expect(g.s.characters[0].xp).toBeGreaterThan(xp);
  });

  it('keeps a companion who stays back out of the fray', () => {
    const g = started(5, ['fighter', 'cleric']);
    g.companionTool({ action: 'join', name: 'Hartwin', stats: 'commoner', stance: 'back', gear: 'kit' });
    g.startEncounter([{ defId: 'goblin', count: 2 }], { source: 'story', context: 'test' });
    const did: string[] = [];
    fight(g, true, (d) => did.push(d));
    expect(g.s.phase).not.toBe('combat');
    expect(did.length).toBeGreaterThan(0);
    expect(did.filter((d) => /attacks/.test(d))).toEqual([]);
  });

  it('loses the fight when the heroes fall, whoever else still stands', () => {
    const g = started(2, ['wizard']);
    g.companionTool({ action: 'join', name: 'Kara', stats: 'knight', stance: 'back', gear: 'kit' });
    g.startEncounter([{ defId: 'ogre', count: 2 }], { source: 'story', context: 'test' });
    g.s.characters[0].hp = 0;
    g.s.characters[0].deathSaves.failures = 2;
    fight(g, false);
    expect(['rescued', 'defeat']).toContain(g.s.lastFight?.result);
    expect(g.s.phase).not.toBe('combat');
  });

  it('describes companions to the Dungeon Master, in and out of a fight', () => {
    const g = started();
    g.companionTool({ action: 'join', name: 'Hartwin', role: 'Guide', stats: 'commoner' });
    expect(describeWorld(g)).toMatch(/Companions travelling with the party[\s\S]*Hartwin \[ally\d+\]: Guide\. Stats of a Commoner/);
    expect(describeWorld(g)).not.toMatch(/Other people the party has met:[\s\S]*Hartwin/);
    g.startEncounter([{ defId: 'goblin', count: 1 }], { source: 'story', context: 'test' });
    expect(describeCombat(g)).toMatch(/Companions \(on the party's side[\s\S]*Hartwin/);
    const tool = DM_TOOLS.find((t) => t.name === 'companion') as { strict?: boolean; input_schema: { properties: Record<string, { type: string; enum?: unknown }> } };
    expect(tool.strict).toBeUndefined();
    expect(Object.values(tool.input_schema.properties).every((p) => p.type === 'string' && !p.enum)).toBe(true);
  });

  it('parts with a companion: quest items stay with the heroes, the rest goes with them', () => {
    const g = started();
    const spearsBefore = g.s.characters.flatMap((c) => c.bag).filter((b) => b?.defId === 'spear').length;
    g.companionTool({ action: 'join', name: 'Ada', stats: 'guard', gear: 'kit' });
    const ada = g.s.companions[0];
    g.giveStoryItem({ characterId: ada.id, name: 'Sealed letter', description: 'For the abbot.', category: 'quest', icon: 'auto', quantity: 1, quest: true, note: '' });
    expect(ada.bag.some((b) => b && g.def(b.defId).name === 'Sealed letter')).toBe(true);
    const r = g.companionTool({ action: 'leave', name: 'Ada' });
    expect(r).toMatchObject({ left: 'Ada' });
    expect(g.s.companions).toEqual([]);
    expect(g.s.characters.some((c) => c.bag.some((b) => b && g.def(b.defId).name === 'Sealed letter'))).toBe(true);
    expect(g.s.characters.flatMap((c) => c.bag).filter((b) => b?.defId === 'spear').length).toBe(spearsBefore);
  });

  it('lays a fallen companion to rest at the next long rest, and the heroes take what they carried', () => {
    const g = started();
    g.companionTool({ action: 'join', name: 'Ada', stats: 'guard', gear: 'kit' });
    const ada = g.s.companions[0];
    ada.hp = 0; ada.dead = true;
    const spears = () => g.s.characters.flatMap((c) => c.bag).filter((b) => b?.defId === 'spear').reduce((n, b) => n + b!.qty, 0);
    const before = spears();
    g.storyRest('long', 480);
    expect(g.s.companions).toEqual([]);
    expect(spears()).toBe(before + 1);
  });

  it('keeps companions in saves, and old saves start without any', () => {
    const g = started();
    g.companionTool({ action: 'join', name: 'Hartwin', stats: 'commoner' });
    const copy = new Game('test', seeded(9), JSON.parse(JSON.stringify(g.s)));
    expect(copy.s.companions.map((c) => c.name)).toEqual(['Hartwin']);
    const old = JSON.parse(JSON.stringify(g.s));
    delete old.companions;
    expect(new Game('test', seeded(9), old).s.companions).toEqual([]);
  });
});
