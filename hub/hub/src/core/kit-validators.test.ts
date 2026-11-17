// A kit HEAD answers its validators only (ETag, Last-Modified, Content-Length), read from
// the answer's headers; no body is read. A value that is not well formed is null, never guessed. Also the route
// timeout bound: a timeout the browser's timer cannot hold (over 2^31-1 ms) is refused at declaration, so a
// long route (6 h, the copy and hash calls) keeps its own.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { run } from './kit-io';
import { defineRoute } from './routes';
import { boot, calls, onFetch, R1, TARGET } from './test/env';

afterEach(() => { vi.restoreAllMocks(); });

const head = () => defineRoute({ method: 'HEAD', path: '/api/v1/files/*path', scope: 'kit', kit: 'files', index: 1 });

describe('kit HEAD: validators only', () => {
  it('returns ETag, Last-Modified and Content-Length from the headers, and nothing from a body', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, headers: { etag: 'W/"6a-1f-2c"', 'last-modified': 'Sun, 25 Oct 2026 16:00:00 GMT', 'content-length': '1048576', 'x-other': 'no' }, body: { leaked: true } }));
    const v = await api(head(), { params: { path: ['home', 'me', 'a.txt'] } });
    expect(calls[0]!.method).toBe('HEAD');
    expect(v).toEqual({ etag: 'W/"6a-1f-2c"', lastModified: 'Sun, 25 Oct 2026 16:00:00 GMT', contentLength: 1048576 });
    expect(Object.isFrozen(v)).toBe(true);
  });

  it('a strong ETag is kept as sent', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, headers: { etag: '"abc123"', 'content-length': '0' } }));
    expect(await api(head(), { params: { path: ['x'] } })).toEqual({ etag: '"abc123"', lastModified: null, contentLength: 0 });
  });

  it.each([
    ['abc', 'unquoted'],
    ['"a"b"', 'quote inside'],
    ['W/abc', 'weak, unquoted'],
    ['"a\u0001b"', 'control character'],
    ['"' + 'x'.repeat(300) + '"', 'over the bound'],
  ])('an ETag that is not an entity tag (%s: %s) is null', async (etag) => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, headers: { etag } }));
    expect(await api(head(), { params: { path: ['x'] } })).toMatchObject({ etag: null });
  });

  it.each([['-1'], ['1.5'], ['12abc'], [''], ['99999999999999999999'], ['9999999999999999']])('a Content-Length of %j is null', async (len) => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, headers: { etag: '"e"', 'content-length': len } }));
    expect(await api(head(), { params: { path: ['x'] } })).toMatchObject({ contentLength: null });
  });

  it.each([
    ['yesterday-ish'],
    ['0'],
    ['2026-02-30'],
    ['2026-10-25T16:00:00Z'],
    ['Sat, 25 Oct 2026 16:00:00 GMT'],
    ['Sat, 30 Feb 2026 16:00:00 GMT'],
    ['Mon, 30 Feb 2026 16:00:00 GMT'],
    ['Sun, 25 Oct 2026 16:60:00 GMT'],
    ['Sun, 25 Oct 2026 16:00:60 GMT'],
    ['Sun, 25 Oct 2026 24:00:00 GMT'],
    ['Sun, 25 Oct 2026 16:00:00 UTC'],
    ['Mon, 5 Oct 2026 16:00:00 GMT'],
    ['Sunday, 25-Oct-26 16:00:00 GMT'],
    ['Sun Oct 25 16:00:00 2026'],
  ])('a Last-Modified that is not an IMF-fixdate (%j) is null', async (lm) => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, headers: { 'last-modified': lm } }));
    expect(await api(head(), { params: { path: ['x'] } })).toMatchObject({ lastModified: null });
  });

  it('an IMF-fixdate is kept as sent (a leap day included)', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, headers: { 'last-modified': 'Thu, 29 Feb 2024 00:00:00 GMT' } }));
    expect(await api(head(), { params: { path: ['x'] } })).toMatchObject({ lastModified: 'Thu, 29 Feb 2024 00:00:00 GMT' });
  });

  it('the body is never read: no reader, no arrayBuffer, text or json', async () => {
    boot({ realm: R1 });
    const reads = [
      vi.spyOn(ReadableStream.prototype, 'getReader'),
      vi.spyOn(Response.prototype, 'arrayBuffer'),
      vi.spyOn(Response.prototype, 'text'),
      vi.spyOn(Response.prototype, 'json'),
    ];
    onFetch(() => ({ status: 200, headers: { etag: '"e"', 'content-length': '5' }, body: { leaked: true } }));
    expect(await api(head(), { params: { path: ['x'] } })).toEqual({ etag: '"e"', lastModified: null, contentLength: 5 });
    for (const r of reads) expect(r).not.toHaveBeenCalled();
  });

  it('a HEAD for a file larger than the answer bound still answers its validators', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, headers: { etag: '"big"', 'content-length': String(50 * 1024 ** 3) } }));
    expect(await api(head(), { params: { path: ['x'] } })).toMatchObject({ contentLength: 50 * 1024 ** 3 });
  });

  it('a refused HEAD is still a rejection (404 is not a set of empty validators)', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 404, headers: { etag: '"e"' } }));
    await expect(api(head(), { params: { path: ['gone'] } })).rejects.toMatchObject({ status: 404 });
  });

  it('a redirected HEAD is a redirected rejection, never validators', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 302, headers: { location: 'https://elsewhere.test/', etag: '"e"', 'content-length': '5' } }));
    await expect(api(head(), { params: { path: ['x'] } })).rejects.toMatchObject({ kind: 'redirected', status: 302 });
    expect(calls).toHaveLength(1);
  });

  // kit.ts answers validators only for a plain HEAD (no raw read, no run route). run() sets both, but RunOptions types its method
  // without HEAD, so a HEAD run route is reachable only by a caller that casts: the cast below is deliberate, to pin that the
  // exclusion holds if a run route is ever declared HEAD. download() takes GET routes only, so a raw 'ok' HEAD has no caller.
  it('a HEAD on a run route answers the run envelope (any status, body read), not validators', async () => {
    boot({ realm: R1 });
    const runHead = defineRoute({ method: 'HEAD', path: '/', scope: 'kit', kit: 'exec', index: 1, run: true });
    onFetch(() => ({ status: 200, headers: { etag: '"e"', 'content-length': '2', 'content-type': 'text/plain' }, text: 'ok' }));
    const a = await run(runHead, TARGET, '/probe', { method: 'HEAD' as never });
    expect(a).toMatchObject({ status: 200, body: 'ok', size: 2 });
    expect(a).not.toHaveProperty('etag');
    onFetch(() => ({ status: 500, headers: { 'content-type': 'text/plain' }, text: 'boom' }));
    expect(await run(runHead, TARGET, '/probe', { method: 'HEAD' as never })).toMatchObject({ status: 500, body: 'boom', size: 4 });
  });

  it('a GET answer is unchanged (its JSON body)', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, headers: { etag: '"e"' }, body: { entries: [] } }));
    const get = defineRoute({ method: 'GET', path: '/api/v1/files/*path', scope: 'kit', kit: 'files', index: 1 });
    expect(await api(get, { params: { path: ['x'] } })).toEqual({ entries: [] });
  });
});

describe('route timeouts', () => {
  it('a 6 h kit route is declared; one past what a browser timer holds is refused', () => {
    expect(defineRoute({ method: 'POST', path: '/api/v1/files/copy/*path', scope: 'kit', kit: 'files', index: 1, timeoutMs: 6 * 3600_000 }).timeoutMs).toBe(6 * 3600_000);
    expect(() => defineRoute({ method: 'POST', path: '/api/v1/files/move/*path', scope: 'kit', kit: 'files', index: 1, timeoutMs: 2 ** 31 })).toThrow();
  });
});
