// reachability.ts: whether a computer answered a read. The one classifier every page asks, so "this
// computer isn't reachable right now" is decided the same way everywhere and never read into a refusal, an abort or
// an answer the page could not use.
//
// Contract:
//   - reachOf(e) of the rejection a read ended with: 'unreachable' | 'reachable' | 'unknown'.
//   - 'unreachable' only when nothing answered: core's no-answer rejection (kit.ts exchange: kind
//     'unreachable', status 0, code NETWORK or TIMEOUT), the same labelled by api(), a source read's SourceError
//     'network' with that code. A body lost after the answer arrived is not: kit.ts marks it `answered`, and an answer
//     that named a trace id is one too. A stream's states are not classified here: closed {reason: 'network'} is
//     also a stream that opened and then dropped.
//   - 'reachable' when an HTTP answer arrived (status 100-599): a 4xx or 5xx with a body, or a 2xx the page could
//     not use. The computer answered; the page shows its own error for it.
//   - 'unknown' for everything else: an abort by the user (cancelled, kind or code 'aborted'), a stale or superseded
//     answer, nothing sent, a refused preflight, a wrapped foreign throw (CALL_FAILED), any other code, error facts
//     (ErrorInfo keeps no `answered`, so it can never prove that nothing answered), any other value.
//   - It answers reachability only: a change's outcome stays what core/errors.ts says (C9), whatever this says.
import { isErrorInfo } from './errors';
import { SourceError } from './source';

export type Reach = 'reachable' | 'unreachable' | 'unknown';

const NO_ANSWER: readonly unknown[] = ['NETWORK', 'TIMEOUT'];

function answeredStatus(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 100 && v < 600;
}

/** Whether the computer answered the read or stream that ended with `e` (see the contract). */
export function reachOf(e: unknown): Reach {
  if (!e || typeof e !== 'object') return 'unknown';
  // Only a failed outcome's status is an answer: a stale, cancelled, not-sent or pending one may carry a status no
  // answer gave (a superseded session's synthetic 401).
  if (isErrorInfo(e)) return e.outcome === 'failed' && answeredStatus(e.status) ? 'reachable' : 'unknown';
  const x = e as Record<string, unknown>;
  if (x.notSent === true || x.stale === true || x.superseded === true || x.cancelled === true) return 'unknown';
  if (e instanceof SourceError && (x.kind === 'stale' || x.kind === 'not_sent')) return 'unknown';
  if (answeredStatus(x.status)) return 'reachable';
  if (x.status !== 0 && !(e instanceof SourceError && x.status === null)) return 'unknown';
  if (x.answered === true || (typeof x.traceId === 'string' && x.traceId !== '')) return 'unknown';
  if (!NO_ANSWER.includes(x.code)) return 'unknown';
  if (e instanceof SourceError) return x.kind === 'network' ? 'unreachable' : 'unknown';
  return x.kind === 'unreachable' ? 'unreachable' : 'unknown';
}
