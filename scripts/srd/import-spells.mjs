#!/usr/bin/env node
// Builds shared/srd/spells.json and server/src/data/srd/spell-rules.json from the spells of the
// System Reference Document 5.2.1 (Wizards of the Coast, CC BY 4.0), as structured by the
// 5e-bits "5e-database" project (MIT). Run it again when the source data changes:
//
//   node scripts/srd/import-spells.mjs          (downloads the source file)
//   node scripts/srd/import-spells.mjs <dir>    (uses a local copy named 5e-SRD-Spells.json)
//
// shared/srd/spells.json holds the numbers: level, school, classes, casting time, range,
// concentration and the damage dice at each spell level. What a spell does in the game, its
// German name and the short texts players read are written for Hearthforge in shared/spells.ts.
// The rules text goes to the server only, where the Dungeon Master reads it to play out the
// spells the engine does not run itself.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2024/en/';
const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../shared/srd/spells.json');
const RULES = resolve(here, '../../server/src/data/srd/spell-rules.json');

async function load(name) {
  const file = `5e-SRD-${name}.json`;
  const dir = process.argv[2];
  if (dir) return JSON.parse(await readFile(join(dir, file), 'utf8'));
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
}

const slug = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const clean = (s) => String(s ?? '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

function time(t) {
  if (/^bonus action/i.test(t)) return 'bonus';
  if (/^reaction/i.test(t)) return 'reaction';
  if (/^action/i.test(t)) return 'action';
  return 'long';
}

function range(r) {
  const feet = r.match(/^(\d+) feet/);
  if (feet) return Number(feet[1]);
  if (/^touch/i.test(r)) return 5;
  if (/^self/i.test(r)) return 0;
  const miles = r.match(/^(\d+) miles?/);
  return miles ? Number(miles[1]) * 5280 : 0;
}

const spells = await load('Spells');
const out = {};
const rules = {};
for (const s of spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))) {
  const id = slug(s.name);
  const dmg = s.damage ?? {};
  const slots = dmg.damage_at_slot_level;
  const byLevel = dmg.damage_at_character_level;
  out[id] = {
    id, name: clean(s.name), level: s.level, school: s.school.index,
    classes: s.classes.map((c) => c.index),
    time: time(s.casting_time), range: range(s.range), self: /^self/i.test(s.range),
    ...(s.concentration ? { conc: true } : {}),
    ...(s.ritual ? { ritual: true } : {}),
    duration: clean(s.duration),
    ...(dmg.damage_type ? { type: dmg.damage_type.index } : {}),
    ...(slots ? { dice: slots } : {}),
    ...(byLevel ? { cantrip: byLevel } : {}),
  };
  rules[id] = clean(s.description) + (s.higher_level ? ` ${clean(s.higher_level)}` : '');
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(out, null, 0).replace(/\},"/g, '},\n"')}\n`);
await writeFile(RULES, `${JSON.stringify(rules, null, 0).replace(/","/g, '",\n"')}\n`);
console.log(`${Object.keys(out).length} spells -> ${OUT}`);
