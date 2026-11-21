// The image services a story illustration can be painted by. Each takes the same request (a prompt, and earlier
// pictures of this table to keep the heroes looking the same) and returns the image bytes. Nothing here keeps state.
// The request shapes follow each service's documentation as of November 2026; none was tried against the live API
// while this was written, so a refusal is logged with the service's own words.
import type { PictureProvider } from '../../shared/illustrations';

export interface PaintRequest {
  prompt: string;
  /** Earlier pictures, newest first, already cut to what the model takes. */
  refs: { mime: string; data: Buffer }[];
  /** A square picture (a portrait) instead of the wide 3:2 scene. */
  square?: boolean;
  /** A tall 2:3 picture (a standing battle figure). Wins over `square`. */
  tall?: boolean;
}

/** The shape asked for, as an aspect ratio. */
const ratio = (req: PaintRequest) => (req.tall ? '2:3' : req.square ? '1:1' : '3:2');

export interface Painted { data: Buffer; mime: string }

export class PictureFailure extends Error {
  constructor(readonly code: 'refused' | 'failed' | 'no_key', detail: string) { super(detail); }
}

type Fetch = typeof fetch;
const TIMEOUT_MS = 120_000;

const dataUri = (r: { mime: string; data: Buffer }) => `data:${r.mime};base64,${r.data.toString('base64')}`;

async function call(fetchFn: Fetch, url: string, init: RequestInit, who: string): Promise<Response> {
  const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.ok) return res;
  const text = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
  // 400 and 422 are what services answer when the content or the request is refused; the rest is trouble.
  if (res.status === 401 || res.status === 403) throw new PictureFailure('no_key', `${who} refused the key (${res.status}): ${text}`);
  throw new PictureFailure(res.status === 400 || res.status === 422 ? 'refused' : 'failed', `${who} answered ${res.status}: ${text}`);
}

async function download(fetchFn: Fetch, url: string, who: string): Promise<Painted> {
  const res = await call(fetchFn, url, {}, who);
  const mime = (res.headers.get('content-type') ?? 'image/png').split(';')[0].trim();
  return { data: Buffer.from(await res.arrayBuffer()), mime: mime.startsWith('image/') ? mime : 'image/png' };
}

/** Google Gemini: one generateContent call, earlier pictures as inline images next to the prompt. */
async function gemini(fetchFn: Fetch, model: string, key: string, req: PaintRequest): Promise<Painted> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const parts = [{ text: req.prompt }, ...req.refs.map((r) => ({ inline_data: { mime_type: r.mime, data: r.data.toString('base64') } }))];
  const send = (imageConfig: boolean) => call(fetchFn, url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], ...(imageConfig ? { imageConfig: { aspectRatio: ratio(req) } } : {}) } }),
  }, 'Gemini');
  let res: Response;
  try {
    res = await send(true);
  } catch (err) {
    // Older models do not know the aspect ratio; they paint a square instead.
    if (!(err instanceof PictureFailure) || err.code !== 'refused' || !/imageConfig|aspect/i.test(err.message)) throw err;
    res = await send(false);
  }
  const body = await res.json() as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string }; inline_data?: { data?: string; mime_type?: string }; text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
  const cand = body.candidates?.[0];
  for (const p of cand?.content?.parts ?? []) {
    const d = p.inlineData ?? (p.inline_data ? { data: p.inline_data.data, mimeType: p.inline_data.mime_type } : null);
    if (d?.data) return { data: Buffer.from(d.data, 'base64'), mime: d.mimeType ?? 'image/png' };
  }
  const why = body.promptFeedback?.blockReason ?? cand?.finishReason ?? cand?.content?.parts?.find((p) => p.text)?.text?.slice(0, 200) ?? 'no image in the answer';
  throw new PictureFailure('refused', `Gemini painted nothing: ${why}`);
}

/** fal.ai: the synchronous endpoint. With earlier pictures, the model's edit endpoint takes them as image_urls. */
async function fal(fetchFn: Fetch, model: string, key: string, req: PaintRequest): Promise<Painted> {
  const flux3 = model.startsWith('blackforestlabs/flux-3');
  const edit = req.refs.length > 0;
  const endpoint = edit ? (flux3 ? model.replace(/text-to-image$/, 'edit-image') : `${model}/edit`) : model;
  const body: Record<string, unknown> = { prompt: req.prompt, num_images: 1, output_format: 'png' };
  if (flux3) Object.assign(body, { aspect_ratio: ratio(req), resolution: '1k' });
  else body.image_size = req.tall ? 'portrait_4_3' : req.square ? 'square_hd' : 'landscape_4_3';
  if (edit) body.image_urls = req.refs.map(dataUri);
  const res = await call(fetchFn, `https://fal.run/${endpoint}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Key ${key}` }, body: JSON.stringify(body),
  }, 'fal.ai');
  const out = await res.json() as { images?: { url?: string }[] };
  const src = out.images?.[0]?.url;
  if (!src) throw new PictureFailure('refused', 'fal.ai painted nothing');
  if (src.startsWith('data:')) {
    const [head, b64] = src.split(',', 2);
    return { data: Buffer.from(b64, 'base64'), mime: head.slice(5).split(';')[0] || 'image/png' };
  }
  return download(fetchFn, src, 'fal.ai');
}

/** Replicate: a prediction that waits for its result, polled a little longer if it is not done yet. */
async function replicate(fetchFn: Fetch, model: string, key: string, req: PaintRequest): Promise<Painted> {
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${key}`, prefer: 'wait=60' };
  const input: Record<string, unknown> = { prompt: req.prompt, aspect_ratio: ratio(req), output_format: 'webp' };
  if (req.refs.length) input.input_images = req.refs.map(dataUri);
  const res = await call(fetchFn, `https://api.replicate.com/v1/models/${model}/predictions`, { method: 'POST', headers, body: JSON.stringify({ input }) }, 'Replicate');
  let p = await res.json() as { status?: string; output?: unknown; error?: string; urls?: { get?: string } };
  const until = Date.now() + TIMEOUT_MS;
  while ((p.status === 'starting' || p.status === 'processing') && p.urls?.get && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 2000));
    p = await (await call(fetchFn, p.urls.get, { headers: { authorization: `Bearer ${key}` } }, 'Replicate')).json() as typeof p;
  }
  if (p.status !== 'succeeded') throw new PictureFailure(p.status === 'failed' ? 'refused' : 'failed', `Replicate: ${p.error ?? p.status ?? 'no answer'}`);
  const src = Array.isArray(p.output) ? p.output[0] : p.output;
  if (typeof src !== 'string') throw new PictureFailure('failed', 'Replicate returned no picture');
  return download(fetchFn, src, 'Replicate');
}

/** OpenAI: generations without earlier pictures, edits with them. Both answer with base64. */
async function openai(fetchFn: Fetch, model: string, key: string, req: PaintRequest): Promise<Painted> {
  const common = { model, prompt: req.prompt, size: req.tall ? '1024x1536' : req.square ? '1024x1024' : '1536x1024', quality: 'medium', output_format: 'webp', n: 1 };
  const edit = req.refs.length > 0;
  const body = edit ? { ...common, images: req.refs.map((r) => ({ image_url: dataUri(r) })) } : common;
  const res = await call(fetchFn, `https://api.openai.com/v1/images/${edit ? 'edits' : 'generations'}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(body),
  }, 'OpenAI');
  const out = await res.json() as { data?: { b64_json?: string }[] };
  const b64 = out.data?.[0]?.b64_json;
  if (!b64) throw new PictureFailure('refused', 'OpenAI painted nothing');
  return { data: Buffer.from(b64, 'base64'), mime: 'image/webp' };
}

export const PAINTERS: Record<PictureProvider, (fetchFn: Fetch, model: string, key: string, req: PaintRequest) => Promise<Painted>> = { gemini, fal, replicate, openai };
