import { describe, expect, it } from 'vitest';
import { CLASS_FEATURES, CLASS_IDS, OPTIONS, RESOURCES, featureLine, optionLine } from '../../shared/classes';
import { ABILITIES, SKILLS } from '../../shared/content';
import { GLYPH_PATHS, featureLineKeys, glyphKeys, isGlyphKey } from '../../shared/glyphs';
import { FEATS, SPECIES, STYLES, effectLine } from '../../shared/rules';
import { SPELLS } from '../../shared/spells';
import { ArtStore } from '../src/artLibrary';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const found = (keys: string[]) => keys.some(isGlyphKey);

describe('game-icons for skills, feats, spells and features', () => {
  it('every path is "author/name" in the shape of game-icons.net', () => {
    for (const [key, p] of Object.entries(GLYPH_PATHS)) expect(p, key).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/);
  });

  it('every spell has an icon of its own, and every skill and feat a picture', () => {
    for (const s of SPELLS) expect(isGlyphKey(`spell:${s.id}`), s.id).toBe(true);
    for (const s of Object.keys(SKILLS)) expect(isGlyphKey(`skill:${s}`), s).toBe(true);
    for (const f of Object.values(FEATS)) expect(found(glyphKeys('feat', f.id)), f.id).toBe(true);
  });

  it('every class feature, option, style, species trait and resource finds an icon', () => {
    for (const id of CLASS_IDS) for (const f of CLASS_FEATURES[id]) expect(isGlyphKey(`feature:${f.id}`), `${id}.${f.id}`).toBe(true);
    for (const o of Object.values(OPTIONS)) expect(isGlyphKey(`feature:${o.id}`), o.id).toBe(true);
    for (const s of Object.values(STYLES)) expect(isGlyphKey(`feature:style_${s.id}`), s.id).toBe(true);
    for (const r of Object.values(RESOURCES)) expect(isGlyphKey(`feature:${r.id}`), r.id).toBe(true);
    for (const sp of Object.values(SPECIES)) for (const e of sp.effects) expect(found(featureLineKeys(effectLine(e))), e.name).toBe(true);
  });

  it('class actions and sheet lines map to icons, falling back to a school, ability or class', () => {
    for (const a of Object.values(ABILITIES)) {
      expect(found(glyphKeys('spell', a.id, a.school)), a.id).toBe(true);
    }
    expect(glyphKeys('spell', 'brand_new', 'evocation')).toEqual(['spell:brand_new', 'feature:brand_new', 'school:evocation']);
    expect(glyphKeys('skill', 'stealth')).toEqual(['skill:stealth', 'ability:dex']);
    expect(glyphKeys('feature', 'brand_new', 'rogue')).toEqual(['feature:brand_new', 'class:rogue']);
    const rage = CLASS_FEATURES.barbarian.find((f) => f.id === 'rage')!;
    expect(featureLineKeys(featureLine(rage))[0]).toBe('feature:rage');
    expect(featureLineKeys(optionLine(Object.values(OPTIONS)[0]))[0]).toBe(`feature:${Object.values(OPTIONS)[0].id}`);
  });

  it('the art library lists the files to fetch and shows the icons it has', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hf-art-'));
    const store = new ArtStore(dir);
    expect(Object.keys(store.manifest().icons).some((k) => k.startsWith('spell:'))).toBe(false);
    const path = GLYPH_PATHS['spell:fire_bolt'];
    mkdirSync(join(dir, 'game-icons', path.split('/')[0]), { recursive: true });
    for (let i = 0; i < 25; i++) { mkdirSync(join(dir, 'game-icons', 'x'), { recursive: true }); writeFileSync(join(dir, 'game-icons', 'x', `f${i}.svg`), '<svg/>'); }
    writeFileSync(join(dir, 'game-icons', `${path}.svg`), '<svg/>');
    writeFileSync(join(dir, 'library.json'), JSON.stringify({ icons: 'game-icons', packs: {} }));
    const icons = new ArtStore(dir).manifest().icons;
    expect(icons['spell:fire_bolt']).toEqual({ src: `/art/game-icons/${path}.svg` });
    expect(icons['spell:fireball']).toBeUndefined();
  });
});
