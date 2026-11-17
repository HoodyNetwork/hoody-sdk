// One sentence of a notice: a line of its own in a stack. The terminal draws it with Line.term.tsx.
import type { ReactNode } from 'react';

export function Line({ children }: { children: ReactNode }) {
  return <span>{children}</span>;
}
