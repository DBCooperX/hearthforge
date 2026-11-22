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
