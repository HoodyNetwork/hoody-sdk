// kitRoutes.ts: the exact kit requests the run-open machine may send, and route(), the guard core's send()
// runs before anything leaves.
//
// Contract:
//   - A row is [kit, index rule, method, path pattern, allowed query keys, allowed top-level body keys]. A body
//     list of null means the request carries no body; a list means it must carry a JSON object with only those keys.
//   - index rule: a number, 'band' (BAND, 8001-9999: where a launch creates its terminal and display), or 'held'
//     (BAND, or LEGACY_BAND for a launch made before: read, signal and DELETE only), and then the N the request
//     names (terminal_id, displayId, or the DELETE path) must equal the host's N.
//   - A create's body names the host's N as both its terminal_id and its display (each a string or a number); its
//     shell, when present, is exactly /bin/bash (an Open-with launch pins bash).
//   - A terminal is deleted only as the incarnation the machine created (?incarnation=<32 hex>).
//   - terminal-0 runs only the machine's raw read probes (the OCI sweep): ephemeral=true, mode 'raw', and no
//     terminal_id other than 0. Never a session command.
//   - route() returns null when the request is allowed, else 'ROUTE_REFUSED'; nothing refused is sent.

import { geoLookupIp } from '../ipv4';
import { isRecord } from '../shape';

export type RunKit = 'run' | 'terminal' | 'display';
export type RouteMethod = 'GET' | 'POST' | 'DELETE';
export type RouteQuery = Readonly<Record<string, unknown>>;

const INCARNATION = /^[0-9a-f]{32}$/;
/** Where a launch creates terminal N and display N (run-open-core.js LIMITS.bandMin/bandMax, the band
 *  hoody-run suggests). Terminal and display ids are valid only up to 9999. Not reserved: the proxy's
 *  desktop-6401..8399 (terminal and display 1600 + N) and browser-7501..9499 (display 500 + N) address the same
 *  ids. */
export const BAND = [8001, 9999] as const;
/** Where launches made before the 9999 ceiling live: still read, signalled and deleted, never created. */
export const LEGACY_BAND = [15001, 19999] as const;

const RESOLVE_BODY = ['app', 'launch_tag', 'launch_env', 'kind', 'os', 'source', 'tags', 'pick', 'candidate_id', 'set_id', 'args', 'pass_env'];

type Row = readonly [kit: RunKit, index: number | 'band' | 'held', method: RouteMethod, pattern: RegExp, query: readonly string[], body: readonly string[] | null];

export const RUN_OPEN_ROUTES: readonly Row[] = [
  ['run', 1, 'GET', /^\/api\/v1\/run\/capabilities$/, [], null],
  ['run', 1, 'GET', /^\/api\/v1\/run\/catalog$/, ['q'], null],
  ['run', 1, 'GET', /^\/api\/v1\/run\/search$/, ['app', 'limit', 'source'], null],
  ['run', 1, 'POST', /^\/api\/v1\/run\/resolve$/, [], RESOLVE_BODY],
  ['terminal', 0, 'GET', /^\/api\/v1\/terminal\/capabilities$/, [], null],
  ['terminal', 0, 'GET', /^\/api\/v1\/terminal\/sessions$/, [], null],
  ['terminal', 0, 'GET', /^\/api\/v1\/system\/ports$/, [], null],
  ['terminal', 0, 'POST', /^\/api\/v1\/terminal\/execute$/, ['terminal_id', 'ephemeral'], ['command', 'mode', 'wait', 'user']],
  ['terminal', 'band', 'POST', /^\/api\/v1\/terminal\/create$/, ['terminal_id'], ['terminal_id', 'exclusive', 'display', 'wait_until_display', 'user', 'cwd', 'shell']],
  ['terminal', 'band', 'POST', /^\/api\/v1\/terminal\/execute$/, ['terminal_id', 'skip_display_wait'], ['command', 'wait', 'id', 'require_staged', 'track', 'incarnation', 'track_label', 'env', 'cwd']],
  ['terminal', 'held', 'GET', /^\/api\/v1\/terminal\/workloads$/, ['terminal_id', 'incarnation', 'command_id'], null],
  ['terminal', 'held', 'POST', /^\/api\/v1\/terminal\/workloads\/([0-9]{1,5})\/signal$/, ['terminal_id'], ['incarnation', 'signal']],
  ['terminal', 'held', 'DELETE', /^\/api\/v1\/terminal\/([0-9]{1,5})$/, ['incarnation'], null],
  ['display', 'held', 'GET', /^\/api\/v1\/display\/windows$/, ['displayId'], null],
];

/** The resolve answer holds secret values (launch_env): a secret call, scrubbed, refusals keep only these codes. */
export const RESOLVE_PATH = '/api/v1/run/resolve';
export const RESOLVE_CODES: readonly string[] = ['SOURCE_WARMING', 'SOURCE_RESOLUTION_FAILED', 'NO_CANDIDATES', 'ARGS_UNSUPPORTED', 'POLICY_DENIED'];
/** The codes the machine branches on in a tracked execute's refusal (its route is secret: only these survive). */
export const EXECUTE_CODES: readonly string[] = ['COMMAND_ID_EXISTS', 'STAGING_UNAVAILABLE', 'TRACK_LIMIT', 'EXECUTE_BACKLOG_FULL', 'INCARNATION_MISMATCH', 'CWD_PERMISSION_DENIED', 'SHELL_UNSUPPORTED'];

const own = (o: unknown, k: string): boolean => !!o && typeof o === 'object' && Object.hasOwn(o, k);
const int = (v: unknown, lo: number, hi: number): boolean => typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi;
/** v (a string or a number) names exactly the host's N. */
const sameN = (v: unknown, index: unknown): boolean => (typeof v === 'string' || typeof v === 'number') && String(v) === String(index);
export const inBand = (n: unknown): boolean => int(n, BAND[0], BAND[1]);
/** A terminal a launch may live in: the band, or the old band (read, signal, DELETE). */
export const inHeld = (n: unknown): boolean => inBand(n) || int(n, LEGACY_BAND[0], LEGACY_BAND[1]);
/** The index rule of a row: one program, the band, or a held launch terminal. */
export const indexOk = (rule: number | 'band' | 'held', n: unknown): boolean => (rule === 'band' ? inBand(n) : rule === 'held' ? inHeld(n) : n === rule);

/** null when the request may leave, else 'ROUTE_REFUSED'. path carries no query string. */
export function route(kit: unknown, index: unknown, method: unknown, path: unknown, query: unknown, body: unknown): null | 'ROUTE_REFUSED' {
  if (typeof path !== 'string' || path.includes('?') || path.includes('#')) return 'ROUTE_REFUSED';
  if (!isRecord(query)) return 'ROUTE_REFUSED';
  for (const r of RUN_OPEN_ROUTES) {
    if (r[0] !== kit || r[2] !== method) continue;
    const m = r[3].exec(path);
    if (!m) continue;
    if (!indexOk(r[1], index)) continue;
    for (const k of Object.keys(query)) {
      if (!r[4].includes(k)) return 'ROUTE_REFUSED';
      const v = query[k];
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return 'ROUTE_REFUSED';
    }
    if (r[5] === null ? body != null : !isRecord(body)) return 'ROUTE_REFUSED';
    if (r[5] && isRecord(body)) for (const bk of Object.keys(body)) if (!r[5].includes(bk)) return 'ROUTE_REFUSED';
    if (r[1] === 'band' || r[1] === 'held') {
      // The N the request names (terminal_id, displayId or the DELETE path) is the host's N.
      const named = kit === 'display' ? query.displayId : own(query, 'terminal_id') ? query.terminal_id : (!path.includes('/terminal/workloads/') && m[1]) || index;
      if (String(named) !== String(index)) return 'ROUTE_REFUSED';
    }
    // A create's body names the host's N as both its terminal_id and its display (hoody-terminal configures the
    // display from the body), so no create reaches a terminal or display above 9999.
    if (kit === 'terminal' && method === 'POST' && path === '/api/v1/terminal/create' && isRecord(body) && (!sameN(body.terminal_id, index) || !sameN(body.display, index))) return 'ROUTE_REFUSED';
    // A launch pins only bash (Open with): the create's shell, when present, is exactly /bin/bash.
    if (r[1] === 'band' && path === '/api/v1/terminal/create' && isRecord(body) && own(body, 'shell') && body.shell !== '/bin/bash') return 'ROUTE_REFUSED';
    if (kit === 'terminal' && method === 'DELETE' && !INCARNATION.test(String(own(query, 'incarnation') ? query.incarnation : ''))) return 'ROUTE_REFUSED';
    if (kit === 'terminal' && index === 0 && method === 'POST' && (String(query.ephemeral) !== 'true' || (own(query, 'terminal_id') && String(query.terminal_id) !== '0') || !isRecord(body) || body.mode !== 'raw')) return 'ROUTE_REFUSED';
    return null;
  }
  return 'ROUTE_REFUSED';
}

/** The query string the old transport appended (keys and values URI-encoded, own keys only). */
export function qs(query: RouteQuery | undefined): string {
  const out: string[] = [];
  for (const k of Object.keys(query ?? {})) out.push(`${encodeURIComponent(k)}=${encodeURIComponent(String((query ?? {})[k]))}`);
  return out.length ? `?${out.join('&')}` : '';
}

// The Board's kit requests, a table of their own so the run-open
// machine's rows above never widen:
//   - A row is [kit, index rule, method, path pattern, allowed query keys, allowed top-level body keys], as above.
//     index rule: 1, or 'board' (BOARD_IDS, 1-8000: the Board's own terminal sessions, below the run-open band).
//   - terminal create: body.terminal_id is the host's N (a query terminal_id too), shell is one of BOARD_SHELLS,
//     ssh_host and ssh_user come together or not at all, ssh_port (1-65535) only with them. No password, key,
//     socks5, user, command, env, cwd or display key ever: ssh asks for a password inside the tile.
//   - terminal DELETE: only the host's own N, always ?incarnation=<32 lowercase hex> (the shell it ends), no body.
//   - terminal restart: execute on the host's own N with ?terminal_id=N&reset=true, optionally &shell= one of
//     BOARD_SHELLS, and exactly the body {command: 'true', incarnation: <32 lowercase hex>}. The terminal checks the
//     incarnation before it resets (409 INCARNATION_MISMATCH, nothing reset, for any other shell or none), so a restart
//     whose outcome is unknown can never restart a later shell, and a repeat after one that landed is refused. A reset
//     rebuilds the session from this request alone: the shell is the one named here (none: the computer's default),
//     and the start folder, user, ssh and desktop settings go back to the computer's defaults, so the Board offers it
//     only on a plain local shell. The command is the fixed no-op the new shell runs; no other key (env, cwd, user,
//     ssh, track, ...) ever. A 409 SHELL_REPLACED comes after the reset (the new shell ended during its display wait):
//     board.ts reads it as unknown.
//   - notes (index 1): read-only GETs of the notebooks and one notebook's nodes.
//   - browser, index 'browser' (BOARD_BROWSER_IDS, 1-7500: browser N shows on display 500 + N, so N stays
//     below the launch band's displays): start a new browser-N with the person's options (a closed query: no instance
//     selector, debugging port or address, display, frame option or launch arguments (they could carry any of
//     those); showBrowser=true always, start only true), and read its DevTools address with start=false only (a read
//     never starts it). No body on either. The start may carry a proxy password: board.ts declares it secret.
//   - code: the one read of the editor's staged and installed extensions (the
//     Board's VS Code extension pick). No query: the edge sets the instance from the address.
//   - boardRoute() returns null when the request is allowed, else 'ROUTE_REFUSED'; nothing refused is sent.
export type BoardKit = 'terminal' | 'notes' | 'browser' | 'code';
export const BOARD_IDS = [1, BAND[0] - 1] as const;
export const BOARD_SHELLS: readonly string[] = ['bash', 'zsh', 'fish', 'sh'];
export const BOARD_BROWSER_IDS = [1, 7500] as const;
/** The browser start options the Board may send (hoody-browser GET /api/v1/browser/start). */
export const BROWSER_START_QUERY: readonly string[] = [
  'start', 'browser', 'chromiumVersion', 'stealth', 'showDevtools', 'fingerprintId', 'userAgent', 'locale', 'timezoneId', 'geolocation',
  'viewport', 'noViewport', 'proxyServer', 'proxyUsername', 'proxyPassword', 'proxyBypass', 'enableQuic', 'enableDnsOverHttps',
  'dnsOverHttpsUrl', 'extensionsStoreIds', 'extensions', 'sessionName', 'showBrowser',
];
/** The codes a refused start keeps (the route is secret: nothing else of the answer survives). */
export const BROWSER_START_CODES: readonly string[] = [
  'VALIDATION_ERROR', 'INSTANCE_SELECTOR_CONFLICT', 'INSTANCE_BACKEND_MISMATCH', 'PORT_IN_USE', 'BROWSER_LAUNCH_ERROR', 'CHILD_PROCESS_ERROR',
  'INSTANCE_START_TIMEOUT', 'INTERNAL_ERROR', 'INSTANCE_QUARANTINED', 'DISPLAY_UNAVAILABLE', 'INSTALL_IN_PROGRESS', 'TIMEOUT',
];
const BROWSER_BOOLEANS: readonly string[] = ['stealth', 'showDevtools', 'noViewport', 'enableQuic', 'enableDnsOverHttps'];
const NOTES_ID = /^[0-9a-z]{24,28}$/;
// No leading '-' (never read as an ssh option), no space or control character.
const SSH_HOST = /^[A-Za-z0-9._:[\]][A-Za-z0-9._:[\]-]{0,252}$/;
const SSH_USER = /^[A-Za-z0-9._][A-Za-z0-9._-]{0,63}$/;

/** Hosts that name this network or this machine, never the open web. */
const LOCAL_SUFFIXES: readonly string[] = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.intranet', '.corp', '.private', '.test', '.invalid'];
/** How long the Board lets the browser kit's browse take before it answers (it waits only for the navigation to
 *  commit). */
export const BROWSE_TIMEOUT_MS = 15_000;

/**
 * An outside web address the Board may open in a computer's browser: an absolute http or https URL of at most 2048
 * characters, with no user or password, whose host is a public name or a public IPv4 address. Refused: every other
 * scheme (data:, javascript:, file: and the like), localhost and the local suffixes, a name with no dot, any IPv6
 * literal, and any IPv4 the platform's own public-address rule refuses (geoLookupIp: private, loopback, link-local,
 * CGNAT, documentation and reserved ranges; the URL parser has already turned 0x7f.1 or 2130706433 into a dotted
 * quad). Returns the URL as the parser writes it and its host, else null.
 */
export function outsideUrl(raw: unknown): { readonly url: string; readonly host: string } | null {
  if (typeof raw !== 'string' || raw.length > 2048 || /[\u0000-\u001f\u007f\s]/.test(raw) || !/^https?:\/\//i.test(raw)) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host.startsWith('[') || !host.includes('.') || host === 'localhost') return null;
  if (LOCAL_SUFFIXES.some((x) => host.endsWith(x))) return null;
  if (/^[0-9.]+$/.test(host)) return geoLookupIp(host) === host ? { url: u.href, host } : null;
  // A name whose last label is all digits or hex-looking is an address in disguise, never a public name.
  if (/^(?:[0-9]+|0x[0-9a-f]*)$/.test(host.slice(host.lastIndexOf('.') + 1))) return null;
  return { url: u.href, host };
}

type BoardRow = readonly [kit: BoardKit, index: 1 | 'board' | 'browser', method: RouteMethod, pattern: RegExp, query: readonly string[], body: readonly string[] | null];

export const BOARD_KIT_ROUTES: readonly BoardRow[] = [
  ['terminal', 'board', 'GET', /^\/api\/v1\/terminal\/sessions$/, [], null],
  ['terminal', 'board', 'POST', /^\/api\/v1\/terminal\/create$/, ['terminal_id'], ['terminal_id', 'shell', 'ssh_host', 'ssh_user', 'ssh_port', 'exclusive']],
  ['terminal', 'board', 'DELETE', /^\/api\/v1\/terminal\/([0-9]{1,5})$/, ['incarnation'], null],
  ['terminal', 'board', 'POST', /^\/api\/v1\/terminal\/execute$/, ['terminal_id', 'reset', 'shell'], ['command', 'incarnation']],
  ['notes', 1, 'GET', /^\/api\/v1\/notes\/notebooks$/, [], null],
  ['notes', 1, 'GET', /^\/api\/v1\/notes\/notebooks\/([0-9a-z]{24,28})\/nodes$/, ['type', 'parentId', 'rootId', 'limit', 'offset'], null],
  ['browser', 'browser', 'GET', /^\/api\/v1\/browser\/start$/, BROWSER_START_QUERY, null],
  ['browser', 'browser', 'GET', /^\/api\/v1\/browser\/devtools-url$/, ['start'], null],
  ['browser', 'browser', 'GET', /^\/api\/v1\/browser\/browse$/, ['url', 'start', 'waitUntil', 'timeoutMs'], null],
  ['code', 1, 'GET', /^\/api\/v1\/code\/extensions\/list$/, [], null],
];

export const inBoard = (n: unknown): boolean => int(n, BOARD_IDS[0], BOARD_IDS[1]);
export const inBrowser = (n: unknown): boolean => int(n, BOARD_BROWSER_IDS[0], BOARD_BROWSER_IDS[1]);
const boolWord = (v: unknown): boolean => typeof v === 'boolean' || v === 'true' || v === 'false';
const isTrue = (v: unknown): boolean => v === true || v === 'true';
const jsonOf = (v: unknown): unknown => { try { return JSON.parse(v as string); } catch { return undefined; } };
/** One start option's value as the Board may send it (BROWSER_START_QUERY). */
function browserValueOk(k: string, v: unknown): boolean {
  if (BROWSER_BOOLEANS.includes(k)) return boolWord(v);
  if (k === 'start' || k === 'showBrowser') return isTrue(v);
  // Every other option is text: a line of at most 2048 characters, no control character.
  if (typeof v !== 'string' || v === '' || v.length > 2048 || /[\u0000-\u001f\u007f-\u009f]/.test(v)) return false;
  if (k === 'browser') return v === 'chromium' || v === 'firefox';
  if (k === 'viewport' || k === 'geolocation') return isRecord(jsonOf(v));
  if (k === 'proxyServer') return /^(?:https?|socks5h?):\/\/\S+$/i.test(v);
  if (k === 'dnsOverHttpsUrl') return /^https:\/\/\S+$/i.test(v);
  return true;
}
/** An integer in [lo, hi] (hi at most 999999999), as a number or as its plain decimal string (core admission sees
 *  every query value as a string). */
const intOrDecimal = (v: unknown, lo: number, hi: number): boolean =>
  typeof v === 'string' ? /^(?:0|[1-9][0-9]{0,8})$/.test(v) && int(Number(v), lo, hi) : int(v, lo, hi);
const has = (o: Record<string, unknown>, k: string): boolean => own(o, k) && o[k] !== undefined;

/** null when the Board's request may leave, else 'ROUTE_REFUSED'. path carries no query string. */
export function boardRoute(kit: unknown, index: unknown, method: unknown, path: unknown, query: unknown, body: unknown): null | 'ROUTE_REFUSED' {
  if (typeof path !== 'string' || path.includes('?') || path.includes('#')) return 'ROUTE_REFUSED';
  if (!isRecord(query)) return 'ROUTE_REFUSED';
  for (const r of BOARD_KIT_ROUTES) {
    if (r[0] !== kit || r[2] !== method) continue;
    const m = r[3].exec(path);
    if (!m) continue;
    if (r[1] === 'board' ? !inBoard(index) : r[1] === 'browser' ? !inBrowser(index) : index !== r[1]) continue;
    for (const k of Object.keys(query)) {
      if (!r[4].includes(k)) return 'ROUTE_REFUSED';
      const v = query[k];
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return 'ROUTE_REFUSED';
    }
    if (r[5] === null ? body != null : !isRecord(body)) return 'ROUTE_REFUSED';
    if (r[5] && isRecord(body)) for (const bk of Object.keys(body)) if (!r[5].includes(bk)) return 'ROUTE_REFUSED';
    if (kit === 'terminal' && method === 'POST' && path.endsWith('/execute')) {
      if (!(isRecord(body) && own(query, 'terminal_id') && intOrDecimal(query.terminal_id, BOARD_IDS[0], BOARD_IDS[1]) && String(query.terminal_id) === String(index))) return 'ROUTE_REFUSED';
      if (!(own(query, 'reset') && isTrue(query.reset))) return 'ROUTE_REFUSED';
      if (has(query, 'shell') && !(typeof query.shell === 'string' && BOARD_SHELLS.includes(query.shell))) return 'ROUTE_REFUSED';
      if (!(body.command === 'true' && typeof body.incarnation === 'string' && INCARNATION.test(body.incarnation))) return 'ROUTE_REFUSED';
    }
    if (kit === 'terminal' && method === 'POST' && path.endsWith('/create') && isRecord(body)) {
      if (body.terminal_id !== index) return 'ROUTE_REFUSED';
      if (own(query, 'terminal_id') && (!intOrDecimal(query.terminal_id, BOARD_IDS[0], BOARD_IDS[1]) || String(query.terminal_id) !== String(index))) return 'ROUTE_REFUSED';
      if (has(body, 'shell') && !(typeof body.shell === 'string' && BOARD_SHELLS.includes(body.shell))) return 'ROUTE_REFUSED';
      const host = has(body, 'ssh_host');
      if (host !== has(body, 'ssh_user')) return 'ROUTE_REFUSED';
      if (host && !(typeof body.ssh_host === 'string' && SSH_HOST.test(body.ssh_host) && typeof body.ssh_user === 'string' && SSH_USER.test(body.ssh_user))) return 'ROUTE_REFUSED';
      if (has(body, 'ssh_port') && !(host && int(body.ssh_port, 1, 65535))) return 'ROUTE_REFUSED';
      // exclusive:true makes a create on a held number answer SESSION_EXISTS and change nothing, so a retry after
      // an unknown outcome never resets that session's config. A boolean only.
      if (has(body, 'exclusive') && typeof body.exclusive !== 'boolean') return 'ROUTE_REFUSED';
    }
    if (kit === 'terminal' && method === 'DELETE' && m[1] !== String(index)) return 'ROUTE_REFUSED';
    // The Board deletes only the shell it chose (the terminal answers 409 INCARNATION_MISMATCH, nothing deleted,
    // for any other), so a DELETE whose outcome is unknown can never end a later shell on that number.
    if (kit === 'terminal' && method === 'DELETE' && !(own(query, 'incarnation') && typeof query.incarnation === 'string' && INCARNATION.test(query.incarnation))) return 'ROUTE_REFUSED';
    if (kit === 'browser' && path.endsWith('/devtools-url') && !(own(query, 'start') && (query.start === false || query.start === 'false'))) return 'ROUTE_REFUSED';
    // An outside address in a new tab of a browser already running: never a start (start=false), never an existing tab
    // (no tabId, no onlyIfNotExists: the kit opens a new one), only an address outsideUrl() admits, exactly as it
    // writes it.
    if (kit === 'browser' && path.endsWith('/browse')) {
      if (!(own(query, 'start') && (query.start === false || query.start === 'false'))) return 'ROUTE_REFUSED';
      const o = outsideUrl(query.url);
      if (!o || o.url !== query.url) return 'ROUTE_REFUSED';
      // Both always sent: an omitted one would take the kit's own defaults (load, its long timeout).
      if (!has(query, 'waitUntil') || query.waitUntil !== 'commit') return 'ROUTE_REFUSED';
      if (!has(query, 'timeoutMs') || !intOrDecimal(query.timeoutMs, 1000, 30_000)) return 'ROUTE_REFUSED';
    }
    if (kit === 'browser' && path.endsWith('/start')) {
      // Always shown: a fingerprint profile may default to a hidden browser, so its absence is not enough.
      if (!(own(query, 'showBrowser') && isTrue(query.showBrowser))) return 'ROUTE_REFUSED';
      for (const k of Object.keys(query)) if (!browserValueOk(k, query[k])) return 'ROUTE_REFUSED';
      if (has(query, 'viewport') && has(query, 'noViewport')) return 'ROUTE_REFUSED';
    }
    if (kit === 'notes' && m[1] !== undefined) {
      if (own(query, 'type') && !(typeof query.type === 'string' && /^[A-Za-z_-]{1,32}$/.test(query.type))) return 'ROUTE_REFUSED';
      for (const k of ['parentId', 'rootId']) if (own(query, k) && !(typeof query[k] === 'string' && NOTES_ID.test(query[k] as string))) return 'ROUTE_REFUSED';
      if (own(query, 'limit') && !intOrDecimal(query.limit, 1, 100)) return 'ROUTE_REFUSED';
      if (own(query, 'offset') && !intOrDecimal(query.offset, 0, 999999999)) return 'ROUTE_REFUSED';
    }
    return null;
  }
  return 'ROUTE_REFUSED';
}
