// The live mount's request fence (fence.ts).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | An answer before the trip reaches its consumer untouched (core scrubs it there) | 'answer before trip' |
// | 2 | After the trip the consumer settles stale at once; the answer that comes later is wiped (every key, nested) and never delivered | 'late answer wiped' |
// | 3 | A late refusal is wiped too; a late Response has its body cancelled unread | 'late refusal and response' |
// | 4 | The fence's signal aborts at trip; a call made after the trip is stale at once | 'signal and after-trip calls' |
// | 5 | A call's own deadline: the consumer settles TIMEOUT at it; the answer after it is wiped, never delivered; an answer before it clears the timer | 'deadline before answer' |
// | 6 | Wipe shapes: a frozen parent keeps its fields but its mutable children are wiped; a writable non-configurable field is set to undefined; a read-only one is counted in kept; Map, Set and typed arrays are cleared; primitives and null are a no-op | 'wipe shapes' |
// | 8 | The caller's signal is part of the call: its abort aborts the call's ended signal at once, settles the consumer with the signal's reason, and the later answer is wiped; a caller already aborted starts nothing | 'caller signal' |
// | 9 | guardBody keeps the cancellation through the body: once the signal aborts, a read in progress or a later one rejects and the client's body is cancelled; before it the bytes pass unchanged | 'body after abort' |
// | 11 | Exceptional statuses: a 3xx answer goes on with no body and the client's stream is cancelled at once, before any abort; 204/205/304 answers carrying a stream likewise; an opaque redirect and a status no Response can be built with keep their object, the stream already cancelled (reads empty); a cancel that never settles or that rejects changes nothing (returns at once, no unhandled rejection); a body handed over locked is refused TERM_BODY_LOCKED. Limit: this proves the Hub's reads stop, not that the client's network work stopped |
// | 12 | Elapsed deadline: the deadline is fixed on the fence clock before start; with the clock past it and no timer run, live() is false and the call settles TIMEOUT at that check | 'elapsed deadline' | 'exceptional statuses' |
// | 10 | drain: calls given up on but not answered are unresolved; drain waits for them up to its bound, and an incomplete wipe that comes during the wait is in its report | 'drain' |
// | 7 | Every typed-array family is zeroed (BigInt64/BigUint64 with 0n, a DataView's bytes), kept 0; a late answer whose wipe kept something is counted in incomplete(), a whole wipe is not | 'typed arrays and incomplete' |
import { expect, test } from 'bun:test';
import { createFence, guardBody, setFenceClockForTests, wipeAnswer } from './fence';

const later = <T,>() => { let res!: (v: T) => void; let rej!: (e: unknown) => void; const p = new Promise<T>((a, b) => { res = a; rej = b; }); return { p, res, rej }; };

test('answer before trip', async () => {
  const f = createFence();
  const answer = { data: { key: 'hbk_secret' } };
  await expect(f.fenced(Promise.resolve(answer))).resolves.toBe(answer);
  f.trip();
  expect(answer.data.key).toBe('hbk_secret');
  expect(f.wiped()).toBe(0);
});

test('late answer wiped', async () => {
  const f = createFence();
  const d = later<{ data: { key: string; list: { token: string }[] } }>();
  const call = f.fenced(d.p);
  f.trip();
  await expect(call).rejects.toMatchObject({ status: 0, stale: true });
  const answer = { data: { key: 'hbk_secret', list: [{ token: 'hdy_canary' }] } };
  const inner = answer.data;
  const row = answer.data.list[0]!;
  d.res(answer);
  await new Promise((r) => setTimeout(r, 0));
  expect(Object.keys(answer)).toEqual([]);
  expect(Object.keys(inner)).toEqual([]);
  expect(Object.keys(row)).toEqual([]);
  expect(JSON.stringify(answer)).not.toContain('canary');
  expect(f.wiped()).toBe(1);
});

test('late refusal and response', async () => {
  const f = createFence();
  const a = later<unknown>();
  const b = later<Response>();
  const ca = f.fenced(a.p);
  const cb = f.fenced(b.p);
  f.trip();
  await expect(ca).rejects.toMatchObject({ stale: true });
  await expect(cb).rejects.toMatchObject({ stale: true });
  const refusal = { status: 409, data: { echoed: 'hdy_canary' } };
  a.rej(refusal);
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  b.res(new Response(body));
  await new Promise((r) => setTimeout(r, 10));
  expect(Object.keys(refusal)).toEqual([]);
  expect(cancelled).toBe(true);
  expect(f.wiped()).toBe(2);
});

test('signal and after-trip calls', async () => {
  const f = createFence();
  expect(f.signal.aborted).toBe(false);
  f.trip();
  expect(f.signal.aborted).toBe(true);
  await expect(f.fenced(new Promise(() => {}))).rejects.toMatchObject({ stale: true });
});

test('deadline before answer', async () => {
  const f = createFence();
  const late = later<{ secret: { key: string } }>();
  const p = f.fenced(late.p, { deadlineMs: 30 });
  await expect(p).rejects.toMatchObject({ status: 0, code: 'TIMEOUT' });
  const answer = { secret: { key: 'hbk_CANARY' } };
  const inner = answer.secret;
  late.res(answer);
  await new Promise((r) => setTimeout(r, 10));
  expect(Reflect.ownKeys(answer)).toEqual([]);
  expect(Reflect.ownKeys(inner)).toEqual([]);
  expect(f.wiped()).toBe(1);
  // In time: delivered untouched, no timer left behind to fire later.
  const ok = later<{ a: number }>();
  const q = f.fenced(ok.p, { deadlineMs: 50 });
  ok.res({ a: 1 });
  expect(await q).toEqual({ a: 1 });
  await new Promise((r) => setTimeout(r, 80));
  expect(f.wiped()).toBe(1);
});

test('wipe shapes', () => {
  const child = { key: 'hbk_CANARY' };
  const frozen = Object.freeze({ child, n: 1 });
  const r1 = wipeAnswer(frozen);
  expect(Reflect.ownKeys(child)).toEqual([]);
  expect(frozen.child).toBe(child);
  expect(r1.kept).toBe(2);
  const o: Record<string, unknown> = {};
  Object.defineProperty(o, 'w', { value: { key: 'x' }, writable: true, configurable: false, enumerable: true });
  Object.defineProperty(o, 'ro', { value: 'hbk_CANARY', writable: false, configurable: false, enumerable: true });
  const inner = o.w as Record<string, unknown>;
  const r2 = wipeAnswer(o);
  expect(o.w).toBeUndefined();
  expect(Reflect.ownKeys(inner)).toEqual([]);
  expect(r2.kept).toBe(1);
  const m = new Map([['k', { key: 'x' }]]);
  const set = new Set([{ key: 'y' }]);
  const bytes = new Uint8Array([1, 2, 3]);
  wipeAnswer({ m, set, bytes });
  expect(m.size).toBe(0);
  expect(set.size).toBe(0);
  expect([...bytes]).toEqual([0, 0, 0]);
  expect(wipeAnswer('x')).toEqual({ kept: 0, truncated: false });
  expect(wipeAnswer(null)).toEqual({ kept: 0, truncated: false });
});

test('typed arrays and incomplete', async () => {
  const big = new BigInt64Array([1n, -2n]);
  const ubig = new BigUint64Array([3n]);
  const f64 = new Float64Array([1.5]);
  const buf = new ArrayBuffer(4);
  new Uint8Array(buf).set([9, 9, 9, 9]);
  const dv = new DataView(buf, 1, 2);
  const r = wipeAnswer({ big, ubig, f64, dv });
  expect(r).toEqual({ kept: 0, truncated: false });
  expect([...big]).toEqual([0n, 0n]);
  expect([...ubig]).toEqual([0n]);
  expect([...f64]).toEqual([0]);
  expect([...new Uint8Array(buf)]).toEqual([9, 0, 0, 9]);
  const f = createFence();
  let late1!: (v: unknown) => void;
  let late2!: (v: unknown) => void;
  const a = f.fenced(new Promise((res) => { late1 = res; })).catch(() => null);
  const b = f.fenced(new Promise((res) => { late2 = res; })).catch(() => null);
  f.trip();
  await a; await b;
  late1({ data: { key: 'x' } });
  late2(Object.freeze({ key: 'hbk_CANARY' }));
  await new Promise((res) => setTimeout(res, 5));
  expect(f.wiped()).toBe(2);
  expect(f.incomplete()).toBe(1);
});

test('caller signal', async () => {
  const f = createFence();
  const caller = new AbortController();
  const late = later<unknown>();
  let seen!: AbortSignal;
  const call = f.run((ended) => { seen = ended; return late.p; }, { signal: caller.signal });
  expect(seen.aborted).toBe(false);
  const reason = new Error('kit timeout');
  caller.abort(reason);
  expect(seen.aborted).toBe(true);
  await expect(call).rejects.toBe(reason);
  const body = { data: { key: 'hbk_CANARY' } };
  const data = body.data;
  late.res(body);
  await new Promise((r) => setTimeout(r, 5));
  expect(Reflect.ownKeys(data)).toEqual([]);
  expect(f.wiped()).toBe(1);
  expect(f.tripped()).toBe(false);
  // Already aborted: nothing starts.
  let started = false;
  await expect(f.run(() => { started = true; return Promise.resolve(1); }, { signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
  expect(started).toBe(false);
});

test('body after abort', async () => {
  const sig = new AbortController();
  let cancelled: unknown = null;
  let push!: ReadableStreamDefaultController<Uint8Array>;
  const src = new ReadableStream<Uint8Array>({ start(c) { push = c; }, cancel(why) { cancelled = why ?? 'cancelled'; } });
  const res = guardBody(new Response(src, { status: 200, headers: { 'content-type': 'text/event-stream' } }), sig.signal);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('text/event-stream');
  const reader = res.body!.getReader();
  push.enqueue(new Uint8Array([1, 2]));
  expect(Array.from((await reader.read()).value!)).toEqual([1, 2]);
  const pending = reader.read();
  sig.abort(new Error('stream-open timeout'));
  await expect(Promise.race([pending, new Promise((r) => setTimeout(() => r('still reading'), 500))])).rejects.toThrow('stream-open timeout');
  await expect(reader.read()).rejects.toThrow('stream-open timeout');
  await new Promise((r) => setTimeout(r, 5));
  expect(cancelled).not.toBeNull();
  // A Response with no body passes as it is.
  const empty = new Response(null, { status: 204 });
  expect(guardBody(empty, sig.signal)).toBe(empty);
});

test('exceptional statuses', async () => {
  const sig = new AbortController();
  const stream = () => {
    const st = { cancelled: false };
    const src = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([7])); }, cancel() { st.cancelled = true; } });
    return { src, st };
  };
  const tick = () => new Promise((r) => setTimeout(r, 5));
  // A redirect: no body, the client's stream cancelled before any abort.
  const r1 = stream();
  const g1 = guardBody(new Response(r1.src, { status: 302, headers: { location: '/x' } }), sig.signal);
  await tick();
  expect(g1.status).toBe(302);
  expect(g1.body).toBeNull();
  expect(r1.st.cancelled).toBe(true);
  // A null-body status that came with a stream anyway (a non-conforming client's object).
  const r2 = stream();
  const g2 = guardBody({ body: r2.src, status: 204, statusText: '', type: 'default', headers: new Headers() } as unknown as Response, sig.signal);
  await tick();
  expect(g2.status).toBe(204);
  expect(g2.body).toBeNull();
  expect(r2.st.cancelled).toBe(true);
  // A status no Response can be built with: the same object, its stream already cancelled, reads as empty.
  const r3 = stream();
  const odd = { body: r3.src, status: 600, statusText: '', type: 'default', headers: new Headers() } as unknown as Response;
  expect(guardBody(odd, sig.signal)).toBe(odd);
  await tick();
  expect(r3.st.cancelled).toBe(true);
  expect((await r3.src.getReader().read()).done).toBe(true);
  // An opaque redirect (status 0): the same object, its stream cancelled at once.
  const r5 = stream();
  const opaque = { body: r5.src, status: 0, statusText: '', type: 'opaqueredirect', headers: new Headers() } as unknown as Response;
  expect(guardBody(opaque, sig.signal)).toBe(opaque);
  await tick();
  expect(r5.st.cancelled).toBe(true);
  // 205 and 304 carrying a stream (non-conforming client objects): no body handed on, stream cancelled.
  for (const status of [205, 304]) {
    const r = stream();
    const g = guardBody({ body: r.src, status, statusText: '', type: 'default', headers: new Headers() } as unknown as Response, sig.signal);
    await tick();
    expect(g.status).toBe(status);
    expect(g.body).toBeNull();
    expect(r.st.cancelled).toBe(true);
  }
  // A cancel that never settles, and one that rejects: guardBody returns at once with no body, no unhandled rejection.
  const pendingSrc = new ReadableStream<Uint8Array>({ cancel: () => new Promise<void>(() => {}) });
  const g6 = guardBody(new Response(pendingSrc, { status: 302 }), sig.signal);
  expect(g6.body).toBeNull();
  const unhandled: unknown[] = [];
  const onUnhandled = (e: unknown) => { unhandled.push(e); };
  process.on('unhandledRejection', onUnhandled);
  try {
    const rejectSrc = new ReadableStream<Uint8Array>({ cancel: () => Promise.reject(new Error('cancel failed')) });
    const g7 = guardBody(new Response(rejectSrc, { status: 302 }), sig.signal);
    expect(g7.body).toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(unhandled).toEqual([]);
  } finally { process.off('unhandledRejection', onUnhandled); }
  // A locked body is refused, whatever the status.
  for (const status of [200, 302]) {
    const r4 = stream();
    r4.src.getReader();
    expect(() => guardBody({ body: r4.src, status, statusText: '', type: 'default', headers: new Headers() } as unknown as Response, sig.signal)).toThrow(/^TERM_BODY_LOCKED/);
  }
});

test('elapsed deadline', async () => {
  let now = 0;
  setFenceClockForTests(() => now);
  try {
    const f = createFence();
    let live: () => boolean = () => true;
    let started = -1;
    const out = f.run((_ended, l) => { live = l; started = now; return new Promise(() => {}); }, { deadlineMs: 60_000 }).catch((e: unknown) => e);
    expect(started).toBe(0);
    expect(live()).toBe(true);
    now = 60_000;
    expect(live()).toBe(false);
    expect(await out).toMatchObject({ code: 'TIMEOUT' });
    expect(live()).toBe(false);
  } finally { setFenceClockForTests(null); }
});

test('drain', async () => {
  const f = createFence();
  const a = later<unknown>();
  const b = later<unknown>();
  const ca = f.fenced(a.p).catch(() => {});
  const cb = f.fenced(b.p).catch(() => {});
  f.trip();
  await ca; await cb;
  // Nothing answered yet, and the bound passes: both unresolved.
  expect(await f.drain(10)).toEqual({ incomplete: 0, unresolved: 2 });
  // One answers (frozen: the wipe keeps its field) while drain waits; the other never does.
  const d = f.drain(200);
  a.res(Object.freeze({ key: 'hbk_CANARY' }));
  const t0 = Date.now();
  const r = await d;
  expect(r).toEqual({ incomplete: 1, unresolved: 1 });
  expect(Date.now() - t0).toBeGreaterThanOrEqual(150);
  // The last one answers: drain returns at once.
  b.rej({ status: 500 });
  await new Promise((res) => setTimeout(res, 1));
  const t1 = Date.now();
  expect(await f.drain(1000)).toEqual({ incomplete: 1, unresolved: 0 });
  expect(Date.now() - t1).toBeLessThan(50);
});
