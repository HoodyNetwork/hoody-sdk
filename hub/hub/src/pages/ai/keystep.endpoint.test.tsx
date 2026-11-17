// Vitest, model picker: the AI page's key step for a custom endpoint (`endpoint`) sends
// the key only with the definition revision it read when it opened. Before, a failed read left the revision empty and
// the key went without one (the agent accepts that, so a changed endpoint would be overwritten). A built-in provider's
// key is unchanged. The connect drawer marks an endpoint's step from the catalogue, a Replace key from the account, and
// a just-created endpoint itself.
import type { providers } from '@core';
import { act, fireEvent, render, screen, userEvent, waitFor, within } from '@app/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAttempts } from '@core/attempts';
import { boot } from '@core/test/env';
import type { Api } from './api';
import type { Account } from './logic';
import { ConnectDrawer, type ConnectTarget } from './parts/Connect';
import { AiProvider, type AiCtx } from './parts/ctx';
import { EndpointEdit } from './parts/EndpointStep';
import { KeyStep } from './parts/KeyStep';
import strings from './strings.en.json';

/** "Stop tracking this save" asks first (dis.stopWarn): click it, then Stop tracking anyway. */
async function retype() {
  await userEvent.click(screen.getByRole('button', { name: strings['key.typeAgain'] }));
  const ask = await screen.findByRole('alertdialog', { name: strings['key.typeAgainTitle'] });
  expect(ask).toHaveTextContent(strings['dis.stopWarn']);
  await userEvent.click(within(ask).getByRole('button', { name: strings['key.typeAgainGo'] }));
}

type Settled = providers.Settled<unknown>;
type Body = { api_key: string; check: true; if_definition_rev?: string };
const ok = (body: unknown): Settled => ({ ok: true, body });
const err = (kind: providers.Outcome['kind'], code = '', status = 0): Settled => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
const def = (rev: string) => ok({ provider: { id: 'my-ep', display_name: 'My endpoint', definition_rev: rev, custom_definition: { base_url: 'https://x.example', wire_format: 'openai' } } });
// The computer the page is on: core holds a key save for it (keySaveHold.ts), and with none named nothing is sent.
const ON = { computer: { id: 'c1', name: 'atlas' }, target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } } };

function setup(over: Partial<Api>, endpoint: boolean, providerId = 'my-ep', providerLabel = 'My endpoint') {
  const none = () => Promise.resolve(err('failed', 'unexpected', 500));
  const api = new Proxy({ ...over } as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : none) });
  const env: providers.Env = {
    sleep: () => Promise.resolve(),
    now: () => 0,
    hidden: () => false,
    visible: () => Promise.resolve(),
    newKey: () => 'idem-1',
    digest: () => Promise.resolve('fp-1'),
    alive: () => true,
  };
  const onSaved = vi.fn();
  const ctx = { m: ON, api, env, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
  const view = render(
    <AiProvider value={ctx}>
      <KeyStep providerId={providerId} providerLabel={providerLabel} endpoint={endpoint} onSaved={onSaved} />
    </AiProvider>,
  );
  return { view, onSaved };
}

const save = () => screen.getByRole('button', { name: strings['key.save'] });
// The kit's words (kit/pickers/ProviderSetup.strings.en.json), as the person reads them.
const WORDS = {
  reading: 'Reading My endpoint…',
  readFailed: "Couldn't read My endpoint's settings.",
  changed: 'My endpoint changed since this step opened. Read it again, then enter the key again.',
  tryAgain: 'Try again',
  readAgain: 'Read again',
};

describe('the AI page key step for a custom endpoint', () => {
  it('a failed read sends nothing: Save is off, the key stays, Try again reads and then the key goes with the revision', async () => {
    const reads = [err('failed', 'unexpected', 500), def('rev-3')];
    const sent: Body[] = [];
    const f = setup({ provider: () => Promise.resolve(reads.shift()!), keyPut: (_p: string, b: Body) => { sent.push({ ...b }); return Promise.resolve(ok({ check: 'valid' })); } } as Partial<Api>, true);
    expect(await screen.findByText(WORDS.readFailed)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/My endpoint API key/), 'sk-ep{Enter}');
    expect(save()).toBeDisabled();
    expect(sent).toEqual([]);
    expect(screen.getByLabelText(/My endpoint API key/)).toHaveValue('sk-ep');
    await userEvent.click(screen.getByRole('button', { name: WORDS.tryAgain }));
    await waitFor(() => expect(save()).toBeEnabled());
    await userEvent.click(save());
    await waitFor(() => expect(f.onSaved).toHaveBeenCalledWith({ how: 'valid' }));
    expect(sent).toEqual([{ api_key: 'sk-ep', check: true, if_definition_rev: 'rev-3' }]);
  });

  it('409 definition_changed: says the endpoint changed and offers Read again', async () => {
    const f = setup({ provider: () => Promise.resolve(def('rev-3')), keyPut: () => Promise.resolve(err('failed', 'definition_changed', 409)) } as Partial<Api>, true);
    await userEvent.type(screen.getByLabelText(/My endpoint API key/), 'sk-ep');
    await waitFor(() => expect(save()).toBeEnabled());
    await userEvent.click(save());
    expect(await screen.findByText(WORDS.changed)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: WORDS.readAgain })).toBeInTheDocument();
    expect(f.onSaved).not.toHaveBeenCalled();
  });

  it("the Form's own submit after a failed read sends nothing and the key stays", async () => {
    const provider = vi.fn(() => Promise.resolve(err('failed', 'unexpected', 500)));
    const keyPut = vi.fn();
    setup({ provider, keyPut } as Partial<Api>, true);
    expect(await screen.findByText(WORDS.readFailed)).toBeInTheDocument();
    const input = screen.getByLabelText(/My endpoint API key/);
    await userEvent.type(input, 'sk-ep');
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(input).toHaveValue('sk-ep');
    expect(provider).toHaveBeenCalledTimes(1);
    expect(keyPut).not.toHaveBeenCalled();
  });

  it('leaving while the revision is read sends nothing', async () => {
    let let_go: (a: Settled) => void = () => undefined;
    const p = new Promise<Settled>((r) => (let_go = r));
    const keyPut = vi.fn();
    const f = setup({ provider: () => p, keyPut } as Partial<Api>, true);
    expect(screen.getByText(WORDS.reading)).toBeInTheDocument();
    f.view.unmount();
    await act(async () => { let_go(def('rev-3')); await p; });
    expect(keyPut).not.toHaveBeenCalled();
  });
});

describe('the AI page key step for a built-in provider is unchanged', () => {
  it('sends without a revision when the provider has no endpoint definition, and shows no endpoint words', async () => {
    const sent: Body[] = [];
    const f = setup({ provider: () => Promise.resolve(ok({ provider: { id: 'anthropic' } })), keyPut: (_p: string, b: Body) => { sent.push({ ...b }); return Promise.resolve(ok({ check: 'valid' })); } } as Partial<Api>, false, 'anthropic', 'Anthropic');
    expect(screen.queryByRole('status')).toBeNull();
    await userEvent.type(screen.getByLabelText(/Anthropic API key/), 'sk-1');
    await userEvent.click(save());
    await waitFor(() => expect(f.onSaved).toHaveBeenCalledWith({ how: 'valid' }));
    expect(sent).toEqual([{ api_key: 'sk-1', check: true }]);
  });
});

describe('the connect drawer marks which key steps are an endpoint', () => {
  const CAT = { byId: { 'my-ep': { id: 'my-ep', label: 'My endpoint', custom: true }, anthropic: { id: 'anthropic', label: 'Anthropic', custom: false } } };
  function drawer(target: ConnectTarget, cat: unknown = CAT, over: Partial<Api> = {}) {
    const reads = vi.fn(() => new Promise<Settled>(() => undefined));
    const none = () => Promise.resolve(err('failed', 'unexpected', 500));
    const api = new Proxy({ provider: reads, ...over } as unknown as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : none) });
    const m = { cat, caps: {}, accounts: [], computer: null, target: null, bundle: { snap: null, at: 0, err: null }, loads: { catalogue: 'ok' } };
    const ctx = { m, api, env: {}, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
    render(
      <AiProvider value={ctx}>
        <ConnectDrawer target={target} onClose={() => undefined} />
      </AiProvider>,
    );
    return reads;
  }
  const account = (id: string, label: string, custom: boolean): Account => ({ id, prefix: `${id}/`, label, ready: false, pay: 'own_key', custom, via: null, status: null });

  it('a custom endpoint from the catalogue reads its revision', async () => {
    const reads = drawer({ providerId: 'my-ep' });
    expect(await screen.findByText(WORDS.reading)).toBeInTheDocument();
    expect(reads).toHaveBeenCalledWith('my-ep');
  });
  it("an endpoint's Replace key reads its revision", async () => {
    drawer({ replace: account('my-ep', 'My endpoint', true) });
    expect(await screen.findByText(WORDS.reading)).toBeInTheDocument();
  });
  it('a built-in provider, new or replaced, reads nothing on open', async () => {
    const reads = drawer({ providerId: 'anthropic' });
    expect(await screen.findByLabelText(/Anthropic API key/)).toBeInTheDocument();
    expect(screen.queryByText(/Reading/)).toBeNull();
    expect(reads).not.toHaveBeenCalled();
  });
});

// A provider the catalogue does not list as built-in (no catalogue after a failed read, or a
// deep link to an id it lacks) takes the endpoint way, so a custom endpoint's key never goes without its revision; and a
// save's late answer after the computer's Api changed is not the step's outcome.
describe('a provider the catalogue does not confirm as built-in takes the endpoint way', () => {
  function drawer(target: ConnectTarget, cat: unknown, provider: () => Promise<Settled>, keyPut = vi.fn()) {
    const none = () => Promise.resolve(err('failed', 'unexpected', 500));
    const api = new Proxy({ provider, keyPut } as unknown as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : none) });
    const ctx = { m: { cat, caps: {}, accounts: [], computer: null, target: null, bundle: { snap: null, at: 0, err: null }, loads: { catalogue: 'ok' } }, api, env: {}, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
    render(
      <AiProvider value={ctx}>
        <ConnectDrawer target={target} onClose={() => undefined} />
      </AiProvider>,
    );
    return keyPut;
  }
  const failedRead = () => Promise.resolve(err('failed', 'unexpected', 500));
  for (const [why, cat] of [['no catalogue', null], ['a catalogue without that id', { byId: { anthropic: { id: 'anthropic', label: 'Anthropic' } } }]] as const) {
    it(`${why}: the revision is read on open; when it fails, Save stays off and nothing is sent`, async () => {
      const keyPut = drawer({ providerId: 'my-ep' }, cat, failedRead);
      expect(await screen.findByText(/settings\.$/)).toBeInTheDocument();
      const input = screen.getByLabelText(/API key/);
      await userEvent.type(input, 'sk-ep{Enter}');
      expect(save()).toBeDisabled();
      expect(input).toHaveValue('sk-ep');
      expect(keyPut).not.toHaveBeenCalled();
    });
  }
  it('Replace key with no catalogue reads the revision too', async () => {
    const reads = vi.fn(() => new Promise<Settled>(() => undefined));
    drawer({ replace: { id: 'my-ep', prefix: 'my-ep/', label: 'My endpoint', ready: false, pay: 'own_key', custom: false, via: null, status: null } as Account }, null, reads);
    expect(await screen.findByText(WORDS.reading)).toBeInTheDocument();
    expect(reads).toHaveBeenCalledWith('my-ep');
  });
});

describe('the AI page key step: a late answer after the Api changed', () => {
  it("is not the step's outcome", async () => {
    let answer: (a: Settled) => void = () => undefined;
    const put = new Promise<Settled>((r) => (answer = r));
    const onSaved = vi.fn();
    const env = { sleep: () => Promise.resolve(), now: () => 0, hidden: () => false, visible: () => Promise.resolve(), newKey: () => 'idem-1', digest: () => Promise.resolve('fp-1'), alive: () => true };
    const none = () => Promise.resolve(err('failed', 'unexpected', 500));
    const mk = (over: Partial<Api>) => new Proxy({ ...over } as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : none) });
    const ctxOf = (api: Api) => ({ m: ON, api, env, reload: () => undefined, connect: () => undefined, goto: () => undefined }) as unknown as AiCtx;
    const view = (api: Api) => (
      <AiProvider value={ctxOf(api)}>
        <KeyStep providerId="my-ep" providerLabel="My endpoint" endpoint onSaved={onSaved} />
      </AiProvider>
    );
    const a1 = mk({ provider: () => Promise.resolve(def('rev-A')), keyPut: () => put } as Partial<Api>);
    const a2 = mk({ provider: () => Promise.resolve(def('rev-B')) } as Partial<Api>);
    const { rerender } = render(view(a1));
    await userEvent.type(screen.getByLabelText(/My endpoint API key/), 'sk-ep');
    await waitFor(() => expect(save()).toBeEnabled());
    await userEvent.click(save());
    rerender(view(a2));
    await act(async () => { answer(ok({ check: 'valid' })); await put; });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(onSaved).not.toHaveBeenCalled();
  });
});

// An id that is only an inherited property of the catalogue object (`constructor`) is
// not a catalogue row, so it takes the endpoint way too.
describe('an inherited name is not a catalogue row', () => {
  it('constructor: the revision is read on open; when it fails, Save stays off, the key stays, nothing is sent', async () => {
    const keyPut = vi.fn();
    const provider = vi.fn(() => Promise.resolve(err('failed', 'unexpected', 500)));
    const api = new Proxy({ provider, keyPut } as unknown as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : () => Promise.resolve(err('failed', 'unexpected', 500))) });
    const cat = { byId: { anthropic: { id: 'anthropic', label: 'Anthropic', custom: false } } };
    const ctx = { m: { cat, caps: {}, accounts: [], computer: null, target: null, bundle: { snap: null, at: 0, err: null }, loads: { catalogue: 'ok' } }, api, env: {}, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
    render(
      <AiProvider value={ctx}>
        <ConnectDrawer target={{ providerId: 'constructor' }} onClose={() => undefined} />
      </AiProvider>,
    );
    expect(await screen.findByText(/settings\.$/)).toBeInTheDocument();
    expect(provider).toHaveBeenCalledWith('constructor');
    const input = screen.getByLabelText(/API key/);
    await userEvent.type(input, 'sk-ep{Enter}');
    expect(save()).toBeDisabled();
    expect(input).toHaveValue('sk-ep');
    expect(keyPut).not.toHaveBeenCalled();
  });
});

// Each send is a save attempt of its own, and the step's check
// after the save answers guards the window between core accepting an answer and the step resuming.
describe('the AI page key step owns each save', () => {
  type Over = Partial<Api>;
  const none = () => Promise.resolve(err('failed', 'unexpected', 500));
  const mk = (over: Over) => new Proxy({ ...over } as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : none) });
  const envOf = () => ({ sleep: () => Promise.resolve(), now: () => 0, hidden: () => false, visible: () => Promise.resolve(), newKey: () => 'idem-1', digest: (k: string) => Promise.resolve(`fp-${k}`), alive: () => true });
  function step(api: Api, onSaved = vi.fn(), endpoint = true, id = 'my-ep', label = 'My endpoint') {
    const env = envOf();
    const view = (a: Api) => (
      <AiProvider value={{ m: ON, api: a, env, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx}>
        <KeyStep providerId={id} providerLabel={label} endpoint={endpoint} onSaved={onSaved} />
      </AiProvider>
    );
    const r = render(view(api));
    return { onSaved, rerender: (a: Api) => r.rerender(view(a)) };
  }
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  function hold() {
    let go: (a: Settled) => void = () => undefined;
    const p = new Promise<Settled>((r) => (go = r));
    return { p, release: (a: Settled) => act(async () => { go(a); await p; }) };
  }

  for (const [why, late] of [
    ['matching the first key', ok({ auth: { api_key_fingerprint: 'fp-one' } })],
    ['matching nothing', ok({ auth: { api_key_fingerprint: 'fp-else' } })],
  ] as const) {
    it(`a Check again of the first key, answering late (${why}), is not the newer save's outcome`, async () => {
      const check = hold();
      const put2 = hold();
      let checking = false;
      const puts: Body[] = [];
      const api = mk({
        provider: () => Promise.resolve(def('rev-3')),
        keyPut: (_p: string, b: Body) => { puts.push({ ...b }); return puts.length === 1 ? Promise.resolve(err('pending', '', 0)) : put2.p; },
        auth: () => (checking ? check.p : Promise.resolve(ok({ auth: {} }))),
      } as Over);
      const { onSaved } = step(api);
      await userEvent.type(screen.getByLabelText(/My endpoint API key/), 'one');
      await waitFor(() => expect(save()).toBeEnabled());
      await userEvent.click(save());
      await screen.findByRole('button', { name: strings['key.typeAgain'] });
      checking = true;
      await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
      await retype();
      await userEvent.type(screen.getByLabelText(/My endpoint API key/), 'two');
      await userEvent.click(save());
      await settle();
      expect(puts, 'both keys were sent').toHaveLength(2);
      await check.release(late);
      await settle();
      expect(onSaved, 'the old check completed nothing').not.toHaveBeenCalled();
      expect(screen.queryByText(strings['key.stillNot'])).toBeNull();
      await put2.release(ok({ check: 'valid' }));
      await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ how: 'valid' }));
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
  }

  it("an Api change after the save answered, before the step resumed, is not the step's outcome", async () => {
    const put = hold();
    const keyPut = vi.fn(() => put.p);
    const a1 = mk({ provider: () => Promise.resolve(def('rev-A')), keyPut } as Over);
    const a2 = mk({ provider: () => Promise.resolve(def('rev-B')) } as Over);
    const s = step(a1);
    await userEvent.type(screen.getByLabelText(/My endpoint API key/), 'sk-ep');
    await waitFor(() => expect(save()).toBeEnabled());
    await userEvent.click(save());
    await waitFor(() => expect(keyPut).toHaveBeenCalledTimes(1));
    // Registered after core's own wait on the same answer, so it runs after core accepted it.
    void put.p.then(() => s.rerender(a2));
    await put.release(ok({ check: 'valid' }));
    await settle();
    expect(s.onSaved).not.toHaveBeenCalled();
  });
});

// "Type the key again" alone ends the earlier save too (see the kit's twin in ProviderSetup.endpoint.test.tsx).
describe('the AI page key step: Type the key again ends the earlier save', () => {
  const none = () => Promise.resolve(err('failed', 'unexpected', 500));
  function pending() {
    let release: (a: Settled) => void = () => undefined;
    const held = new Promise<Settled>((r) => (release = r));
    let wait: () => void = () => undefined;
    let mode: 'save' | 'hold-read' | 'hold-sleep' = 'save';
    const auth = vi.fn(() => (mode === 'hold-read' ? held : Promise.resolve(ok({ auth: {} }))));
    const api = new Proxy({ provider: () => Promise.resolve(def('rev-3')), keyPut: () => Promise.resolve(err('pending', '', 0)), auth } as unknown as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : none) });
    const env = { sleep: () => (mode === 'hold-sleep' ? new Promise<void>((r) => (wait = r)) : Promise.resolve()), now: () => 0, hidden: () => false, visible: () => Promise.resolve(), newKey: () => 'idem-1', digest: (k: string) => Promise.resolve(`fp-${k}`), alive: () => true };
    const onSaved = vi.fn();
    render(
      <AiProvider value={{ m: ON, api, env, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx}>
        <KeyStep providerId="my-ep" providerLabel="My endpoint" endpoint onSaved={onSaved} />
      </AiProvider>,
    );
    return {
      auth,
      onSaved,
      release: (a: Settled) => act(async () => { release(a); await held; }),
      wake: () => act(async () => wait()),
      async toPending(m: 'hold-read' | 'hold-sleep') {
        await userEvent.type(screen.getByLabelText(/My endpoint API key/), 'one');
        await waitFor(() => expect(save()).toBeEnabled());
        await userEvent.click(save());
        await screen.findByRole('button', { name: strings['key.typeAgain'] });
        mode = m;
        await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
        await retype();
      },
    };
  }
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  it('a late read-back matching the first key completes nothing and shows nothing', async () => {
    const f = pending();
    await f.toPending('hold-read');
    await f.release(ok({ auth: { api_key_fingerprint: 'fp-one' } }));
    await settle();
    expect(f.onSaved).not.toHaveBeenCalled();
    expect(screen.queryByText(strings['key.stillNot'])).toBeNull();
    expect(screen.queryByRole('button', { name: strings['key.typeAgain'] })).toBeNull();
  });
  it('a Check again still waiting to read reads nothing once the key is typed again', async () => {
    const f = pending();
    await f.toPending('hold-sleep');
    const reads = f.auth.mock.calls.length;
    await f.wake();
    await settle();
    expect(f.auth).toHaveBeenCalledTimes(reads);
    expect(f.onSaved).not.toHaveBeenCalled();
  });
});

// The edit step compares addresses as the agent stores them (no trailing slash). An address only spelled
// differently has not moved (no "send my saved key" box, no refusal); a really different one needs the box ticked;
// Check again after an unknown save finds the agent's spelling of the address it was given.
describe('the endpoint edit step compares addresses as the agent stores them', () => {
  // The computer the page is on: a save is held by core for it (endpointEditHold.ts).
  const M = { computer: { id: 'c1' }, target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } } };
  beforeEach(() => boot());
  afterEach(() => resetAttempts());
  const none = () => Promise.resolve(err('failed', 'unexpected', 500));
  const saved = (url: string, name = 'My endpoint') => ok({ provider: { id: 'my-ep', display_name: name, definition_rev: 'rev-3', custom_definition: { base_url: url, wire_format: 'chat_completions' }, models: [{ spec: 'my-ep/m1' }] } });
  function edit(over: Partial<Api>) {
    const api = new Proxy({ ...over } as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : none) });
    const onSaved = vi.fn();
    render(
      <AiProvider value={{ m: M, api, env: {}, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx}>
        <EndpointEdit providerId="my-ep" onSaved={onSaved} />
      </AiProvider>,
    );
    return onSaved;
  }
  const field = (label: string) => screen.getByRole('textbox', { name: new RegExp(`^${label}`) });
  const retype = async (label: string, v: string) => { await userEvent.clear(field(label)); await userEvent.type(field(label), v); };
  const sendKey = () => screen.queryByRole('checkbox', { name: strings['ep.sendKey'] });
  const saveEp = () => screen.getByRole('button', { name: strings['ep.save'] });

  it('a stored address with a trailing slash, saved with a new name only, has not moved: no box, no refusal, the name goes', async () => {
    const sent: unknown[] = [];
    const onSaved = edit({ provider: () => Promise.resolve(saved('https://x.example/v1/')), customPatch: (_p: string, b: unknown) => { sent.push(b); return Promise.resolve(ok({})); } } as Partial<Api>);
    await screen.findByDisplayValue('https://x.example/v1/');
    await retype('Name', 'Renamed');
    expect(sendKey(), 'the stored spelling has not moved').toBeNull();
    await userEvent.click(saveEp());
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(strings['ep.addressMoved'])).toBeNull();
    expect(sent).toEqual([{ display_name: 'Renamed' }]);
  });

  it('an address edited to another spelling of the same one (a trailing slash, spaces) shows no box', async () => {
    edit({ provider: () => Promise.resolve(saved('https://x.example/v1')) } as Partial<Api>);
    await screen.findByDisplayValue('https://x.example/v1');
    await retype('Address', ' https://x.example/v1// ');
    expect(sendKey()).toBeNull();
  });

  const different = async (sent: unknown[]) => {
    const onSaved = edit({ provider: () => Promise.resolve(saved('https://x.example/v1/')), customPatch: (_p: string, b: unknown) => { sent.push(b); return Promise.resolve(ok({})); } } as Partial<Api>);
    await screen.findByDisplayValue('https://x.example/v1/');
    await retype('Address', 'https://y.example/v1/');
    return onSaved;
  };
  it('a really different address shows the box, and Save without it ticked refuses and sends nothing', async () => {
    const sent: unknown[] = [];
    const onSaved = await different(sent);
    expect(sendKey()).toBeInTheDocument();
    expect(screen.queryByText(strings['ep.addressMoved']), 'no refusal before Save').toBeNull();
    await userEvent.click(saveEp());
    expect(await screen.findByText(strings['ep.addressMoved'])).toBeInTheDocument();
    expect(sent).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('a really different address with the box ticked sends the new address', async () => {
    const sent: unknown[] = [];
    const onSaved = await different(sent);
    await userEvent.click(sendKey() as HTMLElement);
    await userEvent.click(saveEp());
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(strings['ep.addressMoved'])).toBeNull();
    expect(sent).toEqual([{ base_url: 'https://y.example/v1' }]);
  });

  it('after Save refuses the moved address, ticking the box takes the refusal away and Save sends the new address', async () => {
    const sent: unknown[] = [];
    const onSaved = await different(sent);
    await userEvent.click(saveEp());
    expect(await screen.findByText(strings['ep.addressMoved'])).toBeInTheDocument();
    await userEvent.click(sendKey() as HTMLElement);
    expect(screen.queryByText(strings['ep.addressMoved']), 'the tick answers the refusal').toBeNull();
    expect(field('Address')).not.toHaveAttribute('aria-invalid', 'true');
    await userEvent.click(saveEp());
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(sent).toEqual([{ base_url: 'https://y.example/v1' }]);
  });

  it('unticking the box after a refusal shows it again, and Save still sends nothing', async () => {
    const sent: unknown[] = [];
    const onSaved = await different(sent);
    await userEvent.click(saveEp());
    await screen.findByText(strings['ep.addressMoved']);
    await userEvent.click(sendKey() as HTMLElement);
    await userEvent.click(sendKey() as HTMLElement);
    expect(screen.getByText(strings['ep.addressMoved'])).toBeInTheDocument();
    await userEvent.click(saveEp());
    expect(sent).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
    await retype('Address', 'https://x.example/v1/');
    expect(screen.queryByText(strings['ep.addressMoved']), 'the stored address back has not moved').toBeNull();
  });

  it('Reset forgets a refusal: the stored address shows none, and a Save of a new name goes', async () => {
    const sent: unknown[] = [];
    const onSaved = await different(sent);
    await userEvent.click(saveEp());
    await screen.findByText(strings['ep.addressMoved']);
    await userEvent.click(screen.getByRole('button', { name: strings['ep.reset'] }));
    await screen.findByDisplayValue('https://x.example/v1/');
    expect(screen.queryByText(strings['ep.addressMoved']), 'the address Save refused is gone').toBeNull();
    expect(field('Address')).not.toHaveAttribute('aria-invalid', 'true');
    await retype('Name', 'Renamed');
    await userEvent.click(saveEp());
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(sent).toEqual([{ display_name: 'Renamed' }]);
  });

  it('Reset forgets a malformed address error: a Save of a new name goes', async () => {
    const sent: unknown[] = [];
    const onSaved = await different(sent);
    await retype('Address', 'not a url');
    await userEvent.click(saveEp());
    await screen.findByText(strings['ep.badAddress']);
    await userEvent.click(screen.getByRole('button', { name: strings['ep.reset'] }));
    await screen.findByDisplayValue('https://x.example/v1/');
    expect(screen.queryByText(strings['ep.badAddress'])).toBeNull();
    await retype('Name', 'Renamed');
    await userEvent.click(saveEp());
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(sent).toEqual([{ display_name: 'Renamed' }]);
  });

  it('Reset forgets the send-key tick: the address moved again shows the box unticked, and Save refuses and sends nothing', async () => {
    const sent: unknown[] = [];
    const onSaved = await different(sent);
    await userEvent.click(sendKey() as HTMLElement);
    expect(sendKey()).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: strings['ep.reset'] }));
    await screen.findByDisplayValue('https://x.example/v1/');
    await retype('Address', 'https://y.example/v1/');
    expect(sendKey(), 'a tick given before Reset is no consent for the address moved after it').not.toBeChecked();
    await userEvent.click(saveEp());
    expect(await screen.findByText(strings['ep.addressMoved'])).toBeInTheDocument();
    expect(sent).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('Save refused for a moved address, then Reset: the address is the stored one again and the refusal goes, and does not come back before the next Save', async () => {
    const sent: unknown[] = [];
    await different(sent);
    await userEvent.click(saveEp());
    expect(await screen.findByText(strings['ep.addressMoved'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['ep.reset'] }));
    await screen.findByDisplayValue('https://x.example/v1/');
    expect(sendKey()).toBeNull();
    expect(screen.queryByText(strings['ep.addressMoved'])).toBeNull();
    await retype('Address', 'https://z.example/v1');
    expect(sendKey()).not.toBeNull();
    expect(screen.queryByText(strings['ep.addressMoved'])).toBeNull();
    expect(sent).toEqual([]);
  });

  it('a malformed address keeps its own error when the box is ticked, and nothing is sent', async () => {
    const sent: unknown[] = [];
    const onSaved = await different(sent);
    await userEvent.click(saveEp());
    await screen.findByText(strings['ep.addressMoved']);
    await retype('Address', 'not a url');
    await userEvent.click(saveEp());
    const shown = await screen.findByText(strings['ep.badAddress']);
    await userEvent.click(sendKey() as HTMLElement);
    expect(shown).toBeInTheDocument();
    await userEvent.click(saveEp());
    expect(sent).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
  });

  for (const [why, back, done] of [
    ['the address it was given, as the agent spells it (a trailing slash)', 'https://y.example/v1/', true],
    ['another address', 'https://z.example/v1', false],
  ] as const) {
    it(`Check again after an unknown save, reading ${why}: ${done ? 'saved' : 'still not there'}`, async () => {
      let reads = 0;
      const provider = () => { reads += 1; return Promise.resolve(reads === 1 ? saved('https://x.example/v1') : reads === 2 ? err('failed', 'unexpected', 500) : saved(back)); };
      const onSaved = edit({ provider, customPatch: () => Promise.resolve(err('pending', '', 0)) } as Partial<Api>);
      await screen.findByDisplayValue('https://x.example/v1');
      await retype('Address', 'https://y.example/v1');
      await userEvent.click(sendKey() as HTMLElement);
      await userEvent.click(saveEp());
      // The held save's Check again answers once its request has (until then it stays focusable and does nothing).
      const check = await screen.findByRole('button', { name: 'Check again' });
      await waitFor(() => expect(check).not.toHaveAttribute('aria-disabled', 'true'));
      await userEvent.click(check);
      if (done) await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
      else {
        expect(await screen.findByText(strings['ep.stillNot'])).toBeInTheDocument();
        expect(onSaved).not.toHaveBeenCalled();
      }
      expect(reads).toBe(3);
    });
  }
});
