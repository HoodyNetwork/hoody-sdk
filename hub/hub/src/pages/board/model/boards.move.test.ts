// Vitest, S-move: moving one tile to another Board keeps the tile object and
// its id, refuses a capture that no longer holds (the tile closed, replaced or moved off its Board, the target gone),
// refuses a full target or a tenth Board before anything changes, and the two-tab merge keeps a tile found on two Boards
// on one only (dedupeTids: the newer stamp, then the move's target).
// Conservation is checked as (tile id, payload) pairs over the whole realm, never by counts.
import { describe, expect, it } from 'vitest';
import {
  addTile, closeSlot, createBoard, deleteBoard, findTileSlot, freshRealm, isRefusal, moveTileToBoard, nextStamp, setTile, swapSlots,
  MAX_BOARDS, MAX_SLOTS, type Board, type RealmBoards, type Refusal, type Tile, type TileRef,
} from './boards';
import { dedupeTids, merge } from './merge';
import { parseRealmBoards, toStored } from './persist';

let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
const NOW = 1_800_000_000_000;
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
const term = (session: number, computer = 'c1'): TileRef => ({ project: 'p1', computer, program: 'terminal', session });
const web = (path: string): Tile => ({ url: 'https://docs.example/' + path });
const payload = (t: Tile): string => { const { tid: _tid, ...rest } = t; return JSON.stringify(rest); };
/** Every (board, tid, payload) of the realm, sorted: what a move must conserve except for the board. */
const pairs = (s: RealmBoards): string[] => s.boards.flatMap((b) => Object.values(b.tiles).filter((t): t is Tile => !!t).map((t) => `${t.tid}=${payload(t)}`)).sort();
const where = (s: RealmBoards, tid: string): string[] => s.boards.filter((b) => findTileSlot(b, tid) !== null).map((b) => b.id);
function boardWith(...tiles: Tile[]): Board {
  let b = freshRealm(rand).boards[0] as Board;
  for (const t of tiles) b = must(addTile(b, t, rand)).board;
  return b;
}
const realmOf = (...boards: Board[]): RealmBoards => ({ v: 1, active: (boards[0] as Board).id, boards, recents: [] });
const tidAt = (b: Board, i = 0): string => (Object.values(b.tiles).filter((t): t is Tile => !!t)[i] as Tile).tid as string;
const roundTrip = (s: RealmBoards): RealmBoards => parseRealmBoards(JSON.parse(JSON.stringify(toStored(s)))).state;

describe('moveTileToBoard: one tile, the same object, to another Board', () => {
  it('to an existing Board: the tile and its id leave the source and land on the target; the realm keeps every pair', () => {
    const S = boardWith(term(1), web('a')), T = boardWith(term(2));
    const s = realmOf(S, T);
    const tid = tidAt(S, 0);
    const r = must(moveTileToBoard(s, { tid, fromBoardId: S.id, target: { kind: 'board', toBoardId: T.id } }, rand, NOW));
    expect(pairs(r.state)).toEqual(pairs(s));
    expect(where(r.state, tid)).toEqual([T.id]);
    expect(r.toBoardId).toBe(T.id);
    const to = r.state.boards.find((b) => b.id === T.id) as Board;
    expect(to.tiles[r.toSlot]).toEqual(S.tiles[findTileSlot(S, tid) as string]);
    expect(to.active).toBe(r.toSlot);
    expect(r.state.active).toBe(T.id);
    // Both Boards are stamped later than either was (the merge's tie-break is the newer one).
    const from = r.state.boards.find((b) => b.id === S.id) as Board;
    expect(from.at).toBe(NOW);
    expect(to.at).toBe(NOW);
  });

  it('to a new Board: named as asked, after the others, active; the source left empty stays open', () => {
    const S = boardWith(term(1));
    const s = realmOf(S, boardWith());
    const tid = tidAt(S);
    const r = must(moveTileToBoard(s, { tid, fromBoardId: S.id, target: { kind: 'new', name: '  terminal-1  ' } }, rand, NOW));
    expect(r.state.boards).toHaveLength(3);
    const made = r.state.boards[2] as Board;
    expect(made.id).toBe(r.toBoardId);
    expect(made.name).toBe('terminal-1');
    expect(where(r.state, tid)).toEqual([made.id]);
    expect(r.state.boards.some((b) => b.id === S.id)).toBe(true);
    expect(pairs(r.state)).toEqual(pairs(s));
    expect(new Set(r.state.boards.map((b) => b.id)).size).toBe(3);
  });

  it('a program tile goes first in recents (as a pick does); a web tile leaves them alone', () => {
    const S = boardWith(term(7), web('a'));
    const s = realmOf(S, boardWith());
    const T = s.boards[1] as Board;
    const r1 = must(moveTileToBoard(s, { tid: tidAt(S, 0), fromBoardId: S.id, target: { kind: 'board', toBoardId: T.id } }, rand, NOW));
    expect(r1.state.recents[0]).toEqual(term(7));
    const r2 = must(moveTileToBoard(s, { tid: tidAt(S, 1), fromBoardId: S.id, target: { kind: 'board', toBoardId: T.id } }, rand, NOW));
    expect(r2.state.recents).toEqual([]);
  });

  it('Move back puts the same pair back on the source', () => {
    const S = boardWith(term(1), term(2)), T = boardWith(term(3));
    const s = realmOf(S, T);
    const tid = tidAt(S, 1);
    const there = must(moveTileToBoard(s, { tid, fromBoardId: S.id, target: { kind: 'board', toBoardId: T.id } }, rand, NOW)).state;
    const back = must(moveTileToBoard(there, { tid, fromBoardId: T.id, target: { kind: 'board', toBoardId: S.id } }, rand, NOW)).state;
    expect(pairs(back)).toEqual(pairs(s));
    expect(where(back, tid)).toEqual([S.id]);
    const st = (b: string) => (back.boards.find((x) => x.id === b) as Board).at as number;
    expect(st(S.id)).toBeGreaterThan(NOW); // each move stamps past the last one, even within one millisecond
    expect(st(T.id)).toBe(st(S.id));
  });

  it('the tile keeps its id even when the caller holds it (an id seen this session is still this tile\'s)', () => {
    const S = boardWith(term(1)), T = boardWith();
    const tid = tidAt(S);
    const r = must(moveTileToBoard(realmOf(S, T), { tid, fromBoardId: S.id, target: { kind: 'board', toBoardId: T.id } }, rand, NOW));
    expect(where(r.state, tid)).toEqual([T.id]);
  });
});

describe('a move with no room is refused before anything changes', () => {
  it('BOARD_FULL into a Board of eight tiles; an empty slot there takes the tile', () => {
    const S = boardWith(term(1));
    const T = boardWith(...[2, 3, 4, 5, 6, 7, 8, 9].map((k) => term(k)));
    const s = realmOf(S, T);
    expect(moveTileToBoard(s, { tid: tidAt(S), fromBoardId: S.id, target: { kind: 'board', toBoardId: T.id } }, rand, NOW)).toEqual({ refused: 'BOARD_FULL' });
    const slot = findTileSlot(T, tidAt(T, 5)) as string;
    const roomy = { ...T, tiles: { ...T.tiles, [slot]: null } };
    const r = must(moveTileToBoard(realmOf(S, roomy), { tid: tidAt(S), fromBoardId: S.id, target: { kind: 'board', toBoardId: T.id } }, rand, NOW));
    expect((r.state.boards[1] as Board).tiles[slot]?.tid).toBe(tidAt(S));
    expect(Object.keys(T.tiles)).toHaveLength(MAX_SLOTS);
  });

  it('BOARDS_FULL for a new Board at nine', () => {
    let s = realmOf(boardWith(term(1)));
    while (s.boards.length < MAX_BOARDS) s = must(createBoard(s, rand));
    const S = s.boards[0] as Board;
    expect(moveTileToBoard(s, { tid: tidAt(S), fromBoardId: S.id, target: { kind: 'new' } }, rand, NOW)).toEqual({ refused: 'BOARDS_FULL' });
  });
});

describe('the capture taken when the move began', () => {
  const setup = () => {
    const S = boardWith(term(1), term(2)), T = boardWith(term(3));
    return { S, T, s: realmOf(S, T), tid: tidAt(S, 0) };
  };
  const to = (T: Board) => ({ kind: 'board' as const, toBoardId: T.id });

  it('a swap on the source Board keeps the move valid: the tile moves from its new slot, the other stays', () => {
    const { S, T, tid } = setup();
    const [a, b] = Object.keys(S.tiles) as [string, string];
    const swapped = must(swapSlots(S, a, b));
    expect(findTileSlot(swapped, tid)).toBe(b);
    const r = must(moveTileToBoard(realmOf(swapped, T), { tid, fromBoardId: S.id, target: to(T) }, rand, NOW));
    expect(where(r.state, tid)).toEqual([T.id]);
    const left = r.state.boards[0] as Board;
    expect(Object.values(left.tiles).filter(Boolean).map((t) => (t as Tile).tid)).toEqual([tidAt(S, 1)]);
  });

  it('closed, replaced or moved off the source: NOT_FOUND, and the tile now in its place is untouched', () => {
    const { S, T, s, tid } = setup();
    const slot = findTileSlot(S, tid) as string;
    const closed = realmOf(must(closeSlot(S, slot)), T);
    expect(moveTileToBoard(closed, { tid, fromBoardId: S.id, target: to(T) }, rand, NOW)).toEqual({ refused: 'NOT_FOUND' });
    const replaced = realmOf(must(setTile(S, slot, term(9), rand)), T);
    expect(moveTileToBoard(replaced, { tid, fromBoardId: S.id, target: to(T) }, rand, NOW)).toEqual({ refused: 'NOT_FOUND' });
    const moved = must(moveTileToBoard(s, { tid, fromBoardId: S.id, target: to(T) }, rand, NOW)).state;
    expect(moveTileToBoard(moved, { tid, fromBoardId: S.id, target: to(T) }, rand, NOW)).toEqual({ refused: 'NOT_FOUND' });
  });

  it('the target Board deleted, the source deleted, or the source as the target: NOT_FOUND', () => {
    const { S, T, s, tid } = setup();
    const noT = must(deleteBoard(s, T.id, rand));
    expect(moveTileToBoard(noT, { tid, fromBoardId: S.id, target: to(T) }, rand, NOW)).toEqual({ refused: 'NOT_FOUND' });
    const noS = must(deleteBoard(s, S.id, rand));
    expect(moveTileToBoard(noS, { tid, fromBoardId: S.id, target: to(T) }, rand, NOW)).toEqual({ refused: 'NOT_FOUND' });
    expect(moveTileToBoard(s, { tid, fromBoardId: S.id, target: { kind: 'board', toBoardId: S.id } }, rand, NOW)).toEqual({ refused: 'NOT_FOUND' });
  });
});

describe('nextStamp', () => {
  it('now, or one past the latest stamp given', () => {
    expect(nextStamp(10.7)).toBe(10);
    expect(nextStamp(10, 3, undefined)).toBe(10);
    expect(nextStamp(10, 12, 4)).toBe(13);
    expect(nextStamp(-5)).toBe(0);
  });
});

describe('a tile found on two Boards after a merge stays on one', () => {
  it('this tab moved S -> T, the other tab changed S (the tile still on it): the move\'s target keeps it, S loses it', () => {
    const S = boardWith(term(1), term(2)), T = boardWith(term(3));
    const base = realmOf(S, T);
    const tid = tidAt(S, 0);
    const mine = must(moveTileToBoard(base, { tid, fromBoardId: S.id, target: { kind: 'board', toBoardId: T.id } }, rand, NOW)).state;
    // theirs: S renamed (a change of S other than the move), T untouched.
    const theirs: RealmBoards = { ...base, boards: [{ ...S, name: 'renamed' }, T] };
    const m = merge(base, mine, theirs);
    expect(where(m.state, tid)).toEqual([T.id]);
    // The tile is conserved once; the other tab's rename is the one kept for S (both changed it: theirs).
    expect(pairs(m.state)).toEqual(pairs(base));
  });

  it('the newer stamp wins whichever side it is on', () => {
    const S = boardWith(term(1)), T = boardWith(term(2));
    const tid = tidAt(S);
    const t1 = (S.tiles[findTileSlot(S, tid) as string] as Tile);
    const onT = must(addTile(T, t1, rand, new Set())).board;
    const older = dedupeTids(realmOf(S, T), [{ ...S, at: 5 }, { ...onT, at: 9 }]);
    expect(findTileSlot(older[0] as Board, tid)).toBeNull();
    expect(findTileSlot(older[1] as Board, tid)).not.toBeNull();
    const newer = dedupeTids(realmOf(S, T), [{ ...S, at: 11 }, { ...onT, at: 9 }]);
    expect(findTileSlot(newer[0] as Board, tid)).not.toBeNull();
    expect(findTileSlot(newer[1] as Board, tid)).toBeNull();
  });

  it('a tie goes to the Board that did not hold the tile in base (the target), whatever the order', () => {
    const S = boardWith(term(1)), T = boardWith(term(2));
    const tid = tidAt(S);
    const t1 = (S.tiles[findTileSlot(S, tid) as string] as Tile);
    const onT = must(addTile(T, t1, rand, new Set())).board;
    for (const order of [[S, onT], [onT, S]] as const) {
      const out = dedupeTids(realmOf(S, T), order.map((b) => ({ ...b, at: 7 })));
      const keptOn = out.filter((b) => findTileSlot(b, tid) !== null).map((b) => b.id);
      expect(keptOn).toEqual([T.id]);
    }
  });

  it('distinct tiles, and Boards with no duplicate, come back as the same objects', () => {
    const S = boardWith(term(1)), T = boardWith(term(2));
    const out = dedupeTids(realmOf(S, T), [S, T]);
    expect(out[0]).toBe(S);
    expect(out[1]).toBe(T);
  });

  it('a Board another tab deleted (o.deleted) is gone for the move, as source or target, even when present here', () => {
    const S = boardWith(term(1)), T = boardWith();
    const s = realmOf(S, T);
    const tid = tidAt(S);
    const toT = { kind: 'board', toBoardId: T.id } as const;
    expect(moveTileToBoard(s, { tid, fromBoardId: S.id, target: toT, deleted: [T.id] }, rand, NOW)).toEqual({ refused: 'NOT_FOUND' });
    expect(moveTileToBoard(s, { tid, fromBoardId: S.id, target: toT, deleted: [S.id] }, rand, NOW)).toEqual({ refused: 'NOT_FOUND' });
    expect(moveTileToBoard(s, { tid, fromBoardId: S.id, target: { kind: 'new' }, deleted: [S.id] }, rand, NOW)).toEqual({ refused: 'NOT_FOUND' });
    expect(isRefusal(moveTileToBoard(s, { tid, fromBoardId: S.id, target: toT, deleted: ['bother'] }, rand, NOW))).toBe(false);
  });

  it('a Board a copy was closed on counts as changed even when it ends equal to this tab\'s', () => {
    // Base: S holds x, y, z (z active); T and U empty. Here: y moved to U, then x closed on S. There: x moved to T,
    // stamped the same. The merge takes their S (both changed it) and closes y there (U, the target, keeps it): S ends
    // as this tab's. Its undo steps must go (an undo of the close would put x back on S while T holds it).
    const S = boardWith(web('x'), web('y'), web('z')), T = boardWith(), U = boardWith();
    const base = realmOf(S, T, U);
    const [x, y] = [tidAt(S, 0), tidAt(S, 1)];
    const movedY = must(moveTileToBoard(base, { tid: y, fromBoardId: S.id, target: { kind: 'board', toBoardId: U.id } }, rand, NOW)).state;
    const sMine = movedY.boards.find((b) => b.id === S.id) as Board;
    const mine: RealmBoards = { ...movedY, boards: movedY.boards.map((b) => (b.id === S.id ? must(closeSlot(sMine, findTileSlot(sMine, x) as string)) : b)) };
    const theirs = must(moveTileToBoard(base, { tid: x, fromBoardId: S.id, target: { kind: 'board', toBoardId: T.id } }, rand, NOW)).state;
    const m = merge(base, mine, theirs);
    expect(where(m.state, x)).toEqual([T.id]);
    expect(where(m.state, y)).toEqual([U.id]);
    expect(m.changed).toContain(S.id);
  });

  it('a single tab folding its own stored move changes nothing (stored and read back, stamps kept)', () => {
    const S = boardWith(term(1), term(2)), T = boardWith(term(3));
    const base = realmOf(S, T);
    const tid = tidAt(S, 1);
    const moved = must(moveTileToBoard(base, { tid, fromBoardId: S.id, target: { kind: 'board', toBoardId: T.id } }, rand, NOW)).state;
    const stored = roundTrip(moved);
    expect((stored.boards[0] as Board).at).toBe(NOW);
    const m = merge(stored, moved, stored);
    expect(pairs(m.state)).toEqual(pairs(base));
    expect(where(m.state, tid)).toEqual([T.id]);
    expect(m.changed).toEqual([]);
  });
});
