// The index's list: the kit's section menu. Its direction is the stylesheet's (guide.module.css sets the menu's
// `--section-menu-flow` hook to row under 760 px); a part of its own so the terminal can draw the strip (IndexList.term.tsx).
import { SectionMenuList } from '@kit';
import type { ReactNode } from 'react';

export function IndexList({ children }: { children: ReactNode }) {
  return <SectionMenuList>{children}</SectionMenuList>;
}
