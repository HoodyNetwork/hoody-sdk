// The AI page reads a model as ready only by membership in the ready list of the same read
// (one rule): the catalogue is one bundle per computer (core's useCatalogueBundle: one query, one run of the
// reads), so every ready mark comes from the run that read those providers and models; a failed ready read
// withholds ready.
import { act, renderHook } from '@testing-library/react';
import { queryClient } from '@core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const st = (state: string, via: string) => ({ state, via, methods: ['oauth'], alternatives: {}, output_cap: false, shares_with: [] });
const PROVIDERS = {
  providers: [
    { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: st('ready', 'included') },
    { id: 'openai', prefix: 'openai/', display_name: 'OpenAI', status: st('ready', 'signin') },
  ],
};
// gpt-5-pro is in the catalogue under a ready provider, but the sign-in does not serve it.
const MODELS = { models: [{ spec: 'hoody-ai/hoody-free' }, { spec: 'openai/gpt-5' }, { spec: 'openai/gpt-5-pro' }] };
const READY = { models: [{ spec: 'hoody-ai/hoody-free' }, { spec: 'openai/gpt-5' }] };
const NEW_MODELS = { models: [...MODELS.models, { spec: 'openai/gpt-6' }] };
const NEW_READY = { models: [{ spec: 'hoody-ai/hoody-free' }, { spec: 'openai/gpt-6' }] };

type Settled = { ok: true; body: unknown } | { ok: false; err: unknown };
const FAIL: Settled = { ok: false, err: { kind: 'pending', code: 'server', status: 500, retryAfter: null, details: {} } };
const ok = (body: unknown): Settled => ({ ok: true, body });

// Each Api call is recorded and waits until the test answers it.
interface Call {
  key: 'providers' | 'models' | 'ready' | 'auth';
  answer: (s: Settled) => Promise<void>;
}
const W = vi.hoisted(() => ({
  calls: [] as Array<{ key: string; resolve: (s: unknown) => void }>,
  comp: null as null | { id: string; name: string; realmIds: string[]; selectedRealm: null },
  reads: {} as Record<string, unknown>,
}));
const ask = (key: string) => new Promise((resolve) => W.calls.push({ key, resolve }));
const API = {
  providers: () => ask('providers'),
  models: (q?: { ready?: boolean }) => ask(q?.ready ? 'ready' : 'models'),
  auth: () => ask('auth'),
};
vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return {
    ...real,
    useAiApi: () => API,
    usePageReads: () => W.reads,
    useComputer: () => ({ data: W.comp, error: null, isPending: false, status: 'success', refetch: () => Promise.resolve() }),
    // The run's binding is core's (core/providers/bundle.test.tsx); here every run reads this fake Api.
    useBundleSource: (_api: unknown, shown: string | null) => ({ computer: shown === null ? null : { project: { id: 'p' }, container: { id: shown } }, readerFor: () => API }),
  };
});
const { useAiModel } = await import('./parts/model');

const q = (data: unknown) => ({ data, error: null, isPending: false, isFetching: false, status: 'success', refetch: () => Promise.resolve() });
const pageReads = () => ({ version: q({ version: '1' }), agents: q(undefined), bots: q(undefined), acp: q(undefined), acpDefault: q(undefined), jev: q(undefined), jevModels: q(undefined) });

// The calls made so far (in order), each answerable once.
const calls = (): Call[] =>
  W.calls.map((c) => ({
    key: c.key as Call['key'],
    answer: (s) =>
      act(async () => {
        c.resolve(s);
        // TanStack notifies on a later task: let the run settle and the hook render.
        for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
      }),
  }));
const gen = (n: number) => calls().slice(n * 3, n * 3 + 3);
async function answer(g: Call[], a: { providers?: Settled; models?: Settled; ready?: Settled }) {
  for (const c of g) {
    const s = a[c.key as 'providers' | 'models' | 'ready'];
    if (s) await c.answer(s);
  }
}
const readyOf = (m: ReturnType<typeof useAiModel>, spec: string) => m.models.find((x) => x.spec === spec)?.ready;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  });

beforeEach(() => {
  queryClient.clear();
  W.calls = [];
  W.reads = pageReads();
  W.comp = { id: 'c-atlas', name: 'atlas', realmIds: [], selectedRealm: null };
});

describe('AI page: readiness by the ready list of the same read', () => {
  it('an unserved OpenAI model never reads ready; a listed one does', async () => {
    const h = renderHook(() => useAiModel());
    await flush();
    await answer(gen(0), { providers: ok(PROVIDERS), models: ok(MODELS), ready: ok(READY) });
    expect(readyOf(h.result.current, 'openai/gpt-5')).toBe('ready');
    expect(readyOf(h.result.current, 'openai/gpt-5-pro')).not.toBe('ready');
  });

  it('the accounts read the providers answer of the same run (their status and payment line)', async () => {
    const h = renderHook(() => useAiModel());
    await flush();
    await answer(gen(0), { providers: ok(PROVIDERS), models: ok(MODELS), ready: ok(READY) });
    expect(h.result.current.accounts?.find((a) => a.id === 'openai')).toMatchObject({ status: 'ready', via: 'signin' });
  });

  it('until the ready read answers the catalogue waits (nothing drawn as ready)', async () => {
    const h = renderHook(() => useAiModel());
    await flush();
    await answer(gen(0), { providers: ok(PROVIDERS), models: ok(MODELS) });
    expect(h.result.current.cat).toBeNull();
    expect(h.result.current.models).toEqual([]);
    expect(h.result.current.loads.catalogue).toBe('loading');
    expect(h.result.current.firstLoad).toBe(true);
  });

  it('a failed ready read withholds ready; providers and models stay', async () => {
    const h = renderHook(() => useAiModel());
    await flush();
    await answer(gen(0), { providers: ok(PROVIDERS), models: ok(MODELS), ready: FAIL });
    expect(h.result.current.cat).not.toBeNull();
    expect(h.result.current.loads.catalogue).toBe('ok');
    expect(h.result.current.models.some((x) => x.ready === 'ready')).toBe(false);
  });

  it('a failed providers read with nothing held: the catalogue shows its error', async () => {
    const h = renderHook(() => useAiModel());
    await flush();
    await answer(gen(0), { providers: FAIL, models: ok(MODELS), ready: ok(READY) });
    expect(h.result.current.cat).toBeNull();
    expect(h.result.current.loads.catalogue).toBe('error');
    expect(h.result.current.firstLoad).toBe(false);
  });
});

describe('AI page: one bundle per computer (mount, reload, computer change)', () => {
  it('each run makes its own calls; a reload after a whole bundle asks all three again', async () => {
    const h = renderHook(() => useAiModel());
    await flush();
    expect(calls().map((c) => c.key).sort()).toEqual(['models', 'providers', 'ready']);
    await answer(gen(0), { providers: ok(PROVIDERS), models: ok(MODELS), ready: ok(READY) });
    act(() => h.result.current.reload());
    await flush();
    expect(calls().map((c) => c.key).sort()).toEqual(['models', 'models', 'providers', 'providers', 'ready', 'ready']);
  });

  it('reload while the first run\'s ready read is still out: the bundle is that one run, never mixed', async () => {
    const h = renderHook(() => useAiModel());
    await flush();
    const g0 = gen(0);
    await answer(g0, { providers: ok(PROVIDERS), models: ok(MODELS) });
    act(() => h.result.current.reload());
    await flush();
    // A reload with no bundle yet waits for the run that is out (one run makes the bundle); nothing new is asked.
    expect(calls()).toHaveLength(3);
    expect(h.result.current.cat).toBeNull();
    await answer(g0, { ready: ok(READY) });
    expect(readyOf(h.result.current, 'openai/gpt-5')).toBe('ready');
    expect(readyOf(h.result.current, 'openai/gpt-5-pro')).toBe('unknown');
  });

  it('a reload that restarts a run: the restarted run\'s late answers never reach the bundle', async () => {
    const h = renderHook(() => useAiModel());
    await flush();
    await answer(gen(0), { providers: ok(PROVIDERS), models: ok(MODELS), ready: ok(READY) });
    act(() => h.result.current.reload());
    await flush();
    const g1 = gen(1);
    await answer(g1, { providers: ok(PROVIDERS), models: ok(NEW_MODELS) });
    act(() => h.result.current.reload());
    await flush();
    await answer(gen(2), { providers: ok(PROVIDERS), models: ok(MODELS), ready: ok(READY) });
    // Run 1's ready list (gpt-6) arrives after run 2 made the bundle: dropped.
    await answer(g1, { ready: ok(NEW_READY) });
    expect(readyOf(h.result.current, 'openai/gpt-6')).toBeUndefined();
    expect(readyOf(h.result.current, 'openai/gpt-5')).toBe('ready');
  });

  it('reload: the previous whole read stays until the new generation answers whole, in either order', async () => {
    const h = renderHook(() => useAiModel());
    await flush();
    await answer(gen(0), { providers: ok(PROVIDERS), models: ok(MODELS), ready: ok(READY) });
    const before = h.result.current.cat;
    act(() => h.result.current.reload());
    await flush();
    await answer(gen(1), { ready: ok(NEW_READY) });
    expect(h.result.current.cat).toBe(before);
    await answer(gen(1), { models: ok(NEW_MODELS) });
    expect(h.result.current.cat).toBe(before);
    expect(h.result.current.loads.catalogue).toBe('ok');
    await answer(gen(1), { providers: ok(PROVIDERS) });
    expect(readyOf(h.result.current, 'openai/gpt-6')).toBe('ready');
  });

  it('a bundle changes only when a newer run settles (other reads changing do nothing)', async () => {
    const h = renderHook(() => useAiModel());
    await flush();
    await answer(gen(0), { providers: ok(PROVIDERS), models: ok(MODELS), ready: ok(READY) });
    const cat = h.result.current.cat;
    W.reads = { ...pageReads(), agents: q({ agents: [] }) };
    h.rerender();
    expect(h.result.current.cat).toBe(cat);
    expect(calls()).toHaveLength(3);
  });

  it('a failed reload keeps the earlier whole read shown', async () => {
    const h = renderHook(() => useAiModel());
    await flush();
    await answer(gen(0), { providers: ok(PROVIDERS), models: ok(MODELS), ready: ok(READY) });
    act(() => h.result.current.reload());
    await flush();
    await answer(gen(1), { providers: FAIL, models: ok(MODELS), ready: ok(READY) });
    expect(readyOf(h.result.current, 'openai/gpt-5')).toBe('ready');
    expect(h.result.current.loads.catalogue).toBe('ok');
  });

  it('another computer: loading until its own generation answers; the previous computer\'s late answer never lands', async () => {
    const h = renderHook(() => useAiModel());
    await flush();
    const g0 = gen(0);
    await answer(g0, { providers: ok(PROVIDERS), models: ok(MODELS) });
    W.comp = { id: 'c-boreal', name: 'boreal', realmIds: [], selectedRealm: null };
    h.rerender();
    await flush();
    await answer(g0, { ready: ok(READY) });
    expect(h.result.current.cat).toBeNull();
    expect(h.result.current.loads.catalogue).toBe('loading');
    await answer(gen(1), { providers: ok(PROVIDERS), models: ok(NEW_MODELS), ready: ok(NEW_READY) });
    expect(readyOf(h.result.current, 'openai/gpt-6')).toBe('ready');
  });

  it('with an earlier read of the first computer held, switching away shows loading, never that read', async () => {
    const h = renderHook(() => useAiModel());
    await flush();
    await answer(gen(0), { providers: ok(PROVIDERS), models: ok(MODELS), ready: ok(READY) });
    expect(h.result.current.cat).not.toBeNull();
    W.comp = { id: 'c-boreal', name: 'boreal', realmIds: [], selectedRealm: null };
    h.rerender();
    expect(h.result.current.cat).toBeNull();
    expect(h.result.current.loads.catalogue).toBe('loading');
  });

  it('no computer: nothing is asked', async () => {
    W.comp = null;
    const h = renderHook(() => useAiModel());
    await flush();
    expect(calls()).toEqual([]);
    expect(h.result.current.firstLoad).toBe(false);
  });

  it('unmounted while a generation is out: its answer is dropped', async () => {
    const h = renderHook(() => useAiModel());
    await flush();
    h.unmount();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await answer(gen(0), { providers: ok(PROVIDERS), models: ok(MODELS), ready: ok(READY) });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
