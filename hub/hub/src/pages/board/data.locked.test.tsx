/* eslint-disable no-restricted-globals -- these tests play another browser tab whose store lands first (its sealed
   bytes put in place before this tab's write); the page reaches storage only through core */
// Vitest: Open with's two-tab rule: a keyed add, and every new
// Board, commits against the latest stored value under a cross-tab lock and runs again on another tab's value after a
// conflict. So two tabs never make two program boards for one key, never store a tenth Board (the load would drop
// one), and both tiles added to one program board at once are kept.
import { bootFixtureCore, FIXTURE_REALM } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARDS_KEY, LOCK_ROUNDS, NOT_ADDED, useBoards } from './data';
import { boardFor, createBoard, isRefusal, keyedAddTile, MAX_BOARDS, renameBoard, reorderBoard, type Board, type RealmBoards, type Refusal, type TileRef } from './model/boards';
import { parseRealmBoards, toStored } from './model/persist';

let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
const term = (session: number): TileRef => ({ project: 'p1', computer: 'c1', program: 'terminal', session });
const NANO = { for: { c: 'c1', k: 'ow:nano' }, name: 'Nano · atlas' };
const RUN = { for: { c: 'c1', k: 'ow:run' }, name: 'Run · atlas' };
const settle = async () => { for (let i = 0; i < 6; i++) await act(() => cryptIdleForTests()); };
const stored = async () => (await storedForTests(BOARDS_KEY, FIXTURE_REALM)) as RealmBoards;
/** After a reload: what the load makes of the stored value (it keeps at most nine Boards). */
const reloaded = async () => parseRealmBoards(JSON.parse(JSON.stringify(await stored()))).state;
// Tiles as compared here: without their tile ids (S-id; the id rules are model/boards.tid.test.ts).
const tilesOf = (b: Board | undefined) => Object.values(b?.tiles ?? {}).filter(Boolean).map((t) => { const { tid: _tid, ...rest } = t as TileRef; return rest; });
/** The sealed bytes another tab's store of `value` would leave; storage is put back as it was. */
async function sealedBytes(value: RealmBoards): Promise<string> {
  const before = localStorage.getItem(BOARDS_KEY);
  await act(() => writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(value)));
  const bytes = localStorage.getItem(BOARDS_KEY) as string;
  if (before === null) localStorage.removeItem(BOARDS_KEY); else localStorage.setItem(BOARDS_KEY, before);
  return bytes;
}
/** This tab with `boards` Boards stored, the first one maybe changed by `f`. */
async function tabWith(boards: number, f: (s: RealmBoards) => RealmBoards = (s) => s) {
  const hook = renderHook(() => useBoards());
  await settle();
  act(() => { hook.result.current.apply((s) => { let x = s; while (x.boards.length < boards) x = must(createBoard(x, rand)); return f(x); }); });
  await settle();
  return hook;
}

beforeEach(async () => { vi.useFakeTimers({ shouldAdvanceTime: true }); bootFixtureCore({ rules: [] }); await settle(); });
afterEach(() => { vi.useRealTimers(); });

describe('keyed_add_concurrent_ninth_board_preserves_landings', () => {
  it('one key: 8 Boards, another tab stores its Nano board first; this tab\'s add reuses it: one board, both tiles', async () => {
    const { result } = await tabWith(MAX_BOARDS - 1);
    const theirs = await sealedBytes(must(keyedAddTile(await stored(), NANO, term(8003), rand)).state);
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s) => { const x = keyedAddTile(s, NANO, term(8004), rand); return isRefusal(x) ? x : x.state; }).then((v) => { r = v; }); });
    localStorage.setItem(BOARDS_KEY, theirs); // another tab stored first
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) {
      expect(s.boards).toHaveLength(MAX_BOARDS);
      expect(s.boards.filter((b) => b.for?.k === 'ow:nano')).toHaveLength(1);
      expect(tilesOf(boardFor(s, NANO.for))).toEqual([term(8003), term(8004)]);
    }
    expect(result.current.state.active).toBe(boardFor(result.current.state, NANO.for)!.id);
  });
  it('two keys: another tab\'s Run board is the ninth; this tab\'s Nano add is BOARDS_FULL and changes nothing', async () => {
    const { result } = await tabWith(MAX_BOARDS - 1);
    const theirs = await sealedBytes(must(keyedAddTile(await stored(), RUN, term(8005), rand)).state);
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s) => { const x = keyedAddTile(s, NANO, term(8003), rand); return isRefusal(x) ? x : x.state; }).then((v) => { r = v; }); });
    localStorage.setItem(BOARDS_KEY, theirs);
    await settle();
    expect(r).toEqual({ refused: 'BOARDS_FULL' });
    for (const s of [result.current.state, await reloaded()]) {
      expect(s.boards).toHaveLength(MAX_BOARDS);
      expect(boardFor(s, RUN.for)).toBeDefined();
      expect(boardFor(s, NANO.for)).toBeUndefined();
    }
  });
});

describe('ordinary_create_after_keyed_ninth_never_drops_landing', () => {
  it('8 Boards; tab A stores a keyed ninth while this tab (C) has a reorder pending and creates a ninth: C is refused, A\'s board stays after a reload', async () => {
    const { result } = await tabWith(MAX_BOARDS - 1);
    const theirs = await sealedBytes(must(keyedAddTile(await stored(), NANO, term(8003), rand)).state);
    const moved = result.current.state.boards[MAX_BOARDS - 2]!.id;
    let r: unknown = 'pending';
    act(() => {
      result.current.apply((s) => reorderBoard(s, MAX_BOARDS - 2, 0)); // C's reorder, its store on its way
      void result.current.applyLocked((s) => createBoard(s, rand, 'C ninth')).then((v) => { r = v; });
    });
    localStorage.setItem(BOARDS_KEY, theirs); // A stored first
    await settle();
    expect(r).toEqual({ refused: 'BOARDS_FULL' });
    for (const s of [result.current.state, await reloaded()]) {
      expect(s.boards).toHaveLength(MAX_BOARDS);
      expect(boardFor(s, NANO.for)).toBeDefined();
      expect(s.boards.some((b) => b.name === 'C ninth')).toBe(false);
    }
    expect(result.current.state.boards[0]!.id).toBe(moved);
  });
});

/** The keyed add, with another tab's store landing between this tab's read and its store, on the first round only
 *  (so this tab's store meets a conflict and runs again on that tab's value). */
const racedBy = (theirs: string, add = NANO, session = 8004, late = false) => {
  let first = true;
  return (s: RealmBoards) => {
    // late: the other tab's store lands after this tab's write was accepted, while it is sealed (core: 'conflict').
    if (first) { first = false; if (late) queueMicrotask(() => localStorage.setItem(BOARDS_KEY, theirs)); else localStorage.setItem(BOARDS_KEY, theirs); }
    const x = keyedAddTile(s, add, term(session), rand);
    return isRefusal(x) ? x : x.state;
  };
};

describe('the same, with the other tab storing after this tab read (a conflict: run again on the winner)', () => {
  it('one key: one Nano board with both tiles; two keys: BOARDS_FULL and nothing stored past nine', async () => {
    const { result } = await tabWith(MAX_BOARDS - 1);
    const theirs = await sealedBytes(must(keyedAddTile(await stored(), NANO, term(8003), rand)).state);
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked(racedBy(theirs)).then((v) => { r = v; }); });
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) {
      expect(s.boards).toHaveLength(MAX_BOARDS);
      expect(tilesOf(boardFor(s, NANO.for))).toEqual([term(8003), term(8004)]);
    }
    expect(result.current.notice).toBeNull();
  });
  it('one key, the other tab storing while this tab\'s write is sealed (core answers conflict): one board, both tiles', async () => {
    const { result } = await tabWith(MAX_BOARDS - 1);
    const theirs = await sealedBytes(must(keyedAddTile(await stored(), NANO, term(8003), rand)).state);
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked(racedBy(theirs, NANO, 8004, true)).then((v) => { r = v; }); });
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) {
      expect(s.boards).toHaveLength(MAX_BOARDS);
      expect(tilesOf(boardFor(s, NANO.for))).toEqual([term(8003), term(8004)]);
    }
  });
  it('two keys', async () => {
    const { result } = await tabWith(MAX_BOARDS - 1);
    const theirs = await sealedBytes(must(keyedAddTile(await stored(), RUN, term(8005), rand)).state);
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked(racedBy(theirs)).then((v) => { r = v; }); });
    await settle();
    expect(r).toEqual({ refused: 'BOARDS_FULL' });
    for (const s of [result.current.state, await reloaded()]) {
      expect(s.boards).toHaveLength(MAX_BOARDS);
      expect(boardFor(s, RUN.for)).toBeDefined();
      expect(boardFor(s, NANO.for)).toBeUndefined();
    }
  });
  it('reuse: two tabs add to one program board and a third renamed it: every tile and the rename are kept', async () => {
    const { result } = await tabWith(2);
    act(() => { void result.current.applyLocked((s) => { const x = keyedAddTile(s, NANO, term(8003), rand); return isRefusal(x) ? x : x.state; }); });
    await settle();
    const base = await stored();
    const id = boardFor(base, NANO.for)!.id;
    const theirs = await sealedBytes(must(renameBoard(must(keyedAddTile(base, NANO, term(8005), rand)).state, id, 'Editors')));
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked(racedBy(theirs)).then((v) => { r = v; }); });
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) {
      const b = boardFor(s, NANO.for);
      expect(b?.name).toBe('Editors');
      expect(tilesOf(b)).toEqual([term(8003), term(8005), term(8004)]);
    }
  });
  it('another tab storing first on every round: after the rounds, NOT_ADDED, and nothing of this add is kept', async () => {
    const { result } = await tabWith(2);
    const now = await stored();
    const others: string[] = [];
    for (let i = 1; i <= 6; i++) others.push(await sealedBytes(must(renameBoard(now, now.boards[0]!.id, 'Other ' + i))));
    let k = 0;
    let r: unknown = 'pending';
    act(() => {
      void result.current.applyLocked((s) => {
        // Each round, another tab stores a rename first (a new value each time).
        localStorage.setItem(BOARDS_KEY, others[k++] as string);
        const x = keyedAddTile(s, NANO, term(8003), rand);
        return isRefusal(x) ? x : x.state;
      }).then((v) => { r = v; });
    });
    await settle();
    await settle();
    expect(r).toBe(NOT_ADDED);
    expect(k).toBe(LOCK_ROUNDS + 1);
    expect(boardFor(result.current.state, NANO.for)).toBeUndefined();
    expect(boardFor(await stored(), NANO.for)).toBeUndefined();
  });
});

describe('keyed_add_concurrent_reuse_keeps_both_tiles', () => {
  it('two tabs add to one program board at once, and a third renamed it meanwhile: every tile is there, the rename too', async () => {
    const { result } = await tabWith(2);
    act(() => { void result.current.applyLocked((s) => { const x = keyedAddTile(s, NANO, term(8003), rand); return isRefusal(x) ? x : x.state; }); });
    await settle();
    const base = await stored();
    const id = boardFor(base, NANO.for)!.id;
    const theirs = await sealedBytes(must(renameBoard(must(keyedAddTile(base, NANO, term(8005), rand)).state, id, 'Editors')));
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s) => { const x = keyedAddTile(s, NANO, term(8004), rand); return isRefusal(x) ? x : x.state; }).then((v) => { r = v; }); });
    localStorage.setItem(BOARDS_KEY, theirs);
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) {
      const b = boardFor(s, NANO.for);
      expect(b?.name).toBe('Editors');
      expect(tilesOf(b)).toEqual([term(8003), term(8005), term(8004)]);
    }
  });
});

describe('a locked commit that cannot run adds nothing', () => {
  it('no lock manager: NOT_ADDED, nothing changes', async () => {
    const { result } = await tabWith(1);
    const before = result.current.state;
    const locks = Object.getOwnPropertyDescriptor(globalThis.navigator, 'locks');
    Object.defineProperty(globalThis.navigator, 'locks', { value: undefined, configurable: true });
    try {
      let r: unknown;
      await act(async () => { r = await result.current.applyLocked((s) => createBoard(s, rand)); });
      expect(r).toBe(NOT_ADDED);
      expect(result.current.state).toBe(before);
    } finally {
      if (locks) Object.defineProperty(globalThis.navigator, 'locks', locks); else delete (globalThis.navigator as { locks?: unknown }).locks;
    }
  });
  it('an ordinary edit already stored is folded in before the op runs (a reorder kept, the new Board after it)', async () => {
    const { result } = await tabWith(3);
    const theirs = await sealedBytes(reorderBoard(await stored(), 2, 0));
    localStorage.setItem(BOARDS_KEY, theirs);
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await settle();
    let r: unknown = 'pending';
    await act(async () => { r = await result.current.applyLocked((s) => createBoard(s, rand, 'New')); });
    await settle();
    expect(r).toBeNull();
    const s = await stored();
    expect(s.boards).toHaveLength(4);
    expect(s.boards[3]!.name).toBe('New');
    expect(s.boards.map((b) => b.id).slice(0, 3)).toEqual(result.current.state.boards.map((b) => b.id).slice(0, 3));
  });
});
