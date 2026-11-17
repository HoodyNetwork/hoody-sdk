/* eslint-disable no-restricted-globals -- these tests play another browser tab whose store lands first (its sealed
   bytes put in place before this tab's write); the page reaches storage only through core */
// Vitest, an edit on a deleted Board: an edit queued on a Board that another tab deleted (a Board the locked commit did
// not make) is made again on that Board as it was: its change to that Board is not applied (never on another Board, no
// undo step, the notice says the Board was deleted in another tab), and its realm-wide change still is.
import { bootFixtureCore, FIXTURE_REALM } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARDS_KEY, useBoards } from './data';
import { createBoard, deleteBoard, isRefusal, onActive, renameBoard, setActiveBoard, setKeepLoaded, type RealmBoards, type Refusal } from './model/boards';
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

describe('an edit queued on a Board another tab deleted, through a lost race', () => {
  it('its change to that Board is not applied: the Board left shown is untouched, no undo step, the notice names it; the commit still lands', async () => {
    const { result } = await tabWith(2);
    const oldBoard = result.current.state.boards.find((b) => b.name !== 'Start')!;
    const old = oldBoard.id;
    const now = await stored();
    const theirs = await sealedBytes(must(deleteBoard(now, old, rand)));
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s, rr) => createBoard(s, rr ?? rand, 'New')).then((v) => { r = v; }); });
    await held.sealing();
    act(() => { result.current.apply((s) => setActiveBoard(s, old)); });
    act(() => { result.current.apply((s) => onActive(s, (b) => ({ ...b, mode: 'scroll' as const })), { record: 'mode' }); });
    expect(result.current.state.boards.find((b) => b.id === old)?.mode).toBe('scroll');
    localStorage.setItem(BOARDS_KEY, theirs);
    release();
    await settle();
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) {
      expect(s.boards.some((b) => b.id === old)).toBe(false);
      expect(names(s)).toContain('New');
      expect(s.boards.filter((b) => b.mode === 'scroll').map((b) => b.name)).toEqual([]);
    }
    expect(result.current.undoLabel).toBeNull();
    expect(result.current.notice).toEqual({ kind: 'deleted', name: oldBoard.name });
  });
  it('a realm-wide change made while that Board was shown still applies (keep loaded), and nothing lands on another Board', async () => {
    const { result } = await tabWith(2);
    const old = result.current.state.boards.find((b) => b.name !== 'Start')!.id;
    const now = await stored();
    expect(now.keep).not.toBe(true);
    const theirs = await sealedBytes(must(deleteBoard(now, old, rand)));
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s, rr) => createBoard(s, rr ?? rand, 'New')).then((v) => { r = v; }); });
    await held.sealing();
    act(() => { result.current.apply((s) => setActiveBoard(s, old)); });
    act(() => { result.current.apply((s) => setKeepLoaded(s, true)); });
    localStorage.setItem(BOARDS_KEY, theirs);
    release();
    await settle();
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) {
      expect(s.keep).toBe(true);
      expect(s.boards.some((b) => b.id === old)).toBe(false);
      expect(names(s)).toContain('New');
      expect(s.boards.some((b) => b.id === s.active)).toBe(true);
    }
    // Nothing of that Board's own was lost, so no notice speaks of it.
    expect(result.current.notice).toBeNull();
  });
  it('the change it lost is judged on the Board as it was when the edit was made: a rename of it is reported too', async () => {
    const { result } = await tabWith(2);
    const oldBoard = result.current.state.boards.find((b) => b.name !== 'Start')!;
    const now = await stored();
    const theirs = await sealedBytes(must(deleteBoard(now, oldBoard.id, rand)));
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s, rr) => createBoard(s, rr ?? rand, 'New')).then((v) => { r = v; }); });
    await held.sealing();
    act(() => { result.current.apply((s) => setActiveBoard(s, oldBoard.id)); });
    act(() => { result.current.apply((s) => renameBoard(s, oldBoard.id, 'Renamed'), { record: 'rename' }); });
    localStorage.setItem(BOARDS_KEY, theirs);
    release();
    await settle();
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) expect(names(s)).not.toContain('Renamed');
    expect(result.current.notice).toEqual({ kind: 'deleted', name: oldBoard.name });
  });
  it('an edit on the Board the locked commit made, when the retry is refused, is not reported as a Board deleted in another tab', async () => {
    const { result } = await tabWith(2);
    const now = await stored();
    let full: RealmBoards = now;
    while (full.boards.length < 9) full = must(createBoard(full, rand, 'Theirs ' + full.boards.length));
    const theirs = await sealedBytes(full);
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s, rr) => createBoard(s, rr ?? rand, 'New')).then((v) => { r = v; }); });
    await held.sealing();
    act(() => { result.current.apply((s) => renameBoard(s, s.active, 'Edited')); }); // on New, the Board shown
    localStorage.setItem(BOARDS_KEY, theirs);
    release();
    await settle();
    await settle();
    expect(r).toEqual({ refused: 'BOARDS_FULL' });
    expect(names(result.current.state)).not.toContain('Edited');
    expect(result.current.notice?.kind).not.toBe('deleted');
  });
  it('a rename of a Board that is not shown, by its id, is reported too, and lands on no other Board', async () => {
    const { result } = await tabWith(2);
    const oldBoard = result.current.state.boards.find((b) => b.name !== 'Start')!;
    const now = await stored();
    const theirs = await sealedBytes(must(deleteBoard(now, oldBoard.id, rand)));
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s, rr) => createBoard(s, rr ?? rand, 'New')).then((v) => { r = v; }); });
    await held.sealing();
    expect(result.current.state.boards.find((b) => b.id === result.current.state.active)?.name).toBe('New');
    act(() => { result.current.apply((s) => renameBoard(s, oldBoard.id, 'Renamed'), { record: 'rename' }); }); // from its tab's menu
    localStorage.setItem(BOARDS_KEY, theirs);
    release();
    await settle();
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) {
      expect(names(s)).not.toContain('Renamed');
      expect(names(s)).toContain('New');
      expect(s.boards.some((b) => b.id === oldBoard.id)).toBe(false);
    }
    expect(result.current.undoLabel).toBeNull();
    expect(result.current.notice).toEqual({ kind: 'deleted', name: oldBoard.name });
  });
  it('a later round that has the Board again (its change applied after all) takes the notice back', async () => {
    const { result } = await tabWith(2);
    const old = result.current.state.boards.find((b) => b.name !== 'Start')!.id;
    const now = await stored();
    const gone = await sealedBytes(must(deleteBoard(now, old, rand)));
    let back: RealmBoards = now;
    while (back.boards.length < 9) back = must(createBoard(back, rand, 'Theirs ' + back.boards.length));
    const full = await sealedBytes(back);
    held = holdSeal();
    let k = 0;
    let r: unknown = 'pending';
    act(() => {
      void result.current.applyLocked((s, rr) => {
        k++;
        if (k === 2) queueMicrotask(() => localStorage.setItem(BOARDS_KEY, full)); // wins round 2's store: Old is back, nine Boards
        return createBoard(s, rr ?? rand, 'New');
      }).then((v) => { r = v; });
    });
    await held.sealing();
    act(() => { result.current.apply((s) => setActiveBoard(s, old)); });
    act(() => { result.current.apply((s) => onActive(s, (b) => ({ ...b, mode: 'scroll' as const })), { record: 'mode' }); });
    localStorage.setItem(BOARDS_KEY, gone); // wins round 1's store: Old deleted
    release();
    await settle();
    await settle();
    await settle();
    expect(k).toBe(3);
    expect(r).toEqual({ refused: 'BOARDS_FULL' });
    expect(result.current.state.boards.find((b) => b.id === old)?.mode).toBe('scroll');
    expect(result.current.notice?.kind).not.toBe('deleted');
  });
});
