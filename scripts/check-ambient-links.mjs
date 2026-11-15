// Usage: node scripts/check-ambient-links.mjs   (Node 18+, run from the repo root)
// Reads AMBIENT_TRACKS in server/src/music.ts and checks that every link answers with audio.
import { readFileSync } from 'node:fs';
const src = readFileSync(process.argv[2] ?? 'server/src/music.ts', 'utf8');
const block = src.slice(src.indexOf('AMBIENT_TRACKS: TrackSource[]'), src.indexOf('export const DEFAULT_TRACKS'));
const files = [...block.matchAll(/oga\('([^']+)'\)/g)].map((m) => m[1]);
let bad = 0;
for (const f of files) {
  const url = `https://opengameart.org/sites/default/files/${f}`;
  try {
    const r = await fetch(url);
    const b = new Uint8Array(await r.arrayBuffer());
    const head = String.fromCharCode(...b.slice(0, 4));
    const ok = r.ok && b.length > 10000 && (head === 'OggS' || head === 'RIFF' || head.startsWith('ID3') || head === 'fLaC');
    if (!ok) bad++;
    console.log(ok ? 'OK  ' : 'FAIL', f, `(${r.status}, ${(b.length / 1e6).toFixed(2)} MB)`);
  } catch (e) { bad++; console.log('FAIL', f, e.message); }
}
console.log(`\n${files.length - bad}/${files.length} OK`);
