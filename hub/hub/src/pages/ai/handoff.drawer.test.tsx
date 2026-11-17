// Vitest, model picker: the connect drawer on a model chooser's trip. It says
// who it is setting up for with Go back, opens at the endpoint form, records a created endpoint's id when the create
// answers and "done" when a key is saved, and on the done step offers Go back to the origin first. Without a trip the
// drawer is as before. The endpoint form itself is tested in its own files; here a stand-in calls `onCreated`.
import type { HandoffResult, providers } from '@core';
import { render, screen, userEvent, waitFor, within } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import type { Api } from './api';
import type * as EndpointStep from './parts/EndpointStep';
import type * as OpenRouterStep from './parts/OpenRouterStep';
import { ConnectDrawer, type ConnectTarget, type Trip } from './parts/Connect';
import { AiProvider, type AiCtx } from './parts/ctx';
import strings from './strings.en.json';

vi.mock('./parts/EndpointStep', async (orig) => ({
  ...(await orig<typeof EndpointStep>()),
  EndpointCreate: ({ onCreated }: { onCreated: (id: string, label: string, rev: string | null) => void }) => (
    <button type="button" onClick={() => onCreated('my-ep', 'My endpoint', 'rev-1')}>
      stand-in create
    </button>
  ),
}));

// The sign-in itself is tested in its own files; here a stand-in completes it.
vi.mock('./parts/OpenRouterStep', async (orig) => ({
  ...(await orig<typeof OpenRouterStep>()),
  OpenRouterStep: ({ onSigned }: { onSigned: () => void }) => (
    <button type="button" onClick={onSigned}>
      stand-in sign-in
    </button>
  ),
}));

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const err = (): Settled => ({ ok: false, err: { kind: 'failed', code: 'unexpected', status: 500, retryAfter: null, details: {} } });
const CAT = { byId: { anthropic: { id: 'anthropic', label: 'Anthropic', custom: false }, 'my-ep': { id: 'my-ep', label: 'My endpoint', custom: true }, openrouter: { id: 'openrouter', label: 'OpenRouter', custom: false, status: { methods: ['key', 'signin'] } } } };
const BAND = 'Setting up for New Bot on atlas.';
// The computer the page is on: core holds a key save for it (keySaveHold.ts), and with none named nothing is sent.
const ON = { computer: { id: 'c1', name: 'atlas' }, target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } } };

function drawer(target: ConnectTarget, trip: Trip | null, over: Partial<Api> = {}) {
  const goto = vi.fn();
  const onClose = vi.fn();
  const api = new Proxy({ ...over } as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : () => Promise.resolve(err())) });
  const env = { sleep: () => Promise.resolve(), now: () => 0, hidden: () => false, visible: () => Promise.resolve(), newKey: () => 'idem-1', digest: () => Promise.resolve('fp-1'), alive: () => true };
  const ctx = { m: { cat: CAT, caps: {}, accounts: [], ...ON, bundle: { snap: null, at: 0, err: null }, loads: { catalogue: 'ok' } }, api, env, reload: () => undefined, connect: () => undefined, goto } as unknown as AiCtx;
  render(
    <AiProvider value={ctx}>
      <ConnectDrawer target={target} onClose={onClose} trip={trip} />
    </AiProvider>,
  );
  return { goto, onClose };
}
const trip = () => ({ origin: 'New Bot', computer: 'atlas', back: vi.fn<() => void>(), result: vi.fn<(r: HandoffResult) => void>() }) satisfies Trip;

describe('the connect drawer on a model chooser trip', () => {
  it('opens at the endpoint form with the band; Go back leaves', async () => {
    const tr = trip();
    drawer({ endpoint: true }, tr);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(BAND)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'stand-in create' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['ho.back'] }));
    expect(tr.back).toHaveBeenCalledTimes(1);
  });

  it('records the created endpoint when the create answers, then "done" when its key is saved', async () => {
    const tr = trip();
    const def = ok({ provider: { id: 'my-ep', display_name: 'My endpoint', definition_rev: 'rev-1', custom_definition: { base_url: 'https://x.example', wire_format: 'openai' } } });
    drawer({ endpoint: true }, tr, { provider: () => Promise.resolve(def), keyPut: () => Promise.resolve(ok({ check: 'valid' })) } as Partial<Api>);
    await userEvent.click(await screen.findByRole('button', { name: 'stand-in create' }));
    expect(tr.result).toHaveBeenCalledWith({ status: 'created', provider: 'my-ep' });
    const save = screen.getByRole('button', { name: strings['key.save'] });
    await userEvent.type(screen.getByLabelText(/My endpoint API key/), 'sk-ep');
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    expect(await screen.findByText(strings['done.title'].replace('{{provider}}', 'My endpoint'))).toBeInTheDocument();
    expect(tr.result).toHaveBeenLastCalledWith({ status: 'done', provider: 'my-ep' });
    const json = JSON.stringify(tr.result.mock.calls);
    expect(json, 'the key never goes on the trip').not.toContain('sk-ep');
  });

  it('on the done step Go back to the origin is the primary, Make it the default the secondary, and the band goes', async () => {
    const tr = trip();
    const { goto, onClose } = drawer({ providerId: 'anthropic' }, tr, { keyPut: () => Promise.resolve(ok({ check: 'valid' })) } as Partial<Api>);
    await userEvent.type(await screen.findByLabelText(/Anthropic API key/), 'sk-1');
    await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
    const back = await screen.findByRole('button', { name: 'Go back to New Bot' });
    expect(tr.result).toHaveBeenCalledWith({ status: 'done', provider: 'anthropic' });
    expect(screen.queryByText(BAND)).toBeNull();
    expect(screen.queryByRole('button', { name: strings['done.close'] })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['done.makeDefault'] }));
    expect(onClose).toHaveBeenCalled();
    expect(goto).toHaveBeenCalledWith('default');
    await userEvent.click(back);
    expect(tr.back).toHaveBeenCalledTimes(1);
  });

  it('a completed sign-in records "done" for its provider and offers Go back first', async () => {
    const tr = trip();
    drawer({ providerId: 'openrouter' }, tr);
    await userEvent.click(await screen.findByRole('radio', { name: new RegExp(strings['connect.openrouter']) }));
    await userEvent.click(await screen.findByRole('button', { name: 'stand-in sign-in' }));
    expect(await screen.findByRole('button', { name: 'Go back to New Bot' })).toBeInTheDocument();
    expect(tr.result).toHaveBeenCalledTimes(1);
    expect(tr.result).toHaveBeenCalledWith({ status: 'done', provider: 'openrouter' });
  });

  it('without a trip the drawer is as before: no band, Make it the default and Close on the done step', async () => {
    drawer({ providerId: 'anthropic' }, null, { keyPut: () => Promise.resolve(ok({ check: 'valid' })) } as Partial<Api>);
    await userEvent.type(await screen.findByLabelText(/Anthropic API key/), 'sk-1');
    expect(screen.queryByText(BAND)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
    expect(await screen.findByRole('button', { name: strings['done.makeDefault'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['done.close'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Go back/ })).toBeNull();
  });
});
