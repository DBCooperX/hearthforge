// Usage: node check-ambient-links.mjs   (Node 18+, any folder)
// Checks that every ambient link answers with audio.
// Works from any folder: the file names are listed here (keep in step with AMBIENT_TRACKS).
const files = ['qubodupFireLoop.ogg', 'wind-01_0.ogg', 'forest_2.ogg'];
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
