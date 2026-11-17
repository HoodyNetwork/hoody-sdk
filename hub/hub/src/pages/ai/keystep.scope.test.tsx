// Vitest (KeyStep.tsx:67, :89-97): a built-in key send belongs
// to the scope it began in (account, realm, computer), as the kit's KeySetup's does (ProviderSetup.tsx submit). Its end
// (another computer, even one with the same container id in another project, which leaves the page's env alive) drops
// the step's "may have been saved" line, keeps a late answer from becoming the step's outcome, and closes the leave
// toast the step left. Before, the built-in guard was `() => true`: the line and the toast stayed with a Check again
// that could never prove anything again; and a switch away and back before Check again left the scope live (it latched
// only when read).
import { useCurrentComputer, type providers } from '@core';
import { act, render, screen, userEvent, waitFor } from '@app/testing';
import { useMemo, useState } from 'react';
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
const toasts = vi.hoisted(() => ({ shown: [] as Array<{ id: string; c: Shown }>, closed: [] as string[] }));
vi.mock('@kit/states/Toast', async (orig) => ({
  ...(await orig<typeof ToastModule>()),
  showToast: (c: Shown) => {
    const id = `t${toasts.shown.length + 1}`;
    toasts.shown.push({ id, c });
    return id;
  },
  closeToast: (id: string) => void toasts.closed.push(id),
}));
beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  toasts.shown.length = 0;
  toasts.closed.length = 0;
});

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const err = (kind: providers.Outcome['kind'], code = '', status = 0): Settled => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
const tick = () => act(async () => new Promise((r) => setTimeout(r, 5)));
const other = (first: ReturnType<typeof snapshot>['target']) => ({ project: { id: 'p9' }, container: first?.container ?? { id: 'c9' } }) as Parameters<typeof setTarget>[0];

function Host({ ctx }: { ctx: AiCtx }) {
  const [shown, setShown] = useState(true);
  // The page's computer follows core's, as the page's own model does: another computer is another page, and core holds an
  // unknown save for the computer it was sent to (keySaveHold.ts).
  const t = useCurrentComputer();
  const value = useMemo(() => ({ ...ctx, m: t ? { computer: { id: t.container.id, name: 'atlas' }, target: t } : {} }) as AiCtx, [ctx, t]);
  return (
    <AiProvider value={value}>
      {shown && <KeyStep providerId="openai" providerLabel="OpenAI" onSaved={vi.fn()} />}
      <button type="button" onClick={() => setShown(false)}>
        Leave
      </button>
    </AiProvider>
  );
}

/** A built-in key step whose PUT answers `put` (held when a function), with the stored fingerprint never the key's. */
async function sendKey(put: () => Promise<Settled>) {
  const auth = vi.fn(() => Promise.resolve(ok({ auth: { api_key_fingerprint: 'fp-old' } })));
  const keyPut = vi.fn(put);
  const none = () => Promise.resolve(err('failed', 'unexpected', 500));
  const over = { keyPut, auth } as Partial<Api>;
  const api = new Proxy(over as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : none) });
  const env: providers.Env = { sleep: () => Promise.resolve(), now: () => 0, hidden: () => false, visible: () => Promise.resolve(), newKey: () => 'idem-1', digest: () => Promise.resolve('fp-1'), alive: () => true };
  const ctx = { m: {}, api, env, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
  render(<Host ctx={ctx} />);
  await userEvent.type(screen.getByLabelText(/OpenAI API key/), 'sk-test-1');
  const save = screen.getByRole('button', { name: strings['key.save'] });
  await waitFor(() => expect(save).toBeEnabled());
  await userEvent.click(save);
  return { auth, keyPut };
}

describe('the AI page key step: a built-in send ends with its scope', () => {
  it('another computer while the step shows "may have been saved": the line goes and the key can be typed again', async () => {
    await sendKey(() => Promise.resolve(err('pending', 'timeout')));
    await screen.findByRole('button', { name: strings['key.typeAgain'] });
    const first = snapshot().target;
    act(() => setTarget(other(first)));
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['key.typeAgain'] }), 'the unknown line is gone').toBeNull());
    expect(screen.getByLabelText(/OpenAI API key/)).toBeEnabled();
    act(() => setTarget(first));
    await tick();
    expect(screen.queryByRole('button', { name: strings['key.typeAgain'] }), 'it stays gone when the computer comes back').toBeNull();
  });

  it('an answer that comes back after another computer was chosen is not the step\'s outcome', async () => {
    let let_go: (a: Settled) => void = () => undefined;
    await sendKey(() => new Promise<Settled>((r) => (let_go = r)));
    const first = snapshot().target;
    act(() => setTarget(other(first)));
    act(() => setTarget(first));
    await act(async () => let_go(err('pending', 'timeout')));
    await tick();
    expect(screen.queryByRole('button', { name: strings['key.typeAgain'] }), 'no "may have been saved" for the ended send').toBeNull();
  });

  // A change undone before anything asks still ends the send (the scope latches when it changes, not when read).
  it('another computer and back before Check again: the line goes all the same', async () => {
    await sendKey(() => Promise.resolve(err('pending', 'timeout')));
    await screen.findByRole('button', { name: strings['key.typeAgain'] });
    const first = snapshot().target;
    act(() => {
      setTarget(other(first));
      setTarget(first);
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['key.typeAgain'] }), 'the unknown line is gone').toBeNull());
  });

  it('the leave toast of an unknown save closes when its scope ends, and its Check again reads nothing after', async () => {
    const s = await sendKey(() => Promise.resolve(err('pending', 'timeout')));
    await screen.findByRole('button', { name: strings['key.typeAgain'] });
    await act(async () => screen.getByRole('button', { name: 'Leave' }).click());
    await tick();
    expect(toasts.shown.map((x) => [x.c.title, x.c.tone])).toEqual([[formStrings['outcome.toastTitle'], 'unknown']]);
    const check = toasts.shown[0]!.c.action!.onAction as () => Promise<boolean>;
    const first = snapshot().target;
    act(() => {
      setTarget(other(first));
      setTarget(first);
    });
    await tick();
    expect(toasts.closed, 'the scope end closes it, even when undone at once').toEqual([toasts.shown[0]!.id]);
    const reads = s.auth.mock.calls.length;
    await expect(check(), 'an ended send proves nothing').resolves.toBe(false);
    expect(s.auth.mock.calls.length, 'and reads nothing').toBe(reads);
  });
});
