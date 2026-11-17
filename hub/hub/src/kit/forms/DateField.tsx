// DateField: one date typed as YYYY-MM-DD, with the same calendar button as DateTimeField. A
// TextField, not a browser date control (its look, keyboard and what it accepts differ per browser and locale).
// The value is the text itself: '' while empty, the canonical YYYY-MM-DD once the typed text is a real day (blur
// completes 2026-3-5 and 20260305), and the raw typed text while it is not, so a page that checks the format
// still sees what is wrong. ↑/↓ step a day; a pick fills the date and the popover hands focus back to its button.
import { type ReactNode, type Ref, useState } from 'react';
import { useStrings } from '../strings';
import { DatePickButton } from './DatePickButton';
import { dayOf, normalizeDate, partsOf } from './DateTimeField';
import { type FieldWidth, TextField } from './fields';
import { useFieldLock } from './lock';
import strings from './DateTimeField.strings.en.json';

export interface DateFieldProps {
  label: string;
  /** YYYY-MM-DD, '' while empty; anything else is text still being typed (or wrong). */
  value: string;
  onChange: (value: string) => void;
  description?: ReactNode;
  /** A refusal from the page; it replaces the field's own "use a date such as" line. */
  errorMessage?: string;
  /** Earliest and latest day (YYYY-MM-DD): the calendar disables the days outside them; typed text is never refused for it. */
  minValue?: string;
  maxValue?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  mono?: boolean;
  className?: string;
  width?: FieldWidth;
  /** The input itself, so a page can focus it without searching the DOM. */
  inputRef?: Ref<HTMLInputElement>;
}

export function DateField({ label, value, onChange, description, errorMessage, minValue, maxValue, isDisabled, isRequired, mono, className, width, inputRef }: DateFieldProps) {
  const t = useStrings(strings);
  const locked = useFieldLock(isDisabled);
  // Text still being typed is not an error yet, neither the field's own line nor a page's format refusal: both wait
  // for blur or for Enter (a submit attempt, which is when a page's refusal must show while focus stays here).
  const [editing, setEditing] = useState(false);
  const [asked, setAsked] = useState(false);
  const unfinished = value !== '' && !dayOf(value);
  const day = (dir: 1 | -1) => {
    const from = dayOf(normalizeDate(value)) ?? new Date(new Date().setHours(0, 0, 0, 0));
    from.setDate(from.getDate() + dir);
    setAsked(false);
    onChange(partsOf(from.getTime())[0]);
  };
  return (
    <TextField
      label={label}
      value={value}
      onChange={(v) => {
        setAsked(false);
        onChange(v.replace(/[^\d-]/g, '').slice(0, 10));
      }}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        setEditing(false);
        setAsked(false);
        const n = normalizeDate(value);
        if (n !== value) onChange(n);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          day(e.key === 'ArrowUp' ? 1 : -1);
        } else {
          if (e.key === 'Enter') setAsked(true);
          e.continuePropagation();
        }
      }}
      inputMode="numeric"
      placeholder={t('dt.datePlaceholder')}
      mono={mono}
      description={description}
      errorMessage={editing && unfinished && !asked ? undefined : (errorMessage ?? (unfinished ? t('dt.dateInvalid') : undefined))}
      // Only the page's error stops blocking the submit; the field's own format hint keeps the native refusal.
      validationBehavior={errorMessage ? 'aria' : 'native'}
      suffix={<DatePickButton value={value} minValue={minValue} maxValue={maxValue} isDisabled={locked} onChange={onChange} />}
      isDisabled={isDisabled}
      isRequired={isRequired}
      className={className}
      width={width}
      inputRef={inputRef}
    />
  );
}
