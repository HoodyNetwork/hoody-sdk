// ProgramPicker: the kit's control for picking a program, built from ComputerPicker's
// pieces: PickerTrigger shows the picked program's state dot and name, PickerPopover opens PickerPanel in single mode
// (search, keyboard, a sheet on a phone), rows grouped as the caller says ("Yours", "System"). Same contract as
// ComputerPicker:
//   - `programs` undefined means still loading; the caller's rows are the truth. `value` in, `onChange` out.
//   - Picking the row already picked, or closing, changes nothing. A row with `disabledReason` never reaches onChange.
//   - The state is a word as well as a dot (the dot is never the only sign); `running` alone colours the dot.
//   - A value not among the rows shows `placeholder` on the trigger, never a stale name.
//   - Loading (no rows, no error) disables the trigger; a failed read never does: the panel shows it with Try again.
import { cx } from '../controls/Button';
import { useFieldLock } from '../forms/lock';
import { useStrings } from '../strings';
import { PickerPopover, PickerTrigger } from './ComputerPicker';
import { PickerPanel, type PickerItem } from './PickerPanel';
import strings from './ProgramPicker.strings.en.json';
import s from './ComputerPicker.module.css';

export interface ProgramChoice {
  /** The value that goes in and out (a program id). */
  id: string;
  name: string;
  /** A heading the row sits under ("Yours", "System"), in order of first appearance. */
  group?: string;
  /** A line under the name ("Ports 8000–8010"). */
  description?: string;
  /** Colours the state dot; with no `state` and no `running`, no dot is drawn. */
  running?: boolean;
  /** The state as words, already in the page's language ("Running", "Stopped"). */
  state?: string;
  /** Shown, but not pickable, and says why. */
  disabledReason?: string;
}

export interface ProgramPickerProps {
  /** What the picker is for ("Program"): the list's name, and the trigger's after the words it shows. */
  label: string;
  programs: readonly ProgramChoice[] | undefined;
  value: string | undefined;
  onChange: (id: string) => void;
  placeholder?: string;
  status?: { error?: unknown; onRetry?: () => void };
  isDisabled?: boolean;
  className?: string;
}

function Dot({ p }: { p: ProgramChoice }) {
  if (p.running === undefined && !p.state) return null;
  return (
    <span className={s.lead} aria-hidden="true">
      <span className={cx(s.dot, p.running && s.dotOn)} />
    </span>
  );
}

export function ProgramPicker({ label, programs, value, onChange, placeholder, status, isDisabled: disabledProp, className }: ProgramPickerProps) {
  const t = useStrings(strings);
  const isDisabled = useFieldLock(disabledProp);
  const failed = !!status?.error;
  const picked = programs?.find((p) => p.id === value);
  const items: PickerItem[] | undefined = programs?.map((p) => ({
    id: p.id,
    label: p.name,
    description: p.description,
    facts: p.state,
    group: p.group,
    lead: <Dot p={p} />,
    isDisabled: !!p.disabledReason,
    disabledReason: p.disabledReason,
  }));
  const trigger = (
    <PickerTrigger
      label={label}
      className={className}
      isDisabled={isDisabled || (!programs && !failed)}
      lead={picked ? <Dot p={picked} /> : undefined}
      text={picked ? picked.name : !programs ? t(failed ? 'failed' : 'loading') : placeholder ?? t('placeholder')}
      placeholder={!picked}
      spoken={picked?.state}
    />
  );
  return (
    <PickerPopover trigger={trigger} label={label}>
      {(close) => (
        <PickerPanel
          label={label}
          items={items}
          mode="single"
          isDisabled={isDisabled}
          value={picked ? [picked.id] : []}
          searchable
          searchLabel={t('search')}
          emptyText={t('empty')}
          status={status?.error ? { error: status.error, onRetry: status.onRetry, title: t('failed') } : undefined}
          onChange={(ids) => {
            const id = ids[0];
            if (isDisabled) return;
            if (id !== undefined && id !== picked?.id) onChange(id);
            close();
          }}
        />
      )}
    </PickerPopover>
  );
}
