// A small count beside a label: unread items on a nav row, tasks on a tab, alerts on an icon. Use `Tag` for a word and
// `StatusPill` for a state instead; this is only ever a number. The consumer places it (inline, or pinned to an icon
// through `className`); the badge owns its box, type and colours.
import { cx } from './Button';
import { SR_ONLY } from './SrOnly';
import s from './CountBadge.module.css';

export interface CountBadgeProps {
  count: number;
  /** Counts above this show as "<max>+". */
  max?: number;
  /** The count is a lower bound ("at least N"): it shows "N+" (still capped at `max`). */
  atLeast?: boolean;
  /** Hide the badge from assistive tech, when the link or button it sits in already names the count. */
  hidden?: boolean;
  /** `accent`: the count asks for attention (something is waiting on the person). */
  tone?: 'neutral' | 'accent';
  /** The count in words for assistive tech ("3 unread"), read in place of the bare number. */
  label?: string;
  /** Placement only (position, margin): the box and colours are the badge's. */
  className?: string;
}

/** The count as shown: whole, never negative, capped at `max`; a lower bound gets a "+". */
export function countText(count: number, max: number, atLeast = false): string {
  const n = Math.max(0, Math.floor(count));
  if (n > max) return `${max}+`;
  return atLeast ? `${n}+` : String(n);
}

export function CountBadge({ count, max = 99, atLeast = false, hidden = false, tone = 'neutral', label, className }: CountBadgeProps) {
  const text = countText(count, max, atLeast);
  return (
    <span className={cx(s.badge, tone === 'accent' && s.accent, className)} data-count-badge={tone} aria-hidden={hidden || undefined}>
      {label && !hidden ? (
        <>
          <span aria-hidden="true">{text}</span>
          <span className={SR_ONLY}>{label}</span>
        </>
      ) : (
        text
      )}
    </span>
  );
}
