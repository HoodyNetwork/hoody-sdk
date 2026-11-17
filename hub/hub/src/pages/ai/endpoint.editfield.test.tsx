// forms-required, "Edit endpoint": the agent refuses a changed Address it cannot use (422 provider_invalid,
// details.field "base_url"). The edit form showed only "Check this field and try again." under the form, with no field
// marked; the create form already put the error on the field the agent named. The edit form now does the same.
import type { providers } from '@core';
import { render, screen, userEvent, waitFor } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { boot } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api } from './api';
import { AiProvider, type AiCtx } from './parts/ctx';
import { EndpointEdit } from './parts/EndpointStep';
import strings from './strings.en.json';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const refused = (field?: string): Settled => ({ ok: false, err: { kind: 'failed', code: 'provider_invalid', status: 422, retryAfter: null, details: field === undefined ? {} : { field } } } as Settled);
/** The computer the page is on: a save is held by core for it (endpointEditHold.ts). */
const M = { computer: { id: 'c1' }, target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } } };
const saved = ok({ provider: { id: 'my-ep', display_name: 'My endpoint', definition_rev: 'rev-3', custom_definition: { base_url: 'https://x.example/v1', wire_format: 'chat_completions' }, models: [{ spec: 'my-ep/m1' }] } });

function show(answer: Settled) {
  const sent: unknown[] = [];
  const none = () => Promise.resolve({ ok: false, err: { kind: 'failed', code: 'unexpected', status: 500, retryAfter: null, details: {} } } as Settled);
  const over = { provider: () => Promise.resolve(saved), customPatch: (_p: string, b: unknown) => { sent.push(b); return Promise.resolve(answer); } } as Partial<Api>;
  const api = new Proxy({ ...over } as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : none) });
  const onSaved = vi.fn();
  render(
    <AiProvider value={{ m: M, api, env: {}, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx}>
      <EndpointEdit providerId="my-ep" onSaved={onSaved} />
    </AiProvider>,
  );
  return { sent, onSaved };
}
const save = () => screen.getByRole('button', { name: strings['ep.save'] });
beforeEach(() => boot());
afterEach(() => resetAttempts());

describe('EndpointEdit: a field the agent refuses is marked', () => {
  it('422 provider_invalid for base_url puts the address error on Address, not a line under the form', async () => {
    const { sent, onSaved } = show(refused('base_url'));
    await screen.findByDisplayValue('https://x.example/v1');
    const address = () => screen.getByRole('textbox', { name: /^Address/ });
    await userEvent.clear(address());
    await userEvent.type(address(), 'https://inside.example/v1');
    // A moved address first asks for the send-key tick; nothing is sent before it.
    await userEvent.click(save());
    expect(sent).toEqual([]);
    await userEvent.click(screen.getByRole('checkbox', { name: strings['ep.sendKey'] }));
    await userEvent.click(save());
    await waitFor(() => expect(sent).toEqual([{ base_url: 'https://inside.example/v1' }]));
    // The form's own check passed this address, so the refusal is the agent's: the words say what the agent checks (the
    // host resolves, to a public address), not the shape rule the address already meets.
    expect(await screen.findByText(strings['ep.addressRefused'])).toBeInTheDocument();
    expect(screen.queryByText(strings['ep.badAddress'])).toBeNull();
    expect(address()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(strings['err.field'])).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    // Sent once: the refusal is definite, and nothing resends it.
    expect(sent).toHaveLength(1);
  });
  it('422 provider_invalid for a model puts the error on Models', async () => {
    const { sent } = show(refused('models[0].model'));
    await screen.findByDisplayValue('https://x.example/v1');
    const models = () => screen.getByRole('textbox', { name: /^Models/ });
    await userEvent.type(models(), '{Enter}m2');
    await userEvent.click(save());
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(await screen.findByText(strings['ep.badModels'])).toBeInTheDocument();
    expect(models()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(strings['err.field'])).toBeNull();
  });
  it('a refusal that names no known field keeps the line under the form', async () => {
    const { sent } = show(refused());
    await screen.findByDisplayValue('https://x.example/v1');
    await userEvent.type(screen.getByRole('textbox', { name: /^Name/ }), ' two');
    await userEvent.click(save());
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(await screen.findByText(strings['err.field'])).toBeInTheDocument();
  });
});
