// Sound effects in the Innkeeper: which recording packs are on the server, and how to add them. Kenney does not allow
// automatic downloads, so the owner opens the pack's page, downloads the zip there and drops it here. Without a pack
// the browser makes every effect itself.
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { SFX_ERRORS, type SfxLibrary as Library } from '../../../shared/sfx';
import { useT } from '../i18n';
import { sfx as effects } from '../sfx';
import { INNKEEPER_HEADER, innkeeperSession } from './innkeeperApi';
import { sfx } from './sound';
import { ask } from './Confirm';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, cache: 'no-store', headers: { ...init?.headers, [INNKEEPER_HEADER]: innkeeperSession() } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(body?.error ?? 'failed'));
  return body as T;
}

export function SfxLibrary() {
  const t = useT();
  const [lib, setLib] = useState<Library | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { api<Library>('/api/sfx/library').then(setLib).catch(() => setError('failed')); }, []);

  const run = async (job: () => Promise<Library>) => {
    setBusy(true); setError(null);
    try { setLib(await job()); sfx('equip'); void effects.refresh(); } catch (err) { setError(err instanceof Error ? err.message : 'failed'); } finally { setBusy(false); }
  };
  const upload = (files: FileList | File[]) => {
    const list = [...files].filter((f) => /\.(zip|ogg)$/i.test(f.name));
    if (!list.length) return setError('not_audio');
    void run(async () => {
      let next: Library | null = null;
      for (const f of list) next = await api<Library>(`/api/sfx/upload?name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: f });
      return next!;
    });
  };
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); };

  if (!lib) return <div className="settings-body"><p className="muted">{error ? t(SFX_ERRORS.failed) : t('Loading…')}</p></div>;
  return (
    <div className="settings-body" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      {!lib.enabled && <p className="art-note">{t('Sound effects are switched off on this server (Sound and voice → Switches and keys).')}</p>}
      <p className="muted small">{t('Without recordings the game makes every effect itself. Kenney\'s free packs (CC0) sound more natural for hits, footsteps and coins. Kenney does not allow automatic downloads: open the pack\'s page, download the zip there and drop it here. Nothing has to be copied onto the server.')}</p>
      {error && <p className="art-error" role="alert">{t(SFX_ERRORS[error as keyof typeof SFX_ERRORS] ?? SFX_ERRORS.failed)}</p>}
      <div className={over ? 'art-drop over' : 'art-drop'}>
        <b>{busy ? t('Adding…') : t('Drop a Kenney zip here')}</b>
        <span className="muted small">{t('The zip of a pack, or single .ogg files.')}</span>
        <button type="button" disabled={busy} onClick={() => file.current?.click()}>{t('Choose files')}</button>
        <input ref={file} type="file" multiple accept=".zip,.ogg,application/zip,audio/ogg" hidden onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ''; }} />
      </div>
      <ul className="art-packs">
        {lib.packs.map((p) => (
          <li key={p.id} className="art-pack">
            <div>
              <b>{t(p.name)}</b>
              <small>{[p.author && `${p.author} · ${p.license}`, p.count ? t('{n} sounds on the server', { n: p.count }) : t('Not on the server')].filter(Boolean).join(' · ')}</small>
            </div>
            <span className="art-pack-actions">
              {p.page && <a href={p.page} target="_blank" rel="noreferrer noopener">{t('Download from Kenney')}</a>}
              {p.count > 0 && <button type="button" className="link danger" disabled={busy} onClick={() => { void ask(t('Delete "{title}" from the server?', { title: t(p.name) }), { danger: true }).then((yes) => { if (yes) void run(() => api<Library>('/api/sfx/remove', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: p.id }) })); }); }}>{t('Remove')}</button>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
