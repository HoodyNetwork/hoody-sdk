// DateTimeField: a date and a 24-hour time in the viewer's time zone (the logs' "Around a time").
// Use DateField for a day alone and TimeField for a time alone.
// Two typed parts in one named group, like TimeField: the date as YYYY-MM-DD and the time as HH:MM, both
// locale-neutral and read the same everywhere; numeric keyboards on touch; ↑/↓ step a day or `step`
// minutes. No browser datetime-local: its look, its keyboard and what it accepts differ per browser and
// locale. The value is epoch ms built from the parts with the local calendar (never a parsed string), or
// null while either part is empty or invalid. A calendar button beside the date picks a day (the time stays
// as typed) and moves focus to the time.
import { type ReactNode, useId, useRef, useState } from 'react';
import { cx } from '../controls/Button';
import { useStrings } from '../strings';
import { DatePickButton } from './DatePickButton';
import { TextField } from './fields';
import f from './fields.module.css';
import { useFieldLock } from './lock';
import { normalizeTime } from './more';
import { TIME_24 as TIME, compose, dayOf, normalizeDate, partsOf, stepDay as nextDay, stepTimeGrid } from './DateTimeField.pure';
import strings from './DateTimeField.strings.en.json';
import s from './DateTimeField.module.css';

export interface DateTimeFieldProps {
  label: string;
  /** Epoch ms; null while empty or invalid. */
  value: number | null;
  onChange: (ms: number | null) => void;
  description?: ReactNode;
  /** A refusal about the whole value (out of range, in the future); the parts check their own format. */
  errorMessage?: string;
  /** Minutes per ↑/↓ press on the time (default 15). */
  step?: number;
  /** Earliest and latest moment (epoch ms): the calendar disables the days outside them. The typed parts are never refused for it; use `errorMessage`. */
  minValue?: number | null;
  maxValue?: number | null;
  isDisabled?: boolean;
  isRequired?: boolean;
  className?: string;
}

// The pure rules live in DateTimeField.pure.ts (shared with the terminal); their names stay importable from here.
export { normalizeDate, dayOf, partsOf } from './DateTimeField.pure';

export function DateTimeField({ label, value, onChange, description, errorMessage, step = 15, minValue, maxValue, isDisabled, isRequired, className }: DateTimeFieldProps) {
  const t = useStrings(strings);
  const id = useId();
  // The calendar follows the same lock as the typed parts (their TextFields read it themselves).
  const locked = useFieldLock(isDisabled);
  const partsRef = useRef<HTMLDivElement>(null);
  const [[dateText, timeText], setParts] = useState(() => partsOf(value));
  // The part being typed in: it says it is wrong only once left, and nothing from outside overwrites it.
  const [editing, setEditing] = useState<'date' | 'time' | null>(null);
  // A value set from outside (a click on a log line) replaces what is typed; our own changes match it. Not
  // while a part is being typed: a parent that keeps its last valid value (ignores null) would undo each key.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (editing === null && value !== compose(dateText, timeText)) setParts(partsOf(value));
  }
  const set = (d: string, tm: string) => {
    setParts([d, tm]);
    const ms = compose(d, tm);
    setSeen(ms);
    onChange(ms);
  };
  const stepDay = (dir: 1 | -1) => set(nextDay(dateText, dir), timeText);
  const stepTime = (dir: 1 | -1) => set(dateText, stepTimeGrid(timeText, step, dir));
  const dateBad = editing !== 'date' && dateText !== '' && !dayOf(dateText);
  const timeBad = editing !== 'time' && timeText !== '' && !TIME.test(timeText);
  // A refusal of the whole value belongs to both parts: each is invalid and reads it (aria-describedby).
  const errId = `${id}-e`;
  const whole = errorMessage ? { 'aria-describedby': errId, isInvalid: true } : {};
  // Only the page's error stops blocking the submit; a part's own format hint keeps the native refusal.
  const pageValidation = errorMessage ? 'aria' : 'native';
  const arrows = (go: (dir: 1 | -1) => void) => (e: { key: string; preventDefault: () => void; continuePropagation: () => void }) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      go(e.key === 'ArrowUp' ? 1 : -1);
    } else e.continuePropagation();
  };
  return (
    <div role="group" aria-labelledby={`${id}-l`} aria-describedby={description ? `${id}-d` : undefined} className={cx(s.group, className)}>
      <span id={`${id}-l`} className={f.label}>
        {label}
      </span>
      <div className={s.parts} ref={partsRef}>
        <TextField
          aria-label={t('dt.date')}
          value={dateText}
          onChange={(v) => set(v.replace(/[^\d-]/g, '').slice(0, 10), timeText)}
          {...whole}
          onFocus={() => setEditing('date')}
          onBlur={() => {
            setEditing(null);
            const n = normalizeDate(dateText);
            if (n !== dateText) set(n, timeText);
          }}
          onKeyDown={arrows(stepDay)}
          inputMode="numeric"
          placeholder={t('dt.datePlaceholder')}
          mono
          errorMessage={dateBad ? t('dt.dateInvalid') : undefined}
          validationBehavior={pageValidation}
          suffix={
            <DatePickButton
              value={dateText}
              minValue={minValue == null ? undefined : partsOf(minValue)[0]}
              maxValue={maxValue == null ? undefined : partsOf(maxValue)[0]}
              isDisabled={locked}
              onChange={(day) => {
                set(day, timeText);
                // After the popover has handed focus back to its button: on to the time.
                setTimeout(() => partsRef.current?.querySelectorAll('input')[1]?.focus(), 0);
              }}
            />
          }
          isDisabled={isDisabled}
          isRequired={isRequired}
          className={s.date}
        />
        <TextField
          aria-label={t('dt.time')}
          value={timeText}
          onChange={(v) => set(dateText, v.replace(/[^\d:]/g, '').slice(0, 5))}
          {...whole}
          onFocus={() => setEditing('time')}
          onBlur={() => {
            setEditing(null);
            const n = normalizeTime(timeText);
            if (n !== timeText) set(dateText, n);
          }}
          onKeyDown={arrows(stepTime)}
          inputMode="numeric"
          placeholder={t('dt.timePlaceholder')}
          mono
          errorMessage={timeBad ? t('dt.timeInvalid') : undefined}
          validationBehavior={pageValidation}
          isDisabled={isDisabled}
          isRequired={isRequired}
          className={s.time}
        />
      </div>
      {description && (
        <span id={`${id}-d`} className={f.description}>
          {description}
        </span>
      )}
      {errorMessage && (
        <span id={errId} className={f.error} role="alert">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
