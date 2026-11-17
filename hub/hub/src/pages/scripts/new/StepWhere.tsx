// Step 2 of New script, "Where it answers": the computer (Change opens the kit
// picker), the address with its live taken/general check, when it runs (UTC, with the local time beside it) and the
// public link. The assistant's sign-in box sits here for the AI way. Pure presentation: the flow owns the draft and the
// address check.
import { AnatomySection, Band, ComputerPicker, InlineActions, RadioGroup, Select, StatusPill, Switch, SubSection, TextField, useStrings, type ComputerChoice } from '@kit';
import type { ReactNode } from 'react';
import { cronOk, localOf } from './StepWhere.pure';
export { cronOk, localOf } from './StepWhere.pure';
import { PRESETS, addressOk, addressProblem, presetOf, type Preset } from '../logic';
import strings from '../strings.en.json';
import { ScriptAddress } from '../parts/ScriptAddress';
import s from '../parts/parts.module.css';
import f from './Flow.module.css';

/** The live check of the address on the bound computer: what answers it now. */
export type AddressCheck =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'free' }
  | { state: 'general' }
  | { state: 'taken'; by: string | null; free: string }
  /** The check could not be read: nothing is said either way. */
  | { state: 'unknown' };

export interface StepWhereProps {
  /** Every computer of the account as picker rows; one that can't take a script carries its reason. */
  computers: readonly ComputerChoice[];
  compId: string;
  computerName: string;
  onComputer: (id: string) => void;
  origin: string;
  route: string;
  onRoute: (v: string) => void;
  check: AddressCheck;
  onUseFree: (route: string) => void;
  /** null: only when its address is called; else the cron expression (UTC). */
  schedule: string | null;
  onSchedule: (v: string | null) => void;
  /** When the idea runs, said as a fact (the idea way): only when called, or on the schedule its own code carries. */
  ideaSchedule?: 'called' | 'own';
  link: boolean;
  onLink: (v: boolean) => void;
  /** The link name field, when the link is on. */
  linkField?: ReactNode;
  /** The assistant's sign-in box (AI way). */
  signIn?: ReactNode;
  /** The draft came back from the assistant's build: the link choice was reset. */
  restored?: boolean;
  /** Continue / Build it was pressed while this step is not done: an empty address or an empty custom schedule says so
   *  at its field (a bad non-empty value already does). */
  missing?: boolean;
  /** The bound computer cannot take a script now (off, unreadable): the step cannot be left. With several computers the
   *  picker's row says so; with one, the computer line does. */
  cantTake?: boolean;
  onSubmit: () => void;
}

/** The check's word and tone, drawn inside the address field. Nothing while idle or unanswered (nothing is said either way). */
const TAG: Partial<Record<AddressCheck['state'], { word: 'checking' | 'free' | 'taken' | 'general'; tone: 'neutral' | 'ok' | 'danger' | 'warn' }>> = {
  checking: { word: 'checking', tone: 'neutral' },
  free: { word: 'free', tone: 'ok' },
  taken: { word: 'taken', tone: 'danger' },
  general: { word: 'general', tone: 'warn' },
};

export function StepWhere(p: StepWhereProps) {
  const t = useStrings(strings);
  const valid = addressOk(p.route);
  const tag = valid ? TAG[p.check.state] : undefined;
  // An empty schedule that is not null is Custom just picked, its box still empty (presetOf reads '' as off): it
  // keeps Custom chosen with its box to type in.
  const preset = p.schedule === null ? 'off' : p.schedule.trim() === '' ? 'custom' : presetOf(p.schedule);
  const local = p.schedule !== null ? localOf(p.schedule) : null;
  const cronBad = p.schedule !== null && preset === 'custom' && !cronOk(p.schedule);
  const addressError = p.route && !valid
    ? t(addressProblem(p.route) === 'reserved' ? 'new.addressReserved' : 'new.addressBad')
    : p.missing && !p.route
      ? t('flow.where.addressMissing')
    : p.check.state === 'taken'
      ? p.check.by ? t('flow.where.takenBy', { route: p.route, name: p.check.by }) : t('flow.where.taken', { route: p.route })
      : undefined;
  // The field's help: what an address is until one is valid, beside any error (the link preview below says it once one
  // is); for a valid address, the general-address warning unless an error shows.
  const addressHelp = !valid ? t('address.what') : addressError || p.check.state !== 'general' ? undefined : t('flow.where.general', { route: p.route });
  const pick = (v: Preset) => {
    if (v === 'off') p.onSchedule(null);
    else if (v === 'custom') p.onSchedule(p.schedule !== null && presetOf(p.schedule) === 'custom' ? p.schedule : '');
    else p.onSchedule(PRESETS[v]);
  };
  return (
    <AnatomySection
      id="new-where"
      title={t('flow.where.title')}
      description={t('flow.where.lead')}
      notices={p.restored ? <Band size="table">{t('flow.where.restored')}</Band> : undefined}
    >
      {p.computers.length > 1 ? (
        <ComputerPicker label={t('new.computer')} computers={p.computers} value={p.compId} onChange={p.onComputer} />
      ) : (
        <p className={f.fact}>{t(p.cantTake ? 'flow.where.onCantTake' : 'flow.where.on', { name: p.computerName })}</p>
      )}
      <div>
        <TextField
          label={t('new.address')}
          value={p.route}
          onChange={p.onRoute}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); p.onSubmit(); } }}
          mono
          errorMessage={addressError}
          description={addressHelp}
          suffix={tag ? <StatusPill tone={tag.tone}>{t(`flow.where.tag.${tag.word}`)}</StatusPill> : undefined}
        />
        {p.check.state === 'taken' ? (
          <InlineActions actions={[{ id: 'use-free', label: t('flow.where.useFree', { route: p.check.free }), literal: true, onPress: () => p.onUseFree((p.check as { free: string }).free) }]} />
        ) : null}
        {/* The step's lead already says what the address is for. */}
        {valid ? <ScriptAddress origin={p.origin} path={p.route} label={t('new.address')} explain={false} /> : null}
      </div>
      <div className={f.group}>
        {p.ideaSchedule !== undefined ? (
          <SubSection title={t('flow.where.when')} description={p.ideaSchedule === 'own' ? t('flow.where.ideaOwn') : t('flow.where.onlyCalled')} />
        ) : (
          <>
            <RadioGroup
              label={t('flow.where.when')}
              value={p.schedule === null ? 'call' : 'schedule'}
              onChange={(v) => pick(v === 'call' ? 'off' : preset === 'off' ? 'weekly' : preset)}
              variant="cards"
              options={[
                { value: 'call', label: t('flow.where.onlyCalled'), description: t('flow.where.onlyCalledHint') },
                { value: 'schedule', label: t('flow.where.alsoSchedule'), description: t('flow.where.alsoScheduleHint') },
              ]}
            />
            {p.schedule !== null ? (
              <>
                <Select
                  label={t('flow.where.schedule')}
                  value={preset === 'off' ? 'weekly' : preset}
                  onChange={(k) => pick(k)}
                  options={(['hourly', 'daily', 'weekly', 'custom'] as const).map((k) => ({ value: k, label: t(`sched.${k}`) }))}
                  description={local ? t('flow.where.utcLocal', { local }) : t('flow.where.utc')}
                />
                {preset === 'custom' ? (
                  <TextField label={t('flow.where.cron')} value={p.schedule} onChange={(v) => p.onSchedule(v)} mono errorMessage={cronBad && p.schedule.trim() ? t('flow.where.cronBad') : cronBad && p.missing ? t('flow.where.cronMissing') : undefined} description={t('flow.where.cronHelp')} />
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>
      <div className={s.linkOption}>
        <Switch label={t('link.also')} description={t('link.alsoBody')} isSelected={p.link} onChange={p.onLink} />
        {p.link ? p.linkField : null}
      </div>
      {p.signIn}
    </AnatomySection>
  );
}
