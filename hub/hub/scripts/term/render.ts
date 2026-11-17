// Headless render of the terminal Hub (fixture flavour): one page at one fixture state to a frame of text.
//   import { renderPage } from './render';
//   const r = await renderPage({ page: 'schedules', fx: null, cols: 120, rows: 40 });
//   console.log(r.frame);
// The session it returns keeps running (keys, mouse, more frames) until close().
// FIRST, before any other import and any await: the terminal host env is installed before core (or anything that
// reads host-env) evaluates, whichever runner imports this file and whatever it imported before.
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import '../../src/term/env/preinstall';
import path from 'node:path';
import { FIXTURE_WEB_ORIGIN } from './fixture-origin';
import { SRC } from './resolve';
import { crashShown } from './crash-shown';
import type { Diagnostic } from '../../src/term/app/diagnostic';
// Types only (erased): the modules themselves are loaded later, through the terminal loader, after the host env.
import type { CliRenderer } from '@opentui/core';
import type { QueryClient } from '@tanstack/react-query';
import type * as TSession from '../../src/term/env/session';
import type * as TPages from '../../src/app/pages';
import type * as TBoot from '../../src/term/app/boot';
import type * as TDispose from '../../src/core/dispose';
import type * as TToastStore from '../../src/kit/states/Toast.store';
import type * as TAsk from '../../src/kit/ask';
import type * as TApp from '../../src/term/app/App';
import type * as TRouter from '../../src/term/app/router';
import type * as TPlaceholder from '../../src/term/placeholder';
import type * as TStyle from '../../src/term/jsx/style';
import type * as TCssTable from '../../src/term/jsx/css-table';
import type * as TDom from '../../src/term/jsx/dom';
import type * as TElement from '../../src/term/jsx/element';
import type * as TTesting from '../../src/term/prim/testing';
import type * as TStrictGlobals from '../../src/term/env/strict-globals';
import type * as TSafe from '../../src/term/prim/safe';
import type * as TSemantics from '../../src/term/prim/semantics';
import type * as TLayoutcheck from '../../src/term/prim/layoutcheck';
import type * as TSecretScreenCtx from '../../src/term/app/secret-screen-ctx';
import type * as TReact from 'react';
import { installStyleTable } from './style-table';
import { installTermLoader, loadRecords, type LoadRecord } from './loader';
import { holdFixtureClock, reseedRandom } from './clock';
import { HELD_SITES, idleState, pendingText, releaseHeldTimers, resetTimerLedger, trackTimers, whenIdle, type IdleState } from '../../src/term/app/idle';

// Before anything imports react: its scheduler keeps the setImmediate it finds (src/term/app/idle.ts). Long Hub
// timers are held: a slow fixture answer or a toast's dismissal never races the frame (release with releaseHeld()).
// TERM_HOLD_LONG=0 turns holding off (to compare frames with and without it).
const realTimers = trackTimers({ holdLong: process.env.TERM_HOLD_LONG !== '0' });

// A click holds the fixture answers until what the click itself did is drawn (click() below). The fixtures wait for
// an answer's latency on a timer (HELD_SITES); such a timer that comes due while held is kept, in the order it came
// due, and runs at the release. Set under the ledger (its real timer functions, read at each call), so the ledger
// still sees the Hub's own call site and still counts the timer until it has run.
const rawSetTimeout = realTimers.setTimeout;
const rawClearTimeout = realTimers.clearTimeout;
let heldAnswers: Map<unknown, () => void> | null = null;
realTimers.setTimeout = ((fn: (...a: unknown[]) => void, ms?: number, ...a: unknown[]) => {
  const site = typeof fn === 'function' ? (new Error().stack ?? '').split('\n').slice(1, 7).join('\n') : '';
  if (!site || !HELD_SITES.some((re) => re.test(site))) return rawSetTimeout(fn as never, ms, ...a);
  const id: unknown = rawSetTimeout(((...b: unknown[]) => { if (heldAnswers) heldAnswers.set(id, () => { fn(...b); }); else fn(...b); }) as never, ms, ...a);
  return id;
}) as unknown as typeof setTimeout;
realTimers.clearTimeout = ((id: unknown) => { heldAnswers?.delete(id); rawClearTimeout(id as never); }) as typeof clearTimeout;
function holdAnswers(): void { heldAnswers ??= new Map(); }
function releaseAnswers(): void {
  const held = heldAnswers;
  heldAnswers = null;
  if (held) for (const run of held.values()) run();
}

export interface RenderPageOptions {
  page: string;
  /** Fixture state name; null or absent is the page's default state. */
  fx?: string | null;
  cols?: number;
  rows?: number;
  /** A Hub path with its search; default is the page's own path. */
  path?: string;
  /** The page alone, without the shell. */
  bare?: boolean;
  /** false: no class styles (the CSS translator's table is not installed). Default on. */
  css?: boolean;
  /** Stop waiting for the page to settle after this long (ms). */
  settleMs?: number;
  /** The strict DOM-global traps, ON by default as in a live mount (a page that reads `document` crashes there, so it
   *  must not draw here). Hits are in `session.traps` / `session.trapsAt`, and any hit fails the session (exitCodeOf;
   *  goldens). Installed once per process after boot (import-time probes are past). `false` only for the build's
   *  measure run, which draws no frame anyone judges. In the term test preload, the trap journal and expectTraps()
   *  decide, as for every test. */
  strictGlobals?: boolean;
  /** The web Hub origin the host gives (hand-offs build their link from it). Default FIXTURE_WEB_ORIGIN; null = none
   *  (the form a host with no web origin gets). */
  webOrigin?: string | null;
  /** The host's browser opener for this render (TermHostServices.openExternal): a test records what the page hands
   *  outside the Hub, whole. Default none (openOutside then copies and shows the address). */
  openExternal?: (url: string) => void;
  /** Runs after the fixture boot, before the app is built (demo-record.ts wraps the transport here). */
  afterBoot?: () => void | Promise<void>;
  /** What the screen allows a secret field (src/term/app/secret-screen-ctx.ts), asked at each press. Default: the test
   *  renderer's (everything allowed: a headless frame reaches no terminal). A test proving a refusal passes its own. */
  secretScreen?: () => { readonly reveal: boolean; readonly copy: boolean };
}

export interface PlaceholderUseRow { name: string; file: string; count: number; importer?: string }
export interface PlaceholderReport {
  modules: { file: string; reason: string }[];
  /** Placeholder components drawn. */
  rendered: PlaceholderUseRow[];
  /** TERM_UNSUPPORTED throws: a missing non-visual export was used. */
  unsupported: PlaceholderUseRow[];
  /** Allowance-list holes used (scripts/term/placeholder.allow.json): a page with any is never accepted. */
  allowed: PlaceholderUseRow[];
  /** Old name of `allowed`. */
  touched: PlaceholderUseRow[];
}

export interface PageSession {
  frame: string;
  placeholders: PlaceholderReport;
  failures: { page: string; message: string; where?: string }[];
  /** console.error text while rendering (React warnings, caught errors). */
  errors: string[];
  /** Strict-global trap hits while rendering (strictGlobals option): global names, in order of first hit. */
  traps: string[];
  /** Each trap hit with the hub/src line that made it (`document at src/kit/x.ts:12:3`), in order of first hit. */
  trapsAt: string[];
  /** True when the app went idle and the frame then stood still before the deadline (a page that never settles still
   *  returns its last frame). */
  settled: boolean;
  /** What was still under way at the last settle (empty lists when settled). */
  pending: IdleState;
  /** One line naming `pending` (the unsettled failure's text). */
  pendingText: string;
  /** Element members asked through refs and refused (TERM_DOM_MEMBER), and tags with no row in the tag table. */
  dom: { refused: Record<string, number>; unknownTags: Record<string, number>; refusedHtml: number };
  /** Classes used whose translated style is approximate or missing (the page's degradation report). */
  styles: { partial: string[]; untranslatable: string[]; unknownColours: string[] };
  loaded: readonly LoadRecord[];
  keys: { press(name: string, mods?: { shift?: boolean; ctrl?: boolean }): Promise<void>; type(text: string): Promise<void> };
  click(x: number, y: number): Promise<void>;
  /** Moves the pointer to a cell, no button held. */
  move(x: number, y: number): Promise<void>;
  resize(cols: number, rows: number): Promise<void>;
  /** Renders until nothing changes, then returns the frame. */
  settle(): Promise<string>;
  /** Fires the held long timers (slow answers, dismissals) and settles again. */
  releaseHeld(): Promise<string>;
  /** Milliseconds of the first draw: fixture boot, app build, mount (renderer + first React render), settle loop. */
  timing: { boot: number; app: number; mount: number; settle: number; settleFrames: number };
  /** The test renderer (semantics, layout checks). Valid until close(). */
  renderer: CliRenderer;
  close(): void;
}

/** Key names `keys.press` knows beyond tab, enter, escape and the arrows, as the engine's mock keyboard takes them: one
 *  of its own key names (upper case) or the bytes a terminal sends. */
const PRESS_NAMES: Readonly<Record<string, string>> = {
  return: 'RETURN', backspace: 'BACKSPACE', delete: 'DELETE', home: 'HOME', end: 'END', space: ' ',
  pageup: '\x1b[5~', pagedown: '\x1b[6~',
  f1: 'F1', f2: 'F2', f3: 'F3', f4: 'F4', f5: 'F5', f6: 'F6', f7: 'F7', f8: 'F8', f9: 'F9', f10: 'F10', f11: 'F11', f12: 'F12',
};
const ENGINE_NAMES = new Set(Object.values(PRESS_NAMES).filter((v) => /^[A-Z][A-Z0-9]+$/.test(v)));
/**
 * What the engine's mock keyboard is given for `keys.press(name)`: one character, a raw escape sequence and an engine
 * key name (HOME, F6; shot-replay.ts passes these) go as they are; a known name (pageup, home, backspace, return, ...)
 * is translated. Any other word is refused: the engine TYPES a name it does not know, letter by letter, so
 * press('pageup') typed "pageup" (scrolling nothing, and "g" and "e" ran the shell's shortcuts).
 */
export function mockKeyOf(name: string): string {
  if ([...name].length === 1 || name.startsWith('\x1b') || ENGINE_NAMES.has(name)) return name;
  const known = PRESS_NAMES[name.toLowerCase()];
  if (known) return known;
  throw new Error(`TERM_KEY_UNKNOWN: keys.press(${JSON.stringify(name)}): not a key name (use keys.type for text); known: tab, enter, escape, up, down, left, right, ${Object.keys(PRESS_NAMES).join(', ')}`);
}

const src = (p: string) => path.join(SRC, p);
let booted = false;
/** Still frames, AFTER the app is idle (src/term/app/idle.ts), for a frame to count as settled. TERM_SETTLE_STILL
 *  overrides it; goldens' identity check (scripts/term/goldens-identity.ts) proves a value draws the same frames. */
const STILL = Math.max(1, Number(process.env.TERM_SETTLE_STILL ?? 3) || 3);
let strict: { ledger(): readonly { name: string }[]; clear(): void } | null = null;

// WebCrypto answers from its own thread, outside the timer ledger (idle.ts): a page waiting on it (the vault's password
// decrypt) looked idle and settle returned "Opening…". Every SubtleCrypto call is counted while in
// flight; settle is busy while one is.
const SUBTLE = ['encrypt', 'decrypt', 'sign', 'verify', 'digest', 'generateKey', 'deriveKey', 'deriveBits', 'importKey', 'exportKey', 'wrapKey', 'unwrapKey'] as const;
let cryptoInFlight = 0;
const trackedSubtle = new WeakSet<object>();
// A card, tile view or top-bar part another page contributes is imported when it is first drawn (React.lazy over the
// manifest's `load`), behind a Suspense fallback no query or timer of the Hub stands for. While the import ran, and
// then while React held the fallback it had just shown (it keeps one up to 300 ms before it shows the content, on a
// timer of its own), the app looked idle, and a slow host settled on the fallback (Home's "Your computer" card as
// "Loading…"). Each manifest's `load` is counted while in flight; settle is busy while one is, and for React's hold
// after the last one answered.
type Loads = { load: () => Promise<unknown> };
type ContributingPage = { widgets?: Loads[]; tileViews?: Loads[]; topBar?: Loads };
/** React's hold of a fallback it has shown (its FALLBACK_THROTTLE_MS is 300), with room for the commit after it. */
const FALLBACK_HOLD_MS = 350;
let contributionLoads = 0;
let contributionAnsweredAt = -Infinity;
const countedLoads = new WeakSet<object>();
function countContributionLoads(pages: readonly ContributingPage[]): void {
  for (const p of pages) {
    for (const c of [...(p.widgets ?? []), ...(p.tileViews ?? []), ...(p.topBar ? [p.topBar] : [])]) {
      if (countedLoads.has(c)) continue;
      countedLoads.add(c);
      const load = c.load;
      c.load = () => {
        contributionLoads++;
        const done = (): void => { contributionLoads--; contributionAnsweredAt = performance.now(); };
        const r = load();
        r.then(done, done);
        return r;
      };
    }
  }
}
const contributionsBusy = (): string | null =>
  contributionLoads ? `${contributionLoads} contributed part(s) importing` : performance.now() - contributionAnsweredAt < FALLBACK_HOLD_MS ? 'a contributed part just imported (its fallback may still be up)' : null;

/** Counts the SubtleCrypto operations in flight (globalThis.crypto.subtle, wrapped once). */
export function webCryptoInFlight(): number {
  const subtle = (globalThis as { crypto?: { subtle?: object } }).crypto?.subtle as Record<string, unknown> | undefined;
  if (subtle && !trackedSubtle.has(subtle)) {
    trackedSubtle.add(subtle);
    for (const m of SUBTLE) {
      const f = subtle[m];
      if (typeof f !== 'function') continue;
      Object.defineProperty(subtle, m, {
        configurable: true, writable: true,
        value: (...a: unknown[]): Promise<unknown> => {
          cryptoInFlight++;
          let p: unknown;
          try { p = (f as (...x: unknown[]) => unknown).apply(subtle, a); } catch (e) { cryptoInFlight--; throw e; }
          return Promise.resolve(p).finally(() => { cryptoInFlight--; });
        },
      });
    }
  }
  return cryptoInFlight;
}

/** React's own act() warnings, by their exact text (a test-environment note, not a page fault). Anything else that
 *  merely mentions act( is a console error like any other. */
export const ACT_WARNING = /^(An update to .+ inside a test was not wrapped in act\(\.\.\.\)|A suspended resource finished loading inside a test, but the event was not wrapped in act\(\.\.\.\)|The current testing environment is not configured to support act\(\.\.\.\))/;

/** The last closed render's core teardown (close() starts it; the next render waits for it before it boots). */
let coreEnding: Promise<void> = Promise.resolve();

export async function renderPage(o: RenderPageOptions): Promise<PageSession> {
  // Fixture frames are drawn on the fixture clock, whoever calls (clock.ts), before any Hub module loads. The session
  // holds it until close(): the real clock comes back after the last session unless a runner pinned it (fixtureClock).
  const releaseClock = holdFixtureClock();
  installTermLoader({ flavour: 'fixture', fixtures: true });
  const errors: string[] = [];
  const realError = console.error;
  const realWarn = console.warn;
  const line = (a: unknown[]): string => a.map((x) => (x instanceof Error ? x.message : String(x))).join(' ').split('\n')[0]!;
  console.error = (...a: unknown[]) => { errors.push(line(a)); };
  // Warnings count as console errors too (prefixed): a page that warns while drawing is not clean.
  console.warn = (...a: unknown[]) => { errors.push('warning: ' + line(a)); };
  let session0: { end(): void } | null = null;
  try {
    const sessionMod = await import(src('term/env/session.ts')) as typeof TSession;
    const core = await import(src('core/index.ts')) as { queryClient: QueryClient };
    const { discoverPages, visiblePages } = await import(src('app/pages.ts')) as typeof TPages;
    const { bootTermFixtures } = await import(src('term/app/boot.ts')) as typeof TBoot;
    const { disposeCoreSession } = await import(src('core/dispose.ts')) as typeof TDispose;
    await coreEnding;
    // The app has one toast queue (kit Toast.store): a toast the last render left open would be drawn over this one.
    const toasts = (await import(src('kit/states/Toast.store.ts')) as typeof TToastStore).toastQueue();
    while (toasts.visibleToasts.length > 0) toasts.close(toasts.visibleToasts[0]!.key);
    // The Ask dock's store caches what it read from the last session's storage (open, width): forgotten too, so a
    // golden case never starts with the dock the case before it opened (the test preload does the same after each test).
    (await import(src('kit/ask.ts')) as typeof TAsk).resetAskForTests();
    const { createTermApp } = await import(src('term/app/App.tsx')) as typeof TApp;
    const { pageFailures, viewsLoading } = await import(src('term/app/router.tsx')) as typeof TRouter;
    const ph = await import(src('term/placeholder.ts')) as typeof TPlaceholder;
    if (o.css !== false) await installStyleTable(o.cols ?? 120);
    else (await import(src('term/jsx/style.ts')) as typeof TStyle).setStyleTable(null);
    const cssLedger = await import(src('term/jsx/css-table.ts')) as typeof TCssTable;
    const domMod = await import(src('term/jsx/dom.ts')) as typeof TDom;
    const elMod = await import(src('term/jsx/element.ts')) as typeof TElement;
    domMod.clearDomLedger();
    elMod.clearDomRefusals();
    const styleSeam = await import(src('term/jsx/style.ts')) as typeof TStyle;
    cssLedger.clearStyleLedger();
    const { testRender } = await import(src('term/prim/testing.ts')) as typeof TTesting;

    const all = discoverPages().pages;
    const pages = visiblePages(all, { preview: true, only: '*', fixtures: false });
    countContributionLoads(all as unknown as readonly ContributingPage[]);
    const page = pages.find((p) => p.id === o.page);
    if (!page) throw new Error(`TERM_NO_PAGE: ${o.page} (have: ${pages.map((p) => p.id).join(', ')})`);
    // A --path the page's route does not own would draw another page (the router falls back to Home) and pass silently.
    if (o.path !== undefined) { const bad = badPagePath(o.path, page.path); if (bad) throw new Error(`TERM_BAD_PATH: ${bad}`); }
    if (booted) core.queryClient.clear();
    booted = true;
    resetTimerLedger();
    reseedRandom();
    const tm0 = performance.now();
    // The host session (stores, vault, locks) of this render, ended by close(): the same order as app/lifecycle.ts.
    session0 = sessionMod.beginTermSession({ ...(o.webOrigin === null ? {} : { webOrigin: o.webOrigin ?? FIXTURE_WEB_ORIGIN }), ...(o.openExternal ? { openExternal: o.openExternal } : {}) });
    await bootTermFixtures({ pageIds: pages.map((p) => p.id), page: page.id, fx: o.fx ?? null });
    await o.afterBoot?.();
    const tmBoot = performance.now();
    ph.clearPlaceholderUses();
    const failuresBefore = pageFailures().length;

    if (o.strictGlobals !== false && !strict) {
      const sg = await import(src('term/env/strict-globals.ts')) as typeof TStrictGlobals;
      // TanStack Query's focus/online managers listen on window once `window` exists (it does once trapped): the
      // terminal has neither event, so they get no listener (the app's boot must do the same).
      // Resolved from hub/src so it is the instance the Hub uses.
      const qc = await import(Bun.resolveSync('@tanstack/query-core', SRC)) as { focusManager: { setEventListener(f: () => undefined): void }; onlineManager: { setEventListener(f: () => undefined): void } };
      qc.focusManager.setEventListener(() => undefined);
      qc.onlineManager.setEventListener(() => undefined);
      // Default mode (constructors throw too), as the ship process; a process that already has them (test preload) keeps its own.
      strict = sg.activeStrictGlobals() ?? sg.installStrictGlobals();
    }
    strict?.clear();
    const app = createTermApp({ pages, queryClient: core.queryClient, path: o.path ?? page.path, onQuit: () => {}, bare: o.bare });
    let element = app.element;
    if (o.secretScreen) {
      // Inside the test renderer's own provider, so this one answers. React and the context resolved from hub/src: the
      // instances the Hub uses.
      const { createElement } = await import(Bun.resolveSync('react', SRC)) as typeof TReact;
      const { SecretScreenCtx } = await import(src('term/app/secret-screen-ctx.ts')) as typeof TSecretScreenCtx;
      element = createElement(SecretScreenCtx.Provider, { value: o.secretScreen }, element);
    }
    const tmApp = performance.now();
    const t = await testRender(element, { width: o.cols ?? 120, height: o.rows ?? 40 });
    const tmMount = performance.now();
    // Query results and lazy views update the tree outside act(): that is what this runner waits for, not a mistake.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    let settled = false;
    let settleFrames = 0;
    let pending: IdleState = idleState(core.queryClient);
    const settle = async (): Promise<string> => {
      // A page still importing its modules (a lazy view) is not settled: the module count is part of the frame.
      const r = await whenIdle({
        queryClient: core.queryClient,
        views: viewsLoading,
        still: STILL,
        // Settling ends as soon as the app is idle; the deadline only bounds a case that never is (loaded hosts render
        // a big page for seconds).
        deadlineMs: o.settleMs ?? 20000,
        frame: async () => { await t.renderOnce(); return t.captureCharFrame() + '\0' + loadRecords().length; },
        // A lone ESC waits in the input parser until its timeout says it is the Escape key, not a sequence's start.
        busy: () => ((t.renderer as unknown as { stdinParser?: { pending?: { length: number } } | null }).stdinParser?.pending?.length ? 'input parser holding bytes (a lone ESC)' : webCryptoInFlight() ? `${webCryptoInFlight()} WebCrypto operation(s) in flight` : contributionsBusy()),
      });
      settleFrames += r.frames;
      settled = r.settled;
      pending = r.pending;
      return r.frame.slice(0, r.frame.lastIndexOf('\0'));
    };
    // Frames while fixture answers are held: until what an input itself started is drawn (STILL equal frames with
    // nothing under way but the held answers), bounded. Never the frame a case is judged by.
    const settleHeld = async (): Promise<void> => {
      const until = performance.now() + 2000;
      let last: string | null = null;
      let same = 0;
      while (performance.now() < until) {
        await t.renderOnce();
        const f = t.captureCharFrame();
        const st = idleState(core.queryClient, viewsLoading());
        const quiet = st.views === 0 && st.immediates === 0 && st.measuring === 0 && st.timers.length <= (heldAnswers?.size ?? 0);
        same = quiet && f === last ? same + 1 : 0;
        last = f;
        settleFrames++;
        if (same >= STILL) return;
        await new Promise((r) => rawSetTimeout(r, quiet ? 5 : 20));
      }
    };
    const firstFrame = await settle();
    const tmSettled = performance.now();
    const session: PageSession = {
      frame: firstFrame,
      timing: { boot: Math.round(tmBoot - tm0), app: Math.round(tmApp - tmBoot), mount: Math.round(tmMount - tmApp), settle: Math.round(tmSettled - tmMount), settleFrames },
      get placeholders() { const l = ph.placeholderLedger(); return { modules: l.modules.map((m) => ({ file: m.file, reason: m.reason })), rendered: l.rendered, unsupported: l.unsupported, allowed: l.allowed, touched: l.allowed }; },
      get failures() { return pageFailures().slice(failuresBefore).map((f) => ({ page: f.page, message: f.error instanceof Error ? (f.error.stack ?? f.error.message) : typeof f.error === 'object' && f.error && 'code' in f.error ? recordLine(f.error as Diagnostic) : String(f.error), ...(f.where ? { where: f.where } : {}) })); },
      errors,
      get styles() { return cssLedger.styleLedger(); },
      get traps() { return [...new Set((strict?.ledger() ?? []).map((x) => x.name))]; },
      get trapsAt() { return [...new Set((strict?.ledger() ?? []).map((x) => `${x.name} at ${trapSource((x as { stack?: string }).stack ?? '')}`))]; },
      get settled() { return settled; },
      get pending() { return pending; },
      get pendingText() { return pendingText(pending); },
      get dom() { const d = domMod.domLedger(); return { refused: elMod.domRefusals(), unknownTags: d.unknownTags, refusedHtml: d.refusedHtml }; },
      loaded: loadRecords(),
      keys: {
        async press(name, mods) {
          const k = t.mockInput;
          if (name === 'tab') k.pressTab(mods); else if (name === 'enter') k.pressEnter(mods); else if (name === 'escape') k.pressEscape(mods);
          else if (name === 'up' || name === 'down' || name === 'left' || name === 'right') k.pressArrow(name, mods);
          else k.pressKey(mockKeyOf(name), mods);
          session.frame = await settle();
        },
        async type(text) { await t.mockInput.typeText(text); session.frame = await settle(); },
      },
      // A click as a person makes it: the button goes down, frames are drawn, it comes up, frames are drawn, and only
      // then does anything the click asked for answer. The engine's own click waits 10 ms after each half with nothing
      // drawn, and a frame gives the timers a turn before it paints: what the press started (a field giving up the
      // focus, the answer a choice or a save asks for) was laid out before or after the frame that settles a scroll the
      // focus asked for, by the host's load, and that scroll ended rows apart. So the fixture answers are held until
      // both halves are drawn.
      async click(x, y) {
        holdAnswers();
        try {
          await t.mockMouse.pressDown(x, y);
          await settleHeld();
          await t.mockMouse.release(x, y);
          await settleHeld();
        } finally {
          releaseAnswers();
        }
        session.frame = await settle();
      },
      async move(x, y) { await t.mockMouse.moveTo(x, y); session.frame = await settle(); },
      async resize(cols, rows) { styleSeam.setStyleWidth(cols); t.resize(cols, rows); session.frame = await settle(); },
      settle: async () => (session.frame = await settle()),
      releaseHeld: async () => { releaseHeldTimers(); return (session.frame = await settle()); },
      renderer: t.renderer as never,
      close() { strict?.clear(); console.error = realError; console.warn = realWarn; t.renderer.destroy();
        // Core's session ends with the render, after the host session's own end: a render that signed out (or was suspended, or left anything else in core) must not be the state
        // the next render in this process boots on. close() stays synchronous; the next renderPage waits for this.
        session0?.end(); session0 = null;
        coreEnding = disposeCoreSession('term-quit').catch(() => undefined);
        releaseClock();
      },
    };
    return session;
  } catch (e) {
    console.error = realError;
    console.warn = realWarn;
    session0?.end();
    releaseClock();
    throw e;
  }
}

/** A short text report of what stood in and what failed, for the dev runner and reviews. Every line passes the
 *  diagnostic sanitiser (prim/safe.ts safeDiagnostic): page errors and console text may carry server or user text. */
export function reportOf(s: PageSession, safe: (t: unknown, max?: number) => string = (t) => String(t)): string {
  const p = s.placeholders;
  const uses = (rows: PlaceholderUseRow[]) => rows.map((r) => `${r.name}×${r.count}${r.importer ? ` (${r.importer})` : ''}`).join(', ') || 'none';
  const lines = [
    `placeholder modules loaded: ${p.modules.length}`,
    `placeholder components drawn: ${uses(p.rendered)}`,
    `unsupported exports used: ${uses(p.unsupported)}`,
    `allowance holes used: ${uses(p.allowed)}`,
    `strict-global traps: ${s.trapsAt.length ? s.trapsAt.join(' | ') : 'none'}`,
    `page failures: ${s.failures.length ? s.failures.map((f) => f.page + ': ' + f.message.split('\n')[0]).join(' | ') : 'none'}`,
    `settled: ${s.settled ? 'yes' : `NO (timed out; the frame is the last one drawn; still under way: ${safe(s.pendingText, 400)})`}`,
  ];
  lines.push(`class styles: ${s.styles.partial.length} partial, ${s.styles.untranslatable.length} untranslatable, ${s.styles.unknownColours.length} colour tokens without a role`);
  const errs = [...new Set(s.errors)].filter((e) => !ACT_WARNING.test(e));
  if (errs.length) lines.push(`console errors (${errs.length}): ` + errs.slice(0, 8).join(' | '));
  return lines.map((l) => safe(l, 2000)).join('\n');
}

/** A diagnostic record (app/diagnostic.ts) on one line, as its diagnosticLine does (not imported: loading that module
 *  before the loader resolves the host env). */
const recordLine = (d: Diagnostic): string => `${d.kind}${d.page ? ` ${d.page}` : ''}${d.what ? ` ${d.what}` : ''}: ${d.code} (${d.name})${d.where?.length ? ` in ${d.where.join(' < ')}` : ''}${d.detail ? ` - ${d.detail}` : ''}`;

/** The CLI's verdict: 0 clean; 1 page failures, a frame that shows an error instead of the page (crashShown), an
 *  unsettled render, unsupported or allowance uses. */
/** The line that read the trapped global: the first hub/src frame of its stack (else the first hub frame), shortened
 *  to `src/...:line:col`. */
export function trapSource(stack: string): string {
  const frames = stack.split('\n').slice(1).filter((x) => !/strict-globals\.ts|strict-probes\.ts|node_modules/.test(x));
  // A hub/src line first (the reading module); else any hub file (a test or script); else none.
  const l = frames.find((x) => /\/hub\/src\//.test(x)) ?? frames.find((x) => /\/hub\//.test(x));
  return l ? l.trim().replace(/^at /, '').replace(/.*?\/hub\//, '').replace(/\)$/, '') : '(no hub frame)';
}

export function exitCodeOf(s: PageSession): number {
  return s.traps?.length || s.failures.length || crashShown(s.frame) || !s.settled || s.placeholders.unsupported.length || s.placeholders.allowed.length ? 1 : 0;
}

if (import.meta.main) {
  const arg = (n: string) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : undefined; };
  const s = await renderPage({ page: arg('page') ?? 'schedules', fx: arg('fx') ?? null, cols: Number(arg('cols') ?? 120), rows: Number(arg('rows') ?? 40), path: arg('path'), bare: process.argv.includes('--bare'), css: !process.argv.includes('--no-css'), webOrigin: process.argv.includes('--no-web-origin') ? null : arg('web-origin') ?? FIXTURE_WEB_ORIGIN });
  const { safeDiagnostic } = (await import(src('term/prim/safe.ts'))) as typeof TSafe;
  const semOnly = process.argv.includes('--sem-only');
  // The frame is drawn text (already filtered by the host text filter); it is sanitised again, as every runner output.
  if (!semOnly) process.stdout.write(safeDiagnostic(s.frame, 1_000_000) + '\n' + reportOf(s, safeDiagnostic) + '\n');
  if (semOnly || process.argv.includes('--sem')) {
    const sem = (await import(src('term/prim/semantics.ts'))) as typeof TSemantics;
    const r = s.renderer as unknown as { root: unknown; stdin: unknown };
    process.stdout.write('\n' + safeDiagnostic(sem.semText(sem.semanticsOf({ root: r.root, stdin: r.stdin } as never), { actions: true }), 1_000_000) + '\n');
  }
  if (process.argv.includes('--layout')) {
    const lc = (await import(src('term/prim/layoutcheck.ts'))) as typeof TLayoutcheck;
    const faults = lc.layoutFaults((s.renderer as unknown as { root: never }).root, { cols: Number(arg('cols') ?? 120), rows: Number(arg('rows') ?? 40) });
    process.stdout.write('\nlayout faults: ' + faults.length + '\n' + safeDiagnostic(faults.slice(0, 40).map((f) => `  ${f.kind} ${f.path} ${f.detail}`).join('\n'), 100_000) + '\n');
  }
  const code = exitCodeOf(s);
  s.close();
  process.exit(code);
}

/** Why `p` is not a path of the page at `base` (null when it is): a whole Hub path, `base` itself or below it, with an
 *  optional search or hash (`/schedules?sel=a1`). A bare search (`?sel=…`) or another page's path is refused. */
export function badPagePath(p: string, base: string): string | null {
  const pathname = p.split(/[?#]/, 1)[0]!;
  const b = base.replace(/\/+$/, '') || '/';
  if (!p.startsWith('/')) return `--path ${JSON.stringify(p)} is not a Hub path: give the whole path with its search, such as ${JSON.stringify(b + (p.startsWith('?') || p.startsWith('#') ? p : '/' + p))}`;
  if (b === '/' ? pathname !== '/' : pathname !== b && !pathname.startsWith(b + '/')) return `--path ${JSON.stringify(p)} is not under the page's route ${JSON.stringify(b)}: the router would draw another page (an unknown path draws Home)`;
  return null;
}

