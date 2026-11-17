// A chat's shell jobs under Activity → Running now.
// The rows are the agent's PER-SESSION list only (shellJobStop.ts): the stream's event.bash_job_list names every session's
// jobs, so it never makes a row here. Each row shows its command, how long it has run (from the agent's start time), its last
// line and, while the activation gate allows it, Stop. What a Stop shows is only what its answer proved: Stopped; Not running
// now (it had ended, or a check read it ended; never "Stopped"); Still running; Not sent; This job is gone. Anything else is
// "This may have gone through." with Check again, which reads and never sends the stop again. Without the gate a row says it
// stops with this chat's Stop. A Stop still open (sending, or unknown) on a job a newer list no longer names keeps its row,
// with its status and Check again but never a Stop: its name and "No longer listed" from the row it was pressed on. Pass it as
// DetailsPanel's activityExtra only when shownShellJobs(snapshot) is not empty, so the panel's "nothing is running" words stay
// right.
import { useSyncExternalStore } from 'react';
import { TextButton } from '../controls/Link';
import { useStrings } from '../strings';
import type { ShellJobStops } from './shellJobStop';
import { attemptWords, jobName, shownShellJobs, stateWords, type ShownJob } from './ShellJobRows.pure';
import strings from './ShellJobRows.strings.en.json';
import s from './ShellJobRows.module.css';

export { shownShellJobs, type ShownJob };

export interface ShellJobRowsProps {
  stops: ShellJobStops;
  /** The time the ages are read against (ms). */
  now: number;
}

export function ShellJobRows({ stops, now }: ShellJobRowsProps) {
  const t = useStrings(strings);
  const snap = useSyncExternalStore(stops.subscribe, stops.snapshot, stops.snapshot);
  const shown = shownShellJobs(snap);
  if (shown.length === 0) return null;
  return (
    <ul className={s.list} aria-label={t('sj.list')}>
      {shown.map(({ row: r, listed }) => {
        const name = jobName(r, t);
        const a = snap.attempts.get(r.jobId);
        const can = stops.canStop(r.jobId);
        const gated = can.k === 'refused' && can.why === 'capability';
        return (
          <li key={r.jobId} className={s.row}>
            <span className={s.name} translate="no">{name}</span>
            <span className={s.muted}>{listed ? stateWords(r, now, t) : t('sj.notListed')}{listed && gated && !a ? ` · ${t('sj.stops')}` : ''}</span>
            {listed && r.lastLine && <span className={s.line} translate="no">{r.lastLine}</span>}
            {a && <span className={a.phase === 'unknown' ? s.unknown : s.muted} role="status">{attemptWords(a, t)}</span>}
            {(can.k === 'ok' || (a?.phase === 'unknown' && !a.checking)) && (
              <span className={s.actions}>
                {can.k === 'ok' && <TextButton aria-label={t('sj.stopJob', { name })} onPress={() => { void stops.stop(r.jobId); }}>{t('sj.stop')}</TextButton>}
                {a?.phase === 'unknown' && !a.checking && <TextButton onPress={() => { void stops.check(r.jobId); }}>{t('sj.checkAgain')}</TextButton>}
              </span>
            )}
            {a?.phase === 'unknown' && !a.checking && <span className={s.muted}>{t('sj.checkHint')}</span>}
          </li>
        );
      })}
    </ul>
  );
}
