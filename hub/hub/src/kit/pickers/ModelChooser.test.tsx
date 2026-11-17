// Vitest, model picker: ModelChooser end to end over a real
// useModelCatalogue with reads the test answers. Every row of the settlement table, from the setup press through
// the key save to the result words; an ended attempt has no effect; leaving is blocked while the caller saves, asks
// first about sections the draft does not carry and again when the trip cannot be stored; a restored trip keeps
// consent only for an equal scope and settles a browse attempt for the provider it set up.
import { act, render, screen, waitFor, within } from '@app/testing';
import userEvent from '@testing-library/user-event';
import { Activity, StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handoff, heldAttempts, providers, type Handoff } from '@core';
import { setTarget, startLoggingOut, type Target } from '@core/ctx';
import { boot } from '@core/test/env';
import type { CatalogueReader } from '@core/providers/read';
import type { Outcome, Settled } from '@core/providers/types';
import { ModelChooser, type ChooserLeave, type ModelChooserProps } from './ModelChooser';
import { useModelCatalogue, type CatalogueReads, type ModelCatalogue } from './useModelCatalogue';
import type { ThinkingLevel } from './modelPickLogic';
import strings from './ModelChooser.strings.en.json';

const ERR: Outcome = { kind: 'failed', code: 'unavailable', status: 503, retryAfter: null, details: {} };
const ok = (body: unknown): Settled<unknown> => ({ ok: true, body });
const no: Settled<unknown> = { ok: false, err: ERR };
const st = (state: string, cap = true) => ({ state, via: 'stored_key', methods: ['api_key'], alternatives: {}, output_cap: cap, shares_with: [] });

const A: Target = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
const FREE = 'hoody-ai/hoody-free';
const HIDDEN = 'hoody-ai/upstream';

/** One read's answer: OpenAI's state, the ready list, and which read fails. */
interface Answer {
  openai?: 'ready' | 'needs_key';
  ready?: string[];
  fail?: 'providers' | 'ready';
  legacy?: boolean;
  /** A custom endpoint that needs its key. */
  endpoint?: boolean;
  /** OpenAI offers no key method here: its setup step sends the person to the AI page. */
  aiOnly?: boolean;
  /** OpenAI no longer accepts an output cap (a ChatGPT sign-in): the Explain rules refuse its models. */
  noCap?: boolean;
  /** Hoody AI's state (default ready), its output cap, and whether it lists a model with no name to show. */
  hoody?: 'ready' | 'needs_key';
  hoodyNoCap?: boolean;
  hidden?: boolean;
}
function bodies(a: Answer) {
  const s = (x: string) => (a.legacy ? {} : { status: st(x) });
  return {
    providers: { providers: [
      { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', ...(a.legacy ? {} : { status: st(a.hoody ?? 'ready', !a.hoodyNoCap) }) },
      { id: 'openai', prefix: 'openai/', display_name: 'OpenAI', ...(a.legacy ? {} : { status: { ...st(a.openai ?? 'needs_key', !a.noCap), ...(a.aiOnly ? { methods: [] } : {}) } }) },
      ...(a.endpoint ? [{ id: 'my-ep', prefix: 'my-ep/', display_name: 'My endpoint', custom: true, ...s('needs_key') }] : []),
    ] },
    models: { models: [{ spec: FREE }, ...(a.hidden ? [{ spec: HIDDEN }] : []), { spec: 'openai/gpt-5' }, { spec: 'openai/gpt-4o' }, ...(a.endpoint ? [{ spec: 'my-ep/large' }] : [])] },
    ready: { models: (a.ready ?? [FREE]).map((spec) => ({ spec })) },
  };
}

/** Reads the test answers in order: each read takes the next queued answer, or waits for one (`hold`). */
function world() {
  const queue: Array<Answer | 'throw'> = [];
  const waiting: Array<(a: Answer | 'throw') => void> = [];
  let count = 0;
  const reads = (): CatalogueReads => {
    count++;
    const gate = new Promise<Answer | 'throw'>((res) => {
      const next = queue.shift();
      if (next !== undefined) res(next);
      else waiting.push(res);
    });
    const after = <T,>(pick: (a: Answer) => T): Promise<T> => gate.then((a) => { if (a === 'throw') throw new Error('network'); return pick(a); });
    const catalogue = {
      providers: () => after((a) => (a.fail === 'providers' ? no : ok(bodies(a).providers))),
      models: (q: { ready?: boolean } = {}) => after((a) => (q.ready ? (a.fail === 'ready' ? no : ok(bodies(a).ready)) : ok(bodies(a).models))),
      auth: () => Promise.resolve(ok({ auth: { ready: true, api_key_stored: true } })),
    } as unknown as CatalogueReader;
    return { catalogue };
  };
  return {
    reads,
    get count() { return count; },
    /** Queue answers for the next reads; a read already waiting takes the first at once. */
    async next(...as: Array<Answer | 'throw'>) {
      await act(async () => {
        for (const a of as) {
          const w = waiting.shift();
          if (w) w(a);
          else queue.push(a);
        }
      });
      await flush();
    },
  };
}

async function flush() {
  for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); });
}

function fakeApi(over: Partial<providers.ProvidersApi> = {}): providers.ProvidersApi {
  const none = () => Promise.resolve({ ok: false, err: { kind: 'failed', code: 'unexpected', status: 500, retryAfter: null, details: {} } } as Settled<unknown>);
  return {
    version: none, providers: none, provider: none, auth: none,
    catalogue: none as never,
    oauthPoll: none, pkcePoll: none, pkceStart: none, pkceCode: none, pkceCancel: none,
    keyPut: () => Promise.resolve(ok({ check: 'valid' })),
    keyDelete: none, authTest: none, authDefault: none, oauthStart: none, oauthCancel: none, signOut: none,
    ...over,
  };
}

type HostProps = Partial<ModelChooserProps> & { w: ReturnType<typeof world>; target?: Target | null; onCat?: (c: ModelCatalogue) => void };
function Host({ w, target = A, onCat, ...p }: HostProps) {
  const cat = useModelCatalogue(target, { reads: w.reads });
  onCat?.(cat);
  const [value, setValue] = useState(p.value ?? '');
  return (
    <ModelChooser
      label="Model"
      catalogue={cat}
      computer={target ? { id: target.container.id, name: 'atlas', row: { id: target.container.id, project_id: target.project.id, server_name: target.container.server_name } } : null}
      rules={providers.rulesFor('bot')}
      purpose="bot"
      api={() => fakeApi()}
      go={() => undefined}
      {...p}
      value={value}
      onChoose={(c) => {
        if (c.kind === 'model') setValue(c.spec);
        p.onChoose?.(c);
      }}
    />
  );
}

/** Mount with the first read answered. */
async function mount(first: Answer, p: Partial<HostProps> = {}) {
  const w = world();
  const onChoose = vi.fn();
  const r = render(<Host w={w} onChoose={onChoose} {...p} />);
  await w.next(first);
  return { w, onChoose, ...r };
}

/** Types the key and presses Check and save; nothing waits for the answer. */
const sendKey = async (key = 'sk-test-1') => {
  await userEvent.type(screen.getByLabelText(/OpenAI API key/), key);
  await userEvent.click(screen.getByRole('button', { name: 'Check and save' }));
};
// The key is hashed before it is sent (SHA-256 in crypto.subtle, off the main thread), so on a loaded runner the
// answer can come after any number of microtask turns: save waits for the saved key's own state, the form gone and
// "Key saved." shown.
const save = async (key = 'sk-test-1') => {
  await sendKey(key);
  await waitFor(() => {
    expect(screen.queryByLabelText(/OpenAI API key/)).toBeNull();
    expect(stepText()).toMatch(/^Key saved\./);
  });
  await flush();
};
const stepText = () => document.querySelector('section[aria-labelledby$="-setup-h"] p[role="status"]')?.textContent ?? '';

/** Intent choose: the held value needs setup, so the In use card offers Set up OpenAI. */
async function openChoose(first: Answer = {}) {
  const m = await mount(first, { value: 'openai/gpt-5' });
  await userEvent.click(screen.getByRole('button', { name: 'Set up OpenAI' }));
  expect(screen.getByRole('heading', { level: 4, name: /Set up OpenAI to use/ })).toBeInTheDocument();
  return m;
}
/** Intent browse: Set up a provider, then OpenAI's Set up. */
async function openBrowse(first: Answer = {}) {
  const m = await mount(first);
  await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
  await userEvent.click(screen.getAllByRole('button', { name: 'Set up OpenAI' })[0]!);
  expect(screen.getByRole('heading', { level: 4, name: 'Set up OpenAI' })).toBeInTheDocument();
  return m;
}

beforeEach(() => {
  boot();
  setTarget(A);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('ModelChooser: the settlement table, end to end', () => {
  it('until the attempt settles: "Key saved. Checking OpenAI…", nothing chosen, the key form gone', async () => {
    const m = await openChoose();
    const before = m.w.count;
    await save();
    expect(m.w.count).toBe(before + 1);
    expect(stepText()).toBe('Key saved. Checking OpenAI…');
    expect(screen.queryByLabelText(/OpenAI API key/)).toBeNull();
    expect(m.onChoose).not.toHaveBeenCalled();
  });

  it('its own read failed, nothing newer settled it: "Key saved. Couldn\'t confirm readiness." with Check again, which reads again', async () => {
    const m = await openChoose();
    await save();
    await m.w.next('throw');
    expect(stepText()).toBe("Key saved. Couldn't confirm readiness.");
    const n = m.w.count;
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(m.w.count).toBe(n + 1);
    await m.w.next({ openai: 'ready', ready: [FREE, 'openai/gpt-5'] });
    expect(stepText()).toMatch(/is ready and chosen\.$/);
    expect(m.onChoose).toHaveBeenCalledTimes(1);
  });

  it('the provider still needs setup: the step stays open with "OpenAI still needs setup." and the key form back', async () => {
    const m = await openChoose();
    await save();
    await m.w.next({ openai: 'needs_key' });
    expect(stepText()).toBe('OpenAI still needs setup.');
    expect(screen.getByLabelText(/OpenAI API key/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: /Set up OpenAI to use/ })).toBeInTheDocument();
    expect(m.onChoose).not.toHaveBeenCalled();
  });

  it('no trusted ready list (the ready read failed): "Key saved. Couldn\'t confirm readiness." with Check again and Choose a model, which opens the drill-in', async () => {
    const m = await openChoose();
    await save();
    await m.w.next({ openai: 'ready', fail: 'ready' });
    expect(stepText()).toBe("Key saved. Couldn't confirm readiness.");
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Choose a model' }));
    await flush();
    expect(screen.queryByRole('heading', { level: 4, name: /^Set up/ })).toBeNull();
    const h = screen.getByRole('heading', { level: 3, name: /OpenAI/ });
    expect(h).toHaveFocus();
    expect(m.onChoose).not.toHaveBeenCalled();
  });

  it('an older agent (no provider status): unconfirmed too, never chosen', async () => {
    const m = await openChoose({ openai: 'needs_key' });
    await save();
    await m.w.next({ legacy: true, ready: [FREE, 'openai/gpt-5'] });
    expect(stepText()).toBe("Key saved. Couldn't confirm readiness.");
    expect(m.onChoose).not.toHaveBeenCalled();
  });

  it('trusted list, intent choose, the remembered spec is ready: onChoose with readiness ready, and "{model} is ready and chosen."', async () => {
    const m = await openChoose();
    await save();
    await m.w.next({ openai: 'ready', ready: [FREE, 'openai/gpt-5'] });
    expect(m.onChoose).toHaveBeenCalledTimes(1);
    const c = m.onChoose.mock.calls[0]![0] as providers.Choice;
    expect(c).toMatchObject({ kind: 'model', spec: 'openai/gpt-5', readiness: 'ready', consent: false });
    expect(c.kind === 'model' && c.scope.computer).toBe('p1|c1|sv1');
    expect(stepText()).toMatch(/^.+ is ready and chosen\.$/);
  });

  it('trusted list, the provider has ready models but not the remembered spec: "OpenAI is set up, but … isn\'t ready yet." with Choose a model and Check again', async () => {
    const m = await openChoose();
    await save();
    await m.w.next({ openai: 'ready', ready: [FREE, 'openai/gpt-4o'] });
    expect(stepText()).toMatch(/^OpenAI is set up, but .+ isn't ready yet\.$/);
    expect(screen.getByRole('button', { name: 'Choose a model' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(m.onChoose).not.toHaveBeenCalled();
  });

  it('trusted list, intent browse, a model of the provider is ready: "OpenAI is ready." with Choose a model focused', async () => {
    const m = await openBrowse();
    await save();
    await m.w.next({ openai: 'ready', ready: [FREE, 'openai/gpt-4o'] });
    expect(stepText()).toBe('OpenAI is ready.');
    expect(screen.getByRole('button', { name: 'Choose a model' })).toHaveFocus();
    expect(m.onChoose).not.toHaveBeenCalled();
  });

  it('trusted list, no model of the provider in it: "Key saved. OpenAI reports no ready models yet." with Check again', async () => {
    const m = await openBrowse();
    await save();
    await m.w.next({ openai: 'ready', ready: [FREE] });
    expect(stepText()).toBe('Key saved. OpenAI reports no ready models yet.');
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose a model' })).toBeNull();
  });
});

describe('ModelChooser: an ended attempt has no effect', () => {
  it('Back while checking: the attempt ends; the late answer chooses nothing, says nothing and opens nothing', async () => {
    let cat: ModelCatalogue | null = null;
    const w = world();
    const onChoose = vi.fn();
    render(<Host w={w} value="openai/gpt-5" onChoose={onChoose} onCat={(c) => (cat = c)} />);
    await w.next({});
    const m = { w, onChoose };
    await userEvent.click(screen.getByRole('button', { name: 'Set up OpenAI' }));
    await save();
    expect(cat!.setup).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Back to models' }));
    expect(cat!.setup).toBeNull();
    expect(screen.queryByRole('heading', { level: 4, name: /^Set up/ })).toBeNull();
    await m.w.next({ openai: 'ready', ready: [FREE, 'openai/gpt-5'] });
    expect(m.onChoose).not.toHaveBeenCalled();
    expect(screen.queryByText(/is ready and chosen/)).toBeNull();
    expect(screen.queryByRole('heading', { level: 4, name: /^Set up/ })).toBeNull();
  });

  it('an endpoint key after the context died (signing out) is never sent: the step\'s sends are bound to the context it opened in', async () => {
    const keyPut = vi.fn(() => Promise.resolve(ok({ check: 'valid' })));
    const provider = () => Promise.resolve(ok({ provider: { id: 'my-ep', display_name: 'My endpoint', definition_rev: 'rev-1' } }));
    const w = world();
    render(<Host w={w} value="my-ep/large" api={() => fakeApi({ keyPut, provider })} />);
    await w.next({ endpoint: true });
    await userEvent.click(screen.getByRole('button', { name: 'Set up My endpoint' }));
    await userEvent.type(screen.getByLabelText(/My endpoint API key/), 'sk-ep-1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check and save' })).toBeEnabled());
    act(() => startLoggingOut());
    await userEvent.click(screen.getByRole('button', { name: 'Check and save' }));
    await flush();
    expect(keyPut).not.toHaveBeenCalled();
  });

  it('a lost answer is read back only while the context holds: signed out meanwhile, nothing is read', async () => {
    let answer!: (r: Settled<unknown>) => void;
    const keyPut = vi.fn(() => new Promise<Settled<unknown>>((res) => { answer = res; }));
    const auth = vi.fn(() => Promise.resolve(ok({ auth: { api_key_fingerprint: 'x' } })));
    const w = world();
    render(<Host w={w} value="openai/gpt-5" api={() => fakeApi({ keyPut, auth })} />);
    await w.next({});
    await userEvent.click(screen.getByRole('button', { name: 'Set up OpenAI' }));
    await sendKey();
    await waitFor(() => expect(keyPut).toHaveBeenCalledTimes(1));
    act(() => startLoggingOut());
    await act(async () => { answer({ ok: false, err: { kind: 'pending', code: '', status: 0, retryAfter: null, details: {} } }); });
    // The first read-back waits 2 s, then asks the step's env whether the context still holds.
    await act(async () => { await new Promise((r) => setTimeout(r, 2300)); });
    await flush();
    // Only the read as the save began (what was stored before the key left); no read-back.
    expect(auth).toHaveBeenCalledTimes(1);
  });

  it("the key save is held on the credential of the step's computer, the lock the AI page reads", async () => {
    const keyPut = vi.fn(() => new Promise<Settled<unknown>>(() => undefined));
    const w = world();
    render(<Host w={w} value="openai/gpt-5" api={() => fakeApi({ keyPut })} />);
    await w.next({});
    await userEvent.click(screen.getByRole('button', { name: 'Set up OpenAI' }));
    await sendKey();
    await waitFor(() => expect(keyPut).toHaveBeenCalledTimes(1));
    expect(heldAttempts('ai.credential:p1/c1/openai').map((h) => h.by)).toEqual(['ai.key-save']);
  });

  it('another computer while the step is open: the step closes and its key is never sent', async () => {
    const keyPut = vi.fn(() => Promise.resolve(ok({ check: 'valid' })));
    const w = world();
    const B: Target = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } };
    const r = render(<Host w={w} value="openai/gpt-5" api={() => fakeApi({ keyPut })} />);
    await w.next({});
    await userEvent.click(screen.getByRole('button', { name: 'Set up OpenAI' }));
    await userEvent.type(screen.getByLabelText(/OpenAI API key/), 'sk-test-2');
    r.rerender(<Host w={w} value="openai/gpt-5" target={B} api={() => fakeApi({ keyPut })} />);
    await flush();
    expect(screen.queryByLabelText(/OpenAI API key/)).toBeNull();
    expect(screen.queryByRole('heading', { level: 4, name: /^Set up/ })).toBeNull();
    expect(keyPut).not.toHaveBeenCalled();
  });
});

describe('ModelChooser: leaving for the AI page', () => {
  const origin: Handoff['origin'] = { page: 'bots', href: '/bots?drawer=new', label: 'New Bot', focus: 'nb-model' };
  const leaveOf = (o: Partial<ChooserLeave> = {}): ChooserLeave => ({
    origin,
    draft: () => ({ kind: 'newBot', name: 'Ada', instructions: 'Be brief.', link: false, computer: 'c1', model: { spec: FREE, consent: false } }),
    to: (id, dest, provider) => `/ai?dest=${dest}${provider ? `&p=${provider}` : ''}&handoff=${id}`,
    ...o,
  });
  const openDir = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
  };

  it('blocked while the caller saves: Your own endpoint is disabled, says to wait, and goes nowhere', async () => {
    const go = vi.fn();
    await mount({}, { go, leave: leaveOf({ blocked: 'saving' }) });
    await openDir();
    const b = screen.getByRole('button', { name: 'Your own endpoint' });
    expect(b).toBeDisabled();
    expect(screen.getByText('Wait for the save to finish')).toBeInTheDocument();
    await userEvent.click(b);
    expect(go).not.toHaveBeenCalled();
  });

  it('stores the trip with the draft and the scope, replaces the history entry with the origin, then goes', async () => {
    const go = vi.fn();
    await mount({}, { go, leave: leaveOf() });
    await openDir();
    await userEvent.click(screen.getByRole('button', { name: 'Your own endpoint' }));
    expect(go).toHaveBeenCalledTimes(2);
    expect(go.mock.calls[0]).toEqual(['/bots?drawer=new', { replace: true }]);
    const to = String(go.mock.calls[1]![0]);
    const id = /handoff=([0-9a-f]{16})$/.exec(to)?.[1] ?? '';
    expect(to.startsWith('/ai?dest=endpoint&handoff=')).toBe(true);
    const h = handoff.readHandoff('c1', id);
    expect(h).toMatchObject({ dest: 'endpoint', origin, target: { computer: 'c1', name: 'atlas' }, draft: { kind: 'newBot', name: 'Ada' } });
    expect(h?.scope.computer).toBe('p1|c1|sv1');
  });

  it('"Leaving loses what you typed." when the trip cannot be stored: Stay goes nowhere, Leave goes without it', async () => {
    const go = vi.fn();
    const bad: Target = { project: { id: 'p1' }, container: { id: 'c|1', server_name: 'sv1' } };
    setTarget(bad);
    const w = world();
    render(<Host w={w} target={bad} go={go} leave={leaveOf()} />);
    await w.next({});
    await openDir();
    await userEvent.click(screen.getByRole('button', { name: 'Your own endpoint' }));
    const ask = screen.getByRole('group', { name: strings['leave.lose'] });
    expect(within(ask).getByRole('button', { name: 'Stay' })).toHaveFocus();
    await userEvent.click(within(ask).getByRole('button', { name: 'Stay' }));
    expect(go).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: strings['leave.lose'] })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Your own endpoint' }));
    await userEvent.click(within(screen.getByRole('group', { name: strings['leave.lose'] })).getByRole('button', { name: 'Leave' }));
    expect(go).toHaveBeenCalledTimes(2);
    expect(String(go.mock.calls[1]![0])).toMatch(/^\/ai\?dest=endpoint&handoff=/);
  });

  it('dirty sections the draft does not carry are asked about first; Leave then stores and goes', async () => {
    const go = vi.fn();
    await mount({}, { go, leave: leaveOf({ unsaved: () => ['Voice', 'Helpers'] }) });
    await openDir();
    await userEvent.click(screen.getByRole('button', { name: 'Your own endpoint' }));
    const text = "Unsaved changes in Voice, Helpers won't come back. Save first, or leave without them.";
    expect(screen.getByRole('group', { name: text })).toBeInTheDocument();
    expect(go).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('group', { name: text })).getByRole('button', { name: 'Leave' }));
    expect(go).toHaveBeenCalledTimes(2);
  });

  it('an older agent\'s provider: "Set up on the AI page" leaves for Connect at that provider', async () => {
    const go = vi.fn();
    await mount({ legacy: true }, { go, value: 'openai/gpt-5', leave: leaveOf() });
    await openDir();
    await userEvent.click(screen.getAllByRole('button', { name: 'Set up OpenAI' })[0]!);
    await userEvent.click(await screen.findByRole('button', { name: 'Set up on the AI page' }));
    expect(String(go.mock.calls[1]![0])).toMatch(/^\/ai\?dest=connect&p=openai&handoff=/);
  });
});

describe('ModelChooser: the pick a trip carries', () => {
  const origin: Handoff['origin'] = { page: 'bots', href: '/bots?drawer=new', label: 'New Bot', focus: 'nb-model' };
  const leaveOf = (): ChooserLeave => ({ origin, draft: () => null, to: (id, dest, provider) => `/ai?dest=${dest}${provider ? `&p=${provider}` : ''}&handoff=${id}` });
  const tripOf = (spec: string, thinking: ThinkingLevel = 'high') => ({ draft: () => ({ spec, thinking }), onRestore: vi.fn() });
  const storedFrom = (go: ReturnType<typeof vi.fn>) => handoff.readHandoff('c1', /handoff=([0-9a-f]{16})$/.exec(String(go.mock.calls[1]![0]))?.[1] ?? '');
  const leaveForEndpoint = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    await userEvent.click(screen.getByRole('button', { name: 'Your own endpoint' }));
  };

  it("stores the picker's draft (model and thinking) as the trip's pick", async () => {
    const go = vi.fn();
    await mount({}, { go, leave: leaveOf(), pickTrip: tripOf('openai/gpt-5') });
    await leaveForEndpoint();
    expect(storedFrom(go)?.pick).toEqual({ intent: 'pick', spec: 'openai/gpt-5', thinking: 'high' });
  });

  it('no pick for the inherit row, nor for a chooser that carries none', async () => {
    for (const p of [{ pickTrip: tripOf('') }, {}]) {
      const go = vi.fn();
      const m = await mount({}, { go, leave: leaveOf(), ...p });
      await leaveForEndpoint();
      const h = storedFrom(go);
      expect(h).not.toBeNull();
      expect(h && 'pick' in h).toBe(false);
      m.unmount();
    }
  });

  it('a setup step opened for a model: the trip carries that model, with the drafted thinking', async () => {
    const go = vi.fn();
    await mount({ aiOnly: true }, { go, leave: leaveOf(), pickTrip: tripOf(FREE, 'low') });
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    await userEvent.click(screen.getByRole('button', { name: /models from OpenAI/ }));
    await userEvent.click(screen.getByRole('option', { name: /gpt-5/ }));
    expect(screen.getByRole('heading', { level: 4, name: /Set up OpenAI to use/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Set up on the AI page' }));
    expect(String(go.mock.calls[1]![0])).toMatch(/^\/ai\?dest=connect&p=openai&handoff=/);
    expect(storedFrom(go)?.pick).toEqual({ intent: 'pick', spec: 'openai/gpt-5', thinking: 'low' });
  });

  const scopeNow = (): providers.Scope => {
    let sc: providers.Scope | null = null;
    function Probe() {
      sc = useModelCatalogue(A, { reads: world().reads }).scope;
      return null;
    }
    const r = render(<Probe />);
    r.unmount();
    return sc!;
  };
  const rec = (scope: providers.Scope, spec = 'openai/gpt-5'): Handoff => ({
    v: 1,
    id: '0123456789abcdef',
    at: Date.now(),
    scope: { ...scope },
    origin,
    target: { computer: 'c1', name: 'atlas' },
    dest: 'connect',
    provider: 'openai',
    pick: { intent: 'pick', spec, thinking: 'high' },
  });

  it('back in the same scope, the model now ready: the pick is handed back with its thinking, once; the trip is removed', async () => {
    const trip = tripOf(FREE);
    const h = rec(scopeNow());
    expect(handoff.writeHandoff(h)).toBe(true);
    const m = await mount({ openai: 'ready', ready: [FREE, 'openai/gpt-5'] }, { restore: h, pickTrip: trip });
    await waitFor(() => expect(trip.onRestore).toHaveBeenCalledTimes(1));
    expect(trip.onRestore.mock.calls[0]![0]).toMatchObject({ kind: 'model', spec: 'openai/gpt-5', readiness: 'ready', consent: false });
    expect(trip.onRestore.mock.calls[0]![1]).toBe('high');
    expect(handoff.readHandoff('c1', h.id)).toBeNull();
    await m.w.next({ openai: 'ready', ready: [FREE, 'openai/gpt-5'] });
    expect(trip.onRestore).toHaveBeenCalledTimes(1);
    expect(m.onChoose).not.toHaveBeenCalled();
  });

  it('judged on the evidence the page reads now: a model that still needs setup is not handed back', async () => {
    const trip = tripOf(FREE);
    await mount({ openai: 'needs_key' }, { restore: rec(scopeNow()), pickTrip: trip });
    await flush();
    expect(trip.onRestore).not.toHaveBeenCalled();
  });

  it('another page load (boot) or generation: the pick is not handed back', async () => {
    const sc = scopeNow();
    for (const other of [{ ...sc, boot: 'other-boot' }, { ...sc, gen: sc.gen + 7 }]) {
      const trip = tripOf(FREE);
      const m = await mount({ openai: 'ready', ready: [FREE, 'openai/gpt-5'] }, { restore: rec(other), pickTrip: trip });
      await flush();
      expect(trip.onRestore).not.toHaveBeenCalled();
      m.unmount();
    }
  });

  it('waits while the catalogue is still being read, then judges the answer', async () => {
    const trip = tripOf(FREE);
    const w = world();
    render(<Host w={w} restore={rec(scopeNow())} pickTrip={trip} />);
    await flush();
    expect(trip.onRestore).not.toHaveBeenCalled();
    await w.next({ openai: 'ready', ready: [FREE, 'openai/gpt-5'] });
    await waitFor(() => expect(trip.onRestore).toHaveBeenCalledTimes(1));
  });

  // The chooser stayed mounted through the trip (a kept page): the evidence it holds was read before the person left. Only a read
  // started after the trip came back can judge the pick; the kept evidence never does, while a refresh runs or after it failed.
  const ready: Answer = { openai: 'ready', ready: [FREE, 'openai/gpt-5'] };
  const keptThenBack = async (refreshFirst: boolean) => {
    const trip = tripOf(FREE);
    let cat: ModelCatalogue | null = null;
    const m = await mount(ready, { onCat: (c) => (cat = c) });
    if (refreshFirst) act(() => cat!.retry());
    m.rerender(<Host w={m.w} onChoose={m.onChoose} onCat={(c) => (cat = c)} restore={rec(scopeNow())} pickTrip={trip} />);
    await flush();
    return { ...m, trip };
  };
  for (const refreshFirst of [false, true]) {
    it(`kept evidence from before the trip never judges the pick${refreshFirst ? ' (a refresh already running)' : ''}: the read after return does`, async () => {
      const m = await keptThenBack(refreshFirst);
      expect(m.trip.onRestore).not.toHaveBeenCalled();
      await m.w.next({ openai: 'needs_key' });
      await flush();
      expect(m.trip.onRestore).not.toHaveBeenCalled();
      expect(m.onChoose).not.toHaveBeenCalled();
    });
  }
  it('the read after return answers ready: the pick is handed back once', async () => {
    const m = await keptThenBack(false);
    await m.w.next(ready);
    await waitFor(() => expect(m.trip.onRestore).toHaveBeenCalledTimes(1));
    expect(m.trip.onRestore.mock.calls[0]![0]).toMatchObject({ spec: 'openai/gpt-5', readiness: 'ready', consent: false });
  });
  it('a kept page shown again with a read still out from before it was hidden: that read never judges the pick, the next one does', async () => {
    const trip = tripOf(FREE);
    const w = world();
    let cat: ModelCatalogue | null = null;
    const at = (mode: 'visible' | 'hidden', restore: Handoff | null) => (
      <Activity mode={mode}>
        <Host w={w} onCat={(c) => (cat = c)} restore={restore} pickTrip={trip} />
      </Activity>
    );
    const r = render(at('visible', null));
    await w.next(ready);
    act(() => cat!.retry());
    expect(w.count).toBe(2);
    r.rerender(at('hidden', null));
    await flush();
    r.rerender(at('visible', null));
    await flush();
    r.rerender(at('visible', rec(scopeNow())));
    await flush();
    await w.next(ready);
    await flush();
    expect(trip.onRestore).not.toHaveBeenCalled();
    await w.next({ openai: 'needs_key' });
    await flush();
    expect(trip.onRestore).not.toHaveBeenCalled();
  });
  it('the read after return fails while the old evidence is kept: the pick is not handed back, not even by a later read', async () => {
    const m = await keptThenBack(false);
    await m.w.next('throw');
    await flush();
    expect(m.trip.onRestore).not.toHaveBeenCalled();
    await m.w.next(ready);
    await flush();
    expect(m.trip.onRestore).not.toHaveBeenCalled();
  });
});

describe('ModelChooser: on the AI page itself (away)', () => {
  it('Your own endpoint and Set up on the AI page stay in the page: away gets the destination, nothing is stored or navigated', async () => {
    const go = vi.fn();
    const away = vi.fn();
    await mount({ legacy: true }, { go, away, value: 'openai/gpt-5' });
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    await userEvent.click(screen.getByRole('button', { name: 'Your own endpoint' }));
    expect(away).toHaveBeenLastCalledWith('endpoint', undefined);
    await userEvent.click(screen.getAllByRole('button', { name: 'Set up OpenAI' })[0]!);
    const onAi = await screen.findByRole('button', { name: 'Set up on the AI page' });
    expect(onAi).toBeEnabled();
    await userEvent.click(onAi);
    expect(away).toHaveBeenLastCalledWith('connect', 'openai');
    expect(screen.queryByRole('button', { name: 'Set up on the AI page' })).toBeNull();
    expect(go).not.toHaveBeenCalled();
  });

  it('isDisabled holds the in-page way too', async () => {
    const away = vi.fn();
    await mount({}, { away, isDisabled: true });
    const dir = screen.queryByRole('button', { name: 'Set up a provider' });
    if (dir && !(dir as HTMLButtonElement).disabled) await userEvent.click(dir);
    const b = screen.queryByRole('button', { name: 'Your own endpoint' });
    if (b && !(b as HTMLButtonElement).disabled) await userEvent.click(b);
    expect(away).not.toHaveBeenCalled();
  });

  // The press would do nothing while isDisabled (startLeave returns), so the button says so.
  it('isDisabled while the setup step is open: Set up on the AI page is disabled', async () => {
    const away = vi.fn();
    const m = await mount({ legacy: true }, { away, value: 'openai/gpt-5' });
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Set up OpenAI' })[0]!);
    expect(await screen.findByRole('button', { name: 'Set up on the AI page' })).toBeEnabled();
    m.rerender(<Host w={m.w} onChoose={m.onChoose} away={away} value="openai/gpt-5" isDisabled />);
    const onAi = screen.getByRole('button', { name: 'Set up on the AI page' });
    expect(onAi).toBeDisabled();
    await userEvent.click(onAi);
    expect(away).not.toHaveBeenCalled();
  });
});

describe('ModelChooser: restoring a trip', () => {
  const rec = (scope: providers.Scope, over: Partial<Handoff> = {}): Handoff => ({
    v: 1,
    id: '0123456789abcdef',
    at: Date.now(),
    scope: { ...scope },
    origin: { page: 'bots', href: '/bots?drawer=new', label: 'New Bot', focus: 'nb-model' },
    target: { computer: 'c1', name: 'atlas' },
    dest: 'endpoint',
    draft: { kind: 'newBot', name: 'Ada', instructions: '', link: false, computer: 'c1', model: { spec: 'openai/gpt-5', consent: true } },
    ...over,
  });
  const scopeNow = (): providers.Scope => {
    let sc: providers.Scope | null = null;
    function Probe() {
      sc = useModelCatalogue(A, { reads: world().reads }).scope;
      return null;
    }
    const r = render(<Probe />);
    r.unmount();
    return sc!;
  };

  it('an equal scope keeps the consent: onChoose with consent once the evidence arrives; the trip is removed', async () => {
    const sc = scopeNow();
    const h = rec(sc);
    expect(handoff.writeHandoff(h)).toBe(true);
    const m = await mount({ openai: 'ready', ready: [FREE] }, { value: 'openai/gpt-5', restore: h });
    await waitFor(() => expect(m.onChoose).toHaveBeenCalled());
    expect(m.onChoose.mock.calls[0]![0]).toMatchObject({ kind: 'model', spec: 'openai/gpt-5', readiness: 'unknown', consent: true });
    expect(handoff.readHandoff('c1', h.id)).toBeNull();
  });

  it('an equal scope, but the rules no longer accept the model (its provider needs setup): nothing is chosen', async () => {
    const sc = scopeNow();
    const m = await mount({ openai: 'needs_key' }, { value: 'openai/gpt-5', restore: rec(sc) });
    await flush();
    expect(m.onChoose).not.toHaveBeenCalled();
  });

  it('another page load (boot) or generation: consent is not kept, nothing is chosen', async () => {
    const sc = scopeNow();
    for (const other of [{ ...sc, boot: 'other-boot' }, { ...sc, gen: sc.gen + 7 }]) {
      const m = await mount({ openai: 'ready', ready: [FREE] }, { value: 'openai/gpt-5', restore: rec(other) });
      await flush();
      expect(m.onChoose).not.toHaveBeenCalled();
      m.unmount();
    }
  });

  // A New Bot's kept consent follows the rule of a trip's pick: the chooser stayed mounted through the trip (a kept page), so the
  // evidence it holds was read before the person left. Only a read started after the return judges the consent; that read
  // failing drops it.
  const okNow: Answer = { openai: 'ready', ready: [FREE] };
  const keptConsent = async (refreshFirst: boolean) => {
    let cat: ModelCatalogue | null = null;
    const m = await mount(okNow, { value: 'openai/gpt-5', onCat: (c) => (cat = c) });
    if (refreshFirst) act(() => cat!.retry());
    m.rerender(<Host w={m.w} onChoose={m.onChoose} onCat={(c) => (cat = c)} value="openai/gpt-5" restore={rec(scopeNow())} />);
    await flush();
    return m;
  };
  for (const refreshFirst of [false, true]) {
    it(`a kept consent is never handed over on evidence read before the trip${refreshFirst ? ' (a refresh already running)' : ''}`, async () => {
      const m = await keptConsent(refreshFirst);
      expect(m.onChoose).not.toHaveBeenCalled();
      await m.w.next({ openai: 'needs_key' });
      await flush();
      expect(m.onChoose).not.toHaveBeenCalled();
    });
  }
  it('a kept consent: the read after return accepts it, handed over once with consent', async () => {
    const m = await keptConsent(false);
    await m.w.next(okNow);
    await waitFor(() => expect(m.onChoose).toHaveBeenCalledTimes(1));
    expect(m.onChoose.mock.calls[0]![0]).toMatchObject({ kind: 'model', spec: 'openai/gpt-5', consent: true });
    await m.w.next(okNow);
    expect(m.onChoose).toHaveBeenCalledTimes(1);
  });
  it('a kept consent: the read after return fails while the old evidence is kept, so the consent is dropped for good', async () => {
    const m = await keptConsent(false);
    await m.w.next('throw');
    await flush();
    expect(m.onChoose).not.toHaveBeenCalled();
    await m.w.next(okNow);
    await flush();
    expect(m.onChoose).not.toHaveBeenCalled();
  });

  it('a trip that set up a provider opens its drill-in and settles a browse attempt there', async () => {
    const sc = scopeNow();
    const h = rec(sc, { draft: undefined, result: { status: 'done', provider: 'openai' } });
    const m = await mount({ openai: 'needs_key' }, { restore: h });
    await flush();
    expect(stepText()).toBe('Key saved. Checking OpenAI…');
    await m.w.next({ openai: 'ready', ready: [FREE, 'openai/gpt-4o'] });
    expect(stepText()).toBe('OpenAI is ready.');
    await userEvent.click(screen.getByRole('button', { name: 'Choose a model' }));
    await flush();
    expect(screen.getByRole('heading', { level: 3, name: /OpenAI/ })).toHaveFocus();
    expect(m.onChoose).not.toHaveBeenCalled();
  });
});


describe('ModelChooser: attempts, focus and search across steps', () => {
  const origin: Handoff['origin'] = { page: 'bots', href: '/bots?drawer=new', label: 'New Bot', focus: 'nb-model' };
  const leaveOf = (o: Partial<ChooserLeave> = {}): ChooserLeave => ({
    origin,
    draft: () => ({ kind: 'newBot', name: 'Ada', instructions: 'Be brief.', link: false, computer: 'c1', model: { spec: FREE, consent: false } }),
    to: (id, dest, provider) => `/ai?dest=${dest}${provider ? `&p=${provider}` : ''}&handoff=${id}`,
    ...o,
  });

  it('a second save after "still needs setup" opens a new attempt; a read that started before it does not settle it', async () => {
    let cat: ModelCatalogue | null = null;
    const m = await openChoose();
    m.rerender(<Host w={m.w} onChoose={m.onChoose} value="openai/gpt-5" onCat={(c) => (cat = c)} />);
    await save();
    await m.w.next({ openai: 'needs_key' });
    expect(stepText()).toBe('OpenAI still needs setup.');
    // A read starts before the second save (Try again, a return to the tab) and answers after it.
    act(() => cat!.retry());
    await save('sk-test-2');
    expect(stepText()).toBe('Key saved. Checking OpenAI…');
    expect(screen.queryByLabelText(/OpenAI API key/)).toBeNull();
    await m.w.next({ openai: 'ready', ready: [FREE, 'openai/gpt-5'] });
    expect(stepText()).toBe('Key saved. Checking OpenAI…');
    expect(m.onChoose).not.toHaveBeenCalled();
    await m.w.next({ openai: 'ready', ready: [FREE, 'openai/gpt-5'] });
    expect(m.onChoose).toHaveBeenCalledTimes(1);
    expect(stepText()).toMatch(/is ready and chosen\.$/);
  });

  it('under StrictMode a restored provider attempt still settles, and the trip is consumed once', async () => {
    const h: Handoff = {
      v: 1,
      id: '0123456789abcdef',
      at: Date.now(),
      scope: { account: '', realm: '', computer: '', gen: 0, boot: '' },
      origin,
      target: { computer: 'c1', name: 'atlas' },
      dest: 'connect',
      result: { status: 'done', provider: 'openai' },
    };
    const w = world();
    const onChoose = vi.fn();
    render(
      <StrictMode>
        <Host w={w} onChoose={onChoose} restore={h} />
      </StrictMode>,
    );
    await w.next({ openai: 'needs_key' });
    await flush();
    expect(stepText()).toBe('Key saved. Checking OpenAI…');
    await w.next({ openai: 'ready', ready: [FREE, 'openai/gpt-4o'] }, { openai: 'ready', ready: [FREE, 'openai/gpt-4o'] });
    expect(stepText()).toBe('OpenAI is ready.');
    expect(screen.getByRole('button', { name: 'Choose a model' })).toHaveFocus();
    expect(onChoose).not.toHaveBeenCalled();
  });

  for (const kind of ['unsaved', 'lose'] as const) {
    it(`the ${kind} ask, then the caller starts saving: Leave is off and goes nowhere`, async () => {
      const go = vi.fn();
      const bad: Target = { project: { id: 'p1' }, container: { id: 'c|1', server_name: 'sv1' } };
      const target = kind === 'lose' ? bad : A;
      setTarget(target);
      const w = world();
      const unsaved = kind === 'unsaved' ? () => ['Voice'] : undefined;
      const r = render(<Host w={w} target={target} go={go} leave={leaveOf({ unsaved })} />);
      await w.next({});
      await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
      await userEvent.click(screen.getByRole('button', { name: 'Your own endpoint' }));
      const name = kind === 'lose' ? strings['leave.lose'] : /^Unsaved changes in Voice/;
      expect(screen.getByRole('group', { name })).toBeInTheDocument();
      r.rerender(<Host w={w} target={target} go={go} leave={leaveOf({ unsaved, blocked: 'saving' })} />);
      const leaveBtn = within(screen.getByRole('group', { name })).getByRole('button', { name: 'Leave' });
      expect(leaveBtn).toBeDisabled();
      await userEvent.click(leaveBtn);
      expect(go).not.toHaveBeenCalled();
    });
  }

  it("the browser's own Back while a step is checking ends the step: the late answer chooses nothing and opens nothing", async () => {
    const m = await mount({});
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    await userEvent.click(screen.getByRole('button', { name: /models from OpenAI/ }));
    await userEvent.click(screen.getByRole('option', { name: /gpt-5/ }));
    expect(screen.getByRole('heading', { level: 4, name: /Set up OpenAI to use/ })).toBeInTheDocument();
    await save();
    expect(stepText()).toBe('Key saved. Checking OpenAI…');
    await userEvent.click(document.getElementById('mc-back')!);
    expect(screen.queryByRole('heading', { level: 4, name: /^Set up/ })).toBeNull();
    // Back owns the focus it asked for (its opener), not the closed step's restore.
    expect(screen.getByRole('button', { name: /models from OpenAI/ })).toHaveFocus();
    const focused = document.activeElement;
    await m.w.next({ openai: 'ready', ready: [FREE, 'openai/gpt-5'] });
    expect(m.onChoose).not.toHaveBeenCalled();
    // The ended step moves focus nowhere. OpenAI being ready drops its needs-setup row from the directory, so
    // the focused row may be gone: focus then moves to the row now in its place or the view heading, never
    // the body and never anything this chooser picked.
    const now = document.activeElement;
    expect(now).not.toBe(document.body);
    expect(now === focused || now === screen.getByRole('heading', { level: 3 }) || !!now?.closest('[data-mc-row]')).toBe(true);
  });

  it('typing in the search while a step is checking ends the step: the late answer chooses nothing', async () => {
    const m = await openChoose();
    await save();
    const box = screen.getByRole('searchbox', { name: strings['mc.search'] });
    await userEvent.type(box, 'gpt');
    expect(screen.queryByRole('heading', { level: 4, name: /^Set up/ })).toBeNull();
    // Typing keeps going: every key reaches the search, which keeps focus.
    expect(box).toHaveValue('gpt');
    expect(box).toHaveFocus();
    await m.w.next({ openai: 'ready', ready: [FREE, 'openai/gpt-5'] });
    expect(m.onChoose).not.toHaveBeenCalled();
    expect(box).toHaveFocus();
  });

  it("focus: after a search ended one step, the next step's own Back to models still returns focus to its opener", async () => {
    await openChoose();
    const box = screen.getByRole('searchbox', { name: strings['mc.search'] });
    await userEvent.type(box, 'g');
    expect(box).toHaveFocus();
    await userEvent.clear(box);
    const opener = screen.getByRole('button', { name: 'Set up OpenAI' });
    await userEvent.click(opener);
    expect(screen.getByRole('heading', { level: 4, name: /Set up OpenAI to use/ })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Back to models' }));
    expect(screen.queryByRole('heading', { level: 4, name: /^Set up/ })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).not.toBe(box);
  });

  it('ready but no longer eligible for these rules (Explain, no output cap): nothing is chosen, and the step says so', async () => {
    const m = await openChoose();
    m.rerender(<Host w={m.w} onChoose={m.onChoose} value="openai/gpt-5" rules={providers.rulesFor('explain')} purpose="explain" />);
    await save();
    // Every text the status line passes through: "ready and chosen" is never announced, not even for one render.
    // Each text value replaced (characterDataOldValue) or removed, so a value that lived for one render is seen too.
    const said: string[] = [];
    const obs = new MutationObserver((rs) => {
      for (const r of rs) {
        if (r.oldValue) said.push(r.oldValue);
        r.removedNodes.forEach((n) => said.push(n.textContent ?? ''));
      }
      said.push(stepText());
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, characterDataOldValue: true });
    await m.w.next({ openai: 'ready', ready: [FREE, 'openai/gpt-5'], noCap: true });
    obs.disconnect();
    expect(said.some((x) => /ready and chosen/.test(x))).toBe(false);
    expect(m.onChoose).not.toHaveBeenCalled();
    expect(stepText()).toBe(strings['setup.notUsable'].replace('{{model}}', 'openai/gpt-5'));
    expect(screen.getByRole('button', { name: 'Choose a model' })).toBeInTheDocument();
  });

  it('opening a step moves focus to its heading', async () => {
    await openChoose();
    expect(screen.getByRole('heading', { level: 4, name: /Set up OpenAI to use/ })).toHaveFocus();
  });

  it("restore with the origin's control missing falls back to the drill-in heading", async () => {
    const h: Handoff = {
      v: 1,
      id: '0123456789abcdee',
      at: Date.now(),
      scope: { account: '', realm: '', computer: '', gen: 0, boot: '' },
      origin: { ...origin, focus: 'no-such-control' },
      target: { computer: 'c1', name: 'atlas' },
      dest: 'connect',
      result: { status: 'done', provider: 'openai' },
    };
    await mount({ openai: 'needs_key' }, { restore: h });
    await flush();
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(undefined))); });
    expect(screen.getByRole('heading', { level: 3, name: /OpenAI/ })).toHaveFocus();
  });

  it("restore without a provider, the origin's control missing: focus goes to the view's heading", async () => {
    const h: Handoff = {
      v: 1,
      id: '0123456789abcdec',
      at: Date.now(),
      scope: { account: '', realm: '', computer: '', gen: 0, boot: '' },
      origin: { ...origin, focus: 'no-such-control' },
      target: { computer: 'c1', name: 'atlas' },
      dest: 'connect',
    };
    await mount({}, { restore: h });
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(undefined))); });
    expect(document.getElementById('mc-h')).toHaveFocus();
  });

  it('restore with the origin control present focuses it', async () => {
    const h: Handoff = {
      v: 1,
      id: '0123456789abcded',
      at: Date.now(),
      scope: { account: '', realm: '', computer: '', gen: 0, boot: '' },
      origin: { ...origin, focus: 'outside-ctl' },
      target: { computer: 'c1', name: 'atlas' },
      dest: 'connect',
    };
    const btn = document.createElement('button');
    btn.id = 'outside-ctl';
    document.body.appendChild(btn);
    await mount({}, { restore: h });
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(undefined))); });
    expect(btn).toHaveFocus();
    btn.remove();
  });
});

// While the key step's save is in flight or its outcome is unknown, nothing leaves the
// step: Back waits, and a catalogue change cannot turn it into another kind of setup (C9: its answer would be lost).
describe('ModelChooser: the setup step holds while its key save is open (C9)', () => {
  const PENDING: Settled<unknown> = { ok: false, err: { kind: 'pending', code: '', status: 0, retryAfter: null, details: {} } };
  const back = () => screen.getByRole('button', { name: strings['setup.back'] });
  async function openWith(keyPut: () => Promise<Settled<unknown>>, auth?: () => Promise<Settled<unknown>>) {
    let cat: ModelCatalogue | null = null;
    const w = world();
    const api = fakeApi({ keyPut, ...(auth ? { auth } : {}) });
    const r = render(<Host w={w} value="openai/gpt-5" api={() => api} onCat={(c) => (cat = c)} />);
    await w.next({});
    await userEvent.click(screen.getByRole('button', { name: 'Set up OpenAI' }));
    await sendKey();
    return {
      w,
      reread: async (a: Answer) => { act(() => cat!.retry()); await w.next(a); await flush(); },
      withRestore: (h: Handoff, target?: Target | null) => r.rerender(<Host w={w} value="openai/gpt-5" {...(target !== undefined ? { target } : {})} api={() => api} onCat={(c) => (cat = c)} restore={h} />),
    };
  }
  /** The read-back of a lost answer waits 2 + 6 + 17 s before "may have been saved". */
  async function untilUnknown() {
    for (let i = 0; i < 6 && !screen.queryByText(/may have been saved/); i++) await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(screen.getByText(/may have been saved/)).toBeInTheDocument();
  }

  it('in flight: Back is disabled until the answer lands', async () => {
    let answer!: (r: Settled<unknown>) => void;
    await openWith(() => new Promise<Settled<unknown>>((res) => { answer = res; }));
    await waitFor(() => expect(back()).toBeDisabled());
    await act(async () => { answer(ok({ check: 'valid' })); });
    await waitFor(() => expect(stepText()).toMatch(/^Key saved\./));
    expect(back()).toBeEnabled();
  });

  it('outcome unknown: Back is disabled until "Stop tracking this save"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await openWith(() => Promise.resolve(PENDING), () => Promise.resolve(ok({ auth: { api_key_fingerprint: 'other' } })));
    await untilUnknown();
    expect(back()).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Stop tracking this save' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Stop tracking anyway' }));
    await waitFor(() => expect(back()).toBeEnabled());
  });

  it('in flight: a catalogue that no longer offers the key keeps the key step, and the answer lands', async () => {
    let answer!: (r: Settled<unknown>) => void;
    const m = await openWith(() => new Promise<Settled<unknown>>((res) => { answer = res; }));
    await m.reread({ legacy: true });
    expect(screen.queryByRole('button', { name: 'Set up on the AI page' })).toBeNull();
    expect(screen.getByLabelText(/OpenAI API key/)).toBeInTheDocument();
    await act(async () => { answer(ok({ check: 'valid' })); });
    await waitFor(() => expect(stepText()).toMatch(/^Key saved\./));
  });

  it('outcome unknown: a catalogue that no longer offers the key keeps the step and its "may have been saved"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const m = await openWith(() => Promise.resolve(PENDING), () => Promise.resolve(ok({ auth: { api_key_fingerprint: 'other' } })));
    await untilUnknown();
    await m.reread({ legacy: true });
    expect(screen.queryByRole('button', { name: 'Set up on the AI page' })).toBeNull();
    expect(screen.getByText(/may have been saved/)).toBeInTheDocument();
  });

  // The browser above the step (its search, its Back, a drill-in's Set up) and a trip that arrives
  // as a prop wait for the held save too.
  it("in flight: the browser's search and Back wait, and the step stays", async () => {
    let answer!: (r: Settled<unknown>) => void;
    const w = world();
    const api = fakeApi({ keyPut: () => new Promise<Settled<unknown>>((res) => { answer = res; }) });
    render(<Host w={w} api={() => api} />);
    await w.next({});
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Set up OpenAI' })[0]!);
    await sendKey();
    const search = screen.getByRole('searchbox');
    const browserBack = document.querySelector<HTMLButtonElement>('[id$="-back"]:not([id$="-setup-back"])')!;
    await waitFor(() => expect(search).toBeDisabled());
    expect(browserBack).toBeDisabled();
    await userEvent.type(search, 'gpt');
    await userEvent.click(browserBack);
    expect(screen.getByRole('heading', { level: 4, name: 'Set up OpenAI' })).toBeInTheDocument();
    await act(async () => { answer(ok({ check: 'valid' })); });
    await waitFor(() => expect(stepText()).toMatch(/^Key saved\./));
    expect(screen.getByRole('searchbox')).toBeEnabled();
  });

  it("in flight: a drill-in's own Set up waits and does not replace the step", async () => {
    const w = world();
    const keyPut = vi.fn(() => new Promise<Settled<unknown>>(() => undefined));
    const api = fakeApi({ keyPut });
    render(<Host w={w} api={() => api} />);
    await w.next({});
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    const card = document.querySelector<HTMLElement>('li[data-provider="openai"]')!;
    const models = within(card).getAllByRole('button').find((b) => !/^Set up/.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))!;
    await userEvent.click(models);
    await userEvent.click(document.querySelector<HTMLButtonElement>('[id$="-drill-setup"]')!);
    await sendKey();
    await waitFor(() => expect(keyPut).toHaveBeenCalledTimes(1));
    const header = document.querySelector<HTMLButtonElement>('[id$="-drill-setup"]')!;
    await waitFor(() => expect(header).toBeDisabled());
    await userEvent.click(header);
    expect(screen.getByLabelText(/OpenAI API key/)).toBeDisabled();
  });

  it('in flight: a trip that arrives waits until the save is answered, then opens', async () => {
    let answer!: (r: Settled<unknown>) => void;
    const m = await openWith(() => new Promise<Settled<unknown>>((res) => { answer = res; }));
    const h: Handoff = {
      v: 1,
      id: '0123456789abcdef',
      at: Date.now(),
      scope: { account: '', realm: '', computer: '', gen: 0, boot: '' },
      origin: { page: 'bots', href: '/bots?drawer=new', label: 'New Bot', focus: 'nb-model' },
      target: { computer: 'c1', name: 'atlas' },
      dest: 'connect',
      result: { status: 'done', provider: 'openai' },
    };
    m.withRestore(h);
    await flush();
    // Not opened: the key step stays, and the trip's drill-in has not replaced the view.
    expect(screen.getByLabelText(/OpenAI API key/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: /OpenAI/ })).toBeNull();
    await act(async () => { answer(ok({ check: 'valid' })); });
    await waitFor(() => expect(screen.getByRole('heading', { level: 3, name: /OpenAI/ })).toBeInTheDocument());
  });

  it('in flight: a trip that waited is not opened in another computer the chooser moved to, and its handoff stays', async () => {
    const m = await openWith(() => new Promise<Settled<unknown>>(() => undefined));
    const h: Handoff = {
      v: 1,
      id: '0123456789abcdee',
      at: Date.now(),
      scope: { account: '', realm: '', computer: '', gen: 0, boot: '' },
      origin: { page: 'bots', href: '/bots?drawer=new', label: 'New Bot', focus: 'nb-model' },
      target: { computer: 'c1', name: 'atlas' },
      dest: 'connect',
      result: { status: 'done', provider: 'openai' },
    };
    const kept = handoff.writeHandoff(h);
    m.withRestore(h);
    await flush();
    expect(screen.getByLabelText(/OpenAI API key/)).toBeInTheDocument();
    const B: Target = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } };
    m.withRestore(h, B);
    await m.w.next({});
    await flush();
    expect(screen.queryByLabelText(/OpenAI API key/)).toBeNull();
    expect(screen.queryByRole('heading', { level: 3, name: /OpenAI/ })).toBeNull();
    if (kept) expect(handoff.readHandoff('c1', h.id)).not.toBeNull();
  });

  it('in flight: a trip that comes with the move to another computer, in the same render, is not opened there either', async () => {
    const m = await openWith(() => new Promise<Settled<unknown>>(() => undefined));
    const h: Handoff = {
      v: 1,
      id: '0123456789abcded',
      at: Date.now(),
      scope: { account: '', realm: '', computer: '', gen: 0, boot: '' },
      origin: { page: 'bots', href: '/bots?drawer=new', label: 'New Bot', focus: 'nb-model' },
      target: { computer: 'c1', name: 'atlas' },
      dest: 'connect',
      result: { status: 'done', provider: 'openai' },
    };
    const kept = handoff.writeHandoff(h);
    m.withRestore(h, { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } });
    await m.w.next({});
    await flush();
    expect(screen.queryByLabelText(/OpenAI API key/)).toBeNull();
    expect(screen.queryByRole('heading', { level: 3, name: /OpenAI/ })).toBeNull();
    if (kept) expect(handoff.readHandoff('c1', h.id)).not.toBeNull();
  });

  it('in flight: a trip that comes as the computer goes (no scope yet) is not opened in the next computer chosen', async () => {
    const m = await openWith(() => new Promise<Settled<unknown>>(() => undefined));
    const h: Handoff = {
      v: 1,
      id: '0123456789abcdec',
      at: Date.now(),
      scope: { account: '', realm: '', computer: '', gen: 0, boot: '' },
      origin: { page: 'bots', href: '/bots?drawer=new', label: 'New Bot', focus: 'nb-model' },
      target: { computer: 'c1', name: 'atlas' },
      dest: 'connect',
      result: { status: 'done', provider: 'openai' },
    };
    m.withRestore(h, null);
    await flush();
    expect(screen.queryByLabelText(/OpenAI API key/)).toBeNull();
    m.withRestore(h, { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } });
    await m.w.next({});
    await flush();
    expect(screen.queryByRole('heading', { level: 3, name: /OpenAI/ })).toBeNull();
  });
});


// The sign-in capability read (GET /version) can answer after OpenAI setup is already
// up as a key form. ProviderSetup then adds its choice above the key step; the key step keeps its place, so what was
// typed, and a save already sent, stay.
describe('ModelChooser: the sign-in capability answers after the key form is up (:500)', () => {
  /** A version read held until `land`; the chooser reads it once per computer. */
  const lateVersion = () => {
    let answer: ((v: Settled<unknown>) => void) | undefined;
    const version = () => new Promise<Settled<unknown>>((res) => (answer = res));
    const land = async (body: unknown) => {
      await act(async () => answer?.(ok(body)));
      await flush();
    };
    return { version, land };
  };
  const openWith = async (api: () => providers.ProvidersApi, keyPut?: providers.ProvidersApi['keyPut']) => {
    const w = world();
    render(<Host w={w} value="openai/gpt-5" api={keyPut ? () => ({ ...api(), keyPut }) : api} />);
    await w.next({});
    await userEvent.click(screen.getByRole('button', { name: 'Set up OpenAI' }));
    return w;
  };
  const choice = () => screen.queryByRole('radiogroup', { name: 'How to connect OpenAI' });

  it('a typed key stays, with "Use an API key" chosen under the choice that appears', async () => {
    const v = lateVersion();
    await openWith(() => fakeApi({ version: v.version }));
    const field = screen.getByLabelText(/OpenAI API key/);
    expect(choice()).toBeNull();
    await userEvent.type(field, 'sk-typed-1');
    await v.land({ capabilities: [{ name: providers.CAPS.device }] });
    expect(choice()).not.toBeNull();
    expect(screen.getByRole('radio', { name: /Use an API key/ })).toBeChecked();
    // the same field, not a new one: the typed key is still in it
    expect(screen.getByLabelText(/OpenAI API key/)).toBe(field);
    expect(field).toHaveValue('sk-typed-1');
  });

  it('a save sent before the answer still lands: "Key saved." and the form gone', async () => {
    const v = lateVersion();
    let saved: (s: Settled<unknown>) => void = () => undefined;
    const keyPut = vi.fn(() => new Promise<Settled<unknown>>((res) => (saved = res)));
    const w = await openWith(() => fakeApi({ version: v.version }), keyPut as never);
    await sendKey('sk-typed-2');
    await waitFor(() => expect(keyPut).toHaveBeenCalledTimes(1));
    await v.land({ capabilities: [{ name: providers.CAPS.device }] });
    expect(choice()).not.toBeNull();
    await act(async () => saved(ok({ check: 'valid' })));
    await waitFor(() => {
      expect(screen.queryByLabelText(/OpenAI API key/)).toBeNull();
      expect(stepText()).toMatch(/^Key saved\./);
    });
    void w;
  });
});

// Over the real hook, a press shows pending on its button; the read a return to the tab fires, the same retry, is silent.
describe('ModelChooser: Try again', () => {
  const tryAgain = () => screen.getByRole('button', { name: /Try again/ });

  it('a press shows pending until its read answers, and the rows stay', async () => {
    const m = await mount({ fail: 'providers' }, { value: FREE, fallback: [{ spec: FREE, label: 'Hoody Free' }] });
    const rows = screen.getAllByRole('option').length;
    expect(tryAgain()).not.toHaveAttribute('data-pending');
    await userEvent.click(tryAgain());
    await flush();
    expect(tryAgain()).toHaveAttribute('data-pending');
    expect(screen.getAllByRole('option')).toHaveLength(rows);
    await m.w.next({ fail: 'providers' });
    expect(tryAgain()).not.toHaveAttribute('data-pending');
  });

  it('a read nobody pressed for leaves the button as it was', async () => {
    let cat: ModelCatalogue | null = null;
    const m = await mount({ fail: 'providers' }, { onCat: (c) => { cat = c; } });
    await act(async () => { cat!.retry(); });
    await flush();
    expect(cat!.reading).toBe(true);
    expect(tryAgain()).not.toHaveAttribute('data-pending');
    await m.w.next({ fail: 'providers' });
  });
});

describe('ModelChooser: a Hoody AI model with no name to show, in the setup step', () => {
  const NEEDS = { hoody: 'needs_key', hidden: true } as const;
  async function openHidden(p: Partial<HostProps> = {}) {
    const m = await mount(NEEDS, { value: HIDDEN, ...p });
    await userEvent.click(screen.getByRole('button', { name: 'Set up Hoody AI' }));
    return m;
  }
  const saveHoody = async () => {
    await userEvent.type(screen.getByLabelText(/Hoody AI API key/), 'sk-test-1');
    await userEvent.click(screen.getByRole('button', { name: 'Check and save' }));
    await waitFor(() => expect(stepText()).toMatch(/^Key saved\./));
    await flush();
  };
  const noSpec = () => expect(document.body.textContent).not.toContain(HIDDEN);

  it('the step is titled for "this model"', async () => {
    await openHidden();
    expect(screen.getByRole('heading', { level: 4, name: 'Set up Hoody AI to use this model' })).toBeInTheDocument();
    noSpec();
  });

  it('chosen: "This model is ready and chosen."', async () => {
    const m = await openHidden();
    await saveHoody();
    await m.w.next({ hidden: true, ready: [FREE, HIDDEN] });
    expect(stepText()).toBe('This model is ready and chosen.');
    noSpec();
  });

  it('not ready yet: "…but this model isn\'t ready yet."', async () => {
    const m = await openHidden();
    await saveHoody();
    await m.w.next({ hidden: true, ready: [FREE] });
    expect(stepText()).toBe("Hoody AI is set up, but this model isn't ready yet.");
    noSpec();
  });

  it('ready but not usable here: "This model is ready, but can\'t be used here."', async () => {
    const m = await openHidden();
    m.rerender(<Host w={m.w} onChoose={m.onChoose} value={HIDDEN} rules={providers.rulesFor('explain')} purpose="explain" />);
    await saveHoody();
    await m.w.next({ hidden: true, hoodyNoCap: true, ready: [FREE, HIDDEN] });
    expect(stepText()).toBe("This model is ready, but can't be used here. Choose another model.");
    noSpec();
  });
});
