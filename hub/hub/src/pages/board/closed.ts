// Closed Boards' data: close a Board into the realm's history, restore one, remove
// one (and put it back: Undo), clear the ones shown. The history is hub_boards_closed_v1 through core's accountPref
// (scope account+realm, kept at sign-out, as hub_boards_v1); model/history.ts holds its rules.
//
// Contract, in plain words:
//   - Every history write runs under the cross-tab lock hub_boards_closed:<account>:<realm>, once no write of this tab
//     is on its way: it reads what is stored, makes its change on that, stores, and waits for the store's answer. It is
//     durable only when the store answers 'ok'. Another tab stored first ('conflict'): read again and change again, at
//     most LOCK_ROUNDS more times. A page-only or refused write, an answer not seen within STORE_WAIT_MS, the write's
//     owner gone (sign-out, another account, a realm switch: core's alive()) or a Forget meanwhile: NOT_STORED. Nothing is
//     read or written unless core reads what is stored as it is ('ok' or 'conflict', no value reset): the verification
//     fence ('locked'), a value kept for a retry ('unsaved'), 'oversized' or a reset value would read as empty and the
//     write would replace every entry (NOT_STORED).
//   - Close: a Board with a tile is written to the history first (a fresh cid, kept by this tab's caps:
//     HISTORY_FULL when it alone is too big). Only once that write is durable is the Board deleted from the live
//     Boards (applyLocked with deleteBoard: its id goes to `gone`, the last Board too; its undo steps go), and only when
//     the Board is still as it was read (BOARD_CHANGED otherwise: a tile added, moved or closed meanwhile, or an edit
//     of this tab queued on it during the commit; the Board stays, and an entry written for it is an older copy). Both
//     writes belong to the scope the close began in (one owner and Forget generation): a switch between them deletes
//     nothing (checked again inside the live-Board lock, every round). A history write that is not durable deletes nothing (a write the browser refused, which core keeps and retries, may still be
//     stored later: the Board is then both live and closed, as below). A Board with no tile is never written: it is deleted at once. A delete
//     that fails after the history write leaves the Board both live and closed (never a loss).
//   - Restore: the entry's Board is made again in the live Boards first (applyLocked with importBoard: a fresh
//     Board id, never one a tombstone names, and fresh tile ids; BOARDS_FULL at nine), and only once that write is
//     durable (onEnd) is the entry removed from the history. Like close, it runs only in the scope it began in (checked
//     inside the live-Board lock too, every round: BOARD_NOT_STORED). A removal that then fails leaves the entry: restoring it
//     again makes a second Board.
//   - Remove one answers the entry removed; putBack (its Undo) adds it again under a fresh cid, closed now. Clear
//     removes only the cids given (the ones the dialog showed when it asked), never one closed meanwhile.
import { accountForgets, accountPref, prefsGeneration, alive, capture, useCore, useRealms, type AccountPref, type CryptRead } from '@core';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { LOCK_ROUNDS, STORE_WAIT_MS, type BoardsApi, type LockedRefusal } from './data';
import { deleteBoard, filledCount, importBoard, newId, type Board, type Refusal } from './model/boards';
import { wireBoard } from './model/persist';
import { HISTORY_FULL, addClosed, closedEntry, newCid, parseClosedHistory, removeClosed, toStoredHistory, type ClosedBoard, type ClosedHistory, type HistoryFull } from './model/history';
import { browserLocks } from './locks.web';

export const BOARDS_HISTORY_KEY = 'hub_boards_closed_v1';
/** A history write that is not durable (see the contract): nothing else was changed. */
export const NOT_STORED = { refused: 'NOT_STORED' } as const;
/** Close: the Board changed after it was read (or an edit of it waited on the commit): it was not deleted; an entry
 *  already written for it stays (an older copy, never a loss). */
export const BOARD_CHANGED = { refused: 'BOARD_CHANGED' } as const;
/** Restore: the Board's write was not confirmed durable; the entry stays in the history. */
export const BOARD_NOT_STORED = { refused: 'BOARD_NOT_STORED' } as const;
export type ClosedRefusal = Refusal | LockedRefusal | HistoryFull | typeof NOT_STORED | typeof BOARD_NOT_STORED | typeof BOARD_CHANGED;

/** A value with every object's keys in one order (arrays keep theirs): the same content reads the same however it was
 *  built (an options save re-appends a key; a parse builds them in its own order). */
const canon = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canon) : v !== null && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v;
/** The Board's content as Close archives it (name, layout, tiles with their ids, mode): what it compares at the delete.
 *  Compared as content, never as key order. */
export const sameContent = (a: Board, b: Board): boolean => {
  const c = (x: Board) => { const w = wireBoard(x); return JSON.stringify(canon([w.name, w.layout, w.tiles, w.mode ?? null])); };
  return c(a) === c(b);
};

// Made again for a new preference session (prefsGeneration), as data.ts's pref.
let prefOnce: { gen: number; pref: AccountPref<ClosedHistory> } | null = null;
const hpref = (): AccountPref<ClosedHistory> => {
  const gen = prefsGeneration();
  if (prefOnce?.gen !== gen) prefOnce = { gen, pref: accountPref<ClosedHistory>(BOARDS_HISTORY_KEY, parseClosedHistory, { scope: 'account+realm', keepAtSignOut: true }) };
  return prefOnce.pref;
};
/** Tests only: a new page (with core's resetPrefs). */
export function resetClosedForTests(): void { prefOnce = null; }

/** The change a history write makes on what is stored: the new history, HISTORY_FULL (nothing written), or null (nothing
 *  to change: answered 'ok' without a write). */
type Change = (h: ClosedHistory) => ClosedHistory | HistoryFull | null;

/** The scope one operation (close, restore, ...) belongs to, taken once when it starts: every phase of it, both keys'
 *  writes included, runs only while it is still the scope shown (core's alive() for the owner: sign-out, another
 *  account, a realm switch) and no Forget came since. */
interface OpScope { readonly acct: string | null; readonly realm: string; readonly owner: ReturnType<typeof capture>; readonly fg: number; readonly shown: () => readonly [string | null, string] }
const opScope = (shown: () => readonly [string | null, string]): OpScope => { const [acct, realm] = shown(); return { acct, realm, owner: capture(), fg: accountForgets(), shown }; };
/** Still the scope shown: the same account and realm on the page (a realm switch included), its owner alive, no Forget. */
const scopeLive = (s: OpScope): boolean => {
  const [a, r] = s.shown();
  const now = capture(); // core's own account and realm, at once (the page's refs follow only at its next render)
  return a === s.acct && r === s.realm && now.realm === s.owner.realm && now.account === s.owner.account && alive(s.owner) && accountForgets() === s.fg;
};

/** One history write under the lock (see the contract), for the operation's scope. */
async function writeHistory(scope: OpScope, change: Change): Promise<'ok' | HistoryFull | typeof NOT_STORED> {
  const { acct, realm } = scope;
  const locks = browserLocks();
  if (!acct || !locks || typeof locks.request !== 'function' || !scopeLive(scope)) return NOT_STORED;
  const live = () => scopeLive(scope);
  // HISTORY RULE: a write proceeds only when the value it reads IS core's stored value. So: core reads
  // it as stored ('ok', or 'conflict': another tab's value), core set no stored value aside (reset(): malformed,
  // oversized, foreign: it reads as empty), and prefs holds no page copy of it (pageCopy(): get() would read that copy
  // ahead of what core stores, and reset() answers null while it exists). Every other status is refused,
  // never listed out: 'locked' (core's verification fence: get() reads the default) and 'unsaved' (core answers it
  // before it checks the fence) included. 'conflict' stays: a stale read under it can only make a write core refuses
  // (its sealed leaf is not opened), which leaves a page copy, and every later write then answers NOT_STORED.
  const usable = () => {
    const st = hpref().status(realm);
    return (st === 'ok' || st === 'conflict') && hpref().reset(realm) === null && !hpref().pageCopy(realm);
  };
  const until = (done: (st: CryptRead) => boolean) => new Promise<CryptRead | null>((resolve) => {
    let over = false;
    const check = () => {
      if (over) return;
      const st = hpref().status(realm);
      if (done(st)) { over = true; off(); clearTimeout(timer); resolve(st); }
    };
    const off = hpref().subscribe(check);
    const timer = setTimeout(() => { if (!over) { over = true; off(); resolve(null); } }, STORE_WAIT_MS);
    check();
  });
  try {
    return await locks.request(`hub_boards_closed:${acct}:${realm}`, async () => {
      for (let round = 0; round <= LOCK_ROUNDS; round++) {
        if ((await until((st) => st !== 'saving' && st !== 'loading')) === null || !live() || !usable()) return NOT_STORED;
        const next = change(hpref().get(realm));
        if (next === null) return 'ok';
        if ('refused' in next) return next;
        const w = hpref().report(acct, toStoredHistory(next) as unknown as ClosedHistory, realm);
        if (w.result !== 'stored') return NOT_STORED;
        const end = await until((st) => st !== 'saving');
        if (!live()) return NOT_STORED;
        if (end === 'ok') return 'ok';
        if (end !== 'conflict') return NOT_STORED;
      }
      return NOT_STORED;
    });
  } catch {
    return NOT_STORED;
  }
}

export interface ClosedBoardsApi {
  /** The realm's closed Boards as core shows them, newest first. */
  readonly entries: readonly ClosedBoard[];
  /** Closes Board `boardId` (see the contract): its entry's cid (null for a Board with no tile), or why nothing closed. */
  close(boardId: string): Promise<{ readonly cid: string | null } | ClosedRefusal>;
  /** Restores entry `cid`: the new Board's id, and whether the entry stayed in the history (its removal not durable). */
  restore(cid: string): Promise<{ readonly boardId: string; readonly entryKept: boolean } | ClosedRefusal>;
  /** Removes entry `cid`: the entry as it was (for putBack), or why nothing changed. */
  remove(cid: string): Promise<ClosedBoard | ClosedRefusal>;
  /** Puts a removed entry back under a fresh cid, closed now (Remove one's Undo). */
  putBack(e: ClosedBoard): Promise<{ readonly cid: string } | ClosedRefusal>;
  /** Removes the entries `cids` only (Clear all: the ones shown). */
  clear(cids: readonly string[]): Promise<null | ClosedRefusal>;
}

const NONE: readonly ClosedBoard[] = Object.freeze([]);

export function useClosedBoards(api: BoardsApi): ClosedBoardsApi {
  const realm = useRealms().selected;
  const account = useCore().account;
  const h = useSyncExternalStore(hpref().subscribe, () => hpref().get(realm), () => hpref().get(realm));
  // Read when a write starts: a write belongs to the account and realm shown then.
  const acctRef = useRef(account);
  acctRef.current = account;
  const realmRef = useRef(realm);
  realmRef.current = realm;
  const apiRef = useRef(api);
  apiRef.current = api;
  const scopeNow = useCallback(() => opScope(() => [acctRef.current, realmRef.current] as const), []);
  const write = useCallback((change: Change) => writeHistory(scopeNow(), change), [scopeNow]);

  const close = useCallback(async (boardId: string) => {
    const scope = scopeNow();
    const api0 = apiRef.current;
    const b = api0.state.boards.find((x) => x.id === boardId);
    if (!b) return { refused: 'NOT_FOUND' } as const;
    let cid: string | null = null;
    if (filledCount(b) > 0) {
      const w = await writeHistory(scope, (now) => {
        // One cid for every round, unless what is stored by now holds it (then a new one).
        if (cid === null || closedEntry(now, cid) || now.removed.includes(cid)) cid = newCid(now, Math.random);
        return addClosed(now, cid, b, Date.now());
      });
      if (w !== 'ok') return w;
    }
    // The delete belongs to the same scope as the history write: a switch or Forget between them deletes nothing.
    if (!scopeLive(scope)) return NOT_STORED;
    // Only the Board as it was archived (or read empty) is deleted: one changed meanwhile (a tile added, moved or
    // closed, here or in another tab) is not, and an edit of this tab queued on it during the commit refuses it too
    // (untouched). Nothing is lost: the entry, if any, is an older copy and the Board stays.
    let changed = false;
    let ended = false;
    const r = await api0.applyLocked((st, rand) => {
      // Every round, before the delete: still the scope the close began in (core's own realm and account, at once: the
      // page's refs and applyLocked's own check follow a switch only at the next render).
      if (!scopeLive(scope)) { ended = true; return { refused: 'NOT_FOUND' } as const; }
      const now = st.boards.find((x) => x.id === boardId);
      if (now && !sameContent(now, b)) { changed = true; return { refused: 'NOT_FOUND' } as const; }
      return deleteBoard(st, boardId, rand);
    }, { clearUndoIds: () => [boardId], untouched: boardId });
    if (ended) return NOT_STORED;
    if (changed) return BOARD_CHANGED;
    return r ?? { cid };
  }, [scopeNow]);

  const restore = useCallback(async (cid: string) => {
    const scope = scopeNow();
    const api0 = apiRef.current;
    const e = closedEntry(hpref().get(scope.realm), cid);
    if (!e) return { refused: 'NOT_FOUND' } as const;
    let durable = false;
    let made = '';
    let ended = false;
    const r = await api0.applyLocked((st, rand, held, stored) => {
      // Every round, before the Board is made: still the scope the restore began in (as close's delete).
      if (!scopeLive(scope)) { ended = true; return { refused: 'NOT_FOUND' } as const; }
      // Never an id a tombstone names: the merge would take the restored Board for the deleted one.
      const id = newId('b', rand, [...st.boards.map((x) => x.id), ...(st.gone ?? []), ...(stored.gone ?? [])]);
      const next = importBoard(st, { ...e.board, id }, rand, held);
      if (!('refused' in next)) made = next.active;
      return next;
    }, { onEnd: (d) => { durable = d; } });
    if (ended) return BOARD_NOT_STORED;
    if (r) return r;
    if (!durable || !scopeLive(scope)) return BOARD_NOT_STORED;
    const w = await writeHistory(scope, (now) => (closedEntry(now, cid) ? removeClosed(now, [cid]) : null));
    return { boardId: made, entryKept: w !== 'ok' };
  }, [scopeNow]);

  const remove = useCallback(async (cid: string) => {
    let was: ClosedBoard | undefined;
    const w = await write((now) => { was = closedEntry(now, cid); return was ? removeClosed(now, [cid]) : null; });
    if (w !== 'ok') return w;
    return was ?? ({ refused: 'NOT_FOUND' } as const);
  }, [write]);

  const putBack = useCallback(async (e: ClosedBoard) => {
    let cid = '';
    const closedAt = Date.now();
    const w = await write((now) => {
      // One cid for every round, unless what is stored by now holds it.
      if (!cid || closedEntry(now, cid) || now.removed.includes(cid)) cid = newCid(now, Math.random);
      return addClosed(now, cid, e.board, closedAt);
    });
    return w === 'ok' ? { cid } : w;
  }, [write]);

  const clear = useCallback(async (cids: readonly string[]) => {
    const w = await write((now) => (cids.some((c) => closedEntry(now, c)) ? removeClosed(now, cids) : null));
    return w === 'ok' ? null : w;
  }, [write]);

  // Nobody signed in: none shown (the stored entries stay, kept at sign-out).
  return { entries: account === null ? NONE : h.entries, close, restore, remove, putBack, clear };
}

export { HISTORY_FULL };
