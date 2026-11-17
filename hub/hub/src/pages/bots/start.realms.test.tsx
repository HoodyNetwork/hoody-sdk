// Vitest: the lifecycle hold is per physical computer in every realm view, so a hold sent in another realm still
// shows (read-only if another page sent it) and Dismiss of our own frees exactly that hold, in any realm view.
import { act, renderHook } from '@testing-library/react';
import { CoreQueryProvider, bootFixtureCore, computerLifecycle, computerLifecycleRoute, containersRoute, heldChanges, reply } from '@core';
import { beforeEach, describe, expect, it } from 'vitest';
import { setRealm } from '@core/ctx';
import { useStartComputer } from './data';

const C1 = 'aaaaaaaaaaaaaaaaaaaaaac1';
const C2 = 'bbbbbbbbbbbbbbbbbbbbbbc2';
const R1 = 'a'.repeat(24), R2 = 'b'.repeat(24);

describe('Start holds across realms', () => {
  beforeEach(() => {
    bootFixtureCore({
      realm: R1,
      rules: [
        reply(containersRoute, () => ({ body: { data: { computers: [{ id: C1, status: 'stopped' }, { id: C2, status: 'stopped' }] } } })),
        reply(computerLifecycleRoute, () => ({ status: 502, body: {} })),
      ],
    });
  });
  const mount = () => renderHook(() => useStartComputer(), { wrapper: CoreQueryProvider });

  it('a hold another page sent in another realm still shows, read-only, and blocks that computer only', async () => {
    setRealm(R2);
    expect((await computerLifecycle.forPage('computers').run({ id: C1, op: 'stop' })).outcome).toBe('pending');
    setRealm(R1);
    const hook = mount();
    expect(hook.result.current.holds).toMatchObject([{ computerId: C1, op: 'stop', ours: false, from: { page: 'computers', path: '/computers' } }]);
    expect(hook.result.current.heldComputer(C2)).toBe(false);
    await act(async () => {
      const h = hook.result.current.holds.find((x) => x.computerId === C1);
      if (h?.hold) await hook.result.current.dismiss({ computerId: C1, hold: h.hold });
    });
    expect(heldChanges('computer.lifecycle')).toHaveLength(1);
  });

  it('our Start sent in one realm is dismissed from All realms by its own token, and only it', async () => {
    setRealm(R2);
    expect((await computerLifecycle.forPage('computers').run({ id: C2, op: 'stop' })).outcome).toBe('pending');
    setRealm(R1);
    const hook = mount();
    await act(async () => {
      await hook.result.current.run({ computerId: C1 });
    });
    setRealm('all');
    expect(hook.result.current.holds.map((h) => [h.computerId, h.ours]).sort()).toEqual([[C1, true], [C2, false]]);
    await act(async () => {
      const h = hook.result.current.holds.find((x) => x.computerId === C1);
      if (h?.hold) await hook.result.current.dismiss({ computerId: C1, hold: h.hold });
    });
    expect(hook.result.current.holds.map((h) => h.computerId)).toEqual([C2]);
  });
});
