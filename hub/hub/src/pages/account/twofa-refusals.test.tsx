// Vitest: what the 2FA changes answer when the server refuses them, through the real request path (shared.js, core's
// api(), the page's hooks).
//   - A wrong password is answered 401 with the code a bad token also gets: it goes out once, with no session refresh,
//     and comes back as a plain 401 the sheet puts on the password field.
//   - A lockout names its wait in the body (data.lockout_seconds): the page gets it as retryAfter, on a route whose
//     refusals are otherwise stripped (an answer that may hold a secret) too.
//   - Cancel on the two-step code prompt of an email change is not a failure: nothing was sent, nothing is said.
import { CoreQueryProvider, queryClient } from '@core';
import { setOtpPrompt } from '@core/api';
import { boot, calls, onFetch, settle, signIn, UID, type Call, type Reply } from '@core/test/env';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useEmailStart, useNewCodes, useProfile, useSetGate, useStartSetup, useTurnOff, useTwoFactor } from './data';
import { locks } from './parts/locks';

const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};
const ME = /\/users\/auth\/me(\?|$)/;
const STATUS = /\/users\/auth\/2fa\/status(\?|$)/;
const REFRESH = /\/users\/auth\/refresh(\?|$)/;
const sends = (): Call[] => calls.filter((c) => c.method !== 'GET');

const answer: { now: (c: Call) => Reply } = { now: () => ({ status: 400, body: {} }) };
const handler = (c: Call): Reply => {
  if (c.method !== 'GET') return answer.now(c);
  if (ME.test(c.url)) return { status: 200, body: { data: { id: UID, username: 'ada', alias: 'Ada', email: 'ada@example.com' } } };
  if (STATUS.test(c.url)) return { status: 200, body: { data: { enabled: true, verified: true, backup_codes_remaining: 8, require_for_tokens: true } } };
  return { status: 404, body: {} };
};
afterEach(() => {
  cleanup();
  setOtpPrompt(null);
});

type Answer = { outcome: string; code?: string; status?: number; retryAfter?: number; cancelled?: boolean };
type Run = (vars: never) => Promise<Answer>;

async function mount(useHook: () => { run: Run }): Promise<(vars: unknown) => Promise<Answer>> {
  boot();
  signIn();
  queryClient.clear();
  locks.clear();
  onFetch(handler);
  const out: { run?: Run } = {};
  function Probe() {
    out.run = useHook().run;
    useProfile();
    useTwoFactor();
    return null;
  }
  render(<Probe />, { wrapper: CoreQueryProvider });
  await act(flush);
  return async (vars) => {
    let r: Answer = { outcome: '' };
    await act(async () => {
      r = await out.run!(vars as never);
      await flush();
    });
    return r;
  };
}

// The server's words for a wrong password on these routes.
const invalidPassword: Reply = { status: 401, body: { statusCode: 401, error: 'INVALID_TOKEN', message: 'Invalid password' } };
const lockedOut: Reply = { status: 429, body: { statusCode: 429, error: 'TWOFACTOR_RATE_LIMIT', message: 'Too many failed attempts', data: { lockout_seconds: 900 } } };

const typed: ReadonlyArray<readonly [string, () => { run: Run }, unknown]> = [
  ['the set-up', useStartSetup as never, { password: 'wrong-pass' }],
  ['turning it off', useTurnOff as never, { password: 'wrong-pass', code: '123456' }],
  ['new backup codes', useNewCodes as never, { password: 'wrong-pass', code: '123456' }],
  ['the key gate switched off', useSetGate as never, { enabled: false, password: 'wrong-pass', code: '123456' }],
];

describe('a wrong password on a 2FA change', () => {
  for (const [name, useHook, vars] of typed) {
    it(`${name}: sent once, no session refresh, answered as a 401 to the form`, async () => {
      const run = await mount(useHook);
      answer.now = (c) => (REFRESH.test(c.url) ? { status: 200, body: { data: {} } } : invalidPassword);
      const r = await run(vars);
      expect(r).toMatchObject({ outcome: 'failed', status: 401 });
      expect(sends()).toHaveLength(1);
      expect(sends().some((c) => REFRESH.test(c.url))).toBe(false);
    });
  }
});

describe('a lockout names its wait', () => {
  it('turning it off: the body\'s lockout_seconds comes back as retryAfter', async () => {
    const run = await mount(useTurnOff as never);
    answer.now = () => lockedOut;
    expect(await run({ password: 'pw-pw-pw-pw', code: '123456' })).toMatchObject({ outcome: 'failed', status: 429, retryAfter: 900 });
  });
  it('new backup codes (an answer that may hold a secret): the wait survives, the server words do not', async () => {
    const run = await mount(useNewCodes as never);
    answer.now = () => lockedOut;
    const r = await run({ password: 'pw-pw-pw-pw', code: '123456' });
    expect(r).toMatchObject({ outcome: 'failed', status: 429, retryAfter: 900 });
    expect(JSON.stringify(r)).not.toContain('Too many failed');
  });
  it('a wait that is not a plain number of seconds is dropped', async () => {
    const run = await mount(useTurnOff as never);
    answer.now = () => ({ status: 429, body: { error: 'TWOFACTOR_RATE_LIMIT', data: { lockout_seconds: 'soon' } } });
    const r = await run({ password: 'pw-pw-pw-pw', code: '123456' });
    expect(r).toMatchObject({ outcome: 'failed', status: 429 });
    expect(r.retryAfter).toBeUndefined();
  });
});

describe('codes are sent without the spaces and hyphens people type', () => {
  it('the key gate switched off and new backup codes', async () => {
    const gate = await mount(useSetGate as never);
    answer.now = () => ({ status: 200, body: { data: {} } });
    await gate({ enabled: false, password: 'pw-pw-pw-pw', code: ' 123 456 ' });
    expect(sends()[0]?.body).toMatchObject({ otp_code: '123456' });
    const codes = await mount(useNewCodes as never);
    answer.now = () => ({ status: 200, body: { data: { backup_codes: [] } } });
    await codes({ password: 'pw-pw-pw-pw', code: '123-456' });
    expect(sends()[0]?.body).toMatchObject({ code: '123456' });
  });
});

describe('Cancel on the code prompt of an email change', () => {
  it('answers not sent and cancelled, never failed', async () => {
    const run = await mount(useEmailStart as never);
    setOtpPrompt({ ask: async () => null, cancel: () => {} });
    answer.now = () => ({ status: 400, body: { statusCode: 400, error: 'OTP_REQUIRED', message: 'A code is required' } });
    const r = await run({ email: 'new@example.com', password: 'pw-pw-pw-pw' });
    expect(r).toMatchObject({ outcome: 'not_sent', cancelled: true });
    expect(r.code).toBeUndefined();
    expect(locks.get('email')).toBeUndefined();
  });
});
