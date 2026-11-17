// Vitest (live path, the keys.lockedlast.test.tsx harness): a second rotate, pressed while the first rotate's key is
// still in the hook, carries no copy of that key. While it is out (waiting for the 2FA code) the hook holds no key, so
// a drop of the key shown (Done, leaving Link, a page hide: the pane drops `fresh` and calls reset, which refuses a
// running change) leaves nothing behind; and the person's Cancel of the prompt puts the earlier outcome back without
// the key. The control: a change whose answer holds no secret (a link edit) gets its earlier answer back whole.
import { act, cleanup, renderHook } from '@app/testing';
import { CoreQueryProvider, queryClient } from '@core';
import type * as Core from '@core';
import { bump } from '@core/ctx';
import { installTransport, startFixtureMode, type Transport } from '@core/transport';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTargets, usePatchLink, useRotateKey } from './data';

// When `prompt` names a change id, that change's next press waits as if on the 2FA code prompt, until `cancel()`
// answers it as the person's own Cancel (core's quietCancel answer: { outcome: 'not_sent', cancelled: true }). Read at
// press time: the hook's run keeps the lock of the render it came from.
const h = vi.hoisted(() => ({ prompt: null as string | null, cancel: null as (() => void) | null }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const probe = ((...a: Parameters<typeof real.useLockedChange>) => {
    const c = real.useLockedChange(...a);
    const id = a[2];
    const run = ((...v: Parameters<typeof c.run>) => {
      if (typeof id !== 'string' || h.prompt !== id) return c.run(...v);
      h.prompt = null;
      return new Promise((resolve) => {
        h.cancel = () => resolve({ outcome: 'not_sent', cancelled: true } as never);
      });
    }) as typeof c.run;
    return { ...c, run };
  }) as typeof real.useLockedChange;
  return { ...real, useLockedChange: probe };
});

const SECRET = 'hbk_TEST_rotatecancel_000000000';
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
// A live transport (not the fixture one): the change takes the locked path, as on a real page. A rotate answers a new key;
// a link edit answers the link.
const live: Transport = {
  async hoody(_method, url) {
    if (/\/bot-urls\/link-one\/keys\/[^/]+\/rotate/.test(url)) return { data: { key: { id: 'bk_one', name: 'key one' }, secret: SECRET, curl: `curl -H 'Authorization: Bearer ${SECRET}'` } };
    if (/\/bot-urls\/link-one/.test(url)) return { data: { id: 'link-one', label: 'chief', url: 'https://chief.test', status: 'active', keys: [] } };
    return { data: {} };
  },
  fetch: () => json({}),
};

beforeEach(() => {
  bump('test-boot');
  startFixtureMode([], { realm: 'global', target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } } });
  installTransport(live);
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 's1' }]);
  queryClient.clear();
  h.prompt = null;
  h.cancel = null;
});
afterEach(() => {
  cleanup();
  installTransport(null);
});
const wrap = ({ children }: { children: ReactNode }) => <CoreQueryProvider>{children}</CoreQueryProvider>;

describe('a second press that waits for the 2FA code', () => {
  it('a link edit (no secret): a cancel puts its earlier answer back whole: the control', async () => {
    const r = renderHook(() => usePatchLink('link-one'), { wrapper: wrap });
    await act(async () => { await r.result.current.run({ enabled: false }); });
    expect(r.result.current.outcome).toBe('done');
    const first = r.result.current.data;
    expect(first).toBeDefined();
    h.prompt = 'bots.patchLink.link-one';
    let second: Promise<unknown> = Promise.resolve();
    await act(async () => { second = r.result.current.run({ enabled: true }); });
    expect(h.cancel).not.toBeNull();
    await act(async () => { h.cancel?.(); await second; });
    expect(r.result.current.outcome).toBe('done');
    expect(r.result.current.data).toEqual(first);
  });

  it('a rotate: no key in the hook while it waits, and none after the cancel', async () => {
    const r = renderHook(() => useRotateKey('link-one'), { wrapper: wrap });
    await act(async () => { await r.result.current.run({ keyId: 'bk_one' }); });
    // The first rotate's key is in the hook (the pane shows it).
    expect(r.result.current.outcome).toBe('done');
    expect(r.result.current.data?.secret).toBe(SECRET);
    h.prompt = 'bots.rotateKey.link-one';
    let second: Promise<unknown> = Promise.resolve();
    await act(async () => { second = r.result.current.run({ keyId: 'bk_one' }); });
    expect(h.cancel).not.toBeNull();
    // Waiting on the prompt: the hook holds no key.
    expect(r.result.current.data).toBeUndefined();
    // The pane drops the key shown (Done, leaving Link, a page hide): reset, refused while the press is out.
    act(() => { r.result.current.reset(); });
    expect(r.result.current.data).toBeUndefined();
    // The person cancels the prompt: the earlier outcome is back, the key is not.
    await act(async () => { h.cancel?.(); await second; });
    expect(r.result.current.outcome).toBe('done');
    expect(r.result.current.data).toBeUndefined();
  });
});
