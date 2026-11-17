// Two tabs, one realm's Boards: a three-way merge by Board id. Pure.
//
// Contract, in plain words:
//   - merge(base, mine, theirs): base is the stored value this tab last saw, mine this tab's state, theirs the value
//     stored now. Nothing vanishes silently:
//       · a Board only one side changed takes that side; a Board both sides changed takes theirs (the last write
//         wins: theirs reached storage first) and is listed in `lost` (this tab's change gave way);
//       · a Board only one side has is kept, unless the other side deleted it (its id is in that side's `gone`) and
//         the side that has it did not change it since base: a Board another tab never saw never vanishes, and a
//         change outlives a delete;
//     Order: mine's when only this tab reordered, else theirs', with Boards new here appended in mine's order.
//   - The active Board stays mine's while it exists; if another tab deleted it, the first Board becomes active and
//     `deletedOpen` names the Board that went. Recents and the keep-loaded choice follow the side that changed them
//     (theirs on a tie).
//   - `changed` lists the Boards whose content here differs from mine's: their undo steps no longer apply.
//   - Never more than MAX_BOARDS: the load would drop the Boards past nine, a program board an
//     add stored among them. The Boards theirs has (stored) always stay. Mine's that it lacks give way, the last first:
//     first this tab's new Boards (not in base: never stored), named in `capped`; then, if still past nine, Boards
//     theirs no longer has that this tab kept because it changed them (a change outliving a delete): the delete
//     stands, named in `yielded`.
//   - One tile on one Board: a tile id found on two or more Boards after the merge (a move here and another
//     tab's write of the source, or the other way round) stays only on the Board with the newer change stamp (`at`); on
//     a tie, on a Board that did not hold it in base (the move's target), else the first in order. The other copies'
//     slots are closed (closeSlot), and those Boards count as changed (their undo steps go). Concurrent two-tab edits
//     can still leave no copy or an older one: accepted as a known limit.
import { GONE_MAX, MAX_BOARDS, closeSlot, findTileSlot, isRefusal, type Board, type RealmBoards } from './boards';
import { keepDropped, storedBoard, storedRecents } from './persist';

export interface Merged {
  readonly state: RealmBoards;
  readonly lost: readonly string[];
  readonly changed: readonly string[];
  readonly deletedOpen: string | null;
  /** Names of this tab's new Boards (never stored) dropped to stay within MAX_BOARDS (empty: none). */
  readonly capped: readonly string[];
  /** Names of Boards another tab no longer has, kept here for this tab's change, dropped to stay within MAX_BOARDS. */
  readonly yielded: readonly string[];
}

// Boards and recents are compared as stored (persist.ts storedBoard/storedRecents): what only lives in memory (a tile's
// dropped ids) is never a change; a Board both sides hold alike keeps the dropped ids either side read.
const text = (x: unknown): string => JSON.stringify(x ?? null);
const same = (a: Board | undefined, b: Board | undefined): boolean => text(a && storedBoard(a)) === text(b && storedBoard(b));
const byId = (s: RealmBoards): Map<string, Board> => new Map(s.boards.map((b) => [b.id, b]));
/** The order of the Boards all three sides have (a Board added or deleted is not a reorder). */
const order = (s: RealmBoards, common: ReadonlySet<string>): string => s.boards.map((b) => b.id).filter((id) => common.has(id)).join(',');

export function merge(base: RealmBoards, mine: RealmBoards, theirs: RealmBoards): Merged {
  const B = byId(base), M = byId(mine), T = byId(theirs);
  const lost: string[] = [];
  const pick = new Map<string, Board>();
  for (const id of new Set([...M.keys(), ...T.keys()])) {
    const b = B.get(id), m = M.get(id), t = T.get(id);
    if (m && t) {
      if (same(m, t)) pick.set(id, keepDropped(t, m));
      else if (same(m, b)) pick.set(id, t);
      else if (same(t, b)) pick.set(id, m);
      else { pick.set(id, t); lost.push(id); }
    } else if (m) {
      if (!theirs.gone?.includes(id) || !same(m, b)) pick.set(id, m);
    } else if (t) {
      if (!mine.gone?.includes(id) || !same(t, b)) pick.set(id, t);
    }
  }
  const common = new Set([...B.keys()].filter((id) => M.has(id) && T.has(id)));
  const mineFirst = order(mine, common) !== order(base, common) && order(theirs, common) === order(base, common);
  const [first, second] = mineFirst ? [mine, theirs] : [theirs, mine];
  const ids = [...first.boards.map((b) => b.id), ...second.boards.map((b) => b.id)].filter((id, i, a) => pick.has(id) && a.indexOf(id) === i);
  let boards = ids.map((id) => pick.get(id) as Board);
  const capped: string[] = [];
  const yielded: string[] = [];
  const cappedIds = new Set<string>();
  // First this tab's new Boards, then the ones it kept over a delete: the last first, each pass.
  for (const fresh of [true, false]) {
    for (let i = boards.length - 1; boards.length > MAX_BOARDS && i >= 0; i--) {
      const b = boards[i] as Board;
      if (T.has(b.id) || B.has(b.id) === fresh) continue;
      (fresh ? capped : yielded).unshift(b.name);
      if (fresh) cappedIds.add(b.id);
      pick.delete(b.id);
      boards = boards.filter((x) => x.id !== b.id);
    }
  }
  // A Board a copy was closed on is changed here even when it ends up equal to this tab's (its undo steps could put
  // the copy back while the kept Board still holds it).
  const undeduped = boards;
  boards = dedupeTids(base, boards);
  const deduped = new Set(boards.filter((b, i) => b !== undeduped[i]).map((b) => b.id));
  if (!boards.length) return { state: mine, lost: [], changed: [], deletedOpen: null, capped: [], yielded: [] };
  const keepActive = pick.has(mine.active);
  // A capped Board was this tab's own creation, not one another tab deleted: no 'deleted' notice for it (a yielded one
  // was deleted there: the notice says so).
  const gone = keepActive || cappedIds.has(mine.active) ? null : M.get(mine.active)?.name ?? '';
  const [mr, br, tr] = [mine, base, theirs].map((x) => text(storedRecents(x.recents)));
  const recents = mr !== br && tr === br ? mine.recents : theirs.recents;
  const keep = (mine.keep ?? false) !== (base.keep ?? false) && (theirs.keep ?? false) === (base.keep ?? false) ? mine.keep : theirs.keep;
  const changed = boards.filter((b) => deduped.has(b.id) || !same(b, M.get(b.id))).map((b) => b.id);
  const unreadable = mine.unreadable ?? theirs.unreadable;
  const tomb = [...new Set([...(theirs.gone ?? []), ...(mine.gone ?? [])])].filter((id) => !pick.has(id)).slice(-GONE_MAX);
  const state: RealmBoards = { v: 1, active: keepActive ? mine.active : (boards[0] as Board).id, boards, recents, ...(keep ? { keep: true as const } : {}), ...(tomb.length ? { gone: tomb } : {}), ...(unreadable ? { unreadable } : {}) };
  return { state, lost, changed, deletedOpen: gone, capped, yielded };
}

/** Keeps each tile id on one Board only (see the contract): the newest stamp, then a Board that lacked it in base, then
 *  the first. Boards no copy left keep their object (`changed` compares them as stored). */
export function dedupeTids(base: RealmBoards, boards: readonly Board[]): Board[] {
  const where = new Map<string, number[]>();
  boards.forEach((b, i) => {
    for (const t of Object.values(b.tiles)) if (t?.tid) where.set(t.tid, [...(where.get(t.tid) ?? []), i]);
  });
  const B = byId(base);
  const out = [...boards];
  for (const [tid, at] of where) {
    const on = [...new Set(at)];
    if (on.length < 2) continue;
    const fresh = (i: number): boolean => { const was = B.get((boards[i] as Board).id); return !was || findTileSlot(was, tid) === null; };
    const stamp = (i: number): number => (boards[i] as Board).at ?? 0;
    const keep = on.reduce((k, i) => (stamp(i) > stamp(k) || (stamp(i) === stamp(k) && fresh(i) && !fresh(k)) ? i : k));
    for (const i of on) {
      if (i === keep) continue;
      const slot = findTileSlot(out[i] as Board, tid);
      const next = slot === null ? null : closeSlot(out[i] as Board, slot);
      if (next && !isRefusal(next)) out[i] = next;
    }
  }
  return out;
}
