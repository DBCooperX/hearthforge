// Your own picture of a hero, on the creator's identity step. It is a reference for the painter and nothing else:
// the game repaints it once in its own portrait style, and only that painted portrait is ever shown in play.
// The original is kept privately on the account, and only its owner can see it, here.
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { accountCall, accountSession, SESSION_HEADER, AccountFail } from '../account';
import { useT } from '../i18n';
import { accountErrorText } from './SignIn';

/** The longest side the browser keeps before uploading; a portrait is painted square at far less than this. */
const SIDE = 768;
const PICK_MAX = 15_000_000;

/** The picture, shrunk to at most SIDE pixels and saved as a JPEG: a few hundred kilobytes. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const g = canvas.getContext('2d');
  if (!g) throw new Error('no canvas');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new Error('no blob'))), 'image/jpeg', 0.85));
}

async function upload(blob: Blob): Promise<{ id: string; used: boolean }> {
  const res = await fetch('/api/account/hero-ref/upload', { method: 'POST', cache: 'no-store', headers: { [SESSION_HEADER]: accountSession(), 'content-type': 'application/octet-stream' }, body: blob }).catch(() => null);
  if (!res) throw new AccountFail('offline', 0);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AccountFail(String(data?.error ?? 'failed'), res.status);
  return data;
}

async function fetchOriginal(id: string): Promise<Blob | null> {
  const res = await fetch(`/api/account/hero-ref?id=${encodeURIComponent(id)}`, { cache: 'no-store', headers: { [SESSION_HEADER]: accountSession() } }).catch(() => null);
  return res?.ok ? res.blob() : null;
}

const forget = (id: string) => { void accountCall('/hero-ref/delete', { id }).catch(() => {}); };

interface Props {
  value: string | undefined;
  onChange: (refId: string | undefined) => void;
  /** Set by the creator once the hero is made or saved; until then a picture uploaded here is thrown away on leaving. */
  committed: MutableRefObject<boolean>;
}

export function HeroPicture({ value, onChange, committed }: Props) {
  const t = useT();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [used, setUsed] = useState<boolean | null>(null);
  const fresh = useRef(new Set<string>());
  const file = useRef<HTMLInputElement>(null);

  // Show the original to its owner: from this browser right after choosing it, else fetched with the session.
  const local = useRef<{ id: string; url: string } | null>(null);
  useEffect(() => {
    let dead = false;
    if (!value) { setUrl(''); return; }
    if (local.current?.id === value) { setUrl(local.current.url); return; }
    void fetchOriginal(value).then((b) => { if (!dead && b) { const u = URL.createObjectURL(b); local.current = { id: value, url: u }; setUrl(u); } });
    return () => { dead = true; };
  }, [value]);
  useEffect(() => () => { if (local.current) URL.revokeObjectURL(local.current.url); }, []);
  // A picture sent here but never kept by a hero is removed again when the creator closes.
  useEffect(() => () => { if (!committed.current) for (const id of fresh.current) forget(id); }, [committed]);

  if (!accountSession()) return null;

  const drop = (id: string | undefined) => { if (id && fresh.current.delete(id)) forget(id); };

  const choose = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    if (f.size > PICK_MAX || !/^image\//.test(f.type)) return setError(t('That picture did not work. Use a PNG, JPEG or WebP picture.'));
    setBusy(true);
    try {
      const small = await shrink(f).catch(() => null);
      if (!small) return setError(t('That picture did not work. Use a PNG, JPEG or WebP picture.'));
      const sent = await upload(small);
      drop(value);
      fresh.current.add(sent.id);
      if (local.current) URL.revokeObjectURL(local.current.url);
      local.current = { id: sent.id, url: URL.createObjectURL(small) };
      setUsed(sent.used);
      onChange(sent.id);
    } catch (err) {
      setError(accountErrorText(t, err));
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  return (
    <div className="hero-picture">
      <span className="label">{t('Your picture of the hero')} <small className="muted">({t('optional')})</small></span>
      <p className="ref-note" role="note">
        <b>{t('Your picture is only a reference.')}</b> {t('The game repaints it once in its own style, and only that painted version is ever shown in the game. Only you see the original, here. It is sent once to the AI painter to make the portrait, and you can remove it any time.')}
      </p>
      <div className="ref-row">
        {value && url && <img className="ref-thumb" src={url} alt="" />}
        <div className="ref-actions">
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void choose(e.target.files?.[0])} />
          <button type="button" disabled={busy} onClick={() => file.current?.click()}>{busy ? t('Sending…') : value ? t('Change picture') : t('Choose a picture')}</button>
          {value && <button type="button" disabled={busy} onClick={() => { drop(value); onChange(undefined); }}>{t('Remove picture')}</button>}
        </div>
      </div>
      <p className="muted small">{t('A PNG, JPEG or WebP picture. It is shrunk in your browser first. Its looks, clothes and gear can show in the painted portrait. A new portrait costs a few cents, like any portrait.')}</p>
      {used === false && <p className="muted small">{t('The painter this server uses cannot take pictures yet, so for now it paints from your description only.')}</p>}
      {error && <p className="error small" role="alert">{error}</p>}
    </div>
  );
}
