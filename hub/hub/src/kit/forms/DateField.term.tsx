// DateField in the terminal: one date typed as YYYY-MM-DD, the web's rules line for line (blur completes 2026-3-5 and
// 20260305; ↑/↓ step a day; text being typed is not an error until left or Enter). No calendar button: a day is typed
// or stepped (the web's calendar is a pointer convenience over the same text).
// The terminal draws no calendar: typed and stepped dates are the terminal's date picker.
import { useRef, useState } from 'react';
import type * as Web from './DateField';
import { useStrings } from '../strings';
import { dayOf, normalizeDate, stepDay } from './DateTimeField.pure';
import { TextField } from './fields';
import strings from './DateTimeField.strings.en.json';

export type { DateFieldProps } from './DateField';

export const DateField: typeof Web.DateField = ({ label, value, onChange, description, errorMessage, isDisabled, isRequired, mono, width, inputRef }) => {
  const t = useStrings(strings);
  const [editing, setEditing] = useState(false);
  const [asked, setAsked] = useState(false);
  const unfinished = value !== '' && !dayOf(value);
  // The value as last rendered or sent: blur and the arrows read it, never a value an older render closed over.
  const cur = useRef(value);
  cur.current = value;
  return (
    <TextField
      label={label}
      value={value}
      onChange={(v) => {
        const next = v.replace(/[^\d-]/g, '').slice(0, 10);
        cur.current = next;
        setAsked(false);
        onChange(next);
      }}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        setEditing(false);
        setAsked(false);
        const n = normalizeDate(cur.current);
        if (n !== cur.current) { cur.current = n; onChange(n); }
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          setAsked(false);
          cur.current = stepDay(cur.current, e.key === 'ArrowUp' ? 1 : -1);
          onChange(cur.current);
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
      validationBehavior={errorMessage ? 'aria' : 'native'}
      isDisabled={isDisabled}
      isRequired={isRequired}
      width={width}
      inputRef={inputRef}
    />
  );
};
