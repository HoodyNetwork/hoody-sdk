// One status line that stays mounted: a live region that mounts together with its
// words may go unheard on some screen reader and browser pairs, so a page that says what is going on now ("Starting the
// run…", "Reading…") keeps this element in place and changes only its words. It is the one live region of its line:
// put Outcome and Band beside it (they carry their own role), never inside it, and wrap it in no aria-live.
import type { ReactNode } from 'react';
import s from './StatusLine.module.css';

export interface StatusLineProps {
  /** What is going on now, in one short line; nothing (null, false, '') keeps the empty line in place. */
  children?: ReactNode;
}

const nothing = (c: ReactNode): boolean => c === null || c === undefined || c === false || c === '' || (Array.isArray(c) && c.every(nothing));

export function StatusLine({ children }: StatusLineProps) {
  const empty = nothing(children);
  return (
    <p className={s.line} role="status" aria-live="polite" aria-atomic="true" data-empty={empty ? '' : undefined}>
      {empty ? null : children}
    </p>
  );
}
