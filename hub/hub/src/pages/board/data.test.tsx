// useBoards: per account and realm, writes at once, sign-out survival, account switch, two tabs merged by Board id,
// corrupt and refused storage. Over core's fixture session (Ada), the real accountPref and its encrypted store
// (memory vault): values are read and planted through core's crypt test seams, as hub-crypt's own tests do.
/* eslint-disable no-restricted-globals -- these tests play another browser tab writing hub_boards_v1 raw (other
   layouts, other accounts) and a browser refusing writes; the page reaches storage only through core */
import { bootFixtureCore, fixtureWorld, FIXTURE_REALM } from '@core';
import { setIdentity, setRealm } from '@core/ctx';
import { resetPrefs } from '@core/prefs';
import { memoryVault } from '@core/crypt/memory-vault';
import { newBaseKey, newKeyId } from '@core/crypt/envelope';
import { cryptIdleForTests, cryptReady, forgetThisBrowser, onCryptForget, resetCryptForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARDS_KEY, OTHER_TAB_NOTICE_MS, resetBoardsForTests, useBoards } from './data';
import { addTile, createBoard, deleteBoard, isRefusal, onActive, renameBoard, setActiveBoard, type RealmBoards, type TileRef } from './model/boards';

const UID = fixtureWorld.account.id;
const B = 'someoneelse01';
const OTHER_REALM = fixtureWorld.realms.map((r) => r.id).find((id) => id !== FIXTURE_REALM) as string;
const tile: TileRef = { project: 'p1', computer: 'c1', program: 'terminal', session: 2 };
type StoredRealm = RealmBoards & { unreadable?: { at: number; raw: string } };

/** Every background seal, store and open finished (inside act: the hook's renders settle too). */
const settle = () => act(() => cryptIdleForTests());
/** The shown account's stored value for a realm, opened (null: nothing stored, or it does not open). */
const mine = async (realm = FIXTURE_REALM) => (await storedForTests(BOARDS_KEY, realm)) as StoredRealm | null;
/** The raw stored document (sealed leaves): which accounts and parts exist, never their values. */
function rawDoc(): Record<string, Record<string, unknown>> {
  const raw = localStorage.getItem(BOARDS_KEY);
  return raw ? (JSON.parse(raw) as { a: Record<string, Record<string, unknown>> }).a : {};
}
const named = (name: string) => (s: RealmBoards) => renameBoard(s, s.active, name);
/** Another tab stores this realm's value (sealed, as its own store would), optionally announcing it. */
async function otherTab(f: (s: RealmBoards) => RealmBoards, announce = true) {
  await act(async () => {
    const now = (await mine()) as RealmBoards;
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, f(now));
    if (announce) window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
}
/** Another tab stores exactly `value` (an older copy, or one this Hub cannot read). */
async function otherTabStores(value: unknown) {
  await act(async () => {
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, value);
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
}
const must = (x: RealmBoards | { refused: string }): RealmBoards => { if (isRefusal(x)) throw new Error('refused'); return x as RealmBoards; };

// Timers advance by themselves (the store's background work runs on them); OTHER_TAB_NOTICE_MS is skipped ahead.
beforeEach(async () => { vi.useFakeTimers({ shouldAdvanceTime: true }); bootFixtureCore({ rules: [] }); await settle(); });
afterEach(() => { vi.useRealTimers(); });

describe('useBoards: storage', () => {
  it('starts with one empty Board and writes nothing until a change', async () => {
    const { result } = renderHook(() => useBoards());
    await settle();
    expect(result.current.ready).toBe(true);
    expect(result.current.state.boards).toHaveLength(1);
    expect(result.current.notice).toBeNull();
    expect(localStorage.getItem(BOARDS_KEY)).toBeNull();
  });
  it('writes every change at once, under this account and realm, sealed', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('A')); });
    await settle();
    expect((await mine())?.boards[0]?.name).toBe('A');
    expect(localStorage.getItem(BOARDS_KEY)).not.toContain('"A"');
    act(() => { result.current.apply(named('AB')); });
    await settle();
    expect((await mine())?.boards[0]?.name).toBe('AB');
  });
  it('a refusal changes nothing and is answered', () => {
    const { result } = renderHook(() => useBoards());
    let r: unknown;
    act(() => { for (let i = 0; i < 8; i++) result.current.apply((s) => createBoard(s, Math.random)); r = result.current.apply((s) => createBoard(s, Math.random)); });
    expect(r).toEqual({ refused: 'BOARDS_FULL' });
    expect(result.current.state.boards).toHaveLength(9);
  });
  it('each realm, and All, has its own Boards', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('Mine')); });
    act(() => { setRealm(OTHER_REALM); });
    expect(result.current.realm).toBe(OTHER_REALM);
    expect(result.current.state.boards[0]?.name).toBe('');
    act(() => { result.current.apply(named('Other')); });
    await settle();
    expect((await mine(OTHER_REALM))?.boards[0]?.name).toBe('Other');
    act(() => { setRealm('all'); });
    expect(result.current.state.boards[0]?.name).toBe('');
    act(() => { setRealm(FIXTURE_REALM); });
    expect(result.current.state.boards[0]?.name).toBe('Mine');
  });
  it('a reload restores the Boards, tiles included', async () => {
    const first = renderHook(() => useBoards());
    act(() => { first.result.current.apply((s) => onActive(s, (b) => { const r = addTile(b, tile, Math.random); return isRefusal(r) ? r : r.board; })); });
    await settle();
    first.unmount();
    const second = renderHook(() => useBoards());
    const b = second.result.current.state.boards[0];
    expect(b && b.tiles[b.active]).toEqual({ ...tile, tid: expect.stringMatching(/^t[a-z0-9]{4,24}$/) });
  });
  it('a corrupt record starts fresh with the reset notice', async () => {
    await act(() => writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, { v: 1, boards: 'nope' }));
    const { result } = renderHook(() => useBoards());
    await settle();
    expect(result.current.notice).toEqual({ kind: 'reset' });
    expect(result.current.state.boards).toHaveLength(1);
    act(() => { result.current.dismissNotice(); });
    expect(result.current.notice).toBeNull();
  });
  it('the first save over a corrupt record keeps its raw text beside the fresh Board', async () => {
    await act(() => writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, { v: 1, boards: 'nope', mark: 'old' }));
    const { result } = renderHook(() => useBoards());
    await settle();
    act(() => { result.current.apply(named('Fresh')); });
    await settle();
    expect((await mine())?.boards[0]?.name).toBe('Fresh');
    expect((await mine())?.unreadable?.raw).toContain('"mark":"old"');
    act(() => { result.current.apply(named('Fresher')); });
    await settle();
    expect((await mine())?.unreadable?.raw).toContain('"mark":"old"');
  });
  it('a refused store (quota) keeps the change for this page and says unsaved, until a store succeeds', async () => {
    const { result } = renderHook(() => useBoards());
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    act(() => { result.current.apply(named('Full')); });
    await settle();
    spy.mockRestore();
    expect(result.current.notice).toEqual({ kind: 'unsaved' });
    expect(result.current.state.boards[0]?.name).toBe('Full');
    act(() => { result.current.apply(named('Room')); });
    expect(result.current.notice).toEqual({ kind: 'unsaved' }); // the next write is on its way, not stored yet
    await settle();
    expect(result.current.notice).toBeNull();
    expect((await mine())?.boards[0]?.name).toBe('Room');
  });
  it('while the account opens nothing is editable (ready false), and the saved Board shows once open', async () => {
    const v = memoryVault();
    resetCryptForTests(v);
    resetPrefs();
    resetBoardsForTests();
    await act(() => cryptReady());
    await settle();
    const first = renderHook(() => useBoards());
    act(() => { first.result.current.apply(named('Saved')); });
    await settle();
    first.unmount();
    // A new page: the account is still opening.
    resetCryptForTests(v);
    resetPrefs();
    resetBoardsForTests();
    const second = renderHook(() => useBoards());
    expect(second.result.current.ready).toBe(false);
    await act(() => cryptReady());
    await settle();
    expect(second.result.current.ready).toBe(true);
    expect(second.result.current.state.boards[0]?.name).toBe('Saved');
  });
});

describe('useBoards: accounts', () => {
  it('a change right before sign-out is kept, and comes back at sign-in', async () => {
    const { result, unmount } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('BeforeOut')); });
    act(() => { setIdentity(null); });
    unmount();
    await settle();
    act(() => { setIdentity({ id: UID, banned: false }); });
    await settle();
    expect((await mine())?.boards[0]?.name).toBe('BeforeOut');
    const back = renderHook(() => useBoards());
    expect(back.result.current.state.boards[0]?.name).toBe('BeforeOut');
  });
  it('another account on this browser sees none of them, and never gets them written', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('AdaOnly')); });
    await settle();
    const adaLeaf = JSON.stringify(rawDoc()[UID]);
    act(() => { setIdentity({ id: B, banned: false }); });
    await settle();
    expect(result.current.state.boards[0]?.name).toBe('');
    expect(result.current.undoLabel).toBeNull();
    // Undo after the switch has nothing of Ada's to put back, and writes nothing (C9).
    act(() => { result.current.undo(); });
    await settle();
    expect(rawDoc()[B]).toBeUndefined();
    act(() => { result.current.apply(named('Bs')); });
    await settle();
    expect((await mine())?.boards[0]?.name).toBe('Bs');
    expect(JSON.stringify(rawDoc()[UID])).toBe(adaLeaf);
  });
  it('an unmount after an account switch writes nothing to either account', async () => {
    const { result, unmount } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('AdaOnly2')); });
    await settle();
    const before = localStorage.getItem(BOARDS_KEY);
    act(() => { setIdentity({ id: B, banned: false }); });
    unmount();
    await settle();
    expect(rawDoc()[B]).toBeUndefined();
    expect(JSON.stringify(rawDoc()[UID])).toBe(JSON.stringify((JSON.parse(before as string) as { a: Record<string, unknown> }).a[UID]));
  });
});

describe('useBoards: undo', () => {
  it('undo is per Board: it puts back the active Board only, and names the change', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('one'), { record: 'rename one' }); });
    act(() => { result.current.apply(named('two'), { record: 'rename two' }); });
    act(() => { result.current.apply(named('three')); });
    expect(result.current.undoLabel).toBe('rename two');
    act(() => { result.current.apply((s) => createBoard(s, Math.random, 'Second')); });
    expect(result.current.undoLabel).toBeNull();
    const second = result.current.state.active;
    act(() => { result.current.apply((s) => setActiveBoard(s, s.boards[0]!.id)); });
    act(() => { result.current.undo(); });
    expect(result.current.state.boards[0]?.name).toBe('one');
    expect(result.current.state.boards.map((b) => b.id)).toContain(second);
    await settle();
    expect((await mine())?.boards[0]?.name).toBe('one');
    act(() => { result.current.undo(); });
    expect(result.current.state.boards[0]?.name).toBe('');
    expect(result.current.undoLabel).toBeNull();
  });
});

describe('useBoards: the tile ids seen this session reach every op (S-id: a new tile never gets one)', () => {
  it('apply, applyFresh and applyLocked hand op every tile id seen this session, a cleared one included', async () => {
    const { result } = renderHook(() => useBoards());
    await settle();
    act(() => { result.current.apply((s) => must(onActive(s, (b, taken) => { const x = addTile(b, tile, Math.random, taken); return isRefusal(x) ? x : x.board; })), { record: 'add' }); });
    const first = Object.values(result.current.state.boards[0]!.tiles).find(Boolean)?.tid as string;
    act(() => { result.current.apply((s) => must(onActive(s, (b) => ({ ...b, tiles: Object.fromEntries(Object.keys(b.tiles).map((k) => [k, null])) }))), { record: 'clear' }); });
    const seen: ReadonlySet<string>[] = [];
    act(() => { result.current.apply((s, held) => { seen.push(held); return s; }); });
    act(() => { result.current.applyFresh((s, held) => { seen.push(held); return s; }); });
    await act(async () => { await result.current.applyLocked((s, _r, held) => { seen.push(held); return s; }); });
    // Both steps undone: no Board and no step holds it, and it is still never given again this session.
    act(() => { result.current.undo(); });
    act(() => { result.current.undo(); });
    expect(result.current.undoLabel).toBeNull();
    act(() => { result.current.apply((s, held) => { seen.push(held); return s; }); });
    expect(seen.map((h) => h.has(first))).toEqual([true, true, true, true]);
  });
});

describe('useBoards: two tabs', () => {
  it('another tab\'s write is merged in; a held drag waits for release', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('Here')); });
    await settle();
    await otherTab(named('There') as (s: RealmBoards) => RealmBoards);
    expect(result.current.state.boards[0]?.name).toBe('There');
    act(() => { result.current.hold(true); });
    await otherTab(named('Later') as (s: RealmBoards) => RealmBoards);
    expect(result.current.state.boards[0]?.name).toBe('There');
    act(() => { result.current.hold(false); });
    expect(result.current.state.boards[0]?.name).toBe('Later');
  });
  // Under the encrypted store a write reaches this tab through its storage event (decrypted in the background):
  // an unannounced write is not merged.
  it('a Board added in another tab survives this tab\'s next write', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('Base')); });
    await settle();
    await otherTab((s) => must(createBoard(s, Math.random, 'FromB')));
    act(() => { result.current.apply(named('MyRename')); });
    await settle();
    expect((await mine())?.boards.map((b) => b.name)).toEqual(['MyRename', 'FromB']);
    expect(result.current.state.boards.map((b) => b.name)).toEqual(['MyRename', 'FromB']);
  });
  it('a Board added here survives another tab\'s write of an older value', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('Base')); });
    await settle();
    const older = (await mine()) as RealmBoards;
    act(() => { result.current.apply((s) => createBoard(s, Math.random, 'Mine')); });
    await settle();
    await otherTabStores(must(renameBoard(older, older.boards[0]!.id, 'Renamed there')));
    await settle();
    expect(result.current.state.boards.map((b) => b.name)).toEqual(['Renamed there', 'Mine']);
    expect((await mine())?.boards.map((b) => b.name)).toEqual(['Renamed there', 'Mine']);
  });
  it('the same Board changed in both: the other tab\'s wins, a quiet notice, and that Board\'s undo is dropped', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('Main')); });
    act(() => { result.current.apply(named('Main'), { record: 'layout' }); });
    await settle();
    const older = (await mine()) as RealmBoards;
    act(() => { result.current.apply(named('Here'), { record: 'rename' }); });
    await settle();
    expect(result.current.undoLabel).toBe('rename');
    await otherTabStores(must(renameBoard(older, older.boards[0]!.id, 'There')));
    expect(result.current.state.boards[0]?.name).toBe('There');
    expect(result.current.notice).toEqual({ kind: 'other', name: 'There' });
    expect(result.current.undoLabel).toBeNull();
    expect(result.current.undoStale).toBe(true);
    act(() => { vi.advanceTimersByTime(OTHER_TAB_NOTICE_MS); });
    expect(result.current.notice).toBeNull();
  });
  it('the open Board deleted in another tab: the first Board opens, with a notice', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply((s) => createBoard(s, Math.random, 'Debug')); });
    await settle();
    const debug = result.current.state.active;
    await otherTab((s) => must(deleteBoard(s, debug, Math.random)));
    expect(result.current.state.boards).toHaveLength(1);
    expect(result.current.state.active).toBe(result.current.state.boards[0]?.id);
    expect(result.current.notice).toEqual({ kind: 'deleted', name: 'Debug' });
  });
  it('another tab never switches this tab\'s active Board', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply((s) => createBoard(s, Math.random, 'B')); });
    await settle();
    const here = result.current.state.active;
    await otherTab((s) => ({ ...must(renameBoard(s, s.boards[0]!.id, 'Renamed there')), active: s.boards[0]!.id }));
    expect(result.current.state.boards[0]?.name).toBe('Renamed there');
    expect(result.current.state.active).toBe(here);
  });
});

describe('useBoards: no silent loss (core resets, locked values and caps)', () => {
  const doc = (a: Record<string, unknown>) => JSON.stringify({ v: 1, a });
  const announce = () => window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
  it('another Hub version\'s layout: a fresh Board, a notice, the bytes kept until this account\'s next change says it replaced them', async () => {
    const foreign = JSON.stringify({ x: 1, accounts: { [B]: 'theirs' } });
    localStorage.setItem(BOARDS_KEY, foreign);
    const { result } = renderHook(() => useBoards());
    await settle();
    expect(result.current.notice).toEqual({ kind: 'unreadable', reason: 'foreign' });
    expect(result.current.state.boards).toHaveLength(1);
    expect(localStorage.getItem(BOARDS_KEY)).toBe(foreign);
    act(() => { result.current.apply(named('Mine')); });
    await settle();
    expect(result.current.notice).toEqual({ kind: 'replaced' });
    expect((await mine())?.boards[0]?.name).toBe('Mine');
  });
  it('a layout saved by a newer Hub: notice newer; a change stays in this tab, the bytes stay, and the band says unsaved', async () => {
    const newer = JSON.stringify({ v: 2, accounts: { [B]: 'theirs' } });
    localStorage.setItem(BOARDS_KEY, newer);
    const { result } = renderHook(() => useBoards());
    await settle();
    expect(result.current.notice).toEqual({ kind: 'unreadable', reason: 'newer' });
    act(() => { result.current.apply(named('Mine')); });
    await settle();
    expect(result.current.state.boards[0]?.name).toBe('Mine');
    expect(localStorage.getItem(BOARDS_KEY)).toBe(newer);
    expect(result.current.notice).toEqual({ kind: 'unsaved' });
  });
  it('this account\'s malformed entry: notice malformed; the next change replaces only it, other accounts byte for byte', async () => {
    const theirs = { [FIXTURE_REALM]: { v: 1, iv: 'kept', ct: 'theirs', k: 1 } };
    localStorage.setItem(BOARDS_KEY, doc({ [B]: theirs, [UID]: 'garbage' }));
    const { result } = renderHook(() => useBoards());
    await settle();
    expect(result.current.notice).toEqual({ kind: 'unreadable', reason: 'malformed' });
    act(() => { result.current.apply(named('Mine')); });
    await settle();
    expect(rawDoc()[B]).toEqual(theirs);
    expect((await mine())?.boards[0]?.name).toBe('Mine');
    expect(result.current.notice).toEqual({ kind: 'unreadable', reason: 'malformed' });
  });
  it('a saved value that does not open on this browser (key forgotten): notice locked, nothing written over it', async () => {
    const first = renderHook(() => useBoards());
    act(() => { first.result.current.apply(named('Sealed')); });
    await settle();
    first.unmount();
    const sealed = localStorage.getItem(BOARDS_KEY);
    // Another key's envelope planted in this slot: it does not open here.
    const d = JSON.parse(sealed as string) as { a: Record<string, Record<string, Record<string, unknown>>> };
    const leaf = d.a[UID]![FIXTURE_REALM]!;
    d.a[UID]![FIXTURE_REALM] = { ...leaf, ct: String(leaf.ct).split('').reverse().join('') };
    const tampered = JSON.stringify(d);
    localStorage.setItem(BOARDS_KEY, tampered);
    act(() => { announce(); });
    await settle();
    const { result } = renderHook(() => useBoards());
    await settle();
    expect(result.current.notice).toEqual({ kind: 'unreadable', reason: 'locked' });
    expect(localStorage.getItem(BOARDS_KEY)).toBe(tampered);
  });
  it('another tab storing a layout this Hub cannot read: this tab keeps its Boards, writes nothing, and says so', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('Here')); });
    await settle();
    const foreign = JSON.stringify({ x: 1 });
    act(() => { localStorage.setItem(BOARDS_KEY, foreign); announce(); });
    await settle();
    expect(result.current.state.boards[0]?.name).toBe('Here');
    expect(result.current.notice).toEqual({ kind: 'unreadable', reason: 'foreign' });
    expect(localStorage.getItem(BOARDS_KEY)).toBe(foreign);
  });
  it('a write that evicts the least recently written other account says so', async () => {
    const others: Record<string, unknown> = {};
    for (let i = 0; i < 16; i++) others['acct' + String(i).padStart(2, '0')] = { [FIXTURE_REALM]: { v: 1, iv: 'x', ct: 'y', k: 1 } };
    localStorage.setItem(BOARDS_KEY, doc(others));
    const { result } = renderHook(() => useBoards());
    await settle();
    expect(result.current.notice).toBeNull();
    act(() => { result.current.apply(named('Mine')); });
    await settle();
    expect(result.current.notice).toEqual({ kind: 'evicted', accounts: 1, parts: 0 });
    expect(rawDoc().acct00).toBeUndefined();
    expect(rawDoc().acct01).toBeDefined();
    act(() => { result.current.apply(named('Again')); });
    await settle();
    // The notice stays until dismissed (a later clean write does not clear it).
    expect(result.current.notice).toEqual({ kind: 'evicted', accounts: 1, parts: 0 });
    act(() => { result.current.dismissNotice(); });
    expect(result.current.notice).toBeNull();
  });
  it('a write that evicts this account\'s least recently written realm says so', async () => {
    for (let i = 0; i < 64; i++) await act(() => writeSealedForTests(BOARDS_KEY, 'realm' + String(i).padStart(2, '0'), { v: 1 }));
    const { result } = renderHook(() => useBoards());
    await settle();
    act(() => { result.current.apply(named('Mine')); });
    await settle();
    expect(result.current.notice).toEqual({ kind: 'evicted', accounts: 0, parts: 1 });
    expect(rawDoc()[UID]?.realm00).toBeUndefined();
    expect((await mine())?.boards[0]?.name).toBe('Mine');
  });
});

describe('useBoards: an incoming reset is never written over', () => {
  it('another tab storing a value parse cannot read: notice reset, nothing written, raw text kept by the next change', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('Here')); });
    await settle();
    const bad = { v: 9, boards: 'newer schema', mark: 'theirs' };
    await otherTabStores(bad);
    expect(result.current.notice).toEqual({ kind: 'reset' });
    expect(result.current.state.boards[0]?.name).toBe('Here');
    expect(await mine()).toEqual(bad);
    act(() => { result.current.apply(named('Edited')); });
    await settle();
    expect((await mine())?.boards[0]?.name).toBe('Edited');
    expect((await mine())?.unreadable?.raw).toContain('"mark":"theirs"');
  });
});

describe('useBoards: Forget and edits another tab beat', () => {
  it('Forget on this browser: the Boards this tab holds go (state, undo), and the next change stores none of them', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('Secret'), { record: 'Rename' }); });
    await settle();
    expect(result.current.undoLabel).not.toBeNull();
    let ok = false;
    await act(async () => { ok = await forgetThisBrowser(); });
    expect(ok).toBe(true);
    await settle();
    expect(result.current.state.boards.map((b) => b.name)).toEqual(['']);
    expect(result.current.undoLabel).toBeNull();
    act(() => { result.current.apply(named('After')); });
    await settle();
    await settle();
    const now = await mine();
    expect(now?.boards.map((b) => b.name)).toEqual(['After']);
    expect(JSON.stringify(now)).not.toContain('Secret');
  });

  it('a change made right after Forget, before this tab re-rendered, stores none of the Boards it held', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('Secret'), { record: 'Rename' }); });
    await settle();
    const apply = result.current.apply;
    // Called as the Forget is announced, before React re-rendered: this tab still holds 'Secret'.
    const off = onCryptForget(() => { apply((s) => must(createBoard(s, Math.random))); });
    try {
      await act(async () => { expect(await forgetThisBrowser()).toBe(true); });
    } finally { off(); }
    await settle();
    await settle();
    expect(JSON.stringify((await mine()) ?? null)).not.toContain('Secret');
    expect(result.current.state.boards.map((b) => b.name)).toEqual(['']);
  });

  it('an edit another tab stored first is merged like any two-tab change: their Board wins with a notice, this tab\'s new Board is kept', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('Theirs')); });
    await settle();
    const theirs = localStorage.getItem(BOARDS_KEY) as string; // another tab's rename of the same Board
    act(() => { result.current.apply(named('Base')); });
    await settle();
    act(() => {
      result.current.apply((s) => must(createBoard(s, Math.random)));
      result.current.apply((s) => renameBoard(s, s.boards[0]!.id, 'MyRename'));
    });
    localStorage.setItem(BOARDS_KEY, theirs); // stored before this tab's writes take the lock
    await settle();
    await settle();
    expect(result.current.notice).toEqual({ kind: 'other', name: 'Theirs' });
    expect(result.current.state.boards.map((b) => b.name)).toEqual(['Theirs', '']);
    expect((await mine())?.boards.map((b) => b.name)).toEqual(['Theirs', '']);
  });
});

describe('useBoards: renames and rotated keys', () => {
  it('a rename released at once (the rename dialog) that another tab beat is merged with a notice, not lost', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('Theirs')); });
    await settle();
    const theirs = localStorage.getItem(BOARDS_KEY) as string;
    act(() => { result.current.apply(named('Base')); });
    await settle();
    act(() => {
      result.current.hold(true);
      result.current.apply(named('MyRename'));
      result.current.hold(false); // before the write is stored
    });
    localStorage.setItem(BOARDS_KEY, theirs); // another tab stored first
    await settle();
    await settle();
    expect(result.current.notice).toEqual({ kind: 'other', name: 'Theirs' });
    expect(result.current.state.boards.map((b) => b.name)).toEqual(['Theirs']);
  });

  it('Boards opened from an old copy whose key a rotation deleted are shown no more and never stored again', async () => {
    const v = memoryVault();
    resetCryptForTests(v);
    resetPrefs();
    resetBoardsForTests();
    await act(() => cryptReady());
    await settle();
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('Historical')); });
    await settle();
    const old = localStorage.getItem(BOARDS_KEY) as string;
    act(() => { result.current.apply(named('Current')); });
    await settle();
    // The old copy is put back while its key still exists: it opens here.
    await act(async () => {
      localStorage.setItem(BOARDS_KEY, old);
      window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY }));
      await cryptIdleForTests();
    });
    await settle();
    expect(result.current.state.boards.map((b) => b.name)).toEqual(['Historical']);
    // Another tab rotates: a new active key, every old one deleted, then the announcement.
    await act(async () => {
      const rec = await v.account(UID);
      const id = newKeyId();
      await v.putKey(UID, id, await newBaseKey());
      await v.putAccount({ ...(rec as NonNullable<typeof rec>), active: id });
      await v.deleteKeys(UID, id);
      const ch = new BroadcastChannel('hoody-hub-crypt');
      ch.postMessage({ type: 'rotate', uid: UID });
      ch.close();
      await new Promise((r) => setTimeout(r, 30));
      await cryptIdleForTests();
    });
    await settle();
    await settle();
    expect(JSON.stringify(result.current.state)).not.toContain('Historical');
    expect(result.current.notice).toEqual({ kind: 'unreadable', reason: 'locked' });
    expect(localStorage.getItem(BOARDS_KEY)).toBe(old); // nothing written under the new key
  });
});

describe('useBoards: a stored value that stops opening', () => {
  const announce = () => window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
  /** The stored copy replaced by a corrupted one (its ciphertext reversed, same key id) that cannot open, announced. */
  function lockStored() {
    const d = JSON.parse(localStorage.getItem(BOARDS_KEY) as string) as { a: Record<string, Record<string, Record<string, unknown>>> };
    const leaf = d.a[UID]![FIXTURE_REALM]!;
    d.a[UID]![FIXTURE_REALM] = { ...leaf, ct: String(leaf.ct).split('').reverse().join('') };
    localStorage.setItem(BOARDS_KEY, JSON.stringify(d));
    announce();
  }

  it('a change the browser refused, then another tab\'s write, then a save: both changes are kept, none lost silently', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('Base')); });
    await settle();
    const put = Storage.prototype.setItem;
    let refuse = true;
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (refuse) throw new DOMException('quota', 'QuotaExceededError');
      put.call(localStorage, k, v);
    });
    try {
      act(() => { result.current.apply(named('Mine')); }); // refused by the browser: 'unsaved'
      await settle();
      await settle();
      expect(result.current.notice).toEqual({ kind: 'unsaved' });
      refuse = false; // space again; another tab stores first, a new Board on the stored value (named Base)
      await otherTab((st) => must(named('Theirs')(must(createBoard(st, Math.random)))));
      await settle();
      await settle();
    } finally { spy.mockRestore(); }
    const names = (await mine())?.boards.map((b) => b.name) ?? [];
    expect(names).toEqual(['Mine', 'Theirs']); // this tab's rename and their Board, both kept
    expect(result.current.state.boards.map((b) => b.name)).toEqual(['Mine', 'Theirs']);
  });

  it('a value that stops opening while a rename or drag holds: working state, undo and base go at once, and the view is told (lockGen)', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('Secret')); });
    await settle();
    act(() => { result.current.apply(named('Secret2'), { record: 'rename' }); }); // an undo step holding 'Secret'
    await settle();
    const gen = result.current.lockGen;
    act(() => { result.current.hold(true); });
    await act(async () => { lockStored(); await cryptIdleForTests(); });
    await settle();
    expect(JSON.stringify(result.current.state)).not.toContain('Secret');
    expect(result.current.undoLabel).toBeNull();
    expect(result.current.notice).toEqual({ kind: 'unreadable', reason: 'locked' });
    expect(result.current.lockGen).toBe(gen + 1);
    const lockedBytes = localStorage.getItem(BOARDS_KEY);
    act(() => { result.current.hold(false); });
    await settle();
    expect(JSON.stringify(result.current.state)).not.toContain('Secret');
    expect(localStorage.getItem(BOARDS_KEY)).toBe(lockedBytes); // nothing written over it until a new change
  });

  it('a value that stopped opening and opens again clears the "cannot be opened" notice', async () => {
    const { result } = renderHook(() => useBoards());
    act(() => { result.current.apply(named('Back')); });
    await settle();
    const good = localStorage.getItem(BOARDS_KEY) as string;
    await act(async () => { lockStored(); await cryptIdleForTests(); });
    await settle();
    expect(result.current.notice).toEqual({ kind: 'unreadable', reason: 'locked' });
    await act(async () => { localStorage.setItem(BOARDS_KEY, good); announce(); await cryptIdleForTests(); });
    await settle();
    await settle();
    expect(result.current.state.boards.map((b) => b.name)).toEqual(['Back']);
    expect(result.current.notice).toBeNull();
  });
});
