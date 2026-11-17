// Vitest: Start on a Bots page shares core's computer lifecycle lock (one hold per physical computer in every
// realm view). A hold another page sent is read-only here and blocks only that computer; our own hold survives a
// remount and is freed by its own warned Dismiss, by token, and by nothing else.
import { act, renderHook } from '@testing-library/react';
import { CoreQueryProvider, bootFixtureCore, computerLifecycle, computerLifecycleRoute, containersRoute, heldChanges, reply } from '@core';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStartComputer } from './data';

const C1 = 'aaaaaaaaaaaaaaaaaaaaaac1';
const C2 = 'bbbbbbbbbbbbbbbbbbbbbbc2';

describe('Start shares the computer lifecycle lock', () => {
  let posts: string[] = [];
  beforeEach(() => {
    posts = [];
    bootFixtureCore({
      rules: [
        reply(containersRoute, () => ({ body: { data: { computers: [{ id: C1, status: 'stopped' }, { id: C2, status: 'stopped' }] } } })),
        reply(computerLifecycleRoute, (req: { path: string }) => {
          posts.push(req.path);
          return { status: 502, body: {} };
        }),
      ],
    });
  });
  const mount = () => renderHook(() => useStartComputer(), { wrapper: CoreQueryProvider });
  const start = async (hook: ReturnType<typeof mount>, id: string) => {
    let r: Awaited<ReturnType<ReturnType<typeof mount>['result']['current']['run']>> | undefined;
    await act(async () => {
      r = await hook.result.current.run({ computerId: id });
    });
    return r;
  };
  const dismiss = (hook: ReturnType<typeof mount>, id: string) =>
    act(async () => {
      const h = hook.result.current.holds.find((x) => x.computerId === id);
      if (h?.hold) await hook.result.current.dismiss({ computerId: id, hold: h.hold });
    });

  it('is refused unsent while another page holds that computer, and names the page', async () => {
    await computerLifecycle.forPage('computers').run({ id: C1, op: 'stop' });
    const hook = mount();
    expect(hook.result.current.holds).toMatchObject([{ computerId: C1, op: 'stop', ours: false, from: { page: 'computers', path: '/computers' } }]);
    const r = await start(hook, C1);
    expect(r?.error?.code).toBe('HELD_BY_OTHER');
    expect(posts).toHaveLength(1);
  });

  it('a hold on one computer does not block another computer', async () => {
    expect((await computerLifecycle.forPage('computers').run({ id: C1, op: 'stop' })).outcome).toBe('pending');
    const hook = mount();
    expect(hook.result.current.heldComputer(C1)).toBe(true);
    expect(hook.result.current.heldComputer(C2)).toBe(false);
    expect((await start(hook, C2))?.outcome).toBe('pending');
    expect(posts).toHaveLength(2);
  });

  it('a hold another page sent is read-only: Dismiss frees nothing', async () => {
    expect((await computerLifecycle.forPage('computers').run({ id: C1, op: 'stop' })).outcome).toBe('pending');
    const hook = mount();
    await dismiss(hook, C1);
    expect(hook.result.current.holds).toHaveLength(1);
    expect(heldChanges('computer.lifecycle')).toHaveLength(1);
  });

  it('our own Start is ours, tells other pages it came from Bots, and Dismiss frees only it', async () => {
    expect((await computerLifecycle.forPage('computers').run({ id: C2, op: 'restart' })).outcome).toBe('pending');
    const hook = mount();
    await start(hook, C1);
    expect(hook.result.current.holds.find((h) => h.computerId === C1)).toMatchObject({ computerId: C1, op: 'start', ours: true, from: { page: 'bots', path: '/bots' } });
    expect(computerLifecycle.forPage('computers').heldBy(heldChanges('computer.lifecycle').find((h) => (h.identity as { computer: string }).computer === C1) as never)).toBe('other');
    await dismiss(hook, C1);
    expect(hook.result.current.holds.map((h) => h.computerId)).toEqual([C2]);
  });

  it('ownership survives a remount: the new mount still Dismisses our Start', async () => {
    const first = mount();
    await start(first, C1);
    first.unmount();
    const second = mount();
    expect(second.result.current.holds).toMatchObject([{ computerId: C1, ours: true, from: { page: 'bots', path: '/bots' } }]);
    await dismiss(second, C1);
    expect(second.result.current.holds).toEqual([]);
  });

  it('the confirm frees the hold that was shown: a newer own hold of the computer stays', async () => {
    const hook = mount();
    await start(hook, C1);
    const shown = hook.result.current.holds[0] as { computerId: string; hold: string };
    await dismiss(hook, C1);
    expect(hook.result.current.holds).toEqual([]);
    await start(hook, C1);
    const newer = hook.result.current.holds[0] as { hold: string };
    expect(newer.hold).not.toBe(shown.hold);
    let freed: boolean | undefined;
    await act(async () => {
      freed = await hook.result.current.dismiss({ computerId: C1, hold: shown.hold });
    });
    expect(freed).toBe(false);
    expect(hook.result.current.holds).toHaveLength(1);
    expect(hook.result.current.holds[0]?.hold).toBe(newer.hold);
  });

  it('a Restart hold another page sent keeps its own operation, so it is not worded as a Start', async () => {
    expect((await computerLifecycle.forPage('computers').run({ id: C1, op: 'restart' })).outcome).toBe('pending');
    const hook = mount();
    expect(hook.result.current.holds[0]?.op).toBe('restart');
  });
});
