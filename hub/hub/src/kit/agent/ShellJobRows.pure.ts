// ShellJobRows.pure: which jobs Running now shows and the words of a row, shared by the web rows and the terminal rows.
// What a Stop shows is only what its answer proved (see ShellJobRows.tsx).
import type { useStrings } from '../strings';
import { clean } from './code';
import type { JobRow } from './jobStop';
import type { JobAttemptView, ShellJobStopsSnapshot } from './shellJobStop';

export const NAME_MAX = 200;

/** A row of Running now: `listed` false is a job the newest list no longer names, kept for its open Stop. */
export interface ShownJob { row: JobRow; listed: boolean }

/** The rows Running now shows: the listed jobs that run or may run, any listed job a Stop of this page is about, and each job
 *  with a Stop still open (sending, or unknown) that the list no longer names. */
export function shownShellJobs(snap: ShellJobStopsSnapshot): readonly ShownJob[] {
  const listed = snap.rows ?? [];
  const out: ShownJob[] = listed.filter((r) => r.state !== 'ended' || snap.attempts.has(r.jobId)).map((row) => ({ row, listed: true }));
  for (const [jobId, a] of snap.attempts) {
    const row = snap.attemptRows.get(jobId);
    if (row && a.phase !== 'settled' && !listed.some((r) => r.jobId === jobId)) out.push({ row, listed: false });
  }
  return out;
}

export type JobWords = ReturnType<typeof useStrings>;

const SETTLED_WORDS = { stopped: 'sj.stopped', not_running: 'sj.notRunning', running: 'sj.stillRunning', not_sent: 'sj.notSent', gone: 'sj.gone' } as const;

/** The job's command as a row names it: cleaned, bounded, on one line; the fixed words when it has none. */
export function jobName(r: JobRow, t: JobWords): string {
  return clean(r.command, NAME_MAX).text.replace(/\s+/g, ' ').trim() || t('sj.unnamed');
}

export function stateWords(r: JobRow, now: number, t: JobWords): string {
  if (r.state === 'ended') return t('sj.ended');
  if (r.state === 'unknown') return t('sj.maybeRunning');
  const min = Math.floor(Math.max(0, now - r.startedMs) / 60_000);
  return min < 1 ? t('sj.startedNow') : t('sj.running', { count: min });
}

export function attemptWords(a: JobAttemptView, t: JobWords): string {
  if (a.phase === 'sending') return t('sj.stopping');
  if (a.phase === 'unknown') return a.checking ? t('sj.checking') : t('sj.unknown');
  if (a.evidence === 'running' && a.reason === 'unsafe_record') return t('sj.unsafe');
  return t(SETTLED_WORDS[a.evidence]);
}
