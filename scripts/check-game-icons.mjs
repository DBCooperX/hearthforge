// Checks that every game-icons.net path the game uses still exists in github.com/game-icons/icons.
// Run it from time to time (or after adding an icon): node scripts/check-game-icons.mjs
import { readFileSync } from 'node:fs';
const base = process.env.HEARTHFORGE_GAME_ICONS_URL || 'https://raw.githubusercontent.com/game-icons/icons/master';
const paths = new Set();
for (const f of ['shared/art.ts', 'shared/glyphs.ts']) {
  for (const m of readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').matchAll(/'([a-z0-9-]+\/[a-z0-9-]+)'/g)) paths.add(m[1]);
}
const list = [...paths];
const bad = [];
await Promise.all(Array.from({ length: 12 }, async () => {
  for (let p = list.pop(); p; p = list.pop()) {
    const r = await fetch(`${base}/${p}.svg`, { method: 'HEAD' }).catch(() => null);
    if (!r?.ok) bad.push(p);
  }
}));
console.log(bad.length ? `Missing: ${bad.sort().join(', ')}` : `All ${paths.size} icons found.`);
process.exit(bad.length ? 1 : 0);
