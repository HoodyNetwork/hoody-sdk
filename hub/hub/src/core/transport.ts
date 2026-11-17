// transport.ts: the wire. Real (shared.js apiCall and fetch) or fixtures (hub:dev and tests).
//
// Contract:
//   - Three legs. hoody(): a Hoody API request with shared.js apiCall semantics (bearer, single-flight refresh,
//     base-host check, onSend right before the fetch, alive checked before every send). fetch(): one request
//     to a computer's agent or kit program, answered as a Response; kit.ts maps it. socket() (optional; socket.ts):
//     one WebSocket to a computer's agent, opened at once with the subprotocols given and no headers; it reports
//     open (the selected subprotocol) at most once, then text frames as strings and binary frames as ArrayBuffers,
//     then close (code, reason) exactly once, the real leg's 1006 included. A leg that cannot open throws (nothing
//     was sent). The real leg uses hostEnv().webSocket.
//   - Every outcome rule (pending, stale, scrub, framed, 2FA) lives above this file, in api.ts and kit.ts, so
//     the fixture transport exercises the same rules as the real one.
//   - Fixtures: a page declares its fake answers per route in its own fixtures.ts with defineFixtures and
//     reply(route, answer). An answer can be slow (delayMs), a 5xx (pending for a change), lost (network:
//     no answer at all, after the request went out) or late (the context moves on right before the answer
//     arrives, so the answer is dropped as stale, or pending for a change). A route with no rule answers
//     501 NO_FIXTURE.
//   - Fixture sockets (hub:dev and tests only; the leg refuses unless fixturesAllowed()): fixtureSocket(route, script)
//     is a rule whose script plays the server (FixtureSocketServer: accept, text, binary, close, drop, refuse, and the
//     client's frames and close). Every step of either side arrives on a later microtask (plus the toolbar's latency),
//     in order. A ws route with no socket rule is refused as the agent's refuse=frame would: a refused frame
//     {code: NO_FIXTURE}, then close 4501. Socket rules never answer hoody() or fetch().
import { hostEnv } from './host-env';
import { registryEntry } from './registry';
import { bump, initCore, setIdentity, setRealm, setTarget, type Target } from './ctx';
import { setProxyDomain } from './hosts';
import { API_BASE, installShared, readPage, shared, type ApiCallOpts, type AuthPurgeInfo, type HubErrorBase, type PageIdentity, type Shared, type StoredSession } from './session';
import type { Route } from './routes';
import { traceIdOf } from './trace-id';

/** What a leg knows about the call besides the wire: the declared route and the built request. */
export interface CallMeta {
  readonly route: Route;
  readonly method: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly body: unknown;
  /** Agent and kit legs: the computer the call goes to (Hoody API legs: absent). */
  readonly target?: Target | null;
  /** Hoody API legs on an ifMatch route: the If-Match value sent. */
  readonly ifMatch?: string;
  /** The caller's `bind` (CallInput), handed to this one call only. */
  readonly bind?: object;
}

/** What a socket leg reports (see the contract). */
export interface SocketEvents {
  open(protocol: string): void;
  message(data: string | ArrayBuffer): void;
  close(code: number, reason: string): void;
}
/** One WebSocket as its leg holds it. send() is false when the frame was not handed to the socket. */
export interface SocketLike {
  send(data: string | ArrayBuffer | ArrayBufferView<ArrayBuffer>): boolean;
  close(code?: number, reason?: string): void;
}

export interface Transport {
  hoody(method: string, url: string, body: unknown, opts: ApiCallOpts, meta: CallMeta): Promise<unknown>;
  fetch(url: string, init: RequestInit, meta: CallMeta): Promise<Response>;
  socket?(url: string, protocols: readonly string[], meta: CallMeta, on: SocketEvents): SocketLike;
  /** Set by fixtureTransport: answers come from fixture rules, never the network. */
  readonly fixture?: boolean;
}

const realTransport: Transport = {
  hoody(method, url, body, opts) {
    return shared().apiCall(method, url, body === null ? undefined : body, null, undefined, opts);
  },
  fetch(url, init) {
    return globalThis.fetch(url, init);
  },
  socket(url, protocols, _meta, on) {
    const WS = hostEnv().webSocket;
    if (!WS) throw new Error('NO_WEBSOCKET');
    const ws = new WS(url, [...protocols]);
    ws.binaryType = 'arraybuffer';
    let ended = false;
    ws.onopen = () => { if (!ended) on.open(ws.protocol); };
    ws.onmessage = (e: MessageEvent) => {
      const d: unknown = e.data;
      if (!ended && (typeof d === 'string' || d instanceof ArrayBuffer)) on.message(d);
    };
    ws.onclose = (e: CloseEvent) => { if (ended) return; ended = true; on.close(e.code, e.reason); };
    return {
      send(d) {
        if (ended || ws.readyState !== 1) return false;
        try { ws.send(d); return true; } catch { return false; }
      },
      close(code, reason) {
        try { ws.close(code, reason); } catch { try { ws.close(); } catch { /* closing already */ } }
      },
    };
  },
};

let current: Transport = realTransport;

export function transport(): Transport {
  return current;
}

/** True while a fixture transport answers (hub:dev, hub:shots, bootFixtureCore); false on a live page. */
export function fixtureModeActive(): boolean {
  return __HUB_FIXTURES__ && current !== realTransport && current.fixture === true;
}

/** Install a transport (the fixture one, or a test's). null goes back to the real one. */
export function installTransport(t: Transport | null): void {
  current = t || realTransport;
}

// ---------------------------------------------------------------------------------------------------------
// Fixtures

export interface FixtureAnswer<R = unknown> {
  /** HTTP status (default 200). */
  status?: number;
  /** The JSON answer. For an error status, `{error: CODE}` is how the Hoody API names its code. */
  body?: R | Record<string, unknown>;
  headers?: Readonly<Record<string, string>>;
  /** Milliseconds before the answer arrives. */
  delayMs?: number;
  /** No answer at all (connection lost after the request went out). */
  network?: boolean;
  /** The context moves on (a realm generation bump) right before the answer arrives. */
  late?: boolean;
  /** `body` is sent as it is, not as JSON: a file's text (a string) or its bytes (a Uint8Array, kit and agent routes only). */
  raw?: boolean;
}

export interface FixtureRequest {
  readonly route: Route;
  readonly method: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly body: unknown;
  /** The computer an agent or kit call goes to (its resolved target); null for a Hoody API call. */
  readonly target: Target | null;
  /** The If-Match value an ifMatch route sent (absent otherwise). */
  readonly ifMatch?: string;
  /** Which attempt of this rule this is, from 1. */
  readonly n: number;
  /** The request's abort signal, when its call has one (fixture fetch only), so a rule can see a cancelled request. */
  readonly signal?: AbortSignal;
}

export type Responder<R = unknown> = FixtureAnswer<R> | ((req: FixtureRequest) => FixtureAnswer<R> | Promise<FixtureAnswer<R>>);

export interface FixtureRule {
  readonly route: Route;
  readonly answer: Responder;
  readonly when?: (req: FixtureRequest) => boolean;
  /** Answer only this many times, then fall through to the next matching rule. */
  readonly times?: number;
  /** A socket rule (fixtureSocket): the script that plays the server; such a rule answers no hoody() or fetch(). */
  readonly socket?: SocketScript;
}

/** The server side of one fixture socket (see the contract). */
export interface FixtureSocketServer {
  readonly req: FixtureRequest;
  /** The subprotocols the client offered. */
  readonly protocols: readonly string[];
  /** Accepts the upgrade, selecting `protocol` (default: the first offered). */
  accept(protocol?: string): void;
  text(s: string): void;
  binary(b: ArrayBuffer): void;
  close(code: number, reason?: string): void;
  /** The connection drops without a close frame (1006). */
  drop(): void;
  /** The agent's refuse=frame answer: accept, one refused frame, close 4000 + status. */
  refuse(status: number, code: string, o?: { message?: string; details?: Record<string, unknown>; retryAfterSecs?: number }): void;
  /** The client's frames, in order. */
  onMessage(cb: (data: string | ArrayBuffer) => void): void;
  /** The client closed (its code and reason). */
  onClose(cb: (code: number, reason: string) => void): void;
}
export type SocketScript = (server: FixtureSocketServer) => void;

/** A scripted server for one declared ws route (hub:dev and tests only). */
export function fixtureSocket(route: Route, script: SocketScript, o?: { when?: (req: FixtureRequest) => boolean; times?: number }): FixtureRule {
  return Object.freeze({ route, answer: { status: 501, body: { error: 'SOCKET_RULE' } }, socket: script, when: o?.when, times: o?.times });
}

/** One fake answer for one declared route. */
export function reply<R>(route: Route<R, unknown>, answer: Responder<R>, o?: { when?: (req: FixtureRequest) => boolean; times?: number }): FixtureRule {
  return Object.freeze({ route: route as Route, answer: answer as Responder, when: o?.when, times: o?.times });
}

/** A page's fixtures: its named states (empty, many, error, pending, ...) and the one shown by default. */
export interface Fixtures<S extends string = string> {
  readonly default: S;
  readonly states: Readonly<Record<S, readonly FixtureRule[]>>;
}

export function defineFixtures<const T extends Record<string, readonly FixtureRule[]>>(f: { default: keyof T & string; states: T }): { readonly default: keyof T & string; readonly states: Readonly<T> } {
  if (!Object.hasOwn(f.states, f.default)) throw new Error('defineFixtures: default "' + f.default + '" is not a state');
  return Object.freeze({ default: f.default, states: Object.freeze({ ...f.states }) });
}

/** Presets. */
export const answers = {
  ok: <R>(body: R, delayMs?: number): FixtureAnswer<R> => ({ status: 200, body, delayMs }),
  slow: <R>(body: R, delayMs = 2500): FixtureAnswer<R> => ({ status: 200, body, delayMs }),
  /** A gateway error: a change answered this way is pending (may have gone through). */
  pending5xx: (status = 502, delayMs?: number): FixtureAnswer => ({ status, body: { error: 'BAD_GATEWAY' }, delayMs }),
  /** The request went out and no answer came back. */
  lost: (delayMs = 300): FixtureAnswer => ({ network: true, delayMs }),
  /** The answer arrives after the context moved on (it is dropped, or pending for a change). */
  late: <R>(body: R, delayMs = 800): FixtureAnswer<R> => ({ status: 200, body, delayMs, late: true }),
  refused: (status: number, code: string): FixtureAnswer => ({ status, body: { error: code } }),
  /** A text/plain answer sent as it is (a file's lines). */
  text: (body: string, delayMs?: number): FixtureAnswer<string> => ({ status: 200, body, delayMs, raw: true, headers: { 'content-type': 'text/plain; charset=utf-8' } }),
  /** Bytes sent as they are (a picture a kit program answers), with their media type. */
  bytes: (body: Uint8Array, type: string, delayMs?: number): FixtureAnswer<Uint8Array> => ({ status: 200, body, delayMs, raw: true, headers: { 'content-type': type } }),
};

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, Math.max(0, ms));
    function onAbort() { clearTimeout(t); reject(abortError()); }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(): Error {
  try { return new DOMException('The operation was aborted.', 'AbortError'); } catch { const e = new Error('aborted'); e.name = 'AbortError'; return e; }
}

export interface FixtureOptions {
  /** Called for a late answer, right before it arrives (fixture mode wires the realm generation bump). */
  onLate?: () => void;
  /** Added to every answer's delay (the dev toolbar's latency). */
  extraDelayMs?: number;
}

/** The fixture transport plus its controls (the dev toolbar switches state and latency live). */
export interface FixtureTransport extends Transport {
  /** Replace the rules (another state); counts of `times` start again. */
  setRules(rules: readonly FixtureRule[]): void;
  setExtraDelay(ms: number): void;
}

/** A transport that answers from rules, first match wins. */
export function fixtureTransport(initial: readonly FixtureRule[], o: FixtureOptions = {}): FixtureTransport {
  let rules = initial;
  let extra = o.extraDelayMs || 0;
  let used = new Map<FixtureRule, number>();
  async function answerFor(meta: CallMeta, signal?: AbortSignal | null): Promise<FixtureAnswer> {
    for (const r of rules) {
      if (r.route !== meta.route || r.socket) continue;
      const n = (used.get(r) || 0) + 1;
      const req: FixtureRequest = { route: meta.route, method: meta.method, path: meta.path, query: meta.query, body: meta.body, target: meta.target ?? null, ...(meta.ifMatch !== undefined ? { ifMatch: meta.ifMatch } : {}), n, ...(signal ? { signal } : {}) };
      if (r.when && !r.when(req)) continue;
      if (r.times !== undefined && n > r.times) continue;
      used.set(r, n);
      return typeof r.answer === 'function' ? r.answer(req) : r.answer;
    }
    return { status: 501, body: { error: 'NO_FIXTURE', route: meta.route.id } };
  }
  async function settle(a: FixtureAnswer, signal?: AbortSignal | null): Promise<void> {
    await sleep((a.delayMs || 0) + extra, signal);
    if (a.late && o.onLate) o.onLate();
  }
  return {
    fixture: true,
    setRules(next) { rules = next; used = new Map(); },
    setExtraDelay(ms) { extra = Math.max(0, ms | 0); },
    async hoody(method, _url, body, opts, meta) {
      // apiCall's order: the cancel check, onSend, then the request.
      if (typeof opts.alive === 'function' && !opts.alive()) throw { status: 0, code: 'CANCELLED', cancelled: true } as HubErrorBase;
      // The body actually sent (a 2FA retry adds otp_code to it), not the one the call was built with.
      const a = await answerFor({ ...meta, method, body: body === undefined ? meta.body : body });
      if (typeof opts.onSend === 'function') opts.onSend();
      await settle(a);
      if (a.network) throw new TypeError('Failed to fetch');
      const status = a.status ?? 200;
      // A copy per answer, as off the wire: a scrub that nulls a secret in its answer never changes the rule's own
      // body, so the next call of the rule answers the same (a secret route's read, e.g. the realm aliases).
      const data = (a.body === undefined ? {} : JSON.parse(JSON.stringify(a.body))) as Record<string, unknown>;
      if (status >= 200 && status < 300) {
        // As apiCall: a success answer's ETag header (a fixture names it `etag`), null when it has none.
        if (typeof opts.onEtag === 'function') opts.onEtag((a.headers && a.headers['etag']) ?? null);
        return data;
      }
      const ra = a.headers && a.headers['retry-after'];
      const retryAfter = typeof ra === 'string' && /^\d+$/.test(ra) ? parseInt(ra, 10) : null;
      // A fixture sets a trace id as the API does, with an x-trace-id header; kept in the API's shape only (trace-id.ts).
      const tid = traceIdOf(a.headers && a.headers['x-trace-id']);
      throw { status, code: (data && typeof data.error === 'string' && data.error) || null, data, retryAfter, ...(tid ? { traceId: tid } : {}) } as HubErrorBase;
    },
    async fetch(_url, init, meta) {
      const a = await answerFor(meta, init.signal);
      await settle(a, init.signal);
      if (a.network) throw new TypeError('Failed to fetch');
      const status = a.status ?? 200;
      const headers = new Headers(a.headers || {});
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      const bytes = a.raw && a.body instanceof Uint8Array ? a.body : null;
      const text = a.body === undefined || status === 204 || bytes ? '' : a.raw ? String(a.body) : JSON.stringify(a.body);
      return new Response(status === 204 ? null : bytes ? (bytes as BodyInit) : text, { status, headers });
    },
    socket(_url, protocols, meta, on) {
      if (!fixturesAllowed()) throw new Error('FIXTURES_REFUSED');
      let script: SocketScript | null = null;
      let req: FixtureRequest = { route: meta.route, method: meta.method, path: meta.path, query: meta.query, body: meta.body, target: meta.target ?? null, n: 1 };
      for (const r of rules) {
        if (r.route !== meta.route || !r.socket) continue;
        const n = (used.get(r) || 0) + 1;
        const at: FixtureRequest = { ...req, n };
        if (r.when && !r.when(at)) continue;
        if (r.times !== undefined && n > r.times) continue;
        used.set(r, n);
        script = r.socket;
        req = at;
        break;
      }
      return playSocket(script, req, protocols, on, () => extra);
    },
  };
}

const bufferOf = (d: ArrayBuffer | ArrayBufferView<ArrayBuffer>): ArrayBuffer =>
  d instanceof ArrayBuffer ? d.slice(0) : new Uint8Array(d.buffer, d.byteOffset, d.byteLength).slice().buffer;

/** Both ends of one fixture socket: each step of either side on a later microtask (plus `extra()` ms), in order. */
function playSocket(script: SocketScript | null, req: FixtureRequest, protocols: readonly string[], on: SocketEvents, extra: () => number): SocketLike {
  let state: 'connecting' | 'open' | 'closing' | 'closed' = 'connecting';
  let chain: Promise<void> = Promise.resolve();
  const fromClient: Array<(d: string | ArrayBuffer) => void> = [];
  const clientClosed: Array<(code: number, reason: string) => void> = [];
  const later = (fn: () => void) => {
    chain = chain.then(() => (extra() ? sleep(extra()) : undefined)).then(fn).catch(() => undefined);
  };
  const end = (code: number, reason: string, byClient: boolean) => {
    if (state === 'closed') return;
    state = 'closed';
    if (byClient) for (const cb of clientClosed) { try { cb(code, reason); } catch { /* the script's */ } }
    on.close(code, reason);
  };
  const server: FixtureSocketServer = {
    req, protocols,
    accept(p) { later(() => { if (state !== 'connecting') return; state = 'open'; on.open(p ?? protocols[0] ?? ''); }); },
    text(t) { later(() => { if (state === 'open') on.message(t); }); },
    binary(b) { const copy = b.slice(0); later(() => { if (state === 'open') on.message(copy); }); },
    close(code, reason = '') { later(() => end(code, reason, false)); },
    drop() { later(() => end(1006, '', false)); },
    refuse(status, code, o = {}) {
      server.accept();
      server.text(JSON.stringify({ type: 'refused', code, message: o.message ?? code, ...(o.details ? { details: o.details } : {}), ...(o.retryAfterSecs !== undefined ? { retry_after_secs: o.retryAfterSecs } : {}) }));
      server.close(4000 + status);
    },
    onMessage(cb) { fromClient.push(cb); },
    onClose(cb) { clientClosed.push(cb); },
  };
  if (!script) server.refuse(501, 'NO_FIXTURE');
  else { try { script(server); } catch { server.drop(); } }
  return {
    send(d) {
      if (state !== 'open') return false;
      const copy = typeof d === 'string' ? d : bufferOf(d);
      later(() => { if (state === 'open') for (const cb of fromClient) { try { cb(copy); } catch { /* the script's */ } } });
      return true;
    },
    close(code = 1000, reason = '') {
      if (state === 'closing' || state === 'closed') return;
      // A socket closed before it opened never had a close handshake: the browser reports 1006.
      const wasOpen = state === 'open';
      state = 'closing';
      later(() => end(wasOpen ? code : 1006, wasOpen ? reason : '', true));
    },
  };
}

// ---------------------------------------------------------------------------------------------------------
// The fixture session: hub:dev has no sign-in. One account session that is always held; no purge reaches
// real storage. Everything else of shared.js behaves as on a top-level page.

// The fixture world's anchors (core/world.ts: its account Ada, first realm Personal, current computer atlas) as literals:
// this live module never imports the world (a fixture module; the terminal ship build refuses one as an input).
// core/fixture-ids.test.ts pins each equal to the world's. Each folds to an empty value when __HUB_FIXTURES__ is false.
const FIXTURE_ACCOUNT = __HUB_FIXTURES__
  ? Object.freeze({ id: '64f0ada00000000000000001', username: 'ada', email: 'ada@example.com' })
  : Object.freeze({ id: '', username: '', email: '' });
/** fixtureWorld's account (Ada). */
export const FIXTURE_UID = FIXTURE_ACCOUNT.id;
const FIXTURE_SID = 'fixturesession00';
const FIXTURE_OWNER = Object.freeze({ id: FIXTURE_ACCOUNT.id, username: FIXTURE_ACCOUNT.username });
const FIXTURE_TOKEN = 'fixture-access-token';

/** Fixture mode never runs on a live page: a production build (no fixtures compiled in) or a page where the real
 *  shared.js is loaded refuses, so no call can wipe real tokens or sign the page in as the fixture account. */
export function fixturesAllowed(): boolean {
  if (typeof __HUB_FIXTURES__ !== 'undefined' && !__HUB_FIXTURES__) return false;
  const g = globalThis as { storedSession?: unknown; apiCall?: unknown };
  return typeof g.storedSession !== 'function' && typeof g.apiCall !== 'function';
}
export function assertFixturesAllowed(): void {
  if (!fixturesAllowed()) throw new Error('FIXTURES_REFUSED: fixture mode on a live page');
}

export function fixtureShared(o: { uid?: string; framed?: boolean; realmDomain?: string; token?: { realm: string } } = {}): Shared {
  assertFixturesAllowed();
  const uid = o.uid || FIXTURE_UID;
  let signedIn = true;
  const hooks: Array<(info?: AuthPurgeInfo) => void> = [];
  // A shared-access (token) session when asked (fixtureSession): pinned to its realm, owned by the world's account.
  const session = (): StoredSession | null => (!signedIn ? null : o.token
    ? Object.freeze({ kind: 'token', uid, sid: FIXTURE_SID, bearer: FIXTURE_TOKEN, realm: o.token.realm, owner: FIXTURE_OWNER })
    : Object.freeze({ kind: 'account', uid, sid: FIXTURE_SID, bearer: FIXTURE_TOKEN }));
  const held = (id: PageIdentity | null) => {
    const s = session();
    return !!id && !!s && s.kind === id.kind && s.uid === id.uid && s.sid === id.sid;
  };
  // As shared.js (purgeAuthStorage): the hooks first, with the reason and the outgoing account read
  // before anything is removed (a token session names its owner, the session's uid), then every registered purge
  // key of this browser's storage.
  const purge = (reason: AuthPurgeInfo['reason']) => {
    const info: AuthPurgeInfo = { reason, uid: signedIn ? uid : null };
    for (const h of hooks) { try { h(info); } catch { /* the hook's own */ } }
    signedIn = false;
    for (const [area, box] of [['local', hostEnv().local], ['session', hostEnv().session]] as const) {
      if (!box) continue;
      try {
        const doomed: string[] = [];
        for (let i = 0; i < box.length; i++) { const k = box.key(i); if (k !== null && registryEntry(area, k)?.purge) doomed.push(k); }
        for (const k of doomed) box.removeItem(k);
      } catch { /* storage unavailable */ }
    }
  };
  return {
    storedSession: session,
    holdsIdentity: held,
    holdsSession: held,
    sessionTokenUid: (t) => (signedIn && t === FIXTURE_TOKEN ? uid : null),
    sessionTokenSid: (t) => (signedIn && t === FIXTURE_TOKEN ? FIXTURE_SID : null),
    readAccessToken: () => (signedIn ? FIXTURE_TOKEN : null),
    apiCall: () => Promise.reject({ status: 0, code: 'FIXTURE_MODE', notSent: true }),
    isFramedPage: () => !!o.framed,
    framedSensitiveRoute: () => null,
    framedRefusedError: () => ({ status: 403, code: 'FRAMED_ACTION_REFUSED', framed: true, notSent: true }),
    supersededAuthError: () => ({ status: 401, superseded: true }),
    isSupersededAuthError: (e) => !!e && typeof e === 'object' && (e as HubErrorBase).superseded === true && (e as HubErrorBase).status === 401,
    // A realm domain, so realm hosts and the switcher's probe behave as live (the fixture transport ignores hosts).
    realmApiDomain: () => o.realmDomain ?? 'api.fixture.invalid',
    clearAuthTokens: (p) => { purge(p?.reason ?? 'cleanup'); },
    purgeOutgoingSession: (_s, p) => { purge(p?.reason ?? 'expiry'); return 'purged'; },
    endOutgoingSession: () => Promise.resolve(),
    onBeforeAuthPurge: (fn) => { hooks.push(fn); },
    authStorageEntry: registryEntry,
    authSessionSuperseded: () => false,
    adoptReissuedSession: () => false,
  };
}

/**
 * Fixture mode for hub:dev, hub:shots, page specs and tests: the fixture session plus the fixture transport.
 * The app collects the shown state's rules (every loaded page's fixtures.ts) and passes them here; the
 * returned controls switch state and latency without a reload. A late answer bumps the realm generation.
 */
/** fixtureWorld's first realm (Personal). */
export const FIXTURE_REALM = __HUB_FIXTURES__ ? 'f1f1f1f1f1f1f1f1f1f1f1f1' : '';
/** fixtureWorld's current computer (atlas). */
export const FIXTURE_TARGET: Target = __HUB_FIXTURES__
  ? Object.freeze({
    project: Object.freeze({ id: '6a0000000000000000000001' }),
    container: Object.freeze({ id: 'c0a7150000000000000000a1', server_name: 'n12' }),
  })
  : Object.freeze({ project: Object.freeze({ id: '' }), container: Object.freeze({ id: '', server_name: '' }) });

export function startFixtureMode(rules: readonly FixtureRule[] = [], o: FixtureOptions & { uid?: string; framed?: boolean; realm?: string; target?: Target | null; token?: { realm: string } } = {}): FixtureTransport {
  assertFixturesAllowed();
  installShared(fixtureShared({ uid: o.uid, framed: o.framed, token: o.token }));
  const t = fixtureTransport(rules, { onLate: () => { bump('late'); }, ...o });
  installTransport(t);
  setProxyDomain('fixture.invalid');
  const page = readPage();
  initCore({ page, tokenRealm: o.token ? o.token.realm : null });
  setRealm(o.realm ?? FIXTURE_REALM);
  setTarget(o.target === undefined ? FIXTURE_TARGET : o.target);
  if (page) setIdentity({ id: page.uid, username: FIXTURE_ACCOUNT.username, email: FIXTURE_ACCOUNT.email, banned: false });
  return t;
}

export { API_BASE };
