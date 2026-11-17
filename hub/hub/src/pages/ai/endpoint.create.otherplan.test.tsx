// A create's proof ends its own hold, never another create's held under the same computer. One step's create of H1 is
// lost and held; another step (another tab) lets H1 go and holds its own create H2; then the first step's Check again
// finds H1 created. H2 must stay held: nothing is known about it.
import type { providers } from '@core';
import { render, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { cryptIdleForTests, cryptReady, storedForTests } from '@core/cryptStore';
import { setIdentity } from '@core/ctx';
import { resetPrefs } from '@core/prefs';
import { boot, R1, UID } from '@core/test/env';
import type { Api } from './api';
import { AiProvider, type AiCtx } from './parts/ctx';
import { EndpointCreate, parseHolds } from './parts/EndpointStep';
import strings from './strings.en.json';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const lost = (): Settled => ({ ok: false, err: { kind: 'pending', code: 'timeout', status: 0, retryAfter: null, details: {} } });
const H1 = {
  id: 'my-endpoint',
  prefix: 'my-endpoint/',
  display_name: 'My Endpoint',
  definition_rev: 'rev-1',
  custom_definition: { wire_format: 'chat_completions', auth_scheme: 'bearer', base_url: 'https://api.example.com/v1', header_names: [] },
  models: [{ spec: 'my-endpoint/m1' }],
};

beforeEach(async () => {
  boot();
  resetPrefs();
  setIdentity({ id: UID, banned: false });
  await cryptReady();
  await cryptIdleForTests();
});

describe('a create proved by an old step ends only its own hold', () => {
  it('the first step proves H1 created after another step let it go and held H2: H2 stays held', async () => {
    let h1Created = false;
    let keys = 0;
    const none = () => Promise.resolve(lost());
    const over = {
      providers: () => Promise.resolve(ok({ providers: [] })),
      customCreate: () => Promise.resolve(lost()),
      provider: (id: string) => Promise.resolve(h1Created && id === H1.id ? ok({ provider: H1 }) : lost()),
    } as Partial<Api>;
    const api = new Proxy(over as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : none) });
    const env = { sleep: () => Promise.resolve(), now: () => 0, hidden: () => false, visible: () => Promise.resolve(), newKey: () => `idem-${++keys}`, digest: () => Promise.resolve('fp-1'), alive: () => true };
    const ctx = { m: { computer: { id: 'c1', name: 'atlas' }, realm: R1 }, api, env, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
    const step = () => (
      <AiProvider value={ctx}>
        <EndpointCreate onCreated={() => undefined} />
      </AiProvider>
    );
    const stored = async () => parseHolds(await storedForTests('hub_ai_v1', R1));

    // Step 1: the create of H1, its answer lost: held.
    const one = within(render(step()).container);
    await userEvent.type(one.getByLabelText(new RegExp(`^${strings['ep.name']}`)), 'My Endpoint');
    await userEvent.type(one.getByLabelText(new RegExp(`^${strings['ep.address']}`)), 'https://api.example.com/v1');
    await userEvent.type(one.getByLabelText(new RegExp(`^${strings['ep.models']}`)), 'm1');
    await userEvent.click(one.getByRole('button', { name: strings['ep.add'] }));
    expect(await one.findByText(strings['ep.notConfirmed'])).toBeInTheDocument();
    expect((await stored()).c1?.plan.id).toBe('my-endpoint');

    // Step 2 (another tab): opens on H1, lets it go by the person's own press, then holds its own create H2.
    const two = within(render(step()).container);
    await waitFor(() => expect(two.getByText(strings['ep.notConfirmed'])).toBeInTheDocument());
    await userEvent.click(two.getByRole('button', { name: strings['ep.allowAgainShort'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['ep.allowAgainConfirm'] }));
    await waitFor(() => expect(two.queryByText(strings['ep.notConfirmed'])).toBeNull());
    const name = two.getByLabelText(new RegExp(`^${strings['ep.name']}`));
    await userEvent.clear(name);
    await userEvent.type(name, 'Second');
    await userEvent.click(two.getByRole('button', { name: strings['ep.add'] }));
    expect(await two.findByText(strings['ep.notConfirmed'])).toBeInTheDocument();
    expect((await stored()).c1?.plan.id, 'H2 held').toBe('second');

    // Step 1's Check again: H1 is there now. Its proof ends H1 only.
    h1Created = true;
    await userEvent.click(one.getByRole('button', { name: /Check again/ }));
    await cryptIdleForTests();
    expect((await stored()).c1?.plan.id, 'H2 still held').toBe('second');
  });
});
