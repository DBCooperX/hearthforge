// Music and ambient loops in the Innkeeper: what is on the server, which scene each file plays in,
// switching files off, and the ways to get more. Free-licensed tracks arrive by themselves; for
// the rest the owner either pastes a link (the server fetches the file from that site) or, where
// a site wants a login, opens its page and drops the file here. Nothing is hosted by Hearthforge.
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { MUSIC_CONTEXTS, SOUND_SOURCES, type MusicContext, type MusicItem, type MusicLayer, type MusicLibrary } from '../../../shared/music';
import { useT } from '../i18n';
import { music } from '../music';
import { INNKEEPER_HEADER, innkeeperSession } from './innkeeperApi';
import { ACCESS_LABELS as ACCESS, MUSIC_ERRORS, SCENE_LABELS as SCENES } from './labels';
import { sfx } from './sound';
import { ask } from './Confirm';


async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, cache: 'no-store', headers: { ...init?.headers, [INNKEEPER_HEADER]: innkeeperSession() } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(body?.error ?? 'failed'));
  return body as T;
}
const act = (body: Record<string, unknown>) =>
  api<MusicLibrary>('/api/music/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    // This browser may be playing the track that was just switched off or removed.
    .then((lib) => { void music.refresh(); return lib; });
const AUDIO = /\.(mp3|ogg|oga|opus|m4a|wav|flac|zip)$/i;

export function SoundLibrary({ layer }: { layer: MusicLayer }) {
  const t = useT();
  const [lib, setLib] = useState<MusicLibrary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [scene, setScene] = useState<MusicContext>('tavern');
  const [link, setLink] = useState({ url: '', title: '', artist: '', license: '' });
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = () => api<MusicLibrary>('/api/music/library').then(setLib).catch(() => setError('failed'));
    load();
    // The server may still be fetching its first tracks.
    const id = setInterval(() => { if (lib?.pending) load(); }, 4000);
    return () => clearInterval(id);
  }, [lib?.pending]);
  useEffect(() => () => { audio.current?.pause(); }, []);

  const run = useCallback(async (key: string, job: () => Promise<MusicLibrary>) => {
    setBusy(key); setError(null);
    try { setLib(await job()); sfx('equip'); } catch (err) { setError(err instanceof Error ? err.message : 'failed'); } finally { setBusy(null); }
  }, []);

  const upload = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => AUDIO.test(f.name));
    if (!list.length) return setError('not_audio');
    setBusy('upload'); setError(null);
    try {
      let next = lib;
      for (const f of list) {
        next = await api<MusicLibrary>(`/api/music/upload?name=${encodeURIComponent(f.name)}&layer=${layer}&context=${scene}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: f });
      }
      setLib(next); sfx('equip');
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); } finally { setBusy(null); }
  };
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); void upload(e.dataTransfer.files); };

  const preview = (item: MusicItem) => {
    audio.current?.pause();
    if (playing === item.id) return setPlaying(null);
    const el = new Audio(item.src);
    el.volume = 0.6;
    el.onended = () => setPlaying(null);
    el.onerror = () => setPlaying(null);
    audio.current = el;
    setPlaying(item.id);
    void el.play().catch(() => setPlaying(null));
  };

  const items = (lib?.items ?? []).filter((i) => i.layer === layer);
  const missing = items.filter((i) => !i.ready).length;
  const sources = SOUND_SOURCES.filter((s) => s.layer === layer || s.layer === 'both');
  const sceneSelect = (value: MusicContext, onChange: (c: MusicContext) => void, label: string) => (
    <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value as MusicContext)}>
      {MUSIC_CONTEXTS.map((c) => <option key={c} value={c}>{t(SCENES[c])}</option>)}
    </select>
  );

  if (!lib) return <div className="settings-body"><p className="muted">{error ? t(MUSIC_ERRORS.failed) : t('Loading…')}</p></div>;
  return (
    <div className="settings-body" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      {!lib.enabled && <p className="art-note">{t('Music is switched off on this server (Sound and voice → Switches and keys).')}</p>}
      <p className="muted small">{t(layer === 'music'
        ? 'Players hear one track at a time, picked at random from the files of the current scene.'
        : 'Ambient loops play quietly under the music: a crowd, a fire, wind. A file plays in the scene you assign it to.')}</p>
      {error && <p className="art-error" role="alert">{t(MUSIC_ERRORS[error as keyof typeof MUSIC_ERRORS] ?? MUSIC_ERRORS.failed)}</p>}

      <div className={over ? 'art-drop over' : 'art-drop'}>
        <b>{busy === 'upload' ? t('Adding…') : t('Drop audio files or a zip here')}</b>
        <span className="muted small">{t('mp3, ogg, m4a, wav or flac. The files play in this scene:')}</span>
        {sceneSelect(scene, setScene, t('Scene'))}
        <button type="button" disabled={!!busy} onClick={() => file.current?.click()}>{t('Choose files')}</button>
        <input ref={file} type="file" multiple accept="audio/*,.zip,application/zip" hidden onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = ''; }} />
      </div>

      <details>
        <summary>{t('Add from a link')}</summary>
        <form className="snd-link" onSubmit={(e) => { e.preventDefault(); void run('link', () => act({ do: 'add_link', layer, context: scene, ...link })).then(() => setLink({ url: '', title: '', artist: '', license: '' })); }}>
          <p className="muted small">{t('Paste the direct link to an audio file. The server downloads it from that site, so nothing passes through us. Mind the credit the artist asks for.')}</p>
          <input type="text" required placeholder="https://…" aria-label={t('Link')} value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} />
          <input type="text" placeholder={t('Title (optional)')} aria-label={t('Title')} value={link.title} onChange={(e) => setLink({ ...link, title: e.target.value })} />
          <input type="text" placeholder={t('Artist (optional)')} aria-label={t('Artist')} value={link.artist} onChange={(e) => setLink({ ...link, artist: e.target.value })} />
          <input type="text" placeholder={t('Licence, e.g. CC0 (optional)')} aria-label={t('Licence')} value={link.license} onChange={(e) => setLink({ ...link, license: e.target.value })} />
          <span className="snd-row-actions">{sceneSelect(scene, setScene, t('Scene'))}<button type="submit" className="primary" disabled={!!busy}>{busy === 'link' ? t('Downloading…') : t('Download')}</button></span>
        </form>
      </details>

      {layer === 'ambient' && (
        <p className="art-note">
          {t('With a free Freesound API key (Sound and voice → Switches and keys) the server can fetch CC0 loops for the tavern, town, overworld and dungeon.')}{' '}
          <button type="button" disabled={!!busy || lib.pending} onClick={() => void run('freesound', () => act({ do: 'freesound' }))}>{busy === 'freesound' ? t('Downloading…') : t('Get CC0 loops from Freesound')}</button>
        </p>
      )}

      {missing > 0 && (
        <p className="art-note">
          {t('{n} free tracks are not on the server yet.', { n: missing })}{' '}
          <button type="button" disabled={!!busy || lib.pending} onClick={() => void run('fetch', () => act({ do: 'fetch' }))}>{busy === 'fetch' || lib.pending ? t('Downloading…') : t('Download them now')}</button>
        </p>
      )}

      {MUSIC_CONTEXTS.map((c) => {
        const rows = items.filter((i) => i.context === c);
        if (!rows.length) return null;
        return (
          <details key={c} className="snd-scene" open={rows.length <= 4}>
            <summary><b>{t(SCENES[c])}</b><span className="tabbar-count">{rows.filter((i) => i.ready).length}/{rows.length}</span></summary>
            <ul className="art-packs">
              {rows.map((i) => (
                <li key={i.id} className={i.enabled && i.ready ? 'art-pack' : 'art-pack snd-off'}>
                  <div>
                    <b>{i.title}</b>
                    <small>{[i.artist && t('by {author}', { author: i.artist }), i.license, !i.ready && t('Not on the server')].filter(Boolean).join(' · ')}</small>
                  </div>
                  <span className="art-pack-actions">
                    {i.ready ? (
                      <>
                        <button type="button" aria-label={t('Listen')} title={t('Listen')} onClick={() => preview(i)}>{playing === i.id ? '■' : '▶'}</button>
                        {sceneSelect(i.context, (ctx) => void run(i.id, () => act({ do: 'set', id: i.id, context: ctx })), t('Scene'))}
                        <button type="button" role="switch" aria-checked={i.enabled} className={i.enabled ? 'switch on' : 'switch'} disabled={!!busy} onClick={() => void run(i.id, () => act({ do: 'set', id: i.id, enabled: !i.enabled }))}>{i.enabled ? t('On') : t('Off')}</button>
                        <button type="button" className="link danger" disabled={!!busy} onClick={() => { void ask(t('Delete "{title}" from the server?', { title: i.title }), { danger: true }).then((yes) => { if (yes) void run(i.id, () => act({ do: 'remove', id: i.id })); }); }}>{t('Remove')}</button>
                      </>
                    ) : (
                      <button type="button" disabled={!!busy || lib.pending} onClick={() => void run(i.id, () => act({ do: 'fetch', id: i.id }))}>{busy === i.id ? t('Downloading…') : t('Download')}</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
      {!items.length && <p className="muted">{t(layer === 'music' ? 'No music yet.' : 'No ambient loops yet. Add some below or drop files above.')}</p>}

      <details className="snd-scene">
        <summary><b>{t('Where to find more')}</b><span className="tabbar-count">{sources.length}</span></summary>
        <ul className="art-packs">
          {sources.map((s) => (
            <li key={s.id} className="art-pack">
              <div>
                <b>{s.name}</b>
                <small>{[s.author, s.license].join(' · ')} · {t(ACCESS[s.access])}</small>
              </div>
              <span className="art-pack-actions"><a href={s.url} target="_blank" rel="noreferrer noopener">{t('Get it here')}</a></span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
