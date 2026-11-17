// The browser-only part of chat-attention.ts (split out so the rest is shared with the terminal build): whether the
// page is shown, which the attention observer reads. chat-attention.ts imports it.
import { useEffect, useState } from 'react';

/** Whether the page is shown (read by the attention observer). */
export function useVisible(): boolean {
  const [v, setV] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const on = () => setV(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return v;
}
