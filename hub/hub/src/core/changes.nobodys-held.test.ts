// Item 60e: nobodysHeld lists only the held changes of a lock that record no sender (an older build's record
// converted on load), each with the account read now, for a source's warned dismissHeld. A hold with a sender is
// never listed (only its sender settles it). The account filter is heldChanges' own (this account's locks only).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { SENDING_STALE_MS, CHANGE_STORE_KEY, readChanges, writeChanges, type StoredChange } from './change-store';
import * as C from './changes';
import { boot, R1 } from './test/env';

const announce = () => window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));

beforeEach(() => { boot({ realm: R1 }); });
afterEach(() => { vi.useRealTimers(); });

async function convertedHold(): Promise<void> {
  await C.guarded(C.realmScoped('s'), 'd', () => Promise.resolve({ outcome: 'pending' as const, idem: 'K-old' }));
  const r = readChanges()!.find((x) => x.id.includes(C.realmScoped('s')))!;
  const { fmt: _f, oc: _o, ...older } = r;
  void _f; void _o;
  const old = Date.now() - SENDING_STALE_MS - 1000;
  C.reloadChangesForTests();
  writeChanges([{ ...older, t: old, at: old, id: r.id.replace(C.realmScoped('s'), C.realmScoped('lock:computer.create')) } as StoredChange]);
  act(() => announce());
  await vi.waitFor(() => expect(C.heldChanges('computer.create', { realm: R1 })).toHaveLength(1), { timeout: 5000 });
}

describe('nobodysHeld', () => {
  it('lists a converted hold (no sender) with its hold token and the account read now', async () => {
    await convertedHold();
    const rows = C.nobodysHeld('computer.create', { realm: R1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.hold).toBe(C.heldChanges('computer.create', { realm: R1 })[0]!.hold);
    expect(rows[0]!.account).toBe(C.changeOwner());
    expect(Object.isFrozen(rows[0])).toBe(true);
  });
  it('never lists a hold that records a sender', async () => {
    const meta = { base: 'lock:computer.create', target: null, realm: R1, identity: { project: 'p1', name: 'atlas' }, by: 's:computers:create' };
    await C.guarded(C.realmScoped('lock:computer.create'), 'd2', () => Promise.resolve({ outcome: 'pending' as const, idem: 'K-new' }), meta);
    expect(C.heldChanges('computer.create', { realm: R1 })).toMatchObject([{ by: 's:computers:create' }]);
    expect(C.nobodysHeld('computer.create', { realm: R1 })).toEqual([]);
  });
});
