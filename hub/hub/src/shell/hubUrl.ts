// The v3 Hub's place in the URL across sign-in. The boot gate and the login/2FA pages forward only
// `hub` and a known `view` (the sign-in pages' names, HUB_VIEWS in shared.js: SIGNIN_VIEW), never the hash. So:
// - at boot, before the router reads the location, ?view= naming a page this load serves becomes
//   the v3 route (#/<page>) when no hash names one; any other view stays on the default route. Only
//   `view` is dropped (fixtures mode reads theme and fx* from the query);
// - at boot with no view and no hash, an account session with a website buy link or a payment return waiting (the
//   boot gate stashed it, possibly before a sign-in) opens Billing, which reads and consumes it;
//   the default route (Home) never reads it;
// - leaving for sign-in carries hub=v3, preview=1 when set (so preview pages are served again) and the
//   current page as its sign-in view;
// - "this page again" (a reload after another tab changed the session) keeps the hash, and is a real
//   reload: a replace() to the same URL with a fragment is only a fragment navigation.
import { commerce } from '@core';
import { readPage } from '@core/session';
import type { LifecycleConfig } from '@core/shell';
import type { PageManifest } from '@kit/page';
import { SIGNIN_VIEW, signInViewOf } from './pageLinks';

const SIGN_IN = new Set(['/auth/login', '/auth/2fa']);

/** The v3 page id for a view name (a v3 id or its sign-in name), or null. */
function pageForView(view: string): string | null {
  if (Object.hasOwn(SIGNIN_VIEW, view)) return view;
  return Object.keys(SIGNIN_VIEW).find((id) => SIGNIN_VIEW[id] === view) ?? null;
}

const hashPath = (hash: string) => hash.replace(/^#/, '');

/**
 * A stashed buy link or payment return Billing should open for: an account session only (a token session never
 * buys), and only a stash Billing would still act on (commerce's own readers, which drop a stale or malformed one).
 */
export function billingStashFor(kind: string | undefined, stash: { readTopupReturn(): unknown; readIntent(): unknown }): boolean {
  if (kind !== 'account') return false;
  return stash.readTopupReturn() !== null || stash.readIntent() !== null;
}

/** billingStashFor for this page's stored session (shared.js); never in fixtures mode, false when it cannot read.
 *  The parameters are for tests; the boot passes none. */
export function billingStashWaiting(
  fixtures: boolean = __HUB_FIXTURES__,
  session: () => { kind?: string } | null = readPage,
  stash: { readTopupReturn(): unknown; readIntent(): unknown } = commerce,
): boolean {
  if (fixtures) return false;
  try {
    return billingStashFor(session()?.kind, stash);
  } catch {
    return false;
  }
}

/** Boot, before buildRouter: turn ?view= into the v3 route and drop it; with neither a view nor a hash, a waiting
 *  buy link or payment return opens Billing (when this load serves it). */
export function adoptViewParam(pages: readonly PageManifest[], billingWaits: () => boolean = billingStashWaiting): void {
  const url = new URL(window.location.href);
  const view = url.searchParams.get('view');
  const path = hashPath(url.hash);
  const atRoot = path === '' || path === '/';
  if (view === null) {
    const billing = pages.find((p) => p.id === 'billing');
    if (!atRoot || !billing || !billingWaits()) return;
    url.hash = `#${billing.path}`;
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    return;
  }
  url.searchParams.delete('view');
  const id = pageForView(view);
  const page = id ? pages.find((p) => p.id === id) : undefined;
  if (page && atRoot) url.hash = `#${page.path}`;
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

/** A navigation away from the Hub: sign-in keeps hub=v3 and the current page's sign-in view. */
export function keepHubState(to: string): string {
  const url = new URL(to, window.location.origin);
  if (url.origin !== window.location.origin || !SIGN_IN.has(url.pathname)) return to;
  url.searchParams.set('hub', 'v3');
  if (new URLSearchParams(window.location.search).get('preview') === '1') url.searchParams.set('preview', '1');
  const id = hashPath(window.location.hash).replace(/^\/+/, '').split(/[/?#]/)[0] ?? '';
  const view = signInViewOf(id);
  if (view && view !== 'home' && !url.searchParams.has('view')) url.searchParams.set('view', view);
  return url.pathname + url.search + url.hash;
}

/** This page again, hash included. */
export function herePath(): string {
  return window.location.pathname + window.location.search + window.location.hash;
}

/** core's lifecycle exits for this page (app/core-boot.ts configures them before the live boot). */
export const hubLifecycle: Pick<LifecycleConfig, 'navigate' | 'herePath'> = {
  navigate: (to) => {
    if (to === herePath()) window.location.reload();
    else window.location.replace(keepHubState(to));
  },
  herePath,
};
