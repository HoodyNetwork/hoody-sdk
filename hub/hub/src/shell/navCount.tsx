// A page's count on its left-menu item (its manifest's navCount; the Board's programs). The shell
// loads the page's count reader on its own, never the page, and boxes it: while the reader loads, if its load fails or
// it throws, and while it answers null (not known yet), the item draws as it would without a count, and so it does at
// 0. The reader follows the page's own context (realm, account), so the count moves with a switch by itself.
// Jump to reads the same reader's `items` (the page's named things, the Board's named Boards) through NavItemsProbes:
// the same load, the same box, nothing read on the wire.
import { use, useLayoutEffect } from 'react';
import type { NavCount, PageManifest } from '@kit/page';
import { lazyReaders, ReaderBox } from './lazyReader';

type Reader = () => NavCount | null;
// One load per page. A load that failed stays failed until the Hub reloads (as a top-bar part's does).
const readerOf = lazyReaders<Reader>();

function Probe({ load, page, onTotal }: { load: () => Promise<{ default: Reader }>; page: PageManifest; onTotal: (n: number | null) => void }) {
  const useCount = use(readerOf(page, load));
  const count = useCount();
  const total = count && Number.isFinite(count.total) && count.total > 0 ? Math.floor(count.total) : null;
  // Before paint, so a count that is known draws with the item's first frame after it. The cleanup clears it whenever
  // the probe goes: it unmounts (a failure, or the item left the menu) or Suspense hides it (the reader suspends again).
  useLayoutEffect(() => {
    onTotal(total);
    return () => onTotal(null);
  }, [onTotal, total]);
  return null;
}

/**
 * Reads the page's count for its menu item and hands `onTotal` the total when it is known and above 0, else null. It
 * renders nothing itself, so the item beside it never remounts as the reader loads (focus on it stays). `onTotal` must
 * be stable (a state setter).
 */
export function NavCountProbe({ page, onTotal }: { page: PageManifest; onTotal: (n: number | null) => void }) {
  const load = page.navCount?.load;
  if (!load) return null;
  return (
    <ReaderBox>
      <Probe load={load} page={page} onTotal={onTotal} />
    </ReaderBox>
  );
}

/** One named thing of a page for Jump to (kit/page NavCount.items). */
export type NavItem = NonNullable<NavCount['items']>[number];
type OnItems = (page: string, items: readonly NavItem[] | null) => void;

/** The reader's items that are usable: an id, a name and a route at or below the page's own path, all strings. */
function usable(page: PageManifest, items: unknown): NavItem[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((x: unknown) => {
    const { id, label, to } = (x ?? {}) as Partial<Record<keyof NavItem, unknown>>;
    if (typeof id !== 'string' || typeof label !== 'string' || typeof to !== 'string' || !id || !label.trim()) return [];
    return to === page.path || to.startsWith(`${page.path}?`) || to.startsWith(`${page.path}/`) ? [{ id, label, to }] : [];
  });
}

function ItemsProbe({ load, page, onItems }: { load: () => Promise<{ default: Reader }>; page: PageManifest; onItems: OnItems }) {
  const useCount = use(readerOf(page, load));
  const items = usable(page, useCount()?.items);
  // By value: a reader that builds a new array each render reports once.
  const key = items.length > 0 ? JSON.stringify(items) : '';
  const id = page.id;
  useLayoutEffect(() => {
    onItems(id, key ? (JSON.parse(key) as NavItem[]) : null);
    // Gone (Jump to's field emptied or it closed, a failure, Suspense hid it): the page names nothing.
    return () => onItems(id, null);
  }, [onItems, id, key]);
  return null;
}

/** Reads, for each page with a navCount, the named things its reader holds now and hands them to `onItems` (null: none,
 *  or not known). It renders nothing and fails open like the count. `onItems` must be stable. */
export function NavItemsProbes({ pages, onItems }: { pages: readonly PageManifest[]; onItems: OnItems }) {
  return pages.map((page) => {
    const load = page.navCount?.load;
    if (!load) return null;
    return (
      <ReaderBox key={page.id}>
        <ItemsProbe load={load} page={page} onItems={onItems} />
      </ReaderBox>
    );
  });
}
