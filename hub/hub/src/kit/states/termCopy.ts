// Copy to the terminal's clipboard (OSC 52) for terminal siblings (Handoff, ErrorDetails), with a short-lived result
// a caller shows ("Copied" / "Copy failed"). One timer, cleared on unmount; nothing loops.
// The copy itself is prim's (useClipboard: OSC 52 through the renderer FocusRoot mounted, text made safe first).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useClipboard } from '../../term/prim';

export const COPIED_MS = 2000;

/** [copy(text), result]: result is 'yes' or 'no' for COPIED_MS after a copy, else null. */
export function useCopyText(): [(text: string) => boolean, 'yes' | 'no' | null] {
  const { copy: put } = useClipboard();
  const [result, setResult] = useState<'yes' | 'no' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = useCallback((text: string): boolean => {
    let ok = false;
    ok = put(text);
    setResult(ok ? 'yes' : 'no');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; setResult(null); }, COPIED_MS);
    return ok;
  }, [put]);
  return [copy, result];
}
