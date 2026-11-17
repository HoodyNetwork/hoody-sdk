/* eslint-disable no-restricted-globals -- these tests play another browser tab whose store lands first (its sealed
   bytes put in place before this tab's write); the page reaches storage only through core */
// Vitest, S-move: a cross-Board move committed under the cross-tab
// lock (applyLocked) with clearUndoIds drops both Boards' undo steps, so no undo puts the moved tile back on one Board
// while the other still holds it. Edits after the move stay undoable and never duplicate it. A capture that no longer
// holds on the Boards as stored (the target deleted in another tab) moves nothing.
import { bootFixtureCore, FIXTURE_REALM } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARDS_KEY, useBoards } from './data';
import {
  addTile, createBoard, deleteBoard, findTileSlot, isRefusal, moveTileToBoard, onActive, renameBoard, setActiveBoard, splitAt,
  type Board, type MoveTileOpts, type RealmBoards, type Refusal, type Tile,
} from './model/boards';
import { parseRealmBoards, toStored } from './model/persist';

let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
const settle = async () => { for (let i = 0; i < 6; i++) await act(() => cryptIdleForTests()); };
const stored = async () => parseRealmBoards(JSON.parse(JSON.stringify(await storedForTests(BOARDS_KEY, FIXTURE_REALM)))).state;
const where = (s: RealmBoards, tid: string): string[] => s.boards.filter((b) => findTileSlot(b, tid) !== null).map((b) => b.id);
const web = (path: string): Tile => ({ url: 'https://docs.example/' + path });
const add = (t: Tile) => (s: RealmBoards, held: ReadonlySet<string>) => onActive(s, (b, taken) => { const r = addTile(b, t, rand, taken); return isRefusal(r) ? r : r.board; }, held);

/** A tab with Boards S (two web tiles, two recorded steps) and T (one web tile, one recorded step), T active. */
async function tab() {
  const hook = renderHook(() => useBoards());
  await settle();
  const r = () => hook.result.current;
  act(() => { r().apply((s) => must(renameBoard(must(createBoard(s, rand)), s.boards[0]!.id, 'S'))); });
  await settle();
  const [S, T] = r().state.boards as [Board, Board];
  act(() => { r().apply((s) => must(setActiveBoard(s, S.id))); });
  act(() => { r().apply(add(web('a')), { record: 'add a' }); });
  act(() => { r().apply(add(web('b')), { record: 'add b' }); });
  act(() => { r().apply((s) => must(setActiveBoard(s, T.id))); });
  act(() => { r().apply(add(web('c')), { record: 'add c' }); });
  await settle();
  const sNow = r().state.boards.find((b) => b.id === S.id) as Board;
  const tid = Object.values(sNow.tiles).find((t) => t && 'url' in t && t.url.endsWith('/a'))?.tid as string;
  return { hook, r, S: S.id, T: T.id, tid };
}
/** The view's move op: the Boards another tab deleted (the round's stored tombstones) are gone for it. */
const moveOp = (o: MoveTileOpts) => (s: RealmBoards, rr: () => number, _held: ReadonlySet<string>, st: RealmBoards) => {
  const m = moveTileToBoard(s, { ...o, deleted: st.gone }, rr);
  return isRefusal(m) ? m : m.state;
};
/** The sealed bytes another tab would store for `value`, with this tab's storage left as it was. */
async function sealedBytes(value: RealmBoards): Promise<string> {
  const before = localStorage.getItem(BOARDS_KEY);
  await act(() => writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(value)));
  const bytes = localStorage.getItem(BOARDS_KEY) as string;
  if (before === null) localStorage.removeItem(BOARDS_KEY); else localStorage.setItem(BOARDS_KEY, before);
  return bytes;
}
/** Holds this tab's seals (a write on its way) until released. */
function holdSeal() {
  const subtle = globalThis.crypto.subtle;
  const real = subtle.encrypt.bind(subtle);
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  const spy = vi.spyOn(subtle, 'encrypt').mockImplementation(async (...a: Parameters<SubtleCrypto['encrypt']>) => { await gate; return real(...a); });
  return { sealing: () => vi.waitFor(() => expect(spy).toHaveBeenCalled()), release: () => { open(); spy.mockRestore(); } };
}

beforeEach(async () => { vi.useFakeTimers({ shouldAdvanceTime: true }); bootFixtureCore({ rules: [] }); await settle(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('a cross-Board move under the lock', () => {
  it('clears both Boards\' undo steps; the move is stored; Move back clears them again', async () => {
    const { r, S, T, tid } = await tab();
    act(() => { r().apply((s) => must(setActiveBoard(s, S))); });
    expect(r().undoLabel).toBe('add b');
    let res: unknown = 'pending';
    await act(async () => { res = await r().applyLocked(moveOp({ tid, fromBoardId: S, target: { kind: 'board', toBoardId: T } }), { clearUndoIds: () => [S, T] }); });
    await settle();
    expect(res).toBeNull();
    expect(r().state.active).toBe(T);
    expect(r().undoLabel).toBeNull();
    act(() => { r().apply((s) => must(setActiveBoard(s, S))); });
    expect(r().undoLabel).toBeNull();
    // Undo on either Board does nothing: the tile stays exactly once, on T, shown and stored.
    act(() => { r().undo(); });
    await settle();
    expect(where(r().state, tid)).toEqual([T]);
    expect(where(await stored(), tid)).toEqual([T]);
    // An edit after the move is undoable, and its undo keeps the tile once.
    act(() => { r().apply((s) => must(setActiveBoard(s, T))); });
    act(() => { r().apply((s, held) => onActive(s, (b) => { const x = splitAt(b, b.active, 'right', rand); return isRefusal(x) ? x : x.board; }, held), { record: 'split' }); });
    expect(r().undoLabel).toBe('split');
    act(() => { r().undo(); });
    await settle();
    expect(where(r().state, tid)).toEqual([T]);
    // Move back: the tile on S again, once; both undo lists empty again.
    await act(async () => { res = await r().applyLocked(moveOp({ tid, fromBoardId: T, target: { kind: 'board', toBoardId: S } }), { clearUndoIds: () => [T, S] }); });
    await settle();
    expect(res).toBeNull();
    expect(where(r().state, tid)).toEqual([S]);
    expect(where(await stored(), tid)).toEqual([S]);
    expect(r().undoLabel).toBeNull();
    act(() => { r().apply((s) => must(setActiveBoard(s, T))); });
    expect(r().undoLabel).toBeNull();
  });

  it('other Boards keep their undo steps', async () => {
    const { r, S, T, tid } = await tab();
    act(() => { r().apply((s) => must(createBoard(s, rand, 'U'))); });
    const U = r().state.active;
    act(() => { r().apply(add(web('u')), { record: 'add u' }); });
    await act(async () => { await r().applyLocked(moveOp({ tid, fromBoardId: S, target: { kind: 'board', toBoardId: T } }), { clearUndoIds: () => [S, T] }); });
    act(() => { r().apply((s) => must(setActiveBoard(s, U))); });
    expect(r().undoLabel).toBe('add u');
  });

  it('the target deleted in another tab before the commit: NOT_FOUND, the tile stays on S, nothing is lost', async () => {
    const { r, S, T, tid } = await tab();
    const now = await stored();
    const gone = must(deleteBoard(now, T, rand));
    await act(async () => {
      await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(gone));
      window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
      await cryptIdleForTests();
    });
    let res: unknown = 'pending';
    await act(async () => { res = await r().applyLocked(moveOp({ tid, fromBoardId: S, target: { kind: 'board', toBoardId: T } }), { clearUndoIds: () => [S, T] }); });
    await settle();
    expect(res).toEqual({ refused: 'NOT_FOUND' });
    expect(where(r().state, tid)).toEqual([S]);
    expect(where(await stored(), tid)).toEqual([S]);
  });
  it('the target renamed here (write on its way) and deleted in another tab while the move waits: NOT_FOUND', async () => {
    const { r, S, T, tid } = await tab();
    const theirs = await sealedBytes(must(deleteBoard(await stored(), T, rand)));
    // This tab renames T; its write is on its way (sealing held) when the move starts: the move waits for it.
    const held = holdSeal();
    act(() => { r().apply((s) => must(renameBoard(s, T, 'Renamed'))); });
    await held.sealing();
    const op = moveOp({ tid, fromBoardId: S, target: { kind: 'board', toBoardId: T } });
    let seen: { stored: RealmBoards; shown: RealmBoards } | null = null;
    let move!: Promise<unknown>;
    act(() => { move = r().applyLocked((s, rr, h, st) => { seen = { stored: st, shown: s }; return op(s, rr, h, st); }, { clearUndoIds: () => [S, T] }); });
    await act(async () => { await Promise.resolve(); });
    // The other tab's delete of T lands first; then the rename's write goes on (and loses).
    localStorage.setItem(BOARDS_KEY, theirs);
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    held.release();
    let res: unknown = 'pending';
    await act(async () => { res = await move; });
    await settle();
    // The op saw T kept here by the fold (this tab renamed it) and its tombstone in the stored value.
    const got = seen as { stored: RealmBoards; shown: RealmBoards } | null;
    expect(got?.stored.gone).toContain(T);
    expect(got?.shown.boards.some((b) => b.id === T)).toBe(true);
    expect(res).toEqual({ refused: 'NOT_FOUND' });
    expect(where(r().state, tid)).toEqual([S]);
    expect(where(await stored(), tid)).toEqual([S]);
  });
});
