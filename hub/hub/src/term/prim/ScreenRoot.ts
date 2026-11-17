// The one root box of every mount (dev.ts, render.ts and the goldens, termshot, runTerm): exactly the terminal, at
// start and after every resize, clipping what is inside. Nothing the app lays out can make the screen taller or wider
// than the terminal (no scrolled screen, no leftover rows); content that does not fit is the pages' to scroll.
// It paints the page ground where the Hub owns the colours (tokens.ts ground): every text role is measured against it.
import { createElement, type ReactElement, type ReactNode } from 'react';
import { Box } from './Box';
import { useTerminalDimensions } from './otui';
import { ground } from './tokens';
import { clearHover } from './Hover';
import { useTerminalBlur } from './terminalFocus';

export function ScreenRoot({ children }: { children?: ReactNode }): ReactElement {
  const { width, height } = useTerminalDimensions();
  // A pointer that leaves the terminal window sends nothing more, so the part it was on would stay on the hover
  // ground: when the terminal loses the focus, no part is hovered (the next pointer move sets it again).
  useTerminalBlur(clearHover);
  return createElement(Box, { width: Math.max(1, width), height: Math.max(1, height), minWidth: Math.max(1, width), maxWidth: Math.max(1, width), minHeight: Math.max(1, height), maxHeight: Math.max(1, height), clip: true, bg: ground('bg'), raw: { id: 'screen-root' } }, children);
}
