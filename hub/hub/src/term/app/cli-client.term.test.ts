// The HoodyClient adapter against a loopback fake API
// (Bun.serve on 127.0.0.1) and a second loopback listener standing for "anywhere else". A bearer canary must reach the
// API and nothing else.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | The bytes sent are the canonical JSON that `beforeWire` saw digested; URL and method as attempted | 'canonical bytes' |
// | 2 | A redirect is refused before it is followed: the canary never reaches the other listener | 'redirect refused' |
// | 3 | beforeWire false, an aborted signal, a moved session, a bad base/path/body: nothing reaches the API | 'nothing sent' |
// | 4 | Realm hosts: exactly `https://<id>.<realmApiDomain>/api/v1`; anything else refused | 'realm base' |
// | 5 | A refusal carries status, code, data, retryAfter; If-Match sent; ETag handed back; 204 → null | 'answers' |
// | 5b | `ifNoneMatch: '*'` is sent as If-None-Match: *; a call without it sends none | 'if-none-match' |
// | 6 | Kit/agent fetch: nothing added (no bearer, no cookie); never the API's places; no redirect | 'kit fetch' |
// | 7 | Headers by leg (admission row 4): agent sends X-Hoody-Cwd and X-Hoody-Approver-Lease, kit X-Hoody-Pipe and its sender key, as given; any other X-Hoody-*, a cookie or Proxy-Authorization is refused unsent | 'computer headers by leg' |
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import type { ClientCallControls, WireAttempt } from '../host-types';
import { cliHoodyClient, fetchWire, type CliClientDeps, type WireRequest } from './cli-client';

const CANARY = 'hdy_CANARYcanary0123456789abcdef';
const UID = '64f0ada00000000000000001';
const REALM = '64f0ada000000000000000aa';
const sha = (v: string | Uint8Array): string => createHash('sha256').update(v).digest('hex');

interface Hit { method: string; path: string; auth: string | null; ifMatch: string | null; body: string }
const apiHits: Hit[] = [], otherHits: Hit[] = [];
let api: ReturnType<typeof Bun.serve>, other: ReturnType<typeof Bun.serve>;
let API = '', OTHER = '';

beforeAll(() => {
  other = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(req) {
    otherHits.push({ method: req.method, path: new URL(req.url).pathname, auth: req.headers.get('authorization'), ifMatch: null, body: await req.text() });
    return new Response('{}', { status: 200 });
  } });
  OTHER = `http://127.0.0.1:${other.port}`;
  api = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(req) {
    const p = new URL(req.url).pathname;
    apiHits.push({ method: req.method, path: p, auth: req.headers.get('authorization'), ifMatch: req.headers.get('if-match'), body: await req.text() });
    if (p === '/api/v1/redirect') return new Response(null, { status: 302, headers: { location: `${OTHER}/steal` } });
    if (p === '/api/v1/refuse') return new Response(JSON.stringify({ statusCode: 409, error: 'SOME_CODE', message: 'refused', data: { a: 1 } }), { status: 409, headers: { 'retry-after': '3', 'x-trace-id': '0123456789abcdef0123' } });
    if (p === '/api/v1/generic') return new Response(JSON.stringify({ statusCode: 404, error: 'Not Found', message: 'Route GET:/x not found' }), { status: 404 });
    if (p === '/api/v1/legacy') return new Response(JSON.stringify({ code: 'OLD_CODE' }), { status: 400 });
    if (p === '/api/v1/empty') return new Response(null, { status: 204, headers: { etag: 'W/"e1"' } });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json', etag: '"v7"' } });
  } });
  API = `http://127.0.0.1:${api.port}`;
});
afterAll(() => { api.stop(true); other.stop(true); });

function client(over: Partial<CliClientDeps> = {}) {
  let sid = 's1';
  const c = cliHoodyClient({ identity: { kind: 'account', uid: UID, sid: 's1', source: 'login' }, apiOrigin: API, realmApiDomain: 'realms.example.invalid', proxyDomain: 'computers.example.invalid', currentSid: () => sid, bearer: () => CANARY, wire: fetchWire, ...over });
  return { c, moveSid: () => { sid = 's2'; } };
}
function controls(seen: WireAttempt[] = [], ok = true, signal: AbortSignal = new AbortController().signal): ClientCallControls {
  return { session: { sid: 's1', generation: 1 }, signal, beforeWire: (a) => { if (a) seen.push(a); return ok; } };
}
const reset = (): void => { apiHits.length = 0; otherHits.length = 0; };

describe('the HoodyClient adapter', () => {
  test('canonical bytes', async () => {
    reset();
    const seen: WireAttempt[] = [];
    const { c } = client();
    expect(await c.request('post', '/echo?x=1', { b: 1, a: [2, { d: 1, c: 2 }], u: undefined }, controls(seen))).toEqual({ ok: true });
    const want = '{"a":[2,{"c":2,"d":1}],"b":1}';
    expect(apiHits).toEqual([{ method: 'POST', path: '/api/v1/echo', auth: `Bearer ${CANARY}`, ifMatch: null, body: want }]);
    expect(seen).toEqual([{ method: 'POST', url: `${API}/api/v1/echo?x=1`, bodyDigest: sha(want) }]);
    // No body: no digest, nothing sent as a body.
    seen.length = 0;
    await c.request('GET', '/ok', null, controls(seen));
    expect(seen[0]!.bodyDigest).toBeNull();
    expect(apiHits[1]!.body).toBe('');
  });

  test('redirect refused', async () => {
    reset();
    const { c } = client();
    await expect(c.request('GET', '/redirect', null, controls())).rejects.toEqual({ status: 302, redirect: true });
    expect(apiHits.map((h) => h.path)).toEqual(['/api/v1/redirect']);
    expect(otherHits).toEqual([]);
  });

  test('nothing sent', async () => {
    reset();
    const { c, moveSid } = client();
    await expect(c.request('GET', '/ok', null, controls([], false))).rejects.toEqual({ status: 0, notSent: true, stale: true });
    const ac = new AbortController(); ac.abort();
    await expect(c.request('GET', '/ok', null, controls([], true, ac.signal))).rejects.toEqual({ status: 0, notSent: true, stale: true });
    for (const [path, body, base] of [['ok', null, undefined], ['/ok#frag', null, undefined], ['/ok', { n: Number.NaN }, undefined], ['/ok', new Date(0), undefined], ['/ok', null, `${OTHER}/api/v1`], ['/ok', null, 'https://evil.example/api/v1'], ['/ok', null, `https://${REALM}.realms.example.invalid.evil/api/v1`], ['/ok', null, `https://${REALM}.realms.example.invalid/api/v2`]] as const) {
      await expect(c.request('GET', path, body, { ...controls(), ...(base !== undefined ? { base } : {}) })).rejects.toEqual({ status: 0, notSent: true });
    }
    // No credential: nothing sent.
    await expect(client({ bearer: () => null }).c.request('GET', '/ok', null, controls())).rejects.toEqual({ status: 0, notSent: true });
    // An API origin that is not an origin: nothing sent.
    await expect(client({ apiOrigin: `${API}/x` }).c.request('GET', '/ok', null, controls())).rejects.toEqual({ status: 0, notSent: true });
    moveSid();
    await expect(c.request('GET', '/ok', null, controls())).rejects.toEqual({ status: 401, superseded: true, notSent: true });
    // The session is judged first: a moved session with a bad path is still 'superseded'.
    await expect(c.request('GET', 'bad', null, controls())).rejects.toEqual({ status: 401, superseded: true, notSent: true });
    // The session moves inside beforeWire (a login while the call was being built): still nothing sent.
    const second = client();
    await expect(second.c.request('GET', '/ok', null, { ...controls(), beforeWire: () => { second.moveSid(); return true; } })).rejects.toBeDefined();
    expect(apiHits).toEqual([]);
  });

  test('realm base', async () => {
    const sent: WireRequest[] = [];
    const wire = async (r: WireRequest): Promise<Response> => { sent.push(r); return new Response('{"x":1}', { status: 200 }); };
    const { c } = client({ wire });
    const base = `https://${REALM}.realms.example.invalid/api/v1`;
    const seen: WireAttempt[] = [];
    expect(await c.request('GET', '/projects', null, { ...controls(seen), base })).toEqual({ x: 1 });
    expect(sent.map((r) => [r.url, r.headers.authorization, r.redirect])).toEqual([[`${base}/projects`, `Bearer ${CANARY}`, 'manual']]);
    expect(seen[0]!.url).toBe(`${base}/projects`);
    // '/api/v1' (core's base form) is the API origin.
    await c.request('GET', '/projects', null, { ...controls(), base: '/api/v1' });
    expect(sent[1]!.url).toBe(`${API}/api/v1/projects`);
    // A transport that followed a redirect anyway is refused.
    const followed = new Response('{}', { status: 200 });
    Object.defineProperty(followed, 'redirected', { value: true });
    await expect(client({ wire: async () => followed }).c.request('GET', '/ok', null, controls())).rejects.toEqual({ status: 200, redirect: true });
    // The bytes the transport gets are the digested bytes.
    const s2: WireAttempt[] = [];
    await c.request('PUT', '/x', { z: 'é', a: null }, controls(s2));
    expect(sha(sent[2]!.body!)).toBe(s2[0]!.bodyDigest!);
    expect(new TextDecoder().decode(sent[2]!.body!)).toBe('{"a":null,"z":"é"}');
    // No answer after the attempt went out: sent, outcome unknown (not "not sent").
    await expect(client({ wire: async () => { throw new Error('reset'); } }).c.request('POST', '/x', {}, controls())).rejects.toEqual({ status: 0 });
  });

  test('answers', async () => {
    reset();
    const { c } = client();
    await expect(c.request('GET', '/refuse', null, controls())).rejects.toEqual({ status: 409, code: 'SOME_CODE', data: { a: 1 }, retryAfter: 3, traceId: '0123456789abcdef0123' });
    // The code is the envelope's `error` (error-handler.ts); a generic HTTP name with a space is no code; `code` is a fallback.
    await expect(c.request('GET', '/generic', null, controls())).rejects.toEqual({ status: 404 });
    await expect(c.request('GET', '/legacy', null, controls())).rejects.toEqual({ status: 400, code: 'OLD_CODE' });
    const etags: (string | null)[] = [];
    expect(await c.request('PATCH', '/ok', { a: 1 }, { ...controls(), ifMatch: '"v6"', onEtag: (e) => etags.push(e) })).toEqual({ ok: true });
    expect(apiHits.find((h) => h.path === '/api/v1/ok')!.ifMatch).toBe('"v6"');
    expect(await c.request('DELETE', '/empty', null, { ...controls(), onEtag: (e) => etags.push(e) })).toBeNull();
    expect(etags).toEqual(['"v7"', 'W/"e1"']);
  });

  test('if-none-match', async () => {
    const sent: WireRequest[] = [];
    const wire = async (r: WireRequest): Promise<Response> => { sent.push(r); return new Response('{}', { status: 201 }); };
    const { c } = client({ wire });
    expect(await c.request('PUT', '/vault/keys/k', { value: 'v' }, { ...controls(), ifNoneMatch: '*' })).toEqual({});
    expect(await c.request('PUT', '/vault/keys/k', { value: 'v' }, { ...controls(), ifMatch: '"v6"' })).toEqual({});
    expect(sent.map((r) => [r.headers['if-none-match'], r.headers['if-match']])).toEqual([['*', undefined], [undefined, '"v6"']]);
  });

  test('kit fetch', async () => {
    reset();
    const sent: WireRequest[] = [];
    const wire = async (r: WireRequest): Promise<Response> => { sent.push(r); return r.url.includes('/hop') ? new Response(null, { status: 307, headers: { location: `${API}/api/v1/ok` } }) : new Response('k', { status: 200 }); };
    const { c } = client({ wire });
    const kit = 'https://kit-1.srv.computers.example.invalid/files/a';
    const seen: WireAttempt[] = [];
    const res = await c.fetch(kit, { method: 'post', headers: { 'Content-Type': 'text/plain' }, body: 'hi' }, controls(seen));
    expect(await res.text()).toBe('k');
    expect(sent[0]!.headers).toEqual({ 'content-type': 'text/plain' });
    expect(sent[0]!.redirect).toBe('manual');
    expect(seen).toEqual([{ method: 'POST', url: kit, bodyDigest: sha('hi'), headers: [['content-type', sha('text/plain')]], cookie: false }]);
    for (const h of <Record<string, string>[]>[{ cookie: 'a=b' }, { Cookie2: 'a' }, { 'X-Hoody-Ticket': 't' }, { 'proxy-authorization': 'x' }, { 'X-Hoody-Cwd': '/x' }]) {
      await expect(c.fetch(kit, { headers: h }, controls())).rejects.toEqual({ status: 0, notSent: true });
    }
    // Only a computer's own https host under the proxy domain (or its family twin): never the API's places, another
    // domain, the domain itself, a look-alike suffix, a port, user info, http or wss.
    for (const u of [`${API}/api/v1/ok`, `https://${REALM}.realms.example.invalid/api/v1/x`, 'http://kit-1.srv.computers.example.invalid/x', 'https://u:p@kit-1.srv.computers.example.invalid/x',
      'https://kit.example.invalid/x', 'https://computers.example.invalid/x', 'https://kit-1.srv.evilcomputers.example.invalid/x', 'https://kit-1.srv.computers.example.invalid.evil.test/x',
      'https://kit-1.srv.computers.example.invalid:8443/x', 'wss://kit-1.srv.computers.example.invalid/x', 'not a url']) {
      await expect(c.fetch(u, {}, controls()), u).rejects.toEqual({ status: 0, notSent: true, code: 'TERM_DESTINATION' });
    }
    // A client that was given no proxy domain sends to no computer at all.
    await expect(client({ wire, proxyDomain: undefined }).c.fetch(kit, {}, controls())).rejects.toEqual({ status: 0, notSent: true, code: 'TERM_DESTINATION' });
    expect(sent.length).toBe(1);
    // The family twin (`containers.` for `computers.`) is the same place; a Blob and an ArrayBuffer body go out as their bytes.
    const twin = 'https://kit-1.srv.containers.example.invalid/files/b';
    const seenB: WireAttempt[] = [];
    await c.fetch(twin, { method: 'PUT', body: new Blob(['blob!']) }, controls(seenB));
    await c.fetch(twin, { method: 'PUT', body: new TextEncoder().encode('buf').buffer as ArrayBuffer }, controls(seenB));
    expect(sent.slice(1).map((r) => new TextDecoder().decode(r.body!))).toEqual(['blob!', 'buf']);
    expect(seenB.map((a) => a.bodyDigest)).toEqual([sha('blob!'), sha('buf')]);
    await expect(c.fetch(twin, { method: 'PUT', body: new ReadableStream() }, controls())).rejects.toEqual({ status: 0, notSent: true });
    sent.length = 1;
    await expect(c.fetch(kit, {}, controls([], false))).rejects.toEqual({ status: 0, notSent: true, stale: true });
    await expect(c.fetch(kit, {})).rejects.toEqual({ status: 0, notSent: true });
    await expect(c.fetch('https://kit-1.srv.computers.example.invalid/hop', {}, controls())).rejects.toEqual({ status: 307, redirect: true });
    // A kit host that merely looks like a realm host (24 hex first label) on another domain is not an API place.
    const look = `https://${REALM}.computers.example.invalid/x`;
    await c.fetch(look, {}, controls());
    expect(sent.map((r) => r.url)).toEqual([kit, 'https://kit-1.srv.computers.example.invalid/hop', look]);
    expect(sent.every((r) => !Object.keys(r.headers).some((k) => k === 'authorization'))).toBe(true);
    expect(apiHits).toEqual([]);
  });
  test('computer headers by leg', async () => {
    const sent: WireRequest[] = [];
    const wire = async (r: WireRequest): Promise<Response> => { sent.push(r); return new Response('{}', { status: 200 }); };
    const { c } = client({ wire });
    const agent = 'https://agent-1.srv.computers.example.invalid/api/v1/agent/hoody/run';
    const kit = 'https://kit-1.srv.computers.example.invalid/files/upload';
    const seen: WireAttempt[] = [];
    // Agent: X-Hoody-Cwd and X-Hoody-Approver-Lease go out as given (the lease only ever from a spent ticket, kit.ts).
    await c.fetch(agent, { method: 'POST', headers: { 'X-Hoody-Cwd': '/home', 'X-Hoody-Approver-Lease': 'lease-1', 'Content-Type': 'application/json' }, body: '{}' }, controls(seen));
    expect(sent[0]!.headers).toEqual({ 'x-hoody-cwd': '/home', 'x-hoody-approver-lease': 'lease-1', 'content-type': 'application/json' });
    expect(seen[0]!.headers).toEqual([['content-type', sha('application/json')], ['x-hoody-approver-lease', sha('lease-1')], ['x-hoody-cwd', sha('/home')]]);
    // A run route's own Authorization (the person's callerHeaders, row 4; run routes are kit routes) is the admission's to
    // allow: sent as given on the kit leg, refused on the agent leg (no run route there).
    await c.fetch(kit, { headers: { Authorization: 'Bearer theirs' } }, controls());
    expect(sent[1]!.headers).toEqual({ authorization: 'Bearer theirs' });
    expect(Object.values(sent[1]!.headers)).not.toContain(`Bearer ${CANARY}`);
    await expect(c.fetch(agent, { headers: { Authorization: 'Bearer theirs' } }, controls())).rejects.toEqual({ status: 0, notSent: true });
    // Kit: the pipe headers.
    await c.fetch(kit, { method: 'PUT', headers: { 'X-Hoody-Pipe': 'p', 'X-Hoody-Pipe-Sender-Key': 'k' }, body: 'x' }, controls());
    expect(sent[2]!.headers).toEqual({ 'x-hoody-pipe': 'p', 'x-hoody-pipe-sender-key': 'k' });
    // Each leg refuses the other leg's names and every other X-Hoody-*.
    const before = sent.length;
    for (const [u, h] of [[kit, { 'X-Hoody-Cwd': '/' }], [kit, { 'X-Hoody-Approver-Lease': 'l' }], [agent, { 'X-Hoody-Pipe': 'p' }], [agent, { 'X-Hoody-Pipe-Sender-Key': 'k' }], [agent, { 'X-Hoody-Realm': 'r' }], [kit, { 'x-hoody-anything': '1' }], [agent, { Cookie: 'a=b' }], [agent, { 'Proxy-Authorization': 'x' }]] as const) {
      await expect(c.fetch(u, { headers: h as Record<string, string> }, controls())).rejects.toEqual({ status: 0, notSent: true });
    }
    expect(sent.length).toBe(before);
    // A path that only looks like the agent's (no /api/v1/agent/ prefix) is the kit leg.
    await expect(c.fetch('https://kit-1.srv.computers.example.invalid/agent/x', { headers: { 'X-Hoody-Cwd': '/' } }, controls())).rejects.toEqual({ status: 0, notSent: true });
  });
});
