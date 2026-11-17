/* eslint-disable no-restricted-globals -- these tests play another browser tab whose store lands first (its sealed
   bytes put in place before this tab's write); the page reaches storage only through core */
// Vitest, edits during a locked commit: this tab's edits made while a locked commit (data.ts applyLocked) runs. They belong
// to the Boards they were made on: another realm's edits are stored for that realm and never join the commit (even when
// its realm comes back), an edit on "the Board shown" stays on that Board through a lost race, an edit to the Board the
// commit changed survives its successful store, and edits are stored when the commit adds nothing. An accepted store
// whose owner went (another account, sign-out) is unknown, never success.
import { bootFixtureCore, fixtureWorld, FIXTURE_REALM } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { bump, setRealm, startLoggingOut } from '@core/ctx';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARDS_KEY, NOT_ADDED, NOT_KNOWN, useBoards } from './data';
import { boardFor, createBoard, isRefusal, keyedAddTile, MAX_BOARDS, onActive, renameBoard, type Board, type RealmBoards, type Refusal, type TileRef } from './model/boards';
import { parseRealmBoards, toStored } from './model/persist';

let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
const OTHER_REALM = fixtureWorld.realms.map((r) => r.id).find((id) => id !== FIXTURE_REALM) as string;
const term = (session: number): TileRef => ({ project: 'p1', computer: 'c1', program: 'terminal', session });
const NANO = { for: { c: 'c1', k: 'ow:nano' }, name: 'Nano · atlas' };
const settle = async () => { for (let i = 0; i < 6; i++) await act(() => cryptIdleForTests()); };
const stored = async (realm = FIXTURE_REALM) => (await storedForTests(BOARDS_KEY, realm)) as RealmBoards;
const reloaded = async (realm = FIXTURE_REALM) => parseRealmBoards(JSON.parse(JSON.stringify(await stored(realm)))).state;
const names = (s: RealmBoards | null) => (s?.boards ?? []).map((b) => b.name);
// Tiles as compared here: without their tile ids (S-id; the id rules are model/boards.tid.test.ts).
const tilesOf = (b: Board | undefined) => Object.values(b?.tiles ?? {}).filter(Boolean).map((t) => { const { tid: _tid, ...rest } = t as TileRef; return rest; });
/** A keyed landing as the Board makes one: with the commit's own random draws (the same ids each round). */
const keyed = (session: number) => (s: RealmBoards, r: () => number = rand) => { const x = keyedAddTile(s, NANO, term(session), r); return isRefusal(x) ? x : x.state; };
/** An edit of "the Board shown", as the Board's own controls make it (onActive). */
const nameShown = (name: string) => (s: RealmBoards) => onActive(s, (b) => ({ ...b, name }));
async function sealedBytes(value: RealmBoards): Promise<string> {
  const before = localStorage.getItem(BOARDS_KEY);
  await act(() => writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(value)));
  const bytes = localStorage.getItem(BOARDS_KEY) as string;
  if (before === null) localStorage.removeItem(BOARDS_KEY); else localStorage.setItem(BOARDS_KEY, before);
  return bytes;
}
/** This tab's next seal waits until released: its store stays on its way ('saving'). */
function holdSeal() {
  const subtle = globalThis.crypto.subtle;
  const real = subtle.encrypt.bind(subtle);
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  const spy = vi.spyOn(subtle, 'encrypt').mockImplementation(async (...a: Parameters<SubtleCrypto['encrypt']>) => { await gate; return real(...a); });
  return {
    sealing: () => vi.waitFor(() => expect(spy).toHaveBeenCalled()),
    release: () => { open(); spy.mockRestore(); },
  };
}
async function tabWith(boards: number) {
  const hook = renderHook(() => useBoards());
  await settle();
  act(() => { hook.result.current.apply((s) => { let x = s; while (x.boards.length < boards) x = must(createBoard(x, rand)); return x; }); });
  await settle();
  return hook;
}

let held: ReturnType<typeof holdSeal> | null = null;
const release = () => { held?.release(); held = null; };
beforeEach(async () => { vi.useFakeTimers({ shouldAdvanceTime: true }); bootFixtureCore({ rules: [] }); await settle(); });
afterEach(() => { release(); vi.useRealTimers(); });

describe('edits in another realm while a locked commit runs', () => {
  /** This tab with Boards in both realms, realm A shown. */
  async function twoRealms() {
    const hook = renderHook(() => useBoards());
    await settle();
    act(() => { setRealm(OTHER_REALM); });
    await settle();
    act(() => { hook.result.current.apply((s) => createBoard(s, rand, 'Bee')); });
    await settle();
    act(() => { setRealm(FIXTURE_REALM); });
    await settle();
    act(() => { hook.result.current.apply((s) => createBoard(s, rand, 'Ay')); });
    await settle();
    return hook;
  }
  it('are stored for that realm at once, never queued on the commit', async () => {
    const { result } = await twoRealms();
    held = holdSeal();
    act(() => { void result.current.applyLocked((s) => createBoard(s, rand, 'Mine')); });
    await held.sealing();
    act(() => { setRealm(OTHER_REALM); });
    const bee = result.current.state.boards.find((b) => b.name === 'Bee')!.id;
    act(() => { result.current.apply((s) => renameBoard(s, bee, 'Bee renamed')); });
    release();
    await settle();
    await settle();
    expect(names(result.current.state)).toContain('Bee renamed');
    expect(names(await stored(OTHER_REALM))).toContain('Bee renamed');
    expect(names(await stored())).toContain('Mine');
    expect(names(await stored())).not.toContain('Bee renamed');
  });
  it('and its realm shown again before a lost race: the commit never makes them on its own realm', async () => {
    const { result } = await twoRealms();
    const now = await stored();
    const theirs = await sealedBytes(must(renameBoard(now, now.boards[0]!.id, 'Theirs')));
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s) => createBoard(s, rand, 'Mine')).then((v) => { r = v; }); });
    await held.sealing();
    act(() => { setRealm(OTHER_REALM); });
    act(() => { result.current.apply(nameShown('Shown in B')); });
    act(() => { setRealm(FIXTURE_REALM); });
    localStorage.setItem(BOARDS_KEY, theirs);
    release();
    await settle();
    await settle();
    expect(r).not.toBe('pending');
    const a = await reloaded();
    expect(names(a)).not.toContain('Shown in B');
    expect(names(result.current.state)).not.toContain('Shown in B');
  });
});

describe('an edit of "the Board shown" made while a locked landing runs', () => {
  it('a lost race: the edit stays on the program board it was made on, never on the Board shown before', async () => {
    const { result } = await tabWith(2);
    act(() => { void result.current.applyLocked(keyed(8001)); });
    await settle();
    const firstId = result.current.state.boards[0]!.id;
    act(() => { result.current.apply((s) => ({ ...s, active: firstId })); });
    await settle();
    const now = await stored();
    const theirs = await sealedBytes(must(renameBoard(now, now.boards[1]!.id, 'Theirs')));
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked(keyed(8002)).then((v) => { r = v; }); });
    await held.sealing();
    expect(result.current.state.active).toBe(boardFor(result.current.state, NANO.for)!.id);
    act(() => { result.current.apply(nameShown('Editors')); });
    localStorage.setItem(BOARDS_KEY, theirs);
    release();
    await settle();
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) {
      const b = boardFor(s, NANO.for);
      expect(b?.name).toBe('Editors');
      expect(tilesOf(b)).toEqual([term(8001), term(8002)]);
      expect(s.boards.find((x) => x.id === firstId)?.name).not.toBe('Editors');
      expect(names(s)).toContain('Theirs');
    }
  });
  it('on the program board the landing made, through a lost race (made again by the next round)', async () => {
    const { result } = await tabWith(2);
    const now = await stored();
    const theirs = await sealedBytes(must(renameBoard(now, now.boards[1]!.id, 'Theirs')));
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked(keyed(8003)).then((v) => { r = v; }); });
    await held.sealing();
    act(() => { result.current.apply(nameShown('Editors')); });
    localStorage.setItem(BOARDS_KEY, theirs);
    release();
    await settle();
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) {
      expect(s.boards).toHaveLength(3);
      const b = boardFor(s, NANO.for);
      expect(b?.name).toBe('Editors');
      expect(tilesOf(b)).toEqual([term(8003)]);
      expect(names(s).filter((x) => x === 'Editors')).toHaveLength(1);
    }
  });
});

describe('an edit to the Board the locked commit changed, made while its store is on its way', () => {
  it('survives the successful store: kept, stored, no two-tab notice', async () => {
    const { result } = await tabWith(1);
    act(() => { void result.current.applyLocked(keyed(8001)); });
    await settle();
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked(keyed(8002)).then((v) => { r = v; }); });
    await held.sealing();
    act(() => { result.current.apply(nameShown('Editors')); });
    release();
    await settle();
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) {
      const b = boardFor(s, NANO.for);
      expect(b?.name).toBe('Editors');
      expect(tilesOf(b)).toEqual([term(8001), term(8002)]);
    }
    expect(result.current.notice).toBeNull();
  });
});

describe('edits queued while a locked commit waits, which then adds nothing', () => {
  it('nine Boards: New Board is refused, and a rename made while it waited is stored', async () => {
    const { result } = await tabWith(MAX_BOARDS);
    const [first, second] = result.current.state.boards.map((b) => b.id) as [string, string];
    held = holdSeal();
    act(() => { result.current.apply((s) => renameBoard(s, first, 'First')); }); // its store on its way
    await held.sealing();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s) => createBoard(s, rand, 'Tenth')).then((v) => { r = v; }); });
    await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
    act(() => { result.current.apply((s) => renameBoard(s, second, 'Second')); });
    release();
    await settle();
    await settle();
    expect(r).toEqual({ refused: 'BOARDS_FULL' });
    for (const s of [result.current.state, await reloaded()]) {
      expect(s.boards.find((b) => b.id === first)?.name).toBe('First');
      expect(s.boards.find((b) => b.id === second)?.name).toBe('Second');
      expect(names(s)).not.toContain('Tenth');
    }
  });
});

/** Another tab's value stays opening until released (core: 'loading', writes refused). */
function holdOpen() {
  const subtle = globalThis.crypto.subtle;
  const real = subtle.decrypt.bind(subtle);
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  const spy = vi.spyOn(subtle, 'decrypt').mockImplementation(async (...a: Parameters<SubtleCrypto['decrypt']>) => { await gate; return real(...a); });
  return { release: () => { open(); spy.mockRestore(); } };
}
/** op, with another tab's store landing on its first round only, just before this tab's store (refused: opening). */
const landsFirst = (theirs: string, op: (s: RealmBoards) => RealmBoards | Refusal) => {
  let first = true;
  return (s: RealmBoards) => { if (first) { first = false; localStorage.setItem(BOARDS_KEY, theirs); } return op(s); };
};

describe('while a locked commit waits for another tab\'s value to open', () => {
  it('a realm switch: the next round never runs on the realm shown now (NOT_ADDED, its Boards untouched)', async () => {
    const { result } = renderHook(() => useBoards());
    await settle();
    act(() => { setRealm(OTHER_REALM); });
    await settle();
    act(() => { result.current.apply((s) => createBoard(s, rand, 'Bee')); });
    await settle();
    const bee = names(result.current.state);
    act(() => { setRealm(FIXTURE_REALM); });
    await settle();
    act(() => { result.current.apply((s) => createBoard(s, rand, 'Ay')); });
    await settle();
    const now = await stored();
    const theirs = await sealedBytes(must(renameBoard(now, now.boards[0]!.id, 'Theirs')));
    const opening = holdOpen();
    let r: unknown = 'pending';
    try {
      act(() => { void result.current.applyLocked(landsFirst(theirs, (s) => createBoard(s, rand, 'Mine'))).then((v) => { r = v; }); });
      await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
      act(() => { setRealm(OTHER_REALM); });
    } finally { opening.release(); }
    await settle();
    await settle();
    expect(r).toBe(NOT_ADDED);
    expect(names(result.current.state)).toEqual(bee);
    expect(names(await stored(OTHER_REALM))).toEqual(bee);
  });
  it('an edit of the Board shown then (the one before the landing) stays on it when the landing runs again', async () => {
    const { result } = await tabWith(2);
    const firstId = result.current.state.boards[0]!.id;
    act(() => { result.current.apply((s) => ({ ...s, active: firstId })); });
    await settle();
    const now = await stored();
    const theirs = await sealedBytes(must(renameBoard(now, now.boards[1]!.id, 'Theirs')));
    const opening = holdOpen();
    let r: unknown = 'pending';
    try {
      act(() => { void result.current.applyLocked(landsFirst(theirs, keyed(8003))).then((v) => { r = v; }); });
      await vi.waitFor(() => expect(result.current.state.active).toBe(firstId)); // back to the value read, while theirs opens
      act(() => { result.current.apply(nameShown('Shown then')); });
    } finally { opening.release(); }
    await settle();
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) {
      expect(s.boards.find((b) => b.id === firstId)?.name).toBe('Shown then');
      expect(boardFor(s, NANO.for)?.name).toBe('Nano · atlas');
      expect(names(s)).toContain('Theirs');
    }
  });
});

describe('a locked commit that adds nothing, after its fold found this tab\'s value needs writing', () => {
  it('this tab\'s rename lost a race just before New Board (nine Boards): refused, and the rename is stored merged', async () => {
    const { result } = await tabWith(MAX_BOARDS);
    const [first, second] = result.current.state.boards.map((b) => b.id) as [string, string];
    const theirs = await sealedBytes(must(renameBoard(await stored(), second, 'Theirs')));
    held = holdSeal();
    act(() => { result.current.apply((s) => renameBoard(s, first, 'Mine')); });
    await held.sealing();
    localStorage.setItem(BOARDS_KEY, theirs); // the rename's store meets a conflict
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s) => createBoard(s, rand, 'Tenth')).then((v) => { r = v; }); });
    release();
    await settle();
    await settle();
    expect(r).toEqual({ refused: 'BOARDS_FULL' });
    for (const s of [result.current.state, await reloaded()]) {
      expect(s.boards.find((b) => b.id === first)?.name).toBe('Mine');
      expect(s.boards.find((b) => b.id === second)?.name).toBe('Theirs');
    }
  });
});

describe('an edit that makes something (not the same twice), queued through a lost race', () => {
  it('is made once: one new Board, after the commit\'s own', async () => {
    const { result } = await tabWith(2);
    const now = await stored();
    const theirs = await sealedBytes(must(renameBoard(now, now.boards[0]!.id, 'Theirs')));
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s) => createBoard(s, rand, 'Mine')).then((v) => { r = v; }); });
    await held.sealing();
    // Made from a Board that was there before the commit (the first one shown again), so it does not wait for op.
    act(() => { result.current.apply((s) => ({ ...s, active: s.boards[0]!.id })); });
    act(() => { result.current.apply((s) => createBoard(s, rand, 'Extra')); });
    localStorage.setItem(BOARDS_KEY, theirs);
    release();
    await settle();
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) {
      expect(names(s).filter((x) => x === 'Extra')).toHaveLength(1);
      expect(names(s).slice(-2)).toEqual(['Mine', 'Extra']);
    }
  });
});

// Last in the file: sign-out is one way in core (bootFixtureCore does not undo it).
describe('the owner of an accepted locked store goes before its answer is seen', () => {
  it('another account (core generation moves): NOT_KNOWN, never success', async () => {
    const { result } = await tabWith(2);
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s) => createBoard(s, rand, 'Mine')).then((v) => { r = v; }); });
    await held.sealing();
    act(() => { bump('account'); });
    release();
    await settle();
    await settle();
    expect(r).toBe(NOT_KNOWN);
  });
  it('sign-out began: NOT_KNOWN, never success', async () => {
    const { result } = await tabWith(2);
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s) => createBoard(s, rand, 'Mine')).then((v) => { r = v; }); });
    await held.sealing();
    act(() => { startLoggingOut(); });
    release();
    await settle();
    await settle();
    expect(r).toBe(NOT_KNOWN);
  });
});
