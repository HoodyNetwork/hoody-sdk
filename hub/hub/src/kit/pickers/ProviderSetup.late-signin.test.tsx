// The sign-in choice can arrive after the key step is up (the version read lands late, so
// `device` or `signin` turns true). KeySetup keeps its place in the tree: the typed key stays, Key stays chosen, and a
// save already sent still lands (C9: a remount would lose an answer whose save may have gone through).
import type { providers } from '@core';
import { act, render, screen, waitFor } from '@testing-library/react';
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
const HOLD_AT = { project: 'p1', computer: 'c1' };
const keyBox = () => screen.getByLabelText(/OpenAI API key/) as HTMLInputElement;

describe('ProviderSetup: a sign-in offered late', () => {
  it('the typed key stays, and Key stays chosen with the choice shown above it', async () => {
    const api = fakeApi();
    const onConnected = vi.fn();
    const { rerender } = render(<ProviderSetup api={api} env={env} providerId="openai" providerLabel="OpenAI" at={null} onConnected={onConnected} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    const box = keyBox();
    await userEvent.type(box, 'sk-half');
    rerender(<ProviderSetup api={api} env={env} providerId="openai" providerLabel="OpenAI" device at={null} onConnected={onConnected} />);
    expect(screen.getByRole('radiogroup', { name: 'How to connect OpenAI' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: new RegExp(strings['ps.how.key']) })).toBeChecked();
    expect(keyBox()).toBe(box);
    expect(keyBox()).toHaveValue('sk-half');
  });

  it('a save in flight across the flip still lands: connected', async () => {
    let answer: (s: Settled) => void = () => {};
    const sent: string[] = [];
    const api = fakeApi({ keyPut: (_pid, body) => { sent.push('put'); void body; return new Promise<Settled>((r) => { answer = r; }); } });
    const onConnected = vi.fn();
    const { rerender } = render(<ProviderSetup api={api} env={env} providerId="openai" providerLabel="OpenAI" at={HOLD_AT} onConnected={onConnected} />);
    await userEvent.type(keyBox(), 'sk-test-1');
    await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
    await waitFor(() => expect(sent).toHaveLength(1));
    rerender(<ProviderSetup api={api} env={env} providerId="openai" providerLabel="OpenAI" device at={HOLD_AT} onConnected={onConnected} />);
    await act(async () => { answer(ok({ check: 'valid' })); await Promise.resolve(); });
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith({ how: 'valid' }));
    expect(sent).toHaveLength(1);
  });

  it('OpenRouter: the same when its own sign-in is listed late', async () => {
    const api = fakeApi();
    const { rerender } = render(<ProviderSetup api={api} env={env} providerId="openrouter" providerLabel="OpenRouter" at={null} onConnected={() => undefined} />);
    const box = screen.getByLabelText(/OpenRouter API key/) as HTMLInputElement;
    await userEvent.type(box, 'sk-or-half');
    rerender(<ProviderSetup api={api} env={env} providerId="openrouter" providerLabel="OpenRouter" signin at={null} onConnected={() => undefined} />);
    expect(screen.getByRole('radio', { name: new RegExp(strings['ps.how.key']) })).toBeChecked();
    expect(screen.getByLabelText(/OpenRouter API key/)).toBe(box);
    expect(box).toHaveValue('sk-or-half');
  });

  it('a provider offering only a key keeps its look: no choice, the key step alone in the stack', () => {
    const { container } = render(<ProviderSetup api={fakeApi()} env={env} providerId="anthropic" providerLabel="Anthropic" at={null} onConnected={() => undefined} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByLabelText(/Anthropic API key/)).toBeInTheDocument();
    // One wrapper (the stack the sign-in layout already uses) holding the key step only.
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild!.children).toHaveLength(1);
  });

  // Leaving the key step would drop a save's answer, so the choice waits while a send is in
  // flight or its outcome is unknown.
  it('a save in flight when the choice appears: the choice is locked, and the answer still lands', async () => {
    let answer: (s: Settled) => void = () => {};
    const api = fakeApi({ keyPut: () => new Promise<Settled>((r) => { answer = r; }) });
    const onConnected = vi.fn();
    const { rerender } = render(<ProviderSetup api={api} env={env} providerId="openai" providerLabel="OpenAI" at={HOLD_AT} onConnected={onConnected} />);
    await userEvent.type(keyBox(), 'sk-test-1');
    await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
    rerender(<ProviderSetup api={api} env={env} providerId="openai" providerLabel="OpenAI" device at={HOLD_AT} onConnected={onConnected} />);
    const sign = screen.getByRole('radio', { name: new RegExp(strings['ps.how.gpt']) });
    expect(sign).toBeDisabled();
    await userEvent.click(sign);
    expect(screen.getByRole('radio', { name: new RegExp(strings['ps.how.key']) })).toBeChecked();
    await act(async () => { answer(ok({ check: 'valid' })); await Promise.resolve(); });
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith({ how: 'valid' }));
  });

  it('a save whose outcome is unknown ("may have been saved"): the choice stays locked until Type the key again', async () => {
    const api = fakeApi({ keyPut: () => Promise.resolve(err('pending', '', 502)), auth: () => Promise.resolve(ok({ auth: { api_key_fingerprint: 'other' } })) });
    const { rerender } = render(<ProviderSetup api={api} env={env} providerId="openai" providerLabel="OpenAI" device at={HOLD_AT} onConnected={() => undefined} />);
    await userEvent.click(screen.getByRole('radio', { name: new RegExp(strings['ps.how.key']) }));
    await userEvent.type(keyBox(), 'sk-test-1');
    await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
    expect(await screen.findByText(strings['key.notConfirmed'])).toBeInTheDocument();
    rerender(<ProviderSetup api={api} env={env} providerId="openai" providerLabel="OpenAI" device at={HOLD_AT} onConnected={() => undefined} />);
    const sign = screen.getByRole('radio', { name: new RegExp(strings['ps.how.gpt']) });
    expect(sign).toBeDisabled();
    await userEvent.click(sign);
    expect(screen.getByText(strings['key.notConfirmed'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['key.typeAgain'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['key.typeAgainGo'] }));
    await waitFor(() => expect(screen.getByRole('radio', { name: new RegExp(strings['ps.how.gpt']) })).toBeEnabled());
  });

  // A sign-in offered first, then gone, then back: the key step shown while it was gone stays.
  it('sign-in first, gone, then back: a key typed meanwhile stays, on Key', async () => {
    const api = fakeApi();
    const at = (device: boolean) => <ProviderSetup api={api} env={env} providerId="openai" providerLabel="OpenAI" device={device} at={null} onConnected={() => undefined} />;
    const { rerender } = render(at(true));
    expect(screen.getByRole('radio', { name: new RegExp(strings['ps.how.gpt']) })).toBeChecked();
    rerender(at(false));
    const box = keyBox();
    await userEvent.type(box, 'sk-half');
    rerender(at(true));
    expect(screen.getByRole('radio', { name: new RegExp(strings['ps.how.key']) })).toBeChecked();
    expect(keyBox()).toBe(box);
    expect(box).toHaveValue('sk-half');
  });

  it('sign-in first, gone, then back: a save sent meanwhile still lands', async () => {
    let answer: (s: Settled) => void = () => {};
    const api = fakeApi({ keyPut: () => new Promise<Settled>((r) => { answer = r; }) });
    const onConnected = vi.fn();
    const at = (device: boolean) => <ProviderSetup api={api} env={env} providerId="openai" providerLabel="OpenAI" device={device} at={HOLD_AT} onConnected={onConnected} />;
    const { rerender } = render(at(true));
    rerender(at(false));
    await userEvent.type(keyBox(), 'sk-test-1');
    await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
    rerender(at(true));
    await act(async () => { answer(ok({ check: 'valid' })); await Promise.resolve(); });
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith({ how: 'valid' }));
  });
});
