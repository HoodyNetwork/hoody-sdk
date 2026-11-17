// The wheel scrolls a short capped pick list the pointer is over (PickerPanel maxRows, ModelPickList, the FileChooser
// list), also mid-run of an outer scroll. A browser may keep scrolling the box a run of wheel ticks started on: Firefox
// keeps its wheel transaction on that box up to 1.5 s after each tick until the pointer moves, so a person who wheels a
// drawer until the list slides under the resting pointer keeps scrolling the drawer, however long they wheel, while the
// list's own scrollbar still works. The ticks themselves are still dispatched at the list (seen in Firefox), so a
// listener on the list can take them: while the list can still move in the tick's direction, it moves the list and
// cancels the browser's scroll. At the list's end the browser decides (the list's overscroll-behavior keeps the outer
// box still). Zoom (Ctrl/Meta), Shift and sideways ticks and a tick a handler inside already took are left alone.
// Only the element itself listens (not passive); every other scroller keeps the browser's own scrolling.
// The list takes every vertical tick inside it, so it is for lists whose rows hold no scroller of their own. Inside the
// list the move is instant (no smooth wheel animation or rubber band); touchpad momentum still arrives as ticks.
import { type RefObject, useEffect, useRef } from 'react';

/** Pixels per line for a line-mode tick (Firefox's mouse wheel reports lines). */
const LINE_PX = 16;

/** The tick's vertical move in pixels: pixel ticks as they are, lines and pages converted. */
export function wheelDeltaPx(e: WheelEvent, box: HTMLElement): number {
  if (e.deltaMode === 1) return e.deltaY * LINE_PX;
  if (e.deltaMode === 2) return e.deltaY * box.clientHeight;
  return e.deltaY;
}

const canMove = (box: HTMLElement, dy: number): boolean => (dy > 0 ? box.scrollTop + box.clientHeight < box.scrollHeight - 1 : dy < 0 && box.scrollTop > 0);

/** The listener for one capped list, exported for its test. */
export function takeWheel(box: HTMLElement, e: WheelEvent): void {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  const dy = wheelDeltaPx(e, box);
  if (!canMove(box, dy)) return;
  e.preventDefault();
  box.scrollTop += dy;
}

/** Makes the wheel move the capped list `ref` holds while `on` (a list that is not capped passes false). */
export function useInnerWheel(ref: RefObject<HTMLElement | null>, on = true): void {
  const bound = useRef<{ el: HTMLElement; off: () => void } | null>(null);
  // After every render: the element behind the ref may change (a list that remounts), and only that element listens.
  useEffect(() => {
    const el = on ? ref.current : null;
    if (bound.current?.el === el) return;
    bound.current?.off();
    bound.current = null;
    if (!el) return;
    const h = (e: WheelEvent) => takeWheel(el, e);
    el.addEventListener('wheel', h, { passive: false });
    bound.current = { el, off: () => el.removeEventListener('wheel', h) };
  });
  useEffect(
    () => () => {
      bound.current?.off();
      bound.current = null;
    },
    [],
  );
}
