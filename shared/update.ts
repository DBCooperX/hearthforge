// Spotting that the server was updated while a browser tab still runs the old client.
// The build is named by the client's entry script, whose file name carries a content hash,
// so it changes whenever the client changes and stays the same otherwise.

/** The entry script a built index.html loads, e.g. "/assets/index-3f9a1c.js". Empty for a dev page or no page. */
export function buildOf(html: string): string {
  const m = /<script[^>]*\ssrc="(\/assets\/[^"]+\.js)"/.exec(html);
  return m ? m[1] : '';
}

/** True when the server runs a different client build than this tab. Unknown builds never count as different. */
export function isStale(mine: string, theirs: string | undefined): boolean {
  return !!mine && !!theirs && mine !== theirs;
}

/**
 * Whether the tab may reload by itself: nobody sits at a table, nothing is typed into a box,
 * and it has not just reloaded for the same reason (so a broken deploy cannot cause a loop).
 */
export function mayAutoReload(opts: { seated: boolean; hasDraft: boolean; lastReload: number; now: number }): boolean {
  return !opts.seated && !opts.hasDraft && opts.now - opts.lastReload > 30_000;
}
