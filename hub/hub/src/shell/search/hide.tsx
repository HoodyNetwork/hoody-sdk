// Jump to leaves out the deep places a page's view does not draw now:
// Account's passcode lock on a token page, all but Sign-in sessions (and its password and
// two-step commands) on a suspended account, Referrals' questions where the page invites nobody, the places of Files,
// Programs, Tunnels and AI's Models with no computer, Support's questions without account access. Each such page names
// its reader in its manifest (searchHide); the shell loads it on its own, never the page, and boxes it as it does a
// navCount (lazyReader): while it loads, if its load fails or it throws, and while it answers null, nothing of the
// page is hidden (the jump lands on the page, as a manifest command does).
import { use, useLayoutEffect } from 'react';
import type { PageManifest, SearchHide } from '@kit/page';
import { lazyReaders, ReaderBox } from '../lazyReader';

type Reader = () => SearchHide | null;
// One load per page. A load that failed stays failed until the Hub reloads (as a navCount's does).
const readerOf = lazyReaders<Reader>();

type OnHide = (page: string, hide: SearchHide | null) => void;

function Probe({ page, load, onHide }: { page: PageManifest; load: () => Promise<{ default: Reader }>; onHide: OnHide }) {
  const useHide = use(readerOf(page, load));
  const hide = useHide();
  // By value: a reader that builds a new object each render reports once, not on every render of the palette.
  const key = hide ? JSON.stringify(hide) : '';
  const id = page.id;
  useLayoutEffect(() => {
    onHide(id, key ? (JSON.parse(key) as SearchHide) : null);
    // Gone (the palette closed, a failure, Suspense hid it): the page hides nothing.
    return () => onHide(id, null);
  }, [onHide, id, key]);
  return null;
}

/** Reads, for each page with a searchHide, what its view leaves out now, and hands it to `onHide` (null: nothing). It
 *  renders nothing. `onHide` must be stable. */
export function SearchHideProbes({ pages, onHide }: { pages: readonly PageManifest[]; onHide: OnHide }) {
  return pages.map((page) => {
    const load = page.searchHide?.load;
    if (!load) return null;
    return (
      <ReaderBox key={page.id}>
        <Probe page={page} load={load} onHide={onHide} />
      </ReaderBox>
    );
  });
}
