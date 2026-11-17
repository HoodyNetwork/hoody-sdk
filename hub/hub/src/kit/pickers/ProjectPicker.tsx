// ProjectPicker: the kit's control for picking a project, built from ComputerPicker's
// pieces: PickerTrigger shows the picked project's colour square and name, PickerPopover opens PickerPanel in single
// mode (search, keyboard, a sheet on a phone). Same contract as ComputerPicker:
//   - `projects` undefined means still loading; the caller's rows are the truth. `value` in, `onChange` out; the picker
//     keeps no pick of its own.
//   - Picking the row already picked, or closing, changes nothing. A row with `disabledReason` is shown, says why, and
//     never reaches onChange.
//   - A value not among the rows (not listed yet, or gone) shows `placeholder` on the trigger, never a stale name.
//   - Loading (no rows, no error) disables the trigger; a failed read never does: the panel shows it with Try again.
//   - `renderCreate` adds the panel's last stop ("New project"), as PickerPanel's own.
import type { ReactNode } from 'react';
import { useFieldLock } from '../forms/lock';
import { useStrings } from '../strings';
import { ColourSquare, PickerPopover, PickerTrigger } from './ComputerPicker';
import { PickerPanel, type PickerItem } from './PickerPanel';
import strings from './ProjectPicker.strings.en.json';

export interface ProjectChoice {
  /** The value that goes in and out (a project id). */
  id: string;
  name: string;
  /** A CSS colour for the project's square (the caller resolves the API's colour), none for no square. */
  color?: string;
  /** A short facts line ("3 computers · default"), already in the page's language. */
  facts?: string;
  /** Shown, but not pickable, and says why. */
  disabledReason?: string;
}

export interface ProjectPickerProps {
  /** What the picker is for ("Project"): the list's name, and the trigger's after the words it shows. */
  label: string;
  projects: readonly ProjectChoice[] | undefined;
  value: string | undefined;
  onChange: (id: string) => void;
  placeholder?: string;
  status?: { error?: unknown; onRetry?: () => void };
  /** The panel's last stop, not searched ("New project"). */
  renderCreate?: () => ReactNode;
  isDisabled?: boolean;
  className?: string;
}

export function ProjectPicker({ label, projects, value, onChange, placeholder, status, renderCreate, isDisabled: disabledProp, className }: ProjectPickerProps) {
  const t = useStrings(strings);
  const isDisabled = useFieldLock(disabledProp);
  const failed = !!status?.error;
  const picked = projects?.find((p) => p.id === value);
  const items: PickerItem[] | undefined = projects?.map((p) => ({
    id: p.id,
    label: p.name,
    facts: p.facts,
    lead: <ColourSquare color={p.color} />,
    isDisabled: !!p.disabledReason,
    disabledReason: p.disabledReason,
  }));
  const trigger = (
    <PickerTrigger
      label={label}
      className={className}
      isDisabled={isDisabled || (!projects && !failed)}
      lead={picked?.color ? <ColourSquare color={picked.color} /> : undefined}
      text={picked ? picked.name : !projects ? t(failed ? 'failed' : 'loading') : placeholder ?? t('placeholder')}
      placeholder={!picked}
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
          renderCreate={renderCreate}
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
