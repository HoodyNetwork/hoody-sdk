// source.queryhash.test.tsx: useQueryHash names the very query useQuery reads, so a page can keep state per read:
// the same words on another computer, in another realm or after a generation bump are another read (as for
// the apps search's warming retry count).
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { bump, setIdentity, setTarget } from './ctx';
import { bootFixtureCore } from './fixture-boot';
import { queryClient } from './query';
import { defineRoute } from './routes';
import { coreSource, type FallbackSource } from './source';
import { reply } from './transport';
import { boot, OTHER, onFetch, R1, R2, settle } from './test/env';

const search = defineRoute({ method: 'GET', path: '/api/v1/run/search', scope: 'kit', kit: 'run', index: 1, query: ['app'] });
type P = { q: string; on?: typeof t1; realm?: string };
const table = {
  reads: {
    search: { route: search, input: (p: P) => ({ query: { app: p.q }, ...(p.on ? { target: p.on } : {}), ...(p.realm ? { realm: p.realm } : {}) }) },
  },
  changes: {},
};
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const t1 = { project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } };
const t2 = { project: { id: 'p2' }, container: { id: 'c2', server_name: 's2' } };
const t3 = { project: { id: 'p3' }, container: { id: 'c3', server_name: 's3' } };
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }

/** Mounts useQuery and useQueryHash for these words; current() is the last render's hash. */
function probe(src: ReturnType<typeof coreSource>, q: string, more: Omit<P, 'q'> = {}): { current: () => string } {
  let last = '';
  function Probe() {
    src.useQuery('search', { q, ...more });
    last = src.useQueryHash('search', { q, ...more });
    return null;
  }
  render(<Probe />, { wrapper: wrap });
  return { current: () => last };
}
const cached = (): string[] => queryClient.getQueryCache().findAll().map((q) => q.queryHash);

describe('useQueryHash: one read’s identity', () => {
  it('is the hash of the query useQuery reads, and moves with the computer, the generation and the params', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch(() => ({ status: 200, body: { set_id: 's', candidates: [] } }));
    setTarget(t1);
    const src = coreSource('queryhash', table);
    const a = probe(src, 'gimp');
    await act(flush);
    const onC1 = a.current();
    expect(cached()).toContain(onC1);

    await act(async () => { setTarget(t2); await flush(); });
    const onC2 = a.current();
    expect(onC2).not.toBe(onC1);
    expect(cached()).toContain(onC2);

    await act(async () => { bump('test-boot'); await flush(); });
    const nextGen = a.current();
    expect(nextGen).not.toBe(onC2);
    expect(cached()).toContain(nextGen);

    const b = probe(src, 'gimp2');
    await act(flush);
    expect(b.current()).not.toBe(nextGen);
    expect(cached()).toContain(b.current());
  });

  // The identities the first case does not reach. Each live case
  // asserts the hash is the cached query's, so a hash that drops or misreads a slot fails there.
  it('a read that names its own computer hashes to that computer, and moving the shown computer leaves it', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch(() => ({ status: 200, body: { set_id: 's', candidates: [] } }));
    setTarget(t1);
    const src = coreSource('queryhash', table);
    const own = probe(src, 'gimp', { on: t2 });
    const shown = probe(src, 'gimp');
    await act(flush);
    expect(cached()).toContain(own.current());
    expect(own.current()).not.toBe(shown.current());
    const before = own.current();
    const shownBefore = shown.current();
    await act(async () => { setTarget(t3); await flush(); });
    expect(own.current()).toBe(before);
    expect(shown.current()).not.toBe(shownBefore);
    expect(cached()).toContain(shown.current());
  });

  it('the realm: the page realm and a read that names its own realm are each part of the read', async () => {
    boot({ realm: R2 });
    queryClient.clear();
    onFetch(() => ({ status: 200, body: { set_id: 's', candidates: [] } }));
    setTarget(t1);
    const src = coreSource('queryhash', table);
    const page = probe(src, 'gimp');
    const named = probe(src, 'gimp', { realm: R1 });
    await act(flush);
    expect(cached()).toContain(page.current());
    expect(cached()).toContain(named.current());
    expect(named.current()).not.toBe(page.current());
  });

  it('another account shown for the same words is another read', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch(() => ({ status: 200, body: { set_id: 's', candidates: [] } }));
    setTarget(t1);
    const src = coreSource('queryhash', table);
    const a = probe(src, 'gimp');
    await act(flush);
    const mine = a.current();
    await act(async () => { setIdentity({ id: OTHER, banned: false }); await flush(); });
    expect(a.current()).not.toBe(mine);
    expect(cached()).toContain(a.current());
  });

  it('under fixtures (the page fallback answers) it names the read the live source would, and nothing is fetched', async () => {
    const t = bootFixtureCore();
    queryClient.clear();
    let asked = 0;
    t.setRules([reply(search, { body: { set_id: 's', candidates: [] } }, { when: () => { asked++; return true; } })]);
    setTarget(t1);
    const fellBack: string[] = [];
    const fb = { useQuery: (key: string) => { fellBack.push(key); return { data: undefined }; }, useMutation: () => ({}) } as unknown as FallbackSource;
    const a = probe(coreSource('queryhash', table, fb), 'gimp');
    await act(flush);
    const onC1 = a.current();
    expect(fellBack).toContain('search');
    expect(asked).toBe(0);
    expect(cached()).toHaveLength(0);
    await act(async () => { setTarget(t2); await flush(); });
    const onC2 = a.current();
    expect(onC2).not.toBe(onC1);
    expect(asked).toBe(0);
    // The same read through core itself (no fallback: core's fixture rules answer it) lands under that very hash.
    probe(coreSource('queryhash', table), 'gimp');
    await act(flush);
    expect(asked).toBeGreaterThan(0);
    expect(cached()).toEqual([onC2]);
  });
});
