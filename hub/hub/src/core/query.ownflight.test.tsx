// RefreshFresh(match, { own: true }) never joins a read-back already out. A save's
// pre-write read must be a request sent after the press: joining an earlier flight would hand it an answer captured
// before the press. The earlier caller is cancelled (null, never the older answer as fresh); later read-backs join the
// own flight.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineQuery, queryClient, refreshFresh } from './query';
import { defineRoute } from './routes';
import { boot, calls, onFetch, R1, settle } from './test/env';

describe('refreshFresh own: never joins an earlier flight', () => {
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); });
  afterEach(() => { cleanup(); });

  async function mount(path: string) {
    const list = defineRoute<{ data: string[] }>({ method: 'GET', path, scope: 'agent' });
    const rows = defineQuery(list, { select: (r) => r.data });
    let n = 0;
    const held: (() => void)[] = [];
    // Request 2 answers only when released, with what the server held when it was sent; later ones answer at once.
    onFetch(() => {
      n++;
      const v = 'v' + n;
      if (n !== 2) return { status: 200, body: { data: [v] } };
      return new Promise((res) => { held.push(() => res({ status: 200, body: { data: [v] } })); });
    });
    const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    function Probe() { rows.use(undefined); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await settle(); });
    const reqs = () => calls.filter((c) => c.url.includes(path)).length;
    return { match: (k: readonly unknown[]): boolean => k.includes(list.id), held, reqs };
  }

  it('without own a second read-back joins the one out (one request); with own it sends its own and answers with it', async () => {
    const { match, held, reqs } = await mount('/ai12e/own');
    expect(reqs()).toBe(1);
    const early = refreshFresh(match);
    await act(async () => { await settle(); });
    expect(reqs()).toBe(2);
    // A plain read-back joins: no new request.
    const joined = refreshFresh(match);
    await act(async () => { await settle(); });
    expect(reqs()).toBe(2);
    // own: a new request, sent after this call began; its answer is v3, never the held v2.
    const own = await refreshFresh(match, { own: true });
    expect(reqs()).toBe(3);
    expect(own.state).toBe('fresh');
    expect(own.answers.map((a) => a.data)).toEqual([{ data: ['v3'] }]);
    held.forEach((r) => r());
    await act(async () => { await settle(); });
    // The earlier callers never get the older answer as fresh.
    for (const f of [await early, await joined]) {
      if (f.state === 'fresh') expect(f.answers.map((a) => a.data)).not.toEqual([{ data: ['v2'] }]);
    }
  });

  it('a read-back after the own one joins it, not the cancelled earlier flight', async () => {
    const { match, reqs } = await mount('/ai12e/after');
    void refreshFresh(match);
    await act(async () => { await settle(); });
    const own = refreshFresh(match, { own: true });
    const after = refreshFresh(match);
    const [o, a] = await Promise.all([own, after]);
    expect(reqs()).toBe(3);
    expect(o.answers.map((x) => x.data)).toEqual([{ data: ['v3'] }]);
    expect(a.state === 'fresh' ? a.answers.map((x) => x.data) : null).toEqual([{ data: ['v3'] }]);
  });
});
