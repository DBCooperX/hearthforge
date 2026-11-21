import type { OnlineEntry } from '../../shared/types';

/** Who is here now: one entry per signed-in account, at a table rather than in the lobby when they are in both. */
export function onlineList(
  conns: Iterable<{ accountId?: string; account?: string; room?: { name: string; title: string; sits: (id: string) => boolean } }>,
  viewer: { id?: string; innkeeper: boolean },
): OnlineEntry[] {
  const byId = new Map<string, OnlineEntry>();
  for (const c of conns) {
    if (!c.accountId || !c.account) continue;
    const seated = !!c.room;
    const known = seated && (viewer.innkeeper || (!!viewer.id && c.room!.sits(viewer.id)));
    const entry: OnlineEntry = { id: c.accountId, name: c.account, seated, table: known ? c.room!.name : null, tableTitle: known ? c.room!.title : null };
    const old = byId.get(c.accountId);
    if (!old || (seated && !old.seated)) byId.set(c.accountId, entry);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
