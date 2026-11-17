// Error details: the facts of one failed call as labelled lines, plus "Copy details for support".
// The copied text is exactly the shown lines. Facts come only from core's errorInfo (an allow-list: never
// data, bodies, tokens, filled paths or query values). `disclosure` folds under a sentence (ErrorState,
// OutcomeBanner); `button` opens a small dialog, for surfaces a button high (the Outcome line, a Band, a toast).
import { type ReactNode, useState } from 'react';
import type { ErrorInfo } from '@core';
import { Disclosure } from '../controls/Disclosure';
import { Link, TextButton } from '../controls/Link';
import { CopyButton } from '../data/Ids';
import { Dialog } from '../overlays/Dialog';
import { makeT, useStrings } from '../strings';
import { errorLines, errorText, useErrorInfo, type T } from './errorDetails.pure';
import { errorWords, type ErrorWordsOptions } from './errorWords';
import stateStrings from './strings.en.json';
import s from './ErrorDetails.module.css';

export { errorLines, errorText, errorSentence, infoOf, withOutcome, KIND_OUTCOME, pendingFacts, shownKind, useErrorInfo, type ErrorLine } from './errorDetails.pure';

/** The mapped sentence as a surface shows it: the sentence, then its one link when the words have one (a standalone
 *  payment's hand-off to the served Hub). Use errorSentence where only text fits (a toast body, copied text). */
export function errorSentenceNode(info: ErrorInfo, opts?: ErrorWordsOptions, t: T = makeT(stateStrings)): ReactNode {
  const w = errorWords(info, opts);
  const text = t(w.key, w.vars);
  if (!w.link) return text;
  return (
    <>
      {text}{' '}
      <Link href={w.link.href} variant="inline">
        {t(w.link.label)}
      </Link>
    </>
  );
}

function Lines({ info, t }: { info: ErrorInfo; t: T }) {
  return (
    <div className={s.details}>
      <dl className={s.lines}>
        {errorLines(info, t).map((l) => (
          <div key={l.label} className={s.line}>
            <dt className={s.label}>{l.label}</dt>
            <dd className={s.value}>{l.href ? <Link href={l.href}>{l.value}</Link> : l.value}</dd>
          </div>
        ))}
      </dl>
      <CopyButton getValue={() => errorText(info, t)} label={t('err.copy')} withLabel />
    </div>
  );
}

export interface ErrorDetailsProps {
  /** Any rejection, or an ErrorInfo. Nothing renders for null/undefined. */
  error: unknown;
  /** `disclosure` (default): a "Details" fold. `button`: a "Details" button opening a dialog. */
  mode?: 'disclosure' | 'button';
  className?: string;
}

export function ErrorDetails({ error, mode = 'disclosure', className }: ErrorDetailsProps) {
  const t = useStrings(stateStrings);
  const info = useErrorInfo(error);
  const [open, setOpen] = useState(false);
  if (!info) return null;
  if (mode === 'button') {
    return (
      <>
        <TextButton onPress={() => setOpen(true)} className={className}>
          {t('err.details')}
        </TextButton>
        <Dialog isOpen={open} onOpenChange={setOpen} title={t('err.detailsTitle')} cancelLabel={t('err.close')} initialFocus="cancel">
          <Lines info={info} t={t} />
        </Dialog>
      </>
    );
  }
  return (
    <Disclosure title={t('err.details')} className={className}>
      <Lines info={info} t={t} />
    </Disclosure>
  );
}
