// The terminal's own focus (focus reporting, ESC[I / ESC[O): the web's visibilitychange. The engine emits "blur" when
// the terminal window or tab loses focus and "focus" when it comes back. A revealed secret masks itself on blur.
import { useEffect, useRef } from 'react';
import { useRenderer } from './otui';

interface Emitter { on(e: string, f: () => void): unknown; off(e: string, f: () => void): unknown }

/** Calls `cb` when the terminal loses focus (another window, another tab of the terminal). */
export function useTerminalBlur(cb: () => void): void { useTerminalFocusEvent('blur', cb); }
/** Calls `cb` when the terminal gets the focus back. */
export function useTerminalFocus(cb: () => void): void { useTerminalFocusEvent('focus', cb); }

function useTerminalFocusEvent(name: 'blur' | 'focus', cb: () => void): void {
  const r = useRenderer() as unknown as Emitter;
  const live = useRef(cb);
  live.current = cb;
  useEffect(() => {
    const f = (): void => live.current();
    r.on(name, f);
    return () => { r.off(name, f); };
  }, [r, name]);
}
