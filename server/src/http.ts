// Small helpers the HTTP handlers share.
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/** A secret as it is stored: its SHA-256, so a leaked data folder does not leak the secret. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** A request body past its limit. */
export class TooBig extends Error { constructor() { super('too_big'); } }

/** The whole request body, failing with `tooBig()` as soon as it passes `max` bytes. */
export function readBody(req: IncomingMessage, max: number, tooBig: () => Error): Promise<Buffer> {
  return new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) { fail(tooBig()); req.resume(); } else chunks.push(c);
    });
    req.on('end', () => done(Buffer.concat(chunks)));
    req.on('error', fail);
  });
}
