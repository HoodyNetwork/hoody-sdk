// ColorPicker: the one kit colour field, for computers, realms and copies.
// One line: the preset swatches (a radio group: Tab reaches it, the arrow keys move the pick), then one hex
// control for an exact colour whose start is the browser's own picker square for any other; the control goes under
// the swatches only when the width runs out. The vocabulary is the API's: #RGB, RGB, #RRGGBB
// or RRGGBB. A valid colour is sent as '#RRGGBB' in capitals (#RGB expanded: the picker's one spelling; the
// API keeps what it is sent, uppercased). '' is no colour.
import { useId, useState } from 'react';
import { Radio, RadioGroup } from 'react-aria-components';
import { cx } from '../controls/Button';
import { useStrings } from '../strings';
import { type FieldChrome, TextField } from './fields';
import f from './fields.module.css';
import { useFieldLock } from './lock';
import { PRESET_COLORS } from './ColorPicker.pure';
import { normalizeHexColor } from './hexColor';
import { SR_ONLY } from '../controls/SrOnly';
import strings from './ColorPicker.strings.en.json';
import s from './ColorPicker.module.css';

export { PRESET_COLORS, randomPresetColor } from './ColorPicker.pure';
export { normalizeHexColor } from './hexColor';

export interface ColorPickerProps extends FieldChrome {
  label: string;
  /** The label names the swatches but is not drawn: the field sits in a row whose label column already names it. */
  labelHidden?: boolean;
  /** '#RRGGBB', '' for no colour; anything else shows in the hex field as typed. */
  value: string;
  /** A three- or six-digit hex comes normalised to '#RRGGBB'; any other text comes exactly as typed: text `accepts`
   *  takes is a colour to the caller, anything else the form's own check refuses. */
  onChange: (value: string) => void;
  /** Swatches offered; the API palette unless given. */
  presets?: readonly string[];
  /** Text that is not a hex colour but the caller takes as one (a CSS colour name, #RRGGBBAA): not flagged. */
  accepts?: (text: string) => boolean;
  isDisabled?: boolean;
}

export function ColorPicker({ label, labelHidden, value, onChange, description, errorMessage, presets = PRESET_COLORS, accepts, isDisabled: disabledProp, className }: ColorPickerProps) {
  const t = useStrings(strings);
  const id = useId();
  const names: Readonly<Record<string, string>> = strings;
  const isDisabled = useFieldLock(disabledProp);
  const norm = normalizeHexColor(value);
  const [text, setText] = useState(value);
  // While the hex field is being typed in it says nothing is wrong, and nothing from outside overwrites it.
  const [editing, setEditing] = useState(false);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (!editing) setText(value);
  }
  const pick = (next: string) => {
    setSeen(next);
    setText(next);
    onChange(next);
  };
  const typed = (raw: string) => {
    const next = normalizeHexColor(raw) ?? raw;
    setText(raw);
    setSeen(next);
    onChange(next);
  };
  const selected = norm && presets.some((p) => normalizeHexColor(p) === norm) ? norm : null;
  const hexBad = !editing && text.trim() !== '' && !normalizeHexColor(text) && !accepts?.(text.trim());
  return (
    <div className={cx(f.field, className)}>
      {/* The label names the swatches (the radio group); the hex control has its own name. */}
      <span id={`${id}-l`} className={labelHidden ? SR_ONLY : f.label}>
        {label}
      </span>
      <div className={s.line}>
        <RadioGroup
          orientation="horizontal"
          value={selected}
          onChange={(v) => pick(v)}
          isDisabled={isDisabled}
          aria-labelledby={`${id}-l`}
          {...(description ? { 'aria-describedby': `${id}-d` } : {})}
          className={s.swatches}
        >
          {presets.map((p) => {
            const c = normalizeHexColor(p) ?? p;
            return (
              <Radio key={c} value={c} aria-label={names[`cp.c.${c.slice(1)}`] ?? c} className={s.swatch}>
                <span className={s.dot} style={{ backgroundColor: c }} aria-hidden="true" />
              </Radio>
            );
          })}
        </RadioGroup>
        <TextField
          aria-label={t('cp.hex')}
          value={text}
          onChange={typed}
          onFocus={() => setEditing(true)}
          onBlur={() => {
            setEditing(false);
            // The value now in force: ours normalised, or one set from outside while this field was typed in.
            setText(value);
          }}
          placeholder={t('cp.hexPlaceholder')}
          mono
          errorMessage={errorMessage ?? (hexBad ? t('cp.hexInvalid') : undefined)}
          // Only the page's error stops blocking the submit; the hex field's own hint keeps the native refusal.
          validationBehavior={errorMessage ? 'aria' : 'native'}
          isDisabled={isDisabled}
          className={s.hex}
          // The square inside the field's start shows the colour and opens the browser's picker: one control.
          prefix={
            <input
              type="color"
              aria-label={t('cp.any')}
              // The browser picker needs some colour; black stands for none until one is picked.
              // The input's own empty value, not a Hub colour.
              value={(norm ?? '#000000').toLowerCase()}
              onChange={(e) => pick(normalizeHexColor(e.target.value) ?? e.target.value)}
              disabled={isDisabled}
              className={s.any}
            />
          }
        />
      </div>
      {description && (
        <p id={`${id}-d`} className={f.description}>
          {description}
        </p>
      )}
    </div>
  );
}
