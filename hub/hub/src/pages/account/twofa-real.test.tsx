// Vitest: the wait a refusal names reaches the screen through the REAL request path (shared.js, core's api(), the
// page's own hooks): no hook is stood in here, only the server's answer. A stood-in hook once hid that the password
// change dropped the wait on its way out.
import { CoreQueryProvider, queryClient } from '@core';
import { setOtpPrompt } from '@core/api';
import { boot, onFetch, settle, signIn, UID, type Call, type Reply } from '@core/test/env';
// eslint-disable-next-line no-restricted-imports -- a router for a part rendered without its page (a link in it reads the location), not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useChangePassword, useEmailCancel, useEmailStart, useEndOthers, useEndSession, useNewCodes, useProfile, useRename, useSetGate, useStartSetup, useTurnOff, useTwoFactor, useVerifySetup } from './data';
import { EmailSheet } from './parts/EmailSheet';
import { NameSheet } from './parts/NameSheet';
import { PasswordSheet } from './parts/PasswordSheet';
import { TwoFactorSection } from './parts/TwoFactorSection';
import { locks } from './parts/locks';
import strings from './strings.en.json';

const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};
const ME = /\/users\/auth\/me(\?|$)/;
const STATUS = /\/users\/auth\/2fa\/status(\?|$)/;
const answer: { now: (c: Call) => Reply } = { now: () => ({ status: 400, body: {} }) };
const handler = (c: Call): Reply => {
  if (c.method !== 'GET') return answer.now(c);
  if (ME.test(c.url)) return { status: 200, body: { data: { id: UID, username: 'ada', alias: 'Ada', email: 'ada@example.com' } } };
  if (STATUS.test(c.url)) return { status: 200, body: { data: { enabled: true, verified: true, backup_codes_remaining: 8, require_for_tokens: false } } };
  return { status: 404, body: {} };
};
const fresh = () => {
  boot();
  signIn();
  queryClient.clear();
  locks.clear();
  onFetch(handler);
};
afterEach(() => {
  cleanup();
  setOtpPrompt(null);
});

// A rate limiter's answer (the wait in the Retry-After header) and a lockout's (the wait in the body).
const limited: Reply = { status: 429, headers: { 'retry-after': '900' }, body: { statusCode: 429, error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' } };
const lockedOut = (seconds: unknown): Reply => ({ status: 429, body: { statusCode: 429, error: 'TWOFACTOR_RATE_LIMIT', message: 'Too many failed attempts', data: { lockout_seconds: seconds } } });
const WAIT_15 = strings['err.tooManyWait_other'].replace('{{count}}', '15');

type Answer = { outcome: string; code?: string; status?: number; retryAfter?: number };
type Run = (vars: never) => Promise<Answer>;
async function probe(useHook: () => { run: Run }): Promise<(vars: unknown) => Promise<Answer>> {
  fresh();
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

const HOOKS: ReadonlyArray<readonly [string, () => { run: Run }, unknown]> = [
  ['a password change', useChangePassword as never, { current: 'old-password-1234', password: 'new-password-5678' }],
  ['an email change', useEmailStart as never, { email: 'new@example.com', password: 'my-password-here' }],
  ['the key gate switched on', useSetGate as never, { enabled: true }],
  ['turning 2FA off', useTurnOff as never, { password: 'pw-pw-pw-pw', code: '123456' }],
  // The two that answer with a secret go through their own path (a minted answer): it must carry the wait too.
  ['new backup codes', useNewCodes as never, { password: 'pw-pw-pw-pw', code: '123456' }],
  ['starting 2FA set-up', useStartSetup as never, { password: 'pw-pw-pw-pw' }],
  ['confirming 2FA set-up', useVerifySetup as never, { code: '123456' }],
  ['cancelling an email change', useEmailCancel as never, undefined],
  ['a rename', useRename as never, { alias: 'Ada L' }],
  ['ending one session', useEndSession as never, { id: 'sid0000000000002' }],
  ['ending the other sessions', useEndOthers as never, undefined],
];

describe('the wait a refusal names comes out of the page\'s own hook', () => {
  for (const [name, useHook, vars] of HOOKS) {
    it(`${name}: a Retry-After header`, async () => {
      const run = await probe(useHook);
      answer.now = () => limited;
      expect(await run(vars)).toMatchObject({ outcome: 'failed', status: 429, retryAfter: 900 });
    });
    it(`${name}: a lockout's wait in the body, as a number or as its digits`, async () => {
      for (const seconds of [900, '900']) {
        const run = await probe(useHook);
        answer.now = () => lockedOut(seconds);
        expect(await run(vars), String(typeof seconds)).toMatchObject({ outcome: 'failed', status: 429, retryAfter: 900 });
        cleanup();
      }
    });
  }
  it('a wait that is no count of seconds is dropped', async () => {
    for (const junk of ['soon', '-5', '9e9', '', null, [900], 1e309]) {
      const run = await probe(useTurnOff as never);
      answer.now = () => lockedOut(junk);
      const r = await run({ password: 'pw-pw-pw-pw', code: '123456' });
      expect(r, String(junk)).toMatchObject({ outcome: 'failed', status: 429 });
      expect(r.retryAfter, String(junk)).toBeUndefined();
      cleanup();
    }
  });
});

const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory({ initialEntries: ['/account'] }) });
const wrap = ({ children }: { children: ReactNode }) => (
  <RouterContextProvider router={router}>
    <CoreQueryProvider>{children}</CoreQueryProvider>
  </RouterContextProvider>
);
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
    await flush();
  });
};

describe('and is said on the screen, in minutes', () => {
  it('the password drawer', async () => {
    fresh();
    answer.now = () => limited;
    render(<PasswordSheet open onClose={() => undefined} onChanged={() => undefined} onUnsure={() => undefined} />, { wrapper: wrap });
    await act(flush);
    type(strings['pw.current'], 'Old-password-1234');
    type(strings['pw.new'], 'New-password-5678');
    type(strings['pw.again'], 'New-password-5678');
    await press(strings['pw.save']);
    expect(screen.getByText(WAIT_15)).toBeInTheDocument();
  });

  it('the email drawer', async () => {
    fresh();
    answer.now = () => lockedOut(900);
    render(<EmailSheet open onClose={() => undefined} onSent={() => undefined} />, { wrapper: wrap });
    await act(flush);
    type(strings['e.new'], 'new@example.com');
    type(strings['e.password'], 'my-password-here');
    await press(strings['e.send']);
    expect(screen.getByText(WAIT_15)).toBeInTheDocument();
  });

  it('the name drawer', async () => {
    fresh();
    answer.now = () => limited;
    render(<NameSheet open onClose={() => undefined} onDone={() => undefined} />, { wrapper: wrap });
    await act(flush);
    // The drawer is named like its field ("Display name"): the field is found by its role.
    fireEvent.change(screen.getByRole('textbox', { name: strings['p.alias'] }), { target: { value: 'Ada Lovelace' } });
    await press(strings['p.save']);
    expect(screen.getByText(WAIT_15)).toBeInTheDocument();
  });

  it('the key gate switched on', async () => {
    fresh();
    answer.now = () => limited;
    render(<TwoFactorSection onOpen={() => undefined} />, { wrapper: wrap });
    await act(flush);
    await act(async () => {
      fireEvent.click(await screen.findByRole('switch', { name: strings['2fa.gateSwitch'] }));
      await flush();
    });
    expect(await screen.findByText(WAIT_15)).toBeInTheDocument();
  });

  it('no wait named: one sentence that promises no time', async () => {
    fresh();
    answer.now = () => ({ status: 429, body: { statusCode: 429, error: 'RATE_LIMIT_EXCEEDED' } });
    render(<PasswordSheet open onClose={() => undefined} onChanged={() => undefined} onUnsure={() => undefined} />, { wrapper: wrap });
    await act(flush);
    type(strings['pw.current'], 'Old-password-1234');
    type(strings['pw.new'], 'New-password-5678');
    type(strings['pw.again'], 'New-password-5678');
    await press(strings['pw.save']);
    expect(screen.getByText('Too many tries. Try again later.')).toBeInTheDocument();
    expect(Object.values(strings).filter((v) => /^Too many tries\./.test(v) && !/\{\{count\}\}/.test(v))).toEqual(['Too many tries. Try again later.']);
  });
});
