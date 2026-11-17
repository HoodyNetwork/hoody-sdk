// StepList's rules that draw nothing, shared by the web list and its terminal sibling: a row's number, the 70-character
// rule with its dev-only warning, and the words a row shows (for counting only).
import { isValidElement, useEffect, type ReactNode } from 'react';
import { CodeLine, IdChip, maskId } from './Ids';
import type { StepListGroup } from './StepList';

/** A row's number as two digits ("01"); 100 and over as written. */
export const stepNumber = (n: number): string => String(n).padStart(2, '0');

/** A row is one line of 70 characters at most. Dev builds say so once per row, naming the list and the row's
 *  number, never its text: a row can hold an id that is shown masked (CodeLine, IdChip), and no reading of an element's
 *  props can know every way one hides it. */
export const STEP_TEXT_MAX = 70;
const warned = new Set<string>();

/** The words a row shows, for counting only: its strings and numbers, through fragments and elements; a CodeLine and an
 *  IdChip as they show (CodeLine its value, masked when `masked` is set; IdChip its label and its masked id; never their
 *  children), and any other element's `value` where it has no children. Any other component is counted by its children
 *  or `value`, a best guess: what it renders cannot be read from its props. It is never printed. Exported for tests. */
export function readableText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(readableText).join('');
  if (isValidElement(node)) {
    const p = node.props as { children?: ReactNode; value?: unknown; masked?: unknown };
    // The kit's own parts first, read as they show whatever else a spread handed them: an IdChip its label and its id
    // masked, a CodeLine its value (masked when `masked` is set); never their children.
    if (node.type === IdChip) {
      const c = node.props as { id?: unknown; label?: unknown };
      return `${typeof c.label === 'string' && c.label ? `${c.label} ` : ''}${typeof c.id === 'string' ? maskId(c.id) : ''}`;
    }
    if (node.type === CodeLine) return typeof p.value === 'string' ? (p.masked === true ? maskId(p.value) : p.value) : '';
    // Any other element with a masked value (a memo or other wrapper of a CodeLine) counts it masked, before its children.
    if (p.masked === true && typeof p.value === 'string') return maskId(p.value);
    if (p.children != null) return readableText(p.children);
    return typeof p.value === 'string' ? p.value : '';
  }
  return '';
}

/** The 70-character rule's dev-only warning, once per over-long row of a list (web and terminal). */
export function useStepTextWarning(label: string, groups: readonly StepListGroup[]): void {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let row = 0;
    for (const g of groups)
      for (const it of g.items) {
        row += 1;
        const read = readableText(it.text);
        const length = read.length;
        const key = `${label}\u0000${row}\u0000${read}`; // reason: dedupe only; kept in memory, never printed
        if (length <= STEP_TEXT_MAX || warned.has(key)) continue;
        warned.add(key);
        // eslint-disable-next-line no-console -- dev-only diagnostic
        console.warn(`hub StepList "${label}": row ${row} is over ${STEP_TEXT_MAX} characters (${length}); split the action, or move the rest to its note`);
      }
  }, [groups, label]);
}
