/* eslint-disable no-restricted-globals -- these tests play another browser tab writing hub_boards_v1 (its sealed store
   lands while this tab holds the state); the page reaches storage only through core */
// Vitest: applyFresh's merge-only write. When another tab stored since this tab last folded and the
// merge needs writing (here: the active Board stays this tab's own, model/merge.ts), applyFresh writes the merge even
// though its op changes nothing or refuses; with nothing to merge it writes nothing.
import { bootFixtureCore, FIXTURE_REALM } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARDS_KEY, useBoards } from './data';
import { createBoard, isRefusal, renameBoard, type RealmBoards, type Refusal } from './model/boards';

let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
const settle = async () => { for (let i = 0; i < 4; i++) await act(() => cryptIdleForTests()); };
const stored = async () => (await storedForTests(BOARDS_KEY, FIXTURE_REALM)) as RealmBoards;
function must(x: RealmBoards | Refusal): RealmBoards {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x;
}
/** Another tab stores `f` of the value stored now, and announces it. */
async function otherTab(f: (s: RealmBoards) => RealmBoards) {
  await act(async () => {
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, f(await stored()));
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
}

/** This tab with two Boards stored, the second active; then, under a hold (so the storage event does not fold),
 *  another tab makes the first active and renames it. The merge keeps this tab's active Board, so it owes a write. */
async function owedFold() {
  const hook = renderHook(() => useBoards());
  await settle();
  act(() => { hook.result.current.apply((s) => must(createBoard(s, rand, 'Second'))); });
  await settle();
  const [first, second] = hook.result.current.state.boards.map((b) => b.id) as [string, string];
  expect((await stored()).active).toBe(second);
  act(() => { hook.result.current.hold(true); });
  await otherTab((s) => ({ ...must(renameBoard(s, first, 'Theirs')), active: first }));
  await settle();
  // Held: nothing folded yet, and the stored value is the other tab's.
  expect(hook.result.current.state.boards.find((b) => b.id === first)?.name).not.toBe('Theirs');
  expect((await stored()).active).toBe(first);
  return { ...hook, first, second };
}

beforeEach(async () => { vi.useFakeTimers({ shouldAdvanceTime: true }); bootFixtureCore({ rules: [] }); await settle(); });
afterEach(() => { vi.useRealTimers(); });

describe('applyFresh: the merge-only write', () => {
  it('an op that changes nothing still writes the merge it owes: the other tab\'s rename, this tab\'s active Board', async () => {
    const { result, first, second } = await owedFold();
    let r: unknown = 'unset';
    act(() => { r = result.current.applyFresh((s) => s); });
    await settle();
    expect(r).toBeNull();
    expect(result.current.state.boards.find((b) => b.id === first)?.name).toBe('Theirs');
    expect(result.current.state.active).toBe(second);
    const s = await stored();
    expect(s.boards.find((b) => b.id === first)?.name).toBe('Theirs');
    expect(s.active).toBe(second);
  });

  it('an op that refuses returns its refusal and still writes the merge it owes', async () => {
    const { result, first, second } = await owedFold();
    let r: unknown = 'unset';
    act(() => { r = result.current.applyFresh(() => ({ refused: 'BOARDS_FULL' })); });
    await settle();
    expect(r).toEqual({ refused: 'BOARDS_FULL' });
    const s = await stored();
    expect(s.boards.find((b) => b.id === first)?.name).toBe('Theirs');
    expect(s.active).toBe(second);
    expect(result.current.state.active).toBe(second);
  });

  it('with nothing stored by another tab since, an op that changes nothing writes nothing', async () => {
    const { result } = renderHook(() => useBoards());
    await settle();
    act(() => { result.current.apply((s) => must(createBoard(s, rand, 'Second'))); });
    await settle();
    const before = localStorage.getItem(BOARDS_KEY);
    expect(before).not.toBeNull();
    act(() => { result.current.applyFresh((s) => s); });
    await settle();
    // A write seals afresh (a new nonce), so the same bytes mean nothing was stored.
    expect(localStorage.getItem(BOARDS_KEY)).toBe(before);
  });
});
