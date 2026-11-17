// A Board that pages: the pages over the reading order, the slot a close hands over to, a new slot's
// place, and the saved layout left alone.
import { describe, expect, it } from 'vitest';
import {
  addTile, boardSlots, closeSlot, focusToward, isRefusal, MAX_SLOTS, newBoard, setTile, splitAt, splitEnd, swapToward,
  type Board, type Refusal, type TileRef,
} from './boards';
import { boardPages, pageCapacity, pageHeir, pageLayout, pageLayoutOf, readingOrder, tileBoxes } from './geom';
import { withMode } from '../scroll/mode';
import { MIN_TILE, slots } from './tree';

function seq(): () => number { let i = 0; return () => ((i++ * 7919) % 1000) / 1000; }
const tile = (n: number): TileRef => ({ project: 'p1', computer: 'c' + n, program: 'terminal', session: 1 });
const ok = <T,>(x: T): Exclude<T, Refusal> => { if (isRefusal(x)) throw new Error('refused ' + x.refused); return x as Exclude<T, Refusal>; };
function filled(n: number, mode?: 'scroll'): Board {
  const r = seq();
  let b = withMode(newBoard(r), mode);
  for (let i = 0; i < n; i++) b = ok(addTile(b, tile(i), r)).board;
  return b;
}
const IDS = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'];
const chain = (n: number) => {
  let l = pageLayout(['s0']);
  for (const id of IDS.slice(1, n)) l = { dir: 'row', ratio: 0.5, a: l, b: { slot: id } };
  return l;
};

describe('pageCapacity', () => {
  // grid: 2 x 240 + 2 x 4 padding + 4 gap across, 2 x 160 + 8 + 4 down.
  it.each([
    [1350, 900, 4], [492, 332, 4], [491, 900, 1], [492, 331, 2], [1280, 250, 2], [492, 168, 2], [492, 167, 1], [400, 500, 1],
  ])('at %i x %i a page holds %i', (w, h, want) => {
    expect(pageCapacity(w, h)).toBe(want);
  });
});

describe('pageLayout', () => {
  it.each([1, 2, 3, 4])('over %i slots reads in the order given', (n) => {
    expect(slots(pageLayout(IDS.slice(0, n)))).toEqual(IDS.slice(0, n));
  });
  it('grid reads a b / c d on screen', () => {
    const b = tileBoxes(pageLayout(['a', 'b', 'c', 'd']), 1000, 800);
    expect(b.a!.left).toBeLessThan(b.b!.left);
    expect(b.a!.top).toBe(b.b!.top);
    expect(b.c!.top).toBeGreaterThan(b.a!.top);
    expect(b.c!.left).toBe(b.a!.left);
  });
});

describe('boardPages', () => {
  it('cuts the reading order at a fixed stride, with the short page last', () => {
    expect(boardPages(chain(5), 's0', 4, 1350, 900).pages).toEqual([['s0', 's1', 's2', 's3'], ['s4']]);
    expect(boardPages(chain(8), 's0', 4, 1350, 900).pages).toEqual([['s0', 's1', 's2', 's3'], ['s4', 's5', 's6', 's7']]);
    expect(boardPages(chain(5), 's0', 2, 1280, 250).pages).toEqual([['s0', 's1'], ['s2', 's3'], ['s4']]);
  });
  it('shows the page of the active slot, its layout over that page alone', () => {
    const p = boardPages(chain(6), 's5', 4, 1350, 900);
    expect(p.index).toBe(1);
    expect(p.slots).toEqual(['s4', 's5']);
    expect(slots(p.layout)).toEqual(['s4', 's5']);
    expect(boardPages(chain(6), 's3', 4, 1350, 900).index).toBe(0);
  });
  it('an active slot the layout does not hold reads as the first page', () => {
    expect(boardPages(chain(5), 'gone', 4, 1350, 900).index).toBe(0);
  });
  it('every tile of every page keeps at least the minimum, and off the page it keeps its own page\'s box', () => {
    const p = boardPages(chain(8), 's0', 4, 1350, 900);
    expect(Object.keys(p.boxes).sort()).toEqual(IDS);
    for (const b of Object.values(p.boxes)) {
      expect(b.width).toBeGreaterThanOrEqual(MIN_TILE.w);
      expect(b.height).toBeGreaterThanOrEqual(MIN_TILE.h);
    }
    // The same box whichever page shows: flipping the page resizes no frame.
    expect(boardPages(chain(8), 's7', 4, 1350, 900).boxes).toEqual(p.boxes);
  });
  it('leaves the layout it read as it was', () => {
    const l = chain(6);
    const before = JSON.stringify(l);
    boardPages(l, 's5', 4, 1350, 900);
    expect(JSON.stringify(l)).toBe(before);
  });
});

describe('pageHeir', () => {
  const six = chain(6);
  it('is the next on the page, else the one before it in reading order', () => {
    expect(pageHeir(six, 's0', 4)).toBe('s1');
    expect(pageHeir(six, 's2', 4)).toBe('s3');
    expect(pageHeir(six, 's3', 4)).toBe('s2'); // the page's last: s4 is on the next page
    expect(pageHeir(six, 's4', 4)).toBe('s5');
    expect(pageHeir(six, 's5', 4)).toBe('s4');
  });
  it('a lone tile on the last page hands over to the page just before, not further back', () => {
    expect(pageHeir(chain(5), 's4', 2)).toBe('s3');
    expect(pageHeir(chain(5), 's4', 4)).toBe('s3');
  });
  it('alone, or not there, it is nothing', () => {
    expect(pageHeir(pageLayout(['s0']), 's0', 4)).toBeUndefined();
    expect(pageHeir(six, 'gone', 4)).toBeUndefined();
  });
});

describe('pageLayoutOf', () => {
  it('is the page of the active slot, the one boardPages draws', () => {
    expect(pageLayoutOf(chain(6), 's5', 4)).toEqual(boardPages(chain(6), 's5', 4, 1350, 900).layout);
    expect(slots(pageLayoutOf(chain(5), 's3', 2))).toEqual(['s2', 's3']);
  });
});

describe('closeSlot with a next slot', () => {
  it('hands the active slot to it, on the page, not to a spatial neighbour', () => {
    const b = filled(6);
    const order = boardSlots(b);
    const closing = order[4] as string, next = order[5] as string;
    const at = ok(closeSlot({ ...b, active: closing }, closing, next));
    expect(at.active).toBe(next);
    expect(boardSlots(at)).toHaveLength(5);
  });
  it('without one, or with one that is gone or the closed slot itself, keeps its neighbour rule', () => {
    const b = filled(3);
    const [first, second] = boardSlots(b) as [string, string];
    const plain = ok(closeSlot({ ...b, active: first }, first));
    expect(ok(closeSlot({ ...b, active: first }, first, 'sgone')).active).toBe(plain.active);
    expect(ok(closeSlot({ ...b, active: first }, first, first)).active).toBe(plain.active);
    expect(ok(closeSlot({ ...b, active: second }, first, boardSlots(b)[2])).active).toBe(second);
  });
});

describe('a new slot on a Board that pages', () => {
  it('splitEnd adds the last slot in reading order and makes it active; the earlier slots keep their places', () => {
    const r = seq();
    let b = filled(5);
    const before = boardSlots(b);
    const at = ok(splitEnd({ ...b, active: before[0] as string }, r));
    expect(boardSlots(at.board)).toEqual([...before, at.slot]);
    expect(at.board.active).toBe(at.slot);
    b = at.board;
    expect(readingOrder(b.layout).at(-1)).toBe(at.slot);
  });
  it('splitEnd refuses past MAX_SLOTS', () => {
    expect(splitEnd(filled(MAX_SLOTS), seq())).toEqual({ refused: 'BOARD_FULL' });
  });
  it('addTile on a Fit Board of 4 or more goes last, wherever the active slot is, up to the 8th', () => {
    for (const n of [4, 5, 6, 7]) {
      const b = filled(n);
      const before = boardSlots(b);
      const at = ok(addTile({ ...b, active: before[0] as string }, tile(99), seq()));
      expect(boardSlots(at.board)).toEqual([...before, at.slot]);
      expect(at.board.active).toBe(at.slot);
    }
  });
  it('addTile under 4 slots, and on a Scroll Board at any count, still splits the active slot', () => {
    const three = filled(3);
    const order = boardSlots(three);
    const under = ok(addTile({ ...three, active: order[0] as string }, tile(99), seq()));
    expect(boardSlots(under.board)[1]).toBe(under.slot);
    const scroll = filled(5, 'scroll');
    const sorder = boardSlots(scroll);
    const kept = ok(addTile({ ...scroll, active: sorder[0] as string }, tile(99), seq()));
    expect(boardSlots(kept.board)[1]).toBe(kept.slot);
  });
  it('addTile with last goes last on any Board, a Scroll one or one under 4 slots included (the view sees it paging)', () => {
    const three = filled(3);
    const order = boardSlots(three);
    const at = ok(addTile({ ...three, active: order[0] as string }, tile(99), seq(), undefined, true));
    expect(boardSlots(at.board)).toEqual([...order, at.slot]);
    const scroll = filled(5, 'scroll');
    const sorder = boardSlots(scroll);
    const kept = ok(addTile({ ...scroll, active: sorder[0] as string }, tile(99), seq(), undefined, true));
    expect(boardSlots(kept.board)).toEqual([...sorder, kept.slot]);
  });
  it('an empty slot still takes the tile, adding no slot', () => {
    const b = filled(5);
    const empty = ok(setTile(b, boardSlots(b)[1] as string, null));
    const at = ok(addTile(empty, tile(99), seq()));
    expect(at.slot).toBe(boardSlots(b)[1]);
    expect(boardSlots(at.board)).toEqual(boardSlots(b));
  });
  it('an explicit split still goes beside its slot', () => {
    const b = filled(3);
    const order = boardSlots(b);
    const at = ok(splitAt(b, order[0] as string, 'right', seq()));
    expect(boardSlots(at.board)[1]).toBe(at.slot);
  });
});

describe('moving over the page drawn', () => {
  const b = filled(6);
  const order = boardSlots(b) as [string, string, string, string, string, string];
  const page2 = pageLayout([order[4], order[5]]);
  it('focusToward stays on the drawn page: there is no neighbour off its edge', () => {
    const at: Board = { ...b, active: order[4] };
    expect(focusToward(at, 'right', page2).active).toBe(order[5]);
    expect(focusToward(at, 'left', page2)).toBe(at);
    expect(focusToward(at, 'up', page2)).toBe(at);
  });
  it('a drawn layout older than the Board can never make a slot it no longer holds active', () => {
    const at: Board = { ...b, active: order[4] };
    const closed = ok(closeSlot(at, order[5], order[4]));
    expect(focusToward(closed, 'right', page2)).toBe(closed);
    expect(swapToward(closed, 'right', page2)).toBe(closed);
  });
  it('swapToward swaps on the drawn page, and leaves the saved layout', () => {
    const at: Board = { ...b, active: order[4] };
    const swapped = swapToward(at, 'right', page2);
    expect(swapped.tiles[order[5]]).toBe(b.tiles[order[4]]);
    expect(swapped.active).toBe(order[5]);
    expect(swapped.layout).toBe(b.layout);
    expect(swapToward(at, 'left', page2)).toBe(at);
  });
});
