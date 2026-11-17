// The Support nav count: tickets with an unread reply across every status,
// closed included, read page after page of the unfiltered list (limit 50, at most 4 pages). Null while a page is
// pending or failed, or when the bound is reached with a cursor still set: no badge is shown then, never a number the
// reader could not complete. It reads again when the page is shown and when the window regains focus; no timer.
import type { NavCount } from '@kit';
import { useCountPages } from './data';
import { unreadCount } from './logic';

export function useUnreadCount(): number | null {
  const { account, pages } = useCountPages();
  if (!account) return null;
  return unreadCount(pages);
}

export default function useSupportNavCount(): NavCount | null {
  const n = useUnreadCount();
  return n === null ? null : { total: n };
}
