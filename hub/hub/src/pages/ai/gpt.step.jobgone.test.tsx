// The AI page's own ChatGPT step: a job that ended unseen is connected only when the login read
// is new since the start; an unreadable login or one that proves nothing about this attempt is "may have gone through".
import type { providers } from '@core';
import { render, screen } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import type { Api } from './api';
import { AiProvider, type AiCtx } from './parts/ctx';
import { GptStep } from './parts/GptStep';
import strings from './strings.en.json';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown = {}): Settled => ({ ok: true, body });
const fail = (code: string, status: number): Settled => ({ ok: false, err: { kind: 'failed', code, status, retryAfter: null, details: {} } });
const login = (stored: boolean): Settled => ok({ auth: { oauth_stored: stored } });

function setup(auth: Settled[]) {
  let i = 0;
  const api = {
    auth: () => Promise.resolve(auth[Math.min(i++, auth.length - 1)]!),
    oauthStart: () => Promise.resolve(ok({ job_id: 'j1', user_code: 'ABCD-1234' })),
    oauthPoll: () => Promise.resolve(fail('not_found', 404)),
    oauthCancel: () => Promise.resolve(ok()),
  } as unknown as Api;
  const env: providers.Env = {
    sleep: () => Promise.resolve(), now: () => 1_000_000, hidden: () => false, visible: () => Promise.resolve(),
    newKey: () => 'idem-1', digest: () => Promise.resolve(null), alive: () => true,
  };
  const onSigned = vi.fn();
  const ctx = { m: {}, api, env, reload: vi.fn(), connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
  render(
    <AiProvider value={ctx}>
      <GptStep onSigned={onSigned} onBack={vi.fn()} />
    </AiProvider>,
  );
  return onSigned;
}

describe('AI: the ChatGPT step after a job that is gone', () => {
  it.each([
    ['the first login read failed, a login is stored now', [fail('unavailable', 503), login(true)]],
    ['the login cannot be read now', [login(false), fail('unavailable', 503)]],
  ] as const)('%s: "may have gone through", never connected', async (_n, auth) => {
    const onSigned = setup([...auth]);
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    expect(onSigned).not.toHaveBeenCalled();
  });

  it('a login new since the start: connected', async () => {
    const onSigned = setup([login(false), login(true)]);
    await vi.waitFor(() => expect(onSigned).toHaveBeenCalled());
  });
});
