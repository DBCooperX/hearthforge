// What earlier tables used up: the names and quests that new stories are nudged away from. It lives on
// the server, not in the tables, so deleting a table does not clear it. The Innkeeper can look and clear it.
import { useEffect, useState } from 'react';
import type { AdminVariety } from '../../../shared/admin';
import { useT } from '../i18n';
import { ask } from './Confirm';
import { inn } from './innkeeperApi';

export function Variety({ onError }: { onError: (err: unknown) => void }) {
  const t = useT();
  const [v, setV] = useState<AdminVariety | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { inn<AdminVariety>('/variety').then(setV).catch(onError); }, [onError]);
  if (!v) return null;
  const clear = async () => {
    if (!(await ask(t('Forget the names and quests of earlier stories? New tables will then not be nudged away from them.'), { danger: true }))) return;
    try { setV(await inn<AdminVariety>('/variety', { body: { do: 'clear' } })); } catch (err) { onError(err); }
  };
  const empty = !v.npcs.length && !v.places.length && !v.quests.length;
  const row = (label: string, xs: string[]) => xs.length > 0 && <p className="small"><b>{label}:</b> {xs.join(', ')}</p>;
  return (
    <section className="bin">
      <button type="button" className="link bin-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} {t('Fresh stories')} ({v.tables})
      </button>
      {open && (
        <>
          <p className="muted small">{t('The server remembers the people, places and quests that earlier tables made up, even after you delete them. A new table\'s Dungeon Master is nudged to pick different ones. It is only a hint, so the story always comes first.')}</p>
          {empty && <p className="muted small">{t('Nothing is remembered yet.')}</p>}
          {row(t('People'), v.npcs)}
          {row(t('Places'), v.places)}
          {row(t('Quests'), v.quests)}
          {!empty && <button type="button" className="link danger" onClick={() => void clear()}>{t('Forget all')}</button>}
        </>
      )}
    </section>
  );
}
