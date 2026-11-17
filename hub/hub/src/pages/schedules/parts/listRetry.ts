// The person's Try again on a computer list not known (C9): its own read keeps the button on screen, busy (focus stays
// on it), instead of the loading screen; any other read of the list shows loading. The attempt ends when its read is
// seen ending, or when the retry's promise settles while no loading shows: a read that failed before any loading render
// was seen. A promise settling while loading still shows leaves the end to that read (no flash of the loading screen).
import { useEffect, useRef, useState } from 'react';

export function useListRetry(read: 'loading' | 'unknown' | undefined): { askedAgain: boolean; retry: (run: () => unknown) => void } {
  const [askedAgain, setAskedAgain] = useState(false);
  const attempt = useRef(0);
  const shown = useRef(read);
  useEffect(() => {
    shown.current = read;
    if (read !== 'loading') setAskedAgain(false);
  }, [read]);
  const retry = (run: () => unknown) => {
    const me = ++attempt.current;
    setAskedAgain(true);
    const p = run();
    if (p instanceof Promise) void p.finally(() => { if (attempt.current === me && shown.current !== 'loading') setAskedAgain(false); });
  };
  return { askedAgain, retry };
}
