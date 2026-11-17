// The shell's count marks (the bell, a sidebar row, a bottom tab): the kit CountBadge in a placement box of the shell's.
// Use it wherever the shell pins a count to an icon or a row. The link or button it sits in carries the count in its
// accessible name, so the badge is hidden from assistive tech.
import { CountBadge } from '@kit/controls/CountBadge';

export interface CountMarkProps {
  n: number;
  /** The count is a lower bound ("at least N"): it shows "N+", as a count over 99 does (context.tsx countText). */
  capped?: boolean;
  tone?: 'neutral' | 'accent';
  /** Placement only: where the mark sits on its icon or in its row. The badge draws its own box, colours and lines. */
  className?: string;
}

export function CountMark({ n, capped = false, tone, className }: CountMarkProps) {
  return (
    <span className={className}>
      <CountBadge count={n} atLeast={capped} hidden tone={tone} />
    </span>
  );
}
