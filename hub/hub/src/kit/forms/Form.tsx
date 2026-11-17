// Form and FormFooter: a form tied to its mutation's outcome. The form locks its fields while a change is unknown
// (C9) and the footer shows the outcome line beside Cancel and Save. Use them for every edit that is saved with a
// button; an instant-apply control belongs in a SettingRow instead.
import { type ReactNode, type Ref, useEffect, useId, useMemo, useState } from 'react';
import { Form as AriaForm } from 'react-aria-components';
import { Button, cx } from '../controls/Button';
import { useDrawer } from '../overlays/Drawer';
import { type OutcomeInput, isUnknown } from '../outcome';
import { type ErrorWordsOptions } from '../states/errorWords';
import { useStrings } from '../strings';
import strings from './forms.strings.en.json';
import { type FooterLock, FooterLockContext, FormStateProvider, useFormState, useReportFooterLock } from './lock';
import { type CheckFn, Outcome, useCheck, useDoneFlash, useOutcome, useOutcomeFacts, usePendingToast } from './Outcome';
import s from './more.module.css';

export interface FormProps {
  onSubmit: () => void;
  /** Server-side field errors by field name (RAC shows them on the matching field). */
  fieldErrors?: Readonly<Record<string, string>>;
  /** The send is in flight: fields lock and Enter does nothing. */
  busy?: boolean;
  /**
   * The last send's outcome (core mutation `outcome`, or a kit OutcomeLike). `pending` locks every
   * kit field and refuses to submit until a read-back settles it (C9). The FormFooter inside reads
   * it from here.
   */
  outcome?: OutcomeInput;
  /** The read-back after an unknown outcome (the FormFooter's Check again). Never a resend. */
  onCheck?: CheckFn;
  /** Lock for another reason (the page knows the form can't be sent now). */
  locked?: boolean;
  /**
   * `stack` (default): a column, `--sp-4` apart, at most `--form-max` wide. `inline`: one row that wraps, controls
   * bottom-aligned. `bare`: no gap and no cap, for a form whose page lays out its contents.
   */
  layout?: 'stack' | 'inline' | 'bare';
  /** The form element (focus, measuring, a scroll target). */
  ref?: Ref<HTMLFormElement>;
  className?: string;
  children: ReactNode;
}

/**
 * A form that submits with Enter and the footer button, never reloads the page, and locks while a
 * send is in flight or its outcome is unknown. Spread a core mutation: `<Form {...fromMutation(save)}>`.
 * A FormFooter inside that was given `busy`/`outcome` itself locks it the same way.
 */
export function Form({ onSubmit, fieldErrors, busy = false, outcome, onCheck, locked, layout = 'stack', ref, className, children }: FormProps) {
  const o = useOutcome(outcome);
  // A footer given busy/pending itself (not through the Form) locks the Form as well (C9).
  const [footer, setFooter] = useState<FooterLock | null>(null);
  const isLocked = Boolean(locked) || busy || isUnknown(o) || Boolean(footer && (footer.busy || footer.pending));
  const state = useMemo(() => ({ locked: isLocked, busy, outcome: o, onCheck }), [isLocked, busy, o, onCheck]);
  return (
    <FooterLockContext.Provider value={setFooter}>
      <FormStateProvider value={state}>
        <AriaForm
          ref={ref}
          className={cx(s.form, layout !== 'stack' && s[`form_${layout}`], className)}
          validationErrors={fieldErrors}
          data-busy={busy || undefined}
          data-locked={isLocked || undefined}
          onSubmit={(e) => {
            e.preventDefault();
            if (isLocked) return;
            onSubmit();
          }}
        >
          {children}
        </AriaForm>
      </FormStateProvider>
    </FooterLockContext.Provider>
  );
}

export interface FormFooterProps {
  /** The form differs from what the server holds. */
  dirty: boolean;
  /** The send is in flight (defaults to the enclosing Form's). */
  busy?: boolean;
  /**
   * Outcome of the last submit (defaults to the enclosing Form's). `pending` locks the footer: the
   * primary becomes Check again (reads only), Cancel becomes Close, Discard goes (C9).
   */
  outcome?: OutcomeInput;
  /** The read-back (defaults to the enclosing Form's). */
  onCheck?: CheckFn;
  /** Override the internal checking flag. */
  checking?: boolean;
  onDiscard?: () => void;
  submitLabel?: string;
  /** The label while sending (default "Saving…"). */
  busyLabel?: string;
  /** The word shown for a moment after `done` (default "Saved"). */
  doneText?: string;
  /** How long "Saved" shows (ms, default 2400; Infinity keeps it until the next edit). */
  doneFor?: number;
  /** One sentence for the unknown state ("Check whether the key was made."). */
  pendingDetail?: ReactNode;
  /**
   * One sentence for a refusal (outcome kind `failed` only): the page's own words for what went wrong
   * ("A computer with this name already exists in this project."). It takes the place of the mapped sentence;
   * the Details button for `error` stays. Never shown on pending (that is `pendingDetail`).
   */
  failedDetail?: ReactNode;
  /** Submit outside a Form (drawers): otherwise the button submits the enclosing Form. */
  onSubmit?: () => void;
  /**
   * Outside a Drawer: Cancel (secondary, left of the primary) calls this. Inside a Drawer the
   * footer always shows Cancel and closes through the drawer's dirty/busy guard instead.
   */
  onCancel?: () => void;
  /** Create forms pass false: submit is allowed before any edit (a prefilled form is not dirty). Default true. */
  requireDirty?: boolean;
  /** Extra reasons the submit is not possible yet (invalid input). */
  submitDisabled?: boolean;
  /** Danger styling for the primary (Delete, Turn off). */
  tone?: 'default' | 'danger';
  /** Move a pending outcome to a toast when the footer goes away (default true). */
  toastOnLeave?: boolean;
  /**
   * A step nested inside a drawer's own form (a key setup): its busy still holds the drawer, but its pending outcome
   * does not stand for the drawer's unsaved changes, so closing still asks to discard them.
   */
  nested?: boolean;
  /** The rejection behind the outcome (core): mapped sentence plus a Details button (Outcome `error`). */
  error?: unknown;
  errorWords?: ErrorWordsOptions;
  /** One line saying what pressing the primary does or why it is off ("Nothing is sent until you press Connect"),
   *  in the state slot while there is no outcome (it takes the place of "Unsaved changes"). An outcome always wins. */
  reason?: ReactNode;
  className?: string;
}

export function FormFooter({
  dirty,
  busy: busyProp,
  outcome: outcomeProp,
  onCheck: onCheckProp,
  checking,
  onDiscard,
  submitLabel,
  busyLabel,
  doneText,
  doneFor,
  pendingDetail,
  failedDetail,
  onSubmit,
  onCancel,
  requireDirty = true,
  submitDisabled,
  tone = 'default',
  toastOnLeave = true,
  nested = false,
  error,
  errorWords,
  reason,
  className,
}: FormFooterProps) {
  const t = useStrings(strings);
  const form = useFormState();
  const busy = busyProp ?? form.busy;
  const own = useOutcome(outcomeProp);
  const o = outcomeProp !== undefined ? own : form.outcome;
  const onCheck = onCheckProp ?? form.onCheck;
  const [checkBusy, check] = useCheck(onCheck, checking);
  const doneShown = useDoneFlash(o, doneFor);
  // The footer locks on the kind its line shows: pending facts lock it whatever kind the page passed (C9).
  const { info, kind } = useOutcomeFacts(o, error);
  const pending = kind === 'pending';
  // A Check again that is reading counts as busy: Close waits for it, and the drawer is told.
  const lock = busy || checkBusy;
  // Inside a Drawer: the drawer owns the close guard (busy refuses closing); the leave toast stays
  // here, and fires once when the drawer closes (the footer unmounts with it). A page kept loaded that
  // hides opens it too, and closes it when the footer shows again with its outcome (usePendingToast).
  const drawer = useDrawer();
  const report = drawer?.reportOutcome;
  const reporter = useId();
  useEffect(() => {
    if (!report) return;
    report(reporter, { pending, busy: lock, nested, ...(onCheck ? { onCheck: () => void onCheck() } : {}) });
  }, [report, reporter, pending, lock, nested, onCheck]);
  useEffect(() => (report ? () => report(reporter, null) : undefined), [report, reporter]);
  usePendingToast(o, onCheck, toastOnLeave, info);
  useReportFooterLock(busy, pending);
  const cancel = drawer ? drawer.requestClose : onCancel;

  let state: ReactNode = null;
  if (o && o.kind !== 'done') {
    // A page's refusal words show only on a refusal (kind failed): a refusal whose facts say pending keeps the C9 words,
    // and not sent / stale keep their own (a stale answer was dropped after its context ended, not refused).
    const detail = o.kind === 'pending' ? pendingDetail : o.kind === 'failed' && !pending ? failedDetail : undefined;
    state = <Outcome outcome={o} detail={detail} error={info} errorWords={errorWords} wrap />;
  } else if (doneShown && !dirty) {
    state = <Outcome outcome={o} doneText={doneText ?? t('form.saved')} />;
  } else if (reason) {
    state = <span className={s.footerDirty}>{reason}</span>;
  } else if (dirty && !busy) {
    state = <span className={s.footerDirty}>{t('form.unsaved')}</span>;
  }

  return (
    <div className={cx(s.footer, className)} data-outcome={kind}>
      <div className={s.footerState} role={state && !o ? 'status' : undefined}>
        {state}
      </div>
      <div className={s.footerActions}>
        {onDiscard && !pending && (
          <Button variant="ghost" isDisabled={!dirty || busy} onPress={onDiscard}>
            {t('form.discard')}
          </Button>
        )}
        {(onCancel || drawer) && cancel && (
          <Button chip={false} variant="secondary" isDisabled={lock} onPress={cancel}>
            {pending ? t('form.close') : t('form.cancel')}
          </Button>
        )}
        {pending ? (
          <Button variant="primary" type="button" icon="reload" busy={checkBusy} isDisabled={!check} onPress={check}>
            {checkBusy ? t('outcome.checking') : t('outcome.check')}
          </Button>
        ) : (
          <Button
            // A danger submit is the outlined danger; the default one the accent primary.
            variant={tone === 'danger' ? 'secondary' : 'primary'}
            tone={tone}
            type={onSubmit ? 'button' : 'submit'}
            busy={busy}
            isDisabled={(requireDirty && !dirty) || form.locked || submitDisabled}
            onPress={busy ? undefined : onSubmit}
          >
            {busy ? (busyLabel ?? t('form.saving')) : (submitLabel ?? t('form.save'))}
          </Button>
        )}
      </div>
    </div>
  );
}
