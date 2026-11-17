// Vitest on a live page: what the Bots list's Resume shows is never another context's. A late answer to a press made before
// a realm switch renders nothing in the new realm (the press's context died); a hold of the old realm shows again only in
// that realm (core's own, realm-scoped). And a Resume whose answer was lost but which core's own read-back proves at once
// (the computer counts no paused Bot) leaves no "may have gone through" note behind.
import { CoreQueryProvider, queryClient, useComputerBots } from '@core';
import { bump, setRealm } from '@core/ctx';
import { boot, deferred, onFetch, R1, R2, settle, type Reply } from '@core/test/env';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { registerTargets, useBotAction } from './data';

const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};
const T1 = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };

let paused = 0;
let post: (() => Reply | Promise<Reply>) | null = null;
function serve() {
  onFetch((c) => {
    const u = new URL(c.url);
    if (c.method === 'POST') return post ? post() : { status: 0, network: true };
    if (u.pathname.endsWith('/bots')) return { status: 200, body: { items: [], meta: { total: 0 }, suspended_count: paused } };
    return { status: 404, body: { error: { code: 'not_found', message: 'x' } } };
  });
}
const switchTo = async (realm: string) => {
  await act(async () => {
    setRealm(realm);
    bump('switch');
    await flush();
  });
};
const mount = async () => {
  serve();
  const h = renderHook(() => ({ resume: useBotAction(), one: useComputerBots(T1) }), { wrapper: CoreQueryProvider });
  await act(flush);
  return h;
};

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  paused = 2;
  post = null;
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 'sv1' }]);
});

describe('Resume outcome and its context', () => {
  it('an answer that lands after a realm switch shows nothing there', async () => {
    const gate = deferred<void>();
    post = async () => {
      await gate.p;
      return { status: 409, body: { error: { code: 'conflict', message: 'x' } } };
    };
    const h = await mount();
    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = h.result.current.resume.run({ action: 'resume', computerId: 'c1', suspended: 2 });
    });
    await act(flush);
    await switchTo(R2);
    await act(async () => {
      gate.res();
      await done;
      await flush();
    });
    expect(h.result.current.resume.outcome).toBe('idle');
  });

  it('a refusal shown in one realm is not shown after a switch, nor when the old realm comes back', async () => {
    post = () => ({ status: 409, body: { error: { code: 'conflict', message: 'x' } } });
    const h = await mount();
    await act(async () => {
      await h.result.current.resume.run({ action: 'resume', computerId: 'c1', suspended: 2 });
    });
    await act(flush);
    expect(h.result.current.resume.outcome).toBe('failed');
    await switchTo(R2);
    expect(h.result.current.resume.outcome).toBe('idle');
    await switchTo(R1);
    expect(h.result.current.resume.outcome).toBe('idle');
  });

  it('a hold of one realm is not shown in another, and shows again in its own', async () => {
    const h = await mount();
    await act(async () => {
      await h.result.current.resume.run({ action: 'resume', computerId: 'c1', suspended: 2 });
    });
    await act(flush);
    expect(h.result.current.resume.outcome).toBe('pending');
    await switchTo(R2);
    expect(h.result.current.resume.outcome).toBe('idle');
    await switchTo(R1);
    expect(h.result.current.resume.outcome).toBe('pending');
  });

  it('a lost answer that core reads back as applied leaves no pending note', async () => {
    paused = 0;
    const h = await mount();
    await act(async () => {
      await h.result.current.resume.run({ action: 'resume', computerId: 'c1', suspended: 2 });
    });
    await act(flush);
    expect(h.result.current.resume.held() ?? []).toHaveLength(0);
    expect(h.result.current.resume.outcome).not.toBe('pending');
  });
});
