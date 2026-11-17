/* eslint-disable no-restricted-globals -- these tests play another browser tab whose store lands first (its sealed
   bytes put in place before this tab's write); the page reaches storage only through core */
// Vitest, locked commits and realms: a lock granted after its realm went never takes another realm's commit; a stored
// value that stops opening keeps the Boards cleared; edits that name a Board or a slot the commit made keep naming it
// when the commit runs again (each round draws the same ids); a realm-wide edit outlives a Board that never landed; and
// after the last lost race this tab shows the winner.
import { bootFixtureCore, fixtureWorld, FIXTURE_REALM } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { setRealm } from '@core/ctx';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARDS_KEY, LOCK_ROUNDS, NOT_ADDED, useBoards } from './data';
import { boardFor, boardSlots, createBoard, isRefusal, keyedAddTile, onActive, renameBoard, setKeepLoaded, setTile, type Board, type RealmBoards, type Refusal, type TileRef } from './model/boards';
import { parseRealmBoards, toStored } from './model/persist';

let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
const UID = fixtureWorld.account.id;
const OTHER_REALM = fixtureWorld.realms.map((r) => r.id).find((id) => id !== FIXTURE_REALM) as string;
const term = (session: number): TileRef => ({ project: 'p1', computer: 'c1', program: 'terminal', session });
const NANO = { for: { c: 'c1', k: 'ow:nano' }, name: 'Nano · atlas' };
const settle = async () => { for (let i = 0; i < 6; i++) await act(() => cryptIdleForTests()); };
const stored = async (realm = FIXTURE_REALM) => (await storedForTests(BOARDS_KEY, realm)) as RealmBoards;
const reloaded = async (realm = FIXTURE_REALM) => parseRealmBoards(JSON.parse(JSON.stringify(await stored(realm)))).state;
const names = (s: RealmBoards | null) => (s?.boards ?? []).map((b) => b.name);
// Tiles as compared here: without their tile ids (S-id; the id rules are model/boards.tid.test.ts).
const tilesOf = (b: Board | undefined) => Object.values(b?.tiles ?? {}).filter(Boolean).map((t) => { const { tid: _tid, ...rest } = t as TileRef; return rest; });
/** A keyed landing as the Board makes one: with the commit's own random draws. */
const keyed = (session: number) => (s: RealmBoards, r?: () => number) => { const x = keyedAddTile(s, NANO, term(session), r ?? rand); return isRefusal(x) ? x : x.state; };
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

describe('a lock granted after its realm went', () => {
  it('never takes the commit of the realm shown now: that commit\'s edit is queued and kept through its lost race', async () => {
    const { result } = renderHook(() => useBoards());
    await settle();
    act(() => { setRealm(OTHER_REALM); });
    await settle();
    act(() => { result.current.apply((s) => createBoard(s, rand, 'Bee')); });
    await settle();
    act(() => { setRealm(FIXTURE_REALM); });
    await settle();
    // Realm A's lock is held elsewhere: its request waits.
    const locks = (navigator as unknown as { locks: LockManager }).locks;
    const realLock = locks.request.bind(locks) as (...a: unknown[]) => Promise<unknown>;
    let openA!: () => void;
    const gateA = new Promise<void>((x) => { openA = x; });
    let first = true;
    vi.spyOn(locks, 'request').mockImplementation((async (...a: unknown[]) => { if (first) { first = false; await gateA; } return realLock(...a); }) as never);
    let rA: unknown = 'pending';
    act(() => { void result.current.applyLocked((s) => createBoard(s, rand, 'MineA')).then((v) => { rA = v; }); });
    act(() => { setRealm(OTHER_REALM); });
    await settle();
    const nowB = await stored(OTHER_REALM);
    const bee = nowB.boards.find((b) => b.name === 'Bee')!.id;
    const theirsB = await sealedBytes(must(renameBoard(nowB, nowB.boards[0]!.id, 'TheirsB')), OTHER_REALM);
    held = holdSeal();
    let rB: unknown = 'pending';
    act(() => { void result.current.applyLocked((s) => createBoard(s, rand, 'MineB')).then((v) => { rB = v; }); });
    await held.sealing();
    openA();
    await vi.waitFor(() => expect(rA).toBe(NOT_ADDED));
    act(() => { result.current.apply((s) => renameBoard(s, bee, 'Bee renamed')); });
    localStorage.setItem(BOARDS_KEY, theirsB);
    release();
    await settle();
    await settle();
    expect(rB).toBeNull();
    for (const s of [result.current.state, await reloaded(OTHER_REALM)]) {
      expect(names(s)).toContain('Bee renamed');
      expect(names(s)).toContain('TheirsB');
      expect(names(s)).toContain('MineB');
    }
    expect(names(await stored())).not.toContain('MineA');
  });
});

describe('a commit of a realm no longer shown, ending while the shown realm\'s commit waits', () => {
  it('leaves that commit\'s queue in place: its edit is queued and kept through its lost race', async () => {
    const { result } = renderHook(() => useBoards());
    await settle();
    act(() => { setRealm(OTHER_REALM); });
    await settle();
    act(() => { result.current.apply((s) => createBoard(s, rand, 'Bee')); });
    await settle();
    const nowB = await stored(OTHER_REALM);
    const bee = nowB.boards.find((b) => b.name === 'Bee')!.id;
    const theirsB = await sealedBytes(must(renameBoard(nowB, nowB.boards[0]!.id, 'TheirsB')), OTHER_REALM);
    act(() => { setRealm(FIXTURE_REALM); });
    await settle();
    // A's own write seals behind its own gate; every later write (B's) behind another.
    const subtle = globalThis.crypto.subtle;
    const real = subtle.encrypt.bind(subtle);
    let openA!: () => void;
    let openB!: () => void;
    const gateA = new Promise<void>((x) => { openA = x; });
    const gateB = new Promise<void>((x) => { openB = x; });
    let calls = 0;
    const spy = vi.spyOn(subtle, 'encrypt').mockImplementation(async (...a: Parameters<SubtleCrypto['encrypt']>) => { await (calls++ === 0 ? gateA : gateB); return real(...a); });
    held = { sealing: () => vi.waitFor(() => expect(spy).toHaveBeenCalled()), release: () => { openA(); openB(); spy.mockRestore(); } };
    act(() => { result.current.apply((s) => renameBoard(s, s.boards[0]!.id, 'A pending')); });
    await held.sealing();
    // A's commit holds A's lock and waits for A's own write.
    const locks = (navigator as unknown as { locks: LockManager }).locks;
    type Granted = (l: unknown) => Promise<unknown>;
    const realLock = locks.request.bind(locks) as (name: string, ...rest: unknown[]) => Promise<unknown>;
    let grantedA = false;
    // Both forms of request: (name, cb), as the Board's commit asks, and (name, options, cb), as the store's own
    // exclusive() asks. A mock of only the first broke every sealed write (cb is not a function), so B's write read
    // 'unsaved' and its commit ended early (null, not 'pending').
    vi.spyOn(locks, 'request').mockImplementation(((name: string, a: unknown, b?: unknown) => {
      const cb = (typeof a === 'function' ? a : b) as Granted;
      const wrapped: Granted = async (l) => { if (name.endsWith(FIXTURE_REALM)) grantedA = true; return cb(l); };
      return typeof a === 'function' ? realLock(name, wrapped) : realLock(name, a, wrapped);
    }) as never);
    let rA: unknown = 'pending';
    act(() => { void result.current.applyLocked((s) => createBoard(s, rand, 'MineA')).then((v) => { rA = v; }); });
    await vi.waitFor(() => expect(grantedA).toBe(true));
    await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
    act(() => { setRealm(OTHER_REALM); });
    await vi.waitFor(() => expect(names(result.current.state)).toContain('Bee'));
    let rB: unknown = 'pending';
    act(() => { void result.current.applyLocked((s) => createBoard(s, rand, 'MineB')).then((v) => { rB = v; }); });
    await vi.waitFor(() => expect(names(result.current.state)).toContain('MineB'));
    openA(); // A's write ends: A's commit ends (its realm is not shown), B's still waits
    await vi.waitFor(() => expect(rA).toBe(NOT_ADDED));
    expect(rB).toBe('pending');
    act(() => { result.current.apply((s) => renameBoard(s, bee, 'Bee 2'), { record: 'Rename' }); }); // an undo step
    act(() => { result.current.undo(); }); // B's commit still runs: undo waits
    expect(names(result.current.state)).toContain('Bee 2');
    act(() => { result.current.apply((s) => renameBoard(s, bee, 'Bee renamed')); });
    localStorage.setItem(BOARDS_KEY, theirsB);
    release();
    await settle();
    await settle();
    await settle();
    expect(rB).toBeNull();
    for (const s of [result.current.state, await reloaded(OTHER_REALM)]) {
      expect(names(s)).toContain('Bee renamed');
      expect(names(s)).toContain('TheirsB');
      expect(names(s)).toContain('MineB');
    }
  });
});

describe('a stored value that stops opening while a locked commit waits', () => {
  it('the Boards stay cleared (nothing put back), NOT_ADDED, the notice says it cannot be opened', async () => {
    const { result } = await tabWith(2);
    const [first, second] = result.current.state.boards.map((b) => b.id) as [string, string];
    act(() => { result.current.apply((s) => renameBoard(s, first, 'Secret old name')); });
    await settle();
    const d = JSON.parse(localStorage.getItem(BOARDS_KEY) as string) as { a: Record<string, Record<string, Record<string, unknown>>> };
    const leaf = d.a[UID]![FIXTURE_REALM]!;
    d.a[UID]![FIXTURE_REALM] = { ...leaf, ct: String(leaf.ct).split('').reverse().join('') };
    const unopenable = JSON.stringify(d);
    held = holdSeal();
    act(() => { result.current.apply((s) => renameBoard(s, second, 'Pending')); });
    await held.sealing();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s) => createBoard(s, rand, 'New')).then((v) => { r = v; }); });
    act(() => { result.current.apply((s) => renameBoard(s, first, 'Queued')); }); // queued: the commit waits
    localStorage.setItem(BOARDS_KEY, unopenable); // the winner of that store does not open here
    release();
    await settle();
    await settle();
    expect(r).toBe(NOT_ADDED);
    expect(result.current.notice).toEqual({ kind: 'unreadable', reason: 'locked' });
    expect(names(result.current.state)).not.toContain('Secret old name');
    expect(names(result.current.state)).not.toContain('New');
    expect(names(result.current.state)).not.toContain('Queued');
    await settle();
    expect(localStorage.getItem(BOARDS_KEY)).toBe(unopenable);
  });
});

describe('edits naming a Board or a slot the locked commit made, through a lost race', () => {
  it('a rename of the program board by its id stays on it (the retry makes the same Board)', async () => {
    const { result } = await tabWith(1);
    const now = await stored();
    const theirs = await sealedBytes(must(renameBoard(now, now.boards[0]!.id, 'Theirs')));
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked(keyed(8003)).then((v) => { r = v; }); });
    await held.sealing();
    const nano = boardFor(result.current.state, NANO.for)!.id;
    act(() => { result.current.apply((s) => renameBoard(s, nano, 'Editors')); });
    localStorage.setItem(BOARDS_KEY, theirs);
    release();
    await settle();
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) {
      expect(s.boards).toHaveLength(2);
      expect(boardFor(s, NANO.for)?.name).toBe('Editors');
      expect(tilesOf(boardFor(s, NANO.for))).toEqual([term(8003)]);
      expect(names(s)).toContain('Theirs');
    }
  });
  it('clearing the slot the landing put its tile in stays cleared (the retry makes the same slot)', async () => {
    const { result } = await tabWith(1);
    await act(async () => { await result.current.applyLocked(keyed(8001)); });
    await settle();
    const now = await stored();
    const theirs = await sealedBytes(must(renameBoard(now, now.boards[0]!.id, 'Theirs')));
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked(keyed(8002)).then((v) => { r = v; }); });
    await held.sealing();
    const b = boardFor(result.current.state, NANO.for)!;
    const slot = boardSlots(b).find((x) => { const t = b.tiles[x]; return !!t && 'session' in t && t.session === 8002; })!;
    act(() => { result.current.apply((s) => onActive(s, (x) => setTile(x, slot, null))); });
    localStorage.setItem(BOARDS_KEY, theirs);
    release();
    await settle();
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) {
      expect(tilesOf(boardFor(s, NANO.for))).toEqual([term(8001)]);
      expect(names(s)).toContain('Theirs');
    }
  });
});

describe('edits made on the program board a locked landing made, which never lands', () => {
  it('every round lost: NOT_ADDED, no program board; "keep loaded" is kept, and a rename of the Board shown never lands on another Board', async () => {
    const { result } = await tabWith(2);
    const before = result.current.state.active;
    const beforeName = result.current.state.boards.find((b) => b.id === before)!.name;
    const now = await stored();
    const others: string[] = [];
    for (let i = 1; i <= LOCK_ROUNDS + 2; i++) others.push(await sealedBytes(must(renameBoard(now, now.boards[0]!.id, 'Other ' + i))));
    let k = 0;
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => {
      void result.current.applyLocked((s, rr) => {
        const bytes = others[k++] as string;
        queueMicrotask(() => localStorage.setItem(BOARDS_KEY, bytes)); // stores while this tab's write is sealed
        return keyed(8003)(s, rr);
      }).then((v) => { r = v; });
    });
    await held.sealing();
    expect(boardFor(result.current.state, NANO.for)).toBeDefined();
    act(() => { result.current.apply((s) => setKeepLoaded(s, true)); });
    act(() => { result.current.apply((s) => renameBoard(s, s.active, 'Editors')); }); // the Board shown, whichever it is
    release();
    await settle();
    await settle();
    await settle();
    expect(r).toBe(NOT_ADDED);
    expect(k).toBe(LOCK_ROUNDS + 1);
    for (const s of [result.current.state, await reloaded()]) {
      expect(boardFor(s, NANO.for)).toBeUndefined();
      expect(s.keep).toBe(true);
      expect(names(s)).not.toContain('Editors');
      expect(s.boards.find((b) => b.id === before)?.name).toBe(beforeName);
      expect(s.boards.some((b) => b.id === s.active)).toBe(true);
    }
  });
});

describe('after the last lost race (the rounds ran out)', () => {
  it('this tab shows the winner of that race, as stored', async () => {
    const { result } = await tabWith(2);
    const now = await stored();
    const others: string[] = [];
    for (let i = 1; i <= LOCK_ROUNDS + 1; i++) others.push(await sealedBytes(must(renameBoard(now, now.boards[0]!.id, 'Winner ' + i))));
    let k = 0;
    let r: unknown = 'pending';
    act(() => {
      void result.current.applyLocked((s, rr) => {
        const bytes = others[k++] as string;
        queueMicrotask(() => localStorage.setItem(BOARDS_KEY, bytes)); // stores while this tab's write is sealed
        return createBoard(s, rr ?? rand, 'Mine');
      }).then((v) => { r = v; });
    });
    await settle();
    await settle();
    await settle();
    expect(r).toBe(NOT_ADDED);
    expect(k).toBe(LOCK_ROUNDS + 1);
    const last = 'Winner ' + (LOCK_ROUNDS + 1);
    expect((await stored()).boards[0]!.name).toBe(last);
    expect(result.current.state.boards[0]!.name).toBe(last);
    expect(names(result.current.state)).not.toContain('Mine');
  });
});
