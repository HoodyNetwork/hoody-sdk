// The core request options: an If-Match header on Hoody API changes (proxy
// permissions), and a text/plain body on kit routes (the egress upstream).
import { describe, expect, it } from 'vitest';
import { api, outcomeOf } from './api';
import { defineRoute, MAX_BODY_TEXT } from './routes';
import { bump } from './ctx';
import { boot, calls, DOMAIN, onFetch, PROXY, R1, sessionToken, TARGET, UID } from './test/env';

const access = defineRoute<unknown, { groups: unknown[] }>({ method: 'PUT', path: '/computers/:id/proxy/permissions', scope: 'realm', body: ['groups'], ifMatch: true });
const plain = defineRoute<unknown, { name: string }>({ method: 'PATCH', path: '/computers/:id', scope: 'realm', body: ['name'] });
const upstream = defineRoute<unknown, string>({ method: 'PUT', path: '/api/v1/egress/upstream', scope: 'kit', kit: 'egress', index: 1, bodyText: true });
const kitJson = defineRoute<unknown, { a: string }>({ method: 'PUT', path: '/api/v1/egress/x', scope: 'kit', kit: 'egress', index: 1, body: ['a'] });

const put = (ifMatch: unknown) => api(access, { params: { id: 'c1' }, body: { groups: [] }, ifMatch: ifMatch as string });

describe('routes: ifMatch and bodyText declarations', () => {
  it('ifMatch only on a base/realm change; bodyText only on a kit POST/PUT/PATCH without body keys', () => {
    expect(() => defineRoute({ method: 'GET', path: '/x', scope: 'realm', ifMatch: true })).toThrow(/ROUTE_INVALID/);
    expect(() => defineRoute({ method: 'PUT', path: '/x', scope: 'kit', kit: 'egress', index: 1, ifMatch: true })).toThrow(/ROUTE_INVALID/);
    expect(() => defineRoute({ method: 'PUT', path: '/x', scope: 'agent', ifMatch: true })).toThrow(/ROUTE_INVALID/);
    expect(() => defineRoute({ method: 'PUT', path: '/x', scope: 'realm', ifMatch: false as unknown as true })).toThrow(/ROUTE_INVALID/);
    expect(defineRoute({ method: 'DELETE', path: '/x', scope: 'base', ifMatch: true }).ifMatch).toBe(true);
    expect(() => defineRoute({ method: 'PUT', path: '/x', scope: 'realm', bodyText: true })).toThrow(/ROUTE_INVALID/);
    expect(() => defineRoute({ method: 'GET', path: '/x', scope: 'kit', kit: 'egress', index: 1, bodyText: true })).toThrow(/ROUTE_INVALID/);
    expect(() => defineRoute({ method: 'DELETE', path: '/x', scope: 'kit', kit: 'egress', index: 1, bodyText: true })).toThrow(/ROUTE_INVALID/);
    expect(() => defineRoute({ method: 'PUT', path: '/x', scope: 'kit', kit: 'egress', index: 1, bodyText: true, body: ['a'] })).toThrow(/ROUTE_INVALID/);
    expect(() => defineRoute({ method: 'PUT', path: '/x', scope: 'kit', kit: 'egress', index: 1, bodyText: true, secret: ['a'] })).toThrow(/ROUTE_INVALID/);
    // Never on a run or stream route (their legs send JSON).
    expect(() => defineRoute({ method: 'POST', path: '/x', scope: 'kit', kit: 'exec', index: 1, bodyText: true, run: true })).toThrow(/ROUTE_INVALID: bodyText/);
    expect(() => defineRoute({ method: 'POST', path: '/x', scope: 'kit', kit: 'exec', index: 1, bodyText: true, stream: { kind: 'sse' } as never })).toThrow(/ROUTE_INVALID: bodyText/);
    // A pending idempotent change keeps a digest of its variables (keyBytes): never of a text body.
    for (const idem of [true, 'Idempotency-Key', 'X-Idempotency-Key'] as const) expect(() => defineRoute({ method: 'PUT', path: '/x', scope: 'kit', kit: 'egress', index: 1, bodyText: true, idem })).toThrow(/ROUTE_INVALID: bodyText/);
    expect(() => defineRoute({ method: 'PUT', path: '/x', scope: 'kit', kit: 'egress', index: 1, bodyText: true, idem: false })).not.toThrow();
    expect(upstream).toMatchObject({ bodyText: true, secret: true, ifMatch: false });
    expect(plain).toMatchObject({ bodyText: false, ifMatch: false });
  });
});

describe('If-Match on Hoody API changes', () => {
  it('the value goes out as the If-Match header on the realm host', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: { data: {} } }));
    await put('file:v3');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`https://${R1}.${DOMAIN}/api/v1/computers/c1/proxy/permissions`);
    expect(calls[0]!.headers['if-match']).toBe('file:v3');
  });
  it('missing or not one strong token: refused unsent (IF_MATCH_INVALID)', async () => {
    boot({ realm: R1 });
    for (const v of [undefined, null, '', '"file:v3"', 'W/"x"', 'a,b', 'a b', 'file:v3\r\nX-Evil: 1', 'x'.repeat(129), 'é', 3]) {
      await expect(put(v)).rejects.toMatchObject({ notSent: true, code: 'IF_MATCH_INVALID' });
    }
    await expect(put('x'.repeat(128))).resolves.toBeDefined();
    expect(calls).toHaveLength(1);
  });
  it('the value checked is the value sent: a getter or a body\'s toJSON cannot drop it after the check', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: { data: {} } }));
    let reads = 0;
    const input = { params: { id: 'c1' }, body: { groups: [] as unknown[] }, get ifMatch() { return ++reads <= 1 ? 'file:v3' : undefined; } };
    await api(access, input as never);
    const input2: Record<string, unknown> = { params: { id: 'c1' }, ifMatch: 'file:v4' };
    input2.body = { groups: [], toJSON() { delete input2.ifMatch; return { groups: [] }; } };
    await api(access, input2 as never);
    expect(calls.map((c) => c.headers['if-match'])).toEqual(['file:v3', 'file:v4']);
  });
  it('a value on a route that takes none is refused, as an idempotency key is', async () => {
    boot({ realm: R1 });
    await expect(api(plain, { params: { id: 'c1' }, body: { name: 'a' }, ifMatch: 'file:v1' })).rejects.toMatchObject({ notSent: true, code: 'IF_MATCH_INVALID' });
    await expect(api(upstream, { target: TARGET, body: 'x', ifMatch: 'file:v1' })).rejects.toMatchObject({ notSent: true, code: 'IF_MATCH_INVALID' });
    expect(calls).toHaveLength(0);
    await api(plain, { params: { id: 'c1' }, body: { name: 'a' } });
    expect(calls[0]!.headers['if-match']).toBeUndefined();
  });
  it('412 and 428 are definite refusals (nothing changed), never pending', async () => {
    boot({ realm: R1 });
    for (const [status, code] of [[412, 'PRECONDITION_FAILED'], [428, 'PRECONDITION_REQUIRED']] as const) {
      onFetch(() => ({ status, body: { error: code } }));
      const e = await put('file:v3').then(() => null, (x: unknown) => x);
      expect(e).toMatchObject({ status, code });
      expect((e as { pending?: boolean }).pending).toBeFalsy();
      expect(outcomeOf(e, true)).toBe('failed');
    }
  });
  it('a 412 or 428 that arrives after the context died is pending (it may answer a repeat of a change that went through)', async () => {
    for (const [status, code] of [[412, 'PRECONDITION_FAILED'], [428, 'PRECONDITION_REQUIRED']] as const) {
      boot({ realm: R1 });
      onFetch(() => { bump('switch'); return { status, body: { error: code } }; });
      const e = await put('file:v3').then(() => null, (x: unknown) => x);
      expect((e as { pending?: boolean }).pending).toBe(true);
      expect(outcomeOf(e, true)).toBe('pending');
    }
    // A lost answer or a 5xx after the context died stays pending too.
    boot({ realm: R1 });
    onFetch(() => { bump('switch'); return { status: 502, body: {} }; });
    expect(outcomeOf(await put('file:v3').then(() => null, (x: unknown) => x), true)).toBe('pending');
  });
  it('a retry of the same request (another tab rotated the token) carries the same If-Match', async () => {
    boot({ realm: R1 });
    let n = 0;
    onFetch(() => {
      if (++n === 1) {
        localStorage.setItem('access_token', sessionToken(UID, { sid: 'sid0000000000001', exp: Math.floor(Date.now() / 1000) + 3600, r: 2 }));
        return { status: 401, body: { error: 'UNAUTHORIZED' } };
      }
      return { status: 200, body: { data: {} } };
    });
    await put('file:v7');
    expect(calls.map((c) => c.headers['if-match'])).toEqual(['file:v7', 'file:v7']);
  });
});

describe('text/plain bodies on kit routes', () => {
  /** The test fetch parses JSON bodies; a text body is captured as it is here. */
  const sent: { url: string; body: unknown; type: string | null }[] = [];
  const textFetch = () => {
    sent.length = 0;
    globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
      sent.push({ url: String(url), body: init.body, type: new Headers(init.headers || {}).get('content-type') });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
  };
  it('the string goes out as it is, text/plain, to the program\'s address', async () => {
    boot({ realm: R1 });
    textFetch();
    await api(upstream, { target: TARGET, body: 'socks5://u%40x:p%3Aw@10.0.0.2:1080' });
    expect(sent).toEqual([{ url: `https://p1-c1-egress-1.sv1.${PROXY}/api/v1/egress/upstream`, body: 'socks5://u%40x:p%3Aw@10.0.0.2:1080', type: 'text/plain; charset=utf-8' }]);
  });
  it('a non-string, missing or too long body is refused unsent (ROUTE_BODY); a JSON route still refuses a string', async () => {
    boot({ realm: R1 });
    textFetch();
    for (const body of [undefined, null, { a: 'x' }, ['x'], 7, 'x'.repeat(MAX_BODY_TEXT + 1)]) {
      await expect(api(upstream, { target: TARGET, body: body as string })).rejects.toMatchObject({ notSent: true, code: 'ROUTE_BODY' });
    }
    await expect(api(kitJson, { target: TARGET, body: 'a' as unknown as { a: string } })).rejects.toMatchObject({ notSent: true, code: 'ROUTE_BODY' });
    expect(sent).toHaveLength(0);
    await api(upstream, { target: TARGET, body: 'x'.repeat(MAX_BODY_TEXT) });
    await api(upstream, { target: TARGET, body: '' });
    expect(sent.map((s) => (s.body as string).length)).toEqual([MAX_BODY_TEXT, 0]);
  });
  it('a refusal of a text body route keeps only safe fields: the answer\'s data is dropped', async () => {
    boot({ realm: R1 });
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'bad_upstream', echo: 'socks5://u:secret@h' }), { status: 400, headers: { 'content-type': 'application/json' } })) as typeof fetch;
    const e = await api(upstream, { target: TARGET, body: 'socks5://u:secret@h:1' }).then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ status: 400 });
    expect(JSON.stringify(e)).not.toContain('secret');
  });
});
