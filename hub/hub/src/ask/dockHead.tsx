// dockHead: the dock header's parts for the TERMINAL (dockHead.term.tsx): its row, the confirm question's words, the end
// group and the Recent button's running count. The web draws AskPanel's own markup inline (null here), so the header's
// anatomy stays counted where it is written; AskPanel takes these parts only when they exist.
import type { ReactNode } from 'react';

export interface DockHeadParts {
  /** The header row; `confirm`: the New-conversation question replaces the controls. */
  HeadRow: (p: { confirm?: boolean; children: ReactNode }) => ReactNode;
  /** The question's words in the confirm row (they take the room the buttons leave). */
  HeadText: (p: { children: ReactNode }) => ReactNode;
  /** Recent, New and Close, at the row's end. */
  HeadEnd: (p: { children: ReactNode }) => ReactNode;
  /** The Recent button with the count of running conversations (`count` null: none shown). As a Popover trigger it is
   *  handed the opener as onPress and passes it on to the button inside. */
  CountWrap: (p: { count: number | null | undefined; children: ReactNode }) => ReactNode;
}

/** The terminal's header parts; none on the web. */
export const termHead: DockHeadParts | null = null;

/** Whether the TERMINAL draws the dock as a full-screen sheet now (dockHead.term.tsx reads the shell's dock frame). The
 *  web knows its own sheet from the viewport (AskPanel's `phone`), so this is false there. */
export function useTermSheet(): boolean {
  return false;
}
