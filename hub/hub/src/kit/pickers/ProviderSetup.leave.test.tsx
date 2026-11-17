// A key step that goes (the drawer closed on an unknown outcome, a scope change, a parent
// reset, an unmount) never takes its save's outcome with it (C9). In flight, the step leaves the unknown toast, which
// follows the send: a proved save closes it, a refusal replaces it, and its Check again reads the answer, then the
// fingerprint. Unknown (not confirmed), the footer's leave toast keeps a Check again that still reads after the step went.
import type { providers } from '@core';
import { setTarget, snapshot } from '@core/ctx';
import { boot } from '@core/test/env';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as FlowsKey from '@core/providers/flows-key';
import type * as ToastModule from '../states/Toast';
import formStrings from '../forms/forms.strings.en.json';
import { Drawer } from '../overlays/Drawer';
import overlayStrings from '../overlays/strings.en.json';
import { ProviderSetup } from './ProviderSetup';
import strings from './ProviderSetup.strings.en.json';

type Shown = { title: string; body?: string; tone?: string; action?: { onAction: () => unknown } };
const toasts = vi.hoisted(() => ({ shown: [] as Array<{ id: string; c: Shown }>, closed: [] as string[] }));
vi.mock('../states/Toast', async (orig) => ({
  ...(await orig<typeof ToastModule>()),
  showToast: (c: Shown) => {
    const id = `t${toasts.shown.length + 1}`;
    toasts.shown.push({ id, c });
    return id;
  },
  closeToast: (id: string) => void toasts.closed.push(id),
}));

// Every scope watch a send opens, and whether it was stopped (a watch that ends with its scope stops itself).
const watches = vi.hoisted(() => [] as Array<{ stopped: boolean; ended: boolean }>);
vi.mock('@core/providers/flows-key', async (orig) => {
  const m = await orig<typeof FlowsKey>();
  return {
    ...m,
    watchStepScope: (sc: Parameters<typeof m.watchStepScope>[0], onEnd?: () => void) => {
      const w = { stopped: false, ended: false };
      watches.push(w);
      const stop = m.watchStepScope(sc, () => {
        w.ended = true;
        onEnd?.();
      });
      return () => {
        w.stopped = true;
        stop();
      };
    },
  };
});
const openWatches = () => watches.filter((w) => !w.stopped && !w.ended).length;

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  toasts.shown.length = 0;
  toasts.closed.length = 0;
  watches.length = 0;
});

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const err = (kind: providers.Outcome['kind'], code = '', status = 0): Settled => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });

function fakeApi(over: Partial<providers.ProvidersApi> = {}): providers.ProvidersApi {
  const none = () => Promise.resolve(err('failed', 'unexpected', 500));
  return {
    version: none,
    providers: none,
    provider: none,
    auth: none,
    catalogue: () => Promise.resolve(err('failed', 'unexpected', 500)) as Promise<providers.Settled<providers.Catalogue>>,
    oauthPoll: none,
    pkcePoll: none,
    pkceStart: none,
    pkceCode: none,
    pkceCancel: none,
    keyPut: none,
    keyDelete: none,
    authTest: none,
    authDefault: none,
    oauthStart: none,
    oauthCancel: none,
    signOut: none,
    ...over,
  };
}
const env: providers.Env = {
  sleep: () => Promise.resolve(),
  now: () => 0,
  hidden: () => false,
  visible: () => Promise.resolve(),
  newKey: () => 'k-1',
  digest: () => Promise.resolve('fp-1'),
  alive: () => true,
};
/** The computer the api sends to: each key save is held on its credential there. */
const AT = { project: 'p1', computer: 'c1' };
const unknownTitle = formStrings['outcome.toastTitle'];
const leftRefused = strings['key.leftRefused'].replace('{{provider}}', 'OpenAI');
const tick = () => act(async () => new Promise((r) => setTimeout(r, 5)));

// The step under a parent that can drop it (Leave), and drops it itself once connected.
function Host({ api, onConnected }: { api: providers.ProvidersApi; onConnected?: () => void }) {
  const [shown, setShown] = useState(true);
  return (
    <>
      {shown && (
        <ProviderSetup
          api={api}
          env={env}
          providerId="openai"
          providerLabel="OpenAI"
          at={AT}
          onConnected={() => {
            onConnected?.();
            setShown(false);
          }}
        />
      )}
      <button type="button" onClick={() => setShown(false)}>
        Leave
      </button>
    </>
  );
}

async function sendThenLeave(api: providers.ProvidersApi) {
  render(<Host api={api} />);
  await userEvent.type(screen.getByLabelText(/OpenAI API key/), 'sk-test-1');
  await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
  await act(async () => screen.getByRole('button', { name: 'Leave' }).click());
  await tick();
}

function heldPut() {
  let answer: (s: Settled) => void = () => {};
  const keyPut = vi.fn(() => new Promise<Settled>((r) => (answer = r)));
  return { keyPut, answer: (s: Settled) => act(async () => answer(s)) };
}

describe('KeySetup: the step goes while its save is in flight', () => {
  it('leaves the unknown toast, never failed; a proved save closes it', async () => {
    const put = heldPut();
    await sendThenLeave(fakeApi({ keyPut: put.keyPut }));
    expect(put.keyPut).toHaveBeenCalledTimes(1);
    expect(toasts.shown.map((x) => [x.c.title, x.c.tone])).toEqual([[unknownTitle, 'unknown']]);
    await put.answer(ok({ check: 'valid' }));
    await tick();
    expect(toasts.closed, 'the proved save closes the unknown toast').toEqual(['t1']);
    expect(toasts.shown).toHaveLength(1);
  });

  it("the toast's Check again waits for the send's answer and proves it", async () => {
    const put = heldPut();
    await sendThenLeave(fakeApi({ keyPut: put.keyPut }));
    const check = toasts.shown[0]?.c.action?.onAction;
    expect(check).toBeTypeOf('function');
    const read = check?.() as Promise<boolean>;
    await put.answer(ok({ check: 'inconclusive' }));
    await expect(read).resolves.toBe(true);
  });

  it('a refusal that answers after the step went replaces the unknown toast with the refusal', async () => {
    const put = heldPut();
    await sendThenLeave(fakeApi({ keyPut: put.keyPut }));
    await put.answer(err('failed', 'api_key_refused', 422));
    await tick();
    expect(toasts.closed).toEqual(['t1']);
    expect(toasts.shown.map((x) => [x.c.title, x.c.tone])).toEqual([
      [unknownTitle, 'unknown'],
      [leftRefused, 'error'],
    ]);
    expect(toasts.shown[1]?.c.body, 'the fix is in the body').toBe(strings['key.leftBody'].replace('{{provider}}', 'OpenAI'));
  });

  it('a lost answer stays unknown; Check again then reads the fingerprint', async () => {
    const put = heldPut();
    let stored = 'fp-old';
    const auth = vi.fn(() => Promise.resolve(ok({ auth: { api_key_fingerprint: stored } })));
    await sendThenLeave(fakeApi({ keyPut: put.keyPut, auth }));
    await put.answer(err('pending', 'timeout'));
    await tick();
    expect(toasts.closed, 'not confirmed keeps the unknown toast').toEqual([]);
    const check = toasts.shown[0]?.c.action?.onAction as () => Promise<boolean>;
    await expect(check()).resolves.toBe(false);
    stored = 'fp-1';
    await expect(check()).resolves.toBe(true);
  });

  it('answered while the step is up: no toast, even when the step goes in the same commit (connected)', async () => {
    const put = heldPut();
    const onConnected = vi.fn();
    render(<Host api={fakeApi({ keyPut: put.keyPut })} onConnected={onConnected} />);
    await userEvent.type(screen.getByLabelText(/OpenAI API key/), 'sk-test-1');
    await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
    await put.answer(ok({ check: 'valid' }));
    await waitFor(() => expect(onConnected).toHaveBeenCalled());
    await tick();
    expect(screen.queryByLabelText(/OpenAI API key/)).toBeNull();
    expect(toasts.shown).toEqual([]);
  });
});

describe('KeySetup: the step goes while its outcome is unknown', () => {
  it("the footer's leave toast keeps a Check again that reads after the step went", async () => {
    let stored = 'fp-old';
    const auth = vi.fn(() => Promise.resolve(ok({ auth: { api_key_fingerprint: stored } })));
    render(<Host api={fakeApi({ keyPut: () => Promise.resolve(err('pending', 'timeout')), auth })} />);
    await userEvent.type(screen.getByLabelText(/OpenAI API key/), 'sk-test-1');
    await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
    await screen.findByText(strings['key.notConfirmed']);
    expect(toasts.shown).toEqual([]);
    await act(async () => screen.getByRole('button', { name: 'Leave' }).click());
    await tick();
    expect(toasts.shown.map((x) => [x.c.title, x.c.tone])).toEqual([[unknownTitle, 'unknown']]);
    const check = toasts.shown[0]?.c.action?.onAction as () => Promise<boolean>;
    await expect(check()).resolves.toBe(false);
    stored = 'fp-1';
    const reads = auth.mock.calls.length;
    await expect(check(), 'a read after the step went proves the save').resolves.toBe(true);
    expect(auth.mock.calls.length).toBe(reads + 1);
  });
});

// The model chooser's env: its alive() is the step's (stepAlive), false once the step went. The toast the step leaves
// must still read and settle in the scope the send began in (account, realm, computer), never on the step's env.
function StepHost({ api, endpoint = false }: { api: providers.ProvidersApi; endpoint?: boolean }) {
  const [shown, setShown] = useState(true);
  const [stepEnv] = useState(() => {
    const e = { ...env, up: true };
    return Object.assign(e, { alive: () => e.up });
  });
  return (
    <>
      {shown && (
        <ProviderSetup
          api={api}
          env={stepEnv}
          providerId={endpoint ? 'my-ep' : 'openai'}
          providerLabel={endpoint ? 'My endpoint' : 'OpenAI'}
          endpoint={endpoint}
          at={AT}
          onConnected={() => setShown(false)}
        />
      )}
      <button
        type="button"
        onClick={() => {
          stepEnv.up = false;
          setShown(false);
        }}
      >
        Leave
      </button>
    </>
  );
}
const epDef = () => ok({ provider: { id: 'my-ep', display_name: 'My endpoint', definition_rev: 'rev-7', custom_definition: { base_url: 'https://x.example' } } });

async function sendThenLeaveStep(api: providers.ProvidersApi, endpoint = false) {
  render(<StepHost api={api} endpoint={endpoint} />);
  const label = endpoint ? /My endpoint API key/ : /OpenAI API key/;
  await userEvent.type(await screen.findByLabelText(label), 'sk-test-1');
  await waitFor(() => expect(screen.getByRole('button', { name: strings['key.save'] })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
  await act(async () => screen.getByRole('button', { name: 'Leave' }).click());
  await tick();
}

describe("KeySetup: the step's env dies with the step, its toast does not", () => {
  it('a lost answer after the step went: Check again reads the fingerprint in the send scope', async () => {
    const put = heldPut();
    let stored = 'fp-old';
    const auth = vi.fn(() => Promise.resolve(ok({ auth: { api_key_fingerprint: stored } })));
    await sendThenLeaveStep(fakeApi({ keyPut: put.keyPut, auth }));
    await put.answer(err('pending', 'timeout'));
    await tick();
    expect(toasts.closed, 'unknown stays unknown').toEqual([]);
    const check = toasts.shown[0]?.c.action?.onAction as () => Promise<boolean>;
    await expect(check()).resolves.toBe(false);
    stored = 'fp-1';
    await expect(check(), 'the read proves the save although the step env is dead').resolves.toBe(true);
  });

  it('a refusal after the step went replaces the unknown toast with the refusal', async () => {
    const put = heldPut();
    await sendThenLeaveStep(fakeApi({ keyPut: put.keyPut }));
    await put.answer(err('failed', 'api_key_refused', 422));
    await tick();
    expect(toasts.closed).toEqual(['t1']);
    expect(toasts.shown.map((x) => [x.c.title, x.c.tone])).toEqual([
      [unknownTitle, 'unknown'],
      [leftRefused, 'error'],
    ]);
  });

  it('an endpoint refusal after the step went replaces the unknown toast too', async () => {
    const put = heldPut();
    await sendThenLeaveStep(fakeApi({ provider: () => Promise.resolve(epDef()), keyPut: put.keyPut }), true);
    expect(put.keyPut).toHaveBeenCalledTimes(1);
    await put.answer(err('failed', 'api_key_refused', 422));
    await tick();
    expect(toasts.closed).toEqual(['t1']);
    expect(toasts.shown.map((x) => x.c.tone)).toEqual(['unknown', 'error']);
  });

  it("an endpoint's lost answer after the step went: Check again proves the save", async () => {
    const put = heldPut();
    const auth = vi.fn(() => Promise.resolve(ok({ auth: { api_key_fingerprint: 'fp-1' } })));
    await sendThenLeaveStep(fakeApi({ provider: () => Promise.resolve(epDef()), keyPut: put.keyPut, auth }), true);
    await put.answer(err('pending', 'timeout'));
    await tick();
    const check = toasts.shown[0]?.c.action?.onAction as () => Promise<boolean>;
    await expect(check()).resolves.toBe(true);
  });

  it("the footer's leave toast reads after the step went, on a dead step env", async () => {
    let stored = 'fp-old';
    const auth = vi.fn(() => Promise.resolve(ok({ auth: { api_key_fingerprint: stored } })));
    render(<StepHost api={fakeApi({ keyPut: () => Promise.resolve(err('pending', 'timeout')), auth })} />);
    await userEvent.type(screen.getByLabelText(/OpenAI API key/), 'sk-test-1');
    await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
    await screen.findByText(strings['key.notConfirmed']);
    await act(async () => screen.getByRole('button', { name: 'Leave' }).click());
    await tick();
    const check = toasts.shown[0]?.c.action?.onAction as () => Promise<boolean>;
    stored = 'fp-1';
    const reads = auth.mock.calls.length;
    await expect(check()).resolves.toBe(true);
    expect(auth.mock.calls.length).toBe(reads + 1);
  });

  it('another computer ends the send scope: Check again reads nothing and a late refusal adds no toast', async () => {
    const put = heldPut();
    const auth = vi.fn(() => Promise.resolve(ok({ auth: { api_key_fingerprint: 'fp-1' } })));
    await sendThenLeaveStep(fakeApi({ keyPut: put.keyPut, auth }));
    act(() => setTarget({ project: { id: 'p9' }, container: { id: 'c9' } }));
    expect(toasts.closed, "the scope's end closes its leave toast").toEqual(['t1']);
    await put.answer(err('failed', 'api_key_refused', 422));
    await tick();
    expect(toasts.shown.map((x) => x.c.tone), 'no refusal toast for a scope that ended').toEqual(['unknown']);
    const check = toasts.shown[0]?.c.action?.onAction as () => Promise<boolean>;
    const reads = auth.mock.calls.length;
    await expect(check()).resolves.toBe(false);
    expect(auth.mock.calls.length).toBe(reads);
  });
});

// The send watches its scope, so a computer switched away and back before anything asks
// still ends it; a read whose answer comes after its scope ended proves nothing.
describe('KeySetup: a send scope that ended and came back stays ended', () => {
  const away = () => {
    const first = snapshot().target;
    act(() => setTarget({ project: { id: 'p9' }, container: { id: 'c9' } }));
    act(() => setTarget(first));
  };

  it('another computer and back while the PUT is out: the toast closes, a late refusal adds none', async () => {
    const put = heldPut();
    const auth = vi.fn(() => Promise.resolve(ok({ auth: { api_key_fingerprint: 'fp-1' } })));
    await sendThenLeaveStep(fakeApi({ keyPut: put.keyPut, auth }));
    away();
    expect(toasts.closed).toEqual(['t1']);
    await put.answer(err('failed', 'api_key_refused', 422));
    await tick();
    expect(toasts.shown.map((x) => x.c.tone), 'no refusal for an ended scope').toEqual(['unknown']);
    const check = toasts.shown[0]?.c.action?.onAction as () => Promise<boolean>;
    const reads = auth.mock.calls.length;
    await expect(check(), 'Check again in an ended scope proves nothing').resolves.toBe(false);
    expect(auth.mock.calls.length).toBe(reads);
  });

  it('another computer and back, then a late success: nothing settles for the ended scope', async () => {
    const put = heldPut();
    await sendThenLeaveStep(fakeApi({ keyPut: put.keyPut }));
    away();
    await put.answer(ok({ check: 'valid' }));
    await tick();
    const check = toasts.shown[0]?.c.action?.onAction as () => Promise<boolean>;
    await expect(check(), 'a success in an ended scope does not prove this toast').resolves.toBe(false);
    expect(toasts.shown).toHaveLength(1);
  });

  it("the footer's Check again: a scope that ends while its read is out proves nothing", async () => {
    let answer: (s: Settled) => void = () => {};
    let hold = false;
    const auth = vi.fn(() => (hold ? new Promise<Settled>((r) => (answer = r)) : Promise.resolve(ok({ auth: { api_key_fingerprint: 'fp-old' } }))));
    render(<StepHost api={fakeApi({ keyPut: () => Promise.resolve(err('pending', 'timeout')), auth })} />);
    await userEvent.type(screen.getByLabelText(/OpenAI API key/), 'sk-test-1');
    await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
    await screen.findByText(strings['key.notConfirmed']);
    await act(async () => screen.getByRole('button', { name: 'Leave' }).click());
    await tick();
    const check = toasts.shown[0]?.c.action?.onAction as () => Promise<boolean>;
    const reads = auth.mock.calls.length;
    hold = true;
    const res = check();
    await waitFor(() => expect(auth.mock.calls.length).toBe(reads + 1));
    away();
    await act(async () => answer(ok({ auth: { api_key_fingerprint: 'fp-1' } })));
    await expect(res, 'the matching answer came after the scope ended').resolves.toBe(false);
  });
});

// One rule. Every answer path (PUT, Check again, toast) asks the send's scope when it
// applies, and the scope's end retires every toast the step owns and ends the watch.
describe('KeySetup: every answer path asks the send scope, its end retires every toast the step owns', () => {
  const away = () => {
    const first = snapshot().target;
    act(() => setTarget({ project: { id: 'p9' }, container: { id: 'c9' } }));
    act(() => setTarget(first));
  };

  it('a built-in PUT that answers after its scope ended, the step still up: neither success nor refusal applies', async () => {
    for (const answer of [ok({ check: 'valid' }), err('failed', 'api_key_refused', 422)]) {
      const put = heldPut();
      const connected = vi.fn();
      const { unmount } = render(<Host api={fakeApi({ keyPut: put.keyPut })} onConnected={connected} />);
      await userEvent.type(screen.getByLabelText(/OpenAI API key/), 'sk-test-1');
      await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
      away();
      await put.answer(answer);
      await tick();
      expect(connected, 'no success for an ended scope').not.toHaveBeenCalled();
      expect(screen.queryByText(strings['key.refused'].replace('{{provider}}', 'OpenAI')), 'no refusal for an ended scope').toBeNull();
      expect(screen.getByLabelText(/OpenAI API key/), 'the step is free again').toBeEnabled();
      unmount();
    }
  });

  it("the footer's unknown left behind: the scope's end closes its toast", async () => {
    render(<StepHost api={fakeApi({ keyPut: () => Promise.resolve(err('pending', 'timeout')), auth: () => Promise.resolve(ok({ auth: { api_key_fingerprint: 'fp-old' } })) })} />);
    await userEvent.type(screen.getByLabelText(/OpenAI API key/), 'sk-test-1');
    await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
    await screen.findByText(strings['key.notConfirmed']);
    await act(async () => screen.getByRole('button', { name: 'Leave' }).click());
    await tick();
    expect(toasts.shown.map((x) => x.c.tone), 'one leave toast for the unknown').toEqual(['unknown']);
    away();
    expect(toasts.closed).toEqual([toasts.shown[0]?.id]);
    expect(openWatches()).toBe(0);
  });

  it("the scope ends while the footer's unknown is up, then the step goes: no toast for the ended scope", async () => {
    render(<StepHost api={fakeApi({ keyPut: () => Promise.resolve(err('pending', 'timeout')), auth: () => Promise.resolve(ok({ auth: { api_key_fingerprint: 'fp-old' } })) })} />);
    await userEvent.type(screen.getByLabelText(/OpenAI API key/), 'sk-test-1');
    await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
    await screen.findByText(strings['key.notConfirmed']);
    away();
    await tick();
    expect(screen.queryByText(strings['key.notConfirmed']), "the ended scope's unknown line goes").toBeNull();
    await act(async () => screen.getByRole('button', { name: 'Leave' }).click());
    await tick();
    expect(toasts.shown).toEqual([]);
  });

  it('a late success or refusal that settles the leave toast ends the watch with it', async () => {
    for (const answer of [ok({ check: 'valid' }), err('failed', 'api_key_refused', 422)]) {
      watches.length = 0;
      const put = heldPut();
      const { unmount } = render(<StepHost api={fakeApi({ keyPut: put.keyPut })} />);
      await userEvent.type(screen.getByLabelText(/OpenAI API key/), 'sk-test-1');
      await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
      await act(async () => screen.getByRole('button', { name: 'Leave' }).click());
      await tick();
      expect(openWatches(), 'the unknown toast holds the watch').toBe(1);
      await put.answer(answer);
      await tick();
      expect(openWatches(), 'settled: nothing holds it').toBe(0);
      unmount();
    }
  });

  it('a Check again that proves the save after the step went ends the watch', async () => {
    const put = heldPut();
    let stored = 'fp-old';
    const auth = vi.fn(() => Promise.resolve(ok({ auth: { api_key_fingerprint: stored } })));
    await sendThenLeaveStep(fakeApi({ keyPut: put.keyPut, auth }));
    await put.answer(err('pending', 'timeout'));
    await tick();
    const check = toasts.shown[0]?.c.action?.onAction as () => Promise<boolean>;
    await expect(check()).resolves.toBe(false);
    expect(openWatches()).toBe(1);
    stored = 'fp-1';
    await expect(check()).resolves.toBe(true);
    expect(openWatches()).toBe(0);
  });
});

describe('KeySetup inside a drawer with unsaved changes of its own', () => {
  it("the step's unknown outcome does not discard the drawer's changes without asking", async () => {
    function Page() {
      const [open, setOpen] = useState(true);
      return open ? (
        <Drawer resizeKey="test-keysetup-nested" isOpen onOpenChange={setOpen} title="Settings" dirty>
          <ProviderSetup api={fakeApi({ keyPut: () => Promise.resolve(err('pending', 'timeout')), auth: () => Promise.resolve(ok({})) })} env={env} providerId="openai" providerLabel="OpenAI" at={AT} onConnected={() => undefined} />
        </Drawer>
      ) : (
        <p>closed</p>
      );
    }
    const router = createRouter({ routeTree: createRootRoute({ component: Page }), history: createMemoryHistory({ initialEntries: ['/'] }) });
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });
    await userEvent.type(screen.getByLabelText(/OpenAI API key/), 'sk-test-1');
    await userEvent.click(screen.getByRole('button', { name: strings['key.save'] }));
    await screen.findByText(strings['key.notConfirmed']);
    await act(async () => {
      const el = document.activeElement ?? document.body;
      fireEvent.keyDown(el, { key: 'Escape' });
      fireEvent.keyUp(el, { key: 'Escape' });
    });
    expect(screen.queryByText('closed')).toBeNull();
    expect(screen.getByText(overlayStrings.discardAsk)).toBeInTheDocument();
  });
});
