// Usage: node find-ambient-links.mjs   (Node 18+, any folder)
// Opens each OpenGameArt page and prints the real audio file links found on it.
const pages = ['wind-loop', 'fire-loop', 'cathedral-in-the-forest-ambient-loop'];
for (const p of pages) {
  const url = `https://opengameart.org/content/${p}`;
  try {
    const r = await fetch(url);
    const html = await r.text();
    const links = [...new Set([...html.matchAll(/href="([^"]*\/sites\/default\/files\/[^"]+\.(?:ogg|mp3|wav|flac))"/gi)].map((m) => new URL(m[1], url).href))];
    console.log(`${p} (${r.status})`);
    for (const l of links) console.log('  ', l);
    if (!links.length) console.log('   no file links found');
  } catch (e) { console.log(p, 'FAIL', e.message); }
}
