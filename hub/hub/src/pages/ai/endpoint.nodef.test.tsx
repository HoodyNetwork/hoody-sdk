// Vitest: a provider read with no custom_definition is no "needs a newer agent" note
// any more. EndpointEdit says it could not load the endpoint, with Retry, as for any failed read; Retry reads again.
import type { providers } from '@core';
import { render, screen, userEvent } from '@app/testing';
import { describe, expect, it } from 'vitest';
import type { Api } from './api';
import { AiProvider, type AiCtx } from './parts/ctx';
import { EndpointEdit } from './parts/EndpointStep';
import strings from './strings.en.json';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const bare = ok({ provider: { id: 'my-ep', display_name: 'My endpoint', definition_rev: 'rev-3', models: [{ spec: 'my-ep/m1' }] } });
const full = ok({ provider: { id: 'my-ep', display_name: 'My endpoint', definition_rev: 'rev-3', custom_definition: { base_url: 'https://x.example/v1', wire_format: 'chat_completions' }, models: [{ spec: 'my-ep/m1' }] } });

describe('EndpointEdit: a read without custom_definition', () => {
  it('shows the load error with Retry (no newer-agent note), and Retry reads again', async () => {
    const answers = [bare, full];
    let reads = 0;
    const api = { provider: () => Promise.resolve(answers[Math.min(reads++, answers.length - 1)] as Settled) } as unknown as Api;
    render(
      <AiProvider value={{ m: {}, api, env: {}, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx}>
        <EndpointEdit providerId="my-ep" onSaved={() => undefined} />
      </AiProvider>,
    );
    expect(await screen.findByText(strings['ep.loadFailed'])).toBeInTheDocument();
    expect(screen.queryByText(/newer agent/i)).toBeNull();
    expect(strings).not.toHaveProperty('ep.editOld');
    await userEvent.click(screen.getByRole('button', { name: /retry|try again/i }));
    expect(await screen.findByDisplayValue('https://x.example/v1')).toBeInTheDocument();
    expect(reads).toBe(2);
  });
});
