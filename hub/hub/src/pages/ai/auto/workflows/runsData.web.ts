// The browser-only part of runsData.ts (split out so the rest is shared with the terminal build): page visibility,
// which useRuns polls by. runsData.ts imports it.
import { useEffect, useState } from 'react';

/** True while the browser tab is shown (a hidden tab reads nothing). */
export function useTabVisible(): boolean {
  const [v, setV] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = () => setV(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return v;
}
