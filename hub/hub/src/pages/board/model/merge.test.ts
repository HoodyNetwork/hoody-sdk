// The two-tab merge by Board id: nothing vanishes unless a side deleted it, the last write wins per Board.
import { describe, expect, it } from 'vitest';
import { createBoard, deleteBoard, freshRealm, isRefusal, renameBoard, reorderBoard, type RealmBoards, type Refusal } from './boards';
import { merge } from './merge';

const ok = <T,>(x: T): Exclude<T, Refusal> => { if (isRefusal(x)) throw new Error('refused ' + x.refused); return x as Exclude<T, Refusal>; };
let n = 1;
const rand = () => ((n = (n * 7919) % 10007) / 10007);
const names = (s: RealmBoards) => s.boards.map((b) => b.name);
function base(): RealmBoards {
  const f = freshRealm(rand);
  return { ...ok(createBoard(ok(renameBoard(f, f.active, 'Main')), rand, 'Work')), active: f.active };
}

describe('merge', () => {
  it('a change on one side is taken; untouched Boards stay', () => {
    const b = base();
    const t = ok(renameBoard(b, b.boards[0]!.id, 'Main 2'));
    expect(names(merge(b, b, t).state)).toEqual(['Main 2', 'Work']);
    expect(names(merge(b, t, b).state)).toEqual(['Main 2', 'Work']);
  });
  it('Boards new on either side are both kept', () => {
    const b = base();
    const m = ok(createBoard(b, rand, 'Mine'));
    const t = ok(createBoard(b, rand, 'Theirs'));
    expect(names(merge(b, m, t).state)).toEqual(['Main', 'Work', 'Theirs', 'Mine']);
  });
  it('a Board the other side never saw is kept; one it deleted goes', () => {
    const b = base();
    const m = ok(createBoard(b, rand, 'Mine'));
    // theirs is the older value (it never had Mine) with a rename: Mine stays.
    const t = ok(renameBoard(b, b.boards[1]!.id, 'Work 2'));
    expect(names(merge(m, m, t).state)).toEqual(['Main', 'Work 2', 'Mine']);
    // theirs deleted Work: it goes, and the tombstone travels.
    const d = ok(deleteBoard(b, b.boards[1]!.id, rand));
    const r = merge(b, b, d);
    expect(names(r.state)).toEqual(['Main']);
    expect(r.state.gone).toEqual([b.boards[1]!.id]);
  });
  it('a change here outlives a delete there', () => {
    const b = base();
    const m = ok(renameBoard(b, b.boards[1]!.id, 'Work kept'));
    const t = ok(deleteBoard(b, b.boards[1]!.id, rand));
    expect(names(merge(b, m, t).state)).toEqual(['Main', 'Work kept']);
  });
  it('the same Board changed on both sides: theirs, listed as lost here', () => {
    const b = base();
    const id = b.boards[0]!.id;
    const r = merge(b, ok(renameBoard(b, id, 'Here')), ok(renameBoard(b, id, 'There')));
    expect(names(r.state)[0]).toBe('There');
    expect(r.lost).toEqual([id]);
    expect(r.changed).toEqual([id]);
  });
  it('keeps this tab\'s active Board, or opens the first when it was deleted there', () => {
    const b = base();
    const m = { ...b, active: b.boards[1]!.id };
    expect(merge(b, m, { ...b, active: b.boards[0]!.id }).state.active).toBe(b.boards[1]!.id);
    const r = merge(b, m, ok(deleteBoard(b, b.boards[1]!.id, rand)));
    expect(r.state.active).toBe(b.boards[0]!.id);
    expect(r.deletedOpen).toBe('Work');
  });
  it('order: this tab\'s reorder wins when the other side did not reorder', () => {
    const b = base();
    const m = reorderBoard(b, 0, 1);
    expect(names(merge(b, m, ok(createBoard(b, rand, 'New'))).state)).toEqual(['Work', 'Main', 'New']);
  });
});
