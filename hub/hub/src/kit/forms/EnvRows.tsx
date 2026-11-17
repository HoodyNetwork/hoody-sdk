// Environment variables as name/value rows: one row per variable, the value masked (SecretInput), with Add and a
// Remove per row. Shared by every form that sets a program's or computer's environment; the caller owns the rows and
// their words, so each form keeps its own text. A sending form's lock
// (useFieldLock) also holds Add and Remove, which change the rows. Values stay in the inputs: the component never
// writes one into its label, description or error line.
import { useLayoutEffect, useRef } from 'react';
import { Button, IconButton, cx } from '../controls/Button';
import { SecretInput } from './Secret';
import { TextField } from './fields';
import { useFieldLock } from './lock';
import f from './fields.module.css';
import s from './EnvRows.module.css';

export interface EnvRow {
  /** Stable across edits (React key); never shown. */
  id: number;
  key: string;
  value: string;
}

interface EnvRowsBaseProps {
  rows: readonly EnvRow[];
  onEdit: (id: number, change: Partial<Pick<EnvRow, 'key' | 'value'>>) => void;
  onRemove: (id: number) => void;
  onAdd: () => void;
  /**
   * Where the description stands. As a field (the default) it is the field's help: under the control, which here is
   * the rows and Add, as under every kit field. `titled`, it is the group's line, right under the title. Pass
   * `helpBelow` to put a titled group's description under its control too.
   */
  helpBelow?: boolean;
  /** Row words; n counts from 1. */
  labels: { key: (n: number) => string; value: (n: number) => string; remove: (n: number) => string; keyHint: string; valueHint: string; add: string };
  /** Holds every field and button (a send in flight outside a form lock). */
  isDisabled?: boolean;
  /** The legend is a group title (a SettingGroup `title`'s look), for rows that sit among setting groups in one frame. */
  titled?: boolean;
}

/** The group's words, named as every kit field names them. */
interface EnvRowsWords {
  /** The group's name (its legend). */
  label: string;
  description: string;
  /** One line under the rows (the caller's check; never a value). */
  errorMessage?: string | undefined;
  legend?: never;
  help?: never;
  error?: never;
}

/** @deprecated The same three words under their earlier names; pass `label`, `description` and `errorMessage`. */
interface EnvRowsLegacyWords {
  legend: string;
  help: string;
  error?: string | undefined;
  label?: never;
  description?: never;
  errorMessage?: never;
}

export type EnvRowsProps = EnvRowsBaseProps & (EnvRowsWords | EnvRowsLegacyWords);

export function EnvRows({ rows, onEdit, onRemove, onAdd, helpBelow, labels, isDisabled, titled, ...words }: EnvRowsProps) {
  const legend = words.label ?? words.legend;
  const help = words.description ?? words.help;
  const error = words.errorMessage ?? words.error;
  const locked = useFieldLock(isDisabled);
  const held = isDisabled ? { isDisabled: true } : {};
  // A field's help stands under its control; a titled group's line stands under its title.
  const below = helpBelow ?? !titled;
  // Remove takes its row, and the focus with it: once the rows change, focus that fell to the page body goes to the
  // row now in that place, else the row before, else Add. Focus the person moved elsewhere is left alone.
  const boxRef = useRef<HTMLFieldSetElement>(null);
  const removedAt = useRef<{ at: number; id: number } | null>(null);
  const shown = useRef(rows);
  shown.current = rows;
  useLayoutEffect(() => {
    const at = removedAt.current?.at ?? null;
    removedAt.current = null;
    const box = boxRef.current;
    if (at === null || !box) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    // Found by the kit's own classes, so the drawn markup stays as it was (pages pin it byte for byte).
    const left = box.querySelectorAll(`.${s.envRow}`);
    const row = left[Math.min(at, left.length - 1)];
    // Add's own box is the one plain div that is not a row (the help and the error under it are paragraphs).
    const add = [...box.children].find((k) => k.tagName === 'DIV' && !k.classList.contains(s.envRow as string));
    (row ?? add)?.querySelector<HTMLElement>(row ? 'input' : 'button')?.focus();
  }, [rows]);
  const remove = (id: number, i: number) => {
    if (locked) return;
    const mark = { at: i, id };
    removedAt.current = mark;
    onRemove(id);
    // A removal the page refused (the row is still there once the press settled) leaves no mark behind, so a later
    // change of the rows never moves the focus.
    requestAnimationFrame(() => {
      if (removedAt.current === mark && shown.current.some((r) => r.id === id)) removedAt.current = null;
    });
  };
  return (
    <fieldset ref={boxRef} className={cx(s.envEditor, titled && s.titled)}>
      {/* A field label, as a TextField's or a Fieldset's (fields.module.css), unless titled. */}
      <legend className={cx(f.label, f.legend, !titled && s.fieldLegend)}>{legend}</legend>
      {!below && <p className={s.help}>{help}</p>}
      {!below && (error ? <p className={s.envError} role="alert">{error}</p> : null) /* reason: one-line group error */}
      {rows.map((r, i) => (
        <div key={r.id} className={s.envRow}>
          <TextField aria-label={labels.key(i + 1)} value={r.key} onChange={(v) => onEdit(r.id, { key: v })} placeholder={labels.keyHint} mono spellCheck="false" autoComplete="off" {...held} />
          <SecretInput aria-label={labels.value(i + 1)} value={r.value} onChange={(v) => onEdit(r.id, { value: v })} placeholder={labels.valueHint} {...held} />
          <IconButton icon="trash" size="sm" variant="ghost" label={labels.remove(i + 1)} isDisabled={locked} onPress={() => remove(r.id, i)} />
        </div>
      ))}
      <div>
        <Button size="sm" icon="plus" isDisabled={locked} onPress={() => !locked && onAdd()}>
          {labels.add}
        </Button>
      </div>
      {/* Under the control, as a field's notes are (FieldShell): the help, then the error. */}
      {below && <p className={s.help}>{help}</p>}
      {below && (error ? <p className={s.envError} role="alert">{error}</p> : null) /* reason: one-line field error */}
    </fieldset>
  );
}
