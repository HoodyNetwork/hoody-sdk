// The page host in a terminal: the web's semantics (pageHost.tsx), on the terminal prims. One slot per page: the page
// the route shows, and any page that asked to stay loaded (useKeepPage) while another shows. A kept page sits in a
// hidden React Activity (the OpenTUI reconciler implements hide/unhide: the slot's nodes go display:none, its effects
// stop, its state stays, and its focusables leave the Tab order because their registration effects are cleaned up).
// It reads the location it last had while shown, navigates nowhere (PageNavHold), and keeps its scroll as it was (its
// scroll boxes are the same nodes). A page not kept unmounts when left; coming back it opens at the scroll place it
// had (the web's scroll places, read from the slot's scroll boxes when it unmounts and put back as its content grows,
// for SCROLL_PLACE_MS at most, stopping at the first key). Slots keep the manifest order. The host moves the core view
// (ShellView) before the newly shown page renders. What the terminal does not have: the DOM blur on hide (the prim
// focus store drops a hidden page's focusables itself), the title focus (no document focus), the pending line's CSS
// delay (NavPending draws nothing: the nav marks the page at once).
import { Activity, createContext, memo, type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type PageNavHold, PageNavHoldContext } from '@kit/nav';
import type { PageManifest } from '@kit/page';
import type * as Web from './pageHost';
import { Box } from '../term/prim';
import type { BoxRenderable } from '../term/prim/otui';

export type { PageHostProps } from './pageHost';

type HubLocation = NonNullable<PageNavHold['location']>;

function belongs(page: string, pathname: string): boolean {
  const base = page.toLowerCase();
  const p = pathname.toLowerCase();
  return p === base || p.startsWith(`${base}/`);
}

interface Slot {
  shown: boolean;
  keep: (on: boolean) => void;
}
const SlotContext = createContext<Slot | null>(null);

export const ShownPageWait: typeof Web.ShownPageWait = createContext<ReactNode>(null);
export const RouteVisit: typeof Web.RouteVisit = createContext<number | undefined>(undefined);
export const ShellView: typeof Web.ShellView = createContext<((path: string) => void) | null>(null);

type Last = null | { id: string; location: HubLocation };

/** How long a page coming back keeps trying to reach its scroll place while its content still grows. */
const SCROLL_PLACE_MS = 2000;

/** The scroll boxes under a node, in tree order (a scroll box is any node with a numeric scrollTop and scrollHeight). */
function scrollBoxes(node: BoxRenderable | null): Array<{ scrollTop: number; scrollHeight: number }> {
  const out: Array<{ scrollTop: number; scrollHeight: number }> = [];
  const walk = (n: unknown): void => {
    const r = n as { scrollTop?: unknown; scrollHeight?: unknown; getChildren?: () => unknown[]; isDestroyed?: boolean } | null;
    if (!r || r.isDestroyed) return;
    if (typeof r.scrollTop === 'number' && typeof r.scrollHeight === 'number') out.push(r as { scrollTop: number; scrollHeight: number });
    for (const c of r.getChildren?.() ?? []) walk(c);
  };
  walk(node);
  return out;
}

/** Scroll places by page id: a host's own, so an account or realm switch (which remounts the host) forgets them. */
const PlacesContext = createContext<Map<string, number[]> | null>(null);

export const PageHost: typeof Web.PageHost = memo(function PageHost({ pages, current, location, visit, render }) {
  const wait = useContext(ShownPageWait);
  const toView = useContext(ShellView);
  const shown = wait === null ? current : undefined;
  const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set());
  const pathOf = (id: string | undefined) => pages.find((p) => p.id === id)?.path;
  const shownPath = pathOf(current);
  const waiting = shown === undefined;
  const drawn = (was: Last): Last => (!waiting && current && shownPath && belongs(shownPath, location.pathname) ? { id: current, location } : was);
  const [seen, setSeen] = useState(() => ({ current, location, held: new Map<string, HubLocation>(), waiting, last: drawn(null), visit, mounts: new Map<string, number>() }));
  let held = seen.held;
  let last = seen.last;
  let mounts = seen.mounts;
  if (seen.current !== current || seen.location !== location || seen.waiting !== waiting || seen.visit !== visit) {
    if (seen.visit !== visit && current && !kept.has(current)) mounts = new Map(mounts).set(current, (mounts.get(current) ?? 0) + 1);
    const left = pathOf(seen.current);
    if (seen.current && seen.current !== current && left && belongs(left, seen.location.pathname)) held = new Map(held).set(seen.current, seen.location);
    last = drawn(last);
    setSeen({ current, location, held, waiting, last, visit, mounts });
  }
  const shownOwn = shownPath && belongs(shownPath, location.pathname) ? location : (held.get(current ?? '') ?? null);
  const waitOwn = last && last.id === current ? last.location : (held.get(current ?? '') ?? null);
  const coherent = toView === null || shown === undefined || (shownPath !== undefined && belongs(shownPath, location.pathname));
  const viewKey = coherent ? `${shown ?? ''}\n${location.pathname}` : null;
  const [opened, setOpened] = useState(shown);
  const lastView = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (viewKey === null) return;
    if (lastView.current !== null && lastView.current !== viewKey) toView?.(location.pathname);
    lastView.current = viewKey;
    setOpened(shown);
  }, [viewKey, location.pathname, shown, toView]);
  const target = coherent ? shown : opened;
  const drawnShown = toView !== null && opened !== target ? undefined : target;
  const shownNow = useRef(drawnShown);
  useLayoutEffect(() => {
    shownNow.current = drawnShown;
  }, [drawnShown]);
  const keep = useCallback((id: string, on: boolean) => {
    setKept((was) => {
      if (was.has(id) === on) return was;
      const next = new Set(was);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const places = useMemo(() => new Map<string, number[]>(), []);

  return (
    <PlacesContext value={places}>
      {pages
        .filter((p) => p.id === drawnShown || kept.has(p.id))
        .map((p) => (
          <PageSlot
            key={`${p.id}#${mounts.get(p.id) ?? 0}`}
            id={p.id}
            path={p.path}
            shown={p.id === drawnShown}
            own={p.id === drawnShown && p.id === current ? shownOwn : p.id === current ? waitOwn : (held.get(p.id) ?? null)}
            shownNow={shownNow}
            visit={visit}
            keep={keep}
          >
            {render(p)}
          </PageSlot>
        ))}
      {wait}
    </PlacesContext>
  );
});

/** The web draws a thin delayed line while the next page loads; the terminal's nav marks the page at once. */
export const NavPending: typeof Web.NavPending = () => null;

interface PageSlotProps {
  id: string;
  path: string;
  shown: boolean;
  own: HubLocation | null;
  shownNow: { readonly current: string | undefined };
  visit: number | undefined;
  keep: (id: string, on: boolean) => void;
  children: ReactNode;
}

function PageSlot({ id, path, shown, own, shownNow, visit, keep, children }: PageSlotProps) {
  const slot = useMemo<Slot>(() => ({ shown, keep: (on) => keep(id, on) }), [shown, keep, id]);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Scroll places: noted when the slot unmounts (its nodes are still there in a layout cleanup), put back when it
  // mounts again and its content has grown to reach them; a key or the person's own scroll stops it.
  const places = useContext(PlacesContext);
  const box = useRef<BoxRenderable | null>(null);
  useLayoutEffect(() => {
    const want = places?.get(id);
    let timer: ReturnType<typeof setInterval> | null = null;
    if (want && want.some((v) => v > 0)) {
      const until = Date.now() + SCROLL_PLACE_MS;
      const left = new Map<number, number>();
      const step = () => {
        const boxes = scrollBoxes(box.current);
        let done = true;
        want.forEach((top, i) => {
          const b = boxes[i];
          if (!b || top <= 0) return;
          // Something else moved this box since the last step (the person, the page): it wins.
          if (left.has(i) && b.scrollTop !== left.get(i)) { left.set(i, -1); return; }
          if (left.get(i) === -1) return;
          b.scrollTop = top;
          left.set(i, b.scrollTop);
          if (b.scrollTop < top) done = false;
        });
        if ((done || Date.now() > until) && timer) { clearInterval(timer); timer = null; }
      };
      timer = setInterval(step, 30);
      (timer as { unref?: () => void }).unref?.();
      step();
    }
    return () => {
      if (timer) clearInterval(timer);
      places?.set(id, scrollBoxes(box.current).map((b) => b.scrollTop));
    };
  }, [id, places]);
  const routeVisit = useContext(RouteVisit);
  const routeNow = useRef(routeVisit);
  routeNow.current = routeVisit;
  const ownVisit = shown ? visit : undefined;
  const hold = useMemo<PageNavHold>(
    () => ({
      location: own,
      owns: (pathname) => shown && belongs(path, pathname) && (ownVisit === undefined || routeNow.current === undefined || routeNow.current === ownVisit),
      hidden: () => mounted.current && shownNow.current !== id,
    }),
    [own, path, shownNow, id, shown, ownVisit],
  );
  return (
    <Box dir="column" grow={1} hidden={!shown} boxRef={box}>
      <Activity mode={shown ? 'visible' : 'hidden'}>
        <SlotContext value={slot}>
          <PageNavHoldContext value={hold}>{children}</PageNavHoldContext>
        </SlotContext>
      </Activity>
    </Box>
  );
}

export const useKeepPage: typeof Web.useKeepPage = (on) => {
  const keep = useContext(SlotContext)?.keep;
  useEffect(() => {
    keep?.(on);
  }, [keep, on]);
};

export const usePageShown: typeof Web.usePageShown = () => useContext(SlotContext)?.shown ?? true;

/** No DOM in a terminal: there is no slot element to hand out. */
export const shownPageRoot: typeof Web.shownPageRoot = () => null;

/** No document focus in a terminal: the page's first control takes the focus by itself (autoFocus). */
export const focusShownTitle: typeof Web.focusShownTitle = () => {};
