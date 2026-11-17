// Pages render here, one slot per page: the page the route shows, and any page that asked to stay
// loaded (useKeepPage) while another shows. A kept page sits in a hidden React Activity: its DOM and state stay (a
// program frame never reloads), its effects stop until it shows again (no keys, timers, observers or focus mode
// started by an effect meanwhile; bookkeeping a page sets up on purpose to outlive a hide, such as a frame's load
// watch or a pending-outcome toast, keeps going), it reads the location it last had while shown and navigates nowhere (kit/nav PageNavHold). Every page,
// kept or not, reads only its own locations: leaving, it never renders the next page's path; left and come back to
// before the next page drew, it never renders the return until the host draws that visit (RouteVisit). Slots keep the
// manifest order, never moving in the DOM (a moved iframe reloads). The host sits under the shell's ContextOutlet, so
// an account or realm switch drops every kept page. While the shell holds the page the route shows (ShownPageWait: a
// realm a link asked for), that page is not drawn (or, kept, stays hidden) and the wait shows; the kept pages stay as
// they are.
// The host moves the core view (ShellView, the shell's setView): when the page shown changes, the new page renders
// only after the view moved, so what it captures as it mounts belongs to its own view.
import { Activity, createContext, memo, type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { clearSectionHere } from '@kit/layouts/Layouts';
import { type PageNavHold, PageNavHoldContext } from '@kit/nav';
import type { PageManifest } from '@kit/page';
import { hiddenByPage } from './keygate';
import s from './pageHost.module.css';

type HubLocation = NonNullable<PageNavHold['location']>;

/** Whether a path is this page's: its path or below it, without regard to case (the page's splat route). */
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

/** Set by the shell while the page the route shows must wait (shell/realmParam.tsx): what to draw in its place, else
 *  null. Only that page waits: a kept page stays loaded and hidden, its state intact. */
export const ShownPageWait = createContext<ReactNode>(null);

/** The route's visit as of now (app/router.tsx gives it in the click's own render; the page host draws a step behind).
 *  A page drawn for an earlier visit reads its own last location, even once the route is back on its path: until the
 *  host draws the new visit, it is the page the person left, not the one they came back to. Outside
 *  the router (page unit tests): no visits. */
export const RouteVisit = createContext<number | undefined>(undefined);

/** The core view change (setView), given by the shell. Outside it (page unit tests) no view moves. */
export const ShellView = createContext<((path: string) => void) | null>(null);

export interface PageHostProps {
  pages: readonly PageManifest[];
  /** The page the route shows (none: not found, or the index on its way to Home). */
  current: string | undefined;
  /** The router's location: what the page shown reads, and what it keeps reading once hidden. */
  location: HubLocation;
  /** Moves each time the route names another page (app/router.tsx). The router draws a step behind the route, so a page
   *  left and come back to before the next page drew is still mounted: a new visit remounts it, unless
   *  it is kept loaded (useKeepPage), which stays as it is. Absent (page unit tests): nothing remounts. */
  visit?: number;
  /** One page's content: its frame, error boundary, suspense and view. */
  render: (page: PageManifest) => ReactNode;
}

type Last = null | { id: string; location: HubLocation };

// Memo: the router draws the pages a step behind the route (app/router.tsx), so the click's own render, which
// keeps the props, skips every page. `render` must be stable.
export const PageHost = memo(function PageHost({ pages, current, location, visit, render }: PageHostProps) {
  const wait = useContext(ShownPageWait);
  const toView = useContext(ShellView);
  // The page the route shows: none while the shell holds it.
  const shown = wait === null ? current : undefined;
  const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set());
  // The location each page had when it was last shown: a page hidden behind another keeps reading it.
  // `last`: the route's page and the location it had when last drawn as shown, which it keeps reading while it waits (a
  // link into one of its own subroutes carrying ?open_realm= changes nothing it shows until the wait ends).
  const pathOf = (id: string | undefined) => pages.find((p) => p.id === id)?.path;
  const shownPath = pathOf(current);
  const waiting = shown === undefined;
  const drawn = (was: Last): Last => (!waiting && current && shownPath && belongs(shownPath, location.pathname) ? { id: current, location } : was);
  const [seen, setSeen] = useState(() => ({ current, location, held: new Map<string, HubLocation>(), waiting, last: drawn(null), visit, mounts: new Map<string, number>() }));
  let held = seen.held;
  let last = seen.last;
  // Each page's mount number, its slot's key: a new visit to a page not kept loaded gives it a fresh mount, so it goes
  // through its normal mount path (a one-time restore runs again) instead of reading the return as a move inside the
  // visit it never left on screen. For a page that was not drawn anyway the new key changes nothing.
  let mounts = seen.mounts;
  if (seen.current !== current || seen.location !== location || seen.waiting !== waiting || seen.visit !== visit) {
    if (seen.visit !== visit && current && !kept.has(current)) mounts = new Map(mounts).set(current, (mounts.get(current) ?? 0) + 1);
    // Only a location of the page itself is kept for it: the router names the new page before its location settles.
    const left = pathOf(seen.current);
    if (seen.current && seen.current !== current && left && belongs(left, seen.location.pathname)) held = new Map(held).set(seen.current, seen.location);
    last = drawn(last);
    setSeen({ current, location, held, waiting, last, visit, mounts });
  }
  const shownOwn = shownPath && belongs(shownPath, location.pathname) ? location : (held.get(current ?? '') ?? null);
  // A kept page that is the route itself while it waits: its last shown location, else the one it was kept with.
  const waitOwn = last && last.id === current ? last.location : (held.get(current ?? '') ?? null);
  // The view: it moves when the page shown changes (a wait starting or ending included) and when the
  // page shown moves to another of its paths. A page coming into view is not drawn until its view has moved (`opened`):
  // it renders in the pass this effect's update starts, before the frame paints, so its render, its own layout effects
  // and a secret field it mounts with a value all capture the new view, never one this change ends. The page left is
  // gone (or kept and hidden) by then; what it held for its view ends with this change.
  // A page and a location that do not belong together yet (the router can name the next page before its location
  // settles) move nothing: the page drawn stays until the pair agrees, so a switch moves the view once, to the path the
  // page shows.
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
  // The page drawn as shown: the route's once its view moved; while the pair disagrees, the one drawn before.
  const target = coherent ? shown : opened;
  const drawnShown = toView !== null && opened !== target ? undefined : target;
  // The page shown as of the last commit, read when a hidden page tries to navigate.
  const shownNow = useRef(drawnShown);
  useLayoutEffect(() => {
    shownNow.current = drawnShown;
  }, [drawnShown]);
  useScrollPlaces(drawnShown);
  // A page the shell held (ShownPageWait) takes the title focus once it shows: the shell's own focus moved with the
  // path, while the wait was still showing in its place.
  const wasWaiting = useRef(waiting);
  useLayoutEffect(() => {
    const ended = wasWaiting.current && !waiting;
    wasWaiting.current = waiting;
    if (!ended || !document.getElementById('hub-main')) return;
    const id = requestAnimationFrame(focusShownTitle);
    return () => cancelAnimationFrame(id);
  }, [waiting]);
  const keep = useCallback((id: string, on: boolean) => {
    setKept((was) => {
      if (was.has(id) === on) return was;
      const next = new Set(was);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  return (
    <>
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
    </>
  );
});

/** How long a page coming back keeps trying to reach its scroll place while its content is still growing. */
const SCROLL_PLACE_MS = 2000;

/**
 * Each page keeps its own scroll place in the content area (#hub-main, the scroller). The place of the page
 * shown is noted as the person scrolls; when another page shows, it opens at its own place, or at its top when it has
 * none (never at the offset of the page left). A navigation inside the page shown changes nothing. A page whose content
 * is still short (its data loading) is scrolled further once it grows, each frame for SCROLL_PLACE_MS at most, and not
 * once the person scrolls, presses or types, or anything else moves the scroll. The places live with the host, so an account or realm switch forgets them.
 */
function useScrollPlaces(shown: string | undefined): void {
  const places = useRef(new Map<string, number>());
  const noted = useRef(shown);
  useLayoutEffect(() => {
    const main = document.getElementById('hub-main');
    if (!main) return;
    // Noted against the page shown as of the last commit: a scroll the switch itself causes (the old page's content
    // leaving) arrives after it and is overwritten by the place set below.
    const note = () => {
      if (noted.current !== undefined) places.current.set(noted.current, main.scrollTop);
    };
    main.addEventListener('scroll', note, { passive: true });
    return () => main.removeEventListener('scroll', note);
  }, []);
  useLayoutEffect(() => {
    if (noted.current === shown) return;
    noted.current = shown;
    const main = document.getElementById('hub-main');
    if (!main || shown === undefined) return;
    const place = places.current.get(shown) ?? 0;
    main.scrollTop = place;
    if (main.scrollTop >= place) return;
    const until = performance.now() + SCROLL_PLACE_MS;
    let frame = 0;
    // Where this hook last left the scroll: any other offset means something else scrolled (the page bringing a row
    // into view, the browser keeping content in view as it grows above): that scroll wins, and the hook stops.
    let left = main.scrollTop;
    const stop = () => {
      cancelAnimationFrame(frame);
      for (const e of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) main.removeEventListener(e, stop);
    };
    const step = () => {
      if (main.scrollTop !== left) return stop();
      main.scrollTop = place;
      left = main.scrollTop;
      if (left >= place || performance.now() > until) stop();
      else frame = requestAnimationFrame(step);
    };
    for (const e of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) main.addEventListener(e, stop, { passive: true });
    frame = requestAnimationFrame(step);
    return stop;
  }, [shown]);
}

/**
 * The thin line at the top of the content area while the next page gets ready behind the page shown. It
 * shows only past a short wait (its CSS delay), so a quick switch draws nothing. Decorative: the page shown stays
 * readable meanwhile, and the nav already marks where the person is going.
 */
export function NavPending({ on }: { on: boolean }) {
  return on ? <div className={s.pending} data-hub-nav-pending="" aria-hidden="true" /> : null;
}

interface PageSlotProps {
  id: string;
  path: string;
  shown: boolean;
  /** The page's own location: the committed one while shown (once it is the page's), the one it last had while hidden. */
  own: HubLocation | null;
  shownNow: { readonly current: string | undefined };
  /** The visit the host drew (PageHostProps.visit); the slot uses it only while its page is shown. */
  visit: number | undefined;
  keep: (id: string, on: boolean) => void;
  children: ReactNode;
}

function PageSlot({ id, path, shown, own, shownNow, visit, keep, children }: PageSlotProps) {
  const slot = useMemo<Slot>(() => ({ shown, keep: (on) => keep(id, on) }), [shown, keep, id]);
  // Mounted outside the Activity, so it stays true while the page is kept hidden and turns false once it unloads: a
  // navigation captured by a page that is gone moves the person, as it always did.
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Hidden, the page lets go of focus (a control, a program frame, a dialog it opened): focus left there would stop
  // the shell from focusing the shown page and hold the keys. React has already hidden its nodes at this point.
  // A section the page marked "here" (kit scrollSettingsSection) loses the mark too, hidden or unloaded,
  // for every page, those with their own sections (Guide) included.
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const a = document.activeElement;
    if (!shown && a instanceof HTMLElement && (box.current?.contains(a) || hiddenByPage(a))) a.blur();
    if (!shown) clearSectionHere(box.current);
  }, [shown]);
  useLayoutEffect(() => {
    const node = box.current;
    return () => clearSectionHere(node);
  }, []);
  // The route's visit, read where the page reads the location: the router moves it in the same render as the
  // location (this slot re-renders for it; the page under it does not, its hold stays the same object until the host
  // draws another visit while it is shown).
  const routeVisit = useContext(RouteVisit);
  const routeNow = useRef(routeVisit);
  routeNow.current = routeVisit;
  // Always set, so a navigation captured while shown (a late await) is still checked when it is made. The router
  // matches page paths without regard to case (the page's splat route). Hidden, a page never reads the live location,
  // even one under its own path (the route's page while the shell holds it): it reads its own last one. Drawn for an
  // earlier visit than the route's, it does not either: the person left it, and coming back is a new visit. Only the
  // page shown takes the visit: a page kept hidden owns nothing anyway, and a visit drawn to another page must not give
  // it a new hold (it would render again behind the page shown).
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
    <div ref={box} className={s.slot} data-hub-page={id} data-hub-page-hidden={shown ? undefined : ''}>
      <Activity mode={shown ? 'visible' : 'hidden'}>
        <SlotContext value={slot}>
          <PageNavHoldContext value={hold}>{children}</PageNavHoldContext>
        </SlotContext>
      </Activity>
    </div>
  );
}

/**
 * Keep this page loaded, hidden, while the person is on another page (`on`), or not (it unloads when they leave, as
 * every page does). Only a shown page decides; the choice holds while it is hidden. Outside the shell (page unit
 * tests) it does nothing.
 *
 * Hidden, a page's effects stop but its state stays, so a kept page must not use what wipes or guards on a route
 * change through effects or reads the router itself (a typed secret would survive the round trip, a table would read
 * another page's search): SecretInput, SecretField, password fields, useWipeOn, useDataView, useDrawerParam and
 * OutcomeSlot (usePendingToast itself is fine: a hide shows its toast, and the return closes it once the outcome is
 * inline again or settled; a branch drawn without the outcome passes `inline` false). An effect cleanup that must tell
 * a hide from an unload reads useHiddenNow().
 * keepPage.conformance.test.ts checks those names in every page that calls this; it cannot
 * check the page's own effects. Effect-held state must survive a hide and show: an effect that restarts work on
 * reconnect (a sign-in, a load timer) or drops a result that settles while hidden breaks the kept page. Overlays it
 * wants gone on return close in an effect cleanup (cleanups run when it hides; an effect reacting to usePageShown()
 * never runs while hidden).
 */
export function useKeepPage(on: boolean): void {
  const keep = useContext(SlotContext)?.keep;
  useEffect(() => {
    keep?.(on);
  }, [keep, on]);
}

/** False while the shell keeps this page hidden behind another (useKeepPage), true otherwise. */
export function usePageShown(): boolean {
  return useContext(SlotContext)?.shown ?? true;
}

/** The shown page's slot in the content area (a kept page's slot is hidden), else the content area itself. */
export function shownPageRoot(): HTMLElement | null {
  const main = document.getElementById('hub-main');
  return main?.querySelector<HTMLElement>(':scope > [data-hub-page]:not([data-hub-page-hidden])') ?? main;
}

/** Focus the shown page's title (a page kept loaded behind it has one too), unless the person already placed focus
 *  on the shown page (focus left in a kept page's hidden slot does not count). */
export function focusShownTitle(): void {
  const main = document.getElementById('hub-main');
  if (main && shownPageRoot()?.contains(document.activeElement) && document.activeElement !== main) return;
  shownPageRoot()?.querySelector<HTMLElement>('h1[data-hub-title]')?.focus({ preventScroll: true });
}
