// Painted figures follow what a creature really is, not the rough procedural look: a Warhorse Skeleton is a skeletal
// horse, a swarm is a swarm, and a creature with no hands holds no weapon.
import { describe, expect, it } from 'vitest';
import { MONSTERS } from '../src/data/monsters';
import srd from '../src/data/srd/monsters.json';
import { anatomyOf, fixLook, hasAnatomy } from '../src/data/monsterAnatomy';
import { monsterFigurePrompt, monsterFigureSubject, tallFigure } from '../src/game/pictures';
import { baseLook, lookKey } from '../../shared/monsterLook';

const prompt = (id: string) => monsterFigurePrompt(MONSTERS[id]).prompt;

describe('monster anatomy for painted figures', () => {
  it('describes every SRD creature by an explicit rule, not by a guess from its body', () => {
    const missing = (srd as { id: string }[]).map((m) => m.id).filter((id) => !hasAnatomy(id));
    expect(missing).toEqual([]);
  });

  it('paints a Warhorse Skeleton as a skeletal horse with no rider, weapon or humanoid body', () => {
    const p = prompt('warhorse_skeleton');
    expect(p).toContain('Warhorse Skeleton');
    expect(p).toMatch(/skeletal war horse/);
    expect(p).toMatch(/four legs/);
    expect(p).not.toMatch(/humanoid|wielding/);
    expect(MONSTERS.warhorse_skeleton.look.body).toBe('beast');
    expect(MONSTERS.warhorse_skeleton.look.weapon).toBeNull();
    expect(tallFigure(MONSTERS.warhorse_skeleton)).toBe(false);
  });

  it('gives mounts, hounds and winged horses their own bodies', () => {
    expect(MONSTERS.worg.look.body).toBe('beast');
    expect(MONSTERS.hell_hound.look.body).toBe('beast');
    expect(MONSTERS.giant_eagle.look.body).toBe('bird');
    expect(MONSTERS.giant_owl.look.body).toBe('bird');
    expect(MONSTERS.pegasus.look.wings).toBe('feather');
    expect(MONSTERS.unicorn.look.horns).toBe(true);
    expect(prompt('nightmare')).toMatch(/black horse/);
    expect(MONSTERS.werewolf_human.look.body).toBe('humanoid');
    expect(MONSTERS.werewolf_wolf.look.body).toBe('beast');
    expect(MONSTERS.werebear_bear.look.body).toBe('bear');
    expect(prompt('werewolf_hybrid')).toMatch(/head of a wolf/);
    expect(prompt('swarm_of_rats')).toMatch(/swarm/);
    expect(prompt('gelatinous_cube')).toMatch(/cube/);
  });

  it('holds no weapon or armour for creatures without hands, but keeps them for those with', () => {
    for (const id of ['wolf', 'riding_horse', 'swarm_of_bats', 'gray_ooze', 'adult_red_dragon', 'giant_spider']) {
      expect(prompt(id)).not.toMatch(/wielding|armour/);
      expect(MONSTERS[id].look.weapon).toBeNull();
    }
    expect(prompt('goblin')).toContain('wielding a sword');
    expect(prompt('knight')).toMatch(/armour/);
  });

  it('paints upright creatures tall and the rest square', () => {
    for (const id of ['goblin', 'knight', 'skeleton', 'ogre', 'fire_giant', 'treant', 'lich']) expect(tallFigure(MONSTERS[id])).toBe(true);
    for (const id of ['warhorse_skeleton', 'wolf', 'adult_red_dragon', 'giant_spider', 'swarm_of_rats', 'gelatinous_cube', 'purple_worm', 'tyrannosaurus_rex']) expect(tallFigure(MONSTERS[id])).toBe(false);
  });

  it('adds only what the Dungeon Master restyled, so a three-headed ogre shows three heads', () => {
    const look = { ...MONSTERS.ogre.look, heads: 3 as const };
    expect(monsterFigurePrompt(MONSTERS.ogre, look).prompt).toContain('3 heads');
    expect(prompt('ogre')).not.toContain('heads');
  });

  it('keeps a figure only while its prompt is the same, so a changed description repaints it', () => {
    const a = monsterFigureSubject('warhorse_skeleton', MONSTERS.warhorse_skeleton.look);
    expect(a).toMatch(/^m:warhorse_skeleton\|.+\|[0-9a-f]{8}$/);
    expect(monsterFigureSubject('warhorse_skeleton', MONSTERS.warhorse_skeleton.look)).toBe(a);
    expect(monsterFigureSubject('warhorse_skeleton', { ...MONSTERS.warhorse_skeleton.look, color: 'red' })).not.toBe(a);
    expect(monsterFigureSubject('nobody', baseLook('beast', 'small', 'tan'))).toBe(`m:nobody|${lookKey(baseLook('beast', 'small', 'tan'))}`);
  });

  it('leaves a look alone when the creature has no rule', () => {
    const look = baseLook('humanoid', 'medium', 'tan', { weapon: 'axe' });
    expect(fixLook('something_new', look)).toBe(look);
    expect(anatomyOf('something_new', 'Something New', look).tall).toBe(true);
  });
});
