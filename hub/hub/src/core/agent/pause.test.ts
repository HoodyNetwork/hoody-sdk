// pauseApi and pauseOf: GET and PUT /pause go to the computer's agent with no realm and no cwd, the PUT is sent
// once, and an answer is read as a state only when it is whole.
import { afterEach, describe, expect, it } from 'vitest';
import { installTransport, type Transport } from '../transport';
import { AGENT, boot, R1, TARGET } from '../test/env';
import { pauseApi, pauseOf, pauseOfEvent, pauseOfInit } from './pause';

type Req = { url: string; init: RequestInit };
let reqs: Req[] = [];
let reply: (r: Req) => { status: number; body?: unknown; network?: boolean } = () => ({ status: 200, body: { paused: false, since_ms: 0, gen: 1 } });
const tr: Transport = {
  hoody: () => Promise.reject(new Error('x')),
  fetch(url, init) {
    const r = { url, init };
    reqs.push(r);
    const a = reply(r);
    if (a.network) return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(new Response(JSON.stringify(a.body ?? {}), { status: a.status, headers: { 'content-type': 'application/json' } }));
  },
};
function page() { boot({ realm: R1 }); reqs = []; installTransport(tr); }
afterEach(() => installTransport(null));
const hoodyHeaders = (r: Req): string[] => Object.keys((r.init.headers ?? {}) as Record<string, string>).filter((h) => h.toLowerCase().startsWith('x-hoody'));

describe('pauseApi', () => {
  it('GET /pause: no realm in the URL, no scope header, the state comes back', async () => {
    page();
    reply = () => ({ status: 200, body: { paused: true, since_ms: 1761575400000, gen: 3 } });
    const r = await pauseApi(TARGET).get();
    expect(reqs[0]!.url).toBe(`${AGENT}/pause`);
    expect(reqs[0]!.init.method).toBe('GET');
    expect(hoodyHeaders(reqs[0]!)).toEqual([]);
    expect(r.ok && pauseOf(r.body)).toEqual({ paused: true, sinceMs: 1761575400000, gen: 3 });
  });
  it('PUT /pause {paused}: the body is only that field, still no realm or scope header', async () => {
    page();
    await pauseApi(TARGET).set(true);
    await pauseApi(TARGET).set(false);
    expect(reqs.map((r) => [r.init.method, r.url])).toEqual([['PUT', `${AGENT}/pause`], ['PUT', `${AGENT}/pause`]]);
    expect(reqs.map((r) => JSON.parse(String(r.init.body)))).toEqual([{ paused: true }, { paused: false }]);
    expect(reqs.flatMap(hoodyHeaders)).toEqual([]);
  });
  it('a lost PUT answer is pending and is sent once; a refusal is failed; a lost GET is not a change', async () => {
    page();
    reply = () => ({ status: 200, network: true });
    const lost = await pauseApi(TARGET).set(true);
    expect(lost).toMatchObject({ ok: false, err: { kind: 'pending' } });
    expect(reqs.length).toBe(1);
    reply = () => ({ status: 400, body: { code: 'bad_request', message: 'x' } });
    expect(await pauseApi(TARGET).set(true)).toMatchObject({ ok: false, err: { kind: 'failed', status: 400, code: 'bad_request' } });
    reply = () => ({ status: 503, body: { code: 'unavailable' } });
    expect(await pauseApi(TARGET).get()).toMatchObject({ ok: false });
  });
});

describe('pauseOf', () => {
  it('reads a whole state', () => {
    expect(pauseOf({ paused: false, since_ms: 0, gen: 0 })).toEqual({ paused: false, sinceMs: 0, gen: 0 });
  });
  it.each([
    ['null', null], ['an array', []], ['a string', 'x'], ['paused as a string', { paused: 'true', since_ms: 0, gen: 1 }],
    ['paused missing', { since_ms: 0, gen: 1 }], ['since_ms missing', { paused: true, gen: 1 }], ['gen missing', { paused: true, since_ms: 1 }],
    ['negative gen', { paused: true, since_ms: 1, gen: -1 }], ['fractional gen', { paused: true, since_ms: 1, gen: 1.5 }],
    ['gen as a string', { paused: true, since_ms: 1, gen: '2' }], ['unsafe since_ms', { paused: true, since_ms: 2 ** 60, gen: 1 }],
  ])('refuses %s', (_n, v) => { expect(pauseOf(v)).toBeNull(); });
});

describe('the stream\'s forms', () => {
  it('event.pause_state: since_ms may be left out (running), gen is required', () => {
    expect(pauseOfEvent({ paused: true, since_ms: 5, gen: 2 })).toEqual({ paused: true, sinceMs: 5, gen: 2 });
    expect(pauseOfEvent({ paused: false, gen: 3 })).toEqual({ paused: false, sinceMs: 0, gen: 3 });
    expect(pauseOfEvent({ paused: false })).toBeNull();
    expect(pauseOfEvent({ paused: 'no', gen: 1 })).toBeNull();
    expect(pauseOfEvent({ paused: true, since_ms: -1, gen: 1 })).toBeNull();
  });
  it('init_state: paused is required, the since and the gen are 0 when left out', () => {
    expect(pauseOfInit({ paused: false })).toEqual({ paused: false, sinceMs: 0, gen: 0 });
    expect(pauseOfInit({ paused: true, paused_since_ms: 9, pause_gen: 4 })).toEqual({ paused: true, sinceMs: 9, gen: 4 });
    expect(pauseOfInit({ paused_since_ms: 9 })).toBeNull();
    expect(pauseOfInit({ paused: true, pause_gen: 1.5 })).toBeNull();
    expect(pauseOfInit(null)).toBeNull();
  });
});
