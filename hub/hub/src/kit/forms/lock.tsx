// The form lock (C9): while a send is in flight or its outcome is unknown, every kit field inside
// the Form (or a SettingRow with a pending outcome) is disabled, and the Form refuses to submit, so
// nothing can be changed or sent again until a read-back settles it. Kit fields read the lock
// through useFieldLock(); the FormFooter reads the outcome the Form was given, and reports the
// busy/pending it was given itself, so a caller passing them only to the footer still locks the Form.
import { createContext, type ReactNode, useContext, useEffect } from 'react';
import type { OutcomeLike } from '../outcome';
import type { CheckFn } from './Outcome';

export interface FormState {
  /** Fields and the submit are locked. */
  locked: boolean;
  busy: boolean;
  outcome: OutcomeLike | null;
  onCheck?: CheckFn;
}

const NONE: FormState = { locked: false, busy: false, outcome: null };

export const FormStateContext = createContext<FormState>(NONE);

export function FormStateProvider({ value, children }: { value: FormState; children: ReactNode }) {
  return <FormStateContext.Provider value={value}>{children}</FormStateContext.Provider>;
}

/** The enclosing Form's state (unlocked outside a Form). */
export function useFormState(): FormState {
  return useContext(FormStateContext);
}

/** A field's effective disabled flag: its own, or the enclosing lock. */
export function useFieldLock(isDisabled?: boolean): boolean {
  return useContext(FormStateContext).locked || Boolean(isDisabled);
}

/** What a FormFooter reports to its enclosing Form: its effective busy and pending. */
export interface FooterLock {
  busy: boolean;
  pending: boolean;
}

/** The enclosing Form's footer reporter (null outside a Form). */
export const FooterLockContext = createContext<((lock: FooterLock | null) => void) | null>(null);

/** FormFooter only: hand its busy/pending to the enclosing Form for as long as it is mounted. */
export function useReportFooterLock(busy: boolean, pending: boolean): void {
  const report = useContext(FooterLockContext);
  useEffect(() => {
    report?.({ busy, pending });
  }, [report, busy, pending]);
  useEffect(() => (report ? () => report(null) : undefined), [report]);
}
