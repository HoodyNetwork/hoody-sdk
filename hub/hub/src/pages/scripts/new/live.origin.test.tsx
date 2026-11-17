// Vitest: "It's live" builds its address from the deployed record's own project, computer
// and folder, never from the draft's editable binding: another tab may have deployed the draft on another computer, or the shown
// folder may differ. A binding of another computer gives no origin (the path alone), never a mixed address.
import { renderHook } from '@app/testing';
import type { DraftRecord } from '@core';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return {
    ...real,
    useBoundSends: () => ({ shown: true, write: async () => ({ outcome: 'done' }), exists: async () => null, clock: async () => 1000 }),
    useAliasCreate: () => ({ mutateAsync: async () => ({ outcome: 'done' }) }),
  };
});

import { clearScriptStore } from './flowfix';
import { beginDeploy, finishDeploy, openRecord, readDraftRecord } from './records';
import { liveOrigin, useLive, type LiveIn } from './StepLive';

const ID = 'gggggggggg';
const bind = (project: string, computer: string, exec: number) => ({ target: { project: { id: project, server: { name: 'node-1' } }, container: { id: computer, server_name: 'node-1' } }, realm: 'global', owner: 'fp1', exec });
const A = bind('a00000000000000000000a01', 'ca0000000000000000000a01', 2);
const B = bind('b00000000000000000000b01', 'cb0000000000000000000b01', 1);
const rec = (): DraftRecord => readDraftRecord(ID) as DraftRecord;
const input = (b: unknown, recordBinding: unknown): LiveIn => ({
  way: 'write', b: b as never, draftId: ID, computer: 'atlas', compId: (b as typeof A).target.container.id, route: '/elsewhere', snap: null, verdict: null,
  idea: null, fields: {}, link: null, attempt: 0, recordBinding: recordBinding as never,
});

afterEach(async () => { await clearScriptStore(); });

describe("It's live: the address is the deployed record's", () => {
  it('a record this tab did not send (another tab, a reload) is not marked as its own: the view has no evidence of the deployed bytes', async () => {
    await openRecord(ID, 'write', A as never);
    await beginDeploy(rec(), { kind: 'write', path: 'default/2/notes.ts', opId: 'g'.repeat(32), sentAfter: 1000, attempt: 0 });
    await finishDeploy(rec());
    const { result } = renderHook((p: LiveIn) => useLive(p), { initialProps: input(A, A) });
    const live = result.current.live;
    expect(live.k).toBe('done');
    if (live.k === 'done') expect(live.own).toBe(false);
  });

  it('uses the record\'s computer and folder, whatever the draft is bound to now', async () => {
    await openRecord(ID, 'write', A as never);
    await beginDeploy(rec(), { kind: 'write', path: 'default/2/notes.ts', opId: 'g'.repeat(32), sentAfter: 1000, attempt: 0 });
    await finishDeploy(rec());
    expect(rec().state).toBe('consumed');
    // The draft now bound to computer B; the record names A (folder 2).
    const { result, rerender } = renderHook((p: LiveIn) => useLive(p), { initialProps: input(B, A) });
    const live = result.current.live;
    expect(live.k).toBe('done');
    if (live.k === 'done') {
      expect(live.origin).toBe(liveOrigin(A as never, 2));
      expect(live.origin).not.toContain(B.target.container.id);
      expect(live.path).toBe('default/2/notes.ts');
    }
    // Same computer as the record but another shown folder: the record's folder.
    rerender(input({ ...A, exec: 1 }, null));
    const same = result.current.live;
    if (same.k === 'done') expect(same.origin).toBe(liveOrigin(A as never, 2));
    // Only a binding of another computer, and no record binding: no origin, never B's.
    rerender(input(B, null));
    const other = result.current.live;
    expect(other.k).toBe('done');
    if (other.k === 'done') expect(other.origin).toBe('');
    // Another computer of the same project: not the record's either.
    rerender(input(bind(A.target.project.id, 'cc0000000000000000000c01', 2), null));
    const sibling = result.current.live;
    if (sibling.k === 'done') expect(sibling.origin).toBe('');
  });
});
