// Phones held upright get their own map-first battle layout: the board fills the screen, one slim bar holds
// End turn and an Actions button, and cards slide up from the bottom. The same width as the CSS in mobile.css.
import { useEffect, useState } from 'react';

export const PHONE_QUERY = '(max-width: 640px)';

const matches = (q: string) => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches;

/** True while the window is phone-narrow; follows rotation and resizing. */
export function usePhone(): boolean {
  const [phone, setPhone] = useState(() => matches(PHONE_QUERY));
  useEffect(() => {
    const mq = window.matchMedia?.(PHONE_QUERY);
    if (!mq) return;
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}
