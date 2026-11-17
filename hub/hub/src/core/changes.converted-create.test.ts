// An older build's computer-create record without metadata, once converted, is held
// under lock:computer.create with metadata made from its scope: no sender (by), no identity, realm null. The
// Computers zero state takes only a held row with a sender and an identity as evidence of this browser's create
// (pages/computers/data.ts useZeroState); this pins the shape the real conversion gives, which its page row mocks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { SENDING_STALE_MS, CHANGE_STORE_KEY, readChanges, writeChanges, type StoredChange } from './change-store';
import * as C from './changes';
import { boot, R1, R2 } from './test/env';

const announce = () => window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
const asOlder = (r: StoredChange): StoredChange => { const { fmt: _f, oc: _o, ...older } = r; void _f; void _o; return older as StoredChange; };
const outs: Array<() => void> = [];

beforeEach(() => { boot({ realm: R1 }); });
afterEach(async () => { vi.useRealTimers(); for (const o of outs.splice(0)) o(); for (let i = 0; i < 50; i++) await Promise.resolve(); });

describe('a converted older computer-create record', () => {
  it('is held under computer.create with no sender and no identity (undefined), and every realm view lists it', async () => {
    vi.useFakeTimers({ now: 10_000 });
    let open: (v: { outcome: 'pending'; idem: string }) => void = () => {};
    const p = new Promise<{ outcome: 'pending'; idem: string }>((r) => { open = r; });
    outs.push(() => open({ outcome: 'pending', idem: 'K-after' }));
    const send = vi.fn((_k: string | undefined) => p);
    void C.guarded(C.realmScoped('s'), 'd', send);
    for (let i = 0; i < 20 && !send.mock.calls.length; i++) await Promise.resolve();
    const r = asOlder(readChanges()![0]!);
    const older = { ...r, id: r.id.replace(C.realmScoped('s'), C.realmScoped('lock:computer.create')) } as StoredChange;
    expect(older.meta).toBeUndefined();
    C.reloadChangesForTests();
    writeChanges([older]);
    act(() => announce());
    await act(async () => { await vi.advanceTimersByTimeAsync(SENDING_STALE_MS + 200); });
    expect(readChanges()![0]!.meta).toEqual({ base: 'lock:computer.create', target: null, realm: null });
    for (const realm of [R1, R2, 'all']) {
      const rows = C.heldChanges('computer.create', { realm });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ by: undefined, identity: undefined, realm: null });
      expect(C.sendingChanges('computer.create', { realm }).some((x) => x.attributed)).toBe(false);
    }
  });
});
