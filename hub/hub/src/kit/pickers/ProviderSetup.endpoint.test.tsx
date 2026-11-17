// Model picker, the endpoint revision rule, in the kit's key step. For a custom endpoint
// (`endpoint`) the step reads the endpoint's definition revision when it opens: until it has one, the field is usable but
// Save is off ("Reading …"); a failed read, or one without a revision, says so with Try again and sends nothing (the
// typed key stays). The key goes only with that revision (`if_definition_rev`), and only while the step's attempt and
// the context it opened in both hold. A changed endpoint (409 definition_changed) asks to read it again. A built-in
// provider is unchanged: no read, no revision.
import type { providers } from '@core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bump, resetCore, setTarget } from '../../core/ctx';
import { ProviderSetup } from './ProviderSetup';
import strings from './ProviderSetup.strings.en.json';

type Settled = providers.Settled<unknown>;
type Body = { api_key: string; check: true; if_definition_rev?: string };
const ok = (body: unknown): Settled => ({ ok: true, body });
const err = (kind: providers.Outcome['kind'], code = '', status = 0): Settled => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
const def = (rev: unknown = 'rev-7') => ok({ provider: { id: 'my-ep', display_name: 'My endpoint', definition_rev: rev, custom_definition: { base_url: 'https://x.example' } } });
const noRev = () => ok({ provider: { id: 'my-ep', display_name: 'My endpoint', custom_definition: { base_url: 'https://x.example' } } });

afterEach(() => resetCore());

function fakeApi(over: Partial<providers.ProvidersApi>): providers.ProvidersApi {
  const none = () => Promise.resolve(err('failed', 'unexpected', 500));
  return new Proxy({ ...over } as providers.ProvidersApi, { get: (t, k) => (k in t ? t[k as keyof providers.ProvidersApi] : none) });
}
const env = (alive = () => true): providers.Env => ({
  sleep: () => Promise.resolve(),
  now: () => 0,
  hidden: () => false,
  visible: () => Promise.resolve(),
  newKey: () => 'k-1',
  digest: () => Promise.resolve('fp-1'),
  alive,
});

/** The computer the api sends to: each key save is held on its credential there. */
const AT = { project: 'p1', computer: 'c1' };

/** An answer held until the test lets it go. */
function held() {
  let go: (a: Settled) => void = () => undefined;
  const p = new Promise<Settled>((r) => (go = r));
  return { answer: () => p, release: (a: Settled) => act(async () => { go(a); await p; }) };
}

/** Lets every pending promise run (a send that was going to happen has happened). */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const field = () => screen.getByLabelText(/My endpoint API key/);
const save = () => screen.getByRole('button', { name: strings['key.save'] });
const words = (k: keyof typeof strings) => strings[k].replace('{{endpoint}}', 'My endpoint');

function open(api: providers.ProvidersApi, e = env(), onConnected = vi.fn()) {
  const r = render(<ProviderSetup api={api} env={e} providerId="my-ep" providerLabel="My endpoint" endpoint at={AT} onConnected={onConnected} />);
  return { ...r, onConnected };
}

describe('ProviderSetup: an endpoint key goes only with the revision the step read', () => {
  it('reading: the field is usable, Save is off; once read, the key goes with if_definition_rev', async () => {
    const read = held();
    const sent: Body[] = [];
    const api = fakeApi({ provider: read.answer, keyPut: (_p, b) => { sent.push({ ...b }); return Promise.resolve(ok({ check: 'valid' })); } });
    const { onConnected } = open(api);
    expect(screen.getByText(words('ep.reading'))).toBeInTheDocument();
    await userEvent.type(field(), 'sk-ep-1');
    expect(save()).toBeDisabled();
    await read.release(def('rev-7'));
    expect(screen.queryByText(words('ep.reading'))).not.toBeInTheDocument();
    await userEvent.click(save());
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith({ how: 'valid' }));
    expect(sent).toEqual([{ api_key: 'sk-ep-1', check: true, if_definition_rev: 'rev-7' }]);
  });

  it('Enter while reading sends nothing either', async () => {
    const read = held();
    const keyPut = vi.fn();
    open(fakeApi({ provider: read.answer, keyPut }));
    await userEvent.type(field(), 'sk-ep-1{Enter}');
    expect(keyPut).not.toHaveBeenCalled();
    expect(field()).toHaveValue('sk-ep-1');
  });

  for (const [name, answer] of [
    ['a failed read', err('failed', 'unexpected', 500)],
    ['an answer without a revision', noRev()],
    ['an answer with an empty revision', def('')],
  ] as const) {
    it(`${name}: says so, Save stays off, nothing is sent, the key stays; Try again reads again`, async () => {
      const answers: Settled[] = [answer, def('rev-8')];
      const sent: Body[] = [];
      const api = fakeApi({ provider: () => Promise.resolve(answers.shift()!), keyPut: (_p, b) => { sent.push({ ...b }); return Promise.resolve(ok({ check: 'valid' })); } });
      const { onConnected } = open(api);
      expect(await screen.findByText(words('ep.readFailed'))).toBeInTheDocument();
      await userEvent.type(field(), 'sk-ep-1{Enter}');
      expect(save()).toBeDisabled();
      expect(sent).toEqual([]);
      expect(field()).toHaveValue('sk-ep-1');
      await userEvent.click(screen.getByRole('button', { name: strings['ep.tryAgain'] }));
      await waitFor(() => expect(save()).toBeEnabled());
      expect(field(), 'the typed key is still there').toHaveValue('sk-ep-1');
      await userEvent.click(save());
      await waitFor(() => expect(onConnected).toHaveBeenCalled());
      expect(sent).toEqual([{ api_key: 'sk-ep-1', check: true, if_definition_rev: 'rev-8' }]);
    });
  }

  it('Back while reading: the late answer does nothing and nothing is ever sent', async () => {
    const read = held();
    const keyPut = vi.fn();
    const { unmount } = open(fakeApi({ provider: read.answer, keyPut }));
    await userEvent.type(field(), 'sk-ep-1');
    unmount();
    await read.release(def('rev-7'));
    expect(keyPut).not.toHaveBeenCalled();
  });

  it("the page's context changed after the step opened (env no longer alive): Save sends nothing", async () => {
    let alive = true;
    const keyPut = vi.fn(() => Promise.resolve(ok({ check: 'valid' })));
    const { onConnected } = open(fakeApi({ provider: () => Promise.resolve(def()), keyPut }), env(() => alive));
    await userEvent.type(field(), 'sk-ep-1');
    await waitFor(() => expect(save()).toBeEnabled());
    alive = false;
    await userEvent.click(save());
    // The send has ended once the step is no longer busy.
    await waitFor(() => expect(field()).toBeEnabled());
    expect(keyPut).not.toHaveBeenCalled();
    expect(onConnected).not.toHaveBeenCalled();
  });

  it('the Hub context moved on (account, realm or computer switch) while the key is hashed: nothing is sent', async () => {
    // A switch before Save also wipes the typed key (the kit's secret fields): this is the switch the field can't see.
    let hashed: () => void = () => undefined;
    const e = { ...env(), digest: () => new Promise<string>((r) => (hashed = () => r('fp-1'))) };
    const keyPut = vi.fn(() => Promise.resolve(ok({ check: 'valid' })));
    open(fakeApi({ provider: () => Promise.resolve(def()), keyPut }), e);
    await userEvent.type(field(), 'sk-ep-1');
    await waitFor(() => expect(save()).toBeEnabled());
    await userEvent.click(save());
    act(() => void bump('switch'));
    await act(async () => hashed());
    // The send has ended once the step is no longer busy.
    await waitFor(() => expect(field()).toBeEnabled());
    expect(keyPut).not.toHaveBeenCalled();
  });

  it('another computer\'s Api while the revision is read: the first read\'s late answer is dropped; the key goes with the new read\'s revision', async () => {
    const first = held();
    const sent: Body[] = [];
    const keyPut = (_p: string, b: Body) => { sent.push({ ...b }); return Promise.resolve(ok({ check: 'valid' })); };
    const onConnected = vi.fn();
    const a1 = fakeApi({ provider: first.answer, keyPut });
    const a2 = fakeApi({ provider: () => Promise.resolve(def('rev-B')), keyPut });
    const { rerender } = render(<ProviderSetup api={a1} env={env()} providerId="my-ep" providerLabel="My endpoint" endpoint at={AT} onConnected={onConnected} />);
    rerender(<ProviderSetup api={a2} env={env()} providerId="my-ep" providerLabel="My endpoint" endpoint at={AT} onConnected={onConnected} />);
    await userEvent.type(field(), 'sk-ep-1');
    await waitFor(() => expect(save()).toBeEnabled());
    await first.release(def('rev-A'));
    await userEvent.click(save());
    await waitFor(() => expect(onConnected).toHaveBeenCalled());
    expect(sent.map((b) => b.if_definition_rev)).toEqual(['rev-B']);
  });

  it('another computer\'s Api while the key is being hashed: nothing is sent', async () => {
    let hashed: () => void = () => undefined;
    const e = { ...env(), digest: () => new Promise<string>((r) => (hashed = () => r('fp-1'))) };
    const keyPut = vi.fn();
    const p = { env: e, providerId: 'my-ep', providerLabel: 'My endpoint', endpoint: true, at: AT, onConnected: vi.fn() };
    const { rerender } = render(<ProviderSetup api={fakeApi({ provider: () => Promise.resolve(def('rev-A')), keyPut })} {...p} />);
    await userEvent.type(field(), 'sk-ep-1');
    await waitFor(() => expect(save()).toBeEnabled());
    await userEvent.click(save());
    rerender(<ProviderSetup api={fakeApi({ provider: () => Promise.resolve(def('rev-B')), keyPut })} {...p} />);
    await act(async () => hashed());
    await settle();
    expect(keyPut).not.toHaveBeenCalled();
  });

  it('409 definition_changed: says the endpoint changed, Save is off until Read again gives a new revision', async () => {
    const revs = ['rev-7', 'rev-9'];
    const sent: Body[] = [];
    const puts: Settled[] = [err('failed', 'definition_changed', 409), ok({ check: 'valid' })];
    const api = fakeApi({ provider: () => Promise.resolve(def(revs.shift())), keyPut: (_p, b) => { sent.push({ ...b }); return Promise.resolve(puts.shift()!); } });
    const { onConnected } = open(api);
    await userEvent.type(field(), 'sk-ep-1');
    await waitFor(() => expect(save()).toBeEnabled());
    await userEvent.click(save());
    expect(await screen.findByText(words('ep.changed'))).toBeInTheDocument();
    expect(field(), 'the key was cleared on send').toHaveValue('');
    await userEvent.type(field(), 'sk-ep-2');
    expect(save()).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: strings['ep.readAgain'] }));
    await waitFor(() => expect(save()).toBeEnabled());
    await userEvent.click(save());
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith({ how: 'valid' }));
    expect(sent.map((b) => b.if_definition_rev)).toEqual(['rev-7', 'rev-9']);
  });
});

describe('ProviderSetup: a built-in provider is unchanged', () => {
  it('no read, no revision', async () => {
    const provider = vi.fn();
    const sent: Body[] = [];
    const api = fakeApi({ provider, keyPut: (_p, b) => { sent.push({ ...b }); return Promise.resolve(ok({ check: 'valid' })); } });
    const onConnected = vi.fn();
    render(<ProviderSetup api={api} env={env()} providerId="anthropic" providerLabel="Anthropic" at={AT} onConnected={onConnected} />);
    await userEvent.type(screen.getByLabelText(/Anthropic API key/), 'sk-1');
    await userEvent.click(save());
    await waitFor(() => expect(onConnected).toHaveBeenCalled());
    expect(provider).not.toHaveBeenCalled();
    expect(sent).toEqual([{ api_key: 'sk-1', check: true }]);
  });
});

// A computer change moves no generation, so the step watches the computer itself; an answer
// for an attempt the step moved on from is never shown; and the Form's own submit (not only the Save button) sends
// nothing without a revision.
describe('ProviderSetup endpoint: the attempt owns its answer, and the computer is part of the scope', () => {
  const A = { project: { id: 'p1' }, container: { id: 'c1' } };
  const B = { project: { id: 'p1' }, container: { id: 'c2' } };

  it('another computer chosen while the key is hashed sends nothing, even when the person switches straight back', async () => {
    act(() => setTarget(A));
    let hashed: () => void = () => undefined;
    const e = { ...env(), digest: () => new Promise<string>((r) => (hashed = () => r('fp-1'))) };
    const keyPut = vi.fn(() => Promise.resolve(ok({ check: 'valid' })));
    const { onConnected } = open(fakeApi({ provider: () => Promise.resolve(def()), keyPut }), e);
    await userEvent.type(field(), 'sk-ep-1');
    await waitFor(() => expect(save()).toBeEnabled());
    await userEvent.click(save());
    act(() => setTarget(B));
    act(() => setTarget(A));
    await act(async () => hashed());
    await settle();
    expect(keyPut).not.toHaveBeenCalled();
    expect(onConnected).not.toHaveBeenCalled();
  });

  async function lateAnswer(answer: Settled) {
    const put = held();
    const sent: Body[] = [];
    const keyPutA = vi.fn((_p: string, b: Body) => { sent.push({ ...b }); return put.answer(); });
    const keyPutB = vi.fn(() => Promise.resolve(ok({ check: 'valid' })));
    const onConnected = vi.fn();
    const p = { env: env(), providerId: 'my-ep', providerLabel: 'My endpoint', endpoint: true, at: AT, onConnected };
    const { rerender } = render(<ProviderSetup api={fakeApi({ provider: () => Promise.resolve(def('rev-A')), keyPut: keyPutA })} {...p} />);
    await userEvent.type(field(), 'sk-ep-1');
    await waitFor(() => expect(save()).toBeEnabled());
    await userEvent.click(save());
    await waitFor(() => expect(sent).toHaveLength(1));
    rerender(<ProviderSetup api={fakeApi({ provider: () => Promise.resolve(def('rev-B')), keyPut: keyPutB })} {...p} />);
    await put.release(answer);
    await settle();
    return { onConnected, keyPutB };
  }

  it("a late success of the previous computer's save is not this step's outcome", async () => {
    const { onConnected, keyPutB } = await lateAnswer(ok({ check: 'valid' }));
    expect(onConnected).not.toHaveBeenCalled();
    // The step is usable for the new computer, with its own revision.
    await waitFor(() => expect(field()).toBeEnabled());
    await userEvent.type(field(), 'sk-ep-2');
    await waitFor(() => expect(save()).toBeEnabled());
    await userEvent.click(save());
    await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
    expect(keyPutB).toHaveBeenCalledWith('my-ep', expect.objectContaining({ if_definition_rev: 'rev-B' }));
  });

  it("a late 409 of the previous computer's save does not mark the new revision changed", async () => {
    const { onConnected } = await lateAnswer(err('failed', 'definition_changed', 409));
    expect(screen.queryByText(words('ep.changed'))).toBeNull();
    expect(onConnected).not.toHaveBeenCalled();
    await waitFor(() => expect(field()).toBeEnabled());
    await userEvent.type(field(), 'sk-ep-2');
    await waitFor(() => expect(save()).toBeEnabled());
  });

  it("the Form's own submit while reading or after a failed read sends nothing and the key stays", async () => {
    const read = held();
    const provider = vi.fn(read.answer);
    const keyPut = vi.fn();
    open(fakeApi({ provider, keyPut }));
    await userEvent.type(field(), 'sk-ep-1');
    fireEvent.submit(field().closest('form') as HTMLFormElement);
    await settle();
    expect(field()).toHaveValue('sk-ep-1');
    await read.release(err('failed', 'unexpected', 500));
    expect(await screen.findByText(words('ep.readFailed'))).toBeInTheDocument();
    fireEvent.submit(field().closest('form') as HTMLFormElement);
    await settle();
    expect(field()).toHaveValue('sk-ep-1');
    expect(provider).toHaveBeenCalledTimes(1);
    expect(keyPut).not.toHaveBeenCalled();
  });
});

// Every send is a save attempt of its own. "Type the key again" and the next send
// end the earlier one, so a Check again still running for the first key cannot complete, fail or clear the newer save,
// whether its read-back matches the first key or not.
describe('ProviderSetup: a Check again of an earlier save is not the newer save\'s outcome', () => {
  const lost = () => Promise.resolve(err('pending', '', 0));
  const fpOf = (k: string) => `fp-${k}`;
  function race(endpoint: boolean) {
    const check = held();
    const put2 = held();
    let checking = false;
    const puts: Body[] = [];
    const api = fakeApi({
      provider: () => Promise.resolve(def('rev-7')),
      keyPut: (_p, b) => {
        puts.push({ ...b });
        return puts.length === 1 ? lost() : put2.answer();
      },
      auth: () => (checking ? check.answer() : Promise.resolve(ok({ auth: {} }))),
    });
    const e = { ...env(), digest: (k: string) => Promise.resolve(fpOf(k)) };
    const onConnected = vi.fn();
    const label = endpoint ? 'My endpoint' : 'Anthropic';
    render(<ProviderSetup api={api} env={e} providerId={endpoint ? 'my-ep' : 'anthropic'} providerLabel={label} endpoint={endpoint} at={AT} onConnected={onConnected} />);
    const input = () => screen.getByLabelText(new RegExp(`${label} API key`));
    return {
      puts,
      onConnected,
      async run(late: Settled) {
        await userEvent.type(input(), 'one');
        await waitFor(() => expect(save()).toBeEnabled());
        await userEvent.click(save());
        expect(await screen.findByText(strings['key.notConfirmed'])).toBeInTheDocument();
        checking = true;
        await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
        await userEvent.click(screen.getByRole('button', { name: strings['key.typeAgain'] }));
        await userEvent.click(await screen.findByRole('button', { name: strings['key.typeAgainGo'] }));
        await userEvent.type(input(), 'two');
        await userEvent.click(save());
        await settle();
        expect(puts, 'both keys were sent').toHaveLength(2);
        await check.release(late);
        await settle();
        expect(onConnected, 'the old check completed nothing').not.toHaveBeenCalled();
        expect(screen.queryByText(strings['key.stillNot'])).toBeNull();
        await put2.release(ok({ check: 'valid' }));
        await waitFor(() => expect(onConnected).toHaveBeenCalledWith({ how: 'valid' }));
        expect(onConnected).toHaveBeenCalledTimes(1);
      },
    };
  }
  const match = ok({ auth: { api_key_fingerprint: fpOf('one') } });
  const other = ok({ auth: { api_key_fingerprint: 'fp-else' } });
  it('endpoint: a late read-back matching the first key', async () => {
    await race(true).run(match);
  });
  it('endpoint: a late read-back matching nothing', async () => {
    await race(true).run(other);
  });
  it('built-in: a late read-back matching the first key', async () => {
    await race(false).run(match);
  });
});

// The step's own check after the save answers guards a window core's cannot see.
// The PUT answers while the step still holds (core accepts it), and the computer changes before the step resumes.
describe('ProviderSetup endpoint: a computer switch after the save answered, before the step resumed', () => {
  it("is not this step's outcome", async () => {
    act(() => setTarget({ project: { id: 'p1' }, container: { id: 'c1' } }));
    const put = held();
    const keyPut = vi.fn(() => put.answer());
    const { onConnected } = open(fakeApi({ provider: () => Promise.resolve(def()), keyPut }));
    await userEvent.type(field(), 'sk-ep-1');
    await waitFor(() => expect(save()).toBeEnabled());
    await userEvent.click(save());
    await waitFor(() => expect(keyPut).toHaveBeenCalledTimes(1));
    // Registered after core's own wait on the same answer, and one turn later (the save's hold watches the PUT's answer
    // on its way to core), so it runs after core accepted it.
    void put.answer().then(() => undefined).then(() => setTarget({ project: { id: 'p1' }, container: { id: 'c2' } }));
    await put.release(ok({ check: 'valid' }));
    await settle();
    expect(onConnected).not.toHaveBeenCalled();
  });
});

// "Type the key again" alone ends the earlier save too: a Check again still running for it neither completes
// the step nor brings an outcome back, and one still waiting to read reads nothing.
describe('ProviderSetup: Type the key again ends the earlier save', () => {
  function pending(endpoint: boolean) {
    const check = held();
    let wait: () => void = () => undefined;
    let mode: 'save' | 'hold-read' | 'hold-sleep' = 'save';
    const auth = vi.fn(() => (mode === 'hold-read' ? check.answer() : Promise.resolve(ok({ auth: {} }))));
    const api = fakeApi({ provider: () => Promise.resolve(def('rev-7')), keyPut: () => Promise.resolve(err('pending', '', 0)), auth });
    const e = { ...env(), digest: (k: string) => Promise.resolve(`fp-${k}`), sleep: () => (mode === 'hold-sleep' ? new Promise<void>((r) => (wait = r)) : Promise.resolve()) };
    const onConnected = vi.fn();
    const label = endpoint ? 'My endpoint' : 'Anthropic';
    render(<ProviderSetup api={api} env={e} providerId={endpoint ? 'my-ep' : 'anthropic'} providerLabel={label} endpoint={endpoint} at={AT} onConnected={onConnected} />);
    return {
      auth,
      onConnected,
      check,
      wake: () => act(async () => wait()),
      async toPending(m: 'hold-read' | 'hold-sleep') {
        await userEvent.type(screen.getByLabelText(new RegExp(`${label} API key`)), 'one');
        await waitFor(() => expect(save()).toBeEnabled());
        await userEvent.click(save());
        expect(await screen.findByText(strings['key.notConfirmed'])).toBeInTheDocument();
        mode = m;
        await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
        await userEvent.click(screen.getByRole('button', { name: strings['key.typeAgain'] }));
        await userEvent.click(await screen.findByRole('button', { name: strings['key.typeAgainGo'] }));
      },
    };
  }
  for (const endpoint of [true, false]) {
    it(`${endpoint ? 'endpoint' : 'built-in'}: a late read-back matching the first key completes nothing and shows nothing`, async () => {
      const f = pending(endpoint);
      await f.toPending('hold-read');
      await f.check.release(ok({ auth: { api_key_fingerprint: 'fp-one' } }));
      await settle();
      expect(f.onConnected).not.toHaveBeenCalled();
      expect(screen.queryByText(strings['key.stillNot'])).toBeNull();
      expect(screen.queryByText(strings['key.notConfirmed'])).toBeNull();
    });
  }
  it('a Check again still waiting to read reads nothing once the key is typed again', async () => {
    const f = pending(true);
    await f.toPending('hold-sleep');
    const reads = f.auth.mock.calls.length;
    await f.wake();
    await settle();
    expect(f.auth).toHaveBeenCalledTimes(reads);
    expect(f.onConnected).not.toHaveBeenCalled();
  });
});
