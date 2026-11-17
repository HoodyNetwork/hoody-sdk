// Vitest: the AI page's OpenRouter step is the kit's OpenRouterSetup over the page's api and env. The
// sign-in's own cases (the code sent once, the field dropped at the send, lost answers) moved to
// kit/pickers/OpenRouterSetup.test.tsx; here, what the adapter adds: the page's api and env reach the kit step, a
// finished sign-in re-reads the page before it says signed in, and a refusal speaks in the page's words (errorText).
import type { providers } from '@core';
import kitStrings from '@kit/pickers/ProviderSetup.strings.en.json';
import { act, render, screen, userEvent, waitFor } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import type { Api } from './api';
import { AiProvider, type AiCtx } from './parts/ctx';
import { OpenRouterStep } from './parts/OpenRouterStep';
import { errorText } from './words';

type Settled = providers.Settled<unknown>;
type Outcome = providers.Outcome;
const ok = (body: unknown = {}): Settled => ({ ok: true, body });
const out = (kind: Outcome['kind'], code = '', status = 0): Settled => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
const AUTH = 'https://openrouter.ai/auth?callback_url=http%3A%2F%2Flocalhost%3A53781%2Fcallback&code_challenge=abc&code_challenge_method=S256';

function setup(start: Settled, poll: Settled[], code: Settled = ok()) {
  const calls: string[] = [];
  let polls = 0;
  const api = {
    pkceStart: (...a: unknown[]) => (calls.push(`start ${JSON.stringify(a)}`), Promise.resolve(start)),
    pkcePoll: () => Promise.resolve(poll[Math.min(polls++, poll.length - 1)]!),
    pkceCode: () => Promise.resolve(code),
    pkceCancel: () => Promise.resolve(ok()),
    auth: () => Promise.resolve(ok({ auth: { oauth_stored: false } })),
  } as unknown as Api;
  const sleepers: Array<() => void> = [];
  const env: providers.Env = {
    sleep: (ms) => (ms === 0 ? Promise.resolve() : new Promise<void>((r) => sleepers.push(r))),
    now: () => 1_000_000,
    hidden: () => false,
    visible: () => Promise.resolve(),
    newKey: () => 'page-key-1',
    digest: () => Promise.resolve(null),
    alive: () => true,
  };
  const order: string[] = [];
  const reload = vi.fn(() => void order.push('reload'));
  const onSigned = vi.fn(() => void order.push('signed'));
  const ctx = { m: {}, api, env, reload, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
  render(
    <AiProvider value={ctx}>
      <OpenRouterStep onSigned={onSigned} onBack={() => undefined} />
    </AiProvider>,
  );
  const tick = () => act(async () => void sleepers.splice(0).forEach((r) => r()));
  return { calls, order, reload, onSigned, tick };
}

describe('the AI page OpenRouter step (adapter over the kit)', () => {
  it('starts on the page api with the page env key, and a finished sign-in re-reads the page, then says signed in', async () => {
    const f = setup(ok({ job_id: 'j1', verification_uri: AUTH }), [ok({ state: 'pending', needs_code: true, verification_uri: AUTH }), ok({ state: 'complete' })]);
    await screen.findByText(kitStrings['or.step3']);
    expect(f.calls).toEqual(['start ["openrouter","page-key-1"]']);
    await f.tick();
    await waitFor(() => expect(f.onSigned).toHaveBeenCalledTimes(1));
    expect(f.order).toEqual(['reload', 'signed']);
  });

  it("a refused start speaks in the page's words (errorText), never the kit's sentence", async () => {
    const err: Outcome = { kind: 'failed', code: 'bad_request', status: 400, retryAfter: null, details: {} };
    setup(out('failed', 'bad_request', 400), []);
    expect(await screen.findByText(errorText(err, { write: true }).text)).toBeInTheDocument();
  });

  it("a refused code speaks in the page's words too", async () => {
    const err: Outcome = { kind: 'failed', code: 'bad_request', status: 400, retryAfter: null, details: {} };
    setup(ok({ job_id: 'j1', verification_uri: AUTH }), [ok({ state: 'pending', needs_code: true, verification_uri: AUTH })], out('failed', 'bad_request', 400));
    await screen.findByText(kitStrings['or.step3']);
    await userEvent.click(screen.getByLabelText(kitStrings['or.paste']));
    await userEvent.paste('http://localhost:53781/callback?code=c0de-1');
    await userEvent.click(screen.getByRole('button', { name: kitStrings['or.finish'] }));
    expect(await screen.findByText(errorText(err, { write: true }).text)).toBeInTheDocument();
    expect(screen.queryByText(kitStrings['or.codeFailed'])).toBeNull();
  });

  it('a computer that cannot run the sign-in says to use an API key', async () => {
    setup(out('failed', 'oauth_unsupported', 422), []);
    expect(await screen.findByText(kitStrings['or.unsupported'])).toBeInTheDocument();
  });
});
