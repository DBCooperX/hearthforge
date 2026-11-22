// The narrator in the Innkeeper: which service speaks, in which voice, how fast. One choice for the whole server;
// players only mute it or turn it down. Piper voices are downloaded from Piper's own collection when picked.
import { useEffect, useRef, useState } from 'react';
import { PROVIDER_LABELS, VOICE_ERRORS, VOICE_PROVIDERS, VOICE_QUALITIES, type VoiceChoice, type VoiceLibrary as Library, type VoiceProvider } from '../../../shared/voice';
import type { Lang } from '../../../shared/i18n';
import { useT } from '../i18n';
import { narrator } from '../narrator';
import { INNKEEPER_HEADER, innkeeperSession } from './innkeeperApi';
import { sfx } from './sound';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, cache: 'no-store', headers: { ...init?.headers, [INNKEEPER_HEADER]: innkeeperSession() } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(body?.error ?? 'failed'));
  return body as T;
}


export function NarratorLibrary() {
  const t = useT();
  const [lib, setLib] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const load = () => api<Library>('/api/voice/library').then(setLib).catch(() => setError('failed'));
  useEffect(() => { void load(); }, []);
  // While a voice downloads, look again every few seconds.
  const downloading = !!lib?.piper.some((v) => v.downloading);
  useEffect(() => {
    if (!downloading) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [downloading]);
  useEffect(() => () => audio.current?.pause(), []);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try { setLib(await api<Library>('/api/voice/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })); sfx('equip'); void narrator.refresh(); } catch (err) { setError(err instanceof Error ? err.message : 'failed'); } finally { setBusy(false); }
  };
  const choose = (patch: Partial<VoiceChoice>) => void act({ do: 'choose', choice: patch });

  const preview = async (lang: Lang, over: Record<string, string>) => {
    const id = `${lang}:${JSON.stringify(over)}`;
    audio.current?.pause();
    if (previewing === id) { setPreviewing(null); return; }
    setPreviewing(id); setError(null);
    try {
      const q = new URLSearchParams({ lang, ...over });
      const res = await fetch(`/api/voice/preview?${q}`, { headers: { [INNKEEPER_HEADER]: innkeeperSession() } });
      if (!res.ok) throw new Error(String((await res.json().catch(() => ({})))?.error ?? 'failed'));
      const url = URL.createObjectURL(await res.blob());
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => { URL.revokeObjectURL(url); setPreviewing(null); };
      await a.play();
    } catch (err) {
      setPreviewing(null);
      setError(err instanceof Error ? err.message : 'failed');
    }
  };

  if (!lib) return <div className="settings-body"><p className="muted">{error ? t(VOICE_ERRORS.failed) : t('Loading…')}</p></div>;
  const c = lib.choice;
  const usable = (p: VoiceProvider) => p === 'off' || (p === 'piper' ? lib.piperReady : lib.keys[p]);
  const listen = (lang: Lang, over: Record<string, string>) => {
    const id = `${lang}:${JSON.stringify(over)}`;
    return <button type="button" className="link" onClick={() => void preview(lang, over)}>{previewing === id ? t('Stop') : t('Listen')}</button>;
  };

  return (
    <div className="settings-body narrator-lib">
      <p className="muted small">{t('The narrator reads the Dungeon Master\'s story aloud, in the voice you choose here, for every table. Players can mute it or turn it down for themselves. Speech is kept on the server, so nothing is made twice.')}</p>
      {error && <p className="art-error" role="alert">{t(VOICE_ERRORS[error as keyof typeof VOICE_ERRORS] ?? VOICE_ERRORS.failed)}</p>}
      {lib.error && !error && <p className="muted small">{t('Last problem: {text}', { text: lib.error })}</p>}

      <div className="setting">
        <span>{t('Who speaks')}</span>
        <select value={c.provider} disabled={busy} onChange={(e) => choose({ provider: e.target.value as VoiceProvider })}>
          {VOICE_PROVIDERS.map((p) => <option key={p} value={p} disabled={!usable(p) && p !== c.provider}>{t(PROVIDER_LABELS[p])}{!usable(p) ? ` (${p === 'piper' ? t('not in this image') : t('needs a key')})` : ''}</option>)}
        </select>
      </div>
      {!lib.keys.elevenlabs && <p className="muted small">{t('For ElevenLabs, add the API key under Sound and voice → Switches and keys and restart the server.')}</p>}

      {c.provider === 'piper' && (
        <>
          {!lib.piperReady && <p className="art-note">{t(VOICE_ERRORS.no_piper)}</p>}
          {(['en', 'de'] as Lang[]).map((lang) => (
            <fieldset key={lang} className="narrator-voices">
              <legend>{lang === 'de' ? t('German story') : t('English story')}</legend>
              <ul className="art-packs">
                {lib.piper.filter((v) => v.lang === lang).map((v) => (
                  <li key={v.id} className={c.piper[lang] === v.id ? 'art-pack on' : 'art-pack'}>
                    <label>
                      <input type="radio" name={`piper-${lang}`} checked={c.piper[lang] === v.id} disabled={busy || !lib.piperReady} onChange={() => choose({ piper: { ...c.piper, [lang]: v.id } })} />
                      <span>
                        <b>{t(v.label)}</b>
                        <small>{[v.id, v.installed ? t('On the server') : v.downloading ? t('Downloading…') : t('About {n} MB to download', { n: v.mb })].join(' · ')}</small>
                      </span>
                    </label>
                    <span className="art-pack-actions">
                      {v.installed && listen(lang, { provider: 'piper', piper: v.id })}
                      {!v.installed && !v.downloading && lib.piperReady && <button type="button" className="link" disabled={busy} onClick={() => void act({ do: 'download', voice: v.id })}>{t('Download')}</button>}
                      <a href={v.card} target="_blank" rel="noreferrer noopener">{t('Licence')}</a>
                      {v.installed && c.piper[lang] !== v.id && <button type="button" className="link danger" disabled={busy} onClick={() => void act({ do: 'remove', voice: v.id })}>{t('Remove')}</button>}
                    </span>
                  </li>
                ))}
              </ul>
            </fieldset>
          ))}
        </>
      )}

      {c.provider === 'elevenlabs' && (
        <div className="setting">
          <span>{t('Voice')}</span>
          <span className="setting-controls">
            <select value={c.elevenlabs} disabled={busy} onChange={(e) => choose({ elevenlabs: e.target.value })}>
              {!lib.elevenlabsVoices.some((v) => v.id === c.elevenlabs) && <option value={c.elevenlabs}>{c.elevenlabs === 'JBFqnCBsd6RMkjVDRZzb' ? 'George' : c.elevenlabs}</option>}
              {lib.elevenlabsVoices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <button type="button" className="link" disabled={busy} onClick={() => void act({ do: 'refresh' })}>{t('Reload the list')}</button>
            {listen('en', { provider: 'elevenlabs', elevenlabs: c.elevenlabs, quality: c.quality })}
            {listen('de', { provider: 'elevenlabs', elevenlabs: c.elevenlabs, quality: c.quality })}
          </span>
        </div>
      )}

      {c.provider === 'elevenlabs' && (
        <div className="setting">
          <span>{t('Quality')}<br /><span className="muted small">{t('Cheaper uses half the credits per character, with a slightly less natural voice.')}</span></span>
          <select value={c.quality} disabled={busy} onChange={(e) => choose({ quality: e.target.value as VoiceChoice['quality'] })}>
            {VOICE_QUALITIES.map((q) => <option key={q} value={q}>{q === 'quality' ? t('Best quality') : t('Cheaper')}</option>)}
          </select>
        </div>
      )}

      {c.provider !== 'off' && (
        <div className="setting">
          <span>{t('Reading speed')}</span>
          <span className="setting-controls">
            <input type="range" min={0.8} max={1.2} step={0.05} defaultValue={c.speed} key={c.speed} disabled={busy} aria-label={t('Reading speed')} onPointerUp={(e) => choose({ speed: Number((e.target as HTMLInputElement).value) })} onKeyUp={(e) => choose({ speed: Number((e.target as HTMLInputElement).value) })} />
            <span className="muted small">{Math.round(c.speed * 100)}%</span>
          </span>
        </div>
      )}

      <div className="setting">
        <span>{t('Stored speech')}</span>
        <span className="setting-controls">
          <span className="muted small">{t('{n} MB', { n: lib.cacheMb })}</span>
          <button type="button" className="link" disabled={busy || !lib.cacheMb} onClick={() => void act({ do: 'clear' })}>{t('Clear')}</button>
        </span>
      </div>
    </div>
  );
}
