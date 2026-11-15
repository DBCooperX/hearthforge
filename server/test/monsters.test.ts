import { describe, expect, it } from 'vitest';
import { tileWalkable } from '../../shared/battlemap';
import { CREATURE_TYPES, LOOK_TOKENS, SIZES, applyLookTokens, baseLook, distToFootprint, lookKey } from '../../shared/monsterLook';
import { MONSTERS } from '../src/data/monsters';
import { describeCombat } from '../src/dm/context';
import { Game, GameError } from '../src/game/engine';

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

function party(seed = 1) {
  const g = new Game('test', seeded(seed));
  g.upsertPlayer('p1', 'Tester', true);
  for (const c of ['fighter', 'rogue', 'wizard', 'cleric'] as const) g.addCharacter('p1', c, '');
  g.start();
  return g;
}

describe('monster looks', () => {
  it('gives every catalogue creature an SRD type, a size and a look', () => {
    for (const m of Object.values(MONSTERS)) {
      expect(CREATURE_TYPES, m.id).toContain(m.type);
      expect(SIZES, m.id).toContain(m.size);
      expect(m.look.size, m.id).toBe(m.size);
      expect(m.cr, m.id).toMatch(/^\d+(\/\d+)?$/);
      expect(m.look.imageId).toBeNull();
    }
    expect(MONSTERS.giant_rat.look.body).toBe('rodent');
    expect(MONSTERS.ogre.size).toBe('large');
  });

  it('layers the extras the Dungeon Master asks for and ignores nonsense', () => {
    const { look, ignored } = applyLookTokens(MONSTERS.ogre.look, ['heads:3', 'horns', 'wings:bat', 'color:red', 'eyes:yellow', 'aura:fire', 'mutation:rotting', 'armor:plate', 'heads:9', 'laser']);
    expect(look).toMatchObject({ body: 'giant', size: 'large', heads: 3, horns: true, wings: 'bat', color: 'red', eyes: 'yellow', aura: 'fire', mutation: 'rotting', armor: 'plate' });
    expect(ignored).toEqual(['heads:9', 'laser']);
    expect(MONSTERS.ogre.look.heads).toBe(1);
    expect(lookKey(look)).not.toBe(lookKey(MONSTERS.ogre.look));
    for (const t of LOOK_TOKENS) expect(applyLookTokens(baseLook('beast', 'medium', 'grey'), [t]).ignored, t).toEqual([]);
  });

  it('measures distance to the whole space a big creature occupies', () => {
    expect(distToFootprint({ x: 5, y: 5 }, 2, { x: 7, y: 6 })).toBe(1);
    expect(distToFootprint({ x: 5, y: 5 }, 2, { x: 6, y: 6 })).toBe(0);
    expect(distToFootprint({ x: 5, y: 5 }, 3, { x: 2, y: 9 })).toBe(3);
  });
});

describe('monsters in a fight', () => {
  it('restyles a catalogue creature without changing its statistics', () => {
    const g = party();
    g.startEncounter([{ defId: 'ogre', count: 1, name: 'Dreiköpfiger Oger', description: 'Drei Köpfe streiten sich, wer zuerst zubeissen darf.', look: ['heads:3', 'bogus'], power: 'stronger' }], { source: 'story', context: 'test' });
    const m = g.s.monsters[0];
    expect(m.name).toBe('Dreiköpfiger Oger');
    expect(m.defId).toBe('ogre');
    expect(m.look!.heads).toBe(3);
    expect(m.maxHp).toBe(Math.round(MONSTERS.ogre.hp * 1.5));
    const view = g.publicState({ busy: false, mode: 'scripted', model: null }).monsters[0];
    expect(view).toMatchObject({ ac: MONSTERS.ogre.ac, tiles: 2, restyled: true, kind: 'giant', description: 'Drei Köpfe streiten sich, wer zuerst zubeissen darf.' });
    expect(describeCombat(g)).toContain('3 heads');
    expect(() => g.startEncounter([{ defId: 'tarrasque', count: 1 }], { source: 'story', context: 'test' })).toThrow(GameError);
  });

  it('uses the catalogue look and a translated description when nothing is restyled', () => {
    const g = party();
    g.setLanguage('p1', 'de');
    g.startEncounter([{ defId: 'giant_rat', count: 2, name: '', description: '', look: [], power: 'standard' }], { source: 'story', context: 'test' });
    const [a, b] = g.publicState({ busy: false, mode: 'scripted', model: null }).monsters;
    expect(a.name).toBe('Riesenratte 1');
    expect(b.name).toBe('Riesenratte 2');
    expect(a).toMatchObject({ tiles: 1, restyled: false, kind: 'beast', description: 'Eine hundegrosse Ratte, die im Rudel kämpft.' });
    expect(a.look.body).toBe('rodent');
  });

  it('stands big creatures on open ground without overlapping anything', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const g = party(seed);
      g.startEncounter([{ defId: 'hill_giant', count: 1 }, { defId: 'ogre', count: 2 }, { defId: 'goblin', count: 3, look: ['size:gargantuan'] }], { source: 'story', context: 'test', setting: seed % 2 ? 'forest' : 'bridge' });
      const taken = new Set<string>();
      for (const c of g.s.characters) taken.add(`${c.x},${c.y}`);
      for (const m of g.s.monsters) {
        const n = g.tilesOf(m);
        expect(n).toBe(m.defId === 'hill_giant' ? 3 : m.defId === 'ogre' ? 2 : 4);
        for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) {
          const k = `${m.x + dx},${m.y + dy}`;
          expect(tileWalkable(g.tile(m.x + dx, m.y + dy)), `seed ${seed} ${m.name} ${k}`).toBe(true);
          expect(taken.has(k), `seed ${seed} ${m.name} overlaps at ${k}`).toBe(false);
          taken.add(k);
        }
      }
    }
  });

  it('lets a big creature close in, attack and be attacked across its whole space', () => {
    const g = party(3);
    g.startEncounter([{ defId: 'ogre', count: 1 }], { source: 'story', context: 'test', setting: 'forest' });
    const ogre = g.s.monsters[0];
    let hurt = false;
    for (let step = 0; step < 60 && g.s.phase === 'combat' && !hurt; step++) {
      if (g.isMonsterTurn()) {
        const block = g.monsterBlock();
        for (const m of block) g.monsterAct(m.id);
        g.finishMonsterBlock(block);
      } else {
        const cur = g.current()!;
        g.endTurn('p1', cur.id);
      }
      for (const c of g.s.characters) expect(c.x >= ogre.x && c.x < ogre.x + 2 && c.y >= ogre.y && c.y < ogre.y + 2, 'ogre stands on a hero').toBe(false);
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) expect(tileWalkable(g.tile(ogre.x + dx, ogre.y + dy))).toBe(true);
      hurt = g.s.log.some((l) => l.roll?.actor === ogre.name);
    }
    expect(hurt, 'the ogre reached the party and attacked').toBe(true);
    // A hero beside the far corner of the ogre's space is adjacent to it.
    const f = g.s.characters[0];
    f.hp = f.maxHp;
    f.x = ogre.x + 2; f.y = ogre.y + 2;
    for (const o of g.s.characters) if (o !== f) { o.x = 1; o.y = 1 + g.s.characters.indexOf(o); }
    g.s.combat!.order = [{ id: f.id, kind: 'pc', initiative: 20 }, { id: ogre.id, kind: 'monster', initiative: 1 }];
    g.s.combat!.turnIndex = 0; g.s.combat!.actionUsed = false; g.s.combat!.attacksLeft = 1; g.s.combat!.movementLeft = 6;
    g.attack('p1', f.id, ogre.id);
    expect(g.s.log.filter((l) => l.roll?.actor === f.name).length).toBe(1);
    expect(() => g.move('p1', f.id, ogre.x + 1, ogre.y + 1)).toThrow(GameError);
  });
});
