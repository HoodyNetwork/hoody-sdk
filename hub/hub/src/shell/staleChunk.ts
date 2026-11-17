// A deploy replaces the Hub's chunks. A tab opened before it still names the old hashed files, and
// its next lazy load fails: the file is gone (the server answers a plain 404). The page then
// cannot draw until the tab loads the new index.
// - The Hub never reloads by itself: a draft can live in memory past its field (Ask drafts, a script edit on another
//   tab), so the person decides. The shell shows a notice with a Reload button (shell/notices.tsx).
// - A failed load is only called a deploy when the Hub checks and the server answers 404 for the failed chunk or for
//   this tab's own entry script (`probe`, 8 s per request). Then: "Hub was updated. Reload to continue." Unreachable
//   (offline, server down, too slow) or still there: the neutral "couldn't load" notice, never an update claim.
// - A page view a render needs (shell/preload.ts calls chunkLoadFailed): either notice.
// - A chunk Vite reports failing (vite:preloadError: a lazy part of a page, a page loaded ahead of a visit): the update
//   notice when a deploy removed it; anything else is left to the page's own error handling (Vite reports a module
//   that threw while it ran the same way).
// - Before the app runs (its entry or a static import gone), public/auth/hub-chunk-rescue.js shows the same notice.
//   installStaleChunk tells it the app took over (data-hub-chunks on <html>); from then on it hands its results here
//   (`hub:chunk-rescue`): a check it started before the app ran is shown like a page view's, an initial asset failing
//   later shows the update notice only when the check says a deploy.
import { useSyncExternalStore } from 'react';

/** What the shell shows: a newer build replaced this tab's chunks, or a part could not load for another reason. */
export type StaleChunkNotice = 'updated' | 'failed' | null;

let notice: StaleChunkNotice = null;
let probing: Promise<Probe> | null = null;
const listeners = new Set<() => void>();

function show(n: Exclude<StaleChunkNotice, null>): void {
  // 'updated' says more than 'failed' and replaces it; nothing replaces 'updated'.
  if (notice === 'updated' || notice === n) return;
  notice = n;
  for (const l of [...listeners]) l();
}

/** True for the error a failed lazy load rejects with (the file missing, refused or unreachable), in any browser. */
export function isChunkLoadError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const x = e as { name?: unknown; message?: unknown };
  if (x.name === 'ChunkLoadError') return true;
  const m = typeof x.message === 'string' ? x.message : '';
  return (
    /Failed to fetch dynamically imported module/i.test(m) || // Chromium
    /error loading dynamically imported module/i.test(m) || // Firefox
    /Importing a module script failed/i.test(m) || // Safari
    /Unable to preload CSS/i.test(m) // Vite's CSS preload of a chunk
  );
}

type Probe = 'gone' | 'there' | 'unreachable';

/** Same-origin URLs to check: the failed chunk (when the message names it) and this tab's entry script. */
function probeUrls(e: unknown): string[] {
  const out: string[] = [];
  const add = (raw: string | null | undefined) => {
    if (!raw) return;
    try {
      const u = new URL(raw, window.location.href);
      if (u.origin === window.location.origin && !out.includes(u.href)) out.push(u.href);
    } catch {
      /* not a URL */
    }
  };
  const m = typeof (e as { message?: unknown } | null)?.message === 'string' ? (e as { message: string }).message : '';
  add(/(?:https?:\/\/|\/)[^\s'"]+\.(?:js|mjs|css)\b/.exec(m)?.[0]);
  add(document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src);
  return out;
}

/** How long one check may take; past it the server counts as unreachable. */
export const PROBE_TIMEOUT_MS = 8000;

/** Whether the server still has the files this tab loaded: one 404 means a deploy removed them. */
function probe(e: unknown): Promise<Probe> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve('unreachable');
  if (probing) return probing;
  const urls = probeUrls(e);
  const p = (async (): Promise<Probe> => {
    let reached = false;
    for (const u of urls) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS);
      try {
        const r = await fetch(u, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin', signal: ctl.signal });
        reached = true;
        if (r.status === 404) return 'gone';
      } catch {
        /* unreachable or too slow: try the next */
      } finally {
        clearTimeout(timer);
      }
    }
    return reached ? 'there' : 'unreachable';
  })();
  probing = p;
  // One check answers the failures that arrive while it runs; a later failure checks again.
  void p.finally(() => {
    if (probing === p) probing = null;
  });
  return p;
}

/** A page view a render needs failed to load (shell/preload.ts): the update notice for a deploy, else the neutral one. */
export async function chunkLoadFailed(e: unknown): Promise<void> {
  if (!isChunkLoadError(e)) return;
  show((await probe(e)) === 'gone' ? 'updated' : 'failed');
}

/** Vite reported a failed chunk: the update notice when a deploy removed it, nothing otherwise. */
async function preloadFailed(e: unknown): Promise<void> {
  if (!isChunkLoadError(e)) return;
  if ((await probe(e)) === 'gone') show('updated');
}

/** A boot-rescue result handed over after the app took over (public/auth/hub-chunk-rescue.js). */
function rescued(detail: unknown): void {
  const d = (detail ?? {}) as { status?: unknown; boot?: unknown };
  // A check begun before the app ran is shown like a page view's; a later asset failure only when it is a deploy.
  if (d.boot === true) show(d.status === 404 ? 'updated' : 'failed');
  else if (d.status === 404) show('updated');
}

/** main.tsx: Vite's report of a failed chunk and the boot rescue's hand-over. Returns the uninstall. */
export function installStaleChunk(win: Window = window): () => void {
  // Vite still throws the error when nothing calls preventDefault, so the page's own error handling is unchanged.
  const onPreload = (ev: Event) => void preloadFailed((ev as Event & { payload?: unknown }).payload);
  const onRescue = (ev: Event) => rescued((ev as CustomEvent).detail);
  win.addEventListener('vite:preloadError', onPreload);
  win.document.addEventListener('hub:chunk-rescue', onRescue);
  // The boot rescue (public/auth/hub-chunk-rescue.js) stands down: the app handles failed chunks from here.
  win.document.documentElement.setAttribute('data-hub-chunks', 'app');
  return () => {
    win.removeEventListener('vite:preloadError', onPreload);
    win.document.removeEventListener('hub:chunk-rescue', onRescue);
  };
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The stale-chunk notice the shell shows, if any. */
export function useStaleChunkNotice(): StaleChunkNotice {
  return useSyncExternalStore(subscribe, () => notice, () => null);
}

/** Tests only. */
export function resetStaleChunkForTests(): void {
  notice = null;
  probing = null;
  listeners.clear();
}
