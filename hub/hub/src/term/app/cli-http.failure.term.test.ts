// What a failed read or renewal of the CLI's saved sign-in means to `hoody hub` (signInFailure, openCliHub), on a
// fake CLI client and a fake transport: no network, no real credential.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | An answer decides before any transport code: 401 or 403 beside a connection code is a refusal ('signed-out'), never 'unanswered'; 429 and 5xx stay 'unanswered' whatever code rides along | 'an answer decides first' |
// | 2 | With no status, only a known transport code (its own or its cause's), a timeout or an abort is 'unanswered'; a TypeError whose cause is something else, or has no code, is not | 'no answer needs evidence' |
// | 3 | A certificate the transport refused is 'untrusted', from the error's own code or its cause's, before a wrapping NETWORK_ERROR | 'a refused certificate' |
// | 4 | openCliHub: reading the sign-in, renewing an expired token and the access key's two reads each report 'untrusted' for a refused certificate, with nothing sent after it | 'untrusted on every way in' |
// | 5 | Mid-session, a renewal that met a refused certificate does not end the session: the 401 stands for that call and the next call renews again | 'a refused certificate mid-session keeps the session' |
import { expect, test } from 'bun:test';
import type { ClientCallControls, WireAttempt } from '../host-types';
import { openCliHub, signInFailure, type CliHttp } from './cli-http';

const ORIGIN = 'https://api.example.invalid';
const PLACES = { apiOrigin: ORIGIN, realmApiDomain: 'example.invalid' } as const;
const UID = '64f0ada00000000000000001';
const NOW = 1_800_000_000_000;

const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (uid: string, expMs: number, n = 0): string => `${b64({ alg: 'HS256' })}.${b64({ id: uid, sid: 'sess-1', exp: Math.floor(expMs / 1000), n })}.sig${n}`;
const err = (props: Record<string, unknown>, base: Error = new Error('x')): Error => Object.assign(base, props);
const withCause = (cause: unknown): TypeError => new TypeError('fetch failed', { cause });
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Renewal = string | { throws: unknown };
function fakeCli(o: { token?: string; tokenThrows?: unknown; renewed?: Renewal[]; answer: (url: string, auth: string | undefined) => Response }) {
  const sent: string[] = [];
  let renewals = 0;
  const queue = [...(o.renewed ?? [])];
  const http: CliHttp = {
    getAuthToken: async () => { if (o.tokenThrows !== undefined) throw o.tokenThrows; return o.token; },
    forceRefreshToken: async () => {
      renewals++;
      const r = queue.shift();
      if (r && typeof r === 'object') throw r.throws;
      return r;
    },
    getRefreshFailure: () => undefined,
    getFetch: () => async (url, init) => {
      sent.push(url);
      return o.answer(url, new Headers(init?.headers).get('authorization') ?? undefined);
    },
  };
  return { http, sent, renewals: () => renewals };
}
function controls(): ClientCallControls {
  return { session: { sid: 'sess-1', generation: 1 }, signal: new AbortController().signal, beforeWire: (_a?: WireAttempt) => true };
}

const CERT = withCause(err({ code: 'CERT_HAS_EXPIRED' }));

test('an answer decides first', () => {
  expect(signInFailure(err({ status: 401, code: 'ECONNRESET' }))).toBe('signed-out');
  expect(signInFailure(err({ status: 401, cause: { code: 'ECONNRESET' } }))).toBe('signed-out');
  expect(signInFailure(err({ status: 403, code: 'UND_ERR_SOCKET' }))).toBe('signed-out');
  expect(signInFailure(err({ status: 401, cause: { code: 'ETIMEDOUT' } }, new TypeError('fetch failed')))).toBe('signed-out');
  expect(signInFailure(err({ status: 401, name: 'TimeoutError' }))).toBe('signed-out');
  // A second factor is still asked for whatever the status; a busy or failing platform is still no answer.
  expect(signInFailure(err({ status: 401, code: 'TWO_FACTOR_REQUIRED' }))).toBe('needs-2fa');
  expect(signInFailure(err({ status: 429, code: 'TOKEN_REVOKED' }))).toBe('unanswered');
  expect(signInFailure(err({ status: 503, code: 'UNAUTHORIZED' }))).toBe('unanswered');
});

test('no answer needs evidence', () => {
  // Not evidence: a TypeError with a cause that names no transport failure.
  expect(signInFailure(withCause(new Error('bad header value')))).toBe('signed-out');
  expect(signInFailure(withCause({ code: 'ERR_INVALID_ARG_TYPE' }))).toBe('signed-out');
  expect(signInFailure(withCause('boom'))).toBe('signed-out');
  expect(signInFailure(withCause(null))).toBe('signed-out');
  // Evidence: a transport code of its own or of its cause, a timeout, an abort.
  expect(signInFailure(withCause(err({ code: 'ECONNREFUSED' })))).toBe('unanswered');
  expect(signInFailure(err({ code: 'UND_ERR_CONNECT_TIMEOUT' }))).toBe('unanswered');
  expect(signInFailure(err({ status: 0, code: 'NETWORK_ERROR' }))).toBe('unanswered');
  expect(signInFailure(err({ name: 'TimeoutError' }))).toBe('unanswered');
  expect(signInFailure(err({ name: 'AbortError' }))).toBe('unanswered');
  expect(signInFailure(err({ code: 'SOMETHING_ELSE' }, new Error('x', { cause: { code: 'ENOTFOUND' } })))).toBe('unanswered');
});

test('a refused certificate', () => {
  for (const code of ['CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_SSL_WRONG_VERSION_NUMBER']) {
    expect(signInFailure(withCause(err({ code })))).toBe('untrusted');
    expect(signInFailure(err({ code }))).toBe('untrusted');
    // The CLI's own wrapper code does not hide the cause.
    expect(signInFailure(err({ status: 0, code: 'NETWORK_ERROR', cause: { code } }))).toBe('untrusted');
  }
  expect(signInFailure(err({ code: 'CERTAINLY' }))).toBe('signed-out');
});

test('untrusted on every way in', async () => {
  // Reading the saved sign-in.
  let f = fakeCli({ tokenThrows: CERT, answer: () => json(200, {}) });
  expect(await openCliHub(f.http, PLACES, { now: () => NOW })).toEqual({ ok: false, why: 'untrusted' });
  expect(f.sent).toEqual([]);
  // Renewing an expired saved token.
  f = fakeCli({ token: jwt(UID, NOW - 1000), renewed: [{ throws: CERT }], answer: () => json(200, {}) });
  expect(await openCliHub(f.http, PLACES, { now: () => NOW })).toEqual({ ok: false, why: 'untrusted' });
  expect(f.sent).toEqual([]);
  // An access key: its own introspection, then its owner.
  f = fakeCli({ token: 'hdy_key', answer: () => { throw CERT; } });
  expect(await openCliHub(f.http, PLACES, { now: () => NOW })).toEqual({ ok: false, why: 'untrusted' });
  expect(f.sent).toHaveLength(1);
  f = fakeCli({ token: 'hdy_key', answer: (url) => { if (url.endsWith('/users/auth/me')) throw CERT; return json(200, { data: { token: { id: UID, realm_ids: [] } } }); } });
  expect(await openCliHub(f.http, PLACES, { now: () => NOW })).toEqual({ ok: false, why: 'untrusted' });
  // Any other throw there is still no answer.
  f = fakeCli({ token: 'hdy_key', answer: () => { throw new Error('socket closed'); } });
  expect(await openCliHub(f.http, PLACES, { now: () => NOW })).toEqual({ ok: false, why: 'unanswered' });
});

test('a refused certificate mid-session keeps the session', async () => {
  const tok = jwt(UID, NOW + 3_600_000);
  const fresh = jwt(UID, NOW + 7_200_000, 1);
  const f = fakeCli({ token: tok, renewed: [{ throws: CERT }, fresh], answer: (_url, auth) => (auth === `Bearer ${fresh}` ? json(200, { data: { ok: true } }) : json(401, { error: 'UNAUTHORIZED' })) });
  const o = await openCliHub(f.http, PLACES, { now: () => NOW });
  if (!o.ok) throw new Error('not opened');
  const ends: unknown[] = [];
  o.client.onAuthEnded!((e) => ends.push(e));
  await expect(o.client.request('GET', '/notes', null, controls())).rejects.toMatchObject({ status: 401 });
  expect(ends).toEqual([]);
  expect(await o.client.request('GET', '/notes', null, controls())).toEqual({ data: { ok: true } });
  expect(f.renewals()).toBe(2);
  expect(ends).toEqual([]);
});
