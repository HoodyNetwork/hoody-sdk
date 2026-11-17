/* eslint-disable no-restricted-globals -- these tests play another browser tab whose store lands first (its sealed
   bytes put in place before this tab's write); the page reaches storage only through core */
// Vitest: edits queued on a locked commit go with a stored value that cannot be used. The
// commit answers NOT_ADDED and the dropped edits are never stored. A value that stops opening here is never written
// over (fail closed): nothing is written, the Board says it cannot read it, and a change to a Board that came from it
// writes nothing. A value parse resets merges nothing and writes nothing (data.ts contract: only a user change writes):
// the Board says it was reset, and the next change is the one write, carrying only itself.
import { accountPref, bootFixtureCore, fixtureWorld, FIXTURE_REALM } from '@core';
import { cryptIdleForTests, onCryptChange, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARDS_KEY, NOT_ADDED, useBoards } from './data';
import { createBoard, isRefusal, renameBoard, type RealmBoards, type Refusal } from './model/boards';
import { parseRealmBoards } from './model/persist';

let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
const UID = fixtureWorld.account.id;
const settle = async () => { for (let i = 0; i < 6; i++) await act(() => cryptIdleForTests()); };
const stored = async (realm = FIXTURE_REALM) => (await storedForTests(BOARDS_KEY, realm)) as RealmBoards;
const reloaded = async (realm = FIXTURE_REALM) => parseRealmBoards(JSON.parse(JSON.stringify(await stored(realm)))).state;
const names = (s: RealmBoards | null) => (s?.boards ?? []).map((b) => b.name);
/** Writes of the Boards key, as the page's storage sees them (the same object core writes through). */
const boardWrites = () => { const spy = vi.spyOn(localStorage, 'setItem'); return () => spy.mock.calls.filter(([k]) => k === BOARDS_KEY).length; };
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

/** Whether this realm's Boards lock has been granted to a commit since the call (the commit's callback has begun).
 *  Every other request passes through as made: core's own writes take their lock as request(name, options, fn). */
function grantSeen(): () => boolean {
  const locks = (navigator as unknown as { locks: LockManager }).locks;
  const realLock = locks.request.bind(locks) as (...a: unknown[]) => Promise<unknown>;
  let granted = false;
  vi.spyOn(locks, 'request').mockImplementation(((...a: unknown[]) => {
    const name = a[0] as string, cb = a[a.length - 1] as (l: unknown) => Promise<unknown>;
    return realLock(...a.slice(0, -1), async (l: unknown) => { if (name.endsWith(FIXTURE_REALM)) granted = true; return cb(l); });
  }) as never);
  return () => granted;
}

type Hook = Awaited<ReturnType<typeof tabWith>>;
/** Two Boards, this tab's own write held at its seal, a locked create waiting on it, an edit queued on that commit,
 *  `meanwhile` (while the commit still waits), and then the winner's bytes land (`winner`). Answers the commit's result and the write counter started just before. */
async function lockedCommitLoses(hook: Hook, first: string, second: string, winner: string, meanwhile?: () => void) {
  const { result } = hook;
  held = holdSeal();
  act(() => { result.current.apply((s) => renameBoard(s, second, 'Pending')); }); // this tab's write on its way: the commit waits for it
  await held.sealing();
  let r: unknown = 'pending';
  const granted = grantSeen();
  act(() => { void result.current.applyLocked((s) => createBoard(s, rand, 'New')).then((v) => { r = v; }); });
  // Only once the commit holds its lock (it then waits for this tab's write) is an edit queued on it.
  await vi.waitFor(() => expect(granted()).toBe(true));
  await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
  act(() => { result.current.apply((s) => renameBoard(s, first, 'Queued')); }); // queued on the waiting commit
  if (meanwhile) act(meanwhile);
  localStorage.setItem(BOARDS_KEY, winner);
  const writes = boardWrites();
  release();
  await settle();
  await settle();
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  await settle();
  return { r, writes };
}

let held: ReturnType<typeof holdSeal> | null = null;
const release = () => { held?.release(); held = null; };
beforeEach(async () => { vi.useFakeTimers({ shouldAdvanceTime: true }); bootFixtureCore({ rules: [] }); await settle(); });
afterEach(() => { release(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('queued edits go with a stored value that cannot be used', () => {
  it('a value that stops opening is never written over: NOT_ADDED, nothing stored, the Board says it cannot read it, and a change to a dropped Board writes nothing', async () => {
    const hook = await tabWith(2);
    const { result } = hook;
    const [first, second] = result.current.state.boards.map((b) => b.id) as [string, string];
    await settle();
    const d = JSON.parse(localStorage.getItem(BOARDS_KEY) as string) as { a: Record<string, Record<string, Record<string, unknown>>> };
    const leaf = d.a[UID]![FIXTURE_REALM]!;
    d.a[UID]![FIXTURE_REALM] = { ...leaf, ct: String(leaf.ct).split('').reverse().join('') };
    const unopenable = JSON.stringify(d);
    const { r, writes } = await lockedCommitLoses(hook, first, second, unopenable);
    expect(r).toBe(NOT_ADDED);
    expect(writes()).toBe(0);
    expect(localStorage.getItem(BOARDS_KEY)).toBe(unopenable);
    expect(result.current.notice).toEqual({ kind: 'unreadable', reason: 'locked' });
    // The Boards shown from it are dropped (a fresh realm): neither the queued rename nor the refused create is there.
    const ids = result.current.state.boards.map((b) => b.id);
    expect(ids).not.toContain(first);
    expect(ids).not.toContain(second);
    expect(names(result.current.state)).not.toContain('Queued');
    expect(names(result.current.state)).not.toContain('New');
    // A change to a Board that came from the unreadable value writes nothing over it.
    act(() => { result.current.apply((s) => renameBoard(s, second, 'Next')); });
    await settle();
    await settle();
    expect(writes()).toBe(0);
    expect(localStorage.getItem(BOARDS_KEY)).toBe(unopenable);
  });

  // The race the reset cases share: a locked commit loses to another tab's layout that parse cannot read.
  async function resetRace() {
    const hook = await tabWith(2);
    const { result } = hook;
    const [first, second] = result.current.state.boards.map((b) => b.id) as [string, string];
    await settle();
    const before = localStorage.getItem(BOARDS_KEY) as string;
    await act(() => writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, { v: 1, boards: 'nope', mark: 'theirs' }));
    const unreadable = localStorage.getItem(BOARDS_KEY) as string;
    localStorage.setItem(BOARDS_KEY, before);
    const { r, writes } = await lockedCommitLoses(hook, first, second, unreadable);
    return { result, r, writes, unreadable };
  }

  it('a value parse resets (the winner wrote a layout parse cannot read): NOT_ADDED, nothing written, the edit queued on the lost commit goes with it, this tab\'s earlier write stays shown, and the next change shows', async () => {
    const { result, r, writes, unreadable } = await resetRace();
    expect(r).toBe(NOT_ADDED);
    // The reset merges nothing and writes nothing: the winner's bytes stay, and the Board says it reset.
    expect(writes()).toBe(0);
    expect(localStorage.getItem(BOARDS_KEY)).toBe(unreadable);
    expect(result.current.notice).toEqual({ kind: 'reset' });
    // The edit queued on the commit that lost goes with it (as in the locked case); this tab's own write
    // from before the race (Pending) stays, shown and owed to the next change.
    expect(names(result.current.state)).not.toContain('Queued');
    expect(names(result.current.state)).not.toContain('New');
    expect(names(result.current.state)).toContain('Pending');
    act(() => { result.current.apply((s) => must(createBoard(s, rand, 'Next'))); });
    await settle();
    await settle();
    expect(names(result.current.state)).toContain('Next');
    expect(names(result.current.state)).toContain('Pending');
  });

  it('after a reset, the next change is the one write, applied on the reset record and stored with only itself', async () => {
    const { result, writes } = await resetRace();
    // It is a new Board, so it cannot hide a queued edit by overwriting the Board that edit renamed.
    act(() => { result.current.apply((s) => must(createBoard(s, rand, 'Next'))); });
    await settle();
    await settle();
    expect(writes()).toBe(1);
    expect(result.current.notice?.kind).not.toBe('unsaved');
    const s = await reloaded();
    expect(names(s)).toContain('Next');
    expect(names(s)).toContain('Pending');
    expect(names(s)).not.toContain('Queued');
    expect(names(s)).not.toContain('New');
  });
  it('a hold released while the commit waits folds nothing into it: another tab\'s value that came meanwhile is not merged or written, and a reset after it still drops only the queued edit', async () => {
    const hook = await tabWith(2);
    const { result } = hook;
    const [first, second] = result.current.state.boards.map((b) => b.id) as [string, string];
    await settle();
    const before = localStorage.getItem(BOARDS_KEY) as string;
    const mine = await stored();
    await act(() => writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, { ...mine, boards: mine.boards.map((b) => (b.id === first ? { ...b, name: 'Theirs' } : b)) }));
    const theirs = localStorage.getItem(BOARDS_KEY) as string;
    await act(() => writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, { v: 1, boards: 'nope', mark: 'theirs' }));
    const unreadable = localStorage.getItem(BOARDS_KEY) as string;
    localStorage.setItem(BOARDS_KEY, before);
    const { r, writes } = await lockedCommitLoses(hook, first, second, unreadable, () => {
      // Another tab's usable value arrives while the commit waits, and a drag's hold on this tab ends. This tab's own
      // write is still sealing ('saving'), so no fold could run here even without the commit's hold-release guard; the
      // next case releases the hold where only that guard stops a fold.
      localStorage.setItem(BOARDS_KEY, theirs);
      window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, newValue: theirs, storageArea: localStorage }));
      result.current.hold(true);
      result.current.hold(false);
    });
    expect(r).toBe(NOT_ADDED);
    expect(writes()).toBe(0);
    expect(localStorage.getItem(BOARDS_KEY)).toBe(unreadable);
    expect(result.current.notice).toEqual({ kind: 'reset' });
    expect(names(result.current.state)).not.toContain('Queued');
    expect(names(result.current.state)).not.toContain('Theirs');
    expect(names(result.current.state)).toContain('Pending');
  });
  it('a hold released once the commit may resume, on another tab\'s usable value, folds nothing ahead of the commit: the commit folds it, and theirs is stored with this tab\'s changes', async () => {
    const hook = await tabWith(2);
    const { result } = hook;
    const [first, second] = result.current.state.boards.map((b) => b.id) as [string, string];
    await settle();
    const before = localStorage.getItem(BOARDS_KEY) as string;
    const mine = await stored();
    await act(() => writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, { ...mine, boards: mine.boards.map((b) => (b.id === first ? { ...b, name: 'Theirs' } : b)) }));
    const theirs = localStorage.getItem(BOARDS_KEY) as string;
    localStorage.setItem(BOARDS_KEY, before);
    held = holdSeal();
    act(() => { result.current.apply((s) => renameBoard(s, second, 'Pending')); }); // this tab's write on its way: the commit waits for it
    await held.sealing();
    let r: unknown = 'pending';
    const granted = grantSeen();
    let opRan = false; // the commit's op has run on a value (it then runs before every store)
    act(() => { void result.current.applyLocked((s) => { opRan = true; return createBoard(s, rand, 'New'); }).then((v) => { r = v; }); });
    await vi.waitFor(() => expect(granted()).toBe(true));
    await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
    act(() => { result.current.hold(true); }); // a drag on this tab begins while the commit waits
    // Theirs lands before this tab's write is checked: the write loses the race, and core then shows theirs (usable,
    // stored, 'conflict'), which ends the commit's wait. Right then, before the commit has run on it, the drag ends.
    localStorage.setItem(BOARDS_KEY, theirs);
    // What core shows, read the way the hook reads it (the same account+realm store; the raw stored value).
    const slot = accountPref(BOARDS_KEY, (v: unknown) => v, { scope: 'account+realm', keepAtSignOut: true });
    // Recorded in the listener and asserted after it: core swallows a listener's throw.
    let seen: { status: string; shown: string[]; granted: boolean; opRan: boolean; pending: boolean } | null = null;
    const off = onCryptChange((key) => {
      if (key !== BOARDS_KEY || seen !== null || localStorage.getItem(BOARDS_KEY) !== theirs) return;
      const status = slot.status(FIXTURE_REALM);
      if (status !== 'conflict') return; // only the notify that shows theirs as stored releases the hold
      seen = { status, shown: names(parseRealmBoards(slot.get(FIXTURE_REALM)).state), granted: granted(), opRan, pending: r === 'pending' };
      result.current.hold(false);
    });
    try {
      release();
      await settle();
      await settle();
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      await settle();
    } finally { off(); }
    // The precondition: the hold ended while core showed theirs as stored and usable ('conflict', a value that folds:
    // Theirs is in it), inside the commit (lock granted) before its op had run on any value, and before it ended.
    expect(seen).not.toBeNull();
    expect(seen!.status).toBe('conflict');
    expect(seen!.shown).toContain('Theirs');
    expect(seen).toMatchObject({ granted: true, opRan: false, pending: true });
    expect(opRan).toBe(true);
    // The commit folded theirs itself (its core holds it), made its Board on it, and stored all of it.
    expect(r).toBeNull();
    expect(names(result.current.state)).toEqual(expect.arrayContaining(['Theirs', 'Pending', 'New']));
    const s = await reloaded();
    expect(names(s)).toContain('Theirs');
    expect(names(s)).toContain('Pending');
    expect(names(s)).toContain('New');
  });
});
