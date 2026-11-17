// The two panes' room for the split bounds (TwoPanes in twoPanes.tsx): read now, and again whenever the grid resizes.
// Web only: the terminal draws the panes with twoPanes.term.tsx, which measures its own row and never loads this file
// (ResizeObserver is a DOM global the terminal Hub does not have; reading it, even with typeof, stops the page there).

/** Calls `read` now and on every resize of `el`; returns the stop function. */
export function watchPaneRoom(el: Element, read: () => void): () => void {
  read();
  if (typeof ResizeObserver === 'undefined') return () => {};
  const ro = new ResizeObserver(read);
  ro.observe(el);
  return () => ro.disconnect();
}
