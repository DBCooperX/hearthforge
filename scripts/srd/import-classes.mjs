#!/usr/bin/env node
// Builds shared/srd/classes.json from the classes of the System Reference Document 5.2.1
// (Wizards of the Coast, CC BY 4.0), as structured by the 5e-bits "5e-database" project
// (MIT). Run it again when the source data changes:
//
//   node scripts/srd/import-classes.mjs          (downloads the source files)
//   node scripts/srd/import-classes.mjs <dir>    (uses local copies named 5e-SRD-*.json)
//
// Only the tables are taken: hit dice, proficiencies, which feature arrives at which
// level, the numbers that grow with level (rages, focus points, sneak attack dice) and
// the spell slots. What each feature does is written for Hearthforge in shared/classes.ts.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2024/en/';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../shared/srd/classes.json');
const ABILITY = { str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha' };

async function load(name) {
  const file = `5e-SRD-${name}.json`;
  const dir = process.argv[2];
  if (dir) return JSON.parse(await readFile(join(dir, file), 'utf8'));
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
}

const slug = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const clean = (s) => String(s).replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
/** Rows of the class tables that are not features of their own. */
const SKIP = /subclass$|^ability score improvement$|^epic boon$|(domain|devotion|draconic|fiend|land) spells$/i;

const [classes, levels, features, subclasses] = await Promise.all(['Classes', 'Levels', 'Features', 'Subclasses'].map(load));

const out = {};
for (const c of classes) {
  const profs = c.proficiencies.map((p) => p.index);
  const armor = [];
  if (profs.includes('all-armor')) armor.push('light', 'medium', 'heavy');
  for (const k of ['light', 'medium', 'heavy']) if (profs.includes(`${k}-armor`)) armor.push(k);
  if (profs.includes('shields')) armor.push('shield');
  const weapons = ['simple', 'martial'].filter((k) => profs.includes(`${k}-weapons`));
  const weaponIds = profs.filter((p) => /s$/.test(p) && !/armor|shields|weapons|saving|tools/.test(p)).map((p) => slug(p.replace(/s$/, '')));
  const skills = c.proficiency_choices.find((p) => p.from.options?.some((o) => o.item?.index?.startsWith('skill-')));
  const sub = subclasses.find((s) => s.class.index === c.index);
  const own = (subclass) => features.filter((f) => f.class.index === c.index && !!f.subclass === subclass);
  const levelOf = (f) => Number(String(f.level?.index ?? '').match(/\d+$/)?.[0] ?? f.level);
  // A feature that comes back at later levels (Indomitable, Metamagic) is listed once, with every level.
  const collect = (list) => {
    const byName = new Map();
    for (const f of list) {
      const name = clean(f.name).split(' Whenever')[0];
      if (SKIP.test(name)) continue;
      const id = slug(name);
      const at = levelOf(f);
      const have = byName.get(id);
      if (have) { if (!have.levels.includes(at)) have.levels.push(at); }
      else byName.set(id, { id, name, levels: [at] });
    }
    // The level tables and the subclass list name repeats, and a few features the feature file lacks.
    const also = list === classOwn
      ? levels.filter((x) => x.class.index === c.index && !x.subclass).flatMap((l) => l.features.map((f) => ({ name: f.name, level: l.level })))
      : (sub.features ?? []);
    for (const f of also) {
      const name = clean(f.name).split(' Whenever')[0];
      if (SKIP.test(name)) continue;
      const id = slug(name);
      const have = byName.get(id);
      if (have) { if (!have.levels.includes(f.level)) have.levels.push(f.level); }
      else byName.set(id, { id, name, levels: [f.level] });
    }
    return [...byName.values()].map((f) => ({ ...f, levels: f.levels.sort((a, b) => a - b) })).sort((a, b) => a.levels[0] - b.levels[0]);
  };
  const classOwn = own(false);
  const rows = levels.filter((l) => l.class.index === c.index && !l.subclass).sort((a, b) => a.level - b.level);
  const table = rows.map((l) => {
    const spec = {};
    for (const [k, v] of Object.entries(l.class_specific ?? {})) spec[k] = typeof v === 'object' && v ? v.dice_count : v;
    const sc = l.spellcasting;
    return {
      level: l.level,
      ...(Object.keys(spec).length ? { spec } : {}),
      ...(sc ? { cantrips: sc.cantrips_known ?? 0, prepared: sc.prepared_spells ?? 0, slots: Array.from({ length: 9 }, (_, i) => sc[`spell_slots_level_${i + 1}`] ?? 0) } : {}),
    };
  });
  out[c.index] = {
    id: c.index,
    name: c.name,
    hitDie: c.hit_die,
    saves: c.saving_throws.map((s) => ABILITY[s.index]),
    armor: [...new Set(armor)],
    weapons,
    weaponIds,
    skillCount: skills?.choose ?? 2,
    skills: (skills?.from.options ?? []).map((o) => o.item.index.replace('skill-', '').replace(/-/g, ' ')),
    features: collect(classOwn),
    subclass: { id: slug(sub.name), name: clean(sub.name), features: collect(own(true)) },
    asi: rows.filter((l) => l.features.some((f) => f.name === 'Ability Score Improvement')).map((l) => l.level),
    table,
  };
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, `{\n${Object.entries(out).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`);
const n = Object.values(out).reduce((sum, c) => sum + c.features.length + c.subclass.features.length, 0);
console.log(`Wrote ${OUT}: ${Object.keys(out).length} classes, ${n} features.`);
