// Closed Boards: a realm's closed Boards, kept apart from the live Boards in
// hub_boards_closed_v1 (one value per account and realm, as hub_boards_v1). Pure: fail closed, never throws.
//
// Contract, in plain words:
//   - An entry is a closed Board as it was (its whole config: name, layout, tiles, mode) with its occurrence id `cid` and
//     the time it was closed. Only a Board with a tile is ever an entry: an empty one is not kept, so an entry read
//     without one is dropped.
//   - At most CLOSED_MAX entries and CLOSED_BYTES_MAX bytes of stored JSON (the encrypted store's VALUE_MAX): the newest
//     stay (closedAt, then cid), the oldest go. Every entry that goes, removed by the person or evicted, is remembered by
//     cid in `removed` (the newest CLOSED_REMOVED_MAX): a tab that still holds it never brings it back when the two merge
//     later. Past that many, an old entry can come back (an accepted residue).
//   - normalize(h, mustKeep): the one place the caps apply. mustKeep (the entry this tab just closed) is never the one
//     evicted; when it alone is over the byte cap the answer is HISTORY_FULL and nothing changes (the close is refused).
//     Keeping it is this tab's own rule: a merge of two tabs keeps the newest, whatever was just closed.
//   - merge(a, b): the union by cid, minus every cid either side removed (all of them, before `removed` is cut to its
//     newest CLOSED_REMOVED_MAX); the caps applied again.
//   - A value is never over CLOSED_BYTES_MAX: when only the kept entry is left and the value is still too big (with the
//     removed list), normalize answers HISTORY_FULL.
import { utf8Bytes } from '@core/pure';
import { filledCount, newId, type Board, type Rand } from './boards';
import { parseStoredBoard, wireBoard } from './persist';

export const CLOSED_MAX = 10;
export const CLOSED_REMOVED_MAX = 256;
/** The encrypted store's VALUE_MAX (core/cryptStore.ts; history.test pins them equal): a larger value is never stored. */
export const CLOSED_BYTES_MAX = 48_000;
export const CID = /^c[a-z0-9]{4,16}$/;

export interface ClosedBoard { readonly cid: string; readonly closedAt: number; readonly board: Board }
export interface ClosedHistory { readonly v: 1; readonly entries: readonly ClosedBoard[]; readonly removed: readonly string[] }
export const HISTORY_FULL = { refused: 'HISTORY_FULL' } as const;
export type HistoryFull = typeof HISTORY_FULL;
const isFull = (x: ClosedHistory | HistoryFull): x is HistoryFull => 'refused' in x;

export const emptyHistory = (): ClosedHistory => ({ v: 1, entries: [], removed: [] });

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const newestFirst = (x: ClosedBoard, y: ClosedBoard): number => y.closedAt - x.closedAt || (x.cid < y.cid ? -1 : x.cid > y.cid ? 1 : 0);
/** The newest CLOSED_REMOVED_MAX of `ids`, each once, in the order first given (oldest first). */
const capRemoved = (ids: Iterable<string>): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) if (!seen.has(id)) { seen.add(id); out.push(id); }
  return out.slice(-CLOSED_REMOVED_MAX);
};

/** The value written to storage. */
export function toStoredHistory(h: ClosedHistory): ClosedHistory {
  return { v: 1, entries: h.entries.map((e) => ({ cid: e.cid, closedAt: e.closedAt, board: wireBoard(e.board) })), removed: [...h.removed] };
}
export const historyBytes = (h: ClosedHistory): number => utf8Bytes(JSON.stringify(toStoredHistory(h)));

/** What is stored, read: anything that is not an entry (bad cid, time or Board, an empty Board, a second copy of a
 *  cid) is dropped, and the caps applied. Nothing usable reads as the empty history. */
export function parseClosedHistory(raw: unknown): ClosedHistory {
  if (!isObj(raw) || raw.v !== 1) return emptyHistory();
  const removed = capRemoved(Array.isArray(raw.removed) ? raw.removed.filter((x): x is string => typeof x === 'string' && CID.test(x)) : []);
  const entries: ClosedBoard[] = [];
  const cids = new Set<string>();
  for (const e of Array.isArray(raw.entries) ? raw.entries : []) {
    if (!isObj(e) || typeof e.cid !== 'string' || !CID.test(e.cid) || cids.has(e.cid)) continue;
    if (typeof e.closedAt !== 'number' || !Number.isSafeInteger(e.closedAt) || e.closedAt < 0) continue;
    const board = parseStoredBoard(e.board);
    if (!board) continue;
    cids.add(e.cid);
    entries.push({ cid: e.cid, closedAt: e.closedAt, board });
  }
  const h = normalizeClosedHistory({ v: 1, entries, removed });
  return isFull(h) ? emptyHistory() : h;
}

/** The caps (see the contract). */
export function normalizeClosedHistory(h: ClosedHistory, mustKeepCid?: string): ClosedHistory | HistoryFull {
  const gone = new Set(h.removed);
  const evicted: string[] = [];
  let entries = h.entries.filter((e) => {
    if (gone.has(e.cid)) return false;
    if (filledCount(e.board) === 0) { evicted.push(e.cid); return false; }
    return true;
  }).sort(newestFirst);
  const keep = mustKeepCid !== undefined ? entries.find((e) => e.cid === mustKeepCid) : undefined;
  if (keep && historyBytes({ v: 1, entries: [keep], removed: [] }) > CLOSED_BYTES_MAX) return HISTORY_FULL;
  const out = (): ClosedHistory => ({ v: 1, entries, removed: capRemoved([...h.removed, ...evicted]) });
  // The oldest that may go goes first; the kept one never.
  const evictOne = (): boolean => {
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i] as ClosedBoard;
      if (e.cid === mustKeepCid) continue;
      evicted.push(e.cid);
      entries = entries.filter((_, j) => j !== i);
      return true;
    }
    return false;
  };
  while (entries.length > CLOSED_MAX && evictOne());
  while (historyBytes(out()) > CLOSED_BYTES_MAX && evictOne());
  // Only the kept entry is left and the value (its removed list included) is still too big: refused, never returned.
  const done = out();
  return historyBytes(done) > CLOSED_BYTES_MAX ? HISTORY_FULL : done;
}

/** Two tabs' histories as one (see the contract). */
export function mergeClosedHistory(a: ClosedHistory, b: ClosedHistory): ClosedHistory {
  // Every cid either side removed is applied before the list is cut to the newest CLOSED_REMOVED_MAX (normalize).
  const all = [...a.removed, ...b.removed];
  const gone = new Set(all);
  const removed = capRemoved(all);
  const byCid = new Map<string, ClosedBoard>();
  for (const e of [...a.entries, ...b.entries]) if (!gone.has(e.cid) && !byCid.has(e.cid)) byCid.set(e.cid, e);
  const h = normalizeClosedHistory({ v: 1, entries: [...byCid.values()], removed });
  return isFull(h) ? { v: 1, entries: [], removed } : h; // without mustKeep there is no refusal
}

/** A fresh occurrence id, distinct from every entry's and every removed one's. */
export function newCid(h: ClosedHistory, rand: Rand): string {
  return newId('c', rand, [...h.entries.map((e) => e.cid), ...h.removed]);
}

/** `board` closed now as entry `cid`, kept by this tab (mustKeep). An empty Board is no entry: h unchanged. */
export function addClosed(h: ClosedHistory, cid: string, board: Board, closedAt: number): ClosedHistory | HistoryFull {
  if (filledCount(board) === 0) return h;
  return normalizeClosedHistory({ ...h, entries: [...h.entries.filter((e) => e.cid !== cid), { cid, closedAt: Math.max(0, Math.trunc(closedAt)), board }] }, cid);
}

/** h without the entries `cids` (Restore, Remove one, Clear all), each remembered as removed. */
export function removeClosed(h: ClosedHistory, cids: Iterable<string>): ClosedHistory {
  const ids = [...cids];
  const drop = new Set(ids);
  const n = normalizeClosedHistory({ v: 1, entries: h.entries.filter((e) => !drop.has(e.cid)), removed: capRemoved([...h.removed, ...ids]) });
  return isFull(n) ? h : n;
}

export const closedEntry = (h: ClosedHistory, cid: string): ClosedBoard | undefined => h.entries.find((e) => e.cid === cid);
