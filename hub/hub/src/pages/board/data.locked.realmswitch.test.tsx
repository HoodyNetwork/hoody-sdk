/* eslint-disable no-restricted-globals -- these tests play another browser tab whose store lands first (its sealed
   bytes put in place before this tab's write); the page reaches storage only through core */
// Vitest, a locked commit's second store: a locked commit (data.ts applyLocked) whose store is still on its way. It never
// touches another realm's Boards after a switch, never says "stored" or "not stored" when it does not know (C9), keeps
// this tab's edits made meanwhile through a lost race, gives a Board it made one undo step, and leaves the merge base
// on its own stored value (the next edit is kept).
import { bootFixtureCore, fixtureWorld, FIXTURE_REALM } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { setRealm } from '@core/ctx';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARDS_KEY, NOT_ADDED, NOT_KNOWN, STORE_WAIT_MS, useBoards } from './data';
import { addTile, allTids, boardFor, createBoard, deleteBoard, duplicateBoard, importBoard, isRefusal, keyedAddTile, MAX_BOARDS, onActive, renameBoard, type Board, type RealmBoards, type Refusal, type TileRef } from './model/boards';
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
const reloaded = async () => parseRealmBoards(JSON.parse(JSON.stringify(await stored()))).state;
const names = (s: RealmBoards | null) => (s?.boards ?? []).map((b) => b.name);
// Tiles as compared here: without their tile ids (S-id; the id rules are model/boards.tid.test.ts).
const tilesOf = (b: Board | undefined) => Object.values(b?.tiles ?? {}).filter(Boolean).map((t) => { const { tid: _tid, ...rest } = t as TileRef; return rest; });
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
beforeEach(async () => { vi.useFakeTimers({ shouldAdvanceTime: true }); bootFixtureCore({ rules: [] }); await settle(); });
afterEach(() => { held?.release(); held = null; vi.useRealTimers(); });

describe('a realm switch while the locked store is on its way', () => {
  it('then a lost race: NOT_ADDED, and the realm now shown keeps its own Boards (shown and stored)', async () => {
    const { result } = renderHook(() => useBoards());
    await settle();
    act(() => { setRealm(OTHER_REALM); });
    await settle();
    act(() => { result.current.apply((s) => createBoard(s, rand, 'Bee')); });
    await settle();
    const bee = names(result.current.state);
    expect(bee).toContain('Bee');
    act(() => { setRealm(FIXTURE_REALM); });
    await settle();
    act(() => { result.current.apply((s) => createBoard(s, rand, 'Ay')); });
    await settle();
    const now = await stored();
    const theirs = await sealedBytes(must(renameBoard(now, now.boards[0]!.id, 'Theirs')));
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s) => createBoard(s, rand, 'Mine')).then((v) => { r = v; }); });
    await held.sealing();
    localStorage.setItem(BOARDS_KEY, theirs); // another tab stored first: this write loses
    act(() => { setRealm(OTHER_REALM); });
    held.release();
    await settle();
    await settle();
    expect(r).toBe(NOT_ADDED);
    expect(names(result.current.state)).toEqual(bee);
    expect(names(await stored(OTHER_REALM))).toEqual(bee);
    expect(names(await stored())).not.toContain('Mine');
  });
});

describe('a locked store whose outcome is not seen (C9)', () => {
  it('still on its way after STORE_WAIT_MS: NOT_KNOWN, never success or "not added"; the Board stays shown and is stored once it lands', async () => {
    const { result } = await tabWith(2);
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s) => createBoard(s, rand, 'Mine')).then((v) => { r = v; }); });
    await held.sealing(); // (its polling moves the fake clock on, so the wait is not timed from here)
    expect(r).toBe('pending');
    await act(() => vi.advanceTimersByTimeAsync(STORE_WAIT_MS + 100));
    expect(r).toBe(NOT_KNOWN);
    expect(names(result.current.state)).toContain('Mine');
    held.release();
    held = null;
    await settle();
    expect(names(await stored())).toContain('Mine');
  });
});

describe('this tab\'s edits made while a locked commit runs', () => {
  it('an edit queued through a lost race is made again with every tile id seen this session (S-id)', async () => {
    const { result } = await tabWith(2);
    act(() => { result.current.apply((s) => must(onActive(s, (b, taken) => { const x = addTile(b, term(5), rand, taken); return isRefusal(x) ? x : x.board; })), { record: 'add' }); });
    const st0 = result.current.state;
    const gone = Object.values(st0.boards.find((b) => b.id === st0.active)!.tiles).find(Boolean)?.tid as string;
    expect(gone).toMatch(/^t/);
    act(() => { result.current.apply((s) => must(onActive(s, (b) => ({ ...b, tiles: Object.fromEntries(Object.keys(b.tiles).map((k) => [k, null])) }))), { record: 'clear' }); });
    await settle();
    const now = await stored();
    const [first, second] = now.boards.map((b) => b.id) as [string, string];
    const theirs = await sealedBytes(must(renameBoard(now, second, 'Theirs')));
    held = holdSeal();
    act(() => { void result.current.applyLocked((s) => createBoard(s, rand, 'Mine')); });
    await held.sealing();
    const seen: ReadonlySet<string>[] = [];
    act(() => { result.current.apply((s, h) => { seen.push(h); return renameBoard(s, first, 'Meanwhile ' + seen.length); }, { record: 'Rename' }); });
    localStorage.setItem(BOARDS_KEY, theirs);
    held.release();
    held = null;
    await settle();
    await settle();
    expect(seen.length).toBeGreaterThanOrEqual(2);
    for (const h of seen) expect(h.has(gone)).toBe(true);
  });
  for (const how of ['duplicate', 'import'] as const) {
    it(`a ${how}d Board renamed while its store is on its way keeps its id and the rename through the lost race (S-id: held tile ids take no draw from the Board id)`, async () => {
      const { result } = await tabWith(2);
      act(() => { result.current.apply((s) => ({ ...s, boards: s.boards.map((b, i) => (i === 0 ? must(addTile(b, term(5), rand, allTids(s))).board : b)) })); });
      await settle();
      const now = await stored();
      const [first, second] = now.boards.map((b) => b.id) as [string, string];
      const file = now.boards[0] as Board; // its id is taken here: the import draws a new one
      const theirs = await sealedBytes(must(renameBoard(now, second, 'Theirs')));
      held = holdSeal();
      let r: unknown = 'pending';
      act(() => { void result.current.applyLocked((s, rr, h) => (how === 'duplicate' ? duplicateBoard(s, first, rr, 'Copy', h) : importBoard(s, file, rr, h))).then((v) => { r = v; }); });
      await held.sealing();
      const shown = result.current.state.active;
      expect([first, second]).not.toContain(shown);
      act(() => { result.current.apply((s) => renameBoard(s, shown, 'Renamed meanwhile'), { record: 'Rename' }); });
      localStorage.setItem(BOARDS_KEY, theirs);
      held.release();
      held = null;
      await settle();
      await settle();
      expect(r).toBeNull();
      for (const st of [result.current.state, await reloaded()]) {
        expect(st.boards.find((b) => b.id === shown)?.name).toBe('Renamed meanwhile');
        expect(tilesOf(st.boards.find((b) => b.id === shown))).toEqual(tilesOf(file));
        expect(st.boards.find((b) => b.id === second)?.name).toBe('Theirs');
        expect(st.boards).toHaveLength(3);
      }
    });
  }
  it('a rename made while the store is on its way survives the lost race and is stored with the new Board', async () => {
    const { result } = await tabWith(2);
    const now = await stored();
    const [first, second] = now.boards.map((b) => b.id) as [string, string];
    const theirs = await sealedBytes(must(renameBoard(now, second, 'Theirs')));
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s) => createBoard(s, rand, 'Mine')).then((v) => { r = v; }); });
    await held.sealing();
    act(() => { result.current.apply((s) => renameBoard(s, first, 'Mine meanwhile'), { record: 'Rename' }); });
    localStorage.setItem(BOARDS_KEY, theirs);
    held.release();
    held = null;
    await settle();
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) {
      expect(s.boards.find((b) => b.id === first)?.name).toBe('Mine meanwhile');
      expect(s.boards.find((b) => b.id === second)?.name).toBe('Theirs');
      expect(names(s)).toContain('Mine');
    }
  });
  it('a rename made while the last store is on its way (no race) is stored when the commit ends', async () => {
    const { result } = await tabWith(2);
    const first = result.current.state.boards[0]!.id;
    held = holdSeal();
    let r: unknown = 'pending';
    act(() => { void result.current.applyLocked((s) => createBoard(s, rand, 'Mine')).then((v) => { r = v; }); });
    await held.sealing();
    act(() => { result.current.apply((s) => renameBoard(s, first, 'Meanwhile')); });
    held.release();
    held = null;
    await settle();
    await settle();
    expect(r).toBeNull();
    for (const s of [result.current.state, await reloaded()]) {
      expect(s.boards.find((b) => b.id === first)?.name).toBe('Meanwhile');
      expect(names(s)).toContain('Mine');
    }
  });
  it('Undo waits while the locked commit runs', async () => {
    const { result } = await tabWith(2);
    const [first, second] = result.current.state.boards.map((b) => b.id) as [string, string];
    act(() => { result.current.apply((s) => renameBoard(s, first, 'Named'), { record: 'Rename' }); });
    await settle();
    expect(result.current.undoLabel).toBe('Rename');
    held = holdSeal();
    // The locked op leaves the renamed Board active, so its undo step is the one Undo would take.
    act(() => { void result.current.applyLocked((s) => renameBoard(s, second, 'Locked')); });
    await held.sealing();
    act(() => { result.current.undo(); });
    expect(result.current.state.boards[0]!.name).toBe('Named');
    held.release();
    held = null;
    await settle();
    expect(names(await stored())).toEqual(['Named', 'Locked']);
    expect(result.current.undoLabel).toBe('Rename');
  });
});

describe('the first landing on a program board made for it', () => {
  it('is one undo step: Undo leaves that board empty', async () => {
    const { result } = await tabWith(2);
    let made: Board | undefined;
    let r: unknown = 'pending';
    await act(async () => {
      r = await result.current.applyLocked((s) => { const x = keyedAddTile(s, NANO, term(8003), rand); if (isRefusal(x)) return x; made = x.made; return x.state; }, { record: 'Add Nano', made: () => made });
    });
    await settle();
    expect(r).toBeNull();
    expect(made).toBeDefined();
    expect(tilesOf(boardFor(result.current.state, NANO.for))).toEqual([term(8003)]);
    expect(result.current.undoLabel).toBe('Add Nano');
    act(() => { result.current.undo(); });
    await settle();
    for (const s of [result.current.state, await reloaded()]) {
      const b = boardFor(s, NANO.for);
      expect(b).toBeDefined();
      expect(tilesOf(b)).toEqual([]);
    }
  });
});

describe('the merge base after a locked commit', () => {
  it('is its own stored value: a rename right after is kept (shown, stored, after a reload)', async () => {
    const { result } = await tabWith(2);
    const id = result.current.state.boards[0]!.id;
    await act(async () => { await result.current.applyLocked((s) => createBoard(s, rand, 'Mine')); });
    act(() => { result.current.apply((s) => renameBoard(s, id, 'Later')); });
    await settle();
    await settle();
    for (const s of [result.current.state, await reloaded()]) {
      expect(s.boards.find((b) => b.id === id)?.name).toBe('Later');
      expect(names(s)).toContain('Mine');
    }
  });
});

describe('a Board this tab kept over another tab\'s delete, past nine', () => {
  it('gives way to the nine stored, and the notice names it as deleted elsewhere', async () => {
    const { result } = await tabWith(MAX_BOARDS);
    const now = await stored();
    const x = now.boards[3]!.id;
    const theirs = await sealedBytes(must(createBoard(must(deleteBoard(now, x, rand)), rand, 'Theirs')));
    held = holdSeal();
    act(() => { result.current.apply((s) => renameBoard(s, x, 'Kept here')); });
    await held.sealing();
    localStorage.setItem(BOARDS_KEY, theirs);
    held.release();
    held = null;
    await settle();
    await settle();
    for (const s of [result.current.state, await reloaded()]) {
      expect(s.boards).toHaveLength(MAX_BOARDS);
      expect(names(s)).toContain('Theirs');
      expect(s.boards.some((b) => b.id === x)).toBe(false);
    }
    expect(result.current.notice).toEqual({ kind: 'deleted', name: 'Kept here' });
  });
});
