// The Activity log's place in the page's one scroll (ActivityTab.tsx ActivityLog: the follow rule, Load older's anchor,
// Show and Jump to newest): which box scrolls it, what part of the screen it shows in, and the document-wide scroll and
// resize hearing. Moved out of ActivityTab.tsx so the terminal (activityScroll.term.ts) answers from its own Scroll.

import { SHOW_GAP } from './activityScroll.pure';
export { FOLLOW_LINE, SHOW_GAP, atEnd, noteSeen, toEnd } from './activityScroll.pure';

/** The box the log scrolls in: the nearest ancestor that scrolls (the Bot page's detail pane, the phone's main area, a Board
 *  tile), else the page. Asked each time: a resize can move the scroll from one box to another. */
export function scrollerOf(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}
/** Brings an element's top on screen in the page's one scroll, under any stuck bar (the kit Tabs strip), when it is not on
 *  screen already: the Details panel opened from the header may start above the reader's place in a long thread. */
export function bringTopIntoView(el: HTMLElement | null): boolean {
  const v = visibleOf(el);
  const sc = scrollerOf(el);
  if (!el || !v || !sc) return false;
  const r = el.getBoundingClientRect();
  if (r.top >= v.top - 1 && r.top <= v.bottom - SHOW_GAP * 6) return false;
  sc.scrollTop += r.top - v.top - SHOW_GAP;
  return true;
}
export const rowTopIn = (col: HTMLElement | null, seq: number) => col?.querySelector<HTMLElement>(`li[data-seq="${seq}"]`)?.getBoundingClientRect().top;
/** The part of the screen the log shows in: its scroller's box, below anything stuck at its top (the page's header and tab
 *  strip, sticky before the log) and above the tab's dock (sticky over the scroll's end). */
export function visibleOf(col: HTMLElement | null): { top: number; bottom: number } | null {
  const sc = scrollerOf(col);
  if (!sc || !col) return null;
  const a = sc === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : sc.getBoundingClientRect();
  let top = a.top;
  // A sticky element before the log, or a child of one (the kit Tabs' sticky bar sits inside the Tabs root), stuck at the top.
  const stuck = (el: Element) => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'sticky') return;
    const r = el.getBoundingClientRect();
    if (r.bottom > top && r.top <= a.top + (Number.parseFloat(cs.top) || 0) + 1) top = r.bottom;
  };
  for (let el: Element | null = col; el && el !== sc; el = el.parentElement) {
    for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) {
      stuck(sib);
      for (const kid of Array.from(sib.children)) stuck(kid);
    }
  }
  const dock = col.closest('[data-activity]')?.querySelector(':scope > [data-say-dock]');
  return { top, bottom: dock ? Math.min(a.bottom, dock.getBoundingClientRect().top) : a.bottom };
}

/** A scroll event is the scroll of `sc` (the page's own scroll arrives with the document as its target). */
export const isScrollOf = (e: Event, sc: HTMLElement): boolean => (e.target === document ? document.scrollingElement : e.target) === sc;
/** Hears every scroll in the document (capture: scroll events do not bubble); returns the stop. */
export function onAnyScroll(on: (e: Event) => void): () => void {
  document.addEventListener('scroll', on, { capture: true, passive: true });
  return () => document.removeEventListener('scroll', on, { capture: true });
}
/** Calls `on` when the log column or its tab's dock changes size; returns the stop (nothing without ResizeObserver). */
export function observeLogResize(col: HTMLElement, on: () => void): (() => void) | undefined {
  if (typeof ResizeObserver === 'undefined') return undefined;
  const ro = new ResizeObserver(on);
  ro.observe(col);
  const dock = col.closest('[data-activity]')?.querySelector(':scope > [data-say-dock]');
  if (dock) ro.observe(dock);
  return () => ro.disconnect();
}
