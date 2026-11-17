// The Outcome line (C9): an action's result shown where the action was, at
// the height of a button. `pending` ("May have gone through") offers only Check again, which reads
// the current state back and never resends. OutcomeSlot swaps an action for its outcome; the
// FormFooter uses the same line on the left of its buttons.
// Use OutcomeBanner (states) instead for a result about a whole section, Band for a state of the whole page or table,
// HeldBand for a held change with Stop tracking, and a toast only when the action's place is gone.
import type { ReactNode } from 'react';
import { Button, IconButton, cx } from '../controls/Button';
import { Icon } from '../icons';
import { OUTCOME_ICON, type OutcomeInput, type OutcomeKind } from '../outcome';
import { ErrorDetails, errorSentenceNode } from '../states/ErrorDetails';
import type { ErrorWordsOptions } from '../states/errorWords';
import { TextButton } from '../controls/Link';
import stateStrings from '../states/strings.en.json';
import { useStrings } from '../strings';
import strings from './forms.strings.en.json';
import s from './Outcome.module.css';
import { type CheckFn, useCheck, useDoneFlash, useOutcome, useOutcomeFacts, usePendingToast } from './Outcome.pure';

// The hooks live in Outcome.pure.ts (shared with the terminal line); their names stay importable from here.
export { useOutcome, useCheck, usePendingToast, useOutcomeFacts, useDoneFlash } from './Outcome.pure';
export type { CheckFn } from './Outcome.pure';

export interface OutcomeLineProps {
  outcome: OutcomeInput;
  /** Read the current state back (never a resend). Shown on `pending`. */
  onCheck?: CheckFn;
  /** Override the internal checking flag (when the page tracks it). */
  checking?: boolean;
  /** Offer sending again after a definite failure (failed / not_sent / stale only). */
  onRetry?: () => void;
  onDismiss?: () => void;
  /** `pending` only: "Stop tracking", after Check again (OutcomeBanner's order). The page asks first in its own words
   *  when it must (OutcomeBanner `dismissWarned`): the kit adds no second warning. Absent = no button, e.g. while a
   *  request of the change may still be out. */
  onStop?: () => void;
  /** Short title override ("May not have saved"). */
  title?: string;
  /** One sentence on what to check, shown after the title. Defaults per kind. */
  detail?: ReactNode;
  /** Title shown for `done` (default "Done"; forms pass "Saved"). */
  doneText?: string;
  /** `line` (default): one row at button height. `block`: wraps, for a drawer body or section. */
  variant?: 'line' | 'block';
  /** A line whose detail may wrap under the title instead of being cut (footers). */
  wrap?: boolean;
  /** Announce the line at once (role alert) whatever its kind: a `not_sent` reason the person must hear inside a dialog.
   *  It only raises: pending and failed are alerts already and stay so. */
  alert?: boolean;
  /** The rejection (core): the detail defaults to its mapped sentence (before the outcome's message; on pending the
   *  C9 guidance), and a Details button shows its facts with "Copy details for support". Not on `done`. */
  error?: unknown;
  errorWords?: ErrorWordsOptions;
  className?: string;
}

/** The kit Outcome line. Nothing renders for no outcome. */
export function Outcome({ outcome, onCheck, checking, onRetry, onDismiss, onStop, title, detail, doneText, variant = 'line', wrap, alert, error, errorWords, className }: OutcomeLineProps) {
  const t = useStrings(strings);
  const ts = useStrings(stateStrings);
  const o = useOutcome(outcome);
  const [busy, check] = useCheck(onCheck, checking);
  const { info, kind: shown } = useOutcomeFacts(o, error);
  if (!o || !shown) return null;
  const k = shown;
  // Facts saying pending under another kind: the page's title, sentence and message were written for that kind,
  // so the line shows the C9 pending words instead (C9: never "didn't go through" over what may have).
  const promoted = k !== o.kind;
  const short = variant === 'line';
  const titles: Record<OutcomeKind, string> = {
    done: doneText ?? t('outcome.done'),
    pending: short ? t('outcome.pendingShort') : t('outcome.pending'),
    failed: short ? t('outcome.failedShort') : t('outcome.failed'),
    not_sent: t('outcome.notSent'),
    stale: short ? t('outcome.staleShort') : t('outcome.stale'),
  };
  // An error's mapped sentence comes before a page's message text (which may be the API's own words: those
  // belong in Details). Under pending facts it is the C9 guidance; a page's own words for it go in `detail`.
  const mapped = info ? errorSentenceNode(info, errorWords) : undefined;
  const body = promoted ? mapped : (detail ?? mapped ?? o.message ?? (k === 'pending' && !short ? t('outcome.pendingBody') : undefined));
  // C9: never offer to send again what may have gone through.
  const retryable = k === 'failed' || k === 'not_sent' || k === 'stale';
  return (
    <div
      className={cx(s.outcome, s[`k_${k}`], short ? s.line : s.block, short && wrap && s.wrap, className)}
      role={alert || k === 'pending' || k === 'failed' ? 'alert' : 'status'}
      data-outcome={k}
    >
      <Icon name={OUTCOME_ICON[k]} size="sm" className={s.icon} />
      <span className={s.text}>
        <span className={s.title}>{(promoted ? undefined : title) ?? titles[k]}</span>
        {body && <span className={s.detail}>{body}</span>}
      </span>
      {info && <ErrorDetails error={info} mode="button" className={s.action} />}
      {k === 'pending' && check && (
        <Button size="sm" busy={busy} onPress={check} className={s.action}>
          {busy ? t('outcome.checking') : t('outcome.check')}
        </Button>
      )}
      {/* Stop tracking ends a pending outcome the page itself tracks; a line promoted to pending by its facts is not
          one the page tracks, so stopping it would end nothing (Check again still reads it back). */}
      {k === 'pending' && !promoted && onStop && (
        <TextButton onPress={onStop} className={s.action}>
          {ts('err.stopTracking')}
        </TextButton>
      )}
      {retryable && onRetry && (
        <Button size="sm" onPress={onRetry} className={s.action}>
          {t('outcome.retry')}
        </Button>
      )}
      {onDismiss && k !== 'pending' && <IconButton size="sm" icon="x" label={t('outcome.dismiss')} onPress={onDismiss} />}
    </div>
  );
}

export interface OutcomeSlotProps extends Omit<OutcomeLineProps, 'variant'> {
  /** The action(s) this outcome belongs to. Hidden while `pending` (locked until read back). */
  children: ReactNode;
  /** How long `done` shows before the action returns (ms, default 2400; 0 hides done at once). */
  doneFor?: number;
  /** Move a pending outcome to a toast when this slot unmounts (default true). */
  toastOnLeave?: boolean;
  /** What the action changes ("the alias of Production"): the leave toast's title names it. */
  subject?: string;
}

/**
 * The action's place: the buttons normally; while `pending`, the Outcome line with
 * Check again instead of them (so nothing can be resent); after a definite failure, the line
 * before the buttons; after `done`, "Done" for a moment, then the buttons again.
 */
export function OutcomeSlot({ children, doneFor = 2400, toastOnLeave = true, subject, className, ...line }: OutcomeSlotProps) {
  const o = useOutcome(line.outcome);
  const doneShown = useDoneFlash(o, doneFor);
  // The slot locks on the kind the line shows: pending facts hide the actions whatever kind the page passed.
  const { info, kind } = useOutcomeFacts(o, line.error);
  usePendingToast(o, line.onCheck, toastOnLeave, info, true, subject);
  const showLine = o && (kind !== 'done' || doneShown);
  return (
    <div className={cx(s.slot, className)} data-outcome={kind}>
      {showLine && <Outcome {...line} outcome={o} />}
      {kind !== 'pending' && !(kind === 'done' && doneShown) && children}
    </div>
  );
}
