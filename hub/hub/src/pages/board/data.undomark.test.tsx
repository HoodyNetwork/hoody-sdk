// useBoards undoMark / undoOwn: an Undo offered for one change (a toast's) undoes that change only. The mark is the step
// the change recorded and its Board; once another step is that Board's newest, another Board is active, or the realm
// changed, undoOwn answers false and touches nothing. The undo stack itself (undo(), per Board) is as before.
import { bootFixtureCore, fixtureWorld, FIXTURE_REALM } from '@core';
import { setRealm } from '@core/ctx';
import { cryptIdleForTests } from '@core/cryptStore';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetBoardsForTests, useBoards } from './data';
import { createBoard, renameBoard, setActiveBoard, type RealmBoards } from './model/boards';

const OTHER_REALM = fixtureWorld.realms.map((r) => r.id).find((id) => id !== FIXTURE_REALM) as string;
const settle = () => act(() => cryptIdleForTests());
const named = (name: string) => (s: RealmBoards) => renameBoard(s, s.active, name);

beforeEach(async () => { vi.useFakeTimers({ shouldAdvanceTime: true }); resetBoardsForTests(); bootFixtureCore({ rules: [] }); await settle(); });
afterEach(() => { vi.useRealTimers(); });

describe('useBoards: an Undo bound to its own step', () => {
  it('undoes its own step while that step is the newest of the active Board', async () => {
    const { result } = renderHook(() => useBoards());
    await settle();
    let mark: ReturnType<typeof result.current.undoMark> = null;
    act(() => { result.current.apply(named('one'), { record: 'rename one' }); mark = result.current.undoMark(); });
    expect(mark).not.toBeNull();
    let ran = false;
    act(() => { ran = result.current.undoOwn(mark); });
    expect(ran).toBe(true);
    expect(result.current.state.boards[0]?.name).toBe('');
    expect(result.current.undoLabel).toBeNull();
  });

  it('a later change on the Board: the older mark undoes nothing, and the later step is still there', async () => {
    const { result } = renderHook(() => useBoards());
    await settle();
    let mark: ReturnType<typeof result.current.undoMark> = null;
    act(() => { result.current.apply(named('one'), { record: 'rename one' }); mark = result.current.undoMark(); });
    act(() => { result.current.apply(named('two'), { record: 'rename two' }); });
    let ran = true;
    act(() => { ran = result.current.undoOwn(mark); });
    expect(ran).toBe(false);
    expect(result.current.state.boards[0]?.name).toBe('two');
    expect(result.current.undoLabel).toBe('rename two');
  });

  it('a mark whose step was undone already undoes nothing more', async () => {
    const { result } = renderHook(() => useBoards());
    await settle();
    let first: ReturnType<typeof result.current.undoMark> = null;
    let second: ReturnType<typeof result.current.undoMark> = null;
    act(() => { result.current.apply(named('one'), { record: 'rename one' }); first = result.current.undoMark(); });
    act(() => { result.current.apply(named('two'), { record: 'rename two' }); second = result.current.undoMark(); });
    act(() => { result.current.undoOwn(second); });
    expect(result.current.state.boards[0]?.name).toBe('one');
    let again = true;
    act(() => { again = result.current.undoOwn(second); });
    expect(again).toBe(false);
    expect(result.current.state.boards[0]?.name).toBe('one');
    // The older step is the newest again: its own mark still undoes it.
    let ran = false;
    act(() => { ran = result.current.undoOwn(first); });
    expect(ran).toBe(true);
    expect(result.current.state.boards[0]?.name).toBe('');
  });

  it('another Board active: the mark undoes nothing there, and its own Board keeps its step', async () => {
    const { result } = renderHook(() => useBoards());
    await settle();
    let mark: ReturnType<typeof result.current.undoMark> = null;
    act(() => { result.current.apply(named('one'), { record: 'rename one' }); mark = result.current.undoMark(); });
    const firstId = result.current.state.active;
    act(() => { result.current.apply((s) => createBoard(s, Math.random, 'Second')); });
    act(() => { result.current.apply(named('second changed'), { record: 'rename second' }); });
    expect(result.current.state.active).not.toBe(firstId);
    let ran = true;
    act(() => { ran = result.current.undoOwn(mark); });
    expect(ran).toBe(false);
    expect(result.current.state.boards.find((b) => b.id !== firstId)?.name).toBe('second changed');
    expect(result.current.undoLabel).toBe('rename second');
    // Back on its own Board the step is still the newest: the mark undoes it.
    act(() => { result.current.apply((s) => setActiveBoard(s, firstId)); });
    act(() => { ran = result.current.undoOwn(mark); });
    expect(ran).toBe(true);
    expect(result.current.state.boards.find((b) => b.id === firstId)?.name).toBe('');
  });

  it('after a realm switch the mark undoes nothing, and no mark is null-safe', async () => {
    const { result } = renderHook(() => useBoards());
    await settle();
    let mark: ReturnType<typeof result.current.undoMark> = null;
    act(() => { result.current.apply(named('one'), { record: 'rename one' }); mark = result.current.undoMark(); });
    await settle();
    act(() => { setRealm(OTHER_REALM); });
    await settle();
    act(() => { result.current.apply(named('other realm'), { record: 'rename there' }); });
    let ran = true;
    act(() => { ran = result.current.undoOwn(mark); });
    expect(ran).toBe(false);
    expect(result.current.state.boards[0]?.name).toBe('other realm');
    act(() => { ran = result.current.undoOwn(null); });
    expect(ran).toBe(false);
    expect(result.current.state.boards[0]?.name).toBe('other realm');
  });
});
