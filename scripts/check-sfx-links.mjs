// Usage: node check-sfx-links.mjs   (Node 18+, any folder)
// Does what the Hearthforge server does at start: reads each Kenney pack page, finds the .zip link, and checks that it answers with a zip.
const pages = ['impact-sounds', 'rpg-audio', 'interface-sounds'];
let bad = 0;
for (const id of pages) {
  const page = `https://kenney.nl/assets/${id}`;
  try {
    const html = await (await fetch(page)).text();
    // The Download button asks kenney.nl/download-link/<id> for a fresh signed address.
    const id = /data-download-id=["']([0-9a-f]+)["']/i.exec(html)?.[1];
    if (!id) throw new Error('no data-download-id on the page');
    const data = await (await fetch(`https://kenney.nl/download-link/${id}`)).json();
    if (!data.url) throw new Error(`download-link answered ${JSON.stringify(data).slice(0, 200)}`);
    const link = new URL(data.url, page).href;
    const r = await fetch(link);
    const b = new Uint8Array(await r.arrayBuffer());
    const ok = r.ok && b[0] === 0x50 && b[1] === 0x4b && b.length > 100000;
    if (!ok) bad++;
    console.log(ok ? 'OK  ' : 'FAIL', id, `(${r.status}, ${(b.length / 1e6).toFixed(1)} MB)`, link);
  } catch (e) { bad++; console.log('FAIL', id, e.message); }
}
console.log(`\n${pages.length - bad}/${pages.length} OK`);
