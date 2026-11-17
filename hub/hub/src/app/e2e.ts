// Playwright helpers for page.spec.ts. The hub:check / hub:shots scripts start a fixtures-mode
// dev server and pass its URL as HUB_BASE_URL.
import { devices, expect, test as playwrightTest, type Browser, type BrowserContext, type Page } from '@playwright/test';
// The search proofs every list page's @search and @reload tests call (e2e-search.ts).
export { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, type ReloadProof, type SearchKind, type SearchProof, type SearchView } from './e2e-search';

declare const process: { env: Record<string, string | undefined> };

export interface GotoOptions {
  /** Fixture state. */
  state?: string;
  theme?: 'light' | 'dark';
  latency?: 'instant' | 'normal' | 'slow' | 'late';
}

export function hubUrl(path: string, opts: GotoOptions = {}): string {
  const base = process.env.HUB_BASE_URL ?? 'http://127.0.0.1:5173';
  const q = new URLSearchParams({ fxbar: '0', fxl: opts.latency ?? 'instant', theme: opts.theme ?? 'light' });
  if (opts.state) q.set('fx', opts.state);
  return `${base}/?${q.toString()}#${path}`;
}

/** Open a hash path of the Hub in a fixture state and wait for the shell. */
export async function gotoHub(page: Page, path: string, opts: GotoOptions = {}): Promise<void> {
  await page.goto(hubUrl(path, opts));
  await page.locator('#hub-main').waitFor();
}

// Shared pages. A page.goto boots the whole app again (about 250 modules), and a new browser context per test has no
// cache to help it: measured on a warm dev server, the first boot takes about 8 s and a repeat on the same page about
// 1 s. A spec that checks layout at several widths takes `hubPage` (desktop) or `hubPageCoarse` (touch, mobile) from
// this `test` instead of `page`: one context and one page per worker, lent to one test at a time.
//
// The contract is narrow, and the fixture enforces it. At each lend it (1) navigates to about:blank first, which ends the
// old document with its timers and IndexedDB connections, and fails unless the page is there; (2) wipes the Hub origin
// (storage of every kind, service workers and caches included, through the browser's own storage domain, so Chromium
// only), the cookies and the permissions, then reads back the origin's quota usage, its local and session storage from an empty same-origin page, and the cookies, and fails if anything is left;
// (3) resets the viewport and the emulated media; (4) drops every route and every event listener a test added. It fails, never skips, when the context holds
// a second page or a cleanup step cannot be confirmed. Every Hub document a test opens is therefore one it loaded
// itself, after the blank page. What cannot be undone is refused up front: init scripts, exposed bindings and
// functions, geolocation and permission grants (the scan in e2e.contract.test.ts keeps them out of every spec that takes
// these fixtures), and video (the context is the worker's, so the failure video of a test would be missing: it fails when
// the project records video). Trace and screenshots on failure work as for `page`. Set the width with page.setViewportSize.
// A test that needs anything else keeps the built-in `page`.
const DESKTOP = { width: 1440, height: 900 };
const COARSE = { width: 390, height: 900 };
type Viewport = { width: number; height: number };

async function sharedContext(browser: Browser, options: Parameters<Browser['newContext']>[0]): Promise<{ context: BrowserContext; page: Page }> {
  if (browser.browserType().name() !== 'chromium') throw new Error('shared Hub pages clear their storage through the Chromium storage domain: use `page` on another browser');
  const context = await browser.newContext(options);
  try {
    return { context, page: await context.newPage() };
  } catch (e) {
    await context.close();
    throw e;
  }
}

// Listeners a borrower adds (page.on('dialog'), context.on('page'), ...) outlive its test on a shared page. The lend
// records what each emitter holds once it is clean and, when the borrower is done, removes whatever was added since,
// never what was there: the runner's own listeners stay. The emitters are the same Node-style objects Playwright's
// client uses, whose listener list the public types leave out.
type Listener = (...args: never[]) => unknown;
interface Emitter {
  eventNames(): (string | symbol)[];
  rawListeners(event: string | symbol): Listener[];
  removeListener(event: string | symbol, listener: Listener): unknown;
}
type Listeners = Map<string | symbol, Listener[]>;
const heldAtLend = new WeakMap<object, Listeners>();

const listenersOf = (e: Emitter): Listeners => new Map(e.eventNames().map((name) => [name, e.rawListeners(name)]));

function restoreListeners(target: object, what: string): void {
  const was = heldAtLend.get(target);
  if (!was) return;
  const e = target as Emitter;
  for (const name of e.eventNames()) {
    for (const fn of e.rawListeners(name)) if (!(was.get(name) ?? []).includes(fn)) e.removeListener(name, fn);
  }
  const now = listenersOf(e);
  const names = new Set([...now.keys(), ...was.keys()]);
  for (const name of names) {
    const a = now.get(name) ?? [];
    const b = was.get(name) ?? [];
    if (a.length !== b.length || a.some((fn, i) => fn !== b[i])) throw new Error(`a shared Hub ${what} kept ${a.length} listener(s) for '${String(name)}' (it held ${b.length}) after the cleanup`);
  }
}

/** The state a new context would have, or a thrown error: nothing here is caught and ignored. */
async function clean(page: Page, viewport: Viewport): Promise<void> {
  const context = page.context();
  restoreListeners(page, 'page');
  restoreListeners(context, 'context');
  if (context.pages().length !== 1) throw new Error(`a shared Hub page must be its context's only page, found ${context.pages().length}`);
  // First: the old document, its timers and its database connections are gone before anything is wiped.
  await page.goto('about:blank');
  if (page.url() !== 'about:blank') throw new Error(`a shared Hub page did not reach about:blank (at ${page.url()})`);
  await context.unrouteAll({ behavior: 'wait' });
  await page.unrouteAll({ behavior: 'wait' });
  await page.emulateMedia({ media: null, colorScheme: null, reducedMotion: null });
  const origin = new URL(hubUrl('/')).origin;
  const cdp = await context.newCDPSession(page);
  let used: { storageType: string; usage: number }[];
  try {
    await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
    used = (await cdp.send('Storage.getUsageAndQuota', { origin })).usageBreakdown.filter((u) => u.usage > 0);
  } finally {
    await cdp.detach();
  }
  await context.clearCookies();
  await context.clearPermissions();
  const cookies = await context.cookies();
  // The quota read above has no local or session storage: read both (and IndexedDB again) from inside a same-origin
  // document. A fulfilled empty page, so nothing of the app boots and nothing leaves the browser.
  const probe = `${origin}/__hub-clean-probe`;
  await page.route(probe, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>clean</title>' }));
  let dom: { local: number; session: number; databases: number };
  try {
    await page.goto(probe);
    dom = await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: (await indexedDB.databases()).length }));
  } finally {
    await page.unroute(probe);
  }
  await page.goto('about:blank');
  if (page.url() !== 'about:blank') throw new Error(`a shared Hub page did not return to about:blank (at ${page.url()})`);
  const left = [
    ...used.map((u) => u.storageType),
    ...(dom.local > 0 ? ['local storage'] : []),
    ...(dom.session > 0 ? ['session storage'] : []),
    ...(dom.databases > 0 ? ['indexeddb'] : []),
  ];
  if (cookies.length > 0 || left.length > 0) {
    throw new Error(`a shared Hub page kept state across tests: ${cookies.length} cookie(s), ${left.join(', ') || 'no storage'}`);
  }
  await page.setViewportSize(viewport);
  heldAtLend.set(page, listenersOf(page as unknown as Emitter));
  heldAtLend.set(context, listenersOf(context as unknown as Emitter));
}

type Lend = (give: (page: Page) => Promise<void>) => Promise<void>;
const lend = (page: Page, viewport: Viewport, video: unknown): Lend => async (give) => {
  const mode = typeof video === 'object' && video !== null ? (video as { mode?: string }).mode : video;
  if (mode !== undefined && mode !== 'off') throw new Error('shared pages record no video: take `page`');
  await clean(page, viewport);
  try {
    await give(page);
  } finally {
    restoreListeners(page, 'page');
    restoreListeners(page.context(), 'context');
  }
};

const NO_SIDE_SCROLL = '#hub-main does not scroll sideways (Infinity: there is no #hub-main)';

/**
 * The page does not scroll sideways. It scrolls in #hub-main (shell/AppShell.module.css), under an `overflow: clip`, so
 * `document.documentElement` can never overflow: read this box, never that one. No #hub-main fails: a check with nothing
 * to read must not pass.
 */
export async function noSideScroll(page: Page, opts: { timeout?: number } = {}): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const main = document.getElementById('hub-main');
          return main ? main.scrollWidth - main.clientWidth : Infinity;
        }),
      { message: NO_SIDE_SCROLL, ...opts },
    )
    .toBeLessThanOrEqual(1);
}

export const test = playwrightTest.extend<{ hubPage: Page; hubPageCoarse: Page }, { sharedDesktop: Page; sharedCoarse: Page }>({
  sharedDesktop: [
    async ({ browser }, use) => {
      const { context, page } = await sharedContext(browser, { ...devices['Desktop Chrome'], viewport: DESKTOP });
      await use(page);
      await context.close();
    },
    { scope: 'worker' },
  ],
  sharedCoarse: [
    async ({ browser }, use) => {
      const { context, page } = await sharedContext(browser, { ...devices['Desktop Chrome'], viewport: COARSE, hasTouch: true, isMobile: true });
      await use(page);
      await context.close();
    },
    { scope: 'worker' },
  ],
  hubPage: async ({ sharedDesktop }, use, testInfo) => lend(sharedDesktop, DESKTOP, testInfo.project.use.video)(use),
  hubPageCoarse: async ({ sharedCoarse }, use, testInfo) => lend(sharedCoarse, COARSE, testInfo.project.use.video)(use),
});
