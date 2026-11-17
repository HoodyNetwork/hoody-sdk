// The overlays' DOM half in the terminal. A closed overlay has no exit to wait out, so a waiter runs on the next
// task; a terminal overlay puts the focus back itself (prim focus scope), so there is no title element to fall back
// to and nothing to return; a scrolling body takes the scroll keys itself, so it never needs a Tab stop of its own.
import type * as Web from './shared.dom';

export const afterFrames: typeof Web.afterFrames = (run) => {
  const timer = setTimeout(run, 0);
  return () => clearTimeout(timer);
};

export const pageTitle: typeof Web.pageTitle = () => null;

export const useFocusReturn: typeof Web.useFocusReturn = () => {};

export const useScrollReach: typeof Web.useScrollReach = () => false;
