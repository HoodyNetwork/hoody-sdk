// Terminal only: whether a table's filter bar holds the focus, kept by the table across the bar's two forms (chips, or
// one "Filters" button below 90 columns; DataTable.term.tsx). A resize that changes the form removes the control that
// held the focus (a chip, its popover, the Filters button), so the new form takes it (FilterChips.term.tsx
// A "Computer" popover open at 120 columns, resized to 80, left no focus anywhere).
// Only a bar that HELD the focus: a form change on the first layout (a table measured once drawn) never takes it, or a
// page opened scrolled to that table.
import { createContext, type MutableRefObject } from 'react';

export const FilterRefocusCtx = createContext<MutableRefObject<boolean> | null>(null);
