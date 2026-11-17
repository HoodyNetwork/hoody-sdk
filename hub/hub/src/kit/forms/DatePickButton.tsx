// DatePickButton: the calendar button that sits beside a typed date (DateField, and DateTimeField's date part). It opens a
// kit Popover holding a React Aria Calendar: arrows move a day or a week, PageUp/PageDown a month, Enter
// picks, Escape closes and returns focus to the button. Today is marked and the locale decides the first day
// of the week. Days outside min..max cannot be picked; the typed text is never refused here, that is the
// field's own check. A date is always a YYYY-MM-DD string, the same text the typed part shows.
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Calendar, CalendarCell, CalendarGrid, CalendarGridBody, CalendarGridHeader, CalendarHeaderCell, Heading } from 'react-aria-components';
import { type CalendarDate, getLocalTimeZone, isToday, parseDate } from '@internationalized/date';
import { IconButton, cx } from '../controls/Button';
import { Popover } from '../overlays/Popover';
import { useStrings } from '../strings';
import strings from './DatePickButton.strings.en.json';
import s from './DatePickButton.module.css';

export interface DatePickButtonProps {
  /** The date shown as chosen: YYYY-MM-DD, or '' / anything else for none. */
  value: string;
  /** A day was picked (YYYY-MM-DD). */
  onChange: (date: string) => void;
  /** Earliest and latest pickable day (YYYY-MM-DD); others are shown but disabled. */
  minValue?: string;
  maxValue?: string;
  /** Disabled or locked: the button does nothing and an open calendar closes. */
  isDisabled?: boolean;
}

/** The calendar day of a YYYY-MM-DD text, or null when it is not one (parseDate throws on those). */
function dayOf(text: string | undefined): CalendarDate | null {
  if (!text) return null;
  try {
    return parseDate(text);
  } catch {
    return null;
  }
}

/** The popover's calendar. It puts focus on its current day when it opens: the dialog around it would otherwise keep focus itself and the arrow keys would do nothing. */
function CalendarPanel({ value, min, max, isDisabled, onPick }: { value: string; min?: string; max?: string; isDisabled: boolean; onPick: (date: string) => void }) {
  const t = useStrings(strings);
  const ref = useRef<HTMLDivElement>(null);
  const zone = getLocalTimeZone();
  useEffect(() => {
    const id = setTimeout(() => ref.current?.querySelector<HTMLElement>('td [tabindex="0"]')?.focus(), 0);
    return () => clearTimeout(id);
  }, []);
  return (
    <Calendar ref={ref} aria-label={t('datepick.calendar')} isDisabled={isDisabled} value={dayOf(value)} minValue={dayOf(min)} maxValue={dayOf(max)} onChange={(d) => onPick(d.toString())} className={s.calendar}>
      <div className={s.head}>
        {/* The kit's ghost IconButton sm, with the kit's hover (not the popover row's): RAC's Calendar pages through
            the `slot`. The names stay RAC's words, Previous and Next. */}
        <IconButton slot="previous" icon="chevron-left" size="sm" label={t('datepick.previous')} />
        <Heading className={s.title} />
        <IconButton slot="next" icon="chevron-right" size="sm" label={t('datepick.next')} />
      </div>
      <CalendarGrid className={s.grid}>
        <CalendarGridHeader>{(day) => <CalendarHeaderCell className={s.weekday}>{day}</CalendarHeaderCell>}</CalendarGridHeader>
        <CalendarGridBody>{(date) => <CalendarCell date={date} className={({ date: d }) => cx(s.cell, isToday(d, zone) && s.today)} />}</CalendarGridBody>
      </CalendarGrid>
    </Calendar>
  );
}

export function DatePickButton({ value, onChange, minValue, maxValue, isDisabled = false }: DatePickButtonProps): ReactNode {
  const t = useStrings(strings);
  const [open, setOpen] = useState(false);
  // A field locked or disabled while its calendar is open closes it; the Calendar is disabled too, for the moment the popover takes to leave (the cells stay on screen but pick nothing).
  useEffect(() => {
    if (isDisabled) setOpen(false);
  }, [isDisabled]);
  return (
    <Popover
      trigger={<IconButton icon="calendar" size="sm" variant="ghost" label={t('datepick.open')} isDisabled={isDisabled} />}
      label={t('datepick.calendar')}
      width="lg"
      isOpen={open}
      onOpenChange={setOpen}
    >
      {(close) => (
        <CalendarPanel
          value={value}
          min={minValue}
          max={maxValue}
          isDisabled={isDisabled}
          onPick={(day) => {
            onChange(day);
            close();
          }}
        />
      )}
    </Popover>
  );
}
