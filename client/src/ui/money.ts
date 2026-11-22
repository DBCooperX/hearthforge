// The one currency every price is shown in. The server says which (and its fixed rate per US dollar) with the
// reports that hold prices, and every amount the providers quote in dollars goes through here.
import { fmtUsd, type Money } from '../../../shared/credits';

let current: Money = { currency: 'USD', rate: 1 };

/** Remember what the last report said. Ignores a report that did not say. */
export function setMoney(m?: Money | null) { if (m && m.currency && m.rate > 0) current = { currency: m.currency, rate: m.rate }; }

export const getMoney = (): Money => current;

/** A price in dollars, shown in the global currency. `small` gives tiny prices a third decimal. */
export const usd = (dollars: number, small = false) => fmtUsd(dollars, current, small);
