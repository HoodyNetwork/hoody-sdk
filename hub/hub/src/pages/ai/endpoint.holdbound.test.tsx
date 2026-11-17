// A create hold keeps the form it was made from, and parseHolds read that
// form's model list only up to 20,000 characters while the endpoint check takes up to 500 names of 200 bytes each
// (any amount of blank lines, repeats and spaces dropped first). A valid long list was stored, then dropped by every
// read with no word: after a reload the create's plan (id and key) was gone. The hold now stores the plan's own list
// (one name per line, at most 500 x 201 characters) and parseHolds takes exactly that bound.
import type { providers } from '@core';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptIdleForTests, cryptReady, storedForTests } from '@core/cryptStore';
import { setIdentity } from '@core/ctx';
import { resetPrefs } from '@core/prefs';
import { boot, R1, UID } from '@core/test/env';
import type { Api } from './api';
import { AiProvider, type AiCtx } from './parts/ctx';
import { EndpointCreate, parseHolds } from './parts/EndpointStep';
import strings from './strings.en.json';

const KEY = 'hub_ai_v1';
type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const lost = (): Settled => ({ ok: false, err: { kind: 'pending', code: 'timeout', status: 0, retryAfter: null, details: {} } });
// 500 names of 200 characters, the most the endpoint check takes: one per line, 100,499 characters.
const NAMES = Array.from({ length: 500 }, (_, i) => `m${i}-`.padEnd(200, 'x'));
const LIST = NAMES.join('\n');
const settle = () => act(() => cryptIdleForTests());
beforeEach(async () => {
  boot();
  resetPrefs();
  setIdentity({ id: UID, banned: false });
  await cryptReady();
  await cryptIdleForTests();
});

const held = (models: string) => ({
  plan: { id: 'my-ep', idem: 'idem-1', replay: true, body: { id: 'my-ep', model_prefix: 'my-ep', display_name: 'My endpoint', wire_format: 'chat_completions', base_url: 'https://x.example/v1', models: NAMES.map((model) => ({ model })) } },
  form: { name: 'My endpoint', address: 'https://x.example/v1', models, wire: 'chat_completions' },
});

describe('a create hold with a long model list', () => {
  it('parseHolds keeps a hold whose list is the longest valid one, and drops one longer', () => {
    expect(Object.keys(parseHolds({ c1: held(LIST) }))).toEqual(['c1']);
    expect(Object.keys(parseHolds({ c1: held(LIST + 'y') }))).toEqual([]);
  });

  // A read that takes only 16 computers' holds, while the store holds many more small ones.
  it('parseHolds keeps every computer\'s hold the store can hold (a seventeenth one too)', () => {
    const small = { ...held('m'), plan: { ...held('m').plan, body: { ...held('m').plan.body, models: [{ model: 'm' }] } } };
    const all = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`c${i}`, small]));
    expect(JSON.stringify(all).length, 'the whole value fits the store').toBeLessThan(48_000);
    expect(Object.keys(parseHolds(all))).toHaveLength(100);
  });

  it('a lost create of a long valid list that fits the store is held with the plan list and still held after the step opens again', async () => {
    const customCreate = vi.fn((_body: { id: string }, _idem: string) => Promise.resolve(lost()));
    const provider = vi.fn((_id: string) => Promise.resolve(lost()));
    const none = () => Promise.resolve(lost());
    const over = { providers: () => Promise.resolve(ok({ providers: [] })), customCreate, provider } as Partial<Api>;
    const api = new Proxy(over as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : none) });
    let keys = 0;
    const env = { sleep: () => Promise.resolve(), now: () => 0, hidden: () => false, visible: () => Promise.resolve(), newKey: () => `idem-${++keys}`, digest: () => Promise.resolve('fp-1'), alive: () => true };
    const ctx = { m: { computer: { id: 'c1', name: 'atlas' }, realm: R1 }, api, env, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
    const step = () => (
      <AiProvider value={ctx}>
        <EndpointCreate onCreated={() => undefined} />
      </AiProvider>
    );
    const view = render(step());
    // 100 names of 200 characters: one per line that is 20,099 characters, over the old 20,000 bound, and the whole
    // stored value still fits the store (core's VALUE_MAX, 48,000 bytes). What a person may paste: every name twice,
    // with blank lines and spaces around.
    const names = NAMES.slice(0, 100);
    const raw = [...names, ...names].map((n) => `  ${n}  \n`).join('\n');
    // A name and an address with spaces around (trimmed before the check) are held as the plan has them.
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: `${' '.repeat(201)}My endpoint ` } });
    fireEvent.change(screen.getByLabelText(/^Address/), { target: { value: `${' '.repeat(600)}https://x.example/v1/ ` } });
    fireEvent.change(screen.getByLabelText(/^Models/), { target: { value: raw } });
    await userEvent.click(screen.getByRole('button', { name: strings['ep.add'] }));
    expect(await screen.findByText(strings['ep.notConfirmed'])).toBeInTheDocument();
    expect(customCreate).toHaveBeenCalledTimes(2);
    await settle();
    const stored = parseHolds(await storedForTests(KEY, R1));
    expect(Object.keys(stored), 'the hold is kept').toEqual(['c1']);
    expect(stored.c1?.form.models, 'the plan list, one name per line').toBe(names.join('\n'));
    expect([stored.c1?.form.name, stored.c1?.form.address]).toEqual(['My endpoint', 'https://x.example/v1']);
    const [sentBody, sentIdem] = customCreate.mock.calls[0] ?? [];
    expect([stored.c1?.plan.id, stored.c1?.plan.idem], 'the held plan is the one sent').toEqual([sentBody?.id, sentIdem]);
    view.unmount();
    render(step());
    await waitFor(() => expect(screen.getByText(strings['ep.notConfirmed'])).toBeInTheDocument());
    expect(screen.getByLabelText(/^Models/), 'the form shows the held list').toHaveValue(names.join('\n'));
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(provider, 'Check again reads the held plan, by its id').toHaveBeenCalledWith(sentBody?.id));
    expect(customCreate, 'nothing sent again').toHaveBeenCalledTimes(2);
  });
});
