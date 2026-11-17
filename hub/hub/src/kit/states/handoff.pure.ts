// Pure rules of the handoff (Handoff.tsx / Handoff.term.tsx): where a Hub route lives on the web.

/** The server page the web Hub is served at; its routes live after the '#' (app/pageRouter.tsx). */
export const HUB_WEB_PATH = '/auth/home';

/** A Hub route the web router takes ('/x?y'); anything else (a URL, '//host', a scheme) is not one. */
export function isHubRoute(to: string): boolean {
  return to.startsWith('/') && !to.startsWith('//') && !/[\s\u0000-\u001f\u007f]/.test(to);
}

/** Where a hand-off happens, beyond the route: the realm and the computer the person has open. The web Hub keeps both
 *  in its own storage, so a browser would otherwise open its own last realm and computer. */
export interface HandoffPlace {
  /** A 24-hex realm id or 'all'. */
  realm?: string | null;
  /** The active computer's id: a 24 lower-hex id, anything else is left out. */
  computer?: string | null;
  /** The account's realms as the shell lists them: the realm travels only when it is one of these, or 'all' once the
   *  list is known (a value of the right shape is not yet a verified one). */
  realms?: readonly { readonly id: string }[] | null;
}

const REALM_RE = /^(?:[0-9a-f]{24}|all)$/;
const COMPUTER_RE = /^[0-9a-f]{24}$/;

/** The place as the query before the '#' (`?realm=…&computer=…`), '' when there is none: the server ignores it, the web
 *  Hub reads it once at load. A field travels only when it is VERIFIED: the realm
 *  is 'all' or a 24 lower-hex id listed in `place.realms` (no list = no realm), the computer a 24 lower-hex id of a
 *  computer in `known` (the shell's list; no list = no computer). Anything else is left out, never escaped into it. */
export function placeQuery(place: HandoffPlace | undefined, known?: readonly KnownComputer[]): string {
  if (!place) return '';
  const q: string[] = [];
  const realms = Array.isArray(place.realms) ? place.realms : [];
  const r = place.realm;
  if (r && REALM_RE.test(r) && realms.length > 0 && (r === 'all' || realms.some((x) => x?.id === r))) q.push(`realm=${r}`);
  const c = place.computer;
  if (c && COMPUTER_RE.test(c) && Array.isArray(known) && known.some((x) => x?.id === c)) q.push(`computer=${c}`);
  return q.length ? `?${q.join('&')}` : '';
}

/** A search string with a key given more than once ('?add=a&add=b'): ambiguous, so nothing of it travels:
 *  rejected, never resolved to the first or the last value. Read from the raw history entry, before the router
 *  folds repeats into one value. */
export function hasRepeatedKey(search: string): boolean {
  const keys: string[] = [];
  for (const [k] of new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)) {
    if (keys.includes(k)) return true;
    keys.push(k);
  }
  return false;
}

/** An address as it is DRAWN (text and accessible name): every run of 24 or more hex digits shortened to its first and
 *  last 4 (maskId's form; CONTRIBUTING.md "Secrets and ids": never show a full 24-hex id). Open, copy, the OSC 8
 *  link and the QR code take the whole verified address; only what a person reads is masked. */
export function shownAddress(url: string): string {
  return url.replace(/[0-9a-f]{24,}/gi, (m) => `${m.slice(0, 4)}…${m.slice(-4)}`);
}

/** A path a hand-off may carry: '/', then segments of letters, digits, '_' and '-' (a page route). */
const PATH_RE = /^\/(?:[A-Za-z0-9_-]+\/?)*$/;

/** The route a hand-off address may carry, by shape: the PATH of a Hub route, nothing else. Search and
 *  fragment are dropped whatever they hold: a search value can be anything a page put in its URL (a pasted token, an env
 *  value, an invite), and the address is drawn, linked (OSC 8), copied, opened and QR-encoded. Anything that is not a Hub
 *  route, or whose path holds other characters, is the Hub root. Shape alone still lets any id-shaped segment through;
 *  an address is built from declaredRoute, which keeps only a declared page path. */
export function handoffRoute(to: string): string {
  if (!isHubRoute(to)) return '/';
  const path = to.split(/[?#]/, 1)[0] ?? '/';
  return PATH_RE.test(path) ? path : '/';
}

/** The declared page path a route falls under: the longest of `declared` that is the route's path or a
 *  '/'-bounded prefix of it, compared without case as the page's splat route matches, returned as declared. Everything
 *  after it is dropped: below a page path the router keeps free text (a folder key, an id, anything a page wrote there).
 *  A declared path that is not a plain page path ('/x/$id', a bad character) is never used; no match is the Hub root. */
export function declaredRoute(to: string, declared: readonly string[]): string {
  // Only the comparison reads the route's path; what is returned is always a declared path (or '/').
  const path = isHubRoute(to) ? (to.split(/[?#]/, 1)[0] ?? '/') : '/';
  const lower = path.toLowerCase();
  let best = '/';
  for (const d0 of declared) {
    const d = d0.length > 1 ? d0.replace(/\/+$/, '') : d0;
    if (d === '/' || !PATH_RE.test(d)) continue;
    const dl = d.toLowerCase();
    if ((lower === dl || lower.startsWith(`${dl}/`)) && d.length > best.length) best = d;
  }
  return best;
}

/** A computer of the signed-in account, as the shell lists it (ShellComputer): what a Board extra is looked up in. */
export interface KnownComputer { readonly id: string; readonly name: string }

/** What a page's hand-off may carry below its declared path, besides that path: only a VERIFIED
 *  target, never text a shape lets through. A value travels only when it names a computer of the account's own list
 *  (`known`, the shell's computers), and what travels is rebuilt from that list entry, never copied from the route:
 *  - /board/open/<handle>/<program>-<n> and /port-<n>: the handle must be computerHandle (name.last4 of the id) of a
 *    listed computer; program is one of the Board's tile programs and n a number (no free text);
 *  - /board?add=<program>-<n|new>&cid=<id>: cid must be a listed computer's id; add a tile program (or port) and a
 *    number or `new`. Both or neither.
 *  No list (outside a shell, or not loaded yet) = the declared page only. Script views (free route text), any other key
 *  and any other page carry nothing extra. Kept here, not taken from the page, so the whole surface is reviewed in one
 *  place. Regex literals only: loading this module builds no RegExp or table (kitpure). */
const BOARD_VIEW = /^\/open\/([^/]+)\/(agent|terminal|display|files|browser|code|sqlite|notes|port)-([1-9][0-9]{0,4})$/;
const BOARD_ADD = /^(agent|terminal|display|files|browser|code|sqlite|notes|port)-([1-9][0-9]{0,4}|new)$/;
const handleOf = (c: KnownComputer): string => `${c.name}.${c.id.slice(-4)}`;

/** The route a hand-off carries for page `base` (a declaredRoute result): `base`, plus the Board extras that name a
 *  verified target (see above); for any other page, or with no `known` list, `base` alone. */
export function pageRoute(to: string, base: string, known?: readonly KnownComputer[]): string {
  if (base !== '/board' || !known?.length || !isHubRoute(to)) return base;
  const listed = known.filter((c) => typeof c?.id === 'string' && COMPUTER_RE.test(c.id) && typeof c.name === 'string' && c.name !== '');
  const [pathPart = '/', rest = ''] = to.split('?', 2);
  const path = pathPart.split('#', 1)[0] ?? '/';
  let sub = '';
  const v = path.toLowerCase().startsWith('/board/') ? BOARD_VIEW.exec(path.slice('/board'.length)) : null;
  if (v) {
    let h = '';
    try { h = decodeURIComponent(v[1]!); } catch { h = ''; }
    const c = h ? listed.find((x) => handleOf(x) === h) : undefined;
    if (c) sub = `/open/${encodeURIComponent(handleOf(c))}/${v[2]}-${Number(v[3])}`;
  }
  const q = new URLSearchParams(rest.split('#', 1)[0] ?? '');
  const adds = q.getAll('add');
  const cids = q.getAll('cid');
  let search = '';
  const a = adds.length === 1 ? BOARD_ADD.exec(adds[0]!) : null;
  if (a && cids.length === 1) {
    const c = listed.find((x) => x.id === cids[0]);
    if (c) search = `?add=${a[1]}-${a[2] === 'new' ? 'new' : Number(a[2])}&cid=${c.id}`;
  }
  return `${base}${sub}${search}`;
}

/** The page paths the router declares: each route's full path with its splat ('/board/$' → '/board'); a path that still
 *  holds a parameter is no declared value and is left out (declaredRoute also refuses any non-plain path). */
export function declaredPaths(router: unknown): string[] {
  const byId = (router as { routesById?: Record<string, { fullPath?: unknown }> } | null)?.routesById ?? {};
  const out = new Set<string>();
  for (const r of Object.values(byId)) {
    if (typeof r?.fullPath !== 'string') continue;
    const p = r.fullPath.replace(/\/?\$$/, '') || '/';
    if (!p.includes('$')) out.add(p);
  }
  return [...out];
}

/** The whole web address of a Hub route: the declared page path it falls under (declaredRoute) and the place (placeQuery's
 *  allowlist: realm, computer). origin null: the path form, read against the Hub's own address. No `declared` list (no
 *  router) = the Hub root. */
export function hubWebAddress(to: string, origin: string | null, place: HandoffPlace | undefined, declared: readonly string[], known?: readonly KnownComputer[]): string {
  const route = pageRoute(to, declaredRoute(to, declared), known);
  const o = origin && /^https?:\/\/[^/\s]+$/i.test(origin) ? origin : '';
  return `${o}${HUB_WEB_PATH}${placeQuery(place, known)}#${route}`;
}

/** A search record as the router writes it ('?a=1'), '' when empty. Not for a hand-off address: hubWebAddress keeps
 *  only the declared page path (declaredRoute). */
export function routeOf(pathname: string, search: Readonly<Record<string, string | undefined>>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) if (v !== undefined && v !== '') q.set(k, v);
  const s = q.toString();
  return `${pathname || '/'}${s ? `?${s}` : ''}`;
}

/** One hand-off drawn: what it is about and why it is not here (the caller's words, translated). */
export interface HandoffDraw { what: string; reason: string }
/** Distinct hand-offs drawn in this process, oldest first; bounded so a long session cannot grow it. */
export const HANDOFF_DRAWS_MAX = 256;
const draws: HandoffDraw[] = [];
const seen = new Set<string>();
/** Called by the terminal Handoff once per mount (and when its words change); the same pair is recorded once. */
export function recordHandoffDraw(d: HandoffDraw): void {
  const key = `${d.what}\u0000${d.reason}`;
  if (seen.has(key) || draws.length >= HANDOFF_DRAWS_MAX) return;
  seen.add(key);
  draws.push({ what: d.what, reason: d.reason });
}
/** The hand-offs drawn so far (a copy). */
export const handoffDraws = (): readonly HandoffDraw[] => draws.map((d) => ({ ...d }));
export function clearHandoffDraws(): void { draws.length = 0; seen.clear(); }
