// The catalogue bundle's runs are bound to their key: every read of a run goes to
// the key's own computer under the context captured for it, with the run's abort signal; a run under an obsolete
// context sends nothing; a run the last observer left gives no bundle. Real TanStack, real core context, a fake
// api() that answers when the test says (and, like core's, refuses a dead context or an aborted signal).
import { act, renderHook } from '@testing-library/react';
import { createElement, StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiMod from '../api';
import type * as CtxMod from '../ctx';
import type { CallInput, Route } from '../routes';

interface Sent {
  path: string;
  what: 'providers' | 'models' | 'ready' | 'auth';
  to: string | null;
  bound: boolean;
  signal: boolean;
  resolve: (body: unknown) => void;
  reject: (e: unknown) => void;
}
const W = vi.hoisted(() => ({ sent: [] as Sent[] }));

vi.mock('../api', async (orig) => {
  const real = await orig<typeof ApiMod>();
  const ctxMod = await import('../ctx');
  return {
    ...real,
    api: (route: Route, input: CallInput) => {
      const ctx = input.ctx ?? ctxMod.capture(input.target);
      if (!ctxMod.alive(ctx) || input.signal?.aborted) return Promise.reject({ stale: true });
      const ready = Boolean((input.query as Record<string, unknown> | undefined)?.ready);
      const what = route.path === '/providers' ? 'providers' : route.path === '/models' ? (ready ? 'ready' : 'models') : 'auth';
      return new Promise((resolve, reject) => {
        W.sent.push({ path: route.path, what, to: (input.target ?? ctx.target)?.container.id ?? null, bound: !!input.ctx, signal: !!input.signal, resolve, reject });
        input.signal?.addEventListener('abort', () => reject({ cancelled: true }));
      });
    },
  };
});

// The test setup has loaded core already: load the bundle again so it sends through the mock, with its own context.
vi.resetModules();
const ctx = (await import('../ctx')) as typeof CtxMod;
const env = await import('../test/env');
const { queryClient } = await import('../query');
const { onlineManager } = await import('@tanstack/react-query');
const { useCatalogueBundle, runBundle, boundReader, CatalogueStale } = await import('./bundle');

const T = (id: string) => ({ project: { id: 'p' }, container: { id } });
const st = (state: string) => ({ state, via: 'stored_key', methods: ['api_key'], alternatives: {}, output_cap: true, shares_with: [] });
// An agent that reports provider status, per computer: each has one model of its own.
const providersOf = (c: string) => ({ providers: [{ id: 'openai', prefix: 'openai/', display_name: 'OpenAI', status: st('ready') }], c });
const modelsOf = (c: string) => ({ models: [{ spec: `openai/only-${c}` }] });
const readyOf = (c: string) => ({ models: [{ spec: `openai/only-${c}` }] });
// An agent without provider status (its catalogue is probed).
const LEGACY_P = { providers: [{ id: 'openai', prefix: 'openai/', display_name: 'OpenAI' }, { id: 'anthropic', prefix: 'anthropic/', display_name: 'Anthropic' }] };
const LEGACY_M = { models: [{ spec: 'openai/gpt-5' }, { spec: 'anthropic/claude' }] };

const tick = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
  });
/** Answers every open call of `what` to computer `to`. */
async function answer(to: string, a: Partial<Record<Sent['what'], unknown>>) {
  for (const s of W.sent.splice(0)) {
    const body = s.to === to ? a[s.what] : undefined;
    if (body === undefined) W.sent.push(s);
    else s.resolve(body);
  }
  await tick();
}
const keyOf = (id: string) => queryClient.getQueryCache().findAll({ predicate: (q) => q.queryKey[4] === 'providers.catalogue-bundle' && (q.queryKey[5] as { container: { id: string } } | null)?.container.id === id });
const shownModels = (b: { data?: { snap: { cat: { models: Array<{ spec: string }> } } } }) => b.data?.snap.cat.models.map((m) => m.spec) ?? null;

const strict = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);
const mount = (computer: string, wrapper?: typeof strict) =>
  renderHook(({ c }: { c: string | null }) => useCatalogueBundle(c === null ? null : T(c)), { initialProps: { c: computer as string | null }, wrapper });

beforeEach(() => {
  env.boot({ target: T('A') });
  W.sent = [];
  queryClient.clear();
  onlineManager.setOnline(true);
  // The Hub's provider mounts the client (online and focus events reach its queries).
  queryClient.mount();
});
afterEach(() => {
  queryClient.unmount();
  onlineManager.setOnline(true);
});

describe.each([['plain', undefined], ['StrictMode', strict]] as const)('the bundle is bound to its key (%s)', (_n, wrapper) => {
  // The sequence: a reload paused offline, a switch, reconnecting, then back to the first computer.
  async function pausedReloadThenSwitch(keepA: boolean) {
    const h = mount('A', wrapper);
    // Another reader of the same computer (another part of the Hub) keeps A's query observed, so its paused run resumes.
    const other = keepA ? mount('A', wrapper) : null;
    await tick();
    await answer('A', { providers: providersOf('A'), models: modelsOf('A'), ready: readyOf('A') });
    expect(shownModels(h.result.current)).toEqual(['openai/only-A']);
    onlineManager.setOnline(false);
    await act(async () => {
      void h.result.current.refetch();
    });
    await tick();
    expect(W.sent).toEqual([]);
    ctx.setTarget(T('B'));
    h.rerender({ c: 'B' });
    await tick();
    onlineManager.setOnline(true);
    await tick();
    return { h, other };
  }

  it('a reload paused offline, a switch, reconnecting: a run that resumes reads its own computer, never the current one; returning shows only its models', async () => {
    const { h, other } = await pausedReloadThenSwitch(true);
    // A's resumed run and B's run each read their own computer, under their own context and signal.
    expect(W.sent.filter((s) => s.to === 'A').map((s) => s.what).sort()).toEqual(['models', 'providers', 'ready']);
    expect(W.sent.filter((s) => s.to === 'B').map((s) => s.what).sort()).toEqual(['models', 'providers', 'ready']);
    expect(W.sent.every((s) => s.bound && s.signal)).toBe(true);
    await answer('B', { providers: providersOf('B'), models: modelsOf('B'), ready: readyOf('B') });
    await answer('A', { providers: providersOf('A2'), models: modelsOf('A2'), ready: readyOf('A2') });
    expect(shownModels(h.result.current)).toEqual(['openai/only-B']);
    expect(shownModels(other!.result.current)).toEqual(['openai/only-A2']);
    ctx.setTarget(T('A'));
    h.rerender({ c: 'A' });
    await tick();
    expect(shownModels(h.result.current)).toEqual(['openai/only-A2']);
  });

  it('a reload paused offline, a switch, reconnecting: with nobody reading the first computer its paused run is dropped; returning never shows the other computer', async () => {
    const { h } = await pausedReloadThenSwitch(false);
    expect(W.sent.filter((s) => s.to === 'B').map((s) => s.what).sort()).toEqual(['models', 'providers', 'ready']);
    expect(W.sent.filter((s) => s.to !== 'B')).toEqual([]);
    await answer('B', { providers: providersOf('B'), models: modelsOf('B'), ready: readyOf('B') });
    ctx.setTarget(T('A'));
    h.rerender({ c: 'A' });
    await tick();
    expect(shownModels(h.result.current) ?? []).not.toContain('openai/only-B');
    expect(W.sent.filter((s) => s.to === 'B')).toEqual([]);
  });

  it('an old agent: switching away while the ready read is out sends none of the first computer\'s probes anywhere, and its run gives no bundle', async () => {
    const h = mount('A', wrapper);
    await tick();
    await answer('A', { providers: LEGACY_P, models: LEGACY_M });
    ctx.setTarget(T('B'));
    h.rerender({ c: 'B' });
    await tick();
    // A's ready read is answered after the switch: nothing of A's run may go on.
    await answer('A', { ready: { models: [] } });
    expect(W.sent.filter((s) => s.what === 'auth')).toEqual([]);
    expect(W.sent.filter((s) => s.to === 'A')).toEqual([]);
    expect(keyOf('A')[0]?.state.data).toBeUndefined();
  });
});

describe('the bundle\'s runs', () => {
  it('an old agent: the probes of a run go to its own computer, bound to its context', async () => {
    mount('A');
    await tick();
    await answer('A', { providers: LEGACY_P, models: LEGACY_M, ready: { models: [] } });
    const probes = W.sent.filter((s) => s.what === 'auth');
    expect(probes.length).toBeGreaterThan(0);
    expect(probes.every((s) => s.to === 'A' && s.bound && s.signal)).toBe(true);
  });

  it('no computer: the query stays idle (nothing asked, never an error)', async () => {
    const h = renderHook(() => useCatalogueBundle(null));
    await tick();
    expect(W.sent).toEqual([]);
    expect(h.result.current).toMatchObject({ status: 'pending', fetchStatus: 'idle', isError: false });
  });

  it('unmounting drops the answer of the run that was out', async () => {
    const h = mount('A');
    await tick();
    h.unmount();
    await tick();
    await answer('A', { providers: providersOf('A'), models: modelsOf('A'), ready: readyOf('A') });
    expect(keyOf('A')[0]?.state.data).toBeUndefined();
  });

  it('a run whose key is of another generation, account or realm sends nothing', async () => {
    const signal = new AbortController().signal;
    const s = ctx.snapshot();
    const keys = [
      ['hub', s.account, s.realm, s.gen - 1, 'providers.catalogue-bundle', T('A')],
      ['hub', 'someone-else', s.realm, s.gen, 'providers.catalogue-bundle', T('A')],
      ['hub', s.account, 'other-realm', s.gen, 'providers.catalogue-bundle', T('A')],
    ] as const;
    for (const k of keys) await expect(runBundle(k, signal, boundReader)).rejects.toBeInstanceOf(CatalogueStale);
    expect(W.sent).toEqual([]);
  });

  it('a generation bump while a run reads: the run gives no bundle', async () => {
    const s = ctx.snapshot();
    const run = runBundle(['hub', s.account, s.realm, s.gen, 'providers.catalogue-bundle', T('A')], new AbortController().signal, boundReader).then(
      () => null,
      (e: unknown) => e,
    );
    await tick();
    expect(W.sent.map((x) => x.what).sort()).toEqual(['models', 'providers', 'ready']);
    ctx.bump('test');
    await answer('A', { providers: providersOf('A'), models: modelsOf('A'), ready: readyOf('A') });
    expect(await run).toBeInstanceOf(CatalogueStale);
  });
});
