// upload.ts: one picked file to a computer through a declared file route.
//
// Contract:
//   - sendFile(route, input) admits the route (kit.ts admit: a file route, its headers checked by fileHeaders), then
//     runs the upload: queued (at most PER_COMPUTER uploads run at a time per computer, the rest wait in order),
//     hashing (the file's SHA-256, streamed), input.beforeSend({sha256, size}) (the caller saves its held change
//     there; nothing is sent unless it resolves), then sending: one PUT with the file as the body, never retried.
//     input.create sends If-None-Match: * (a new file); input.ifMatch sends If-Match (replace only that version);
//     exactly one of them. X-Expected-Length is always the file's size.
//   - It never rejects. It resolves one outcome:
//       not_sent {code, sha256|null}: nothing was sent (refused at admission, aborted or a dead context before the
//         send, the file changed while it was read, beforeSend failed, the worker could not take it);
//       done {status, data, sha256}: a 2xx answer (data: its JSON, else null);
//       refusal {rejection, sha256}: the computer answered with an error. Whether that proves nothing changed is the
//         caller's rule per code; a code it does not list is unknown, never failed;
//       unknown {why, status, sha256}: the send started and no answer says what happened: a redirect (never followed),
//         a network failure, the route's timeout, the caller's abort or a dead context. It may have gone through.
//   - From the call until it settles the upload holds the leave guard (leave.ts, 'upload'). A context that dies
//     (a realm switch, a sign-out, the account ending) cuts it like an abort. A cut settles the call at once, but
//     a worker job it cut (the abort is forwarded) keeps the computer's slot and the leave guard until the worker
//     answers or breaks: its fetch may still be sending.
//   - A cut is seen at every step, at once: while it waits for a slot, while it hashes, while beforeSend runs (it
//     settles not_sent without waiting for the save; a save that ends later sends nothing, so the caller's record may
//     name a hash that was never sent), and after each onPhase callback (a cut from inside onPhase('sending') sends
//     nothing).
//   - Where the transfer worker runs: a live page with Worker support uses the same-origin module worker
//     (upload.worker.ts; a blob: worker would be refused by the page's script-src). Fixture mode (hub:dev, shots)
//     and pages without Worker run the same code (upload-core.ts) in the page, through transport(), so fixtures
//     answer it.
import { routingAllows } from './routing';
import { alive, capture, loggingOut, onBump, type Target } from './ctx';
import { admit, errorOf, kindOf, rejection, type KitRejection } from './kit';
import { hostEnv } from './host-env';
import { holdLeave } from './leave';
import { accountEnded, onTeardown } from './realm';
import { buildRequest, isDeclared, type CallInput, type Route } from './routes';
import { traceIdOf } from './trace-id';
import { fixtureModeActive, transport, type CallMeta } from './transport';
import { hashBlob, sendBlob, UploadCoreError, type FromWorker, type SendResult, type SendSpec, type ToWorker } from './upload-core';

/** Uploads that run at once on one computer. */
export const PER_COMPUTER = 3;

export type UploadPhase = 'queued' | 'hashing' | 'sending';

export interface FileUploadInput extends Pick<CallInput, 'params' | 'query' | 'ctx' | 'target' | 'index' | 'signal'> {
  /** The picked file, sent as it is. */
  file: Blob;
  /** A new file: create only (If-None-Match: *). */
  create?: true;
  /** Replace: the ETag of the version the person chose (If-Match). */
  ifMatch?: string;
  /** Saves the held change with the file's SHA-256 before the send. Nothing is sent unless it resolves. */
  beforeSend: (facts: { readonly sha256: string; readonly size: number }) => unknown;
  onPhase?: (phase: UploadPhase) => void;
  /** Called once as the call settles, with a promise that resolves when its computer slot and leave guard are freed:
   *  at once, or, after a cut, when the worker job it cut ends (its fetch may still be sending until then). A caller
   *  that keeps its own "sending" mark waits for it. */
  released?: (done: Promise<void>) => void;
}

export type FileUploadOutcome =
  | { readonly outcome: 'not_sent'; readonly code: string; readonly sha256: string | null }
  | { readonly outcome: 'done'; readonly status: number; readonly data: unknown; readonly sha256: string }
  | { readonly outcome: 'refusal'; readonly rejection: KitRejection; readonly sha256: string }
  | { readonly outcome: 'unknown'; readonly why: 'redirected' | 'network' | 'timeout' | 'aborted' | 'stale'; readonly status: number; readonly sha256: string };

/** Where hashing and sending run (the worker, or the page). */
export interface UploadEngine {
  /** `keep`: a job that may still run after its answer (a cut), so sendFile keeps the slot and the leave guard. */
  hash(file: Blob, signal: AbortSignal, keep?: (job: RunningJob) => void): Promise<string>;
  /** 'unposted': the request never left the page (the worker could not take it). */
  send(spec: SendSpec, file: Blob, signal: AbortSignal, meta: CallMeta, keep?: (job: RunningJob) => void): Promise<SendResult | 'unposted'>;
}
/** A job an engine started: `open` until it ends, `done` settles then. */
export interface RunningJob { readonly open: boolean; readonly done: Promise<void> }

const pageEngine: UploadEngine = {
  hash: (file, signal) => hashBlob(file, signal),
  send: (spec, file, signal, meta) => sendBlob((url, init) => transport().fetch(url, init, meta), spec, file, signal),
};

// ---- the worker ----

let worker: Worker | null = null;
let seq = 0;
const waits = new Map<number, (m: FromWorker | null) => void>();

function theWorker(): Worker {
  // Only where the host allows its own workers (hostEnv().workers): the worker's fetch bypasses transport(), so on any
  // other host this refuses (the job ends 'unposted', nothing sent) even if a caller reached the worker engine.
  if (!hostEnv().workers) throw new Error('WORKERS_UNAVAILABLE');
  if (worker) return worker;
  const w = new Worker(new URL('./upload.worker.ts', import.meta.url), { type: 'module', name: 'hub-upload' });
  w.onmessage = (ev: MessageEvent) => {
    const m = ev.data as FromWorker;
    const f = m && typeof m === 'object' ? waits.get(m.id) : undefined;
    if (f) { waits.delete(m.id); f(m); }
  };
  // A worker that fails (it did not load, or it broke) answers nothing more: every job still waiting ends without
  // an answer (a send among them is unknown), and the next upload starts a new worker.
  w.onerror = () => {
    if (worker === w) worker = null;
    try { w.terminate(); } catch { /* gone */ }
    for (const [id, f] of [...waits]) { waits.delete(id); f(null); }
  };
  worker = w;
  return w;
}

type Job = { op: 'hash'; file: Blob } | { op: 'send'; spec: SendSpec; file: Blob };
/** One job posted to the worker. `answer` settles at the worker's reply, or at once on a cut ('cut': the abort is
 *  forwarded, and the caller does not wait for a fetch that may ignore it). `open` stays true and `done` unsettled
 *  until the worker replies or dies, so the slot and the leave guard are kept while the job may still run (:769). */
type Asked = { readonly answer: Promise<FromWorker | null | 'unposted' | 'cut'>; readonly done: Promise<void>; open: boolean };
function ask(job: Job, signal: AbortSignal): Asked {
  let settle!: (m: FromWorker | null | 'unposted' | 'cut') => void;
  let finish!: () => void;
  const answer = new Promise<FromWorker | null | 'unposted' | 'cut'>((r) => { settle = r; });
  const done = new Promise<void>((r) => { finish = r; });
  const a: Asked = { answer, done, open: true };
  const end = (m: FromWorker | null | 'unposted') => { a.open = false; settle(m); finish(); };
  // Already cut (abort events are not replayed): never post it.
  if (signal.aborted) { end('unposted'); return a; }
  let w: Worker;
  try { w = theWorker(); } catch { end('unposted'); return a; }
  const id = ++seq;
  const onAbort = () => { try { w.postMessage({ op: 'abort', id } satisfies ToWorker); } catch { /* gone */ } settle('cut'); };
  waits.set(id, (m) => { signal.removeEventListener('abort', onAbort); end(m); });
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    w.postMessage({ ...job, id } satisfies ToWorker);
  } catch {
    waits.delete(id);
    signal.removeEventListener('abort', onAbort);
    end('unposted');
  }
  return a;
}

const workerEngine: UploadEngine = {
  async hash(file, signal, keep) {
    const a = ask({ op: 'hash', file }, signal);
    keep?.(a);
    const m = await a.answer;
    if (m === 'cut') throw new UploadCoreError('aborted');
    if (m && m !== 'unposted' && 'sha256' in m) return m.sha256;
    throw new UploadCoreError(m && m !== 'unposted' && 'error' in m ? m.error : 'FILE_UNREADABLE');
  },
  async send(spec, file, signal, _meta, keep) {
    const a = ask({ op: 'send', spec, file }, signal);
    keep?.(a);
    const m = await a.answer;
    if (m === 'unposted') return 'unposted';
    // Cut while posted: the request may have gone out, and the worker may still be sending (unknown, aborted).
    if (m === 'cut') return { answered: false, why: 'aborted' };
    // No answer from the worker once the send was posted: the request may have gone out.
    return m && 'result' in m ? m.result : { answered: false, why: 'network' };
  },
};

let testEngine: UploadEngine | null = null;
function engine(): UploadEngine {
  if (testEngine) return testEngine;
  return hostEnv().workers && !fixtureModeActive() ? workerEngine : pageEngine;
}

/** Which engine an upload would use now (tests and diagnostics; read-only). */
export function uploadEngineKind(): 'test' | 'worker' | 'page' {
  return testEngine ? 'test' : engine() === workerEngine ? 'worker' : 'page';
}

// ---- per-computer slots ----

const running = new Map<string, number>();
const queues = new Map<string, Array<() => void>>();

function takeSlot(key: string, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  const n = running.get(key) || 0;
  if (n < PER_COMPUTER) { running.set(key, n + 1); return Promise.resolve(true); }
  return new Promise((resolve) => {
    const q = queues.get(key) || [];
    queues.set(key, q);
    const go = () => { signal.removeEventListener('abort', onAbort); running.set(key, (running.get(key) || 0) + 1); resolve(true); };
    const onAbort = () => {
      const i = q.indexOf(go);
      if (i >= 0) q.splice(i, 1);
      if (!q.length && queues.get(key) === q) queues.delete(key);
      resolve(false);
    };
    q.push(go);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function freeSlot(key: string): void {
  const n = (running.get(key) || 1) - 1;
  if (n <= 0) running.delete(key); else running.set(key, n);
  const q = queues.get(key);
  const next = q?.shift();
  if (q && !q.length) queues.delete(key);
  next?.();
}

const computerKey = (t: Target) => t.project.id + '/' + t.container.id;

// ---- dead contexts ----

const accountGoing = (): boolean => { try { return loggingOut() || accountEnded(); } catch { return true; } };
const live = new Set<{ alive: () => boolean; stop: () => void }>();
onBump(() => { for (const e of [...live]) if (!e.alive()) e.stop(); });
onTeardown(() => { for (const e of [...live]) if (!e.alive() || accountGoing()) e.stop(); });

// ---- the outcome ----

const JSON_TYPE = /^application\/([a-z0-9.+-]*\+)?json\s*(;|$)/i;
function decode(b: Uint8Array): string | null {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return null; }
}

function outcomeOf(r: SendResult, sha256: string, why: 'aborted' | 'stale' | ''): FileUploadOutcome {
  if (!r.answered) return { outcome: 'unknown', why: r.why === 'aborted' ? why || 'aborted' : r.why, status: 0, sha256 };
  if (r.redirected) return { outcome: 'unknown', why: 'redirected', status: r.status, sha256 };
  const s = r.status;
  const text = JSON_TYPE.test(r.contentType || '') && r.bytes && !r.over ? decode(r.bytes) : null;
  if (s >= 200 && s < 300) {
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return { outcome: 'done', status: s, data, sha256 };
  }
  let res: Response;
  try { res = new Response(null, { status: s, headers: r.retryAfter ? { 'retry-after': r.retryAfter } : {} }); } catch {
    // Not an HTTP status a browser hands over: no answer that says anything.
    return { outcome: 'unknown', why: 'network', status: 0, sha256 };
  }
  const x = errorOf(res, text);
  const tid = traceIdOf(r.traceId);
  return { outcome: 'refusal', rejection: rejection(kindOf(s, x.code), s, x.code, tid ? { ...x, traceId: tid } : x), sha256 };
}

/** Waits for beforeSend, or for a cut, whichever comes first. A save that ends after a cut is ignored (and observed). */
function record(beforeSend: FileUploadInput['beforeSend'], facts: { readonly sha256: string; readonly size: number }, signal: AbortSignal): Promise<'ok' | 'failed' | 'cut'> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve('cut'); return; }
    const onAbort = () => resolve('cut');
    signal.addEventListener('abort', onAbort, { once: true });
    const end = (v: 'ok' | 'failed') => { signal.removeEventListener('abort', onAbort); resolve(v); };
    let p: unknown;
    try { p = beforeSend(facts); } catch { end('failed'); return; }
    Promise.resolve(p).then(() => end('ok'), () => end('failed'));
  });
}

/** One upload (see the contract). Never rejects. */
export async function sendFile(route: Route, input: FileUploadInput): Promise<FileUploadOutcome> {
  const notSent = (code: string, sha256: string | null = null): FileUploadOutcome => Object.freeze({ outcome: 'not_sent', code, sha256 });
  if (!isDeclared(route) || !route.file) return notSent('ROUTE_NOT_ALLOWED');
  // Each input is read once: what is checked is what is sent.
  const { file, create, ifMatch, beforeSend, onPhase, released, signal } = input;
  if (typeof Blob !== 'function' || !(file instanceof Blob)) return notSent('BODY_INVALID');
  if (typeof beforeSend !== 'function') return notSent('INPUT_INVALID');
  if ((create === true) === (ifMatch !== undefined) || (create !== undefined && create !== true)) return notSent('HEADER_NOT_ALLOWED');
  const size = file.size;
  const headers = create === true ? { 'If-None-Match': '*', 'X-Expected-Length': String(size) } : { 'If-Match': ifMatch, 'X-Expected-Length': String(size) };
  const ctx = input.ctx || capture(input.target);
  const target = input.target || ctx.target;
  const built = buildRequest(route, { params: input.params, query: input.query });
  if ('refused' in built) return notSent(built.refused);
  const plan = admit(route, built, { target, index: input.index, headers });
  if ('refused' in plan) return notSent(plan.refused);
  if (signal?.aborted) return notSent('aborted');
  const isLive = () => alive(ctx) && !accountGoing();
  if (!isLive()) return notSent('stale');

  const ac = new AbortController();
  let why: 'aborted' | 'stale' | '' = '';
  const stop = (w: 'aborted' | 'stale') => { why = why || w; try { ac.abort(); } catch { /* done */ } };
  const onCaller = () => stop('aborted');
  const phase = (p: UploadPhase) => { try { onPhase?.(p); } catch { /* the caller's own */ } };
  const entry = { alive: isLive, stop: () => stop('stale') };
  // admit() refuses a call without a computer, so the plan always names one.
  const key = computerKey(plan.meta.target as Target);
  // Checked before the first wait: nothing else is in flight for this call yet.
  // The computer's latest accepted row may withhold (or move) the server while this upload waits for its slot or hashes (core
  // routing.ts): every cut asks again, so a target admitted earlier never sends after that row.
  const tgt = plan.meta.target as Target;
  const cut = (sha: string | null) => (ac.signal.aborted ? notSent(why || 'aborted', sha) : !isLive() ? notSent('stale', sha)
    : !routingAllows(tgt.container.id, tgt.container.server_name) ? notSent('NO_KIT_URL', sha) : null);
  signal?.addEventListener('abort', onCaller);
  live.add(entry);
  const release = holdLeave('upload');
  let slot = false;
  // Engine jobs a cut answered before they ended: the slot and the leave guard wait for them (:769).
  const jobs: RunningJob[] = [];
  const keep = (j: RunningJob) => { jobs.push(j); };
  try {
    phase('queued');
    slot = await takeSlot(key, ac.signal);
    if (!slot) return notSent(why || 'aborted');
    phase('hashing');
    const c0 = cut(null);
    if (c0) return c0;
    const eng = engine();
    let sha: string;
    try { sha = await eng.hash(file, ac.signal, keep); } catch (e) {
      return cut(null) ?? notSent(e instanceof UploadCoreError ? e.code : 'FILE_UNREADABLE');
    }
    const c1 = cut(sha);
    if (c1) return c1;
    if (await record(beforeSend, Object.freeze({ sha256: sha, size }), ac.signal) === 'failed') return notSent('RECORD_FAILED', sha);
    const c2 = cut(sha);
    if (c2) return c2;
    phase('sending');
    // onPhase may have cut it (an abort, a realm switch): checked again, nothing has left yet.
    const c3 = cut(sha);
    if (c3) return c3;
    // From here on the request may reach the computer: every end without an answer is unknown, never failed.
    const spec: SendSpec = Object.freeze({ url: plan.url, method: plan.method, headers: plan.headers, timeoutMs: plan.timeoutMs, maxBytes: plan.maxBytes });
    const r = await eng.send(spec, file, ac.signal, plan.meta, keep);
    if (r === 'unposted') return cut(sha) ?? notSent('WORKER_FAILED', sha);
    return Object.freeze(outcomeOf(r, sha, why));
  } finally {
    live.delete(entry);
    signal?.removeEventListener('abort', onCaller);
    const free = () => { if (slot) freeSlot(key); release(); };
    const open = jobs.filter((j) => j.open);
    let freed: Promise<void>;
    if (open.length) freed = Promise.all(open.map((j) => j.done)).then(free, free);
    else { free(); freed = Promise.resolve(); }
    try { released?.(freed); } catch { /* the caller's own */ }
  }
}

/** Tests only: run uploads on this engine (null: the normal choice). */
export function setUploadEngineForTests(e: UploadEngine | null): void {
  testEngine = e;
}

/** Tests only: the two real engines, to dispatch to one directly whatever engine() would choose (the terminal's
 *  worker refusal is proven by forcing worker dispatch on a host without workers). */
export function realUploadEnginesForTests(): { readonly worker: UploadEngine; readonly page: UploadEngine } {
  return { worker: workerEngine, page: pageEngine };
}

/** Tests only: uploads holding a slot on that computer. */
export function uploadsRunningOn(t: Target): number {
  return running.get(computerKey(t)) || 0;
}
