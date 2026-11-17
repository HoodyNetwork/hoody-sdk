// PickerField: a picker as a form field. Draws the kit field's label, description and error
// (fields.module.css) around one picker (ComputerPicker, ProjectPicker, ProgramPicker) and hands their ids to the
// picker's PickerTrigger through context: the trigger is then named by the visible label and described by the
// description and the error, as the kit's text fields are. Without a PickerField the trigger keeps its own aria-label.
import { createContext, useContext, useId, type ReactNode } from 'react';
import { cx } from '../controls/Button';
import s from '../forms/fields.module.css';
import { SR_ONLY } from '../controls/SrOnly';

export const PickerFieldContext = createContext<{ labelId?: string; describedBy?: string; invalid: boolean } | null>(null);

/** The ids a PickerTrigger inside a PickerField uses (null outside one). */
export const usePickerField = () => useContext(PickerFieldContext);

export interface PickerFieldProps {
  /** The field's visible label (and the trigger's name). */
  label: string;
  /** Hide the label visually; it still names the trigger. */
  showLabel?: boolean;
  description?: ReactNode;
  /** Shown under the field, read with the trigger, and marks it invalid. */
  errorMessage?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function PickerField({ label, showLabel = true, description, errorMessage, className, children }: PickerFieldProps) {
  const labelId = useId();
  const descId = useId();
  const errId = useId();
  const describedBy = [description ? descId : '', errorMessage ? errId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx(s.field, className)}>
      <span id={labelId} className={showLabel ? s.label : SR_ONLY}>
        {label}
      </span>
      <PickerFieldContext.Provider value={{ labelId, describedBy, invalid: Boolean(errorMessage) }}>{children}</PickerFieldContext.Provider>
      {description ? (
        <span id={descId} className={s.description}>
          {description}
        </span>
      ) : null}
      {errorMessage ? (
        <span id={errId} className={s.error} role="alert">
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
