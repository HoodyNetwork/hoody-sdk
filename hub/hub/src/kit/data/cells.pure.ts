// Pure parts of cells (shared by cells.tsx and its terminal sibling): progress in words, the fit meta of a progress
// column, and the Check again row action.
import { formatBytes } from '../format';
import { lookup } from '../strings';
import type { RowAction } from './DataTable';
import strings from './cells.strings.en.json';

/** The kit words outside a render (a fit column's measure, an action built in a callback); looked up per call. */
const words = (key: keyof typeof strings, vars?: Record<string, string | number>) => lookup(strings, key, vars);

/** Bytes moved so far. `done` null or 0: nothing has moved yet. `total` null or 0: the size is not known. `percent`, when
 * the source gives one, wins over done/total; it is floored and never above 100. */
export interface Progress {
  done: number | null;
  total?: number | null;
  percent?: number | null;
}

export function pctOf(p: Progress): number | null {
  if (p.done === null || p.done <= 0 || !p.total || p.total <= 0) return null;
  const raw = p.percent ?? (100 * p.done) / p.total;
  return Math.max(0, Math.min(100, Math.floor(raw)));
}

/** The progress in words: "76% · 38 MB of 50 MB", "38 MB so far" without a total, "Starting" before any byte (none
 * yet, or 0: no meter either). Never a
 * percent without a total. Also what a fit column measures (progressFit). */
export function progressWords(p: Progress): string {
  if (p.done === null || p.done <= 0) return words('progress.start');
  const pct = pctOf(p);
  if (pct === null) return words('progress.some', { done: formatBytes(p.done) });
  return words('progress.of', { pct, done: formatBytes(p.done), total: formatBytes(p.total ?? 0) });
}

/** The 60 px meter, its gap, and slack: the room a fit column adds to the measured words. */
const METER_ROOM = 72;

/** The fit meta (`size: 'fit'`) of a progress column: it measures the words a row shows and leaves the meter's room,
 * so a page never counts the meter by hand. */
export function progressFit<T>(of: (row: T) => Progress): { fitText: (row: T) => string; fitPad: number } {
  return { fitText: (row) => progressWords(of(row)), fitPad: METER_ROOM };
}

/** What checkAgainAction needs: the read to run and whether one is running. */
export interface CheckAgainOptions {
  /** Reads the outcome again; it never sends the change again. */
  onCheck: () => void | Promise<void>;
  /** A check is running: the button says Checking… and is off, with its reason. */
  busy?: boolean;
  id?: string;
}

/** The inline Check again of a row whose outcome is unknown: the DataTable's own inline action. */
export function checkAgainAction({ onCheck, busy, id = 'check-again' }: CheckAgainOptions): RowAction {
  return busy
    ? { id, label: words('check.busy'), inline: true, isDisabled: true, disabledReason: words('check.busyWhy'), onAction: () => undefined }
    : { id, label: words('check.again'), inline: true, onAction: () => void onCheck() };
}
