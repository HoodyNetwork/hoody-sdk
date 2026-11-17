// Vitest, S-hist-model: Close and Restore write the two keys in the order that never
// loses a Board. Close stores the history entry first and deletes the live Board only once that write is durable; Restore
// makes the Board again first and removes the entry only once that write is durable. Each write is failed in turn (the
// browser refusing the seal): a failure leaves the Board, the entry, or both, never neither. Closing the last Board leaves
// its tombstone; an empty Board is closed without an entry; Remove one, its Undo and Clear all change only what they name.
// The history is kept and scoped exactly like hub_boards_v1: per realm, kept at sign-out, never another account's.
import { bootFixtureCore, fixtureWorld, FIXTURE_REALM } from '@core';
import { setIdentity, setRealm } from '@core/ctx';
import { ACCOUNT_PREF_KEYS, accountPref } from '@core/prefs';
import { registryEntry } from '@core/registry';
import { cryptIdleForTests, storedForTests, vaultForTests } from '@core/cryptStore';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARDS_HISTORY_KEY, BOARD_CHANGED, BOARD_NOT_STORED, NOT_STORED, resetClosedForTests, sameContent, useClosedBoards } from './closed';
import { BOARDS_KEY, NOT_ADDED, resetBoardsForTests, useBoards, type BoardsApi } from './data';
import { addTile, createBoard, freshRealm, isRefusal, onActive, renameBoard, type Board, type RealmBoards, type Refusal, type Tile } from './model/boards';
import { parseClosedHistory, type ClosedHistory } from './model/history';
import { parseRealmBoards } from './model/persist';

let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
const settle = async () => { for (let i = 0; i < 6; i++) await act(() => cryptIdleForTests()); };
const storedBoards = async (): Promise<RealmBoards> => parseRealmBoards(JSON.parse(JSON.stringify(await storedForTests(BOARDS_KEY, FIXTURE_REALM)))).state;
const storedHistory = async (): Promise<ClosedHistory> => parseClosedHistory(JSON.parse(JSON.stringify((await storedForTests(BOARDS_HISTORY_KEY, FIXTURE_REALM)) ?? null)));
const web = (path: string): Tile => ({ url: 'https://docs.example/' + path });
const names = (h: ClosedHistory) => h.entries.map((e) => e.board.name);
const urls = (b: Board) => Object.values(b.tiles).flatMap((t) => (t && 'url' in t ? [t.url] : []));

/** A tab with Boards "Work" (one web tile, active) and "Spare" (empty). */
async function tab() {
  const hook = renderHook(() => { const api = useBoards(); return { api, closed: useClosedBoards(inOp.wrap(api)) }; });
  await settle();
  const r = () => hook.result.current;
  act(() => { r().api.apply((s) => must(createBoard(must(renameBoard(s, s.boards[0]!.id, 'Work')), rand, 'Spare'))); });
  act(() => { r().api.apply((s) => ({ ...s, active: s.boards[0]!.id })); });
  act(() => { r().api.apply((s, held) => onActive(s, (b, taken) => { const x = addTile(b, web('w'), rand, taken); return isRefusal(x) ? x : x.board; }, held)); });
  await settle();
  const [work, spare] = r().api.state.boards as [Board, Board];
  return { hook, r, work: work.id, spare: spare.id };
}
/** The browser refuses the seals numbered in `fail` (1 = the next seal), and seals the others. */
function failSeals(...fail: number[]) {
  const subtle = globalThis.crypto.subtle;
  const real = subtle.encrypt.bind(subtle);
  let i = 0;
  return vi.spyOn(subtle, 'encrypt').mockImplementation(async (...a: Parameters<SubtleCrypto['encrypt']>) => {
    i++;
    if (fail.includes(i)) throw new DOMException('refused', 'OperationError');
    return real(...a);
  });
}

/** Holds this tab's seals (a write on its way) until released. */
function holdSeal() {
  const subtle = globalThis.crypto.subtle;
  const real = subtle.encrypt.bind(subtle);
  let open!: () => void;
  const gate = new Promise<void>((res) => { open = res; });
  const spy = vi.spyOn(subtle, 'encrypt').mockImplementation(async (...a: Parameters<SubtleCrypto['encrypt']>) => { await gate; return real(...a); });
  return { sealing: () => vi.waitFor(() => expect(spy).toHaveBeenCalled()), release: () => { open(); spy.mockRestore(); } };
}
/** Core switches to `realm` at the start of the next live-Board op closed.ts runs, synchronously: the page cannot have
 *  rendered the switch (its refs and applyLocked's own scope check still read the old realm), as when the lock's
 *  callback resumes before React renders a switch core made meanwhile. */
const inOp = {
  realm: null as string | null,
  wrap(api: BoardsApi): BoardsApi {
    return {
      ...api,
      applyLocked: (op, o) => api.applyLocked((st, ...x) => {
        if (inOp.realm !== null) { setRealm(inOp.realm); inOp.realm = null; }
        return op(st, ...x);
      }, o),
    };
  },
};
/** Runs `start` while another tab holds the history lock; meanwhile the tab shows again and its vault check is refused
 *  (core's verification fence: status 'locked', get() reads the default). Then the lock is let go and the fence lifts.
 *  Answers what `start` answered. */
async function underFence(start: () => Promise<unknown>): Promise<unknown> {
  const spin = async () => { for (let i = 0; i < 40; i++) await act(() => new Promise((r) => setImmediate(r))); };
  const locks = navigator.locks;
  const real = locks.request.bind(locks) as (...a: unknown[]) => Promise<unknown>;
  let letGo!: () => void;
  const gate = new Promise<void>((res) => { letGo = res; });
  vi.spyOn(locks, 'request').mockImplementation(((...a: unknown[]) => (String(a[0]).startsWith('hub_boards_closed:') ? gate.then(() => real(...a)) : real(...a))) as unknown as LockManager['request']);
  let p!: Promise<unknown>;
  act(() => { p = start(); });
  await spin();
  vi.useRealTimers();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const v = vaultForTests();
  const orig = v.account.bind(v);
  let fail = true;
  v.account = (u) => (fail ? Promise.reject(new Error('refused')) : orig(u));
  document.dispatchEvent(new Event('visibilitychange'));
  await spin();
  fail = false;
  letGo();
  await spin();
  await act(() => cryptIdleForTests());
  await spin();
  const res = await p;
  v.account = orig;
  vi.mocked(locks.request).mockRestore();
  await act(() => vi.advanceTimersByTimeAsync(11_000));
  vi.useRealTimers();
  await settle();
  return res;
}
const OTHER = () => fixtureWorld.realms.map((x) => x.id).find((id) => id !== FIXTURE_REALM) as string;
const addTo = (id: string, path: string) => (s: RealmBoards, held: ReadonlySet<string>) => onActive({ ...s, active: id }, (b, taken) => { const x = addTile(b, web(path), rand, taken); return isRefusal(x) ? x : x.board; }, held);

beforeEach(async () => { inOp.realm = null; vi.useFakeTimers({ shouldAdvanceTime: true }); bootFixtureCore({ rules: [] }); resetBoardsForTests(); resetClosedForTests(); await settle(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Close: the history entry first, then the live Board', () => {
  it('stores the entry, then deletes the Board; the entry is the Board as it was', async () => {
    const { r, work } = await tab();
    const before = r().api.state.boards.find((b) => b.id === work)!;
    let res: unknown;
    await act(async () => { res = await r().closed.close(work); });
    await settle();
    const h = await storedHistory();
    expect(res).toEqual({ cid: h.entries[0]!.cid });
    expect(h.entries[0]!.board.name).toBe('Work');
    expect(urls(h.entries[0]!.board)).toEqual(urls(before));
    const s = await storedBoards();
    expect(s.boards.map((b) => b.name)).toEqual(['Spare']);
    expect(s.gone).toContain(work);
    expect(r().closed.entries.map((e) => e.board.name)).toEqual(['Work']);
  });

  it('a history write that is not durable deletes nothing (core may store its refused write later: then both, never neither)', async () => {
    const { r, work } = await tab();
    failSeals(1);
    let res: unknown;
    await act(async () => { res = await r().closed.close(work); });
    await settle();
    expect(res).toEqual(NOT_STORED);
    expect((await storedBoards()).boards.map((b) => b.name)).toEqual(['Work', 'Spare']);
    expect((await storedHistory()).entries.map((e) => e.board.name)).not.toContain('Spare');
  });

  it('while the history reads \'unsaved\' (a refused write core keeps for a retry) no history write starts (only \'ok\' or \'conflict\' are read)', async () => {
    const { r, work, spare } = await tab();
    act(() => { r().api.apply(addTo(spare, 's')); });
    await settle();
    const seals = failSeals(...Array.from({ length: 40 }, (_, i) => i + 1));
    let res: unknown;
    await act(async () => { res = await r().closed.close(work); });
    expect(res).toEqual(NOT_STORED);
    const tried = seals.mock.calls.length;
    await act(async () => { res = await r().closed.close(spare); });
    expect(res).toEqual(NOT_STORED);
    expect(seals.mock.calls.length).toBe(tried); // the second close sealed nothing: it read nothing and wrote nothing
    expect(r().api.state.boards.map((b) => b.id)).toEqual([work, spare]);
  });

  it('a live delete that fails after the history write leaves both: the entry and the Board (never a loss)', async () => {
    const { r, work } = await tab();
    failSeals(2, 3, 4, 5, 6);
    await act(async () => { await r().closed.close(work); });
    await settle();
    expect((await storedHistory()).entries.map((e) => e.board.name)).toEqual(['Work']);
    expect((await storedBoards()).boards.map((b) => b.name)).toContain('Work');
  });

  it('closing the last Board leaves its tombstone', async () => {
    const { r, work, spare } = await tab();
    await act(async () => { await r().closed.close(spare); });
    await settle();
    await act(async () => { await r().closed.close(work); });
    await settle();
    const s = await storedBoards();
    expect(s.boards).toHaveLength(1);
    expect(s.boards[0]!.id).not.toBe(work);
    expect(s.gone).toEqual(expect.arrayContaining([work, spare]));
  });

  it('an empty Board is closed without an entry', async () => {
    const { r, spare } = await tab();
    let res: unknown;
    await act(async () => { res = await r().closed.close(spare); });
    await settle();
    expect(res).toEqual({ cid: null });
    expect((await storedHistory()).entries).toEqual([]);
    expect((await storedBoards()).boards.map((b) => b.name)).toEqual(['Work']);
  });
});

describe('Close deletes only the Board it read, in the scope it began in', () => {
  it('a tile added while the history write is on its way: BOARD_CHANGED, the Board stays with both tiles', async () => {
    const { r, work } = await tab();
    const seal = holdSeal();
    let res: unknown;
    let done!: Promise<void>;
    act(() => { done = r().closed.close(work).then((x) => { res = x; }); });
    await seal.sealing();
    act(() => { r().api.apply(addTo(work, 'late')); });
    seal.release();
    await act(() => done);
    await settle();
    expect(res).toEqual(BOARD_CHANGED);
    const w = (await storedBoards()).boards.find((b) => b.id === work)!;
    expect(urls(w)).toEqual(expect.arrayContaining(['https://docs.example/w', 'https://docs.example/late']));
  });

  it('an empty Board that gets a tile before the delete runs is not deleted', async () => {
    const { r, spare } = await tab();
    const seal = holdSeal();
    act(() => { r().api.apply((s) => must(renameBoard(s, s.active, 'Busy'))); }); // a write on its way: the close waits
    await seal.sealing();
    let res: unknown;
    let done!: Promise<void>;
    act(() => { done = r().closed.close(spare).then((x) => { res = x; }); });
    // The close's commit holds the lock and waits for the write on its way: the tile is an edit queued on it.
    await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
    act(() => { r().api.apply(addTo(spare, 'late')); });
    seal.release();
    await act(() => done);
    await settle();
    expect(res).toEqual(NOT_ADDED);
    expect(urls((await storedBoards()).boards.find((b) => b.id === spare)!)).toEqual(['https://docs.example/late']);
  });

  it('a realm switch right after the history write is stored: the delete never runs, in either realm', async () => {
    const OTHER_REALM = fixtureWorld.realms.map((x) => x.id).find((id) => id !== FIXTURE_REALM) as string;
    const { r, work } = await tab();
    const locks = navigator.locks;
    // Every lock request passes through untouched (core's own locks take options too); only the history lock's
    // answer switches the realm, before close goes on to its delete.
    const real = locks.request.bind(locks) as (...a: unknown[]) => Promise<unknown>;
    vi.spyOn(locks, 'request').mockImplementation(((...a: unknown[]) => real(...a).then((x) => {
      if (String(a[0]).startsWith('hub_boards_closed:')) setRealm(OTHER_REALM);
      return x;
    })) as unknown as LockManager['request']);
    let res: unknown;
    await act(async () => { res = await r().closed.close(work); });
    vi.mocked(locks.request).mockRestore();
    act(() => { setRealm(FIXTURE_REALM); });
    await settle();
    expect((await storedHistory()).entries.map((e) => e.board.name)).toEqual(['Work']); // the history write was durable
    expect(res).toEqual(NOT_STORED);
    expect((await storedBoards()).boards.map((b) => b.id)).toContain(work);
  });

  it('a realm switch between the history write and the delete deletes nothing, in either realm', async () => {
    const OTHER_REALM = fixtureWorld.realms.map((x) => x.id).find((id) => id !== FIXTURE_REALM) as string;
    const { r, work } = await tab();
    const seal = holdSeal();
    let res: unknown;
    let done!: Promise<void>;
    act(() => { done = r().closed.close(work).then((x) => { res = x; }); });
    await seal.sealing();
    act(() => { setRealm(OTHER_REALM); });
    seal.release();
    await act(() => done);
    await settle();
    act(() => { setRealm(FIXTURE_REALM); });
    await settle();
    expect(res).toEqual(NOT_STORED);
    expect((await storedBoards()).boards.map((b) => b.id)).toContain(work);
  });

  it('core switches realm as the live-Board op starts, before the page renders it: the delete never runs', async () => {
    const { r, work } = await tab();
    inOp.realm = OTHER();
    let res: unknown;
    await act(async () => { res = await r().closed.close(work); });
    act(() => { setRealm(FIXTURE_REALM); });
    await settle();
    expect(res).toEqual(NOT_STORED);
    expect(names(await storedHistory())).toEqual(['Work']); // the entry was durable; the Board stays too (both)
    expect((await storedBoards()).boards.map((b) => b.id)).toContain(work);
  });

  it('the verification fence rising while the history lock is held: nothing is written, every earlier entry stays', async () => {
    const { r, work, spare } = await tab();
    act(() => { r().api.apply(addTo(spare, 's')); });
    await settle();
    await act(async () => { await r().closed.close(work); });
    await settle();
    expect(names(await storedHistory())).toEqual(['Work']);
    const res = await underFence(() => r().closed.close(spare));
    expect(res).toEqual(NOT_STORED);
    expect(names(await storedHistory())).toEqual(['Work']);
    expect((await storedBoards()).boards.map((b) => b.id)).toContain(spare);
  });

  it('content, not key order: a Board built in another key order is the same Board', () => {
    const s0 = must(onActive(freshRealm(rand), (x, taken) => { const y = addTile(x, { url: 'https://docs.example/n', name: 'Docs' } as Tile, rand, taken); return isRefusal(y) ? y : y.board; }));
    const b = s0.boards[0]!;
    const tiles = Object.fromEntries(Object.entries(b.tiles).map(([k, x]) => [k, x ? Object.fromEntries(Object.entries(x).reverse()) : x]));
    expect(sameContent(b, { ...b, tiles } as Board)).toBe(true);
    const slot = Object.keys(b.tiles).find((k) => b.tiles[k])!;
    expect(sameContent(b, { ...b, tiles: { ...b.tiles, [slot]: web('other') } } as Board)).toBe(false);
    expect(sameContent(b, { ...b, name: 'Renamed' })).toBe(false);
  });
});

describe('Restore: the live Board first, then the entry goes', () => {
  async function closedWork() {
    const t = await tab();
    await act(async () => { await t.r().closed.close(t.work); });
    await settle();
    return { ...t, cid: (await storedHistory()).entries[0]!.cid };
  }

  it('makes the Board again under a fresh id, with fresh tile ids, then removes the entry', async () => {
    const { r, work, cid } = await closedWork();
    const old = (await storedHistory()).entries[0]!.board;
    let res: { boardId: string; entryKept: boolean } | undefined;
    await act(async () => { res = (await r().closed.restore(cid)) as typeof res; });
    await settle();
    const s = await storedBoards();
    const b = s.boards.find((x) => x.id === res!.boardId)!;
    expect(res!.entryKept).toBe(false);
    expect(b.id).not.toBe(work);
    expect(b.name).toBe('Work');
    expect(urls(b)).toEqual(urls(old));
    expect(Object.values(b.tiles).map((t) => t?.tid)).not.toEqual(Object.values(old.tiles).map((t) => t?.tid));
    const h = await storedHistory();
    expect(h.entries).toEqual([]);
    expect(h.removed).toContain(cid);
  });

  it('a live create that is not durable keeps the entry', async () => {
    const { r, cid } = await closedWork();
    failSeals(1, 2, 3, 4, 5);
    let res: unknown;
    await act(async () => { res = await r().closed.restore(cid); });
    await settle();
    expect(res).toEqual(BOARD_NOT_STORED);
    expect((await storedHistory()).entries.map((e) => e.cid)).toEqual([cid]);
  });

  it('core switches realm as the live-Board op starts, before the page renders it: nothing is made, the entry stays', async () => {
    const { r, cid } = await closedWork();
    const before = (await storedBoards()).boards.map((b) => b.id);
    inOp.realm = OTHER();
    let res: unknown;
    await act(async () => { res = await r().closed.restore(cid); });
    act(() => { setRealm(FIXTURE_REALM); });
    await settle();
    expect(res).toEqual(BOARD_NOT_STORED);
    expect((await storedBoards()).boards.map((b) => b.id)).toEqual(before);
    expect((await storedHistory()).entries.map((e) => e.cid)).toEqual([cid]);
  });

  it('a history removal that fails after the create leaves the Board made and the entry kept', async () => {
    const { r, cid } = await closedWork();
    failSeals(2, 3, 4, 5);
    let res: { boardId: string; entryKept: boolean } | undefined;
    await act(async () => { res = (await r().closed.restore(cid)) as typeof res; });
    await settle();
    expect(res!.entryKept).toBe(true);
    expect((await storedBoards()).boards.map((b) => b.name)).toContain('Work');
    expect((await storedHistory()).entries.map((e) => e.cid)).toEqual([cid]);
  });
});

describe('Remove one, its Undo, Clear all', () => {
  it('putBack while the verification fence rises with the history lock held: nothing is written, the other entries stay', async () => {
    const { r, work, spare } = await tab();
    act(() => { r().api.apply(addTo(spare, 's')); });
    await settle();
    await act(async () => { await r().closed.close(work); });
    await settle();
    await act(async () => { await r().closed.close(spare); });
    await settle();
    // Two closes in the same few ms may store their entries in either order: the set is what is checked.
    expect(names(await storedHistory()).sort()).toEqual(['Spare', 'Work']);
    const cid = (await storedHistory()).entries.find((e) => e.board.name === 'Work')!.cid;
    let was: unknown;
    await act(async () => { was = await r().closed.remove(cid); });
    await settle();
    expect(names(await storedHistory())).toEqual(['Spare']);
    const res = await underFence(() => r().closed.putBack(was as Parameters<ReturnType<typeof r>['closed']['putBack']>[0]));
    expect(res).toEqual(NOT_STORED);
    expect(names(await storedHistory())).toEqual(['Spare']);
  });

  it('remove answers the entry; putBack adds it again under a fresh cid; clear removes only the cids given', async () => {
    const { r, work, spare } = await tab();
    act(() => { r().api.apply((s, held) => onActive({ ...s, active: spare }, (b, taken) => { const x = addTile(b, web('s'), rand, taken); return isRefusal(x) ? x : x.board; }, held)); });
    await settle();
    await act(async () => { await r().closed.close(work); });
    await settle();
    const [first] = (await storedHistory()).entries;
    let gone: unknown;
    await act(async () => { gone = await r().closed.remove(first!.cid); });
    await settle();
    expect(gone).toMatchObject({ cid: first!.cid, board: { name: 'Work' } });
    expect((await storedHistory()).entries).toEqual([]);
    let back: { cid: string } | undefined;
    await act(async () => { back = (await r().closed.putBack(first!)) as typeof back; });
    await settle();
    expect(back!.cid).not.toBe(first!.cid);
    expect((await storedHistory()).entries.map((e) => e.cid)).toEqual([back!.cid]);
    const shown = [back!.cid];
    await act(async () => { await r().closed.close(spare); }); // closed after the dialog asked
    await settle();
    await act(async () => { await r().closed.clear(shown); });
    await settle();
    expect((await storedHistory()).entries.map((e) => e.board.name)).toEqual(['Spare']);
  });
});

describe('kept like hub_boards_v1 (sign-out and realm switch)', () => {
  it('the same registry row and account-pref options as hub_boards_v1', () => {
    const { key: _a, ...closed } = registryEntry('local', BOARDS_HISTORY_KEY) as { key: string };
    const { key: _b, ...boards } = registryEntry('local', BOARDS_KEY) as { key: string };
    expect(closed).toEqual(boards);
    expect(ACCOUNT_PREF_KEYS[BOARDS_HISTORY_KEY]).toEqual(ACCOUNT_PREF_KEYS[BOARDS_KEY]);
  });

  it('per realm; kept across sign-out and back at sign-in; another account sees none', async () => {
    const OTHER_REALM = fixtureWorld.realms.map((x) => x.id).find((id) => id !== FIXTURE_REALM) as string;
    const { r, work, hook } = await tab();
    await act(async () => { await r().closed.close(work); });
    await settle();
    expect(r().closed.entries.map((e) => e.board.name)).toEqual(['Work']);
    act(() => { setRealm(OTHER_REALM); });
    expect(r().closed.entries).toEqual([]);
    act(() => { setRealm(FIXTURE_REALM); });
    expect(r().closed.entries.map((e) => e.board.name)).toEqual(['Work']);
    act(() => { setIdentity(null); });
    await settle();
    act(() => { setIdentity({ id: fixtureWorld.account.id, banned: false }); });
    await settle();
    expect((await storedHistory()).entries.map((e) => e.board.name)).toEqual(['Work']);
    expect(r().closed.entries.map((e) => e.board.name)).toEqual(['Work']);
    act(() => { setIdentity({ id: 'someoneelse01', banned: false }); });
    await settle();
    expect(r().closed.entries).toEqual([]);
    expect((await storedHistory()).entries).toEqual([]);
    hook.unmount();
  });
});

describe('HISTORY RULE: only core\'s stored value is read (a prefs page copy)', () => {
  /** Boards Work, Spare, Third, Fourth (a tile each); Work and Spare closed: stored [Spare, Work]. Then this tab's close
   *  of Third outlives STORE_WAIT_MS, another tab stores first (its late write loses: 'conflict'), and another tab
   *  stores again: [Spare, Work], not yet opened here. */
  async function lingeringConflict() {
    const hook = renderHook(() => { const api = useBoards(); return { api, closed: useClosedBoards(api) }; });
    await settle();
    const r = () => hook.result.current;
    act(() => { r().api.apply((s) => must(createBoard(must(renameBoard(s, s.boards[0]!.id, 'Work')), rand, 'Spare'))); });
    await settle();
    act(() => { r().api.apply((s) => must(createBoard(s, rand, 'Third'))); });
    await settle();
    act(() => { r().api.apply((s) => must(createBoard(s, rand, 'Fourth'))); });
    await settle();
    const ids = Object.fromEntries(r().api.state.boards.map((b) => [b.name, b.id])) as Record<string, string>;
    for (const nm of ['Work', 'Spare', 'Third', 'Fourth']) { act(() => { r().api.apply(addTo(ids[nm]!, nm)); }); await settle(); }
    await act(async () => { await r().closed.close(ids.Work!); });
    await settle();
    // eslint-disable-next-line no-restricted-globals -- another tab's stored bytes: what it writes under the key
    const d1 = localStorage.getItem(BOARDS_HISTORY_KEY)!;
    await act(async () => { await r().closed.close(ids.Spare!); });
    await settle();
    // eslint-disable-next-line no-restricted-globals -- another tab's stored bytes: what it writes under the key
    const d2 = localStorage.getItem(BOARDS_HISTORY_KEY)!;
    expect(names(await storedHistory()).sort()).toEqual(['Spare', 'Work']);
    const hold = holdSeal();
    let p3!: Promise<unknown>;
    act(() => { p3 = r().closed.close(ids.Third!); });
    await hold.sealing();
    await act(() => vi.advanceTimersByTimeAsync(10_050));
    expect(await p3).toEqual(NOT_STORED);
    // eslint-disable-next-line no-restricted-globals -- another tab's stored bytes: what it writes under the key
    localStorage.setItem(BOARDS_HISTORY_KEY, d1);
    hold.release();
    await settle();
    const hp = accountPref<unknown>(BOARDS_HISTORY_KEY, (v) => v, { scope: 'account+realm', keepAtSignOut: true });
    expect(hp.status(FIXTURE_REALM)).toBe('conflict');
    // eslint-disable-next-line no-restricted-globals -- another tab's stored bytes: what it writes under the key
    localStorage.setItem(BOARDS_HISTORY_KEY, d2);
    return { hook, r, ids, hp };
  }
  const liveNames = async () => (await storedBoards()).boards.map((b) => b.name).sort();

  it('conflict -> a refused set -> the next close answers NOT_STORED and the stored history stays whole', async () => {
    const { hook, r, ids, hp } = await lingeringConflict();
    let res: unknown;
    await act(async () => { res = await r().closed.close(ids.Fourth!); });
    await settle();
    expect(res).toEqual(NOT_STORED); // the stale read made a write core refused: it left a page copy
    expect(hp.pageCopy(FIXTURE_REALM)).toBe(true);
    expect(names(await storedHistory()).sort()).toEqual(['Spare', 'Work']);
    expect(await liveNames()).toEqual(['Fourth', 'Third']);
    hook.unmount();
  });

  it('a page copy refuses every later history write, even with core reading \'ok\': nothing stored is replaced', async () => {
    const { hook, r, ids, hp } = await lingeringConflict();
    await act(async () => { await r().closed.close(ids.Fourth!); });
    await settle();
    expect(hp.status(FIXTURE_REALM)).toBe('ok');
    expect(hp.pageCopy(FIXTURE_REALM)).toBe(true);
    const third = r().api.state.boards.find((b) => b.name === 'Third')!.id;
    let res: unknown;
    await act(async () => { res = await r().closed.close(third); });
    await settle();
    expect(res).toEqual(NOT_STORED);
    expect(names(await storedHistory()).sort()).toEqual(['Spare', 'Work']); // Spare was once lost here
    expect(await liveNames()).toEqual(['Fourth', 'Third']);
    const spare = (await storedHistory()).entries.find((e) => e.board.name === 'Spare')!.cid;
    await act(async () => { res = await r().closed.remove(spare); });
    expect(res).toHaveProperty('refused'); // refused whatever the reason: the page copy is never written
    expect(names(await storedHistory()).sort()).toEqual(['Spare', 'Work']);
    hook.unmount();
  });
});
