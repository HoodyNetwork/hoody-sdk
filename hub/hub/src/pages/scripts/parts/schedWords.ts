// A schedule in words, read through the one cron preset model (kit/cron.ts through @kit/pure): every N minutes, hourly, daily,
// weekdays, weekly and monthly expressions get a sentence; anything else (a custom expression, a name, a macro, none) is null
// and is shown as written. The exec kit runs schedules in UTC, so the times are UTC ("8:00", as the list always said).
import type { Translate } from '@kit';
import { cronRecognise as recognise } from '@kit/pure';
import type strings from '../strings.en.json';

const pad = (n: number): string => String(n).padStart(2, '0');
const DAY_KEYS = ['when.day.0', 'when.day.1', 'when.day.2', 'when.day.3', 'when.day.4', 'when.day.5', 'when.day.6'] as const;

/** The expression as the kit compares it: trimmed, single spaces. */
export const cronOf = (cron: unknown): string => (typeof cron === 'string' ? cron.trim().replace(/\s+/g, ' ') : '');

export function schedText(t: Translate<typeof strings>, cron: unknown): string | null {
  const e = cronOf(cron);
  if (!e) return null;
  const p = recognise('exec', e);
  switch (p.k) {
    case 'every': return t('when.every', { n: p.n });
    case 'hourly': return p.m === 0 ? t('when.hourly') : t('when.hourlyAt', { m: pad(p.m) });
    case 'daily': return t('when.daily', { time: `${p.h}:${pad(p.m)}` });
    case 'weekdays': return t('when.weekdays', { time: `${p.h}:${pad(p.m)}` });
    case 'weekly': return t('when.weekly', { days: p.days.map((d) => t(DAY_KEYS[d] ?? 'when.day.0')).join(', '), time: `${p.h}:${pad(p.m)}` });
    case 'monthly': return t('when.monthly', { d: p.d, time: `${p.h}:${pad(p.m)}` });
    default: return null;
  }
}
