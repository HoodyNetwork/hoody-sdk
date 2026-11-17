// upload.ts / upload-core.ts / kit.ts file routes: admission, the streamed hash, the one send,
// the record before the send, 3 per computer, C9 outcomes, the leave guard and the worker's message protocol.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bump, capture } from './ctx';
import { admit, fileHeaders } from './kit';
import { upload } from './kit-io';
import { leaveCount } from './leave';
import { build, buildRequest, defineRoute } from './routes';
import { installTransport, type Transport } from './transport';
import { hashBlob, sendBlob, workerHandler, UploadCoreError, WORKER_REVISION, type FromWorker, type SendSpec } from './upload-core';
import { PER_COMPUTER, sendFile, setUploadEngineForTests, uploadsRunningOn, type FileUploadInput } from './upload';
import { boot, PROXY, R1, TARGET } from './test/env';

const put = defineRoute({ method: 'PUT', path: '/api/v1/files/*path', scope: 'kit', kit: 'files', index: 1, file: true, timeoutMs: 3_600_000 });
const HOST = `https://p1-c1-files-1.sv1.${PROXY}`;
const OTHER = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } };
const ABC_SHA = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

type Answer = { status?: number; body?: string; stream?: ReadableStream<Uint8Array>; type?: string; headers?: Record<string, string>; fail?: boolean; hold?: boolean };
type Req = { url: string; init: RequestInit; answer: (a: Answer) => void };
let reqs: Req[] = [];
let auto: ((r: Req) => Answer) | null = () => ({ status: 201, body: '{"ok":true}' });

function respond(a: Answer, init: RequestInit): Promise<Response> {
  if (a.fail) return Promise.reject(new TypeError('Failed to fetch'));
  const res = new Response(a.stream ?? a.body ?? null, { status: a.status ?? 200, headers: { 'content-type': 'application/json', ...(a.headers || {}) } });
  if (a.type) Object.defineProperty(res, 'type', { value: a.type });
  void init;
  return Promise.resolve(res);
}
const fake: Transport = {
  hoody: () => Promise.reject(new Error('not used')),
  fetch(url, init) {
    return new Promise<Response>((resolve, reject) => {
      const req: Req = { url, init, answer: (a) => { respond(a, init).then(resolve, reject); } };
      reqs.push(req);
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      const a = auto?.(req);
      if (a && !a.hold) req.answer(a);
    });
  },
};

function file(text = 'abc'): Blob { return new Blob([text]); }
/** A response body: one chunk, then it stays open until ended (end(err) errors it, end() closes it). */
function openBody() {
  let c!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({ start(x) { c = x; x.enqueue(new TextEncoder().encode('{"a"')); } });
  return { stream, end: (err?: unknown) => { try { if (err) c.error(err); else c.close(); } catch { /* ended */ } } };
}
function input(extra: Partial<FileUploadInput> = {}): FileUploadInput {
  return { params: { path: ['tmp', 'a.txt'] }, target: TARGET, file: file(), create: true, beforeSend: () => {}, ...extra };
}

beforeEach(() => {
  boot({ realm: R1 });
  reqs = [];
  auto = () => ({ status: 201, body: '{"ok":true}' });
  installTransport(fake);
  setUploadEngineForTests(null);
});
afterEach(() => { installTransport(null); setUploadEngineForTests(null); vi.unstubAllGlobals(); });

describe('file routes: declaration and admission', () => {
  it('a file route is a PUT on the files program with a timeout, and no other leg takes it', async () => {
    expect(() => defineRoute({ method: 'POST', path: '/api/v1/files/*p', scope: 'kit', kit: 'files', index: 1, file: true, timeoutMs: 1000 })).toThrow(/file/);
    expect(() => defineRoute({ method: 'PUT', path: '/x/*p', scope: 'kit', kit: 'exec', index: 1, file: true, timeoutMs: 1000 })).toThrow(/file/);
    expect(() => defineRoute({ method: 'PUT', path: '/api/v1/files/*p', scope: 'kit', kit: 'files', index: 1, file: true })).toThrow(/file/);
    expect(build(put, { params: { path: ['a'] } })).toEqual({ refused: 'ROUTE_NOT_ALLOWED' });
    await expect(upload(put, { params: { path: ['a'] }, target: TARGET, body: new ReadableStream(), contentType: 'video/webm' })).rejects.toMatchObject({ code: 'ROUTE_NOT_ALLOWED' });
  });

  it('fileHeaders takes exactly X-Expected-Length plus one condition', () => {
    expect(fileHeaders({ 'If-None-Match': '*', 'X-Expected-Length': '3' })).toEqual({ 'If-None-Match': '*', 'X-Expected-Length': '3' });
    expect(fileHeaders({ 'If-Match': '"abc"', 'X-Expected-Length': '0' })).toEqual({ 'If-Match': '"abc"', 'X-Expected-Length': '0' });
    for (const bad of [
      undefined, {}, { 'X-Expected-Length': '3' }, { 'If-None-Match': '*' },
      { 'If-None-Match': '*', 'If-Match': '"a"', 'X-Expected-Length': '3' },
      { 'If-None-Match': '"a"', 'X-Expected-Length': '3' }, { 'If-Match': '*', 'X-Expected-Length': '3' },
      { 'If-Match': 'W/"a"', 'X-Expected-Length': '3' }, { 'If-Match': 'abc', 'X-Expected-Length': '3' },
      { 'If-None-Match': '*', 'X-Expected-Length': '03' }, { 'If-None-Match': '*', 'X-Expected-Length': '-1' },
      { 'If-None-Match': '*', 'X-Expected-Length': 3 }, { 'if-none-match': '*', 'X-Expected-Length': '3' },
      { 'If-None-Match': '*', 'X-Expected-Length': '3', Authorization: 'x' }, { 'If-None-Match': '*', Authorization: 'x' },
    ]) expect(fileHeaders(bad), JSON.stringify(bad)).toBeNull();
  });

  it('admit puts the checked headers on the plan, octet-stream, answers capped at 64 KiB; no headers is refused', () => {
    const built = buildRequest(put, { params: { path: ['tmp', 'a b.txt'] } });
    if ('refused' in built) throw new Error('built');
    const plan = admit(put, built, { target: TARGET, index: 1, headers: { 'If-None-Match': '*', 'X-Expected-Length': '3' } });
    if ('refused' in plan) throw new Error(plan.refused);
    expect(plan.url).toBe(`${HOST}/api/v1/files/tmp/a%20b.txt`);
    expect(plan.headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/octet-stream', 'If-None-Match': '*', 'X-Expected-Length': '3' });
    expect(plan.credentials).toBe('omit');
    expect(plan.maxBytes).toBe(65536);
    expect(admit(put, built, { target: TARGET, index: 1 })).toEqual({ refused: 'HEADER_NOT_ALLOWED' });
    expect(admit(put, built, { target: TARGET, index: 1, maxBytes: 65537, headers: { 'If-None-Match': '*', 'X-Expected-Length': '3' } })).toEqual({ refused: 'MAXBYTES_INVALID' });
  });
});

describe('upload-core: the streamed hash', () => {
  it('hashes in chunks to the same SHA-256', async () => {
    expect(await hashBlob(file('abc'))).toBe(ABC_SHA);
    const big = new Uint8Array(3 * 65536 + 7).map((_, i) => i & 255);
    const parts = [big.slice(0, 1000), big.slice(1000, 70000), big.slice(70000)];
    const whole = await hashBlob(new Blob([big]));
    expect(await hashBlob(new Blob(parts))).toBe(whole);
    expect(whole).toMatch(/^[0-9a-f]{64}$/);
  });

  it('bytes that do not add up to the size are FILE_CHANGED; an abort is aborted', async () => {
    const short = { size: 5, stream: () => new Blob(['abc']).stream() } as unknown as Blob;
    await expect(hashBlob(short)).rejects.toMatchObject({ code: 'FILE_CHANGED' });
    const ac = new AbortController();
    ac.abort();
    await expect(hashBlob(file(), ac.signal)).rejects.toMatchObject({ code: 'aborted' });
  });
});

describe('upload-core: the one send', () => {
  const spec: SendSpec = { url: `${HOST}/api/v1/files/a`, method: 'PUT', headers: { 'If-None-Match': '*', 'X-Expected-Length': '3' }, timeoutMs: 1000, maxBytes: 64 };
  it('fetch once: manual redirects, no credentials, the blob as the body', async () => {
    const f = vi.fn(() => Promise.resolve(new Response('{"a":1}', { status: 201, headers: { 'content-type': 'application/json' } })));
    const b = file();
    const r = await sendBlob(f, spec, b);
    expect(f).toHaveBeenCalledTimes(1);
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init).toMatchObject({ method: 'PUT', redirect: 'manual', credentials: 'omit', cache: 'no-store' });
    expect(init.body).toBe(b);
    expect(r).toMatchObject({ answered: true, status: 201 });
  });

  it('a redirect is never followed; no answer is network, timeout or aborted; an answer past the bound is over', async () => {
    const opaque = new Response(null, { status: 200 });
    Object.defineProperty(opaque, 'type', { value: 'opaqueredirect' });
    Object.defineProperty(opaque, 'status', { value: 0 });
    expect(await sendBlob(() => Promise.resolve(opaque), spec, file())).toEqual({ answered: true, redirected: true, status: 0 });
    expect(await sendBlob(() => Promise.resolve(new Response(null, { status: 307 })), spec, file())).toEqual({ answered: true, redirected: true, status: 307 });
    const f = vi.fn(() => Promise.reject(new TypeError('x')));
    expect(await sendBlob(f, spec, file())).toEqual({ answered: false, why: 'network' });
    expect(f).toHaveBeenCalledTimes(1);
    const hang = (_u: string, i: RequestInit) => new Promise<Response>((_, rej) => { i.signal?.addEventListener('abort', () => rej(new Error('a'))); });
    expect(await sendBlob(hang, { ...spec, timeoutMs: 10 }, file())).toEqual({ answered: false, why: 'timeout' });
    const ac = new AbortController();
    const p = sendBlob(hang, spec, file(), ac.signal);
    ac.abort();
    expect(await p).toEqual({ answered: false, why: 'aborted' });
    const r = await sendBlob(() => Promise.resolve(new Response('x'.repeat(65), { status: 200 })), spec, file());
    expect(r).toMatchObject({ answered: true, status: 200, over: true });
  });
});

describe('sendFile: order, record before send, outcomes (C9)', () => {
  it('hashes, then waits for beforeSend, then sends once with the condition and the length', async () => {
    let saved: (() => void) | null = null;
    const seen: unknown[] = [];
    const phases: string[] = [];
    const p = sendFile(put, input({
      beforeSend: (f) => { seen.push(f); return new Promise<void>((r) => { saved = r; }); },
      onPhase: (ph) => phases.push(ph),
    }));
    await tick();
    expect(seen).toEqual([{ sha256: ABC_SHA, size: 3 }]);
    expect(reqs).toHaveLength(0);
    saved!();
    const o = await p;
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.url).toBe(`${HOST}/api/v1/files/tmp/a.txt`);
    expect(reqs[0]!.init.headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/octet-stream', 'If-None-Match': '*', 'X-Expected-Length': '3' });
    expect(reqs[0]!.init).toMatchObject({ method: 'PUT', redirect: 'manual', credentials: 'omit' });
    expect(o).toEqual({ outcome: 'done', status: 201, data: { ok: true }, sha256: ABC_SHA });
    expect(phases).toEqual(['queued', 'hashing', 'sending']);
  });

  it('Replace sends If-Match; neither or both conditions, a bad ETag or no record step send nothing', async () => {
    await sendFile(put, input({ create: undefined, ifMatch: '"v1"' }));
    expect(reqs[0]!.init.headers).toMatchObject({ 'If-Match': '"v1"', 'X-Expected-Length': '3' });
    expect((reqs[0]!.init.headers as Record<string, string>)['If-None-Match']).toBeUndefined();
    reqs = [];
    expect(await sendFile(put, input({ create: undefined }))).toMatchObject({ outcome: 'not_sent', code: 'HEADER_NOT_ALLOWED' });
    expect(await sendFile(put, input({ ifMatch: '"v1"' }))).toMatchObject({ outcome: 'not_sent', code: 'HEADER_NOT_ALLOWED' });
    expect(await sendFile(put, input({ create: undefined, ifMatch: 'W/"v1"' }))).toMatchObject({ outcome: 'not_sent', code: 'HEADER_NOT_ALLOWED' });
    expect(await sendFile(put, input({ beforeSend: undefined as never }))).toMatchObject({ outcome: 'not_sent', code: 'INPUT_INVALID' });
    expect(await sendFile(put, input({ file: 'abc' as never }))).toMatchObject({ outcome: 'not_sent', code: 'BODY_INVALID' });
    expect(reqs).toHaveLength(0);
  });

  it('a record that fails to save sends nothing', async () => {
    const o = await sendFile(put, input({ beforeSend: () => Promise.reject(new Error('disk')) }));
    expect(o).toEqual({ outcome: 'not_sent', code: 'RECORD_FAILED', sha256: ABC_SHA });
    expect(reqs).toHaveLength(0);
  });

  it('an error answer is a refusal with its code, sent once (a 5xx too)', async () => {
    auto = () => ({ status: 412, body: '{"error":"PRECONDITION_FAILED"}' });
    const o = await sendFile(put, input());
    expect(o).toMatchObject({ outcome: 'refusal', sha256: ABC_SHA, rejection: { kind: 'refused', status: 412, code: 'PRECONDITION_FAILED' } });
    auto = () => ({ status: 503, body: '{"error":"SERVICE_STOPPING"}', headers: { 'retry-after': '5' } });
    reqs = [];
    const o2 = await sendFile(put, input());
    expect(o2).toMatchObject({ outcome: 'refusal', rejection: { kind: 'unavailable', code: 'SERVICE_STOPPING', retryAfterMs: 5000 } });
    expect(reqs).toHaveLength(1);
  });

  it('a redirect, a network failure, an abort or a dead context after the send started is unknown, never failed', async () => {
    auto = () => ({ status: 302, headers: { location: 'https://elsewhere.test/' } });
    expect(await sendFile(put, input())).toEqual({ outcome: 'unknown', why: 'redirected', status: 302, sha256: ABC_SHA });
    expect(reqs).toHaveLength(1);
    auto = () => ({ fail: true });
    expect(await sendFile(put, input())).toEqual({ outcome: 'unknown', why: 'network', status: 0, sha256: ABC_SHA });
    auto = () => ({ hold: true });
    const ac = new AbortController();
    const p = sendFile(put, input({ signal: ac.signal }));
    await tick();
    ac.abort();
    expect(await p).toEqual({ outcome: 'unknown', why: 'aborted', status: 0, sha256: ABC_SHA });
    const ctx = capture(TARGET);
    const p2 = sendFile(put, input({ ctx }));
    await tick();
    bump('test');
    expect(await p2).toEqual({ outcome: 'unknown', why: 'stale', status: 0, sha256: ABC_SHA });
  });

  it('an abort or a dead context before the send is not_sent', async () => {
    const ac = new AbortController();
    let saved: (() => void) | null = null;
    const p = sendFile(put, input({ signal: ac.signal, beforeSend: () => new Promise<void>((r) => { saved = r; }) }));
    await tick();
    ac.abort();
    saved!();
    expect(await p).toEqual({ outcome: 'not_sent', code: 'aborted', sha256: ABC_SHA });
    const ctx = capture(TARGET);
    const p2 = sendFile(put, input({ ctx, beforeSend: () => new Promise<void>((r) => { saved = r; }) }));
    await tick();
    bump('test');
    saved!();
    expect(await p2).toMatchObject({ outcome: 'not_sent', code: 'stale' });
    expect(reqs).toHaveLength(0);
  });

  it('holds the leave guard from the call until it settles, whatever the outcome', async () => {
    auto = () => ({ hold: true });
    expect(leaveCount()).toBe(0);
    const ac = new AbortController();
    const p = sendFile(put, input({ signal: ac.signal }));
    expect(leaveCount()).toBe(1);
    await tick();
    expect(leaveCount()).toBe(1);
    ac.abort();
    await p;
    expect(leaveCount()).toBe(0);
    await sendFile(put, input({ beforeSend: () => Promise.reject(new Error('x')) }));
    expect(leaveCount()).toBe(0);
  });
});

describe('sendFile: at most 3 per computer', () => {
  it('a fourth waits for a slot; another computer does not; an abort while waiting sends nothing', async () => {
    auto = () => ({ hold: true });
    const ps = [0, 1, 2, 3].map(() => sendFile(put, input()));
    await tick(20);
    expect(PER_COMPUTER).toBe(3);
    expect(reqs).toHaveLength(3);
    expect(uploadsRunningOn(TARGET)).toBe(3);
    const other = sendFile(put, input({ target: OTHER }));
    const ac = new AbortController();
    const queued = sendFile(put, input({ signal: ac.signal }));
    await tick(20);
    expect(reqs).toHaveLength(4);
    expect(reqs[3]!.url).toContain('-c2-');
    ac.abort();
    expect(await queued).toEqual({ outcome: 'not_sent', code: 'aborted', sha256: null });
    reqs[0]!.answer({ status: 201, body: '{}' });
    await tick(20);
    expect(reqs).toHaveLength(5);
    expect(reqs[4]!.url).toContain('-c1-');
    for (const r of reqs.slice(1)) r.answer({ status: 201, body: '{}' });
    const all = await Promise.all([...ps, other]);
    expect(all.every((o) => o.outcome === 'done')).toBe(true);
    expect(uploadsRunningOn(TARGET)).toBe(0);
    expect(leaveCount()).toBe(0);
  });
});

describe('sendFile: a cut is seen at every step', () => {
  const spec: SendSpec = { url: `${HOST}/api/v1/files/a`, method: 'PUT', headers: { 'If-None-Match': '*', 'X-Expected-Length': '3' }, timeoutMs: 1000, maxBytes: 64 };
  const answer = (status: number, stream: ReadableStream<Uint8Array>) => () => Promise.resolve(new Response(stream, { status, headers: { 'content-type': 'application/json' } }));

  it('sendBlob: a status whose body fails, is aborted or times out is no answer', async () => {
    let b = openBody();
    let p = sendBlob(answer(403, b.stream), spec, file());
    await tick();
    b.end(new TypeError('network'));
    expect(await p).toEqual({ answered: false, why: 'network' });
    b = openBody();
    const ac = new AbortController();
    p = sendBlob(answer(201, b.stream), spec, file(), ac.signal);
    await tick();
    ac.abort();
    expect(await p).toEqual({ answered: false, why: 'aborted' });
    b = openBody();
    expect(await sendBlob(answer(412, b.stream), { ...spec, timeoutMs: 15 }, file())).toEqual({ answered: false, why: 'timeout' });
  });

  it('sendBlob: an abort that lands with the last chunk is no answer', async () => {
    const ac = new AbortController();
    let n = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (n++ === 0) { c.enqueue(new TextEncoder().encode('{}')); return; }
        ac.abort();
        c.close();
      },
    });
    expect(await sendBlob(answer(201, stream), spec, file(), ac.signal)).toEqual({ answered: false, why: 'aborted' });
  });

  it('sendFile: a 403 whose body breaks is unknown, a 201 aborted mid-body is unknown, never refusal or done', async () => {
    let b = openBody();
    auto = () => ({ status: 403, stream: b.stream });
    let p = sendFile(put, input());
    await tick(20);
    b.end(new TypeError('network'));
    expect(await p).toEqual({ outcome: 'unknown', why: 'network', status: 0, sha256: ABC_SHA });
    b = openBody();
    auto = () => ({ status: 201, stream: b.stream });
    const ac = new AbortController();
    p = sendFile(put, input({ signal: ac.signal }));
    await tick(20);
    ac.abort();
    expect(await p).toEqual({ outcome: 'unknown', why: 'aborted', status: 0, sha256: ABC_SHA });
    b = openBody();
    auto = () => ({ status: 201, stream: b.stream });
    const ctx = capture(TARGET);
    p = sendFile(put, input({ ctx }));
    await tick(20);
    bump('test');
    expect(await p).toEqual({ outcome: 'unknown', why: 'stale', status: 0, sha256: ABC_SHA });
    expect(reqs).toHaveLength(3);
  });

  it('an abort or a dead context from inside onPhase(sending) sends nothing (page engine)', async () => {
    const ac = new AbortController();
    expect(await sendFile(put, input({ signal: ac.signal, onPhase: (ph) => { if (ph === 'sending') ac.abort(); } })))
      .toEqual({ outcome: 'not_sent', code: 'aborted', sha256: ABC_SHA });
    const ctx = capture(TARGET);
    expect(await sendFile(put, input({ ctx, onPhase: (ph) => { if (ph === 'sending') bump('test'); } })))
      .toEqual({ outcome: 'not_sent', code: 'stale', sha256: ABC_SHA });
    expect(reqs).toHaveLength(0);
  });

  it('a save that never ends: a cut settles it at once and frees the slot and the guard; a late save sends nothing', async () => {
    let late: (() => void) | null = null;
    const ac = new AbortController();
    const p = sendFile(put, input({ signal: ac.signal, beforeSend: () => new Promise<void>((r) => { late = r; }) }));
    await tick();
    expect(late).not.toBeNull();
    ac.abort();
    expect(await p).toEqual({ outcome: 'not_sent', code: 'aborted', sha256: ABC_SHA });
    expect([uploadsRunningOn(TARGET), leaveCount()]).toEqual([0, 0]);
    late!();
    await tick();
    const ctx = capture(TARGET);
    const p2 = sendFile(put, input({ ctx, beforeSend: () => new Promise<void>(() => {}) }));
    await tick();
    bump('test');
    expect(await p2).toEqual({ outcome: 'not_sent', code: 'stale', sha256: ABC_SHA });
    // A save that fails after the cut: observed (no unhandled rejection), nothing sent.
    const ac3 = new AbortController();
    const p3 = sendFile(put, input({ signal: ac3.signal, beforeSend: () => new Promise<void>((_r, rej) => { late = () => rej(new Error('late')); }) }));
    await tick();
    ac3.abort();
    expect(await p3).toEqual({ outcome: 'not_sent', code: 'aborted', sha256: ABC_SHA });
    late!();
    await tick();
    expect(reqs).toHaveLength(0);
    expect([uploadsRunningOn(TARGET), leaveCount()]).toEqual([0, 0]);
  });

  it('an abort from inside onPhase(queued) while 3 run settles at once, without waiting for a slot', async () => {
    auto = () => ({ hold: true });
    const ps = [0, 1, 2].map(() => sendFile(put, input()));
    await tick(20);
    expect(uploadsRunningOn(TARGET)).toBe(3);
    const ac = new AbortController();
    const fourth = sendFile(put, input({ signal: ac.signal, onPhase: (ph) => { if (ph === 'queued') ac.abort(); } }));
    const r = await Promise.race([fourth, tick(30).then(() => 'still waiting')]);
    expect(r).toEqual({ outcome: 'not_sent', code: 'aborted', sha256: null });
    expect([uploadsRunningOn(TARGET), leaveCount()]).toEqual([3, 3]);
    for (const q of reqs) q.answer({ status: 201, body: '{}' });
    await Promise.all(ps);
  });
});

describe('the transfer worker', () => {
  // A Worker stand-in that runs upload.worker.ts's handler in this page, on the test transport's fetch.
  class FakeWorker {
    static last: FakeWorker | null = null;
    static fetchFn: (u: string, i: RequestInit) => Promise<Response> = (u, i) => fake.fetch(u, i, {} as never);
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    posted: unknown[] = [];
    url: string;
    opts: unknown;
    private handle = workerHandler((m: FromWorker) => { setTimeout(() => this.onmessage?.({ data: m } as MessageEvent), 0); }, (u, i) => FakeWorker.fetchFn(u, i));
    constructor(url: URL, opts: unknown) { this.url = String(url); this.opts = opts; FakeWorker.last = this; }
    postMessage(m: unknown) { this.posted.push(m); setTimeout(() => this.handle({ data: m }), 0); }
    terminate() { /* nothing */ }
  }

  it('a live page hashes and sends in a same-origin module worker', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const o = await sendFile(put, input());
    expect(o).toEqual({ outcome: 'done', status: 201, data: { ok: true }, sha256: ABC_SHA });
    const w = FakeWorker.last!;
    expect(w.url).toMatch(/upload\.worker\.ts/);
    expect(w.opts).toMatchObject({ type: 'module' });
    expect(w.posted.map((m) => (m as { op: string }).op)).toEqual(['hash', 'send']);
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.init).toMatchObject({ redirect: 'manual', credentials: 'omit' });
  });

  it('the worker\'s start-up line (its revision, no job id) answers no job: the upload goes on to its own answer', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    expect(WORKER_REVISION).toBeGreaterThanOrEqual(2);
    auto = () => ({ hold: true });
    const p = sendFile(put, input());
    await vi.waitFor(() => expect(reqs).toHaveLength(1));
    // As upload.worker.ts posts it; and shapes a job answer never has.
    for (const data of [{ revision: WORKER_REVISION }, { revision: WORKER_REVISION, id: undefined }, null, 'revision']) {
      FakeWorker.last!.onmessage?.({ data } as MessageEvent);
    }
    expect(await Promise.race([p, tick(30).then(() => 'still waiting')])).toBe('still waiting');
    expect(uploadsRunningOn(TARGET)).toBe(1);
    reqs[0]!.answer({ status: 201, body: '{"ok":true}' });
    expect(await p).toMatchObject({ outcome: 'done', status: 201, sha256: ABC_SHA });
  });

  it('an abort reaches the worker\'s fetch; a worker that breaks during the send leaves it unknown', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    auto = () => ({ hold: true });
    const ac = new AbortController();
    const p = sendFile(put, input({ signal: ac.signal }));
    await tick(20);
    expect(reqs).toHaveLength(1);
    ac.abort();
    expect(await p).toEqual({ outcome: 'unknown', why: 'aborted', status: 0, sha256: ABC_SHA });
    expect(FakeWorker.last!.posted.map((m) => (m as { op: string }).op).slice(-3)).toEqual(['hash', 'send', 'abort']);
    const p2 = sendFile(put, input());
    await tick(20);
    FakeWorker.last!.onerror?.({});
    expect(await p2).toEqual({ outcome: 'unknown', why: 'network', status: 0, sha256: ABC_SHA });
  });

  it('a cut settles at once while the worker\'s fetch ignores the abort; the slot and the guard wait for its answer', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const was = FakeWorker.fetchFn;
    const held: Array<(r: Response) => void> = [];
    FakeWorker.fetchFn = () => new Promise<Response>((r) => { held.push(r); });
    try {
      const g0 = leaveCount();
      const ac = new AbortController();
      const p = sendFile(put, input({ signal: ac.signal }));
      await vi.waitFor(() => expect(held).toHaveLength(1));
      expect(uploadsRunningOn(TARGET)).toBe(1);
      ac.abort();
      expect(await Promise.race([p, tick(2000).then(() => 'still waiting')]))
        .toEqual({ outcome: 'unknown', why: 'aborted', status: 0, sha256: ABC_SHA });
      // The worker's fetch may still be sending: its computer slot and the leave guard stay.
      expect(uploadsRunningOn(TARGET)).toBe(1);
      expect(leaveCount()).toBe(g0 + 1);
      held[0]!(new Response('{}', { status: 201, headers: { 'content-type': 'application/json' } }));
      await vi.waitFor(() => expect(uploadsRunningOn(TARGET)).toBe(0));
      expect(leaveCount()).toBe(g0);
    } finally { FakeWorker.fetchFn = was; }
  });

  it('a cut job of a worker that then breaks frees the slot and the guard', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const was = FakeWorker.fetchFn;
    FakeWorker.fetchFn = () => new Promise<Response>(() => { /* never answers, ignores the abort */ });
    try {
      const g0 = leaveCount();
      const ctx = capture(TARGET);
      let asked = false;
      FakeWorker.fetchFn = () => { asked = true; return new Promise<Response>(() => { /* never answers, ignores the abort */ }); };
      const p = sendFile(put, input({ ctx }));
      await vi.waitFor(() => expect(asked).toBe(true));
      bump('test');
      expect(await Promise.race([p, tick(2000).then(() => 'still waiting')]))
        .toEqual({ outcome: 'unknown', why: 'stale', status: 0, sha256: ABC_SHA });
      expect(uploadsRunningOn(TARGET)).toBe(1);
      FakeWorker.last!.onerror?.({});
      await vi.waitFor(() => expect(uploadsRunningOn(TARGET)).toBe(0));
      expect(leaveCount()).toBe(g0);
    } finally { FakeWorker.fetchFn = was; }
  });

  it('an abort or a dead context from inside onPhase(sending) posts no send to the worker', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const ac = new AbortController();
    expect(await sendFile(put, input({ signal: ac.signal, onPhase: (ph) => { if (ph === 'sending') ac.abort(); } })))
      .toEqual({ outcome: 'not_sent', code: 'aborted', sha256: ABC_SHA });
    expect(FakeWorker.last!.posted.map((m) => (m as { op: string }).op)).not.toContain('send');
    const ctx = capture(TARGET);
    expect(await sendFile(put, input({ ctx, onPhase: (ph) => { if (ph === 'sending') bump('test'); } })))
      .toEqual({ outcome: 'not_sent', code: 'stale', sha256: ABC_SHA });
    expect(FakeWorker.last!.posted.map((m) => (m as { op: string }).op)).not.toContain('send');
    expect(reqs).toHaveLength(0);
  });

  it('the worker loop ignores other shapes and answers each job once', async () => {
    const out: FromWorker[] = [];
    const h = workerHandler((m) => out.push(m), () => Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })));
    h({ data: null });
    h({ data: { op: 'hash', id: 'x', file: file() } });
    h({ data: { op: 'run', id: 1, file: file() } });
    h({ data: { op: 'hash', id: 2, file: 'abc' } });
    h({ data: { op: 'hash', id: 3, file: file() } });
    await tick(20);
    expect(out).toEqual([{ id: 3, sha256: ABC_SHA }]);
    expect(new UploadCoreError('aborted').code).toBe('aborted');
  });
});
