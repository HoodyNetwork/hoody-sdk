// An outcome banner in an account sheet, with the room under it before the form (Rules.module.css .banner: padding
// under the banner's own box, never inside its border). A page-local component with the banner as children, so the
// sheet's anatomy follows the banner's text through it. Its .term sibling draws the same room in the terminal.
import type { ReactNode } from 'react';
import r from './Rules.module.css';

export function BannerSlot({ children }: { children: ReactNode }) {
  return <div className={r.banner}>{children}</div>;
}
