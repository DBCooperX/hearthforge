// Talking to the Innkeeper's side of the server. The session token is kept in this browser
// and sent with every request; without one the server answers "signed out".
const KEY = 'hearthforge.innkeeper';
/** For browsers that refuse localStorage: the session of this tab. */
let memory = '';

export function innkeeperSession(): string {
  try { return localStorage.getItem(KEY) ?? memory; } catch { return memory; }
}

export function setInnkeeperSession(token: string) {
  try { if (token) localStorage.setItem(KEY, token); else localStorage.removeItem(KEY); } catch { /* lasts until the tab closes */ }
  memory = token;
}


export class InnError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

interface Options { method?: 'GET' | 'POST'; body?: unknown; raw?: BodyInit }

async function request(path: string, o: Options = {}): Promise<Response> {
  const headers: Record<string, string> = { 'x-innkeeper-session': innkeeperSession() };
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`/api/admin${path}`, { method: o.method ?? (o.body !== undefined || o.raw !== undefined ? 'POST' : 'GET'), cache: 'no-store', headers, body: o.raw ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined) });
  } catch {
    throw new InnError('offline', 0);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new InnError(String(body?.error ?? 'failed'), res.status);
  }
  return res;
}

export async function inn<T = unknown>(path: string, o: Options = {}): Promise<T> {
  return (await request(path, o)).json() as Promise<T>;
}

/** Fetch a file from the server and hand it to the browser to save. */
export async function innDownload(path: string) {
  const res = await request(path);
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'hearthforge.json';
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
