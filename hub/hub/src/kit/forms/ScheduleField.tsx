// ScheduleField: a schedule picked on the one cron preset model (kit/cron.ts): never, every N minutes, hourly, daily,
// weekdays, chosen days, monthly, or a custom expression; one labelled field (role group) in a SettingRow's field slot.
// The value is the 5-part expression (UTC, as the exec kit runs it) or null for never. A saved expression is never
// rewritten: one that is not exactly a preset reads as custom. The kind select's description is the next runs as the Hub
// calculates them, in UTC: a calculation, never what the computer has registered. The kind's own fields sit under it and
// stack full width; the weekday checkboxes wrap, and at least one stays ticked.
import { EVERY } from '../cron';
import { Row, Stack } from '../layouts/Stack';
import { Checkbox, TextField } from './fields';
import { NumberField } from './NumberField';
import { Select } from './Select';
import { TimeField } from './TimeField';
import { DAYS, type ScheduleFieldProps, useScheduleField } from './ScheduleField.pure';

// The rules and the state live in ScheduleField.pure.ts (shared with the terminal).
export type { ScheduleFieldProps } from './ScheduleField.pure';

export function ScheduleField({ label, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy, value, onChange, isDisabled, errorMessage, now, kindRef, onValid }: ScheduleFieldProps) {
  const { t, kind, fields, timeText, timeBad, needsTime, options, preview, set, pick, onTime } = useScheduleField({ value, onChange, now, onValid });

  return (
    <div role="group" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label} aria-describedby={describedBy} data-schedule-field="">
      <Stack gap={2}>
        <Select aria-label={label} triggerRef={kindRef} value={kind} options={options} isDisabled={isDisabled} onChange={(k) => pick(k)} description={preview ?? undefined} errorMessage={kind !== 'custom' ? errorMessage : undefined} />
        {kind === 'every' ? (
          <Select label={t('everyN')} value={String(fields.every)} options={EVERY.map((n) => ({ value: String(n), label: t('minutes', { n }) }))} isDisabled={isDisabled} onChange={(v) => set('every', { every: Number(v) })} />
        ) : null}
        {kind === 'hourly' ? <NumberField label={t('minute')} minValue={0} maxValue={59} value={fields.minute} isDisabled={isDisabled} onChange={(v) => set('hourly', { minute: Number.isFinite(v) ? v : 0 })} /> : null}
        {needsTime ? <TimeField label={t('time')} value={timeText} onChange={onTime} isDisabled={isDisabled} errorMessage={timeBad ? t('timeErr') : undefined} /> : null}
        {kind === 'monthly' ? <NumberField label={t('dom')} minValue={1} maxValue={31} value={fields.dom} isDisabled={isDisabled} onChange={(v) => set('monthly', { dom: Number.isFinite(v) ? v : 1 })} /> : null}
        {kind === 'weekly' ? (
          <Row gap={3} wrap>
            {DAYS.map((d) => (
              <Checkbox
                key={d}
                label={t(`day.${d}`)}
                isSelected={fields.days.includes(d)}
                isDisabled={isDisabled || (fields.days.length === 1 && fields.days[0] === d)}
                onChange={(on) => set('weekly', { days: on ? [...fields.days, d].sort((a, b) => a - b) : fields.days.filter((x) => x !== d) })}
              />
            ))}
          </Row>
        ) : null}
        {kind === 'custom' ? <TextField label={t('expr')} description={t('exprHelp')} value={value ?? ''} onChange={(v) => onChange(v)} mono isDisabled={isDisabled} errorMessage={errorMessage} /> : null}
      </Stack>
    </div>
  );
}
