// The Agent dock's frame as the panel inside it reads it: its mode and the way back to the page. A module of its own
// (AskDock.tsx provides it and re-exports these) so that the panel's terminal parts (ask/dockHead.term.tsx) can read
// the frame without importing the dock, which itself imports the panel.
import { createContext, useContext } from 'react';

export interface AskDockFrame {
  /** 'pane': beside the page (Esc should leave it); 'sheet': full screen (Esc closes it). */
  mode: 'pane' | 'sheet';
  /** Focus is in the dock (the dock's root takes the keys). Always true for a sheet. */
  entered: boolean;
  /** Back to the page, the dock stays open (a pane); closes a sheet. */
  leave(): void;
}
export const AskDockFrameCtx = createContext<AskDockFrame | null>(null);
/** Inside the dock: its mode and the way back to the page; null outside it. */
export const useAskDockFrame = (): AskDockFrame | null => useContext(AskDockFrameCtx);
