// Links to other pages, for the shell and for pages ('@kit'): only pages this load serves (the
// router's visiblePages, handed to AppShell) get a link. A page this load hides has none (there is no
// other Hub to send it to): the control should not show, never a link that lands on Not Found.
import { createContext, type ReactNode, useContext } from 'react';
import type { PageManifest } from '@kit/page';

/** v3 page id → its view name in a sign-in round trip (`?view=`): the names the login, 2FA and boot-gate pages keep
 *  (HUB_VIEWS in public/auth/shared.js), which are the sign-in pages' own names (billing is 'wallet'). */
export const SIGNIN_VIEW: Readonly<Record<string, string>> = {
  home: 'home',
  bots: 'bots',
  board: 'board',
  guide: 'guide',
  computers: 'computers',
  keys: 'keys',
  market: 'market',
  account: 'account',
  billing: 'wallet',
  notifications: 'notify',
  scripts: 'scripts',
  logs: 'logs',
  ai: 'ai',
  apps: 'apps',
  notes: 'notes',
  schedules: 'schedules',
  programs: 'programs',
};

/** A link to a page this load serves: its path inside the Hub. */
export type PageLink = { kind: 'hub'; href: string };

/** The sign-in view name for page `id`, own keys only ('constructor' or 'toString' is no page). */
export function signInViewOf(id: string): string | undefined {
  return Object.hasOwn(SIGNIN_VIEW, id) ? SIGNIN_VIEW[id] : undefined;
}

/** Where a link to page `id` goes for this load, or null when this load does not serve it. */
export function pageLink(pages: readonly PageManifest[], id: string): PageLink | null {
  const p = pages.find((x) => x.id === id);
  return p ? { kind: 'hub', href: p.path } : null;
}

/** The first path segment ('/computers/abc?x' → 'computers'). */
export const segment = (path: string): string => path.replace(/^\/+/, '').split(/[/?#]/)[0] ?? '';

/** Whether `to` (a path inside the Hub) lands under a page this load serves. */
export function servesPath(pages: readonly PageManifest[], to: string): boolean {
  const id = segment(to);
  return id === '' || pages.some((p) => segment(p.path) === id);
}

const PagesCtx = createContext<readonly PageManifest[] | null>(null);

/** AppShell provides the served pages to everything inside it. */
export function PagesProvider({ pages, children }: { pages: readonly PageManifest[]; children: ReactNode }) {
  return <PagesCtx.Provider value={pages}>{children}</PagesCtx.Provider>;
}

// Outside AppShell (a page's unit test renders the page alone) every page counts as served, so page
// tests keep their links; in the app the shell always provides the real list.

/** Whether page `id` is served by this load. */
export function usePageVisible(id: string): boolean {
  const pages = useContext(PagesCtx);
  return pages ? pages.some((p) => p.id === id) : true;
}

/** A predicate for "page `id` is served by this load" (every id outside AppShell). */
export function usePagesServed(): (id: string) => boolean {
  const pages = useContext(PagesCtx);
  return (id) => (pages ? pages.some((p) => p.id === id) : true);
}

/** The link to page `id` inside the Hub, or null when this load does not serve it (hide the control). */
export function usePageLink(id: string): PageLink | null {
  const pages = useContext(PagesCtx);
  return pages ? pageLink(pages, id) : { kind: 'hub', href: `/${id}` };
}

/** Page `id`'s manifest when this load serves it, else null (also outside AppShell, where no manifest is known): for an
 *  entry that shows the page's own nav label and icon, as the account menu's Support item does. */
export function useServedPage(id: string): PageManifest | null {
  const pages = useContext(PagesCtx);
  return pages?.find((p) => p.id === id) ?? null;
}

/**
 * The Hub link to page `id` only when this load serves it, else null; outside AppShell, only for a known page id.
 * The same answer as usePageLink in the app, kept for the links that read "held on <page>".
 */
export function useServedPageLink(id: string): PageLink | null {
  const pages = useContext(PagesCtx);
  if (!pages) return signInViewOf(id) ? { kind: 'hub', href: `/${id}` } : null;
  const p = pages.find((x) => x.id === id);
  return p ? { kind: 'hub', href: p.path } : null;
}

/**
 * `path` when it is plainly a place under the page `link` goes to, else the page itself. Plainly: one leading
 * '/', the page's own path as a whole segment (equal, or followed by '/', '?' or '#'), no '.' or '..' segment
 * (also percent-encoded), no backslash. HeldFromLink and followPagePath share it.
 */
export function placeUnder(link: PageLink, path: string): string {
  const home = link.href;
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return home;
  if (!path.startsWith(home)) return home;
  if (path !== home && !['/', '?', '#'].includes(path.charAt(home.length))) return home;
  const route = path.split(/[?#]/)[0] ?? '';
  for (const part of route.split('/')) {
    let plain: string;
    try {
      plain = decodeURIComponent(part);
    } catch {
      return home;
    }
    if (plain === '.' || plain === '..' || plain.includes('\\') || plain.includes('/')) return home;
  }
  return path;
}

/**
 * Go to a place inside a page (`path` under the page's own path, e.g. '/notifications/learn#browser') through the
 * router when this load serves the page, else nowhere (false).
 */
export function followPagePath(link: PageLink | null, path: string, go: (to: string) => void): boolean {
  if (!link) return false;
  // Only a place under the page's own path; anything else goes to the page itself.
  go(placeUnder(link, path));
  return true;
}

/** Follow a link through the router (`go`). */
export function followPageLink(link: PageLink, go: (to: string) => void): void {
  go(link.href);
}
