// "Where": a rolled region, the classic vale, or a campaign book. Books live on the server's
// shelf: a host drops a PDF or text file here, or fetches a free one from the list straight from
// its source. The server reads each book once; while it reads, the shelf shows how far it got.
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { CAMPAIGN_SOURCES, type CampaignInfo, type CampaignSource } from '../../../shared/campaign';
import { loc } from '../../../shared/rules';
import { useLang, useT } from '../i18n';
import { SESSION_HEADER, accountSession } from '../account';
import { Window } from '../ui/Window';
import { sfx } from '../ui/sound';

interface Shelf { books: CampaignInfo[]; ai: boolean }

const ERRORS: Record<string, string> = {
  too_big: 'The file is too large. Books of up to 64 MB fit.',
  not_a_book: 'That is not a PDF, text or Markdown file.',
  no_text: 'This PDF has no text in it, only pictures of pages (a scan). Try a version with selectable text.',
  download_failed: 'The source did not hand out the file. Open its page, download it there and drop it here.',
  not_found: 'That book is no longer on the shelf.',
  forbidden: 'Only the Innkeeper can do that.',
  no_dm: 'Campaign books need the AI Dungeon Master: the Innkeeper adds an Anthropic API key first.',
  signed_out: 'Sign in to bring a book.',
  failed: 'Reading the book did not work. Try again in a moment.',
};
const BOOK = /\.(pdf|txt|md|markdown)$/i;

async function call(path: string, init?: RequestInit): Promise<Shelf> {
  const res = await fetch(path, { cache: 'no-store', ...init, headers: { [SESSION_HEADER]: accountSession(), ...(init?.headers ?? {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(data?.error ?? 'failed'));
  return data as Shelf;
}

/** The shelf as this browser sees it, refreshed while a book is being read. */
export function useShelf(enabled: boolean) {
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => call('/api/campaigns').then((s) => { setShelf(s); return s; }).catch((e: Error) => { setError(e.message); return null; }), []);
  useEffect(() => { if (enabled) void load(); }, [enabled, load]);
  const reading = shelf?.books.some((b) => b.status === 'reading');
  useEffect(() => {
    if (!enabled || !reading) return;
    const id = setInterval(() => void load(), 2000);
    return () => clearInterval(id);
  }, [enabled, reading, load]);
  return { shelf, setShelf, error, setError, load };
}

interface Option { id: string; icon: string; label: string; blurb: string }

export function WherePicker({ options, region, campaign, host, onRegion, onCampaign, onClose }: {
  options: Option[]; region: string; campaign: string | null; host: boolean;
  onRegion: (id: string) => void; onCampaign: (book: CampaignInfo | null) => void; onClose: () => void;
}) {
  const t = useT();
  const { shelf, setShelf, error, setError } = useShelf(host);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const run = async (key: string, job: () => Promise<Shelf>) => {
    setBusy(key); setError(null);
    try { setShelf(await job()); sfx('equip'); } catch (e) { setError(e instanceof Error ? e.message : 'failed'); } finally { setBusy(null); }
  };
  const act = (body: Record<string, unknown>) => call('/api/campaigns/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const upload = (files: FileList | File[]) => {
    const f = [...files].find((x) => BOOK.test(x.name));
    if (!f) return setError('not_a_book');
    if (f.size > 64 * 1024 * 1024) return setError('too_big');
    void run('upload', () => call(`/api/campaigns/upload?name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: f }));
  };
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (host) upload(e.dataTransfer.files); };

  const books = shelf?.books ?? [];
  const fromList = new Set(books.map((b) => b.source).filter(Boolean));
  return (
    <Window title={t('Where')} size="medium" className="adv-picker where" onClose={onClose} subtitle={host ? undefined : t('Set by the host')}>
      <div className="where-body" onDragOver={(e) => { if (host) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)} onDrop={drop}>
        <div className="choice-grid wide" role="radiogroup" aria-label={t('Where')}>
          {options.map((o) => {
            const on = !campaign && o.id === region;
            return (
              <button key={o.id} type="button" role="radio" aria-checked={on} className={on ? 'choice on' : 'choice'} disabled={!host && !on}
                onClick={() => { if (!host) return; onRegion(o.id); sfx('tab'); onClose(); }}>
                <span className="choice-icon" aria-hidden>{o.icon}</span><b>{o.label}</b><span>{o.blurb}</span>
              </button>
            );
          })}
        </div>

        {host && (
          <section className="shelf">
            <h2>{t('A campaign book')}</h2>
            <p className="muted small">{t('Play a published adventure. The Dungeon Master reads the book once, then runs it scene by scene: its places, people, secrets and fights, while you stay free to go your own way.')}</p>
            {error && <p className="art-error" role="alert">{t(ERRORS[error] ?? ERRORS.failed)}</p>}
            {shelf && !shelf.ai && <p className="art-note">{t(ERRORS.no_dm)}</p>}
            {!!books.length && (
              <ul className="shelf-books">
                {books.map((b) => <BookRow key={b.id} book={b} on={campaign === b.id} busy={busy} onPick={() => { onCampaign(b); sfx('tab'); onClose(); }}
                  onRemove={() => void run(`rm-${b.id}`, () => act({ do: 'remove', id: b.id }))} onRetry={() => void run(`re-${b.id}`, () => act({ do: 'retry', id: b.id }))} />)}
              </ul>
            )}
            <div className={over ? 'art-drop over' : 'art-drop'}>
              <b className={busy === 'upload' ? 'busy' : undefined}>{busy === 'upload' ? t('Uploading…') : t('Drop a PDF or text file here')}</b>
              <span className="muted small">{t('An adventure you own, up to 64 MB. It stays on this server and only you and the Innkeeper see it.')}</span>
              <button type="button" disabled={!!busy || shelf?.ai === false} onClick={() => file.current?.click()}>{t('Choose a file')}</button>
              <input ref={file} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" hidden onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ''; }} />
            </div>
            <details className="shelf-free" open={!books.length}>
              <summary>{t('Free adventures')}</summary>
              <p className="muted small">{t('Hearthforge keeps no copies: a book comes straight from its source onto this server. Where the source needs a sign-in, open its page, download the file there and drop it above.')}</p>
              <ul className="shelf-sources">
                {CAMPAIGN_SOURCES.map((s) => <SourceRow key={s.id} src={s} have={fromList.has(s.id)} busy={busy === `get-${s.id}`} disabled={!!busy || shelf?.ai === false}
                  onGet={() => void run(`get-${s.id}`, () => act({ do: 'fetch', source: s.id }))} />)}
              </ul>
            </details>
          </section>
        )}
        {!host && campaign && <p className="muted where-note">{t('The host picked a campaign book for this table.')}</p>}
      </div>
    </Window>
  );
}

function BookRow({ book, on, busy, onPick, onRemove, onRetry }: { book: CampaignInfo; on: boolean; busy: string | null; onPick: () => void; onRemove: () => void; onRetry: () => void }) {
  const t = useT();
  const facts = [book.levels ? t('Levels {n}', { n: book.levels }) : '', book.pages ? t('{n} pages', { n: book.pages }) : '', book.owner ? '' : t('for everyone on this server')].filter(Boolean).join(' · ');
  return (
    <li className={on ? 'shelf-book on' : 'shelf-book'}>
      <span className="choice-icon" aria-hidden>📖</span>
      <span className="shelf-text">
        <b>{book.title}</b>
        {book.status === 'ready' && <span className="muted small">{[facts, book.blurb].filter(Boolean).join(' — ')}</span>}
        {book.status === 'reading' && (
          <span className="shelf-reading">
            <span className="muted small">{t('The Dungeon Master is reading the book…')}</span>
            <span className="bar" aria-hidden><span style={{ width: `${Math.round((book.progress ?? 0) * 100)}%` }} /></span>
          </span>
        )}
        {book.status === 'failed' && <span className="art-error small">{t(ERRORS[book.error ?? 'failed'] ?? ERRORS.failed)}</span>}
      </span>
      <span className="shelf-actions">
        {book.status === 'ready' && <button type="button" className={on ? 'primary' : ''} aria-pressed={on} onClick={onPick}>{on ? t('Playing this') : t('Play this')}</button>}
        {book.status === 'failed' && book.error === 'failed' && <button type="button" disabled={!!busy} onClick={onRetry}>{t('Try again')}</button>}
        <button type="button" className="link" disabled={!!busy || book.status === 'reading'} onClick={onRemove} title={t('Take it off the shelf')}>{t('Remove')}</button>
      </span>
    </li>
  );
}

function SourceRow({ src, have, busy, disabled, onGet }: { src: CampaignSource; have: boolean; busy: boolean; disabled: boolean; onGet: () => void }) {
  const t = useT();
  const { lang } = useLang();
  return (
    <li className="shelf-source">
      <span className="shelf-text">
        <b>{src.title}</b>
        <span className="muted small">{[src.by, t('Levels {n}', { n: src.levels }), loc(src.length, lang), src.system === 'osr' ? t('older rules') : src.system === 'any' ? t('any rules') : '5e'].join(' · ')}</span>
        <span className="small">{loc(src.blurb, lang)}</span>
        <span className="muted small">{loc(src.terms, lang)}</span>
      </span>
      <span className="shelf-actions">
        {src.access === 'click' && (have
          ? <span className="muted small">{t('On the shelf')}</span>
          : <button type="button" disabled={disabled} onClick={onGet}>{busy ? t('Downloading…') : t('Download')}</button>)}
        <a href={src.page} target="_blank" rel="noopener noreferrer">{t('Get it here')} ↗</a>
      </span>
    </li>
  );
}
