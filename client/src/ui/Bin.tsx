// The bin for deleted tables: the list a host sees in the lobby, and the Innkeeper sees for everybody.
import { useCallback, useEffect, useState } from 'react';
import type { BinItem } from '../../../shared/accounts';
import { BIN_KEEP } from '../../../shared/accounts';
import { useLang, useT } from '../i18n';

interface Props {
  load: () => Promise<BinItem[]>;
  act: (what: 'restore' | 'purge', id: number) => Promise<BinItem[]>;
  onError: (err: unknown) => void;
  /** The Innkeeper sees whose tables they are. */
  everyone?: boolean;
  /** Reload when this changes (the list of tables changed). */
  watch?: unknown;
  /** Show the section even when it is empty. */
  always?: boolean;
}

export function DeletedTables({ load, act, onError, everyone, watch, always }: Props) {
  const t = useT();
  const { lang } = useLang();
  const [items, setItems] = useState<BinItem[] | null>(null);
  const [open, setOpen] = useState(!!everyone);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => { load().then(setItems).catch(() => setItems((cur) => cur ?? [])); }, [load]);
  useEffect(refresh, [refresh, watch]);
  if (!items || (!items.length && !always)) return null;
  const run = async (what: 'restore' | 'purge', id: number) => {
    setBusy(true);
    try { setItems(await act(what, id)); } catch (err) { onError(err); } finally { setBusy(false); }
  };
  return (
    <section className="bin">
      <button type="button" className="link bin-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} {t('Deleted tables')} ({items.length})
      </button>
      {open && (
        <>
          <p className="muted small">{t('A deleted table waits here, so it can come back with its story and heroes. Each host keeps their last {n}; an older one is gone for good when a new one arrives.', { n: BIN_KEEP })}</p>
          {!items.length && <p className="muted small">{t('Nothing has been deleted.')}</p>}
          <ul className="bin-list">
            {items.map((b) => (
              <li key={b.id} className="bin-item">
                <div>
                  <b>{b.title}</b>
                  <small className="muted"> · {t('deleted {when} by {name}', { when: new Date(b.deletedAt).toLocaleString(lang), name: b.deletedBy })}</small>
                  <small className="muted">
                    {everyone && b.ownerName ? ` · ${t('Host')}: ${b.ownerName}` : ''}
                    {b.players.length ? ` · ${b.players.join(', ')}` : ''}
                    {b.heroes.length ? ` · ${t('{n} heroes', { n: b.heroes.length })}` : ''}
                  </small>
                </div>
                <span className="bin-acts">
                  <button type="button" className="primary" disabled={busy} onClick={() => void run('restore', b.id)}>{t('Bring back')}</button>
                  <button type="button" className="link danger" disabled={busy} onClick={() => { if (window.confirm(t('Delete "{title}" for good? It cannot be brought back after that.', { title: b.title }))) void run('purge', b.id); }}>{t('Delete for good')}</button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
