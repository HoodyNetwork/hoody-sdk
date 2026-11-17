// PropagatingNote's rule that draws nothing, shared by the web note and its terminal sibling.
import { useEffect, useState } from 'react';

export const PROPAGATION_MS = 60_000;

/** True while a link made at `createdAt` (the server's time) may still be propagating: for PROPAGATION_MS after it. A
 *  created time less than that far ahead of this clock (skew) still counts; one further ahead, older, empty or
 *  unreadable is never fresh. */
export function isFresh(createdAt: string | null | undefined, now: number = Date.now()): boolean {
  const at = createdAt ? Date.parse(createdAt) : NaN;
  if (!Number.isFinite(at)) return false;
  const age = now - at;
  return age < PROPAGATION_MS && age > -PROPAGATION_MS;
}

/** isFresh that re-renders when the minute ends. If this clock went back meanwhile, that render (`n` changed) finds
 *  the link still fresh and waits again, so the note never sticks. */
export function useFresh(createdAt: string | null | undefined): boolean {
  const [n, tick] = useState(0);
  const fresh = isFresh(createdAt);
  useEffect(() => {
    if (!fresh || !createdAt) return;
    const timer = setTimeout(() => tick((n) => n + 1), Math.max(0, Date.parse(createdAt) + PROPAGATION_MS - Date.now()) + 20);
    return () => clearTimeout(timer);
  }, [fresh, createdAt, n]);
  return fresh;
}
