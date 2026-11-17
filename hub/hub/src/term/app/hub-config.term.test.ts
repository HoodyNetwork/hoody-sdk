// hub-config.ts against a loopback fake API (Bun.serve on 127.0.0.1): no real API.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | One GET to exactly `<origin>/api/v1/hub/config`, no credential, redirect manual; the two domains come back checked; null stays null | 'reads the two domains' |
// | 2 | A redirect is not followed; a non-200, an unreachable API, a body that is not the route's shape or is over the bound: a fixed code each, nothing else asked | 'refusals' |
// | 3 | A domain that is not a bare host name, or a proxy domain nested with the API host or the realm API domain, is refused as the live boot would refuse it | 'domains checked' |
// | 4 | An API origin that is not https (or loopback http when allowed) is refused before anything is sent | 'origin checked' |
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { fetchWire, type WireRequest } from './cli-client';
import { CONFIG_MAX_BYTES, HubConfigRefusal, hubConfigOf, readHubConfig } from './hub-config';

interface Hit { method: string; path: string; auth: string | null; cookie: string | null }
const hits: Hit[] = [];
let answer: () => Response = () => new Response('{}');
let api: ReturnType<typeof Bun.serve>;
let API = '';
beforeAll(() => {
  api = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(req) {
    const u = new URL(req.url);
    hits.push({ method: req.method, path: u.pathname + u.search, auth: req.headers.get('authorization'), cookie: req.headers.get('cookie') });
    return answer();
  } });
  API = `http://127.0.0.1:${api.port}`;
});
afterAll(() => { api.stop(true); });
const json = (data: unknown, status = 200): Response => new Response(JSON.stringify({ statusCode: status, data }), { status, headers: { 'content-type': 'application/json' } });
const code = (p: Promise<unknown>): Promise<unknown> => p.then(() => 'resolved', (e: unknown) => (e instanceof HubConfigRefusal ? e.code : e));
const loop = { loopbackHttp: true } as const;

test('reads the two domains', async () => {
  hits.length = 0;
  answer = () => json({ realm_api_domain: 'api.example.invalid', proxy_domain: 'computers.example.invalid', hub_file_min: 1 });
  const sent: WireRequest[] = [];
  const got = await readHubConfig(API + '/', (r) => { sent.push(r); return fetchWire(r); }, loop);
  expect(got).toEqual({ apiOrigin: API, realmApiDomain: 'api.example.invalid', proxyDomain: 'computers.example.invalid' });
  expect(hits).toEqual([{ method: 'GET', path: '/api/v1/hub/config', auth: null, cookie: null }]);
  expect(sent[0]!.redirect).toBe('manual');
  expect(sent[0]!.headers).toEqual({ accept: 'application/json' });
  answer = () => json({ realm_api_domain: null, proxy_domain: null, hub_file_min: 1 });
  expect(await readHubConfig(API, fetchWire, loop)).toEqual({ apiOrigin: API, realmApiDomain: null, proxyDomain: null });
});

test('refusals', async () => {
  hits.length = 0;
  answer = () => new Response(null, { status: 302, headers: { location: API + '/elsewhere' } });
  expect(await code(readHubConfig(API, fetchWire, loop))).toBe('HUB_CONFIG_STATUS');
  expect(hits.map((h) => h.path)).toEqual(['/api/v1/hub/config']);
  answer = () => json({}, 429);
  expect(await readHubConfig(API, fetchWire, loop).catch((e: HubConfigRefusal) => [e.code, e.status])).toEqual(['HUB_CONFIG_STATUS', 429]);
  for (const body of ['not json', '[]', '{"data":null}', '{"data":{"proxy_domain":"computers.example.invalid"}}', JSON.stringify({ data: { realm_api_domain: null, proxy_domain: null, pad: 'x'.repeat(CONFIG_MAX_BYTES) } })]) {
    answer = () => new Response(body, { status: 200 });
    expect(await code(readHubConfig(API, fetchWire, loop)), body.slice(0, 40)).toBe('HUB_CONFIG_SHAPE');
  }
  expect(await code(readHubConfig(API, () => Promise.reject(new TypeError('down')), loop))).toBe('HUB_CONFIG_UNREACHABLE');
  const hang = (r: WireRequest): Promise<Response> => new Promise((_, no) => { r.signal.addEventListener('abort', () => no(new Error('cut'))); });
  expect(await code(readHubConfig(API, hang, { ...loop, timeoutMs: 20 }))).toBe('HUB_CONFIG_UNREACHABLE');
});

test('domains checked', () => {
  const of = (realm: unknown, proxy: unknown): unknown => { try { return hubConfigOf('https://api.example.invalid', { data: { realm_api_domain: realm, proxy_domain: proxy } }); } catch (e) { return (e as HubConfigRefusal).code; } };
  expect(of('api.example.invalid', 'computers.example.invalid')).toEqual({ apiOrigin: 'https://api.example.invalid', realmApiDomain: 'api.example.invalid', proxyDomain: 'computers.example.invalid' });
  for (const bad of ['https://realm.invalid', 'invalid', 'Realm.Invalid', 'realm.invalid:443', 'realm.invalid/x', '', 7, '10.0.0.1']) expect(of(bad, null), String(bad)).toBe('TERM_REALM_DOMAIN');
  for (const bad of ['computers.invalid:443', 'invalid', 'https://computers.invalid', 'example.invalid', 'api.example.invalid', 'x.api.example.invalid', '']) expect(of('api.example.invalid', bad), String(bad)).toBe('TERM_PROXY_DOMAIN');
  // Nested with the realm API domain (when that is not the API host itself).
  expect(of('realm.invalid', 'x.realm.invalid')).toBe('TERM_PROXY_DOMAIN');
  expect(of('x.computers.invalid', 'computers.invalid')).toBe('TERM_PROXY_DOMAIN');
  expect(of(null, 'computers.invalid')).toEqual({ apiOrigin: 'https://api.example.invalid', realmApiDomain: null, proxyDomain: 'computers.invalid' });
});

test('origin checked', async () => {
  hits.length = 0;
  let sent = 0;
  const wire = (r: WireRequest): Promise<Response> => { sent++; return fetchWire(r); };
  for (const bad of [API, 'http://api.example.invalid', 'https://u:p@api.example.invalid', 'https://api.example.invalid/api/v1', 'ftp://api.example.invalid', '']) {
    expect(await code(readHubConfig(bad, wire)), bad).toBe('TERM_API_ORIGIN');
  }
  expect(sent).toBe(0);
  expect(hits).toEqual([]);
});
