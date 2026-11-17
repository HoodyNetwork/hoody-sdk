// Error details over the real legs: shared.js apiCall and kit.ts keep the API's X-Trace-Id (its shape only), api()
// names the declared route on every rejection, a secret call's rebuild and a pending rejection keep both, the
// fixture transport sets a trace id the same way, and coreSource carries both to SourceResult and SourceError.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { api, type HubError } from './api';
import { errorInfo } from './errors';
import { useLockedChange, type LockedChange } from './locked';
import { queryClient } from './query';
import { defineRoute } from './routes';
import { coreSource, SourceError, type SourceResult } from './source';
import { boot, onFetch, R1, settle } from './test/env';
import { answers, fixtureTransport, installTransport, reply } from './transport';

const TID = '0f8c1e2d-3b4a-4c5d-8e9f-a1b2c3d4e5f6';
const HEX = '64a0f1e2d3c4b5a697887766';
const start = defineRoute({ method: 'POST', path: '/computers/:id/start', scope: 'realm', body: [] });
const list = defineRoute({ method: 'GET', path: '/computers', scope: 'realm' });
const mint = defineRoute({ method: 'POST', path: '/auth/tokens', scope: 'base', body: ['name'], secret: true, codes: ['TOKEN_LIMIT'] });
const agentSession = defineRoute({ method: 'POST', path: '/sessions/:sid/stop', scope: 'agent', body: ['x'] });
const fail = (p: Promise<unknown>): Promise<HubError> => p.then(() => { throw new Error('resolved'); }, (e: HubError) => e);

afterEach(() => { cleanup(); installTransport(null); });

describe('shared.js apiCall + api(): trace id and route on the rejection', () => {
  it('an answered refusal keeps the trace id and names the declared template, never the filled path', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: { error: 'CONFLICT', message: 'Busy' }, headers: { 'x-trace-id': TID } }));
    const e = await fail(api(start, { params: { id: 'c-secret-id' } }));
    expect(e).toMatchObject({ status: 409, code: 'CONFLICT', traceId: TID, route: 'POST /computers/{id}/start' });
    expect(JSON.stringify(e.route)).not.toContain('c-secret-id');
  });
  it("a trace id of another shape is no id: the field is left off, as when the answer names none", async () => {
    boot({ realm: R1 });
    for (const h of [{ 'x-trace-id': 'Bearer abc' }, { 'x-trace-id': `${HEX}?x` }, {}] as Record<string, string>[]) {
      onFetch(() => ({ status: 400, body: { error: 'BAD' }, headers: h }));
      const e = await fail(api(list));
      expect('traceId' in e).toBe(false);
      expect(e.route).toBe('GET /computers');
    }
  });
  it('a secret call keeps the trace id through its rebuild, and still drops message, data and details', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: { error: 'hdy_ECHO', message: 'your hdy_x', details: { t: 'hdy_x' } }, headers: { 'x-trace-id': HEX } }));
    const e = await fail(api(mint, { body: { name: 'x' } }));
    expect(e).toEqual({ code: null, status: 409, traceId: HEX, route: 'POST /auth/tokens' });
  });
  it('a change whose answer is unknown (503) is pending and keeps the trace id and route', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 503, body: {}, headers: { 'x-trace-id': HEX } }));
    const e = await fail(api(start, { params: { id: 'c1' } }));
    expect(e).toMatchObject({ kind: 'pending', pending: true, traceId: HEX, route: 'POST /computers/{id}/start' });
    expect(errorInfo(e).outcome).toBe('pending');
  });
  it('a refusal before anything is sent names the route too, and has no trace id', async () => {
    boot({ realm: R1 });
    const e = await fail(api(start, {}));
    expect(e).toMatchObject({ code: 'ROUTE_PARAMS', notSent: true, route: 'POST /computers/{id}/start' });
    expect('traceId' in e).toBe(false);
  });
  it("an API message echoing what was sent stays on the rejection for its callers, never in errorInfo", async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: { error: 'ALIAS_TAKEN', message: 'Alias "review-sent-alias" is already in use' }, headers: { 'x-trace-id': TID } }));
    const e = await fail(api(start, { params: { id: 'c1' }, body: {} }));
    expect(e.message).toContain('review-sent-alias');
    const info = errorInfo(e);
    expect(info).toMatchObject({ status: 409, code: null, message: null, traceId: TID, route: 'POST /computers/{id}/start' }); // ALIAS_TAKEN is no published code
    expect(JSON.stringify(info)).not.toContain('review-sent-alias');
  });
  it('an answer echoing a sent value as its error code: the rejection keeps it for its callers, errorInfo never', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: { error: 'REVIEW_SENT_VALUE' } }));
    const e = await fail(api(start, { params: { id: 'c1' }, body: {} }));
    expect(e.code).toBe('REVIEW_SENT_VALUE');
    expect(errorInfo(e)).toMatchObject({ status: 409, code: null });
    onFetch(() => ({ status: 422, body: { code: 'REVIEW_SENT_VALUE' } }));
    const k = await fail(api(agentSession, { params: { sid: 's1' }, body: { x: 1 } }));
    expect(k.code).toBe('REVIEW_SENT_VALUE');
    expect(errorInfo(k)).toMatchObject({ status: 422, code: null });
    onFetch(() => ({ status: 409, body: { error: 'CONFLICT' } }));
    expect(errorInfo(await fail(api(start, { params: { id: 'c1' }, body: {} }))).code).toBe('CONFLICT');
  });
  it('a hand-made route object is refused without a route: its path is not a declaration', async () => {
    boot({ realm: R1 });
    const e = await fail(api({ ...start, path: '/x?token=abc' } as typeof start));
    expect(e).toMatchObject({ code: 'ROUTE_NOT_DECLARED' });
    expect('route' in e).toBe(false);
  });
});

describe('kit.ts: an agent answer carries its trace id only when present', () => {
  it('a 500 with X-Trace-Id keeps it; one without keeps none', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 422, body: { code: 'invalid' }, headers: { 'x-trace-id': HEX } }));
    const e = await fail(api(agentSession, { params: { sid: 's1' }, body: { x: 1 } }));
    expect(e).toMatchObject({ status: 422, code: 'invalid', traceId: HEX, route: 'POST /sessions/{sid}/stop' });
    onFetch(() => ({ status: 422, body: { code: 'invalid' } }));
    expect('traceId' in (await fail(api(agentSession, { params: { sid: 's1' }, body: { x: 1 } })))).toBe(false);
  });
  it('an answer whose body then fails to read still names its trace id; the change stays pending (C9)', async () => {
    boot({ realm: R1 });
    const broken = (tid?: string) => new Response(new ReadableStream({ start(c) { c.error(new Error('body lost')); } }), {
      status: 400, headers: { 'content-type': 'application/json', ...(tid ? { 'x-trace-id': tid } : {}) },
    });
    let next = broken(HEX);
    installTransport({ hoody: () => Promise.reject(new Error('unused')), fetch: () => Promise.resolve(next) });
    const e = await fail(api(agentSession, { params: { sid: 's1' }, body: { x: 1 } }));
    expect(e).toMatchObject({ kind: 'pending', status: 0, code: 'NETWORK', traceId: HEX, route: 'POST /sessions/{sid}/stop' });
    expect(errorInfo(e)).toMatchObject({ outcome: 'pending', status: null, traceId: HEX });
    next = broken();
    expect('traceId' in (await fail(api(agentSession, { params: { sid: 's1' }, body: { x: 1 } })))).toBe(false);
  });
});

describe('fixture transport: a fixture sets a trace id with an x-trace-id header', () => {
  it('kept in the API shape only', async () => {
    boot({ realm: R1 });
    installTransport(fixtureTransport([reply(list, { ...answers.refused(400, 'BAD'), headers: { 'x-trace-id': HEX } }, { times: 1 }), reply(list, { ...answers.refused(400, 'BAD'), headers: { 'x-trace-id': 'nope' } })]));
    expect(await fail(api(list))).toMatchObject({ code: 'BAD', traceId: HEX, route: 'GET /computers' });
    expect('traceId' in (await fail(api(list)))).toBe(false);
  });
});

describe('coreSource: SourceResult and SourceError carry the trace id and route', () => {
  const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
  it('a refused change: failed, with both; errorInfo shows them', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch(() => ({ status: 422, body: { error: 'VALIDATION' }, headers: { 'x-trace-id': HEX } }));
    const src = coreSource('errwire1', { reads: {}, changes: { go: { route: start, input: () => ({ params: { id: 'c1' } }) } } });
    let m!: ReturnType<typeof src.useMutation<unknown, void>>;
    function Probe() { m = src.useMutation<unknown, void>('go'); return null; }
    render(<Probe />, { wrapper: wrap });
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync(); await flush(); });
    expect(r).toMatchObject({ outcome: 'failed', status: 422, code: 'VALIDATION', traceId: HEX, route: 'POST /computers/{id}/start' });
    expect(errorInfo(r, { page: 'computers' })).toMatchObject({ outcome: 'failed', status: 422, traceId: HEX, route: 'POST /computers/{id}/start', page: 'computers' });
  });
  it('a failed read: the SourceError has both', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch(() => ({ status: 500, body: { error: 'BOOM' }, headers: { 'x-trace-id': TID } }));
    const src = coreSource('errwire2', { reads: { all: { route: list } }, changes: {} });
    let q!: ReturnType<typeof src.useQuery<unknown>>;
    function Probe() { q = src.useQuery<unknown>('all'); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await flush(); });
    await act(async () => { for (let i = 0; i < 5 && !q.error; i++) await flush(); });
    expect(q.error).toBeInstanceOf(SourceError);
    expect(q.error).toMatchObject({ kind: 'server', status: 500, code: 'BOOM', traceId: TID, route: 'GET /computers' });
  });
  it('useLockedChange: a refused run through api() keeps both on its result', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch(() => ({ status: 409, body: { error: 'TAKEN' }, headers: { 'x-trace-id': HEX } }));
    let lc!: LockedChange<{ id: string }, unknown>;
    function Probe() { lc = useLockedChange((v: { id: string }, _idem, ctx) => api(start, { params: { id: v.id }, ctx }), [() => false], 'errwire.locked'); return null; }
    render(<Probe />, { wrapper: wrap });
    let r!: Awaited<ReturnType<typeof lc.run>>;
    await act(async () => { r = await lc.run({ id: 'c1' }); await flush(); });
    expect(r).toMatchObject({ outcome: 'failed', status: 409, code: 'TAKEN', traceId: HEX, route: 'POST /computers/{id}/start' });
  });
  it('useLockedChange: a rejection naming a filled path keeps no route (only a declared label passes)', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    let lc!: LockedChange<{ id: string }, unknown>;
    function Probe() { lc = useLockedChange(() => Promise.reject({ status: 409, code: 'TAKEN', route: 'POST /computers/review-only-id/start' }), [() => false], 'errwire.locked2'); return null; }
    render(<Probe />, { wrapper: wrap });
    let r!: Awaited<ReturnType<typeof lc.run>>;
    await act(async () => { r = await lc.run({ id: 'c1' }); await flush(); });
    expect(r).toMatchObject({ outcome: 'failed', status: 409, code: 'TAKEN' });
    expect((r as { route?: string }).route ?? null).toBeNull();
    expect(errorInfo(r).route).toBeNull();
    expect(JSON.stringify(errorInfo(r))).not.toContain('review-only-id');
  });
});
