// An unknown answer is never replaced by a later refusal.
// - Only a definite refusal (a 4xx that is not "still running" nor route-listed) starts the 2FA prompt or a retry:
//   a 5xx carrying OTP_REQUIRED or INVALID_OTP_CODE ends the operation unknown (pending), whatever follows.
// - A replay of a kept key answered with a definite refusal after its context died proves nothing about the first
//   send: the hold stays pending (api.ts: every sent change answered after its context died is pending).
import { beforeEach, describe, expect, it } from 'vitest';
import { api, onPending, outcomeOf, setOtpPrompt, type HubError, type PendingNotice } from './api';
import * as C from './changes';
import { bump } from './ctx';
import { newKey } from './kit';
import { defineRoute } from './routes';
import { boot, calls, onFetch, R1, settle } from './test/env';

const startContainer = defineRoute({ method: 'POST', path: '/computers/:id/start', scope: 'realm', body: [] });

let notices: PendingNotice[] = [];
let offPending: () => void = () => {};
let asked = 0;
beforeEach(() => {
  offPending();
  notices = [];
  asked = 0;
  offPending = onPending((n) => notices.push(n));
  setOtpPrompt(null);
});
const outcome = (p: Promise<unknown>): Promise<HubError> => p.then(() => ({}) as HubError, (e: HubError) => e);
const isRefresh = (url: string): boolean => url.includes('/users/auth/refresh');

describe('u1: an unknown answer carrying a 2FA code never starts the prompt or a retry', () => {
  it('u1a: 500 OTP_REQUIRED, then (were a retry sent) a 400 after a realm switch: one send, no prompt, pending', async () => {
    boot({ realm: R1 });
    setOtpPrompt({ ask: async () => { asked++; bump('switch'); return asked > 3 ? null : '123456'; }, cancel: () => {} });
    onFetch((c) => (c.body && c.body.otp_code ? { status: 400, body: { error: 'BAD_REQUEST' } } : { status: 500, body: { error: 'OTP_REQUIRED' } }));
    const e = await outcome(api(startContainer, { params: { id: 'c1' } }));
    expect(asked).toBe(0);
    expect(calls.length).toBe(1);
    expect(e).toMatchObject({ kind: 'pending', pending: true });
    expect(outcomeOf(e, true)).toBe('pending');
    expect(notices.length).toBe(1);
  });
  it('u1b: 403 OTP_REQUIRED, the code sent, then 500 INVALID_OTP_CODE: no second prompt, pending', async () => {
    boot({ realm: R1 });
    setOtpPrompt({ ask: async () => { asked++; return asked > 3 ? null : '123456'; }, cancel: () => {} });
    onFetch((c) => (c.body && c.body.otp_code ? { status: 500, body: { error: 'INVALID_OTP_CODE' } } : { status: 403, body: { error: 'OTP_REQUIRED' } }));
    const e = await outcome(api(startContainer, { params: { id: 'c1' } }));
    expect(asked).toBe(1);
    expect(calls.length).toBe(2);
    expect(e).toMatchObject({ kind: 'pending', pending: true });
  });
  it('u1c: 500 OTP_REQUIRED, then (were a retry sent) a terminal refresh 401: one send, no refresh, pending', async () => {
    boot({ realm: R1 });
    setOtpPrompt({ ask: async () => { asked++; return asked > 3 ? null : '123456'; }, cancel: () => {} });
    onFetch((c) => (isRefresh(c.url) ? { status: 401, body: { error: 'UNAUTHORIZED' } } : c.body && c.body.otp_code ? { status: 401, body: { error: 'UNAUTHORIZED' } } : { status: 500, body: { error: 'OTP_REQUIRED' } }));
    const e = await outcome(api(startContainer, { params: { id: 'c1' } }));
    expect(asked).toBe(0);
    expect(calls.map((c) => isRefresh(c.url))).toEqual([false]);
    expect(e).toMatchObject({ kind: 'pending', pending: true });
  });
  it('u1d control: a definite 400 OTP_REQUIRED (the token mint\'s challenge) still asks and retries', async () => {
    boot({ realm: R1 });
    setOtpPrompt({ ask: async () => { asked++; return asked > 3 ? null : '123456'; }, cancel: () => {} });
    onFetch((c) => (c.body && c.body.otp_code === '123456' ? { status: 200, body: { ok: 1 } } : { status: 400, body: { error: 'OTP_REQUIRED' } }));
    expect(await api(startContainer, { params: { id: 'c1' } })).toEqual({ ok: 1 });
    expect(asked).toBe(1);
    expect(calls.length).toBe(2);
  });
});

describe('u2: a refused replay after the context died keeps the hold pending', () => {
  const META = { base: 'lock:c8b.replay', target: null, realm: R1, by: 'q:c8b@c8b.replay' };
  const putKeyed = defineRoute({ method: 'POST', path: '/c8b/replay', scope: 'agent', body: [], idem: true });
  // As query.ts once(): the kept key wins, else a key core mints for this send.
  const press = (keys: (string | undefined)[]) => C.guarded('s', 'c8b', async (k?: string) => {
    keys.push(k);
    const idem = k ?? newKey();
    return api(putKeyed, { idem }).then(() => ({ outcome: 'done' as const }), (e: unknown) => ({ outcome: outcomeOf(e, true), idem }));
  }, META);
  // The realm switch lands after the answer arrived (a switch while an agent request is out aborts it: pending).
  const afterAnswer = (f: () => void): void => { let p: Promise<void> = Promise.resolve(); for (let i = 0; i < 4; i++) p = p.then(() => undefined); void p.then(f); };
  it('u2a: 502, released keeping its key, the replay answered 429 after a realm switch: pending, the key kept', async () => {
    boot({ realm: R1 });
    const keys: (string | undefined)[] = [];
    onFetch(() => ({ status: 502, body: { error: 'BAD_GATEWAY' } }));
    expect((await press(keys)).outcome).toBe('pending');
    expect(await C.release('s', 'c8b', C.holdOfLock('s', 'c8b')!)).toBe(true);
    await settle();
    expect(C.isPending('s', 'c8b')).toBe(false);
    onFetch(() => { afterAnswer(() => bump('switch')); return { status: 429, body: { error: 'RATE_LIMITED' } }; });
    const res = await press(keys);
    expect(keys.length).toBe(2);
    expect(keys[0]).toBeUndefined();
    expect(typeof keys[1]).toBe('string');
    expect(res.outcome).toBe('pending');
    expect(C.isPending('s', 'c8b')).toBe(true);
  });
  it('u2b: a first send (a key core minted) answered 404 after a realm switch is pending too, and held', async () => {
    boot({ realm: R1 });
    const keys: (string | undefined)[] = [];
    onFetch(() => { afterAnswer(() => bump('switch')); return { status: 404, body: { error: 'NOT_FOUND' } }; });
    const res = await press(keys);
    expect(keys).toEqual([undefined]);
    expect(res.outcome).toBe('pending');
    expect(C.isPending('s', 'c8b')).toBe(true);
  });
});
