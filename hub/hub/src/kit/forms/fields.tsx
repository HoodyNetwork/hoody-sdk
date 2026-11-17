// TextField, SearchField, Switch and Checkbox on React Aria Components: label, description, error and focus behaviour
// come from RAC; the kit adds the Hub look. Each field also obeys the enclosing Form's lock (lock.tsx). Every label,
// description and placeholder is a resolved string.
// Which one: TextField for typed text (SecretInput for a typed secret, NumberField for a number); SearchField only to
// filter what is on screen; Switch for a setting that applies at once, Checkbox for a choice sent with a form,
// CheckboxGroup for several of those under one label (RadioGroup, forms/RadioGroup.tsx, when only one may be picked).
import { type ReactNode, type SyntheticEvent, type Ref, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import {
  Checkbox as AriaCheckbox,
  CheckboxGroup as AriaCheckboxGroup,
  type CheckboxGroupProps as AriaCheckboxGroupProps,
  type CheckboxProps as AriaCheckboxProps,
  Input,
  SearchField as AriaSearchField,
  type SearchFieldProps as AriaSearchFieldProps,
  Switch as AriaSwitch,
  type SwitchProps as AriaSwitchProps,
  TextArea,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
} from 'react-aria-components';
import { IconButton, ReasonTip, cx, softDisabled, softDisabledProps, useReasonTip } from '../controls/Button';
import { SR_ONLY } from '../controls/SrOnly';
import { Icon } from '../icons';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import { ActionControl } from '../layouts/anatomy/ActionBar';
import type { ActionSpec } from '../layouts/anatomy/types';
import b from './fieldBox.module.css';
import s from './fields.module.css';
import { useFieldLock } from './lock';
import { describedProps } from './described';
import { pageErrorProps } from './pageError';
import { FieldLabel, FieldNotes } from './FieldShell';
import { useWipeOn } from './wipe';

/** A field's width: a fixed size from the --field-w-* scale, or `full`, the whole line. No width: as wide as its layout makes it. */
export type FieldWidth = 'xs' | 'sm' | 'md' | 'lg' | 'full';

/** The class for a field's `width`, on the field root. */
export const fieldWidthClass = (width: FieldWidth | undefined): string | undefined => (width ? s[`w_${width}`] : undefined);

export interface FieldChrome {
  label?: string;
  description?: ReactNode;
  /** Error text for a server-side refusal; RAC validation errors show on their own. */
  errorMessage?: string;
  className?: string;
}

interface TextFieldBase extends Omit<AriaTextFieldProps, 'className' | 'style' | 'children'>, FieldChrome {
  placeholder?: string;
  rows?: number;
  mono?: boolean;
  /** Inside the field's border, before the text (an icon, "https://"). */
  prefix?: ReactNode;
  /** Inside the field's border, after the text (a unit, an IconButton such as re-roll or History). */
  suffix?: ReactNode;
  /** Move focus into the field when `errorMessage` appears (the one field a refusal is about). */
  focusOnError?: boolean;
  /** Keep the 16 px error line even without an error, so the form never jumps. */
  reserveError?: boolean;
  width?: FieldWidth;
  /**
   * Multiline and read-only only for a moment (`isReadOnly` while a send is out): the terminal keeps all `rows` rows
   * instead of sizing the text it shows, so the box does not shrink and grow back. The web's textarea always keeps
   * `rows`: nothing changes here.
   */
  keepRows?: boolean;
}

export type TextFieldProps = TextFieldBase &
  (
    // inputRef: the input itself, or the textarea on a multiline field, so a page can focus it without searching the DOM.
    // Its element type follows `multiline`.
    | { multiline?: false; action?: undefined; inputRef?: Ref<HTMLInputElement> }
    | { multiline: true; action?: undefined; inputRef?: Ref<HTMLTextAreaElement> }
    | {
        multiline?: false;
        inputRef?: Ref<HTMLInputElement>;
        /**
         * The field's one action (Create, Check), drawn by the kit after the input box: the label spans above both, the
         * description and error below both. Inline at the box's top and height while the field is at least 20rem wide
         * (a 300 px field must wrap), under the box at full width below that. Enter in the field
         * never presses it. Not on a multiline field.
         */
        action?: ActionSpec;
      }
  );

export function TextField({ label, description, errorMessage, className, placeholder, multiline, rows = 4, mono, prefix, suffix, focusOnError, reserveError, width, inputRef, action, keepRows: _keepRows, ...rest }: TextFieldProps) {
  const isDisabled = useFieldLock(rest.isDisabled);
  const invalid = rest.isInvalid ?? (errorMessage ? true : undefined);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useImperativeHandle(inputRef as Ref<HTMLInputElement & HTMLTextAreaElement> | undefined, () => ref.current as HTMLInputElement & HTMLTextAreaElement);
  const hadError = useRef(false);
  useEffect(() => {
    if (focusOnError && errorMessage && !hadError.current) ref.current?.focus();
    hadError.current = Boolean(errorMessage);
  }, [errorMessage, focusOnError]);
  // A password field is secret entry by default: cleared when its context ends, like SecretInput.
  const latest = useRef({ value: rest.value, onChange: rest.onChange });
  latest.current = { value: rest.value, onChange: rest.onChange };
  useWipeOn(
    () => {
      if (latest.current.value) latest.current.onChange?.('');
    },
    undefined,
    rest.type === 'password',
  );
  const boxed = Boolean(prefix || suffix);
  const inputClass = cx(boxed ? s.boxInput : cx(b.box, s.input), multiline && s.textarea, mono && s.mono);
  const control = (
    <div className={boxed ? cx(b.box, s.slotBox) : s.control}>
      {prefix && <div className={s.prefix}>{prefix}</div>}
      {multiline ? <TextArea ref={ref} className={inputClass} placeholder={placeholder} rows={rows} /> : <Input ref={ref} className={inputClass} placeholder={placeholder} />}
      {suffix && <div className={s.suffix}>{suffix}</div>}
    </div>
  );
  return (
    <AriaTextField {...pageErrorProps(invalid)} {...rest} {...describedProps(description)} isDisabled={isDisabled} isInvalid={invalid} className={cx(s.field, fieldWidthClass(width), action && s.withAction, className)}>
      <FieldLabel>{label}</FieldLabel>
      {control}
      {/* A sibling of the box, not a wrapper around it: an action that comes or goes never remounts the input (focus,
          selection and an uncontrolled value stay), and a field without one keeps its tree. */}
      {action && (
        <div className={s.action}>
          <ActionControl action={action} variant="secondary" />
        </div>
      )}
      <FieldNotes description={description} errorMessage={errorMessage} reserveError={reserveError} invalid={invalid} />
    </AriaTextField>
  );
}

export interface FieldRule {
  id: string;
  /** "At least 12 characters". */
  label: string;
  met: boolean;
}

/** A live rule checklist under a field (password rules): ○ until met, then ✓; read out politely. */
export function RuleChecklist({ rules, label, className }: { rules: readonly FieldRule[]; label?: string; className?: string }) {
  return (
    <ul className={cx(s.rules, className)} aria-label={label} aria-live="polite">
      {rules.map((r) => (
        <li key={r.id} className={cx(s.rule, r.met && s.ruleMet)} data-met={r.met || undefined}>
          {r.met ? <Icon name="check" size="sm" className={s.ruleIcon} /> : <span className={s.ruleDot} aria-hidden="true" />}
          <span>{r.label}</span>
        </li>
      ))}
    </ul>
  );
}

export interface SearchFieldProps extends Omit<AriaSearchFieldProps, 'className' | 'style' | 'children'> {
  placeholder?: string;
  /** Accessible name; defaults to "Search". */
  label?: string;
  className?: string;
  /** 'toolbar': a toolbar control's height (`--tb-ctl-h`), as Button. 'md' (default) is every other field's. */
  size?: 'md' | 'toolbar';
  width?: FieldWidth;
  /** The input itself, so a page can focus it without searching the DOM. */
  inputRef?: Ref<HTMLInputElement>;
}

export function SearchField({ placeholder, label, className, size = 'md', width, inputRef, ...rest }: SearchFieldProps) {
  const t = useStrings(kitStrings);
  return (
    <AriaSearchField {...rest} aria-label={label ?? t('search.label')} className={cx(s.search, size === 'toolbar' && s.search_toolbar, fieldWidthClass(width), className)}>
      <Icon name="search" size="sm" className={s.searchIcon} />
      <Input ref={inputRef} className={cx(b.box, s.searchInput)} placeholder={placeholder ?? t('search.placeholder')} />
      {/* The kit's IconButton xs: 24 drawn, the kit's own 44 press on a coarse pointer. RAC's SearchField reaches it
          through its button context (press clears, out of the tab order). */}
      <IconButton icon="x" size="xs" label={t('search.clear')} className={s.searchClear} />
    </AriaSearchField>
  );
}

/** A switch is named by its own `label`, or by an element on the page (`labelledBy`, a setting row's name). */
type SwitchNaming = { label: string; labelledBy?: undefined } | { labelledBy: string; label?: undefined };

export type SwitchProps = Omit<AriaSwitchProps, 'className' | 'style' | 'children'> &
  SwitchNaming & {
    /** Keep `label` as the switch's accessible name but do not draw it, for a row whose own label column already names the switch. */
    labelHidden?: boolean;
    description?: ReactNode;
    className?: string;
    /** Why a disabled switch cannot change: as Button's (controls/Button.tsx, softDisabled). Only read with `isDisabled`. */
    disabledReason?: string;
  };

const noRef = () => undefined;

export function Switch({ label, labelledBy, labelHidden, description, className, disabledReason, ...rest }: SwitchProps) {
  const locked = useFieldLock(rest.isDisabled);
  // Soft-disabled (see softDisabled): the switch keeps its focus and says why. The focus is on its input, the press and
  // the hover on its label (the element below), so the label takes the soft state and the input its aria-disabled, focus
  // and blur. Every toggle, by pointer or by Space, is a click on the input, which the label's capture cancels.
  const soft = softDisabled(disabledReason, rest.isDisabled);
  const isDisabled = locked && !soft;
  const { ref, el, open, setOpen } = useReasonTip<HTMLLabelElement>(soft, false, rest.isDisabled, noRef);
  const input = useRef<HTMLInputElement | null>(null);
  const callerInput = rest.inputRef;
  const inputRef = useCallback(
    (node: HTMLInputElement | null) => {
      input.current = node;
      if (typeof callerInput === 'function') callerInput(node);
      else if (callerInput) (callerInput as { current: HTMLInputElement | null }).current = node;
    },
    [callerInput],
  );
  useLayoutEffect(() => {
    const node = input.current;
    if (!node) return;
    if (!soft) {
      node.removeAttribute('aria-disabled');
      return;
    }
    node.setAttribute('aria-disabled', 'true');
    const onFocus = () => {
      if (node.matches(':focus-visible')) setOpen(true);
    };
    const onBlur = () => setOpen(false);
    if (document.activeElement === node && node.matches(':focus-visible')) setOpen(true);
    node.addEventListener('focus', onFocus);
    node.addEventListener('blur', onBlur);
    return () => {
      node.removeEventListener('focus', onFocus);
      node.removeEventListener('blur', onBlur);
    };
  }, [soft, setOpen]);
  const reasonId = useId();
  // The description sits outside the switch's own element, so the switch names it as its accessible description.
  const descId = useId();
  const describedBy = [rest['aria-describedby'], description ? descId : undefined, soft ? reasonId : undefined].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx(s.switchRow, className)}>
      <AriaSwitch
        {...rest}
        {...(soft ? softDisabledProps(rest) : {})}
        ref={ref}
        inputRef={inputRef}
        aria-labelledby={labelledBy ?? rest['aria-labelledby']}
        aria-describedby={describedBy}
        isDisabled={isDisabled}
        className={s.switch}
      >
        <span className={s.track} aria-hidden="true">
          <span className={s.thumb} />
        </span>
        {labelledBy === undefined && (
          <span className={labelHidden ? SR_ONLY : s.switchLabel} title={labelHidden ? undefined : label}>
            {label}
          </span>
        )}
      </AriaSwitch>
      {description && <p id={descId} className={s.switchDesc}>{description}</p>}
      <ReasonTip reason={disabledReason} shown={soft} id={reasonId} open={open} setOpen={setOpen} trigger={el} />
    </div>
  );
}

export interface CheckboxProps extends Omit<AriaCheckboxProps, 'className' | 'style' | 'children'> {
  /** Visible label; omit for a bare checkbox and pass aria-label instead. It may hold links (a consent sentence with
   *  its Terms link): a press on a link follows the link and leaves the box as it was. */
  label?: ReactNode;
  description?: ReactNode;
  className?: string;
}

/** React Aria's checkbox label toggles on any press inside it and cancels every click in it (so the hidden input is not
 *  clicked twice). A link or button inside the label keeps its own press: its events stop at the label text. */
function keepInnerPress(e: SyntheticEvent) {
  const t = e.target as Element | null;
  if (t && t !== e.currentTarget && t.closest('a, button, [role="link"], [role="button"]')) e.stopPropagation();
}

const INNER_PRESS = {
  onClick: keepInnerPress,
  onPointerDown: keepInnerPress,
  onPointerUp: keepInnerPress,
  onMouseDown: keepInnerPress,
  onMouseUp: keepInnerPress,
  onTouchStart: keepInnerPress,
  onTouchEnd: keepInnerPress,
  onKeyDown: keepInnerPress,
  onKeyUp: keepInnerPress,
};

/** A choice sent with a form. Use Switch instead for a setting that applies at once, and CheckboxGroup for several
 *  checkboxes under one label. */
export function Checkbox({ label, description, className, ...rest }: CheckboxProps) {
  const isDisabled = useFieldLock(rest.isDisabled);
  return (
    <AriaCheckbox {...rest} isDisabled={isDisabled} className={cx(s.checkbox, className)}>
      {({ isSelected, isIndeterminate }) => (
        <>
          <span className={s.box} aria-hidden="true">
            {isIndeterminate ? <Icon name="minus" size="sm" /> : isSelected ? <Icon name="check" size="sm" /> : null}
          </span>
          {(label || description) && (
            <span className={s.checkText} {...INNER_PRESS}>
              {label && <span>{label}</span>}
              {description && <span className={s.description}>{description}</span>}
            </span>
          )}
        </>
      )}
    </AriaCheckbox>
  );
}

export interface FieldsetProps {
  /** The set's name, drawn as every field's label (a <legend>). */
  label: string;
  description?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A named set of controls that each keep their own value (Switches, a read-only Checkbox), drawn with the field label
 *  look. Use CheckboxGroup instead when the checkboxes make one value list, and RadioGroup when one option is picked. */
export function Fieldset({ label, description, className, children }: FieldsetProps) {
  const descId = useId();
  return (
    <fieldset className={cx(s.fieldset, className)} aria-describedby={description ? descId : undefined}>
      <legend className={cx(s.label, s.legend)}>{label}</legend>
      {children}
      {description && (
        <p id={descId} className={s.description}>
          {description}
        </p>
      )}
    </fieldset>
  );
}

export interface CheckboxGroupProps extends Omit<AriaCheckboxGroupProps, 'className' | 'style' | 'children'> {
  label?: string;
  description?: ReactNode;
  /** Error text for the group as a whole ("Pick at least one"). */
  errorMessage?: string;
  className?: string;
  /** Two columns, rows aligned, where the group has room for them; one column where it is narrow. For a long list of
   *  short choices. */
  columns?: 2;
  /** The kit Checkboxes of the group, each with its own `value`. */
  children: ReactNode;
}

/** A labelled group of checkboxes sharing one value list: the checkbox twin of RadioGroup (forms/RadioGroup.tsx). Its label,
 *  description and error belong to the group, so a rule about the set ("pick at least one") has a place to show. */
export function CheckboxGroup({ label, description, errorMessage, className, columns, children, ...rest }: CheckboxGroupProps) {
  const isDisabled = useFieldLock(rest.isDisabled);
  return (
    <AriaCheckboxGroup
      {...rest}
      {...describedProps(description)}
      isDisabled={isDisabled}
      isInvalid={rest.isInvalid ?? (errorMessage ? true : undefined)}
      {...pageErrorProps(rest.isInvalid ?? errorMessage)}
      className={cx(s.field, className)}
    >
      <FieldLabel>{label}</FieldLabel>
      <div className={cx(s.checks, columns === 2 && s.cols2)}>{children}</div>
      <FieldNotes description={description} errorMessage={errorMessage} />
    </AriaCheckboxGroup>
  );
}
