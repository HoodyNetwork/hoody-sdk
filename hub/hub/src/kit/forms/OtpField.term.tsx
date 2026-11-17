// The 6-digit code field in the terminal: one Tab stop drawn as slots [1][2][_][_][_][_]. Digits fill the next slot,
// Backspace clears back, a paste (spaces and dashes allowed) fills them all; onComplete fires once the last digit arrives.
// Wiped (onChange('')) like the web field: route change / end of context (useWipeOn), a resetKey change, after its form
// submits (Enter here, a submit button, the form's requestSubmit; deferred a task, so the page reads it first; never
// after an Enter the form refused), and when the field closes. A wrong code (a new errorMessage) puts the focus back
// here. While `submitOnEnter` is false Enter is taken and does nothing (no submit, no wipe), as the web field stops its
// form's implicit submission.
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import type * as Web from './OtpField';
import { Box, Text, useFocusable } from '../../term/prim';
import { usePasteText } from '../../term/prim/FieldPaste';
import { mergeRefs, useSem } from '../../term/prim/semantics';
import { useStrings } from '../strings';
import strings from './forms.strings.en.json';
import { useFieldLock } from './lock';
import { otpDigits } from './OtpField.pure';
import { ControlRow, FieldFrame, useTermForm } from './termField';
import ts from './term.strings.en.json';
import { useWipeOn } from './wipe';
import { focusInk } from '../../term/prim/FocusInk';

export type { OtpFieldProps } from './OtpField';
export { otpDigits };

export const OtpField: typeof Web.OtpField = ({ label, value, onChange, onComplete, description, errorMessage, isDisabled, autoFocus, length = 6, resetKey, submitOnEnter = true, inputRef }) => {
  const t = useStrings(strings);
  const tt = useStrings(ts);
  const disabled = useFieldLock(isDisabled);
  const digits = otpDigits(value, length);
  const completed = useRef<string | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const wipe = (): void => { if (latest.current.value) latest.current.onChange(''); };
  useWipeOn(wipe, resetKey);
  const form = useTermForm();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The web field listens for its form's submit event, whatever sent it. Subscribed in a layout effect, so it is in
  // place before a submit sent from an effect of the same commit (NumberField's Enter).
  const onSubmitted = form?.onSubmitted;
  useLayoutEffect(() => onSubmitted?.(() => { clearTimeout(timer.current); timer.current = setTimeout(wipe, 0); }), [onSubmitted]);
  const closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(closing.current);
    return () => {
      clearTimeout(timer.current);
      closing.current = setTimeout(wipe, 0);
    };
  }, []);
  useEffect(() => {
    if (digits.length === length && completed.current !== digits) {
      completed.current = digits;
      onComplete?.(digits);
    } else if (digits.length < length) completed.current = null;
  }, [digits, length, onComplete]);
  // Keys can arrive faster than renders: each edit builds on the last value sent, not on the last render's.
  const live = useRef(digits);
  live.current = digits;
  // As the web input: every input event reports, even one that changes no digit (a letter typed, a 7th digit).
  const put = (raw: string): void => { const n = otpDigits(raw, length); live.current = n; onChange(n); };
  const f = useFocusable({
    disabled,
    auto: autoFocus,
    onKey: (k) => {
      if (k.ctrl || k.meta || k.super) return false;
      // An empty input has nothing to delete: the browser fires no input event.
      if (k.name === 'backspace') { if (live.current) put(live.current.slice(0, -1)); return true; }
      if (k.name === 'return' || k.name === 'linefeed') {
        if (!submitOnEnter) return true;
        if (!form) return false;
        form.submit();
        return true;
      }
      if (k.sequence && /^\d+$/.test(k.sequence)) { put(live.current + k.sequence); return true; }
      // Anything else that types one character (space included) is not a digit: the web input takes it, fires an input
      // event and drops it (onChange with the same digits). Here the same.
      if (k.sequence && k.sequence.length === 1 && k.sequence >= ' ') { put(live.current + k.sequence); return true; }
      return false;
    },
  });
  usePasteText(f.focused && !disabled, (text) => { put(live.current + text); return true; });
  // The page may focus the field (web: an input ref); here the handle is a focus() call.
  useImperativeHandle(inputRef, () => ({ focus: f.focus }) as unknown as HTMLInputElement, [f.focus]); // contract-any: an element-shaped handle; a terminal has no DOM element, only focus
  const lastError = useRef(errorMessage);
  const focus = useRef(f.focus);
  focus.current = f.focus;
  useEffect(() => {
    if (errorMessage && errorMessage !== lastError.current) focus.current();
    lastError.current = errorMessage;
  }, [errorMessage]);
  const help = description === undefined ? t('otp.help') : description;
  // The web input: a textbox named by the label, described by the help and the error. Its digits are a credential:
  // the tree says only whether any are typed, never which.
  const semRef = useSem(
    { secret: true, name: label ?? t('otp.label'), description: help ?? undefined, invalid: errorMessage ? true : undefined, errorText: errorMessage },
    { role: 'textbox', focus: f, disabled, value: digits },
  );
  const ref = useMemo(() => mergeRefs(f.ref as never, semRef), [f.ref, semRef]); // contract-any: engine node type
  const active = Math.min(digits.length, length - 1);
  return (
    <FieldFrame label={label ?? t('otp.label')} disabled={disabled} description={help ?? undefined} error={errorMessage} reserveError>
      <Box dir="row">
        <ControlRow focused={f.focused} invalid={!!errorMessage} disabled={disabled}>
          <Box dir="row" boxRef={ref} onPress={disabled ? undefined : () => f.focus()} shrink={0}>
            {Array.from({ length }, (_, i) => {
              const on = f.focused && i === active && digits.length < length;
              return (
                <Text key={i} colour={disabled ? 'faint' : i < digits.length ? 'ink' : 'muted'}>
                  [<Text bold={i < digits.length} {...focusInk(on)}>{digits[i] ?? tt('otp.slot')}</Text>]
                </Text>
              );
            })}
          </Box>
        </ControlRow>
      </Box>
    </FieldFrame>
  );
};
