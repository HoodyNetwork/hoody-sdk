// The Schedules page's browser alert: a schedule whose last run turns failed (or lost) while the page is open. Read
// off the page's own list read, so it alerts only while Schedules is open; nothing new is read.
// - failuresRisen(seen, rows): which rows failed since the last read. A row's first read (the page's first answer, a row
//   that appears later, a computer switch: a new `seen`) only records it, so a failure already there never alerts. After
//   that a row alerts when its last run is failed/lost at a time later than any failure seen for it; the same failure read
//   again, or a run with no time, never does.
// - useScheduleFailAlert: one alert per read that has a newly failed row, with fixed words (never the schedule's name or
//   command); with exactly one such row a click opens it, else the list. notifyAlert does nothing unless alerts are on
//   and the tab is away.
import { notifyAlert, useStrings } from '@kit';
import { useEffect, useRef } from 'react';
import { links } from './links';
import type { SchedRow } from './logic';
import strings from './strings.en.json';

export type FailSeen = Map<string, number>;

const failedAt = (r: SchedRow): number | null =>
  (r.last.k === 'failed' || r.last.k === 'lost') && typeof r.last.at === 'number' && Number.isFinite(r.last.at) ? r.last.at : null;

/** Updates `seen` in place; returns the rows that failed since their last read. */
export function failuresRisen(seen: FailSeen, rows: readonly SchedRow[]): SchedRow[] {
  const out: SchedRow[] = [];
  for (const r of rows) {
    const at = failedAt(r);
    const before = seen.get(r.key);
    if (before === undefined) {
      seen.set(r.key, at ?? -Infinity);
      continue;
    }
    if (at !== null && at > before) {
      seen.set(r.key, at);
      out.push(r);
    }
  }
  return out;
}

/** `scope` names the list read (the computer): a new scope starts a new `seen`. rows undefined: not read, nothing changes. */
export function useScheduleFailAlert(rows: readonly SchedRow[] | undefined, scope: string): void {
  const t = useStrings(strings);
  const seen = useRef<{ scope: string; map: FailSeen } | null>(null);
  useEffect(() => {
    if (!rows) return;
    if (seen.current?.scope !== scope) seen.current = { scope, map: new Map() };
    const risen = failuresRisen(seen.current.map, rows);
    if (risen.length === 0) return;
    const one = risen.length === 1 ? risen[0] : undefined;
    void notifyAlert('schedule', {
      title: t('alert.failTitle'),
      body: t('alert.failBody'),
      ...(one ? { tag: one.key, to: links.item(one.key) as `/${string}` } : { to: links.list }),
    });
  }, [rows, scope, t]);
}
