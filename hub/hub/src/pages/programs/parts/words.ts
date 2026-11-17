// State words shared by the table and the inspector.
import { formatRelative, type StringKey, type Translate } from '@kit';
import type { StateKey, StopInfo } from '../logic';
import type strings from '../strings.en.json';

type T = Translate<typeof strings>;

export function stateLabel(t: T, state: StateKey, exitCode: number | null): string {
  if (state === 'ended') return exitCode === null ? t('state.endedPlain') : t('state.ended', { n: exitCode });
  return t(`state.${state}` as StringKey<typeof strings>);
}

// Times read relative, with the clock time beside an end and the full date in the tooltip.
const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

/** "Ends in 24 minutes (04:39)". */
export function endsText(t: T, ends: number, now: number = Date.now()): string {
  return t('ends', { rel: formatRelative(ends, now), time: clock.format(new Date(ends)) });
}

/** The same time under a label that already says "Ends": "in 24 minutes (04:39)". */
export function endsValue(t: T, ends: number, now: number = Date.now()): string {
  return t('ends.value', { rel: formatRelative(ends, now), time: clock.format(new Date(ends)) });
}

/** "Stopped 12 hours ago · exit 0", "Couldn't start · 31 minutes ago"; null when the time is unknown. */
export function stopText(t: T, stop: StopInfo | null, now: number = Date.now()): string | null {
  if (!stop || stop.at === null) return null;
  const rel = formatRelative(stop.at, now);
  if (stop.fail) return t(`stop.${stop.fail}` as 'stop.problem', { rel });
  return stop.exit !== null ? t('stop.exit', { rel, n: stop.exit }) : t('stop.at', { rel });
}

/** The one-line note of a program that needs a look (core's attention states): what went wrong, in the program's
 *  own terms, never a guess at why; null for every other state. */
export function problemText(t: T, name: string, state: StateKey, exitCode: number | null): string | null {
  if (state === 'failed' || state === 'fatal') return t('problem.start', { name });
  if (state === 'restarting') return t('problem.restarting', { name });
  if (state === 'ended') return exitCode === null ? t('problem.endedPlain', { name }) : t('problem.ended', { name, n: exitCode });
  if (state === 'unknown') return t('problem.unknown', { name });
  return null;
}
