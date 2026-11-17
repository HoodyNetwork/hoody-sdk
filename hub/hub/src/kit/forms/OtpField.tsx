// The 6-digit code field for 2FA step-up and setup.
// One real input (numeric keyboard, one-time-code autofill, paste of a whole code with spaces or
// dashes) drawn as six cells; the person never moves between boxes. `onComplete` fires once the
// sixth digit is typed. A wrong code: the page passes errorMessage and clears the value; the error
// line keeps its room so the dialog does not jump.
//
// The code is wiped (onChange('')) like SecretInput's entry: on route change, the end of its context,
// page hide, a `resetKey` change, after its form submits (once the page has read it), and when the
// field closes. A tab that only goes to the background keeps it: the person is reading the code off
// another app.
import { type Ref, useEffect, useId, useImperativeHandle, useRef } from 'react';
import { cx } from '../controls/Button';
import { useStrings } from '../strings';
import b from './fieldBox.module.css';
import f from './fields.module.css';
import strings from './forms.strings.en.json';
import { useFieldLock } from './lock';
import { useWipeOn } from './wipe';
import { otpDigits } from './OtpField.pure';
import s from './OtpField.module.css';

export interface OtpFieldProps {
  /** Defaults to "Code". */
  label?: string;
  /** Digits only, 0-6 long. */
  value: string;
  onChange: (digits: string) => void;
  /** Called with the full code when the last digit arrives (paste included). */
  onComplete?: (code: string) => void;
  /** Defaults to "The 6-digit code from your authenticator app." Pass null for none. */
  description?: string | null;
  errorMessage?: string;
  isDisabled?: boolean;
  autoFocus?: boolean;
  /** Code length (default 6). */
  length?: number;
  name?: string;
  /** Wipes the code when it changes. */
  resetKey?: unknown;
  /** False while its form cannot send yet (a step before the code is still owed): Enter in the field submits nothing,
   *  so a typed code is never wiped by a submit that could not send it. Default true. */
  submitOnEnter?: boolean;
  className?: string;
  /** The input that takes every key, so a page can focus it without searching the DOM. */
  inputRef?: Ref<HTMLInputElement>;
}

export { otpDigits } from './OtpField.pure';

export function OtpField({ label, value, onChange, onComplete, description, errorMessage, isDisabled, autoFocus, length = 6, name, resetKey, submitOnEnter = true, className, inputRef }: OtpFieldProps) {
  const t = useStrings(strings);
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(inputRef, () => input.current as HTMLInputElement, []);
  const disabled = useFieldLock(isDisabled);
  const digits = otpDigits(value, length);
  const completed = useRef<string | null>(null);

  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const wipe = () => {
    if (latest.current.value) latest.current.onChange('');
  };
  useWipeOn(wipe, resetKey);
  // After its form submits, once the page has read the code, and when the field closes. The submit wipe
  // is a task, never a microtask: when the browser dispatches the submit, microtasks run between this
  // form listener and React's onSubmit (delegated to the root), so a microtask wipe emptied the code
  // before the page read it.
  useEffect(() => {
    const form = input.current?.form;
    let timer: number | undefined;
    const onSubmit = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(wipe, 0);
    };
    form?.addEventListener('submit', onSubmit);
    return () => {
      form?.removeEventListener('submit', onSubmit);
      window.clearTimeout(timer);
    };
  }, []);
  const closing = useRef<number | undefined>(undefined);
  useEffect(() => {
    // Deferred, so StrictMode's simulated unmount/remount keeps what was typed.
    window.clearTimeout(closing.current);
    return () => {
      closing.current = window.setTimeout(wipe, 0);
    };
  }, []);

  useEffect(() => {
    if (digits.length === length && completed.current !== digits) {
      completed.current = digits;
      onComplete?.(digits);
    } else if (digits.length < length) completed.current = null;
  }, [digits, length, onComplete]);

  // A wrong code (a new error) clears the field: put the caret back.
  const lastError = useRef(errorMessage);
  useEffect(() => {
    if (errorMessage && errorMessage !== lastError.current) input.current?.focus();
    lastError.current = errorMessage;
  }, [errorMessage]);

  const help = description === undefined ? t('otp.help') : description;
  const describedBy = [help ? `${id}-help` : null, errorMessage ? `${id}-err` : null].filter(Boolean).join(' ') || undefined;
  const active = Math.min(digits.length, length - 1);

  return (
    <div className={cx(f.field, s.otp, className)} data-disabled={disabled || undefined} data-invalid={errorMessage ? '' : undefined}>
      <label className={f.label} htmlFor={id}>
        {label ?? t('otp.label')}
      </label>
      {/* The input lies over the cells (inset 0), so every click and tap lands in it. */}
      <div className={s.cells} style={{ ['--otp-n' as string]: length }}>
        {Array.from({ length }, (_, i) => (
          <span key={i} className={cx(b.box, s.cell, i === active && s.active, i < digits.length && s.filled)} aria-hidden="true">
            {digits[i] ?? ''}
          </span>
        ))}
        <input
          ref={input}
          id={id}
          name={name}
          className={s.input}
          value={digits}
          onChange={(e) => onChange(otpDigits(e.target.value, length))}
          // Enter in a text input submits its form (implicit submission); stopped here while the form cannot send yet.
          onKeyDown={submitOnEnter ? undefined : (e) => { if (e.key === 'Enter') e.preventDefault(); }}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={length + 8}
          spellCheck={false}
          disabled={disabled}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the code dialog opens to type the code
          autoFocus={autoFocus}
          aria-invalid={errorMessage ? true : undefined}
          aria-describedby={describedBy}
          title={t('otp.digits')}
        />
      </div>
      {help && (
        <span id={`${id}-help`} className={f.description}>
          {help}
        </span>
      )}
      <span id={`${id}-err`} className={cx(f.error, s.error)} role={errorMessage ? 'alert' : undefined}>
        {errorMessage ?? ''}
      </span>
    </div>
  );
}
