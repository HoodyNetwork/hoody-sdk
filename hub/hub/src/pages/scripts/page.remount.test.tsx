// Vitest on core's real change source: a warned "Close without knowing" of a pending banner frees the holds the banner
// showed, by token, and nothing else. A later mount's no-argument settle frees only that mount's own sends, so a hold an earlier
// mount left needs held() + dismissHeld(row), and a hold of another script is never shown nor freed by this script's banner.
import { CoreQueryProvider, queryClient } from '@core';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { coreSource } from '@core/source';
import { defineRoute } from '@core/routes';
import { boot, onFetch, R1, settle } from '@core/test/env';
import { forScript, ofPath, useChange } from './parts/ops';

const route = defineRoute<unknown, { name: string }>({ method: 'PATCH', path: '/computers/:id', scope: 'realm', body: ['name'] });
const table = { reads: {}, changes: { write: { route, input: (v: { path: string }) => ({ params: { id: 'c1' }, body: { name: v.path } }), lockKey: (v: { path: string }) => ({ path: v.path }) } } };
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };

function setup() {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch(() => ({ status: 502, body: {} }));
  const src = coreSource('scripts', table as never);
  type M = ReturnType<typeof src.useMutation<unknown, { path: string }>>;
  const cur: { m?: M; change?: ReturnType<typeof useChange> } = {};
  function Mount({ path }: { path: string }) {
    const m = src.useMutation<unknown, { path: string }>('write');
    cur.m = m;
    cur.change = useChange(`c1\u0000${path}`, forScript(m, ofPath(path, 'c1')));
    return null;
  }
  return { cur, Mount };
}

describe('a pending banner and its warned Dismiss after a remount', () => {
  it("frees the hold an earlier mount left for this script (by token), and keeps another script's", async () => {
    const { cur, Mount } = setup();
    const first = render(<Mount path="a.ts" />, { wrapper: CoreQueryProvider });
    await act(flush);
    await act(async () => { await cur.m!.mutateAsync({ path: 'a.ts' }); await flush(); });
    await act(async () => { await cur.m!.mutateAsync({ path: 'b.ts' }); await flush(); });
    expect(cur.m!.held().map((h) => (h.identity as { path: string }).path).sort()).toEqual(['a.ts', 'b.ts']);
    first.unmount();
    // A later editor of a.ts: the banner is pending (a.ts is held), and shows nothing of b.ts.
    render(<Mount path="a.ts" />, { wrapper: CoreQueryProvider });
    await act(flush);
    expect(cur.change!.out?.kind).toBe('pending');
    await act(async () => { cur.change!.force(); await flush(); });
    expect(cur.change!.out).toBeNull();
    // Exactly a.ts went; b.ts, which this banner never showed, is still held.
    expect(cur.m!.held().map((h) => (h.identity as { path: string }).path)).toEqual(['b.ts']);
  });

  it("an editor of another script shows no banner for a hold it did not send, and its Dismiss frees nothing", async () => {
    const { cur, Mount } = setup();
    const first = render(<Mount path="a.ts" />, { wrapper: CoreQueryProvider });
    await act(flush);
    await act(async () => { await cur.m!.mutateAsync({ path: 'a.ts' }); await flush(); });
    first.unmount();
    render(<Mount path="b.ts" />, { wrapper: CoreQueryProvider });
    await act(flush);
    expect(cur.change!.out).toBeNull();
    await act(async () => { cur.change!.force(); await flush(); });
    expect(cur.m!.held().map((h) => (h.identity as { path: string }).path)).toEqual(['a.ts']);
  });

  it("this mount's own send is freed by the same Dismiss", async () => {
    const { cur, Mount } = setup();
    render(<Mount path="a.ts" />, { wrapper: CoreQueryProvider });
    await act(flush);
    await act(async () => { await cur.change!.run(() => cur.m!.mutateAsync({ path: 'a.ts' }) as never); await flush(); });
    expect(cur.change!.out?.kind).toBe('pending');
    expect(cur.m!.held()).toHaveLength(1);
    await act(async () => { cur.change!.force(); await flush(); });
    expect(cur.m!.held()).toEqual([]);
    expect(cur.change!.out).toBeNull();
  });

  it("a press the kit refuses because of an earlier mount's hold shows that hold, and the Dismiss frees it", async () => {
    const { cur, Mount } = setup();
    const first = render(<Mount path="a.ts" />, { wrapper: CoreQueryProvider });
    await act(flush);
    await act(async () => { await cur.m!.mutateAsync({ path: 'a.ts' }); await flush(); });
    first.unmount();
    // The later editor starts after the hold: pending shows at once; closing it and pressing again is refused by the hold, not sent.
    render(<Mount path="a.ts" />, { wrapper: CoreQueryProvider });
    await act(flush);
    await act(async () => { cur.change!.settle(); await flush(); });
    expect(cur.m!.held()).toHaveLength(1);
    await act(async () => { await cur.change!.run(() => cur.m!.mutateAsync({ path: 'a.ts' }) as never); await flush(); });
    expect(cur.change!.out?.kind).toBe('pending');
    await act(async () => { cur.change!.force(); await flush(); });
    expect(cur.m!.held()).toEqual([]);
  });
});
