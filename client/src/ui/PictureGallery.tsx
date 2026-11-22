// The Innkeeper's picture library: one even grid per kind of picture, a table filter, and a large view
// with Repaint and Delete. Every tile has the same shape for its kind, so a big battle figure never spills over its neighbours.
import { useEffect, useMemo, useState } from 'react';
import { PICTURE_MOMENT_LABELS, type PictureInfo } from '../../../shared/illustrations';
import { useLang, useT } from '../i18n';
import { ask } from './Confirm';
import { cutOut } from '../game/paintedFigures';
import { usd } from './money';

/** A battle figure as it stands on the map: its key-colour background taken out, on a dark ground. */
export function FigureImg({ url, alt }: { url: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.onload = () => { if (!live) return; try { setSrc(cutOut(img)?.toDataURL() ?? url); } catch { setSrc(url); } };
    img.onerror = () => { if (live) setSrc(url); };
    img.src = url;
    return () => { live = false; };
  }, [url]);
  return src ? <img className="picture-figure" src={src} alt={alt} loading="lazy" /> : <span className="picture-figure" aria-label={alt} />;
}

type Tab = 'scenes' | 'heroes' | 'people' | 'figures';
const TABS: { id: Tab; label: string }[] = [
  { id: 'scenes', label: 'Scenes' },
  { id: 'heroes', label: 'Hero portraits' },
  { id: 'people', label: 'Portraits of people' },
  { id: 'figures', label: 'Battle figures' },
];
const tabOf = (p: PictureInfo): Tab => p.moment === 'portrait' ? 'heroes' : p.moment === 'npc' ? 'people' : p.moment === 'figure' ? 'figures' : 'scenes';
const PAGE = 24;

export function PictureGallery({ pictures, canRepaint, busy, act }: {
  pictures: PictureInfo[]; canRepaint: boolean; busy: boolean; act: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const t = useT();
  const { lang } = useLang();
  const [tab, setTab] = useState<Tab>('scenes');
  const [table, setTable] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { scenes: 0, heroes: 0, people: 0, figures: 0 };
    for (const p of pictures) c[tabOf(p)]++;
    return c;
  }, [pictures]);
  const ofTab = useMemo(() => pictures.filter((p) => tabOf(p) === tab), [pictures, tab]);
  const tables = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of ofTab) if (p.table && !seen.has(p.table)) seen.set(p.table, p.tableTitle || p.table);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1], lang));
  }, [ofTab, lang]);
  const filter = tables.some(([id]) => id === table) ? table : '';
  const list = useMemo(() => (filter ? ofTab.filter((p) => p.table === filter) : ofTab), [ofTab, filter]);
  const visible = list.slice(0, shown);
  const index = openId ? list.findIndex((p) => p.id === openId) : -1;
  const open = index >= 0 ? list[index] : null;

  const pick = (next: Tab) => { setTab(next); setShown(PAGE); setOpenId(null); };
  const step = (by: number) => { if (list.length) setOpenId(list[(index + by + list.length) % list.length].id); };

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpenId(null); }
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });

  const title = (p: PictureInfo) => p.moment === 'sample' ? t('Sample') : tabOf(p) === 'scenes' ? p.tableTitle : p.caption;
  const kind = (p: PictureInfo) => p.moment === 'sample' ? p.model : p.moment === 'portrait' ? t('Hero portrait') : p.moment === 'npc' ? t('Portrait of a person')
    : p.moment === 'figure' ? t('Battle figure') : (PICTURE_MOMENT_LABELS[p.moment] ? t(PICTURE_MOMENT_LABELS[p.moment]) : p.moment);
  const day = (p: PictureInfo) => new Date(p.at).toLocaleDateString(lang);
  const image = (p: PictureInfo) => p.moment === 'figure' ? <FigureImg url={p.url} alt={p.caption} /> : <img src={p.url} alt={p.caption} loading="lazy" />;

  const repaint = (p: PictureInfo) => ask(t('Repaint this battle figure? It is painted anew now, and the picture is billed like any other.')).then((yes) => { if (yes) { setOpenId(null); void act({ do: 'repaint', id: p.id }); } });
  const remove = (p: PictureInfo) => ask(p.moment === 'figure' ? t('Delete this battle figure? The drawn one stands in until it is painted anew.') : t('Delete this picture? It disappears from the story of its table too.'), { danger: true })
    .then((yes) => { if (yes) { setOpenId(null); void act({ do: 'delete', id: p.id }); } });

  if (pictures.length === 0) return <p className="muted small">{t('No picture has been painted yet.')}</p>;
  return (
    <div className="gallery">
      <div className="gallery-bar">
        <div className="gallery-tabs" role="tablist" aria-label={t('Latest pictures')}>
          {TABS.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'on' : ''} onClick={() => pick(x.id)}>
              {t(x.label)} <span className="count">{counts[x.id]}</span>
            </button>
          ))}
        </div>
        {tables.length > 1 && (
          <label className="gallery-filter">
            <span className="muted small">{t('Table')}</span>
            <select value={filter} onChange={(e) => { setTable(e.target.value); setShown(PAGE); }}>
              <option value="">{t('All tables')}</option>
              {tables.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        )}
      </div>
      {list.length === 0 ? <p className="muted small">{t('No pictures of this kind yet.')}</p> : (
        <ul className={`gallery-grid ${tab}`}>
          {visible.map((p) => (
            <li key={p.id}>
              <button type="button" className={`gallery-tile${p.moment === 'figure' ? ' figure' : ''}`} onClick={() => setOpenId(p.id)} title={p.caption}>{image(p)}</button>
              <b className="gallery-name" title={title(p)}>{title(p)}</b>
              <span className="muted small gallery-sub">{kind(p)} · {day(p)}</span>
            </li>
          ))}
        </ul>
      )}
      {list.length > shown && <button type="button" className="gallery-more" onClick={() => setShown(shown + PAGE)}>{t('Show more ({n})', { n: list.length - shown })}</button>}

      {open && (
        <div className="picture-lightbox gallery-box" role="dialog" aria-modal="true" aria-label={open.caption} onClick={() => setOpenId(null)}>
          <figure onClick={(e) => e.stopPropagation()}>
            <div className="gallery-box-img">{image({ ...open })}</div>
            <figcaption>
              <b>{title(open)}</b>
              <span className="muted small">{kind(open)} · {day(open)} · {usd(open.usd, true)}{open.caption && open.caption !== title(open) ? ` · ${open.caption}` : ''}</span>
              <span className="gallery-actions">
                {list.length > 1 && <button type="button" onClick={() => step(-1)} aria-label={t('Previous picture')}>‹</button>}
                {open.moment === 'figure' && <button type="button" disabled={busy || !canRepaint} onClick={() => void repaint(open)}>{t('Repaint')}</button>}
                <button type="button" className="danger" disabled={busy} onClick={() => void remove(open)}>{t('Delete')}</button>
                <button type="button" onClick={() => setOpenId(null)}>{t('Close')}</button>
                {list.length > 1 && <button type="button" onClick={() => step(1)} aria-label={t('Next picture')}>›</button>}
              </span>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
