// What a person may see, and copy for support, about one failed call (error details). errorInfo
// copies an allow-list of facts out of any rejection or outcome: never its message, data, details, body, headers
// (other than the API's trace id), tokens, filled paths or query values. Words are the kit's (kit/states/errorWords.ts);
// core only states facts. This file is the ErrorInfo contract.
//
// C9: a rejection or outcome that may have gone through stays 'pending' here whatever its status says, so no
// surface can read "failed" into a change that may have applied.
import { outcomeOf } from './api';
import { isPublishedCode } from './error-codes.gen';
import { routeLeaves } from './routePerms';
import { isChangeRoute, isDeclaredCode, routeOf } from './routes';
import { traceIdOf } from './trace-id';
import { hostEnv } from './host-env';

export type ErrorOutcome = 'failed' | 'pending' | 'not_sent' | 'stale' | 'cancelled';

export interface ErrorInfo {
  readonly outcome: ErrorOutcome;
  /** The HTTP status; null when no answer arrived. */
  readonly status: number | null;
  /** A fixed code only: one the Hoody API or a kit program publishes (error-codes.gen.ts), one of core's own
   *  (TOKEN_SESSION_REFUSED, CANCELLED, …) or one a declared route lists; anything else (an answer can echo what was
   *  sent in its code field too) is null. Read raw for the outcome first (C9). */
  readonly code: string | null;
  /** Always null from core: an API message can echo what was sent (a submitted alias, an id), and a copied
   *  rejection cannot prove its message is the API's rather than the Hub's own. Kept in the contract for words a
   *  later change allows; the kit's words come from status, code and outcome. */
  readonly message: null;
  /** The API's X-Trace-Id: a UUID or 16-64 hex (trace-id.ts), else null. */
  readonly traceId: string | null;
  /** "METHOD /declared/{template}" of a route defineRoute declared (routes.ts routeOf), else null: never a
   *  filled path or a query. */
  readonly route: string | null;
  /** When it happened, ISO UTC. */
  readonly at: string;
  /** The page id (or the first segment of the page's hash path). */
  readonly page: string | null;
  /** The server's wait before trying again, in ms; null when it named none. */
  readonly retryAfterMs: number | null;
  /** A token session's refusal: the permission leaf the token lacks (a routePerms.ts leaf only), else null. */
  readonly perm: string | null;
}

const built = new WeakSet<object>();

/** True for an ErrorInfo errorInfo built (a look-alike object is not one). */
export function isErrorInfo(x: unknown): x is ErrorInfo {
  return !!x && typeof x === 'object' && built.has(x);
}

const CODE = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const PAGE = /^[a-z][a-z0-9-]{0,39}$/;
const OUTCOMES: readonly string[] = ['failed', 'pending', 'not_sent', 'stale'];

function str(v: unknown, re: RegExp): string | null {
  return typeof v === 'string' && re.test(v) ? v : null;
}

// The page from the host's route (hostEnv().pageRoute; web: location.hash), never a browser global read here.
function currentPage(): string | null {
  try {
    const seg = (hostEnv().pageRoute ?? '').replace(/^#\/?/, '').split(/[/?#]/)[0] ?? '';
    return PAGE.test(seg) ? seg : null;
  } catch {
    return null;
  }
}

// Core's own codes (its refusals before a send, its transports', the kit legs' and run-open's kinds and results;
// STANDALONE_HANDOFF and STANDALONE_SETTINGS_HANDOFF are shared.js's unsent refusals of a payment route and of a
// billing settings switch in the one-file Hub):
// fixed words, never a value.
// Whoever adds a code core emits adds it here; errors.test.ts checks the code sites its scan can see and every
// run-open MESSAGES key.
const CORE_CODES: ReadonlySet<string> = new Set([
  'ACCEPT_INVALID', 'ACCOUNT_CHANGED', 'AGENT_REALM_IN_PATH', 'AGENT_REALM_REQUIRED', 'ALIAS_INVALID', 'BAD_AMOUNT', 'BAD_API_BASE',
  'BAD_CHECKOUT_URL', 'BAD_JSON', 'BAD_LIST', 'BAD_QUOTE', 'BODY_INVALID', 'BOOT_TOKEN_FAILED', 'BUSY', 'CALL_FAILED', 'CANCELLED', 'CAS_REQUIRED',
  'FILE_CHANGED', 'FILE_UNREADABLE', 'FRAMED_ACTION_REFUSED', 'FULL', 'HEADER_NOT_ALLOWED', 'HELD', 'HELD_BY_OTHER', 'HOLDS_FULL',
  'IDEMPOTENCY_KEY_INVALID', 'IDEMPOTENCY_REQUEST_IN_PROGRESS', 'IF_MATCH_INVALID', 'INPUT_INVALID',
  'MAXBYTES_INVALID', 'MEMBERSHIP_ON_BASE_ONLY', 'MEMBERSHIP_SET_INVALID', 'NAME_TAKEN', 'NETWORK', 'NOT_ALLOWED',
  'NOT_AUDIO', 'NOT_DURABLE', 'NOT_JSON', 'NOT_SSE', 'NOT_WIRED', 'NO_ACCOUNT', 'NO_AGENT_URL', 'NO_COORDINATION', 'NO_FILES', 'NO_KIT_URL', 'NO_SOCKET', 'OPTION_UNKNOWN', 'OP_DEADLINE',
  'OUT_OF_RANGE', 'PATH_INVALID', 'READ_BACK_FIRST', 'RECORD_FAILED', 'REFRESH_OWNER_REQUIRED', 'REFRESH_UNAVAILABLE', 'ROUTE_BODY',
  'ROUTE_INVALID', 'ROUTE_NOT_ALLOWED', 'ROUTE_NOT_DECLARED', 'ROUTE_PARAMS', 'ROUTE_QUERY', 'ROUTE_REFUSED',
  'ROUTE_UNKNOWN',
  'SCOPE_UNSUPPORTED', 'SCRUB_FAILED', 'SCRUB_INVALID', 'SCRUB_OWN', 'SECRET_ROUTE', 'SOCKET_REFUSED', 'STALE', 'STALE_CONTEXT', 'STANDALONE_HANDOFF', 'STANDALONE_SETTINGS_HANDOFF',
  'STORE_UNAVAILABLE', 'STORE_UNREGISTERED', 'TICKET_REFUSED', 'TICKET_REQUIRED', 'TIMEOUT', 'TOKEN_LACKS', 'TOOL_ERROR', 'TOKEN_SESSION_REFUSED', 'TOO_LARGE', 'UNAVAILABLE', 'WORKER_FAILED', 'aborted',
  'access_refused', 'args_unsupported', 'bad_ip', 'bad_prefix', 'bad_request', 'busy', 'cancelled', 'couldnt_start',
  'daemon_paused', 'done', 'exited_error', 'fee_changed', 'folder_refused', 'gate_decision_pending', 'host_bits', 'in_progress', 'invalid_handle',
  'invalid_options', 'ipv6', 'needs_pick', 'needs_update', 'no_app', 'no_candidates', 'not_durable', 'not_sent', 'not_started',
  'other_user', 'policy_denied', 'port_in_use', 'preflight_refused', 'private', 'quota', 'rate_limited', 'ready',
  'redirected', 'refused', 'remove_unconfirmed', 'removed', 'resolve_failed', 'reused', 'running', 'running_plain', 'several_apps', 'shell_unavailable', 'shell_unsupported', 'source_warming',
  'sources_unavailable', 'staging_unavailable', 'stale', 'start_unconfirmed', 'started', 'stop_unconfirmed',
  'terminal_replaced', 'too_large', 'too_many_apps', 'tracker_lost', 'unavailable', 'unknown', 'unreachable',
  'unsafe_setup', 'wrong_computer',
  // The terminal demo's (`hoody hub --demo`, sample data) refusal of every change, before anything is sent.
  'DEMO_READ_ONLY',
  // signin.ts's refusal reasons (password sign-in, reset, sign-up before any session)
  'address', 'banned', 'challenge-expired', 'closed', 'credentials', 'domain', 'ended', 'expired', 'framed', 'invalid', 'network',
  'no-api', 'otp', 'paused', 'retry', 'stopped', 'storage', 'unverified',
  // The fixture transport's own codes (transport.ts): a build has no fixture transport, so they fold away with it
  // (hub:build's fixture-marker scan, e2e-live/fixture-markers.ts).
  ...(__HUB_FIXTURES__ ? ['FIXTURE_MODE', 'NO_FIXTURE'] : []),
]);

function codeOf(v: unknown): string | null {
  return typeof v === 'string' && CODE.test(v) && (isPublishedCode(v) || CORE_CODES.has(v) || isDeclaredCode(v)) ? v : null;
}

/** The facts of one rejection or outcome (any value: a HubError, a SourceError, a SourceResult, a locked outcome,
 *  a query.ts MutationResult, a thrown Error, nothing). An ErrorInfo passes through unchanged. */
export function errorInfo(e: unknown, opts: { page?: string; now?: Date } = {}): ErrorInfo {
  if (isErrorInfo(e)) return e;
  const top = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
  // An outcome a source or lock already decided (SourceResult.outcome, useLockedChange) is kept; pending wins
  // over everything, cancelled only over a refusal ('failed') or an undecided one, never over stale or not_sent.
  const decided = typeof top.outcome === 'string' && OUTCOMES.includes(top.outcome) ? (top.outcome as ErrorOutcome) : null;
  // A query.ts MutationResult keeps the rejection's facts in `error`: read them there, the outcome from the top.
  const inner = decided && top.error && typeof top.error === 'object' ? top.error : null;
  const obj = inner ?? (e && typeof e === 'object' ? e : null);
  const x = (obj ?? {}) as Record<string, unknown>;
  const route = routeOf(x.route);
  const change = isChangeRoute(x.route) || x.change === true;
  const status = typeof x.status === 'number' && Number.isInteger(x.status) && x.status >= 100 && x.status < 600 ? x.status : null;
  const raw = outcomeOf(obj, change);
  const outcome: ErrorOutcome = decided === 'pending' || raw === 'pending' ? 'pending'
    : (x.cancelled === true || top.cancelled === true) && (decided === null || decided === 'failed') ? 'cancelled'
    : decided ?? raw;
  const ms = typeof x.retryAfterMs === 'number' ? x.retryAfterMs : typeof x.retryAfter === 'number' ? x.retryAfter * 1000 : null;
  const info: ErrorInfo = Object.freeze({
    outcome,
    status,
    code: codeOf(x.code),
    message: null,
    traceId: traceIdOf(x.traceId),
    route,
    at: (opts.now ?? new Date()).toISOString(),
    page: opts.page !== undefined ? str(opts.page, PAGE) : currentPage(),
    retryAfterMs: ms !== null && Number.isFinite(ms) && ms >= 0 ? Math.round(ms) : null,
    perm: typeof x.perm === 'string' && routeLeaves().includes(x.perm) ? x.perm : null,
  });
  built.add(info);
  return info;
}

/** How a page id reads in Details: the app registers it once at boot (setPageResolver); core holds only the id. */
export interface PageResolver {
  /** The page's shown title, or null when the id names no page. */
  title(id: string): string | null;
  /** The in-app link to the page ('#/…'), or null. */
  href(id: string): string | null;
}

let pageResolver: PageResolver | null = null;

/** The app calls this once at boot with the discovered pages (app/page-resolver.ts); null unregisters (tests). */
export function setPageResolver(r: PageResolver | null): void {
  pageResolver = r;
}

/** The title and link Details show for a page id. With no resolver, or one that names no page or throws, the
 *  title is the plain id and there is no link. A link is kept only as an in-app '#/' hash. */
export function errorPage(id: string): { readonly title: string; readonly href: string | null } {
  let title: string | null = null;
  let href: string | null = null;
  if (pageResolver) {
    try { const t = pageResolver.title(id); title = typeof t === 'string' && t.trim() ? t : null; } catch { title = null; }
    // A page the resolver cannot name gets no link either.
    if (title !== null) try { const h = pageResolver.href(id); href = typeof h === 'string' && h.startsWith('#/') ? h : null; } catch { href = null; }
  }
  return Object.freeze({ title: title ?? id, href });
}
