// Another tab's edit of a program (parts/edit.ts, lock EDIT_LOCK) still out, or held once its answer is not known:
// this tab's attempt store knows nothing of it, so core's lists are read (editOut). While it is out or held, tab B
// sends no sandbox save of that program (lifecycleBusy) and the edit hook's busy (parts/EditProgram.tsx reads
// editOut) holds its row actions, Edit and Remove. Another program or another computer is never blocked.
// The two-tab setting is busy.sending.test.ts's: tab A's request stays out, then a fresh registry on the same storage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANGE_STORE_KEY } from '@core/change-store';
import * as C from '@core/changes';
import { boot, R1, TARGET } from '@core/test/env';
import { EDIT_LOCK, editBusy, editHolds, editStore } from '../parts/edit';
import { editOut, lifecycleBusy } from './busy';

const OTHER_COMPUTER = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } };
// What edit.ts's mutation records for a send: its lock, the computer, and the identity {id, name, mark}.
const metaOf = (identity: Record<string, unknown>) => ({ base: 'lock:' + EDIT_LOCK, target: { project: { id: 'p1' }, container: { id: 'c1' } }, realm: R1, identity, by: 'q:test@' + EDIT_LOCK });
const outs: Array<() => void> = [];
async function editOutInA(identity: Record<string, unknown>) {
  let open: (v: { outcome: 'pending'; idem: string }) => void = () => {};
  const p = new Promise<{ outcome: 'pending'; idem: string }>((r) => { open = r; });
  outs.push(() => open({ outcome: 'pending', idem: 'K-after' }));
  const send = vi.fn((_k: string | undefined) => p);
  const done = C.guarded(C.realmScoped(`${EDIT_LOCK}|${String(identity.id)}`), 'd', send, metaOf(identity) as never);
  for (let i = 0; i < 20 && !send.mock.calls.length; i++) await Promise.resolve();
  expect(send).toHaveBeenCalledTimes(1);
  C.reloadChangesForTests();
  return { open, done };
}
const announce = () => window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));

beforeEach(() => { boot({ realm: R1 }); editStore.reset(); });
afterEach(async () => { for (const o of outs.splice(0)) o(); for (let i = 0; i < 50; i++) await Promise.resolve(); });

describe('another tab\'s edit of a program', () => {
  it('while its request is out: that program waits here, with no attempt and no hold in this tab', async () => {
    await editOutInA({ id: '7', name: 'web', mark: '00000000000001' });
    // This tab's own state says nothing: no attempt, and core holds nothing yet.
    expect(editBusy(editStore.get('p|prog:7'))).toBe(false);
    expect(editHolds(TARGET)).toEqual([]);
    expect(editOut(TARGET, '7')).toBe(true);
    expect(lifecycleBusy(TARGET, undefined, 'prog:7', '7')).toBe(true);
  });

  it('only the same program on the same computer', async () => {
    await editOutInA({ id: '7', name: 'web', mark: '00000000000001' });
    expect(editOut(TARGET, '8')).toBe(false);
    expect(lifecycleBusy(TARGET, undefined, 'prog:8', '8')).toBe(false);
    expect(editOut(OTHER_COMPUTER, '7')).toBe(false);
    expect(lifecycleBusy(OTHER_COMPUTER, undefined, 'prog:7', '7')).toBe(false);
    expect(editOut(null, '7')).toBe(false);
  });

  it('a numeric id on the wire names the same program', async () => {
    await editOutInA({ id: 7, name: 'web', mark: '00000000000001' });
    expect(editOut(TARGET, '7')).toBe(true);
  });

  it('once its answer is not known (held): still waits, as the hold; nothing else does', async () => {
    const a = await editOutInA({ id: '7', name: 'web', mark: '00000000000001' });
    a.open({ outcome: 'pending', idem: 'KA' });
    await a.done;
    announce();
    expect(C.sendingChanges(EDIT_LOCK)).toEqual([]);
    expect(editHolds(TARGET).map((h) => h.id)).toEqual(['7']);
    expect(editOut(TARGET, '7')).toBe(true);
    expect(lifecycleBusy(TARGET, undefined, 'prog:7', '7')).toBe(true);
    expect(editOut(TARGET, '8')).toBe(false);
  });

  it('nothing out, nothing held: nothing waits', () => {
    expect(editOut(TARGET, '7')).toBe(false);
    expect(lifecycleBusy(TARGET, undefined, 'prog:7', '7')).toBe(false);
  });
});
