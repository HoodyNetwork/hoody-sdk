// api(): host table, framed lock, context fencing and C9 outcomes over the real shared.js apiCall.
// Behaviour only, on the real modules.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, onPending, openMutations, outcomeOf, setOtpPrompt, unknownOutcome, type HubError, type PendingNotice } from './api';
import { alive, bump, capture, setIdentity, startLoggingOut } from './ctx';
import { defineRoute, isDeclaredCode } from './routes';
import { boot, calls, DOMAIN, deferred, hostOf, loadShared, onFetch, OTHER, R1, R2, sessionToken, settle, signIn, UID } from './test/env';

const listContainers = defineRoute<{ data: unknown }>({ method: 'GET', path: '/computers', scope: 'realm' });
const listProjects = defineRoute({ method: 'GET', path: '/projects', scope: 'base', query: ['page', 'limit'] });
const startContainer = defineRoute({ method: 'POST', path: '/computers/:id/start', scope: 'realm', body: [] });
const patchContainer = defineRoute({ method: 'PATCH', path: '/computers/:id', scope: 'realm', body: ['realm_ids', 'name'] });
const patchContainerBase = defineRoute({ method: 'PATCH', path: '/computers/:id', scope: 'base', body: ['realm_ids', 'name'] });
const readVault = defineRoute({ method: 'GET', path: '/vault/keys/:key', scope: 'realm' });
const realms = defineRoute({ method: 'GET', path: '/realms', scope: 'realm', query: ['include_usage'] });
const patchUser = defineRoute({ method: 'PATCH', path: '/users/:id', scope: 'realm', body: ['email'] });
const createBotUrl = defineRoute({ method: 'POST', path: '/bot-urls', scope: 'realm', body: ['bot'] });
const mintToken = defineRoute({ method: 'POST', path: '/auth/tokens', scope: 'base', body: ['name'], secret: true, codes: ['TOKEN_LIMIT'] });
const tokensList = defineRoute({ method: 'GET', path: '/auth/tokens', scope: 'base' });
const pendingEmailChange = defineRoute({ method: 'GET', path: '/users/me/email-change', scope: 'base' });
const me = defineRoute({ method: 'GET', path: '/users/auth/me', scope: 'base' });
const ackNote = defineRoute({ method: 'PUT', path: '/notifications/:id/read', scope: 'realm', body: [] });

let notices: PendingNotice[] = [];
let offPending: () => void = () => {};
beforeEach(() => {
  offPending();
  notices = [];
  offPending = onPending((n) => notices.push(n));
  setOtpPrompt(null);
});

const outcome = (p: Promise<unknown>) => p.then(() => 'done', (e: HubError) => e);

describe('routes: only declared routes leave, with their declared keys', () => {
  it('a hand-made route object is refused unsent', async () => {
    boot();
    const fake = { ...listContainers };
    const e = await outcome(api(fake as typeof listContainers));
    expect(e).toMatchObject({ kind: 'not_sent', code: 'ROUTE_NOT_DECLARED', notSent: true });
    expect(calls.length).toBe(0);
  });
  it('an undeclared query key, body key or missing param is refused unsent', async () => {
    boot();
    expect(await outcome(api(listProjects, { query: { page: 1, evil: 'x' } as never }))).toMatchObject({ code: 'ROUTE_QUERY' });
    expect(await outcome(api(patchContainer, { params: { id: 'c1' }, body: { name: 'a', owner: 'x' } as never }))).toMatchObject({ code: 'ROUTE_BODY' });
    expect(await outcome(api(startContainer, {}))).toMatchObject({ code: 'ROUTE_PARAMS' });
    expect(await outcome(api(startContainer, { params: { id: '..' } }))).toMatchObject({ code: 'ROUTE_PARAMS' });
    for (const id of ['../x', 'a/b', 'a\\b', '%2e%2e', 'a\nb', 'x'.repeat(257)]) expect(await outcome(api(startContainer, { params: { id } }))).toMatchObject({ code: 'ROUTE_PARAMS' });
    expect(calls.length).toBe(0);
  });
  it('params are one encoded segment each', async () => {
    boot({ realm: R1 });
    await api(startContainer, { params: { id: 'a b?c#d' } }).catch(() => 0);
    expect(calls.map((c) => c.url)).toEqual([`https://${R1}.${DOMAIN}/api/v1/computers/a%20b%3Fc%23d/start`]);
  });
});

describe('owner binding', () => {
  it('a change with no known account goes with owner null: refused unsent, never with a stored token', async () => {
    boot({ realm: R1, identity: false, signedIn: false });
    const ctx = capture();
    expect(ctx.account).toBeNull();
    signIn(OTHER); // another tab signed in after this page captured no account
    const e = await api(startContainer, { params: { id: 'c1' }, ctx }).then(() => 'sent', (x: unknown) => x);
    expect(e).not.toBe('sent');
    expect(calls).toHaveLength(0);
  });
});

describe('host table', () => {
  for (const [route, input] of [
    [readVault, { params: { key: 'x' } }], [realms, {}], [patchUser, { params: { id: 'u1' }, body: { email: 'a@b.c' } }],
    [tokensList, {}], [ackNote, { params: { id: 'n1' } }],
  ] as const) {
    it(`${route.id} goes to the base host whatever the scope`, async () => {
      boot({ realm: R1 });
      await api(route as never, input as never).catch(() => 0);
      await settle();
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) expect(hostOf(c.url)).toBe('base');
    });
  }
  it('a realm route goes to the captured realm host', async () => {
    boot({ realm: R1 });
    await api(listContainers);
    expect(calls.map((c) => hostOf(c.url))).toEqual([`${R1}.${DOMAIN}`]);
  });
  it('realm "all" or a page without the realm domain uses the base host', async () => {
    boot({ realm: 'all' });
    await api(listContainers);
    boot({ realm: R1, domain: null });
    await api(listContainers);
    expect(calls.map((c) => hostOf(c.url))).toEqual(['base']);
  });
  it('a membership move only as a base PATCH of a full valid set', async () => {
    boot({ realm: R1 });
    expect(await outcome(api(patchContainer, { params: { id: 'c1' }, body: { realm_ids: [R2] } }))).toMatchObject({ code: 'MEMBERSHIP_ON_BASE_ONLY' });
    expect(await outcome(api(patchContainerBase, { params: { id: 'c1' }, body: { realm_ids: [] } }))).toMatchObject({ code: 'MEMBERSHIP_SET_INVALID' });
    expect(await outcome(api(patchContainerBase, { params: { id: 'c1' }, body: { realm_ids: ['nope'] } }))).toMatchObject({ code: 'MEMBERSHIP_SET_INVALID' });
    expect(calls.length).toBe(0);
    await api(patchContainerBase, { params: { id: 'c1' }, body: { realm_ids: [R1, R2] } });
    expect(calls.map((c) => hostOf(c.url))).toEqual(['base']);
  });
  it('a Global Bot is created on the base host; a realm Bot on the realm host', async () => {
    boot({ realm: R1 });
    await api(createBotUrl, { body: { bot: { realm: 'global' } } });
    await api(createBotUrl, { body: { bot: { realm: R1 } } });
    expect(calls.map((c) => hostOf(c.url))).toEqual(['base', `${R1}.${DOMAIN}`]);
  });
});

describe('framed: every change and the sensitive reads are refused unsent', () => {
  it('changes in base and realm scope', async () => {
    boot({ realm: R1, framed: true });
    for (const [r, i] of [[startContainer, { params: { id: 'c1' } }], [patchContainerBase, { params: { id: 'c1' }, body: { name: 'x' } }], [ackNote, { params: { id: 'n1' } }]] as const) {
      expect(await outcome(api(r as never, i as never))).toMatchObject({ code: 'FRAMED_ACTION_REFUSED', notSent: true, kind: 'not_sent' });
    }
    expect(calls.length).toBe(0);
  });
  it('a sensitive read (token list) is refused; an ordinary read goes out', async () => {
    boot({ realm: R1, framed: true });
    expect(await outcome(api(tokensList))).toMatchObject({ code: 'FRAMED_ACTION_REFUSED' });
    expect(await outcome(api(listContainers))).toBe('done');
    expect(calls.length).toBe(1);
  });
  it('the pending email change (a read) is refused unsent, and its confirm and revert links are on the framed list', async () => {
    boot({ realm: R1, framed: true });
    expect(await outcome(api(pendingEmailChange))).toMatchObject({ code: 'FRAMED_ACTION_REFUSED', notSent: true });
    expect(calls.length).toBe(0);
    const framed = loadShared().framedSensitiveRoute;
    for (const path of ['/auth/email-change/confirm', '/auth/email-change/revert']) {
      expect(framed('POST', path), `POST ${path}`).not.toBeNull();
      expect(framed('GET', path), `GET ${path} is no change`).toBeNull();
    }
    expect(framed('POST', '/auth/email-change/other'), 'only the two links').toBeNull();
    expect(framed('DELETE', '/users/me/email-change'), 'the request and its cancel, any method').not.toBeNull();
  });
});

describe('context: nothing is sent for a dead context', () => {
  it('a moved generation → stale, unsent', async () => {
    boot({ realm: R1 });
    const ctx = capture();
    bump('switch');
    expect(await outcome(api(listContainers, { ctx }))).toMatchObject({ kind: 'not_sent', stale: true, notSent: true });
    expect(calls.length).toBe(0);
  });
  it('another user signed in → the superseded refusal, unsent, never pending', async () => {
    boot({ realm: R1 });
    const ctx = capture();
    signIn(OTHER, 'sid0000000000002');
    expect(alive(ctx)).toBe(false);
    expect(await outcome(api(startContainer, { ctx, params: { id: 'c1' } }))).toMatchObject({ status: 401, superseded: true, kind: 'not_sent', notSent: true });
    expect(calls.length).toBe(0);
    expect(notices).toEqual([]);
  });
  it('the same user signed in again (new sid) is another session', async () => {
    boot({ realm: R1 });
    const ctx = capture();
    signIn(undefined, 'sid0000000000009');
    expect(alive(ctx)).toBe(false);
  });
  it('a refresh (same uid and sid) keeps the context alive', async () => {
    boot({ realm: R1 });
    const ctx = capture();
    signIn(undefined, 'sid0000000000001');
    expect(alive(ctx)).toBe(true);
  });
  it('sign-out started → every context is dead', async () => {
    boot({ realm: R1 });
    const ctx = capture();
    startLoggingOut();
    expect(alive(ctx)).toBe(false);
    expect(await outcome(api(listContainers, { ctx }))).toMatchObject({ kind: 'not_sent' });
  });
  it('the shown identity must be the captured account', async () => {
    boot({ realm: R1 });
    const ctx = capture();
    setIdentity({ id: OTHER, banned: false });
    expect(alive(ctx)).toBe(false);
  });
});

describe('C9 outcomes', () => {
  it('a read answered after its context died is dropped as stale', async () => {
    boot({ realm: R1 });
    const d = deferred();
    onFetch(async () => { await d.p; return { status: 200, body: { data: 1 } }; });
    const p = outcome(api(listContainers));
    await settle();
    bump('switch');
    d.res();
    expect(await p).toMatchObject({ kind: 'stale', stale: true, notSent: false });
  });
  it('a change answered after its context died is pending with one notice', async () => {
    boot({ realm: R1 });
    const d = deferred();
    onFetch(async () => { await d.p; return { status: 200, body: {} }; });
    const p = outcome(api(startContainer, { params: { id: 'c1' } }));
    await settle();
    bump('switch');
    d.res();
    expect(await p).toMatchObject({ kind: 'pending', pending: true });
    expect(notices).toEqual([{ realm: R1, signingOut: false }]);
  });
  for (const [what, reply] of [
    ['a 502', { status: 502, body: { error: 'BAD_GATEWAY' } }],
    ['a 500', { status: 500, body: {} }],
    ['a lost answer', { status: 0, network: true }],
  ] as const) {
    it(`a change answered with ${what} is pending, never failed`, async () => {
      boot({ realm: R1 });
      onFetch(() => reply);
      const e = await outcome(api(startContainer, { params: { id: 'c1' } }));
      expect(e).toMatchObject({ kind: 'pending', pending: true });
      expect(outcomeOf(e)).toBe('pending');
      expect(calls.length).toBe(1);
      expect(notices.length).toBe(1);
    });
  }
  it('a change answered 409 "still running" (in_progress) is pending, never failed; a read is not', async () => {
    boot({ realm: R1 });
    for (const code of ['in_progress', 'IDEMPOTENCY_REQUEST_IN_PROGRESS']) {
      onFetch(() => ({ status: 409, body: { error: code } }));
      const e = await outcome(api(startContainer, { params: { id: 'c1' } }));
      expect(e).toMatchObject({ status: 409, code });
      expect(outcomeOf(e, true)).toBe('pending');
      expect(outcomeOf(e)).toBe('failed');
    }
    expect(outcomeOf({ status: 422, code: 'in_progress' }, true)).toBe('failed');
  });
  it('a 4xx is a definite refusal (failed), passed on as a copy', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: { error: 'CONFLICT', message: 'busy' } }));
    const e = await outcome(api(startContainer, { params: { id: 'c1' } }));
    expect(e).toMatchObject({ status: 409, code: 'CONFLICT' });
    expect(outcomeOf(e)).toBe('failed');
    expect(notices).toEqual([]);
  });
  it('a read answered with a 502 is failed (reads are never pending)', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 502, body: {} }));
    expect(outcomeOf(await outcome(api(listContainers)))).toBe('failed');
  });
  it('recovers: no notice while the context lives', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 503, body: {} }));
    expect(await outcome(api(startContainer, { params: { id: 'c1' }, recovers: true }))).toMatchObject({ kind: 'pending' });
    expect(notices).toEqual([]);
  });
  it('one notice per context, even for two pending changes', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 504, body: {} }));
    const ctx = capture();
    await outcome(api(startContainer, { ctx, params: { id: 'c1' } }));
    await outcome(api(startContainer, { ctx, params: { id: 'c2' } }));
    expect(notices.length).toBe(1);
  });
  it('only a sent change is open for the sign-out warning, until it settles', async () => {
    boot({ realm: R1 });
    const d = deferred();
    onFetch(async () => { await d.p; return { status: 200, body: {} }; });
    const p = api(startContainer, { params: { id: 'c1' } });
    await settle();
    expect(openMutations().length).toBe(1);
    d.res();
    await p;
    expect(openMutations().length).toBe(0);
  });
  it('unknownOutcome: 5xx, 2xx-as-rejection, timeouts and missing status are unknown; 4xx and cancels are not', () => {
    for (const e of [{ status: 500 }, { status: 503 }, { status: 200 }, { status: 0 }, { code: 'TIMEOUT', status: 0 }, {}, null]) expect(unknownOutcome(e)).toBe(true);
    for (const e of [{ status: 400 }, { status: 404 }, { status: 0, cancelled: true }]) expect(unknownOutcome(e)).toBe(false);
  });
});

describe('secret calls: scrub and rebuilt rejections', () => {
  it('scrub sees every raw success answer once, also one then dropped as stale', async () => {
    boot({ realm: R1 });
    const seen: unknown[] = [];
    const d = deferred();
    onFetch(async () => { await d.p; return { status: 200, body: { token: 's3cret' } }; });
    const p = outcome(api(mintToken, { body: { name: 'x' }, scrub: (r) => { seen.push(JSON.stringify(r)); (r as { token?: string }).token = ''; } }));
    await settle();
    bump('switch');
    d.res();
    expect(await p).toMatchObject({ kind: 'pending' });
    expect(seen).toEqual(['{"token":"s3cret"}']);
  });
  it('a scrub that is not a function is refused unsent; one that throws gives no result', async () => {
    boot({ realm: R1 });
    expect(await outcome(api(mintToken, { body: { name: 'x' }, scrub: 'x' as never }))).toMatchObject({ code: 'SCRUB_INVALID' });
    expect(calls.length).toBe(0);
    onFetch(() => ({ status: 200, body: { token: 't' } }));
    expect(await outcome(api(mintToken, { body: { name: 'x' }, scrub: () => { throw new Error('x'); } }))).toEqual({ code: 'SCRUB_FAILED', route: 'POST /auth/tokens' });
  });
  it('a rejection keeps only safe fields, and a code only from the route list', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: { error: 'hdy_ECHOED_SECRET', message: 'your hdy_x', details: { t: 'hdy_x' } }, headers: { 'retry-after': '5' } }));
    const e = (await outcome(api(mintToken, { body: { name: 'x' } }))) as HubError;
    expect(e).toEqual({ code: null, status: 409, retryAfter: 5, route: 'POST /auth/tokens' });
    onFetch(() => ({ status: 409, body: { error: 'TOKEN_LIMIT' } }));
    expect(await outcome(api(mintToken, { body: { name: 'x' } }))).toMatchObject({ code: 'TOKEN_LIMIT', status: 409 });
  });
});

describe('2FA: changes go through the prompt; reads never do', () => {
  it('OTP_REQUIRED asks once, retries with otp_code on the same host', async () => {
    boot({ realm: R1 });
    let asked = 0;
    setOtpPrompt({ ask: async () => { asked++; return '123456'; }, cancel: () => {} });
    onFetch((c) => (c.body && c.body.otp_code === '123456' ? { status: 200, body: { ok: 1 } } : { status: 403, body: { error: 'OTP_REQUIRED' } }));
    expect(await api(startContainer, { params: { id: 'c1' } })).toEqual({ ok: 1 });
    expect(asked).toBe(1);
    expect(calls.map((c) => hostOf(c.url))).toEqual([`${R1}.${DOMAIN}`, `${R1}.${DOMAIN}`]);
  });
  it('Cancel after the first attempt went out: refused (nothing applied), not pending', async () => {
    boot({ realm: R1 });
    setOtpPrompt({ ask: async () => null, cancel: () => {} });
    onFetch(() => ({ status: 403, body: { error: 'OTP_REQUIRED' } }));
    const e = await outcome(api(startContainer, { params: { id: 'c1' } }));
    expect(e).toMatchObject({ cancelled: true });
    expect(outcomeOf(e)).toBe('failed');
    expect(notices).toEqual([]);
  });
  it('the prompt closed by a realm switch: the change that went out is pending', async () => {
    boot({ realm: R1 });
    setOtpPrompt({ ask: async () => { bump('switch'); return null; }, cancel: () => {} });
    onFetch(() => ({ status: 403, body: { error: 'OTP_REQUIRED' } }));
    expect(await outcome(api(startContainer, { params: { id: 'c1' } }))).toMatchObject({ kind: 'pending' });
  });
  it('another user signed in while the prompt was open: no retry', async () => {
    boot({ realm: R1 });
    setOtpPrompt({ ask: async () => { localStorage.setItem('access_token', sessionToken(OTHER, { sid: 'sid0000000000002' })); return '1'; }, cancel: () => {} });
    onFetch(() => ({ status: 403, body: { error: 'OTP_REQUIRED' } }));
    await outcome(api(startContainer, { params: { id: 'c1' } }));
    expect(calls.length).toBe(1);
  });
  it('changes are sent as the shown user (owner): a stored other user is never adopted', async () => {
    boot({ realm: R1 });
    const ctx = capture();
    localStorage.setItem('access_token', sessionToken(OTHER, { sid: 'sid0000000000002' }));
    expect(await outcome(api(startContainer, { ctx, params: { id: 'c1' } }))).toMatchObject({ superseded: true });
    expect(calls.length).toBe(0);
  });
});

describe('wrong endpoint code, bodyless DELETE', () => {
  const verifySetup = defineRoute({ method: 'POST', path: '/users/auth/2fa/verify-setup', scope: 'base', body: ['code'] });
  const dropThing = defineRoute({ method: 'DELETE', path: '/things/:id', scope: 'base' });
  it('the endpoint\'s own wrong code (401 INVALID_OTP_CODE) goes back to the form: no prompt, one send', async () => {
    boot({ realm: R1 });
    let asked = 0;
    setOtpPrompt({ ask: async () => (++asked > 2 ? null : '654321'), cancel: () => {} });
    // 403, not the server's 401: a 401 takes shared apiCall's refresh-and-resend path, which is not core's decision.
    onFetch(() => ({ status: 403, body: { error: 'INVALID_OTP_CODE', message: 'The verification code is incorrect or expired' } }));
    const e = (await outcome(api(verifySetup, { body: { code: '111111' } }))) as HubError;
    expect(e).toMatchObject({ code: 'INVALID_OTP_CODE', status: 403 });
    expect(asked).toBe(0);
    expect(calls.length).toBe(1);
  });
  it('a message that mentions a verification code is not a challenge without OTP_REQUIRED', async () => {
    boot({ realm: R1 });
    let asked = 0;
    setOtpPrompt({ ask: async () => (++asked > 2 ? null : '654321'), cancel: () => {} });
    onFetch(() => ({ status: 400, body: { error: 'SOMETHING', message: '2FA verification required' } }));
    await outcome(api(startContainer, { params: { id: 'c1' } }));
    expect(asked).toBe(0);
    expect(calls.length).toBe(1);
  });
  it('a wrong prompt code (INVALID_OTP_CODE after otp_code was sent) asks again', async () => {
    boot({ realm: R1 });
    const asks: boolean[] = [];
    const codes = ['000000', '123456'];
    setOtpPrompt({ ask: async (o?: { retry?: boolean }) => { asks.push(!!o?.retry); return codes.shift() || null; }, cancel: () => {} });
    onFetch((c) => (!c.body || !c.body.otp_code ? { status: 403, body: { error: 'OTP_REQUIRED' } } : c.body.otp_code === '123456' ? { status: 200, body: { ok: 1 } } : { status: 403, body: { error: 'INVALID_OTP_CODE' } }));
    expect(await api(startContainer, { params: { id: 'c1' } })).toEqual({ ok: 1 });
    expect(asks).toEqual([false, true]);
  });
  it('a DELETE with no declared body sends no body', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: { ok: 1 } }));
    await api(dropThing, { params: { id: 'x1' } });
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.body).toBeNull();
  });
  it('a bodyless DELETE retried after the prompt carries only otp_code', async () => {
    boot({ realm: R1 });
    setOtpPrompt({ ask: async () => '123456', cancel: () => {} });
    onFetch((c) => (c.body && c.body.otp_code ? { status: 200, body: { ok: 1 } } : { status: 403, body: { error: 'OTP_REQUIRED' } }));
    await api(dropThing, { params: { id: 'x1' } });
    expect(calls.map((c) => c.body)).toEqual([null, { otp_code: '123456' }]);
  });
});

describe("a secret route's agent code and the isFramed export", () => {
  it('a secret route keeps an agent\'s own lower-case code from its list', async () => {
    boot({ realm: R1 });
    const saveKey = defineRoute({ method: 'PUT', path: '/providers/:id/key', scope: 'agent', body: ['key'], secret: true, codes: ['api_key_refused', 'definition_changed'] });
    onFetch(() => ({ status: 422, body: { error: 'api_key_refused', message: 'refused hdy_x' } }));
    expect(await outcome(api(saveKey, { realm: R1, params: { id: 'p' }, body: { key: 'k' } }))).toMatchObject({ code: 'api_key_refused', status: 422 });
  });
  it('isFramed is exported from the core entry', async () => {
    const core = await import('./index');
    expect(typeof (core as Record<string, unknown>).isFramed).toBe('function');
  });
});

describe('a pending rejection keeps the server\'s wait', () => {
  it('a 503 with Retry-After on a change: pending, with retryAfter', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 503, body: {}, headers: { 'retry-after': '5' } }));
    const e = (await outcome(api(startContainer, { params: { id: 'c1' } }))) as HubError;
    expect(e).toMatchObject({ kind: 'pending', retryAfter: 5 });
  });
});

describe('the suspended account', () => {
  it('a Hoody API 403 ACCOUNT_BANNED calls the banned handler once per answer', async () => {
    const { setBannedHandler } = await import('./api');
    boot({ realm: R1 });
    let n = 0;
    setBannedHandler(() => { n++; });
    onFetch(() => ({ status: 403, body: { error: 'ACCOUNT_BANNED' } }));
    await outcome(api(listContainers));
    expect(n).toBe(1);
    setBannedHandler(null);
  });
});

describe('identity read', () => {
  it('GET /users/auth/me goes to the base host', async () => {
    boot({ realm: R1 });
    await api(me);
    expect(calls.map((c) => hostOf(c.url))).toEqual(['base']);
  });
});

describe('a gate decision still being applied is pending, never failed', () => {
  it('409 gate_decision_pending on a change is pending; a secret route keeps the still-running codes', async () => {
    expect(outcomeOf({ status: 409, code: 'gate_decision_pending' }, true)).toBe('pending');
    expect(outcomeOf({ status: 409, code: 'gate_decision_pending' }, false)).toBe('failed');
    boot({ realm: R1 });
    const turn = defineRoute({ method: 'POST', path: '/core2/turn', scope: 'agent', body: ['text'], secret: true });
    for (const code of ['in_progress', 'gate_decision_pending']) {
      onFetch(() => ({ status: 409, body: { error: code } }));
      const e = await outcome(api(turn, { realm: R1, body: { text: 'secret words' } }));
      expect(e).toMatchObject({ code, status: 409 });
      expect(outcomeOf(e, true)).toBe('pending');
    }
  });
});

describe('one call is bounded from its start, a hanging token refresh included', () => {
  it('a change whose token refresh hangs rejects not sent after timeoutMs + 5 s, and never leaves once the refresh answers', async () => {
    boot({ realm: R1 });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let release!: () => void;
      const hung = new Promise<{ status: number; body: unknown }>((res) => { release = () => res({ status: 200, body: { data: { token: sessionToken(UID, { sid: 'sid0000000000001', exp: Math.floor(Date.now() / 1000) + 3600 }), refreshToken: sessionToken(UID, { sid: 'sid0000000000001', exp: Math.floor(Date.now() / 1000) + 86400, n: 2 }), expires_at: new Date(Date.now() + 3_600_000).toISOString() } } }); });
      onFetch((c) => (/\/users\/auth\/refresh/.test(c.url) ? hung : { status: 200, body: { ok: 1 } }));
      localStorage.setItem('access_token_expires_at', new Date(Date.now() + 10000).toISOString());
      const p = outcome(api(startContainer, { params: { id: 'c1' }, timeoutMs: 1000 }));
      await vi.advanceTimersByTimeAsync(6100);
      const e = await p;
      expect(e).toMatchObject({ code: 'TIMEOUT', notSent: true });
      expect(outcomeOf(e)).toBe('not_sent');
      // A valid refresh (the session renewed, same account): the bounded call still never leaves late.
      const before = localStorage.getItem('refresh_token');
      release();
      await vi.advanceTimersByTimeAsync(50);
      await settle();
      expect(localStorage.getItem('refresh_token')).not.toBe(before);
      expect(calls.filter((c) => /\/computers\//.test(c.url))).toHaveLength(0);
    } finally { vi.useRealTimers(); }
  });
  it('without timeoutMs nothing changes (the caller bounds it, or the transport\'s defaults do)', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: { ok: 1 } }));
    expect(await api(startContainer, { params: { id: 'c1' } })).toEqual({ ok: 1 });
  });
});

describe('a route may name 409 codes that mean its change may still be under way', () => {
  const stopUpload = defineRoute({ method: 'POST', path: '/unk1/uploads/:id/stop', scope: 'realm', body: [], unknownCodes: ['PENDING_UPLOAD_BUSY'] });
  const deliver = defineRoute({ method: 'POST', path: '/unk1/uploads/:id/deliver', scope: 'realm', body: [] });
  const secretStop = defineRoute({ method: 'POST', path: '/unk1/s/stop', scope: 'agent', body: ['text'], secret: true, unknownCodes: ['PENDING_UPLOAD_BUSY'] });
  it('a 409 with a listed code on that route is pending (one notice), never failed; the same code elsewhere is a refusal', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: { error: 'PENDING_UPLOAD_BUSY' } }));
    const e = await outcome(api(stopUpload, { params: { id: 'u1' } }));
    expect(e).toMatchObject({ kind: 'pending', pending: true, status: 409, code: 'PENDING_UPLOAD_BUSY' });
    expect(outcomeOf(e, true)).toBe('pending');
    expect(outcomeOf(e)).toBe('pending');
    expect(notices.length).toBe(1);
    const d = await outcome(api(deliver, { params: { id: 'u1' } }));
    expect(d).toMatchObject({ status: 409, code: 'PENDING_UPLOAD_BUSY' });
    expect(outcomeOf(d, true)).toBe('failed');
  });
  it('another status with the code (not 404 or 409), or another 409 code, stays a refusal', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 422, body: { error: 'PENDING_UPLOAD_BUSY' } }));
    expect(outcomeOf(await outcome(api(stopUpload, { params: { id: 'u1' } })), true)).toBe('failed');
    onFetch(() => ({ status: 409, body: { error: 'CONFLICT' } }));
    expect(outcomeOf(await outcome(api(stopUpload, { params: { id: 'u1' } })), true)).toBe('failed');
    expect(notices.length).toBe(0);
  });
  it('recovers: pending without a notice while the context lives; a secret route keeps the listed code', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: { error: 'PENDING_UPLOAD_BUSY', message: 'secret words' } }));
    const e = await outcome(api(stopUpload, { params: { id: 'u1' }, recovers: true }));
    expect(outcomeOf(e)).toBe('pending');
    expect(notices.length).toBe(0);
    const s = await outcome(api(secretStop, { realm: R1, body: { text: 'secret words' } }));
    expect(s).toMatchObject({ kind: 'pending', code: 'PENDING_UPLOAD_BUSY', status: 409 });
    expect(JSON.stringify(s)).not.toContain('secret words');
  });
  it('declaring: change routes only, fixed code shapes, frozen on the route', () => {
    expect(() => defineRoute({ method: 'GET', path: '/unk1/r', scope: 'realm', unknownCodes: ['BUSY'] })).toThrow(/unknownCodes/);
    expect(() => defineRoute({ method: 'POST', path: '/unk1/b', scope: 'realm', body: [], unknownCodes: ['not a code'] })).toThrow(/unknownCodes/);
    expect(() => defineRoute({ method: 'POST', path: '/unk1/c', scope: 'realm', body: [], unknownCodes: [] })).toThrow(/unknownCodes/);
    expect(Object.isFrozen(stopUpload.unknownCodes)).toBe(true);
    expect(deliver.unknownCodes).toBeNull();
  });
});

describe('unknownCodes at its edges', () => {
  it('a raw-I/O route (run, upload) refuses unknownCodes when it is declared, never ignores it', () => {
    expect(() => defineRoute({ method: 'POST', path: '/unk1b/run', scope: 'kit', kit: 'exec', index: 1, run: true, unknownCodes: ['BUSY'] })).toThrow(/unknownCodes/);
    expect(() => defineRoute({ method: 'PUT', path: '/unk1b/up', scope: 'kit', kit: 'files', index: 1, upload: true, unknownCodes: ['BUSY'] })).toThrow(/unknownCodes/);
  });
  it('a listed 409 OTP_REQUIRED is pending before any 2FA prompt: no ask, one send', async () => {
    boot({ realm: R1 });
    let asked = 0;
    setOtpPrompt({ ask: async () => (++asked === 1 ? '123456' : null), cancel: () => {} });
    const r = defineRoute({ method: 'POST', path: '/unk1b/otp', scope: 'realm', body: [], unknownCodes: ['OTP_REQUIRED'] });
    onFetch(() => ({ status: 409, body: { error: 'OTP_REQUIRED' } }));
    const e = await outcome(api(r));
    expect(asked).toBe(0);
    expect(calls.length).toBe(1);
    expect(outcomeOf(e)).toBe('pending');
  });
  it('after a code went out, a listed 409 INVALID_OTP_CODE is pending: no second ask, no resend', async () => {
    boot({ realm: R1 });
    let asked = 0;
    setOtpPrompt({ ask: async () => (++asked === 1 ? '123456' : null), cancel: () => {} });
    const r = defineRoute({ method: 'POST', path: '/unk1b/otp2', scope: 'realm', body: [], unknownCodes: ['INVALID_OTP_CODE'] });
    onFetch((c) => (c.body && (c.body as { otp_code?: string }).otp_code ? { status: 409, body: { error: 'INVALID_OTP_CODE' } } : { status: 403, body: { error: 'OTP_REQUIRED' } }));
    const e = await outcome(api(r));
    expect(asked).toBe(1);
    expect(calls.length).toBe(2);
    expect(outcomeOf(e)).toBe('pending');
  });
  it('a listed 409 keeps the hold: a page lock over it never frees, and a repeat press sends nothing', async () => {
    boot({ realm: R1 });
    const r = defineRoute({ method: 'POST', path: '/unk1b/stop/:id', scope: 'realm', body: [], unknownCodes: ['PENDING_UPLOAD_BUSY'] });
    onFetch(() => ({ status: 409, body: { error: 'PENDING_UPLOAD_BUSY' } }));
    const e = await outcome(api(r, { params: { id: 'u1' } }));
    expect(outcomeOf(e, true)).toBe('pending');
    expect(e).toMatchObject({ pending: true });
    expect((e as HubError).notSent).toBeUndefined();
  });
  it('a code listed only in unknownCodes is shown in error details', () => {
    defineRoute({ method: 'POST', path: '/unk1b/diag', scope: 'realm', body: [], unknownCodes: ['UNKONLY_FIXED_CODE'] });
    expect(isDeclaredCode('UNKONLY_FIXED_CODE')).toBe(true);
  });
});

describe('a listed code answered 404 is under way too', () => {
  // hoody-files' Stop stops the upload, then looks it up again: if its last file finished in between, the stop
  // happened and the answer is 404 PENDING_UPLOAD_NOT_FOUND.
  const stop = defineRoute({ method: 'POST', path: '/uc404/uploads/:id/stop', scope: 'realm', body: [], unknownCodes: ['PENDING_UPLOAD_BUSY', 'PENDING_UPLOAD_NOT_FOUND'] });
  const deliver = defineRoute({ method: 'POST', path: '/uc404/uploads/:id/deliver', scope: 'realm', body: [] });
  it('a 404 with a listed code on that route is pending (one notice, one send, not marked unsent), never failed', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 404, body: { error: 'PENDING_UPLOAD_NOT_FOUND' } }));
    const e = await outcome(api(stop, { params: { id: 'u1' } }));
    expect(e).toMatchObject({ kind: 'pending', pending: true, status: 404, code: 'PENDING_UPLOAD_NOT_FOUND' });
    expect(outcomeOf(e, true)).toBe('pending');
    expect((e as HubError).notSent).toBeUndefined();
    expect(notices.length).toBe(1);
    expect(calls.length).toBe(1);
  });
  it('the same code on a route that does not list it, an unlisted 404 code, or the code on another 4xx stays a refusal', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 404, body: { error: 'PENDING_UPLOAD_NOT_FOUND' } }));
    expect(outcomeOf(await outcome(api(deliver, { params: { id: 'u1' } })), true)).toBe('failed');
    onFetch(() => ({ status: 404, body: { error: 'NOT_FOUND' } }));
    expect(outcomeOf(await outcome(api(stop, { params: { id: 'u1' } })), true)).toBe('failed');
    onFetch(() => ({ status: 410, body: { error: 'PENDING_UPLOAD_NOT_FOUND' } }));
    expect(outcomeOf(await outcome(api(stop, { params: { id: 'u1' } })), true)).toBe('failed');
    expect(notices.length).toBe(0);
  });
  it('a listed 404 is decided before any 2FA handling: after a code went out, a listed 404 INVALID_OTP_CODE asks nothing more', async () => {
    boot({ realm: R1 });
    let asked = 0;
    setOtpPrompt({ ask: async () => (++asked === 1 ? '123456' : null), cancel: () => {} });
    const r = defineRoute({ method: 'POST', path: '/uc404/otp', scope: 'realm', body: [], unknownCodes: ['INVALID_OTP_CODE'] });
    onFetch((c) => (c.body && (c.body as { otp_code?: string }).otp_code ? { status: 404, body: { error: 'INVALID_OTP_CODE' } } : { status: 403, body: { error: 'OTP_REQUIRED' } }));
    const e = await outcome(api(r));
    expect(asked).toBe(1);
    expect(calls.length).toBe(2);
    expect(outcomeOf(e)).toBe('pending');
  });
});
