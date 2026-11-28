// Background music is played from the server's own sound library (server/src/library.ts). What is left here is the
// switch for music as a whole and the byte ranges browsers ask audio files for.

export function musicEnabled(env: NodeJS.ProcessEnv): boolean {
  return !/^(off|none|false|0|no)$/i.test((env.HEARTHFORGE_MUSIC ?? 'on').trim());
}

/** The byte range to send for a Range header, or null when the header is absent or unusable. */
export function byteRange(header: string | undefined, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (!m || (!m[1] && !m[2]) || size <= 0) return null;
  let start: number, end: number;
  if (!m[1]) { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
  return start <= end && start < size ? { start, end } : null;
}
