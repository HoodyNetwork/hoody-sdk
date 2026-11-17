// The live mount's checks of the host client's seam (live-seam.ts).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | The API origin: https and a bare lower-case host (http only to loopback, only when the test switch is on); no user info, path, query, fragment, upper case, or odd port; the default port is dropped | 'api origin' |
// | 2 | The proxy and realm domains are bare host names; the proxy domain may not hold the API host or overlap the realm API domain | 'domains' |
// | 3 | A wire attempt is compared with its admission: another method, URL or body, another header set, a cookie, or NO attempt at all (a client that ignores the interface) sends nothing and is reported once | 'attempt bound to its admission' |
import { expect, test } from 'bun:test';
import { SeamRefusal, apiOriginOf, attemptVerdict, boundBeforeWire, domainOf, seamPlaces, type AdmittedSend } from './live-seam';
import type { ClientCallControls, WireAttempt } from '../host-types';

const code = (fn: () => unknown): string => { try { return `ok ${String(fn())}`; } catch (e) { return e instanceof SeamRefusal ? e.code : `other ${String(e)}`; } };

test('api origin', () => {
  expect(apiOriginOf('https://api.example.invalid')).toBe('https://api.example.invalid');
  expect(apiOriginOf('https://api.example.invalid/')).toBe('https://api.example.invalid');
  expect(apiOriginOf('https://api.example.invalid:443')).toBe('https://api.example.invalid');
  expect(apiOriginOf('https://api.example.invalid:8443')).toBe('https://api.example.invalid:8443');
  expect(apiOriginOf('http://127.0.0.1:18080', { loopbackHttp: true })).toBe('http://127.0.0.1:18080');
  expect(apiOriginOf('http://localhost:80', { loopbackHttp: true })).toBe('http://localhost');
  const bad = [
    undefined, null, 42, '', 'api.example.invalid', '//api.example.invalid', 'ftp://api.example.invalid', 'https://', 'https://api.example.invalid/api/v1', 'https://api.example.invalid/x',
    'https://user@api.example.invalid', 'https://user:pw@api.example.invalid', 'https://api.example.invalid?x=1', 'https://api.example.invalid#x', 'https://API.example.invalid', 'https://api.example.invalid:0',
    'https://api.example.invalid:99999', 'https://api.example.invalid:08443', 'https://api.example.invalid:', ' https://api.example.invalid', 'https://api.example.invalid ', 'https://api.example.invalid\\@evil.invalid',
    'https://api_example.invalid', 'https://example', 'https://203.0.113.9', 'https://-a.example.invalid', 'https://a..invalid', 'http://api.example.invalid', 'http://127.0.0.1:18080', 'http://203.0.113.9:80',
    `https://${'a'.repeat(300)}.invalid`,
  ];
  for (const v of bad) expect(code(() => apiOriginOf(v)), String(v)).toBe('TERM_API_ORIGIN');
  // http is for loopback only, even with the test switch on.
  expect(code(() => apiOriginOf('http://api.example.invalid', { loopbackHttp: true }))).toBe('TERM_API_ORIGIN');
  expect(code(() => apiOriginOf('http://203.0.113.9', { loopbackHttp: true }))).toBe('TERM_API_ORIGIN');
});

test('domains', () => {
  expect(domainOf('containers.example.invalid', 'TERM_PROXY_DOMAIN')).toBe('containers.example.invalid');
  for (const v of [undefined, '', 'invalid', 'https://containers.example.invalid', 'containers.example.invalid:443', 'containers.example.invalid/x', 'Containers.example.invalid', '.example.invalid', 'example.invalid.', '*.example.invalid', '203.0.113.9', 'a b.invalid', 'a@b.invalid']) {
    expect(code(() => domainOf(v, 'TERM_PROXY_DOMAIN')), String(v)).toBe('TERM_PROXY_DOMAIN');
    expect(code(() => domainOf(v, 'TERM_REALM_DOMAIN')), String(v)).toBe('TERM_REALM_DOMAIN');
  }
  const ok = { apiOrigin: 'https://api.example.invalid', realmApiDomain: 'realms.example.invalid', proxyDomain: 'containers.example.invalid' };
  expect(seamPlaces(ok)).toEqual(ok);
  expect(seamPlaces({ ...ok, proxyDomain: undefined })).toEqual({ ...ok, proxyDomain: null });
  expect(code(() => seamPlaces({ ...ok, apiOrigin: undefined }))).toBe('TERM_API_ORIGIN');
  expect(code(() => seamPlaces({ ...ok, realmApiDomain: 'x' }))).toBe('TERM_REALM_DOMAIN');
  expect(code(() => seamPlaces({ ...ok, proxyDomain: 'https://x.invalid' }))).toBe('TERM_PROXY_DOMAIN');
  // A computer address could then be the API itself, or a realm's API host.
  expect(code(() => seamPlaces({ ...ok, proxyDomain: 'example.invalid' })), 'the API host sits under it').toBe('TERM_PROXY_DOMAIN');
  expect(code(() => seamPlaces({ ...ok, proxyDomain: 'api.example.invalid' })), 'it is the API host').toBe('TERM_PROXY_DOMAIN');
  expect(code(() => seamPlaces({ ...ok, proxyDomain: 'computers.api.example.invalid' })), 'under the API host (realm domain elsewhere)').toBe('TERM_PROXY_DOMAIN');
  expect(code(() => seamPlaces({ ...ok, proxyDomain: 'realms.example.invalid' })), 'it is the realm API domain').toBe('TERM_PROXY_DOMAIN');
  expect(code(() => seamPlaces({ ...ok, proxyDomain: 'x.realms.example.invalid' })), 'under the realm API domain').toBe('TERM_PROXY_DOMAIN');
  expect(code(() => seamPlaces({ ...ok, realmApiDomain: 'r.containers.example.invalid' })), 'the realm API domain under it').toBe('TERM_PROXY_DOMAIN');
});

const D = (c: string): string => c.repeat(64);
const admitted: AdmittedSend = { method: 'POST', url: 'https://api.example.invalid/api/v1/projects?x=1', bodyDigest: D('a') };
const attempt: WireAttempt = { method: 'POST', url: 'https://api.example.invalid/api/v1/projects?x=1', bodyDigest: D('a') };
const kit: AdmittedSend = { method: 'PUT', url: 'https://p-c-files-1.n1.containers.example.invalid/x', bodyDigest: null, headers: [['accept', D('1')], ['if-match', D('2')]] };
const kitAttempt: WireAttempt = { method: 'PUT', url: kit.url, bodyDigest: null, headers: [['if-match', D('2')], ['accept', D('1')]], cookie: false };

test('attempt bound to its admission', () => {
  expect(attemptVerdict(admitted, attempt)).toBe('ok');
  expect(attemptVerdict(kit, kitAttempt), 'header order does not matter').toBe('ok');
  const bypass: Array<[string, AdmittedSend, WireAttempt | undefined]> = [
    ['no attempt at all', admitted, undefined],
    ['another method', admitted, { ...attempt, method: 'PUT' }],
    ['another host', admitted, { ...attempt, url: attempt.url.replace('api.', 'api2.') }],
    ['another query', admitted, { ...attempt, url: attempt.url + '&y=2' }],
    ['a dropped /api/v1', admitted, { ...attempt, url: 'https://api.example.invalid/projects?x=1' }],
    ['another body', admitted, { ...attempt, bodyDigest: D('b') }],
    ['a body where none was admitted', kit, { ...kitAttempt, bodyDigest: D('b') }],
    ['no body where one was admitted', admitted, { ...attempt, bodyDigest: null }],
    ['an added header (an Authorization)', kit, { ...kitAttempt, headers: [...kitAttempt.headers!, ['authorization', D('9')]] }],
    ['a dropped header', kit, { ...kitAttempt, headers: [['accept', D('1')]] }],
    ['a changed header value', kit, { ...kitAttempt, headers: [['accept', D('1')], ['if-match', D('3')]] }],
    ['a header sent twice', { ...kit, headers: [['accept', D('1')], ['accept', D('1')]] }, { ...kitAttempt, headers: [['accept', D('1')], ['accept', D('1')]] }],
    ['a cookie', kit, { ...kitAttempt, cookie: true }],
    ['no word on cookies', kit, { method: kitAttempt.method, url: kitAttempt.url, bodyDigest: null, headers: kitAttempt.headers! }],
    ['no header list on a computer leg', kit, { method: kitAttempt.method, url: kitAttempt.url, bodyDigest: null, cookie: false }],
  ];
  for (const [what, a, t] of bypass) expect(attemptVerdict(a, t), what).toBe('TERM_POLICY_BYPASS');

  // A client written before the interface calls beforeWire() with nothing: it is told no, once per try, and sends nothing.
  const reports: string[] = [];
  let live = true;
  const controls: ClientCallControls = { session: { sid: 's', generation: 1 }, signal: new AbortController().signal, beforeWire: boundBeforeWire(admitted, () => live, (c) => { reports.push(c); }) };
  const oldClient = (o: ClientCallControls): string => (o.beforeWire() ? 'sent' : 'not sent');
  const newClient = (o: ClientCallControls, a: WireAttempt): string => (o.beforeWire(a) ? 'sent' : 'not sent');
  expect(oldClient(controls)).toBe('not sent');
  expect(reports).toEqual(['TERM_POLICY_BYPASS']);
  expect(newClient(controls, attempt)).toBe('sent');
  expect(newClient(controls, { ...attempt, method: 'DELETE' }), 'a retry that changed the method').toBe('not sent');
  expect(reports).toEqual(['TERM_POLICY_BYPASS', 'TERM_POLICY_BYPASS']);
  // The mount's own gate comes first and is not a bypass.
  live = false;
  expect(newClient(controls, attempt)).toBe('not sent');
  expect(reports).toHaveLength(2);
});
