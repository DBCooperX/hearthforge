// Art & Assets: which art packs are on the server, which are in use, and a way to add more
// from the browser. Everyone can read it (it also carries the credits); the owner of the server
// uploads packs, switches between them and decides which icon stands for which item in the Innkeeper.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { CATALOG, ICON_SLOTS, type ArtLibrary, type ArtRef, type PackIcon, type PackInfo } from '../../../shared/art';
import { reloadItemIcons, useItemArt } from '../game/itemArt';
import { useT } from '../i18n';
import { innkeeperSession } from './innkeeperApi';
import { ART_ERRORS } from './labels';
import { sfx } from './sound';
import { Window } from './Window';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, cache: 'no-store', headers: { ...init?.headers, 'x-innkeeper-session': innkeeperSession() } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(body?.error ?? 'failed'));
  return body as T;
}
const act = (body: Record<string, unknown>) => api<{ library: ArtLibrary }>('/api/art/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** One picture of a pack at a fixed size, whether it is a file of its own or a cell of a sheet. */
function Thumb({ icon, size = 36 }: { icon: ArtRef; size?: number }) {
  if (!icon.rect) return <img className={icon.src.endsWith('.svg') ? 'art-thumb' : 'art-thumb pixel'} style={{ width: size, height: size }} src={icon.src} alt="" loading="lazy" draggable={false} />;
  const { x, y, w, h } = icon.rect;
  const cut: CSSProperties = { width: w, height: h, backgroundImage: `url("${icon.src}")`, backgroundPosition: `-${x}px -${y}px`, transform: `scale(${size / Math.max(w, h)})` };
  return <span className="art-thumb" style={{ width: size, height: size }}><span className="art-cut pixel" style={cut} /></span>;
}

function Credit({ p }: { p: Pick<PackInfo, 'author' | 'license' | 'url'> }) {
  const t = useT();
  return (
    <small>
      {[p.author && t('by {author}', { author: p.author }), p.license].filter(Boolean).join(' · ')}
      {p.url && <> · <a href={p.url} target="_blank" rel="noreferrer noopener">{t('Pack page')}</a></>}
    </small>
  );
}

const SHOWN = 400;

function Assign({ pack, onBack, onLibrary }: { pack: PackInfo; onBack: () => void; onLibrary: (l: ArtLibrary) => void }) {
  const t = useT();
  const art = useItemArt();
  const [icons, setIcons] = useState<PackIcon[] | null>(null);
  const [slot, setSlot] = useState(ICON_SLOTS[0].id);
  const [query, setQuery] = useState('');
  const [credit, setCredit] = useState({ author: pack.author, license: pack.license, url: pack.url });
  useEffect(() => { api<PackIcon[]>(`/api/art/icons?pack=${encodeURIComponent(pack.id)}`).then(setIcons).catch(() => setIcons([])); }, [pack.id, pack.cell]);
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (icons ?? []).filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [icons, query]);
  const send = async (body: Record<string, unknown>) => {
    try { onLibrary((await act({ pack: pack.id, ...body })).library); await reloadItemIcons(); } catch { /* the list shows what is true */ }
  };
  const pick = async (icon: string | null | undefined) => {
    sfx('equip');
    await send({ do: 'assign', slot, icon });
    if (icon) {
      const at = ICON_SLOTS.findIndex((s) => s.id === slot);
      setSlot(ICON_SLOTS[(at + 1) % ICON_SLOTS.length].id);
    }
  };
  const hasSheets = (icons ?? []).some((i) => i.rect);
  return (
    <div className="art-assign">
      <div className="art-assign-head">
        <button type="button" onClick={onBack}>{t('Back')}</button>
        <b>{pack.name}</b>
        <span className="muted small">{t('{n} of {m} items have a picture', { n: pack.matched ?? 0, m: ICON_SLOTS.length })}</span>
        {hasSheets && (
          <label className="art-cell">{t('Icon size on sheets')}
            <select value={pack.cell} onChange={(e) => void send({ do: 'describe', cell: Number(e.target.value) })}>
              {[8, 16, 24, 32, 48, 64].map((c) => <option key={c} value={c}>{c} px</option>)}
            </select>
          </label>
        )}
      </div>
      <p className="muted small">{t('Pick an item on the left, then the picture it should get on the right. Items without a picture keep their emoji.')}</p>
      <div className="art-cols">
        <ul className="art-slots">
          {ICON_SLOTS.map((s) => {
            const url = art({ id: s.id, icon: s.emoji });
            return (
              <li key={s.id}>
                <button type="button" className={slot === s.id ? 'on' : ''} aria-pressed={slot === s.id} title={s.name ? t(s.name) : s.id} onClick={() => setSlot(s.id)}>
                  <span className="art-slot-pic">{url ? <img className="pixel" src={url} alt="" /> : <span className="art-slot-none">{s.emoji}</span>}</span>
                  <span className="art-slot-name">{s.name ? t(s.name) : s.emoji}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="art-picker">
          <div className="art-picker-bar">
            <input type="search" value={query} placeholder={t('Search the pack')} aria-label={t('Search the pack')} onChange={(e) => setQuery(e.target.value)} />
            <button type="button" className="link" onClick={() => void pick(undefined)}>{t('Choose for me')}</button>
            <button type="button" className="link" onClick={() => void pick(null)}>{t('No picture')}</button>
          </div>
          {icons === null ? <p className="muted">{t('Loading…')}</p> : (
            <div className="art-grid">
              {found.slice(0, SHOWN).map((i) => <button key={i.name} type="button" title={i.name} onClick={() => void pick(i.name)}><Thumb icon={i} /></button>)}
            </div>
          )}
          {found.length > SHOWN && <p className="muted small">{t('Showing {n} of {m}. Search to narrow it down.', { n: SHOWN, m: found.length })}</p>}
          {icons?.length === 0 && <p className="muted">{t('This pack has no pictures.')}</p>}
        </div>
      </div>
      <div className="art-credit">
        <b>{t('Credit')}</b>
        <input value={credit.author} placeholder={t('Artist')} aria-label={t('Artist')} onChange={(e) => setCredit({ ...credit, author: e.target.value })} onBlur={() => void send({ do: 'describe', author: credit.author })} />
        <input value={credit.license} placeholder={t('License')} aria-label={t('License')} onChange={(e) => setCredit({ ...credit, license: e.target.value })} onBlur={() => void send({ do: 'describe', license: credit.license })} />
        <input value={credit.url} placeholder="https://…" aria-label={t('Pack page')} onChange={(e) => setCredit({ ...credit, url: e.target.value })} onBlur={() => void send({ do: 'describe', url: credit.url })} />
      </div>
    </div>
  );
}

/**
 * The art library. As a window of its own it shows everyone the packs and their credits;
 * inside the Innkeeper (`embedded`) it is where the owner manages them.
 */
export function ArtWindow({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const t = useT();
  const [lib, setLib] = useState<ArtLibrary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(false);
  const [over, setOver] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => { api<ArtLibrary>('/api/art/library').then(setLib).catch(() => setError('failed')); }, []);

  const run = useCallback(async (key: string, job: () => Promise<{ library: ArtLibrary; kind?: string }>, tiles = false) => {
    setBusy(key);
    setError(null);
    try {
      const done = await job();
      setLib(done.library);
      if (tiles || done.kind === 'tiles') setReload(true);
      await reloadItemIcons();
      sfx('equip');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(null);
    }
  }, []);

  const upload = (f: File | undefined) => {
    if (!f) return;
    if (!/\.zip$/i.test(f.name)) return setError('not_a_zip');
    void run('upload', () => api(`/api/art/upload?name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { 'content-type': 'application/zip' }, body: f }));
  };
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (lib?.canEdit) upload(e.dataTransfer.files[0]); };

  const edit = lib?.canEdit ?? false;
  const packEditing = lib?.packs.find((p) => p.id === editing);
  const row = (p: PackInfo) => {
    const key = `${p.kind}:${p.id}`;
    const name = p.source === 'builtin' ? t(p.id === 'emoji' ? 'Emoji (built in)' : 'Hearthforge pixel art (built in)') : p.name;
    return (
      <li key={key} className={p.active ? 'art-pack on' : 'art-pack'}>
        <div>
          <b>{name}</b>
          <Credit p={p} />
          {p.kind === 'icons' && p.installed && p.source !== 'builtin' && <small>{t('{n} of {m} items have a picture', { n: p.matched ?? 0, m: lib!.slots })}</small>}
          {!p.installed && p.source === 'upload' && <small>{t('Download the zip from the pack page, then drop it here.')}</small>}
        </div>
        <span className="art-pack-actions">
          {p.active && <span className="art-inuse">{t('In use')}</span>}
          {edit && !p.active && p.installed && <button type="button" disabled={!!busy} onClick={() => void run(key, () => act({ do: 'use', kind: p.kind, pack: p.id }), p.kind === 'tiles')}>{t('Use')}</button>}
          {edit && !p.installed && p.source === 'download' && <button type="button" disabled={!!busy} onClick={() => void run(key, () => act({ do: 'install', pack: p.id }), p.kind === 'tiles')}>{busy === key ? t('Downloading…') : t('Download and use')}</button>}
          {edit && p.source === 'upload' && p.kind === 'icons' && <button type="button" disabled={!!busy} onClick={() => setEditing(p.id)}>{t('Assign icons')}</button>}
          {edit && p.source === 'upload' && p.kind === 'icons' && <button type="button" className="link danger" disabled={!!busy} onClick={() => void run(key, () => act({ do: 'remove', pack: p.id }))}>{t('Remove')}</button>}
        </span>
      </li>
    );
  };
  const more = CATALOG.filter((c) => c.kind === 'icons' && !lib?.packs.some((p) => p.id === c.id));

  const body = (
    <>
      {!lib ? <div className="settings-body"><p className="muted">{error ? t(ART_ERRORS.failed) : t('Loading…')}</p></div>
        : packEditing ? <Assign key={packEditing.id} pack={packEditing} onBack={() => setEditing(null)} onLibrary={setLib} />
        : (
          <div className="settings-body" onDragOver={(e) => { if (edit) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)} onDrop={drop}>
            {!edit && <p className="art-note">{t(lib.uploads ? 'Art packs are changed in the Innkeeper, by the owner of this server.' : 'Changing art packs is switched off on this server.')}</p>}
            {edit && (
              <div className={over ? 'art-drop over' : 'art-drop'}>
                <b>{busy === 'upload' ? t('Unpacking…') : t('Drop the zip of an art pack here')}</b>
                <span className="muted small">{t('Download a pack from its page (itch.io, Kenney, OpenGameArt), then drop the zip here. Nothing has to be copied onto the server.')}</span>
                <button type="button" disabled={!!busy} onClick={() => file.current?.click()}>{t('Choose a file')}</button>
                <input ref={file} type="file" accept=".zip,application/zip" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
              </div>
            )}
            {error && <p className="art-error" role="alert">{t(ART_ERRORS[error as keyof typeof ART_ERRORS] ?? ART_ERRORS.failed)}</p>}
            {reload && <p className="art-note">{t('Map tiles change when the page is loaded again.')} <button type="button" onClick={() => location.reload()}>{t('Reload now')}</button></p>}
            <section>
              <h3>{t('Item icons')}</h3>
              <ul className="art-packs">{lib.packs.filter((p) => p.kind === 'icons').map(row)}</ul>
            </section>
            <section>
              <h3>{t('Map tiles')}</h3>
              <ul className="art-packs">{lib.packs.filter((p) => p.kind === 'tiles').map(row)}</ul>
            </section>
            {more.length > 0 && (
              <section>
                <h3>{t('More free packs')}</h3>
                <p className="muted small">{t('These are free to download from their pages. Mind the credit each artist asks for.')}</p>
                <ul className="art-packs">
                  {more.map((c) => <li key={c.id} className="art-pack"><div><b>{c.name}</b><Credit p={c} /></div></li>)}
                </ul>
              </section>
            )}
          </div>
        )}
    </>
  );
  if (embedded) return <div className={packEditing ? 'art-window art-embedded large' : 'art-window art-embedded'}>{body}</div>;
  return <Window title={t('Art & Assets')} icon="settings" size={packEditing ? 'large' : 'medium'} className="art-window" onClose={onClose ?? (() => {})}>{body}</Window>;
}
