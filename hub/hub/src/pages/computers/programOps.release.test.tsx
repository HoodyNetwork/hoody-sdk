// C9 release safety of the program holds, run through real core: the warned Dismiss and a
// restart's receipt free exactly the hold they were taken for (core's token for that one send), captured before
// any await. A later send of the same program (another hold, another key) is never freed by a stale Dismiss or
// receipt, another page's hold is untouched, and the legitimate paths still free exactly their own.
import { CoreQueryProvider, defineMutation, fixtureWorld, heldChanges, programLock, programOp, programRoutes } from '@core';
import { describe, expect, it } from 'vitest';
import { act, renderHook, renderPage } from '@app/testing';
import { subjectOf, targetOf, useProgramAction } from './data';
import { useProgramOps } from './parts/programOps';
import page from './page';

type Receipt = 'completed' | 'failed' | 'unknown';
const PATH = '/computers?sel=atlas.00a1&tab=programs';
const wrapper = CoreQueryProvider;
/** A gate a test opens when it wants the awaited step (the digest, the receipt) to go on. */
function gate() {
  let open!: () => void;
  const p = new Promise<void>((r) => { open = r; });
  return { p, open };
}
const holdsOf = (act: 'stop' | 'restart', id = '1') =>
  heldChanges(programLock[act]).filter((h) => (h.identity as { id?: unknown } | null)?.id === id);
async function setup() {
  await renderPage(page, { state: 'pendingPrograms', path: PATH });
  const atlas = fixtureWorld.current;
  // The test's own handle on the same page's sender: frees a hold and sends again, as a second tab would.
  const direct = renderHook(() => useProgramAction(), { wrapper });
  const vars = (act: 'stop' | 'restart', program = '1') => ({ ...subjectOf(atlas), program, act });
  const replace = (act: 'stop' | 'restart') => async () => {
    const h = holdsOf(act)[0]?.hold;
    // The first send is proved applied (complete drops its key too), then the program is sent again under a new hold and key.
    await direct.result.current.complete(vars(act), act, h ?? '');
    await direct.result.current.mutateAsync(vars(act));
  };
  return { atlas, direct, vars, replace };
}
/** The page's hook over the real action, its digest-awaiting step (heldByOther) or its receipt held at a gate. */
function ops(g: { p: Promise<unknown> } | null, receipt?: { g: { p: Promise<unknown> }; got: Receipt }) {
  return renderHook(() => useProgramOps(() => {
    const a = useProgramAction();
    return {
      ...a,
      heldByOther: async (v, act) => { const r = await a.heldByOther(v, act); await g?.p; return r; },
      ...(receipt ? { receipt: async () => { await receipt.g.p; return receipt.got; } } : {}),
    } as ReturnType<typeof useProgramAction>;
  }), { wrapper });
}

describe('program holds: Dismiss and the receipt free only their own hold', () => {
  it('(1) a Dismiss paused at the digest while H1 is replaced by H2 leaves H2 held, and the second press is refused', async () => {
    const { atlas, vars, replace } = await setup();
    const g = gate();
    const hook = ops(g);
    await act(async () => { await hook.result.current.press(atlas, { id: '1' }, 'stop'); });
    const h1 = holdsOf('stop')[0]?.hold;
    expect(h1).toBeDefined();
    let dismissing!: Promise<void>;
    act(() => { dismissing = hook.result.current.dismiss(atlas.id, '1', atlas); });
    await act(replace('stop'));
    const h2 = holdsOf('stop')[0]?.hold;
    expect(h2).toBeDefined();
    expect(h2).not.toBe(h1);
    g.open();
    await act(async () => { await dismissing; });
    expect(holdsOf('stop').map((h) => h.hold)).toEqual([h2]);
    // The second press is refused: the program is still held, nothing new is sent.
    await act(async () => { await hook.result.current.press(atlas, { id: '1' }, 'stop'); });
    expect(holdsOf('stop').map((h) => h.hold)).toEqual([h2]);
    void vars;
  });

  for (const got of ['completed', 'failed'] as const) {
    it(`a receipt for the first send answering (${got}) after the second hold and key were sent leaves both alone`, async () => {
      const { atlas, replace } = await setup();
      const g = gate();
      const hook = ops(null, { g, got });
      await act(async () => { await hook.result.current.press(atlas, { id: '1' }, 'restart'); });
      const first = holdsOf('restart')[0]!;
      expect(first.key).toBeTruthy();
      let checking!: Promise<void>;
      act(() => { checking = hook.result.current.settled(atlas.id, '1', atlas); });
      await act(replace('restart'));
      const second = holdsOf('restart')[0]!;
      expect(second.hold).not.toBe(first.hold);
      expect(second.key).not.toBe(first.key);
      g.open();
      await act(async () => { await checking; });
      const now = holdsOf('restart');
      expect(now.map((h) => h.hold)).toEqual([second.hold]);
      expect(now[0]!.key).toBe(second.key);
    });
  }

  it('(3) a remount frees through the hold core lists, and a stale closure is a no-op', async () => {
    const { atlas, replace } = await setup();
    const first = ops(null);
    await act(async () => { await first.result.current.press(atlas, { id: '1' }, 'stop'); });
    const stale = first.result.current.dismiss;
    first.unmount();
    // A remount adopts the held change with core's hold: its Dismiss frees exactly that.
    const again = ops(null);
    await act(async () => { await again.result.current.dismiss(atlas.id, '1', atlas); });
    expect(holdsOf('stop')).toHaveLength(0);
    // The old closure (its own entry made with the first hold) after a later send frees nothing of it.
    await act(async () => { await first.result.current.press(atlas, { id: '1' }, 'stop').catch(() => undefined); });
    await act(replace('stop'));
    const later = holdsOf('stop')[0]?.hold;
    expect(later).toBeDefined();
    await act(async () => { await stale(atlas.id, '1', atlas); });
    expect(holdsOf('stop').map((h) => h.hold)).toEqual([later]);
  });

  it("(4) another sender's hold is untouched by Dismiss and by a restart's check", async () => {
    const { atlas } = await setup();
    const op = programOp({ id: '1', act: 'restart', port: null, range: false });
    const programs = defineMutation<{ id: string }>(programRoutes.restart, {
      input: () => ({ target: targetOf(subjectOf(atlas)), params: { id: '1' }, body: op.body }),
      lock: programLock.restart,
      lockKey: () => op.identity,
      page: 'programs',
    });
    await act(async () => { expect((await programs.run({ id: '1' })).outcome).toBe('pending'); });
    const theirs = holdsOf('restart').map((h) => h.hold);
    expect(theirs).toHaveLength(1);
    const hook = ops(null, { g: { p: Promise.resolve() }, got: 'completed' });
    await act(async () => { await hook.result.current.dismiss(atlas.id, '1', atlas); });
    await act(async () => { await hook.result.current.settled(atlas.id, '1', atlas); });
    expect(holdsOf('restart').map((h) => h.hold)).toEqual(theirs);
  });

  it('(5) the legitimate Dismiss and receipt free exactly their own hold', async () => {
    const { atlas, direct, vars } = await setup();
    // A neighbour's hold (another program) that must stay.
    await act(async () => { await direct.result.current.mutateAsync(vars('stop', '2')); });
    expect(holdsOf('stop', '2')).toHaveLength(1);
    const hook = ops(null, { g: { p: Promise.resolve() }, got: 'completed' });
    await act(async () => { await hook.result.current.press(atlas, { id: '1' }, 'stop'); });
    expect(holdsOf('stop', '1')).toHaveLength(1);
    await act(async () => { await hook.result.current.dismiss(atlas.id, '1', atlas); });
    expect(holdsOf('stop', '1')).toHaveLength(0);
    expect(holdsOf('stop', '2')).toHaveLength(1);
    await act(async () => { await hook.result.current.press(atlas, { id: '1' }, 'restart'); });
    expect(holdsOf('restart')).toHaveLength(1);
    await act(async () => { await hook.result.current.settled(atlas.id, '1', atlas); });
    expect(holdsOf('restart')).toHaveLength(0);
    expect(holdsOf('stop', '2')).toHaveLength(1);
  });
});
