// Whether a Board pages at a view size, from the Board itself. The view draws by this, and a change queued against an older
// render reads it again from the Board it is made on (data.ts replays a change on another tab's newer write), so geometry,
// the arrows, a close and a new tile's place never go by what an earlier render saw.
import { PAGE_MAX, type Board } from './model/boards';
import { pageCapacity, pageLayoutOf, readingOrder } from './model/geom';
import { layoutFits } from './scroll';

type Shape = Pick<Board, 'mode' | 'layout'>;

/** More than this size shows at once: the layout does not fit, or a Fit Board holds more than a page. */
export function overflowsAt(b: Shape, w: number, h: number): boolean {
  return !layoutFits(b.mode, b.layout, w, h) || (b.mode !== 'scroll' && readingOrder(b.layout).length > PAGE_MAX);
}

/** The Board is drawn as pages here: it overflows, there is room for more than one tile, and no tile is maximised. */
export function pagedAt(b: Board, w: number, h: number): boolean {
  return pageCapacity(w, h) > 1 && !b.max && overflowsAt(b, w, h);
}

/** What the arrows and swaps move over here: the page on screen when the Board pages, otherwise the saved layout. */
export function navLayoutAt(b: Board, w: number, h: number): Board['layout'] {
  return pagedAt(b, w, h) ? pageLayoutOf(b.layout, b.active, pageCapacity(w, h)) : b.layout;
}
