// How React Aria links (kit Link, LinkButton, menu items) resolve an href. A '/x' path is a Hub
// route, rendered as '#/x' and navigated by the router. A '/auth/...' path is a server page (sign-in,
// account flows; no Hub page links to the classic Hub): it is a full document, so it
// keeps its plain href and loads with the browser, never as '#/auth/...'.

/** True for an href that names a whole server document under /auth, not a v3 route. */
export function isDocumentPath(to: string): boolean {
  return to === '/auth' || to.startsWith('/auth/') || to.startsWith('/auth?');
}

// Anything else is refused (defence in depth: no javascript:, data: or relative href renders or
// navigates). An http(s) URL renders as is, for the browser to open; it never routes.
const EXTERNAL = /^https?:\/\//i;

/** The href React Aria renders for `to`; a refused href renders as the Hub root, '#/'. */
export function hubHref(to: string): string {
  if (to.startsWith('#/') || EXTERNAL.test(to) || isDocumentPath(to)) return to;
  return to.startsWith('/') ? `#${to}` : '#/';
}

/** Client-side navigation for `to`: an /auth page loads as a document, a Hub path or '#/' route
 * routes; anything else (an external URL, '//host', any other scheme) does nothing here. */
export function hubNavigate(to: string, route: (to: string) => void, load: (to: string) => void = (u) => window.location.assign(u)): void {
  if (isDocumentPath(to)) load(to);
  else if (to.startsWith('#/')) route(to.slice(1));
  else if (to.startsWith('/') && !to.startsWith('//')) route(to);
}
