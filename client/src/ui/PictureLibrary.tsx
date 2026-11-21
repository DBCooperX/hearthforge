// Story illustrations in the Innkeeper: whether the big moments get a hand-drawn picture, which service paints it,
// in which style, and how many. One setup for the whole server; changes apply at once. Keys live under
// Art → Switches and keys, next to the other art settings, the way the narrator's keys live under Sound and voice.
import { useEffect, useState } from 'react';
import {
  PICTURE_ERRORS, PICTURE_MODELS, PICTURE_MOMENTS, PICTURE_MOMENT_LABELS, PICTURE_PROVIDERS, PICTURE_PROVIDER_LABELS, PICTURE_STYLES, PICTURE_STYLE_LABELS,
  pictureUsd, type PictureConfig, type PictureInfo, type PictureLibrary as Library,
} from '../../../shared/illustrations';
import { useLang, useT } from '../i18n';
import { INNKEEPER_HEADER, innkeeperSession } from './innkeeperApi';
import { ask } from './Confirm';
import { sfx } from './sound';
import { cutOut } from '../game/paintedFigures';

/** A battle figure as it stands on the map: its key-colour background taken out, on a dark ground. */
function FigureImg({ url, alt }: { url: string; alt: string }) {
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

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { [INNKEEPER_HEADER]: innkeeperSession(), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(out?.error ?? 'failed'));
  return out as T;
}

const usd = (n: number) => `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;

export function PictureLibrary({ onKeys }: { onKeys: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const [lib, setLib] = useState<Library | null>(null);
  const [draft, setDraft] = useState<PictureConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'sample' | null>(null);
  const [sample, setSample] = useState<(PictureInfo & { kind: 'scene' | 'portrait' | 'figure' }) | null>(null);
  const [open, setOpen] = useState<PictureInfo | null>(null);

  useEffect(() => { api<Library>('/api/pictures/library').then(setLib).catch(() => setError('failed')); }, []);

  const act = async (body: Record<string, unknown>, kind: 'save' | 'sample' | null = null) => {
    setBusy(kind); setError(null);
    try {
      const next = await api<Library & { sample?: PictureInfo }>('/api/pictures/action', body);
      setLib(next);
      if (next.sample) setSample({ ...next.sample, kind: body.do === 'sample_portrait' ? 'portrait' : body.do === 'sample_figure' ? 'figure' : 'scene' });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
      return false;
    } finally { setBusy(null); }
  };

  if (!lib) return <div className="settings-body"><p className="muted">{error ? t(PICTURE_ERRORS.failed) : t('Loading…')}</p></div>;
  const c = draft ?? lib.config;
  const edit = (patch: Partial<PictureConfig>) => setDraft({ ...c, ...patch });
  const model = c.models[c.provider];
  const known = PICTURE_MODELS[c.provider].find((m) => m.id === model);
  const priceKey = `${c.provider}:${model}`;
  const price = pictureUsd(c, c.provider, model);
  const hasKey = lib.keys[c.provider];
  const num = (label: string, value: number, step: string, onChange: (n: number) => void, hint?: string) => (
    <div className="setting">
      <span>{label}{hint && <small className="muted"> {hint}</small>}</span>
      <input type="number" min="0" step={step} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(e.target.valueAsNumber)} />
    </div>
  );

  return (
    <div className="settings-body picture-lib">
      <p className="muted small">{t('At the big moments of an adventure the Dungeon Master can have a hand-drawn picture painted, shown above the scene for everyone at the table, and every new hero can get a painted portrait. You choose the service, the style and how many. Each picture costs a few cents and goes on the credit of the players.')}</p>
      {error && <p className="art-error" role="alert">{t(PICTURE_ERRORS[error as keyof typeof PICTURE_ERRORS] ?? PICTURE_ERRORS.failed)}</p>}
      {lib.error && !error && <p className="muted small">{t('Last problem: {text}', { text: lib.error })}</p>}

      <label className="inn-switch">
        <input type="checkbox" checked={c.on} onChange={(e) => edit({ on: e.target.checked })} />
        <span><b>{t('Paint the big moments')}</b><br /><span className="muted small">{c.on ? t('On: the Dungeon Master may ask for a picture at the moments ticked below, within your limits.') : t('Off: no pictures are painted, and nothing is spent on them.')}</span></span>
      </label>

      <section>
        <h3>{t('Who paints')}</h3>
        <div className="setting">
          <span>{t('Service')}</span>
          <select value={c.provider} onChange={(e) => edit({ provider: e.target.value as PictureConfig['provider'] })}>
            {PICTURE_PROVIDERS.map((p) => <option key={p} value={p}>{t(PICTURE_PROVIDER_LABELS[p])}{!lib.keys[p] ? ` (${t('needs a key')})` : ''}</option>)}
          </select>
        </div>
        {!hasKey && (
          <p className="art-note picture-key">
            <span>{t('This service needs its API key first. It works at once, without a restart.')}</span>
            <button type="button" onClick={onKeys}>{t('Add the key')}</button>
          </p>
        )}
        <div className="setting">
          <span>{t('Model')}</span>
          <span className="setting-controls">
            <input type="text" list="picture-models" value={model} spellCheck={false} onChange={(e) => edit({ models: { ...c.models, [c.provider]: e.target.value.trim() } })} />
            <datalist id="picture-models">{PICTURE_MODELS[c.provider].map((m) => <option key={m.id} value={m.id}>{t(m.label)}</option>)}</datalist>
          </span>
        </div>
        <p className="muted small">{known ? `${t(known.label)} · ${known.refs ? t('takes earlier pictures along, so the heroes stay recognisable') : t('text only: the heroes are kept alike by description alone')}` : t('A model this list does not know: it gets no earlier pictures, and is billed at the price you set.')}</p>
        {num(t('Price per picture in dollars'), price, '0.001', (n) => edit({ usd: { ...c.usd, [priceKey]: (Number.isFinite(n) ? n : null) as number } }), known && c.usd[priceKey] === undefined ? t('(list price)') : undefined)}
      </section>

      <section>
        <h3>{t('Style of the scene pictures')}</h3>
        <div className="setting">
          <span>{t('How the pictures look')}</span>
          <select value={c.style} onChange={(e) => edit({ style: e.target.value as PictureConfig['style'] })}>
            {PICTURE_STYLES.map((s) => <option key={s} value={s}>{t(PICTURE_STYLE_LABELS[s])}</option>)}
          </select>
        </div>
        {c.style === 'custom' && (
          <textarea className="picture-style" rows={3} maxLength={600} value={c.customStyle} placeholder={t('For example: charcoal sketch with a single wash of indigo, like a war correspondent\'s notebook. Best in English.')} onChange={(e) => edit({ customStyle: e.target.value })} />
        )}
        <div className="picture-sample">
          <button type="button" disabled={!!busy || !hasKey || !!draft} onClick={() => void act({ do: 'sample' }, 'sample')}>{busy === 'sample' ? t('Painting…') : t('Paint a sample')}</button>
          <span className="muted small">{draft ? t('Save first, then paint a sample.') : t('A test picture in this style, about {price}. It goes on your own costs.', { price: usd(price) })}</span>
        </div>
        {sample?.kind === 'scene' && <figure className="picture-sample-img"><img src={sample.url} alt={sample.caption} /><figcaption className="muted small">{sample.model}</figcaption></figure>}
      </section>

      <section>
        <h3>{t('Hero portraits')}</h3>
        <label className="inn-switch">
          <input type="checkbox" checked={c.portraits} onChange={(e) => edit({ portraits: e.target.checked })} />
          <span><b>{t('Paint a portrait of every new hero')}</b><br /><span className="muted small">{t('From the choices in the character creator: species, class, skin, hair, beard and colours. Every hero gets the same painted look, in colour, made to sit in the round brass frame, whatever style the scenes use. A changed look gets a new portrait. Until it is ready, and without a key, the drawn portrait stays. Paid by the player whose hero it is.')}</span></span>
        </label>
        {num(t('Portraits per player and day'), c.portraitsPerDay, '1', (n) => edit({ portraitsPerDay: n }))}
        <div className="picture-sample">
          <button type="button" disabled={!!busy || !hasKey || !!draft} onClick={() => void act({ do: 'sample_portrait' }, 'sample')}>{busy === 'sample' ? t('Painting…') : t('Paint a sample portrait')}</button>
          <span className="muted small">{t('A dwarf fighter in the portrait style, about {price}. It goes on your own costs.', { price: usd(price) })}</span>
        </div>
        {sample?.kind === 'portrait' && <figure className="picture-sample-img portrait"><img src={sample.url} alt={sample.caption} /><figcaption className="muted small">{sample.model}</figcaption></figure>}
      </section>

      <section>
        <h3>{t('Battle figures')}</h3>
        <label className="inn-switch">
          <input type="checkbox" checked={c.figures} onChange={(e) => edit({ figures: e.target.checked })} />
          <span><b>{t('Paint the figures on the battle map')}</b><br /><span className="muted small">{t('Every hero with a painted portrait gets a matching painted figure, paid by the player whose hero it is. Every kind of monster is painted once, the first time it shows up, and then used at every table of this server: a goblin costs one picture, however many goblins come. Until a figure is ready, and when this is off, the drawn figures stay. Works in the 2.5D and the flat battle view.')}</span></span>
        </label>
        {num(t('New figures per day for the whole server'), c.figuresPerDay, '1', (n) => edit({ figuresPerDay: n }))}
        <div className="picture-sample">
          <button type="button" disabled={!!busy || !hasKey || !!draft} onClick={() => void act({ do: 'sample_figure' }, 'sample')}>{busy === 'sample' ? t('Painting…') : t('Paint a sample figure')}</button>
          <span className="muted small">{t('A goblin as it would stand on the battle map, about {price}. It goes on your own costs and is not used in play.', { price: usd(price) })}</span>
        </div>
        {sample?.kind === 'figure' && <figure className="picture-sample-img figure"><FigureImg url={sample.url} alt={sample.caption} /><figcaption className="muted small">{sample.model}</figcaption></figure>}
        <p className="muted small">{t('Not happy with a figure? Delete it below, and it is painted anew the next time it is needed.')}</p>
      </section>

      <section>
        <h3>{t('Which moments')}</h3>
        <div className="picture-moments">
          {PICTURE_MOMENTS.map((m) => (
            <label key={m}><input type="checkbox" checked={c.moments[m]} onChange={(e) => edit({ moments: { ...c.moments, [m]: e.target.checked } })} />{t(PICTURE_MOMENT_LABELS[m])}</label>
          ))}
        </div>
      </section>

      <section>
        <h3>{t('Limits')}</h3>
        {num(t('Pictures per table and day'), c.perTableDay, '1', (n) => edit({ perTableDay: n }))}
        {num(t('Minutes between two pictures at a table'), c.gapMinutes, '5', (n) => edit({ gapMinutes: n }))}
        {num(t('Monthly budget for the whole server, in dollars'), c.monthUsd, '1', (n) => edit({ monthUsd: n }), t('(0: no cap)'))}
        <p className="muted small">{t('This month: {n} pictures, {cost}. Today: {today}. On disk: {mb} MB.', { n: lib.month.count, cost: usd(lib.month.usd), today: lib.today.count, mb: lib.diskMb })}</p>
      </section>

      <div className="inn-savebar">
        <button type="button" className="primary" disabled={!draft || !!busy} onClick={() => void act({ do: 'config', config: c }, 'save').then((ok) => { if (ok) { setDraft(null); sfx('equip'); } })}>{t('Save')}</button>
        {draft && <button type="button" onClick={() => setDraft(null)}>{t('Discard')}</button>}
      </div>

      <section>
        <h3>{t('Latest pictures')}</h3>
        {lib.recent.length === 0 ? <p className="muted small">{t('No picture has been painted yet.')}</p> : (
          <ul className="picture-grid">
            {lib.recent.map((p) => (
              <li key={p.id}>
                <button type="button" className={`picture-thumb${p.moment === 'figure' ? ' figure' : ''}`} onClick={() => setOpen(p)} title={p.caption}>{p.moment === 'figure' ? <FigureImg url={p.url} alt={p.caption} /> : <img src={p.url} alt={p.caption} loading="lazy" />}</button>
                <span className="small"><b>{p.moment === 'sample' ? t('Sample') : p.moment === 'portrait' || p.moment === 'figure' ? p.caption : p.tableTitle}</b> · {p.moment === 'sample' ? p.model : p.moment === 'portrait' ? t('Hero portrait') : p.moment === 'figure' ? t('Battle figure') : (PICTURE_MOMENT_LABELS[p.moment] ? t(PICTURE_MOMENT_LABELS[p.moment]) : p.moment)}</span>
                <span className="muted small">{new Date(p.at).toLocaleDateString(lang)} · {usd(p.usd)}</span>
                <button type="button" className="link danger" onClick={() => { void ask(p.moment === 'figure' ? t('Delete this battle figure? The drawn one stands in until it is painted anew.') : t('Delete this picture? It disappears from the story of its table too.'), { danger: true }).then((yes) => { if (yes) void act({ do: 'delete', id: p.id }); }); }}>{t('Delete')}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {open && (
        <div className="picture-lightbox" role="dialog" aria-label={open.caption} onClick={() => setOpen(null)}>
          <figure>{open.moment === 'figure' ? <FigureImg url={open.url} alt={open.caption} /> : <img src={open.url} alt={open.caption} />}<figcaption>{open.caption}</figcaption></figure>
        </div>
      )}
    </div>
  );
}
