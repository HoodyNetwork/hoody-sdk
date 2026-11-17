// The HoodyClient over the CLI's HttpClient (cli-http.ts), on a fake CLI client and a fake transport: no network, no
// real credential.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | No saved credential: not opened ('signed-out'), nothing sent | 'no credential' |
// | 2 | A saved account login: identity from the token (uid, sid, source 'login'); calls go to the API origin with that bearer, through beforeWire, redirect 'manual' | 'account login' |
// | 3 | The saved access token is past its expiry: renewed BEFORE anything else is sent; a failed renewal, or a renewal into another account, does not open ('expired') | 'expired at start' |
// | 4 | A call answered 401: one renewal, then the same request again through beforeWire (same attempt), with the new bearer; the answer is the call's | 'renew on 401' |
// | 5 | A call answered 401 whose renewal fails: onAuthEnded 'expired' for the session, the 401 stands, and a later call is refused unsent (superseded) | 'renewal fails ends the session' |
// | 6 | The token lapses during the mount: the next call renews first, and only the new bearer goes out | 'renew before a call' |
// | 7 | An access key: its own introspection (GET /auth/tokens/me, base host), then its owner (GET /users/auth/me with the key, on its realm's host; the base host for a key with no realm) make a token session whose uid is the OWNER and whose sid is the key; a 401 there is 'expired', no answer, 429 or 5xx 'unanswered' (try again), any other refusal or no usable owner 'unreadable' | 'access key' |
// | 8 | The Hub's places come from GET /hub/config on the CLI's transport (no redirect); a refusal or an answer without the realm domain is null | 'hub places' |
// | 10 | A key limited to several realms starts in one of them, bound into its identity: the last run's while listed, else its first; a typed listed realm; another realm or All realms refused before any read of /realms. A key on no realm without allow_no_realm: All realms refused before the mount, a typed realm bound | 'key with several realms' |
// | 11 | Through core's own token boot (the live entry): a session opened over the CLI client, for a one-realm key and for a two-realm key with --realm, boots and stays mounted (not ended 'invalid' or 'realm') | 'token boot' |
// | 12 | Reading the saved sign-in fails: a second factor it cannot give is 'needs-2fa'; no answer (a transport code, a timeout, 429, 5xx) is 'unanswered'; anything else 'signed-out'; read from code and status, never the text | 'sign-in read fails' |
// | 13 | An expired saved token whose renewal renewed nothing: 'unanswered' when the CLI recorded that the platform did not answer (or the renewal threw a transport failure), 'needs-2fa' for a second factor, else 'expired' | 'expired at start, not answered' |
// | 14 | Mid-session, a renewal the platform did not answer: the 401 stands for that call, the session is NOT ended, the next call renews again (one renewal per call) and goes out with the new token | 'renewal not answered keeps the session' |
// | 15 | A 401 that refuses what was typed (INVALID_OTP_CODE) is the call's answer: sent once, nothing renewed, the session kept, however often | 'a wrong code is the answer' |
// | 16 | A 401 with a session code for a request carrying a password or a code: one read of the account says whether the session still works; it does: the 401 stands, sent once, nothing renewed | 'a wrong password is sent once' |
// | 17 | The same 401 with a session the API now refuses: renewed and sent again (the route never saw the first send); a refused renewal ends the session; a read that got no answer decides nothing | 'a typed request under a dead session' |
// | 18 | A pair the API reissued for this session (2FA on or off): taken only when both tokens name this account and this session; the next call goes out with it; the CLI is handed it to keep, and a renewal waits for that; a CLI that cannot keep one still serves the mount | 'a reissued pair' |
// | 19 | A renewal out while a pair is adopted (it spent the refresh token that pair replaced): its answer is dropped. An older renewed token is never made the bearer; a refusal does not end the session; the call that waited goes out with the adopted token, and so does the next | 'a renewal out during an adoption is dropped' |
// | 9 | The start realm: a typed name is looked up in the vault alias map with the CLI's rules, a missing map is no names, no realm typed reads /realms with usage (the last run's realm, else the most computers); all on the base host | 'start realm' |
import { afterEach, expect, setDefaultTimeout, test } from 'bun:test';
import type { ClientCallControls, HubTermOptions, Receipt, WireAttempt } from '../host-types';
import { mountTerminalHub } from '../entry';
import { currentTermSession } from '../env/session';
import { cliStartRealm, openCliHub, readHubPlaces, type CliHttp } from './cli-http';
import { UNSTYLED_FOR_TESTS } from './styles';

setDefaultTimeout(60_000);
// A failed test must not leave its mount open for the next.
afterEach(() => { currentTermSession()?.end(); });

const ORIGIN = 'https://api.example.invalid';
const PLACES = { apiOrigin: ORIGIN, realmApiDomain: 'example.invalid' } as const;
const UID = '64f0ada00000000000000001';
const OTHER_UID = '64f0ada00000000000000002';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const OTHER_REALM = 'f2f2f2f2f2f2f2f2f2f2f2f2';
const NOW = 1_800_000_000_000;

const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (uid: string, expMs: number, n = 0): string => `${b64({ alg: 'HS256' })}.${b64({ id: uid, sid: 'sess-1', exp: Math.floor(expMs / 1000), n })}.sig${n}`;

interface Sent { url: string; method: string; auth: string | undefined; redirect: string | undefined }
/** A renewal's outcome: a token, nothing (with the CLI's recorded reason), or a throw. */
type Renewal = string | undefined | { reason: string } | { throws: unknown };
function fakeCli(o: { token?: string; tokenThrows?: unknown; renewed?: Renewal[]; answer: (s: Sent) => Response }) {
  const sent: Sent[] = [];
  let renewals = 0;
  let reason: string | undefined;
  const queue = [...(o.renewed ?? [])];
  const http: CliHttp = {
    getAuthToken: async () => { if (o.tokenThrows !== undefined) throw o.tokenThrows; return o.token; },
    forceRefreshToken: async () => {
      renewals++;
      reason = undefined;
      const r = queue.shift();
      if (r && typeof r === 'object' && 'throws' in r) throw r.throws;
      if (r && typeof r === 'object') { reason = r.reason; return undefined; }
      return r;
    },
    getRefreshFailure: () => reason,
    getFetch: () => async (url, init) => {
      const h = new Headers(init?.headers);
      const s: Sent = { url, method: String(init?.method), auth: h.get('authorization') ?? undefined, redirect: init?.redirect };
      sent.push(s);
      return o.answer(s);
    },
  };
  return { http, sent, renewals: () => renewals };
}
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function controls(): ClientCallControls & { attempts: Array<WireAttempt | undefined> } {
  const attempts: Array<WireAttempt | undefined> = [];
  return { session: { sid: 'sess-1', generation: 1 }, signal: new AbortController().signal, beforeWire: (a?: WireAttempt) => { attempts.push(a); return true; }, attempts };
}

test('no credential', async () => {
  const f = fakeCli({ answer: () => json(200, {}) });
  expect(await openCliHub(f.http, PLACES, { now: () => NOW })).toEqual({ ok: false, why: 'signed-out' });
  expect(f.sent).toEqual([]);
});

test('account login', async () => {
  const tok = jwt(UID, NOW + 3_600_000);
  const f = fakeCli({ token: tok, answer: () => json(200, { data: { id: UID } }) });
  const o = await openCliHub(f.http, PLACES, { now: () => NOW });
  if (!o.ok) throw new Error('not opened');
  expect(o.kind).toBe('account');
  expect(o.client.identity).toEqual({ kind: 'account', uid: UID, sid: 'sess-1', source: 'login' });
  expect(o.client.apiOrigin).toBe(ORIGIN);
  expect(f.sent).toEqual([]);
  const c = controls();
  expect(await o.client.request('GET', '/users/auth/me', null, c)).toEqual({ data: { id: UID } });
  expect(f.sent).toEqual([{ url: ORIGIN + '/api/v1/users/auth/me', method: 'GET', auth: `Bearer ${tok}`, redirect: 'manual' }]);
  expect(c.attempts).toHaveLength(1);
  expect(c.attempts[0]).toMatchObject({ method: 'GET', url: ORIGIN + '/api/v1/users/auth/me', bodyDigest: null });
  expect(f.renewals()).toBe(0);
});

test('expired at start', async () => {
  const old = jwt(UID, NOW - 1000);
  const fresh = jwt(UID, NOW + 3_600_000, 1);
  const ok = fakeCli({ token: old, renewed: [fresh], answer: () => json(200, {}) });
  const o = await openCliHub(ok.http, PLACES, { now: () => NOW });
  expect(o.ok).toBe(true);
  expect(ok.renewals()).toBe(1);
  if (o.ok) { await o.client.request('GET', '/notes', null, controls()); expect(ok.sent[0]!.auth).toBe(`Bearer ${fresh}`); }
  for (const renewed of [undefined, jwt(OTHER_UID, NOW + 3_600_000)]) {
    const no = fakeCli({ token: old, renewed: [renewed], answer: () => json(200, {}) });
    expect(await openCliHub(no.http, PLACES, { now: () => NOW })).toEqual({ ok: false, why: 'expired' });
    expect(no.sent).toEqual([]);
  }
});

test('renew on 401', async () => {
  const tok = jwt(UID, NOW + 3_600_000);
  const fresh = jwt(UID, NOW + 7_200_000, 1);
  let n = 0;
  const f = fakeCli({ token: tok, renewed: [fresh], answer: () => (++n === 1 ? json(401, { error: 'UNAUTHORIZED' }) : json(200, { data: { ok: true } })) });
  const o = await openCliHub(f.http, PLACES, { now: () => NOW });
  if (!o.ok) throw new Error('not opened');
  const c = controls();
  expect(await o.client.request('POST', '/notes', { title: 'a' }, c)).toEqual({ data: { ok: true } });
  expect(f.renewals()).toBe(1);
  expect(f.sent.map((s) => s.auth)).toEqual([`Bearer ${tok}`, `Bearer ${fresh}`]);
  // The resend passed the wire check again, as the same attempt.
  expect(c.attempts).toHaveLength(2);
  expect(c.attempts[1]).toEqual(c.attempts[0]);
});

test('renewal fails ends the session', async () => {
  const tok = jwt(UID, NOW + 3_600_000);
  const f = fakeCli({ token: tok, renewed: [undefined], answer: () => json(401, { error: 'UNAUTHORIZED' }) });
  const o = await openCliHub(f.http, PLACES, { now: () => NOW });
  if (!o.ok) throw new Error('not opened');
  const ends: unknown[] = [];
  o.client.onAuthEnded!((e) => ends.push(e));
  await expect(o.client.request('GET', '/notes', null, controls())).rejects.toMatchObject({ status: 401 });
  expect(ends).toEqual([{ sid: 'sess-1', reason: 'expired' }]);
  const n = f.sent.length;
  await expect(o.client.request('GET', '/notes', null, controls())).rejects.toMatchObject({ status: 401, superseded: true, notSent: true });
  expect(f.sent.length).toBe(n);
});

test('a wrong code is the answer', async () => {
  const tok = jwt(UID, NOW + 3_600_000);
  const f = fakeCli({ token: tok, renewed: [jwt(UID, NOW + 7_200_000, 1)], answer: () => json(401, { statusCode: 401, error: 'INVALID_OTP_CODE', message: 'x', data: { attempts_remaining: 4 } }) });
  const o = await openCliHub(f.http, PLACES, { now: () => NOW });
  if (!o.ok) throw new Error('not opened');
  const ends: unknown[] = [];
  o.client.onAuthEnded!((e) => ends.push(e));
  for (const [path, body] of [['/users/auth/2fa/verify-setup', { code: '000000' }], ['/users/auth/2fa/verify-setup', { code: '111111' }], ['/auth/tokens', { alias: 'a', otp_code: '000000' }]] as const) {
    const c = controls();
    await expect(o.client.request('POST', path, body, c)).rejects.toMatchObject({ status: 401, code: 'INVALID_OTP_CODE' });
    expect(c.attempts).toHaveLength(1);
  }
  expect(f.sent.map((s) => s.url)).toEqual([ORIGIN + '/api/v1/users/auth/2fa/verify-setup', ORIGIN + '/api/v1/users/auth/2fa/verify-setup', ORIGIN + '/api/v1/auth/tokens']);
  expect(f.renewals()).toBe(0);
  expect(ends).toEqual([]);
});

const ME = ORIGIN + '/api/v1/users/auth/me';
const WRONG_PASSWORD = { statusCode: 401, error: 'INVALID_TOKEN', message: 'Invalid password' };

test('a wrong password is sent once', async () => {
  const tok = jwt(UID, NOW + 3_600_000);
  const f = fakeCli({ token: tok, renewed: [jwt(UID, NOW + 7_200_000, 1)], answer: (s) => (s.url === ME ? json(200, { data: { id: UID } }) : json(401, WRONG_PASSWORD)) });
  const o = await openCliHub(f.http, PLACES, { now: () => NOW });
  if (!o.ok) throw new Error('not opened');
  const ends: unknown[] = [];
  o.client.onAuthEnded!((e) => ends.push(e));
  for (const [method, path, body] of [['DELETE', '/users/auth/2fa', { password: 'wrong', code: '123456' }], ['POST', '/users/auth/2fa/setup', { password: 'wrong' }]] as const) {
    const c = controls();
    await expect(o.client.request(method, path, body, c)).rejects.toMatchObject({ status: 401, code: 'INVALID_TOKEN' });
    expect(c.attempts).toHaveLength(1);
  }
  // Each: the request once, then the read that found the session working (same bearer, no redirect).
  expect(f.sent).toEqual([
    { url: ORIGIN + '/api/v1/users/auth/2fa', method: 'DELETE', auth: `Bearer ${tok}`, redirect: 'manual' },
    { url: ME, method: 'GET', auth: `Bearer ${tok}`, redirect: 'manual' },
    { url: ORIGIN + '/api/v1/users/auth/2fa/setup', method: 'POST', auth: `Bearer ${tok}`, redirect: 'manual' },
    { url: ME, method: 'GET', auth: `Bearer ${tok}`, redirect: 'manual' },
  ]);
  expect(f.renewals()).toBe(0);
  expect(ends).toEqual([]);
  expect(await o.client.request('GET', '/users/auth/me', null, controls())).toEqual({ data: { id: UID } });
});

test('a typed request under a dead session', async () => {
  const tok = jwt(UID, NOW + 3_600_000);
  const fresh = jwt(UID, NOW + 7_200_000, 1);
  // The API refuses the old token everywhere: renewed, the request goes out again and is the route's to answer.
  const ok = fakeCli({ token: tok, renewed: [fresh], answer: (s) => (s.auth === `Bearer ${fresh}` ? json(200, { data: { ok: true } }) : json(401, { error: 'INVALID_TOKEN' })) });
  let o = await openCliHub(ok.http, PLACES, { now: () => NOW });
  if (!o.ok) throw new Error('not opened');
  const c = controls();
  expect(await o.client.request('POST', '/users/auth/2fa/setup', { password: 'right' }, c)).toEqual({ data: { ok: true } });
  expect(ok.sent.map((s) => [s.url.slice(ORIGIN.length + 7), s.auth])).toEqual([['/users/auth/2fa/setup', `Bearer ${tok}`], ['/users/auth/me', `Bearer ${tok}`], ['/users/auth/2fa/setup', `Bearer ${fresh}`]]);
  expect(ok.renewals()).toBe(1);
  expect(c.attempts).toHaveLength(2);
  expect(c.attempts[1]).toEqual(c.attempts[0]);

  // The renewal is refused: the session ends, the 401 stands.
  const dead = fakeCli({ token: tok, renewed: [undefined], answer: () => json(401, { error: 'SESSION_REVOKED' }) });
  o = await openCliHub(dead.http, PLACES, { now: () => NOW });
  if (!o.ok) throw new Error('not opened');
  const ends: unknown[] = [];
  o.client.onAuthEnded!((e) => ends.push(e));
  await expect(o.client.request('POST', '/users/auth/2fa/setup', { password: 'right' }, controls())).rejects.toMatchObject({ status: 401 });
  expect(dead.sent).toHaveLength(2);
  expect(ends).toEqual([{ sid: 'sess-1', reason: 'expired' }]);

  // The read got no answer (a failing platform, then a dropped connection): nothing is decided, renewed or sent again.
  for (const read of [() => json(503, {}), () => { throw new TypeError('fetch failed'); }]) {
    const quiet = fakeCli({ token: tok, renewed: [fresh], answer: (s) => (s.url === ME ? read() : json(401, WRONG_PASSWORD)) });
    o = await openCliHub(quiet.http, PLACES, { now: () => NOW });
    if (!o.ok) throw new Error('not opened');
    const heard: unknown[] = [];
    o.client.onAuthEnded!((e) => heard.push(e));
    await expect(o.client.request('POST', '/users/auth/2fa/setup', { password: 'p' }, controls())).rejects.toMatchObject({ status: 401, code: 'INVALID_TOKEN' });
    expect(quiet.sent).toHaveLength(2);
    expect(quiet.renewals()).toBe(0);
    expect(heard).toEqual([]);
  }
});

test('a reissued pair', async () => {
  const tok = jwt(UID, NOW + 3_600_000);
  const fresh = jwt(UID, NOW + 7_200_000, 1);
  const freshRefresh = jwt(UID, NOW + 86_400_000, 2);
  const f = fakeCli({ token: tok, renewed: [jwt(UID, NOW + 9_000_000, 3)], answer: () => json(200, { data: { ok: true } }) });
  const kept: unknown[] = [];
  const order: string[] = [];
  let release: (v: boolean) => void = () => undefined;
  f.http.adoptReissuedSession = (pair) => { kept.push(pair); order.push('keep'); return new Promise<boolean>((done) => { release = (v) => { order.push('kept'); done(v); }; }); };
  const renewOf = f.http.forceRefreshToken;
  f.http.forceRefreshToken = () => { order.push('renew'); return renewOf(); };
  let now = NOW;
  const o = await openCliHub(f.http, PLACES, { now: () => now });
  if (!o.ok) throw new Error('not opened');
  const adopt = o.client.adoptSession!;
  // Not this session's: another account, another session, an access key, a refresh token of another session, a
  // session id that differs, nothing.
  for (const pair of [
    { token: jwt(OTHER_UID, NOW + 7_200_000, 1), refreshToken: jwt(OTHER_UID, NOW + 86_400_000, 2) },
    { token: fresh.replace(b64({ id: UID, sid: 'sess-1', exp: Math.floor((NOW + 7_200_000) / 1000), n: 1 }), b64({ id: UID, sid: 'sess-2', exp: Math.floor((NOW + 7_200_000) / 1000), n: 1 })), refreshToken: freshRefresh },
    { token: 'hdy_' + 'k'.repeat(40), refreshToken: freshRefresh },
    { token: fresh, refreshToken: jwt(OTHER_UID, NOW + 86_400_000, 2) },
    { token: fresh, refreshToken: freshRefresh, session_id: 'sess-9' },
    { token: fresh, refreshToken: null },
    {},
  ]) expect(adopt(pair)).toBe(false);
  await o.client.request('GET', '/notes', null, controls());
  expect(f.sent.at(-1)!.auth).toBe(`Bearer ${tok}`);
  expect(kept).toEqual([]);

  expect(adopt({ token: fresh, refreshToken: freshRefresh, session_id: 'sess-1' })).toBe(true);
  await o.client.request('GET', '/notes', null, controls());
  expect(f.sent.at(-1)!.auth).toBe(`Bearer ${fresh}`);
  await Promise.resolve();
  expect(kept).toEqual([{ token: fresh, refreshToken: freshRefresh }]);
  // The new access token lapses while the CLI is still keeping the pair: the renewal waits for it.
  now = NOW + 7_200_000;
  const call = o.client.request('GET', '/notes', null, controls());
  await new Promise((r) => setTimeout(r, 5));
  expect(order).toEqual(['keep']);
  release(true);
  await call;
  expect(order).toEqual(['keep', 'kept', 'renew']);

  // A CLI with no way to keep one: the mount still goes on with the new bearer.
  const plain = fakeCli({ token: tok, answer: () => json(200, {}) });
  const p = await openCliHub(plain.http, PLACES, { now: () => NOW });
  if (!p.ok) throw new Error('not opened');
  expect(p.client.adoptSession!({ token: fresh, refreshToken: freshRefresh })).toBe(true);
  await p.client.request('GET', '/notes', null, controls());
  expect(plain.sent.at(-1)!.auth).toBe(`Bearer ${fresh}`);
});

test('renew before a call', async () => {
  let now = NOW;
  const tok = jwt(UID, NOW + 60_000);
  const fresh = jwt(UID, NOW + 3_600_000, 1);
  const f = fakeCli({ token: tok, renewed: [fresh], answer: () => json(200, {}) });
  const o = await openCliHub(f.http, PLACES, { now: () => now });
  if (!o.ok) throw new Error('not opened');
  now = NOW + 120_000;
  await o.client.request('GET', '/notes', null, controls());
  expect(f.renewals()).toBe(1);
  expect(f.sent.map((s) => s.auth)).toEqual([`Bearer ${fresh}`]);
});

const KEY = 'hdy_' + 'k'.repeat(40);
const KEY_ID = 'a1a1a1a1a1a1a1a1a1a1a1a1';
/** A fake CLI holding an access key: introspection, then the owner (on whichever host it is asked). */
function keyCli(realmIds: string[], me: () => Response = () => json(200, { data: { id: UID, username: 'ada' } }), more: (s: Sent) => Response = () => json(404, { error: 'NOT_FOUND' }), allowNoRealm = realmIds.length === 0) {
  return fakeCli({ token: KEY, answer: (s) => {
    const path = new URL(s.url).pathname;
    if (path === '/api/v1/auth/tokens/me') return json(200, { data: { token: { id: KEY_ID, alias: 'cli', realm_ids: realmIds, allow_no_realm: allowNoRealm, permissions: { computers: { read: true }, projects: { read: true } }, expires_at: null } } });
    if (path === '/api/v1/users/auth/me') return me();
    return more(s);
  } });
}

test('access key', async () => {
  const f = keyCli([REALM]);
  const o = await openCliHub(f.http, PLACES, { now: () => NOW });
  if (!o.ok) throw new Error('not opened');
  expect(o.kind).toBe('token');
  expect(o.realm).toBe(REALM);
  // The uid is the key's OWNER (core's token boot compares it with /users/auth/me), the sid the key itself.
  expect(o.client.identity).toEqual({ kind: 'token', uid: UID, sid: KEY_ID, source: 'key', realm: REALM });
  expect(f.sent).toEqual([
    { url: ORIGIN + '/api/v1/auth/tokens/me', method: 'GET', auth: `Bearer ${KEY}`, redirect: 'manual' },
    { url: `https://${REALM}.example.invalid/api/v1/users/auth/me`, method: 'GET', auth: `Bearer ${KEY}`, redirect: 'manual' },
  ]);
  // A key on no realm asks on the base host.
  const free = keyCli([]);
  const p = await openCliHub(free.http, PLACES, { now: () => NOW });
  expect(p.ok && p.client.identity).toEqual({ kind: 'token', uid: UID, sid: KEY_ID, source: 'key' });
  expect(free.sent[1]!.url).toBe(ORIGIN + '/api/v1/users/auth/me');
  // The owner read refused or unusable: not opened.
  expect(await openCliHub(keyCli([REALM], () => json(401, { error: 'UNAUTHORIZED' })).http, PLACES, { now: () => NOW })).toEqual({ ok: false, why: 'expired' });
  expect(await openCliHub(keyCli([REALM], () => json(200, { data: { id: 'not-an-id' } })).http, PLACES, { now: () => NOW })).toEqual({ ok: false, why: 'unreadable' });
  expect(await openCliHub(keyCli([REALM], () => json(403, { error: 'FORBIDDEN' })).http, PLACES, { now: () => NOW })).toEqual({ ok: false, why: 'unreadable' });
  // The platform did not answer (no answer, busy, failing): 'unanswered', on either read; the key may be fine.
  for (const me of [() => json(503, {}), () => json(429, {}), (): Response => { throw new TypeError('fetch failed'); }]) {
    expect(await openCliHub(keyCli([REALM], me).http, PLACES, { now: () => NOW })).toEqual({ ok: false, why: 'unanswered' });
  }
  const down = fakeCli({ token: KEY, answer: () => json(502, {}) });
  expect(await openCliHub(down.http, PLACES, { now: () => NOW })).toEqual({ ok: false, why: 'unanswered' });
  expect(down.sent.length).toBe(1);
});

test('key with several realms', async () => {
  const rules = { env: {}, idsForAlias: () => [], parseAliases: () => ({}) };
  const THIRD = 'f3f3f3f3f3f3f3f3f3f3f3f3';
  const f = keyCli([REALM, OTHER_REALM]);
  const o = await openCliHub(f.http, PLACES, { now: () => NOW });
  if (!o.ok) throw new Error('not opened');
  expect(o.realm).toBeUndefined();
  expect(o.realms).toEqual([REALM, OTHER_REALM]);
  expect(o.client.identity.realm).toBeUndefined();
  const n = f.sent.length;
  const first = await cliStartRealm(o, rules);
  expect(first).toMatchObject({ ok: true, realm: REALM, source: 'key' });
  expect(first.ok && first.client.identity).toEqual({ kind: 'token', uid: UID, sid: KEY_ID, source: 'key', realm: REALM });
  expect(await cliStartRealm(o, { ...rules, saved: OTHER_REALM })).toMatchObject({ ok: true, realm: OTHER_REALM, source: 'saved' });
  expect(await cliStartRealm(o, { ...rules, saved: 'all' })).toMatchObject({ ok: true, realm: REALM, source: 'key' });
  const typed = await cliStartRealm(o, { ...rules, flag: OTHER_REALM });
  expect(typed.ok && typed.client.identity.realm).toBe(OTHER_REALM);
  for (const flag of [THIRD, 'all']) expect(await cliStartRealm(o, { ...rules, flag })).toEqual({ ok: false, exit: 2, lines: [`error: this access key is limited to realms ${REALM}, ${OTHER_REALM}; pass one of them (--realm <id>).`] });
  // Its own list, never GET /realms on the base host (a realm-limited key is refused there).
  expect(f.sent.length).toBe(n);
  // A key on no realm that may not work outside one: All realms is refused before the mount; a realm is bound.
  const bare = await openCliHub(keyCli([], undefined, () => json(200, { data: { realm_ids: [] } }), false).http, PLACES, { now: () => NOW });
  if (!bare.ok) throw new Error('not opened');
  expect(await cliStartRealm(bare, rules)).toEqual({ ok: false, exit: 2, lines: ['error: this access key cannot use All realms; pass a realm (--realm <id>).'] });
  const pinned = await cliStartRealm(bare, { ...rules, flag: THIRD });
  expect(pinned.ok && pinned.client.identity.realm).toBe(THIRD);
  const open = await openCliHub(keyCli([], undefined, () => json(200, { data: { realm_ids: [] } })).http, PLACES, { now: () => NOW });
  if (!open.ok) throw new Error('not opened');
  const all = await cliStartRealm(open, rules);
  expect(all.ok && all.realm).toBe('all');
  expect(all.ok && all.client).toBe(open.client);
  // An account session's client is the one opened.
  const acct = fakeCli({ token: jwt(UID, NOW + 3_600_000), answer: () => json(200, { data: { realm_ids: [] } }) });
  const a = await openCliHub(acct.http, PLACES, { now: () => NOW });
  if (!a.ok) throw new Error('not opened');
  const s = await cliStartRealm(a, rules);
  expect(s.ok && s.client).toBe(a.client);
});

test('two calls out with the old token: the first renews, the second is sent again without a second renewal', async () => {
  const tok = jwt(UID, NOW + 3_600_000);
  const fresh = jwt(UID, NOW + 7_200_000, 1);
  // The second call's 401 is held until the first call's renewal and resend are over.
  let releaseB!: () => void;
  const heldB = new Promise<void>((r) => { releaseB = r; });
  const sent: Sent[] = [];
  let renewals = 0;
  const http: CliHttp = {
    getAuthToken: async () => tok,
    // As the CLI does: one renewal, then none for a minute.
    forceRefreshToken: async () => (++renewals === 1 ? fresh : undefined),
    getRefreshFailure: () => undefined,
    getFetch: () => async (url, init) => {
      const h = new Headers(init?.headers);
      const s: Sent = { url, method: String(init?.method), auth: h.get('authorization') ?? undefined, redirect: init?.redirect };
      sent.push(s);
      if (s.auth === `Bearer ${fresh}`) return json(200, { data: { path: new URL(url).pathname } });
      if (new URL(url).pathname.endsWith('/b')) await heldB;
      return json(401, { error: 'UNAUTHORIZED' });
    },
  };
  const ends: unknown[] = [];
  const o = await openCliHub(http, PLACES, { now: () => NOW });
  if (!o.ok) throw new Error('not opened');
  o.client.onAuthEnded!((e) => ends.push(e));
  const a = o.client.request('GET', '/a', undefined, controls());
  const b = o.client.request('GET', '/b', undefined, controls());
  await a;
  releaseB();
  expect(await b).toEqual({ data: { path: '/api/v1/b' } });
  expect(renewals).toBe(1);
  expect(ends).toEqual([]);
  expect(sent.filter((s) => s.url.endsWith('/b')).map((s) => s.auth)).toEqual([`Bearer ${tok}`, `Bearer ${fresh}`]);
});

test('hub places', async () => {
  const seen: Array<{ url: string; redirect: string | undefined }> = [];
  const answer = (r: Response) => ({ getFetch: () => async (url: string, init?: RequestInit) => { seen.push({ url, redirect: init?.redirect }); return r; } });
  expect(await readHubPlaces(answer(json(200, { data: { realm_api_domain: 'example.invalid', proxy_domain: 'c.example.invalid' } })), ORIGIN)).toEqual({ apiOrigin: ORIGIN, realmApiDomain: 'example.invalid', proxyDomain: 'c.example.invalid' });
  expect(seen).toEqual([{ url: ORIGIN + '/api/v1/hub/config', redirect: 'manual' }]);
  expect(await readHubPlaces(answer(json(200, { data: { realm_api_domain: 'example.invalid' } })), ORIGIN)).toEqual({ apiOrigin: ORIGIN, realmApiDomain: 'example.invalid' });
  expect(await readHubPlaces(answer(json(200, { data: { proxy_domain: 'c.example.invalid' } })), ORIGIN)).toBeNull();
  expect(await readHubPlaces(answer(json(503, {})), ORIGIN)).toBeNull();
  expect(await readHubPlaces({ getFetch: () => async () => { throw new Error('offline'); } }, ORIGIN)).toBeNull();
});

test('start realm', async () => {
  const tok = jwt(UID, NOW + 3_600_000);
  const rules = { env: {}, idsForAlias: (map: Readonly<Record<string, string>>, alias: string) => Object.keys(map).filter((id) => map[id]!.toLowerCase() === alias.toLowerCase()), parseAliases: (v: unknown) => (v && typeof v === 'object' ? v as Record<string, string> : {}) };
  const named = fakeCli({ token: tok, answer: (s) => (s.url.endsWith('/vault/keys/hoody.realm-aliases') ? json(200, { data: { value: { [REALM]: 'Work' } } }) : json(500, {})) });
  const o = await openCliHub(named.http, PLACES, { now: () => NOW });
  if (!o.ok) throw new Error('not opened');
  expect(await cliStartRealm(o, { ...rules, flag: 'work' })).toMatchObject({ ok: true, realm: REALM, source: 'flag' });
  expect(named.sent.map((s) => s.url)).toEqual([ORIGIN + '/api/v1/vault/keys/hoody.realm-aliases']);
  // No alias map yet (404): no names, so the typed name is not found; a failed read says so instead.
  const none = fakeCli({ token: tok, answer: (s) => (s.url.includes('/realms?') ? json(200, { data: { realm_ids: [REALM, OTHER_REALM], usage: { [REALM]: { computers: 1 }, [OTHER_REALM]: { computers: 3 } } } }) : json(404, { error: 'VAULT_KEY_NOT_FOUND' })) });
  const p = await openCliHub(none.http, PLACES, { now: () => NOW });
  if (!p.ok) throw new Error('not opened');
  const notFound = await cliStartRealm(p, { ...rules, flag: 'work' });
  expect(notFound.ok).toBe(false);
  expect(JSON.stringify(notFound)).not.toContain('could not read the realm names');
  const broken = fakeCli({ token: tok, answer: () => json(500, {}) });
  const q = await openCliHub(broken.http, PLACES, { now: () => NOW });
  if (!q.ok) throw new Error('not opened');
  expect(JSON.stringify(await cliStartRealm(q, { ...rules, flag: 'work' }))).toContain('could not read the realm names');
  // Nothing typed: the realm list with its usage; the one with the most computers, or the last run's while listed.
  expect(await cliStartRealm(p, rules)).toMatchObject({ ok: true, realm: OTHER_REALM, source: 'most-computers' });
  expect(await cliStartRealm(p, { ...rules, saved: REALM })).toMatchObject({ ok: true, realm: REALM, source: 'saved' });
  expect(none.sent.map((s) => s.url)).toEqual([ORIGIN + '/api/v1/vault/keys/hoody.realm-aliases', ORIGIN + '/api/v1/realms?include_usage=true', ORIGIN + '/api/v1/realms?include_usage=true']);
});

test('token boot', async () => {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (const [realms, flag] of [[[REALM], undefined], [[REALM, OTHER_REALM], OTHER_REALM]] as const) {
    const f = keyCli([...realms], undefined, (s) => (new URL(s.url).pathname === '/api/v1/realms' ? json(200, { data: { realm_ids: [...realms] } }) : json(404, { error: 'NOT_FOUND' })));
    const o = await openCliHub(f.http, PLACES, { now: () => NOW });
    if (!o.ok) throw new Error('not opened');
    const start = await cliStartRealm(o, { env: {}, ...(flag ? { flag } : {}), idsForAlias: () => [], parseAliases: () => ({}) });
    if (!start.ok) throw new Error('no start realm');
    const meHere = () => f.sent.filter((x) => x.url === `https://${start.realm}.example.invalid/api/v1/users/auth/me`).length;
    const before = meHere();
    let out = '';
    const io: HubTermOptions['io'] = { cells: { write: (t) => { out += t; } }, input: { onData: () => () => {} }, size: () => ({ cols: 100, rows: 30 }), colourTier: 'mono' };
    let ended: Receipt | null = null;
    // Ended by its signal, as a host ends it: a session that ends only shows the signed-out screen and waits.
    const ac = new AbortController();
    const done = mountTerminalHub({ styles: UNSTYLED_FOR_TESTS, client: start.client, context: { profile: 'test', realmId: start.realm }, io, onSetDefault: async () => {}, signal: ac.signal });
    void done.then((r) => { ended = r; });
    for (let i = 0; i < 400 && !out.includes('HOODY'); i++) await wait(25);
    // Core's token boot ran (introspection, then who the key is, on the pinned realm's host) and kept the session.
    for (let i = 0; i < 200 && meHere() === before; i++) await wait(25);
    await wait(1000);
    expect(meHere()).toBeGreaterThan(before);
    expect(ended).toBeNull();
    expect(out).toContain('HOODY');
    ac.abort();
    await done;
  }
});

/** The reasons openCliHub gives for not opening. */
type Why = Extract<Awaited<ReturnType<typeof openCliHub>>, { ok: false }>['why'];

const ECONN = new TypeError('fetch failed', { cause: Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }) });

test('sign-in read fails', async () => {
  const cases: Array<[unknown, Why]> = [
    [Object.assign(new Error('2FA is enabled on this account.'), { code: 'TWO_FACTOR_REQUIRED' }), 'needs-2fa'],
    [ECONN, 'unanswered'],
    [Object.assign(new Error('x'), { status: 0, code: 'NETWORK_ERROR' }), 'unanswered'],
    [Object.assign(new Error('x'), { name: 'TimeoutError' }), 'unanswered'],
    [Object.assign(new Error('x'), { status: 429, code: 'RATE_LIMITED' }), 'unanswered'],
    [Object.assign(new Error('x'), { status: 503 }), 'unanswered'],
    [Object.assign(new Error('Your account has been banned'), { status: 403 }), 'signed-out'],
    [Object.assign(new Error('Invalid credentials'), { status: 401 }), 'signed-out'],
    [new Error('the saved token is for another API'), 'signed-out'],
  ];
  for (const [thrown, why] of cases) {
    const f = fakeCli({ tokenThrows: thrown, answer: () => json(200, {}) });
    expect(await openCliHub(f.http, PLACES, { now: () => NOW })).toEqual({ ok: false, why });
    expect(f.sent).toEqual([]);
  }
});

test('expired at start, not answered', async () => {
  const old = jwt(UID, NOW - 1000);
  const cases: Array<[Renewal, Why]> = [
    [{ reason: 'unanswered' }, 'unanswered'],
    [{ throws: ECONN }, 'unanswered'],
    [{ throws: Object.assign(new Error('x'), { code: 'TWO_FACTOR_REQUIRED' }) }, 'needs-2fa'],
    [{ reason: 'expired' }, 'expired'],
    [{ reason: 'revoked' }, 'expired'],
    [{ throws: Object.assign(new Error('x'), { status: 401 }) }, 'expired'],
    [undefined, 'expired'],
  ];
  for (const [renewal, why] of cases) {
    const f = fakeCli({ token: old, renewed: [renewal], answer: () => json(200, {}) });
    expect(await openCliHub(f.http, PLACES, { now: () => NOW })).toEqual({ ok: false, why });
    expect(f.sent).toEqual([]);
  }
});

test('renewal not answered keeps the session', async () => {
  const tok = jwt(UID, NOW + 3_600_000);
  const fresh = jwt(UID, NOW + 7_200_000, 1);
  for (const first of [{ reason: 'unanswered' }, { throws: ECONN }] as Renewal[]) {
    let n = 0;
    const f = fakeCli({ token: tok, renewed: [first, fresh], answer: (s) => (s.auth === `Bearer ${fresh}` ? json(200, { data: { ok: true } }) : (n++, json(401, { error: 'UNAUTHORIZED' }))) });
    const o = await openCliHub(f.http, PLACES, { now: () => NOW });
    if (!o.ok) throw new Error('not opened');
    const ends: unknown[] = [];
    o.client.onAuthEnded!((e) => ends.push(e));
    await expect(o.client.request('GET', '/notes', null, controls())).rejects.toMatchObject({ status: 401 });
    expect(ends).toEqual([]);
    expect(f.renewals()).toBe(1);
    expect(await o.client.request('GET', '/notes', null, controls())).toEqual({ data: { ok: true } });
    expect(f.renewals()).toBe(2);
    expect(ends).toEqual([]);
  }
});

test('a renewal out during an adoption is dropped', async () => {
  const fresh = jwt(UID, NOW + 7_200_000, 1);
  const freshRefresh = jwt(UID, NOW + 86_400_000, 2);
  // What the held renewal answers: a token renewed from the session as it was, or a refusal (the old refresh token).
  for (const late of [jwt(UID, NOW + 9_000_000, 3), { reason: 'refused' }] as const) {
    const tok = jwt(UID, NOW + 3_600_000);
    const f = fakeCli({ token: tok, renewed: [late], answer: () => json(200, { data: { ok: true } }) });
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => { release = r; });
    const renewOf = f.http.forceRefreshToken;
    f.http.forceRefreshToken = async () => { await held; return renewOf(); };
    let now = NOW;
    const o = await openCliHub(f.http, PLACES, { now: () => now });
    if (!o.ok) throw new Error('not opened');
    const ends: unknown[] = [];
    o.client.onAuthEnded!((e) => ends.push(e));
    // The access token reads as about to lapse: the next call renews first, and that renewal is held.
    now = NOW + 3_600_000;
    const call = o.client.request('GET', '/notes', null, controls());
    await new Promise((r) => setTimeout(r, 5));
    expect(f.sent).toHaveLength(0);
    // The change answers its pair while the renewal is still out.
    expect(o.client.adoptSession!({ token: fresh, refreshToken: freshRefresh, session_id: 'sess-1' })).toBe(true);
    now = NOW;
    release();
    await call;
    expect(f.renewals()).toBe(1);
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0]!.auth).toBe(`Bearer ${fresh}`);
    await o.client.request('GET', '/notes', null, controls());
    expect(f.sent.at(-1)!.auth).toBe(`Bearer ${fresh}`);
    expect(f.renewals()).toBe(1);
    expect(ends).toEqual([]);
  }
});
