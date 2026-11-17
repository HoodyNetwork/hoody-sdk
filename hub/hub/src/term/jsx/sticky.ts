// `position: sticky` for compat boxes (css-translate keeps `sticky: { top?, bottom? }` in cells). The box is laid out
// in flow, as CSS does; on every frame it is offset (translateY: paint only, the layout is untouched, as in CSS) so it
// stays inside the nearest scroll box's viewport, never leaving its containing block (its parent box):
//   top:    offset = max(0, viewportTop + top - naturalTop),             at most parentBottom - naturalBottom
//   bottom: offset = min(0, viewportBottom - bottom - naturalBottom),    at least parentTop - naturalTop
// With no scroll box above it, it stays in place (the terminal screen itself never scrolls).
import { createContext, useLayoutEffect, type RefObject } from 'react';

export interface StickySpec { top?: number; bottom?: number }

/** A rectangle on the screen, rows only (a page scrolls on one axis). */
export interface Span { top: number; height: number }

/** The offset (rows, + down) for a sticky box at `natural` inside `viewport`, held inside `container`. Pure. */
export function stickyOffset(spec: StickySpec, natural: Span, viewport: Span, container: Span): number {
  let off = 0;
  const natBottom = natural.top + natural.height;
  if (spec.top !== undefined) {
    off = Math.max(0, viewport.top + spec.top - natural.top);
    off = Math.min(off, container.top + container.height - natBottom);
    off = Math.max(0, off);
  }
  if (spec.bottom !== undefined && off === 0) {
    let b = Math.min(0, viewport.top + viewport.height - spec.bottom - natBottom);
    b = Math.max(b, container.top - natural.top);
    off = Math.min(0, b);
  }
  return off;
}

/** The engine node, as far as this module reads it. */
interface StickNode {
  isDestroyed?: boolean;
  screenY: number;
  height: number;
  translateY: number;
  parent?: StickNode | null;
  onLifecyclePass?: (() => void) | null;
  zIndex?: number;
  viewport?: { screenY: number; height: number };
  scrollTop?: number;
}

/** The nearest scroll box above `n` (an engine ScrollBox: it has a viewport and a scroll position). */
function scrollBoxOf(n: StickNode): StickNode | null {
  for (let p = n.parent ?? null; p; p = p.parent ?? null) if (p.viewport && typeof p.scrollTop === 'number') return p;
  return null;
}

/** Keeps the box behind `node` sticky while mounted (nothing when `spec` is undefined). */
export function useSticky(node: RefObject<unknown> | (() => unknown), spec: StickySpec | undefined): void {
  const top = spec?.top;
  const bottom = spec?.bottom;
  const on = spec !== undefined;
  useLayoutEffect(() => {
    if (!on) return;
    const n = (typeof node === 'function' ? node() : node.current) as StickNode | null;
    if (!n) return;
    const s: StickySpec = { ...(top !== undefined ? { top } : {}), ...(bottom !== undefined ? { bottom } : {}) };
    // Neither inset given: CSS sticks to nothing; keep it in flow.
    if (s.top === undefined && s.bottom === undefined) return;
    const pass = (): void => {
      if (n.isDestroyed) return;
      const sb = scrollBoxOf(n);
      const parent = n.parent ?? null;
      if (!sb?.viewport || !parent) { if (n.translateY !== 0) n.translateY = 0; return; }
      const natural = { top: n.screenY - n.translateY, height: n.height };
      const off = stickyOffset(s, natural, { top: sb.viewport.screenY, height: sb.viewport.height }, { top: parent.screenY, height: parent.height });
      if (off !== n.translateY) n.translateY = off;
    };
    // A positioned box paints above the in-flow content after it (CSS: z-index auto on a positioned box): at least 1.
    const z0 = n.zIndex ?? 0;
    if (z0 < 1) n.zIndex = 1;
    const before = n.onLifecyclePass ?? null;
    n.onLifecyclePass = before ? () => { before(); pass(); } : pass;
    live.set(n, s);
    // Read by prim/layoutcheck.ts: a sticky box stuck over what it scrolls over is not an overdraw.
    (n as { __hxSticky?: boolean }).__hxSticky = true;
    return () => { live.delete(n); delete (n as { __hxSticky?: boolean }).__hxSticky; if (!n.isDestroyed) { n.onLifecyclePass = before; n.translateY = 0; n.zIndex = z0; } };
  }, [node, on, top, bottom]);
}

/** Sticky boxes mounted now, with their insets (scroll owners read them for stickyPadding). */
const live = new Map<StickNode, StickySpec>();

/** Rows each edge of a scroll box's viewport is covered by its sticky descendants (the web's effect of scroll-padding:
 *  a focused thing scrolled "into view" under a sticky footer is not in view). A sticky box holding `except` (the focused
 *  node itself is in the footer) covers nothing for it. */
export function stickyPadding(scroll: unknown, except?: unknown): { top: number; bottom: number } {
  const pad = { top: 0, bottom: 0 };
  for (const [n, s] of live) {
    if (n.isDestroyed || scrollBoxOf(n) !== scroll) continue;
    let inside = false;
    for (let p = except as StickNode | null | undefined; p; p = p.parent ?? null) if (p === n) { inside = true; break; }
    if (inside) continue;
    if (s.top !== undefined) pad.top = Math.max(pad.top, s.top + n.height);
    if (s.bottom !== undefined) pad.bottom = Math.max(pad.bottom, s.bottom + n.height);
  }
  return pad;
}

/** The scroll position that shows rows [top, top + height) of the content clear of the covered edges, moving as little
 *  as possible; a thing taller than the room left shows its top. Pure. */
export function clearOfSticky(target: Span, scrollTop: number, viewportHeight: number, pad: { top: number; bottom: number }): number {
  let st = scrollTop;
  const room = viewportHeight - pad.bottom;
  if (target.top + target.height > st + room) st = target.top + target.height - room;
  if (target.top < st + pad.top) st = target.top - pad.top;
  return Math.max(0, st);
}

/** True for a compat box drawn straight under the shell's page outlet while it scrolls (kit/layouts/termScroll.tsx
 *  PageOutlet): its parent there is the web's block scroll container, so its own flex shrink/basis do not apply. */
export const PageFlowRoot = createContext(false);

/** A ListDetail pane's detail that scrolls whole in the pane (a plain detail, not a DetailPage): its DetailHeader sticks
 *  at the top and reports its rows here, so a sticky tab strip below it sticks under it (the web's --tabs-sticky-top:
 *  --detail-head-h). The header reports its rows whether or not anything sticks (`on` false: a short terminal), so they
 *  are known the moment sticking turns on: a terminal that only grows taller lays the header out at the height it had,
 *  and the engine reports a size only when it changes. Null outside such a pane. */
export interface DetailStick { on: boolean; head: number; setHead: (rows: number) => void }
export const DetailStickCtx = createContext<DetailStick | null>(null);
