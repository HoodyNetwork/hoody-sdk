// Router assembly without the shell: TanStack Router with code routes built from the discovered manifests (no
// generated route file). Hash history: the server serves the Hub at /auth/home only, so the
// app's own path lives after the '#'. Search values are plain strings (?sel=abc), not JSON.
// app/router.tsx puts the shell around it; page tests (app/testing.ts) build from here, so they never load the shell
// or Ask.
import type { QueryClient } from '@tanstack/react-query';
import { createBrowserHistory, parseHref } from '@tanstack/history';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import { Component, type ErrorInfo, memo, type ReactNode, Suspense, use, useContext, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import type { PageManifest } from '@kit/page';
// states/States before layouts/Layouts: Layouts reaches states/Toast first (controls/Tabs -> perf), States reaches it
// through forms/Outcome. A test that mocks @kit/states/Toast gets the leave notice of an unknown outcome in its mock
// only when Outcome loads first (kit/barrel.toastmock.test.tsx; app/testing.toastmock.test.tsx pins this order).
import { Skeleton } from '@kit/states/States';
import { PageLoading } from '@kit/layouts/Layouts';
import { makeT } from '@kit/strings';
import { useLocked } from '@core';
import shellStrings from '@shell/strings.en.json';
import { NavPending, PageHost, type PageHostProps, RouteVisit, ShownPageWait } from '@shell/pageHost';
import { framedRefused, pageReady, pageView, preloadOnIdle } from '@shell/preload';
import { hubHref, hubNavigate } from './hrefs';
import { FramedRefused, NotFound, PageError } from './PageStates';

export interface RouterContext {
  queryClient: QueryClient;
}

export function parseSearch(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const [k, v] of q) out[k] = v;
  return out;
}

export function stringifySearch(search: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) {
    if (v === undefined || v === null || v === '') continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

/**
 * Hash history that reads the app location from the hash alone. TanStack's createHashHistory
 * merges window.location.search into the app's search, which would leak the page's own query
 * (/auth/home?hub=v3) into every route.
 */
export function createHubHashHistory() {
  return createBrowserHistory({
    parseLocation: () => {
      const [path = '/', ...rest] = window.location.hash.split('#').slice(1);
      return parseHref(`${path || '/'}${rest.length ? `#${rest.join('#')}` : ''}`, window.history.state);
    },
    createHref: (href) => `${window.location.pathname}${window.location.search}#${href}`,
  });
}

/** RAC links and menus navigate through the router; hrefs inside the Hub are hash paths, and an
 * '/auth/' server page loads as a full document (app/hrefs.ts). */
function AriaBridge({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <AriaRouterProvider
      navigate={(to) =>
        hubNavigate(to, (href) => {
          void router.navigate({ href } as never);
        })
      }
      useHref={hubHref}
    >
      {children}
    </AriaRouterProvider>
  );
}

const st = makeT(shellStrings);

/** Sets the document title for the current page; "Locked · Hub" while this tab is locked, the
 *  page's title again at unlock. */
function PageFrame({ page, children }: { page: PageManifest; children: ReactNode }) {
  const locked = useLocked();
  useEffect(() => {
    const t = makeT(page.strings);
    document.title = locked ? st('lock.tabTitle') : `${t(page.title)} · Hub`;
  }, [page, locked]);
  return <>{children}</>;
}

/**
 * A page that failed to render shows the page error; it tries again on the page's next route match (any navigation on
 * it, search-only too, as the router's own boundary did). Kept hidden, the page has no match, and nothing resets.
 */
class PageBoundary extends Component<{ resetKey: unknown; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override componentDidCatch(_error: unknown, _info: ErrorInfo): void {}
  override componentDidUpdate(prev: { resetKey: unknown }): void {
    if (this.state.failed && this.props.resetKey !== undefined && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  override render(): ReactNode {
    return this.state.failed ? <PageError /> : this.props.children;
  }
}

/**
 * What stands in a page's place while its view loads: the page's own title over the loading lines, so the header does
 * not come and go. A canvas page has no header row, and with no page known there is no title: the lines alone.
 */
function PageWait({ page }: { page: PageManifest | undefined }) {
  if (!page || page.layout === 'canvas') return <Skeleton variant="detail" rows={8} />;
  return <PageLoading title={makeT(page.strings)(page.title)} />;
}

/**
 * The page's view, from its one load (shell/preload.ts): drawn in the same pass once loaded. Memo: the view renders on
 * its own state and contexts only, never because the route moved (PageContent re-renders on every navigation).
 */
const PageView = memo(function PageView({ page }: { page: PageManifest }) {
  const View = use(pageView(page));
  return <View />;
});

/** One page's content in its slot: title, error boundary, and the view (a failed load shows the page error). A
 *  sensitive page in a framed Hub draws the refusal in place of its view, which is never loaded (shell/preload.ts). */
function PageContent({ page }: { page: PageManifest }) {
  const match = useRouterState({ select: (s) => s.matches.find((m) => m.staticData.pageId === page.id) });
  return (
    <PageFrame page={page}>
      {framedRefused(page) ? (
        <FramedRefused title={makeT(page.strings)(page.title)} />
      ) : (
        <PageBoundary resetKey={match}>
          <Suspense fallback={<PageWait page={page} />}>
            <PageView page={page} />
          </Suspense>
        </PageBoundary>
      )}
    </PageFrame>
  );
}

const renderPage = (page: PageManifest) => <PageContent page={page} />;

/**
 * The pages, once the page to draw has its view: until then this suspends, outside every page's own boundary. In the
 * background render of a switch (RoutedPages) that keeps the page shown as it is; on the first load the fallback around
 * it shows. A failed load does not wait here: the page draws and shows its error. While the shell holds the page the
 * route shows (ShownPageWait), nothing waits: that page is not drawn. A wait starts at once, and ends in a background
 * render: the page it held draws once its view has loaded, the wait showing until then (ending it at once would suspend
 * in the click's own render and put the first-load fallback over every page, kept ones included).
 */
function DrawnPages({ pages, current, location, visit }: { pages: readonly PageManifest[]; current: string | undefined; location: PageHostProps['location']; visit: number }) {
  const waitNow = useContext(ShownPageWait);
  const waitLate = useDeferredValue(waitNow);
  const wait = waitNow ?? waitLate;
  const page = wait === null ? pages.find((p) => p.id === current) : undefined;
  // A page the framed lock refuses has nothing to wait for: its view is never loaded.
  if (page && !framedRefused(page)) use(pageReady(page));
  return (
    <ShownPageWait value={wait}>
      <PageHost pages={pages} current={current} location={location} visit={visit} render={renderPage} />
    </ShownPageWait>
  );
}

export interface PageRouterOptions {
  queryClient: QueryClient;
  history?: RouterHistory;
}

/** What draws around the pages: the app shell (app/router.tsx). Without one, the pages alone (page unit tests). */
export type ShellFrame = (pages: readonly PageManifest[], routed: ReactNode) => ReactNode;

export function buildPageRouter(pages: readonly PageManifest[], opts: PageRouterOptions, frame?: ShellFrame) {
  const shell = frame !== undefined;
  // Each page is its own chunk, loaded on first visit or ahead of it (shell/preload.ts).
  // The page routes match and draw nothing: the page host draws the page the route names (and any page kept
  // loaded). The outlet still draws Not Found and the index's move to Home.
  function RoutedPages() {
    // The location the matched page belongs to: `location` moves first, while a navigation still resolves.
    const location = useRouterState({ select: (s) => s.resolvedLocation ?? s.location });
    const current = useRouterState({ select: (s) => s.matches[s.matches.length - 1]?.staticData.pageId });
    // The pages draw a step behind the route, in a background render. The click's own render only
    // updates the shell (the nav marks the new page at once); the page shown stays, whole and live, until the next
    // page's view (its chunk) has loaded (DrawnPages suspends in a boundary already showing, and a deferred render that
    // suspends there keeps what is shown); the wait yields to input, so the click never waits on a chunk. Once it is
    // ready, the page host moves the core view and renders the new page in the pass right after, before the frame
    // paints (shell/pageHost.tsx): that render itself is not interruptible.
    // Each time the route names another page is a new visit. Drawn a step behind, a page left and come
    // back to before the next one drew never saw the leave: the route's visit (RouteVisit, now) keeps it on its own last
    // location meanwhile, and the drawn visit tells the page host to mount it afresh, not move it inside the old visit.
    const [entered, setEntered] = useState({ current, visit: 0 });
    if (entered.current !== current) setEntered({ current, visit: entered.visit + 1 });
    const visit = entered.current === current ? entered.visit : entered.visit + 1;
    const routed = useMemo(() => ({ current, location, visit }), [current, location, visit]);
    const drawn = useDeferredValue(routed);
    useEffect(() => (shell && import.meta.env.MODE !== 'test' ? preloadOnIdle(pages) : undefined), []);
    return (
      <>
        <NavPending on={drawn !== routed} />
        <Suspense fallback={<PageWait page={pages.find((p) => p.id === current)} />}>
          <RouteVisit value={visit}>
            <DrawnPages pages={pages} current={drawn.current} location={drawn.location} visit={drawn.visit} />
          </RouteVisit>
        </Suspense>
        <Outlet />
      </>
    );
  }
  const root = createRootRouteWithContext<RouterContext>()({
    component: () => (
      <AriaBridge>{frame ? frame(pages, <RoutedPages />) : <RoutedPages />}</AriaBridge>
    ),
    notFoundComponent: NotFound,
  });

  const home = pages.find((p) => p.id === 'home') ?? pages.find((p) => p.nav) ?? pages[0];
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: function IndexRoute() {
      const router = useRouter();
      useEffect(() => {
        if (home) void router.navigate({ href: home.path, replace: true } as never);
      }, [router]);
      return null;
    },
  });

  // One splat route per page: it matches the page path itself and every sub-path below it.
  const pageRoutes = pages.map((page) =>
    createRoute({ getParentRoute: () => root, path: `${page.path}/$`, component: () => null, errorComponent: PageError, staticData: { pageId: page.id } }),
  );

  return createRouter({
    routeTree: root.addChildren([index, ...pageRoutes]),
    history: opts.history ?? createHubHashHistory(),
    context: { queryClient: opts.queryClient },
    parseSearch,
    stringifySearch,
    defaultPreload: 'intent',
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    pageId?: string;
  }
}
