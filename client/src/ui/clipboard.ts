/** Copy text. The clipboard API needs https; on a plain-http LAN address fall back to selecting the field. */
export function copyText(text: string, field: HTMLInputElement | null): boolean {
  if (navigator.clipboard && window.isSecureContext) { void navigator.clipboard.writeText(text); return true; }
  if (!field) return false;
  field.select();
  try { return document.execCommand('copy'); } catch { return false; }
}
