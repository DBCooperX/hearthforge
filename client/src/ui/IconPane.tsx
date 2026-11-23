// Innkeeper → Art → Icons: the server's own icons, painted four to a sheet with the picture service set up under
// Illustrations. Paint every icon that is missing, look through them, ask for four new takes of one and pick the best,
// or switch one off so the older icon or the emoji shows.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sheetsFor, slotWords, type IconLibraryView, type IconView } from '../../../shared/iconLibrary';
import { artUrl } from '../game/itemArt';
import { useT } from '../i18n';
import { INNKEEPER_HEADER, innkeeperSession } from './innkeeperApi';
import { setMoney, usd } from './money';
import { sfx } from './sound';
import { ask } from './Confirm';
import { ICON_ERRORS } from './labels';

type View = IconLibraryView & { money?: { currency: string; rate: number } };

async function api(path: string, body?: Record<string, unknown>): Promise<View> {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    headers: { [INNKEEPER_HEADER]: innkeeperSession(), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(out?.error ?? 'failed'));
  setMoney(out.money);
  return out as View;
}


/** One quarter of a sheet, with its magenta taken out, as the players see it. */
function Cut({ src, rect, size = 56 }: { src?: string; rect?: IconView['rect']; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (src) void artUrl({ src, rect, key: true }).then((u) => { if (live) setUrl(u); }).catch(() => {});
    return () => { live = false; };
  }, [src, rect?.x, rect?.y, rect?.w, rect?.h]);
  return <span className="icon-cut" style={{ width: size, height: size }}>{url ? <img src={url} alt="" draggable={false} /> : null}</span>;
}

export function IconPane() {
  const t = useT();
  const [lib, setLib] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [show, setShow] = useState<'all' | 'missing' | 'off'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [hint, setHint] = useState('');
  const detail = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (open) detail.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [open]);

  const load = useCallback(() => api('/api/icons').then(setLib).catch((e) => setError(e.message)), []);
  useEffect(() => { void load(); }, [load]);
  const busy = (lib?.queued ?? 0) > 0;
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => { void load(); }, 4000);
    return () => clearInterval(id);
  }, [busy, load]);

  const run = async (path: string, body: Record<string, unknown>) => {
    setError(null);
    try { setLib(await api(path, body)); sfx('equip'); } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  };

  const shown = useMemo(() => {
    const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (lib?.icons ?? []).filter((i) => (show === 'all' || (show === 'missing' ? !i.src : i.disabled))
      && words.every((w) => i.name.includes(w) || i.slots.some((s) => s.toLowerCase().includes(w))))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [lib, filter, show]);

  const download = async () => {
    try {
      const res = await fetch('/api/library/download', { method: 'POST', headers: { [INNKEEPER_HEADER]: innkeeperSession(), 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'icons' }) });
      const { url } = await res.json();
      const a = document.createElement('a');
      a.href = url; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    } catch { setError('failed'); }
  };

  if (!lib) return <div className="settings-body"><p className="muted">{error ? t(ICON_ERRORS.failed) : t('Loading…')}</p></div>;
  const have = lib.icons.length - lib.missing;
  const sel = open ? lib.icons.find((i) => i.id === open) ?? null : null;
  return (
    <div className="settings-body lib-pane icon-pane">
      <p className="muted small">{t('The server\'s own icons for items, spells, skills, feats and features, painted in one look four to a sheet with the picture service you set up under Illustrations. Players see each one as soon as its sheet is painted; icons without one keep the older icon or the emoji.')}</p>
      {!lib.canPaint && <p className="art-note">{t(ICON_ERRORS.no_key)}</p>}
      {error && <p className="art-error" role="alert">{t(ICON_ERRORS[error] ?? ICON_ERRORS.failed)}</p>}

      <div className="lib-starter">
        <div className="lib-starter-bar" aria-hidden><span style={{ width: `${Math.round((have / Math.max(1, lib.icons.length)) * 100)}%` }} /></div>
        <span>{t('{have} of {all} icons painted', { have, all: lib.icons.length })}{busy ? ` · ${t('{n} sheets being painted', { n: lib.queued })}` : ''}</span>
        {lib.canPaint && lib.missing > 0 && !busy && (
          <button type="button" className="primary" onClick={() => {
            const n = sheetsFor(lib.missing);
            void ask(t('Paint the {n} missing icons on {sheets} sheets for about {price}? It runs in the background; you can keep playing meanwhile.', { n: lib.missing, sheets: n, price: usd(n * lib.usdPerSheet) })).then((yes) => { if (yes) void run('/api/icons/make', {}); });
          }}>{t('Paint missing icons')}</button>
        )}
      </div>
      {lib.canPaint && <p className="muted small">{t('{painter} · {price} a sheet of four · spent so far {spent}', { painter: lib.painter, price: usd(lib.usdPerSheet, true), spent: usd(lib.usd, true) })}</p>}

      <div className="lib-tools">
        <input type="search" placeholder={t('Search by words')} aria-label={t('Search by words')} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <select value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label={t('Show')}>
          <option value="all">{t('All icons')}</option>
          <option value="missing">{t('Not painted yet')}</option>
          <option value="off">{t('Switched off')}</option>
        </select>
        <span className="lib-download"><button type="button" disabled={!have} onClick={() => void download()}>{t('Download icons')}</button></span>
      </div>

      {sel && (
        <div className="icon-detail" ref={detail}>
          <div className="icon-detail-head">
            <Cut src={sel.src} rect={sel.rect} size={96} />
            <div>
              <b>{sel.name}</b>
              <p className="muted small">{t('Shown for: {what}', { what: sel.slots.slice(0, 6).map(slotWords).join(', ') + (sel.slots.length > 6 ? ' …' : '') })}</p>
              {sel.error && <p className="art-error small">{sel.error}</p>}
              {sel.painting && <p className="muted small">{t('Being painted…')}</p>}
            </div>
            <button type="button" className="link" onClick={() => setOpen(null)}>{t('Close')}</button>
          </div>
          {sel.takes && sel.takes.length > 1 && (
            <div className="icon-takes" role="group" aria-label={t('Takes')}>
              {sel.takes.map((tk) => {
                const on = tk.src === sel.src && tk.rect.x === sel.rect?.x && tk.rect.y === sel.rect?.y;
                return <button key={`${tk.sheet}-${tk.cell}`} type="button" className={on ? 'on' : ''} aria-pressed={on} title={t('Use this one')} onClick={() => void run('/api/icons/action', { do: 'choose', id: sel.id, sheet: tk.sheet, cell: tk.cell })}><Cut src={tk.src} rect={tk.rect} size={64} /></button>;
              })}
            </div>
          )}
          <div className="icon-actions">
            {lib.canPaint && (
              <>
                <input type="text" value={hint} maxLength={200} placeholder={t('Optional: how it should look')} aria-label={t('Optional: how it should look')} onChange={(e) => setHint(e.target.value)} />
                <button type="button" disabled={sel.painting} onClick={() => { void ask(t('Paint four new takes of "{name}" for about {price}? The icon in use stays until you pick another.', { name: sel.name, price: usd(lib.usdPerSheet, true) })).then((yes) => { if (yes) { void run('/api/icons/action', { do: 'repaint', id: sel.id, hint }); setHint(''); } }); }}>{t('Four new takes')}</button>
              </>
            )}
            {sel.src && <button type="button" className="link" onClick={() => void run('/api/icons/action', { do: 'enable', id: sel.id, on: !!sel.disabled })}>{sel.disabled ? t('Switch on') : t('Switch off')}</button>}
          </div>
        </div>
      )}

      <ul className="icon-grid">
        {shown.map((i) => (
          <li key={i.id}>
            <button type="button" className={`${i.disabled ? 'off' : ''}${open === i.id ? ' sel' : ''}`} title={i.name} onClick={() => setOpen(i.id)}>
              {i.src ? <Cut src={i.src} rect={i.rect} /> : <span className="icon-cut empty" aria-hidden>{i.painting ? '…' : '?'}</span>}
              <span className="icon-name">{i.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {!shown.length && <p className="muted">{t('Nothing here yet.')}</p>}
    </div>
  );
}
