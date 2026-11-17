// Vitest: the read-backs core starts by itself for a held change answer the old state. A lost send (502: may have
// gone through) is read back at once (core/source.ts, on a pending answer), and every try refused READ_BACK_FIRST
// reads back again. Each of those reads is good (200) and still shows the state from before the send: it proves
// nothing, so the change stays held and the next try is still refused. Only a read that shows the change applied
// frees it. The other tests of this refusal make every read fail (readback.test.tsx, "refused until read back"), so
// they never let these reads answer.
import { CoreQueryProvider, queryClient } from '@core';
import { boot, calls, onFetch, settle, signIn } from '@core/test/env';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTurnOff, useTwoFactor, useVerifySetup } from './data';

const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};
const sends = () => calls.filter((c) => c.method !== 'GET').length;
// One read-back reads the status once (with the two session lists); nothing else reads it after the mount's own read.
const statusReads = () => calls.filter((c) => c.method === 'GET' && c.url.includes('/users/auth/2fa/status')).length;

type Hook = { run: (v: never) => Promise<{ outcome: string; code?: string }>; pending: boolean };

/** Every send is lost (502) and every read answers 200 with `enabled`, the state from before the send. */
async function mount<H extends Hook>(use: () => H, enabled: boolean) {
  boot();
  signIn();
  queryClient.clear();
  onFetch((c) => (c.method !== 'GET' ? { status: 502, body: {} } : { status: 200, body: { data: { enabled, verified: enabled, require_for_tokens: false } } }));
  const out: { h?: H } = {};
  function P() {
    out.h = use();
    useTwoFactor();
    return null;
  }
  render(<P />, { wrapper: CoreQueryProvider });
  await act(flush);
  const press = async (vars: unknown) => {
    let r: { outcome: string; code?: string } = { outcome: '' };
    await act(async () => {
      r = await out.h!.run(vars as never);
      await flush();
    });
    return r;
  };
  return { press, hook: () => out.h! };
}

async function staysHeld<H extends Hook>(use: () => H, enabled: boolean, first: unknown, second: unknown) {
  const o = await mount(use, enabled);
  const read = statusReads();
  expect(sends()).toBe(0);
  // The lost send is read back at once: one read, answering the old state, and the change stays held.
  expect(await o.press(first)).toMatchObject({ outcome: 'pending' });
  expect(sends()).toBe(1);
  expect(statusReads()).toBe(read + 1);
  expect(o.hook().pending).toBe(true);
  // Each refused try reads back once more, sends nothing, and the change stays held.
  expect(await o.press(second)).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
  expect(statusReads()).toBe(read + 2);
  expect(o.hook().pending).toBe(true);
  expect(await o.press(second)).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
  expect(statusReads()).toBe(read + 3);
  expect(o.hook().pending).toBe(true);
  expect(sends()).toBe(1);
}

describe('the read-backs core starts for a held change answer the old state', () => {
  it('turn-off: every read says still on, and the turn-off stays held', async () => {
    await staysHeld(useTurnOff, true, { password: 'pw', code: '111111' }, { password: 'pw', code: '222222' });
  });

  it('verify set-up: every read says still not enabled, and the set-up stays held', async () => {
    await staysHeld(useVerifySetup, false, { code: '111111' }, { code: '222222' });
  });
});
