// ScheduleField in the terminal: the same fields as the web (the kind select with the next runs under it, then the
// kind's own fields), from the same rules and state (ScheduleField.pure.ts), in a group named like the web's.
import type * as Web from './ScheduleField';
import { EVERY } from '../cron';
import { Row, Stack } from '../layouts/Stack';
import { Box } from '../../term/prim';
import { Checkbox, TextField } from './fields';
import { NumberField, Select, TimeField } from './more';
import { DAYS, useScheduleField } from './ScheduleField.pure';

export type { ScheduleFieldProps } from './ScheduleField.pure';

export const ScheduleField: typeof Web.ScheduleField = ({ label, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy, value, onChange, isDisabled, errorMessage, now, kindRef, onValid }) => {
  const { t, kind, fields, timeText, timeBad, needsTime, options, preview, set, pick, onTime } = useScheduleField({ value, onChange, now, onValid });

  return (
    <Box dir="column" shrink={0} sem={{ role: 'group', name: labelledBy ? undefined : label, labelledBy, describedBy }}>
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
    </Box>
  );
};
