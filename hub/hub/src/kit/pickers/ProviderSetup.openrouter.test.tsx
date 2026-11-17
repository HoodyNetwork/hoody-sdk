// ProviderSetup offers OpenRouter's own sign-in only when the agent lists `signin` for openrouter:
// then "Sign in with OpenRouter" comes first and runs OpenRouterSetup, "Use an API key" stays one press away, and a
// finished sign-in connects as `signin`. Without `signin`, or for another provider, the step is the key alone and no
// sign-in is ever started.
import type { providers } from '@core';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProviderSetup } from './ProviderSetup';
import strings from './ProviderSetup.strings.en.json';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const err = (kind: providers.Outcome['kind'], code = '', status = 0): Settled => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
const AUTH = 'https://openrouter.ai/auth?callback_url=http%3A%2F%2Flocalhost%3A53781%2Fcallback&code_challenge=abc&code_challenge_method=S256';

function fakeApi(over: Partial<providers.ProvidersApi> = {}): providers.ProvidersApi & { starts: unknown[][] } {
  const none = () => Promise.resolve(err('failed', 'unexpected', 500));
  const starts: unknown[][] = [];
  return {
    starts,
    version: none,
    providers: none,
    provider: none,
    auth: () => Promise.resolve(ok({ auth: { oauth_stored: false } })),
    catalogue: () => Promise.resolve(err('failed', 'unexpected', 500)) as Promise<providers.Settled<providers.Catalogue>>,
    oauthPoll: none,
    pkcePoll: none,
    pkceStart: (...a: unknown[]) => (starts.push(a), Promise.resolve(ok({ job_id: 'j1', verification_uri: AUTH }))),
    pkceCode: none,
    pkceCancel: () => Promise.resolve(ok({})),
    keyPut: none,
    keyDelete: none,
    authTest: none,
    authDefault: none,
    oauthStart: none,
    oauthCancel: none,
    signOut: none,
    ...over,
  } as providers.ProvidersApi & { starts: unknown[][] };
}
const sleepers: Array<() => void> = [];
const env: providers.Env = {
  sleep: (ms) => (ms === 0 ? Promise.resolve() : new Promise<void>((r) => sleepers.push(r))),
  now: () => 0,
  hidden: () => false,
  visible: () => Promise.resolve(),
  newKey: () => 'k-1',
  digest: () => Promise.resolve('fp-1'),
  alive: () => true,
};

describe('ProviderSetup: OpenRouter sign-in', () => {
  it('signin listed: sign-in first, it starts one job, and its end connects as signin', async () => {
    let polls = 0;
    const api = fakeApi({ pkcePoll: () => Promise.resolve(polls++ === 0 ? ok({ state: 'pending', needs_code: true, verification_uri: AUTH }) : ok({ state: 'complete' })) });
    const onConnected = vi.fn();
    render(<ProviderSetup api={api} env={env} providerId="openrouter" providerLabel="OpenRouter" signin at={null} onConnected={onConnected} />);
    expect(screen.getByRole('radio', { name: new RegExp(strings['ps.how.or']) })).toBeChecked();
    expect(await screen.findByText(strings['or.step3'])).toBeInTheDocument();
    expect(api.starts).toEqual([['openrouter', 'k-1']]);
    expect(screen.queryByLabelText(/OpenRouter API key/)).toBeNull();
    await act(async () => void sleepers.splice(0).forEach((r) => r()));
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith({ how: 'signin' }));
  });

  it('signin listed: Use an API key shows the key field and cancels the sign-in it leaves', async () => {
    const cancels: unknown[][] = [];
    const api = fakeApi({ pkcePoll: () => Promise.resolve(ok({ state: 'pending', needs_code: true, verification_uri: AUTH })), pkceCancel: (...a: unknown[]) => (cancels.push(a), Promise.resolve(ok({}))) });
    render(<ProviderSetup api={api} env={env} providerId="openrouter" providerLabel="OpenRouter" signin at={null} onConnected={() => {}} />);
    await screen.findByText(strings['or.step3']);
    await userEvent.click(screen.getByRole('radio', { name: new RegExp(strings['ps.how.key']) }));
    expect(await screen.findByLabelText(/OpenRouter API key/)).toBeInTheDocument();
    expect(screen.getByText(strings['ps.how.keyHintOr'])).toBeInTheDocument();
    await waitFor(() => expect(cancels).toEqual([['openrouter', 'j1']]));
  });

  it('without signin, OpenRouter is the key alone and no sign-in starts', async () => {
    const api = fakeApi();
    render(<ProviderSetup api={api} env={env} providerId="openrouter" providerLabel="OpenRouter" at={null} onConnected={() => {}} />);
    expect(await screen.findByLabelText(/OpenRouter API key/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(api.starts).toEqual([]);
  });

  it('signin on another provider offers nothing more: the key alone', async () => {
    const api = fakeApi();
    render(<ProviderSetup api={api} env={env} providerId="anthropic" providerLabel="Anthropic" signin at={null} onConnected={() => {}} />);
    expect(await screen.findByLabelText(/Anthropic API key/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(api.starts).toEqual([]);
  });

  it("a refused start uses the caller's words", async () => {
    const api = fakeApi({ pkceStart: () => Promise.resolve(err('failed', 'bad_request', 400)) });
    render(<ProviderSetup api={api} env={env} providerId="openrouter" providerLabel="OpenRouter" signin failedText={() => 'Caller words'} at={null} onConnected={() => {}} />);
    expect(await screen.findByText('Caller words')).toBeInTheDocument();
  });
});
