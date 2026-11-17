// api.ts: the one request helper.
//
// Contract:
//   - api(route, input) sends one declared route (routes.ts). Anything else is refused unsent.
//   - Scopes. base: this page's Hoody API. realm: the captured realm's host (hubApiBase). agent: the
//     computer's agent at its named URL, credentials included, never a bearer or X-Hoody-* header, realm=
//     as the route's realm kind allows (default: the captured realm, or a token session's pin). kit: a Hoody
//     Kit program (kit.ts). The host is the route table's alone: account-wide routes (BASE_ONLY) always go
//     to the base host, a membership move (realm_ids) only as a base PATCH/PUT of the full new set, a Global
//     Bot create only on base. A token session sends every Hoody API call to its pinned realm's host and
//     refuses account-only routes unsent (TOKEN_SESSION_REFUSED), and a call its token lacks the leaf for
//     (routePerms.ts, token.ts tokenLack) unsent as TOKEN_LACKS with `perm`.
//   - A change is any method but GET and HEAD, and a kit GET its route declares a change (routes.ts change: a
//     create-or-get); its rejections carry change: true.
//   - Framed pages refuse every change, in every scope, and the sensitive reads (shared.js's list), unsent.
//   - alive(ctx) is checked before every send, the refresh retry and the 2FA retry; the 2FA retry keeps the
//     captured host. A call whose context is dead is not sent: superseded {status: 401, superseded} when the
//     session changed, else stale.
//   - C9 outcomes. A read's answer that arrives after the context died is dropped (kind 'stale'). A change that
//     was sent and whose answer is lost, late, any 5xx, a 2xx the transport could not use, or any answer at all
//     (a refusal included) that arrives after the context died, is pending (kind 'pending'): it may have gone
//     through (a refusal may answer a repeat of an earlier send whose outcome is unknown), it is never reported as
//     cancelled, and it must never be resent blindly; read it back. Only a change that was never sent reads
//     not_sent. While the context lives, a 4xx is a definite refusal, except a 409 saying the same request is still
//     running, or a 404 or 409 whose code the route lists in unknownCodes (routes.ts): that change may be under
//     way, so it is pending too, decided before any 2FA handling. Pending shows one notice per context (onPending) unless the caller recovers it itself
//     while its context lives (recovers).
//   - Rejections carry kind 'not_sent' | 'stale' | 'pending' for those outcomes; an answered refusal is
//     passed on as its transport made it (a copy). A secret call (route.secret or a scrub) has its
//     rejection rebuilt from safe fields only: no data, details or message, and a code only when it is one
//     of the route's fixed codes. A scrub sees every raw success answer exactly once, before the liveness
//     check, also an answer that is then dropped; a scrub that throws settles the call with no result.
//   - Every Hoody API change is sent as the user this page shows (or the captured account before the
//     identity is known) and goes through the 2FA step: OTP_REQUIRED asks the shell's prompt for a code and
//     retries with otp_code, until the user cancels. A token session cannot do 2FA.
//   - Only a request that reached the send point (onSend) can be pending, and only those are open for the
//     sign-out warning (openMutations).
import { alive, capture, identity, page, sessionGone, tokenRealm, tokenSession, type Ctx } from './ctx';
import { admit, agentRealm, rejection, send as kitSend, type KitPlan } from './kit';
import { answerTickets, settleTickets, type SpentTickets } from './ticket';
import { otpPrompt } from './otp';
import { build, IF_MATCH, IF_MATCH_ETAG, isChangeCall, isDeclared, type CallInput, type Route } from './routes';
import { API_BASE, hubApiBase, isFramed, sessionUid, shared, type ApiCallOpts, type HubErrorBase } from './session';
import { tokenLack, tokenLacked } from './token';
import { routeLabel, traceIdOf } from './trace-id';
import { hostEnv } from './host-env';
import { lockoutSeconds } from './lockout';
import { transport } from './transport';
import { isRealmId } from './realm-id';

export interface HubError extends HubErrorBase {
  /** Outcome kinds set here: 'not_sent', 'stale', 'pending'. A transport's answered refusal keeps its own kind. */
  kind?: string;
  /** A token session's refusal (TOKEN_LACKS unsent, or a 403 token.ts named): the permission leaf the token lacks,
   *  null when nothing names it. A routePerms.ts leaf only, never server text. */
  perm?: string | null;
  /** An agent route's refuses code (routes.ts): the agent said it refused before applying anything. A definite refusal
   *  whatever the status (a 5xx or a 200 tool envelope included); set by kit.ts only. */
  notApplied?: boolean;
  /** The shell's toast named this refusal (token.ts notice 'notAllowed'): a page's error toast steps aside for it. */
  tokenSaid?: true;
  /** A keepDetails route's (routes.ts) pending answer whose details were over DETAILS_MAX: none are kept (keptDetails). */
  detailsDropped?: true;
}

export type Outcome = 'done' | 'pending' | 'failed' | 'not_sent' | 'stale';

// ---- host table ----
// Always the base host, whatever scope a caller names: account-wide data and the routes a realm host
// refuses with 403 (notification acks, github-bonus, retry-setup, auth/sessions, runtime). The referral program
// is the account's own: its C9 hold is one hold whatever realm the view shows. So are
// the member's support tickets (the API refuses every member route on a realm host).
export const BASE_ONLY: readonly RegExp[] = [
  /^\/realms(?:\/|$)/, /^\/auth\/tokens(?:\/|$)/, /^\/vault(?:\/|$)/, /^\/users(?:\/|$)/,
  /^\/notifications(?:\/|$)/, /^\/wallet(?:\/|$)/, /^\/offers(?:\/|$)/, /^\/reservations(?:\/|$)/,
  /^\/subserver-plans(?:\/|$)/, /^\/servers\/available$/, /^\/servers\/[^/]+\/(?:rent|runtime)$/,
  /^\/rentals\/[^/]+\/runtime$/, /^\/referrals(?:\/|$)/, /^\/support(?:\/|$)/,
];
/** A Hoody API change to realm-owned data (its C9 lock is filed under the realm, query.ts changeScope): a
 *  realm-host route that is not base-only. A base route, or one the table sends to the base host, is
 *  account-wide. Agent and kit routes act on a computer: changeScope files them under it, and under the realm
 *  only when the call sends one (an agent route whose realm kind is not 'none'). */
export function realmScopedRoute(route: Route): boolean {
  return route.scope === 'realm' && !route.baseOnly && !BASE_ONLY.some((re) => re.test(route.path));
}
const MEMBERSHIP = /^\/(?:projects\/[^/]+\/)?computers\/[^/]+$/;

function has(o: unknown, k: string): o is Record<string, unknown> {
  return !!o && typeof o === 'object' && Object.hasOwn(o, k);
}
function globalBot(m: string, path: string, body: unknown): boolean {
  if (m !== 'POST' || path !== '/bot-urls' || !has(body, 'bot')) return false;
  const b = body.bot as Record<string, unknown> | null;
  return !!b && typeof b === 'object' && b.realm === 'global';
}

/** The Hoody API host for (method, path, body, scope, realm): {base} or {refused: code}. */
export function hoodyRoute(m: string, path: string, body: unknown, scope: 'base' | 'realm', realm: string, baseOnly = false): { base: string } | { refused: string } {
  if (tokenSession()) return tokenRoute(m, path, body);
  // Moving a container between realms: a realm host merges its own realm back in, so only a base PATCH
  // with the full new realm_ids set moves it.
  if ((m === 'PATCH' || m === 'PUT') && MEMBERSHIP.test(path) && has(body, 'realm_ids')) {
    const ids = body.realm_ids;
    if (!Array.isArray(ids) || !ids.length || ids.some((r) => !isRealmId(r))) return { refused: 'MEMBERSHIP_SET_INVALID' };
    return scope === 'base' ? { base: API_BASE } : { refused: 'MEMBERSHIP_ON_BASE_ONLY' };
  }
  if (baseOnly || BASE_ONLY.some((re) => re.test(path))) return { base: API_BASE };
  // Global Bots are created on the base host only.
  if (globalBot(m, path, body)) return { base: API_BASE };
  return { base: scope === 'realm' ? hubApiBase(realm) : API_BASE };
}

// Under a token pin both Hoody API scopes go to the pinned realm's host (base for `all`). Only the identity
// read may cross BASE_ONLY; every other account route, a membership move and a Global Bot create are refused.
function tokenRoute(m: string, path: string, body: unknown): { base: string } | { refused: string } {
  const pin = tokenRealm();
  const base = pin === 'all' || !pin ? API_BASE : hubApiBase(pin);
  if (m === 'GET' && path === '/users/auth/me') return { base };
  if (MEMBERSHIP.test(path) && has(body, 'realm_ids')) return { refused: 'TOKEN_SESSION_REFUSED' };
  if (globalBot(m, path, body)) return { refused: 'TOKEN_SESSION_REFUSED' };
  if (BASE_ONLY.some((re) => re.test(path))) return { refused: 'TOKEN_SESSION_REFUSED' };
  return { base };
}

// ---- outcome helpers ----
function refusal(code: string): HubError {
  return { kind: 'not_sent', code, notSent: true };
}

// A dead context's rejection: the session ended or changed → the superseded refusal {status: 401,
// superseded: true}; only the generation moved → {stale: true}. Neither is pending.
function gone(ctx: Ctx, notSent: boolean): HubError {
  const e: HubError = sessionGone(ctx) ? { ...shared().supersededAuthError() } : { stale: true };
  e.kind = notSent ? 'not_sent' : 'stale';
  if (notSent) e.notSent = true;
  else if (e.stale) e.notSent = false;
  return e;
}

// A copy of `e` that carries notSent exactly when nothing of the operation went out.
function sentAs(e: unknown, notSent: boolean): unknown {
  if (!e || typeof e !== 'object') return notSent ? { kind: 'not_sent', notSent: true } : e;
  const c: HubError = Object.assign({}, e as HubError);
  if ((e as Error).message !== undefined) c.message = (e as Error).message;
  if (notSent) { c.notSent = true; if (!c.kind) c.kind = 'not_sent'; } else { delete c.notSent; if (c.kind === 'not_sent') delete c.kind; }
  return c;
}

/**
 * A sent change whose answer does not say whether it was applied: no answer (network, timeout, an abort
 * after the send), any 5xx, or a rejection carrying a 2xx. Every 4xx is a definite refusal (C9), except a 404 or 409
 * whose route lists its code in unknownCodes: api() reads the route and makes that one pending too (this function
 * does not; listedUnderWay).
 */
export function unknownOutcome(e: unknown): boolean {
  const x = e as HubError | null;
  if (x && x.notApplied === true) return false;
  return !x || typeof x.status !== 'number' || (x.status === 0 && !x.cancelled) || x.code === 'TIMEOUT'
    || (x.status >= 500 && x.status < 600) || (x.status >= 200 && x.status < 300);
}

/** The most JSON bytes of an answer's details a keepDetails route keeps. */
export const DETAILS_MAX = 8192;
/**
 * The details a keepDetails route's (routes.ts) rejection keeps: a plain copy of the agent's details object when its JSON
 * is at most DETAILS_MAX bytes, else none and detailsDropped (never a part of it). Nothing for any other route, and
 * nothing for an empty or missing object.
 */
export function keptDetails(route: Pick<Route, 'keepDetails' | 'scope'>, e: unknown): { details?: Record<string, unknown>; detailsDropped?: true } {
  if (route.keepDetails !== true || route.scope !== 'agent') return {};
  const d = (e as HubError | null)?.details;
  if (!d || typeof d !== 'object' || Array.isArray(d) || !Object.keys(d).length) return {};
  let json: string;
  try { json = JSON.stringify(d); } catch { return { detailsDropped: true }; }
  if (typeof json !== 'string' || new TextEncoder().encode(json).length > DETAILS_MAX) return { detailsDropped: true };
  return { details: JSON.parse(json) as Record<string, unknown> };
}

// A 409 that says the same request is still running (the agent's in_progress for a key whose first request has
// not finished; the API's IDEMPOTENCY_REQUEST_IN_PROGRESS; the agent's gate_decision_pending, a decision for
// the gate still being applied): the first send may still apply. Fixed codes that carry nothing the request sent.
const STILL_RUNNING = ['in_progress', 'IDEMPOTENCY_REQUEST_IN_PROGRESS', 'gate_decision_pending'];

// A secret call's rejection: rebuilt from fields that cannot carry what the request sent. Its code survives when
// the route lists it (codes or unknownCodes), or when it says the request is still running (STILL_RUNNING: outcomeOf
// needs it).
const SAFE_FLAGS = ['notSent', 'stale', 'superseded', 'cancelled', 'framed', 'pending', 'notApplied'] as const;
function bareRejection(e: HubError, codes: readonly string[] | null, unknownCodes: readonly string[] | null): HubError {
  const keep = typeof e.code === 'string' && ((codes && codes.includes(e.code)) || (unknownCodes && unknownCodes.includes(e.code)) || STILL_RUNNING.includes(e.code));
  const c: HubError = { code: keep ? e.code : null };
  if (typeof e.kind === 'string' && /^[a-z_]{1,32}$/.test(e.kind)) c.kind = e.kind;
  for (const k of ['status', 'retryAfter', 'retryAfterMs'] as const) if (typeof e[k] === 'number') (c as Record<string, unknown>)[k] = e[k];
  for (const k of SAFE_FLAGS) if (e[k] === true) c[k] = true;
  // The API's trace id carries nothing the request sent (trace-id.ts): support looks the call up by it.
  const tid = traceIdOf(e.traceId);
  if (tid) c.traceId = tid;
  return c;
}

/** The suspended account's answer: 403 ACCOUNT_BANNED, strict on both (Hub.bannedError). */
export function bannedError(err: unknown): boolean {
  const e = err as HubError | null;
  return !!(e && e.status === 403 && e.code === 'ACCOUNT_BANNED');
}

/**
 * A rejection's outcome for the UI. change: the call was a change, so SCRUB_FAILED (its answer arrived but
 * could not be read) means it was made: pending (the old adapters' outcome(x, isChange)); and a 409 saying the
 * same request is still running is pending, never failed.
 */
export function outcomeOf(err: unknown, change = false): Exclude<Outcome, 'done'> {
  const e = err as HubError | null;
  if (e && (e.kind === 'pending' || e.pending === true)) return 'pending';
  if (change && e && e.code === 'SCRUB_FAILED') return 'pending';
  if (change && e && e.status === 409 && typeof e.code === 'string' && STILL_RUNNING.includes(e.code)) return 'pending';
  if (e && (e.kind === 'stale' || (e.stale === true && !e.notSent))) return 'stale';
  if (e && (e.kind === 'not_sent' || e.notSent === true)) return 'not_sent';
  return 'failed';
}

// ---- notices and hooks (the shell wires them) ----
export interface PendingNotice {
  /** The realm the change was sent in ("check in <realm>"). */
  readonly realm: string;
  /** Sign-out started while the change was in flight. */
  readonly signingOut: boolean;
}
/** Where the change was sent from, beside the notice (the notice itself stays realm + signingOut). */
export interface PendingFrom {
  /** The view generation at capture (ctx.vgen): a shell that cannot see the page's own outcome tells the person once
   *  the view has changed since. */
  readonly vgen: number;
  /** The context generation at capture (ctx.gen): a switch or account change since then took the page's outcome too. */
  readonly gen: number;
  /** The account at capture (ctx.account): a notice is never shown to another account. */
  readonly account: string | null;
}
const pendingListeners = new Set<(n: PendingNotice, from: PendingFrom) => void>();

/** One notice per context that has a change that may have gone through. */
export function notifyPending(ctx: Ctx | null | undefined, signingOut = false): void {
  if (!ctx || ctx.pendingShown) return;
  ctx.pendingShown = true;
  const n: PendingNotice = Object.freeze({ realm: ctx.realm, signingOut });
  const from: PendingFrom = Object.freeze({ vgen: ctx.vgen, gen: ctx.gen, account: ctx.account });
  for (const l of [...pendingListeners]) { try { l(n, from); } catch { /* the listener's own */ } }
}

export function onPending(l: (n: PendingNotice, from: PendingFrom) => void): () => void {
  pendingListeners.add(l);
  return () => { pendingListeners.delete(l); };
}

let bannedHandler: (() => void) | null = null;
/** lifecycle.ts: the account this page shows is suspended (a Hoody API 403 ACCOUNT_BANNED). */
export function setBannedHandler(fn: (() => void) | null): void { bannedHandler = fn; }

let tokenRefusal: ((e: HubError, route: Route, path: string, change: boolean, raw: HubError) => HubError) | null = null;
/** The token-session module: a Hoody API 401/403 in a token session becomes its refusal. */
export function setTokenRefusal(fn: ((e: HubError, route: Route, path: string, change: boolean, raw: HubError) => HubError) | null): void { tokenRefusal = fn; }

export interface OtpPrompt {
  /** Ask for a 2FA code; null = cancelled. One prompt at a time (a second caller gets null). retry: the API
   *  refused the code just sent (wrong or expired), so this ask follows it. */
  ask(o?: { retry: boolean }): Promise<string | null>;
  /** The attempt sent with the last code settled without asking again (done, failed or stopped). */
  settle?(): void;
  /** Close an open prompt without an answer (realm switch, sign-out). */
  cancel(): void;
}
// Default: otp.ts, the prompt state the shell renders. null = no prompt (every OTP_REQUIRED is a cancel).
let otp: OtpPrompt | null = otpPrompt;
export function setOtpPrompt(p: OtpPrompt | null): void { otp = p; }
export function cancelOtpPrompt(): void { try { otp?.cancel(); } catch { /* the prompt's own */ } }

// ---- open changes (sign-out warns about them) ----
const open: Ctx[] = [];

// The transport's own timeout (timeoutMs) starts at the send, after a token refresh that may hang. So one call
// (refresh, send, the transport's internal retries; never a 2FA prompt, which sits between calls) is bounded too:
// past timeoutMs + this slack it rejects TIMEOUT, and a request not yet out never leaves (its alive turns false
// before the wire). Not sent by then = not sent (the error path says so); sent = unknown, as any timeout.
const CALL_SLACK_MS = 5000;
function boundedCall(m: string, url: string, b: unknown, opts: ApiCallOpts, meta: Parameters<ReturnType<typeof transport>['hoody']>[4]): Promise<unknown> {
  const ms = typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0 ? opts.timeoutMs + CALL_SLACK_MS : 0;
  if (!ms) return transport().hoody(m, url, b, opts, meta);
  let over = false;
  const inner = opts.alive;
  const o: ApiCallOpts = { ...opts, alive: () => !over && (typeof inner !== 'function' || inner()) };
  return new Promise<unknown>((resolve, reject) => {
    const t = setTimeout(() => { over = true; reject({ status: 0, code: 'TIMEOUT' } as HubError); }, ms);
    transport().hoody(m, url, b, o, meta).then((v) => { clearTimeout(t); resolve(v); }, (e: unknown) => { clearTimeout(t); reject(e); });
  });
}
export function openMutations(): readonly Ctx[] { return open.slice(); }

/** A 404 or 409 whose code the route lists in unknownCodes (routes.ts): the change may still be under way. */
function listedUnderWay(e: unknown, unknownCodes: readonly string[] | null | undefined): boolean {
  const x = e as HubError | null;
  return !!(x && (x.status === 404 || x.status === 409) && typeof x.code === 'string' && unknownCodes && unknownCodes.includes(x.code));
}
/** A definite refusal (C9: the server refused, so nothing changed): a 4xx, a 412/428 precondition refusal included, but
 *  not a 409 saying the same request is still running (STILL_RUNNING) nor a 404/409 the route lists (listedUnderWay). */
function definiteRefusal(e: unknown, unknownCodes: readonly string[] | null | undefined): boolean {
  const x = e as HubError | null;
  return !!(x && typeof x.status === 'number' && x.status >= 400 && x.status < 500
    && !(x.status === 409 && typeof x.code === 'string' && STILL_RUNNING.includes(x.code)) && !listedUnderWay(x, unknownCodes));
}

// ---- 2FA ----
// Only the explicit challenge asks for a code. INVALID_OTP_CODE asks again only when the code it refuses is
// the prompt's own (otp_code was sent); otherwise it is the endpoint's own `code` field, answered to its form
// (resending that wrong code beside a new otp_code would spend attempts). Messages are never matched.
function isOtpRequired(e: unknown, sentCode: boolean): boolean {
  const x = e as HubError | null;
  return !!(x && (x.code === 'OTP_REQUIRED' || (sentCode && x.code === 'INVALID_OTP_CODE')));
}

// apiCall that answers OTP_REQUIRED with the prompt and retries with otp_code. Every attempt is bound to
// the operation's user (owner) or page identity (session); once storage names another, no prompt, no retry.
function withOtp(m: string, url: string, body: unknown, opts: ApiCallOpts, meta: Parameters<ReturnType<typeof transport>['hoody']>[4], unknownCodes: readonly string[] | null = null): Promise<unknown> {
  const sess = opts.session || null;
  const owner = sess ? sess.uid : (opts.owner ?? null);
  const bound: ApiCallOpts = { ...opts, owner };
  const held = () => (sess ? shared().holdsIdentity(sess) : !!owner && sessionUid(null) === String(owner));
  function attempt(extra?: Record<string, string>): Promise<unknown> {
    // A bodyless change stays bodyless until the prompt adds its code.
    const b = extra ? Object.assign({}, (body as object) || {}, extra) : body;
    // The prompt shows "checking" from the code's submit until this attempt settles; every way out of an
    // attempt that carried a code settles it, except asking again (which replaces the checking state).
    const settled = (): void => { if (extra) { try { otp?.settle?.(); } catch { /* the prompt's own */ } } };
    return boundedCall(m, url, b, bound, meta).then((v) => { settled(); return v; }, (e: unknown) => {
      // Only a definite refusal can start the prompt or a retry (challenges come as 400, 401 or 403: the token mint
      // and the token gate answer 400 OTP_REQUIRED, for example). Any other answer (a 5xx, a 2xx, none, a 404/409 the
      // route lists in unknownCodes: the change may be under way) ends the operation with that answer, so no later
      // attempt's refusal, context death or refresh failure ever stands for an unknown outcome (api() makes it
      // pending).
      if (!definiteRefusal(e, unknownCodes) || !isOtpRequired(e, !!extra)) { settled(); throw e; }
      if (sess && sess.kind === 'token') { settled(); throw Object.assign({}, e as object, { notAllowed: true }); }
      if (typeof opts.alive === 'function' && !opts.alive()) { settled(); throw { cancelled: true }; }
      if (!held()) { settled(); throw shared().supersededAuthError(); }
      if (!otp) throw { cancelled: true };
      return otp.ask({ retry: !!extra }).then((code) => {
        if (!code) throw { cancelled: true };
        // The prompt can stay open for minutes (a sleeping tab): the caller's liveness is read again before the
        // code goes out, not only before the prompt.
        if (typeof opts.alive === 'function' && !opts.alive()) { try { otp?.settle?.(); } catch { /* the prompt's own */ } throw { cancelled: true }; }
        if (!held()) { try { otp?.settle?.(); } catch { /* the prompt's own */ } throw shared().supersededAuthError(); }
        return attempt({ otp_code: code });
      });
    });
  }
  return attempt();
}

// ---- reissued sessions (2FA on/off revoke every session and answer a fresh pair for this one) ----
// The answer's copies are wiped at once; the pair is adopted inside the cross-tab auth lock that refreshes
// take ('hoody-auth-refresh'), where shared.js checks storage again before it writes, so a refresh in another
// tab cannot interleave. A sign-in or sign-out in another tab does not take that lock.
// Resolves once adopted or refused; the caller's answer waits for it.
async function reissued(res: unknown, owner: string | null): Promise<void> {
  const d = res && typeof res === 'object' ? (res as { data?: unknown }).data : null;
  if (!d || typeof d !== 'object') return;
  const rec = d as Record<string, unknown>;
  const pair = { token: rec.token, refreshToken: rec.refreshToken, session_id: rec.session_id };
  rec.token = null;
  rec.refreshToken = null;
  if (!owner) return;
  const adopt = (): void => { try { shared().adoptReissuedSession(pair, owner); } catch { /* not adopted: the next call signs in again */ } };
  // The lock manager is the host's (host-env.ts): navigator.locks on the web, the session's own where there is no
  // navigator. Never the global itself: a host without one may refuse the read.
  const locks = ((): { request?: (name: string, fn: () => void) => Promise<unknown> } | null => {
    try { return hostEnv().locks as { request?: (name: string, fn: () => void) => Promise<unknown> } | null; } catch { return null; }
  })();
  if (!locks || typeof locks.request !== 'function') { adopt(); return; }
  try { await locks.request('hoody-auth-refresh', adopt); } catch { /* the lock failed: not adopted */ }
}

// ---- the helper ----

/** Sends one declared route. Resolves the answer; rejects a HubError (see the contract above) that names the
 *  declared route it was for (`route`, "METHOD /template": error details). */
export function api<R, B = never>(route: Route<R, B>, input: CallInput<B> = {}): Promise<R> {
  // The tickets this call spent (ticket.ts), filled by request() at admission: told the call's settled outcome, exactly once,
  // as the caller gets it (step 7).
  const held: { spent: SpentTickets | null } = { spent: null };
  // Admission is synchronous and may spend tickets; whatever the rest of the synchronous setup throws after that is this call's
  // rejection, so the handler below settles the tickets (step 7) like any other end.
  let p: Promise<R>;
  try { p = request(route as Route, input as CallInput, held) as Promise<R>; } catch (thrown) { p = Promise.reject(thrown); }
  // Only a declared route's template: a hand-made route object's path is the caller's and could carry anything.
  if (!isDeclared(route)) return p;
  const label = routeLabel(route.method, route.path);
  return p.then((v) => { settleTickets(held.spent, { ok: true, body: v }); return v; }, (e: unknown) => {
    // A foreign throwable is never read or copied here without a guard: if labelling it throws, the caller and the issuers get
    // an error of our own that holds the original as its cause.
    let out: unknown;
    try { out = withRoute(e, label, route.change === true); } catch { out = Object.assign(new Error('the call failed'), { kind: 'unreachable', status: 0, code: 'CALL_FAILED', route: label, cause: e }); }
    settleTickets(held.spent, { ok: false, err: out });
    throw out;
  });
}

// A copy of a plain rejection with `route` set, and `change` for a GET declared a change (errors.ts errorInfo reads a
// change's outcomes from it: the label alone reads a GET as a read). Never marked in place: a rejection may be shared;
// anything else (an Error a transport threw) passes unchanged.
/** True when a thrown value can be read and copied the way the rejection handler does. */
function readable(e: unknown): boolean {
  if (!e || typeof e !== 'object') return true;
  try { Object.assign({}, e as object); void (e as Error).message; return true; } catch { return false; }
}

function withRoute(e: unknown, route: string, change: boolean): unknown {
  if (!e || typeof e !== 'object') return e;
  const proto = Object.getPrototypeOf(e);
  if (proto !== Object.prototype && proto !== null) return e;
  return Object.assign({}, e, change ? { route, change: true } : { route });
}

function request(route: Route, input: CallInput, held: { spent: SpentTickets | null }): Promise<unknown> {
  if (!isDeclared(route)) return Promise.reject(refusal('ROUTE_NOT_DECLARED'));
  const m = route.method, scope = route.scope;
  // A scrub that is not a function would leave a secret in place: refused before anything is sent.
  if (input.scrub != null && typeof input.scrub !== 'function') return Promise.reject(refusal('SCRUB_INVALID'));
  const scrub = input.scrub || null;
  const secret = route.secret || !!scrub;
  const codes = route.codes;
  // The idempotency key, read once: the value checked is the value admitted and sent (a getter or a body's toJSON
  // during build() never changes it).
  const idem: unknown = input.idem;
  if (idem != null && scope !== 'agent' && scope !== 'kit') return Promise.reject(refusal('IDEMPOTENCY_KEY_INVALID'));
  // If-Match: exactly on an ifMatch route, one strong token (routes.ts IF_MATCH). Read once: the value checked is
  // the value sent (a getter or a body's toJSON during build() never changes it).
  // An etagMatch route takes no value (no header) or one quoted strong ETag.
  const ifMatch: unknown = input.ifMatch;
  // An agent write with cas {via:'etag'} requires the read's quoted ETag: none is CAS_REQUIRED, a malformed one IF_MATCH_INVALID.
  const casEtag = route.cas?.via === 'etag';
  if (casEtag && ifMatch == null) return Promise.reject(refusal('CAS_REQUIRED'));
  if (route.ifMatch ? !(typeof ifMatch === 'string' && IF_MATCH.test(ifMatch))
    : casEtag ? !(typeof ifMatch === 'string' && IF_MATCH_ETAG.test(ifMatch))
    : route.etagMatch ? !(ifMatch == null || (typeof ifMatch === 'string' && IF_MATCH_ETAG.test(ifMatch)))
    : ifMatch != null) return Promise.reject(refusal('IF_MATCH_INVALID'));
  const sendIfMatch = route.ifMatch || (route.etagMatch && ifMatch != null) ? { ifMatch: ifMatch as string } : {};
  // If-None-Match: '*' only, on an etagMatch route, never beside an If-Match value. Read once, like ifMatch.
  const ifNoneMatch: unknown = input.ifNoneMatch;
  if (ifNoneMatch != null && !(route.etagMatch && ifNoneMatch === '*' && ifMatch == null)) return Promise.reject(refusal('IF_MATCH_INVALID'));
  const sendIfNoneMatch = ifNoneMatch != null ? { ifNoneMatch: '*' as const } : {};
  // The answer's ETag (onEtag), read once like ifMatch: only a Hoody API leg reports it, so any other scope refuses.
  const onEtag: unknown = input.onEtag;
  // Hoody API routes always; an agent route only when it declares an ETag (readsEtag, or a cas etag write).
  const etagScope = scope === 'base' || scope === 'realm' || (scope === 'agent' && (route.readsEtag || casEtag));
  if (onEtag != null && (typeof onEtag !== 'function' || !etagScope)) return Promise.reject(refusal('IF_MATCH_INVALID'));
  // The last success answer's tag of this call (a retry's answer replaces it); handed over only once delivered.
  let etag: string | null = null;
  const etagOpt = onEtag ? { onEtag: (t: unknown) => { etag = typeof t === 'string' && IF_MATCH_ETAG.test(t) ? t : null; } } : {};
  // readsStatus (agent routes only, routes.ts): the success answer's status, handed back beside its body. 0 when the transport
  // reported none, so a caller that needs one status reads anything else as not that status.
  let okStatus = 0;
  const statusOpt = route.readsStatus ? { onStatus: (st: number) => { okStatus = st; } } : {};
  const built = build(route, input);
  if ('refused' in built) return Promise.reject(refusal(built.refused));
  // Tickets are an agent route's: a ticket on a base or realm call fails, an empty list is no ticket.
  const given: unknown = input.tickets;
  if ((scope === 'base' || scope === 'realm') && given !== undefined && !(Array.isArray(given) && given.length === 0)) return Promise.reject(refusal('TICKET_REFUSED'));
  const ctx = input.ctx || capture(input.target);
  const target = input.target || ctx.target;
  // A kit GET declared a change (routes.ts change: a create-or-get) has a change's outcomes.
  const mutation = isChangeCall(route, m);
  let base = '';
  let plan: KitPlan | null = null;
  if (scope === 'base' || scope === 'realm') {
    const r = hoodyRoute(m, built.path, built.body, scope, ctx.realm, route.baseOnly);
    if ('refused' in r) return Promise.reject(refusal(r.refused));
    // A token session asks only what its token may do (routePerms.ts): a call it lacks the leaf for is refused unsent,
    // so no page's read or poll draws a 403. A change says so once (token.ts tokenLacked); a read says it in place.
    const lack = tokenLack(m, route.path, built.path);
    if (lack === 'never') return Promise.reject(refusal('TOKEN_SESSION_REFUSED'));
    if (lack) { const said = tokenLacked(lack, mutation); return Promise.reject({ ...refusal('TOKEN_LACKS'), perm: lack, ...(said ? { tokenSaid: true } : {}) } as HubError); }
    base = r.base;
  } else {
    const realm = agentRealm(route, input.realm, ctx);
    // The session id the path was built from (build() read it once); never a second read of the caller's params.
    const pid = built.ids?.id;
    const a = admit(route, built, { target, realm, index: input.index, idem: idem as string | undefined, secret, maxBytes: input.maxBytes, guardCtx: input.guardCtx, asChange: mutation,
      tickets: given, sid: typeof pid === 'string' ? pid : null, ...(input.bind !== undefined ? { bind: input.bind } : {}),
      ...(casEtag ? { ifMatch: ifMatch as string } : {}), ...(input.cwd !== undefined ? { cwd: input.cwd } : {}) });
    if ('refused' in a) {
      if (a.refused === 'FRAMED_ACTION_REFUSED') return Promise.reject(Object.assign({}, shared().framedRefusedError(), { kind: 'not_sent' }));
      return Promise.reject(refusal(a.refused));
    }
    plan = a;
    held.spent = a.spent;
  }
  // Framed: every change, in every scope, and the sensitive reads are refused before anything else.
  if (isFramed() && (mutation || ((scope === 'base' || scope === 'realm') && shared().framedSensitiveRoute(m, built.path)))) {
    return Promise.reject(Object.assign({}, shared().framedRefusedError(), { kind: 'not_sent' }));
  }
  if (!alive(ctx)) return Promise.reject(gone(ctx, true));
  // Tickets may be spent by now: anything below that throws synchronously (a getter on the input, a transport that throws)
  // is turned into this call's rejection, so the one rejection handler below runs step 7 and the bookkeeping for it.
  let signal: AbortSignal | undefined, still: (() => boolean) | undefined;
  const stillOk = (): boolean => { try { return !still || still(); } catch { return false; } };
  const live = () => alive(ctx) && !signal?.aborted && stillOk();
  // `sent`: the request itself went out. Only a sent change can be pending, and only a sent change is open
  // for sign-out's warning; work refused before that (a failed refresh, the 2FA prompt) never is.
  let sent = false;
  const onSend = () => { if (sent) return; sent = true; if (mutation) open.push(ctx); };
  let p: Promise<unknown>;
  let owner: string | null = null;
  try {
  signal = input.signal; still = input.still;
  if (plan) {
    p = kitSend(plan, { signal, onSend, alive: live, ...etagOpt, ...statusOpt, ...(input.keepalive === true ? { keepalive: true } : {}) });
  } else {
    const meta = { route, method: m, path: built.path, query: built.query, body: built.body, ...sendIfMatch, ...(input.bind !== undefined ? { bind: input.bind } : {}) };
    const opts: ApiCallOpts = { base, alive: live, onSend, ...sendIfMatch, ...sendIfNoneMatch, ...etagOpt };
    if (input.timeoutMs) opts.timeoutMs = input.timeoutMs;
    const pg = page();
    if (tokenSession() && pg) opts.session = pg;
    if (!mutation) p = boundedCall(m, built.url, null, opts, meta);
    else {
      // Sent only as the user this page shows, from the first send through the 2FA retry; before the
      // identity is known, as the account captured with the context.
      const shown = identity();
      if (shown && shown.id != null) opts.owner = String(shown.id);
      else if (ctx.account) opts.owner = ctx.account;
      // No known account: null, never undefined (shared.js binds an owner only when the field is present,
      // and a null owner refuses unsent instead of sending with whatever token another tab stored).
      else if (!opts.session) opts.owner = null;
      owner = opts.owner ?? null;
      p = withOtp(m, built.url, built.body, opts, meta, route.unknownCodes);
    }
  }
  } catch (thrown) { p = Promise.reject(thrown); }
  const settle = () => {
    if (!mutation || !sent) return;
    const i = open.indexOf(ctx);
    if (i !== -1) open.splice(i, 1);
  };
  return p.then(async (res) => {
    settle();
    // Every answer of a reissuing route, one after its context died included: adopted for the account it was
    // sent as (shared.js refuses another account or session), then the answer's copies are wiped.
    if (route.reissues) await reissued(res, owner);
    // Step 6: the issuers of the spent tickets see the raw success answer first (a lease grant is taken here), then the caller's scrub.
    try { answerTickets(held.spent, res); } catch { throw { code: 'SCRUB_FAILED' } as HubError; }
    if (scrub) {
      try { scrub(res); } catch { throw { code: 'SCRUB_FAILED' } as HubError; }
    }
    if (!alive(ctx)) {
      // A change that was answered after its context died did go out: pending, never a refusal.
      if (mutation) { notifyPending(ctx); throw { kind: 'pending', pending: true } as HubError; }
      throw gone(ctx, false);
    }
    if (onEtag) { try { (onEtag as (t: string | null) => void)(etag); } catch { /* the caller's note only */ } }
    return route.readsStatus ? { status: okStatus, body: res } : res;
  }, (err0: unknown) => {
    settle();
    // What was thrown may be anything a synchronous failure carried: one that cannot be read or copied is a lost connection
    // (the unknown outcome of a change that went out, an unsent refusal of one that did not), never a different failure.
    const err = readable(err0) ? err0 : rejection('unreachable', 0, 'NETWORK');
    const ban = bannedError(err);
    // `sent` is authoritative (it spans 2FA resubmits and internal retries). The error is copied, never
    // marked in place: a refresh rejection is shared between callers.
    let e = sentAs(err, !sent) as HubError;
    // The answer as it came: the token refusal decides on it (a secret route's scrub below drops its code and
    // message), and returns only the scrubbed copy plus the leaf it names.
    const raw = e;
    // A lockout says its wait in the answer body, with no Retry-After header: kept as retryAfter (a number only, so
    // it is one of the fields a secret route's scrub below keeps).
    if (e && typeof e === 'object' && typeof e.retryAfter !== 'number') {
      const wait = lockoutSeconds(e);
      if (wait !== undefined) e.retryAfter = wait;
    }
    if (secret && e && typeof e === 'object') e = bareRejection(e, codes, route.unknownCodes);
    // A 404 or 409 the route names in unknownCodes: the change may still be under way, so pending like an unknown outcome.
    const underWay = listedUnderWay(e, route.unknownCodes);
    // A cancel (the 2FA prompt answered Cancel) or a framed refusal means nothing was applied only while the
    // context lives: once it died, a change that went out is pending like any other.
    const unsent = !sent || (alive(ctx) && !!(e && (e.cancelled || e.framed)));
    if (!sent && shared().isSupersededAuthError(e)) throw e;
    // Any answer to a change that went out, once the context died, is pending, a definite refusal included: this
    // send may repeat an earlier one whose outcome is unknown (a kept key, a replay, a key carried in the body), and
    // a refusal of this send does not settle that one (an If-Match 412 may answer a repeat of a
    // change that went through). Only a change never sent reads not_sent (gone below).
    // A refusal the route lists (notApplied: the agent proved it changed nothing) stays a definite refusal when the
    // context died meanwhile: the proof is about this send, and it is not repeated by any earlier one.
    const proven = !!(e && e.notApplied === true);
    if (mutation && !unsent && !proven && (!alive(ctx) || unknownOutcome(e) || underWay)) {
      // recovers: the caller reads the outcome back itself, so no notice while its context lives.
      if (!(input.recovers && alive(ctx))) notifyPending(ctx);
      // A server's "come back later" stays on it: a caller that replays (the run-open machine) waits for it.
      const p: HubError = { kind: 'pending', pending: true, status: e && e.status, code: e && e.code } as HubError;
      if (e && typeof e.retryAfter === 'number') p.retryAfter = e.retryAfter;
      if (e && typeof e.retryAfterMs === 'number') p.retryAfterMs = e.retryAfterMs;
      const tid = traceIdOf(e && e.traceId);
      if (tid) p.traceId = tid;
      // A keepDetails route: what the agent said it did (a commit that landed before its push failed) stays on it.
      if (route.keepDetails) Object.assign(p, keptDetails(route, e));
      throw p;
    }
    if (!alive(ctx)) throw proven ? e : gone(ctx, !sent);
    // The account this page shows is suspended: an account session's Hoody API scopes only.
    if (ban && sent && (scope === 'base' || scope === 'realm') && !tokenSession() && bannedHandler) bannedHandler();
    // Only the Hoody API scopes carry the token: a kit or agent call's 401/403 is the program's own.
    if (tokenSession() && tokenRefusal && sent && (scope === 'base' || scope === 'realm') && e && (e.status === 401 || e.status === 403)) throw tokenRefusal(e, route, built.path, mutation, raw);
    throw e;
  });
}
