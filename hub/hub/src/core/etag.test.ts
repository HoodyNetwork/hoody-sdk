// An optional ETag precondition (etagMatch routes) and the answer's ETag handed to the
// caller (onEtag). Hard rule: a server that sends no ETag sees exactly today's requests (no header added).
import { describe, expect, it } from 'vitest';
import { api, outcomeOf } from './api';
import { bump } from './ctx';
import { defineRoute } from './routes';
import { boot, calls, onFetch, R1, sessionToken, UID } from './test/env';

const TAG = '"abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"';
const doc = defineRoute<unknown>({ method: 'GET', path: '/vault/keys/:key', scope: 'base' });
const put = defineRoute<unknown, { value: string }>({ method: 'PUT', path: '/vault/keys/:key', scope: 'base', body: ['value'], etagMatch: true });
const kitRead = defineRoute<unknown>({ method: 'GET', path: '/api/v1/x', scope: 'kit', kit: 'egress', index: 1 });
const send = (ifMatch: unknown) => api(put, { params: { key: 'k' }, body: { value: 'v' }, ifMatch: ifMatch as string });

describe('routes: etagMatch declarations', () => {
  it('only on a base/realm change, never beside ifMatch', () => {
    expect(defineRoute({ method: 'PUT', path: '/x', scope: 'realm', etagMatch: true }).etagMatch).toBe(true);
    expect(defineRoute({ method: 'PUT', path: '/x', scope: 'realm' }).etagMatch).toBe(false);
    expect(() => defineRoute({ method: 'GET', path: '/x', scope: 'base', etagMatch: true })).toThrow(/ROUTE_INVALID: etagMatch/);
    expect(() => defineRoute({ method: 'PUT', path: '/x', scope: 'agent', etagMatch: true })).toThrow(/ROUTE_INVALID: etagMatch/);
    expect(() => defineRoute({ method: 'PUT', path: '/x', scope: 'kit', kit: 'egress', index: 1, etagMatch: true })).toThrow(/ROUTE_INVALID: etagMatch/);
    expect(() => defineRoute({ method: 'PUT', path: '/x', scope: 'base', etagMatch: true, ifMatch: true })).toThrow(/ROUTE_INVALID: etagMatch/);
    expect(() => defineRoute({ method: 'PUT', path: '/x', scope: 'base', etagMatch: false as unknown as true })).toThrow(/ROUTE_INVALID: etagMatch/);
  });
});

describe('If-Match with an ETag (etagMatch routes)', () => {
  it('no value (absent or null): no If-Match header at all, as today', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: {} }));
    await send(undefined);
    await send(null);
    expect(calls.map((c) => c.headers['if-match'])).toEqual([undefined, undefined]);
    expect(calls.map((c) => c.headers['if-none-match'])).toEqual([undefined, undefined]);
  });
  it('the ETag goes out exactly as received, quotes included', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: {} }));
    await send(TAG);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers['if-match']).toBe(TAG);
  });
  it('anything but one quoted strong ETag is refused unsent (IF_MATCH_INVALID)', async () => {
    boot({ realm: R1 });
    for (const v of ['', 'file:v3', 'W/"x"', '*', '"a b"', '"a,b"', '"x"\r\nX-Evil: 1', '"' + 'x'.repeat(129) + '"', '"é"', '""', '"x', 3, {}]) {
      await expect(send(v)).rejects.toMatchObject({ notSent: true, code: 'IF_MATCH_INVALID' });
    }
    expect(calls).toHaveLength(0);
  });
  it('a 412 is a definite refusal (nothing saved), never pending; sent once', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 412, body: { error: 'PRECONDITION_FAILED' } }));
    const e = await send(TAG).then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ status: 412, code: 'PRECONDITION_FAILED' });
    expect((e as { pending?: boolean }).pending).toBeFalsy();
    expect(outcomeOf(e, true)).toBe('failed');
    expect(calls).toHaveLength(1);
  });
  it('a retry of the same request (another tab rotated the token) carries the same ETag', async () => {
    boot({ realm: R1 });
    let n = 0;
    onFetch(() => {
      if (++n === 1) {
        localStorage.setItem('access_token', sessionToken(UID, { sid: 'sid0000000000001', exp: Math.floor(Date.now() / 1000) + 3600, r: 2 }));
        return { status: 401, body: { error: 'UNAUTHORIZED' } };
      }
      return { status: 200, body: {} };
    });
    await send(TAG);
    expect(calls.map((c) => c.headers['if-match'])).toEqual([TAG, TAG]);
  });
});

describe('If-None-Match: * (etagMatch routes, create only)', () => {
  const create = (v: unknown, ifMatch?: unknown) => api(put, { params: { key: 'k' }, body: { value: 'v' }, ifNoneMatch: v as '*', ...(ifMatch !== undefined ? { ifMatch: ifMatch as string } : {}) });
  it('\'*\' goes out as If-None-Match: *, with no If-Match; absent or null sends neither', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 201, body: {} }));
    await create('*');
    await create(undefined);
    await create(null);
    expect(calls.map((c) => c.headers['if-none-match'])).toEqual(['*', undefined, undefined]);
    expect(calls.map((c) => c.headers['if-match'])).toEqual([undefined, undefined, undefined]);
  });
  it('any other value, beside an If-Match value, or on a route without etagMatch: refused unsent (IF_MATCH_INVALID)', async () => {
    boot({ realm: R1 });
    for (const v of ['', 'W/"x"', TAG, '**', 1, {}]) await expect(create(v)).rejects.toMatchObject({ notSent: true, code: 'IF_MATCH_INVALID' });
    await expect(create('*', TAG)).rejects.toMatchObject({ notSent: true, code: 'IF_MATCH_INVALID' });
    const plain = defineRoute<unknown, { value: string }>({ method: 'PUT', path: '/vault/keys/:key', scope: 'base', body: ['value'] });
    await expect(api(plain, { params: { key: 'k' }, body: { value: 'v' }, ifNoneMatch: '*' })).rejects.toMatchObject({ notSent: true, code: 'IF_MATCH_INVALID' });
    expect(calls).toHaveLength(0);
  });
  it('a 412 (it exists) is a definite refusal, never pending; sent once', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 412, body: { error: 'PRECONDITION_FAILED' } }));
    const e = await create('*').then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ status: 412, code: 'PRECONDITION_FAILED' });
    expect(outcomeOf(e, true)).toBe('failed');
    expect(calls).toHaveLength(1);
  });
  it('a retry of the same request (another tab rotated the token) carries it again', async () => {
    boot({ realm: R1 });
    let n = 0;
    onFetch(() => {
      if (++n === 1) {
        localStorage.setItem('access_token', sessionToken(UID, { sid: 'sid0000000000001', exp: Math.floor(Date.now() / 1000) + 3600, r: 2 }));
        return { status: 401, body: { error: 'UNAUTHORIZED' } };
      }
      return { status: 201, body: {} };
    });
    await create('*');
    expect(calls.map((c) => c.headers['if-none-match'])).toEqual(['*', '*']);
  });
});

describe('the answer\'s ETag (onEtag)', () => {
  const read = (onEtag: unknown) => api(doc, { params: { key: 'k' }, onEtag: onEtag as (t: string | null) => void });
  it('a success answer hands over its strong ETag exactly; none, a weak or a malformed one is null', async () => {
    for (const [header, want] of [[TAG, TAG], [undefined, null], ['W/' + TAG, null], ['abc', null], ['*', null], [`${TAG}, "b"`, null]] as const) {
      boot({ realm: R1 });
      onFetch(() => ({ status: 200, body: { data: {} }, ...(header ? { headers: { etag: header } } : {}) }));
      const got: Array<string | null> = [];
      await read((t: string | null) => got.push(t));
      expect(got).toEqual([want]);
    }
  });
  it('never on a refusal or a lost answer', async () => {
    for (const r of [{ status: 404, body: {}, headers: { etag: TAG } }, { status: 0, network: true }] as const) {
      boot({ realm: R1 });
      onFetch(() => r);
      const got: unknown[] = [];
      await read((t: string | null) => got.push(t)).catch(() => undefined);
      expect(got).toEqual([]);
    }
  });
  it('never for an answer that arrives after the context moved on', async () => {
    boot({ realm: R1 });
    onFetch(() => { bump('switch'); return { status: 200, body: {}, headers: { etag: TAG } }; });
    const got: unknown[] = [];
    await read((t: string | null) => got.push(t)).catch(() => undefined);
    expect(got).toEqual([]);
  });
  it('a change\'s answer hands over its ETag too (the next change of the same document)', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: {}, headers: { etag: TAG } }));
    const got: unknown[] = [];
    await api(put, { params: { key: 'k' }, body: { value: 'v' }, onEtag: (t) => { got.push(t); } });
    expect(got).toEqual([TAG]);
  });
  it('a caller\'s throwing callback does not turn the answer into a failure', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: { data: { a: 1 } }, headers: { etag: TAG } }));
    await expect(read(() => { throw new Error('caller'); })).resolves.toEqual({ data: { a: 1 } });
  });
  it('not a function, or on a kit or agent route: refused unsent', async () => {
    boot({ realm: R1 });
    await expect(read('x')).rejects.toMatchObject({ notSent: true, code: 'IF_MATCH_INVALID' });
    await expect(api(kitRead, { onEtag: () => undefined })).rejects.toMatchObject({ notSent: true, code: 'IF_MATCH_INVALID' });
    expect(calls).toHaveLength(0);
  });
  it('without onEtag nothing changes: the answer as before', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: { data: { a: 1 } }, headers: { etag: TAG } }));
    await expect(api(doc, { params: { key: 'k' } })).resolves.toEqual({ data: { a: 1 } });
  });
});
