/* eslint-disable no-restricted-globals -- these tests play another browser tab whose sealed bytes land in storage; the
   page reaches storage only through core */
// Vitest: dialogs keep what they show when another tab writes: the Boards are read
// once per scope; after that, another tab's value opening (core 'loading') is a background read: ready stays true and
// the last Boards stay shown until theirs opens, so the view keeps its dialogs and drags; the keep-loaded choice stays.
// Meanwhile an edit is refused (UPDATING, the 'updating' notice): nothing is shown, queued or written, and edits work
// again once their value opens, or stops opening (the lock rule stands: what was decrypted goes). The first read of a
// scope still waits.
import { bootFixtureCore, fixtureWorld, FIXTURE_REALM } from '@core';
import { setRealm } from '@core/ctx';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARDS_KEY, UPDATING, useBoards, useKeepLoaded } from './data';
import { createBoard, freshRealm, isRefusal, onActive, renameBoard, setKeepLoaded, splitAt, type RealmBoards, type Refusal } from './model/boards';
import { parseRealmBoards, toStored } from './model/persist';

const OTHER_REALM = fixtureWorld.realms.map((x) => x.id).find((id) => id !== FIXTURE_REALM) as string;
let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
const settle = async () => { for (let i = 0; i < 6; i++) await act(() => cryptIdleForTests()); };
const names = (s: RealmBoards | null | undefined) => (s?.boards ?? []).map((b) => b.name);
/** The sealed bytes another tab would store for `value`, with this tab's storage left as it was. */
async function sealedBytes(value: RealmBoards): Promise<string> {
  const before = localStorage.getItem(BOARDS_KEY);
  await act(() => writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(value)));
  const bytes = localStorage.getItem(BOARDS_KEY) as string;
  if (before === null) localStorage.removeItem(BOARDS_KEY); else localStorage.setItem(BOARDS_KEY, before);
  return bytes;
}
/** Holds every decrypt (a value opening) until released. */
function holdOpen() {
  const subtle = globalThis.crypto.subtle;
  const real = subtle.decrypt.bind(subtle);
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  const spy = vi.spyOn(subtle, 'decrypt').mockImplementation(async (...a: Parameters<SubtleCrypto['decrypt']>) => { await gate; return real(...a); });
  return { release: () => { open(); spy.mockRestore(); } };
}
/** Their value never opens: every decrypt held, then failed (as a value sealed under keys this tab lacks). */
function failOpen() {
  const subtle = globalThis.crypto.subtle;
  let fail!: () => void;
  const gate = new Promise<void>((r) => { fail = r; });
  const spy = vi.spyOn(subtle, 'decrypt').mockImplementation(async () => { await gate; throw new DOMException('bad key', 'OperationError'); });
  return { release: () => { fail(); }, restore: () => spy.mockRestore() };
}
/** useBoards, every render's ready recorded, beside the keep-loaded choice the shell reads. */
function tab() {
  const readies: boolean[] = [];
  const hook = renderHook(() => { const b = useBoards(); readies.push(b.ready); return { b, keep: useKeepLoaded() }; });
  return { hook, readies, r: () => hook.result.current };
}
type Tab = ReturnType<typeof tab>;
/** Two Boards, A and B, stored, kept loaded; this tab's hook. */
async function twoBoards() {
  const t = tab();
  await settle();
  act(() => { t.r().b.apply((s) => { const x = must(createBoard(s, rand)); return setKeepLoaded(must(renameBoard(must(renameBoard(x, x.boards[0]!.id, 'A')), x.boards[1]!.id, 'B')), true); }); });
  await settle();
  const [A, B] = t.r().b.state.boards.map((b) => b.id) as [string, string];
  return { ...t, A, B };
}
const storedNow = async () => parseRealmBoards(JSON.parse(JSON.stringify(await storedForTests(BOARDS_KEY, FIXTURE_REALM)))).state;
/** Another tab's bytes land (storage event); their value is opening here once the hook says refreshing. */
async function land(t: Tab, bytes: string) {
  await act(async () => {
    localStorage.setItem(BOARDS_KEY, bytes);
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
  });
  await vi.waitFor(() => expect(t.r().b.refreshing).toBe(true));
}
/** Every kind of edit, tried while their value opens: each refused, nothing shown, nothing queued, nothing written. */
function editsRefused(t: Tab, B: string, bytes: string) {
  const shown = t.r().b.state;
  const undoLabel = t.r().b.undoLabel;
  let r1: unknown, r2: unknown;
  act(() => { r1 = t.r().b.apply((s) => must(renameBoard(s, B, 'Edited')), { record: 'rename' }); });
  act(() => { r2 = t.r().b.applyFresh((s, held) => onActive(s, (b) => { const x = splitAt(b, b.active, 'right', rand); return isRefusal(x) ? x : x.board; }, held)); });
  act(() => { t.r().b.undo(); });
  expect(r1).toBe(UPDATING);
  expect(r2).toBe(UPDATING);
  expect(t.r().b.state).toBe(shown);
  expect(t.r().b.undoLabel).toBe(undoLabel);
  expect(t.r().b.notice).toEqual({ kind: 'updating' });
  expect(localStorage.getItem(BOARDS_KEY)).toBe(bytes);
}

let held: ReturnType<typeof holdOpen> | null = null;
beforeEach(async () => { vi.useFakeTimers({ shouldAdvanceTime: true }); bootFixtureCore({ rules: [] }); await settle(); });
afterEach(() => { held?.release(); held = null; vi.restoreAllMocks(); vi.useRealTimers(); });

describe('a background read keeps the Boards shown', () => {
  it('another tab\'s value opening: ready stays true, the last Boards and keep-loaded stay; then theirs shows', async () => {
    const t = await twoBoards();
    const { r, readies, A } = t;
    expect(r().keep).toBe(true);
    const theirs = await sealedBytes(must(renameBoard(r().b.state, A, 'Theirs')));
    const from = readies.length;
    held = holdOpen();
    await land(t, theirs);
    expect(r().b.ready).toBe(true);
    expect(names(r().b.state)).toEqual(['A', 'B']);
    expect(r().keep).toBe(true);
    held.release();
    held = null;
    await settle();
    await vi.waitFor(() => expect(names(r().b.state)).toEqual(['Theirs', 'B']));
    expect(r().b.refreshing).toBe(false);
    expect(readies.slice(from)).not.toContain(false);
  });

  it('the first read still waits: not ready while the stored value opens, then ready with it', async () => {
    const first = freshRealm(rand);
    const bytes = await sealedBytes(must(renameBoard(first, first.boards[0]!.id, 'Stored')));
    localStorage.setItem(BOARDS_KEY, bytes);
    held = holdOpen();
    const { r } = tab();
    await act(async () => { await Promise.resolve(); });
    expect(r().b.ready).toBe(false);
    expect(r().b.refreshing).toBe(false);
    held.release();
    held = null;
    await settle();
    await vi.waitFor(() => expect(r().b.ready).toBe(true));
    expect(names(r().b.state)[0]).toBe('Stored');
  });
});

describe('edits while another tab\'s value opens', () => {
  it('are refused and say so; once it opens the note goes and an edit is made and stored, once', async () => {
    const t = await twoBoards();
    const { r, A, B } = t;
    act(() => { r().b.apply((s) => must(renameBoard(s, A, 'A2')), { record: 'rename A' }); }); // an undo step to try
    await settle();
    const theirs = await sealedBytes(must(renameBoard(r().b.state, A, 'Theirs')));
    held = holdOpen();
    await land(t, theirs);
    editsRefused(t, B, theirs);
    held.release();
    held = null;
    await settle();
    await vi.waitFor(() => expect(names(r().b.state)).toEqual(['Theirs', 'B']));
    expect(r().b.notice).toBeNull();
    let res: unknown = 'pending';
    act(() => { res = r().b.apply((s) => must(renameBoard(s, B, 'Edited'))); });
    expect(res).toBeNull();
    await settle();
    await vi.waitFor(async () => expect(names(await storedNow())).toEqual(['Theirs', 'Edited']));
    expect(r().b.state.boards).toHaveLength(2);
  });

  it('their value is the same Boards sealed again: the edit made meanwhile is refused, never left unsaved', async () => {
    const t = await twoBoards();
    const { r, B } = t;
    const same = await sealedBytes(r().b.state);
    held = holdOpen();
    await land(t, same);
    editsRefused(t, B, same);
    held.release();
    held = null;
    await settle();
    await vi.waitFor(() => expect(r().b.refreshing).toBe(false));
    expect(names(r().b.state)).toEqual(['A', 'B']);
    expect(names(await storedNow())).toEqual(['A', 'B']);
    act(() => { expect(r().b.apply((s) => must(renameBoard(s, B, 'Edited')))).toBeNull(); });
    await settle();
    await vi.waitFor(async () => expect(names(await storedNow())).toEqual(['A', 'Edited']));
  });

  it('their value never opens: the edit is refused and nothing is written over it; the lock rule stands, and edits work again', async () => {
    const t = await twoBoards();
    const { r, B } = t;
    const gen = r().b.lockGen;
    const theirs = await sealedBytes(must(renameBoard(r().b.state, B, 'Theirs')));
    const f = failOpen();
    await act(async () => {
      localStorage.setItem(BOARDS_KEY, theirs);
      window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    });
    await vi.waitFor(() => expect(r().b.refreshing).toBe(true));
    editsRefused(t, B, theirs);
    f.release();
    await settle();
    f.restore();
    // It locked: what was decrypted went (lockGen), with no edit of the load among it; their bytes are untouched.
    await vi.waitFor(() => expect(r().b.lockGen).toBe(gen + 1));
    expect(r().b.refreshing).toBe(false);
    expect(names(r().b.state)).not.toContain('Edited');
    expect(localStorage.getItem(BOARDS_KEY)).toBe(theirs);
    // Edits work again (the user's next change replaces what cannot be opened, as the lock notice says).
    let res: unknown = 'pending';
    act(() => { res = r().b.apply((s) => createBoard(s, rand, 'After')); });
    expect(res).toBeNull();
    expect(names(r().b.state)).toContain('After');
  });
});

describe('keep shown: a second tab writing meanwhile', () => {
  it('3: the kept choice is not brought back by a later open: a round trip through a loading realm, or after a lock', async () => {
    const t = await twoBoards();
    const { r, A } = t;
    expect(r().keep).toBe(true);
    // The other realm has a value this tab has not opened; this realm gets new bytes meanwhile. Both open held.
    await act(() => writeSealedForTests(BOARDS_KEY, OTHER_REALM, toStored(freshRealm(rand))));
    const theirs = await sealedBytes(must(renameBoard(r().b.state, A, 'Theirs')));
    held = holdOpen();
    act(() => { setRealm(OTHER_REALM); });
    expect(r().keep).toBe(false);
    await act(async () => {
      localStorage.setItem(BOARDS_KEY, theirs);
      window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    });
    act(() => { setRealm(FIXTURE_REALM); });
    expect(r().keep).toBe(false); // this visit has read nothing yet: the old choice is not reused
    held.release();
    held = null;
    await settle();
    await vi.waitFor(() => expect(r().keep).toBe(true)); // read again: theirs keeps it loaded
    // keep true, then their value never opens (locked: false), then another value opens: still false until it is read.
    const gen = r().b.lockGen;
    const f = failOpen();
    const locked = await sealedBytes(must(renameBoard(r().b.state, A, 'Locked')));
    await act(async () => {
      localStorage.setItem(BOARDS_KEY, locked);
      window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    });
    f.release();
    await settle();
    f.restore();
    await vi.waitFor(() => expect(r().b.lockGen).toBe(gen + 1));
    expect(r().keep).toBe(false);
    held = holdOpen();
    const again = await sealedBytes(setKeepLoaded(freshRealm(rand), true));
    await act(async () => {
      localStorage.setItem(BOARDS_KEY, again);
      window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    });
    expect(r().keep).toBe(false);
  });

  it('4: an undo while a locked commit waits on their value opening still says it is refused', async () => {
    const t = await twoBoards();
    const { r, A, B } = t;
    act(() => { r().b.apply((s) => must(renameBoard(s, A, 'A2')), { record: 'rename A' }); });
    await settle();
    const theirs = await sealedBytes(must(renameBoard(r().b.state, B, 'Theirs')));
    held = holdOpen();
    await land(t, theirs);
    let done: Promise<unknown> = Promise.resolve();
    act(() => { done = r().b.applyLocked((s) => s); });
    await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
    act(() => { r().b.undo(); });
    expect(r().b.notice).toEqual({ kind: 'updating' });
    expect(names(r().b.state)).toEqual(['A2', 'B']);
    held.release();
    held = null;
    await act(async () => { await done; });
    await settle();
  });
});
