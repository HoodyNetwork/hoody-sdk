// change-store.ts coordination: every write of the store runs under navigator.locks.
// Without it nothing is admitted and nothing is written, so no tab can send twice and no tab can write back a
// list that drops another tab's new hold. Driven through changes.ts's own admission (guarded) and its writers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANGE_STORE_KEY, readChanges } from './change-store';
import { changeHoldRefs, forgetAccountChanges, guarded, holdOfLock, isPending, release } from './changes';
import { snapshot } from './ctx';
import { boot, R1 } from './test/env';
import { removeTestLocks } from './test/locks';

const META = { base: 'lock:computer.lifecycle', target: { project: { id: 'p1' }, container: { id: 'c1' } }, realm: R1, identity: { computer: 'c1' }, by: 'q:lifecycle@computer.lifecycle' };
const pendingWith = (idem: string) => async (replay: string | undefined) => ({ outcome: 'pending' as const, idem: replay ?? idem });

beforeEach(() => { boot({ realm: R1 }); });
afterEach(() => { removeTestLocks(); });

describe('no navigator.locks, no admission and no write', () => {
  it('a change is refused unsent (NO_COORDINATION): its send is never called and nothing is stored', async () => {
    removeTestLocks();
    const send = vi.fn(pendingWith('K1'));
    expect(await guarded('s', 'd', send, META)).toEqual({ outcome: 'not_sent', code: 'NO_COORDINATION' });
    expect(send).not.toHaveBeenCalled();
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBeNull();
    expect(isPending('s', 'd')).toBe(false);
  });
  it('a stored hold is never written away by a tab without the lock (a release, a sign-out forget)', async () => {
    expect((await guarded('s', 'd', pendingWith('K1'), META)).outcome).toBe('pending');
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    expect(readChanges()).toHaveLength(1);
    const hold = holdOfLock('s', 'd')!;
    removeTestLocks();
    expect(await release('s', 'd', hold)).toBe(false); // no store lock, no proof: memory and storage keep it
    expect(isPending('s', 'd')).toBe(true);
    expect(await forgetAccountChanges(String(snapshot().account), changeHoldRefs(), { holdsIn: () => [], drop: () => {} })).toBe('failed');
    await new Promise((r) => setTimeout(r, 0));
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
  });
});
