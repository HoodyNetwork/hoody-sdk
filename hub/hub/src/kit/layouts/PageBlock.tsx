// A block a page places above its content (a tab strip with nothing under it, a notice strip). On the web the gap
// under it is the page's own CSS, so this draws nothing of its own; the terminal adds one blank row under it
// (PageBlock.term.tsx), as the kit layouts do for their own strips.
import type { ReactNode } from 'react';

// `gap={false}` keeps the same wrapper with no blank row, so a block whose gap comes and goes keeps its content mounted.
export function PageBlock({ children }: { children: ReactNode; gap?: boolean }): ReactNode {
  return children;
}
