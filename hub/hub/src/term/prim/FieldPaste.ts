// FieldPaste: bracketed paste for a field drawn outside the engine's editors (a masked multiline secret). The text
// arrives as the terminal sent it (line ends kept byte for byte, CR LF included), as a web paste
// gives the clipboard's text; drawing it is safe.ts's job (every drawn string passes safeText). The handler runs only while `active`; returning true takes the paste.
import { useRef } from 'react';
import { usePaste } from '@opentui/react';

export function usePasteText(active: boolean, handler: (text: string) => boolean | void): void {
  const live = useRef({ active, handler });
  live.current = { active, handler };
  usePaste((e) => {
    if (!live.current.active) return;
    const text = new TextDecoder().decode(e.bytes);
    if (live.current.handler(text) === true) e.preventDefault();
  });
}
