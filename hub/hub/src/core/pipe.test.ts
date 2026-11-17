// pipe.ts routes and kit-io upload(): the declared pipe routes and the one streaming upload leg.
import { afterEach, describe, expect, it } from 'vitest';
import { api } from './api';
import { bump, capture } from './ctx';
import { upload, uploadCount } from './kit-io';
import { pipeRoutes } from './pipe';
import { defineRoute } from './routes';
import { installTransport, type Transport } from './transport';
import { boot, PROXY, R1, TARGET } from './test/env';

const PIPE = `https://p1-c1-pipe-1.sv1.${PROXY}`;
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const settled = <T,>(p: Promise<T>) => p.then((v) => ({ ok: v, e: undefined as unknown }), (e) => ({ ok: undefined, e }));

type Answer = { status?: number; body?: string; fail?: boolean; redirect?: boolean; hold?: boolean; res?: () => Response };
type Req = { url: string; init: RequestInit & { duplex?: string }; signal: AbortSignal | null | undefined };
let reqs: Req[] = [];
let answer: (r: Req) => Answer = () => ({ status: 200, body: '[INFO] Live stream ended (peak 0 viewers).\n' });
const fake: Transport = {
  hoody: () => Promise.reject(new Error('not used')),
  fetch(url, init) {
    const req: Req = { url, init: init as Req['init'], signal: init.signal };
    reqs.push(req);
    const a = answer(req);
    if (a.fail) return Promise.reject(new TypeError('Failed to fetch'));
    if (a.res) return Promise.resolve(a.res());
    if (a.redirect) return Promise.resolve(new Response(null, { status: 302, headers: { location: 'https://elsewhere.test/' } }));
    return new Promise((resolve, reject) => {
      const go = () => resolve(new Response(a.body ?? '', { status: a.status ?? 200, headers: { 'content-type': 'text/plain' } }));
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      if (!a.hold) go();
    });
  },
};
function page(o: { framed?: boolean } = {}) {
  boot({ realm: R1, framed: o.framed });
  reqs = [];
  installTransport(fake);
}
afterEach(() => { installTransport(null); });

const body = () => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])); } });
const TYPE = 'video/webm;codecs=vp8,opus';
const KEY = 'Kk_-0123456789abcdefghijABCDEFGHIJ';
/** The live send, keyed unless the case says otherwise (senderKey: undefined is a keyless send). */
const live = (extra: Partial<Parameters<typeof upload>[1]> = {}) =>
  upload(pipeRoutes.live, { params: { name: 'bc-abc' }, query: { live: 1, transfer: 'bc-transfer-0000000001' }, target: TARGET, body: body(), contentType: TYPE, senderKey: KEY, ...extra });

describe('pipe routes', () => {
  it('are kit routes on pipe-1, the live one an upload route', () => {
    for (const r of Object.values(pipeRoutes)) expect([r.scope, r.kit, r.index, r.path]).toEqual(['kit', 'pipe', 1, '/api/v1/pipe/:name']);
    expect(pipeRoutes.live.upload).toBe(true);
    expect(pipeRoutes.progress.stream).toBeTruthy();
  });
  it('an upload route is a kit POST/PUT with no body keys, idem, stream or run', () => {
    const bad = [
      { method: 'GET', path: '/x', scope: 'kit', kit: 'pipe', index: 1, upload: true },
      { method: 'POST', path: '/x', scope: 'agent', upload: true },
      { method: 'POST', path: '/x', scope: 'kit', kit: 'pipe', index: 1, body: ['a'], upload: true },
      { method: 'POST', path: '/x', scope: 'kit', kit: 'pipe', index: 1, idem: true, upload: true },
      { method: 'POST', path: '/x', scope: 'base', upload: true },
    ];
    for (const spec of bad) expect(() => defineRoute(spec as never)).toThrow(/ROUTE_INVALID/);
    expect(() => defineRoute({ method: 'PUT', path: '/x', scope: 'kit', kit: 'pipe', index: 1, upload: true })).not.toThrow();
  });
  it('an upload route never goes through api()', async () => {
    page();
    expect(await settled(api(pipeRoutes.live as never, { params: { name: 'bc-abc' } }))).toMatchObject({ e: { kind: 'not_sent', code: 'ROUTE_NOT_ALLOWED' } });
    expect(reqs.length).toBe(0);
  });
});

describe('upload: the sender key', () => {
  it('the pipe live route declares a sender key; only an upload route may', () => {
    expect(pipeRoutes.live.senderKey).toBe(true);
    expect(pipeRoutes.status.senderKey).toBeUndefined();
    expect(() => defineRoute({ method: 'POST', path: '/x', scope: 'kit', kit: 'pipe', index: 1, senderKey: true })).toThrow();
    expect(() => defineRoute({ method: 'GET', path: '/x', scope: 'kit', kit: 'pipe', index: 1, senderKey: true as never })).toThrow();
    expect(() => defineRoute({ method: 'POST', path: '/x', scope: 'kit', kit: 'pipe', index: 1, upload: true, senderKey: 1 as never })).toThrow();
    expect(() => defineRoute({ method: 'PUT', path: '/x', scope: 'kit', kit: 'pipe', index: 1, upload: true, senderKey: true })).not.toThrow();
  });
  it('a route without the flag sends byte for byte as before: the same request, no key header', async () => {
    page();
    const plain = defineRoute({ method: 'POST', path: '/api/v1/pipe/:name', scope: 'kit', kit: 'pipe', index: 1, query: ['live', 'transfer'], upload: true, maxBytes: 65536 });
    expect(plain.senderKey).toBeUndefined();
    const b = body();
    await upload(plain, { params: { name: 'bc-abc' }, query: { live: 1, transfer: 'bc-transfer-0000000001' }, target: TARGET, body: b, contentType: TYPE });
    const q = reqs[0]!;
    expect(q.url).toBe(`${PIPE}/api/v1/pipe/bc-abc?live=1&transfer=bc-transfer-0000000001`);
    expect([q.init.method, q.init.duplex, q.init.credentials, q.init.redirect, q.init.cache, q.init.body]).toEqual(['POST', 'half', 'omit', 'manual', 'no-store', b]);
    expect(Object.entries(q.init.headers as Record<string, string>)).toEqual([['Accept', 'text/plain'], ['Content-Type', TYPE], ['X-Hoody-Pipe', 'mimeType=' + TYPE]]);
  });
  it('a keyed send carries X-Hoody-Pipe-Sender-Key with exactly the given key', async () => {
    page();
    await live();
    expect(reqs.length).toBe(1);
    expect({ ...(reqs[0]!.init.headers as Record<string, string>) }).toEqual({ Accept: 'text/plain', 'Content-Type': TYPE, 'X-Hoody-Pipe': 'mimeType=' + TYPE, 'X-Hoody-Pipe-Sender-Key': KEY });
  });
  it('a route that declares a key never sends without one, or with a malformed one; a route that does not, never with one', async () => {
    page();
    const plain = defineRoute({ method: 'POST', path: '/api/v1/pipe/:name', scope: 'kit', kit: 'pipe', index: 1, query: ['live', 'transfer'], upload: true, maxBytes: 65536 });
    const bad: unknown[] = [undefined, '', 'short', 'x'.repeat(15), 'x'.repeat(129), 'a'.repeat(20) + ' b', 'a'.repeat(20) + '\r\nX-Evil: 1', 'a'.repeat(20) + '.', 'é'.repeat(20), 42, null];
    for (const k of bad) expect(await settled(live({ senderKey: k as never }))).toMatchObject({ e: { notSent: true, code: 'HEADER_NOT_ALLOWED' } });
    expect(await settled(upload(plain, { params: { name: 'bc-abc' }, query: { live: 1, transfer: 'bc-transfer-0000000001' }, target: TARGET, body: body(), contentType: TYPE, senderKey: KEY }))).toMatchObject({ e: { notSent: true, code: 'HEADER_NOT_ALLOWED' } });
    expect(reqs.length).toBe(0);
    for (const k of ['a'.repeat(16), 'Z'.repeat(128), 'a-b_C9'.repeat(5)]) { reqs.length = 0; await live({ senderKey: k }); expect((reqs[0]!.init.headers as Record<string, string>)['X-Hoody-Pipe-Sender-Key']).toBe(k); }
  });
});

describe('upload: the request', () => {
  it('one streaming POST to the computer pipe host: duplex half, credentials omit, the media headers and the sender key, no caller headers', async () => {
    page();
    const b = body();
    const r = await live({ body: b });
    expect(r).toEqual({ status: 200, text: '[INFO] Live stream ended (peak 0 viewers).\n' });
    expect(reqs.length).toBe(1);
    const q = reqs[0]!;
    expect(q.url).toBe(`${PIPE}/api/v1/pipe/bc-abc?live=1&transfer=bc-transfer-0000000001`);
    expect([q.init.method, q.init.duplex, q.init.credentials, q.init.redirect, q.init.cache]).toEqual(['POST', 'half', 'omit', 'manual', 'no-store']);
    expect(q.init.body).toBe(b);
    expect({ ...(q.init.headers as Record<string, string>) }).toEqual({ Accept: 'text/plain', 'Content-Type': TYPE, 'X-Hoody-Pipe': 'mimeType=' + TYPE, 'X-Hoody-Pipe-Sender-Key': KEY });
    expect(uploadCount()).toBe(0);
  });
  it('refused unsent: a plain route, a non-WebM type, a locked or missing body, an extra query key, framed, aborted, a dead context', async () => {
    page();
    const locked = body();
    locked.getReader();
    const ac = new AbortController();
    ac.abort();
    const ctx = capture(TARGET);
    const cases: Array<[Promise<unknown>, string]> = [
      [upload(pipeRoutes.status, { params: { name: 'n' }, target: TARGET, body: body(), contentType: TYPE }), 'ROUTE_NOT_ALLOWED'],
      [live({ contentType: 'text/html' }), 'HEADER_NOT_ALLOWED'],
      [live({ contentType: 'video/webm\r\nX-Evil: 1' }), 'HEADER_NOT_ALLOWED'],
      [live({ body: locked }), 'BODY_INVALID'],
      [live({ body: 'x' as never }), 'BODY_INVALID'],
      [live({ query: { live: 1, n: 2 } as never }), 'ROUTE_QUERY'],
      [live({ params: { name: '../x' } }), 'ROUTE_PARAMS'],
      [live({ signal: ac.signal }), 'aborted'],
    ];
    for (const [p, code] of cases) expect(await settled(p)).toMatchObject({ e: { notSent: true, code } });
    bump('account');
    expect(await settled(live({ ctx }))).toMatchObject({ e: { kind: 'stale', notSent: true } });
    page({ framed: true });
    expect(await settled(live())).toMatchObject({ e: { notSent: true, code: 'FRAMED_ACTION_REFUSED' } });
    expect(reqs.length).toBe(0);
  });
  it('a computer without a pipe host is refused (NO_KIT_URL)', async () => {
    page();
    expect(await settled(live({ target: { project: { id: 'p1' }, container: { id: 'c1' } } as never }))).toMatchObject({ e: { code: 'NO_KIT_URL' } });
  });
});

describe('upload: the answer', () => {
  it('any HTTP status resolves with its text (a refusal is the pipe [ERROR] line)', async () => {
    page();
    answer = () => ({ status: 409, body: "[ERROR] '/bc-abc' is in use by a normal transfer.\n" });
    expect(await live()).toEqual({ status: 409, text: "[ERROR] '/bc-abc' is in use by a normal transfer.\n" });
  });
  it('an answer over 64 KiB is too_large, never an empty success', async () => {
    page();
    answer = () => ({ status: 200, body: 'x'.repeat(65537) });
    expect(await settled(live())).toMatchObject({ e: { kind: 'too_large', status: 200 } });
    expect(uploadCount()).toBe(0);
  });
  it('a caller abort after the last chunk was read is aborted, never a success', async () => {
    page();
    const ac = new AbortController();
    // The body ignores the fetch signal, so its last chunk is read after the caller aborted.
    answer = () => ({ res: () => new Response(new ReadableStream<Uint8Array>({ pull(c) { ac.abort(); c.enqueue(new TextEncoder().encode('[INFO] done\n')); c.close(); } }), { status: 200 }) });
    expect(await settled(live({ signal: ac.signal }))).toMatchObject({ e: { kind: 'aborted' } });
    expect(uploadCount()).toBe(0);
  });
  it('reads its inputs once: the type and the sender key checked are the ones sent', async () => {
    page();
    answer = () => ({ status: 200, body: '' });
    let reads = 0, keyReads = 0;
    const input = { params: { name: 'bc-abc' }, query: { live: 1, transfer: 'bc-transfer-0000000001' }, target: TARGET, body: body() } as unknown as Parameters<typeof upload>[1];
    Object.defineProperty(input, 'contentType', { get: () => (++reads > 1 ? 'text/html' : TYPE) });
    Object.defineProperty(input, 'senderKey', { get: () => (++keyReads > 1 ? 'bad key\r\n' : KEY) });
    await upload(pipeRoutes.live, input);
    expect([reads, keyReads]).toEqual([1, 1]);
    expect(new Headers(reqs[0]!.init.headers).get('content-type')).toBe(TYPE);
    expect(new Headers(reqs[0]!.init.headers).get('x-hoody-pipe-sender-key')).toBe(KEY);
  });
  it('no answer is unreachable; a redirect is redirected and never followed', async () => {
    page();
    answer = () => ({ fail: true });
    expect(await settled(live())).toMatchObject({ e: { kind: 'unreachable', code: 'NETWORK' } });
    answer = () => ({ redirect: true });
    expect(await settled(live())).toMatchObject({ e: { kind: 'redirected', status: 302 } });
    expect(reqs.length).toBe(2);
  });
  it('has no timeout of its own: it stays open until the caller aborts', async () => {
    page();
    answer = () => ({ hold: true });
    const ac = new AbortController();
    const p = settled(live({ signal: ac.signal }));
    await tick(40);
    expect(uploadCount()).toBe(1);
    ac.abort();
    expect(await p).toMatchObject({ e: { kind: 'aborted' } });
    expect(uploadCount()).toBe(0);
  });
  it('a generation move aborts it as stale', async () => {
    page();
    answer = () => ({ hold: true });
    const p = settled(live({ ctx: capture(TARGET) }));
    await tick();
    bump('account');
    expect(await p).toMatchObject({ e: { kind: 'stale' } });
    expect(reqs[0]!.signal?.aborted).toBe(true);
  });
});
