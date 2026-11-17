// The AI page's key step closed on an unknown save leaves its
// "may have gone through" toast (the step's own). Its Check again must still read once the step went, and close the toast on proof,
// as the kit's KeySetup does (ProviderSetup.leave.test.tsx). Before, it returned false whenever the step was unmounted,
// so the toast could never close.
import type { providers } from '@core';
import { act, render, screen, userEvent, waitFor } from '@app/testing';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget, snapshot } from '@core/ctx';
import { boot } from '@core/test/env';
import type * as ToastModule from '@kit/states/Toast';
import formStrings from '@kit/forms/forms.strings.en.json';
import type { Api } from './api';
import { AiProvider, type AiCtx } from './parts/ctx';
import { KeyStep } from './parts/KeyStep';
import strings from './strings.en.json';

type Shown = { title: string; tone?: string; action?: { onAction: () => unknown } };
const toasts = vi.hoisted(() => ({ shown: [] as Array<{ id: string; c: Shown }> }));
vi.mock('@kit/states/Toast', async (orig) => ({
  ...(await orig<typeof ToastModule>()),
  showToast: (c: Shown) => {
    const id = `t${toasts.shown.length + 1}`;
    toasts.shown.push({ id, c });
    return id;
  },
  closeToast: () => undefined,
}));
beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  toasts.shown.length = 0;
});

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const err = (kind: providers.Outcome['kind'], code = '', status = 0): Settled => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
const def = ok({ provider: { id: 'my-ep', display_name: 'My endpoint', definition_rev: 'rev-3', custom_definition: { base_url: 'https://x.example', wire_format: 'openai' } } });
// The computer the page is on: core holds a key save for it (keySaveHold.ts), and with none named nothing is sent.
const ON = { computer: { id: 'c1', name: 'atlas' }, target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } } };
const tick = () => act(async () => new Promise((r) => setTimeout(r, 5)));

function Host({ ctx, endpoint, onSaved }: { ctx: AiCtx; endpoint: boolean; onSaved: () => void }) {
  const [shown, setShown] = useState(true);
  return (
    <AiProvider value={ctx}>
      {shown && <KeyStep providerId={endpoint ? 'my-ep' : 'openai'} providerLabel={endpoint ? 'My endpoint' : 'OpenAI'} endpoint={endpoint} onSaved={onSaved} />}
      <button type="button" onClick={() => setShown(false)}>
        Leave
      </button>
    </AiProvider>
  );
}

async function leaveUnknown(endpoint: boolean) {
  const f = { stored: 'fp-old' };
  const auth = vi.fn(() => Promise.resolve(ok({ auth: { api_key_fingerprint: f.stored } })));
  const keyPut = vi.fn(() => Promise.resolve(err('pending', 'timeout')));
  const none = () => Promise.resolve(err('failed', 'unexpected', 500));
  const over = { provider: () => Promise.resolve(endpoint ? def : err('failed', 'unexpected', 500)), keyPut, auth } as Partial<Api>;
  const api = new Proxy(over as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : none) });
  const env: providers.Env = { sleep: () => Promise.resolve(), now: () => 0, hidden: () => false, visible: () => Promise.resolve(), newKey: () => 'idem-1', digest: () => Promise.resolve('fp-1'), alive: () => true };
  const onSaved = vi.fn();
  const ctx = { m: ON, api, env, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
  render(<Host ctx={ctx} endpoint={endpoint} onSaved={onSaved} />);
  await userEvent.type(screen.getByLabelText(endpoint ? /My endpoint API key/ : /OpenAI API key/), 'sk-test-1');
  const save = screen.getByRole('button', { name: strings['key.save'] });
  await waitFor(() => expect(save).toBeEnabled());
  await userEvent.click(save);
  await screen.findByRole('button', { name: strings['key.typeAgain'] });
  await act(async () => screen.getByRole('button', { name: 'Leave' }).click());
  await tick();
  const check = toasts.shown[0]?.c.action?.onAction as () => Promise<boolean>;
  return { f, auth, keyPut, onSaved, check };
}

describe('the AI page key step: the leave toast of an unknown save', () => {
  // The page's env ends only on another computer id or realm; the send's scope (project and container,
  // as the kit's KeySetup keeps it) ends the toast's reads too, even for a computer with the same id in another project.
  it('another computer after the step went: Check again reads nothing and proves nothing', async () => {
    const s = await leaveUnknown(false);
    s.f.stored = 'fp-1';
    const first = snapshot().target;
    act(() => setTarget({ project: { id: 'p9' }, container: first?.container ?? { id: 'c9' } }));
    const reads = s.auth.mock.calls.length;
    await expect(s.check(), 'an ended scope proves nothing').resolves.toBe(false);
    expect(s.auth.mock.calls.length, 'no read in another scope').toBe(reads);
    act(() => setTarget(first));
    await expect(s.check(), 'the scope stays ended when the computer comes back').resolves.toBe(false);
    expect(s.onSaved).not.toHaveBeenCalled();
  });

  for (const endpoint of [false, true]) {
    it(`${endpoint ? 'an endpoint key' : 'a built-in key'}: Check again reads after the step went and closes on proof`, async () => {
      let stored = 'fp-old';
      const auth = vi.fn(() => Promise.resolve(ok({ auth: { api_key_fingerprint: stored } })));
      const keyPut = vi.fn(() => Promise.resolve(err('pending', 'timeout')));
      const none = () => Promise.resolve(err('failed', 'unexpected', 500));
      const over = { provider: () => Promise.resolve(endpoint ? def : err('failed', 'unexpected', 500)), keyPut, auth } as Partial<Api>;
      const api = new Proxy(over as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : none) });
      const env: providers.Env = { sleep: () => Promise.resolve(), now: () => 0, hidden: () => false, visible: () => Promise.resolve(), newKey: () => 'idem-1', digest: () => Promise.resolve('fp-1'), alive: () => true };
      const onSaved = vi.fn();
      const ctx = { m: ON, api, env, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
      render(<Host ctx={ctx} endpoint={endpoint} onSaved={onSaved} />);
      await userEvent.type(screen.getByLabelText(endpoint ? /My endpoint API key/ : /OpenAI API key/), 'sk-test-1');
      const save = screen.getByRole('button', { name: strings['key.save'] });
      await waitFor(() => expect(save).toBeEnabled());
      await userEvent.click(save);
      await screen.findByRole('button', { name: strings['key.typeAgain'] });
      expect(keyPut).toHaveBeenCalledTimes(1);
      expect(toasts.shown, 'no toast while the step is up').toEqual([]);
      await act(async () => screen.getByRole('button', { name: 'Leave' }).click());
      await tick();
      expect(toasts.shown.map((x) => [x.c.title, x.c.tone])).toEqual([[formStrings['outcome.toastTitle'], 'unknown']]);
      const check = toasts.shown[0]?.c.action?.onAction as () => Promise<boolean>;
      await expect(check(), 'another key is stored: not proved').resolves.toBe(false);
      stored = 'fp-1';
      const reads = auth.mock.calls.length;
      await expect(check(), 'a read after the step went proves the save').resolves.toBe(true);
      expect(auth.mock.calls.length, 'one read, nothing sent').toBe(reads + 1);
      expect(keyPut).toHaveBeenCalledTimes(1);
      expect(onSaved, 'the gone step completes nothing').not.toHaveBeenCalled();
    });
  }
});
