// The server's own sound library in the Innkeeper: music, ambient loops and sound effects made with the owner's
// ElevenLabs key. The owner describes a sound, the server makes it in the background, and players hear it in its
// scene (or at its game moment) as soon as it is there. Each kind can be downloaded as one zip, as a copy to keep.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LENGTH_LIMITS, LIBRARY_ERRORS, LIBRARY_KINDS, searchLibrary, soundCost, type LibraryEntry, type LibraryKind, type LibraryView } from '../../../shared/library';
import { MUSIC_CONTEXTS, type MusicContext } from '../../../shared/music';
import { SFX_EVENTS, type SfxEvent } from '../../../shared/sfx';
import { useT } from '../i18n';
import { music } from '../music';
import { sfx as effects } from '../sfx';
import { INNKEEPER_HEADER, innkeeperSession } from './innkeeperApi';
import { LIBRARY_KIND_LABELS, SCENE_LABELS, SFX_EVENT_LABELS } from './labels';
import { sfx } from './sound';
import { ask } from './Confirm';
import { TabBar } from './Window';

class LibError extends Error { constructor(readonly code: string, readonly detail: string) { super(code); } }

async function api<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    headers: { [INNKEEPER_HEADER]: innkeeperSession(), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new LibError(String(out?.error ?? 'failed'), String(out?.detail ?? ''));
  return out as T;
}

const dollars = (usd: number) => `$${usd < 0.1 ? usd.toFixed(3) : usd.toFixed(2)}`;
const seconds = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} min` : `${s} s`);

const HINTS: Record<LibraryKind, string> = {
  music: 'Describe the mood and instruments, for example: misty harbour at night, slow fiddle and low strings, a little eerie.',
  ambient: 'Describe what is heard, for example: quiet tavern crowd, mugs clinking, a fire crackling.',
  sfx: 'Describe one short sound, for example: heavy sword hits a wooden shield.',
};

export function LibraryPane() {
  const t = useT();
  const [kind, setKind] = useState<LibraryKind>('music');
  const [lib, setLib] = useState<LibraryView | null>(null);
  const [error, setError] = useState<{ code: string; detail: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(() => api<LibraryView>('/api/library').then(setLib).catch((e) => setError({ code: e instanceof LibError ? e.code : 'failed', detail: '' })), []);
  useEffect(() => { void load(); }, [load]);
  // While something is being made, look again every few seconds.
  const making = lib?.entries.some((e) => e.status === 'making') ?? false;
  useEffect(() => {
    if (!making) return;
    const id = setInterval(() => { void load(); }, 3000);
    return () => clearInterval(id);
  }, [making, load]);
  useEffect(() => () => { audio.current?.pause(); }, []);

  const run = useCallback(async (key: string, path: string, body: Record<string, unknown>) => {
    setBusy(key); setError(null);
    try {
      setLib(await api<LibraryView>(path, body));
      sfx('equip');
      void music.refresh(); void effects.refresh();
      return true;
    } catch (e) {
      setError({ code: e instanceof LibError ? e.code : 'failed', detail: e instanceof LibError ? e.detail : '' });
      return false;
    } finally { setBusy(null); }
  }, []);

  const listen = (e: LibraryEntry) => {
    audio.current?.pause();
    if (playing === e.id) return setPlaying(null);
    const el = new Audio(e.src);
    el.volume = 0.7;
    el.loop = e.loop;
    el.onended = () => setPlaying(null);
    el.onerror = () => setPlaying(null);
    audio.current = el;
    setPlaying(e.id);
    void el.play().catch(() => setPlaying(null));
  };

  const download = async (k: LibraryKind | 'all') => {
    try {
      const { url } = await api<{ url: string }>('/api/library/download', { kind: k });
      const a = document.createElement('a');
      a.href = url; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { setError({ code: e instanceof LibError ? e.code : 'failed', detail: '' }); }
  };

  const mine = useMemo(() => (lib?.entries ?? []).filter((e) => e.kind === kind), [lib, kind]);
  const shown = useMemo(() => (filter.trim() ? searchLibrary(mine.map((e) => ({ ...e, status: 'ready' as const, disabled: false })), kind, filter, 200).map((x) => mine.find((e) => e.id === x.id)!) : mine), [mine, filter, kind]);
  const groups = kind === 'sfx'
    ? [...SFX_EVENTS.map((ev) => ({ key: ev as string, label: t(SFX_EVENT_LABELS[ev]), rows: shown.filter((e) => e.event === ev) })), { key: '', label: t('Found by words only'), rows: shown.filter((e) => !e.event) }]
    : [...MUSIC_CONTEXTS.map((c) => ({ key: c as string, label: t(SCENE_LABELS[c]), rows: shown.filter((e) => e.scene === c) })), { key: '', label: t('No scene: found by words only'), rows: shown.filter((e) => !e.scene) }];
  const total = mine.reduce((n, e) => n + e.usd, 0);
  const bytes = mine.reduce((n, e) => n + e.bytes, 0);

  if (!lib) return <div className="settings-body"><p className="muted">{error ? t(LIBRARY_ERRORS.failed) : t('Loading…')}</p></div>;
  return (
    <div className="settings-body lib-pane">
      <TabBar tabs={LIBRARY_KINDS.map((k) => ({ id: k, label: t(LIBRARY_KIND_LABELS[k]), count: lib.entries.filter((e) => e.kind === k && e.status === 'ready').length }))} value={kind} onChange={(k) => { setKind(k as LibraryKind); setFilter(''); }} />
      <p className="muted small">{t('Every sound here was made for this server with your ElevenLabs key. Players hear it in its scene, or at its moment in the game, as soon as it is ready. Scenes and moments without one keep the older sounds for now.')}</p>
      {!lib.canMake && <p className="art-note">{t(LIBRARY_ERRORS.no_key)}</p>}
      {error && <p className="art-error" role="alert">{t(LIBRARY_ERRORS[error.code as keyof typeof LIBRARY_ERRORS] ?? LIBRARY_ERRORS.failed, { detail: error.detail || '?' })}</p>}

      <StarterBar kind={kind} lib={lib} busy={busy === 'starter'} onMake={(kinds, usd) => {
        void ask(t('Make {n} starter sounds for about {usd}? They are made in the background, effects first; you can keep playing meanwhile.', { n: kinds.reduce((n, k) => n + lib.starter[k].missing, 0), usd: dollars(usd) })).then((yes) => { if (yes) void run('starter', '/api/library/starter', { kinds }); });
      }} />

      {lib.canMake && <MakeForm key={kind} kind={kind} usdPerMinute={lib.usdPerMinute[kind]} busy={busy === 'make'} onMake={(body) => run('make', '/api/library/make', { kind, ...body })} />}

      <div className="lib-tools">
        <input type="search" placeholder={t('Search by words')} aria-label={t('Search by words')} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="muted small">{t('{n} sounds · {mb} MB · made for {usd}', { n: mine.length, mb: (bytes / 1e6).toFixed(1), usd: dollars(total) })}</span>
        <span className="lib-download">
          <button type="button" disabled={!mine.some((e) => e.src)} onClick={() => void download(kind)}>{t('Download {kind}', { kind: t(LIBRARY_KIND_LABELS[kind]) })}</button>
          <button type="button" className="link" disabled={!lib.entries.some((e) => e.src)} onClick={() => void download('all')}>{t('Download everything')}</button>
        </span>
      </div>

      {groups.map((g) => g.rows.length > 0 && (
        <details key={g.key || 'none'} className="snd-scene" open={!!filter.trim() || g.rows.length <= 6}>
          <summary><b>{g.label}</b><span className="tabbar-count">{g.rows.length}</span></summary>
          <ul className="art-packs">
            {g.rows.map((e) => <Row key={e.id} e={e} busy={!!busy} playing={playing === e.id} canMake={lib.canMake} usdPerMinute={lib.usdPerMinute[e.kind]}
              onListen={() => listen(e)}
              onSet={(patch) => void run(e.id, '/api/library/action', { do: 'set', id: e.id, ...patch })}
              onRegenerate={() => { void ask(t('Make a new take of "{title}" for about {usd}? The old one plays until the new one is ready.', { title: e.title, usd: dollars(soundCost(e.kind, e.seconds)) })).then((yes) => { if (yes) void run(e.id, '/api/library/action', { do: 'regenerate', id: e.id }); }); }}
              onRemove={() => { void ask(t('Delete "{title}" from the library?', { title: e.title }), { danger: true }).then((yes) => { if (yes) void run(e.id, '/api/library/action', { do: 'remove', id: e.id }); }); }}
            />)}
          </ul>
        </details>
      ))}
      {!mine.length && <p className="muted">{t('Nothing here yet.')}</p>}
      {mine.length > 0 && !shown.length && <p className="muted">{t('No sound fits these words.')}</p>}
    </div>
  );
}

/** How much of the starter set is made, and a button for the rest: this kind, or every kind at once. */
function StarterBar({ kind, lib, busy, onMake }: { kind: LibraryKind; lib: LibraryView; busy: boolean; onMake: (kinds: LibraryKind[], usd: number) => void }) {
  const t = useT();
  const p = lib.starter[kind];
  const allMissing = LIBRARY_KINDS.reduce((n, k) => n + lib.starter[k].missing, 0);
  const allUsd = LIBRARY_KINDS.reduce((n, k) => n + lib.starter[k].missingUsd, 0);
  return (
    <div className="lib-starter">
      <span><b>{t('Starter set')}</b> <span className="muted small">{t('{made} of {total} made', { made: p.made, total: p.total })}</span></span>
      {p.missing > 0 && lib.canMake && <button type="button" className="primary" disabled={busy} onClick={() => onMake([kind], p.missingUsd)}>{t('Make the {n} missing for about {usd}', { n: p.missing, usd: dollars(p.missingUsd) })}</button>}
      {allMissing > p.missing && lib.canMake && <button type="button" disabled={busy} onClick={() => onMake([...LIBRARY_KINDS], allUsd)}>{t('Everything missing: {n} for about {usd}', { n: allMissing, usd: dollars(allUsd) })}</button>}
      {p.missing === 0 && <span className="muted small">{t('All made.')}</span>}
    </div>
  );
}

function MakeForm({ kind, usdPerMinute, busy, onMake }: { kind: LibraryKind; usdPerMinute: number; busy: boolean; onMake: (body: Record<string, unknown>) => Promise<boolean> }) {
  const t = useT();
  const lim = LENGTH_LIMITS[kind];
  const [d, setD] = useState({ description: '', title: '', where: kind === 'sfx' ? '' : 'tavern', seconds: lim.fallback });
  const cost = (Math.max(lim.min, Math.min(lim.max, d.seconds || lim.fallback)) / 60) * usdPerMinute;
  return (
    <details className="lib-make" open>
      <summary><b>{t('Make a new one')}</b></summary>
      <form onSubmit={(e) => { e.preventDefault(); void onMake({ description: d.description, title: d.title, seconds: d.seconds, ...(kind === 'sfx' ? { event: d.where } : { scene: d.where }) }).then((ok) => { if (ok) setD({ ...d, description: '', title: '' }); }); }}>
        <textarea required minLength={3} maxLength={400} rows={2} placeholder={t(HINTS[kind])} aria-label={t('What it should sound like')} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
        <div className="lib-make-row">
          <input type="text" maxLength={80} placeholder={t('Name (optional)')} aria-label={t('Name')} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
          {kind === 'sfx' ? (
            <select aria-label={t('Plays for')} value={d.where} onChange={(e) => setD({ ...d, where: e.target.value })}>
              <option value="">{t('No moment: found by words only')}</option>
              {SFX_EVENTS.map((ev) => <option key={ev} value={ev}>{t(SFX_EVENT_LABELS[ev])}</option>)}
            </select>
          ) : (
            <select aria-label={t('Scene')} value={d.where} onChange={(e) => setD({ ...d, where: e.target.value })}>
              {MUSIC_CONTEXTS.map((c) => <option key={c} value={c}>{t(SCENE_LABELS[c])}</option>)}
              <option value="">{t('No scene: found by words only')}</option>
            </select>
          )}
          <label className="lib-len">{t('Length (seconds)')}<input type="number" min={lim.min} max={lim.max} step={kind === 'sfx' ? 0.5 : 5} value={d.seconds} onChange={(e) => setD({ ...d, seconds: Number(e.target.value) })} /></label>
          <button type="submit" className="primary" disabled={busy}>{busy ? t('Asking…') : t('Make it for about {usd}', { usd: dollars(cost) })}</button>
        </div>
        <p className="muted small">{t(kind === 'music' ? 'Music takes up to a minute or two to compose. It is billed by ElevenLabs at {price} a minute.' : 'Sounds take a few seconds. They are billed by ElevenLabs at {price} a minute.', { price: dollars(usdPerMinute) })}</p>
      </form>
    </details>
  );
}

function Row({ e, busy, playing, canMake, onListen, onSet, onRegenerate, onRemove }: {
  e: LibraryEntry; busy: boolean; playing: boolean; canMake: boolean; usdPerMinute: number;
  onListen: () => void; onSet: (patch: Record<string, unknown>) => void; onRegenerate: () => void; onRemove: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(e.title);
  useEffect(() => setTitle(e.title), [e.title]);
  const status = e.status === 'making' ? t('Being made…') : e.status === 'failed' ? t('Failed') : '';
  return (
    <li className={e.status === 'ready' && !e.disabled ? 'art-pack lib-row' : 'art-pack lib-row snd-off'}>
      <div>
        <input className="lib-title" value={title} maxLength={80} aria-label={t('Name')} onChange={(x) => setTitle(x.target.value)} onBlur={() => { if (title.trim() && title !== e.title) onSet({ title }); }} onKeyDown={(x) => { if (x.key === 'Enter') (x.target as HTMLInputElement).blur(); }} />
        <small title={e.description}>{[status, seconds(e.seconds), e.loop && t('loop'), dollars(e.usd), e.by === 'dm' && t('asked for by the Dungeon Master'), e.description].filter(Boolean).join(' · ')}</small>
        {e.error && <small className="art-error">{e.error}</small>}
      </div>
      <span className="art-pack-actions">
        <button type="button" aria-label={t('Listen')} title={t('Listen')} disabled={!e.src} onClick={onListen}>{playing ? '■' : '▶'}</button>
        {e.kind === 'sfx' ? (
          <select aria-label={t('Plays for')} value={e.event ?? ''} disabled={busy} onChange={(x) => onSet({ event: x.target.value })}>
            <option value="">{t('Words only')}</option>
            {SFX_EVENTS.map((ev) => <option key={ev} value={ev}>{t(SFX_EVENT_LABELS[ev as SfxEvent])}</option>)}
          </select>
        ) : (
          <select aria-label={t('Scene')} value={e.scene ?? ''} disabled={busy} onChange={(x) => onSet({ scene: x.target.value })}>
            {MUSIC_CONTEXTS.map((c) => <option key={c} value={c}>{t(SCENE_LABELS[c as MusicContext])}</option>)}
            <option value="">{t('Words only')}</option>
          </select>
        )}
        <button type="button" role="switch" aria-checked={!e.disabled} className={e.disabled ? 'switch' : 'switch on'} disabled={busy || e.status !== 'ready'} onClick={() => onSet({ enabled: !!e.disabled })}>{e.disabled ? t('Off') : t('On')}</button>
        {canMake && <button type="button" disabled={busy || e.status === 'making'} onClick={onRegenerate}>{t('New take')}</button>}
        <button type="button" className="link danger" disabled={busy} onClick={onRemove}>{t('Remove')}</button>
      </span>
    </li>
  );
}
