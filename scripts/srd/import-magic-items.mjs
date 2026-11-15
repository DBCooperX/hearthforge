#!/usr/bin/env node
// Builds shared/srd/magic-items.json and server/src/data/srd/magic-item-rules.json from the
// magic items of the System Reference Document 5.2.1 (Wizards of the Coast, CC BY 4.0), as
// structured by the 5e-bits "5e-database" project (MIT). Run it again when the source changes:
//
//   node scripts/srd/import-magic-items.mjs          (downloads the source file)
//   node scripts/srd/import-magic-items.mjs <dir>    (uses a local copy named 5e-SRD-Magic-Items.json)
//
// shared/srd/magic-items.json holds name, category, rarity and attunement. What an item does
// in the game, its German name and its short text are written for Hearthforge in
// shared/magicItemTable.ts. The rules text goes to the server only, for the Dungeon Master.
// The generic "+1/+2/+3" entries (Armor, Weapon, Shield, Ammunition) and other variants are
// left out here: the game makes its own +1 to +3 versions of every catalogue weapon and armor.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2024/en/';
const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../shared/srd/magic-items.json');
const RULES = resolve(here, '../../server/src/data/srd/magic-item-rules.json');

async function load(name) {
  const file = `5e-SRD-${name}.json`;
  const dir = process.argv[2];
  if (dir) return JSON.parse(await readFile(join(dir, file), 'utf8'));
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
}

const slug = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const clean = (s) => String(s ?? '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const GENERIC = new Set(['armor', 'weapon', 'shield', 'ammunition']);

function rarity(name) {
  const r = name.toLowerCase();
  // "Uncommon (+1), Rare (+2)..." and "Rarity Varies": the lowest it comes in.
  for (const k of ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact']) if (r.startsWith(k)) return k.replace(' ', '_');
  if (r.includes('varies')) return 'rare';
  return 'rare';
}

const raw = await load('Magic-Items');
const items = {};
const rules = {};
for (const r of raw) {
  if (r.variant || GENERIC.has(r.index)) continue;
  const id = slug(r.name);
  const desc = clean(Array.isArray(r.desc) ? r.desc.join(' ') : r.desc);
  items[id] = {
    id, name: r.name.replace(/\s*\(.*\)$/, ''), category: r.equipment_category.index, rarity: rarity(r.rarity.name),
    ...(r.attunement || /requires attunement/i.test(desc) ? { attune: true } : {}),
  };
  rules[id] = desc;
}
await mkdir(dirname(OUT), { recursive: true });
await mkdir(dirname(RULES), { recursive: true });
await writeFile(OUT, JSON.stringify(items, null, 0).replace(/},"/g, '},\n"') + '\n');
await writeFile(RULES, JSON.stringify(rules, null, 0).replace(/","/g, '",\n"') + '\n');
console.log(`${Object.keys(items).length} magic items written to ${OUT}`);
