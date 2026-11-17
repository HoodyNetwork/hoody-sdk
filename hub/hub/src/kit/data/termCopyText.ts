// Terminal only (no web twin): the web's module-level copyText, bound to the calling component's mount.
// Answers false once that mount ended, so a continuation that outlives its mount copies nothing.
import { useCallback } from 'react';
import { useClipboard } from '../../term/prim';

/** copyText bound to this component's mount. */
export function useBoundCopyText(): (text: string) => Promise<boolean> {
  const { copy } = useClipboard();
  return useCallback((text: string) => Promise.resolve(copy(text)), [copy]);
}
