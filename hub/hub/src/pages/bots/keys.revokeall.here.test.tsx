// Vitest: what a Revoke all reads back, as its hook hands it to core's lock (not only the constant). The account's links,
// and of the computers' own lists only the one of the link's Bot's computer: another computer's list, still cached from a
// Bot opened earlier, cannot hold the link and could only fail the read-back. With no computer known, every one is read.
import { cleanup, renderHook } from '@app/testing';
import { CoreQueryProvider, queryClient } from '@core';
import type * as Core from '@core';
import { bump } from '@core/ctx';
import { installTransport, startFixtureMode, type Transport } from '@core/transport';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keyRevokeAllReads, registerTargets, useKeyRevokeAll } from './data';

// Each lock's read-back predicates as its hook passes them now, by change id.
const h = vi.hoisted(() => ({ reads: new Map<string, ReadonlyArray<(k: readonly unknown[]) => boolean>>() }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const probe = ((...a: Parameters<typeof real.useLockedChange>) => {
    if (typeof a[2] === 'string') h.reads.set(a[2], a[1] as unknown as ReadonlyArray<(k: readonly unknown[]) => boolean>);
    return real.useLockedChange(...a);
  }) as typeof real.useLockedChange;
  return { ...real, useLockedChange: probe };
});

const live: Transport = {
  async hoody() {
    return { data: {} };
  },
  fetch: () => Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })),
};

beforeEach(() => {
  bump('test-boot');
  startFixtureMode([], { realm: 'global', target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } } });
  installTransport(live);
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 's1' }]);
  queryClient.clear();
  h.reads.clear();
});
afterEach(() => {
  cleanup();
  installTransport(null);
});
const wrap = ({ children }: { children: ReactNode }) => <CoreQueryProvider>{children}</CoreQueryProvider>;

// A page source's query key: hub, account, scope, generation, src, page, read, params, target.
const key = (read: string, params: unknown, page = 'bots'): readonly unknown[] => ['hub', 'acct', 'global', 1, 'src', page, read, params, null];
const readsOfHook = (id: string) => {
  const preds = h.reads.get(id);
  expect(preds).toHaveLength(1);
  return (k: readonly unknown[]) => preds!.some((p) => p(k));
};

describe('a Revoke all reads back', () => {
  it('the hook passes the account\'s links and its own computer\'s list, never another computer\'s', () => {
    renderHook(() => useKeyRevokeAll('link-one', 'c-atlas'), { wrapper: wrap });
    const reads = readsOfHook('bots.keyRevokeAll.link-one');
    // The control: what it must read.
    expect(reads(key('link', null))).toBe(true);
    expect(reads(key('linkHere', 'c-atlas'))).toBe(true);
    // Another computer's list (cached from a Bot opened earlier), another read, another page's read: not read.
    expect(reads(key('linkHere', 'c-boreal'))).toBe(false);
    expect(reads(key('view', 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief'))).toBe(false);
    expect(reads(key('link', null, 'computers'))).toBe(false);
  });

  it('with no computer known, every computer\'s list is read', () => {
    renderHook(() => useKeyRevokeAll('link-one'), { wrapper: wrap });
    const reads = readsOfHook('bots.keyRevokeAll.link-one');
    expect(reads(key('link', null))).toBe(true);
    expect(reads(key('linkHere', 'c-atlas'))).toBe(true);
    expect(reads(key('linkHere', 'c-boreal'))).toBe(true);
    expect(reads(key('view', 'x'))).toBe(false);
  });

  it('keyRevokeAllReads is the same rule outside the hook', () => {
    const reads = keyRevokeAllReads('c-atlas');
    expect(reads(key('link', null))).toBe(true);
    expect(reads(key('linkHere', 'c-atlas'))).toBe(true);
    expect(reads(key('linkHere', 'c-boreal'))).toBe(false);
  });
});
