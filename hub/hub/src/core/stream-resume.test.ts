// stream-resume.ts: a stream that reconnects with backoff and resumes from the last frame id, on top of
// kit-io stream(). Red-first.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bump, capture } from './ctx';
import { defineRoute } from './routes';
import { installTransport, type Transport } from './transport';
import { streamCount } from './kit-io';
import { resumableStream, type ResumeInput, type ResumeState, type Resync } from './stream-resume';
import { boot, R1, TARGET } from './test/env';

const SSE = { 'content-type': 'text/event-stream' };

// ---- a fetch that streams a scripted answer per request ----
type Answer = { status?: number; headers?: Record<string, string>; body?: string; chunks?: string[]; hold?: boolean; fail?: 'network' };
type Req = { url: string; init: RequestInit };
let reqs: Req[] = [];
let script: Answer[] = [];
let fallback: Answer = { status: 200, headers: SSE, hold: true };
const fakeTransport: Transport = {
  hoody: () => Promise.reject(new Error('not used')),
  fetch(url, init) {
    reqs.push({ url, init });
    const a = script.length ? script.shift()! : fallback;
    if (a.fail) return Promise.reject(new TypeError('Failed to fetch'));
    const enc = new TextEncoder();
    const signal = init.signal;
    const body = new ReadableStream<Uint8Array>({
      async start(ctl) {
        signal?.addEventListener('abort', () => { try { ctl.error(new DOMException('aborted', 'AbortError')); } catch { /* closed */ } });
        for (const c of a.chunks ?? (a.body !== undefined ? [a.body] : [])) {
          if (signal?.aborted) return;
          ctl.enqueue(enc.encode(c));
          await Promise.resolve();
        }
        if (a.hold) return;
        try { ctl.close(); } catch { /* aborted */ }
      },
    });
    return Promise.resolve(new Response(body, { status: a.status ?? 200, headers: { 'content-type': 'application/json', ...(a.headers || {}) } }));
  },
};

const route = defineRoute({ method: 'GET', path: '/sessions/:id/stream', scope: 'agent', query: ['since', 'incarnation'], stream: { id: 4096, noId: 1024 }, maxBytes: 1 << 20, timeoutMs: 20000 });
const logRoute = defineRoute({ method: 'GET', path: '/logs/stream', scope: 'agent', query: ['since_seq'], stream: { id: 4096, noId: 1024 }, maxBytes: 1 << 20, timeoutMs: 20000 });
const tinyRoute = defineRoute({ method: 'GET', path: '/sessions/:id/stream', scope: 'agent', query: ['since', 'incarnation'], stream: { id: 256, noId: 256 }, maxBytes: 600, timeoutMs: 20000 });

const frame = (seq: number, inc = 'inc1', pad = 0) => `id: ${seq}\ndata: {"seq":${seq},"incarnation":"${inc}","p":"${'x'.repeat(pad)}"}\n\n`;
const queryOf = (r: Req) => Object.fromEntries(new URL(r.url).searchParams.entries());

function setup() {
  boot({ realm: R1 });
  reqs = [];
  script = [];
  fallback = { status: 200, headers: SSE, hold: true };
  installTransport(fakeTransport);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
}
function open(extra: Partial<ResumeInput> = {}, r = route) {
  const events: Array<[string, string, string | undefined]> = [], states: ResumeState[] = [], resyncs: Array<[Resync, unknown]> = [];
  const base: ResumeInput = {
    params: { id: 's1' }, target: TARGET, realm: R1,
    onEvent: (n, d, id) => events.push([n, d, id]),
    onState: (s) => states.push(s),
    onResync: (why, cur) => resyncs.push([why, cur]),
  };
  const h = resumableStream(r, { ...base, ...extra } as ResumeInput);
  return { h, events, states, resyncs, kinds: () => states.map((s) => s.state) };
}
const adv = (ms: number) => vi.advanceTimersByTimeAsync(ms);
afterEach(() => { installTransport(null); vi.useRealTimers(); });

describe('resumableStream: reconnect and resume', () => {
  it('a server end reconnects after 1 s with since = the last id and the incarnation; the gap is reported', async () => {
    setup();
    script = [{ status: 200, headers: SSE, chunks: [frame(1), frame(2)] }];
    const s = open();
    await adv(10);
    expect(s.events.map((e) => e[2])).toEqual(['1', '2']);
    expect(s.states.find((x) => x.state === 'reconnecting')).toMatchObject({ state: 'reconnecting', attempt: 1, inMs: 1000 });
    expect(reqs.length).toBe(1);
    await adv(980);
    expect(reqs.length).toBe(1);
    await adv(30);
    expect(reqs.length).toBe(2);
    expect(queryOf(reqs[1]!)).toMatchObject({ since: '2', incarnation: 'inc1' });
    expect(queryOf(reqs[0]!).since).toBeUndefined();
    expect(s.kinds().slice(-1)).toEqual(['open']);
    s.h.close();
  });
  it('failed opens back off 1, 2, 5, 10, 10 s', async () => {
    setup();
    fallback = { fail: 'network' };
    const s = open();
    const at: number[] = [];
    let t = 0;
    for (const due of [1000, 3000, 8000, 18000, 28000]) {
      await adv(due - 1 - t);
      at.push(reqs.length);
      await adv(2);
      t = due + 1;
    }
    expect(at).toEqual([1, 2, 3, 4, 5]);
    expect(reqs.length).toBe(6);
    s.h.close();
  });
  it('a delivered frame resets the backoff to the first step (the 10 s case is the named scenario below)', async () => {
    setup();
    script = [{ fail: 'network' }, { fail: 'network' }, { status: 200, headers: SSE, chunks: [frame(1)] }];
    const s = open();
    await adv(1000); await adv(2000);
    expect(reqs.length).toBe(3);
    await adv(1);
    const last = s.states.filter((x) => x.state === 'reconnecting').pop() as Extract<ResumeState, { state: 'reconnecting' }>;
    expect(last).toMatchObject({ attempt: 1, inMs: 1000 });
    s.h.close();
  });
  it('a 503 with Retry-After waits the longer of the two (the 429 case is the named scenario below)', async () => {
    setup();
    script = [{ status: 503, body: '{"code":"agent_starting"}', headers: { 'retry-after': '6' } }];
    const s = open();
    await adv(5900);
    expect(reqs.length).toBe(1);
    await adv(200);
    expect(reqs.length).toBe(2);
    expect(s.states.find((x) => x.state === 'reconnecting')).toMatchObject({ cause: 'status', status: 503, inMs: 6000 });
    s.h.close();
  });
  it('401, 403, 404 and 400 end it for good: closed, no request after (a redirect is the named scenario below)', async () => {
    for (const [status, reason] of [[401, 'denied'], [403, 'denied'], [404, 'failed'], [400, 'failed']] as const) {
      setup();
      script = [{ status, body: '{"code":"x"}' }];
      const s = open();
      await adv(60000);
      expect(reqs.length).toBe(1);
      expect(s.states.filter((x) => x.state === 'closed')).toEqual([expect.objectContaining({ state: 'closed', reason, status })]);
      expect(s.states.some((x) => x.state === 'reconnecting')).toBe(false);
      installTransport(null); vi.useRealTimers();
    }
  });
  it('the byte budget cut reconnects at once with the cursor', async () => {
    setup();
    script = [{ status: 200, headers: SSE, chunks: [frame(1, 'i', 150), frame(2, 'i', 150), frame(3, 'i', 150), frame(4, 'i', 150), frame(5, 'i', 150)], hold: true }];
    const s = open({}, tinyRoute);
    await adv(5);
    expect(reqs.length).toBe(2);
    expect(queryOf(reqs[1]!).since).toBe(s.events.at(-1)![2]);
    expect(s.states.some((x) => x.state === 'closed')).toBe(false);
    s.h.close();
  });
  it('a start cursor and custom key names ride the first request (since_seq for the log tail)', async () => {
    setup();
    const s = open({ params: undefined, from: { since: '41' }, keys: { since: 'since_seq' } }, logRoute as never);
    await adv(5);
    expect(queryOf(reqs[0]!)).toMatchObject({ since_seq: '41' });
    expect(s.h.cursor()).toEqual({ since: '41', incarnation: undefined });
    s.h.close();
  });
});

describe('resumableStream: resync signals', () => {
  it('an incarnation change reports resync once, resets the cursor, then delivers the frame', async () => {
    setup();
    script = [{ status: 200, headers: SSE, chunks: [frame(5, 'A')] }, { status: 200, headers: SSE, chunks: [frame(1, 'B'), frame(2, 'B')], hold: true }];
    const s = open();
    await adv(1100);
    expect(s.resyncs.map((r) => r[0])).toEqual(['incarnation']);
    expect(s.events.map((e) => e[2])).toEqual(['5', '1', '2']);
    expect(s.h.cursor()).toEqual({ since: '2', incarnation: 'B' });
    s.h.close();
  });
  it('a lagged replay_gap frame reports resync once and delivers the frame as well', async () => {
    setup();
    script = [{ status: 200, headers: SSE, chunks: [frame(9, 'A'), 'event: lagged\ndata: {"code":"replay_gap","min_seq":3}\n\n', frame(3, 'A'), frame(4, 'A')], hold: true }];
    const s = open();
    await adv(5);
    expect(s.resyncs.map((r) => r[0])).toEqual(['replay_gap']);
    expect(s.events.map((e) => e[0])).toContain('lagged');
    // the ring replays from min_seq: ids below the old cursor are not duplicates after a gap
    expect(s.events.filter((e) => e[2]).map((e) => e[2])).toEqual(['9', '3', '4']);
    s.h.close();
  });
  it('a gap and an incarnation change on one connection are one resync', async () => {
    setup();
    script = [{ status: 200, headers: SSE, chunks: [frame(5, 'A')] }, { status: 200, headers: SSE, chunks: ['event: lagged\ndata: {"code":"replay_gap"}\n\n', frame(1, 'B')], hold: true }];
    const s = open();
    await adv(1100);
    expect(s.resyncs.length).toBe(1);
    s.h.close();
  });
  it('a repeated id inside one incarnation is dropped; the first frame of an unknown incarnation resyncs nothing', async () => {
    setup();
    script = [{ status: 200, headers: SSE, chunks: [frame(1), frame(2), frame(2), frame(1), frame(3)], hold: true }];
    const s = open();
    await adv(5);
    expect(s.events.map((e) => e[2])).toEqual(['1', '2', '3']);
    expect(s.resyncs).toEqual([]);
    s.h.close();
  });
});

describe('resumableStream: hidden, close, refusal', () => {
  it('the 60 s hidden close pauses it; visible again reconnects at once with the cursor', async () => {
    setup();
    script = [{ status: 200, headers: SSE, chunks: [frame(7)], hold: true }];
    const vis = vi.spyOn(document, 'visibilityState', 'get');
    vis.mockReturnValue('hidden');
    const s = open();
    await adv(60500);
    expect(s.states.at(-1)).toEqual({ state: 'paused', reason: 'hidden' });
    expect(reqs.length).toBe(1);
    await adv(30000);
    expect(reqs.length).toBe(1);
    vis.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await adv(5);
    expect(reqs.length).toBe(2);
    expect(queryOf(reqs[1]!).since).toBe('7');
    s.h.close();
    vis.mockRestore();
  });
  it('close() in the backoff wait: no request after it, one closed aborted, nothing left open', async () => {
    setup();
    fallback = { fail: 'network' };
    const s = open();
    await adv(10);
    s.h.close();
    s.h.close();
    expect(vi.getTimerCount()).toBe(0);
    await adv(60000);
    expect(reqs.length).toBe(1);
    expect(s.states.filter((x) => x.state === 'closed')).toEqual([{ state: 'closed', reason: 'aborted' }]);
    expect(streamCount()).toBe(0);
  });
  it('the context dying during a wait ends it: closed aborted, no request', async () => {
    setup();
    const ctx = capture(TARGET);
    fallback = { fail: 'network' };
    const s = open({ ctx });
    await adv(10);
    bump('account');
    await adv(2000);
    expect(reqs.length).toBe(1);
    expect(s.states.at(-1)).toMatchObject({ state: 'closed' });
  });
  it('a context that already died is refused unsent, however late the call', () => {
    setup();
    const ctx = capture(TARGET);
    bump('account');
    expect(open({ ctx }).h.refused).toBe('STALE');
    expect(reqs.length).toBe(0);
  });
  it('a call without a handler is refused unsent (a query key the route does not declare is the named scenario below)', () => {
    setup();
    const a = open({ onEvent: undefined as never });
    expect(a.h.refused).toBe('HANDLER_MISSING');
    expect(reqs.length).toBe(0);
  });
  it('the gap state of kit-io passes through', async () => {
    setup();
    script = [{ status: 200, headers: SSE, chunks: ['id: 1\ndata: ' + 'x'.repeat(5000) + '\n\n', frame(2)], hold: true }];
    const s = open();
    await adv(5);
    expect(s.states.filter((x) => x.state === 'gap')).toEqual([{ state: 'gap', reason: 'frame_too_large' }]);
    s.h.close();
  });
});

// ---- Regression cases ----
describe('resumableStream: callbacks, signals and the hidden clock', () => {
  it('a state callback that closes during a reconnect (connecting) leaves no stream, request or timer', async () => {
    setup();
    script = [{ status: 200, headers: SSE, chunks: [frame(1)] }];
    let h: ReturnType<typeof resumableStream> | null = null;
    let n = 0;
    const s = open({ onState: (st) => { if (st.state === 'connecting' && ++n === 2) h!.close(); } });
    h = s.h;
    await adv(1100);
    expect(reqs.length).toBe(1);
    expect(streamCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    s.h.close();
  });
  it('a state callback that closes at reconnecting installs no retry timer', async () => {
    setup();
    fallback = { fail: 'network' };
    let h: ReturnType<typeof resumableStream> | null = null;
    const s = open({ onState: (st) => { if (st.state === 'reconnecting') h!.close(); } });
    h = s.h;
    await adv(5);
    expect(vi.getTimerCount()).toBe(0);
    await adv(20000);
    expect(reqs.length).toBe(1);
    expect(streamCount()).toBe(0);
  });
  it('an already-aborted signal sends nothing and is refused ABORTED', () => {
    setup();
    const ac = new AbortController();
    ac.abort();
    const s = open({ signal: ac.signal });
    expect(s.h.refused).toBe('ABORTED');
    expect(reqs.length).toBe(0);
    expect(streamCount()).toBe(0);
  });
  it('an abort raised from the first connecting callback leaves no stream', async () => {
    setup();
    const ac = new AbortController();
    const seen: ResumeState[] = [];
    open({ signal: ac.signal, onState: (st) => { seen.push(st); if (st.state === 'connecting') ac.abort(); } });
    await adv(5);
    expect(reqs.length).toBe(0);
    expect(streamCount()).toBe(0);
    expect(seen.at(-1)).toMatchObject({ state: 'closed', reason: 'aborted' });
  });
  it('a context that dies while paused (hidden) closes it and drops its listeners', async () => {
    setup();
    const vis = vi.spyOn(document, 'visibilityState', 'get');
    vis.mockReturnValue('hidden');
    const s = open();
    await adv(60500);
    expect(s.states.at(-1)).toEqual({ state: 'paused', reason: 'hidden' });
    bump('account');
    expect(s.states.at(-1)).toMatchObject({ state: 'closed', reason: 'aborted' });
    vis.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await adv(2000);
    expect(reqs.length).toBe(1);
    vis.mockRestore();
  });
  it('a context that dies while waiting to reconnect closes it at once, not at the timer', async () => {
    setup();
    fallback = { fail: 'network' };
    const s = open();
    await adv(10);
    bump('account');
    expect(s.states.at(-1)).toMatchObject({ state: 'closed', reason: 'aborted' });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('a hidden page whose attempts keep failing still pauses at 60 s (one clock across attempts)', async () => {
    setup();
    fallback = { fail: 'network' };
    const vis = vi.spyOn(document, 'visibilityState', 'get');
    vis.mockReturnValue('hidden');
    const s = open();
    await adv(59000);
    expect(s.states.some((x) => x.state === 'paused')).toBe(false);
    await adv(2500);
    expect(s.states.at(-1)).toEqual({ state: 'paused', reason: 'hidden' });
    const n = reqs.length;
    await adv(60000);
    expect(reqs.length).toBe(n);
    expect(vi.getTimerCount()).toBe(0);
    vis.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await adv(5);
    expect(reqs.length).toBe(n + 1);
    s.h.close();
    vis.mockRestore();
  });
  it('hidden, visible, hidden again: the clock starts over, the first one does not fire', async () => {
    setup();
    fallback = { fail: 'network' };
    const vis = vi.spyOn(document, 'visibilityState', 'get');
    vis.mockReturnValue('hidden');
    const s = open();
    await adv(30000);
    vis.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await adv(1000);
    vis.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await adv(40000); // 71 s after the first hidden, 40 s after the second
    expect(s.states.some((x) => x.state === 'paused')).toBe(false);
    await adv(21000);
    expect(s.states.at(-1)).toEqual({ state: 'paused', reason: 'hidden' });
    vis.mockRestore();
    s.h.close();
  });
  it('a refused open and a closed one leave no listener behind', async () => {
    setup();
    const add = vi.spyOn(document, 'addEventListener'), rem = vi.spyOn(document, 'removeEventListener');
    const count = (spy: typeof add) => spy.mock.calls.filter((c) => c[0] === 'visibilitychange').length;
    const a = open({ onEvent: undefined as never });
    expect(a.h.refused).toBe('HANDLER_MISSING');
    expect(count(add)).toBe(count(rem));
    const b = open();
    await adv(5);
    b.h.close();
    expect(count(add)).toBe(count(rem));
    add.mockRestore(); rem.mockRestore();
  });
  it('coming back visible before 60 s cancels the clock', async () => {
    setup();
    fallback = { fail: 'network' };
    const vis = vi.spyOn(document, 'visibilityState', 'get');
    vis.mockReturnValue('hidden');
    const s = open();
    await adv(30000);
    vis.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await adv(40000);
    expect(s.states.some((x) => x.state === 'paused')).toBe(false);
    s.h.close();
    vis.mockRestore();
  });
});

describe('resumableStream: the named scenarios of the freeze tests', () => {
  it('a held connection of 10 s or more, then a server end: the next wait is 1 s again', async () => {
    setup();
    // an SSE that sends nothing and is ended by the server after 11 s: emulate with a chunk-less close
    let ends: (() => void) | null = null;
    installTransport({ ...fakeTransport, fetch(url, init) {
      reqs.push({ url, init });
      if (reqs.length < 3) return Promise.reject(new TypeError('x'));
      const body = new ReadableStream<Uint8Array>({ start(ctl) { ends = () => { try { ctl.close(); } catch { /* done */ } }; init.signal?.addEventListener('abort', () => { try { ctl.error(new DOMException('a', 'AbortError')); } catch { /* done */ } }); } });
      return Promise.resolve(new Response(body, { status: 200, headers: SSE }));
    } });
    const s = open();
    await adv(1000); await adv(2000);
    expect(reqs.length).toBe(3);
    await adv(11000);
    ends!();
    await adv(5);
    const last = s.states.filter((x) => x.state === 'reconnecting').pop() as Extract<ResumeState, { state: 'reconnecting' }>;
    expect(last).toMatchObject({ attempt: 1, inMs: 1000 });
    s.h.close();
  });
  it('a 429 with Retry-After waits the longer of the two', async () => {
    setup();
    script = [{ status: 429, body: '{"code":"rate_limited"}', headers: { 'retry-after': '7' } }];
    const s = open();
    await adv(6900);
    expect(reqs.length).toBe(1);
    await adv(200);
    expect(reqs.length).toBe(2);
    expect(s.states.find((x) => x.state === 'reconnecting')).toMatchObject({ cause: 'status', status: 429, inMs: 7000 });
    s.h.close();
  });
  it('a redirect answer ends it for good (failed), no request after', async () => {
    setup();
    script = [{ status: 302, headers: { location: 'https://elsewhere.invalid/x' } }];
    const s = open();
    await adv(60000);
    expect(reqs.length).toBe(1);
    expect(s.states.filter((x) => x.state === 'closed')).toHaveLength(1);
    expect(s.states.at(-1)).toMatchObject({ state: 'closed', reason: 'failed' });
  });
  it('a query key the route does not declare is refused unsent', () => {
    setup();
    const s = open({ keys: { since: 'cursor_nope' }, from: { since: '4' } });
    expect(s.h.refused).toBeTruthy();
    expect(reqs.length).toBe(0);
  });
});
