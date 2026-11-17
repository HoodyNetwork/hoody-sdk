// ChatGPT sign-in connects only on evidence of a new login: an unreadable starting state proves nothing, through
// a lost start and Check again, or a job that ran out. Leaving while the start is in flight cancels the job it
// made. In the model picker, the current model that lost its connection still opens setup.
import type { providers } from '@core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ModelPicker, type ModelChoice } from './ModelPicker';
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
const env = (now: () => number = () => 0): providers.Env => ({
  sleep: () => Promise.resolve(),
  now,
  hidden: () => false,
  visible: () => Promise.resolve(),
  newKey: () => 'k-1',
  digest: () => Promise.resolve('fp-1'),
  alive: () => true,
});

/** The stored login: unreadable at first, then signed in (an old login, or one nobody can tie to this attempt). */
function laterSignedIn() {
  let reads = 0;
  return () => {
    reads += 1;
    return Promise.resolve(reads === 1 ? err('failed', 'unexpected', 500) : ok({ auth: { oauth_stored: true } }));
  };
}

describe('ChatGPT sign-in: only a new login connects', () => {
  it('unreadable start, lost start answer, then Check again finds a login: still unconfirmed', async () => {
    const onConnected = vi.fn();
    const api = fakeApi({ auth: laterSignedIn(), oauthStart: () => Promise.resolve(err('pending', '', 502)) });
    render(<ProviderSetup api={api} env={env()} providerId="openai" providerLabel="OpenAI" device at={null} onConnected={onConnected} />);
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await waitFor(() => expect(screen.getByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument());
    expect(onConnected).not.toHaveBeenCalled();
  });

  it('unreadable start, then the job runs out while a login is stored: may have gone through (C9), nothing connects', async () => {
    const onConnected = vi.fn();
    let t = 0;
    const api = fakeApi({
      auth: laterSignedIn(),
      oauthStart: () => Promise.resolve(ok({ job_id: 'j1', user_code: 'ABCD-1234' })),
      oauthPoll: () => Promise.resolve(ok({ state: 'pending' })),
    });
    render(<ProviderSetup api={api} env={env(() => (t += 10 * 60000))} providerId="openai" providerLabel="OpenAI" device at={null} onConnected={onConnected} />);
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    expect(screen.queryByText(strings['gpt.failedTitle'])).toBeNull();
    expect(onConnected).not.toHaveBeenCalled();
  });

  it('leaving while the start is in flight cancels the job that start made', async () => {
    let answer: (v: Settled) => void = () => {};
    const oauthCancel = vi.fn(() => Promise.resolve(ok({ state: 'cancelled' })));
    const api = fakeApi({
      auth: () => Promise.resolve(ok({ auth: { oauth_stored: false } })),
      oauthStart: () => new Promise<Settled>((r) => { answer = r; }),
      oauthCancel,
    });
    const view = render(<ProviderSetup api={api} env={env()} providerId="openai" providerLabel="OpenAI" device at={null} onConnected={() => {}} />);
    await waitFor(() => expect(screen.getByText(strings['gpt.starting'])).toBeInTheDocument());
    view.unmount();
    answer(ok({ job_id: 'j-late', user_code: 'ABCD-1234' }));
    await waitFor(() => expect(oauthCancel).toHaveBeenCalledWith('j-late'));
  });
});

describe('ModelPicker: the current model', () => {
  it('a current model whose provider lost its connection opens setup when pressed', async () => {
    const models: ModelChoice[] = [
      { spec: 'hoody-ai/hoody-free', label: 'Hoody Free', providerId: 'hoody-ai', providerLabel: 'Hoody AI', ready: 'ready', source: 'provider' },
      { spec: 'anthropic/claude-a', label: 'Claude A', providerId: 'anthropic', providerLabel: 'Anthropic', ready: 'needs_key', source: 'provider' },
    ];
    const onSetup = vi.fn();
    const onChange = vi.fn();
    function Host() {
      const [v] = useState('anthropic/claude-a');
      return <ModelPicker label="Model" models={models} value={v} onChange={onChange} onSetup={onSetup} />;
    }
    render(<Host />);
    await userEvent.click(screen.getByRole('radio', { name: /Claude A/ }));
    expect(onSetup).toHaveBeenCalledTimes(1);
    expect(onSetup.mock.calls[0]?.[0]).toMatchObject({ spec: 'anthropic/claude-a', providerId: 'anthropic' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
