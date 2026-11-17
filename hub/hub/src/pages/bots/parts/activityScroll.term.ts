// The Activity log's scroll in the terminal. The web follows the log's end in the page's one scroll, so the newest row
// sits above the sticky chat-box dock (the newest message must sit above the dock, as on the web). Here the
// scroller is the engine scroll box around the log (the page's Scroll), answered in the web's px (one row = 16 px, the
// compat element's getBoundingClientRect rule) so the pure follow rule keeps its web values (FOLLOW_LINE 24 px = 1.5
// rows). There is no document to hear: scroll and size changes come from the engine scroll box's own events.
// Load older's anchor (rowTopIn) and the card measure's visible part (visibleOf, the scroll's viewport) keep their simple
// forms. The chat box's focus is no search here: the tab holds the box's own input (chatBox.ts), on both.
import type * as Web from './activityScroll';

export { FOLLOW_LINE, SHOW_GAP, atEnd, noteSeen, toEnd } from './activityScroll.pure';

const ROW_PX = 16;

interface ScrollBoxLike { scrollTop: number; scrollHeight: number; viewport: { y: number; height: number }; isDestroyed?: boolean; parent?: unknown }
interface NodeUp { parent?: unknown }

const isScrollBox = (n: unknown): n is ScrollBoxLike =>
  !!n && typeof n === 'object' && typeof (n as ScrollBoxLike).scrollHeight === 'number' && typeof (n as ScrollBoxLike).scrollTop === 'number' && typeof (n as ScrollBoxLike).viewport === 'object';

/** One adapter per engine scroll box, so the same scroller is the same object each time it is asked (isScrollOf, scRef). */
const adapters = new WeakMap<ScrollBoxLike, HTMLElement>();
const boxes = new WeakMap<object, ScrollBoxLike>();
function adapterOf(b: ScrollBoxLike): HTMLElement {
  let a = adapters.get(b);
  if (!a) {
    const shape = {
      get scrollTop() { return b.scrollTop * ROW_PX; },
      set scrollTop(v: number) { b.scrollTop = Math.max(0, Math.round(v / ROW_PX)); },
      get scrollHeight() { return b.scrollHeight * ROW_PX; },
      get clientHeight() { return b.viewport.height * ROW_PX; },
    };
    a = shape as unknown as HTMLElement; // contract-any: an element-shaped scroller; a terminal scroll box has no DOM element
    adapters.set(b, a);
    boxes.set(a, b);
  }
  return a;
}
const boxOf = (sc: HTMLElement | null): ScrollBoxLike | null => (sc ? boxes.get(sc) ?? null : null);
/** The engine node of a compat element (its `__node()`), or null for anything else. */
const nodeOf = (el: HTMLElement | null): NodeUp | null => {
  if (!el || !('__node' in el)) return null;
  const f: unknown = el.__node;
  if (typeof f !== 'function') return null;
  const n: unknown = f.call(el);
  return n && typeof n === 'object' ? n : null;
};

export const scrollerOf: typeof Web.scrollerOf = (el) => {
  for (let n = nodeOf(el)?.parent ?? null; n; n = (n as NodeUp).parent ?? null) {
    if (isScrollBox(n) && n.isDestroyed !== true) return adapterOf(n);
  }
  return null;
};
export const visibleOf: typeof Web.visibleOf = (col) => {
  const b = boxOf(scrollerOf(col));
  return b ? { top: b.viewport.y * ROW_PX, bottom: (b.viewport.y + b.viewport.height) * ROW_PX } : null;
};
export const rowTopIn: typeof Web.rowTopIn = () => undefined;
export const bringTopIntoView: typeof Web.bringTopIntoView = () => false;
export const isScrollOf: typeof Web.isScrollOf = (e, sc) => e.target === sc;

/**
 * Hearing, from the engine's own callbacks (no timer: an idle page does nothing). Each scroll box the log is found in
 * (observeLogResize) is watched while a log observes it: its vertical bar's "change" (the offset moved, by a key, the
 * wheel or toEnd) reaches every onAnyScroll listener as a scroll event whose target is the box's adapter; its content's
 * and viewport's "resize" (the log grew, a row wrapped, the terminal resized) call the log's `on`, as the web's
 * ResizeObserver does, once more after the next layout (the observer's first call).
 */
interface Part { on(ev: string, f: () => void): unknown; off(ev: string, f: () => void): unknown }
interface EngineBox extends ScrollBoxLike { verticalScrollBar?: Part; content?: Part; viewport: ScrollBoxLike['viewport'] & Partial<Part>; afterLayout?(f: () => void): void }
const scrollListeners = new Set<(e: Event) => void>();
const watched = new Map<ScrollBoxLike, { n: number; off: () => void }>();
function watch(b: EngineBox): () => void {
  const w = watched.get(b) ?? listenTo(b);
  w.n++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    w.n--;
    if (w.n === 0) { w.off(); watched.delete(b); }
  };
}
function listenTo(b: EngineBox): { n: number; off: () => void } {
  const bar = b.verticalScrollBar;
  const moved = (): void => {
    const e = { target: adapterOf(b) } as unknown as Event; // contract-any: a scroll event stand-in; a terminal has no DOM Event
    for (const on of [...scrollListeners]) on(e);
  };
  bar?.on('change', moved);
  const w = { n: 0, off: (): void => { bar?.off('change', moved); } };
  watched.set(b, w);
  return w;
}
export const onAnyScroll: typeof Web.onAnyScroll = (on) => {
  scrollListeners.add(on);
  return () => { scrollListeners.delete(on); };
};
export const observeLogResize: typeof Web.observeLogResize = (col, on) => {
  const b = boxOf(scrollerOf(col)) as EngineBox | null;
  if (!b || b.isDestroyed === true) return undefined;
  let alive = true;
  // A resize is heard while the engine lays the new size out: what the log then reads (the card's place, the end) can be
  // the layout before. So each resize is answered again once the next layout is done (one more call, never a chain: only
  // a resize asks). Without it a 200x50 → 120x40 resize left the card read as off screen and the "Waiting for you" strip
  // drawn under a card in full view, the log one row off its end.
  let again = false;
  const sized = (): void => {
    if (!alive) return;
    on();
    if (again || typeof b.afterLayout !== 'function' || b.isDestroyed === true) return;
    again = true;
    b.afterLayout(() => { again = false; if (alive && b.isDestroyed !== true) on(); });
  };
  const unwatch = watch(b);
  const parts = [b.content, b.viewport].filter((p): p is Part => typeof p?.on === 'function' && typeof p.off === 'function');
  for (const p of parts) p.on('resize', sized);
  b.afterLayout?.(() => { if (alive) on(); });
  return () => {
    alive = false;
    unwatch();
    if (b.isDestroyed !== true) for (const p of parts) p.off('resize', sized);
  };
};
