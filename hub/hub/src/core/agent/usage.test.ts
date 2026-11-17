// The usage route through the real core over a fake fetch: wire shape, the cursor, settled failures.
import { beforeEach, describe, expect, it } from 'vitest';
import { AGENT, boot, calls, onFetch, R1 } from '../test/env';
import { usageApi, usageRoutes } from './usage';

beforeEach(() => boot({ realm: R1 }));

describe('usageApi.session', () => {
  it('GET /sessions/{id}/usage with no query on the first page, in the context realm', async () => {
    onFetch(() => ({ status: 200, body: { items: [], next_after_id: 0, has_more: false } }));
    const r = await usageApi().session('s-1');
    expect(r).toMatchObject({ ok: true });
    const u = new URL(calls[0]!.url);
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url.startsWith(`${AGENT}/sessions/s-1/usage`)).toBe(true);
    expect(u.searchParams.get('after_id')).toBeNull();
    expect(u.searchParams.get('realm')).toBe(R1);
  });
  it('sends the exclusive cursor and the limit; a zero cursor is no cursor', async () => {
    onFetch(() => ({ status: 200, body: {} }));
    await usageApi().session('s-1', { after: 412, limit: 500 });
    await usageApi().session('s-1', { after: 0 });
    const a = new URL(calls[0]!.url), b = new URL(calls[1]!.url);
    expect([a.searchParams.get('after_id'), a.searchParams.get('limit')]).toEqual(['412', '500']);
    expect(b.searchParams.get('after_id')).toBeNull();
  });
  it('a session id that is not one path part is refused unsent', async () => {
    const r = await usageApi().session('a/b');
    expect(r).toMatchObject({ ok: false, err: { kind: 'not_sent' } });
    expect(calls.length).toBe(0);
  });
  it('a 404 is a failed read; a lost answer is a failed read too (a read is never pending)', async () => {
    onFetch(() => ({ status: 404, body: { code: 'not_found' } }));
    expect(await usageApi().session('s-1')).toMatchObject({ ok: false, err: { kind: 'failed', status: 404 } });
    onFetch(() => ({ status: 200, network: true }));
    const r = await usageApi().session('s-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.err.kind).not.toBe('pending');
  });
  it('declares the route once, on the agent', () => {
    expect(`${usageRoutes.session.method} ${usageRoutes.session.path} ${usageRoutes.session.scope}`).toBe('GET /sessions/:id/usage agent');
  });
});
