// A named scroll container the keyboard can reach: one tab stop, so the arrows and Page keys
// scroll a long document or a wide table. Pages use it instead of hand-building a tabIndex={0} region.
import type { ReactNode } from 'react';
import { cx } from '../controls/Button';
import s from './ScrollRegion.module.css';

export interface ScrollRegionProps {
  /** The region's accessible name ("Plans", the document's name). */
  label: string;
  children: ReactNode;
  /** The direction it scrolls: `block` (down, the default), `inline` (sideways, a wide table) or `both`. */
  axis?: 'block' | 'inline' | 'both';
  /** A bordered card frame around the region, the look of a framed DataTable (a wide table on a page). */
  framed?: boolean;
  /** A kit caller's own size (MarkdownViewer's maximum height); the region owns overflow, positioning and the focus ring. */
  className?: string;
}

export function ScrollRegion({ label, children, axis = 'block', framed = false, className }: ScrollRegionProps) {
  if (import.meta.env.DEV && label.trim() === '') throw new Error('hub ScrollRegion: a region needs a label (its accessible name)');
  return (
    <div
      className={cx(s.region, s[axis], framed && s.framed, className)}
      role="region"
      // A scroll container is not a widget, but without a tab stop a keyboard can't scroll it (WCAG 2.1.1).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see above
      tabIndex={0}
      aria-label={label}
      data-axis={axis}
      data-framed={framed ? '' : undefined}
    >
      {children}
    </div>
  );
}
