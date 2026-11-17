// Hover: the one part the pointer is on. A background only (the `hover` ground), never a mark, a weight or a size, so
// nothing moves when the pointer does; always under focus, current and selected, which the part's own drawing decides
// (useHover says false for a disabled part). Truecolor only: on the 16-colour tier every ground is the terminal's own
// and mono has no colours, so there hover is never true and nothing redraws.
//
// One store, one hovered part at a time: the engine sends no `out` to a box destroyed under the pointer, so a flag per
// part could stay set; here the next part the pointer moves onto replaces it, and a part that unmounts takes its own
// hover with it.
//
// Only a pointer MOVE starts it. The engine also sends `over` on its own after every drawn frame, to whatever sits under
// the place of the last click or wheel step; that alone never sets hover, so a click or a wheel step alone (all a
// recorded frame ever gets) draws none. Once a part is hovered, an `over` in the same turn as that part's `out` moves
// the hover along (the list scrolled under a pointer that did not move) or keeps it (a leaf of the part changed).
//
// A pointer that leaves the terminal window sends nothing more: the hover is dropped when the terminal loses the focus
// (ScreenRoot). A terminal that reports no focus change keeps the last part on the hover ground until the next move.
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { colourTier } from './tokens';

let current: object | null = null;
const subs = new Set<() => void>();
const set = (id: object | null): void => {
  if (current === id) return;
  current = id;
  for (const f of [...subs]) f();
};
const subscribe = (f: () => void): (() => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** The hovered part got an `out` in this turn of the event loop. It loses its hover at the end of the turn unless the
 *  pointer turns out to be on it still (`kept`), or another part takes the hover first. */
let leaving: { id: object; kept: boolean } | null = null;

export interface Hover {
  /** The pointer is on this part (never while `off`, never off the truecolor tier). */
  hovered: boolean;
  /** For the part's Box `raw`. */
  raw: { onMouseMove: () => void; onMouseOut: () => void; onMouseOver: () => void };
}

/** `off`: a disabled part, which never shows hover. */
export function useHover(off = false): Hover {
  const id = useRef<object>({}).current;
  const live = !off && colourTier() === 'truecolor';
  const hovered = useSyncExternalStore(subscribe, () => live && current === id, () => false);
  useEffect(() => () => { if (current === id) set(null); }, [id]);
  useEffect(() => { if (!live && current === id) set(null); }, [live, id]);
  const raw = useMemo(() => ({
    onMouseMove: () => {
      if (colourTier() === 'truecolor') set(id);
    },
    // Not cleared at once: the engine sends `out` and then `over` in one go when the leaf under a pointer that did not
    // move changes (a badge mounting in the row, a list scrolling under the pointer), and `out`, `over`, `move` when the
    // pointer crosses from one leaf to the next inside one part. Clearing here dropped the hover in the first case
    // until the next move and redrew the part twice in the second.
    onMouseOut: () => {
      if (current !== id || leaving?.id === id) return;
      const mine = { id, kept: false };
      leaving = mine;
      queueMicrotask(() => {
        // Its mark was dropped meanwhile (the terminal lost the focus): a hover set since then is a fresh one.
        if (leaving !== mine) return;
        leaving = null;
        if (!mine.kept && current === id) set(null);
      });
    },
    // The engine's `over` alone never sets hover (see the top of this file). It only settles an `out` of the hovered
    // part from this same turn: the pointer is on this part still, or the part that slid under it takes the hover.
    onMouseOver: () => {
      if (!leaving) return;
      if (leaving.id === id) leaving.kept = true;
      set(id);
    },
  }), [id]);
  return { hovered, raw };
}

/** For a part that is a focusable Box of its own, not a Pressable (a tab, an entry of a section menu): spread on that
 *  Box. It takes the pointer handlers and stands on the `hover` ground while hovered, never while focused or `off`. */
export function useHoverFill(off: boolean, focused: boolean): { raw: Hover['raw']; bg?: 'hover' } {
  const h = useHover(off);
  return h.hovered && !focused ? { raw: h.raw, bg: 'hover' } : { raw: h.raw };
}

/** No part is hovered: the terminal lost the focus (ScreenRoot), where no `out` ever arrives for a pointer that left
 *  the window; and tests (the store outlives a test's renderer). */
export function clearHover(): void { leaving = null; set(null); }
/** Tests only: clearHover. */
export function __resetHover(): void { clearHover(); }
