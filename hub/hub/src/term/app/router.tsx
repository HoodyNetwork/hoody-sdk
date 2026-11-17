// The terminal app's router: the web's route shape and page drawing (app/pageRouter.tsx) on a history the caller gives
// (memory, in a terminal). An index that moves to Home and one splat route per page, search values as plain strings.
// The pages draw a step behind the route (useDeferredValue), through the shell's page host (shell/pageHost: the
// terminal sibling), one slot per page, each with its own error boundary and Suspense.
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, createRouter, Outlet, type RouterHistory, useRouter, useRouterState } from '@tanstack/react-router';
import { Component, memo, type ReactNode, Suspense, use, useContext, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PageManifest } from '@kit/page';
import { makeT, useStrings } from '@kit/strings';
import { usePageShortcuts } from '../../shell/pageShortcuts';
import { PageHost, type PageHostProps, RouteVisit, ShownPageWait } from '../../shell/pageHost';
import { pageReady, pageView, preloadPage } from '../../shell/preload';
import { Box, Pressable, Text, useFocusControl, useFocusedNode, useKeys } from '../prim';
import { focusMark } from '../prim/FocusInk';
import { sessionSlot } from '../env/session';
import { whenTermElementId } from '../jsx/dom';
import { diagnosticOf, diagnosticsOf, type Diagnostic } from './diagnostic';
import { withPageHandoff } from './pageHandoff';
import strings from '../shell/strings.en.json';

export function parseSearch(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)) out[k] = v;
  return out;
}
export function stringifySearch(search: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

// The same static data the web router declares (app/pageRouter.tsx), repeated because that file is not loaded here.
declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    pageId?: string;
  }
}

/** What a page's failure looks like, and what the runners read to report it: an allowlisted record (diagnostic.ts),
 *  never the error object or its message. */
export interface PageFailure { page: string; error: Diagnostic; /** The component path, innermost first ("Boom < PageView"). */ where?: string }
// The mount's own (env/session.ts sessionSlot): a next mount starts with none recorded and no view counted loading.
// `fallbacks`: Suspense fallbacks of page views on screen now (a view that imported but still suspends, e.g. on a `use()`).
const routerState = sessionSlot('app.router', () => ({ failures: [] as PageFailure[], loading: 0, fallbacks: 0 }));
/** The page failures of this mount (the error boundary's record). */
export const pageFailures = (): readonly PageFailure[] => routerState().failures;

/** The component names of a React component stack, innermost first ("Logs < PageView < Suspense"). */
export function componentPath(stack: string | null | undefined, max = 6): string[] {
  if (!stack) return [];
  const names: string[] = [];
  for (const line of stack.split('\n')) {
    const m = /^\s*(?:at\s+)?([A-Za-z_$][\w$.]*)/.exec(line);
    const n = m?.[1];
    // Components only: host elements (box, text) and runtime frames are left out.
    if (!n || n === 'at' || !/^[A-Z]/.test(n) || /^(Object|Array|Function|Promise)$/.test(n)) continue;
    if (names[names.length - 1] !== n) names.push(n);
    if (names.length >= max) break;
  }
  return names;
}

const isRecord = (e: unknown): e is Diagnostic => !!e && typeof e === 'object' && (e as Partial<Diagnostic>).kind === 'page' && typeof (e as Partial<Diagnostic>).code === 'string';

/** The page's error as the person reads it: what failed, where (component path), and the retry key. */
function PageErrorView({ error, where, onRetry }: { error: unknown; where: string[]; onRetry: () => void }) {
  const t = useStrings(strings);
  // The retry key is a page key: listed in the `?` sheet and the palette like any other.
  usePageShortcuts([{ key: 'r', label: t('error.retryButton'), run: onRetry }]);
  // A code and a class name; the message only where this mount asked for detail (a developer's own run).
  // The boundary hands its record; anything else is turned into one here.
  const d = isRecord(error) ? error : diagnosticOf('page', error, { detail: diagnosticsOf().detail });
  const message = d.detail ?? `${d.code} (${d.name})`;
  return (
    <Box dir="column" padX={1} gap={1}>
      <Text colour="danger" bold>{'✗ ' + t('error.title')}</Text>
      <Text colour="muted">{message}</Text>
      {where.length > 0 && <Text colour="faint">{`${t('error.where')}: ${where.join(' < ')}`}</Text>}
      <Box dir="row" gap={2}>
        <Pressable onPress={onRetry} autoFocus>
          {({ focused }) => <Text colour={focused ? 'blueInk' : 'ink'} bg={focused ? 'blue' : undefined} bold {...focusMark(focused)}>{`[ ${t('error.retryButton')} ]`}</Text>}
        </Pressable>
        <Text colour="faint">{t('error.retry')}</Text>
      </Box>
    </Box>
  );
}

/**
 * A page that failed to render shows its error with the component path and a retry key; the shell and the other pages
 * stay. It tries again on the retry key, and on the page's next route match (any navigation on it), as the web does.
 */
class PageBoundary extends Component<{ page: string; resetKey: unknown; children: ReactNode }, { error: unknown; failed: boolean; where: string[]; tries: number }> {
  override state = { error: null as unknown, failed: false, where: [] as string[], tries: 0 };
  // The boundary keeps the error's record, never the raw error (an error's message or cause can hold an answer).
  static getDerivedStateFromError(error: unknown): { error: unknown; failed: boolean } { return { error: diagnosticOf('page', error, { detail: diagnosticsOf().detail }), failed: true }; }
  override componentDidCatch(error: unknown, info: { componentStack?: string | null }): void {
    const where = componentPath(info.componentStack);
    routerState().failures.push({ page: this.props.page, error: diagnosticOf('page', error, { where, page: this.props.page, detail: diagnosticsOf().detail }), ...(where.length ? { where: where.join(' < ') } : {}) });
    this.setState({ where });
  }
  override componentDidUpdate(prev: { resetKey: unknown }): void {
    if (this.state.failed && this.props.resetKey !== undefined && prev.resetKey !== this.props.resetKey) this.retry();
  }
  retry = (): void => this.setState((s) => ({ error: null, failed: false, where: [], tries: s.tries + 1 }));
  override render(): ReactNode {
    if (!this.state.failed) return <Box key={this.state.tries} dir="column" grow={1}>{this.props.children}</Box>;
    return <PageErrorView error={this.state.error} where={this.state.where} onRetry={this.retry} />;
  }
}

const PageView = memo(function PageView({ page }: { page: PageManifest }) {
  const View = use(pageView(page));
  return <View />;
});

function Loading() {
  const t = useStrings(strings);
  // Counted while shown: a settle never takes this frame for the page (viewsLoading; render.ts, goldens, shots).
  useLayoutEffect(() => { const st = routerState(); st.fallbacks++; return () => { st.fallbacks--; }; }, []);
  return <Text colour="muted">{' ' + t('loading')}</Text>;
}

function PageContent({ page }: { page: PageManifest }) {
  const match = useRouterState({ select: (s) => s.matches.find((m) => m.staticData.pageId === page.id) });
  return (
    <PageBoundary page={page.id} resetKey={match}>
      <Suspense fallback={<Loading />}>
        <PageView page={page} />
      </Suspense>
    </PageBoundary>
  );
}

const renderPage = (page: PageManifest) => <PageContent page={page} />;

/** The pages, once the page to draw has its view (the web's DrawnPages). */
function DrawnPages({ pages, current, location, visit }: { pages: readonly PageManifest[]; current: string | undefined; location: PageHostProps['location']; visit: number }) {
  const waitNow = useContext(ShownPageWait);
  const waitLate = useDeferredValue(waitNow);
  const wait = waitNow ?? waitLate;
  const page = wait === null ? pages.find((p) => p.id === current) : undefined;
  if (page) use(pageReady(page));
  return (
    <ShownPageWait value={wait}>
      <PageHost pages={pages} current={current} location={location} visit={visit} render={renderPage} />
    </ShownPageWait>
  );
}

/** Page views not drawn yet: still importing, or their Suspense fallback on screen (a headless run waits for none). */
export const viewsLoading = (): number => { const st = routerState(); return st.loading + st.fallbacks; };
const counted = new WeakMap<PageManifest, PageManifest>();
/** The manifests with each view load counted (copies: a manifest is never changed in place; one copy per manifest, so
 *  the view cache, keyed by the load function, sees one load per page). */
function countLoads(pages: readonly PageManifest[]): readonly PageManifest[] {
  return pages.map((p) => {
    let c = counted.get(p);
    if (!c) {
      // A whole-page hand-off (manifest `handoff`) loads the shell's Handoff view, never the page's own.
      const load = withPageHandoff(p).load;
      // Counted on the mount that asked (a load still running when its mount ended never touches the next one).
      c = { ...p, load: () => { const st = routerState(); st.loading++; return load().finally(() => { st.loading--; }); } };
      counted.set(p, c);
    }
    return c;
  });
}

/** After the first page drew, the nav pages' views load one by one in the background (the web's preloadOnIdle). */
function usePreload(pages: readonly PageManifest[], on: boolean): void {
  useEffect(() => {
    if (!on) return;
    const queue = pages.filter((p) => p.nav).sort((a, b) => a.nav!.order - b.nav!.order);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const next = () => {
      const p = queue.shift();
      if (!p) return;
      preloadPage(p);
      timer = setTimeout(next, 400);
      (timer as { unref?: () => void }).unref?.();
    };
    timer = setTimeout(next, 1500);
    (timer as { unref?: () => void }).unref?.();
    return () => { if (timer) clearTimeout(timer); };
  }, [pages, on]);
}

export type TermFrame = (pages: readonly PageManifest[], routed: ReactNode) => ReactNode;

export function buildTermRouter(pagesIn: readonly PageManifest[], o: { queryClient: QueryClient; history: RouterHistory; frame?: TermFrame; preload?: boolean }) {
  const pages = countLoads(pagesIn);
  function RoutedPages() {
    const location = useRouterState({ select: (s) => s.resolvedLocation ?? s.location });
    const current = useRouterState({ select: (s) => s.matches[s.matches.length - 1]?.staticData.pageId });
    const [entered, setEntered] = useState({ current, visit: 0 });
    if (entered.current !== current) setEntered({ current, visit: entered.visit + 1 });
    const visit = entered.current === current ? entered.visit : entered.visit + 1;
    const routed = useMemo(() => ({ current, location, visit }), [current, location, visit]);
    const drawn = useDeferredValue(routed);
    usePreload(pages, o.preload === true);
    return (
      <>
        <Suspense fallback={<Loading />}>
          <RouteVisit value={visit}>
            <DrawnPages pages={pages} current={drawn.current} location={drawn.location} visit={drawn.visit} />
          </RouteVisit>
        </Suspense>
        <Outlet />
        <HashAnchor hash={drawn.location.hash ?? ''} href={drawn.location.href} />
      </>
    );
  }
  const st = makeT(strings);
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    component: () => (o.frame ? o.frame(pages, <RoutedPages />) : <RoutedPages />),
    notFoundComponent: () => <Text colour="warn">{'! ' + st('notFound')}</Text>,
  });
  const home = pages.find((p) => p.id === 'home') ?? pages.find((p) => p.nav) ?? pages[0];
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: function IndexRoute() {
      const router = useRouter();
      useEffect(() => { if (home) void router.navigate({ href: home.path, replace: true } as never); }, [router]);
      return null;
    },
  });
  const pageRoutes = pages.map((page) =>
    createRoute({ getParentRoute: () => root, path: `${page.path}/$`, component: () => null, staticData: { pageId: page.id } }));
  return createRouter({
    routeTree: root.addChildren([index, ...pageRoutes]),
    history: o.history,
    // No page origin in a terminal: named here so the router never reads window for it.
    origin: 'http://hub.term',
    context: { queryClient: o.queryClient },
    parseSearch,
    stringifySearch,
  });
}

/** The longest a #hash navigation waits for its element to mount (a page's data may still be loading). */
export const HASH_WAIT_MS = 60_000;
/** After the jump, how long the content of the target's scroll must keep its size before the jump is done; until then
 *  the target is put back at the top whenever it changed (checked every HASH_ANCHOR_STEP_MS). */
export const HASH_ANCHOR_QUIET_MS = 500;
const HASH_ANCHOR_STEP_MS = 100;
/**
 * The web router's hash scroll, the terminal way (the router's own is off: history.ts forces it, it reads document):
 * after a navigation whose location has a #hash, the element with that DOM id is brought into view at the top of its
 * scroll, once: at once when it is mounted, else when it mounts (whenTermElementId); the focus moves there too (the
 * target when it is a control, else the first tab stop in or after it). The wait ends at the next
 * navigation, at the person's first key or focus move (a late jump never moves a page they are already using) or after HASH_WAIT_MS.
 * After the jump the target is held at the top while content still arrives (the web's scroll anchoring; a section that
 * mounts before the sections above it have their data was pushed off screen): put back whenever its scroll's content
 * changed size, until that stays the same HASH_ANCHOR_QUIET_MS, the person acts (a key, or focus moving outside the
 * target) or navigates.
 * A page that follows its own hash (Guide sections, FAQ items) keeps doing so; this is the fallback for a plain id.
 */
function HashAnchor({ hash, href }: { hash: string; href: string }): null {
  const focus = useFocusControl();
  // The person acting ends the wait: a key nothing focused took, or focus moving (prims only).
  const stopRef = useRef<((moved?: unknown) => void) | null>(null);
  useKeys(() => { stopRef.current?.(); return false; });
  useFocusedNode((node, how) => { if (how === 'asked') stopRef.current?.(node); });
  useEffect(() => {
    if (!hash) return;
    let stop: (() => void) | null = null;
    let cap: ReturnType<typeof setTimeout> | null = null;
    let jump: ReturnType<typeof setTimeout> | null = null;
    let hold: ReturnType<typeof setTimeout> | null = null;
    const end = (): void => { stop?.(); stop = null; if (cap) clearTimeout(cap); cap = null; stopRef.current = null; };
    const unhold = (): void => { if (jump) clearTimeout(jump); jump = null; if (hold) clearTimeout(hold); hold = null; stopRef.current = null; };
    type Target = { scrollIntoView?: (o: { block: string }) => void; __node?: () => unknown };
    // Hold the target at the top: re-align it whenever the content of its scroll changed size since the last look (a
    // target pushed off screen reports no position of its own), done once that stays the same HASH_ANCHOR_QUIET_MS.
    const keep = (go: Target): void => {
      const box = (): { scrollHeight?: number } | null => {
        for (let p = (go.__node?.() as { parent?: unknown } | null)?.parent as { parent?: unknown; scrollChildIntoView?: unknown } | null; p; p = (p.parent ?? null) as typeof p) if (typeof p.scrollChildIntoView === 'function') return p as { scrollHeight?: number };
        return null;
      };
      const size = (): number | null => { const h = box()?.scrollHeight; return typeof h === 'number' && Number.isFinite(h) ? h : null; };
      const inside = (n: unknown): boolean => { const t = go.__node?.(); for (let p = n as { parent?: unknown } | null; p; p = (p.parent ?? null) as typeof p) if (p === t) return true; return false; };
      let last = size();
      let still = 0;
      let left = Math.ceil(HASH_WAIT_MS / HASH_ANCHOR_STEP_MS);
      const tick = (): void => {
        hold = null;
        const h = size();
        if (h === null || --left <= 0) return unhold();
        if (h !== last) { go.scrollIntoView?.({ block: 'start' }); last = h; still = 0; }
        else if ((still += HASH_ANCHOR_STEP_MS) >= HASH_ANCHOR_QUIET_MS) return unhold();
        hold = setTimeout(tick, HASH_ANCHOR_STEP_MS);
      };
      hold = setTimeout(tick, HASH_ANCHOR_STEP_MS);
      // The jump's own focus move (the target, or none: focusFrom) is not the person acting.
      stopRef.current = (moved?: unknown) => { if (moved === undefined || (moved !== null && !inside(moved))) unhold(); };
    };
    // After this commit's layout: the element is laid out before its scroll asks where it is.
    const start = setTimeout(() => {
      stop = whenTermElementId(hash, (el) => {
        end();
        const go = el as Target;
        jump = setTimeout(() => {
          jump = null;
          go.scrollIntoView?.({ block: 'start' });
          // The web moves the sequential-focus start to the target: focus it when it is a control, else the first tab
          // stop in or after it once the scroll is laid out (focusFrom), never leaving the focus on the link off screen.
          if (!focus.focusDomId(hash)) { const n = go.__node?.(); if (n) focus.focusFrom(n as Parameters<typeof focus.focusFrom>[0]); }
          keep(go);
        }, 0);
      });
    }, 0);
    cap = setTimeout(end, HASH_WAIT_MS);
    (cap as { unref?: () => void }).unref?.();
    stopRef.current = () => { clearTimeout(start); end(); };
    return () => { clearTimeout(start); end(); unhold(); };
  }, [hash, href]);
  return null;
}
