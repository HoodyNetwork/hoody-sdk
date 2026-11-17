// Regression: after a field error, fixing the field did not let
// Save go through (the page's error made the field natively invalid, so the browser refused the next submit and nothing
// reached the page). Repro on EndpointEdit: clear Name, Save shows the name error; type a name, Save must
// now send. The kit half is kit/forms/pageError.ts with its own Form.stale.test.tsx.
import type { providers } from '@core';
import { render, screen, userEvent, waitFor } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import type { Api } from './api';
import { AiProvider, type AiCtx } from './parts/ctx';
import { EndpointEdit } from './parts/EndpointStep';
import strings from './strings.en.json';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const err = (kind: providers.Outcome['kind'], code = '', status = 0): Settled => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
/** The computer the page is on: a save is held by core for it (endpointEditHold.ts). */
const M = { computer: { id: 'c1' }, target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } } };
const saved = ok({ provider: { id: 'my-ep', display_name: 'My endpoint', definition_rev: 'rev-3', custom_definition: { base_url: 'https://x.example/v1', wire_format: 'chat_completions' }, models: [{ spec: 'my-ep/m1' }] } });

describe('EndpointEdit: a field error, then the field fixed, then Save sends', () => {
  it('clearing Name shows the name error and sends nothing; typing a name lets the next Save send it', async () => {
    boot();
    const sent: unknown[] = [];
    const none = () => Promise.resolve(err('failed', 'unexpected', 500));
    const over = { provider: () => Promise.resolve(saved), customPatch: (_p: string, b: unknown) => { sent.push(b); return Promise.resolve(ok({})); } } as Partial<Api>;
    const api = new Proxy({ ...over } as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : none) });
    const onSaved = vi.fn();
    render(
      <AiProvider value={{ m: M, api, env: {}, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx}>
        <EndpointEdit providerId="my-ep" onSaved={onSaved} />
      </AiProvider>,
    );
    await screen.findByDisplayValue('https://x.example/v1');
    const name = () => screen.getByRole('textbox', { name: /^Name/ });
    const save = () => screen.getByRole('button', { name: strings['ep.save'] });

    await userEvent.clear(name());
    await userEvent.click(save());
    expect(await screen.findByText(strings['ep.badName'])).toBeInTheDocument();
    expect(name()).toHaveAttribute('aria-invalid', 'true');
    expect(sent).toEqual([]);

    await userEvent.type(name(), 'Renamed');
    await userEvent.click(save());
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(sent).toEqual([{ display_name: 'Renamed' }]);
    expect(screen.queryByText(strings['ep.badName'])).toBeNull();
  });
});
