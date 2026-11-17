// A sent change whose answer arrives after its context died is pending, whatever the
// answer: a definite 4xx included (it may answer a repeat of an earlier send whose outcome is unknown), as well as a
// 409 saying the request is still running, any 5xx, a 2xx, no answer, and a 2FA retry the dead context never sent (a
// cancel, as before). A Hoody API 401 refreshes the token first, so it has no row here.
import { beforeEach, describe, expect, it } from 'vitest';
import { api, onPending, outcomeOf, setOtpPrompt, type HubError, type PendingNotice } from './api';
import { bump, setIdentity } from './ctx';
import { defineRoute } from './routes';
import { boot, calls, onFetch, OTHER, R1 } from './test/env';

const startContainer = defineRoute({ method: 'POST', path: '/computers/:id/start', scope: 'realm', body: [] });
const runIt = defineRoute({ method: 'POST', path: '/computers/:id/restart', scope: 'realm', body: [], unknownCodes: ['RUN_BUSY'] });
const mintToken = defineRoute({ method: 'POST', path: '/auth/tokens', scope: 'base', body: ['name'], secret: true, codes: ['TOKEN_LIMIT'] });

let notices: PendingNotice[] = [];
let offPending: () => void = () => {};
beforeEach(() => {
  offPending();
  notices = [];
  offPending = onPending((n) => notices.push(n));
  setOtpPrompt(null);
});
const outcome = (p: Promise<unknown>): Promise<HubError> => p.then(() => ({}) as HubError, (e: HubError) => e);

describe('d1: a definite 4xx after the context died is pending, never stale', () => {
  for (const [status, code] of [
    [400, 'BAD_REQUEST'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [409, 'CONFLICT'],
    [410, 'GONE'], [422, 'VALIDATION_ERROR'], [429, 'RATE_LIMITED'], [499, 'CLIENT_CLOSED'],
  ] as const) {
    it(`d1 ${status} ${code}: realm switch while out`, async () => {
      boot({ realm: R1 });
      onFetch(() => { bump('switch'); return { status, body: { error: code } }; });
      const e = await outcome(api(startContainer, { params: { id: 'c1' } }));
      expect(e).toMatchObject({ kind: 'pending', pending: true });
      expect(outcomeOf(e, true)).toBe('pending');
      expect(notices.length).toBe(1);
      expect(calls.length).toBe(1);
    });
  }
  it('d1 account switch while out: pending', async () => {
    boot({ realm: R1 });
    onFetch(() => { setIdentity({ id: OTHER, banned: false }); bump('account'); return { status: 404, body: { error: 'NOT_FOUND' } }; });
    const e = await outcome(api(startContainer, { params: { id: 'c1' } }));
    expect(e).toMatchObject({ kind: 'pending', pending: true });
    expect(outcomeOf(e, true)).toBe('pending');
  });
  it('d1 secret route: a 422 after the context died is pending', async () => {
    boot({ realm: R1 });
    onFetch(() => { bump('switch'); return { status: 422, body: { error: 'VALIDATION_ERROR' } }; });
    const e = await outcome(api(mintToken, { body: { name: 'x' } }));
    expect(e).toMatchObject({ kind: 'pending', pending: true });
    expect(outcomeOf(e, true)).toBe('pending');
  });
});

describe('d2: answers that leave the outcome open stay pending after the context died', () => {
  for (const [what, reply] of [
    ['409 in_progress', { status: 409, body: { error: 'in_progress' } }],
    ['409 IDEMPOTENCY_REQUEST_IN_PROGRESS', { status: 409, body: { error: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' } }],
    ['409 gate_decision_pending', { status: 409, body: { error: 'gate_decision_pending' } }],
    ['500', { status: 500, body: {} }],
    ['502', { status: 502, body: { error: 'BAD_GATEWAY' } }],
    ['200', { status: 200, body: {} }],
    ['a lost answer', { status: 0, network: true }],
  ] as const) {
    it(`d2 ${what}`, async () => {
      boot({ realm: R1 });
      onFetch(() => { bump('switch'); return reply; });
      const e = await outcome(api(startContainer, { params: { id: 'c1' } }));
      expect(e).toMatchObject({ kind: 'pending', pending: true });
      expect(outcomeOf(e, true)).toBe('pending');
      expect(notices.length).toBe(1);
    });
  }
  for (const status of [404, 409] as const) {
    it(`d2 a ${status} whose code the route lists in unknownCodes`, async () => {
      boot({ realm: R1 });
      onFetch(() => { bump('switch'); return { status, body: { error: 'RUN_BUSY' } }; });
      expect(await outcome(api(runIt, { params: { id: 'c1' } }))).toMatchObject({ kind: 'pending', pending: true });
    });
  }
  it('d2 the context died while the 2FA prompt was open: the retry is not sent, pending (a cancel, as before)', async () => {
    boot({ realm: R1 });
    setOtpPrompt({ ask: async () => { bump('switch'); return '123456'; }, cancel: () => {} });
    onFetch(() => ({ status: 403, body: { error: 'OTP_REQUIRED' } }));
    const e = await outcome(api(startContainer, { params: { id: 'c1' } }));
    expect(calls.length).toBe(1);
    expect(e).toMatchObject({ kind: 'pending', pending: true });
  });
});

describe('d3: while the context lives nothing changes', () => {
  it('d3 a 404 is failed, a 409 RUN_BUSY listed in unknownCodes is pending', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 404, body: { error: 'NOT_FOUND' } }));
    const e = await outcome(api(startContainer, { params: { id: 'c1' } }));
    expect(e).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(outcomeOf(e, true)).toBe('failed');
    onFetch(() => ({ status: 409, body: { error: 'RUN_BUSY' } }));
    expect(await outcome(api(runIt, { params: { id: 'c1' } }))).toMatchObject({ kind: 'pending' });
    expect(notices.length).toBe(1);
  });
});
