// kit-io.ts: the kit's less common legs on top of kit.ts admit/send.
// Every request here is admitted by kit.admit against a declared route and sent by kit.send;
// nothing builds a URL of its own.
//
// Contract:
//   - run(route, target, path, o): a user-script route on exec-<o.index> through a declared run route (path under the
//     route's own path; omitted, o.index is the route's own one, and a route that takes any folder refuses). Refused framed, on /api/v1…, or when the path is not its normalised form; bodies
//     ≤1 MiB of JSON, answers ≤256 KiB. o.headers is admitted by the kit (HEADER_NOT_ALLOWED otherwise;
//     Authorization allowed, never shown). Resolves {status, body (text), executionId|null} for any HTTP
//     answer, stale when the context died first. Never retried.
//   - download(route, input): a GET through a declared agent or kit route, resolving {parts: [Blob], bytes}.
//     maxBytes is required; validateEnd(tail of at most 64 KiB) must return true, or the result is too_large.
//   - save(name, parts, {maxBytes}): a download through an object URL; the name is sanitised. Only on a web page
//     (hostEnv().browserPage): elsewhere (a terminal) it refuses NO_FILES before it reads any browser global.
//   - postBytes(route, input): one POST through a declared agent route flagged `bytes` (speechRoute: createSpeech), with a
//     JSON body, resolving {bytes, type}. maxBytes is required and enforced while reading (too_large); input.accept lists
//     1..8 audio media types (ACCEPT_INVALID otherwise, unsent), and an answer whose Content-Type is not one of them, or
//     that is empty, is unavailable NOT_AUDIO. Error answers are the usual envelope. Never retried: it may be paid, so a
//     rejection after the request went out (unreachable, aborted, timeout) means it may have run. The caller's signal,
//     a dead context or the account ending aborts it; a context that died before the answer was handed over is stale.
//   - upload(route, input): one streaming POST/PUT through a declared upload route (kit only): the body is the
//     caller's ReadableStream, sent with `duplex: 'half'` as it is produced, Content-Type a WebM media type and
//     `X-Hoody-Pipe: mimeType=<type>` (built here, never the caller's headers), plus `X-Hoody-Pipe-Sender-Key` on a
//     route that declares senderKey: there input.senderKey (16-128 of [A-Za-z0-9_-]) is required, elsewhere refused
//     (HEADER_NOT_ALLOWED). No timeout of its own (a broadcast
//     runs for hours): the caller's signal, a dead context (generation move, teardown) or the account ending
//     aborts it. Resolves {status, text (≤64 KiB)} once the server answers, which a pipe does only after the body
//     ended; rejects aborted / stale / unreachable / redirected. Refused framed. Never retried.
//   - stream(route, input): one fetch-based SSE connection that never reconnects. Frames over the route's
//     byte bound are skipped (state 'gap'); the whole stream stops at its budget; it ends when the context
//     dies before an event is handed over, when the page stays hidden 60 s, on the caller's signal or close(),
//     or when the open takes longer than the route's timeout. States: open, gap, error {status, code,
//     retryAfterMs}, closed {reason: server | network | budget | hidden | aborted | denied}.
//   - version(target): GET /version fresh on every call, never cached: {api_version, supported, available,
//     pinned_realm}, capability names checked, stale when the context died first.
//   - store: storage keys registered in shared.js's storage registry only (STORE_UNREGISTERED otherwise),
//     one document per key partitioned by account and, for scope account+realm / account+computer, by a part
//     name. At most 8 accounts and 32 parts (oldest go first) and 64 KiB per value; a foreign shape is
//     dropped. No shown account → nothing read or written.
//   - stage(o): the model of a program's full-screen web UI (the shell draws it): only for a declared kit route
//     of that kit and index, a live context and a known computer, never framed. One at a time (a new one
//     closes the old as 'replaced'); once its context died (teardown, generation move, session change) it
//     closes as 'stale'.
import { alive, capture, loggingOut, onBump, subscribe, type Ctx, type Target } from './ctx';
import { hostEnv, localStore, sessionStore } from './host-env';
import { admit, agentRealm, aliveFn, notSentRejection, pathOk, readBounded, rejection, retryAfterMs, send, type KitRejection, type RawAnswer } from './kit';
import { accountEnded, onTeardown } from './realm';
import { buildRequest, defineRoute, isDeclared, type Built, type CallInput, type Route } from './routes';
import { isFramed, shared } from './session';
import { transport } from './transport';
import { isPlainRecord } from './shape';
import { isRealmOrGlobal } from './realm-id';
import { traceIdOf } from './trace-id';

const RUN_BODY = 1 << 20;
const TAIL = 65536;
const ERR_BYTES = 65536;
const HIDDEN_MS = 60000;

function refused(code: string, kind?: string): Promise<never> {
  const e = rejection(kind || 'not_sent', 0, kind ? kind : code);
  e.notSent = true;
  return Promise.reject(e);
}
const stale = (): KitRejection => rejection('stale', 0, 'stale', { stale: true });
const utf8Len = (s: string) => new TextEncoder().encode(s).length;
const own = Object.hasOwn;

// ---- run ----

export interface RunOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number>;
  body?: unknown;
  headers?: Record<string, string>;
  ctx?: Ctx;
  signal?: AbortSignal;
  /** The Exec folder (the route's index rule decides which it admits); omitted, a route with one numeric index uses it and a route that takes any folder refuses. */
  index?: number;
}
/**
 * `headers`: the answer's headers a page may read, as fetch gives them (names lowercase, sorted; Set-Cookie never), for showing.
 * `size`: the body's length in bytes as received (the text may differ when it is not UTF-8).
 */
export interface RunAnswer {
  readonly status: number;
  readonly body: string;
  readonly executionId: string | null;
  readonly headers: ReadonlyArray<readonly [string, string]>;
  readonly size: number;
}

/** A user-script route through a declared run route (see the contract). */
export function run(route: Route, target: Target | null, path: string, o: RunOptions = {}): Promise<RunAnswer> {
  for (const k of Object.keys(o)) if (!['method', 'query', 'body', 'headers', 'ctx', 'signal', 'index'].includes(k)) return refused('OPTION_UNKNOWN');
  let hs: unknown;
  try { hs = o.headers; } catch { return refused('HEADER_NOT_ALLOWED'); } // read once; a throwing getter refuses
  if (isFramed()) return refused('FRAMED_ACTION_REFUSED');
  if (!isDeclared(route) || !route.run) return refused('ROUTE_NOT_ALLOWED');
  const m = o.method || 'GET', q = o.query || {}, qs: string[] = [], query: Record<string, string> = {};
  if (typeof path !== 'string' || !/^\/[A-Za-z0-9._~/-]*$/.test(path) || /^\/api\/v1(\/|$)/i.test(path) || !pathOk(path)
    || !isPlainRecord(q)) return refused('PATH_INVALID');
  const prefix = route.path === '/' ? '/' : route.path + '/';
  if (path !== route.path && path.indexOf(prefix) !== 0) return refused('ROUTE_NOT_ALLOWED');
  for (const key of Object.keys(q)) {
    const v = q[key];
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(key) || (typeof v !== 'string' && !(typeof v === 'number' && Number.isFinite(v)))) return refused('PATH_INVALID');
    qs.push(key + '=' + encodeURIComponent(String(v)));
    query[key] = String(v);
  }
  let body: unknown = null;
  if (o.body !== undefined && o.body !== null) {
    let text: string | null;
    try { text = JSON.stringify(o.body); } catch { text = null; }
    if (typeof text !== 'string') return refused('BODY_INVALID');
    if (utf8Len(text) > RUN_BODY) return refused('', 'too_large');
    body = JSON.parse(text);
  }
  if (m !== route.method) return refused('ROUTE_NOT_ALLOWED');
  const ctx = o.ctx || capture(target), live = aliveFn(ctx);
  const built: Built = Object.freeze({ url: path + (qs.length ? '?' + qs.join('&') : ''), path, query: Object.freeze(query), body });
  const plan = admit(route, built, { target: target || ctx.target, index: o.index, headers: hs });
  if ('refused' in plan) return refused(plan.refused);
  return send(plan, { signal: o.signal, alive: live, raw: 'any' }).then((v) => {
    const r = v as RawAnswer;
    if (!live()) throw stale();
    const x = r.res.headers.get('x-execution-id');
    const headers: (readonly [string, string])[] = [];
    // Lowercase and sorted here too: a browser gives them so, not every Headers does.
    r.res.headers.forEach((v, k) => { headers.push(Object.freeze([k.toLowerCase(), v] as const)); });
    headers.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return Object.freeze({
      status: r.res.status, body: new TextDecoder('utf-8').decode(r.bytes),
      executionId: typeof x === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(x) ? x : null,
      headers: Object.freeze(headers), size: r.bytes.length,
    });
  });
}

// ---- download / save ----

export interface DownloadInput extends CallInput<never> {
  maxBytes: number;
  validateEnd?: (tail: Uint8Array) => boolean;
}

/** A GET through a declared agent or kit route, as bytes (see the contract). */
export function download(route: Route, input: DownloadInput): Promise<{ parts: Blob[]; bytes: number }> {
  if (!(typeof input.maxBytes === 'number' && Number.isInteger(input.maxBytes) && input.maxBytes > 0)) return refused('MAXBYTES_INVALID');
  if (!isDeclared(route) || route.method !== 'GET' || route.stream || route.run) return refused('ROUTE_NOT_ALLOWED');
  const ctx = input.ctx || capture(input.target), live = aliveFn(ctx);
  const built = buildRequest(route, input);
  if ('refused' in built) return refused(built.refused);
  const plan = admit(route, built, { target: input.target || ctx.target, realm: agentRealm(route, input.realm, ctx), index: input.index, maxBytes: input.maxBytes, guardCtx: input.guardCtx });
  if ('refused' in plan) return refused(plan.refused);
  return send(plan, { signal: input.signal, alive: live, raw: 'ok' }).then((v) => {
    const r = v as RawAnswer, b = r.bytes;
    if (!live()) throw stale();
    let ok = typeof input.validateEnd !== 'function';
    if (!ok) { try { ok = (input.validateEnd as (t: Uint8Array) => boolean)(b.subarray(Math.max(0, b.length - TAIL))) === true; } catch { ok = false; } }
    if (!ok) throw rejection('too_large', r.res.status);
    return { parts: [new Blob([b as BlobPart])], bytes: b.length };
  });
}

// ---- postBytes ----

const ACCEPT_TYPE = /^audio\/[a-z0-9][a-z0-9.+-]{0,63}$/;
const ACCEPT_MAX = 8;
const bytesCalls = new Set<{ alive: () => boolean; abort: () => void }>();
function sweepBytes(): void { for (const e of [...bytesCalls]) if (!e.alive()) e.abort(); }
subscribe(sweepBytes);
onTeardown(sweepBytes);

/** createSpeech: `response_format` is not a body key, so the gateway picks wav or mp3. */
export const speechRoute = defineRoute({
  method: 'POST', path: '/audio/speech', scope: 'agent', realm: 'bot', bytes: true,
  body: ['model', 'input', 'voice', 'instructions', 'speed'], maxBytes: 2 * 1024 * 1024, timeoutMs: 60000,
});

export interface PostBytesInput<B = unknown> extends CallInput<B> {
  maxBytes: number;
  accept: readonly string[];
}

/** A POST through a declared bytes route, resolving the answer's bytes and media type (see the contract). */
export function postBytes<B>(route: Route<unknown, B>, input: PostBytesInput<B>): Promise<{ bytes: Uint8Array; type: string }> {
  if (!(typeof input.maxBytes === 'number' && Number.isInteger(input.maxBytes) && input.maxBytes > 0)) return refused('MAXBYTES_INVALID');
  if (!isDeclared(route) || !route.bytes || route.method !== 'POST') return refused('ROUTE_NOT_ALLOWED');
  // Every position is read once, holes included (a sparse array's hole is not a media type).
  const accept: string[] = [];
  try {
    const a: unknown = input.accept;
    if (Array.isArray(a) && a.length >= 1 && a.length <= ACCEPT_MAX) for (let i = 0; i < a.length; i++) accept.push(a[i]);
  } catch { accept.length = 0; }
  if (!accept.length || accept.some((t) => typeof t !== 'string' || !ACCEPT_TYPE.test(t))) return refused('ACCEPT_INVALID');
  const ctx = input.ctx || capture(input.target), alive_ = aliveFn(ctx), live = () => alive_() && !accountGoing();
  const built = buildRequest(route, input);
  if ('refused' in built) return refused(built.refused);
  const plan = admit(route, built, { target: input.target || ctx.target, realm: agentRealm(route, input.realm, ctx), maxBytes: input.maxBytes, guardCtx: input.guardCtx });
  if ('refused' in plan) return refused(plan.refused);
  const signal = input.signal;
  if (signal?.aborted) return refused('aborted');
  if (!live()) return Promise.reject(notSentRejection('stale', { stale: true }));
  // Our own controller: the caller's signal, and a context that dies without a generation move (sign-out started, the
  // session gone, the account ending), abort the read at once; send() itself aborts only on a bump.
  const ac = new AbortController();
  const abort = () => { try { ac.abort(); } catch { /* done */ } };
  const entry = { alive: live, abort };
  bytesCalls.add(entry);
  signal?.addEventListener('abort', abort);
  const done = () => { bytesCalls.delete(entry); signal?.removeEventListener('abort', abort); };
  return send(plan, { signal: ac.signal, alive: live, raw: 'ok' }).then((v) => {
    done();
    const r = v as RawAnswer, b = r.bytes;
    if (!live()) throw stale();
    const type = (r.res.headers.get('content-type') || '').split(';')[0]!.trim().toLowerCase();
    if (!accept.includes(type) || !b.length) {
      const tid = traceIdOf(r.res.headers.get('x-trace-id'));
      throw rejection('unavailable', r.res.status, 'NOT_AUDIO', tid ? { traceId: tid } : undefined);
    }
    return { bytes: b, type };
  }, (e: KitRejection) => {
    done();
    if (!e.notSent && !live()) throw stale();
    throw e;
  });
}

export function safeName(n: unknown): string {
  const s = String(n == null ? '' : n).replace(/[^A-Za-z0-9._ -]/g, '').replace(/^[. ]+/, '').slice(0, 120).replace(/[. ]+$/, '');
  return s || 'download';
}

/** Saves parts as a file through an object URL. */
export function save(name: unknown, parts: unknown, o: { maxBytes?: number } = {}): { ok: true; name: string; bytes: number } | { refused: string } {
  // The link is clicked in the page's document: a host that is not a web page has none, and in a terminal reading
  // `document` ends the mount even when the caller catches the throw. So it refuses first, having touched nothing.
  if (hostEnv().browserPage !== true) return { refused: 'NO_FILES' };
  const max = o.maxBytes;
  if (!(typeof max === 'number' && max > 0) || !Array.isArray(parts)) return { refused: 'MAXBYTES_INVALID' };
  let n = 0;
  for (const p of parts as unknown[]) {
    const x = p as { size?: unknown; byteLength?: unknown } | string | null;
    n += x && typeof x === 'object' && typeof x.size === 'number' ? x.size : typeof x === 'string' ? utf8Len(x)
      : x && typeof x === 'object' && typeof x.byteLength === 'number' ? x.byteLength : 0;
  }
  if (n > max) return { refused: 'TOO_LARGE' };
  const url = URL.createObjectURL(new Blob(parts as BlobPart[])), a = document.createElement('a'), file = safeName(name);
  a.href = url; a.download = file; a.rel = 'noopener'; a.hidden = true;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
  return { ok: true, name: file, bytes: n };
}

// ---- upload ----

export interface UploadInput extends Omit<CallInput<never>, 'body'> {
  /** The body, read once as it is produced (never locked before). */
  body: ReadableStream<Uint8Array>;
  /** A WebM media type (`video/webm;codecs=vp8,opus`): Content-Type and the pipe's `mimeType=`. */
  contentType: string;
  /** Required on a route that declares senderKey, refused on any other: 16-128 of [A-Za-z0-9_-]. */
  senderKey?: string;
}
export interface UploadAnswer { readonly status: number; readonly text: string }

const SENDER_KEY = /^[A-Za-z0-9_-]{16,128}$/;
const UPLOAD_TYPE = /^(?:video|audio)\/webm(?:;codecs=[a-z0-9.]+(?:,[a-z0-9.]+)*)?$/;
const uploads = new Set<{ alive: () => boolean; abort: () => void }>();
onBump(() => { for (const e of [...uploads]) if (!e.alive()) e.abort(); });
onTeardown(() => { for (const e of [...uploads]) if (!e.alive() || accountGoing()) e.abort(); });

/** One streaming upload through a declared upload route (see the contract). */
export function upload(route: Route, input: UploadInput): Promise<UploadAnswer> {
  if (!isDeclared(route) || !route.upload) return refused('ROUTE_NOT_ALLOWED');
  // Each input is read once: what is checked is what is sent.
  const { body, contentType, signal, senderKey } = input;
  if (typeof ReadableStream !== 'function' || !(body instanceof ReadableStream) || body.locked) return refused('BODY_INVALID');
  if (typeof contentType !== 'string' || !UPLOAD_TYPE.test(contentType)) return refused('HEADER_NOT_ALLOWED');
  // A keyed route never sends without its key, and no other route sends one.
  if (route.senderKey ? typeof senderKey !== 'string' || !SENDER_KEY.test(senderKey) : senderKey !== undefined) return refused('HEADER_NOT_ALLOWED');
  const ctx = input.ctx || capture(input.target), live = aliveFn(ctx);
  const built = buildRequest(route, { params: input.params, query: input.query });
  if ('refused' in built) return refused(built.refused);
  const plan = admit(route, built, { target: input.target || ctx.target, index: input.index });
  if ('refused' in plan) return refused(plan.refused);
  if (signal?.aborted) return refused('aborted');
  if (!live() || accountGoing()) return Promise.reject(Object.assign(stale(), { notSent: true }));
  const ac = new AbortController();
  let why = '';
  const abort = (w: string) => { why = why || w; try { ac.abort(); } catch { /* done */ } };
  const onCaller = () => abort('aborted');
  const entry = { alive: live, abort: () => abort('stale') };
  const headers = { ...plan.headers, Accept: 'text/plain', 'Content-Type': contentType, 'X-Hoody-Pipe': 'mimeType=' + contentType, ...(route.senderKey ? { 'X-Hoody-Pipe-Sender-Key': senderKey as string } : {}) };
  const init = { method: plan.method, headers, body, duplex: 'half', signal: ac.signal, cache: 'no-store', redirect: 'manual', credentials: plan.credentials } as RequestInit;
  uploads.add(entry);
  signal?.addEventListener('abort', onCaller);
  const done = () => { uploads.delete(entry); signal?.removeEventListener('abort', onCaller); };
  const failed = () => (why === 'stale' ? stale() : why ? rejection('aborted', 0) : rejection('unreachable', 0, 'NETWORK'));
  let p: Promise<Response>;
  try { p = transport().fetch(plan.url, init, plan.meta); } catch { p = Promise.reject(new TypeError('fetch')); }
  return p.then(async (res) => {
    const s = res.status;
    if (res.type === 'opaqueredirect' || (s >= 300 && s < 400)) { abort('redirect'); throw rejection('redirected', s); }
    const b = await readBounded(res, Math.min(plan.maxBytes, ERR_BYTES), abort);
    if (!live()) throw stale();
    if (b.over) throw rejection('too_large', s);
    // A caller abort that lands after the last chunk was read still ends as aborted.
    if (why) throw failed();
    return Object.freeze({ status: s, text: b.bytes ? new TextDecoder('utf-8').decode(b.bytes) : '' });
  }).then((v) => { done(); return v; }, (e) => { done(); throw e && (e as KitRejection).kind && why !== 'stale' ? e : failed(); });
}

/** Tests only. */
export function uploadCount(): number { return uploads.size; }

// ---- stream ----

export type StreamState =
  | { state: 'open'; status: number }
  | { state: 'gap'; reason: 'frame_too_large' }
  | { state: 'error'; status: number; code: string | null; retryAfterMs: number | null; retryAfter: number | null }
  | { state: 'closed'; reason: 'server' | 'network' | 'budget' | 'hidden' | 'aborted' | 'denied' };

export interface StreamInput extends CallInput<never> {
  onEvent: (name: string, data: string, id: string | undefined) => void;
  onState?: (s: StreamState) => void;
}

const streams = new Set<{ alive: () => boolean; abort: () => void }>();
onBump(() => { for (const e of [...streams]) if (!e.alive()) e.abort(); });

/** One SSE connection through a declared stream route (see the contract). */
export function stream(route: Route, input: StreamInput): { refused?: string; close: () => void } {
  const ctx = input.ctx || capture(input.target), live = aliveFn(ctx);
  let plan: ReturnType<typeof admit> | null = null;
  let why = '';
  if (!isDeclared(route) || !route.stream) why = 'ROUTE_NOT_ALLOWED';
  else {
    const built = buildRequest(route, input);
    if ('refused' in built) why = built.refused;
    else {
      plan = admit(route, built, { target: input.target || ctx.target, realm: agentRealm(route, input.realm, ctx), index: input.index, guardCtx: input.guardCtx });
      if ('refused' in plan) why = plan.refused;
    }
  }
  why = why || (typeof input.onEvent !== 'function' ? 'HANDLER_MISSING' : !live() ? 'STALE' : input.signal?.aborted ? 'ABORTED' : '');
  if (why || !plan || 'refused' in plan) return { refused: why || 'ROUTE_NOT_ALLOWED', close: () => {} };
  const p = plan;
  const fb = route.stream as { id: number; noId: number }, maxFrame = Math.max(fb.id, fb.noId), budget = p.maxBytes;
  const ac = new AbortController();
  let ended = false, hideTimer: ReturnType<typeof setTimeout> | null = null, offVis: (() => void) | null = null;
  const entry = { alive: live, abort: () => end('aborted') };
  const openTimer = setTimeout(() => end('network'), p.timeoutMs);
  function state(s: StreamState) { if (typeof input.onState === 'function') { try { input.onState(s); } catch { /* the caller's */ } } }
  function end(reason: 'server' | 'network' | 'budget' | 'hidden' | 'aborted' | 'denied') {
    if (ended) return;
    ended = true;
    clearTimeout(openTimer);
    if (hideTimer) clearTimeout(hideTimer);
    streams.delete(entry);
    offVis?.();
    input.signal?.removeEventListener('abort', onAbort);
    try { ac.abort(); } catch { /* done */ }
    state({ state: 'closed', reason });
  }
  function onAbort() { end('aborted'); }
  function onVis() {
    if (hostEnv().visible()) { if (hideTimer) clearTimeout(hideTimer); hideTimer = null; }
    else if (!hideTimer) hideTimer = setTimeout(() => end('hidden'), HIDDEN_MS);
  }
  streams.add(entry);
  offVis = hostEnv().onVisibilityChange(onVis);
  input.signal?.addEventListener('abort', onAbort);
  onVis();

  // The parser: lines end at CR, LF or CRLF; a blank line ends a frame. Frame sizes are counted in bytes as
  // they arrive, so an oversize frame is skipped without being kept.
  let total = 0, frame = 0, skip = false, parts: Uint8Array[] = [], lineLen = 0, lastCR = false, data: string[] = [], ev = '';
  let id: string | undefined;
  function add(b: Uint8Array, s: number, e: number) {
    if (e <= s) return;
    frame += e - s; lineLen += e - s;
    if (!skip && frame > maxFrame) { skip = true; parts = []; }
    if (!skip) parts.push(b.subarray(s, e));
  }
  function lineEnd() {
    if (!lineLen) { dispatch(); return; }
    if (!skip) {
      let n = 0, at = 0;
      for (const x of parts) n += x.length;
      const buf = new Uint8Array(n);
      for (const x of parts) { buf.set(x, at); at += x.length; }
      const line = new TextDecoder('utf-8').decode(buf), c = line.indexOf(':');
      const f = c < 0 ? line : line.slice(0, c);
      let v = c < 0 ? '' : line.slice(c + 1);
      if (v.charAt(0) === ' ') v = v.slice(1);
      if (f === 'data') data.push(v);
      else if (f === 'event') ev = v;
      else if (f === 'id' && v.indexOf('\u0000') < 0) id = v;
    }
    parts = []; lineLen = 0;
  }
  function dispatch() {
    const over = skip || frame > (id === undefined ? fb.noId : fb.id), name = ev || 'message', d = data, fid = id;
    frame = 0; skip = false; data = []; ev = ''; id = undefined;
    if (over) state({ state: 'gap', reason: 'frame_too_large' });
    else if (d.length && !live()) end('aborted');
    else if (d.length) { try { input.onEvent(name, d.join('\n'), fid); } catch { /* the caller's */ } }
  }
  // A CRLF counts whole in the frame it ends. Only a CRLF split across two reads leaves its LF uncounted: it is
  // never charged to the next frame.
  function feed(b: Uint8Array) {
    let s = 0;
    for (let i = 0; i < b.length && !ended; i++) {
      const c = b[i];
      if (c === 10 && lastCR) { lastCR = false; s = i + 1; continue; }
      lastCR = false;
      if (c === 10 || c === 13) {
        add(b, s, i); frame++;
        if (c === 13 && b[i + 1] === 10) { frame++; i++; } else if (c === 13 && i + 1 === b.length) lastCR = true;
        lineEnd(); s = i + 1;
      }
    }
    if (!ended) add(b, s, b.length);
  }
  function pump(reader: ReadableStreamDefaultReader<Uint8Array>) {
    reader.read().then((r) => {
      if (ended) return;
      if (r.done) { end('server'); return; }
      total += r.value.length;
      if (total > budget) { end('budget'); return; }
      feed(r.value);
      if (!ended) pump(reader);
    }, () => end('network'));
  }
  const init: RequestInit = { method: 'GET', headers: { Accept: 'text/event-stream' }, credentials: p.credentials, cache: 'no-store', redirect: 'manual', signal: ac.signal };
  transport().fetch(p.url, init, p.meta).then((res) => {
    const s = res.status;
    function fail(code: string | null, ra: number | null) {
      if (ended) return;
      state({ state: 'error', status: s, code, retryAfterMs: ra, retryAfter: ra === null ? null : Math.ceil(ra / 1000) });
      end(s === 401 || s === 403 ? 'denied' : 'server');
    }
    if (ended) return;
    if (res.type === 'opaqueredirect' || (s >= 300 && s < 400)) { fail('redirected', null); return; }
    if (s < 200 || s >= 300) {
      const ra = retryAfterMs(res.headers.get('retry-after'));
      readBounded(res, ERR_BYTES, () => ac.abort()).then((b) => {
        let code: string | null = null;
        try {
          const d = b.over || !b.bytes ? null : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b.bytes));
          const c = isPlainRecord(d) ? (typeof d.code === 'string' ? d.code : typeof d.error === 'string' ? d.error : null) : null;
          code = c && c.length <= 64 ? c : null;
        } catch { code = null; }
        fail(code, ra);
      }, () => fail(null, ra));
      return;
    }
    if (!/^text\/event-stream\s*(;|$)/i.test(res.headers.get('content-type') || '') || !res.body) { fail('NOT_SSE', null); return; }
    if (!live()) { end('aborted'); return; }
    clearTimeout(openTimer);
    state({ state: 'open', status: s });
    pump(res.body.getReader());
  }, () => end('network'));
  return { close: onAbort };
}

/** Tests only. */
export function streamCount(): number { return streams.size; }

// ---- version ----

export const versionRoute = defineRoute<unknown>({ method: 'GET', path: '/version', scope: 'agent', realm: 'none', maxBytes: 262144 });

export interface AgentVersion {
  readonly api_version: string;
  readonly supported: readonly string[];
  readonly available: readonly string[];
  readonly pinned_realm: string | null;
}

/** GET /version, fresh on every call (see the contract). */
export function version(target: Target | null, o: { ctx?: Ctx; signal?: AbortSignal } = {}): Promise<AgentVersion> {
  const ctx = o.ctx || capture(target), live = aliveFn(ctx);
  const built = buildRequest(versionRoute, {});
  if ('refused' in built) return Promise.reject(notSentRejection(built.refused));
  const plan = admit(versionRoute, built, { target: target || ctx.target });
  if ('refused' in plan) return Promise.reject(notSentRejection(plan.refused));
  return send(plan, { signal: o.signal, alive: live }).then((raw) => {
    if (!live()) throw stale();
    const v = isPlainRecord(raw) ? raw : {};
    const caps = Array.isArray(v.capabilities) ? v.capabilities.slice(0, 512) : [], sup: string[] = [], av: string[] = [], pin = v.pinned_realm;
    for (const c of caps) {
      if (!isPlainRecord(c) || typeof c.name !== 'string' || !/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(c.name)) continue;
      if (c.supported === true) sup.push(c.name);
      if (c.available === true) av.push(c.name);
    }
    return Object.freeze({
      api_version: typeof v.api_version === 'string' ? v.api_version.slice(0, 32) : '', supported: sup, available: av,
      pinned_realm: isRealmOrGlobal(pin) ? pin : null,
    });
  });
}

// ---- store ----

// Caps per key: the newest 8 accounts and 32 parts; a key kept at sign-out (purge false: a person's Boards) keeps
// 16 and 64. Past a cap the least recently written entry goes, and the write reports it (put().evicted).
const STORE_MAX = 65536, STORE_ACCOUNTS = 8, STORE_PARTS = 32, KEPT_ACCOUNTS = 16, KEPT_PARTS = 64, PART = /^(?!__proto__$)[A-Za-z0-9_.:-]{1,64}$/;
export type StoreScope = 'account' | 'account+realm' | 'account+computer';

// A value's UTF-8 size as stored, or Infinity when it cannot be stored (no JSON, a lone surrogate).
function storedBytes(v: unknown): number {
  try { return encodeURIComponent(JSON.stringify(v)).replace(/%[0-9A-F]{2}/g, '.').length; } catch { return Infinity; }
}
// The shown account is going (sign-out began, or its account ended by any purge): until the page leaves, capture()
// may still name it, so no raw write lands for it any more (a kept key would outlive the purge). Reads still work.
const accountGoing = (): boolean => { try { return loggingOut() || accountEnded(); } catch { return true; } };
function uid(): string {
  try { const c = capture(), u = c.account != null ? String(c.account) : ''; return u === '__proto__' ? '' : u; } catch { return ''; }
}

/** Why a read found nothing usable although bytes are stored: 'foreign' (the key holds another layout),
 *  'malformed' (this account's entry is not this layout), 'oversized' (the value is over 64 KiB), 'newer' (a newer
 *  layout version, written by a newer deploy in another tab). The bytes stay: a read never deletes; only a write
 *  for this account (and part) replaces its own entry, and never a newer layout's (put() and remove() refuse it:
 *  the value stays page-only, so an older tab never wipes every account's entries of a newer one). */
export type StoreReset = 'foreign' | 'malformed' | 'oversized' | 'newer';
export interface StorePut {
  ok: boolean;
  /** Entries dropped to stay under the caps (least recently written first): other accounts, this account's parts. */
  evicted: { accounts: number; parts: number };
  /** The key held another layout (unreadable for every account) and this write replaced it. */
  replacedForeign: boolean;
}
/** A tri-state read: the account's value, nothing stored for it, or a store that cannot be trusted right now
 *  (the browser read threw, no account is shown, the part is not valid, the key holds another layout or a newer
 *  one, or the value is over 64 KiB). Unreadable is never the same as missing: nothing may be concluded from it. */
export type Tri<T> = { s: 'ok'; v: T; acct: string } | { s: 'missing'; acct: string } | { s: 'unreadable' };
/** What update() did: 'ok' wrote, 'same' wrote nothing (fn returned null, or the entry was already absent),
 *  'unreadable' read nothing usable (fn was not called, nothing written), 'full' refused (the browser's quota, a value
 *  over the cap, or keepOthers and the write would evict), 'failed' (the account is going, fn threw, or any other
 *  throw: the write MAY have landed only for a throw inside the browser write). */
export type StoreUpdate = 'ok' | 'same' | 'unreadable' | 'full' | 'failed';
export type StoreUpdateFn = (cur: { s: 'ok'; v: unknown } | { s: 'missing' }) => { set: unknown } | { remove: true } | null;
export interface Partitioned {
  get(part?: string): unknown;
  /** get() with the reason a stored value could not be used (null when nothing was stored or it was used). */
  read(part?: string): { value: unknown; reset: StoreReset | null };
  set(value: unknown, part?: string): boolean;
  /** set() with what the write did to other entries. */
  put(value: unknown, part?: string): StorePut;
  remove(part?: string): boolean;
  /** One logical read: exactly one browser read. */
  readTri(part?: string): Tri<unknown>;
  /** Read-modify-write on ONE browser read and at most one write, both on the same parsed document. fn is not
   *  called when the read is unreadable. keepOthers refuses ('full') instead of evicting another account or part. */
  update(fn: StoreUpdateFn, o?: { part?: string; keepOthers?: boolean }): StoreUpdate;
}

/** A registered storage key, partitioned by account (and a part). Throws STORE_UNREGISTERED. */
export function partitioned(key: string, o: { scope: StoreScope; area?: 'local' | 'session'; purge?: unknown }): Partitioned {
  const area = o.area || 'local', parted = o.scope !== 'account';
  const reg = shared().authStorageEntry(area, key) as { purge?: unknown } | null;
  if (!reg || !['account', 'account+realm', 'account+computer'].includes(o.scope) || (o.purge !== undefined && reg.purge !== o.purge)) {
    const err = new Error('STORE_UNREGISTERED') as Error & { code: string };
    err.code = 'STORE_UNREGISTERED';
    throw err;
  }
  const box = () => (area === 'session' ? sessionStore() : localStore());
  const kept = reg.purge === false;
  const maxAccounts = kept ? KEPT_ACCOUNTS : STORE_ACCOUNTS, maxParts = kept ? KEPT_PARTS : STORE_PARTS;
  type Doc = { v: 1; a: Record<string, unknown> };
  // {doc, u, s, foreign, newer}: the stored document, this account and part; null = no slot. A stored value of
  // another layout reads as an empty document with foreign set (newer too when it is a later version of this
  // one), and its bytes stay (a read never deletes).
  // failed: the browser read itself threw, so the document is NOT known to be empty (a write built on it could drop
  // every other account's value): put() and remove() refuse, readTri() and update() say unreadable.
  function at(part?: string): { doc: Doc; u: string; s: string; foreign: boolean; newer: boolean; failed: boolean } | null {
    const u = uid(), s = !parted ? '' : typeof part === 'string' && PART.test(part) ? part : null;
    let d: unknown = null, foreign = false, newer = false, failed = false;
    if (!u || s === null) return null;
    try {
      const raw = box().getItem(key);
      if (raw != null) {
        try { d = JSON.parse(raw); } catch { d = null; }
        if (!(isPlainRecord(d) && d.v === 1 && isPlainRecord(d.a))) {
          newer = isPlainRecord(d) && typeof d.v === 'number' && d.v > 1;
          d = null;
          foreign = true;
        }
      }
    } catch { d = null; failed = true; }
    return { doc: (d as Doc | null) || { v: 1, a: {} }, u, s, foreign, newer, failed };
  }
  const quota = (e: unknown): boolean => { const c = e as { name?: unknown; code?: unknown } | null; return !!c && (c.name === 'QuotaExceededError' || c.code === 22 || c.code === 1014); };
  function writeDoc(d: Doc, evicted = { accounts: 0, parts: 0 }): 'ok' | 'full' | 'failed' {
    try {
      const keys = Object.keys(d.a);
      while (keys.length > maxAccounts) { delete d.a[keys.shift() as string]; evicted.accounts++; }
      if (keys.length) box().setItem(key, JSON.stringify(d)); else box().removeItem(key);
      return 'ok';
    } catch (e) { return quota(e) ? 'full' : 'failed'; }
  }
  const write = (d: Doc, evicted = { accounts: 0, parts: 0 }): boolean => writeDoc(d, evicted) === 'ok';
  // What the document holds for this account (and part), from an already parsed read.
  function slot(x: NonNullable<ReturnType<typeof at>>): { present: boolean; value: unknown; reset: StoreReset | null } {
    if (x.foreign) return { present: false, value: null, reset: x.newer ? 'newer' : 'foreign' };
    if (!own(x.doc.a, x.u)) return { present: false, value: null, reset: null };
    let v: unknown = x.doc.a[x.u];
    if (parted) {
      if (!isPlainRecord(v)) return { present: false, value: null, reset: 'malformed' };
      if (!own(v, x.s)) return { present: false, value: null, reset: null };
      v = v[x.s];
    }
    return storedBytes(v) <= STORE_MAX ? { present: true, value: v, reset: null } : { present: false, value: null, reset: 'oversized' };
  }
  function read(part?: string): { value: unknown; reset: StoreReset | null } {
    const x = at(part);
    if (!x) return { value: null, reset: null };
    const r = slot(x);
    return { value: r.value, reset: r.reset };
  }
  function readTri(part?: string): Tri<unknown> {
    const x = at(part);
    if (!x || x.failed) return { s: 'unreadable' };
    const r = slot(x);
    if (r.reset !== null) return { s: 'unreadable' };
    return r.present ? { s: 'ok', v: r.value, acct: x.u } : { s: 'missing', acct: x.u };
  }
  function update(fn: StoreUpdateFn, o?: { part?: string; keepOthers?: boolean }): StoreUpdate {
    const x = at(o && o.part);
    if (!x || x.failed) return 'unreadable';
    const r = slot(x);
    if (r.reset !== null) return 'unreadable';
    let out: ReturnType<StoreUpdateFn>;
    try { out = fn(r.present ? { s: 'ok', v: r.value } : { s: 'missing' }); } catch { return 'failed'; }
    if (out === null) return 'same';
    if (accountGoing()) return 'failed';
    const a = x.doc.a, keep = !!(o && o.keepOthers);
    const cur = a[x.u], m: Record<string, unknown> = parted && isPlainRecord(cur) ? cur : {};
    if ('remove' in out && out.remove === true) {
      if (!r.present) return 'same';
      delete a[x.u];
      if (parted) {
        delete m[x.s];
        if (Object.keys(m).length) a[x.u] = m;
      }
      // keepOthers: a document already over the account cap cannot be written without dropping someone else's entry.
      if (keep && Object.keys(a).length > maxAccounts) return 'full';
      const w = writeDoc(x.doc);
      return w === 'ok' ? 'ok' : w;
    }
    if (!('set' in out)) return 'failed';
    let text: string | undefined;
    try { text = JSON.stringify(out.set); } catch { text = undefined; }
    if (typeof text !== 'string' || storedBytes(out.set) > STORE_MAX) return 'full';
    delete a[x.u];
    if (!parted) a[x.u] = JSON.parse(text);
    else {
      delete m[x.s];
      m[x.s] = JSON.parse(text);
      // keepOthers refuses (writes nothing) where the write would have to drop another part of this account.
      if (keep && Object.keys(m).length > maxParts) return 'full';
      for (let ks = Object.keys(m); ks.length > maxParts;) { delete m[ks.shift() as string]; }
      a[x.u] = m;
    }
    // keepOthers: nor may another account be evicted, whatever the document held when it was read.
    if (keep && Object.keys(a).length > maxAccounts) return 'full';
    return writeDoc(x.doc);
  }
  function put(value: unknown, part?: string): StorePut {
    const evicted = { accounts: 0, parts: 0 };
    const x = at(part);
    let text: string | undefined;
    try { text = JSON.stringify(value); } catch { text = undefined; }
    if (!x || x.failed || x.newer || accountGoing() || typeof text !== 'string' || storedBytes(value) > STORE_MAX) return { ok: false, evicted, replacedForeign: false };
    // Only this account's own entry (and part) is replaced; other accounts' entries stay as stored, malformed or not.
    const a = x.doc.a, cur = a[x.u], m: Record<string, unknown> = isPlainRecord(cur) ? cur : {};
    delete a[x.u];
    if (!parted) a[x.u] = JSON.parse(text);
    else {
      delete m[x.s];
      m[x.s] = JSON.parse(text);
      for (let ks = Object.keys(m); ks.length > maxParts;) { delete m[ks.shift() as string]; evicted.parts++; }
      a[x.u] = m;
    }
    const ok = write(x.doc, evicted);
    return { ok, evicted: ok ? evicted : { accounts: 0, parts: 0 }, replacedForeign: ok && x.foreign };
  }
  return Object.freeze({
    get(part?: string) { return read(part).value; },
    read,
    set(value: unknown, part?: string) { return put(value, part).ok; },
    put,
    readTri,
    update,
    remove(part?: string) {
      if (accountGoing()) return false;
      const x = at(part), a = x && x.doc.a;
      if (!x || x.failed || x.foreign || !a || !own(a, x.u)) return false;
      if (!parted) delete a[x.u];
      else {
        const m = a[x.u];
        // Nothing stored for this part: nothing to rewrite.
        if (!isPlainRecord(m) || !own(m, x.s)) return true;
        delete m[x.s];
        if (!Object.keys(m).length) delete a[x.u];
      }
      return write(x.doc);
    },
  });
}

// The flat form: an account-partitioned string under a registered key.
function flat(key: string): Partitioned {
  return partitioned(key, { scope: 'account', area: shared().authStorageEntry('local', key) ? 'local' : 'session' });
}
export const store = Object.freeze({
  partitioned,
  get(k: string): string | null { const v = flat(k).get(); return typeof v === 'string' ? v : null; },
  set(k: string, v: unknown): boolean { return flat(k).set(String(v)); },
});

// ---- stage ----

export type StageClose = 'back' | 'closed' | 'replaced' | 'stale' | 'failed';
export interface Stage {
  readonly kit: string;
  readonly index: number;
  readonly computer: { readonly id: string; readonly project_id: string; readonly server_name: string };
  readonly label: string;
  alive(): boolean;
  /** The shell's view calls this (back button, Esc, a failed load with its code). */
  close(reason: StageClose, code?: string): void;
}

let current: Stage | null = null;
function sweepStage(): void { if (current && !current.alive()) current.close('stale'); }
onTeardown(sweepStage);
onBump(sweepStage);
subscribe(sweepStage);

/** The program's web UI full screen (see the contract). null when refused. */
export function stage(o: { route: Route; index: number; back: string; ctx?: Ctx; target?: Target | null; onClose?: (reason: StageClose, code: string) => void }): Stage | null {
  for (const k of Object.keys(o)) if (!['route', 'index', 'ctx', 'target', 'back', 'onClose'].includes(k)) return null;
  const ctx = o.ctx || capture(o.target), tg = o.target || ctx.target;
  const r = o.route;
  const holds = isDeclared(r) && r.scope === 'kit' && Number.isInteger(o.index) && o.index >= 0
    && (typeof r.index === 'number' ? r.index === o.index : (() => { try { return typeof r.index === 'function' && r.index(o.index) === true; } catch { return false; } })());
  const container = tg?.container as { id?: unknown; server_name?: unknown } | undefined;
  const project = tg?.project as { id?: unknown } | undefined;
  if (isFramed() || !holds || !alive(ctx) || !tg || !project || !container || !container.server_name || typeof o.back !== 'string' || !o.back) return null;
  if (current) current.close('replaced');
  let closed = false;
  const live = () => alive(ctx);
  const me: Stage = Object.freeze({
    kit: r.kit as string, index: o.index, label: o.back,
    computer: Object.freeze({ id: String(container.id), project_id: String(project.id), server_name: String(container.server_name) }),
    alive: live,
    close(reason: StageClose, code?: string) {
      if (closed) return;
      closed = true;
      if (current === me) current = null;
      try { if (typeof o.onClose === 'function') o.onClose(reason, code || ''); } catch { /* the caller's */ }
    },
  });
  current = me;
  return me;
}

/** The stage on screen, for the shell's view. */
export function currentStage(): Stage | null { return current; }
