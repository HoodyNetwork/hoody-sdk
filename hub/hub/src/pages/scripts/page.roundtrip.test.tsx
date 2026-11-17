// Vitest on core's real change source: a place left and entered again (A -> B -> A). The banner and lock of a place are built from
// what is true on arrival (core's held rows, and the send of this mount still out there), never from what was stored when the
// mount left; and an answer records only while its send is the mount's current run, so an old answer of a place visited again
// never clears a newer banner.
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
const agent = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/links13/w', scope: 'agent', body: ['name'] });
const table = { reads: {}, changes: { write: { route: agent, input: (v: { path: string }) => ({ body: { name: v.path } }), lockKey: (v: { path: string }) => ({ path: v.path }) } } };
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const ids = (rows: readonly { target: { container: { id: string } } | null }[]) => rows.map((r) => r.target?.container.id ?? null).sort();

// Every send waits for the test to answer it, in order: 200 is done, 502 may have gone through.
function setup() {
  boot({ realm: R1 });
  queryClient.clear();
  const answers: Array<(status: number) => void> = [];
  onFetch(() => new Promise((res) => { answers.push((status) => res({ status, body: {} })); }));
  const src = coreSource('scripts', table as never);
  const cur: { m?: ReturnType<typeof src.useMutation<unknown, { path: string }>>; change?: ReturnType<typeof useChange> } = {};
  function Probe({ cid, path = 'a.ts' }: { cid: string; path?: string }) {
    const m = src.useMutation<unknown, { path: string }>('write');
    cur.m = m;
    cur.change = useChange(cid, forScript(m, ofPath(path, cid)));
    return null;
  }
  const press = async (path = 'a.ts') => {
    let p!: Promise<unknown>;
    await act(async () => { p = cur.change!.run(() => cur.m!.mutateAsync({ path }) as never); await flush(); });
    return { p };
  };
  const answer = async (status: number, { p }: { p: Promise<unknown> }) => {
    await act(async () => { await vi_waitAnswer(); answers.shift()!(status); await p; await flush(); });
  };
  const vi_waitAnswer = async () => { for (let i = 0; i < 50 && answers.length === 0; i++) await settle(); };
  const to = async (view: ReturnType<typeof render>, cid: string, target: typeof A) => {
    setTarget(target);
    view.rerender(<Probe cid={cid} />);
    await act(flush);
  };
  return { cur, Probe, press, answer, to };
}

describe('a place left and entered again', () => {
  it("a send of A that completed while the mount was on B leaves no busy status and no lock when A is entered again", async () => {
    const { cur, Probe, press, answer, to } = setup();
    setTarget(A);
    const view = render(<Probe cid="c1" />, { wrapper: CoreQueryProvider });
    await act(flush);
    const p = await press();
    expect(cur.change!.out?.kind).toBe('busy');
    await to(view, 'c2', B);
    expect(cur.change!.out).toBeNull();
    await answer(200, p);
    await to(view, 'c1', A);
    expect(cur.m!.held()).toEqual([]);
    expect(cur.change!.out).toBeNull();
    expect(cur.change!.locked).toBe(false);
  });

  it("a send of A still out when A is entered again owns the banner and the lock again; its answer then records", async () => {
    const { cur, Probe, press, answer, to } = setup();
    setTarget(A);
    const view = render(<Probe cid="c1" />, { wrapper: CoreQueryProvider });
    await act(flush);
    const p = await press();
    await to(view, 'c2', B);
    await to(view, 'c1', A);
    expect(cur.change!.out?.kind).toBe('busy');
    expect(cur.change!.locked).toBe(true);
    // No second send meanwhile.
    expect(await act(async () => cur.change!.run(() => cur.m!.mutateAsync({ path: 'a.ts' }) as never))).toBeNull();
    await answer(502, p);
    expect(cur.change!.out?.kind).toBe('pending');
    expect(ids(cur.m!.held())).toEqual(['c1']);
    await act(async () => { cur.change!.force(); await flush(); });
    expect(cur.m!.held()).toEqual([]);
  });

  it("a pending hold of A freed while the mount was on B does not come back as a banner", async () => {
    const { cur, Probe, press, answer, to } = setup();
    setTarget(A);
    const view = render(<Probe cid="c1" />, { wrapper: CoreQueryProvider });
    await act(flush);
    const p = await press();
    await answer(502, p);
    expect(cur.change!.out?.kind).toBe('pending');
    await to(view, 'c2', B);
    expect(cur.change!.out).toBeNull();
    await act(async () => { for (const row of cur.m!.held()) cur.m!.dismissHeld(row); await flush(); });
    await to(view, 'c1', A);
    expect(cur.m!.held()).toEqual([]);
    expect(cur.change!.out).toBeNull();
    expect(cur.change!.locked).toBe(false);
  });

  it("an answer of a send the mount settled never clears the banner of a newer send in the same place", async () => {
    const { cur, Probe, press, answer } = setup();
    setTarget(A);
    render(<Probe cid="c1" />, { wrapper: CoreQueryProvider });
    await act(flush);
    const p1 = await press();
    await act(async () => { cur.change!.settle(); await flush(); });
    const p2 = await press('b.ts');
    // The first send answers done now; the newer one is still out.
    await act(async () => { await settle(); });
    await answer(200, p1);
    expect(cur.change!.out?.kind).toBe('busy');
    await answer(502, p2);
    expect(cur.change!.out?.kind).toBe('pending');
    expect(cur.change!.locked).toBe(true);
  });
});
