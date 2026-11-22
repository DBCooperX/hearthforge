// My heroes: the heroes an account keeps as templates, kept on the server and listed here.
import { useCallback, useEffect, useState } from 'react';
import type { HeroTemplate } from '../../shared/accounts';
import type { CharacterSpec } from '../../shared/types';
import { accountCall } from './account';

const listeners = new Set<(list: HeroTemplate[]) => void>();
let latest: HeroTemplate[] | null = null;

function publish(list: HeroTemplate[]) {
  latest = list;
  for (const fn of listeners) fn(list);
}

async function call(body: Record<string, unknown>): Promise<HeroTemplate[]> {
  const { heroes } = await accountCall<{ heroes: HeroTemplate[] }>('/heroes', body);
  publish(heroes);
  return heroes;
}

/** Keep a hero (a new one, or the template `id` replaced). `table` lets the server check scores it rolled there. */
export const saveTemplate = (spec: CharacterSpec, table: string, id?: string) => call({ do: 'save', spec, table, id });
/** Keep a hero that is already in the party of `table`. */
export const keepHero = (table: string, characterId: string) => call({ do: 'from_hero', table, characterId });
export const deleteTemplate = (id: string) => call({ do: 'delete', id });
/** A second saved hero with the same choices, under a new name. */
export const copyTemplate = (id: string, name: string) => call({ do: 'copy', id, name });

/** Ability scores rolled by the server for a hero made away from any table. */
export async function rollForHero(): Promise<number[]> {
  const { heroes, rolled } = await accountCall<{ heroes: HeroTemplate[]; rolled: number[] }>('/heroes', { do: 'roll' });
  publish(heroes);
  return rolled;
}

/**
 * A saved hero on its way to a table: the Heroes tab sets it, then sits down at (or opens) the table, and
 * the table room adds the hero once it is there. Forgotten after a minute, so it never surprises later.
 */
const BRING_KEY = 'hf.bringHero';
export function bringHero(templateId: string) {
  try { sessionStorage.setItem(BRING_KEY, JSON.stringify({ id: templateId, at: Date.now() })); } catch { /* without storage the hero is added by hand */ }
}
export function takeBroughtHero(): string | null {
  try {
    const raw = sessionStorage.getItem(BRING_KEY);
    sessionStorage.removeItem(BRING_KEY);
    const v = raw ? JSON.parse(raw) as { id?: unknown; at?: unknown } : null;
    return v && typeof v.id === 'string' && typeof v.at === 'number' && Date.now() - v.at < 60_000 ? v.id : null;
  } catch { return null; }
}

export async function refreshTemplates() {
  try {
    const { heroes } = await accountCall<{ heroes: HeroTemplate[] }>('/heroes');
    publish(heroes);
  } catch { /* the list stays as it was */ }
}

export function useHeroTemplates() {
  const [list, setList] = useState<HeroTemplate[] | null>(latest);
  const refresh = useCallback(refreshTemplates, []);
  useEffect(() => {
    listeners.add(setList);
    void refresh();
    return () => { listeners.delete(setList); };
  }, [refresh]);
  return { heroes: list ?? [], loaded: list !== null, refresh };
}
