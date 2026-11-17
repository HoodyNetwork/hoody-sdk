// Vitest: the Board's count for the left menu (navCount.ts): the selected realm's stored Boards and their
// tiles, read only, following edits here and in another tab and every realm switch; null (never 0) while unknown.
/* eslint-disable no-restricted-globals -- another tab's write is played through the storage event, as data.test does */
import { bootFixtureCore, fixtureWorld, FIXTURE_REALM } from '@core';
import { bump, identity, setIdentity, setRealm, setSwitching } from '@core/ctx';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { accountPref } from '@core';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARDS_KEY, useBoards } from './data';
import { addTile, createBoard, freshRealm, isRefusal, onActive, type RealmBoards, type Tile } from './model/boards';
import { toStored } from './model/persist';
import { links } from './links.pure';
import useBoardCounts, { boardCounts } from './navCount';

const UID = fixtureWorld.account.id;
const announce = () => window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
const OTHER_REALM = fixtureWorld.realms.map((r) => r.id).find((id) => id !== FIXTURE_REALM) as string;
const tile = (session: number): Tile => ({ project: 'p1', computer: 'c1', program: 'terminal', session });
const settle = () => act(() => cryptIdleForTests());
// The same slot data.ts reads (core keeps one page copy and oversized mark per key, account and part).
const slot = () => accountPref(BOARDS_KEY, (v: unknown) => v, { scope: 'account+realm', keepAtSignOut: true });
const must = (x: RealmBoards | { refused: string }): RealmBoards => { if (isRefusal(x)) throw new Error('refused'); return x as RealmBoards; };
let seed = 0;
const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
// A web tile at the address limit: a few Boards of them go over the encrypted store's limit.
const bigUrl = (i: number) => 'https://e.example/' + String(i).padStart(4, '0') + 'a'.repeat(2026);
/** Adds big web tiles (a new Board when one is full) until the browser refuses the write for size; the Board's state. */
function overfill(board: { result: { current: ReturnType<typeof useBoards> } }): RealmBoards {
  for (let i = 0; i < 60 && board.result.current.notice?.kind !== 'unsaved'; i++) {
    let r: unknown = null;
    act(() => { r = board.result.current.apply((s) => onActive(s, (b) => { const a = addTile(b, { url: bigUrl(i) }, rand); return isRefusal(a) ? a : a.board; })); });
    if (r) act(() => { board.result.current.apply((s) => createBoard(s, rand, 'B' + i)); });
  }
  expect(board.result.current.notice?.kind).toBe('unsaved');
  return board.result.current.state;
}
const tilesIn = (s: RealmBoards) => boardCounts(s).total;
const withTile = (n: number) => (s: RealmBoards) => onActive(s, (b) => { const r = addTile(b, tile(n), rand); return isRefusal(r) ? r : r.board; });
async function otherTabStores(value: unknown) {
  await act(async () => {
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, value);
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
}

beforeEach(async () => { vi.useFakeTimers({ shouldAdvanceTime: true }); bootFixtureCore({ rules: [] }); await settle(); });
afterEach(() => { vi.useRealTimers(); });

describe('boardCounts', () => {
  it('each Board\'s id, name and tiles, and the sum', () => {
    const one = must(withTile(3)(must(withTile(2)(freshRealm(rand)))));
    const two = must(withTile(4)(must(createBoard(one, rand, 'Two'))));
    expect(boardCounts(two)).toEqual({
      total: 3,
      boards: [
        { id: two.boards[0]!.id, name: two.boards[0]!.name, tiles: 2 },
        { id: two.boards[1]!.id, name: 'Two', tiles: 1 },
      ],
      // Jump to's rows: the named Board only, at the Board's own link.
      items: [{ id: two.boards[1]!.id, label: 'Two', to: links.boardById(two.boards[1]!.id) }],
    });
    expect(two.boards[0]!.name).toBe('');
  });
  it('a Board never named is no item', () => {
    expect(boardCounts(freshRealm(rand)).items).toEqual([]);
  });
});

describe('useBoardCounts', () => {
  it('nothing stored yet: one Board with no tiles, a known 0', async () => {
    const { result } = renderHook(() => useBoardCounts());
    await settle();
    expect(result.current?.total).toBe(0);
    expect(result.current?.boards).toHaveLength(1);
    expect(result.current?.boards?.[0]?.tiles).toBe(0);
  });

  it('follows this tab\'s edits on every Board, mounted apart from the Board (its own notifications)', async () => {
    const { result } = renderHook(() => useBoardCounts());
    const board = renderHook(() => useBoards());
    await settle();
    act(() => { board.result.current.apply(withTile(2)); });
    act(() => { board.result.current.apply(withTile(3)); });
    act(() => { board.result.current.apply((s) => createBoard(s, rand, 'Two')); });
    act(() => { board.result.current.apply(withTile(4)); });
    await settle();
    expect(result.current?.total).toBe(3);
    expect(result.current?.boards?.map((b) => b.tiles)).toEqual([2, 1]);
    expect(result.current?.boards?.[1]?.name).toBe('Two');
  });

  it('the same result object across renders that change nothing', async () => {
    const { result, rerender } = renderHook(() => useBoardCounts());
    await settle();
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('a document another Hub wrote over an empty realm turns a known 0 into null, and back when it goes', async () => {
    const { result } = renderHook(() => useBoardCounts());
    await settle();
    expect(result.current?.total).toBe(0);
    act(() => { localStorage.setItem(BOARDS_KEY, JSON.stringify({ x: 1 })); announce(); });
    await settle();
    expect(result.current).toBeNull();
    act(() => { localStorage.removeItem(BOARDS_KEY); announce(); });
    await settle();
    expect(result.current?.total).toBe(0);
  });

  it('a saved value that does not open on this browser: null', async () => {
    const first = renderHook(() => useBoards());
    act(() => { first.result.current.apply(withTile(2)); });
    await settle();
    first.unmount();
    const d = JSON.parse(localStorage.getItem(BOARDS_KEY) as string) as { a: Record<string, Record<string, Record<string, unknown>>> };
    const leaf = d.a[UID]![FIXTURE_REALM]!;
    d.a[UID]![FIXTURE_REALM] = { ...leaf, ct: String(leaf.ct).split('').reverse().join('') };
    act(() => { localStorage.setItem(BOARDS_KEY, JSON.stringify(d)); announce(); });
    await settle();
    const { result } = renderHook(() => useBoardCounts());
    await settle();
    expect(result.current).toBeNull();
  });

  it('follows another tab\'s write', async () => {
    const api = renderHook(() => useBoards());
    act(() => { api.result.current.apply(withTile(2)); });
    await settle();
    const { result } = renderHook(() => useBoardCounts());
    expect(result.current?.total).toBe(1);
    const now = (await storedForTests(BOARDS_KEY, FIXTURE_REALM)) as RealmBoards;
    await otherTabStores(must(withTile(5)(now)));
    expect(result.current?.total).toBe(2);
  });

  it('follows the selected realm, \'all\' included', async () => {
    const api = renderHook(() => useBoards());
    act(() => { api.result.current.apply(withTile(2)); });
    await settle();
    const { result } = renderHook(() => useBoardCounts());
    expect(result.current?.total).toBe(1);
    act(() => { setRealm(OTHER_REALM); });
    await settle();
    expect(result.current?.total).toBe(0);
    act(() => { setRealm('all'); });
    await settle();
    expect(result.current?.total).toBe(0);
    act(() => { setRealm(FIXTURE_REALM); });
    await settle();
    expect(result.current?.total).toBe(1);
  });

  it('null, never 0, while a realm switch is under way and when the stored value cannot be read', async () => {
    const { result } = renderHook(() => useBoardCounts());
    await settle();
    act(() => { setSwitching(OTHER_REALM); });
    expect(result.current).toBeNull();
    act(() => { setSwitching(null); });
    await settle();
    expect(result.current).not.toBeNull();
    await otherTabStores({ v: 9, boards: 'newer schema' });
    expect(result.current).toBeNull();
  });

  it('a Board write the browser refused for size: the count follows the copy core keeps for the page', async () => {
    const { result } = renderHook(() => useBoardCounts());
    const board = renderHook(() => useBoards());
    await settle();
    const shown = overfill(board);
    await settle();
    expect(result.current?.total).toBe(tilesIn(shown));
    expect(result.current?.total).toBeGreaterThan(6);
  });

  it('after a size refusal and an account round trip (core drops the page copy and its oversized mark), another tab\'s write still opening is unknown, never the old number, then its count', async () => {
    const board = renderHook(() => useBoards());
    await settle();
    act(() => { board.result.current.apply(withTile(2)); });
    await settle();
    overfill(board);
    await settle();
    board.unmount();
    const me = identity();
    act(() => { setIdentity({ id: 'someone-else', banned: false }); bump('account'); });
    act(() => { setIdentity(me); bump('account'); });
    await settle();
    expect(slot().pageCopy(FIXTURE_REALM)).toBe(false);
    expect(slot().status(FIXTURE_REALM)).not.toBe('oversized');
    const { result } = renderHook(() => useBoardCounts());
    await settle();
    const three = must(withTile(4)(must(withTile(3)(must(withTile(2)(freshRealm(rand)))))));
    await act(async () => { await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(three)); });
    act(() => { announce(); }); // core opens it in the background; until then it shows the value it opened before
    expect(result.current).toBeNull();
    await settle();
    expect(result.current?.total).toBe(3);
  });

  it('a smaller write refused for another reason (a newer layout) after a size refusal, the page copy then lost: another tab\'s write still opening is unknown', async () => {
    const board = renderHook(() => useBoards());
    await settle();
    act(() => { board.result.current.apply(withTile(2)); });
    await settle();
    overfill(board);
    await settle();
    const saved = localStorage.getItem(BOARDS_KEY) as string;
    act(() => { localStorage.setItem(BOARDS_KEY, JSON.stringify({ v: 2, a: {} })); announce(); });
    await settle();
    const small = must(withTile(5)(freshRealm(rand)));
    let refused: unknown = 'none';
    act(() => { refused = board.result.current.apply(() => small); }); // under the limit; refused for the newer layout, kept for the page
    await settle();
    expect(refused).toBeNull();
    expect(board.result.current.state).toEqual(small);
    expect(board.result.current.notice?.kind).toBe('unsaved');
    // Mounted while core keeps that small value as the page's copy under its oversized mark: the count shows it.
    expect(slot().status(FIXTURE_REALM)).toBe('oversized');
    expect(slot().pageCopy(FIXTURE_REALM)).toBe(true);
    const early = renderHook(() => useBoardCounts());
    await settle();
    expect(early.result.current?.total).toBe(tilesIn(small));
    early.unmount();
    // Another tab puts the old layout back and stores that same small value; it opens here.
    act(() => { localStorage.setItem(BOARDS_KEY, saved); announce(); });
    await otherTabStores(toStored(small));
    board.unmount();
    const me = identity();
    act(() => { setIdentity({ id: 'someone-else', banned: false }); bump('account'); });
    act(() => { setIdentity(me); bump('account'); });
    await settle();
    const { result } = renderHook(() => useBoardCounts());
    await settle();
    const three = must(withTile(4)(must(withTile(3)(must(withTile(2)(freshRealm(rand)))))));
    await act(async () => { await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(three)); });
    act(() => { announce(); });
    expect(result.current).toBeNull();
    await settle();
    expect(result.current?.total).toBe(3);
  });

  it('writes nothing of its own', async () => {
    renderHook(() => useBoardCounts());
    await settle();
    expect(localStorage.getItem(BOARDS_KEY)).toBeNull();
  });
});
