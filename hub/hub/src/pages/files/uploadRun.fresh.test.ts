// An upload batch's re-read after its hold is stored merges the
// stored change records first, so a Files change another tab admitted before its storage event reached this tab is
// seen there and the upload is refused (HELD_OVERLAP), nothing sent. Real core store; only the folder refresh is mocked.
/* eslint-disable no-restricted-globals -- the test plays another tab's raw store write that no storage event has
   brought yet (as pages/board/data.test.tsx) */
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineMutation, defineRoute, heldAttempts, heldChanges } from '@core';
import * as C from '@core/changes';
import { CHANGE_STORE_KEY, setChangeStoreAdapter } from '@core/change-store';
import { setUploadEngineForTests, type RunningJob, type UploadEngine } from '@core/upload';
import { setIdentity } from '@core/ctx';
import { boot, calls, onFetch, R1, UID } from '@core/test/env';
import type * as Core from '@core';
import type * as Data from './data';

// The merge's verdict can be forced once (an unreadable store at exactly that read); otherwise core's own.
const merge = vi.hoisted(() => ({ unclean: 0 }));
vi.mock('@core', async (orig) => {
  const core = await orig<typeof Core>();
  return { ...core, mergeStoredChanges: () => (merge.unclean > 0 ? (merge.unclean--, false) : core.mergeStoredChanges()) };
});
vi.mock('./data', async (orig) => ({ ...(await orig<typeof Data>()), refreshFolders: vi.fn() }));
const { FILES_LOCK, uploadLock, uploadsOn } = await import('./data');
const { useBatches, useUpload, resetUploads } = await import('./uploadRun');
const ABC_SHA = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const COMP = { id: 'c1', name: 'atlas', project_id: 'p1', server_name: 'sv1' } as never;

beforeEach(() => {
  boot({ realm: R1 });
  setIdentity({ id: UID, banned: false });
  resetUploads();
  onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: [] } } : { status: 502, body: {} }));
});
afterEach(() => { C.resetChanges(); setUploadEngineForTests(null); setChangeStoreAdapter(null); });

/** A Files change on c1 whose answer was lost (held), stored as another tab would leave it: in the store, not yet in
 *  this tab's memory (no storage event has come). */
async function otherTabsHeldChange(): Promise<void> {
  const route = defineRoute({ method: 'POST', path: '/pf1/files-change', scope: 'agent', body: ['n'], idem: true });
  const m = defineMutation<{ n: number }>(route, { input: (v) => ({ body: v }), lock: FILES_LOCK, lockKey: () => ({ computer: 'c1' }), proves: () => 'applied', page: 'files' });
  expect((await m.run({ n: 1 })).outcome).toBe('pending');
  const stored = localStorage.getItem(CHANGE_STORE_KEY);
  C.resetChanges();
  if (stored !== null) localStorage.setItem(CHANGE_STORE_KEY, stored);
  expect(heldChanges(FILES_LOCK)).toEqual([]);
  expect(localStorage.getItem(CHANGE_STORE_KEY) ?? '').toContain('files-change');
  calls.length = 0;
}

describe('the re-read after the batch hold merges the stored changes', () => {
  it('another tab\'s held Files change, stored before its storage event came: refused, nothing sent, hold freed', async () => {
    await otherTabsHeldChange();
    const up = renderHook(() => useUpload()).result.current;
    const b = await up.start(COMP, '/tmp', [{ as: 'a.txt', file: new Blob(['abc']) }]);
    expect(b).toMatchObject({ phase: 'notSent', code: 'HELD_OVERLAP' });
    expect(calls.filter((c) => c.method === 'PUT')).toEqual([]);
    expect(heldChanges(FILES_LOCK).map((h) => (h.identity as { computer?: string }).computer)).toEqual(['c1']);
    await vi.waitFor(() => expect(heldAttempts(uploadLock('c1'))).toEqual([]));
  });
});

/** An engine like the worker's: hashing works (or fails), and a send never answers on its own; a cut answers the
 *  caller at once while the job stays open (a fetch that ignores the abort) until end() is called. */
function cutEngine(o: { hashFails?: boolean } = {}) {
  const ends: Array<() => void> = [];
  let sends = 0;
  const engine: UploadEngine = {
    hash: async () => { if (o.hashFails) throw Object.assign(new Error('FILE_UNREADABLE'), { code: 'FILE_UNREADABLE' }); return ABC_SHA; },
    send: (_spec, _file, signal, _meta, keep) => {
      sends++;
      let finish!: () => void;
      const job: { open: boolean; done: Promise<void> } = { open: true, done: new Promise<void>((r) => { finish = r; }) };
      ends.push(() => { job.open = false; finish(); });
      keep?.(job as RunningJob);
      return new Promise((resolve) => { signal.addEventListener('abort', () => resolve({ answered: false, why: 'aborted' }), { once: true }); });
    },
  };
  setUploadEngineForTests(engine);
  return { ends, sends: () => sends };
}
const batchHold = () => heldAttempts(uploadLock('c1'))[0];

describe('a cancelled send whose worker is still sending keeps the batch sending', () => {
  it('after Cancel the stamp stays until the worker job ends; then it ends and the file reads unknown', async () => {
    const eng = cutEngine();
    const up = renderHook(() => useUpload()).result.current;
    const list = renderHook(() => useBatches('c1'));
    const p = up.start(COMP, '/tmp', [{ as: 'a.txt', file: new Blob(['abc']) }]);
    await vi.waitFor(() => expect(eng.sends()).toBe(1));
    list.rerender();
    up.cancel(list.result.current[0]!.id);
    const early = await Promise.race([p.then(() => 'settled'), new Promise((r) => setTimeout(() => r('waiting'), 80))]);
    expect(early).toBe('waiting');
    expect(batchHold()?.inFlight).toBeTruthy();
    eng.ends[0]!();
    const b = await p;
    expect(b.items[0]).toMatchObject({ state: 'unknown' });
    expect(batchHold()?.inFlight).toBeFalsy();
  });
  it('Check again is refused while the cut worker job is still out: no read, the hold kept', async () => {
    const eng = cutEngine();
    const up = renderHook(() => useUpload()).result.current;
    const list = renderHook(() => useBatches('c1'));
    const p = up.start(COMP, '/tmp', [{ as: 'a.txt', file: new Blob(['abc']) }]);
    await vi.waitFor(() => expect(eng.sends()).toBe(1));
    list.rerender();
    up.cancel(list.result.current[0]!.id);
    await new Promise((r) => setTimeout(r, 50));
    const held = uploadsOn('c1')[0]!;
    expect(held.hold.inFlight).toBeTruthy();
    calls.length = 0;
    expect(await up.check(COMP, held)).toBe(false);
    expect(calls.filter((c) => c.method === 'GET')).toEqual([]);
    expect(batchHold()?.id).toBe(held.hold.id);
    eng.ends[0]!();
    await p;
  });
});

describe('Continue merges the stored changes too', () => {
  it('a paused batch whose hold stays: another tab\'s stored Files change refuses Continue, nothing sent, stamp ended', async () => {
    const eng = cutEngine({ hashFails: true });
    const up = renderHook(() => useUpload()).result.current;
    const b = await up.start(COMP, '/tmp', [{ as: 'a.txt', file: new Blob(['abc']) }]);
    expect(b.phase).toBe('paused');
    expect(b.items[0]).toMatchObject({ state: 'notSent', code: 'FILE_UNREADABLE' });
    expect(batchHold()).toBeTruthy();
    // Another tab's held change: written to the store, not yet heard of here.
    await otherTabsHeldChange();
    const eng2 = cutEngine();
    const r = await up.resume(COMP, b.id);
    expect(r).toMatchObject({ phase: 'paused', code: 'HELD_OVERLAP' });
    expect(eng2.sends()).toBe(0);
    expect(eng.sends()).toBe(0);
    expect(batchHold()?.inFlight).toBeFalsy();
  });
});

describe('Continue on the batch\'s own hold refuses an unclean merge', () => {
  it('the merge after the stamp does not read clean: STORE_UNREADABLE, nothing sent, the hold kept, the stamp ended', async () => {
    const eng = cutEngine({ hashFails: true });
    const up = renderHook(() => useUpload()).result.current;
    const b = await up.start(COMP, '/tmp', [{ as: 'a.txt', file: new Blob(['abc']) }]);
    expect(b.phase).toBe('paused');
    const hold = batchHold();
    expect(hold).toBeTruthy();
    const eng2 = cutEngine();
    merge.unclean = 1;
    const r = await up.resume(COMP, b.id);
    expect(merge.unclean).toBe(0);
    expect(r).toMatchObject({ phase: 'paused', code: 'STORE_UNREADABLE' });
    expect(eng2.sends()).toBe(0);
    expect(eng.sends()).toBe(0);
    expect(batchHold()?.id).toBe(hold?.id);
    expect(batchHold()?.inFlight).toBeFalsy();
  });
});

describe('a store that does not read clean refuses', () => {
  it('mergeStoredChanges is false for an unreadable or corrupt store, true for a clean one', () => {
    expect(C.mergeStoredChanges()).toBe(true);
    setChangeStoreAdapter({ read: () => { throw new Error('denied'); } } as never);
    expect(C.mergeStoredChanges()).toBe(false);
    setChangeStoreAdapter({ read: () => '{not json' } as never);
    expect(C.mergeStoredChanges()).toBe(false);
  });
  it('an unreadable merge after the batch hold is stored: refused, nothing sent, hold freed', async () => {
    const eng = cutEngine();
    merge.unclean = 1;
    const up = renderHook(() => useUpload()).result.current;
    const b = await up.start(COMP, '/tmp', [{ as: 'a.txt', file: new Blob(['abc']) }]);
    expect(merge.unclean).toBe(0);
    expect(b).toMatchObject({ phase: 'notSent', code: 'STORE_UNREADABLE' });
    expect(eng.sends()).toBe(0);
    await vi.waitFor(() => expect(heldAttempts(uploadLock('c1'))).toEqual([]));
  });
});
