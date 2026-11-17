// Vitest: paging.ts, the one judge of whether a Board pages, as a replayed change reads it from the Board it is made on.
import { describe, expect, it } from 'vitest';
import { addTile, boardSlots, focusSlot, freshRealm, isRefusal, splitEnd, swapToward, toggleMax, type Board, type Refusal, type TileRef } from './model/boards';
import { navLayoutAt, overflowsAt, pagedAt } from './paging';
import { readingOrder } from './model/geom';
import { withMode } from './scroll';

function seq(): () => number { let i = 0; return () => ((i++ * 7919) % 1000) / 1000; }
const tile = (n: number): TileRef => ({ project: 'p1', computer: 'c' + n, program: 'terminal', session: 1 });
const ok = <T,>(x: T): Exclude<T, Refusal> => { if (isRefusal(x)) throw new Error('refused ' + x.refused); return x as Exclude<T, Refusal>; };
function filled(n: number): Board {
  const rand = seq();
  let b = freshRealm(rand).boards[0] as Board;
  for (let i = 0; i < n; i++) b = ok(addTile(b, tile(i), rand)).board;
  return b;
}
const W = 1350;
const H = 900;

describe('pagedAt', () => {
  it('a Fit Board pages past 4 slots, and at 4 slots draws its saved layout', () => {
    expect(pagedAt(filled(4), W, H)).toBe(false);
    expect(pagedAt(filled(5), W, H)).toBe(true);
    expect(overflowsAt(filled(4), W, H)).toBe(false);
  });
  it('a maximised tile, or room for one tile, is not paging though the Board overflows', () => {
    const five = filled(5);
    expect(pagedAt(ok(toggleMax(five, five.active)), W, H)).toBe(false);
    expect(overflowsAt(five, 400, 200)).toBe(true);
    expect(pagedAt(five, 400, 200)).toBe(false);
  });
  it('a Scroll Board that fits is not paging, however many slots it holds', () => {
    const six = withMode(filled(4), 'scroll');
    expect(overflowsAt(six, W, H)).toBe(false);
  });
});

describe('navLayoutAt', () => {
  it('is the saved layout on a Board that does not page, and the page of the active slot on one that does', () => {
    const four = filled(4);
    expect(navLayoutAt(four, W, H)).toBe(four.layout);
    const five = filled(5);
    const at = ok(focusSlot(five, boardSlots(five)[4] as string));
    expect(readingOrder(navLayoutAt(at, W, H))).toEqual([boardSlots(five)[4]]);
  });
  it('a swap made on a render that saw 4 slots, replayed after another tab added a 5th, stays on the page', () => {
    const four = filled(4);
    const order = boardSlots(four);
    const last = order[3] as string;
    const newer = ok(focusSlot(ok(splitEnd(four, seq())).board, last));
    expect(pagedAt(four, W, H)).toBe(false);
    expect(pagedAt(newer, W, H)).toBe(true);
    // Whichever way splitEnd went, no arrow from the page's slots reaches the 5th tile, which is on the next page.
    for (const side of ['left', 'right', 'up', 'down'] as const) {
      const swapped = swapToward(newer, side, navLayoutAt(newer, W, H));
      expect(boardSlots(swapped)[4]).toBe(boardSlots(newer)[4]);
      expect(readingOrder(navLayoutAt(swapped, W, H))).toEqual(expect.not.arrayContaining([boardSlots(newer)[4]]));
    }
  });
});
