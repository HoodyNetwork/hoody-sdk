// StepNote: one muted line under a step's picker or code (what a system needs first, a note on an example), in the
// look of a field's description. Steps uses it; the terminal sibling (StepNote.term.tsx) draws the same words muted,
// so Steps itself is shared with the terminal build.
import type { ReactNode } from 'react';
import f from '../forms/fields.module.css';

/** A muted line under a step (SystemSteps: a system's need; ExamplePicker: an example's note). */
export function StepNote({ children }: { children: ReactNode }) {
  return <p className={f.description}>{children}</p>;
}
