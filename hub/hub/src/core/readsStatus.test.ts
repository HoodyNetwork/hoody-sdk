// readsStatus: an opt-in agent route flag. A route that declares it resolves {status, body}, the
// success answer's HTTP status beside its body, so a caller that proves something only from a 200 can refuse any other 2xx. A
// route without it is unchanged: it resolves the body alone, whatever 2xx answered. The flag is agent-only and strict.
import { describe, expect, it } from 'vitest';
import { api } from './api';
import { call } from './providers/call';
import { defineRoute, type RouteSpec } from './routes';
import { boot, onFetch, R1 } from './test/env';

const ok = (spec: RouteSpec) => defineRoute<unknown>(spec);

describe('readsStatus', () => {
  it('is agent-only and strict', () => {
    expect(ok({ method: 'POST', path: '/rs/a', scope: 'agent', readsStatus: true }).readsStatus).toBe(true);
    expect(ok({ method: 'GET', path: '/rs/b', scope: 'agent' }).readsStatus).toBe(false);
    expect(() => ok({ method: 'POST', path: '/x', scope: 'realm', readsStatus: true })).toThrow(/ROUTE_INVALID: readsStatus/);
    expect(() => ok({ method: 'POST', path: '/x', scope: 'base', readsStatus: true })).toThrow(/ROUTE_INVALID: readsStatus/);
    expect(() => ok({ method: 'GET', path: '/x', scope: 'kit', kit: 'egress', index: 1, readsStatus: true })).toThrow(/ROUTE_INVALID: readsStatus/);
    expect(() => ok({ method: 'POST', path: '/x', scope: 'agent', readsStatus: false as unknown as true })).toThrow(/ROUTE_INVALID: readsStatus/);
  });
  it.each([200, 201, 202])('a route that declares it resolves {status: %i, body}', async (status) => {
    boot({ realm: R1 });
    onFetch(() => ({ status, body: { a: 1 } }));
    const route = ok({ method: 'POST', path: '/rs/stop/:id', scope: 'agent', body: [], readsStatus: true });
    expect(await api(route, { params: { id: 's' } })).toEqual({ status, body: { a: 1 } });
    expect(await call(route, { params: { id: 's' } }, true)).toEqual({ ok: true, body: { status, body: { a: 1 } } });
  });
  it.each([200, 202])('a route without it is unchanged: a %i resolves the body alone', async (status) => {
    boot({ realm: R1 });
    onFetch(() => ({ status, body: { a: 1 } }));
    const post = ok({ method: 'POST', path: '/rs/plain/:id', scope: 'agent', body: [] });
    const get = ok({ method: 'GET', path: '/rs/read/:id', scope: 'agent' });
    expect(await api(post, { params: { id: 's' } })).toEqual({ a: 1 });
    expect(await api(get, { params: { id: 's' } })).toEqual({ a: 1 });
    expect(await call(get, { params: { id: 's' } })).toEqual({ ok: true, body: { a: 1 } });
  });
  it('a refusal of a route that declares it is the ordinary rejection (no status wrapper)', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 404, body: { code: 'bash_job_not_found', message: 'x' } }));
    const route = ok({ method: 'POST', path: '/rs/gone/:id', scope: 'agent', body: [], readsStatus: true });
    const r = await call(route, { params: { id: 's' } }, true);
    expect(r).toMatchObject({ ok: false, err: { status: 404, code: 'bash_job_not_found' } });
  });
});
