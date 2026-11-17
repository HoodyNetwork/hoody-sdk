// NumberField: a number typed or stepped with − and +, with an optional unit after it ("GB").
// Use it for a count or a size; a number that is really an id or a code is a TextField.
import { type Ref } from 'react';
import { Button as AriaButton, Group, Input, NumberField as AriaNumberField, type NumberFieldProps as AriaNumberFieldProps } from 'react-aria-components';
import { cx } from '../controls/Button';
import { useDisabledPressRef } from '../controls/disabledPress';
import { Icon } from '../icons';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import b from './fieldBox.module.css';
import { type FieldChrome, type FieldWidth, fieldWidthClass } from './fields';
import f from './fields.module.css';
import { useFieldLock } from './lock';
import s from './more.module.css';
import { describedProps } from './described';
import { pageErrorProps } from './pageError';
import { FieldLabel, FieldNotes } from './FieldShell';

export interface NumberFieldProps extends Omit<AriaNumberFieldProps, 'className' | 'style' | 'children'>, FieldChrome {
  /** A unit after the number ("GB"). */
  unit?: string;
  /** Shown while the field is empty, saying what empty means ("Default", "Automatic"). */
  placeholder?: string;
  width?: FieldWidth;
  /** The input itself, so a page can focus it without searching the DOM. */
  inputRef?: Ref<HTMLInputElement>;
}

export function NumberField({ label, description, errorMessage, className, unit, placeholder, width, inputRef, ...rest }: NumberFieldProps) {
  const t = useStrings(kitStrings);
  const isDisabled = useFieldLock(rest.isDisabled);
  // A stepper is disabled at its limit and with the field, and enabled in place (a typed value, a form's lock ending).
  const downRef = useDisabledPressRef<HTMLButtonElement>();
  const upRef = useDisabledPressRef<HTMLButtonElement>();
  return (
    <AriaNumberField {...rest} {...describedProps(description)} isDisabled={isDisabled} isInvalid={rest.isInvalid ?? (errorMessage ? true : undefined)} {...pageErrorProps(rest.isInvalid ?? errorMessage)} className={cx(f.field, fieldWidthClass(width), className)}>
      <FieldLabel>{label}</FieldLabel>
      <Group className={cx(b.box, s.number)}>
        <AriaButton ref={downRef} slot="decrement" className={s.step} aria-label={t('field.decrement')}>
          <Icon name="minus" size="sm" />
        </AriaButton>
        <Input ref={inputRef} className={s.numberInput} placeholder={placeholder} />
        {unit && <span className={s.unit}>{unit}</span>}
        <AriaButton ref={upRef} slot="increment" className={s.step} aria-label={t('field.increment')}>
          <Icon name="plus" size="sm" />
        </AriaButton>
      </Group>
      <FieldNotes description={description} errorMessage={errorMessage} />
    </AriaNumberField>
  );
}
