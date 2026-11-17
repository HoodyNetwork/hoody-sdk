// A ChatGPT sign-in whose job ended unseen is "may have gone through" unless a login
// read proves otherwise (C9), a refused start shows the rejection's words and Details, and a job cancelled elsewhere reads
// the same in both sign-ins.
import type { providers } from '@core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OpenRouterSetup } from './OpenRouterSetup';
import { ProviderSetup } from './ProviderSetup';
import strings from './ProviderSetup.strings.en.json';
import stateStrings from '../states/strings.en.json';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const err = (kind: providers.Outcome['kind'], code = '', status = 0): Settled => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
const login = (stored: boolean): Settled => ok({ auth: { oauth_stored: stored } });
const unreadable = (): Settled => err('failed', 'unavailable', 503);

function fakeApi(over: Partial<providers.ProvidersApi> = {}): providers.ProvidersApi {
  const none = () => Promise.resolve(err('failed', 'unexpected', 500));
  return {
    version: none, providers: none, provider: none, auth: none,
    catalogue: () => Promise.resolve(err('failed', 'unexpected', 500)) as Promise<providers.Settled<providers.Catalogue>>,
    oauthPoll: none, pkcePoll: none, pkceStart: none, pkceCode: none, pkceCancel: none, keyPut: none, keyDelete: none,
    authTest: none, authDefault: none, oauthStart: none, oauthCancel: none, signOut: none,
    ...over,
  };
}
const env = (now: () => number = () => 0): providers.Env => ({
  sleep: () => Promise.resolve(), now, hidden: () => false, visible: () => Promise.resolve(), newKey: () => 'k-1', digest: () => Promise.resolve('fp-1'), alive: () => true,
});
/** The login read: `before` until the sign-in starts, `after` once it has (other steps read it too, so no call count). */
const reads = (before: Settled, after: Settled) => {
  const r = { started: false, auth: () => Promise.resolve(r.started ? after : before) };
  return r;
};
const pending = () => Promise.resolve(ok({ state: 'pending' }));
const gone = () => Promise.resolve(err('failed', 'not_found', 404));
/** A clock that jumps a day per read: the poll's 15-minute life runs out at once. */
const runsOut = () => ((n) => () => (n += 86_400_000))(0);

function gpt(login: ReturnType<typeof reads>, oauthPoll: () => Promise<Settled>, now?: () => number, onConnected = vi.fn()) {
  const oauthStart = () => {
    login.started = true;
    return Promise.resolve(ok({ job_id: 'j1', user_code: 'ABCD-1234' }));
  };
  const api = fakeApi({ auth: login.auth, oauthStart, oauthPoll });
  render(<ProviderSetup api={api} env={env(now)} providerId="openai" providerLabel="OpenAI" device at={null} onConnected={onConnected} />);
  return onConnected;
}

describe('ChatGPT sign-in: a job that ended unseen is never "did not finish" without proof (C9)', () => {
  it.each([
    ['the poll ran out and the login cannot be read', reads(login(false), unreadable()), pending, runsOut()],
    ['the job is gone and the login cannot be read', reads(login(false), unreadable()), gone, undefined],
    ['the job is gone and a login is stored, but the first read failed', reads(unreadable(), login(true)), gone, undefined],
    ['the job is gone and a login was already stored before', reads(login(true), login(true)), gone, undefined],
  ] as const)('%s: "may have gone through" with Check again', async (_n, auth, poll, now) => {
    const onConnected = gpt(auth, poll, now);
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
    expect(screen.queryByText(strings['gpt.failedTitle'])).toBeNull();
    expect(onConnected).not.toHaveBeenCalled();
  });

  it('the job is gone and a login new since the start is stored: connected', async () => {
    const onConnected = gpt(reads(login(false), login(true)), gone);
    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledWith({ how: 'signin' }));
  });
});

describe('ChatGPT and OpenRouter: a refused start shows the rejection (Errors rule)', () => {
  it('ChatGPT: mapped words, Details, Try again and Back', async () => {
    const api = fakeApi({ auth: () => Promise.resolve(login(false)), oauthStart: () => Promise.resolve(err('failed', 'bad_request', 400)) });
    render(<ProviderSetup api={api} env={env()} providerId="openai" providerLabel="OpenAI" device at={null} onConnected={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(strings['gpt.failedTitle']);
    expect(screen.getByRole('button', { name: stateStrings['err.details'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['gpt.back'] })).toBeInTheDocument();
  });

  it('a page\'s own words for the rejection stand as its sentence, with Details (pages/ai openrouter.step: never a second sentence)', async () => {
    const api = fakeApi({ auth: () => Promise.resolve(login(false)), oauthStart: () => Promise.resolve(err('failed', 'bad_request', 400)) });
    render(<ProviderSetup api={api} env={env()} providerId="openai" providerLabel="OpenAI" device failedText={() => 'The page says why.'} at={null} onConnected={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The page says why.');
    // Details still carries the rejection's facts.
    fireEvent.click(screen.getByRole('button', { name: stateStrings['err.details'] }));
    await screen.findByRole('button', { name: stateStrings['err.copy'] });
    expect(document.body).toHaveTextContent('bad_request');
    expect(document.body).toHaveTextContent('400');
  });

  it('a refusal whose facts say pending: no Try again, Back stays (C9)', async () => {
    const api = fakeApi({ auth: () => Promise.resolve(login(false)), oauthStart: () => Promise.resolve(err('pending')) });
    render(<ProviderSetup api={api} env={env()} providerId="openai" providerLabel="OpenAI" device at={null} onConnected={vi.fn()} />);
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    expect(screen.getByRole('button', { name: strings['gpt.back'] })).toBeInTheDocument();
  });

  it('OpenRouter "unsupported": its own words, with Details', async () => {
    const api = fakeApi({ auth: () => Promise.resolve(login(false)), pkceStart: () => Promise.resolve(err('failed', 'oauth_unsupported', 409)) });
    render(<OpenRouterSetup api={api} env={env()} onSigned={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(strings['or.unsupported']);
    expect(screen.getByRole('button', { name: stateStrings['err.details'] })).toBeInTheDocument();
  });

  it('OpenRouter: the same', async () => {
    const api = fakeApi({ auth: () => Promise.resolve(login(false)), pkceStart: () => Promise.resolve(err('failed', 'bad_request', 400)) });
    render(<OpenRouterSetup api={api} env={env()} onSigned={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(strings['gpt.failedTitle']);
    expect(screen.getByRole('button', { name: stateStrings['err.details'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

describe('OpenRouter: a job cancelled elsewhere reads as ChatGPT says it', () => {
  it('"That sign-in attempt has ended."', async () => {
    const api = fakeApi({ auth: () => Promise.resolve(login(false)), pkceStart: () => Promise.resolve(ok({ job_id: 'j1', verification_uri: 'https://openrouter.ai/auth?x=1' })), pkcePoll: () => Promise.resolve(ok({ state: 'cancelled' })) });
    render(<OpenRouterSetup api={api} env={env()} onSigned={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByText(strings['gpt.ended'])).toBeInTheDocument();
  });
});
