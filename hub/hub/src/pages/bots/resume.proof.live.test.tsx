// Vitest on a live page: Resume of a computer's paused Bots whose answer was lost. It is held as "may have gone through", one
// per computer; Check again reads that computer's Bots list and frees it only when the list counts no paused Bot and the
// press saw some. A list without its counts, another computer's list, or a press without the count it saw proves nothing.
// The warned Dismiss frees exactly the send it showed.
import { CoreQueryProvider, queryClient, useComputerBots } from '@core';
import { boot, calls, onFetch, settle } from '@core/test/env';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { registerTargets, useBotAction } from './data';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};
const T1 = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
const T2 = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv2' } };

/** What each computer's GET /bots answers: its paused count, or `uncounted` for an answer without its counts. */
const world: Record<string, number | 'uncounted'> = {};
function serve() {
  onFetch((c) => {
    const u = new URL(c.url);
    if (c.method === 'POST') return { status: 0, network: true };
    if (u.pathname.endsWith('/bots')) {
      const on = /sv2/.test(c.url) ? 'c2' : 'c1';
      const n = world[on] ?? 0;
      return { status: 200, body: n === 'uncounted' ? { items: [] } : { items: [], meta: { total: 0 }, suspended_count: n } };
    }
    return { status: 404, body: { error: { code: 'not_found', message: 'x' } } };
  });
}
const resumes = () => calls.filter((c) => c.method === 'POST' && c.url.includes('/bots/resume'));

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  for (const k of Object.keys(world)) delete world[k];
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 'sv1' }, { id: 'c2', project_id: 'p1', server_name: 'sv2' }]);
});

async function lost(o: { suspended?: number; computerId?: string } = {}) {
  serve();
  const h = renderHook(() => ({ resume: useBotAction(), one: useComputerBots(T1), two: useComputerBots(T2) }), { wrapper: CoreQueryProvider });
  await act(flush);
  await act(async () => {
    await h.result.current.resume.run({ action: 'resume', computerId: o.computerId ?? 'c1', ...('suspended' in o ? { suspended: o.suspended } : { suspended: 2 }) });
  });
  await act(flush);
  expect(h.result.current.resume.outcome).toBe('pending');
  return h;
}
const check = async (h: Awaited<ReturnType<typeof lost>>): Promise<boolean> => {
  let ok = false;
  await act(async () => {
    ok = await h.result.current.resume.readBack();
  });
  await act(flush);
  return ok;
};

describe('Check again after a Resume whose answer was lost', () => {
  it('while the computer still counts paused Bots it stays held; once it counts none, it is freed', async () => {
    world.c1 = 2;
    const h = await lost();
    expect(await check(h)).toBe(false);
    expect(h.result.current.resume.outcome).toBe('pending');
    world.c1 = 0;
    expect(await check(h)).toBe(true);
    expect(h.result.current.resume.outcome).not.toBe('pending');
  });

  it('a list that does not carry its counts proves nothing', async () => {
    world.c1 = 'uncounted';
    const h = await lost();
    expect(await check(h)).toBe(false);
    expect(h.result.current.resume.outcome).toBe('pending');
  });

  it('another computer counting none proves nothing for this one', async () => {
    world.c1 = 1;
    world.c2 = 0;
    const h = await lost();
    expect(await check(h)).toBe(false);
    expect(h.result.current.resume.outcome).toBe('pending');
  });

  it('a press that did not carry the paused count it saw is never proven by a read', async () => {
    world.c1 = 0;
    const h = await lost({ suspended: undefined });
    expect(await check(h)).toBe(false);
    expect(h.result.current.resume.outcome).toBe('pending');
  });
});

describe('a held Resume', () => {
  it('holds its own computer only: a second press there sends nothing, a press on another computer is sent', async () => {
    world.c1 = 2;
    world.c2 = 1;
    const h = await lost();
    expect(resumes()).toHaveLength(1);
    await act(async () => {
      await h.result.current.resume.run({ action: 'resume', computerId: 'c1', suspended: 2 });
    });
    expect(resumes()).toHaveLength(1);
    await act(async () => {
      await h.result.current.resume.run({ action: 'resume', computerId: 'c2', suspended: 1 });
    });
    await act(flush);
    expect(resumes()).toHaveLength(2);
  });

  it('is shown with the computer it was pressed on, and the warned Dismiss frees exactly that send', async () => {
    world.c1 = 2;
    const h = await lost();
    const rows = h.result.current.resume.held() ?? [];
    expect(rows).toHaveLength(1);
    expect((rows[0]!.identity as { computerId?: string }).computerId).toBe('c1');
    let freed = false;
    await act(async () => {
      freed = await h.result.current.resume.dismissShown(rows);
    });
    await act(flush);
    expect(freed).toBe(true);
    expect(h.result.current.resume.outcome).not.toBe('pending');
  });
});
