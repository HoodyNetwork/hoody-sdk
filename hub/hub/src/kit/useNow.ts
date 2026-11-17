import { useEffect, useState } from 'react';

/**
 * The time now (epoch ms), moving every `ms` while `on`. Off, it sets no timer and gives the time at each render; turned on, it
 * shows the time at once, then ticks. A page that reads a running time (a countdown, an elapsed time) uses this and nothing of its own.
 */
export function useNow(on = true, ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  const [wasOn, setWasOn] = useState(on);
  // Turned on: the stored time is from the last tick (or the mount), so take the time now before the first frame is drawn.
  if (on !== wasOn) {
    setWasOn(on);
    if (on) setNow(Date.now());
  }
  useEffect(() => {
    if (!on) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [on, ms]);
  return on ? now : Date.now();
}
