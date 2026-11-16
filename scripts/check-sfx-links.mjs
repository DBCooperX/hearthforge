// Usage: node check-sfx-links.mjs   (Node 18+, any folder)
// Does what the Hearthforge server does at start: reads each Kenney pack page, finds the .zip link, and checks that it answers with a zip.
const pages = ['impact-sounds', 'rpg-audio', 'interface-sounds'];
let bad = 0;
for (const id of pages) {
  const page = `https://kenney.nl/assets/${id}`;
  try {
    const html = await (await fetch(page)).text();
    const link = /https?:\/\/[^"'\s<>]+\.zip/i.exec(html)?.[0];
    if (!link) throw new Error('no .zip link on the page');
    const r = await fetch(link);
    const b = new Uint8Array(await r.arrayBuffer());
    const ok = r.ok && b[0] === 0x50 && b[1] === 0x4b && b.length > 100000;
    if (!ok) bad++;
    console.log(ok ? 'OK  ' : 'FAIL', id, `(${r.status}, ${(b.length / 1e6).toFixed(1)} MB)`, link);
  } catch (e) { bad++; console.log('FAIL', id, e.message); }
}
console.log(`\n${pages.length - bad}/${pages.length} OK`);
