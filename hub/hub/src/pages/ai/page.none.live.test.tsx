// Live mode: with no computer shown ("All computers") the AI page asks nothing of a computer, its
// reload included, and it reaches its none state at once; clearing or picking the computer mid-load moves it between
// the none state and loading. Core's I/O is stubbed: each read is recorded and answered by the test.
// eslint-disable-next-line no-restricted-imports -- a test harness for the page's hooks, not page code
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreModule from '@core';
import type * as KitModule from '@kit';

const io = vi.hoisted(() => {
  let target: { container: { id: string } } | null = null;
  const ls = new Set<() => void>();
  const io = {
    reads: [] as string[],
    container: null as null | { promise: Promise<unknown>; resolve: (v: unknown) => void },
    get: () => target,
    set(t: typeof target) {
      target = t;
      for (const l of ls) l();
    },
    sub(l: () => void) {
      ls.add(l);
      return () => ls.delete(l);
    },
    defer() {
      let resolve: (v: unknown) => void = () => undefined;
      const promise = new Promise((r) => (resolve = r));
      io.container = { promise, resolve };
    },
    read(key: string): Promise<unknown> {
      io.reads.push(key);
      if (key === 'container' && io.container) return io.container.promise;
      if (key === 'container') return Promise.resolve({ id: 'c1', realm_ids: [] });
      return Promise.reject(Object.assign(new Error('stub'), { kind: 'server' }));
    },
  };
  return io;
});

vi.mock('@core', async (importOriginal) => {
  const actual = await importOriginal<typeof CoreModule>();
  const { useSyncExternalStore } = await import('react');
  const { useQuery } = await import('@tanstack/react-query');
  return {
    ...actual,
    useCurrentComputer: () => useSyncExternalStore(io.sub, io.get, io.get),
    realmsView: () => ({ selected: '' }),
    // The catalogue bundle's reader (bound to each run's context in core): its calls are recorded like the rest.
    providers: { ...actual.providers, boundReader: () => ({ providers: () => settle('providers'), models: (q?: { ready?: boolean }) => settle(q?.ready ? 'ready' : 'models'), auth: () => settle('auth') }) },
    coreSource: (name: string) => ({
      useQuery: (key: string, input?: unknown, opts?: object) =>
        useQuery({ queryKey: [name, key, input ?? null], queryFn: () => io.read(key), retry: false, ...opts }),
      useMutation: () => ({}),
    }),
  };
});
vi.mock('@kit', async (importOriginal) => ({
  ...(await importOriginal<typeof KitModule>()),
  useShellData: () => ({ computers: [{ id: 'c1', name: 'One' }] }),
}));
// A recorded read as the Api settles it.
const settle = (key: string) => io.read(key).then((body) => ({ ok: true, body }), () => ({ ok: false, err: { kind: 'pending', code: 'server', status: 500, retryAfter: null, details: {} } }));
vi.mock('./coreApi', () => ({ coreApi: () => ({}) }));

// Only the page's own modules load live (vitest compiles with fixtures on, as a global): core, the kit and the fixture
// boot the test setup runs keep fixture mode.
await import('@core');
await import('@kit');
vi.stubGlobal('__HUB_FIXTURES__', false);
const { useAiModel } = await import('./parts/model');
const { useCredit, useSpend } = await import('./data');
vi.unstubAllGlobals();

// Reads that are the computer's own; the balance read is the account's and is not one of them.
const COMPUTER_READS = ['version', 'providers', 'models', 'ready', 'auth', 'agents', 'bots', 'acp', 'acpDefault', 'jev', 'jevModels', 'spend', 'container'];
const computerReads = () => io.reads.filter((k) => COMPUTER_READS.includes(k));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });

beforeEach(() => {
  io.reads = [];
  io.container = null;
  io.set(null);
});

describe('the AI page with no computer shown (live)', () => {
  it('is in its none state at once and asks nothing of a computer, its reload on return included', async () => {
    const m = renderHook(() => useAiModel(), { wrapper: wrapper() });
    expect(m.result.current.firstLoad).toBe(false);
    expect(m.result.current.computer).toBeNull();
    await flush();
    act(() => m.result.current.reload());
    await flush();
    expect(computerReads()).toEqual([]);
  });

  it('spending asks nothing with no computer, its refresh included; the account balance still reads', async () => {
    const spend = renderHook(() => useSpend('d7'), { wrapper: wrapper() });
    await flush();
    await act(async () => {
      await spend.result.current.refetch();
    });
    expect(computerReads()).toEqual([]);
    renderHook(() => useCredit(), { wrapper: wrapper() });
    await flush();
    expect(io.reads).toContain('credit');
  });

  it('clearing the computer while it is still loading goes to the none state', async () => {
    io.defer();
    io.set({ container: { id: 'c1' } });
    const m = renderHook(() => useAiModel(), { wrapper: wrapper() });
    await flush();
    expect(m.result.current.firstLoad).toBe(true);
    act(() => io.set(null));
    await flush();
    expect(m.result.current.firstLoad).toBe(false);
    expect(m.result.current.computer).toBeNull();
  });

  it('picking a computer from none loads it (never the none state meanwhile), then shows it', async () => {
    const m = renderHook(() => useAiModel(), { wrapper: wrapper() });
    await flush();
    expect(m.result.current.firstLoad).toBe(false);
    io.defer();
    act(() => io.set({ container: { id: 'c1' } }));
    await flush();
    expect(m.result.current.firstLoad).toBe(true);
    await act(async () => {
      // The computer's own record, in no realm: its per-realm reads (the agents among them) run in Global.
      io.container?.resolve({ id: 'c1', realm_ids: [] });
      await new Promise((r) => setTimeout(r, 20));
    });
    await flush();
    expect(m.result.current.computer).toEqual({ id: 'c1', name: 'One' });
    expect(m.result.current.firstLoad).toBe(false);
    expect(io.reads).toEqual(expect.arrayContaining(['version', 'providers', 'models', 'agents']));
  });
});
