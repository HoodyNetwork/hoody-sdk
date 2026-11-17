// Vitest on core's real change source: a change's answer is recorded for the place and the filter the press was made under. A
// place (scope) the mount has left is changed by nothing that lands later; a filter that moved within the same place does not
// change which hold a pending answer's banner shows.
import { CoreQueryProvider, queryClient } from '@core';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setTarget } from '@core/ctx';
import { defineRoute } from '@core/routes';
import { coreSource } from '@core/source';
import { boot, onFetch, R1, settle, TARGET } from '@core/test/env';
import { forScript, ofPath, useChange } from './parts/ops';

const A = TARGET;
const B = { ...TARGET, container: { id: 'c2', server_name: 'sv1' } };
const agent = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/links11/w', scope: 'agent', body: ['name'] });
const table = { reads: {}, changes: { write: { route: agent, input: (v: { path: string }) => ({ body: { name: v.path } }), lockKey: (v: { path: string }) => ({ path: v.path }) } } };
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const ids = (rows: readonly { target: { container: { id: string } } | null }[]) => rows.map((r) => r.target?.container.id ?? null).sort();

function setup() {
  boot({ realm: R1 });
  queryClient.clear();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((r) => { release = r; });
  onFetch(async () => { await gate; return { status: 502, body: {} }; });
  const src = coreSource('scripts', table as never);
  const cur: { m?: ReturnType<typeof src.useMutation<unknown, { path: string }>>; change?: ReturnType<typeof useChange> } = {};
  function Probe({ scope, cid }: { scope: string; cid: string }) {
    const m = src.useMutation<unknown, { path: string }>('write');
    cur.m = m;
    cur.change = useChange(scope, forScript(m, ofPath('a.ts', cid)));
    return null;
  }
  return { cur, Probe, release: () => release!() };
}

describe('the answer of a press, recorded for the place and the filter of the press', () => {
  it("an answer that lands after the mount moved to another scope changes nothing there: no banner, no lock, no rows", async () => {
    const { cur, Probe, release } = setup();
    setTarget(A);
    const view = render(<Probe scope="c1" cid="c1" />, { wrapper: CoreQueryProvider });
    await act(flush);
    let sent: Promise<unknown> | undefined;
    await act(async () => { sent = cur.change!.run(() => cur.m!.mutateAsync({ path: 'a.ts' }) as never); await flush(); });
    setTarget(B);
    view.rerender(<Probe scope="c2" cid="c2" />);
    await act(flush);
    await act(async () => { release(); await sent; await flush(); });
    expect(ids(cur.m!.held())).toEqual(['c1']);
    expect(cur.change!.out).toBeNull();
    expect(cur.change!.locked).toBe(false);
    await act(async () => { cur.change!.force(); await flush(); });
    expect(ids(cur.m!.held())).toEqual(['c1']);
  });

  it("within one scope, a pending answer shows the hold of the filter the press was made under, not the one shown by then", async () => {
    const { cur, Probe, release } = setup();
    setTarget(A);
    const view = render(<Probe scope="form" cid="c1" />, { wrapper: CoreQueryProvider });
    await act(flush);
    let sent: Promise<unknown> | undefined;
    await act(async () => { sent = cur.change!.run(() => cur.m!.mutateAsync({ path: 'a.ts' }) as never); await flush(); });
    view.rerender(<Probe scope="form" cid="c2" />);
    await act(flush);
    await act(async () => { release(); await sent; await flush(); });
    expect(cur.change!.out?.kind).toBe('pending');
    await act(async () => { cur.change!.force(); await flush(); });
    expect(cur.m!.held()).toEqual([]);
  });
});
