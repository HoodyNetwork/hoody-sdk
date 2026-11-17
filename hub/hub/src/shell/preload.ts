// Page views, loaded on a visit or ahead of it. Each page is its own chunk; so that the first switch to a
// page does not wait for the network with a skeleton in place of the page, a left-nav link loads its page's view
// when the pointer rests on it, it takes focus or a press starts, and once the Hub is idle the nav pages load one at a
// time. Loading only fetches and evaluates the chunk: nothing renders until the visit.
//
// pageView() is the one load of a page's view: app/router renders the view from it (React `use`), and waits on
// pageReady() before it draws the next page, so the page shown stays until the next one can draw at once. The promise carries
// React's thenable fields (status, value, reason), so a view already loaded renders in the same pass, never a fallback.
import type { ComponentType, FulfilledReactPromise, PendingReactPromise, RejectedReactPromise } from 'react';
import { isFramed } from '@core/session';
import type { PageManifest } from '@kit/page';
import { chunkLoadFailed } from './staleChunk';

type Load = PageManifest['load'];
type V = ComponentType;
export type ViewPromise = Promise<V> & (PendingReactPromise<V> | FulfilledReactPromise<V> | RejectedReactPromise<V>);
type Tracked = Promise<V> & { status: ViewPromise['status']; value?: V; reason?: unknown };

/**
 * The framed lock on pages: a page whose manifest says `sensitive: true` (secret, payment, key or 2FA UI) is refused in
 * a framed Hub (isFramed, the same check api() refuses framed requests by). Its view is never loaded there: no visit,
 * hover, idle load or render evaluates its chunk, so nothing of it runs; app/pageRouter.tsx draws the refusal instead.
 */
export function framedRefused(page: { readonly sensitive?: boolean }): boolean {
  return page.sensitive === true && isFramed();
}

// Keyed by the load function, so two manifests with one id (tests) never share a view.
const views = new WeakMap<Load, ViewPromise>();
// The loads a render has read: a failure stays (the page shows its error, as React.lazy kept it). A failure no render
// read (a load ahead of a visit) is forgotten, so the visit loads again.
const read = new WeakSet<Load>();

function start(load: Load): ViewPromise {
  const had = views.get(load);
  if (had) return had;
  const p = load().then((m) => m.default) as Tracked;
  p.status = 'pending';
  p.then(
    (value) => {
      p.status = 'fulfilled';
      p.value = value;
    },
    (reason: unknown) => {
      p.status = 'rejected';
      p.reason = reason;
      // A view a render needs that cannot load: "Hub was updated" after a deploy, else a neutral notice.
      if (read.has(load)) void chunkLoadFailed(reason);
      else if (views.get(load) === p) views.delete(load);
    },
  );
  views.set(load, p as ViewPromise);
  return p as ViewPromise;
}

/** The page's view, for a render: loads it once and keeps the outcome, a failure included. */
export function pageView(page: Pick<PageManifest, 'load'>): ViewPromise {
  read.add(page.load);
  return start(page.load);
}

type Ready = Promise<void> & (PendingReactPromise<void> | FulfilledReactPromise<void>);
const readies = new WeakMap<ViewPromise, Ready>();

/**
 * When the page's view has loaded or failed, for a render to wait on (React `use`): it never rejects, so a failure does
 * not escape here and the page draws and shows its error from pageView inside its own boundary. One promise per view,
 * settled already when the view is, so a render always calls `use` on it, waiting or not.
 */
export function pageReady(page: Pick<PageManifest, 'load'>): Ready {
  const v = pageView(page);
  const had = readies.get(v);
  if (had) return had;
  const r = v.then(
    () => undefined,
    () => undefined,
  ) as Promise<void> & { status: Ready['status']; value?: void };
  if (v.status === 'pending') {
    r.status = 'pending';
    r.then(() => {
      r.status = 'fulfilled';
    });
  } else {
    r.status = 'fulfilled';
  }
  readies.set(v, r as Ready);
  return r as Ready;
}

/** Load a page's view ahead of a visit; a failure no render has read is forgotten, so the visit tries again. */
export function preloadPage(page: Pick<PageManifest, 'load'> & { readonly sensitive?: boolean }): void {
  if (framedRefused(page)) return;
  start(page.load).catch(() => undefined);
}

interface IdleDeadline {
  timeRemaining: () => number;
}
export interface IdleScheduler {
  request: (run: (d: IdleDeadline) => void) => number;
  cancel: (id: number) => void;
}

function browserIdle(): IdleScheduler | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { requestIdleCallback?: (cb: (d: IdleDeadline) => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback && w.cancelIdleCallback) {
    const ric = w.requestIdleCallback.bind(w);
    const cic = w.cancelIdleCallback.bind(w);
    return { request: (run) => ric(run, { timeout: 4000 }), cancel: cic };
  }
  // No idle callback (Safari): a later timer, so the page the person opened draws first.
  return { request: (run) => window.setTimeout(() => run({ timeRemaining: () => 50 }), 1500), cancel: (id) => window.clearTimeout(id) };
}

/** Whether the person asked to save data, or the connection is very slow: then only intent loads a page. */
function saveData(): boolean {
  const c = typeof navigator !== 'undefined' ? (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection : undefined;
  return !!c && (c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g');
}

/**
 * Load the nav pages' views one per idle period, lowest nav order first.
 * Returns a stop function. Does nothing when the person saves data or there is no scheduler.
 */
export function preloadOnIdle(pages: readonly PageManifest[], idle: IdleScheduler | null = browserIdle()): () => void {
  if (!idle || saveData()) return () => undefined;
  const queue = pages.filter((p) => p.nav).sort((a, b) => a.nav!.order - b.nav!.order);
  let id: number | null = null;
  let stopped = false;
  const next = () => {
    id = idle.request((d) => {
      id = null;
      if (stopped) return;
      // One chunk per idle period; a busy period waits for the next one.
      if (d.timeRemaining() > 8) {
        const p = queue.shift();
        if (p) preloadPage(p);
      }
      if (queue.length > 0) next();
    });
  };
  if (queue.length > 0) next();
  return () => {
    stopped = true;
    if (id !== null) idle.cancel(id);
  };
}
