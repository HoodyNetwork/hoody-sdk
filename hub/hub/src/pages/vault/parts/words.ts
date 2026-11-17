// The page's words for a change's end, a problem and a partition, and the 429 countdown.
import type { Change, NotSent, Problem } from '../data';
import { useNow, type Translate } from '@kit';
import type strings from '../strings.en.json';

export type T = Translate<typeof strings>;

export function problemText(t: T, p: Problem | { kind: 'empty' } | { kind: 'stale' }, secondsLeft?: number): string {
  switch (p.kind) {
    case 'rate':
      return t('problem.rate', { seconds: secondsLeft ?? p.retryAfter });
    case 'empty':
      return t('value.empty');
    case 'stale':
      return t('value.stale');
    default:
      return t(`problem.${p.kind}`);
  }
}

export function notSentText(t: T, why: NotSent): string {
  if (typeof why === 'object') return t(`crypto.${why.crypto}`);
  return t(`notSent.${why}`);
}

/** One line for a change that did not end done (null for done). */
export function changeText(t: T, c: Change, secondsLeft?: number): string | null {
  switch (c.outcome) {
    case 'done':
      return null;
    case 'held':
      return t('held.body');
    case 'not_sent':
      return notSentText(t, c.why);
    case 'failed':
      return problemText(t, c.problem, secondsLeft);
    case 'stale':
      return t('notSent.moved');
    case 'pending':
      return null;
  }
}

/** Seconds left of a 429 wait (0 when none): counts down once a second while `until` is set. The value is read from the
 * wall clock at each render, so it is right from the render a deadline is set (even long after the last tick, and
 * after the clock moved back); the hook only re-renders it a second apart. */
export function useCountdown(until: number | null): number {
  useNow(until !== null);
  return until === null ? 0 : Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

/** The wait a change asks for, as an end time (null: none). */
export function rateUntil(c: Change | null): number | null {
  return c && c.outcome === 'failed' && c.problem.kind === 'rate' ? Date.now() + c.problem.retryAfter * 1000 : null;
}
