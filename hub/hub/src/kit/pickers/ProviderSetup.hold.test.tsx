// ProviderSetup: every key save is held on the provider's credential on the computer it goes to (`at`), the lock the AI
// page's key saves and its key and endpoint removals take. While the key is out it is held; a lost answer keeps it, so
// the AI page shows that save and sends no removal of that credential meanwhile; a change held there (a removal that may
// still land) sends no key from here. A known answer, a Check again that reads this key, and "Stop tracking this save"
// let it go. Without `at` nothing could be held, so nothing is sent.
import { heldAttempts, type providers } from '@core';
import { holdAttempt, resetAttempts } from '@core/attempts';
import { boot } from '@core/test/env';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderSetup } from './ProviderSetup';
import strings from './ProviderSetup.strings.en.json';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const lost: Settled = { ok: false, err: { kind: 'pending', code: '', status: 502, retryAfter: null, details: {} } };

function fakeApi(over: Partial<providers.ProvidersApi> = {}): providers.ProvidersApi {
  const none = () => Promise.resolve<Settled>({ ok: false, err: { kind: 'failed', code: 'unexpected', status: 500, retryAfter: null, details: {} } });
  return new Proxy({ ...over } as providers.ProvidersApi, { get: (t, k) => (k in t ? t[k as keyof providers.ProvidersApi] : none) });
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

const AT = { project: 'p1', computer: 'c1' };
/** The lock the AI page reads for Anthropic's stored credential on that computer. */
const LOCK = 'ai.credential:p1/c1/anthropic';
const senders = () => heldAttempts(LOCK).map((h) => h.by);
const field = () => screen.getByLabelText(/Anthropic API key/);

function draw(api: providers.ProvidersApi, at: typeof AT | null = AT, onConnected = vi.fn()) {
  render(<ProviderSetup api={api} env={env} providerId="anthropic" providerLabel="Anthropic" at={at} onConnected={onConnected} />);
  return onConnected;
}
async function send(key = 'sk-test-1') {
  await userEvent.type(field(), key);
  await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
}

beforeEach(() => boot());
afterEach(() => resetAttempts());

describe('ProviderSetup: a key save is held on the computer\'s credential', () => {
  it('held while the key is out, under the key-save sender; gone once the answer is known', async () => {
    let during: string[] = [];
    const onConnected = draw(fakeApi({ keyPut: () => { during = senders(); return Promise.resolve(ok({ check: 'valid' })); } }));
    await send();
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith({ how: 'valid' }));
    expect(during).toEqual(['ai.key-save']);
    await waitFor(() => expect(senders()).toEqual([]));
  });

  it('a lost answer stays held, so the AI page sees it', async () => {
    const keyPut = vi.fn(() => Promise.resolve(lost));
    draw(fakeApi({ keyPut, auth: () => Promise.resolve(ok({ auth: { api_key_fingerprint: 'other' } })) }));
    await send();
    expect(await screen.findByText(strings['key.notConfirmed'])).toBeInTheDocument();
    expect(senders()).toEqual(['ai.key-save']);
    expect(keyPut).toHaveBeenCalledTimes(1);
  });

  it('a change of that credential held there (a removal that may still land): nothing is sent, the step says so and the key stays', async () => {
    const removal = await holdAttempt(LOCK, { by: 'ai.disconnect', identity: { project: 'p1', computer: 'c1', provider: 'anthropic' } });
    expect(removal.ok).toBe(true);
    const keyPut = vi.fn(() => Promise.resolve(ok({ check: 'valid' })));
    const onConnected = draw(fakeApi({ keyPut }));
    await send();
    expect(await screen.findByText(strings['key.held'].replace('{{provider}}', 'Anthropic'))).toBeInTheDocument();
    expect(keyPut).not.toHaveBeenCalled();
    expect(field()).toHaveValue('sk-test-1');
    // Once that change is known, the same key goes.
    if (removal.ok) removal.hold.release();
    await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith({ how: 'valid' }));
    expect(keyPut).toHaveBeenCalledTimes(1);
  });

  it('Check again that reads this key lets the hold go, and the step connects', async () => {
    let stored = 'other';
    const onConnected = draw(fakeApi({ keyPut: () => Promise.resolve(lost), auth: () => Promise.resolve(ok({ auth: { api_key_fingerprint: stored } })) }));
    await send();
    expect(await screen.findByText(strings['key.notConfirmed'])).toBeInTheDocument();
    expect(senders()).toEqual(['ai.key-save']);
    stored = 'fp-1';
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith({ how: 'saved' }));
    expect(senders()).toEqual([]);
  });

  it('"Stop tracking this save" lets the hold go, and the next key is sent', async () => {
    const keyPut = vi.fn(() => Promise.resolve(lost));
    draw(fakeApi({ keyPut, auth: () => Promise.resolve(ok({ auth: { api_key_fingerprint: 'other' } })) }));
    await send();
    expect(await screen.findByText(strings['key.notConfirmed'])).toBeInTheDocument();
    expect(senders()).toEqual(['ai.key-save']);
    await userEvent.click(screen.getByRole('button', { name: strings['key.typeAgain'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['key.typeAgainGo'] }));
    await waitFor(() => expect(senders()).toEqual([]));
    await send('sk-test-2');
    await waitFor(() => expect(keyPut).toHaveBeenCalledTimes(2));
  });

  it('"Stop tracking this save" asks first: until confirmed the hold stays and no key can be sent; cancel keeps it', async () => {
    const keyPut = vi.fn(() => Promise.resolve(lost));
    draw(fakeApi({ keyPut, auth: () => Promise.resolve(ok({ auth: { api_key_fingerprint: 'other' } })) }));
    await send();
    expect(await screen.findByText(strings['key.notConfirmed'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['key.typeAgain'] }));
    const dialog = await screen.findByRole('alertdialog', { name: strings['key.typeAgainTitle'] });
    expect(dialog).toHaveTextContent(strings['key.stopWarn']);
    expect(senders()).toEqual(['ai.key-save']);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(senders()).toEqual(['ai.key-save']);
    expect(screen.getByText(strings['key.notConfirmed'])).toBeInTheDocument();
    expect(keyPut).toHaveBeenCalledTimes(1);
  });

  it('without the computer it sends to, no key is sent: the step says so and the key stays', async () => {
    const keyPut = vi.fn(() => Promise.resolve(ok({ check: 'valid' })));
    const onConnected = draw(fakeApi({ keyPut }), null);
    await send();
    expect(await screen.findByText(strings['key.notHeld'])).toBeInTheDocument();
    expect(keyPut).not.toHaveBeenCalled();
    expect(onConnected).not.toHaveBeenCalled();
    expect(field()).toHaveValue('sk-test-1');
  });
});
