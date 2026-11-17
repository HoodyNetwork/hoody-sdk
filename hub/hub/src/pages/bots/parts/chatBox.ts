// The Activity tab's chat box, for the move that puts the keyboard there (Jump to newest). The tab holds the slot; the box
// (Say) fills it with its own focus while it is drawn. The web's text area and the terminal's composer both take that
// focus, so the move is the same on both, with no search of the page for the box.
import { createContext, useContext, useEffect, useRef, type MutableRefObject } from 'react';

export interface ChatBoxHandle {
  focus(): void;
}

const ChatBoxContext = createContext<MutableRefObject<ChatBoxHandle | null> | null>(null);

/** The tab's side: shares its slot with the box drawn inside it. */
export const ChatBoxProvider = ChatBoxContext.Provider;

/** The box's side: while it is drawn, the tab's slot moves the keyboard here (`focus`, read when asked). No tab, no slot. */
export function useChatBoxSlot(focus: () => void): void {
  const slot = useContext(ChatBoxContext);
  const latest = useRef(focus);
  latest.current = focus;
  useEffect(() => {
    if (!slot) return undefined;
    const own: ChatBoxHandle = { focus: () => latest.current() };
    slot.current = own;
    return () => {
      if (slot.current === own) slot.current = null;
    };
  }, [slot]);
}
