// What the Home widget lists: the paid servers that need money first (unpaid, on hold), then the others by the
// date they are paid until, soonest first. Pure, so the order has a unit test. Rows reuse the page's own subRow.
import { type SubRow, subRow } from './logic';
import type { RawSub } from './types';

/** How many servers the widget lists. */
export const WIDGET_ROWS = 3;

const ENDED = new Set(['terminated', 'host_wiped', 'wiping']);

function until(sub: RawSub): number {
  const t = typeof sub.paid_through === 'string' ? Date.parse(sub.paid_through) : NaN;
  return Number.isFinite(t) ? t : Infinity;
}

/** The servers to list, at most `limit`: what needs paying first, then the soonest to run out. Ended servers are not listed. */
export function widgetSubs(subs: readonly RawSub[], limit: number = WIDGET_ROWS, now: number = Date.now()): SubRow[] {
  const live = subs.filter((s) => s && typeof s.id === 'string' && s.id && typeof s.state === 'string' && !ENDED.has(s.state));
  const rows = live.map((s) => ({ s, row: subRow(s, {}, now) }));
  rows.sort((a, b) => Number(b.row.pay !== null) - Number(a.row.pay !== null) || until(a.s) - until(b.s));
  return rows.slice(0, limit).map((x) => x.row);
}
