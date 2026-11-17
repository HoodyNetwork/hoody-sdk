// Scroll: a Box whose content scrolls (wheel, and keys when it has the focus through the engine).
import { useMemo, useRef, useState, type ReactElement, type Ref, useEffect } from 'react';
import { el, type ScrollBoxRenderable } from './otui';
import { layoutOf, type BoxProps } from './Box';
import { mergeRefs, useSem } from './semantics';
import { useFocusedNode } from './focus';
import { colour, colourTier } from './tokens';

export interface ScrollProps extends Omit<BoxProps, 'boxRef' | 'wrap' | 'clip'> {
  /** Keep the end in view as content is added (logs). */
  stickBottom?: boolean;
  scrollRef?: Ref<ScrollBoxRenderable>;
  /** Keep the focused thing in view: Tab to something below the fold scrolls it up (the browser's focus scroll). */
  followFocus?: boolean;
}

export function Scroll(p: ScrollProps): ReactElement {
  const { flexDirection, gap, paddingX, paddingY, ...outer } = layoutOf(p) as Record<string, unknown>;
  const sized = p.height !== undefined || (p.grow ?? 0) > 0 || p.basis !== undefined;
  const props: Record<string, unknown> = {
    ...outer,
    // Unsized: the content keeps its own height (the engine otherwise stretches it to the viewport), so its height is
    // what the box is capped to below.
    contentOptions: { flexDirection, ...(gap !== undefined && { gap }), ...(paddingX !== undefined && { paddingX }), ...(paddingY !== undefined && { paddingY }), ...(!sized && { minHeight: 0 }) },
    scrollY: true,
    viewportCulling: true,
  };
  if (p.stickBottom) Object.assign(props, { stickyScroll: true, stickyStart: 'bottom' });
  // The scrollbar is quiet: the thumb in the strong line colour on a track in the line colour, the two tones every
  // border on the page already uses. The engine's own thumb (#9a9ea3) was the brightest mark on a page, beside every
  // card's border. Only where the Hub paints its grounds (truecolor): the 16-colour tier has one grey for both lines,
  // so it keeps the engine's pair, and mono has no colours.
  const thumb = colourTier() === 'truecolor' ? colour('lineStrong') : undefined;
  const track = colourTier() === 'truecolor' ? colour('line') : undefined;
  // One object while the colours stand (a new one each render would re-set the engine's bar each render).
  const bar = useMemo(() => (thumb && track ? { trackOptions: { foregroundColor: thumb, backgroundColor: track } } : null), [thumb, track]);
  if (bar) props.scrollbarOptions = bar;
  const semRef = useSem(p.sem, {});
  const self = useRef<ScrollBoxRenderable | null>(null);
  // A Scroll with no size of its own (no height, no grow, no basis) is as tall as its content, at most the room it is
  // given, as a CSS `overflow: auto` box in an auto-height column. The engine's scrollbox instead took the height of the
  // nearest sized ancestor (a 6-row picker list stood 281 rows tall, and every box around it was measured shorter than
  // its child: Bots settings, Helpers). Its content's laid-out height caps it.
  const [contentH, setContentH] = useState<number | null>(null);
  useEffect(() => {
    const content = (self.current as unknown as { content?: { height: number; onSizeChange?: () => void } } | null)?.content;
    if (sized || !content) return;
    const read = (): void => { const h = content.height; setContentH((o) => (o === h ? o : h)); };
    content.onSizeChange = read;
    read();
    return () => { content.onSizeChange = undefined; };
  }, [sized]);
  // 0 = not measured yet (the panel had no width when the content was first read: its children are not laid out). A
  // cap of 0 would keep them unlaid for good (a Dialog body that never showed), so no cap until a real height.
  if (!sized && contentH !== null && contentH > 0) {
    // Padding sits on the content (contentOptions), so it is inside the content's height already.
    const cap = contentH;
    props.maxHeight = typeof p.maxHeight === 'number' ? Math.min(p.maxHeight, cap) : p.maxHeight === undefined ? cap : p.maxHeight;
  }
  props.ref = useMemo(() => mergeRefs(p.scrollRef, semRef, self), [p.scrollRef, semRef]);
  const follow = p.followFocus === true;
  // Read by focus.ts clipping-aware Tab: a following scroll brings a clipped focusable into view, so Tab may stop on it.
  if (self.current) (self.current as unknown as { hxFollowFocus?: boolean }).hxFollowFocus = follow;
  useEffect(() => { if (self.current) (self.current as unknown as { hxFollowFocus?: boolean }).hxFollowFocus = follow; });
  useFocusedNode((node, how) => {
    const box = self.current;
    // An autoFocus nobody asked for never scrolls (a browser does not scroll the page to it): only Tab, a click, focus().
    if (!follow || !box || !node || how === 'auto') return;
    // Only a node inside this scroll's content.
    for (let n: { parent?: unknown } | null = node as unknown as { parent?: unknown }; n; n = (n.parent as { parent?: unknown } | null | undefined) ?? null) {
      if (n === (box as unknown)) { try { box.scrollChildIntoView(revealTarget(node, box) as never, { align: 'nearest' }); } catch { /* gone mid-scroll */ } return; }
    }
  });
  return el('scrollbox', props, p.children);
}

/** Marks a box that is brought into view whole when focus lands inside it (a field: label, control, description). */
export const REVEAL_FRAME = 'hxRevealFrame';
/** What a focus scroll brings into view: the nearest enclosing reveal frame (FieldFrame) when it fits the viewport, so
 *  a field reached by Shift+Tab (scrolling up) shows its label, not just its control at the top edge (the New realm
 *  "Name" field at 80x24); else the focused node itself. */
export function revealTarget<T>(node: T, box: unknown): T {
  const view = (box as { viewport?: { height?: number } }).viewport?.height;
  for (let n = (node as unknown as { parent?: unknown } | null); n && n !== box; n = (n.parent as { parent?: unknown } | null | undefined) ?? null) {
    if ((n as Record<string, unknown>)[REVEAL_FRAME] === true) {
      const h = (n as { height?: number }).height ?? 0;
      return (view === undefined || h <= view ? n : node) as T;
    }
  }
  return node;
}
