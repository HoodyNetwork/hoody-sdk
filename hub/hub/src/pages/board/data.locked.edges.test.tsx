/* eslint-disable no-restricted-globals -- these tests play another browser tab whose store lands first (its sealed
   bytes put in place before this tab's write); the page reaches storage only through core */
// Vitest, locked commits: the two narrower edges of an edit queued on a locked commit. A reorder gives no Board a
// new value, so a reordered Board another tab deleted is skipped with no notice of its own, and the other Boards keep
// their order. With no Board put back, a recorded edit keeps the undo step apply gave it.
import { bootFixtureCore, FIXTURE_REALM } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARDS_KEY, useBoards } from './data';
import { createBoard, deleteBoard, isRefusal, renameBoard, reorderBoard, type RealmBoards, type Refusal } from './model/boards';
import { parseRealmBoards, toStored } from './model/persist';

let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
const settle = async () => { for (let i = 0; i < 6; i++) await act(() => cryptIdleForTests()); };
const stored = async (realm = FIXTURE_REALM) => (await storedForTests(BOARDS_KEY, realm)) as RealmBoards;
const reloaded = async (realm = FIXTURE_REALM) => parseRealmBoards(JSON.parse(JSON.stringify(await stored(realm)))).state;
const names = (s: RealmBoards | null) => (s?.boards ?? []).map((b) => b.name);
async function sealedBytes(value: RealmBoards, realm = FIXTURE_REALM): Promise<string> {
  const before = localStorage.getItem(BOARDS_KEY);
  await act(() => writeSealedForTests(BOARDS_KEY, realm, toStored(value)));
  const bytes = localStorage.getItem(BOARDS_KEY) as string;
  if (before === null) localStorage.removeItem(BOARDS_KEY); else localStorage.setItem(BOARDS_KEY, before);
  return bytes;
}
function holdSeal() {
  const subtle = globalThis.crypto.subtle;
  const real = subtle.encrypt.bind(subtle);
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  const spy = vi.spyOn(subtle, 'encrypt').mockImplementation(async (...a: Parameters<SubtleCrypto['encrypt']>) => { await gate; return real(...a); });
  return { sealing: () => vi.waitFor(() => expect(spy).toHaveBeenCalled()), release: () => { open(); spy.mockRestore(); } };
}
async function tabWith(boards: number) {
  const hook = renderHook(() => useBoards());
  await settle();
  act(() => { hook.result.current.apply((s) => { let x = s; while (x.boards.length < boards) x = must(createBoard(x, rand)); return must(renameBoard(x, x.boards[0]!.id, 'Start')); }); });
  await settle();
  return hook;
}

let held: ReturnType<typeof holdSeal> | null = null;
const release = () => { held?.release(); held = null; };
beforeEach(async () => { vi.useFakeTimers({ shouldAdvanceTime: true }); bootFixtureCore({ rules: [] }); await settle(); });
afterEach(() => { release(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('edits queued on a locked commit, the narrow edges', () => {
  it('a reorder of a Board another tab deleted is skipped: no notice, the other Boards keep the order the commit gives them', async () => {
    const { result } = await tabWith(3);
    const st0 = result.current.state;
    const victim = st0.boards.find((b) => b.name !== 'Start' && b.id !== st0.active)!;
    const now = await stored();
    const gone = must(deleteBoard(now, victim.id, rand));
    const theirs = await sealedBytes(gone);
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s, rr) => createBoard(s, rr ?? rand, 'New')).then((v) => { r = v; }); });
    await held.sealing();
    // From its tab's drag, as the view does it: by id, to the front.
    act(() => { result.current.apply((s) => reorderBoard(s, s.boards.findIndex((b) => b.id === victim.id), 0)); });
    expect(result.current.state.boards[0]?.id).toBe(victim.id);
    localStorage.setItem(BOARDS_KEY, theirs);
    release();
    await settle();
    await settle();
    expect(r).toBeNull();
    const want = names(must(createBoard(gone, rand, 'New')));
    for (const s of [result.current.state, await reloaded()]) {
      expect(s.boards.some((b) => b.id === victim.id)).toBe(false);
      expect(names(s)).toEqual(want);
    }
    expect(result.current.notice).toBeNull();
  });
  it('a recorded edit of another Board that is still there keeps the undo step apply gave it', async () => {
    const { result } = await tabWith(2);
    const start = result.current.state.boards.find((b) => b.name === 'Start')!;
    const now = await stored();
    const theirs = await sealedBytes(must(createBoard(now, rand, 'Theirs')));
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s, rr) => createBoard(s, rr ?? rand, 'New')).then((v) => { r = v; }); });
    await held.sealing();
    act(() => { result.current.apply((s) => renameBoard(s, start.id, 'Start 2'), { record: 'rename' }); });
    expect(result.current.undoLabel).toBe('rename');
    localStorage.setItem(BOARDS_KEY, theirs);
    release();
    await settle();
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) {
      expect(names(s)).toEqual(expect.arrayContaining(['Start 2', 'Theirs', 'New']));
    }
    expect(result.current.state.boards.find((b) => b.id === result.current.state.active)?.name).toBe('New');
    expect(result.current.undoLabel).toBe('rename');
    expect(result.current.notice?.kind).not.toBe('deleted');
  });
});
