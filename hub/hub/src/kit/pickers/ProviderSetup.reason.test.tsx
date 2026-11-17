// When a ChatGPT sign-in does not finish, the person sees why (the code ran
// out, the attempt ended) and both ways on (Start again, Back), not the title alone.
import type { providers } from '@core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProviderSetup } from './ProviderSetup';
import strings from './ProviderSetup.strings.en.json';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const err = (kind: providers.Outcome['kind'], code = '', status = 0): Settled => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });

function fakeApi(over: Partial<providers.ProvidersApi> = {}): providers.ProvidersApi {
  const none = () => Promise.resolve(err('failed', 'unexpected', 500));
  return {
    version: none,
    providers: none,
    provider: none,
    auth: none,
    catalogue: () => Promise.resolve(err('failed', 'unexpected', 500)) as Promise<providers.Settled<providers.Catalogue>>,
    oauthPoll: none,
    pkcePoll: none,
    pkceStart: none,
    pkceCode: none,
    pkceCancel: none,
    keyPut: none,
    keyDelete: none,
    authTest: none,
    authDefault: none,
    oauthStart: none,
    oauthCancel: none,
    signOut: none,
    ...over,
  };
}
const env: providers.Env = {
  sleep: () => Promise.resolve(),
  now: () => 0,
  hidden: () => false,
  visible: () => Promise.resolve(),
  newKey: () => 'k-1',
  digest: () => Promise.resolve('fp-1'),
  alive: () => true,
};

describe('ProviderSetup: a ChatGPT sign-in that did not finish says why', () => {
  const pending = () => Promise.resolve(ok({ state: 'pending' }));
  it.each([
    // The code's life runs out (the clock jumps a day per read), or the job is gone (404).
    [
      'the code ran out',
      strings['gpt.expired'],
      pending,
      () =>
        (
          (n) => () =>
            (n += 86_400_000)
        )(0),
    ],
    ['the attempt ended', strings['gpt.ended'], () => Promise.resolve(err('failed', 'not_found', 404)), () => () => 0],
  ] as const)('%s: the reason shows, with Start again and Back', async (_name, reason, oauthPoll, clock) => {
    const api = fakeApi({
      auth: () => Promise.resolve(ok({ auth: { oauth_stored: false } })),
      oauthStart: () => Promise.resolve(ok({ job_id: 'j1', user_code: 'ABCD-1234' })),
      oauthPoll,
    });
    render(<ProviderSetup api={api} env={{ ...env, now: clock() }} providerId="openai" providerLabel="OpenAI" device at={null} onConnected={() => {}} />);
    expect(await screen.findByText(strings['gpt.failedTitle'])).toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['gpt.again'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['gpt.back'] })).toBeInTheDocument();
  });
});
