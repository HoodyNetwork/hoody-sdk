// stream-live.ts: kit-io's stream() behind the stream budget, for the callers that keep their own reconnect
// logic. Red-first: every agent stream counts against the 8 per computer.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineRoute } from './routes';
import { installTransport, type Transport } from './transport';
import type { Target } from './ctx';
import { createStreamBudget, type StreamBudget } from './stream-budget';
import { budgetedStream, streamComputer } from './stream-live';
import type { StreamInput, StreamState } from './kit-io';
import { boot, R1, TARGET } from './test/env';
import { installWebLocks, type WebLocks } from './test/web-locks';

const SSE = { 'content-type': 'text/event-stream' };
type Req = { url: string; init: RequestInit };
let reqs: Req[] = [];
let ends: Array<() => void> = [];
let firstChunk = 'id: 1\ndata: {"seq":1}\n\n';
let httpFail: { status: number; code: string; retryAfter: string } | null = null;
const transport: Transport = {
  hoody: () => Promise.reject(new Error('not used')),
  fetch(url, init) {
    reqs.push({ url, init });
    if (httpFail) return Promise.resolve(new Response(JSON.stringify({ code: httpFail.code, message: 'x' }), { status: httpFail.status, headers: { 'content-type': 'application/json', 'retry-after': httpFail.retryAfter } }));
    const enc = new TextEncoder();
    const signal = init.signal;
    let ctlRef: ReadableStreamDefaultController<Uint8Array> | null = null;
    const body = new ReadableStream<Uint8Array>({
      start(ctl) {
        ctlRef = ctl;
        signal?.addEventListener('abort', () => { try { ctl.error(new DOMException('aborted', 'AbortError')); } catch { /* closed */ } });
        ctl.enqueue(enc.encode(firstChunk));
      },
    });
    ends.push(() => { try { ctlRef?.close(); } catch { /* done */ } });
    return Promise.resolve(new Response(body, { status: 200, headers: SSE }));
  },
};
const route = defineRoute({ method: 'GET', path: '/sessions/:id/stream', scope: 'agent', query: ['since', 'incarnation'], stream: { id: 4096, noId: 1024 }, maxBytes: 1 << 20, timeoutMs: 20000 });
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 2)); };

let locks: WebLocks;
let budget: StreamBudget;
beforeEach(() => {
  boot({ realm: R1 });
  httpFail = null; reqs = []; ends = []; firstChunk = 'id: 1\ndata: {"seq":1}\n\n';
  installTransport(transport);
  locks = installWebLocks();
  budget = createStreamBudget({ limit: 2, reserve: 0, retryMs: 30, cutWaitMs: 40 });
});
afterEach(() => { budget.reset(); installTransport(null); });

function call(id: string, o: { rank?: 'open' | 'focused' | 'dock' | 'visible' | 'bot'; target?: Target; key?: string; throwing?: boolean } = {}) {
  const events: Array<[string, string]> = [], states: StreamState[] = [];
  const input: StreamInput = {
    params: { id }, target: o.target ?? TARGET, realm: R1,
    onEvent: (n: string, d: string) => events.push([n, d]),
    onState: (s: StreamState) => { states.push(s); if (o.throwing) throw new Error('caller'); },
  } as StreamInput;
  const h = budgetedStream(route, input, { key: o.key ?? `${R1}/${id}`, ...(o.rank ? { rank: o.rank } : {}) }, budget);
  return { h, events, states, kinds: () => states.map((s) => s.state) };
}
const code = (s: StreamState | undefined) => (s && s.state === 'error' ? s.code : undefined);

describe('a stream through the budget', () => {
  it('opens when a slot is free, delivers frames, and holds one slot until closed', async () => {
    const a = call('s1');
    await settle();
    expect(reqs.length).toBe(1);
    expect(a.kinds()).toContain('open');
    expect(a.events.length).toBe(1);
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(1);
    a.h.close();
    await settle();
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(0);
    expect(reqs[0]!.init.signal?.aborted).toBe(true);
    expect(a.kinds()).not.toContain('closed');
  });
  it('the third stream of equal rank gets one error {budget} and no request; nothing reopens later', async () => {
    const a = call('s1'), b = call('s2'), c = call('s3');
    await settle();
    expect(reqs.length).toBe(2);
    expect(c.kinds()).toEqual(['error']);
    expect(code(c.states[0])).toBe('budget');
    expect((c.states[0] as { status: number }).status).toBe(0);
    a.h.close();
    await settle(30);
    expect(reqs.length).toBe(2);
    expect(c.kinds()).toEqual(['error']);
    b.h.close();
  });
  it('another tab holding the locks: error {locks}, no request', async () => {
    locks.asClient('other', () => {
      void navigator.locks.request(`hoody-agent-stream:${streamComputer(TARGET)}:1`, () => new Promise(() => {}));
      void navigator.locks.request(`hoody-agent-stream:${streamComputer(TARGET)}:2`, () => new Promise(() => {}));
    });
    await settle();
    const a = call('s1');
    await settle(12);
    expect(reqs.length).toBe(0);
    expect(a.kinds()).toEqual(['error']);
    expect(code(a.states[0])).toBe('locks');
  });
  it('a better-ranked stream cuts the worst: the cut one is told once (closed), the better one opens', async () => {
    const a = call('s1', { rank: 'visible' }), b = call('s2', { rank: 'visible' });
    await settle();
    const c = call('s3', { rank: 'dock' });
    await settle(20);
    expect(reqs.length).toBe(3);
    expect(c.kinds()).toContain('open');
    const cut = [a, b].filter((x) => x.kinds().includes('closed'));
    expect(cut.length).toBe(1);
    expect(cut[0]!.kinds().filter((k) => k === 'closed').length).toBe(1);
    expect(cut[0]!.kinds().filter((k) => k === 'error').length).toBe(0);
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(2);
  });
  it('a stream that ends by itself is told once and frees its slot for the next', async () => {
    const a = call('s1');
    await settle();
    ends[0]!();
    await settle();
    expect(a.kinds().filter((k) => k === 'closed').length).toBe(1);
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(0);
    const b = call('s2');
    await settle();
    expect(b.kinds()).toContain('open');
  });
  it('stream() refusing (an undeclared route) arrives as error {code}, and the slot is free', async () => {
    const states: StreamState[] = [];
    budgetedStream({} as never, { params: { id: 's1' }, target: TARGET, realm: R1, onEvent: () => {}, onState: (s: StreamState) => states.push(s) } as unknown as StreamInput, { key: 'k' }, budget);
    await settle();
    expect(states.map((s) => s.state)).toEqual(['error']);
    expect(code(states[0])).toBe('ROUTE_NOT_ALLOWED');
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(0);
  });
  it('two calls on the same session do not share a connection: both get their frames', async () => {
    const a = call('s1'), b = call('s1');
    await settle();
    expect(reqs.length).toBe(2);
    expect(a.events.length).toBe(1);
    expect(b.events.length).toBe(1);
  });
  it('a caller handler that throws does not break the stream or the budget', async () => {
    const a = call('s1', { throwing: true });
    await settle();
    expect(reqs.length).toBe(1);
    ends[0]!();
    await settle();
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(0);
    expect(a.kinds().filter((k) => k === 'closed').length).toBe(1);
  });
  it('computers are counted apart: a full computer does not refuse another', async () => {
    const other: Target = { project: { id: 'p9' }, container: { id: 'c9', server_name: 'sv9' } };
    expect(streamComputer(other)).toBe('p9/c9');
    const a = call('s1'), b = call('s2');
    await settle();
    const c = call('s3', { target: other });
    await settle();
    expect(c.kinds()).toContain('open');
    expect(reqs.length).toBe(3);
    a.h.close(); b.h.close(); c.h.close();
  });
  it('close() at once: whatever the budget did meanwhile, the caller hears nothing and no slot stays held', async () => {
    const a = call('s1');
    a.h.close();
    await settle(12);
    expect(a.states).toEqual([]);
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(0);
    if (reqs.length) expect(reqs[0]!.init.signal?.aborted).toBe(true);
  });
  it('a refused call keeps nothing: closing it afterwards is harmless and the others are untouched', async () => {
    const a = call('s1'), b = call('s2');
    await settle();
    const c = call('s3');
    await settle();
    expect(c.kinds()).toEqual(['error']);
    c.h.close();
    await settle(12);
    expect(c.kinds()).toEqual(['error']);
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(2);
    expect(reqs.length).toBe(2);
    a.h.close(); b.h.close();
  });
  it('a refusal known at once reaches the caller after it holds the handle, so closing "its stream" from the handler works', async () => {
    const a = call('s1'), b = call('s2');
    await settle();
    let sawHandle: boolean | null = null;
    const held: { close(): void } = budgetedStream(route, { params: { id: 's3' }, target: TARGET, realm: R1, onEvent: () => {}, onState: () => { sawHandle = typeof held.close === 'function'; held.close(); } } as StreamInput, { key: `${R1}/s3` }, budget);
    expect(sawHandle).toBeNull();
    await settle();
    expect(sawHandle).toBe(true);
    a.h.close(); b.h.close();
  });
  it('a caller that closes a call before its pending refusal arrives hears nothing, and the others are untouched', async () => {
    const a = call('s1'), b = call('s2');
    await settle();
    const c = call('s3');
    c.h.close();
    await settle(12);
    expect(c.states).toEqual([]);
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(2);
    a.h.close(); b.h.close();
  });
  it('an HTTP failure reaches the caller as the error it was: status, code and retry hint, once, and the slot goes back', async () => {
    httpFail = { status: 503, code: 'busy', retryAfter: '15' };
    const a = call('s1');
    await settle(12);
    expect(a.states.length).toBe(1);
    expect(a.states[0]).toMatchObject({ state: 'error', status: 503, code: 'busy', retryAfterMs: 15000, retryAfter: 15 });
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(0);
  });
  it('without a rank the stream is visible: it takes a slot from a bot stream and not from an equal one', async () => {
    const a = call('s1', { rank: 'bot' }), b = call('s2', { rank: 'bot' });
    await settle();
    const c = call('s3');
    await settle(20);
    expect(c.kinds()).toContain('open');
    expect([a, b].filter((x) => x.kinds().includes('closed')).length).toBe(1);
    const e = call('s5');
    await settle(20);
    expect(e.kinds()).toContain('open');
    expect([a, b].filter((x) => x.kinds().includes('closed')).length).toBe(2);
    const d = call('s4');
    await settle(20);
    expect(d.kinds()).toEqual(['error']);
  });
  it('an over-bound frame reaches the caller as the gap state, and the stream goes on', async () => {
    firstChunk = 'id: 1\ndata: ' + 'x'.repeat(5000) + '\n\n' + 'id: 2\ndata: {"seq":2}\n\n';
    const a = call('s1');
    await settle();
    expect(a.kinds()).toEqual(['open', 'gap']);
    expect(a.events.length).toBe(1);
  });
});
