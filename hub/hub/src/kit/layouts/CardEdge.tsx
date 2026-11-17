// The card corner: every outermost card gets the 16 px slanted bottom-right corner, its 1 px
// frame drawn by one SVG path in the card's own border colour. A card marks itself with `data-card-cut` (useCardCut);
// the one shared rule (CardEdge.module.css) clips it to the outline and makes its CSS border transparent, which keeps
// the layout, and CardEdge draws the line. The outline is CutFrame's (cutFramePath): the Computers cards and every
// other card share one formula. A card inside a card stays square, and so does a card that holds a table.
import { createContext, useContext, useRef, type ReactNode } from 'react';
import { StripScopeReset } from '../controls/ButtonStrip';
import { EmptyScopeReset } from '../states/emptyScope';
import { cutFramePath, useFrameSize } from './CutFrame';
import { ListPaneContext, type ListPane } from './pane';
import s from './CardEdge.module.css';

/** The card corner's size in px (tokens.css --card-cut). */
export const CARD_CUT = 16;

/** A table frame's corner size in px (tokens.css --table-cut). */
export const TABLE_CUT = 18;

/** The focus ring of a focusable card (a card-table row): a clipped card cannot paint an outline outside itself, so
 * the ring is the card outline moved in by `c` px (its centre line), the slant moved in by the same distance, and a
 * 2 px ring sits inside the 1 px frame. */
export function cutRingPath(w: number, h: number, cut: number, c = 2): string {
  const k = +(c * (Math.SQRT2 - 1)).toFixed(3);
  return `M${c} ${c}H${w - c}V${h - cut - k}L${w - cut - k} ${h - c}H${c}Z`;
}

const InCard = createContext(false);

/** Marks its children as inside a card: a card among them draws no corner. */
export function CardScope({ children }: { children: ReactNode }) {
  return <InCard.Provider value>{children}</InCard.Provider>;
}

/** No list pane: an overlay's content is no page's list. */
const NO_PANE: ListPane = {};

/** Ends the card scope for its children: an overlay (Dialog, Drawer, Popover, Sheet, menu tray) is a new surface, so a
 * card in it is outermost again even when a card opened the overlay. It ends a ButtonStrip's scope the same way:
 * a button in an overlay a strip button opened keeps its own look, in the overlays that use this reset. It also
 * ends a list pane's and a rail's scope: a table in the overlay is not the page's
 * list, and its empty states sit at the centre, page-size, never in a frame or the rail's small look. */
export function CardScopeReset({ children }: { children: ReactNode }) {
  return (
    <InCard.Provider value={false}>
      <ListPaneContext.Provider value={NO_PANE}>
        <EmptyScopeReset>
          <StripScopeReset>{children}</StripScopeReset>
        </EmptyScopeReset>
      </ListPaneContext.Provider>
    </InCard.Provider>
  );
}

/** The attribute that gives a card its corner: none for a card inside a card. */
export function useCardCut(): { 'data-card-cut'?: '' } {
  return useContext(InCard) ? {} : { 'data-card-cut': '' };
}

/** The edge of the card it sits in: its parent element, or with `row` the card-table row around its cell. A card row
 * is always outermost: the box around a card table holds a table, so it is never a card itself. With `ring` (a
 * pressable card, PickCard) the edge also draws the focus ring, shown while the element marked `data-card-ring` (the
 * card itself, or the grid row around it) has visible focus: a clipped card cannot paint an outline outside itself. */
/** `cut` and `mark` serve a table frame's corner (DataTable): its own size, and `data-table-edge` in place of
 * `data-card-edge`, since a table frame is no card (an empty state inside it is never drawn as one). */
export function CardEdge({ row = false, ring = false, cut = CARD_CUT, mark = 'card' }: { row?: boolean; ring?: boolean; cut?: number; mark?: 'card' | 'table' }) {
  const nested = useContext(InCard) && !row;
  const ref = useRef<SVGSVGElement>(null);
  const size = useFrameSize(ref, row ? 'row' : 'parent', !nested);
  if (nested) return null;
  const draw = size !== null && size.w > cut && size.h > cut;
  return (
    <svg ref={ref} className={s.edge} width={draw ? size.w : 0} height={draw ? size.h : 0} aria-hidden="true" focusable="false" data-card-edge={mark === 'card' ? '' : undefined} data-table-edge={mark === 'table' ? '' : undefined}>
      {draw && <path d={cutFramePath(size.w, size.h, cut)} />}
      {draw && (row || ring) && <path className={s.ring} d={cutRingPath(size.w, size.h, cut)} />}
    </svg>
  );
}
