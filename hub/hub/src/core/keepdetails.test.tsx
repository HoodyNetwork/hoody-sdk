// keepDetails (routes.ts): an agent change whose answer's details say what it did keeps
// them on its pending error and its change result, bounded; every other route answers exactly as before.
import { QueryClientProvider, type UseMutationResult } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { api, DETAILS_MAX, keptDetails } from './api';
import { heldChanges } from './changes';
import { CHANGE_STORE_KEY } from './change-store';
import { queryClient } from './query';
import { defineRoute, type RouteSpec } from './routes';
import { coreSource, type SourceError, type SourceResult } from './source';
import { boot, calls, onFetch, R1, settle } from './test/env';

const spec = (extra: Partial<RouteSpec> = {}): RouteSpec => ({ method: 'POST', path: '/github/commit/push', scope: 'agent', body: ['message'], cwd: true, ...extra });
const kept = defineRoute<unknown, { message: string }>(spec({ keepDetails: true }));
const plain = defineRoute<unknown, { message: string }>(spec());
const DETAILS = { committed: true, output: '! [rejected] main -> main (fetch first)', steps: [{ step: 'github.push', result: { status: 'error' } }] };
const fail = (status: number, details: unknown = DETAILS, code = status === 409 ? 'detached_head' : 'push_failed') => () => ({ status, body: { code, message: 'x', details } });
const caught = (p: Promise<unknown>) => p.then(() => null, (x: unknown) => x as Record<string, unknown>);

describe('routes: keepDetails is an agent change flag', () => {
  it('only on an agent change that is not secret', () => {
    expect(kept.keepDetails).toBe(true);
    expect(plain.keepDetails).toBe(false);
    expect(() => defineRoute(spec({ keepDetails: true, scope: 'realm', cwd: undefined }))).toThrow(/keepDetails/);
    expect(() => defineRoute(spec({ keepDetails: true, method: 'GET', body: undefined }))).toThrow(/keepDetails/);
    expect(() => defineRoute(spec({ keepDetails: true, secret: true }))).toThrow(/keepDetails/);
    expect(() => defineRoute(spec({ keepDetails: true, method: 'HEAD', body: undefined }))).toThrow(/keepDetails/);
    expect(() => defineRoute(spec({ keepDetails: true, secret: ['message'] }))).toThrow(/keepDetails/);
    expect(() => defineRoute(spec({ keepDetails: false as unknown as true }))).toThrow(/keepDetails/);
  });
});

describe('api(): the pending error of a keepDetails route keeps the details', () => {
  it('a 502 or 503 (pending): kept on a keepDetails route, never on any other', async () => {
    for (const status of [502, 503]) {
      boot({ realm: R1 });
      onFetch(fail(status));
      const e = await caught(api(kept, { body: { message: 'm' }, cwd: '/srv/shop' }));
      expect(e).toMatchObject({ kind: 'pending', pending: true, status, code: 'push_failed', details: DETAILS });
      expect(e!.detailsDropped).toBeUndefined();
      boot({ realm: R1 });
      onFetch(fail(status));
      const p = await caught(api(plain, { body: { message: 'm' }, cwd: '/srv/shop' }));
      // Byte for byte the same pending error as before keepDetails existed.
      expect(p).toEqual({ kind: 'pending', pending: true, status, code: 'push_failed', route: 'POST /github/commit/push' });
    }
  });
  it('details over DETAILS_MAX bytes of JSON are dropped whole, with the marker', async () => {
    boot({ realm: R1 });
    const big = { committed: true, output: 'é'.repeat(DETAILS_MAX) };
    onFetch(fail(502, big));
    const e = await caught(api(kept, { body: { message: 'm' }, cwd: '/srv/shop' }));
    expect(e).toMatchObject({ kind: 'pending', detailsDropped: true });
    expect(e!.details).toBeUndefined();
  });
  it('the bound counts UTF-8 bytes, and exactly DETAILS_MAX is kept', () => {
    const route = { keepDetails: true, scope: 'agent' as const };
    const pad = (n: number) => ({ o: 'a'.repeat(n) });
    const overhead = JSON.stringify(pad(0)).length;
    expect(keptDetails(route, { details: pad(DETAILS_MAX - overhead) })).toEqual({ details: pad(DETAILS_MAX - overhead) });
    expect(keptDetails(route, { details: pad(DETAILS_MAX - overhead + 1) })).toEqual({ detailsDropped: true });
    expect(keptDetails(route, { details: { o: 'é'.repeat((DETAILS_MAX - overhead) / 2 + 1) } })).toEqual({ detailsDropped: true });
  });
  it('a call made secret by its scrub keeps no details: an echoed secret never reaches the error', async () => {
    for (const status of [409, 502]) {
      boot({ realm: R1 });
      onFetch(fail(status, { committed: true, output: 'token ghp_SECRET' }));
      const e = await caught(api(kept, { body: { message: 'm' }, cwd: '/srv/shop', scrub: () => undefined }));
      expect(JSON.stringify(e)).not.toContain('ghp_SECRET');
      expect(e!.details).toBeUndefined();
    }
  });
  it('a copy, never the answer\'s own object; an empty, missing or non-object details keeps nothing', () => {
    const route = { keepDetails: true, scope: 'agent' as const };
    const d = { committed: true, nested: { a: 1 } };
    const k = keptDetails(route, { details: d }).details!;
    expect(k).toEqual(d);
    expect(k).not.toBe(d);
    expect(k.nested).not.toBe(d.nested);
    for (const x of [{}, { details: {} }, { details: [1] }, { details: 'x' }, null]) expect(keptDetails(route, x)).toEqual({});
    expect(keptDetails({ keepDetails: false, scope: 'agent' }, { details: d })).toEqual({});
  });
});

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }
const TARGET = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };

async function send(route: typeof kept, answer: () => { status: number; body: unknown }, name: string, lock?: string): Promise<SourceResult<unknown>> {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch(answer);
  const table = { reads: {}, changes: { push: { route, input: (v: { message: string }) => ({ target: TARGET, realm: R1, cwd: '/srv/shop', body: v }), reads: [], ...(lock ? { lock, lockKey: () => ({ cwd: '/srv/shop' }), identity: () => ({ cwd: '/srv/shop' }) } : {}) } } };
  const src = coreSource(name, table);
  let m!: UseMutationResult<SourceResult<unknown>, SourceError, { message: string }>;
  function Probe() { m = src.useMutation<unknown, { message: string }>('push'); return null; }
  render(<Probe />, { wrapper: wrap });
  await act(flush);
  let r!: SourceResult<unknown>;
  await act(async () => { r = await m.mutateAsync({ message: 'm' }); await flush(); });
  return r;
}

describe('coreSource: the change result carries the details of a keepDetails route only', () => {
  it('pending (502) and failed (409): the details come back with the outcome', async () => {
    const p = await send(kept, fail(502), 'kd-a');
    expect(p).toMatchObject({ outcome: 'pending', code: 'push_failed', details: DETAILS });
    const f = await send(kept, fail(409, { committed: true }), 'kd-b');
    expect(f).toMatchObject({ outcome: 'failed', code: 'detached_head', status: 409, details: { committed: true } });
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });
  it('a held change keeps no details: neither its hold nor the stored record carries them', async () => {
    // send() boots afresh, so each send's hold is read right after it.
    for (const [output, lock, name] of [['MARK'.repeat(16000), 'test.kd_big', 'kd-f'], ['SMALLMARK', 'test.kd_small', 'kd-g']] as const) {
      const r = await send(kept, fail(502, { committed: true, output }), name, lock);
      expect(r.outcome).toBe('pending');
      expect(r.details?.output ?? r.detailsDropped).toBeTruthy();
      const held = heldChanges(lock);
      expect(held).toHaveLength(1);
      expect(JSON.stringify(held)).not.toMatch(/MARK/);
      expect(localStorage.getItem(CHANGE_STORE_KEY) ?? '').toContain('test.kd_');
      expect(localStorage.getItem(CHANGE_STORE_KEY) ?? '').not.toMatch(/MARK/);
    }
  });
  it('the dropped marker reaches the result too', async () => {
    const r = await send(kept, fail(502, { output: 'x'.repeat(DETAILS_MAX) }), 'kd-c');
    expect(r).toMatchObject({ outcome: 'pending', detailsDropped: true });
    expect(r.details).toBeUndefined();
  });
  it('another route: the same answers give the same results as before (no details, no marker)', async () => {
    const p = await send(plain, fail(502), 'kd-d');
    expect(Object.keys(p).sort()).toEqual(['code', 'hold', 'outcome'].concat('route' in p ? ['route'] : []).sort());
    const f = await send(plain, fail(409, { committed: true }), 'kd-e');
    expect(f).not.toHaveProperty('details');
    expect(f).not.toHaveProperty('detailsDropped');
    expect(f).toMatchObject({ outcome: 'failed', code: 'detached_head', status: 409 });
  });
});
