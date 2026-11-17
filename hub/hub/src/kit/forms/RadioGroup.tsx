// RadioGroup: 2 to 5 choices worth seeing at once, one picked. An option can reveal its own fields under it while
// it is picked. For more choices, or where the list need not show, use Select.
import { type KeyboardEvent } from 'react';
import { Radio, RadioGroup as AriaRadioGroup } from 'react-aria-components';
import { cx } from '../controls/Button';
import { Icon } from '../icons';
import { type FieldChrome } from './fields';
import f from './fields.module.css';
import { useFieldLock } from './lock';
import s from './more.module.css';
import type { Option } from './Select';
import { describedProps } from './described';
import { pageErrorProps } from './pageError';
import { FieldLabel, FieldNotes } from './FieldShell';

export interface RadioGroupProps<V extends string> extends FieldChrome {
  /** The group's name when it has no `label` of its own (a SettingRow row names it: pass the row's label id). */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  /** Joined with the group's own description and error. */
  'aria-describedby'?: string;
  options: readonly Option<V>[];
  value: V | undefined;
  onChange: (value: V) => void;
  /** Cards side by side (plan pickers) instead of a vertical list. */
  variant?: 'list' | 'cards';
  orientation?: 'vertical' | 'horizontal';
  /** Two columns, rows aligned, where the group has room for them; one column where it is narrow. For a long list of
   *  short choices. */
  columns?: 2;
  isDisabled?: boolean;
  isRequired?: boolean;
}

/** React Aria's radio group moves the selection on every arrow key inside it. A revealed field keeps its arrows (caret,
 *  its own list) by stopping them before they reach the group. */
function keepArrowsInReveal(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key.startsWith('Arrow')) e.stopPropagation();
}

export function RadioGroup<V extends string>({ label, description, errorMessage, className, options, value, onChange, variant = 'list', orientation, columns, ...rest }: RadioGroupProps<V>) {
  const isDisabled = useFieldLock(rest.isDisabled);
  return (
    <AriaRadioGroup
      {...rest}
      {...describedProps(description)}
      isDisabled={isDisabled}
      value={value ?? null}
      onChange={(v) => onChange(v as V)}
      orientation={orientation ?? (variant === 'cards' ? 'horizontal' : 'vertical')}
      isInvalid={errorMessage ? true : undefined}
      {...pageErrorProps(errorMessage)}
      className={cx(f.field, className)}
    >
      <FieldLabel>{label}</FieldLabel>
      <div className={cx(s.radios, variant === 'cards' && s.radioCards, columns === 2 && variant !== 'cards' && s.cols2)}>
        {options.map((o) => (
          <Radio key={o.value} value={o.value} isDisabled={o.isDisabled} className={cx(s.radio, variant === 'cards' && s.radioCard)}>
            <span className={s.radioDot} aria-hidden="true" />
            <span className={s.optionText}>
              <span className={s.optionLabel}>
                {o.icon && <Icon name={o.icon} size="sm" />}
                {o.label}
              </span>
              {o.description && <span className={s.optionDesc}>{o.description}</span>}
            </span>
          </Radio>
        )).flatMap((radio, i) => {
          const o = options[i];
          if (!o?.reveal || value !== o.value) return [radio];
          return [
            radio,
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the handler only keeps arrow keys from the radio group (keepArrowsInReveal); the controls inside take them
            <div key={`${o.value}-reveal`} role="group" className={s.radioReveal} onKeyDown={keepArrowsInReveal}>
              {o.reveal}
            </div>,
          ];
        })}
      </div>
      <FieldNotes description={description} errorMessage={errorMessage} />
    </AriaRadioGroup>
  );
}
