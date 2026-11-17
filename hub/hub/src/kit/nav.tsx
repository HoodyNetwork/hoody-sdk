// Navigation for pages: URL state (selection, tabs, filters) lives in the hash route's search
// string, so Back and deep links work everywhere. Pages use these hooks and the kit's Link;
// they never import the router.
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useCallback, useContext } from 'react';
import { PageNavHoldContext } from './navhold';
import { useLocationPart } from './navPart';

export type SearchValue = string | undefined;

export interface SetSearchOptions {
  /** Replace the history entry instead of pushing one (filters, typing). */
  replace?: boolean;
  /** Keep every scroller where it is: the router's scroll restore otherwise re-applies the position from before the change
   * and cancels a scroll the caller just started (the settings rail's jump). */
  keepScroll?: boolean;
}

// The page hold (PageNavHold, its context and useHiddenNow) lives in navhold.ts, which imports no router hooks, so the
// overlays can read it where a test replaces this module with a partial mock; re-exported here for every page.
export { type PageNavHold, PageNavHoldContext, useHiddenNow } from './navhold';

/** The current route search as plain strings. */
export function useSearch(): Readonly<Record<string, string>> {
  return useLocationPart((l) => l.search as Record<string, string>);
}

/** One search parameter and its setter; `undefined` removes it. */
export function useSearchParam(name: string): [SearchValue, (value: SearchValue, opts?: SetSearchOptions) => void] {
  const value = useLocationPart((l) => (l.search as Record<string, string | undefined>)[name]);
  const navigate = useNavigate();
  const hold = useContext(PageNavHoldContext);
  const set = useCallback(
    (next: SearchValue, opts?: SetSearchOptions) => {
      if (hold?.hidden()) return;
      void navigate({
        to: '.',
        search: ((prev: Record<string, string>) => {
          const out: Record<string, string> = { ...prev };
          if (next === undefined || next === '') delete out[name];
          else out[name] = next;
          return out;
        }) as never,
        replace: opts?.replace ?? false,
        resetScroll: opts?.keepScroll ? false : undefined,
      });
    },
    [name, navigate, hold],
  );
  return [value, set];
}

/** The current hash path, e.g. '/computers/abc'. */
export function usePathname(): string {
  return useLocationPart((l) => l.pathname);
}

/** The anchor after the route, without its '#': '/guide#connect' gives 'connect', and '' when there is none. It follows
 * every navigation, including the router's own (pushState fires no hashchange event). */
export function useLocationHash(): string {
  return useLocationPart((l) => l.hash);
}

/** The history entry the location is, by its key: the same link pushed again is a new entry, a re-render (StrictMode's
 *  second run, a kept page drawn on its own last location) is the same one. '' when the history gives no key. */
export function useLocationEntry(): string {
  return useLocationPart((l) => {
    const st = l.state as { __TSR_key?: string; key?: string } | undefined;
    return st?.__TSR_key ?? st?.key ?? '';
  });
}

// The FAQ landing mark writes the browser's own history entry: it lives in nav.web.tsx (web-only), re-exported here.
export { useLandedMark } from './nav.web';

/**
 * The href of a FAQ question on this page: the page's path and search with the anchor `#faq-<id>`, built by the router's
 * own location builder (so a search value is serialized the router's way, never by string concatenation). A hub path
 * ('/bots?sel=x#faq-hold') for the kit Link, which renders and navigates it like any other. Reads the location through
 * the page hold, so a page redrawn as the person leaves it keeps its own path.
 */
export function useFaqHref(id: string): string {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearch();
  return router.buildLocation({ to: pathname, search, hash: `faq-${id}` } as never).href;
}

/**
 * Presses a FAQ question's link again from the place it already names: the router treats a navigation to the location it is
 * at (same href, same history state) as a reload and pushes nothing, so the press carries a fresh state nonce and pushes a
 * new entry (a new entry is what makes the FAQ land again). Through the page hold like `useGo`.
 */
export function useFaqPush(): (id: string) => void {
  const router = useRouter();
  const hold = useContext(PageNavHoldContext);
  const pathname = usePathname();
  const search = useSearch();
  return useCallback(
    (id: string) => {
      if (hold?.hidden()) return;
      const href = router.buildLocation({ to: pathname, search, hash: `faq-${id}` } as never).href;
      void router.navigate({ href, state: { faqPress: Date.now() + Math.random() } } as never);
    },
    [router, hold, pathname, search],
  );
}

/** Navigate to a hash path ('/bots?sel=x'). */
export function useGo(): (to: string, opts?: SetSearchOptions) => void {
  const navigate = useNavigate();
  const hold = useContext(PageNavHoldContext);
  return useCallback(
    (to: string, opts?: SetSearchOptions) => {
      if (hold?.hidden()) return;
      void navigate({ href: to, replace: opts?.replace ?? false, resetScroll: opts?.keepScroll ? false : undefined } as never);
    },
    [navigate, hold],
  );
}


/** A reader of the route the browser shows now: the router's own parse of its history location (its pathname, read
 *  when called), never a page's held one (PageNavHold). A page that moves itself in an effect compares it with the
 *  path it read, so a redraw while the person leaves (the host draws it with its last location) moves nobody. */
export function useLiveRoute(): () => string {
  const router = useRouter();
  return useCallback(() => router.parseLocation(router.history.location).pathname, [router]);
}

/** What the browser shows now, as useLiveRoute reads it: the path, and the search string as the router writes it ('' or
 *  '?computer=abc'). */
export interface LiveLocation { pathname: string; searchStr: string }

/** useLiveRoute with the search string: a reader of the location the history shows NOW (the router's own parse of its
 *  history location, read when called), never a page's held one (PageNavHold). For an effect or a timer that must not act
 *  after the person left the page, and that asks whether a search parameter is in the URL at that moment. It works under
 *  any router history (the web's hash history, the terminal's memory history). */
export function useLiveLocation(): () => LiveLocation {
  const router = useRouter();
  return useCallback(() => {
    const l = router.parseLocation(router.history.location);
    return { pathname: l.pathname, searchStr: l.searchStr };
  }, [router]);
}

/** The part of the path below a page's own path: '/computers/abc/ports' under '/computers' → ['abc', 'ports']. */
export function useSubPath(base: string): string[] {
  const path = usePathname();
  if (!path.startsWith(base)) return [];
  return path
    .slice(base.length)
    .split('/')
    .filter((p) => p.length > 0)
    .map((p) => decodeURIComponent(p));
}
