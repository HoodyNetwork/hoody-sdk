// kit.ts: admission and the send leg to a computer's agent and its Hoody Kit programs.
//
// Contract:
//   - admit(route, built, o) → a plan, or {refused: CODE}; nothing is sent. The host comes from the captured
//     target and the route only: agent = agentBaseFor + /api/v1/agent, kit = buildPortUrl(project, container,
//     kit, index). An agent call carries `realm=` as its route's realm kind allows (never in the path itself).
//     Credentials are the kit's: agent include, kit omit. No caller header except the route's idempotency key.
//     A target whose server the latest accepted computer row withholds, or names otherwise (routing.ts), is refused
//     like a target with no server (NO_AGENT_URL / NO_KIT_URL), whenever the target was captured.
//   - A route with idem requires a key (agent: printable ASCII 1..255; kit: newKey()'s shape); any other
//     route refuses one. A route's guard must
//     return true. Framed pages refuse every change (a GET declared change included) and the GETs declared
//     framed: false. A GET declared change (routes.ts: a create-or-get) is admitted only for api(), which gives it
//     a change's outcomes (asChange); every other leg (download, upload, stream, run) refuses it unsent.
//   - send(plan, how) → the parsed JSON answer, or one rejection {kind, status, code, details, data,
//     retryAfterMs, retryAfter, notSent?, stale?}. Kinds: private (401/403), bad_request (400/422), refused
//     (other 4xx), rate_limited / quota (429), unavailable (5xx, NOT_JSON, BAD_JSON), too_large, redirected,
//     unreachable (TIMEOUT/NETWORK: no answer), aborted, preflight_refused (a preflighted call that got no
//     answer from an origin a simple GET proved this page may call).
//   - Answers are read up to their byte bound (error bodies up to 64 KiB); redirects are never followed;
//     every call is no-store and bounded by its timeout. Nothing here retries, except the one pinned-realm
//     Bot listing fallback (GET /bots?realm=all answered 400 realm_scope_unsupported → the plain listing).
//   - A kit HEAD answers its validators only: {etag, lastModified, contentLength}, frozen,
//     read from the answer's headers (the files program exposes ETag; the other two are CORS-safelisted); no body
//     is read. A value that is not well formed is null (an ETag that is not an entity tag, a Last-Modified that
//     is not an IMF-fixdate naming a real UTC moment, a Content-Length that is not a whole number of bytes), never
//     guessed. The obsolete RFC 850 and asctime date forms are null too: unknown, never parsed by guesswork.
//   - run routes (kit-io.ts): caller headers are admitted by callerHeaders (token names, none the proxy, the
//     browser or the kit owns, printable values, at most 32 names and 8 KiB) and kept off the plan (only the
//     send leg reads them, so Authorization is never shown); any other route with headers is refused
//     HEADER_NOT_ALLOWED. A run answer is read up to 256 KiB. send(plan, {raw}) resolves {res, bytes}: raw 'ok'
//     for a 2xx (download), raw 'any' for every HTTP answer (run).
//   - file routes (upload.ts sendFile): the caller's headers must be exactly fileHeaders' shape
//     (X-Expected-Length plus If-None-Match: * or If-Match: one strong ETag), else HEADER_NOT_ALLOWED; none at all is
//     refused too, so a file is never written over without a condition. They go on the plan with Content-Type
//     application/octet-stream; the answer is read up to 64 KiB. The transfer worker sends the plan, not send().
//   - Agent headers (AI tab): the only ones a call adds are If-Match (a cas etag route: the read's quoted
//     ETag), X-Hoody-Cwd (a route that declares cwd: the folder, sent as its UTF-8 bytes) and X-Hoody-Approver-Lease (the
//     five lease routes: the value the registered in-memory lease source returns, never a caller's). X-Hoody-Config-Dir
//     and every other name stay refused (HEADER_NOT_ALLOWED), a cwd on a route that declares none included. A
//     refuses code (routes.ts) marks its rejection notApplied; so does a tool envelope's is_error with such a code.
//   - api.ts keeps the outcome rules (pending, stale after the answer, scrub). A generation bump aborts every
//     call whose context died and forgets the preflight proofs.
import { alive, onBump, tokenRealm, tokenSession, type Ctx, type Target } from './ctx';
import { agentBaseFor, buildPortUrl } from './hosts';
import { routingAllows } from './routing';
import { IF_MATCH_ETAG, type Built, type Route } from './routes';
import { liveEarlyRefusal } from './live-gate';
import { isFramed } from './session';
import { checkTickets, spendTickets, type SpentTickets } from './ticket';
import { traceIdOf } from './trace-id';
import { transport, type CallMeta } from './transport';
import { isPlainRecord } from './shape';
import { isRealmOrGlobal } from './realm-id';

const MIB = 1 << 20;
const ERR_BYTES = 65536;
const TIMEOUT = 30000;
// An agent's replay key (Hub.api's rule: printable ASCII 1..255); a kit program's (newKey's shape).
const AGENT_IDEM = /^[\x21-\x7e]{1,255}$/;
const IDEM = /^hub-[A-Za-z0-9_-]{22,64}$/;
const RUN_ANSWER = 262144;
/** Whether `s` is a well-formed idempotency key: a kit program's (hub-...) or an agent's (printable ASCII, 1..255). */
export function isIdemKey(s: unknown): s is string {
  return typeof s === 'string' && (IDEM.test(s) || AGENT_IDEM.test(s));
}

export interface KitRejection {
  kind: string;
  status: number;
  code: string | null;
  details: Record<string, unknown>;
  data: Record<string, unknown>;
  retryAfterMs: number | null;
  retryAfter: number | null;
  notSent?: boolean;
  stale?: boolean;
  /** The agent said it refused before applying anything (a route's refuses code, routes.ts): a definite refusal even
   *  on a 5xx or a 2xx tool envelope. Set here only, from the route's declaration and the answer's code. */
  notApplied?: boolean;
  /** The answer's X-Trace-Id, only when it carried one in the API's shape (trace-id.ts); programs mostly send none. */
  traceId?: string;
  /** A status-0 'unreachable' whose answer arrived and whose body was then lost (or outlasted the timeout): the
   *  computer answered. Read by reachability.ts reachOf only; it changes no outcome. */
  answered?: true;
}

export interface KitPlan {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly credentials: RequestCredentials;
  readonly body: string | undefined;
  readonly secret: boolean;
  readonly timeoutMs: number;
  readonly maxBytes: number;
  readonly proves: boolean;
  readonly preflight: boolean;
  readonly fallback: string;
  readonly meta: CallMeta;
  /** The call's checked tickets (ticket.ts), null when it carried none. They are spent by the send, after its setup; api.ts
   *  keeps them for its steps 6 and 7, which see them only once spent. */
  readonly spent: SpentTickets | null;
}

export interface AdmitOptions {
  target: Target | null;
  realm?: string;
  index?: number;
  idem?: string;
  secret?: boolean;
  maxBytes?: number;
  guardCtx?: unknown;
  /** run routes only: the caller's headers ({name: value}), read once. */
  headers?: unknown;
  /** cas etag routes: the document's quoted ETag (If-Match). */
  ifMatch?: string;
  /** Routes that declare cwd: the folder (X-Hoody-Cwd). */
  cwd?: string;
  /** api() only: the caller treats the call as a change (pending outcomes, the open list), so a route declared
   *  change may go out. */
  asChange?: boolean;
  /** api() only: the call's tickets (input.tickets), checked and spent as the last step of admission (ticket.ts). */
  tickets?: unknown;
  /** api() only: the route's session id parameter (params.id), null when the path has none. */
  sid?: string | null;
  /** The caller's `bind` (CallInput.bind), put on this call's meta. */
  bind?: object;
}

/** A path a server or proxy could normalise into another route. */
export function pathOk(p: string, deep = false): boolean {
  if (typeof p !== 'string' || p.charAt(0) !== '/' || /[\\#\u0000-\u001f\u007f\s]/.test(p)) return false;
  const path = p.split('?')[0] ?? '';
  // deep (a route with a *path param): a name holding '%' or a backslash is sent as %25 / %5C, each one segment.
  return !(deep ? /\/\/|%(2f|2e)/i : /\/\/|%(2f|2e|25|5c)/i).test(path) && !/\/\.\.?(\/|$)/.test(path);
}

function realmFits(kind: string | undefined, r: string | undefined): boolean {
  if (r === undefined || r === null || r === '') return kind === 'none' || kind === 'opt';
  return kind !== 'none' && ((kind === 'list' && r === 'all') || isRealmOrGlobal(r));
}

function indexFits(rule: Route['index'], n: number | undefined): boolean {
  if (!Number.isInteger(n) || (n as number) < 0) return false;
  if (typeof rule === 'number') return rule === n;
  try { return typeof rule === 'function' && rule(n as number) === true; } catch { return false; }
}

// A run call's headers: a copy of a plain {name: value} object, or null (HEADER_NOT_ALLOWED). Each value is read
// once, so a getter cannot change what is sent; a throwing getter or Proxy trap is a refusal, its error not kept.
const HNAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const HDENY = /^(cookie|host|origin|referer|forwarded|accept|content-type|(x-)?idempotency-key|(x-hoody|x-forwarded|proxy|sec)-.*)$/i;
export function callerHeaders(h: unknown): Record<string, string> | null {
  const out: Record<string, string> = {};
  const seen: Record<string, true> = {};
  let n = 0, size = 0;
  try {
    if (Object.prototype.toString.call(h) !== '[object Object]') return null;
    const rec = h as Record<string, unknown>;
    for (const k in rec) {
      if (!Object.hasOwn(rec, k)) continue;
      const v = rec[k], l = k.toLowerCase();
      if (!HNAME.test(k) || HDENY.test(k) || seen[l] || typeof v !== 'string' || !/^[\t\x20-\x7e]*$/.test(v)
        || ++n > 32 || (size += k.length + v.length) > 8192) return null;
      seen[l] = true;
      out[k] = v;
    }
  } catch { return null; }
  return out;
}

// A file route's headers, the only ones it takes: X-Expected-Length (a whole number of bytes) and
// exactly one condition, If-None-Match: * (create only) or If-Match: one strong ETag (replace only that version).
// Any other name, a missing condition or both is null (HEADER_NOT_ALLOWED). Each value is read once.
const FILE_LEN = /^(?:0|[1-9][0-9]{0,15})$/;
export function fileHeaders(h: unknown): Record<string, string> | null {
  try {
    if (Object.prototype.toString.call(h) !== '[object Object]') return null;
    const rec = h as Record<string, unknown>;
    const names = Object.keys(rec);
    if (names.length !== 2 || !names.includes('X-Expected-Length')) return null;
    const len = rec['X-Expected-Length'];
    if (typeof len !== 'string' || !FILE_LEN.test(len) || !Number.isSafeInteger(Number(len))) return null;
    if (names.includes('If-None-Match')) {
      const v = rec['If-None-Match'];
      return v === '*' ? { 'If-None-Match': '*', 'X-Expected-Length': len } : null;
    }
    if (names.includes('If-Match')) {
      const v = rec['If-Match'];
      return typeof v === 'string' && IF_MATCH_ETAG.test(v) ? { 'If-Match': v, 'X-Expected-Length': len } : null;
    }
    return null;
  } catch { return null; }
}

// The checked caller headers of a run plan: only the send leg reads them.
const privateHeaders = new WeakMap<KitPlan, Readonly<Record<string, string>>>();

/** The realm an agent call carries, the same for every leg (api, download, stream): none for a realm:'none' route;
 *  the pinned realm of a token session bound to ONE realm, whatever the caller asked; otherwise the caller's, else the
 *  context's. A token that opens the whole account (pinned 'all') is the All realms view of an account session: a
 *  call that names its realm (one Bot, one chat) acts there. With the pin always winning, such a call was planned
 *  with 'all' and refused before it was sent (AGENT_REALM_REQUIRED). */
export function agentRealm(route: Route, asked: string | undefined, ctx: Ctx): string | undefined {
  if (route.realm === 'none') return undefined;
  if (tokenSession() && tokenRealm() !== 'all') return tokenRealm() ?? undefined;
  return asked ?? ctx.realm;
}

/** X-Hoody-Cwd's value for a folder: the agent reads the header as UTF-8, a browser sends each character of a header value
 *  as one byte, so the path goes as its UTF-8 bytes (one character per byte). null for anything but an absolute path
 *  of well-formed text, no control character, no edge space (a header is trimmed), at most 4,096 bytes. */
export function cwdHeader(v: unknown): string | null {
  if (typeof v !== 'string' || v.charAt(0) !== '/' || v !== v.trim() || /[\u0000-\u001f\u007f]/.test(v)) return null;
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v)) return null;
  const bytes = new TextEncoder().encode(v);
  if (bytes.length > 4096) return null;
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

/** A target read once into plain data (each field once), or null when it names no computer. */
function snapshotTarget(t: Target | null | undefined): Target | null {
  if (!t) return null;
  const p = t.project, c = t.container;
  if (!p || !c) return null;
  const pid = p.id, cid = c.id, sn = c.server_name;
  // Primitive strings only, each read once: an object that converts to text each time it is asked would give the URL one computer
  // and the ticket's bind another. Anything else names no computer.
  if (typeof pid !== 'string' || typeof cid !== 'string' || (sn !== undefined && typeof sn !== 'string')) return null;
  return Object.freeze({ project: Object.freeze({ id: pid }), container: Object.freeze(sn === undefined ? { id: cid } : { id: cid, server_name: sn }) });
}

/** Admission for one agent or kit call. Nothing is sent. */
export function admit(route: Route, built: Built, opts: AdmitOptions): KitPlan | { refused: string } {
  // A route declared with one numeric index uses it when the caller names none (predicates need a concrete one).
  const o: AdmitOptions = opts.index === undefined && typeof route.index === 'number' ? { ...opts, index: route.index } : opts;
  const agent = route.scope === 'agent';
  if (!agent && route.scope !== 'kit') return { refused: 'SCOPE_UNSUPPORTED' };
  if (!pathOk(built.url, route.deep !== null)) return { refused: 'PATH_INVALID' };
  if (agent && Object.hasOwn(built.query, 'realm')) return { refused: 'AGENT_REALM_IN_PATH' };
  if (!agent && !indexFits(route.index, o.index)) return { refused: 'ROUTE_NOT_ALLOWED' };
  if (agent && route.realm === 'realm' && o.realm === 'all') return { refused: 'AGENT_REALM_REQUIRED' };
  if (!realmFits(route.realm, agent ? o.realm : undefined)) return { refused: agent ? 'AGENT_REALM_REQUIRED' : 'ROUTE_NOT_ALLOWED' };
  const m = route.method;
  if (route.change === true && o.asChange !== true) return { refused: 'ROUTE_NOT_ALLOWED' };
  if (route.idem ? !(typeof o.idem === 'string' && (agent ? AGENT_IDEM : IDEM).test(o.idem)) : o.idem !== undefined && o.idem !== null) return { refused: 'IDEMPOTENCY_KEY_INVALID' };
  if (route.guard) {
    let ok = false;
    try {
      ok = route.guard({ method: m, path: built.url, query: built.query, body: built.body, realm: o.realm, idem: o.idem, index: o.index, guardCtx: o.guardCtx }) === true;
    } catch { ok = false; }
    if (!ok) return { refused: 'ROUTE_NOT_ALLOWED' };
  }
  let hdr: Record<string, string> | null = {};
  try {
    const hv = o.headers;
    hdr = route.file ? fileHeaders(hv) : hv === undefined || hv === null ? {} : route.run ? callerHeaders(hv) : null;
  } catch { hdr = null; }
  if (!hdr) return { refused: 'HEADER_NOT_ALLOWED' };
  // The agent headers a call may add (see the contract): each from its route's declaration, none from a caller's map.
  const extra: Record<string, string> = {};
  if (o.cwd !== undefined) {
    const c = agent && route.cwd ? cwdHeader(o.cwd) : null;
    if (c === null) return { refused: 'HEADER_NOT_ALLOWED' };
    extra['X-Hoody-Cwd'] = c;
  }
  if (route.cas && route.cas.via === 'etag') {
    if (typeof o.ifMatch !== 'string' || !IF_MATCH_ETAG.test(o.ifMatch)) return { refused: 'HEADER_NOT_ALLOWED' };
    extra['If-Match'] = o.ifMatch;
  } else if (o.ifMatch !== undefined) return { refused: 'HEADER_NOT_ALLOWED' };
  if ((m !== 'GET' || route.framed === false || route.change === true) && isFramed()) return { refused: 'FRAMED_ACTION_REFUSED' };
  const cap = route.run ? Math.min(route.maxBytes || MIB, RUN_ANSWER) : route.file ? Math.min(route.maxBytes || ERR_BYTES, ERR_BYTES) : route.maxBytes || MIB;
  if (o.maxBytes !== undefined && (!Number.isInteger(o.maxBytes) || o.maxBytes <= 0 || o.maxBytes > cap)) return { refused: 'MAXBYTES_INVALID' };
  // The destination is read ONCE: the URL and the ticket bind come from this snapshot (a getter cannot give them two answers).
  const tg = snapshotTarget(o.target);
  const base = tg && tg.project && tg.container
    ? agent ? agentBaseFor(tg.project, tg.container) : buildPortUrl(tg.project, tg.container, route.kit as string, o.index as number) : '';
  if (typeof base !== 'string' || base.indexOf('https://') !== 0) return { refused: agent ? 'NO_AGENT_URL' : 'NO_KIT_URL' };
  // The latest accepted row of this computer withholds its server, or names another one (routing.ts): no new request goes to
  // the server this target was frozen with. Refused as a target with no server is, so every caller already reads it as "no address".
  if (tg && !routingAllows(tg.container.id, tg.container.server_name)) return { refused: agent ? 'NO_AGENT_URL' : 'NO_KIT_URL' };
  // A bodyText route sends its string as it is (routes.ts buildRequest checked it); every other body is JSON.
  const json = built.body === null || built.body === undefined ? undefined : route.bodyText ? String(built.body) : JSON.stringify(built.body);
  // The last step: the call's tickets are checked (ticket.ts). Nothing is spent here: the send spends them once its own resources
  // are set up, and a lease ticket's spend is the only source of X-Hoody-Approver-Lease.
  const tk = checkTickets(route.tickets, o.tickets, { route, container: tg?.container?.id ?? '', sid: o.sid ?? null, idem: o.idem ?? null, realm: o.realm }, route.bodyText ? undefined : json);
  if (!tk.ok) return { refused: tk.code };
  const withExtra = Object.keys(extra).length > 0 || tk.set?.leases === true;
  const hasQuery = built.url.includes('?');
  let url = base + (agent ? '/api/v1/agent' : '') + built.url;
  if (agent && o.realm && route.realm !== 'none') url += (hasQuery ? '&' : '?') + 'realm=' + encodeURIComponent(o.realm);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (json !== undefined) headers['Content-Type'] = route.bodyText ? 'text/plain; charset=utf-8' : 'application/json';
  if (route.idem && o.idem) headers[route.idem] = o.idem;
  Object.assign(headers, extra);
  // A file route's checked headers travel on the plan (the transfer worker sends it); nothing in them is private.
  if (route.file) Object.assign(headers, hdr, { 'Content-Type': 'application/octet-stream' });
  const secret = route.secret || o.secret === true;
  // A realm-pinned agent refuses `all` on the Bot listing (400 realm_scope_unsupported); its plain listing is
  // exactly the pinned realm's Bots, so that one call falls back once (never a secret call).
  const fallback = agent && m === 'GET' && built.path === '/bots' && o.realm === 'all' && !secret ? url.replace(/[?&]realm=all$/, '') : '';
  const added = !route.file && Object.keys(hdr).length > 0;
  const plan: KitPlan = Object.freeze({
    url, method: m, headers: Object.freeze(headers), credentials: (agent ? 'include' : 'omit') as RequestCredentials, body: json, secret,
    timeoutMs: route.timeoutMs || TIMEOUT, maxBytes: o.maxBytes || cap,
    proves: m === 'GET' && !route.idem && !added && !withExtra, preflight: json !== undefined || !!route.idem || added || withExtra || (m !== 'GET' && m !== 'POST'), fallback,
    meta: Object.freeze({ route, method: m, path: built.path, query: built.query, body: built.body, target: tg || null, ...(o.bind !== undefined ? { bind: o.bind } : {}) }),
    spent: tk.set,
  });
  if (added) privateHeaders.set(plan, Object.freeze(hdr));
  return plan;
}

// ---- the send leg ----

export function rejection(kind: string, status: number, code?: string | null, extra?: Partial<KitRejection>): KitRejection {
  const e: KitRejection = { kind, status: status || 0, code: code === undefined ? kind : code, details: {}, data: {}, retryAfterMs: null, retryAfter: null };
  if (extra) Object.assign(e, extra);
  if (e.retryAfterMs !== null) e.retryAfter = Math.ceil(e.retryAfterMs / 1000);
  return e;
}

export function notSentRejection(code: string, extra?: Partial<KitRejection>): KitRejection {
  const e = rejection('not_sent', 0, code, extra);
  e.notSent = true;
  return e;
}

export function kindOf(s: number, code: string | null): string {
  return s === 429 ? (code === 'audit_quota_exceeded' || code === 'quota' ? 'quota' : 'rate_limited')
    : s === 401 || s === 403 ? 'private' : s === 400 || s === 422 ? 'bad_request' : s >= 400 && s < 500 ? 'refused' : 'unavailable';
}

/** Seconds or an IMF-fixdate; anything else is unknown (null), never a guess. */
export function retryAfterMs(h: string | null): number | null {
  const v = String(h || '').trim();
  if (/^\d{1,9}$/.test(v)) return parseInt(v, 10) * 1000;
  const at = /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(v) ? Date.parse(v) : NaN;
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

function decode(bytes: Uint8Array): string | null {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
}

/** A kit's code that names only the status (hoody-exec's error answer: `ERROR_<status>`, the cause in details.code). */
const GENERIC_CODE = /^ERROR_\d{3}$/;
/**
 * The answer's code, details and data. The code is the top-level `code` (else `error`). With `nested` (send(): only hoody-exec's
 * own API, a non-run route of the exec kit; never a script answering on the exec host, another kit, the agent or an upload) and a
 * 4xx other than 429, a generic `ERROR_<this status>` with a 1..64 string `details.code` (hoody-exec's error answer)
 * gives details.code instead, marked `promoted`: that code names a cause only, it never proves a refusal (send() never reads a
 * promoted code against the route's `refuses`). A specific top-level code always stays. data and details stay as the kit sent
 * them (raw readers such as scripts execSaysAbsent still see ERROR_404). Callers: send() below and upload.ts (never nested).
 * With `nested` 'vm' (send(): a route of the vm kit only) the code is `error.code` when `error` is an object holding a string
 * code (hoody-vm answers {error: {code, message, retryable}}), on any status; it is never promoted. The code names the answer
 * for words and details only: errorOf itself marks nothing notApplied and moves no outcome rule (send() checks the code against the route's refuses).
 */
export function errorOf(res: Response, text: string | null, nested: boolean | 'vm' = false): Partial<KitRejection> & { code: string | null; promoted?: true } {
  let data: unknown = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!isPlainRecord(data)) data = {};
  const d = data as Record<string, unknown>;
  const inner = nested === 'vm' && isPlainRecord(d.error) && typeof d.error.code === 'string' ? d.error.code : null;
  const top = inner ?? (typeof d.code === 'string' ? d.code : typeof d.error === 'string' ? d.error : null);
  const cause = nested === true && res.status >= 400 && res.status < 500 && res.status !== 429 && top !== null && GENERIC_CODE.test(top) && top === `ERROR_${res.status}`
    && isPlainRecord(d.details) && typeof d.details.code === 'string' && d.details.code.length > 0 && d.details.code.length <= 64 ? d.details.code : null;
  const c = cause ?? top;
  return {
    code: c && c.length <= 64 ? c : null, details: isPlainRecord(d.details) ? d.details : {}, data: d, ...(cause !== null ? { promoted: true as const } : {}),
    retryAfterMs: retryAfterMs(res.headers.get('retry-after')),
  };
}

/** A HEAD answer's validators (see the contract above). */
export interface Validators { readonly etag: string | null; readonly lastModified: string | null; readonly contentLength: number | null }
const ETAG = /^(W\/)?"[\x21\x23-\x7e\x80-\xff]*"$/;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FIXDATE = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/;
// RFC 9110 IMF-fixdate ('Sun, 06 Nov 1994 08:49:37 GMT') whose fields name one real moment, its weekday included.
function fixdate(v: string): boolean {
  const m = FIXDATE.exec(v);
  if (!m) return false;
  const [d, mo, y, h, mi, se] = [+m[2]!, MONTHS.indexOf(m[3]!), +m[4]!, +m[5]!, +m[6]!, +m[7]!];
  if (h > 23 || mi > 59 || se > 59) return false;
  const t = new Date(Date.UTC(y, mo, d, h, mi, se));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo && t.getUTCDate() === d && DAYS[t.getUTCDay()] === m[1];
}
function validatorsOf(res: Response): Validators {
  const e = res.headers.get('etag'), lm = res.headers.get('last-modified'), cl = res.headers.get('content-length');
  const n = cl !== null && /^\d{1,16}$/.test(cl) ? Number(cl) : NaN;
  return Object.freeze({
    etag: e !== null && e.length <= 256 && ETAG.test(e) ? e : null,
    lastModified: lm !== null && fixdate(lm) ? lm : null,
    contentLength: Number.isSafeInteger(n) ? n : null,
  });
}

/** Reads at most `limit` bytes: {bytes}, or {over: true} once past it (the request is aborted). */
export async function readBounded(res: Response, limit: number, abort: (why: string) => void): Promise<{ bytes?: Uint8Array; over?: boolean }> {
  const len = parseInt(res.headers.get('content-length') || '', 10);
  if (Number.isFinite(len) && len > limit) { abort('over'); return { over: true }; }
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) {
    const b = await res.arrayBuffer();
    return b.byteLength > limit ? { over: true } : { bytes: new Uint8Array(b) };
  }
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    total += r.value.length;
    if (total > limit) { abort('over'); reader.cancel().then(null, () => { /* aborted */ }); return { over: true }; }
    parts.push(r.value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return { bytes: out };
}

// Origins that answered a simple GET in this page: only then can a failed preflighted call be called
// preflight_refused. Forgotten on every generation bump.
let proven: Record<string, true> = {};
interface Inflight { alive: () => boolean; abort: (why: string) => void }
const inflight = new Set<Inflight>();

onBump(() => {
  proven = {};
  for (const e of [...inflight]) if (!e.alive()) e.abort('aborted');
});

export interface SendHow {
  onSend?: () => void;
  signal?: AbortSignal;
  alive?: () => boolean;
  /** 'ok': a 2xx resolves {res, bytes} (download); 'any': every HTTP answer does (run). */
  raw?: 'ok' | 'any';
  /** Called with the success answer's ETag header (null when it has none) just before the answer is returned. */
  onEtag?: (etag: string | null) => void;
  /** Called with the success answer's HTTP status (a 2xx) just before the answer is returned (routes.ts readsStatus). */
  onStatus?: (status: number) => void;
  /** The page is going away: the request may outlive it (fetch keepalive). */
  keepalive?: boolean;
}

export interface RawAnswer { readonly res: Response; readonly bytes: Uint8Array }

// The failures the exchange itself made from a Response it read: the only rejections that are an answer. Anything else that
// rejects once the request was entered (a transport wrapper's own error, whatever fields it carries) is a lost connection.
const answered_ = new WeakSet<object>();
const brand = (e: KitRejection): KitRejection => { answered_.add(e); return e; };
const isAnswered = (e: unknown): boolean => typeof e === 'object' && e !== null && answered_.has(e);

function exchange(url: string, plan: KitPlan, how: SendHow): Promise<unknown> {
  let why = '';
  const ac = new AbortController();
  const origin = (/^https:\/\/[^/?#]+/.exec(url) || [''])[0];
  const abort = (w: string) => { why = why || w; try { ac.abort(); } catch { /* done */ } };
  const onCaller = () => abort('aborted');
  const entry: Inflight = { alive: how.alive || (() => true), abort };
  // Everything acquired below is released by done(), whichever way the exchange ends; each release is its own step and its
  // error is dropped: a failed release never replaces the exchange's outcome.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let listening = false;
  // preflight_refused only for a preflighted request that got no answer at all, from a proven origin. Once
  // an answer arrived the request reached the server: a lost body is unreachable (status 0).
  let answered = false;
  // The answer's trace id, once one arrived: a body that then fails to read still names it (error details).
  let tid: string | null = null;
  const failed = () => {
    const ex = answered ? (tid ? { traceId: tid, answered: true as const } : { answered: true as const }) : undefined;
    return why === 'timeout' ? rejection('unreachable', 0, 'TIMEOUT', ex) : why ? rejection('aborted', 0, undefined, ex)
      : !answered && plan.preflight && proven[origin] ? rejection('preflight_refused', 0) : rejection('unreachable', 0, 'NETWORK', ex);
  };
  const done = () => {
    try { if (timer !== undefined) clearTimeout(timer); } catch { /* released as far as it can be */ }
    try { inflight.delete(entry); } catch { /* same */ }
    try { if (listening) how.signal?.removeEventListener('abort', onCaller); } catch { /* same */ }
  };
  // One boundary, from the first resource to the promise chain: a throw anywhere in it releases what was acquired and rejects.
  // Once the send hook ran (`entered`) the request may have gone out, so the outcome is the unknown one, whatever threw
  // afterwards; before it, nothing was sent.
  let entered = false;
  try {
    timer = setTimeout(() => abort('timeout'), plan.timeoutMs);
    inflight.add(entry);
    if (how.signal) { listening = true; how.signal.addEventListener('abort', onCaller); }
    const init: RequestInit = {
      method: plan.method, headers: { ...plan.headers, ...(privateHeaders.get(plan) || {}) }, body: plan.body, signal: ac.signal, cache: 'no-store', redirect: 'manual',
      credentials: plan.credentials, ...(how.keepalive === true ? { keepalive: true } : {}),
    };
    // The last step before the request goes out: the call's tickets are spent (ticket.ts), now that everything above exists.
    // A refusal here sends nothing; a lease's value is the only source of X-Hoody-Approver-Lease.
    if (plan.spent) {
      const sp = spendTickets(plan.spent);
      if (!sp.ok) { done(); return Promise.reject(notSentRejection(sp.code)); }
      if (sp.lease !== null) (init.headers as Record<string, string>)['X-Hoody-Approver-Lease'] = sp.lease;
    }
    entered = true;
    if (typeof how.onSend === 'function') how.onSend();
    return transport().fetch(url, init, plan.meta).then(async (res) => {
    const s = res.status, ok = s >= 200 && s < 300, whole = ok || how.raw === 'any';
    answered = true;
    // An answered request's rejections carry its trace id when the answer named one (error details).
    tid = traceIdOf(res.headers.get('x-trace-id'));
    const answeredRejection = (kind: string, code?: string | null, extra?: Partial<KitRejection>): KitRejection =>
      brand(rejection(kind, s, code, tid ? { ...extra, traceId: tid } : extra));
    if (res.type === 'opaqueredirect' || (s >= 300 && s < 400)) { abort('redirect'); throw answeredRejection('redirected'); }
    if (plan.proves) proven[origin] = true;
    if (ok && plan.method === 'HEAD' && !how.raw && !plan.meta.route.run) {
      res.body?.cancel().then(null, () => { /* nothing to read */ });
      return validatorsOf(res);
    }
    const b = await readBounded(res, whole ? plan.maxBytes : Math.min(plan.maxBytes, ERR_BYTES), abort);
    if (whole && b.over) throw answeredRejection('too_large');
    if (whole && how.raw && b.bytes) return { res, bytes: b.bytes } as RawAnswer;
    const text = b.over || !b.bytes ? null : decode(b.bytes);
    if (!ok) {
      // Only hoody-exec's own API names its cause in details.code (errorOf `nested`); a promoted cause never marks notApplied.
      // hoody-vm names its code in error.code (errorOf 'vm'); a code its route lists in refuses marks notApplied.
      const r = plan.meta.route;
      const { promoted, ...x } = errorOf(res, text, r.scope === 'kit' && r.kit === 'vm' ? 'vm' : r.scope === 'kit' && r.kit === 'exec' && !r.run);
      const refused = !promoted && x.code !== null && !!r.refuses?.includes(x.code);
      throw answeredRejection(kindOf(s, x.code), x.code, refused ? { ...x, notApplied: true } : x);
    }
    if (text === '') { try { how.onEtag?.(res.headers.get('etag')); } catch { /* the caller's note only */ } try { how.onStatus?.(s); } catch { /* the caller's note only */ } return {}; }
    if (text !== null && !/^application\/([a-z0-9.+-]*\+)?json\s*(;|$)/i.test(res.headers.get('content-type') || '')) throw answeredRejection('unavailable', 'NOT_JSON');
    let parsed: unknown;
    if (text === null) throw answeredRejection('unavailable', 'BAD_JSON');
    try { parsed = JSON.parse(text); } catch { throw answeredRejection('unavailable', 'BAD_JSON'); }
    // A tool envelope answers 200: is_error is the failure. A code the route lists as a refusal is one made before
    // anything applied; any other error may have run in part (status 200 reads as an unknown outcome upstream).
    if (plan.meta.route.envelope && isPlainRecord(parsed) && parsed.is_error === true) {
      const c = typeof parsed.code === 'string' && parsed.code.length <= 64 ? parsed.code : null;
      const refused = c !== null && !!plan.meta.route.refuses?.includes(c);
      throw answeredRejection(refused ? 'refused' : 'unavailable', refused ? c : c ?? 'TOOL_ERROR',
        { details: isPlainRecord(parsed.details) ? parsed.details : {}, data: parsed, ...(refused ? { notApplied: true } : {}) });
    }
    try { how.onEtag?.(res.headers.get('etag')); } catch { /* the caller's note only */ }
    try { how.onStatus?.(s); } catch { /* the caller's note only */ }
    return parsed;
  }).then((v) => { done(); return v; }, (e) => { done(); throw isAnswered(e) ? e : failed(); });
  } catch {
    done();
    return Promise.reject(entered ? failed() : notSentRejection('unavailable'));
  }
}

/** Sends an admitted plan once (and the Bot listing fallback). */
export function send(plan: KitPlan, how: SendHow = {}): Promise<unknown> {
  const live = () => typeof how.alive !== 'function' || how.alive();
  if (how.signal?.aborted) return Promise.reject(notSentRejection('aborted'));
  if (!live()) return Promise.reject(notSentRejection('stale', { stale: true }));
  const t0 = plan.meta.target;
  if (t0 && !routingAllows(t0.container.id, t0.container.server_name)) return Promise.reject(notSentRejection('NO_AGENT_URL'));
  // A live terminal refuses some sends outright (live-gate.ts): asked here, before the exchange is entered, so the refusal
  // reads not sent. On the web nothing is installed and this is null.
  const early = liveEarlyRefusal(plan.meta.route);
  if (early) return Promise.reject(notSentRejection(early.code, early.stale === true ? { stale: true } : undefined));
  return exchange(plan.url, plan, how).then(null, (e: KitRejection) => {
    // The fallback is a second request: it asks the routing evidence again (routing.ts), like any new request to the computer.
    const tg = plan.meta.target;
    if (plan.fallback && e.status === 400 && e.code === 'realm_scope_unsupported' && !how.signal?.aborted && live()) {
      // The first request went out and was answered: its own rejection stands, only the second request is not sent.
      if (tg && !routingAllows(tg.container.id, tg.container.server_name)) throw e;
      return exchange(plan.fallback, plan, how);
    }
    throw e;
  });
}

/** A fresh idempotency key for a route with idem. Keep it to read a pending change back with the same key. */
export function newKey(): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b = new Uint8Array(26);
  crypto.getRandomValues(b);
  let s = 'hub-';
  for (const x of b) s += A.charAt(x & 63);
  return s;
}

/** alive() bound to one context (the kit's legs hand it to send). */
export function aliveFn(ctx: Ctx): () => boolean {
  return () => alive(ctx);
}

/** Tests only. */
export function inflightCount(): number {
  return inflight.size;
}
