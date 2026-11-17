// The words around a field's control: its label above, its description and its error below.
// Every kit field built on a React Aria field (TextField, NumberField, Select, Combobox, RadioGroup, CheckboxGroup)
// draws them with these two parts, so a label, a help line and an error look and are announced the same in every
// field. Both must sit inside the React Aria field: it wires the label to the control and the two lines to its
// description. Kit-internal: pages use the fields, never these parts.
import type { ReactNode } from 'react';
import { FieldError, Label, Text } from 'react-aria-components';
import { cx } from '../controls/Button';
import f from './fields.module.css';

/** The field's visible label, above the control. Renders nothing without one (the field is then named by aria-label). */
export function FieldLabel({ children }: { children?: string }) {
  return children ? <Label className={f.label}>{children}</Label> : null;
}

export interface FieldNotesProps {
  /** Muted help under the control. */
  description?: ReactNode;
  /** A server-side refusal; the field's own validation errors show on the same line by themselves. */
  errorMessage?: string;
  /** Keep the error line's height even without an error, so a form does not jump when one appears. */
  reserveError?: boolean;
  /** With `reserveError`: whether the field is invalid now (the error line is then the real one). */
  invalid?: boolean;
}

/** The lines under the control: the description, then the error. */
export function FieldNotes({ description, errorMessage, reserveError, invalid }: FieldNotesProps) {
  return (
    <>
      {description && (
        <Text slot="description" className={f.description}>
          {description}
        </Text>
      )}
      <FieldError className={cx(f.error, reserveError && f.errorLine)}>{errorMessage}</FieldError>
      {reserveError && !invalid && <span className={f.errorLine} aria-hidden="true" />}
    </>
  );
}
