// Scroll mode keeps the active tile in view.
//
// Contract, in plain words:
//   - scrollTopFor(box, top, viewH) is the scroll position that shows the box in a view viewH px tall now scrolled
//     to top, or null when the box is already wholly shown. A box below the view comes in with its bottom at the
//     view's bottom; one above it, or one taller than the view, with its top at the view's top (PAD kept).
//   - useFollowActive scrolls the Board's view when the active tile, its box, the Board or the view's height
//     changes and the tile is out of view, so the keyboard, the Picker, focus moves and a smaller window never
//     leave the active tile hidden. It never scrolls in Fit, never while a tile or divider is dragged (the view
//     under the pointer stays still; it catches up on release), and never animates under reduced motion. A newer
//     target cancels a smooth scroll still on its way to an older one. A view the person scrolled stays put until
//     one of those changes.
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { motionOff } from '@kit';
import type { Box } from '../model/geom';
import { PAD } from '../model/geom';
import type { BoardMode } from './mode';

export function scrollTopFor(box: Box, top: number, viewH: number): number | null {
  const lo = box.top - PAD, hi = box.top + box.height + PAD;
  if (lo >= top && hi <= top + viewH) return null;
  if (lo < top || hi - lo > viewH) return Math.max(0, lo);
  return Math.max(0, hi - viewH);
}

// The system's reduced motion or Performance mode: the kit's one test.
const reducedMotion = motionOff;

export interface Follow {
  /** The Board and its active slot (a Board switch with the same slot ids still follows). */
  readonly key: string;
  /** The active tile's box in the area, or undefined when nothing scrolls (one at a time, maximised). */
  readonly box: Box | undefined;
  /** The view's measured height. */
  readonly viewH: number;
  readonly mode: BoardMode;
  /** A tile or divider drag is on. */
  readonly paused: boolean;
}

export function useFollowActive(view: RefObject<HTMLElement | null>, f: Follow): void {
  const top = f.box?.top, height = f.box?.height;
  // A smooth scroll this hook started and the browser has not finished yet.
  const gliding = useRef(false);
  useLayoutEffect(() => {
    const el = view.current;
    if (!el) return;
    const end = () => { gliding.current = false; };
    el.addEventListener('scrollend', end);
    return () => el.removeEventListener('scrollend', end);
  }, [view]);
  useLayoutEffect(() => {
    const el = view.current;
    if (!el) return;
    // Stops a glide this hook started where it is now ('instant', so no smooth scroll-behavior animates it again).
    const stop = () => {
      if (gliding.current && typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollTop, behavior: 'instant' });
      gliding.current = false;
    };
    // A drag, Fit, or nothing to follow: the view holds still, so a glide still running stops too.
    if (f.mode !== 'scroll' || f.paused || top === undefined || height === undefined) { stop(); return; }
    const next = scrollTopFor({ left: 0, width: 0, top, height }, el.scrollTop, el.clientHeight);
    // Shown where the view is now: stop a glide still heading for an older target.
    if (next === null) { stop(); return; }
    const smooth = !reducedMotion();
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: next, behavior: smooth ? 'smooth' : 'auto' });
    else el.scrollTop = next;
    gliding.current = smooth;
  }, [view, f.key, top, height, f.viewH, f.mode, f.paused]);
}
