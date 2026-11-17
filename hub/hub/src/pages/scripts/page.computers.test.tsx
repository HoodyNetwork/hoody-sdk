// Vitest on core's real change source (HeldRow.target): the same script path held on two computers. A view of the
// script on computer A lists, shows and frees only A's hold; B's hold stays, and a hold that records no computer is nobody's here.
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
const agent = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/links10/w', scope: 'agent', body: ['name'] });
const realm = defineRoute<unknown, { name: string }>({ method: 'PATCH', path: '/computers/:id', scope: 'realm', body: ['name'] });
const table = {
  reads: {},
  changes: {
    write: { route: agent, input: (v: { path: string }) => ({ body: { name: v.path } }), lockKey: (v: { path: string }) => ({ path: v.path }) },
    writeRealm: { route: realm, input: (v: { path: string }) => ({ params: { id: 'c1' }, body: { name: v.path } }), lockKey: (v: { path: string }) => ({ path: v.path }) },
  },
};
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const targets = (rows: readonly { target: { container: { id: string } } | null }[]) => rows.map((r) => r.target?.container.id ?? null).sort();

function setup() {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch(() => ({ status: 502, body: {} }));
  const src = coreSource('scripts', table as never);
  const cur: { m?: ReturnType<typeof src.useMutation<unknown, { path: string }>>; r?: ReturnType<typeof src.useMutation<unknown, { path: string }>>; change?: ReturnType<typeof useChange> } = {};
  function Probe({ path, cid }: { path: string; cid: string }) {
    const m = src.useMutation<unknown, { path: string }>('write');
    const r = src.useMutation<unknown, { path: string }>('writeRealm');
    cur.m = m;
    cur.r = r;
    cur.change = useChange(`${cid}\u0000${path}`, forScript(m, ofPath(path, cid)));
    return null;
  }
  const send = async (target: typeof A, path = 'a.ts') => {
    setTarget(target);
    await act(async () => { await cur.m!.mutateAsync({ path }); await flush(); });
  };
  return { cur, Probe, send };
}

describe('a script path held on two computers', () => {
  it("Dismiss on computer A frees A's hold only, and B's stays (and the other way round)", async () => {
    const { cur, Probe, send } = setup();
    const view = render(<Probe path="a.ts" cid="c1" />, { wrapper: CoreQueryProvider });
    await act(flush);
    await send(A);
    await send(B);
    expect(targets(cur.m!.held())).toEqual(['c1', 'c2']);
    view.rerender(<Probe path="a.ts" cid="c1" />);
    await act(flush);
    expect(cur.change!.out?.kind).toBe('pending');
    await act(async () => { cur.change!.force(); await flush(); });
    expect(targets(cur.m!.held())).toEqual(['c2']);
    view.rerender(<Probe path="a.ts" cid="c2" />);
    await act(flush);
    expect(cur.change!.out?.kind).toBe('pending');
    await act(async () => { cur.change!.force(); await flush(); });
    expect(cur.m!.held()).toEqual([]);
  });

  it("a view of the script on A shows nothing of a hold sent on B, and its Dismiss frees nothing", async () => {
    const { cur, Probe, send } = setup();
    render(<Probe path="a.ts" cid="c1" />, { wrapper: CoreQueryProvider });
    await act(flush);
    await send(B);
    expect(targets(cur.m!.held())).toEqual(['c2']);
    expect(cur.change!.out).toBeNull();
    await act(async () => { cur.change!.force(); await flush(); });
    expect(targets(cur.m!.held())).toEqual(['c2']);
  });

  it("a hold that records no computer is never shown or freed by a view of a computer", async () => {
    const { cur, Probe } = setup();
    render(<Probe path="a.ts" cid="c1" />, { wrapper: CoreQueryProvider });
    await act(flush);
    setTarget(null);
    await act(async () => { await cur.r!.mutateAsync({ path: 'a.ts' }); await flush(); });
    expect(cur.r!.held()).toHaveLength(1);
    expect(cur.r!.held()[0]?.target).toBeNull();
    expect(forScript(cur.r!, ofPath('a.ts', 'c1')).held()).toEqual([]);
    expect(forScript(cur.r!, ofPath('a.ts', 'c1')).pending).toBe(false);
  });
});
