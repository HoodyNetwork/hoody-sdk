// kit-io.ts: streams, the store, version, download/save, run (and its headers) and stage,
// with the SSE, store and stage hardening cases.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bump, capture, setIdentity, setView, startLoggingOut } from './ctx';
import { api } from './api';
import { endAccount } from './realm';
import { defineRoute } from './routes';
import { installShared, shared } from './session';
import { installTransport, type Transport } from './transport';
import { currentStage, download, postBytes, run, save, speechRoute, stage, store, partitioned, stream, streamCount, version, type StreamState } from './kit-io';
import { AGENT, boot, env, PROXY, R1, signIn, TARGET, UID } from './test/env';

const kitHost = (kit: string, n: number) => `https://p1-c1-${kit}-${n}.sv1.${PROXY}`;
const SSE = { 'content-type': 'text/event-stream' };
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const settled = <T,>(p: Promise<T>) => p.then((v) => ({ ok: v, e: undefined as unknown }), (e) => ({ ok: undefined, e }));

// ---- a fetch that can stream, hold a body open, fail or redirect ----
type Answer = { status?: number; headers?: Record<string, string>; body?: string; chunks?: Array<string | Uint8Array>; hold?: boolean; fail?: 'network'; redirect?: boolean };
type Req = { url: string; init: RequestInit; release: () => void };
let reqs: Req[] = [];
let answer: (r: Req) => Answer = () => ({ status: 200, body: '{}' });
const fakeTransport: Transport = {
  hoody: () => Promise.reject(new Error('not used')),
  fetch(url, init) {
    let release = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const req: Req = { url, init, release };
    reqs.push(req);
    const a = answer(req);
    if (a.fail) return Promise.reject(new TypeError('Failed to fetch'));
    if (a.redirect) return Promise.resolve(new Response(null, { status: 302, headers: { location: 'https://elsewhere.test/' } }));
    const enc = (c: string | Uint8Array) => (typeof c === 'string' ? new TextEncoder().encode(c) : c);
    const chunks = a.chunks ?? (a.body !== undefined ? [a.body] : []);
    const signal = init.signal;
    const body = new ReadableStream<Uint8Array>({
      async start(ctl) {
        const onAbort = () => { try { ctl.error(new DOMException('aborted', 'AbortError')); } catch { /* closed */ } };
        signal?.addEventListener('abort', onAbort);
        if (a.hold && !a.chunks) await gate;
        for (const c of chunks) {
          if (signal?.aborted) return;
          ctl.enqueue(enc(c));
          await Promise.resolve();
        }
        // hold: open until aborted, or (with chunks) until release()
        if (a.hold) { if (!a.chunks) return; await gate; }
        try { ctl.close(); } catch { /* aborted */ }
      },
    });
    return Promise.resolve(new Response(body, { status: a.status ?? 200, headers: { 'content-type': 'application/json', ...(a.headers || {}) } }));
  },
};
function page(o: { framed?: boolean } = {}) {
  boot({ realm: R1, framed: o.framed });
  reqs = [];
  installTransport(fakeTransport);
}
afterEach(() => { installTransport(null); vi.useRealTimers(); });

// ---- stream ----
const botStream = defineRoute({ method: 'GET', path: '/bots/:id/stream', scope: 'agent', realm: 'bot', query: ['since'], maxBytes: 4096, stream: { id: 64, noId: 256 } });
const logStream = defineRoute({ method: 'GET', path: '/_logs/stream', scope: 'kit', kit: 'logs', index: 1, query: ['afterId'], maxBytes: 1 << 20, stream: { id: 512, noId: 4096 } });
const botsList = defineRoute({ method: 'GET', path: '/bots', scope: 'agent' });

function open(extra: Partial<Parameters<typeof stream>[1]> = {}, since?: string) {
  const events: Array<[string, string, string | undefined]> = [], states: StreamState[] = [];
  const h = stream(botStream, {
    params: { id: 'b1' }, query: since ? { since } : undefined, target: TARGET, realm: R1,
    onEvent: (n, d, id) => events.push([n, d, id]), onState: (s) => states.push(s), ...extra,
  });
  return { h, events, states, closed: () => states.filter((s) => s.state === 'closed') };
}

describe('stream: admission and the request', () => {
  it('agent: text/event-stream only, credentials include, no-store, no redirects; the cursor rides in the query', async () => {
    page();
    answer = () => ({ status: 200, headers: SSE, hold: true });
    const s = open({}, '42');
    await tick();
    const r = reqs[0]!;
    expect(r.url).toBe(`${AGENT}/bots/b1/stream?since=42&realm=${R1}`);
    expect({ ...(r.init.headers as Record<string, string>) }).toEqual({ Accept: 'text/event-stream' });
    expect([r.init.credentials, r.init.redirect, r.init.cache]).toEqual(['include', 'manual', 'no-store']);
    expect(s.states[0]).toEqual({ state: 'open', status: 200 });
    s.h.close();
  });
  it('kit: credentials omit, the kit host', async () => {
    page();
    answer = () => ({ status: 200, headers: SSE, hold: true });
    const h = stream(logStream, { query: { afterId: '7' }, target: TARGET, index: 1, onEvent: () => {} });
    await tick();
    expect(reqs[0]!.url).toBe(kitHost('logs', 1) + '/_logs/stream?afterId=7');
    expect(reqs[0]!.init.credentials).toBe('omit');
    h.close();
  });
  it('refused before anything opens: an extra query key, a plain route, no handler, a dead context', () => {
    page();
    expect(open({ query: { since: '1', x: '2' } as never }).h.refused).toBe('ROUTE_QUERY');
    expect(stream(botsList, { onEvent: () => {} }).refused).toBe('ROUTE_NOT_ALLOWED');
    expect(open({ onEvent: undefined as never }).h.refused).toBe('HANDLER_MISSING');
    const ctx = capture(TARGET);
    bump('account');
    expect(open({ ctx }).h.refused).toBe('STALE');
    const ac = new AbortController();
    ac.abort();
    expect(open({ signal: ac.signal }).h.refused).toBe('ABORTED');
    expect(reqs.length).toBe(0);
  });
  it('a stream route never goes through api()', async () => {
    page();
    expect(await settled(api(botStream as never, { params: { id: 'b1' } }))).toMatchObject({ e: { kind: 'not_sent', code: 'ROUTE_NOT_ALLOWED' } });
    expect(reqs.length).toBe(0);
  });
});

describe('stream: parsing (byte by byte, any line ending)', () => {
  const body = 'event: hello\nid: 1\ndata: a\ndata: b\n\n: heartbeat\n\ndata: plain\r\n\r\nretry: 5\nid: 3\ndata: c\r\rdata:no-space\n\nid: 9\n\n';
  for (const split of [false, true]) {
    it(`event, id, multi-line data, comments, CRLF and CR; retry ignored${split ? ' (one byte per read)' : ''}`, async () => {
      page();
      const chunks = split ? [...new TextEncoder().encode(body)].map((b) => new Uint8Array([b])) : [body];
      answer = () => ({ status: 200, headers: SSE, chunks, hold: true });
      const s = open();
      await tick(split ? 60 : 5);
      expect(s.events).toEqual([['hello', 'a\nb', '1'], ['message', 'plain', undefined], ['message', 'c', '3'], ['message', 'no-space', undefined]]);
      s.h.close();
    });
  }
  it('multi-byte text split across reads decodes whole', async () => {
    page();
    const bytes = new TextEncoder().encode('data: é€\n\n');
    answer = () => ({ status: 200, headers: SSE, chunks: [bytes.slice(0, 7), bytes.slice(7)], hold: true });
    const s = open();
    await tick();
    expect(s.events).toEqual([['message', 'é€', undefined]]);
    s.h.close();
  });
  it('a CRLF counts whole in the frame it ends (a frame exactly at its bound is kept)', async () => {
    page();
    // 'data: ' + 56 x + CRLF + CRLF = 6 + 56 + 2 + 2 = 66 > 64 with an id; without an id the bound is 256.
    const exact = 'id: 1\r\ndata: ' + 'x'.repeat(49) + '\r\n\r\n'; // 7 + 6 + 49 + 2 + 2 = 66 → over 64
    const fits = 'id: 2\r\ndata: ' + 'y'.repeat(47) + '\r\n\r\n'; // 64 → kept
    answer = () => ({ status: 200, headers: SSE, chunks: [exact, fits], hold: true });
    const s = open();
    await tick();
    expect(s.events).toEqual([['message', 'y'.repeat(47), '2']]);
    expect(s.states.filter((x) => x.state === 'gap').length).toBe(1);
    s.h.close();
  });
});

describe('stream: bounds and ends', () => {
  it('a frame over its bound is skipped and reported as a gap; reading goes on', async () => {
    page();
    const bigId = 'id: 1\ndata: ' + 'x'.repeat(60) + '\n\n';
    const bigNoId = 'data: ' + 'y'.repeat(300) + '\n\n';
    const okNoId = 'data: ' + 'z'.repeat(100) + '\n\n';
    answer = () => ({ status: 200, headers: SSE, chunks: [bigId, bigNoId, okNoId, 'id: 2\ndata: ok\n\n'], hold: true });
    const s = open();
    await tick();
    expect(s.events).toEqual([['message', 'z'.repeat(100), undefined], ['message', 'ok', '2']]);
    expect(s.states.filter((x) => x.state === 'gap')).toEqual([{ state: 'gap', reason: 'frame_too_large' }, { state: 'gap', reason: 'frame_too_large' }]);
    expect(s.closed()).toEqual([]);
    s.h.close();
  });
  it('the total budget closes the stream: closed budget, nothing after it, no reconnect', async () => {
    page();
    const frame = 'data: ' + 'q'.repeat(90) + '\n\n';
    answer = () => ({ status: 200, headers: SSE, chunks: Array(60).fill(frame), hold: true });
    const s = open();
    await tick(30);
    expect(s.closed()).toEqual([{ state: 'closed', reason: 'budget' }]);
    expect(s.events.length).toBeLessThan(4096 / 98);
    expect(reqs.length).toBe(1);
    expect(reqs[0]!.init.signal!.aborted).toBe(true);
    expect(streamCount()).toBe(0);
  });
  it('the server ends the stream: closed server; nothing opens again', async () => {
    page();
    answer = () => ({ status: 200, headers: SSE, chunks: ['data: a\n\n'] });
    const s = open();
    await tick(20);
    expect(s.events.length).toBe(1);
    expect(s.closed()).toEqual([{ state: 'closed', reason: 'server' }]);
    await tick(20);
    expect(reqs.length).toBe(1);
  });
  it('an error answer on open: error with status, code and Retry-After, then closed server (401/403: denied)', async () => {
    page();
    answer = () => ({ status: 503, body: '{"code":"agent_starting"}', headers: { 'retry-after': '4' } });
    const s = open();
    await tick();
    expect(s.states).toEqual([{ state: 'error', status: 503, code: 'agent_starting', retryAfterMs: 4000, retryAfter: 4 }, { state: 'closed', reason: 'server' }]);
    page();
    answer = () => ({ status: 403, body: '{"code":"forbidden"}' });
    const t = open();
    await tick();
    expect(t.closed()).toEqual([{ state: 'closed', reason: 'denied' }]);
  });
  it('an error body that is not JSON, or too long a code, gives code null', async () => {
    page();
    answer = () => ({ status: 500, body: 'oops' });
    const s = open();
    await tick();
    expect(s.states[0]).toMatchObject({ state: 'error', status: 500, code: null });
    page();
    answer = () => ({ status: 500, body: JSON.stringify({ code: 'x'.repeat(65) }) });
    const t = open();
    await tick();
    expect(t.states[0]).toMatchObject({ code: null });
  });
  it('no answer: closed network; a redirect or a non-SSE answer: error then closed server', async () => {
    page();
    answer = () => ({ fail: 'network' });
    const s = open();
    await tick();
    expect(s.states).toEqual([{ state: 'closed', reason: 'network' }]);
    page();
    answer = () => ({ redirect: true });
    const r = open();
    await tick();
    expect(r.states[0]).toMatchObject({ state: 'error', code: 'redirected' });
    page();
    answer = () => ({ status: 200, body: '{}' });
    const n = open();
    await tick();
    expect(n.states).toEqual([{ state: 'error', status: 200, code: 'NOT_SSE', retryAfterMs: null, retryAfter: null }, { state: 'closed', reason: 'server' }]);
  });
  for (const how of ['close', 'signal', 'account'] as const) {
    it(`${how} closes with aborted, once`, async () => {
      page();
      answer = () => ({ status: 200, headers: SSE, hold: true });
      const ac = new AbortController();
      const s = open({ signal: ac.signal });
      await tick();
      if (how === 'close') s.h.close(); else if (how === 'signal') ac.abort(); else endAccount('account');
      await tick();
      expect(s.closed()).toEqual([{ state: 'closed', reason: 'aborted' }]);
      expect(reqs[0]!.init.signal!.aborted).toBe(true);
      expect(streamCount()).toBe(0);
      s.h.close();
      expect(s.closed().length).toBe(1);
    });
  }
  it('hidden for 60 s closes with hidden; shown again before that keeps it', async () => {
    page();
    answer = () => ({ status: 200, headers: SSE, hold: true });
    const s = open();
    await tick();
    vi.useFakeTimers();
    let vis: DocumentVisibilityState = 'hidden';
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => vis);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(30000);
    vis = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(60000);
    expect(s.closed()).toEqual([]);
    vis = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(60000);
    expect(s.closed()).toEqual([{ state: 'closed', reason: 'hidden' }]);
    spy.mockRestore();
  });
  it('an event that arrives after the context died is not delivered (closed aborted)', async () => {
    page();
    const ctx = capture(TARGET);
    answer = () => ({ status: 200, headers: SSE, chunks: ['data: one\n\n'], hold: true });
    const s = open({ ctx });
    localStorage.clear(); // the session goes without a teardown yet
    await tick();
    expect(s.events).toEqual([]);
    expect(s.closed()).toEqual([{ state: 'closed', reason: 'aborted' }]);
  });
  it('a context that dies inside a read: the frames after it in that read are not delivered', async () => {
    page();
    const ctx = capture(TARGET);
    answer = () => ({ status: 200, headers: SSE, chunks: ['data: one\n\ndata: two\n\n'], hold: true });
    const seen: string[] = [];
    stream(botStream, { params: { id: 'b1' }, target: TARGET, realm: R1, ctx, onEvent: (_n, d) => { seen.push(d); localStorage.clear(); } });
    await tick();
    expect(seen).toEqual(['one']);
  });
  it('a handler that throws breaks neither the stream nor the order', async () => {
    page();
    answer = () => ({ status: 200, headers: SSE, chunks: ['data: 1\n\ndata: 2\n\n'], hold: true });
    const seen: string[] = [];
    const h = stream(botStream, { params: { id: 'b1' }, target: TARGET, realm: R1, onEvent: (_n, d) => { seen.push(d); throw new Error('x'); } });
    await tick();
    expect(seen).toEqual(['1', '2']);
    h.close();
  });
});

// ---- version ----
describe('version', () => {
  const ans = {
    api_version: '1.4.0', build_version: 'x', pinned_realm: null,
    capabilities: [{ name: 'agent_version', supported: true, available: true }, { name: 'bot_voice_check', supported: true, available: false }, { name: 'BAD NAME', supported: true, available: true }, 'junk'],
  };
  it('a fresh GET /version every call, parsed; credentials include, no realm', async () => {
    page();
    answer = () => ({ status: 200, body: JSON.stringify(ans) });
    expect(await version(TARGET)).toEqual({ api_version: '1.4.0', supported: ['agent_version', 'bot_voice_check'], available: ['agent_version'], pinned_realm: null });
    await version(TARGET);
    expect(reqs.map((r) => r.url)).toEqual([`${AGENT}/version`, `${AGENT}/version`]);
    expect(reqs[0]!.init.credentials).toBe('include');
  });
  it('an old agent: empty lists; a malformed pin is null; a realm pin is kept', async () => {
    page();
    answer = () => ({ status: 200, body: JSON.stringify({ api_version: '1.0.0', pinned_realm: 'not-a-realm' }) });
    expect(await version(TARGET)).toEqual({ api_version: '1.0.0', supported: [], available: [], pinned_realm: null });
    answer = () => ({ status: 200, body: JSON.stringify({ pinned_realm: R1 }) });
    expect((await version(TARGET)).pinned_realm).toBe(R1);
  });
  it('an answer after the context died is stale', async () => {
    page();
    answer = () => ({ status: 200, chunks: [JSON.stringify(ans)], hold: true });
    const v = settled(version(TARGET));
    await tick();
    bump('switch');
    reqs[0]!.release();
    const r = await v;
    expect(r.e.kind).toBe('aborted'); // a generation move aborts a dead call in flight
  });
});

// ---- download / save ----
const EXPORT_PATH = '/_logs' + '/export';
const exportRoute = defineRoute({ method: 'GET', path: EXPORT_PATH, scope: 'kit', kit: 'logs', index: 1, query: ['format'], maxBytes: 64 });
describe('download and save', () => {
  const o = (x: Record<string, unknown> = {}) => ({ target: TARGET, index: 1, maxBytes: 32, ...x }) as Parameters<typeof download>[1];
  it("an agent realm:'none' route downloads with no realm (the selected one is not forced on it)", async () => {
    page();
    answer = () => ({ status: 200, body: 'x', headers: { 'content-type': 'text/plain' } });
    const agentExport = defineRoute({ method: 'GET', path: '/logs/export', scope: 'agent', realm: 'none', maxBytes: 64 });
    const d = await download(agentExport, { target: TARGET, maxBytes: 32 } as Parameters<typeof download>[1]);
    expect(d.bytes).toBe(1);
    expect(reqs[0]!.url).not.toContain('realm=');
  });
  it('the kit index defaults to the declared one', async () => {
    page();
    answer = () => ({ status: 200, body: 'y', headers: { 'content-type': 'text/plain' } });
    const d = await download(exportRoute, { target: TARGET, maxBytes: 32 } as Parameters<typeof download>[1]);
    expect(d.bytes).toBe(1);
  });
  it('resolves the bytes as a Blob within maxBytes', async () => {
    page();
    answer = () => ({ status: 200, body: 'line1\nline2\n', headers: { 'content-type': 'application/x-ndjson' } });
    const d = await download(exportRoute, o({ query: { format: 'ndjson' } }));
    expect(d.bytes).toBe(12);
    expect(await d.parts[0]!.text()).toBe('line1\nline2\n');
    expect(reqs[0]!.url).toBe(kitHost('logs', 1) + EXPORT_PATH + '?format=ndjson');
  });
  it('maxBytes is required and bounded by the route; over it is too_large', async () => {
    page();
    expect((await settled(download(exportRoute, o({ maxBytes: undefined })))).e.code).toBe('MAXBYTES_INVALID');
    expect((await settled(download(exportRoute, o({ maxBytes: 128 })))).e.code).toBe('MAXBYTES_INVALID');
    answer = () => ({ status: 200, body: 'x'.repeat(40) });
    expect((await settled(download(exportRoute, o()))).e.kind).toBe('too_large');
  });
  it('validateEnd sees the tail; anything but true gives too_large', async () => {
    page();
    answer = () => ({ status: 200, body: 'a\nb\n' });
    let tail = '';
    const ok = await download(exportRoute, o({ validateEnd: (b: Uint8Array) => { tail = new TextDecoder().decode(b); return true; } }));
    expect([tail, ok.bytes]).toEqual(['a\nb\n', 4]);
    expect((await settled(download(exportRoute, o({ validateEnd: () => 'yes' })))).e.kind).toBe('too_large');
    expect((await settled(download(exportRoute, o({ validateEnd: () => { throw new Error('x'); } })))).e.kind).toBe('too_large');
  });
  it('an error answer keeps the rejection shape', async () => {
    page();
    answer = () => ({ status: 404, body: JSON.stringify({ code: 'not_found' }) });
    const r = await settled(download(exportRoute, o()));
    expect([r.e.kind, r.e.code, r.e.status]).toEqual(['refused', 'not_found', 404]);
  });
  it('save: a sanitised name, an object URL, refused over maxBytes', () => {
    page();
    const clicks: Array<{ download: string; href: string }> = [];
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { clicks.push({ download: this.download, href: this.href }); };
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = () => 'blob:x';
    try {
      const parts = [new Blob(['abc']), 'de'];
      expect(save('../../etc/pass wd<script>.ndjson', parts, { maxBytes: 10 })).toEqual({ ok: true, name: 'etcpass wdscript.ndjson', bytes: 5 });
      expect(clicks).toEqual([{ download: 'etcpass wdscript.ndjson', href: 'blob:x' }]);
      expect(document.body.querySelectorAll('a').length).toBe(0);
      expect(save('a', parts, { maxBytes: 4 })).toEqual({ refused: 'TOO_LARGE' });
      expect(save('a', parts, {})).toEqual({ refused: 'MAXBYTES_INVALID' });
      expect((save('...', [], { maxBytes: 1 }) as { name: string }).name).toBe('download');
      expect((save('x'.repeat(300), [], { maxBytes: 1 }) as { name: string }).name.length).toBe(120);
      expect(clicks.length).toBe(3);
    } finally {
      HTMLAnchorElement.prototype.click = realClick;
      URL.createObjectURL = realCreate;
    }
  });
});

// ---- run ----
const runPost = defineRoute({ method: 'POST', path: '/', scope: 'kit', kit: 'exec', index: 1, run: true });
const runGet = defineRoute({ method: 'GET', path: '/', scope: 'kit', kit: 'exec', index: 1, run: true });
const health = defineRoute({ method: 'GET', path: '/api/v1/exec/health', scope: 'kit', kit: 'exec', index: 1 });
describe('run', () => {
  it('any HTTP answer resolves {status, body text, executionId, headers, size}; exec-1 host, credentials omit', async () => {
    page();
    answer = () => ({ status: 500, body: 'boom', headers: { 'content-type': 'text/plain', 'x-execution-id': 'ex_1' } });
    expect(await run(runPost, TARGET, '/my/route', { method: 'POST', body: [1, 2], query: { a: 'b c' } })).toEqual({
      status: 500, body: 'boom', executionId: 'ex_1', headers: [['content-type', 'text/plain'], ['x-execution-id', 'ex_1']], size: 4,
    });
    expect(reqs[0]!.url).toBe(kitHost('exec', 1) + '/my/route?a=b%20c');
    expect(reqs[0]!.init.credentials).toBe('omit');
    expect(reqs[0]!.init.body).toBe('[1,2]');
  });
  it('refused unsent: /api/v1, a path that normalises, a body over 1 MiB, a route not run, a method other than the route\'s, an unknown option, a bad header', async () => {
    page();
    const cases: Array<[typeof runGet, string, Record<string, unknown>, string]> = [
      [runGet, '/api/v1/exec/health', {}, 'PATH_INVALID'],
      [runGet, '/API/V1/x', {}, 'PATH_INVALID'],
      [runGet, '/a/../b', {}, 'PATH_INVALID'],
      [runGet, '/a//b', {}, 'PATH_INVALID'],
      [runGet, '/a%2fb', {}, 'PATH_INVALID'],
      [runPost, '/a', { method: 'POST', body: 'x'.repeat((1 << 20) + 1) }, 'too_large'],
      [health, '/a', {}, 'ROUTE_NOT_ALLOWED'],
      [runGet, '/a', { method: 'PUT' }, 'ROUTE_NOT_ALLOWED'],
      [runGet, '/a', { header: {} }, 'OPTION_UNKNOWN'],
      [runGet, '/a', { headers: { Cookie: 'x' } }, 'HEADER_NOT_ALLOWED'],
    ];
    for (const [route, path, o, code] of cases) {
      const r = await settled(run(route, TARGET, path, o as never));
      expect([path, r.e.code, r.e.notSent]).toEqual([path, code, true]);
    }
    expect(reqs.length).toBe(0);
  });
  it('framed: refused unsent', async () => {
    page({ framed: true });
    expect((await settled(run(runGet, TARGET, '/a'))).e.code).toBe('FRAMED_ACTION_REFUSED');
    expect(reqs.length).toBe(0);
    env.framed = false;
  });
  it('a run of another Exec folder goes to that folder; out of range, or on a one-folder route, it is refused unsent', async () => {
    const anyFolder = defineRoute({ method: 'GET', path: '/', scope: 'kit', kit: 'exec', index: (n: number) => Number.isInteger(n) && n >= 1 && n <= 9999, run: true });
    page();
    answer = () => ({ status: 200, body: 'ok' });
    await run(anyFolder, TARGET, '/r', { index: 7 });
    expect(reqs.map((r) => r.url)).toEqual([kitHost('exec', 7) + '/r']);
    for (const [route, o] of [[anyFolder, {}], [anyFolder, { index: 0 }], [anyFolder, { index: 10000 }], [runGet, { index: 2 }]] as const) {
      expect((await settled(run(route, TARGET, '/r', o as never))).e).toMatchObject({ code: 'ROUTE_NOT_ALLOWED', notSent: true });
    }
    expect(reqs.length).toBe(1);
  });
  it('a run route is reachable only through run()', async () => {
    page();
    expect((await settled(api(runPost as never, { body: {} as never }))).e).toMatchObject({ kind: 'not_sent', code: 'ROUTE_NOT_ALLOWED' });
    expect(reqs.length).toBe(0);
  });
  it('the answer is capped at 256 KiB, an odd X-Execution-Id is null, nothing is retried', async () => {
    page();
    answer = () => ({ status: 200, body: 'x'.repeat(262145) });
    expect((await settled(run(runGet, TARGET, '/big'))).e.kind).toBe('too_large');
    answer = () => ({ status: 200, body: 'ok', headers: { 'x-execution-id': 'a b' } });
    expect((await run(runGet, TARGET, '/r')).executionId).toBeNull();
    answer = () => ({ fail: 'network' });
    await settled(run(runPost, TARGET, '/r', { method: 'POST', body: {} }));
    expect(reqs.length).toBe(3);
  });
  it('headers: the answer\'s readable headers as fetch gives them (names lowercase, sorted), frozen; size: the body\'s bytes, not its characters', async () => {
    page();
    answer = () => ({ status: 200, body: 'h\u00e9 \u{1F600}', headers: { 'X-B': '2', 'content-type': 'text/plain; charset=utf-8' } });
    const r = await run(runGet, TARGET, '/r');
    expect(r.headers).toEqual([['content-type', 'text/plain; charset=utf-8'], ['x-b', '2']]);
    expect(r.size).toBe(8);
    expect(Object.isFrozen(r.headers) && r.headers.every((h) => Object.isFrozen(h))).toBe(true);
    answer = () => ({ status: 200, body: '' });
    expect((await run(runGet, TARGET, '/r')).size).toBe(0);
  });
  it('an answer after the context died is stale', async () => {
    page();
    answer = () => ({ status: 200, chunks: ['ok'], hold: true });
    const p = settled(run(runGet, TARGET, '/r'));
    await tick();
    localStorage.clear(); // the session goes without a generation move: the answer arrives and is dropped
    reqs[0]!.release();
    expect((await p).e.kind).toBe('stale');
  });
});

describe('run headers', () => {
  it('a run sends the caller headers (Authorization included), preflighted; the plan never shows them', async () => {
    page();
    answer = () => ({ status: 200, body: 'ok' });
    await run(runPost, TARGET, '/hook', { method: 'POST', body: {}, headers: { Authorization: 'Bearer s3cret', 'X-Custom': 'v' } });
    const h = reqs[0]!.init.headers as Record<string, string>;
    expect([h.Authorization, h['X-Custom']]).toEqual(['Bearer s3cret', 'v']);
  });
  for (const [label, hdrs] of [
    ['a cookie', { Cookie: 'a=b' }], ['host', { Host: 'x' }], ['origin', { Origin: 'x' }], ['referer', { Referer: 'x' }], ['forwarded', { Forwarded: 'x' }],
    ['accept', { Accept: 'x' }], ['content-type', { 'Content-Type': 'x' }], ['an idempotency key', { 'Idempotency-Key': 'x' }], ['x-idempotency-key', { 'X-Idempotency-Key': 'x' }],
    ['x-hoody-*', { 'X-Hoody-Thing': 'x' }], ['x-forwarded-*', { 'X-Forwarded-For': 'x' }], ['proxy-*', { 'Proxy-Authorization': 'x' }], ['sec-*', { 'Sec-Fetch-Site': 'x' }],
    ['a bad name', { 'a b': 'x' }], ['a control in a value', { A: 'x\ny' }], ['a non-string value', { A: 1 }], ['the same name twice in any case', { A: '1', a: '2' }],
    ['33 names', Object.fromEntries(Array.from({ length: 33 }, (_, i) => ['H' + i, 'v']))], ['over 8 KiB', { A: 'x'.repeat(8200) }], ['an array', ['A']],
  ] as const) {
    it(`refuses ${label} unsent`, async () => {
      page();
      expect((await settled(run(runPost, TARGET, '/hook', { method: 'POST', headers: hdrs as never }))).e).toMatchObject({ code: 'HEADER_NOT_ALLOWED', notSent: true });
      expect(reqs.length).toBe(0);
    });
  }
  it('a throwing getter is a refusal, its error not kept', async () => {
    page();
    const hdrs = Object.defineProperty({}, 'A', { enumerable: true, get() { throw new Error('secret-in-error'); } });
    const r = await settled(run(runPost, TARGET, '/hook', { method: 'POST', headers: hdrs as never }));
    expect(r.e.code).toBe('HEADER_NOT_ALLOWED');
    expect(JSON.stringify(r.e)).not.toContain('secret-in-error');
    const o = Object.defineProperty({ method: 'POST' }, 'headers', { enumerable: true, get() { throw new Error('x'); } });
    expect((await settled(run(runPost, TARGET, '/hook', o as never))).e.code).toBe('HEADER_NOT_ALLOWED');
  });
});

// ---- store ----
describe('store', () => {
  const REG: Record<string, { area: string; purge: boolean }> = {
    hub_apps_recent: { area: 'local', purge: true }, hub_logs_view: { area: 'local', purge: true },
    hub_scripts_draft: { area: 'session', purge: true }, hub_bots_hide_tasks: { area: 'local', purge: true },
    hub_kept_view: { area: 'local', purge: false },
  };
  function withRegistry() {
    page();
    installShared({ ...shared(), authStorageEntry: (area: string, k: string) => (REG[k] && REG[k]!.area === area ? { area, key: k, purge: REG[k]!.purge } : null) } as never);
  }
  const apps = () => partitioned('hub_apps_recent', { scope: 'account', area: 'local', purge: true });
  it('an unregistered key, a wrong area, a wrong purge flag or an unknown scope throws STORE_UNREGISTERED', () => {
    withRegistry();
    const bad: Array<[string, Record<string, unknown>]> = [
      ['hub_unknown', { scope: 'account', area: 'local', purge: true }], ['hub_apps_recent', { scope: 'account', area: 'session', purge: true }],
      ['hub_apps_recent', { scope: 'account', area: 'local', purge: false }], ['hub_apps_recent', { scope: 'realm', area: 'local', purge: true }],
    ];
    for (const [k, o] of bad) {
      let e: { code?: string } | null = null;
      try { partitioned(k, o as never); } catch (x) { e = x as { code?: string }; }
      expect(e && e.code).toBe('STORE_UNREGISTERED');
    }
    expect(localStorage.getItem('hub_apps_recent')).toBeNull();
  });
  it('account: one value per shown account in the {v:1, a:{uid: value}} layout', () => {
    withRegistry();
    const s = apps();
    expect(s.get()).toBeNull();
    expect(s.set({ list: ['a'] })).toBe(true);
    expect(s.get()).toEqual({ list: ['a'] });
    expect(JSON.parse(localStorage.getItem('hub_apps_recent')!)).toEqual({ v: 1, a: { [UID]: { list: ['a'] } } });
    setIdentity({ id: 'u2', banned: false });
    expect(s.get()).toBeNull();
    s.set({ list: ['b'] });
    expect(JSON.parse(localStorage.getItem('hub_apps_recent')!).a).toEqual({ [UID]: { list: ['a'] }, u2: { list: ['b'] } });
  });
  it('account+realm / account+computer: one value per part; a missing or malformed part reads and writes nothing', () => {
    withRegistry();
    const s = partitioned('hub_logs_view', { scope: 'account+realm', area: 'local', purge: true });
    expect(s.set({ q: 1 }, 'r1')).toBe(true);
    expect(s.set({ q: 2 }, 'r2')).toBe(true);
    expect([s.get('r1'), s.get('r2'), s.get()]).toEqual([{ q: 1 }, { q: 2 }, null]);
    expect(s.set({ q: 3 })).toBe(false);
    expect(s.set({ q: 3 }, 'a b')).toBe(false);
    expect(s.remove('r1')).toBe(true);
    expect([s.get('r1'), s.get('r2')]).toEqual([null, { q: 2 }]);
  });
  it('the newest 8 accounts are kept; writing again makes an account the newest', () => {
    withRegistry();
    for (let i = 0; i < 10; i++) { setIdentity({ id: 'acct' + i, banned: false }); apps().set(i); }
    expect(Object.keys(JSON.parse(localStorage.getItem('hub_apps_recent')!).a)).toEqual(['acct2', 'acct3', 'acct4', 'acct5', 'acct6', 'acct7', 'acct8', 'acct9']);
    withRegistry();
    for (const a of ['a', 'b', 'a']) { setIdentity({ id: a, banned: false }); apps().set(a); }
    expect(Object.keys(JSON.parse(localStorage.getItem('hub_apps_recent')!).a)).toEqual(['b', 'a']);
  });
  it('the newest 32 parts are kept', () => {
    withRegistry();
    const s = partitioned('hub_logs_view', { scope: 'account+realm', area: 'local', purge: true });
    for (let i = 0; i < 34; i++) s.set(i, 'p' + i);
    expect([s.get('p0'), s.get('p1'), s.get('p2'), s.get('p33')]).toEqual([null, null, 2, 33]);
  });
  it('the session area uses sessionStorage', () => {
    withRegistry();
    partitioned('hub_scripts_draft', { scope: 'account+computer', area: 'session', purge: true }).set('x', 'c1');
    expect(sessionStorage.getItem('hub_scripts_draft')).not.toBeNull();
    expect(localStorage.getItem('hub_scripts_draft')).toBeNull();
  });
  it('a value over 64 KiB as UTF-8, or one that does not serialise, is refused; nothing is written', () => {
    withRegistry();
    expect(apps().set('x'.repeat(70000))).toBe(false);
    expect(apps().set('é'.repeat(33000))).toBe(false); // 66 KB as UTF-8, 33 K characters
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(apps().set(loop)).toBe(false);
    expect(localStorage.getItem('hub_apps_recent')).toBeNull();
  });
  it('Board: a stored value that is not this layout is never read and never deleted by a read; a write replaces it', () => {
    withRegistry();
    const evil = JSON.stringify({ [UID]: { list: ['evil'] } });
    localStorage.setItem('hub_apps_recent', evil);
    expect(apps().get()).toBeNull();
    expect(apps().read()).toEqual({ value: null, reset: 'foreign' });
    expect(localStorage.getItem('hub_apps_recent')).toBe(evil);
    localStorage.setItem('hub_apps_recent', 'not json');
    expect(apps().get()).toBeNull();
    expect(localStorage.getItem('hub_apps_recent')).toBe('not json');
    expect(apps().put({ list: ['a'] })).toEqual({ ok: true, evicted: { accounts: 0, parts: 0 }, replacedForeign: true });
    expect(JSON.parse(localStorage.getItem('hub_apps_recent')!)).toEqual({ v: 1, a: { [UID]: { list: ['a'] } } });
  });
  it('Board: a malformed entry reads as a reset; other accounts\' entries stay byte for byte, also after this account writes', () => {
    withRegistry();
    const s = partitioned('hub_kept_view', { scope: 'account+realm', area: 'local', purge: false });
    localStorage.setItem('hub_kept_view', JSON.stringify({ v: 1, a: { [UID]: 'broken', other: { r1: { b: 1 } }, odd: 42 } }));
    expect(s.read('r1')).toEqual({ value: null, reset: 'malformed' });
    expect(JSON.parse(localStorage.getItem('hub_kept_view')!).a.other).toEqual({ r1: { b: 1 } });
    expect(s.set({ b: 2 }, 'r1')).toBe(true);
    const a = JSON.parse(localStorage.getItem('hub_kept_view')!).a;
    expect(a.other).toEqual({ r1: { b: 1 } });
    expect(a.odd).toBe(42);
    expect(a[UID]).toEqual({ r1: { b: 2 } });
  });
  it('Board: an oversized stored value reads as a reset (the notice flag); nothing is deleted', () => {
    withRegistry();
    const big = 'x'.repeat(70000);
    localStorage.setItem('hub_kept_view', JSON.stringify({ v: 1, a: { [UID]: { r1: big } } }));
    const s = partitioned('hub_kept_view', { scope: 'account+realm', area: 'local', purge: false });
    expect(s.read('r1')).toEqual({ value: null, reset: 'oversized' });
    expect(s.get('r1')).toBeNull();
    expect(JSON.parse(localStorage.getItem('hub_kept_view')!).a[UID].r1).toBe(big);
    expect(s.read('r2')).toEqual({ value: null, reset: null });
  });
  it('Board: a key kept at sign-out keeps 16 accounts and 64 parts, evicting the least recently written, and reports it', () => {
    withRegistry();
    const s = () => partitioned('hub_kept_view', { scope: 'account+realm', area: 'local', purge: false });
    for (let i = 0; i < 16; i++) { setIdentity({ id: 'acct' + i, banned: false }); expect(s().put(i, 'r').evicted).toEqual({ accounts: 0, parts: 0 }); }
    setIdentity({ id: 'acct16', banned: false });
    expect(s().put(16, 'r')).toEqual({ ok: true, evicted: { accounts: 1, parts: 0 }, replacedForeign: false });
    expect(Object.keys(JSON.parse(localStorage.getItem('hub_kept_view')!).a)).not.toContain('acct0');
    // 'r' plus p0..p62 fill the 64 parts; p63 evicts the least recently written, 'r'.
    for (let i = 0; i < 63; i++) expect(s().put(i, 'p' + i).evicted.parts).toBe(0);
    expect(s().put(63, 'p63').evicted).toEqual({ accounts: 0, parts: 1 });
    expect(s().get('r')).toBeNull();
    expect(s().get('p1')).toBe(1);
  });
  it('a storage that throws reads as null and writes nothing, without throwing', () => {
    withRegistry();
    const s = apps();
    vi.stubGlobal('localStorage', { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } });
    try {
      expect(s.get()).toBeNull();
      expect(s.set({ a: 1 })).toBe(false);
      expect(s.remove()).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });
  it('no account: nothing read, nothing written', () => {
    withRegistry();
    localStorage.removeItem('access_token');
    setIdentity(null);
    const s = apps();
    expect(s.set(1)).toBe(false);
    expect(s.get()).toBeNull();
  });
  it('a layout newer than v1 (a newer deploy\'s) reads as reset "newer"; put and remove leave its bytes alone', () => {
    withRegistry();
    const s = partitioned('hub_kept_view', { scope: 'account+realm', area: 'local', purge: false });
    const newer = JSON.stringify({ v: 2, a: { other: { r1: { b: 1 } } }, extra: [1] });
    localStorage.setItem('hub_kept_view', newer);
    expect(s.read('r1')).toEqual({ value: null, reset: 'newer' });
    expect(s.put({ b: 2 }, 'r1')).toEqual({ ok: false, evicted: { accounts: 0, parts: 0 }, replacedForeign: false });
    expect(s.set({ b: 2 }, 'r1')).toBe(false);
    expect(s.remove('r1')).toBe(false);
    expect(localStorage.getItem('hub_kept_view')).toBe(newer);
  });
  for (const going of ['logging out', 'account ended'] as const) {
    it(`while the shown account is going (${going}) a raw put/remove writes nothing; reads still work`, () => {
      withRegistry();
      const s = partitioned('hub_kept_view', { scope: 'account+realm', area: 'local', purge: false });
      expect(s.set({ b: 1 }, 'r1')).toBe(true);
      const before = localStorage.getItem('hub_kept_view');
      if (going === 'logging out') startLoggingOut(); else endAccount('account');
      const spy = vi.spyOn(localStorage, 'setItem');
      const rm = vi.spyOn(localStorage, 'removeItem');
      try {
        expect(s.put({ b: 2 }, 'r2')).toEqual({ ok: false, evicted: { accounts: 0, parts: 0 }, replacedForeign: false });
        expect(s.set({ b: 2 }, 'r1')).toBe(false);
        expect(s.remove('r1')).toBe(false);
        expect(store.set('hub_apps_recent', 'x')).toBe(false);
        expect(spy).not.toHaveBeenCalled();
        expect(rm).not.toHaveBeenCalled();
      } finally { spy.mockRestore(); rm.mockRestore(); }
      expect(localStorage.getItem('hub_kept_view')).toBe(before);
      expect(s.get('r1')).toEqual({ b: 1 });
    });
  }
  it('remove() refuses on a foreign layout (bytes stay); removing an absent part rewrites nothing', () => {
    withRegistry();
    const evil = JSON.stringify({ [UID]: { r1: 1 } });
    localStorage.setItem('hub_kept_view', evil);
    const s = partitioned('hub_kept_view', { scope: 'account+realm', area: 'local', purge: false });
    expect(s.remove('r1')).toBe(false);
    expect(localStorage.getItem('hub_kept_view')).toBe(evil);
    localStorage.removeItem('hub_kept_view');
    expect(s.set({ b: 1 }, 'r1')).toBe(true);
    const spy = vi.spyOn(localStorage, 'setItem');
    try {
      expect(s.remove('r2')).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
    expect(s.get('r1')).toEqual({ b: 1 });
  });
  it('a part or an account named __proto__ reads and writes nothing', () => {
    withRegistry();
    const s = partitioned('hub_kept_view', { scope: 'account+realm', area: 'local', purge: false });
    expect(s.set({ b: 1 }, '__proto__')).toBe(false);
    expect(s.read('__proto__')).toEqual({ value: null, reset: null });
    expect(localStorage.getItem('hub_kept_view')).toBeNull();
    setIdentity({ id: '__proto__', banned: false });
    expect(apps().set(1)).toBe(false);
    expect(localStorage.getItem('hub_apps_recent')).toBeNull();
  });
  it('the flat form: strings under a registered key, per account; an unregistered key throws', () => {
    withRegistry();
    expect(store.get('hub_bots_hide_tasks')).toBeNull();
    store.set('hub_bots_hide_tasks', '1');
    expect(store.get('hub_bots_hide_tasks')).toBe('1');
    setIdentity({ id: 'u2', banned: false });
    expect(store.get('hub_bots_hide_tasks')).toBeNull();
    expect(() => store.set('hub_nope', '1')).toThrow();
  });
  it('the real registry: hub_bots_hide_tasks is registered', () => {
    page();
    expect(() => store.set('hub_bots_hide_tasks', '1')).not.toThrow();
  });
});

// ---- readTri / update (one browser read, at most one write, no write after a failed read) ----
describe('store: readTri, update and the failed-read refusal', () => {
  afterEach(() => { jarArea = 'local'; });
  // The nine kinds of caller of partitioned(): every one keeps another account's value when its own read failed.
  const CALLERS: Array<[string, 'account' | 'account+realm' | 'account+computer', 'local' | 'session', string | undefined]> = [
    ['hub_ask_v1', 'account', 'local', undefined],
    ['hub_apps_recent_v2', 'account', 'local', undefined],
    ['hub_logs_v1', 'account+computer', 'local', 'c1'],
    ['hub_model_handoff_v1', 'account+computer', 'session', 'c1'],
    ['hub_boards_v1', 'account+realm', 'local', 'r1'],
    ['hub_sched_ui_v1', 'account', 'local', undefined],
    ['hub_home_v1', 'account', 'local', undefined],
    ['hub_homew_v1', 'account+realm', 'local', 'r1'],
    ['hub_openwith_v1', 'account+computer', 'local', 'c1'],
  ];
  let jarArea = 'local';
  const jarOf = (): Storage => (jarArea === 'session' ? sessionStorage : localStorage);
  const jar = (area: string) => (area === 'session' ? sessionStorage : localStorage);
  const open = (k: string, scope: 'account' | 'account+realm' | 'account+computer', area: 'local' | 'session') => partitioned(k, { scope, area } as never);
  const other = (part: string | undefined) => (part === undefined ? { v: 1, a: { u9: { keep: 'me' } } } : { v: 1, a: { u9: { [part]: { keep: 'me' } } } });

  it.each(CALLERS)('%s: put, set and remove after a browser read that threw write nothing and keep another account\'s value', (k, scope, area, part) => {
    page();
    jarArea = area;
    const seed = JSON.stringify(other(part));
    jar(area).setItem(k, seed);
    const s = open(k, scope, area);
    const get = vi.spyOn(jarOf(), 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const set = vi.spyOn(jarOf(), 'setItem');
    const drop = vi.spyOn(jarOf(), 'removeItem');
    try {
      expect(s.put({ mine: 1 }, part).ok).toBe(false);
      expect(s.set({ mine: 1 }, part)).toBe(false);
      expect(s.remove(part)).toBe(false);
      expect(set).not.toHaveBeenCalled();
      expect(drop).not.toHaveBeenCalled();
    } finally { get.mockRestore(); set.mockRestore(); drop.mockRestore(); }
    expect(jar(area).getItem(k)).toBe(seed);
  });

  it('readTri: ok with the account, missing with the account, unreadable for a throw, no account, a bad part, foreign, newer and oversized', () => {
    page();
    const s = open('hub_apps_recent_v2', 'account', 'local');
    expect(s.readTri()).toEqual({ s: 'missing', acct: UID });
    s.set({ list: ['a'] });
    expect(s.readTri()).toEqual({ s: 'ok', v: { list: ['a'] }, acct: UID });
    localStorage.setItem('hub_apps_recent_v2', JSON.stringify({ v: 1, a: { u9: 1 } }));
    expect(s.readTri()).toEqual({ s: 'missing', acct: UID });
    for (const raw of ['{"x":1}', 'not json', JSON.stringify({ v: 2, a: {} })]) {
      localStorage.setItem('hub_apps_recent_v2', raw);
      expect(s.readTri()).toEqual({ s: 'unreadable' });
    }
    localStorage.setItem('hub_apps_recent_v2', JSON.stringify({ v: 1, a: { [UID]: 'x'.repeat(70000) } }));
    expect(s.readTri()).toEqual({ s: 'unreadable' });
    localStorage.removeItem('hub_apps_recent_v2');
    const get = vi.spyOn(jarOf(), 'getItem').mockImplementation(() => { throw new Error('denied'); });
    try { expect(s.readTri()).toEqual({ s: 'unreadable' }); } finally { get.mockRestore(); }
    const p = open('hub_logs_v1', 'account+computer', 'local');
    expect(p.readTri('bad part!')).toEqual({ s: 'unreadable' });
    expect(p.readTri('c1')).toEqual({ s: 'missing', acct: UID });
    setIdentity({ id: '__proto__', banned: false });
    expect(s.readTri()).toEqual({ s: 'unreadable' });
  });

  it('readTri makes exactly one browser read', () => {
    page();
    const s = open('hub_apps_recent_v2', 'account', 'local');
    s.set({ list: [] });
    const get = vi.spyOn(jarOf(), 'getItem');
    try { s.readTri(); expect(get).toHaveBeenCalledTimes(1); } finally { get.mockRestore(); }
  });

  it('update: one getItem and at most one write; fn sees ok or missing; other accounts stay as stored', () => {
    page();
    localStorage.setItem('hub_apps_recent_v2', JSON.stringify({ v: 1, a: { u9: { keep: 1 } } }));
    const s = open('hub_apps_recent_v2', 'account', 'local');
    const get = vi.spyOn(jarOf(), 'getItem'), set = vi.spyOn(jarOf(), 'setItem');
    try {
      const seen: unknown[] = [];
      expect(s.update((cur) => { seen.push(cur); return { set: { n: 1 } }; })).toBe('ok');
      expect(get).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledTimes(1);
      get.mockClear(); set.mockClear();
      expect(s.update((cur) => { seen.push(cur); return { set: { n: 2 } }; })).toBe('ok');
      expect(seen).toEqual([{ s: 'missing' }, { s: 'ok', v: { n: 1 } }]);
      get.mockClear(); set.mockClear();
      expect(s.update(() => null)).toBe('same');
      expect(get).toHaveBeenCalledTimes(1);
      expect(set).not.toHaveBeenCalled();
    } finally { get.mockRestore(); set.mockRestore(); }
    expect(JSON.parse(localStorage.getItem('hub_apps_recent_v2')!).a).toEqual({ u9: { keep: 1 }, [UID]: { n: 2 } });
    expect(s.update(() => ({ remove: true }))).toBe('ok');
    expect(JSON.parse(localStorage.getItem('hub_apps_recent_v2')!).a).toEqual({ u9: { keep: 1 } });
    expect(s.update(() => ({ remove: true }))).toBe('same');
  });

  it('update on a part touches only that part; an absent part is "same" for remove', () => {
    page();
    const s = open('hub_logs_v1', 'account+computer', 'local');
    expect(s.update(() => ({ set: { a: 1 } }), { part: 'c1' })).toBe('ok');
    expect(s.update(() => ({ set: { b: 1 } }), { part: 'c2' })).toBe('ok');
    expect(s.update(() => ({ remove: true }), { part: 'c3' })).toBe('same');
    expect(s.update(() => ({ remove: true }), { part: 'c1' })).toBe('ok');
    expect(s.readTri('c1')).toEqual({ s: 'missing', acct: UID });
    expect(s.readTri('c2')).toEqual({ s: 'ok', v: { b: 1 }, acct: UID });
    expect(s.update(() => ({ set: 1 }), { part: 'bad part!' })).toBe('unreadable');
  });

  it('update does not call fn and writes nothing when the read is unreadable (throw, foreign, newer, oversized)', () => {
    page();
    const s = open('hub_apps_recent_v2', 'account', 'local');
    const fn = vi.fn(() => ({ set: { n: 1 } }));
    const set = vi.spyOn(jarOf(), 'setItem');
    try {
      for (const raw of ['{"x":1}', JSON.stringify({ v: 2, a: {} }), JSON.stringify({ v: 1, a: { [UID]: 'x'.repeat(70000) } })]) {
        localStorage.setItem('hub_apps_recent_v2', raw);
        set.mockClear();
        expect(s.update(fn)).toBe('unreadable');
        expect(set).not.toHaveBeenCalled();
        expect(localStorage.getItem('hub_apps_recent_v2')).toBe(raw);
      }
      localStorage.removeItem('hub_apps_recent_v2');
      const get = vi.spyOn(jarOf(), 'getItem').mockImplementation(() => { throw new Error('denied'); });
      try { expect(s.update(fn)).toBe('unreadable'); } finally { get.mockRestore(); }
      expect(fn).not.toHaveBeenCalled();
    } finally { set.mockRestore(); }
  });

  it('update: keepOthers refuses a ninth account instead of evicting, an update of an existing account still works; without it the oldest goes', () => {
    page();
    const a: Record<string, unknown> = {};
    for (let i = 1; i <= 8; i++) a[`u${i}`] = { n: i };
    localStorage.setItem('hub_apps_recent_v2', JSON.stringify({ v: 1, a }));
    const s = open('hub_apps_recent_v2', 'account', 'local');
    const before = localStorage.getItem('hub_apps_recent_v2');
    expect(s.update(() => ({ set: { mine: 1 } }), { keepOthers: true })).toBe('full');
    expect(localStorage.getItem('hub_apps_recent_v2')).toBe(before);
    expect(s.update(() => ({ set: { mine: 1 } }))).toBe('ok');
    const after = JSON.parse(localStorage.getItem('hub_apps_recent_v2')!).a;
    expect(Object.keys(after)).toHaveLength(8);
    expect(after.u1).toBeUndefined();
    expect(s.update(() => ({ set: { mine: 2 } }), { keepOthers: true })).toBe('ok');
    expect(JSON.parse(localStorage.getItem('hub_apps_recent_v2')!).a[UID]).toEqual({ mine: 2 });
  });

  it('update: keepOthers never evicts from an already over-capacity document: replacing and removing refuse without writing', () => {
    page();
    const a: Record<string, unknown> = {};
    for (let i = 1; i <= 10; i++) a[`u${i}`] = { n: i };
    a[UID] = { mine: 0 };
    const seed = JSON.stringify({ v: 1, a });
    localStorage.setItem('hub_apps_recent_v2', seed);
    const s = open('hub_apps_recent_v2', 'account', 'local');
    expect(s.update(() => ({ set: { mine: 1 } }), { keepOthers: true })).toBe('full');
    expect(s.update(() => ({ remove: true }), { keepOthers: true })).toBe('full');
    expect(localStorage.getItem('hub_apps_recent_v2')).toBe(seed);
    // without keepOthers the oldest goes, as before
    expect(s.update(() => ({ set: { mine: 1 } }))).toBe('ok');
    expect(JSON.parse(localStorage.getItem('hub_apps_recent_v2')!).a.u1).toBeUndefined();
  });

  it('update: keepOthers never evicts a part of an account holding more parts than the cap', () => {
    page();
    const parts: Record<string, unknown> = {};
    for (let i = 0; i < 33; i++) parts[`c${i}`] = { n: i };
    const seed = JSON.stringify({ v: 1, a: { [UID]: parts } });
    localStorage.setItem('hub_logs_v1', seed);
    const p = open('hub_logs_v1', 'account+computer', 'local');
    expect(p.update(() => ({ set: { n: 99 } }), { part: 'c32', keepOthers: true })).toBe('full');
    expect(localStorage.getItem('hub_logs_v1')).toBe(seed);
    expect(p.update(() => ({ set: { n: 99 } }), { part: 'c32' })).toBe('ok');
    expect(JSON.parse(localStorage.getItem('hub_logs_v1')!).a[UID].c0).toBeUndefined();
  });

  it('update: a quota error is "full", another throw is "failed", a value over the cap or without JSON is "full", fn throwing is "failed"', () => {
    page();
    const s = open('hub_apps_recent_v2', 'account', 'local');
    const set = vi.spyOn(jarOf(), 'setItem');
    try {
      set.mockImplementationOnce(() => { throw new DOMException('quota', 'QuotaExceededError'); });
      expect(s.update(() => ({ set: { n: 1 } }))).toBe('full');
      set.mockImplementationOnce(() => { throw new Error('boom'); });
      expect(s.update(() => ({ set: { n: 1 } }))).toBe('failed');
    } finally { set.mockRestore(); }
    expect(s.update(() => ({ set: 'x'.repeat(70000) }))).toBe('full');
    expect(s.update(() => ({ set: undefined }))).toBe('full');
    expect(s.update(() => { throw new Error('fn'); })).toBe('failed');
    expect(localStorage.getItem('hub_apps_recent_v2')).toBeNull();
  });

  it('update refuses while the account is going', () => {
    page();
    const s = open('hub_apps_recent_v2', 'account', 'local');
    startLoggingOut();
    expect(s.update(() => ({ set: { n: 1 } }))).toBe('failed');
    expect(localStorage.getItem('hub_apps_recent_v2')).toBeNull();
  });
});

// ---- stage ----
const terminalCaps = defineRoute({ method: 'GET', path: '/api/v1/terminal/capabilities', scope: 'kit', kit: 'terminal', index: (n: number) => n >= 15001 && n <= 19999 });
describe('stage', () => {
  function openStage(extra: Record<string, unknown> = {}) {
    const closes: Array<[string, string]> = [];
    const h = stage({ route: terminalCaps, index: 15001, target: TARGET, back: 'Back to Claude Code', onClose: (r: string, c: string) => closes.push([r, c]), ...extra } as never);
    return { h, closes };
  }
  it('opens for the computer and program; back closes it once', () => {
    page();
    const s = openStage();
    expect(s.h).toMatchObject({ kit: 'terminal', index: 15001, label: 'Back to Claude Code', computer: { id: 'c1', project_id: 'p1', server_name: 'sv1' } });
    expect(currentStage()).toBe(s.h);
    s.h!.close('back');
    s.h!.close('closed');
    expect(s.closes).toEqual([['back', '']]);
    expect(currentStage()).toBeNull();
  });
  it('null without a matching route, an index outside it, a label, a live context, an unknown option, or framed', () => {
    page();
    expect(openStage({ route: health }).h).toBeNull();
    expect(openStage({ index: 0 }).h).toBeNull();
    expect(openStage({ back: '' }).h).toBeNull();
    expect(openStage({ url: 'https://x' }).h).toBeNull();
    const ctx = capture(TARGET);
    bump('switch');
    expect(openStage({ ctx }).h).toBeNull();
    page({ framed: true });
    expect(openStage().h).toBeNull();
    env.framed = false;
  });
  it('a second stage replaces the first; a realm switch or account change closes it (stale)', () => {
    page();
    const a = openStage();
    const b = openStage();
    expect(a.closes).toEqual([['replaced', '']]);
    bump('switch');
    expect(b.closes).toEqual([['stale', '']]);
    page();
    const c = openStage();
    endAccount('account');
    expect(c.closes).toEqual([['stale', '']]);
  });
  it('a view change with a live context keeps it; a failed view closes with its code', () => {
    page();
    const s = openStage();
    setView('bots');
    expect(s.h!.alive()).toBe(true);
    expect(s.closes).toEqual([]);
    s.h!.close('failed', 'HOST_UNEXPECTED');
    expect(s.closes).toEqual([['failed', 'HOST_UNEXPECTED']]);
  });
});

// ---- postBytes ----
describe('postBytes', () => {
  const WAV = ['audio/wav', 'audio/mpeg'];
  const speak = (x: Record<string, unknown> = {}) => postBytes(speechRoute, { body: { input: 'hello', voice: 'v1' }, target: TARGET, realm: R1, maxBytes: 64, accept: WAV, ...x } as Parameters<typeof postBytes>[1]);
  const audio = (body = 'RIFFdata', type = 'audio/wav') => () => ({ status: 200, body, headers: { 'content-type': type } });

  it('a bytes route is declared only as an agent POST with body keys and no other leg\'s flag', () => {
    const base = { method: 'POST', path: '/audio/x', scope: 'agent', realm: 'bot', body: ['input'], bytes: true } as const;
    expect(() => defineRoute(base)).not.toThrow();
    const bad: Array<Record<string, unknown>> = [
      { method: 'GET', body: undefined }, { method: 'PUT' }, { body: undefined }, { scope: 'kit', kit: 'exec', index: 0, realm: undefined },
      { idem: true }, { secret: true }, { ws: true }, { cwd: true }, { readsStatus: true }, { refuses: ['x'] }, { keepDetails: true },
      { cas: { via: 'body', keys: ['input'] } }, { unknownCodes: ['x'] }, { tickets: { journal: 'required' } }, { bytes: false },
    ];
    for (const b of bad) expect(() => defineRoute({ ...base, ...b } as Parameters<typeof defineRoute>[0]), JSON.stringify(b)).toThrow('ROUTE_INVALID');
  });
  it('POSTs the JSON body once to the agent and resolves {bytes, type}; the type is the media type alone', async () => {
    page();
    answer = audio('RIFFdata', 'Audio/WAV; rate=24000');
    const r = await speak();
    expect([new TextDecoder().decode(r.bytes), r.type]).toEqual(['RIFFdata', 'audio/wav']);
    expect(reqs.length).toBe(1);
    const q = reqs[0]!;
    expect(q.url).toBe(AGENT + '/audio/speech?realm=' + R1);
    expect([q.init.method, q.init.body, q.init.credentials, q.init.cache, q.init.redirect]).toEqual(['POST', '{"input":"hello","voice":"v1"}', 'include', 'no-store', 'manual']);
    expect((q.init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });
  it('maxBytes is required and bounded by the route; an answer over it is too_large, by Content-Length or while reading', async () => {
    page();
    for (const m of [undefined, 0, 1.5, 2 * 1024 * 1024 + 1]) expect((await settled(speak({ maxBytes: m }))).e.code, String(m)).toBe('MAXBYTES_INVALID');
    expect(reqs).toEqual([]);
    answer = () => ({ status: 200, body: 'x'.repeat(65), headers: { 'content-type': 'audio/wav' } });
    expect((await settled(speak())).e.kind).toBe('too_large');
    answer = () => ({ status: 200, chunks: ['x'.repeat(40), 'x'.repeat(40)], headers: { 'content-type': 'audio/wav' } });
    expect((await settled(speak())).e.kind).toBe('too_large');
  });
  it('accept is 1..8 audio media types, else ACCEPT_INVALID unsent', async () => {
    page();
    // eslint-disable-next-line no-sparse-arrays
    for (const a of [[], ['text/html'], ['audio/*'], ['AUDIO/WAV'], 'audio/wav', null, Array(9).fill('audio/wav'), [1], new Array<string>(1), ['audio/wav', , 'audio/mpeg']]) {
      const r = (await settled(speak({ accept: a }))).e;
      expect([r.kind, r.code, r.notSent], JSON.stringify(a)).toEqual(['not_sent', 'ACCEPT_INVALID', true]);
    }
    expect(reqs).toEqual([]);
  });
  it('an answer whose type is not accepted, or an empty one, is unavailable NOT_AUDIO', async () => {
    page();
    answer = audio('<html>', 'text/html');
    expect((await settled(speak())).e).toMatchObject({ kind: 'unavailable', code: 'NOT_AUDIO', status: 200 });
    answer = audio('ID3', 'audio/ogg');
    expect((await settled(speak())).e.code).toBe('NOT_AUDIO');
    answer = audio('', 'audio/wav');
    expect((await settled(speak())).e.code).toBe('NOT_AUDIO');
    answer = () => ({ status: 200, body: '{}' });
    expect((await settled(speak())).e.code).toBe('NOT_AUDIO');
  });
  it('an error answer is the usual envelope; nothing is retried', async () => {
    page();
    answer = () => ({ status: 413, body: JSON.stringify({ code: 'input_too_long', details: { limit: 182 } }) });
    expect((await settled(speak())).e).toMatchObject({ kind: 'refused', code: 'input_too_long', status: 413, details: { limit: 182 } });
    answer = () => ({ status: 429, body: JSON.stringify({ code: 'rate_limited' }), headers: { 'retry-after': '3' } });
    expect((await settled(speak())).e).toMatchObject({ kind: 'rate_limited', retryAfterMs: 3000 });
    answer = () => ({ status: 503, body: JSON.stringify({ code: 'tts_unavailable' }) });
    expect((await settled(speak())).e).toMatchObject({ kind: 'unavailable', code: 'tts_unavailable' });
    expect(reqs.length).toBe(3);
  });
  it('a lost answer is never retried and never reads as not sent: it may have run', async () => {
    page();
    answer = () => ({ fail: 'network' });
    const e = (await settled(speak())).e;
    expect([e.kind, e.notSent]).toEqual(['unreachable', undefined]);
    expect(reqs.length).toBe(1);
  });
  it('only a declared bytes route: other legs refuse speechRoute and postBytes refuses other routes, unsent', async () => {
    page();
    expect((await settled(api(speechRoute, { body: { input: 'x' }, target: TARGET, realm: R1 } as Parameters<typeof api>[1]))).e).toMatchObject({ kind: 'not_sent', code: 'ROUTE_NOT_ALLOWED' });
    expect((await settled(download(speechRoute, { target: TARGET, realm: R1, maxBytes: 8 } as Parameters<typeof download>[1]))).e.code).toBe('ROUTE_NOT_ALLOWED');
    const plain = defineRoute({ method: 'POST', path: '/audio/plain', scope: 'agent', realm: 'bot', body: ['input'] });
    expect((await settled(postBytes(plain, { body: { input: 'x' }, target: TARGET, realm: R1, maxBytes: 8, accept: WAV } as Parameters<typeof postBytes>[1]))).e.code).toBe('ROUTE_NOT_ALLOWED');
    expect((await settled(speak({ body: { input: 'x', response_format: 'mp3' } }))).e.code).toBe('ROUTE_BODY');
    expect(reqs).toEqual([]);
  });
  it('a framed page refuses it unsent', async () => {
    page({ framed: true });
    expect((await settled(speak())).e.code).toBe('FRAMED_ACTION_REFUSED');
    expect(reqs).toEqual([]);
    env.framed = false;
  });
  it('the caller\'s signal: before the send not_sent, after it aborted (it may have run)', async () => {
    page();
    const pre = new AbortController();
    pre.abort();
    expect((await settled(speak({ signal: pre.signal }))).e).toMatchObject({ kind: 'not_sent', notSent: true });
    expect(reqs).toEqual([]);
    answer = () => ({ status: 200, hold: true, headers: { 'content-type': 'audio/wav' } });
    const ac = new AbortController();
    const p = settled(speak({ signal: ac.signal }));
    await tick();
    ac.abort();
    const e = (await p).e;
    expect([e.kind, e.notSent]).toEqual(['aborted', undefined]);
  });
  it('a context that dies is stale: before the send unsent, while the answer is read the request is aborted', async () => {
    page();
    const ctx = capture(TARGET);
    bump('test');
    expect((await settled(speak({ ctx }))).e).toMatchObject({ kind: 'not_sent', stale: true });
    expect(reqs).toEqual([]);
    answer = () => ({ status: 200, hold: true, headers: { 'content-type': 'audio/wav' } });
    const p = settled(speak());
    await tick();
    bump('test');
    expect((await p).e).toMatchObject({ kind: 'stale', stale: true });
    expect(reqs[0]!.init.signal!.aborted).toBe(true);
  });
  it('a context that died with no notice (another session stored) drops an answer read after it: stale', async () => {
    page();
    answer = () => ({ status: 200, chunks: ['RIFF'], hold: true, headers: { 'content-type': 'audio/wav' } });
    const p = settled(speak());
    await tick();
    signIn(UID, 'sid0000000000002');
    reqs[0]!.release();
    const r = await p;
    expect([r.ok, r.e.kind]).toEqual([undefined, 'stale']);
  });
  it('sign-out started (no generation move) aborts the read at once and rejects stale; nothing is handed over', async () => {
    page();
    answer = () => ({ status: 200, chunks: ['RIFF'], hold: true, headers: { 'content-type': 'audio/wav' } });
    const p = settled(speak());
    await tick();
    startLoggingOut();
    const r = await p;
    expect([r.ok, r.e.kind]).toEqual([undefined, 'stale']);
    expect(reqs[0]!.init.signal!.aborted).toBe(true);
  });
});
