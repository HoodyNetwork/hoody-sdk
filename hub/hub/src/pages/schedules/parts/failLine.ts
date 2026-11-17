// Why the last run failed: the run Last result names, and the one line of its output shown there.
import type { HistoryRun } from '../data';
import { mask } from '../logic';

/** The run whose output a failed result names: the newest run, when it failed or was lost (the rows History can open). */
export function newestFailed(runs: readonly HistoryRun[] | undefined): HistoryRun | null {
  const r = runs?.[0];
  return r && (r.result === 'failed' || r.result === 'lost') ? r : null;
}

/** The first non-empty line of a run's output, masked as a whole first (a mask may span lines), cut to one line's length. */
export function firstOutputLine(output: string | undefined): string {
  const line = mask(output ?? '').split(/\r?\n/).find((l) => l.trim() !== '')?.trim() ?? '';
  return line.length > 160 ? `${line.slice(0, 159)}…` : line;
}
