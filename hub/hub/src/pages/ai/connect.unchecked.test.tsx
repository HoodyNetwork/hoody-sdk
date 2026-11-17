// The connect drawer's last step says "connected" only for a key that was checked. A key saved without a
// finished check (inconclusive, or a computer that can't check keys) is "key saved", and the body says it was not checked.
import type { providers } from '@core';
import { render, screen, userEvent } from '@app/testing';
import { describe, expect, it } from 'vitest';
import type { Api } from './api';
import { ConnectDrawer } from './parts/Connect';
import { AiProvider, type AiCtx } from './parts/ctx';
import strings from './strings.en.json';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const err = (kind: providers.Outcome['kind'], code = '', status = 0): Settled => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
// The computer the page is on: core holds a key save for it (keySaveHold.ts), and with none named nothing is sent.
const ON = { computer: { id: 'c1', name: 'atlas' }, target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } } };

function drawer(check: string) {
  const none = () => Promise.resolve(err('failed', 'unexpected', 500));
  const keyPut = () => Promise.resolve(ok({ check }));
  const api = new Proxy({ keyPut } as unknown as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : none) });
  const env: providers.Env = {
    sleep: () => Promise.resolve(),
    now: () => 0,
    hidden: () => false,
    visible: () => Promise.resolve(),
    newKey: () => 'idem-1',
    digest: () => Promise.resolve('fp-1'),
    alive: () => true,
  };
  const cat = { byId: { anthropic: { id: 'anthropic', label: 'Anthropic' } } };
  const ctx = { m: { cat, caps: {}, accounts: [], ...ON, bundle: { snap: null, at: 0, err: null }, loads: { catalogue: 'ok' } }, api, env, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
  render(
    <AiProvider value={ctx}>
      <ConnectDrawer target={{ providerId: 'anthropic' }} onClose={() => undefined} />
    </AiProvider>,
  );
}

describe('the connect drawer: a key that was not checked is saved, not connected', () => {
  for (const [check, body] of [
    ['inconclusive', strings['done.inconclusive']],
    ['untested', strings['done.untested']],
  ] as const) {
    it(`${check}: the title says the key is saved and the body says it was not checked`, async () => {
      drawer(check);
      await userEvent.type(await screen.findByLabelText(/Anthropic API key/), 'sk-a{Enter}');
      expect(await screen.findByText('Anthropic key saved')).toBeInTheDocument();
      expect(screen.queryByText('Anthropic is connected')).toBeNull();
      expect(screen.getByText(body)).toBeInTheDocument();
      expect(body).toMatch(/^Not checked: /);
    });
  }

  it('valid: a checked key is connected', async () => {
    drawer('valid');
    await userEvent.type(await screen.findByLabelText(/Anthropic API key/), 'sk-a{Enter}');
    expect(await screen.findByText('Anthropic is connected')).toBeInTheDocument();
  });
});
