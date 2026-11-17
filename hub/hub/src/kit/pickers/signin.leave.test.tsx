// Leaving a sign-in step while its job runs (the drawer closed, Back, the Key
// choice) cancels that job, and the cancel's answer is read, never dropped. Cancelled, or a job whose end says it saved
// nothing or signed in: nothing more to say (a later read of the provider shows a stored sign-in). Neither known (the
// cancel's answer lost and the job's end unreadable, or the job still open): the C9 unknown toast, whose Check again
// only reads the job's end, never starts or cancels anything, and closes once that end is known. All of it belongs to
// the scope the step ran in (account, realm, computer): once that ends, nothing shows and an open toast closes.
import type { providers } from '@core';
import { setTarget, snapshot } from '@core/ctx';
import { boot } from '@core/test/env';
import { act, render, screen } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ToastModule from '../states/Toast';
import formStrings from '../forms/forms.strings.en.json';
import { OpenRouterSetup } from './OpenRouterSetup';
import { ChatGptSetup } from './ProviderSetup';
import strings from './ProviderSetup.strings.en.json';

type Shown = { title: string; body?: string; tone?: string; action?: { label: string; onAction: () => unknown } };
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

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  toasts.shown.length = 0;
  toasts.closed.length = 0;
});

type Settled = providers.Settled<unknown>;
const ok = (body: unknown = {}): Settled => ({ ok: true, body });
const lost = (): Settled => ({ ok: false, err: { kind: 'pending', code: '', status: 0, retryAfter: null, details: {} } });
const bad = (): Settled => ({ ok: false, err: { kind: 'failed', code: 'internal', status: 500, retryAfter: null, details: {} } });
const tick = () => act(async () => new Promise((r) => setTimeout(r, 5)));

type Name = 'pkceStart' | 'pkcePoll' | 'pkceCancel' | 'oauthStart' | 'oauthPoll' | 'oauthCancel' | 'auth';
type Answer = Settled | (() => Promise<Settled>);

/** A scripted Api: each call takes the next answer of its queue (the last repeats); `swap` replaces a queue later. */
function fake(script: Partial<Record<Name, Answer[]>>) {
  const calls: Array<{ name: Name; args: unknown[] }> = [];
  const used = new Map<Name, number>();
  const q = { ...script };
  const answer = (name: Name, args: unknown[]) => {
    calls.push({ name, args });
    const list = q[name] ?? [name === 'auth' ? ok({ auth: { oauth_stored: false } }) : ok()];
    const i = Math.min(used.get(name) ?? 0, list.length - 1);
    used.set(name, (used.get(name) ?? 0) + 1);
    const a = list[i]!;
    return typeof a === 'function' ? a() : Promise.resolve(a);
  };
  const api = Object.fromEntries((['pkceStart', 'pkcePoll', 'pkceCancel', 'oauthStart', 'oauthPoll', 'oauthCancel', 'auth', 'pkceCode'] as const).map((n) => [n, (...a: unknown[]) => answer(n as Name, a)])) as unknown as providers.ProvidersApi;
  const count = (n: Name) => calls.filter((c) => c.name === n).length;
  /** From now on `name` answers `list` (its earlier answers are spent). */
  const swap = (name: Name, list: Answer[]) => {
    q[name] = list;
    used.set(name, 0);
  };
  return { api, calls, count, swap };
}

// The poll waits after each read until the test ends, so the step stays waiting.
const env: providers.Env = {
  sleep: (ms) => (ms === 0 ? Promise.resolve() : new Promise<void>(() => undefined)),
  now: () => 0,
  hidden: () => false,
  visible: () => Promise.resolve(),
  newKey: () => 'k-1',
  digest: () => Promise.resolve(null),
  alive: () => true,
};

const AUTH = 'https://openrouter.ai/auth?code_challenge=abc';
const pendingOr = () => ok({ state: 'pending', needs_code: true, verification_uri: AUTH });
const pendingGpt = () => ok({ state: 'pending', user_code: 'ABCD-1234' });
const title = (provider: string) => (strings as Record<string, string>)['left.title']?.replace('{{provider}}', provider);

/** The OpenRouter step, waiting on job j1. */
async function openRouter(over: Partial<Record<Name, Answer[]>>) {
  const f = fake({ pkceStart: [ok({ job_id: 'j1', verification_uri: AUTH })], pkcePoll: [pendingOr()], ...over });
  const onSigned = vi.fn();
  const view = render(<OpenRouterSetup api={f.api} env={env} onSigned={onSigned} onBack={vi.fn()} />);
  await screen.findByText(strings['or.step3']);
  return { ...f, view, onSigned };
}

/** The ChatGPT step, waiting on job j1. */
async function chatGpt(over: Partial<Record<Name, Answer[]>>) {
  const f = fake({ oauthStart: [ok({ job_id: 'j1', user_code: 'ABCD-1234', verification_uri: 'https://auth.openai.com/codex/device' })], oauthPoll: [pendingGpt()], ...over });
  const onConnected = vi.fn();
  const view = render(<ChatGptSetup api={f.api} env={env} providerId="openai" providerLabel="OpenAI" onConnected={onConnected} onBack={vi.fn()} />);
  await screen.findByText(strings['gpt.steps']);
  return { ...f, view, onConnected };
}

const shown = () => toasts.shown.map(({ c }) => [c.title, c.tone, c.action?.label]);

describe('leaving a sign-in step reads its cancel', () => {
  it('OpenRouter: a lost cancel whose job is still open leaves the unknown toast; Check again only reads the job, and closes on its end', async () => {
    const f = await openRouter({ pkceCancel: [lost()] });
    const before = f.count('pkcePoll');
    f.view.unmount();
    await tick();
    expect(shown()).toEqual([[title('OpenRouter'), 'unknown', formStrings['outcome.check']]]);
    expect(toasts.shown[0]!.c.body).toBe(strings['left.body' as keyof typeof strings]);
    // The leave read the job's end once after its lost cancel.
    expect(f.count('pkcePoll')).toBe(before + 1);
    expect(f.count('pkceCancel')).toBe(1);

    // Still open: the toast stays as it was (no "couldn't check"); unreadable: "couldn't check"; ended complete: closes.
    const check = toasts.shown[0]!.c.action!.onAction;
    expect(await check()).toBeUndefined();
    f.swap('pkcePoll', [bad()]);
    expect(await check()).toBe(false);
    f.swap('pkcePoll', [ok({ state: 'complete' })]);
    expect(await check()).toBe(true);
    expect(f.count('pkcePoll')).toBe(before + 4);
    expect(f.count('pkceStart')).toBe(1);
    expect(f.count('pkceCancel')).toBe(1);
    expect(f.onSigned).not.toHaveBeenCalled();
  });

  // Closed while the start was on its way: the job the start then names is this attempt's, and its cancel is read the same way.
  for (const [name, cancel, toast] of [['lost, its job still open', lost(), true], ['answered', ok({ state: 'cancelled' }), false]] as const) {
    it(`OpenRouter: closed before the start answered, the late job's cancel ${name}: ${toast ? 'the unknown toast' : 'nothing shows'}`, async () => {
      let answerStart: (a: Settled) => void = () => undefined;
      const f = fake({ pkceStart: [() => new Promise<Settled>((r) => (answerStart = r))], pkcePoll: [pendingOr()], pkceCancel: [cancel] });
      const view = render(<OpenRouterSetup api={f.api} env={env} onSigned={vi.fn()} onBack={vi.fn()} />);
      await tick();
      expect(f.count('pkceStart')).toBe(1);
      view.unmount();
      await act(async () => answerStart(ok({ job_id: 'j1', verification_uri: AUTH })));
      await tick();
      expect(f.count('pkceCancel')).toBe(1);
      expect(shown()).toEqual(toast ? [[title('OpenRouter'), 'unknown', formStrings['outcome.check']]] : []);
      expect(f.count('pkceStart')).toBe(1);
      if (toast) {
        f.swap('pkcePoll', [ok({ state: 'complete' })]);
        expect(await toasts.shown[0]!.c.action!.onAction()).toBe(true);
        expect(f.count('pkceStart')).toBe(1);
        expect(f.count('pkceCancel')).toBe(1);
      }
    });
  }

  it('OpenRouter: a job that ended cancelled also closes the toast', async () => {
    const f = await openRouter({ pkceCancel: [lost()] });
    f.view.unmount();
    await tick();
    f.swap('pkcePoll', [ok({ state: 'cancelled' })]);
    expect(await toasts.shown[0]!.c.action!.onAction()).toBe(true);
  });

  it('OpenRouter: a cancel answered, or a lost one whose job read says how it ended, shows nothing', async () => {
    for (const [cancel, end] of [[ok({ state: 'cancelled' }), null], [ok({ state: 'complete' }), null], [lost(), ok({ state: 'cancelled' })], [lost(), ok({ state: 'complete' })]] as const) {
      const f = await openRouter({ pkceCancel: [cancel] });
      if (end) f.swap('pkcePoll', [end]);
      f.view.unmount();
      await tick();
      expect(toasts.shown).toEqual([]);
    }
  });

  it('OpenRouter: another computer before the answer shows nothing; one after it closes the toast', async () => {
    const first = snapshot().target;
    let let_go: (a: Settled) => void = () => undefined;
    const f = await openRouter({ pkceCancel: [() => new Promise<Settled>((r) => (let_go = r))] });
    const polls = f.count('pkcePoll');
    f.view.unmount();
    act(() => setTarget({ project: { id: 'p9' }, container: first?.container ?? { id: 'c9' } } as Parameters<typeof setTarget>[0]));
    await act(async () => let_go(lost()));
    await tick();
    expect(toasts.shown).toEqual([]);
    expect(f.count('pkcePoll')).toBe(polls);
    act(() => setTarget(first));

    const g = await openRouter({ pkceCancel: [lost()] });
    g.view.unmount();
    await tick();
    expect(toasts.shown.length).toBe(1);
    act(() => setTarget({ project: { id: 'p9' }, container: first?.container ?? { id: 'c9' } } as Parameters<typeof setTarget>[0]));
    await tick();
    expect(toasts.closed).toEqual([toasts.shown[0]!.id]);
    act(() => setTarget(first));
  });

  it('ChatGPT: a lost cancel whose job is still open leaves the unknown toast; Check again only reads the job', async () => {
    const f = await chatGpt({ oauthCancel: [lost()] });
    const before = f.count('oauthPoll');
    f.view.unmount();
    await tick();
    expect(shown()).toEqual([[title('ChatGPT'), 'unknown', formStrings['outcome.check']]]);
    expect(f.count('oauthPoll')).toBe(before + 1);
    const check = toasts.shown[0]!.c.action!.onAction;
    expect(await check()).toBeUndefined();
    f.swap('oauthPoll', [ok({ state: 'complete' })]);
    expect(await check()).toBe(true);
    expect(f.count('oauthStart')).toBe(1);
    expect(f.count('oauthCancel')).toBe(1);
    expect(f.onConnected).not.toHaveBeenCalled();
  });

  it('ChatGPT: a cancel answered, or a lost one whose job read says how it ended, shows nothing', async () => {
    for (const [cancel, end] of [[ok({ state: 'cancelled' }), null], [lost(), ok({ state: 'error' })], [lost(), ok({ state: 'complete' })]] as const) {
      const f = await chatGpt({ oauthCancel: [cancel] });
      if (end) f.swap('oauthPoll', [end]);
      f.view.unmount();
      await tick();
      expect(toasts.shown).toEqual([]);
    }
  });
});
