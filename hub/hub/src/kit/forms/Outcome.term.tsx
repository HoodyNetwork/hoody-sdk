// The Outcome line in the terminal: a mark and a title (the mark carries the kind without colour: ✓ done, ◷ may
// have gone through, ✗ didn't go through, i not sent / not applied), the detail, then Details / Check again / Try again
// / dismiss. The rules are the web's, from Outcome.pure.ts.
import type { ReactNode } from 'react';
import type * as Web from './Outcome';
import { Box, Text, type Colour } from '../../term/prim';
import { Button, IconButton } from '../controls/Button';
import type { OutcomeKind } from '../outcome';
import { ErrorDetails, errorSentence } from '../states/ErrorDetails';
import stateStrings from '../states/strings.en.json';
import { useStrings } from '../strings';
import strings from './forms.strings.en.json';
import { useCheck, useDoneFlash, useOutcome, useOutcomeFacts, usePendingToast } from './Outcome.pure';

export type { OutcomeLineProps, OutcomeSlotProps, CheckFn } from './Outcome';
export { useOutcome, useCheck, usePendingToast, useOutcomeFacts, useDoneFlash } from './Outcome.pure';

/** The mark per kind: it reads in mono. */
const OUTCOME_MARK: Readonly<Record<OutcomeKind, string>> = { done: '✓', pending: '◷', failed: '✗', not_sent: 'i', stale: 'i' };
const OUTCOME_COLOUR: Readonly<Record<OutcomeKind, Colour>> = { done: 'ok', pending: 'warn', failed: 'danger', not_sent: 'muted', stale: 'muted' };

export const Outcome: typeof Web.Outcome = ({ outcome, onCheck, checking, onRetry, onDismiss, onStop, title, detail, doneText, variant = 'line', wrap, alert, error, errorWords }) => {
  const t = useStrings(strings);
  const ts = useStrings(stateStrings);
  const o = useOutcome(outcome);
  const [busy, check] = useCheck(onCheck, checking);
  const { info, kind: shown } = useOutcomeFacts(o, error);
  if (!o || !shown) return null;
  const k = shown;
  const promoted = k !== o.kind;
  const short = variant === 'line';
  const titles: Record<OutcomeKind, string> = {
    done: doneText ?? t('outcome.done'),
    pending: short ? t('outcome.pendingShort') : t('outcome.pending'),
    failed: short ? t('outcome.failedShort') : t('outcome.failed'),
    not_sent: t('outcome.notSent'),
    stale: short ? t('outcome.staleShort') : t('outcome.stale'),
  };
  const mapped = info ? errorSentence(info, errorWords) : undefined;
  const body: ReactNode = promoted ? mapped : (detail ?? mapped ?? o.message ?? (k === 'pending' && !short ? t('outcome.pendingBody') : undefined));
  const retryable = k === 'failed' || k === 'not_sent' || k === 'stale';
  const head = (
    <Text colour={OUTCOME_COLOUR[k]} bold truncate={short && !wrap}>
      {OUTCOME_MARK[k]} {(promoted ? undefined : title) ?? titles[k]}
      {body !== undefined && body !== null && short && !wrap && typeof body === 'string' ? <Text colour="muted">{` · ${body}`}</Text> : null}
    </Text>
  );
  const longBody = body !== undefined && body !== null && !(short && !wrap && typeof body === 'string');
  return (
    // The web line's live region: an alert for pending and failed (and when the page asks), else a status.
    <Box dir={short ? 'row' : 'column'} gap={1} shrink={1} wrap={short} sem={{ role: alert || k === 'pending' || k === 'failed' ? 'alert' : 'status' }}>
      <Box dir="column" shrink={1}>
        {head}
        {longBody ? (typeof body === 'string' ? <Text colour="muted">{body}</Text> : body) : null}
      </Box>
      <Box dir="row" gap={1} shrink={0}>
        {info && <ErrorDetails error={info} mode="button" />}
        {k === 'pending' && check && (
          <Button size="sm" busy={busy} onPress={check}>{busy ? t('outcome.checking') : t('outcome.check')}</Button>
        )}
        {/* Stop tracking ends a pending outcome the page itself tracks; a line promoted to pending by its facts is not
            one the page tracks, so stopping it would end nothing (Check again still reads it back). The web's rule. */}
        {k === 'pending' && !promoted && onStop && <Button size="sm" variant="ghost" onPress={onStop}>{ts('err.stopTracking')}</Button>}
        {retryable && onRetry && <Button size="sm" onPress={onRetry}>{t('outcome.retry')}</Button>}
        {onDismiss && k !== 'pending' && <IconButton size="sm" icon="x" label={t('outcome.dismiss')} onPress={onDismiss} />}
      </Box>
    </Box>
  );
};

export const OutcomeSlot: typeof Web.OutcomeSlot = ({ children, doneFor = 2400, toastOnLeave = true, subject, ...line }) => {
  const o = useOutcome(line.outcome);
  const doneShown = useDoneFlash(o, doneFor);
  const { info, kind } = useOutcomeFacts(o, line.error);
  usePendingToast(o, line.onCheck, toastOnLeave, info, true, subject);
  const showLine = o && (kind !== 'done' || doneShown);
  return (
    <Box dir="row" gap={1} shrink={0} wrap>
      {showLine && <Outcome {...line} outcome={o} />}
      {kind !== 'pending' && !(kind === 'done' && doneShown) && children}
    </Box>
  );
};
