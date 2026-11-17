// "Edit endpoint": Reset puts the stored values back, and with them ends what the last Save said (a refusal under the form
// no longer describes the fields shown). A Save refused before it was sent says "Nothing was sent", never "failed".
import type { providers } from '@core';
import { render, screen, userEvent, waitFor } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { boot } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Api } from './api';
import { AiProvider, type AiCtx } from './parts/ctx';
import { EndpointEdit } from './parts/EndpointStep';
import strings from './strings.en.json';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const M = { computer: { id: 'c1' }, target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } } };
const stored = ok({ provider: { id: 'my-ep', display_name: 'My endpoint', definition_rev: 'rev-3', custom_definition: { base_url: 'https://x.example/v1', wire_format: 'chat_completions' }, models: [{ spec: 'my-ep/m1' }] } });

function show(answer: Settled) {
  const sent: unknown[] = [];
  const none = () => Promise.resolve({ ok: false, err: { kind: 'failed', code: 'unexpected', status: 500, retryAfter: null, details: {} } } as Settled);
  const over = { provider: () => Promise.resolve(stored), customPatch: (_p: string, b: unknown) => { sent.push(b); return Promise.resolve(answer); } } as Partial<Api>;
  const api = new Proxy({ ...over } as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : none) });
  render(
    <AiProvider value={{ m: M, api, env: {}, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx}>
      <EndpointEdit providerId="my-ep" onSaved={() => undefined} />
    </AiProvider>,
  );
  return { sent };
}
const name = () => screen.getByRole('textbox', { name: /^Name/ });
const save = () => screen.getByRole('button', { name: strings['ep.save'] });
beforeEach(() => boot());
afterEach(() => resetAttempts());

describe('EndpointEdit: Reset and what the last Save said', () => {
  it('Reset ends the refusal line of the last Save', async () => {
    const { sent } = show({ ok: false, err: { kind: 'failed', code: 'provider_invalid', status: 422, retryAfter: null, details: {} } } as Settled);
    await screen.findByDisplayValue('https://x.example/v1');
    await userEvent.type(name(), ' two');
    await userEvent.click(save());
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(await screen.findByText(strings['err.field'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['ep.reset'] }));
    await waitFor(() => expect(name()).toHaveValue('My endpoint'));
    expect(screen.queryByText(strings['err.field'])).toBeNull();
  });

  it('a Save refused before it was sent reads as not sent, not failed', async () => {
    show({ ok: false, err: { kind: 'not_sent', code: 'FRAMED_ACTION_REFUSED', status: 0, retryAfter: null, details: {} } } as Settled);
    await screen.findByDisplayValue('https://x.example/v1');
    await userEvent.type(name(), ' two');
    await userEvent.click(save());
    await waitFor(() => expect(document.querySelector('[data-outcome]')).not.toBeNull());
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    expect(document.querySelector('[data-outcome="not_sent"]')).not.toBeNull();
  });
});
