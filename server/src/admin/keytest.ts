// Ask the Claude API whether a key works and whether it may use the configured models.
// Listing models costs nothing.
import Anthropic from '@anthropic-ai/sdk';
import type { KeyTest } from './api';

export async function testKey(apiKey: string, models: string[]): Promise<KeyTest> {
  const client = new Anthropic({ apiKey, timeout: 15_000, maxRetries: 0 });
  try {
    const known = new Set<string>();
    for await (const m of client.models.list({ limit: 100 })) known.add(m.id);
    const missing = models.filter((id) => !known.has(id));
    return { ok: true, missing };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return { ok: false, reason: 'invalid' };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, reason: 'unreachable' };
    if (err instanceof Anthropic.APIError) return { ok: false, reason: 'error', detail: `${err.status ?? ''} ${err.message}`.trim().slice(0, 200) };
    return { ok: false, reason: 'error', detail: err instanceof Error ? err.message.slice(0, 200) : '' };
  }
}
