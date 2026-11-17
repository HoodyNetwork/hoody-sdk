// The browser-only part of the AI pane's data.ts (split out so the rest is shared with the terminal build): page
// visibility and the browser's online state, which useChats reads. data.ts imports them.
import { useEffect, useState, useSyncExternalStore } from 'react';

/** True while the page is visible (reads that poll stop while it is hidden). */
export function useVisible(): boolean {
  const [v, setV] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = () => setV(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return v;
}

/** Whether the browser says it is online now (the window's online/offline events, which TanStack's network mode also
 *  follows): offline, answers idle since may be old, so no list is provably complete. */
function subscribeOnline(cb: () => void): () => void {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}
const onlineNow = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false;
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, onlineNow, () => true);
}
