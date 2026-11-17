// A frame with a slanted bottom-right corner: one 1 px line drawn by an SVG path, its corner cut
// by `cut` px, and the content clipped to the same outline. It is never a CSS border or a gradient. The path is
// redrawn whenever the frame changes size, before the browser paints (useFrameSize). The line is the panel line
// (the Hub's card border colour), and the content's own background shows inside it.
import { useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import s from './CutFrame.module.css';

/** The outline of a w × h frame: one 1 px line on the half pixel, its bottom-right corner cut by `cut`. */
export function cutFramePath(w: number, h: number, cut: number): string {
  const r = w - 0.5;
  const b = h - 0.5;
  return `M0.5 0.5H${r}V${b - cut}L${r - cut} ${b}H0.5Z`;
}

/** Which element a slanted line is drawn around, seen from the element the ref holds: itself (CutFrame), its parent (a
 * card's CardEdge) or the table row around it (a card-table row's CardEdge). */
export type FrameOf = 'self' | 'parent' | 'row';

/**
 * The size of the frame a slanted line is drawn around, for both writers of one (CutFrame and CardEdge). It
 * measures the frame itself and watches it, and a resize sets the new size before the browser paints: the observer runs
 * after layout and before paint, and a plain state update from it would render after the paint, so for a frame or more
 * the line showed at its old size. flushSync renders it inside the callback.
 */
export function useFrameSize(ref: RefObject<Element | null>, of: FrameOf, enabled = true): { w: number; h: number } | null {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    const el = of === 'self' ? node : of === 'row' ? node?.closest('tr') : node?.parentElement;
    if (!(el instanceof HTMLElement)) return;
    // Size only: where the line sits and what is clipped come from CSS, never from here. The layout box floored: offset
    // sizes round a fractional box UP (159.5 reads 160), which puts the line on the h - 0.5 half pixel exactly on the clipped
    // edge and hides a card's bottom line. Where the box reads 0 (no layout yet, a test DOM) the offset size stands.
    const read = () => {
      const r = el.getBoundingClientRect();
      const w = r.width > 0 ? Math.floor(r.width) : el.offsetWidth;
      const h = r.height > 0 ? Math.floor(r.height) : el.offsetHeight;
      setSize((p) => (p && p.w === w && p.h === h ? p : { w, h }));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => flushSync(read));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, of, enabled]);
  return size;
}

export interface CutFrameProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** The element the frame is (an article for a card in a list). */
  as?: 'div' | 'article' | 'section';
  /** The corner's size in px (16 by default, the Hub's card corner). */
  cut?: number;
  /** Classes of the clipped inner box, which holds the content and its background. */
  innerClassName?: string;
  children: ReactNode;
}

export function CutFrame({ as: Tag = 'div', cut = 16, className, innerClassName, style, children, ...rest }: CutFrameProps) {
  const frame = useRef<HTMLElement>(null);
  const size = useFrameSize(frame, 'self');
  return (
    <Tag {...rest} ref={frame as RefObject<never>} className={className ? `${s.frame} ${className}` : s.frame} style={{ ...style, ['--cut' as string]: `${cut}px` } as CSSProperties}>
      <div className={innerClassName ? `${s.inner} ${innerClassName}` : s.inner}>
        {children}
      </div>
      {size && size.w > cut && size.h > cut ? (
        <svg className={s.edge} width={size.w} height={size.h} aria-hidden="true" data-cut-edge="">
          <path d={cutFramePath(size.w, size.h, cut)} />
        </svg>
      ) : null}
    </Tag>
  );
}
