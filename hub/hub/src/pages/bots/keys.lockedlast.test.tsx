// Vitest: a key's answer is kept in one place only. Core's lock hands a rotate's answer to the Bots hook and keeps no copy
// of it (LockedOptions.secret: its `last` holds the outcome, never the data), so the hook's own slot, which the pane drops
// with the key shown, is the only one. The control: a change whose answer holds no secret (a link edit) keeps its data
// in `last`, so the probe below does read core's copy.
import { act, cleanup, renderHook } from '@app/testing';
import { CoreQueryProvider, queryClient } from '@core';
import type * as Core from '@core';
import { bump } from '@core/ctx';
import { installTransport, startFixtureMode, type Transport } from '@core/transport';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTargets, usePatchLink, useRotateKey } from './data';

// Each lock as its hook holds it now, by change id.
const h = vi.hoisted(() => ({ locked: new Map<string, { readonly last?: { readonly outcome: string; readonly data?: unknown } }>() }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const probe = ((...a: Parameters<typeof real.useLockedChange>) => {
    const c = real.useLockedChange(...a);
    if (typeof a[2] === 'string') h.locked.set(a[2], c);
    return c;
  }) as typeof real.useLockedChange;
  return { ...real, useLockedChange: probe };
});

const SECRET = 'hbk_TEST_lockedlast_0000000000';
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
  h.locked.clear();
});
afterEach(() => {
  cleanup();
  installTransport(null);
});
const wrap = ({ children }: { children: ReactNode }) => <CoreQueryProvider>{children}</CoreQueryProvider>;
const lockOf = (id: string) => h.locked.get(id);

describe('core keeps no copy of a key', () => {
  it('a link edit (no secret) keeps its answer in core\'s last: the control', async () => {
    const r = renderHook(() => usePatchLink('link-one'), { wrapper: wrap });
    await act(async () => { await r.result.current.run({ enabled: false }); });
    expect(r.result.current.outcome).toBe('done');
    expect(lockOf('bots.patchLink.link-one')?.last?.data).toBeDefined();
  });

  it('a rotate hands its key to the hook, and core\'s last holds the outcome without it', async () => {
    const r = renderHook(() => useRotateKey('link-one'), { wrapper: wrap });
    await act(async () => { await r.result.current.run({ keyId: 'bk_one' }); });
    expect(r.result.current.outcome).toBe('done');
    expect(r.result.current.data?.secret).toBe(SECRET);
    const last = lockOf('bots.rotateKey.link-one')?.last;
    expect(last?.outcome).toBe('done');
    expect(last).not.toHaveProperty('data');
  });
});
