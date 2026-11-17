// Backoff steps and a timer that outlives setTimeout's 2^31 - 1 ms ceiling (approver.ts).
export const BACKOFF = [1000, 2000, 5000, 10000, 30000] as const;
export const DEL_BACKOFF = [1000, 2000, 5000, 10000, 30000, 60000, 300000] as const;
export const backoff = (n: number): number => BACKOFF[Math.min(Math.max(n, 1), BACKOFF.length) - 1]!;
export const delBackoff = (n: number): number => DEL_BACKOFF[Math.min(Math.max(n, 1), DEL_BACKOFF.length) - 1]!;
const MAX_TIMER = 2_147_483_647;
export const TICK_MS = 30_000;
export interface T { stop(): void }
/** A timer that waits in steps of at most 2^31 - 1 ms. */
export function later(ms: number, fn: () => void): T {
  let id: ReturnType<typeof setTimeout> | null = null, left = Math.max(0, ms), dead = false;
  const step = (): void => {
    if (dead) return;
    if (left > MAX_TIMER) { left -= MAX_TIMER; id = setTimeout(step, MAX_TIMER); } else id = setTimeout(() => { if (!dead) fn(); }, left);
  };
  step();
  return { stop() { dead = true; if (id !== null) clearTimeout(id); } };
}
export const stop = (t: T | null | undefined): null => { t?.stop(); return null; };
