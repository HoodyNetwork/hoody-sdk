// The HoodyClient adapter over the CLI's HTTP transport. The
// CLI hands in `wire` (its HTTP client, after the SDK rename) and its credential; here, only the rules every attempt
// keeps, written once:
//
//   - A Hoody call goes to `<apiOrigin>/api/v1<path>` or, when core addressed a realm host, exactly
//     `https://<realm id>.<realmApiDomain>/api/v1<path>`; any other `base` is refused, nothing sent.
//   - The body is the canonical JSON of live-policy.ts (`canonicalJson`), and the bytes digested for `beforeWire` are
//     the bytes sent: never a second serialisation.
//   - `beforeWire(attempt)` runs immediately before the one wire attempt; false = nothing sent ({status: 0, notSent,
//     stale}). There is no retry here: a refresh-and-resend belongs to the CLI client and passes through `beforeWire`
//     again with the same attempt.
//   - The session bearer goes only to the API origin and realm API hosts (the only places a Hoody URL is built for);
//     a kit or agent `fetch` gets nothing added here (no bearer, no cookie jar). Its headers are the plan's, and the
//     adapter refuses unsent any name admission row 4 allows on no route of that leg: a cookie,
//     `Proxy-Authorization`, `Authorization` on the agent leg (run routes are kit routes), and every `X-Hoody-*` outside the leg's set (agent: `X-Hoody-Cwd`,
//     `X-Hoody-Approver-Lease`; kit: `X-Hoody-Pipe`, `X-Hoody-Pipe-Sender-Key`). Which route may carry which of them
//     (and a run route's own `Authorization`) is the admission's decision, bound per attempt by `beforeWire`.
//   - A kit or agent `fetch` goes only to an https host under the proxy domain the client was given (or its family
//     twin, core/hosts.ts), never to the API origin or a realm API host; anything else, and every `fetch` of a client
//     with no proxy domain, is refused unsent (`{status: 0, notSent: true, code: 'TERM_DESTINATION'}`).
//     Its body is the bytes given (a string, bytes or a Blob read whole); a stream body is refused unsent.
//   - A redirect is never followed (`redirect: 'manual'`); a 3xx answer, or a transport that followed one anyway, is
//     refused, so the bearer cannot reach the place it points to.
//   - The CLI's session must still be `session.sid` (else 401 superseded, nothing sent); an aborted signal sends nothing.
import { createHash } from 'node:crypto';
import type { ClientCallControls, HoodyClient, WireAttempt } from '../host-types';
import { hostUnderFamily } from '../../core/hosts';
import { canonicalJson } from './live-policy';

const API = '/api/v1';
const REALM_BASE = /^https:\/\/([0-9a-f]{24})\.([^/?#:@]+)\/api\/v1$/;
const PATH = /^\/[^#\s]*$/;
/** The agent leg's URLs (live-policy computerDestination: `<origin>/api/v1/agent/…`); every other computer URL is the kit's. */
const AGENT_PATH = /^\/api\/v1\/agent\//;
/** The only X-Hoody-* names a computer leg ever sends (admission row 4; live-policy planHeaderAllowed + seal). */
const HOODY_HEADERS: Readonly<Record<'kit' | 'agent', readonly string[]>> = {
  agent: ['x-hoody-cwd', 'x-hoody-approver-lease'],
  kit: ['x-hoody-pipe', 'x-hoody-pipe-sender-key'],
};
const sha = (v: string | Uint8Array): string => createHash('sha256').update(v).digest('hex');

/** One request as the CLI transport receives it. It must not follow redirects. */
export interface WireRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array | null;
  readonly signal: AbortSignal;
  readonly redirect: 'manual';
}

export interface CliClientDeps {
  readonly identity: HoodyClient['identity'];
  /** scheme + host (+ port), no path. */
  readonly apiOrigin: string;
  readonly realmApiDomain: string;
  readonly proxyDomain?: string;
  /** The CLI's signed-in session now (it changes on a login, logout or profile switch); null when signed out. */
  readonly currentSid: () => string | null;
  /** The CLI's credential for the API, read at each attempt; null = nothing to send with. */
  readonly bearer: () => string | null;
  readonly wire: (req: WireRequest) => Promise<Response>;
}

type CallOpts = ClientCallControls & { base?: string; ifMatch?: string; ifNoneMatch?: '*'; onEtag?: (etag: string | null) => void; timeoutMs?: number };

const notSent = (stale: boolean): Record<string, unknown> => (stale ? { status: 0, notSent: true, stale: true } : { status: 0, notSent: true });
const superseded = (): Record<string, unknown> => ({ status: 401, superseded: true, notSent: true });
/** A kit or agent URL that is not a computer's. */
const wrongPlace = (): Record<string, unknown> => ({ status: 0, notSent: true, code: 'TERM_DESTINATION' });

function refusalOf(status: number, text: string, headers: Headers): Record<string, unknown> {
  const out: Record<string, unknown> = { status };
  let body: unknown;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = undefined; }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const b = body as Record<string, unknown>;
    // The API's refusal envelope is {statusCode, error: <code>, message, data?} (error-handler.ts); `code` only as a fallback.
    // A generic name with a space ("Not Found") fails the check below and is dropped, as in the web (shared.js `data.error`).
    const code = typeof b.error === 'string' ? b.error : typeof b.code === 'string' ? b.code : undefined;
    if (typeof code === 'string' && /^[A-Za-z_]{1,40}$/.test(code)) out.code = code;
    if (b.data !== undefined) out.data = b.data;
  }
  // Only a plain number of seconds counts (as shared.js); an absent header is no retryAfter (Number(null) is 0).
  const raw = headers.get('retry-after');
  if (raw !== null && /^\d{1,9}$/.test(raw)) out.retryAfter = parseInt(raw, 10);
  const trace = headers.get('x-trace-id');
  if (trace && /^[0-9A-Za-z-]{16,64}$/.test(trace)) out.traceId = trace;
  return out;
}

export function cliHoodyClient(d: CliClientDeps): HoodyClient {
  const origin = /^https?:\/\/[^/?#@]+$/.test(d.apiOrigin) ? d.apiOrigin : null;

  /** The absolute URL for a Hoody call, or null when `base` is not a place a Hoody call may go. */
  const urlOf = (path: string, base: string | undefined): string | null => {
    if (!origin || typeof path !== 'string' || !PATH.test(path)) return null;
    if (base === undefined || base === API) return origin + API + path;
    const m = REALM_BASE.exec(base);
    return m && m[2] === d.realmApiDomain ? base + path : null;
  };
  const apiPlace = (url: string): boolean => {
    if (!origin) return false;
    if (url.startsWith(origin + '/')) return true;
    const m = /^https:\/\/([0-9a-f]{24})\.([^/?#:@]+)\//.exec(url);
    return !!m && m[2] === d.realmApiDomain;
  };

  return {
    identity: d.identity,
    apiOrigin: d.apiOrigin,
    realmApiDomain: d.realmApiDomain,
    ...(d.proxyDomain !== undefined ? { proxyDomain: d.proxyDomain } : {}),

    async request(method: string, path: string, body: unknown, o: CallOpts): Promise<unknown> {
      if (d.currentSid() !== o.session.sid) throw superseded();
      const url = urlOf(path, o.base);
      if (!url) throw notSent(false);
      let bytes: Uint8Array | null = null;
      if (body !== null && body !== undefined) {
        const text = canonicalJson(body);
        if (text === null) throw notSent(false);
        bytes = new TextEncoder().encode(text);
      }
      const attempt: WireAttempt = Object.freeze({ method: method.toUpperCase(), url, bodyDigest: bytes ? sha(bytes) : null });
      const token = d.bearer();
      if (!token || !apiPlace(url)) throw notSent(false);
      const headers: Record<string, string> = { accept: 'application/json', authorization: `Bearer ${token}` };
      if (bytes) headers['content-type'] = 'application/json';
      if (o.ifMatch !== undefined) headers['if-match'] = o.ifMatch;
      if (o.ifNoneMatch === '*') headers['if-none-match'] = '*';
      const signal = o.timeoutMs !== undefined ? AbortSignal.any([o.signal, AbortSignal.timeout(o.timeoutMs)]) : o.signal;
      // The last checks, then the attempt: nothing may run between beforeWire and the send.
      if (d.currentSid() !== o.session.sid) throw superseded();
      if (signal.aborted || !o.beforeWire(attempt)) throw notSent(true);
      // beforeWire may run the caller's send note, which may sign out or switch: the session again, then the send.
      if (d.currentSid() !== o.session.sid) throw superseded();
      let res: Response;
      try {
        res = await d.wire({ method: attempt.method, url, headers, body: bytes, signal, redirect: 'manual' });
      } catch {
        throw { status: 0 };
      }
      if (res.redirected || (res.status >= 300 && res.status < 400) || res.type === 'opaqueredirect') {
        try { await res.body?.cancel(); } catch { /* gone */ }
        throw { status: res.status || 0, redirect: true };
      }
      let text: string;
      try { text = await res.text(); } catch { throw { status: 0 }; }
      if (res.status < 200 || res.status >= 300) throw refusalOf(res.status, text, res.headers);
      o.onEtag?.(res.headers.get('etag'));
      if (!text) return null;
      try { return JSON.parse(text) as unknown; } catch { throw { status: res.status, data: undefined }; }
    },

    async fetch(url: string, init: RequestInit, o?: ClientCallControls): Promise<Response> {
      if (!o) throw notSent(false);
      if (d.currentSid() !== o.session.sid) throw superseded();
      if (o.signal.aborted) throw notSent(true);
      // Kit and agent legs: a computer's own host under the proxy domain, never the API's places, never a credential from here.
      let to: URL | null = null;
      try { to = new URL(url); } catch { to = null; }
      if (!to || !/^https:\/\/[^/?#@]+\//.test(url) || to.username || to.password || to.port || apiPlace(url)
        || d.proxyDomain === undefined || !hostUnderFamily(to.hostname, d.proxyDomain, true)) throw wrongPlace();
      const leg: 'kit' | 'agent' = AGENT_PATH.test(to.pathname) ? 'agent' : 'kit';
      const h = new Headers(init.headers);
      const list: Array<readonly [string, string]> = [];
      let refused = false;
      h.forEach((v, k) => {
        const n = k.toLowerCase();
        if (n === 'cookie' || n === 'cookie2' || n === 'proxy-authorization' || (n === 'authorization' && leg === 'agent') || (n.startsWith('x-hoody-') && !HOODY_HEADERS[leg].includes(n))) refused = true;
        list.push([n, sha(v)] as const);
      });
      if (refused) throw notSent(false);
      list.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      const b = init.body;
      let bytes: Uint8Array | null = null;
      if (typeof b === 'string') bytes = new TextEncoder().encode(b);
      else if (b instanceof Uint8Array) bytes = b;
      else if (b instanceof ArrayBuffer) bytes = new Uint8Array(b);
      else if (b instanceof Blob) { try { bytes = new Uint8Array(await b.arrayBuffer()); } catch { throw notSent(false); } }
      else if (b !== null && b !== undefined) throw notSent(false);
      // Reading a Blob waited: the session and the signal again before the attempt is built.
      if (d.currentSid() !== o.session.sid) throw superseded();
      const method = (init.method ?? 'GET').toUpperCase();
      const attempt: WireAttempt = Object.freeze({ method, url, bodyDigest: bytes ? sha(bytes) : null, headers: Object.freeze(list), cookie: false });
      if (o.signal.aborted || !o.beforeWire(attempt)) throw notSent(true);
      if (d.currentSid() !== o.session.sid) throw superseded();
      const headers: Record<string, string> = {};
      h.forEach((v, k) => { headers[k.toLowerCase()] = v; });
      let res: Response;
      try { res = await d.wire({ method, url, headers, body: bytes, signal: o.signal, redirect: 'manual' }); } catch { throw { status: 0 }; }
      if (res.redirected || (res.status >= 300 && res.status < 400) || res.type === 'opaqueredirect') {
        try { await res.body?.cancel(); } catch { /* gone */ }
        throw { status: res.status || 0, redirect: true };
      }
      return res;
    },
  };
}

/** The transport the tests use (and the shape the CLI's must keep): global fetch, never following a redirect, no
 *  cookie jar. */
export const fetchWire = (req: WireRequest): Promise<Response> =>
  fetch(req.url, { method: req.method, headers: req.headers, body: req.body as BodyInit | null, signal: req.signal, redirect: 'manual' });
