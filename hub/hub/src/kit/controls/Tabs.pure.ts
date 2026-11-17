// The pure rules of the kit Tabs (Tabs.tsx on the web, Tabs.term.tsx in the terminal): a badge's words, where a dragged
// tab lands, and (terminal) which run of tabs fits a strip of a given width. No React runtime, no DOM.
import type { ReactNode } from 'react';

/** A number badge with its visible unit ("3 unread"); a badge that is not a count, or has no unit, stays as given. */
export function badgeText(badge: ReactNode, unit: ((n: number) => string) | undefined): ReactNode {
  if (!unit) return badge;
  const n = typeof badge === 'number' ? badge : typeof badge === 'string' && /^\d+\+?$/.test(badge) ? Number.parseInt(badge, 10) : null;
  return n === null ? badge : `${badge} ${unit(n)}`;
}

/**
 * The index a tab dragged from `from` takes when dropped before (or `after`) the tab at `over`, counted once it has left
 * its place; null when that is where it already is.
 */
export function dropIndex(from: number, over: number, after: boolean): number | null {
  const slot = after ? over + 1 : over;
  const to = slot > from ? slot - 1 : slot;
  return to === from ? null : to;
}

/** The cells a hidden-tabs marker takes at one end of a strip ("‹ 12 " / " 12 ›"). */
export const TAB_MORE_CELLS = 5;

/**
 * The run of tabs a strip `room` cells wide shows, given each tab's width, so the tab at `at` is always in it: all of
 * them when they fit, else a window around `at`, grown to the right first, then to the left, while it fits beside the
 * markers that say how many are hidden at each end. `to` is exclusive.
 */
export function tabWindow(widths: readonly number[], at: number, room: number): { from: number; to: number } {
  const n = widths.length;
  if (n === 0) return { from: 0, to: 0 };
  const sum = (a: number, b: number) => widths.slice(a, b).reduce((x, w) => x + w, 0);
  if (sum(0, n) <= room) return { from: 0, to: n };
  const i = Math.min(Math.max(0, at), n - 1);
  const need = (a: number, b: number) => sum(a, b) + (a > 0 ? TAB_MORE_CELLS : 0) + (b < n ? TAB_MORE_CELLS : 0);
  let from = i;
  let to = i + 1;
  for (;;) {
    if (to < n && need(from, to + 1) <= room) to += 1;
    else if (from > 0 && need(from - 1, to) <= room) from -= 1;
    else break;
  }
  return { from, to };
}
