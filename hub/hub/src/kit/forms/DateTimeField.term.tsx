// DateTimeField in the terminal: the group's label, then the date (YYYY-MM-DD) and the time (HH:MM) side by side, each a
// kit TextField with the web's rules (DateTimeField.pure.ts): a part says it is wrong only once left, ↑/↓ step a day or
// `step` minutes, a value from outside replaces the parts unless one is being typed. No calendar button: a day is typed
// or stepped (the web's calendar is a pointer convenience over the same value).
// The terminal draws no calendar: typed and stepped dates are the terminal's date picker.
import { useRef, useState } from 'react';
import type * as Web from './DateTimeField';
import { Box } from '../../term/prim';
import { useStrings } from '../strings';
import { TextField } from './fields';
import { normalizeTime } from './more.pure';
import { TIME_24, compose, dayOf, normalizeDate, partsOf, stepDay, stepTimeGrid } from './DateTimeField.pure';
import { FieldFrame } from './termField';
import { useFieldLock } from './lock';
import strings from './DateTimeField.strings.en.json';

export type { DateTimeFieldProps } from './DateTimeField';
export { normalizeDate, dayOf, partsOf } from './DateTimeField.pure';

type Arrows = { key: string; preventDefault: () => void; continuePropagation: () => void };
const arrows = (go: (dir: 1 | -1) => void) => (e: Arrows) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    go(e.key === 'ArrowUp' ? 1 : -1);
  } else e.continuePropagation();
};

export const DateTimeField: typeof Web.DateTimeField = ({ label, value, onChange, description, errorMessage, step = 15, isDisabled, isRequired }) => {
  const t = useStrings(strings);
  const locked = useFieldLock(isDisabled);
  const [[dateText, timeText], setParts] = useState(() => partsOf(value));
  const [editing, setEditing] = useState<'date' | 'time' | null>(null);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (editing === null && value !== compose(dateText, timeText)) setParts(partsOf(value));
  }
  // The parts as last set, read by every handler (a key handler from an older render must pair with the other part as it is now).
  const cur = useRef<[string, string]>([dateText, timeText]);
  cur.current = [dateText, timeText];
  const set = (d: string, tm: string) => {
    cur.current = [d, tm];
    setParts([d, tm]);
    const ms = compose(d, tm);
    setSeen(ms);
    onChange(ms);
  };
  const dateBad = editing !== 'date' && dateText !== '' && !dayOf(dateText);
  const timeBad = editing !== 'time' && timeText !== '' && !TIME_24.test(timeText);
  const whole = errorMessage ? { isInvalid: true } : {};
  const pageValidation = errorMessage ? 'aria' : 'native';
  return (
    <FieldFrame label={label} required={isRequired} disabled={locked} description={description} error={errorMessage}>
      {/* The web's named group (role group, its label, its description): the two parts are read as one field. */}
      <Box dir="row" gap={2} wrap sem={{ role: 'group', name: label, description: typeof description === 'string' ? description : undefined }}>
        <Box shrink={0}>
          <TextField
            aria-label={t('dt.date')}
            value={dateText}
            onChange={(v) => { set(v.replace(/[^\d-]/g, '').slice(0, 10), cur.current[1]); }}
            {...whole}
            onFocus={() => setEditing('date')}
            onBlur={() => {
              setEditing(null);
              const [d, tm] = cur.current;
              const n = normalizeDate(d);
              if (n !== d) set(n, tm);
            }}
            onKeyDown={arrows((dir) => set(stepDay(cur.current[0], dir), cur.current[1]))}
            inputMode="numeric"
            placeholder={t('dt.datePlaceholder')}
            mono
            width="xs"
            errorMessage={dateBad ? t('dt.dateInvalid') : undefined}
            validationBehavior={pageValidation}
            isDisabled={isDisabled}
            isRequired={isRequired}
          />
        </Box>
        <Box shrink={0}>
          <TextField
            aria-label={t('dt.time')}
            value={timeText}
            onChange={(v) => { set(cur.current[0], v.replace(/[^\d:]/g, '').slice(0, 5)); }}
            {...whole}
            onFocus={() => setEditing('time')}
            onBlur={() => {
              setEditing(null);
              const [d, tm] = cur.current;
              const n = normalizeTime(tm);
              if (n !== tm) set(d, n);
            }}
            onKeyDown={arrows((dir) => set(cur.current[0], stepTimeGrid(cur.current[1], step, dir)))}
            inputMode="numeric"
            placeholder={t('dt.timePlaceholder')}
            mono
            width="xs"
            errorMessage={timeBad ? t('dt.timeInvalid') : undefined}
            validationBehavior={pageValidation}
            isDisabled={isDisabled}
            isRequired={isRequired}
          />
        </Box>
      </Box>
    </FieldFrame>
  );
};
