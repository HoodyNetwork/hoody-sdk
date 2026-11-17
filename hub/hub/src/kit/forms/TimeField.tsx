// TimeField: a 24-hour time typed as HH:MM and stepped with ↑/↓. The step rule is shared with DateTimeField.
import { type ReactNode } from 'react';
import { cx } from '../controls/Button';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import { TextField } from './fields';
import s from './more.module.css';
import { TIME, normalizeTime, stepTime } from './more.pure';

export interface TimeFieldProps {
  label: string;
  /** 'HH:MM' (24 h); '' while empty. */
  value: string;
  onChange: (value: string) => void;
  description?: ReactNode;
  /** Overrides the built-in "Use HH:MM" message. */
  errorMessage?: string;
  /** Minutes per ↑/↓ press (default 15). */
  step?: number;
  isDisabled?: boolean;
  isRequired?: boolean;
  className?: string;
}

// The pure rules live in more.pure.ts (shared with the terminal); their names stay importable from here.
export { normalizeTime, stepClock } from './more.pure';

/** A 24-hour time typed as HH:MM (--field-time-w), stepped with ↑/↓; the error line keeps its 16 px. */
export function TimeField({ label, value, onChange, description, errorMessage, step = 15, isDisabled, isRequired, className }: TimeFieldProps) {
  const t = useStrings(kitStrings);
  const invalid = value !== '' && !TIME.test(value);
  const stepBy = (dir: 1 | -1) => onChange(stepTime(value, step, dir));
  return (
    <TextField
      label={label}
      value={value}
      onChange={(v) => onChange(v.replace(/[^\d:]/g, '').slice(0, 5))}
      onBlur={() => {
        const n = normalizeTime(value);
        if (n !== value) onChange(n);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          stepBy(e.key === 'ArrowUp' ? 1 : -1);
        } else e.continuePropagation();
      }}
      inputMode="numeric"
      placeholder={t('time.placeholder')}
      mono
      description={description}
      errorMessage={errorMessage ?? (invalid ? t('time.invalid') : undefined)}
      isInvalid={invalid || Boolean(errorMessage)}
      // Only the page's own error stops blocking the submit; a typed text that is no time still does.
      validationBehavior={errorMessage ? 'aria' : 'native'}
      isDisabled={isDisabled}
      isRequired={isRequired}
      className={cx(s.time, className)}
    />
  );
}
