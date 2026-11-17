// upload-core.ts: the transfer worker's own work, shared by the module worker
// (upload.worker.ts) and the in-page engine upload.ts uses where no worker runs (fixture mode, tests). It imports
// nothing of core's state, so the worker bundle holds only this file and the hash.
//
// Contract:
//   - hashBlob(blob, signal): the SHA-256 of the blob's bytes, read as a stream (WebCrypto has only one-shot
//     digests), lower-case hex. The bytes read must add up to blob.size, else FILE_CHANGED (the file changed on
//     disk while it was read). An abort rejects `aborted`.
//   - sendBlob(fetchFn, spec, blob, signal): one fetch, never retried: the plan's URL, method and headers, the blob
//     as the body, `redirect: 'manual'`, credentials omitted, no-store, cut at spec.timeoutMs. It resolves:
//       {answered: false, why: network | timeout | aborted}: no answer; the request may have reached the computer;
//       {answered: true, redirected: true, status}: a redirect, never followed (the body is not sent again);
//       {answered: true, status, …, bytes | over}: the whole answer, read up to spec.maxBytes (over: past it, the
//       read stopped on purpose).
//     A status alone is not an answer: a read that fails, or an abort or the timeout before the answer is read to its
//     end (after its last chunk too), is {answered: false} like no answer at all. An abort cancels the read.
//     It never rejects. Which of these are unknown outcomes is upload.ts's rule (all but a 2xx or an error answer).
//   - workerHandler(post, fetchFn): the worker's message loop: {op: 'hash' | 'send' | 'abort', id, …} in, one
//     {id, …} answer per hash or send out.
import { sha256 } from '@noble/hashes/sha2.js';

/** What the worker sends: an admitted plan's request (kit.ts admit), nothing else. */
export interface SendSpec {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly maxBytes: number;
}

export type SendResult =
  | { readonly answered: false; readonly why: 'network' | 'timeout' | 'aborted' }
  | { readonly answered: true; readonly redirected: true; readonly status: number }
  | {
    readonly answered: true; readonly redirected?: false; readonly status: number;
    readonly contentType: string | null; readonly retryAfter: string | null; readonly traceId: string | null;
    readonly bytes?: Uint8Array; readonly over?: boolean;
  };

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

const HEX = '0123456789abcdef';
function hex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += HEX.charAt(x >> 4) + HEX.charAt(x & 15);
  return s;
}

export class UploadCoreError extends Error {
  constructor(readonly code: 'aborted' | 'FILE_CHANGED' | 'FILE_UNREADABLE') { super(code); }
}

/** The SHA-256 of a blob, streamed (see the contract). */
export async function hashBlob(blob: Blob, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new UploadCoreError('aborted');
  const h = sha256.create();
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try { reader = blob.stream().getReader(); } catch { throw new UploadCoreError('FILE_UNREADABLE'); }
  const onAbort = () => { reader.cancel().then(null, () => { /* aborted */ }); };
  signal?.addEventListener('abort', onAbort);
  let n = 0;
  try {
    for (;;) {
      let r: ReadableStreamReadResult<Uint8Array>;
      try { r = await reader.read(); } catch { throw new UploadCoreError(signal?.aborted ? 'aborted' : 'FILE_CHANGED'); }
      if (signal?.aborted) throw new UploadCoreError('aborted');
      if (r.done) break;
      n += r.value.length;
      h.update(r.value);
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  if (n !== blob.size) throw new UploadCoreError('FILE_CHANGED');
  return hex(h.digest());
}

/** Reads at most `limit` bytes of an answer (kit.ts readBounded's rule, kept here so the worker imports no core state). */
async function readAnswer(res: Response, limit: number, signal: AbortSignal): Promise<{ bytes?: Uint8Array; over?: boolean }> {
  const len = parseInt(res.headers.get('content-length') || '', 10);
  if (Number.isFinite(len) && len > limit) { res.body?.cancel().then(null, () => { /* dropped */ }); return { over: true }; }
  if (!res.body) return { bytes: new Uint8Array(0) };
  const reader = res.body.getReader();
  // An abort (the caller's, or the timeout) ends a read that is waiting; sendBlob then sees why.
  const onAbort = () => { reader.cancel().then(null, () => { /* dropped */ }); };
  signal.addEventListener('abort', onAbort);
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      total += r.value.length;
      if (total > limit) { reader.cancel().then(null, () => { /* dropped */ }); return { over: true }; }
      parts.push(r.value);
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return { bytes: out };
}

/** Sends one blob once (see the contract). Never rejects. */
export async function sendBlob(fetchFn: FetchFn, spec: SendSpec, blob: Blob, signal?: AbortSignal): Promise<SendResult> {
  let why: 'timeout' | 'aborted' | '' = '';
  const ac = new AbortController();
  const stop = (w: 'timeout' | 'aborted') => { why = why || w; try { ac.abort(); } catch { /* done */ } };
  const onCaller = () => stop('aborted');
  if (signal?.aborted) return { answered: false, why: 'aborted' };
  signal?.addEventListener('abort', onCaller);
  const timer = setTimeout(() => stop('timeout'), spec.timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetchFn(spec.url, {
        method: spec.method, headers: { ...spec.headers }, body: blob, signal: ac.signal,
        redirect: 'manual', credentials: 'omit', cache: 'no-store',
      });
    } catch {
      return { answered: false, why: why || 'network' };
    }
    const s = res.status;
    if (res.type === 'opaqueredirect' || (s >= 300 && s < 400)) {
      res.body?.cancel().then(null, () => { /* never read */ });
      return { answered: true, redirected: true, status: s };
    }
    const head = { answered: true as const, status: s, contentType: res.headers.get('content-type'), retryAfter: res.headers.get('retry-after'), traceId: res.headers.get('x-trace-id') };
    let b: { bytes?: Uint8Array; over?: boolean };
    try {
      b = await readAnswer(res, spec.maxBytes, ac.signal);
    } catch {
      // The status came, the rest did not: no answer that says what happened.
      return { answered: false, why: why || 'network' };
    }
    // An abort or the timeout while the answer was read (its last chunk included): not an answer either.
    if (why) return { answered: false, why };
    return b.over ? { ...head, over: true } : { ...head, bytes: b.bytes };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCaller);
  }
}

export type ToWorker =
  | { readonly op: 'hash'; readonly id: number; readonly file: Blob }
  | { readonly op: 'send'; readonly id: number; readonly spec: SendSpec; readonly file: Blob }
  | { readonly op: 'abort'; readonly id: number };

export type FromWorker =
  | { readonly id: number; readonly sha256: string }
  | { readonly id: number; readonly error: UploadCoreError['code'] }
  | { readonly id: number; readonly result: SendResult };

/** The transfer worker's revision: the worker posts it once as it starts ({revision}, no job id, so the page's
 *  message handler answers no job with it). Raise it whenever the worker must reach browsers under a NEW file
 *  name: the built file is named by its bytes and cached for a year together with its response headers, so a
 *  server-side header change alone (2: its Content-Security-Policy, which decides where the worker may send)
 *  never reaches a browser that already holds the file. */
export const WORKER_REVISION = 2;

/** The worker's message loop (see the contract). A message of another shape is ignored. */
export function workerHandler(post: (m: FromWorker) => void, fetchFn: FetchFn): (ev: { data: unknown }) => void {
  const jobs = new Map<number, AbortController>();
  return (ev) => {
    const m = ev.data as ToWorker;
    if (!m || typeof m !== 'object' || !Number.isInteger(m.id)) return;
    if (m.op === 'abort') { jobs.get(m.id)?.abort(); return; }
    if ((m.op !== 'hash' && m.op !== 'send') || jobs.has(m.id) || !(m.file instanceof Blob)) return;
    const ac = new AbortController();
    jobs.set(m.id, ac);
    const end = () => { jobs.delete(m.id); };
    if (m.op === 'hash') {
      hashBlob(m.file, ac.signal).then(
        (h) => { end(); post({ id: m.id, sha256: h }); },
        (e) => { end(); post({ id: m.id, error: e instanceof UploadCoreError ? e.code : 'FILE_UNREADABLE' }); },
      );
      return;
    }
    sendBlob(fetchFn, m.spec, m.file, ac.signal).then((r) => { end(); post({ id: m.id, result: r }); });
  };
}
