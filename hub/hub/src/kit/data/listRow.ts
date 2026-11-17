// Two-line list rows (terminal DataTable): where the NAME text starts, so the meta line sits right under it.
// A MarkCell (cells.term.tsx) registers its text box here; without one the primary cell's own start is used. Shared by
// DataTable.term.tsx (provider) and cells.term.tsx (MarkCell), so neither imports the other.
import { createContext, useContext } from 'react';
import type { BoxRenderable } from '../../term/prim/otui';

export type NameStartRef = (n: BoxRenderable | null) => void;
export const NameStartCtx = createContext<NameStartRef | null>(null);
export const useNameStart = (): NameStartRef | null => useContext(NameStartCtx);
