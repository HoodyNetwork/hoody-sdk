// Handoff: a part that only exists on the web. On the web it IS that part (renders its children); a terminal sibling
// (Handoff.term.tsx) draws one line of why, the whole web address and a key to copy it. API: see HandoffProps.
import type { ReactElement, ReactNode } from 'react';

export { hubWebAddress, HUB_WEB_PATH } from './handoff.pure';

export interface HandoffProps {
  /** Why it is not here: one plain sentence ("The chart needs a browser to draw."). */
  reason: string;
  /** Hub route to open on the web ('/schedules'); default: the current route. The terminal hands off only the declared
   *  page path it falls under: search, fragment and anything below the page path are dropped (handoff.pure). */
  to?: string;
  /** The computer the hand-off is about, when the page is about another computer than the shell's (a note on a page
   *  that lists every computer's notes); null: none. Default: the shell's. The terminal sends it only when the shell's
   *  list holds it, as for the shell's own. */
  computer?: string | null;
  /** Short name of the thing for the action line ('chart'); default 'this'. */
  what?: string;
  /** 'line': one row in a form, cell or toolbar. 'block': stands in for a whole area. Default 'block'. */
  size?: 'line' | 'block';
  /** What the web draws. The terminal never renders it. */
  children?: ReactNode;
}

export function Handoff({ children }: HandoffProps): ReactElement | null {
  return children === undefined || children === null || children === false ? null : <>{children}</>;
}
