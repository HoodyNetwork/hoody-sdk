// ProviderSetup: an API key is connected only from an answer or a fingerprint read-back; a refused key says so
// and saves nothing; a lost answer that never reads back is "may have been saved", never "not saved", and is not
// sent again; the key never stays in the field. OpenAI with device sign-in offers ChatGPT first, shows the code,
// and connects only when the login is new.
import type { providers } from '@core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
/** The computer the api sends to: each key save is held on its credential there. */
const AT = { project: 'p1', computer: 'c1' };

async function typeKey(key: string) {
  const box = screen.getByLabelText(/OpenAI API key|Anthropic API key/);
  await userEvent.type(box, key);
  await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
}

describe('ProviderSetup: API key', () => {
  it('a key the agent checks connects at once, and the sent body is wiped', async () => {
    const sent: Array<{ api_key: string }> = [];
    const onConnected = vi.fn();
    const api = fakeApi({ keyPut: (_pid, body) => { sent.push(body); return Promise.resolve(ok({ check: 'valid' })); } });
    render(<ProviderSetup api={api} env={env} providerId="anthropic" providerLabel="Anthropic" at={AT} onConnected={onConnected} />);
    await typeKey('sk-test-1');
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith({ how: 'valid' }));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.api_key).toBe('');
  });

  it('a refused key says so and connects nothing', async () => {
    const onConnected = vi.fn();
    const api = fakeApi({ keyPut: () => Promise.resolve(err('failed', 'api_key_refused', 422)) });
    render(<ProviderSetup api={api} env={env} providerId="anthropic" providerLabel="Anthropic" at={AT} onConnected={onConnected} />);
    await typeKey('sk-bad');
    expect(await screen.findByText('Anthropic did not accept this key.')).toBeInTheDocument();
    expect(onConnected).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Anthropic API key/)).toHaveValue('');
  });

  it('a lost answer is read back by fingerprint: connected only when it matches', async () => {
    const onConnected = vi.fn();
    const keyPut = vi.fn(() => Promise.resolve(err('pending', '', 502)));
    const api = fakeApi({ keyPut, auth: () => Promise.resolve(ok({ auth: { api_key_fingerprint: 'fp-1' } })) });
    render(<ProviderSetup api={api} env={env} providerId="anthropic" providerLabel="Anthropic" at={AT} onConnected={onConnected} />);
    await typeKey('sk-test-1');
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith({ how: 'saved' }));
    expect(keyPut).toHaveBeenCalledTimes(1);
  });

  it('a lost answer that never reads back is "may have been saved", never sent again', async () => {
    const onConnected = vi.fn();
    const keyPut = vi.fn(() => Promise.resolve(err('pending', '', 502)));
    const api = fakeApi({ keyPut, auth: () => Promise.resolve(ok({ auth: { api_key_fingerprint: 'other' } })) });
    render(<ProviderSetup api={api} env={env} providerId="anthropic" providerLabel="Anthropic" at={AT} onConnected={onConnected} />);
    await typeKey('sk-test-1');
    expect(await screen.findByText(strings['key.notConfirmed'])).toBeInTheDocument();
    expect(screen.getByText(strings['key.pendingHint'])).toBeInTheDocument();
    expect(onConnected).not.toHaveBeenCalled();
    expect(keyPut).toHaveBeenCalledTimes(1);
  });
});

describe('ProviderSetup: OpenAI with ChatGPT sign-in', () => {
  it('offers ChatGPT first, shows the code, and connects when the login is new', async () => {
    let signed = false;
    const onConnected = vi.fn();
    const api = fakeApi({
      auth: () => Promise.resolve(ok({ auth: { oauth_stored: signed } })),
      oauthStart: () => Promise.resolve(ok({ job_id: 'j1', user_code: 'ABCD-1234', verification_uri: 'https://auth.openai.com/codex/device' })),
      oauthPoll: () => {
        signed = true;
        return Promise.resolve(ok({ state: 'complete' }));
      },
    });
    render(<ProviderSetup api={api} env={env} providerId="openai" providerLabel="OpenAI" device at={null} onConnected={onConnected} />);
    expect(screen.getByRole('radio', { name: new RegExp(strings['ps.how.gpt']) })).toBeChecked();
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith({ how: 'signin' }));
  });

  it('a login that was already stored proves nothing: the sign-in reads as may have gone through', async () => {
    const onConnected = vi.fn();
    const api = fakeApi({
      auth: () => Promise.resolve(ok({ auth: { oauth_stored: true } })),
      oauthStart: () => Promise.resolve(ok({ job_id: 'j1', user_code: 'ABCD-1234' })),
      oauthPoll: () => Promise.resolve(ok({ state: 'complete' })),
    });
    render(<ProviderSetup api={api} env={env} providerId="openai" providerLabel="OpenAI" device at={null} onConnected={onConnected} />);
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    expect(onConnected).not.toHaveBeenCalled();
  });

  it('without the device capability OpenAI is a key step', () => {
    render(<ProviderSetup api={fakeApi()} env={env} providerId="openai" providerLabel="OpenAI" at={null} onConnected={() => {}} />);
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByLabelText(/OpenAI API key/)).toBeInTheDocument();
  });
});
