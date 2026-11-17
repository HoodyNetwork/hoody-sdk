// query.selecterror.test.tsx: a core read whose select throws (an unreadable body: pageOf's BAD_LIST)
// is the read's error state and settles. TanStack query-core stamps a select error with Date.now() on every result it builds;
// with react-query 5.105.2 #12230 (observer.setOptions in an effect ahead of useSyncExternalStore's check) each render made a new
// result once the clock moved and the page re-rendered until React gave up ("Maximum update depth exceeded", the page's error
// boundary). patches/@tanstack%2Freact-query@5.105.3.patch undoes #12230; this test guards dropping that patch.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { containersRoute } from './computer';
import { bootFixtureCore } from './fixture-boot';
import { computersPage } from './power';
import { queryClient } from './query';
import { reply } from './transport';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 30; i++) await act(async () => { await new Promise((r) => setTimeout(r, 1)); }); }

afterEach(() => { vi.restoreAllMocks(); });

function harness(first: unknown) {
  const list = { body: first };
  bootFixtureCore({ rules: [reply(containersRoute, () => ({ status: 200, body: list.body }))] });
  queryClient.clear();
  // The clock moves on every reading, as it does on a slow page: a result stamped with "now" is a new result every time.
  let t = 1_800_000_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => (t += 2));
  const seen = { renders: 0, isError: false, rows: undefined as number | undefined };
  const failures: unknown[] = [];
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { failures.push(a[0]); });
  function Probe() {
    const q = computersPage.use();
    seen.renders++;
    seen.isError = q.isError;
    seen.rows = q.data?.rows.length;
    return <p>{q.isError ? 'unreadable' : String(q.data?.rows.length ?? '-')}</p>;
  }
  const r = render(<Probe />, { wrapper: wrap });
  return { list, seen, failures, rerender: () => r.rerender(<Probe />) };
}

describe('a core read whose select throws settles in its error state', () => {
  it('a first read without a list: the error shows, and the read stops rendering (no update loop)', async () => {
    const h = harness({ data: {} });
    await flush();
    expect(h.seen.isError).toBe(true);
    const settled = h.seen.renders;
    expect(settled).toBeLessThan(20);
    for (let i = 0; i < 5; i++) await act(async () => { h.rerender(); });
    await flush();
    // Each outside render is one render, never a run of them.
    expect(h.seen.renders - settled).toBeLessThanOrEqual(5);
    expect(h.failures.filter((m) => String(m).includes('Maximum update depth'))).toEqual([]);
  });

  it('a refetch without a list after rows were read: the error with the last rows kept, and no update loop', async () => {
    const h = harness({ data: { computers: [{ id: 'c1', status: 'running', project_id: 'p1' }] } });
    await flush();
    expect(h.seen.rows).toBe(1);
    h.list.body = { data: {} };
    await act(async () => { await computersPage.invalidate(); });
    await flush();
    expect(h.seen.isError).toBe(true);
    expect(h.seen.rows).toBe(1);
    const settled = h.seen.renders;
    for (let i = 0; i < 5; i++) await act(async () => { h.rerender(); });
    await flush();
    expect(h.seen.renders - settled).toBeLessThanOrEqual(5);
    expect(h.failures.filter((m) => String(m).includes('Maximum update depth'))).toEqual([]);
  });
});
