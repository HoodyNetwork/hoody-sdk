// The Support page's words for a send's answer. The text a person typed is
// never echoed: a text refusal names the field, the rule and the character offset only.
import type { Translate } from '@kit';
import { formatNumber } from '@kit/pure';
import type { SendResult } from '../data';
import { duplicateRefusal, nextUtcMidnight, quotaRefusal, textRefusal, waitUnit, type LimitRow } from '../logic';
import type strings from '../strings.en.json';

export type T = Translate<typeof strings>;

export const waitWords = (t: T, ms: number): string => {
  const w = waitUnit(ms);
  return t(`wait.${w.unit}`, { count: w.count });
};

const timeOf = (ms: number): string => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** A field error from SUPPORT_TEXT_INVALID: which field, and its words. */
export function fieldError(t: T, r: SendResult): { field: 'subject' | 'body'; words: string } | null {
  if (r.verdict !== 'text') return null;
  const f = textRefusal(r.data);
  if (!f) return null;
  const max = f.field === 'subject' ? 200 : 4000;
  const base = t(f.key as 'text.empty', { max: formatNumber(max), index: f.index ?? 0 });
  return { field: f.field, words: f.cleaned ? t('text.afterCleaning', { words: base }) : base };
}

/** When Send may be pressed again after SUPPORT_BUSY: the Retry-After, else the next UTC midnight. */
export function busyUntil(r: SendResult, now: number): number {
  return r.retryAfterMs !== undefined ? now + r.retryAfterMs : nextUtcMidnight(now);
}

/** The sentence for a refused send (not a field error, the message cap or the closed-for-good state, which the
 *  thread shows as its own state). Null: nothing to say (sent, or held). `busyTill`: when Send may be pressed again,
 *  taken at the SUPPORT_BUSY answer (busyUntil of its answer time), so the sentence names that one time on every
 *  render. */
export function refusalWords(t: T, r: SendResult, now: number, busyTill?: number): string | null {
  switch (r.verdict) {
    case 'sent':
    case 'unknown':
    case 'messageCap':
    case 'closedForGood':
      return null;
    case 'held':
      return t('send.held');
    case 'notSent':
      return t('send.notSent');
    case 'text':
      return fieldError(t, r) ? null : t('error.field');
    case 'field':
      return t('error.field');
    case 'quota': {
      const q = quotaRefusal(r.data);
      const parts = [q.limit ? t(`quota.${q.limit}` as `quota.${LimitRow}`) : t('quota.other')];
      if (q.retryAfterS !== null && q.retryAfterS > 0) parts.push(t('quota.retry', { duration: waitWords(t, q.retryAfterS * 1000) }));
      if (q.banned) parts.push(t('quota.banned'));
      return parts.join(' ');
    }
    case 'keyConflict':
      return t('error.keyConflict');
    case 'duplicate': {
      const { retryAfterS } = duplicateRefusal(r.data);
      const sent = t('error.duplicate');
      return retryAfterS ? `${sent} ${t('error.duplicateWait', { duration: waitWords(t, retryAfterS * 1000) })}` : sent;
    }
    case 'notFound':
      return t('error.notFound');
    case 'busy': {
      // The time is the Retry-After's when the answer gave one, else the next UTC midnight: only that one is named so.
      const time = timeOf(busyTill ?? busyUntil(r, now));
      return r.retryAfterMs !== undefined ? t('error.busyAt', { time }) : t('error.busy', { time, utc: t('error.utcMidnight') });
    }
    case 'unavailable':
      return r.retryAfterMs !== undefined ? t('error.unavailableIn', { duration: waitWords(t, r.retryAfterMs) }) : t('error.unavailable');
    case 'rate':
      return r.retryAfterMs !== undefined ? t('error.rate', { duration: waitWords(t, r.retryAfterMs) }) : t('error.rateNow');
    case 'other':
      return null;
  }
}
