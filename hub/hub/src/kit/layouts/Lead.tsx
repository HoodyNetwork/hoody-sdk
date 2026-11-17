// A page's lead line: the one sentence a welcome or intro card opens with. The type is the kit's, so a page
// never sets display sizes in its own CSS (layout.cssType); the page's class adds only its width or placement.
import type { ReactNode } from 'react';
import { cx } from '../controls/Button';
import s from './Lead.module.css';

export interface LeadProps {
  /** For aria-labelledby on the card it opens. */
  id?: string;
  className?: string;
  children: ReactNode;
}

export function Lead({ id, className, children }: LeadProps) {
  return (
    <p id={id} className={cx(s.lead, className)}>
      {children}
    </p>
  );
}
