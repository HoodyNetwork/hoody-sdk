// Vitest: a press or a confirm of the VM flow (changes.ts) is judged against what the screen shows now, never against
// the render that made the handler. Each case keeps a handler from an earlier render, moves the screen on (another VM
// under the name, a row whose own read stopped proving it, another computer), then calls the kept handler: nothing is
// sent.
import { act, renderHook, renderPage, waitFor } from '@app/testing';
import type { Target } from '@core';
import { snapshot } from '@core/ctx';
import { heldChanges } from '@core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
// fixtures.ts first: it imports fixtures.power and calls its states(), so it must start the cycle.
import './fixtures';
import { useVmFlow, VM_LOCK, type VmFlowOptions, type VmRef } from './changes';
import type * as DataModule from './data';
import { FX } from './fixtures';
import { changeLog, resetPowerFixtures } from './fixtures.power';
import page from './page';

// The VM's own read, with one change: only a read that already answered (a request out from before the change) is on
// offer. fetch() hands that answer back (a new run, Running: it would prove the start); readFresh() answers null, as core
// does for a read it could only join or answer from the cache.
const before = vi.hoisted(() => ({ on: false }));
vi.mock('./data', async (orig) => {
  const m = await orig<typeof DataModule>();
  const proving = async (name: string) => ({ ...(await m.vmQ.fetch(name)), state: 'Running' as const, run: 'a1b2c3d4000000ff' });
  return {
    ...m,
    vmQ: {
      ...m.vmQ,
      fetch: (name: string) => (before.on ? proving(name) : m.vmQ.fetch(name)),
      readFresh: (name: string) => (before.on ? Promise.resolve(null) : m.vmQ.readFresh(name)),
    },
  };
});

const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));
const win11 = FX.VMS.details.find((d) => d.name === 'win11') as { vm_id: string };
const REF: VmRef = { vmId: win11.vm_id, name: 'win11', run: null };
const OTHER_ID = '0195c0de0000eeee';

beforeEach(() => {
  before.on = false;
  resetPowerFixtures();
  changeLog.length = 0;
});

/** The flow over the fixture world's computer, with the screen showing win11 as REF. */
async function flowOf(state = 'power-ok') {
  await renderPage(page, { state, path: '/vms?q=win11' });
  const target = snapshot().target as Target;
  const props = (o: Partial<VmFlowOptions> = {}): VmFlowOptions => ({ target, reread: () => undefined, present: new Map([['win11', REF.vmId]]), ...o });
  const hook = renderHook((p: VmFlowOptions) => useVmFlow(p), { initialProps: props() });
  return { ...hook, props, target };
}

describe('a handler kept from an earlier render sends nothing for what the screen no longer shows', () => {
  it('a delete confirm kept from before another VM took the name', async () => {
    const f = await flowOf();
    act(() => { f.result.current.press('delete', REF); });
    expect(f.result.current.ask?.vm.vmId).toBe(REF.vmId);
    const confirm = f.result.current.confirm;
    f.rerender(f.props({ present: new Map([['win11', OTHER_ID]]) }));
    act(() => { confirm(); });
    await settle();
    expect(changeLog).toEqual([]);
  });

  it('a power-off confirm kept from before the row stopped proving its VM (its own read failed: the name is left out)', async () => {
    const f = await flowOf();
    act(() => { f.result.current.press('forceStop', REF); });
    const confirm = f.result.current.confirm;
    f.rerender(f.props({ present: new Map() }));
    act(() => { confirm(); });
    await settle();
    expect(changeLog).toEqual([]);
  });

  it('a delete confirm kept from before another computer was shown', async () => {
    const f = await flowOf();
    act(() => { f.result.current.press('delete', REF); });
    const confirm = f.result.current.confirm;
    const other: Target = { project: f.target.project, container: { id: 'c0a7150000000000000000ff' } };
    f.rerender(f.props({ target: other }));
    act(() => { confirm(); });
    await settle();
    expect(changeLog).toEqual([]);
  });

  it('a press that sends at once (shut down), kept from before another VM took the name', async () => {
    const f = await flowOf();
    const press = f.result.current.press;
    f.rerender(f.props({ present: new Map([['win11', OTHER_ID]]) }));
    act(() => { press('stop', REF); });
    await settle();
    expect(changeLog).toEqual([]);
    expect(f.result.current.ask).toBeNull();
  });

  it('the same press and confirm, made by the current render, still send once', async () => {
    const f = await flowOf();
    act(() => { f.result.current.press('delete', REF); });
    act(() => { f.result.current.confirm(); });
    await act(async () => { await settle(); });
    expect(changeLog).toEqual([{ op: 'delete', name: 'win11' }]);
  });
});

describe('Check again of a start whose answer was lost', () => {
  it('takes only an answer to a read sent after the change: an answer that was already on its way proves nothing', async () => {
    const f = await flowOf('power-lost');
    act(() => { f.result.current.press('start', REF); });
    await waitFor(() => expect(f.result.current.allHeld).toHaveLength(1), { timeout: 10000 });
    before.on = true;
    const h = f.result.current.allHeld[0]!;
    let proved = true;
    await act(async () => { proved = await f.result.current.check(h); });
    expect(proved).toBe(false);
    expect(heldChanges(VM_LOCK)).toHaveLength(1);
    expect(changeLog).toEqual([{ op: 'start', name: 'win11' }]);
  });
});
