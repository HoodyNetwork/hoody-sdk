import { describe, expect, it } from 'vitest';
import {
  activeBoard, addTile, applyPreset, boardByNumber, boardSlots, cleanName, closeSlot, createBoard, deleteBoard, duplicateBoard, filledCount,
  copyName, focusToward, freshRealm, isRefusal, lastStep, MAX_BOARDS, moveSlot, newBoard, onActive, pushRecent, recordStep, renameBoard, reorderBoard,
  isProgramTile, resizeActive, setTile, splitAt, stepBoard, swapSlots, swapToward, toggleMax, undoStep, type Board, type BoardUndo, type RealmBoards, type Refusal, type Tile, type TileRef,
} from './boards';
import { rects, type SplitNode } from './tree';

function seq(): () => number { let i = 0; return () => ((i++ * 7919) % 1000) / 1000; }
const tile = (n: number, program: TileRef['program'] = 'terminal'): TileRef => ({ project: 'p1', computer: 'c' + n, program, session: 1 });
const ctr = (t: Tile | null | undefined) => (isProgramTile(t) ? t.computer : undefined);
const ok = <T,>(x: T): Exclude<T, Refusal> => { if (isRefusal(x)) throw new Error('refused ' + x.refused); return x as Exclude<T, Refusal>; };

function filled(n: number): Board {
  const r = seq();
  let b = newBoard(r);
  for (let i = 0; i < n; i++) b = ok(addTile(b, tile(i), r)).board;
  return b;
}

describe('a Board', () => {
  it('starts with one empty active slot', () => {
    const b = newBoard(seq());
    expect(boardSlots(b)).toHaveLength(1);
    expect(b.tiles[b.active]).toBeNull();
    expect(b.name).toBe('');
  });
  it('adding fills the empty active slot, then splits, up to 8 slots, then refuses', () => {
    const b = filled(8);
    expect(boardSlots(b)).toHaveLength(8);
    expect(filledCount(b)).toBe(8);
    expect(addTile(b, tile(9), seq())).toEqual({ refused: 'BOARD_FULL' });
  });
  it('addTile on a Board with a maximised tile moves the maximise to the new tile, so it shows', () => {
    const r = seq();
    let b = newBoard(r);
    b = ok(addTile(b, tile(1), r)).board;
    b = { ...b, max: b.active };
    const split = ok(addTile(b, tile(2), r));
    expect(split.board.max).toBe(split.slot);
    expect(split.board.active).toBe(split.slot);
    const filled = ok(addTile({ ...split.board, tiles: { ...split.board.tiles, [split.slot]: null }, max: b.active }, tile(3), r));
    expect(filled.slot).toBe(split.slot);
    expect(filled.board.max).toBe(split.slot);
    expect(ok(addTile(newBoard(r), tile(4), r)).board.max).toBeNull();
  });
  it('adding prefers an empty slot over a split', () => {
    const r = seq();
    const b = ok(applyPreset(filled(1), 'grid', r));
    const out = ok(addTile(b, tile(5), r));
    expect(boardSlots(out.board)).toHaveLength(4);
    expect(out.slot).toBe(boardSlots(b)[1]);
  });
  it('a split goes along the longer side of the active slot', () => {
    const b = filled(2);
    const r = rects(b.layout);
    expect(Object.values(r).every((x) => x.w === 0.5 && x.h === 1)).toBe(true);
    const third = ok(addTile(b, tile(3), seq())).board;
    expect((third.layout as SplitNode).dir).toBe('row');
    expect(((third.layout as SplitNode).b as SplitNode).dir).toBe('col');
  });
  it('a preset keeps the tiles in order and adds empty slots', () => {
    const b = filled(2);
    const g = ok(applyPreset(b, 'grid', seq()));
    const ids = boardSlots(g);
    expect(ids.slice(0, 2).map((s) => ctr(g.tiles[s]))).toEqual(['c0', 'c1']);
    expect(ids.slice(2).map((s) => g.tiles[s])).toEqual([null, null]);
  });
  it('a preset drops empty slots first and refuses when the tiles do not fit', () => {
    const b = ok(applyPreset(filled(1), 'grid', seq()));
    const one = ok(applyPreset(b, 'one', seq()));
    expect(boardSlots(one)).toHaveLength(1);
    expect(ctr(one.tiles[boardSlots(one)[0] as string])).toBe('c0');
    expect(applyPreset(filled(3), 'two-side', seq())).toEqual({ refused: 'PRESET_TOO_SMALL' });
  });
  it('close gives the room to the sibling and moves focus next door; the last slot empties', () => {
    const b = filled(3);
    const out = ok(closeSlot(b, b.active));
    expect(boardSlots(out)).toHaveLength(2);
    expect(boardSlots(out)).toContain(out.active);
    const one = filled(1);
    const emptied = ok(closeSlot(one, one.active));
    expect(boardSlots(emptied)).toEqual([one.active]);
    expect(emptied.tiles[one.active]).toBeNull();
  });
  it('swap exchanges tiles and focus follows; move to an edge splits there', () => {
    const b = filled(2);
    const [x, y] = boardSlots(b) as [string, string];
    const sw = ok(swapSlots(b, x, y));
    expect(ctr(sw.tiles[x])).toBe('c1');
    expect(ctr(sw.tiles[y])).toBe('c0');
    const g = ok(applyPreset(filled(3), 'three-cols', seq()));
    const [a, , c] = boardSlots(g) as [string, string, string];
    const moved = ok(moveSlot(g, a, c, 'down'));
    expect(boardSlots(moved)).toHaveLength(3);
    expect(rects(moved.layout)[a]!.y).toBeCloseTo(0.5);
    expect(moved.active).toBe(a);
    expect(ctr(ok(moveSlot(g, a, c, 'centre')).tiles[a])).toBe('c2');
  });
  it('maximise is one toggle and is cleared when its slot goes', () => {
    const b = filled(2);
    const m = ok(toggleMax(b, b.active));
    expect(m.max).toBe(b.active);
    expect(ok(toggleMax(m, b.active)).max).toBeNull();
    expect(ok(closeSlot(m, b.active)).max).toBeNull();
  });
  it('focus, swap and resize from the keyboard follow the neighbours', () => {
    const g = ok(applyPreset(filled(4), 'grid', seq()));
    const [a, b, c] = boardSlots(g) as [string, string, string];
    const atA = { ...g, active: a };
    expect(focusToward(atA, 'right').active).toBe(b);
    expect(focusToward(atA, 'down').active).toBe(c);
    expect(focusToward(atA, 'left')).toBe(atA);
    const swapped = swapToward(atA, 'right');
    expect(ctr(swapped.tiles[b])).toBe(ctr(g.tiles[a]));
    expect(swapped.active).toBe(b);
    const bigger = resizeActive(atA, 'down');
    expect((bigger.layout as SplitNode).ratio).toBeCloseTo(0.55);
  });
  it('split refuses at 8 and makes the new slot active', () => {
    const b = filled(1);
    const out = ok(splitAt(b, b.active, 'down', seq()));
    expect(out.board.active).toBe(out.slot);
    expect(splitAt(filled(8), filled(8).active, 'right', seq())).toEqual({ refused: 'BOARD_FULL' });
  });
  it('unknown slots are refused, never guessed', () => {
    const b = filled(1);
    expect(setTile(b, 'snope', null)).toEqual({ refused: 'NOT_FOUND' });
    expect(closeSlot(b, 'snope')).toEqual({ refused: 'NOT_FOUND' });
  });
});

describe('a realm\'s Boards', () => {
  const realm = (): RealmBoards => freshRealm(seq());
  it('creates up to 9 Boards, each made active', () => {
    let s = realm();
    for (let i = 1; i < MAX_BOARDS; i++) s = ok(createBoard(s, seq()));
    expect(s.boards).toHaveLength(9);
    expect(s.active).toBe(s.boards[8]!.id);
    expect(new Set(s.boards.map((b) => b.id)).size).toBe(9);
    expect(createBoard(s, seq())).toEqual({ refused: 'BOARDS_FULL' });
  });
  it('a new Board takes the name the view gives it', () => {
    expect(activeBoard(ok(createBoard(realm(), seq(), 'Board 2'))).name).toBe('Board 2');
  });
  it('rename trims and refuses control characters and names over 32; empty keeps the old name', () => {
    const s = realm();
    const id = s.boards[0]!.id;
    expect(ok(renameBoard(s, id, '  Main   work ')).boards[0]!.name).toBe('Main work');
    expect(renameBoard(s, id, 'a\u0007b')).toEqual({ refused: 'NAME_INVALID' });
    expect(renameBoard(s, id, 'x'.repeat(33))).toEqual({ refused: 'NAME_INVALID' });
    expect(ok(renameBoard(s, id, 'x'.repeat(32))).boards[0]!.name).toHaveLength(32);
    const named = ok(renameBoard(s, id, 'Debug'));
    expect(renameBoard(named, id, '   ')).toBe(named);
    expect(cleanName('a\u2028b')).toBeNull();
  });
  it('duplicate inserts a copy after the original; delete moves to the next; the last delete starts fresh', () => {
    let s = realm();
    s = ok(onActive(s, (b) => ok(addTile(b, tile(1), seq())).board));
    const first = s.boards[0]!.id;
    s = ok(onActive(s, (b) => ok(toggleMax(b, b.active))));
    s = ok(duplicateBoard(s, first, seq(), 'Main copy'));
    expect(s.boards).toHaveLength(2);
    expect(s.active).toBe(s.boards[1]!.id);
    expect(s.boards[1]).toMatchObject({ name: 'Main copy', max: s.boards[0]!.max, active: s.boards[0]!.active, layout: s.boards[0]!.layout });
    expect(filledCount(s.boards[1]!)).toBe(1);
    s = ok(deleteBoard(s, s.active, seq()));
    expect(s.boards.map((b) => b.id)).toEqual([first]);
    const fresh = ok(deleteBoard(s, first, seq()));
    expect(fresh.boards).toHaveLength(1);
    expect(filledCount(activeBoard(fresh))).toBe(0);
  });
  it('reorder, jump to N and step wrap', () => {
    let s = realm();
    s = ok(createBoard(s, seq()));
    s = ok(createBoard(s, seq()));
    const ids = s.boards.map((b) => b.id);
    expect(reorderBoard(s, 0, 2).boards.map((b) => b.id)).toEqual([ids[1], ids[2], ids[0]]);
    expect(reorderBoard(s, 0, 7)).toBe(s);
    expect(ok(boardByNumber(s, 1)).active).toBe(ids[0]);
    expect(boardByNumber(s, 9)).toEqual({ refused: 'NOT_FOUND' });
    expect(stepBoard(s, 1).active).toBe(ids[0]);
    expect(stepBoard({ ...s, active: ids[0] as string }, -1).active).toBe(ids[2]);
  });
  it('a refused operation leaves the state as it was', () => {
    const s = realm();
    expect(onActive(s, (b) => closeSlot(b, 'snope'))).toEqual({ refused: 'NOT_FOUND' });
  });
});

describe('copy names', () => {
  it('"<name> copy", then "copy 2", cut to 32 characters', () => {
    expect(copyName('Debug', 'copy', ['Debug'])).toBe('Debug copy');
    expect(copyName('Debug', 'copy', ['Debug', 'Debug copy'])).toBe('Debug copy 2');
    const long = 'x'.repeat(32);
    expect(copyName(long, 'copy', [long])).toBe('x'.repeat(27) + ' copy');
    expect(copyName(long, 'copy', [long, 'x'.repeat(27) + ' copy'])).toBe('x'.repeat(25) + ' copy 2');
  });
});

describe('recents', () => {
  it('newest first, one per computer, program and session, at most 8, no options', () => {
    let s = freshRealm(seq());
    for (let i = 0; i < 10; i++) s = pushRecent(s, tile(i));
    s = pushRecent(s, { ...tile(5), params: { fontSize: 14 } });
    expect(s.recents.map((t) => t.computer)).toEqual(['c5', 'c9', 'c8', 'c7', 'c6', 'c4', 'c3', 'c2']);
    expect(s.recents[0]).toEqual(tile(5));
  });
  it('an SSH pick keeps its destination in the recents (the tile\'s gate needs it), never its options', () => {
    const ssh = { host: 'db.example.com', user: 'ops', port: 2222 };
    const s = pushRecent(freshRealm(seq()), { ...tile(1), program: 'terminal', ssh, params: { fontSize: 14 }, name: 'ops@db.example.com:2222' });
    expect(s.recents[0]).toEqual({ ...tile(1), program: 'terminal', ssh });
  });
});

describe('undo (per Board)', () => {
  it('keeps the last 10 changes of each Board and puts back only the active one', () => {
    let s = ok(createBoard(freshRealm(seq()), seq()));
    const [a, b] = s.boards.map((x) => x.id) as [string, string];
    let u: BoardUndo = {};
    for (let i = 0; i < 12; i++) {
      const before = activeBoard(s);
      s = ok(onActive(s, (x) => ok(addTile(x, tile(i), seq())).board));
      if (i < 5) u = recordStep(u, before, 'add ' + i);
      else { s = ok(onActive(s, (x) => closeSlot(x, x.active))); }
    }
    expect(u[b]).toHaveLength(5);
    expect(lastStep(s, u)?.label).toBe('add 4');
    s = { ...s, active: a };
    expect(lastStep(s, u)).toBeNull();
    expect(undoStep(s, u)).toBeNull();
    s = { ...s, active: b };
    let undone = 0;
    for (let r = undoStep(s, u); r; r = undoStep(s, u)) { s = r.state; u = r.undo; undone++; }
    expect(undone).toBe(5);
    expect(filledCount(activeBoard(s))).toBe(0);
    expect(s.boards.find((x) => x.id === a)).toBeDefined();
    let many: BoardUndo = {};
    for (let i = 0; i < 12; i++) many = recordStep(many, activeBoard(s), String(i));
    expect(many[b]).toHaveLength(10);
    expect(many[b]![0]!.label).toBe('2');
  });
});
