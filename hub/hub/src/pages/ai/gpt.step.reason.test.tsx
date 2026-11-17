// Vitest: the AI page's ChatGPT sign-in step shows why it stopped. Its end states used the compact EmptyState, which
// draws only the title, so "A sign-in is already in progress" and the refusal text would never show.
import type { providers } from '@core';
import { render, screen } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import type { Api } from './api';
import { AiProvider, type AiCtx } from './parts/ctx';
import { GptStep } from './parts/GptStep';
import strings from './strings.en.json';
import { errorText } from './words';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown = {}): Settled => ({ ok: true, body });
const refused = (code: string, status: number, details: Record<string, unknown> = {}): Settled => ({ ok: false, err: { kind: 'failed', code, status, retryAfter: null, details } });

function setup(start: Settled) {
  const api = { auth: () => Promise.resolve(ok({ auth: { oauth_stored: false } })), oauthStart: () => Promise.resolve(start), oauthCancel: () => Promise.resolve(ok()) } as unknown as Api;
  const env: providers.Env = {
    sleep: () => new Promise<void>(() => undefined),
    now: () => 1_000_000,
    hidden: () => false,
    visible: () => Promise.resolve(),
    newKey: () => 'idem-1',
    digest: () => Promise.resolve(null),
    alive: () => true,
  };
  const ctx = { m: {}, api, env, reload: vi.fn(), connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
  return render(
    <AiProvider value={ctx}>
      <GptStep onSigned={vi.fn()} onBack={vi.fn()} />
    </AiProvider>,
  );
}

describe('AI: the ChatGPT sign-in step says why it stopped', () => {
  it('a refused start shows the reason under the title', async () => {
    const r = refused('bad_request', 400);
    setup(r);
    expect(await screen.findByText(strings['gpt.failedTitle'])).toBeInTheDocument();
    const why = errorText((r as { err: providers.Outcome }).err, { write: true }).text;
    expect(why).not.toBe('');
    expect(screen.getByText(why)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['gpt.again'] })).toBeInTheDocument();
  });

  it('a sign-in already open that the agent does not name is a failed start that says so', async () => {
    setup(refused('oauth_in_progress', 409));
    expect(await screen.findByText(strings['gpt.failedTitle'])).toBeInTheDocument();
    expect(screen.getByText(strings['err.oauthBusy'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['gpt.again'] })).toBeInTheDocument();
  });
});
